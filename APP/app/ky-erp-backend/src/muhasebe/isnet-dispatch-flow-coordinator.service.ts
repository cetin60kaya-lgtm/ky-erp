import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetBusinessSettingsService } from "./isnet-business-settings.service";
import { IsnetDispatchPreparationService } from "./isnet-dispatch-preparation.service";
import { IsnetOperationsService } from "./isnet-operations.service";

type Input = Record<string, any>;

type FlowRow = {
  id: string;
  mainCompanySlug: string;
  incomingSourceId: string;
  incomingDocumentNo: string;
  incomingIntakeId: string;
  companyId?: string;
  companyName: string;
  modelId: string;
  modelName: string;
  issueDate: string;
  sourceQuantity: number;
  remainingQuantity: number;
  quantity: number;
  currentCycle: number;
  outgoingDraftNo: string;
  outgoingSourceId: string;
  dispatchHistory: Input[];
  invoiceRequestId?: string;
  invoiceDraftNo?: string;
  invoiceDraftVersion?: string;
  officialInvoiceNo?: string;
  status: string;
  lastError: string;
  preview: Input | null;
  invoiceSeed: Input | null;
  createdAt: string;
  updatedAt: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class IsnetDispatchFlowCoordinatorService {
  private readonly settingKey = "AUTO_FLOWS";
  private readonly locks = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: IsnetOperationsService,
    private readonly preparation: IsnetDispatchPreparationService,
    private readonly businessSettings: IsnetBusinessSettingsService,
  ) {}

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private async readRows(slug: string): Promise<FlowRow[]> {
    const row = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: this.settingKey,
        },
      },
    });
    const value = row?.value as any;
    return Array.isArray(value?.rows) ? value.rows : [];
  }

  private async writeRows(slug: string, rows: FlowRow[]) {
    await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: this.settingKey,
        },
      },
      create: {
        scope: "ISNET",
        mainCompanySlug: slug,
        key: this.settingKey,
        value: { rows, updatedAt: new Date().toISOString() },
      },
      update: {
        value: { rows, updatedAt: new Date().toISOString() },
        deletedAt: null,
      },
    });
  }

  private async withLock<T>(key: string, action: () => Promise<T>) {
    const current = this.locks.get(key);
    if (current) return current as Promise<T>;
    const operation = action();
    this.locks.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(key) === operation) this.locks.delete(key);
    }
  }

  private totalQuantity(lines: any[]) {
    return Number(
      (Array.isArray(lines) ? lines : [])
        .reduce((sum, line) => sum + numberValue(line.quantity), 0)
        .toFixed(4),
    );
  }

  private preparationLines(preview: Input, remainingQuantity: number) {
    const sourceLines = Array.isArray(preview?.lines) ? preview.lines : [];
    const sourceTotal = this.totalQuantity(sourceLines);
    if (!(sourceTotal > 0) || !(remainingQuantity > 0)) return [];
    let remainingToAllocate = remainingQuantity;
    return sourceLines
      .map((line: any, index: number) => {
        const sourceQuantity = numberValue(line.quantity);
        const quantity = Math.min(sourceQuantity, remainingToAllocate);
        remainingToAllocate = Number((remainingToAllocate - quantity).toFixed(4));
        return {
          sourceLineId: clean(line.id || line.lineId || index + 1),
          category: "MAIN",
          productName:
            clean(line.productName || line.name) ||
            clean(preview.modelName) ||
            `Ürün ${index + 1}`,
          description: clean(line.description || preview.modelName),
          quantity,
          measureUnitId: clean(line.measureUnitId || 67),
          unitPrice: 0,
          sourceQuantity,
          lockedDescription: true,
        };
      })
      .filter((line) => line.quantity > 0)
      .concat([
        {
          sourceLineId: "TEST_NUMUNESI",
          category: "TEST_NUMUNESI",
          productName: "TEST NUMUNESİ",
          description: "TEST NUMUNESİ",
          quantity: 0,
          measureUnitId: "67",
          unitPrice: 0,
          sourceQuantity: 0,
          lockedDescription: true,
        },
        {
          sourceLineId: "BASKI_SAKATI",
          category: "BASKI_SAKATI",
          productName: "BASKI SAKATI",
          description: "BASKI SAKATI",
          quantity: 0,
          measureUnitId: "67",
          unitPrice: 0,
          sourceQuantity: 0,
          lockedDescription: true,
        },
        {
          sourceLineId: "KUMAS_SAKATI",
          category: "KUMAS_SAKATI",
          productName: "KUMAŞ SAKATI",
          description: "KUMAŞ SAKATI",
          quantity: 0,
          measureUnitId: "67",
          unitPrice: 0,
          sourceQuantity: 0,
          lockedDescription: true,
        },
      ]);
  }

  async prepareIncoming(sourceIdValue: string, body: Input = {}) {
    const slug = this.slug(body);
    const sourceId = clean(sourceIdValue);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Gelen İşNet irsaliye kimliği geçersiz.");
    }
    return this.withLock(`${slug}:preflight:${sourceId}`, async () => {
      const rows = await this.readRows(slug);
      let flow = rows.find((row) => row.incomingSourceId === sourceId) || null;
      if (flow?.outgoingDraftNo && flow.status === "OUTGOING_SEND_REQUIRED") {
        return {
          ok: true,
          duplicatePrevented: true,
          flow,
          message: `${flow.outgoingDraftNo} taslağı daha önce oluşturuldu. Portalda gönderim bekleniyor.`,
        };
      }

      const imported: any = await this.operations.importIncomingDispatch({
        ...body,
        mainCompanySlug: slug,
        id: sourceId,
        confirmed: true,
      });
      let intake = imported.intake;
      if (!intake?.id) {
        throw new ConflictException("Gelen irsaliye işleme kaydı doğrulanamadı.");
      }

      if (!intake.modelId) {
        const suggestions: any = await this.operations.modelSuggestions(intake.id, {
          mainCompanySlug: slug,
          search: intake.modelGuess || "",
        });
        const candidates = Array.isArray(suggestions?.suggestions)
          ? suggestions.suggestions
          : [];
        const first = candidates[0];
        const second = candidates[1];
        const safeAutomaticMatch =
          first &&
          numberValue(first.score) >= 90 &&
          (!second || numberValue(first.score) - numberValue(second.score) >= 5);
        if (safeAutomaticMatch) {
          const assigned: any = await this.operations.assignIntakeModelSafe(
            intake.id,
            {
              mainCompanySlug: slug,
              source: first.source,
              candidateId: first.id,
              confidence: first.score,
              approvedBy: "ISNET_AUTO_MATCH",
            },
          );
          intake = assigned.intake;
        } else {
          const now = new Date().toISOString();
          const sourceQuantity = this.totalQuantity(intake.lines || []);
          flow = flow || {
            id: randomUUID(),
            mainCompanySlug: slug,
            incomingSourceId: sourceId,
            incomingDocumentNo: clean(intake.documentNo || intake.dispatchNo),
            incomingIntakeId: intake.id,
            companyId: clean(intake.firmId || intake.companyId),
            companyName: clean(intake.issuerName || intake.companyName),
            modelId: "",
            modelName: clean(intake.modelGuess),
            issueDate: clean(intake.issueDate),
            sourceQuantity,
            remainingQuantity: sourceQuantity,
            quantity: 0,
            currentCycle: 1,
            outgoingDraftNo: "",
            outgoingSourceId: "",
            dispatchHistory: [],
            status: "MODEL_REQUIRED",
            lastError: "",
            preview: null,
            invoiceSeed: null,
            createdAt: now,
            updatedAt: now,
          };
          Object.assign(flow, {
            incomingIntakeId: intake.id,
            companyId: clean(intake.firmId || intake.companyId),
            companyName: clean(intake.issuerName || intake.companyName),
            modelName: clean(intake.modelGuess),
            status: "MODEL_REQUIRED",
            updatedAt: now,
          });
          await this.writeRows(
            slug,
            rows.filter((row) => row.id !== flow!.id).concat(flow),
          );
          return {
            ok: true,
            needsModel: true,
            flow,
            suggestions: candidates,
            message: "Firma ve adet hazır. Yalnız doğru model onaylanmalıdır.",
          };
        }
      }

      const preview: any = await this.operations.incomingDispatchDraft(sourceId, {
        mainCompanySlug: slug,
      });
      if (!preview?.recipient?.id) {
        throw new ConflictException(
          "Müşteri İşNet alıcı listesinde doğrulanamadı; hazırlama ekranı açılamadı.",
        );
      }
      const sourceQuantity = this.totalQuantity(preview.lines || []);
      const alreadyPrepared = Array.isArray(flow?.dispatchHistory)
        ? flow!.dispatchHistory.reduce(
            (sum, row) => sum + numberValue(row.quantity),
            0,
          )
        : 0;
      const remainingQuantity = Math.max(
        0,
        Number((sourceQuantity - alreadyPrepared).toFixed(4)),
      );
      if (!(remainingQuantity > 0)) {
        throw new ConflictException(
          "Bu gelen irsaliyenin tamamı daha önce giden irsaliyelere dağıtılmış.",
        );
      }
      const context: any = await this.businessSettings.resolveContext({
        mainCompanySlug: slug,
        companyId: clean(intake.firmId || preview.recipient?.localCompanyId),
        companyName: clean(preview.recipientName || intake.issuerName),
        modelId: clean(intake.modelId || preview.modelId),
        modelName: clean(preview.modelName || intake.modelGuess),
      });
      const now = new Date().toISOString();
      flow = flow || {
        id: randomUUID(),
        mainCompanySlug: slug,
        incomingSourceId: sourceId,
        incomingDocumentNo: clean(preview.incomingDispatchNo),
        incomingIntakeId: intake.id,
        companyId: clean(intake.firmId || preview.recipient?.localCompanyId),
        companyName: clean(preview.recipientName),
        modelId: clean(intake.modelId || preview.modelId),
        modelName: clean(preview.modelName || intake.modelGuess),
        issueDate: clean(intake.issueDate || preview.issueDate),
        sourceQuantity,
        remainingQuantity,
        quantity: 0,
        currentCycle: 1,
        outgoingDraftNo: "",
        outgoingSourceId: "",
        dispatchHistory: [],
        status: "OUTGOING_DRAFT_READY",
        lastError: "",
        preview: null,
        invoiceSeed: null,
        createdAt: now,
        updatedAt: now,
      };
      Object.assign(flow, {
        incomingDocumentNo: clean(preview.incomingDispatchNo),
        incomingIntakeId: intake.id,
        companyId: clean(intake.firmId || preview.recipient?.localCompanyId),
        companyName: clean(preview.recipientName),
        modelId: clean(intake.modelId || preview.modelId),
        modelName: clean(preview.modelName || intake.modelGuess),
        issueDate: clean(intake.issueDate || preview.issueDate),
        sourceQuantity,
        remainingQuantity,
        currentCycle: Math.max(1, Number(flow.currentCycle || 1)),
        status: "OUTGOING_DRAFT_READY",
        lastError: "",
        preview: {
          ...preview,
          sourceQuantity,
          remainingQuantity,
          businessContext: context,
          preparationLines: this.preparationLines(preview, remainingQuantity),
          defaultIssueDate: new Date().toISOString().slice(0, 10),
          defaultIssueTime: new Date().toLocaleTimeString("tr-TR", {
            hour12: false,
          }),
        },
        updatedAt: now,
      });
      await this.writeRows(
        slug,
        rows.filter((row) => row.id !== flow!.id).concat(flow),
      );
      return {
        ok: true,
        requiresPreparation: true,
        flow,
        preparation: flow.preview,
        message:
          "Kalemler, kalan adet, tarih-saat, taşıyıcı ve sorumlu hazırlandı. Önizleme onayından önce İşNet taslağı oluşturulmadı.",
      };
    });
  }

  async assignModel(flowId: string, body: Input = {}) {
    const slug = this.slug(body);
    const rows = await this.readRows(slug);
    const flow = rows.find((row) => row.id === clean(flowId));
    if (!flow) throw new NotFoundException("İşNet iş akışı bulunamadı.");
    const assigned: any = await this.operations.assignIntakeModelSafe(
      flow.incomingIntakeId,
      {
        ...body,
        mainCompanySlug: slug,
        approvedBy: clean(body.approvedBy) || "ISNET_USER",
      },
    );
    flow.modelId = clean(assigned.model?.id || assigned.intake?.modelId);
    flow.modelName = clean(
      assigned.model?.modelName ||
        assigned.model?.name ||
        assigned.intake?.modelGuess,
    );
    flow.status = "OUTGOING_DRAFT_READY";
    flow.updatedAt = new Date().toISOString();
    await this.writeRows(slug, rows);
    return this.prepareIncoming(flow.incomingSourceId, {
      ...body,
      mainCompanySlug: slug,
    });
  }

  async createOutgoingDraft(flowId: string, body: Input = {}) {
    const slug = this.slug(body);
    return this.withLock(`${slug}:draft:${clean(flowId)}`, async () => {
      const rows = await this.readRows(slug);
      const flow = rows.find((row) => row.id === clean(flowId));
      if (!flow) throw new NotFoundException("İşNet iş akışı bulunamadı.");
      if (flow.outgoingDraftNo && flow.status === "OUTGOING_SEND_REQUIRED") {
        return {
          ok: true,
          duplicatePrevented: true,
          flow,
          message: `${flow.outgoingDraftNo} taslağı daha önce oluşturuldu.`,
        };
      }
      if (flow.status !== "OUTGOING_DRAFT_READY" || !flow.preview) {
        throw new ConflictException(
          "Önce irsaliye hazırlama ekranını açıp kalemleri kontrol edin.",
        );
      }
      const result: any = await this.preparation.createDraft({
        ...body,
        mainCompanySlug: slug,
        flowId: flow.id,
        sourceId: flow.incomingSourceId,
        cycleNo: flow.currentCycle || 1,
        remainingQuantity: flow.remainingQuantity,
        companyId: flow.companyId,
        companyName: flow.companyName,
        modelId: flow.modelId,
        modelName: flow.modelName,
        recipientId: flow.preview.recipient?.id,
        confirmed: true,
        previewApproved: body.previewApproved === true,
      });
      const history = Array.isArray(flow.dispatchHistory)
        ? flow.dispatchHistory
        : [];
      const historyRow = {
        cycleNo: flow.currentCycle || 1,
        draftNo: clean(result.draftNo),
        quantity: numberValue(result.total),
        fullClose: result.fullClose === true,
        remainingAfter: numberValue(result.remainingAfter),
        lines: result.lines || [],
        preparationKey: clean(result.preparationKey),
        status: "DRAFT_CREATED",
        issueDate: result.issueDate,
        issueTime: result.issueTime,
        createdAt: new Date().toISOString(),
      };
      flow.dispatchHistory = history
        .filter((row) => Number(row.cycleNo) !== Number(historyRow.cycleNo))
        .concat(historyRow);
      flow.quantity = numberValue(result.total);
      flow.remainingQuantity = numberValue(result.remainingAfter);
      flow.outgoingDraftNo = clean(result.draftNo);
      flow.outgoingSourceId = "";
      flow.status = "OUTGOING_SEND_REQUIRED";
      flow.lastError = "";
      flow.updatedAt = new Date().toISOString();
      await this.writeRows(slug, rows);
      return { ...result, flow };
    });
  }

  async updateInvoiceState(flowId: string, body: Input = {}) {
    const slug = this.slug(body);
    const status = clean(body.status);
    if (!["INVOICE_DRAFT_READY", "COMPLETED"].includes(status)) {
      throw new BadRequestException("Fatura iş akışı durumu geçersiz.");
    }
    const rows = await this.readRows(slug);
    const flow = rows.find((row) => row.id === clean(flowId));
    if (!flow) throw new NotFoundException("İşNet iş akışı bulunamadı.");
    if (status === "INVOICE_DRAFT_READY" && !clean(body.requestId)) {
      throw new BadRequestException("Fatura taslak işlem kimliği zorunludur.");
    }
    flow.invoiceRequestId = clean(body.requestId || flow.invoiceRequestId);
    flow.invoiceDraftNo = clean(body.draftNo || flow.invoiceDraftNo);
    flow.invoiceDraftVersion = clean(
      body.draftVersion || flow.invoiceDraftVersion,
    );
    flow.officialInvoiceNo = clean(
      body.officialInvoiceNo || flow.officialInvoiceNo,
    );
    flow.lastError = "";
    flow.updatedAt = new Date().toISOString();

    const history = Array.isArray(flow.dispatchHistory)
      ? flow.dispatchHistory
      : [];
    const activeHistory = history.find(
      (row) => Number(row.cycleNo) === Number(flow.currentCycle || 1),
    );
    if (activeHistory) {
      activeHistory.invoiceRequestId = flow.invoiceRequestId;
      activeHistory.invoiceDraftNo = flow.invoiceDraftNo;
      activeHistory.officialInvoiceNo = flow.officialInvoiceNo;
      activeHistory.status = status;
    }

    if (status === "COMPLETED" && flow.remainingQuantity > 0.0001) {
      flow.currentCycle = Number(flow.currentCycle || 1) + 1;
      flow.quantity = 0;
      flow.outgoingDraftNo = "";
      flow.outgoingSourceId = "";
      flow.invoiceRequestId = "";
      flow.invoiceDraftNo = "";
      flow.invoiceDraftVersion = "";
      flow.officialInvoiceNo = "";
      flow.invoiceSeed = null;
      flow.status = "OUTGOING_DRAFT_READY";
      const preview: any = await this.operations.incomingDispatchDraft(
        flow.incomingSourceId,
        { mainCompanySlug: slug },
      );
      const context: any = await this.businessSettings.resolveContext({
        mainCompanySlug: slug,
        companyId: flow.companyId,
        companyName: flow.companyName,
        modelId: flow.modelId,
        modelName: flow.modelName,
      });
      flow.preview = {
        ...preview,
        sourceQuantity: flow.sourceQuantity,
        remainingQuantity: flow.remainingQuantity,
        businessContext: context,
        preparationLines: this.preparationLines(
          preview,
          flow.remainingQuantity,
        ),
        defaultIssueDate: new Date().toISOString().slice(0, 10),
        defaultIssueTime: new Date().toLocaleTimeString("tr-TR", {
          hour12: false,
        }),
      };
    } else {
      flow.status = status;
    }
    await this.writeRows(slug, rows);
    return flow;
  }
}


