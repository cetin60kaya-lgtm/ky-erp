import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable,
  NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import OpenAI from "openai";
import { PrismaService } from "../prisma/prisma.service";
import { AI_CONFIG, isAiConfigured } from "./ai.config";
import { KY_ERP_SYSTEM_PROMPT } from "./ai.system-prompt";
import { AiToolsService } from "./ai-tools.service";
import {
  assertConfirmationUsable, cleanUserText, hashConfirmationToken, looksLikePromptInjection, maskSensitiveData,
  safeJsonObject, tokensMatch, translateOpenAiError,
} from "./ai.security";

type AiUser = { id: string; fullName?: string; role?: string; permissions?: Array<Record<string, any>> };
type PageContext = { module?: string; route?: string; mainCompanySlug?: string };

@Injectable()
export class AiService {
  private client?: OpenAI;
  private clientKeyFingerprint = "";
  private lastSuccessAt: Date | null = null;
  private lastError: string | null = null;
  private readonly rateWindows = new Map<string, number[]>();
  private readonly activeRequests = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly tools: AiToolsService) {}

  private openAi() {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) throw new ServiceUnavailableException("KY ERP Asistan henüz yapılandırılmadı. OPENAI_API_KEY sunucuda tanımlanmalıdır.");
    const fingerprint = hashConfirmationToken(apiKey).slice(0, 12);
    if (!this.client || fingerprint !== this.clientKeyFingerprint) {
      this.client = new OpenAI({ apiKey, timeout: AI_CONFIG.timeoutMs, maxRetries: 1 });
      this.clientKeyFingerprint = fingerprint;
    }
    return this.client;
  }

  private checkRate(userId: string) {
    const now = Date.now(); const recent = (this.rateWindows.get(userId) || []).filter((time) => now - time < 60_000);
    if (recent.length >= AI_CONFIG.rateLimitPerMinute) throw new HttpException("Bir dakikalık yapay zekâ kullanım sınırına ulaştınız.", 429);
    recent.push(now); this.rateWindows.set(userId, recent);
  }

  private slug(body: Record<string, any>, pageContext: PageContext = {}) {
    const slug = String(body.mainCompanySlug || pageContext.mainCompanySlug || "").trim();
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  private async ownedConversation(id: string, user: AiUser, includeMessages = false) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: includeMessages ? { messages: { orderBy: { createdAt: "asc" } } } : undefined,
    });
    if (!conversation) throw new NotFoundException("Konuşma bulunamadı.");
    return conversation as any;
  }

  private async resolveConversation(body: Record<string, any>, user: AiUser, message: string, slug: string, pageContext: PageContext) {
    const id = String(body.conversationId || "").trim();
    if (id) {
      const current = await this.ownedConversation(id, user);
      if (current.mainCompanySlug && current.mainCompanySlug !== slug) throw new ForbiddenException("Konuşma farklı bir ana firmaya aittir.");
      await this.prisma.aiConversation.update({ where: { id }, data: { moduleContext: pageContext as any } });
      return current;
    }
    return this.prisma.aiConversation.create({ data: {
      userId: user.id, mainCompanySlug: slug, title: message.slice(0, 72), moduleContext: pageContext as any,
    } });
  }

  private async recordUsage(userId: string, inputTokens: number, outputTokens: number) {
    const usageDate = new Date().toISOString().slice(0, 10);
    await this.prisma.aiUsageDaily.upsert({
      where: { userId_usageDate: { userId, usageDate } },
      create: { userId, usageDate, requestCount: 1, inputTokens, outputTokens, estimatedCost: 0 },
      update: { requestCount: { increment: 1 }, inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
    });
  }

  private async safeAudit(data: Record<string, any>) {
    await this.prisma.aiAuditLog.create({ data: data as any }).catch(() => undefined);
  }

  async chat(rawBody: unknown, user: AiUser) {
    const body = safeJsonObject(rawBody); const message = cleanUserText(body.message);
    const pageContext = safeJsonObject(body.pageContext || {}); const mainCompanySlug = this.slug(body, pageContext);
    this.checkRate(user.id);
    const duplicateKey = `${user.id}:${String(body.conversationId || "new")}:${hashConfirmationToken(message).slice(0, 16)}`;
    if (this.activeRequests.has(duplicateKey)) throw new ConflictException("Aynı mesaj halen işleniyor.");
    this.activeRequests.add(duplicateKey);

    try {
      const conversation = await this.resolveConversation(body, user, message, mainCompanySlug, pageContext);
      await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "user", content: maskSensitiveData(message) } });

      if (looksLikePromptInjection(message)) {
        const answer = "Başkan, bu istek güvenlik kurallarını veya gizli bilgileri aşmaya çalışıyor. ERP verilerinizi yalnızca yetkili ve kayıtlı araçlarla analiz edebilirim.";
        await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer } });
        await this.safeAudit({ userId: user.id, conversationId: conversation.id, operation: "PROMPT_INJECTION_BLOCKED", module: String(pageContext.module || "ASISTAN"), success: false, errorMessage: "Güvenlik kuralı tetiklendi." });
        return { success: true, conversationId: conversation.id, answer, actions: [], requiresConfirmation: false, usage: { inputTokens: 0, outputTokens: 0 }, sourceCount: 0 };
      }

      const recent = await this.prisma.aiMessage.findMany({ where: { conversationId: conversation.id, role: { in: ["user", "assistant"] } }, orderBy: { createdAt: "desc" }, take: AI_CONFIG.maxHistoryMessages });
      let input: any[] = recent.reverse().map((row) => ({ role: row.role, content: maskSensitiveData(row.content) }));
      const definitions = this.tools.definitionsFor(user); const actions: any[] = []; let sourceCount = 0;
      let totalInputTokens = 0; let totalOutputTokens = 0; let response: any;

      for (let round = 0; round <= AI_CONFIG.maxToolCalls; round += 1) {
        response = await this.openAi().responses.create({
          model: AI_CONFIG.model, instructions: `${KY_ERP_SYSTEM_PROMPT}\n\nAktif sayfa: ${maskSensitiveData(JSON.stringify(pageContext))}`,
          input, tools: definitions,
          max_output_tokens: pageContext.assistantMode === "development" ? AI_CONFIG.developerMaxOutputTokens : AI_CONFIG.maxOutputTokens,
          store: false,
          reasoning: { effort: "low" }, text: { verbosity: "medium" },
        } as any);
        totalInputTokens += Number(response.usage?.input_tokens || 0); totalOutputTokens += Number(response.usage?.output_tokens || 0);
        const calls = (response.output || []).filter((item: any) => item.type === "function_call");
        if (!calls.length) break;
        if (round === AI_CONFIG.maxToolCalls) throw new BadRequestException("Bir istekte izin verilen araç çağrısı sayısı aşıldı.");
        const outputs: any[] = [];
        for (const call of calls) {
          let args: Record<string, any>;
          try { args = JSON.parse(call.arguments || "{}"); } catch { throw new BadRequestException(`'${call.name}' aracı geçersiz parametre üretti.`); }
          let toolResult: any;
          if (this.tools.isWriteTool(call.name)) {
            const prepared = this.tools.prepareWrite(call.name, args, { user, mainCompanySlug });
            const confirmationToken = randomBytes(32).toString("base64url");
            const pending = await this.prisma.aiPendingAction.create({ data: {
              conversationId: conversation.id, userId: user.id, actionType: prepared.actionType,
              actionPayload: prepared.payload, confirmationTokenHash: hashConfirmationToken(confirmationToken),
              expiresAt: new Date(Date.now() + AI_CONFIG.actionTtlMs),
            } });
            actions.push({ id: pending.id, type: prepared.actionType, summary: prepared.summary, payload: args, confirmationToken, expiresAt: pending.expiresAt });
            toolResult = { success: true, pendingConfirmation: true, actionId: pending.id, summary: prepared.summary };
          } else {
            toolResult = await this.tools.executeRead(call.name, args, { user, mainCompanySlug, requestMessage: message });
            sourceCount += Number(toolResult.sourceCount || 0);
          }
          await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "tool", content: maskSensitiveData(JSON.stringify(toolResult)), toolName: call.name, toolPayload: args as any } });
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(toolResult) });
        }
        input = [...input, ...(response.output || []), ...outputs];
      }

      const generatedAnswer = maskSensitiveData(String(response?.output_text || "Bu istek için bir yanıt oluşturulamadı."));
      const answer = /^\s*Başkan\b/i.test(generatedAnswer)
        ? generatedAnswer
        : `Başkan,\n\n${generatedAnswer}`;
      await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer, tokenInput: totalInputTokens, tokenOutput: totalOutputTokens } });
      await this.prisma.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      await this.recordUsage(user.id, totalInputTokens, totalOutputTokens);
      await this.safeAudit({ userId: user.id, conversationId: conversation.id, operation: "CHAT", module: String(pageContext.module || "ASISTAN"), afterData: { sourceCount, toolCount: definitions.length } as any, success: true });
      this.lastSuccessAt = new Date(); this.lastError = null;
      return { success: true, conversationId: conversation.id, answer, actions, requiresConfirmation: actions.length > 0, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, sourceCount };
    } catch (error: any) {
      const known = error instanceof HttpException;
      const messageText = known ? error.message : translateOpenAiError(error);
      this.lastError = messageText;
      await this.safeAudit({ userId: user.id, operation: "CHAT_ERROR", module: String(pageContext.module || "ASISTAN"), success: false, errorMessage: messageText });
      if (known) throw error;
      throw new ServiceUnavailableException(messageText);
    } finally { this.activeRequests.delete(duplicateKey); }
  }

  async confirm(rawBody: unknown, user: AiUser) {
    const body = safeJsonObject(rawBody); const actionId = String(body.actionId || ""); const token = String(body.confirmationToken || "");
    const action = await this.prisma.aiPendingAction.findFirst({ where: { id: actionId, userId: user.id }, include: { conversation: true } });
    if (!action) throw new NotFoundException("Onay bekleyen işlem bulunamadı.");
    if (action.expiresAt.getTime() <= Date.now() && action.status === "PENDING") {
      await this.prisma.aiPendingAction.update({ where: { id: action.id }, data: { status: "EXPIRED" } });
    }
    assertConfirmationUsable(action.status, action.expiresAt, token, action.confirmationTokenHash);
    const claimed = await this.prisma.aiPendingAction.updateMany({ where: { id: action.id, status: "PENDING" }, data: { status: "EXECUTING", approvedAt: new Date() } });
    if (claimed.count !== 1) throw new ConflictException("Bu işlem başka bir istek tarafından işlendi.");
    try {
      const mainCompanySlug = String(action.conversation.mainCompanySlug || "");
      const result = await this.tools.executeConfirmed(action.actionType, action.actionPayload, { user, mainCompanySlug });
      await this.prisma.$transaction([
        this.prisma.aiPendingAction.update({ where: { id: action.id }, data: { status: "EXECUTED", executedAt: new Date() } }),
        this.prisma.aiAuditLog.create({ data: { userId: user.id, conversationId: action.conversationId, operation: action.actionType, module: result.module, recordType: result.recordType, recordId: result.recordId, beforeData: result.before as any, afterData: result.after as any, success: true } }),
        this.prisma.aiMessage.create({ data: { conversationId: action.conversationId, role: "assistant", content: `Başkan, onaylanan ${action.actionType} işlemi başarıyla tamamlandı.` } }),
      ]);
      return { success: true, actionId: action.id, status: "EXECUTED", message: "İşlem başarıyla tamamlandı.", result: { recordType: result.recordType, recordId: result.recordId } };
    } catch (error: any) {
      const message = error instanceof HttpException ? error.message : "Onaylanan işlem tamamlanamadı.";
      await this.prisma.aiPendingAction.update({ where: { id: action.id }, data: { status: "FAILED" } }).catch(() => undefined);
      await this.safeAudit({ userId: user.id, conversationId: action.conversationId, operation: action.actionType, success: false, errorMessage: message });
      throw error instanceof HttpException ? error : new ServiceUnavailableException(message);
    }
  }

  async cancel(rawBody: unknown, user: AiUser) {
    const body = safeJsonObject(rawBody); const actionId = String(body.actionId || "");
    const updated = await this.prisma.aiPendingAction.updateMany({ where: { id: actionId, userId: user.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (updated.count !== 1) throw new ConflictException("İşlem bulunamadı, daha önce kullanılmış veya iptal edilmiş.");
    return { success: true, actionId, status: "CANCELLED" };
  }

  async conversations(user: AiUser) {
    const rows = await this.prisma.aiConversation.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 50, include: { _count: { select: { messages: true } } } });
    return { success: true, conversations: rows.map((row) => ({ id: row.id, title: row.title, moduleContext: row.moduleContext, mainCompanySlug: row.mainCompanySlug, createdAt: row.createdAt, updatedAt: row.updatedAt, messageCount: row._count.messages })) };
  }

  async conversation(id: string, user: AiUser) {
    const row = await this.ownedConversation(id, user, true);
    return { success: true, conversation: { id: row.id, title: row.title, moduleContext: row.moduleContext, messages: row.messages.map((message: any) => ({ id: message.id, role: message.role, content: message.content, toolName: message.toolName, createdAt: message.createdAt })) } };
  }

  async deleteConversation(id: string, user: AiUser) {
    await this.ownedConversation(id, user);
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.aiPendingAction.updateMany({ where: { conversationId: id, status: "PENDING" }, data: { status: "CANCELLED" } }),
    ]);
    return { success: true, id };
  }

  async status(user: AiUser) {
    const usageDate = new Date().toISOString().slice(0, 10);
    const usage = await this.prisma.aiUsageDaily.findUnique({ where: { userId_usageDate: { userId: user.id, usageDate } } });
    return { success: true, enabled: isAiConfigured(), apiKeyConfigured: isAiConfigured(), model: AI_CONFIG.model, developerMode: this.tools.developmentStatus(user), lastSuccessfulCallAt: this.lastSuccessAt, lastError: this.lastError, dailyRequestCount: usage?.requestCount || 0, dailyInputTokens: usage?.inputTokens || 0, dailyOutputTokens: usage?.outputTokens || 0 };
  }
}
