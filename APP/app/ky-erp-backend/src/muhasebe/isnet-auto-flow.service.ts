import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetFullSyncService } from "./isnet-full-sync.service";
import { IsnetOperationsService } from "./isnet-operations.service";

type Query = Record<string, any>;

type AutoFlowStatus =
  | "MODEL_REQUIRED"
  | "OUTGOING_DRAFT_READY"
  | "OUTGOING_SEND_REQUIRED"
  | "PRICE_REQUIRED"
  | "INVOICE_DRAFT_READY"
  | "COMPLETED"
  | "ERROR";

type AutoFlowRow = {
  id: string;
  mainCompanySlug: string;
  incomingSourceId: string;
  incomingDocumentNo: string;
  incomingIntakeId: string;
  companyName: string;
  modelId: string;
  modelName: string;
  issueDate: string;
  quantity: number;
  outgoingDraftNo: string;
  outgoingSourceId: string;
  status: AutoFlowStatus;
  lastError: string;
  preview: Query | null;
  invoiceSeed: Query | null;
  createdAt: string;
  updatedAt: string;
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalize = (value: unknown) =>
  clean(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çğıöşü]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

@Injectable()
export class IsnetAutoFlowService {
  private readonly locks = new Map<string, Promise<any>>();
  private readonly settingKey = "AUTO_FLOWS";

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: IsnetOperationsService,
    private readonly fullSync: IsnetFullSyncService,
  ) {}

  private slug(body: Query = {}) {
    const value = clean(body.mainCompanySlug || body.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private async readRows(slug: string): Promise<AutoFlowRow[]> {
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
    return Array.isArray(value?.rows) ? (value.rows as AutoFlowRow[]) : [];
  }

  private async writeRows(slug: string, rows: AutoFlowRow[]) {
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

  private async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const current = this.locks.get(key);
    if (current) return current;
    const operation = action();
    this.locks.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(key) === operation) this.locks.delete(key);
    }
  }

  async list(query: Query = {}) {
    const slug = this.slug(query);
    const rows = await this.readRows(slug);
    return {
      rows: rows
        .filter((row) => !query.status || row.status === query.status)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
  }

  async prepareIncoming(sourceIdValue: string, body: Query = {}) {
    const slug = this.slug(body);
    const sourceId = clean(sourceIdValue);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Gelen İşNet irsaliye kimliği geçersiz.");
    }
    return this.withLock(`${slug}:incoming:${sourceId}`, () =>
      this.prepareIncomingInternal(slug, sourceId, body),
    );
  }

  private async prepareIncomingInternal(slug: string, sourceId: string, body: Query) {
    const rows = await this.readRows(slug);
    let flow = rows.find((row) => row.incomingSourceId === sourceId) || null;

    if (flow?.outgoingDraftNo) {
      return {
        ok: true,
        duplicatePrevented: true,
        flow,
        message: `${flow.outgoingDraftNo} taslağı daha önce oluşturuldu. Yeni taslak açılmadı.`,
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

    const suggestions: any = intake.modelId
      ? { requiresModel: false, suggestions: [] }
      : await this.operations.modelSuggestions(intake.id, {
          mainCompanySlug: slug,
          search: intake.modelGuess || "",
        });

    if (!intake.modelId) {
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
        const assigned: any = await this.operations.assignIntakeModelSafe(intake.id, {
          mainCompanySlug: slug,
          source: first.source,
          candidateId: first.id,
          confidence: first.score,
          approvedBy: "ISNET_AUTO_MATCH",
        });
        intake = assigned.intake;
      } else {
        const now = new Date().toISOString();
        flow = flow || {
          id: randomUUID(),
          mainCompanySlug: slug,
          incomingSourceId: sourceId,
          incomingDocumentNo: clean(intake.documentNo || intake.dispatchNo),
          incomingIntakeId: intake.id,
          companyName: clean(intake.issuerName || intake.companyName),
          modelId: "",
          modelName: clean(intake.modelGuess),
          issueDate: clean(intake.issueDate),
          quantity: (intake.lines || []).reduce(
            (sum: number, line: any) => sum + numberValue(line.quantity),
            0,
          ),
          outgoingDraftNo: "",
          outgoingSourceId: "",
          status: "MODEL_REQUIRED" as AutoFlowStatus,
          lastError: "",
          preview: null,
          invoiceSeed: null,
          createdAt: now,
          updatedAt: now,
        };
        flow.status = "MODEL_REQUIRED";
        flow.updatedAt = now;
        flow.incomingIntakeId = intake.id;
        flow.modelName = clean(intake.modelGuess);
        const nextRows = rows.filter((row) => row.id !== flow!.id).concat(flow);
        await this.writeRows(slug, nextRows);
        return {
          ok: true,
          needsModel: true,
          flow,
          suggestions: candidates,
          message: "Firma ve adet hazır. Yalnız model eşleşmesi onaylanmalıdır.",
        };
      }
    }

    const preview: any = await this.operations.incomingDispatchDraft(sourceId, {
      mainCompanySlug: slug,
    });
    if (!preview?.recipient?.id) {
      throw new ConflictException(
        "Müşteri İşNet alıcı listesinde doğrulanamadı; taslak oluşturulmadı.",
      );
    }

    const draft: any = await this.operations.createDispatchDraftFromIncoming({
      mainCompanySlug: slug,
      id: sourceId,
      confirmed: true,
    });
    const draftNo = clean(draft?.draftNo || draft?.documentNo);
    if (!draft?.ok) {
      throw new ConflictException("İşNet giden irsaliye taslağını doğrulayamadı.");
    }

    const now = new Date().toISOString();
    flow = flow || {
      id: randomUUID(),
      mainCompanySlug: slug,
      incomingSourceId: sourceId,
      incomingDocumentNo: clean(preview.incomingDispatchNo),
      incomingIntakeId: intake.id,
      companyName: clean(preview.recipientName),
      modelId: clean(intake.modelId || preview.modelId),
      modelName: clean(preview.modelName || intake.modelGuess),
      issueDate: clean(intake.issueDate || preview.issueDate),
      quantity: (preview.lines || []).reduce(
        (sum: number, line: any) => sum + numberValue(line.quantity),
        0,
      ),
      outgoingDraftNo: draftNo,
      outgoingSourceId: "",
      status: "OUTGOING_SEND_REQUIRED" as AutoFlowStatus,
      lastError: "",
      preview,
      invoiceSeed: null,
      createdAt: now,
      updatedAt: now,
    };
    Object.assign(flow, {
      incomingDocumentNo: clean(preview.incomingDispatchNo),
      incomingIntakeId: intake.id,
      companyName: clean(preview.recipientName),
      modelId: clean(intake.modelId || preview.modelId),
      modelName: clean(preview.modelName || intake.modelGuess),
      issueDate: clean(intake.issueDate || preview.issueDate),
      quantity: (preview.lines || []).reduce(
        (sum: number, line: any) => sum + numberValue(line.quantity),
        0,
      ),
      outgoingDraftNo: draftNo,
      status: "OUTGOING_SEND_REQUIRED",
      lastError: "",
      preview,
      updatedAt: now,
    });
    await this.writeRows(
      slug,
      rows.filter((row) => row.id !== flow!.id).concat(flow),
    );
    return {
      ok: true,
      flow,
      portalDraft: draft,
      message: draftNo
        ? `${draftNo} giden irsaliye taslağı hazır. İşNet'te kontrol edip gönderin.`
        : "Giden irsaliye taslağı hazır. İşNet'te kontrol edip gönderin.",
    };
  }

  async assignModel(flowId: string, body: Query = {}) {
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
      assigned.model?.modelName || assigned.model?.name || assigned.intake?.modelGuess,
    );
    flow.status = "OUTGOING_DRAFT_READY";
    flow.updatedAt = new Date().toISOString();
    await this.writeRows(slug, rows);
    return this.prepareIncoming(flow.incomingSourceId, {
      ...body,
      mainCompanySlug: slug,
    });
  }

  async setOutgoingDocumentNo(flowId: string, body: Query = {}) {
    const slug = this.slug(body);
    const documentNo = clean(body.documentNo);
    if (!documentNo) throw new BadRequestException("Giden irsaliye numarası zorunludur.");
    const rows = await this.readRows(slug);
    const flow = rows.find((row) => row.id === clean(flowId));
    if (!flow) throw new NotFoundException("İşNet iş akışı bulunamadı.");
    flow.outgoingDraftNo = documentNo;
    flow.updatedAt = new Date().toISOString();
    await this.writeRows(slug, rows);
    return flow;
  }

  async refreshAfterDispatch(flowId: string, body: Query = {}) {
    const slug = this.slug(body);
    return this.withLock(`${slug}:refresh:${clean(flowId)}`, async () => {
      const rows = await this.readRows(slug);
      const flow = rows.find((row) => row.id === clean(flowId));
      if (!flow) throw new NotFoundException("İşNet iş akışı bulunamadı.");
      if (!flow.outgoingDraftNo) {
        throw new BadRequestException(
          "İşNet taslak numarası bulunamadı. Portalda görünen giden irsaliye numarasını girin.",
        );
      }

      await this.fullSync.run({
        ...body,
        mainCompanySlug: slug,
        startDate: clean(body.startDate || flow.issueDate),
        endDate: clean(body.endDate || new Date().toISOString().slice(0, 10)),
      });

      const state = await this.prisma.isnetDocumentState.findFirst({
        where: {
          mainCompanySlug: slug,
          direction: "outgoing",
          kind: "dispatch",
          documentNo: flow.outgoingDraftNo,
          completed: true,
        },
        orderBy: { downloadedAt: "desc" },
      });
      if (!state?.sourceId || !/^\d+$/.test(clean(state.sourceId))) {
        flow.status = "OUTGOING_SEND_REQUIRED";
        flow.updatedAt = new Date().toISOString();
        await this.writeRows(slug, rows);
        return {
          ok: true,
          ready: false,
          flow,
          message:
            "Taslak henüz İşNet gönderilmiş irsaliyeler listesinde görünmüyor. Taslağı gönderip tekrar kontrol edin.",
        };
      }

      const invoiceSeed: any = await this.operations.outgoingDispatchInvoiceDraft(
        clean(state.sourceId),
        { mainCompanySlug: slug },
      );
      flow.outgoingSourceId = clean(state.sourceId);
      flow.invoiceSeed = invoiceSeed;
      flow.status = "PRICE_REQUIRED";
      flow.updatedAt = new Date().toISOString();
      flow.lastError = "";
      await this.writeRows(slug, rows);
      return {
        ok: true,
        ready: true,
        flow,
        sourceId: flow.outgoingSourceId,
        documentNo: flow.outgoingDraftNo,
        invoiceDraft: invoiceSeed,
        message: `${flow.outgoingDraftNo} gönderilmiş irsaliye olarak bulundu. Yalnız fiyat girilmesi gerekiyor.`,
      };
    });
  }
}
