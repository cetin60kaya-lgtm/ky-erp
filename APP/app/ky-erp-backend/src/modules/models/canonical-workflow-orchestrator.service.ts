import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonObject(value: unknown): Input {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : {};
}

function normalize(value: unknown) {
  return clean(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

@Injectable()
export class CanonicalWorkflowOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: CanonicalModelFlowService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.mainCompanyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private async resolveCompany(input: Input = {}, required = true) {
    const mainCompanySlug = this.slug(input);
    const requestedId = clean(
      input.companyId || input.firmaId || input.firmId || input.customerFirmId,
    );
    const requestedName = clean(
      input.companyName || input.firmaAdi || input.firma || input.customerName,
    );
    const companies = await this.db().company.findMany({
      where: {
        mainCompanySlug,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ name: "asc" }],
      take: 5000,
    });
    let matches = companies.filter((row: any) => {
      const type = normalize(row.companyType || row.type || row.role);
      return !type || ["CUSTOMER", "MUSTERI", "BOTH", "HER IKISI"].includes(type);
    });
    if (requestedId) {
      matches = matches.filter((row: any) => clean(row.id) === requestedId);
    } else if (requestedName) {
      const key = normalize(requestedName);
      matches = matches.filter((row: any) =>
        [row.name, row.normalizedName, row.title]
          .map(normalize)
          .filter(Boolean)
          .includes(key),
      );
    } else {
      matches = [];
    }

    if (matches.length > 1) {
      throw new BadRequestException(
        "Firma adı birden fazla müşteri kartıyla eşleşti. Firma kartını seçin.",
      );
    }
    if (!matches.length) {
      if (!required || input.allowCompanyPending === true) return null;
      throw new BadRequestException(
        "Model için kayıtlı müşteri firma seçilmelidir; serbest firma adıyla model açılamaz.",
      );
    }
    return matches[0];
  }

  private modelCompanyId(model: any) {
    const raw = jsonObject(model?.raw);
    return clean(
      raw.companyId || raw.firmaId || raw.firmId || model?.companyId || model?.firmaId,
    );
  }

  private async log(
    mainCompanySlug: string,
    entityType: string,
    entityId: string,
    action: string,
    description: string,
    newValue?: unknown,
  ) {
    await this.db().activityLog
      .create({
        data: {
          mainCompanySlug,
          module: "MODEL_FLOW",
          entityType,
          entityId,
          action,
          actionType: action,
          description,
          actor: "sistem",
          newValue: newValue === undefined ? undefined : (newValue as any),
        },
      })
      .catch(() => null);
  }

  async quickCreate(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const company = await this.resolveCompany(input, input.allowCompanyPending !== true);
    const result = await this.flow.quickCreate({
      ...input,
      mainCompanySlug,
      companyId: company?.id || null,
      firmaId: company?.id || null,
      firmaAdi: company?.name || clean(input.firmaAdi || input.companyName),
      companyName: company?.name || clean(input.companyName || input.firmaAdi),
      canonicalModel: true,
    });
    if (!result?.canonicalModelId || !result?.model?.id) {
      throw new BadRequestException("Tek merkez model kaydı tamamlanamadı.");
    }
    await this.log(
      mainCompanySlug,
      "CANONICAL_MODEL",
      result.canonicalModelId,
      "MODEL_QUICK_CREATED",
      `${clean(result.model.modelName)} tek merkez model olarak açıldı.`,
      {
        companyId: company?.id || null,
        sourceModule: clean(input.sourceModule) || "DESEN",
        designWorkflowModelId: result.designWorkflowModelId,
      },
    );
    return {
      ...result,
      company: company
        ? { id: company.id, name: company.name, companyType: company.companyType || company.type }
        : null,
    };
  }

  async linkDispatch(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelId = clean(input.modelId || input.canonicalModelId);
    if (!modelId) throw new BadRequestException("Bağlanacak model zorunludur.");
    const documentKey = clean(
      input.documentIntakeId || input.intakeId || input.dispatchNo || input.documentNo,
    );
    if (!documentKey) throw new BadRequestException("Gelen irsaliye kimliği zorunludur.");

    const [model, intake] = await Promise.all([
      this.db().modelRecord.findFirst({
        where: { id: modelId, mainCompanySlug, NOT: { status: "ARCHIVED" } },
      }),
      this.db().documentIntake.findFirst({
        where: {
          mainCompanySlug,
          OR: [
            { id: documentKey },
            { dispatchNo: documentKey },
            { documentNo: documentKey },
          ],
        },
        include: { lines: true },
      }),
    ]);
    if (!model) throw new NotFoundException("Tek merkez model kaydı bulunamadı.");
    if (!intake) throw new NotFoundException("Gelen irsaliye kaydı bulunamadı.");

    const intakeCompanyId = clean(intake.firmId || intake.companyId);
    const currentCompanyId = this.modelCompanyId(model);
    if (currentCompanyId && intakeCompanyId && currentCompanyId !== intakeCompanyId) {
      throw new BadRequestException(
        "İrsaliye firması ile model kartındaki müşteri farklı. Yanlış model bağlantısı engellendi.",
      );
    }

    if (!currentCompanyId && intakeCompanyId) {
      const company = await this.resolveCompany(
        { mainCompanySlug, companyId: intakeCompanyId },
        true,
      );
      const raw = jsonObject(model.raw);
      await this.db().modelRecord.update({
        where: { id: model.id },
        data: {
          raw: {
            ...raw,
            companyId: company.id,
            firmaId: company.id,
            firmaAdi: company.name,
            companyName: company.name,
            customerBoundAt: new Date().toISOString(),
          },
        },
      });
    }

    const linked = await this.flow.linkDispatch({
      ...input,
      mainCompanySlug,
      modelId,
      documentIntakeId: intake.id,
    });
    await this.log(
      mainCompanySlug,
      "CANONICAL_MODEL",
      modelId,
      "DISPATCH_LINKED",
      `${clean(intake.dispatchNo || intake.documentNo)} irsaliyesi modele ve üretim planına bağlandı.`,
      {
        intakeId: intake.id,
        dispatchNo: intake.dispatchNo || intake.documentNo,
        expectedQty: linked.expectedQty,
      },
    );
    return linked;
  }

  private async dyehouseMap(mainCompanySlug: string, modelIds: string[]) {
    const jobs = await this.db().dyehouseModel
      .findMany({
        where: { mainCompanySlug },
        orderBy: [{ updatedAt: "desc" }],
        take: 10000,
      })
      .catch(() => []);
    const map = new Map<string, any[]>();
    for (const job of jobs) {
      const raw = jsonObject(job.raw);
      const workflow = jsonObject(raw.designWorkflow);
      const modelId = clean(raw.canonicalModelId || workflow.canonicalModelId);
      if (!modelId || !modelIds.includes(modelId)) continue;
      const rows = map.get(modelId) || [];
      rows.push(job);
      map.set(modelId, rows);
    }
    return map;
  }

  async reconciliation(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const base = await this.flow.reconciliation(input);
    const rows = Array.isArray(base?.rows) ? base.rows : [];
    const modelIds = [...new Set(rows.map((row: any) => clean(row.modelId)).filter(Boolean))];
    if (!modelIds.length) return base;

    const [dyehouseByModel, invoiceLinks, designLinks] = await Promise.all([
      this.dyehouseMap(mainCompanySlug, modelIds),
      this.db().salesInvoiceLineModelLink
        .findMany({
          where: { mainCompanySlug, modelId: { in: modelIds } },
          orderBy: [{ createdAt: "desc" }],
          take: 20000,
        })
        .catch(() => []),
      this.db().designModelLink
        .findMany({
          where: { mainCompanySlug, modelId: { in: modelIds } },
          take: 10000,
        })
        .catch(() => []),
    ]);

    const invoiceQty = new Map<string, number>();
    for (const link of invoiceLinks) {
      const modelId = clean(link.modelId);
      invoiceQty.set(
        modelId,
        numberValue(invoiceQty.get(modelId)) + numberValue(link.matchedQuantity),
      );
    }
    const designByModel = new Map<string, string>(
      designLinks.map((link: any) => [clean(link.modelId), clean(link.designRecordId)]),
    );
    const designIds = [...new Set([...designByModel.values()].filter(Boolean))];
    const designs = designIds.length
      ? await this.db().designWorkflowModel
          .findMany({ where: { id: { in: designIds }, mainCompanySlug } })
          .catch(() => [])
      : [];
    const designById = new Map<string, any>(
      designs.map((row: any) => [clean(row.id), row]),
    );

    const enrichedRows = rows.map((row: any) => {
      const modelId = clean(row.modelId);
      const dyehouseJobs = dyehouseByModel.get(modelId) || [];
      const design = designById.get(clean(designByModel.get(modelId)));
      const invoicedQty = numberValue(invoiceQty.get(modelId));
      const netGoodQty = numberValue(row.netGoodQty);
      const uninvoicedQty = Math.max(0, netGoodQty - invoicedQty);
      const dyehouseCompleted =
        dyehouseJobs.length > 0 &&
        dyehouseJobs.every((job: any) => clean(job.status) === "COMPLETED");
      const workflowState =
        row.status === "İRSALİYE YOK"
          ? "İRSALİYE BEKLİYOR"
          : numberValue(row.remainingQty) > 0
            ? "ÜRETİM DEVAM EDİYOR"
            : uninvoicedQty > 0
              ? "FATURA BEKLİYOR"
              : invoicedQty > 0
                ? "MUHASEBEYE BAĞLANDI"
                : "KONTROL";
      return {
        ...row,
        canonicalModelId: modelId,
        designRecordId: clean(design?.id),
        designStatus: clean(design?.status),
        dyehouseJobCount: dyehouseJobs.length,
        dyehouseStatus: dyehouseJobs.length
          ? dyehouseCompleted
            ? "COMPLETED"
            : dyehouseJobs.some((job: any) => clean(job.status) === "ACTIVE")
              ? "ACTIVE"
              : clean(dyehouseJobs[0]?.status)
          : "NOT_CREATED",
        invoicedQty,
        uninvoicedQty,
        workflowState,
      };
    });

    return {
      ...base,
      rows: enrichedRows,
      summary: {
        ...(base?.summary || {}),
        invoicedQty: enrichedRows.reduce(
          (sum: number, row: any) => sum + numberValue(row.invoicedQty),
          0,
        ),
        uninvoicedQty: enrichedRows.reduce(
          (sum: number, row: any) => sum + numberValue(row.uninvoicedQty),
          0,
        ),
        dyehousePending: enrichedRows.filter(
          (row: any) => !["COMPLETED", "NOT_CREATED"].includes(row.dyehouseStatus),
        ).length,
        invoicePending: enrichedRows.filter(
          (row: any) => numberValue(row.uninvoicedQty) > 0,
        ).length,
      },
    };
  }

  async timeline(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelId = clean(input.modelId || input.canonicalModelId);
    if (!modelId) throw new BadRequestException("Model kimliği zorunludur.");
    const dispatchNo = clean(input.dispatchNo || input.orderNo);
    const model = await this.db().modelRecord.findFirst({
      where: { id: modelId, mainCompanySlug },
    });
    if (!model) throw new NotFoundException("Model bulunamadı.");

    const designLink = await this.db().designModelLink
      .findFirst({ where: { mainCompanySlug, modelId } })
      .catch(() => null);
    const design = designLink?.designRecordId
      ? await this.db().designWorkflowModel
          .findFirst({
            where: { id: designLink.designRecordId, mainCompanySlug },
          })
          .catch(() => null)
      : null;
    const [plans, records, intakes, invoiceLinks, dyehouseJobs] = await Promise.all([
      this.db().productionPlanLine.findMany({
        where: {
          mainCompanySlug,
          modelId,
          ...(dispatchNo
            ? { OR: [{ sourceDispatchNo: dispatchNo }, { orderNo: dispatchNo }] }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }],
      }),
      this.db().productionRecord.findMany({
        where: {
          mainCompanySlug,
          modelId,
          ...(dispatchNo ? { orderNo: dispatchNo } : {}),
        },
        orderBy: [{ productionDate: "asc" }, { createdAt: "asc" }],
      }),
      this.db().documentIntake.findMany({
        where: {
          mainCompanySlug,
          OR: [
            { modelId },
            { lines: { some: { modelId } } },
          ],
          ...(dispatchNo
            ? { OR: [{ dispatchNo }, { documentNo: dispatchNo }] }
            : {}),
        },
        orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
      }).catch(() => []),
      this.db().salesInvoiceLineModelLink.findMany({
        where: { mainCompanySlug, modelId },
        orderBy: [{ createdAt: "asc" }],
      }).catch(() => []),
      this.db().dyehouseModel.findMany({
        where: { mainCompanySlug },
        orderBy: [{ createdAt: "asc" }],
      }).catch(() => []),
    ]);

    const linkedDyehouse = dyehouseJobs.filter((job: any) => {
      const raw = jsonObject(job.raw);
      const workflow = jsonObject(raw.designWorkflow);
      return clean(raw.canonicalModelId || workflow.canonicalModelId) === modelId;
    });
    const events: any[] = [];
    const push = (date: unknown, type: string, title: string, detail: Input = {}) => {
      events.push({
        date: date ? new Date(date as any).toISOString() : "",
        type,
        title,
        detail,
      });
    };

    push(model.createdAt, "MODEL", "Tek merkez model açıldı", {
      modelId,
      modelName: model.modelName,
    });
    if (design) {
      push(design.createdAt, "DESEN", "Desen kaydı bağlandı", {
        designRecordId: design.id,
        status: design.status,
      });
    }
    for (const intake of intakes) {
      push(intake.issueDate || intake.createdAt, "ISNET", "Gelen irsaliye modele bağlandı", {
        intakeId: intake.id,
        dispatchNo: intake.dispatchNo || intake.documentNo,
      });
    }
    for (const job of linkedDyehouse) {
      push(job.createdAt, "BOYAHANE", "Boyahane işi oluşturuldu", {
        jobId: job.id,
        status: job.status,
      });
      if (job.completedAt) {
        push(job.completedAt, "BOYAHANE", "Boyahane işi tamamlandı", {
          jobId: job.id,
        });
      }
    }
    for (const plan of plans) {
      push(plan.createdAt, "URETIM_PLAN", "Üretim operasyonu planlandı", {
        planLineId: plan.id,
        dispatchNo: plan.sourceDispatchNo,
        printArea: plan.printArea,
        expectedQty: numberValue(plan.expectedQty),
      });
    }
    for (const record of records) {
      push(record.productionDate || record.createdAt, "URETIM", "Üretim kaydı girildi", {
        productionRecordId: record.id,
        printArea: record.printArea || jsonObject(record.raw).baskiBolgesi,
        quantity: numberValue(record.totalQuantity),
      });
    }
    for (const link of invoiceLinks) {
      push(link.createdAt, "MUHASEBE", "Fatura satırı modele bağlandı", {
        invoiceId: link.invoiceId,
        invoiceLineId: link.invoiceLineId,
        quantity: numberValue(link.matchedQuantity),
      });
    }
    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    return {
      model: {
        id: model.id,
        modelName: model.modelName,
        companyId: this.modelCompanyId(model),
      },
      dispatchNo,
      events,
      summary: {
        dispatchCount: intakes.length,
        dyehouseJobCount: linkedDyehouse.length,
        productionPlanCount: plans.length,
        productionRecordCount: records.length,
        invoiceLinkCount: invoiceLinks.length,
        invoicedQty: invoiceLinks.reduce(
          (sum: number, row: any) => sum + numberValue(row.matchedQuantity),
          0,
        ),
      },
    };
  }
}
