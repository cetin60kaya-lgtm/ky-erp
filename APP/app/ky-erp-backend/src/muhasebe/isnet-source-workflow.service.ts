import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { IsnetOperationsService } from "./isnet-operations.service";
import { IsnetSourceIntakeService } from "./isnet-source-intake.service";
import { IsnetFullSyncService } from "./isnet-full-sync.service";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;

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
export class IsnetSourceWorkflowService {
  private readonly activeDrafts = new Map<string, Promise<any>>();

  constructor(
    private readonly sourceIntakes: IsnetSourceIntakeService,
    private readonly operations: IsnetOperationsService,
    private readonly fullSync: IsnetFullSyncService,
    private readonly prisma: PrismaService,
  ) {}

  async createOutgoingDraft(id: string, body: Query = {}) {
    const slug = clean(body.mainCompanySlug || body.companyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    const key = `${slug}:${clean(id)}`;
    const active = this.activeDrafts.get(key);
    if (active) return active;

    const operation = this.createOutgoingDraftInternal(slug, id, body);
    this.activeDrafts.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.activeDrafts.get(key) === operation) this.activeDrafts.delete(key);
    }
  }

  private async createOutgoingDraftInternal(slug: string, id: string, body: Query) {
    const intake: any = await this.sourceIntakes.detail(slug, id);
    if (intake.companyRole === "SUPPLIER") {
      throw new BadRequestException("Tedarikçi kaydından giden müşteri irsaliyesi oluşturulamaz.");
    }
    if (!intake.modelId && !clean(intake.modelName)) {
      throw new BadRequestException("Önce kaynak kaydına model bağlayın.");
    }

    const maximum = numberValue(intake.capacity?.outgoingRemaining);
    const quantity = numberValue(body.quantity || maximum);
    if (quantity <= 0) throw new BadRequestException("Giden irsaliye adedi sıfırdan büyük olmalıdır.");
    if (quantity > maximum + 0.0001) {
      throw new ConflictException(`Giden irsaliye adedi kalan ${maximum} adedi aşamaz.`);
    }

    const recipientResult: any = await this.operations.recipientSearch({
      mainCompanySlug: slug,
      kind: "dispatch",
      q: intake.companyName,
    });
    const rows = Array.isArray(recipientResult?.rows) ? recipientResult.rows : [];
    const companyName = normalize(intake.companyName);
    const recipient =
      rows.find((row: any) => normalize(row?.name) === companyName) ||
      rows.find((row: any) => normalize(row?.name).includes(companyName) || companyName.includes(normalize(row?.name))) ||
      null;
    if (!recipient?.id) {
      throw new NotFoundException(
        `${intake.companyName} İşNet alıcı listesinde bulunamadı. Firma kartı ve İşNet etiketi kontrol edilmelidir.`,
      );
    }

    const externalId = `KYERP-SOURCE-${intake.id}-${Date.now()}`;
    const portalResult: any = await this.operations.createManualDispatchDraft({
      mainCompanySlug: slug,
      confirmed: true,
      recipientId: recipient.id,
      recipientName: recipient.name,
      localCompanyId: intake.companyId,
      issueDate: clean(body.issueDate || new Date().toISOString().slice(0, 10)),
      issueTime: clean(body.issueTime),
      orderNo: clean(intake.orderNo),
      modelId: clean(intake.modelId),
      modelName: clean(intake.modelName),
      note: clean(body.note || intake.note),
      externalId,
      lines: [
        {
          productName: clean(intake.modelName) || "Baskı hizmeti",
          description: clean(body.description || intake.note || intake.modelName),
          quantity,
          unitPrice: 0,
          measureUnitId: 67,
        },
      ],
    });

    const draftNo = clean(portalResult?.draftNo || portalResult?.documentNo);
    if (portalResult?.ok !== true || !draftNo) {
      throw new ConflictException(
        "İşNet portalı taslak numarası döndürmedi. Yerel kayıt tamamlanmadı ve tekrar denenebilir.",
      );
    }

    const prepared: any = await this.sourceIntakes.prepareOutgoingDispatch(slug, id, {
      quantity,
      note: clean(body.note || intake.note),
    });
    const completed = await this.sourceIntakes.completeOutgoingDispatch(
      slug,
      id,
      prepared.draft.id,
      {
        confirmed: true,
        documentNo: draftNo,
        ettn: clean(portalResult?.ettn),
      },
    );

    return {
      ok: true,
      portalDraft: portalResult,
      intake: completed.intake,
      capacity: completed.capacity,
      message: `${draftNo} numaralı giden irsaliye taslağı İşNet'te oluşturuldu ve kaynak kaydına bağlandı.`,
    };
  }

  async prepareInvoice(id: string, body: Query = {}) {
    const slug = clean(body.mainCompanySlug || body.companyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    const intake: any = await this.sourceIntakes.detail(slug, id);
    const completedDrafts = (intake.outgoingDispatchDrafts || []).filter(
      (row: any) => row.status === "COMPLETED" && clean(row.documentNo),
    );
    const selected = completedDrafts.find((row: any) => row.id === clean(body.draftId)) || completedDrafts.at(-1);
    if (!selected) throw new BadRequestException("Faturaya çevrilecek tamamlanmış giden irsaliye bulunamadı.");

    await this.fullSync.run({
      ...body,
      mainCompanySlug: slug,
      startDate: clean(body.startDate || intake.issueDate),
      endDate: clean(body.endDate || new Date().toISOString().slice(0, 10)),
    });

    const state = await this.prisma.isnetDocumentState.findFirst({
      where: {
        mainCompanySlug: slug,
        direction: "outgoing",
        kind: "dispatch",
        documentNo: clean(selected.documentNo),
        completed: true,
      },
      orderBy: { downloadedAt: "desc" },
    });
    if (!state?.sourceId || !/^\d+$/.test(clean(state.sourceId))) {
      return {
        ok: false,
        ready: false,
        status: "WAITING_PORTAL_SEND",
        documentNo: selected.documentNo,
        message:
          "Giden irsaliye İşNet taslaklarında oluşturuldu ancak gönderilmiş belge listesinde henüz görünmüyor. İşNet gönderimi tamamlandıktan sonra Tek Senkronizasyon ile tekrar kontrol edin.",
      };
    }

    const draft = await this.operations.outgoingDispatchInvoiceDraft(state.sourceId, {
      mainCompanySlug: slug,
    });
    return {
      ok: true,
      ready: true,
      status: "READY_FOR_INVOICE",
      sourceId: state.sourceId,
      documentNo: selected.documentNo,
      invoiceDraft: draft,
      message: `${selected.documentNo} irsaliyesi fatura taslağına hazırlandı.`,
    };
  }
}
