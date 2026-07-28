import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetBusinessSettingsService } from "./isnet-business-settings.service";
import { IsnetOperationsService } from "./isnet-operations.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsOf(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

@Injectable()
export class IsnetDispatchPreparationService {
  private readonly locks = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: IsnetOperationsService,
    private readonly businessSettings: IsnetBusinessSettingsService,
  ) {}

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private async withLock<T>(key: string, action: () => Promise<T>) {
    const existing = this.locks.get(key);
    if (existing) return existing as Promise<T>;
    const operation = action();
    this.locks.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.locks.get(key) === operation) this.locks.delete(key);
    }
  }

  private idempotencyKey(
    slug: string,
    sourceId: string,
    cycleNo: number,
    total: number,
  ) {
    const digest = createHash("sha256")
      .update(`${slug}:${sourceId}:${cycleNo}:${total}`)
      .digest("hex")
      .slice(0, 24)
      .toUpperCase();
    return `KYERP-DSP-${digest}`;
  }

  private issueDate(value: unknown) {
    const requested = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
    return new Date().toISOString().slice(0, 10);
  }

  private issueTime(value: unknown) {
    const requested = clean(value);
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(requested)) {
      return requested.length === 5 ? `${requested}:00` : requested;
    }
    return new Date().toLocaleTimeString("tr-TR", { hour12: false });
  }

  private validateLines(body: Input, remainingQuantity: number) {
    const fullClose = body.fullClose !== false;
    const lines = rowsOf(body.lines)
      .map((line, index) => ({
        sourceLineId: clean(line.sourceLineId || line.lineId || index + 1),
        category: clean(line.category || "MAIN").toUpperCase(),
        productName: clean(line.productName || line.name),
        description: clean(line.description),
        quantity: numberValue(line.quantity),
        measureUnitId: clean(line.measureUnitId || 67),
        unitPrice: numberValue(line.unitPrice),
      }))
      .filter((line) => line.quantity > 0);

    if (!lines.length) {
      throw new BadRequestException("Taslak için en az bir adetli kalem zorunludur.");
    }
    if (lines.some((line) => !line.productName)) {
      throw new BadRequestException("Bütün adetli kalemlerin ürün açıklaması zorunludur.");
    }
    const allowed = new Set([
      "MAIN",
      "TEST_NUMUNESI",
      "BASKI_SAKATI",
      "KUMAS_SAKATI",
    ]);
    if (lines.some((line) => !allowed.has(line.category))) {
      throw new BadRequestException("İrsaliye kalem kategorisi geçersizdir.");
    }

    const total = Number(
      lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(4),
    );
    if (total <= 0) {
      throw new BadRequestException("İrsaliye toplam adedi sıfırdan büyük olmalıdır.");
    }
    if (total - remainingQuantity > 0.0001) {
      throw new ConflictException(
        `Taslak toplamı ${total}, kalan ${remainingQuantity} adedi aşıyor.`,
      );
    }
    if (fullClose && Math.abs(total - remainingQuantity) > 0.0001) {
      const difference = Number((remainingQuantity - total).toFixed(4));
      throw new ConflictException(
        difference > 0
          ? `Tam kesimde ${difference} adet eksik dağıtım var. Toplam ${remainingQuantity} olmalıdır.`
          : `Tam kesimde ${Math.abs(difference)} adet fazla dağıtım var.`,
      );
    }
    return { lines, total, fullClose };
  }

  async createDraft(body: Input = {}) {
    const slug = this.slug(body);
    const sourceId = clean(body.sourceId || body.incomingSourceId);
    const flowId = clean(body.flowId);
    const cycleNo = Math.max(1, Math.trunc(numberValue(body.cycleNo) || 1));
    const remainingQuantity = numberValue(body.remainingQuantity);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Gelen İşNet irsaliye kimliği geçersiz.");
    }
    if (!flowId) throw new BadRequestException("İş akışı kimliği zorunludur.");
    if (!(remainingQuantity > 0)) {
      throw new BadRequestException("Kalan irsaliye adedi doğrulanamadı.");
    }
    if (body.confirmed !== true || body.previewApproved !== true) {
      throw new BadRequestException(
        "İşNet taslağı için önizleme ve kullanıcı onayı zorunludur.",
      );
    }

    const validated = this.validateLines(body, remainingQuantity);
    const lockKey = `${slug}:${flowId}:${cycleNo}`;
    return this.withLock(lockKey, async () => {
      const preparationKey = this.idempotencyKey(
        slug,
        sourceId,
        cycleNo,
        validated.total,
      );
      const prior = await this.prisma.setting.findUnique({
        where: {
          scope_mainCompanySlug_key: {
            scope: "ISNET_DISPATCH_PREPARATION",
            mainCompanySlug: slug,
            key: preparationKey,
          },
        },
      });
      const priorValue = prior?.value as any;
      if (clean(priorValue?.draftNo)) {
        return {
          ok: true,
          duplicatePrevented: true,
          draftNo: clean(priorValue.draftNo),
          preparationKey,
          message: `${clean(priorValue.draftNo)} taslağı daha önce oluşturuldu. Yeni taslak açılmadı.`,
        };
      }
      if (priorValue?.status === "SUBMITTING") {
        throw new ConflictException(
          "Bu hazırlık için İşNet taslak oluşturma işlemi halen sürüyor.",
        );
      }

      await this.prisma.setting.upsert({
        where: {
          scope_mainCompanySlug_key: {
            scope: "ISNET_DISPATCH_PREPARATION",
            mainCompanySlug: slug,
            key: preparationKey,
          },
        },
        create: {
          scope: "ISNET_DISPATCH_PREPARATION",
          mainCompanySlug: slug,
          key: preparationKey,
          value: {
            status: "SUBMITTING",
            flowId,
            sourceId,
            cycleNo,
            total: validated.total,
            startedAt: new Date().toISOString(),
          },
        },
        update: {
          value: {
            status: "SUBMITTING",
            flowId,
            sourceId,
            cycleNo,
            total: validated.total,
            startedAt: new Date().toISOString(),
          },
          deletedAt: null,
        },
      });

      const context: any = await this.businessSettings.resolveContext({
        mainCompanySlug: slug,
        companyId: body.companyId,
        companyName: body.companyName,
        modelId: body.modelId,
        modelName: body.modelName,
      });
      const carrier = {
        ...context.carrier,
        ...(body.carrier && typeof body.carrier === "object" ? body.carrier : {}),
      };
      const issueDate = this.issueDate(body.issueDate);
      const issueTime = this.issueTime(body.issueTime);
      const recipientId = clean(body.recipientId);
      if (!recipientId) {
        throw new BadRequestException("İşNet alıcı firma kimliği zorunludur.");
      }

      // IsnetOperationsService portal oturumu ve taslak gönderim altyapısını tek yerde
      // tutar. Burada yalnız doğrulanmış hazırlama verisiyle o altyapıyı kullanıyoruz.
      const operations = this.operations as any;
      const configured = await operations.configuredPortal(slug);
      const detail = await operations.recipientDetail(
        configured.session,
        "Despatch",
        recipientId,
      );
      const recipient = detail.recipient;
      const tag = detail.tag;
      const notes = [
        clean(body.note),
        clean(body.modelName) ? `MODEL: ${clean(body.modelName)}` : "",
        context.department?.departmentCode
          ? `DEPARTMAN: ${clean(context.department.departmentCode)}`
          : "",
        context.responsible?.fullName
          ? `TESLİM EDEN: ${clean(context.responsible.fullName)}`
          : "",
      ].filter(Boolean);

      const payload = {
        ETTN: "",
        DespatchAdviceId: 0,
        RecipientType: clean(recipient.AliciTipi || 3),
        DespatchAdviceNumber: clean(body.documentNo),
        CompanyId: configured.companyId,
        ScenarioType: clean(body.scenarioType || 1),
        ReceiverInboxTag: tag,
        DespatchAdviceDate: operations.portalInputDate(issueDate),
        DespatchAdviceTime: issueTime,
        ActualDespatchAdviceDate: operations.portalInputDate(issueDate),
        ActualDespatchAdviceTime: issueTime,
        DespatchAdviceType: clean(body.dispatchType || 1),
        IdIrsaliyeExternal: preparationKey,
        OrderDate: operations.portalInputDate(body.orderDate || issueDate),
        OrderNumber: clean(body.orderNo),
        LastPaymentDate: "",
        AttachmentList: [],
        IdAlici: recipientId,
        Products: validated.lines.map((line) => ({
          ProductDespatchModelId: 0,
          LineExtensionAmount: line.quantity * line.unitPrice,
          MeasureUnitId: line.measureUnitId,
          ProductId: 0,
          ProductName: line.productName,
          Quantity: line.quantity,
          Deleted: false,
          ImprintNumber: "",
          IdisTagNumbers: [],
          UnitPrice: line.unitPrice,
          StockDescription: line.description || clean(body.modelName),
        })),
        CurrencyCode: clean(body.currency || "TRY"),
        Notes: notes,
        TotalAmount: validated.lines.reduce(
          (sum, line) => sum + line.quantity * line.unitPrice,
          0,
        ),
        AliciBayiNo: "",
        PrintedDocumentDate: "",
        PrintedDocumentSerialNumber: "",
        PrintedDocumentOrderNumber: "",
        PrintedStaticValue: "",
        CompanyBankAccountList: [],
        DriverList: clean(carrier.driverName)
          ? [
              {
                Name: clean(carrier.driverName),
                Tckn: clean(carrier.driverId),
              },
            ]
          : [],
        IdisShipmentNumber: "",
        CarrierVkn: clean(carrier.taxNo),
        CarrierTitle: clean(carrier.carrierName),
        Plaque: clean(carrier.vehiclePlate),
        TrailerPlaque: clean(carrier.trailerPlate),
      };

      try {
        const result = await operations.submitPortalDraft(
          configured.session,
          "/Despatch/Create",
          payload,
        );
        const draftNo = clean(
          typeof result === "string" || typeof result === "number"
            ? result
            : result?.documentNo || result?.IrsaliyeNo,
        );
        await this.prisma.setting.update({
          where: {
            scope_mainCompanySlug_key: {
              scope: "ISNET_DISPATCH_PREPARATION",
              mainCompanySlug: slug,
              key: preparationKey,
            },
          },
          data: {
            value: {
              status: "CREATED",
              flowId,
              sourceId,
              cycleNo,
              preparationKey,
              draftNo,
              issueDate,
              issueTime,
              total: validated.total,
              fullClose: validated.fullClose,
              remainingAfter: Number(
                (remainingQuantity - validated.total).toFixed(4),
              ),
              lines: validated.lines,
              departmentCode: context.department?.departmentCode || "",
              responsibleName: context.responsible?.fullName || "",
              carrier,
              createdAt: new Date().toISOString(),
            },
          },
        });
        return {
          ok: true,
          draftNo,
          preparationKey,
          issueDate,
          issueTime,
          total: validated.total,
          fullClose: validated.fullClose,
          remainingAfter: Number(
            (remainingQuantity - validated.total).toFixed(4),
          ),
          lines: validated.lines,
          context,
          message: draftNo
            ? `${draftNo} giden irsaliye taslağı oluşturuldu. Son gönderim kontrolü kullanıcıdadır.`
            : "Giden irsaliye taslağı İşNet'te oluşturuldu. Son gönderim kontrolü kullanıcıdadır.",
        };
      } catch (error: any) {
        await this.prisma.setting.update({
          where: {
            scope_mainCompanySlug_key: {
              scope: "ISNET_DISPATCH_PREPARATION",
              mainCompanySlug: slug,
              key: preparationKey,
            },
          },
          data: {
            value: {
              status: "VERIFY_REQUIRED",
              flowId,
              sourceId,
              cycleNo,
              preparationKey,
              total: validated.total,
              error: clean(error?.message),
              failedAt: new Date().toISOString(),
            },
          },
        });
        throw new ConflictException(
          "İşNet sonucu kesin doğrulanamadı. Çift taslak riskini önlemek için otomatik yeniden deneme kapatıldı; portal taslak listesi kontrol edilmelidir.",
        );
      }
    });
  }
}
