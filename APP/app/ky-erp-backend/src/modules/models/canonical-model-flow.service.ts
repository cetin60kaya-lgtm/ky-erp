import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ModelService } from "./model.service";

type Input = Record<string, any>;

type RegionTotal = {
  gross: number;
  printDefect: number;
  fabricDefect: number;
  waste: number;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKey(value: unknown) {
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
    .trim();
}

@Injectable()
export class CanonicalModelFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ModelService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.mainCompanyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private rawOf(row: any) {
    return row?.raw && typeof row.raw === "object" ? row.raw : {};
  }

  private dispatchNoOf(intake: any) {
    return clean(
      intake?.dispatchNo || intake?.documentNo || intake?.invoiceNo || intake?.id,
    );
  }

  private regionNames(model: any) {
    const raw = this.rawOf(model);
    const source =
      model?.activePrintRegions ||
      model?.printRegions ||
      model?.baskiBolgeleri ||
      raw?.activePrintRegions ||
      raw?.printRegions ||
      raw?.baskiBolgeleri ||
      model?.baskiBolgesi ||
      raw?.baskiBolgesi ||
      "Ön";
    const rows = Array.isArray(source)
      ? source
      : String(source || "")
          .split(/[,;+|]/)
          .map((item) => item.trim())
          .filter(Boolean);
    const names = rows
      .map((row: any) =>
        clean(
          typeof row === "string"
            ? row
            : row?.regionName || row?.name || row?.label || row?.printArea,
        ),
      )
      .filter(Boolean);
    return Array.from(new Set(names.length ? names : ["Ön"]));
  }

  private productionValues(row: any) {
    const raw = this.rawOf(row);
    const printDefect = numberValue(
      raw.baskiHatasiAdet ?? raw.printDefectQty ?? row?.printDefect,
    );
    const fabricDefect = numberValue(
      raw.kumasHatasiAdet ?? raw.fabricDefectQty ?? row?.fabricDefect,
    );
    const explicitWaste = numberValue(
      raw.hataliAdet ?? raw.wasteQty ?? raw.fireAdedi,
    );
    const waste = Math.max(explicitWaste, printDefect + fabricDefect);
    let gross = numberValue(
      raw.grossProducedQty ?? raw.uretimAdedi ?? raw.producedQty,
    );
    if (!(gross > 0)) gross = numberValue(row?.totalQuantity) + waste;
    return {
      gross,
      printDefect,
      fabricDefect,
      waste,
      net: Math.max(0, gross - waste),
      printArea:
        clean(row?.printArea || raw.baskiBolgesi || raw.grup || "GENEL") ||
        "GENEL",
      dispatchNo: clean(
        row?.orderNo || raw.musteriIrsaliyeNo || raw.irsaliyeNo,
      ),
    };
  }

  private calculateRow(input: Input) {
    const expectedQty = numberValue(input.expectedQty);
    const requiredRegions = Array.isArray(input.requiredRegions)
      ? Array.from(new Set(input.requiredRegions.map(clean).filter(Boolean)))
      : [];
    const regionTotals: Map<string, RegionTotal> =
      input.regionTotals || new Map<string, RegionTotal>();
    const regions = requiredRegions.length
      ? requiredRegions
      : Array.from(regionTotals.keys());
    const operationRows = regions.map((region) => {
      const total = regionTotals.get(region) || {
        gross: 0,
        printDefect: 0,
        fabricDefect: 0,
        waste: 0,
      };
      return {
        region,
        producedQty: numberValue(total.gross),
        missingQty: Math.max(0, expectedQty - numberValue(total.gross)),
        printDefectQty: numberValue(total.printDefect),
        fabricDefectQty: numberValue(total.fabricDefect),
      };
    });
    const observed = operationRows.map((row) => row.producedQty);
    const completedGrossQty = observed.length ? Math.min(...observed) : 0;
    const missingRegions = operationRows
      .filter((row) => row.producedQty <= 0)
      .map((row) => row.region);
    const remainingQty = Math.max(0, expectedQty - completedGrossQty);
    const overQty = Math.max(0, completedGrossQty - expectedQty);
    const printDefectQty = numberValue(input.printDefectQty);
    const fabricDefectQty = numberValue(input.fabricDefectQty);
    const wasteQty = Math.max(
      numberValue(input.wasteQty),
      printDefectQty + fabricDefectQty,
    );
    const netGoodQty = Math.max(0, completedGrossQty - wasteQty);
    let status = "DENGELİ";
    if (!(expectedQty > 0)) status = "İRSALİYE YOK";
    else if (!completedGrossQty)
      status = missingRegions.length ? "EKSİK BÖLGE" : "BEKLİYOR";
    else if (missingRegions.length) status = "EKSİK BÖLGE";
    else if (remainingQty > 0) status = "EKSİK";
    else if (overQty > 0) status = "FAZLA";
    else if (wasteQty > 0) status = "SAKATLI TAMAM";
    return {
      ...input,
      regionTotals: undefined,
      requiredRegions: regions,
      operationRows,
      completedGrossQty,
      printDefectQty,
      fabricDefectQty,
      wasteQty,
      netGoodQty,
      remainingQty,
      overQty,
      differenceQty: completedGrossQty - expectedQty,
      missingRegions,
      status,
    };
  }

  private async ensureDesignWorkflowModel(
    mainCompanySlug: string,
    model: any,
    input: Input = {},
  ) {
    let link = await this.db().designModelLink.findFirst({
      where: { mainCompanySlug, modelId: model.id },
    });
    if (link) {
      const existing = await this.db().designWorkflowModel.findFirst({
        where: { id: link.designRecordId, mainCompanySlug },
      });
      if (existing) return existing;
    }
    let designModel = await this.db().designWorkflowModel.findFirst({
      where: {
        mainCompanySlug,
        sourceType: "CANONICAL_MODEL",
        sourceExternalId: model.id,
      },
    });
    const raw = this.rawOf(model);
    if (!designModel) {
      designModel = await this.db().designWorkflowModel.create({
        data: {
          mainCompanySlug,
          companyId:
            clean(model.firmaId || model.companyId || raw.firmaId || raw.companyId) ||
            null,
          modelCode: clean(model.modelCode || model.modelKodu || model.modelName),
          modelName: clean(model.modelName || model.modelAdi),
          designName: clean(input.designName) || null,
          groundColor:
            clean(model.zeminRenk || model.groundColor || raw.zeminRenk) || null,
          sourceType: "CANONICAL_MODEL",
          sourceExternalId: model.id,
          status: "NEW_ARRIVAL",
          metadata: {
            canonicalModelId: model.id,
            openedFrom: clean(input.sourceModule) || "DESEN",
          },
        },
      });
      const regions = this.regionNames(model);
      for (let index = 0; index < regions.length; index += 1) {
        await this.db().designModelOperation.create({
          data: {
            modelId: designModel.id,
            printAreaCode: `AREA_${index + 1}`,
            printAreaName: regions[index],
            sequence: index + 1,
            placementStatus: "WAITING",
            dyehouseStatus: "WAITING",
            productionReady: false,
          },
        });
      }
    }
    if (!link) {
      link = await this.db().designModelLink.create({
        data: {
          mainCompanySlug,
          designRecordId: designModel.id,
          modelId: model.id,
          raw: { source: clean(input.sourceModule) || "DESEN" },
        },
      });
    }
    return designModel;
  }

  private async upsertPlanLines(input: {
    mainCompanySlug: string;
    mainCompanyId?: string | null;
    modelId: string;
    companyId?: string | null;
    orderNo: string;
    dispatchNo: string;
    expectedQty: number;
    regions: string[];
  }) {
    const saved: any[] = [];
    for (const printArea of input.regions) {
      const current = await this.db().productionPlanLine.findFirst({
        where: {
          mainCompanySlug: input.mainCompanySlug,
          modelId: input.modelId,
          sourceDispatchNo: input.dispatchNo,
          printArea,
        },
      });
      const data = {
        mainCompanySlug: input.mainCompanySlug,
        mainCompanyId: input.mainCompanyId || null,
        modelId: input.modelId,
        companyId: input.companyId || null,
        orderNo: input.orderNo || input.dispatchNo,
        sourceDispatchNo: input.dispatchNo,
        printArea,
        expectedQty: input.expectedQty,
        status: "WAITING",
      };
      saved.push(
        current
          ? await this.db().productionPlanLine.update({
              where: { id: current.id },
              data,
            })
          : await this.db().productionPlanLine.create({ data }),
      );
    }
    return saved;
  }

  async quickCreate(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelName = clean(input.modelName || input.modelAdi || input.name);
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");
    const model = await this.models.create({
      ...input,
      mainCompanySlug,
      modelName,
      sourceModule: clean(input.sourceModule) || "DESEN",
      sourceType: clean(input.sourceType) || "QUICK_CREATE",
      canonicalModel: true,
    });
    const designModel = await this.ensureDesignWorkflowModel(
      mainCompanySlug,
      model,
      input,
    );
    const expectedQty = numberValue(
      input.expectedQty || input.beklenenAdet || input.gelenAdet,
    );
    let planLines: any[] = [];
    if (expectedQty > 0) {
      const dispatchNo =
        clean(input.dispatchNo || input.irsaliyeNo || input.siparisNo) ||
        `MANUEL-${model.id}`;
      planLines = await this.upsertPlanLines({
        mainCompanySlug,
        mainCompanyId: clean(input.mainCompanyId) || null,
        modelId: model.id,
        companyId:
          clean(input.companyId || input.firmaId || model.firmaId) || null,
        orderNo: clean(input.orderNo || input.siparisNo) || dispatchNo,
        dispatchNo,
        expectedQty,
        regions: this.regionNames(model),
      });
    }
    return {
      model,
      canonicalModelId: model.id,
      designWorkflowModelId: designModel.id,
      planLines,
      existing: false,
    };
  }

  async linkDispatch(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelId = clean(input.modelId || input.canonicalModelId);
    if (!modelId) throw new BadRequestException("Bağlanacak model zorunludur.");
    const model = await this.models.getById(modelId, mainCompanySlug);
    await this.ensureDesignWorkflowModel(mainCompanySlug, model, {
      sourceModule: "ISNET",
    });
    const documentKey = clean(
      input.documentIntakeId ||
        input.intakeId ||
        input.dispatchNo ||
        input.documentNo,
    );
    if (!documentKey)
      throw new BadRequestException("Gelen irsaliye kimliği zorunludur.");
    const intake = await this.db().documentIntake.findFirst({
      where: {
        mainCompanySlug,
        OR: [
          { id: documentKey },
          { dispatchNo: documentKey },
          { documentNo: documentKey },
        ],
      },
      include: { lines: true },
    });
    if (!intake)
      throw new NotFoundException("Gelen irsaliye kaydı bulunamadı.");
    const selectedLineIds = Array.isArray(input.lineIds)
      ? input.lineIds.map(clean).filter(Boolean)
      : [];
    const lines = (intake.lines || []).filter(
      (line: any) =>
        !selectedLineIds.length || selectedLineIds.includes(String(line.id)),
    );
    if (!lines.length)
      throw new BadRequestException("Bağlanacak irsaliye kalemi bulunamadı.");
    const dispatchNo = this.dispatchNoOf(intake);
    const expectedQty =
      numberValue(input.expectedQty) ||
      lines.reduce(
        (sum: number, line: any) => sum + numberValue(line.quantity),
        0,
      );
    await this.db().$transaction(async (tx: any) => {
      await tx.documentIntake.update({
        where: { id: intake.id },
        data: { modelId, modelGuess: model.modelName },
      });
      await tx.documentIntakeLine.updateMany({
        where: { id: { in: lines.map((line: any) => line.id) } },
        data: {
          modelId,
          matchStatus: "MATCHED",
          matchConfidence: 100,
        },
      });
    });
    const regions = this.regionNames(model);
    const planLines = await this.upsertPlanLines({
      mainCompanySlug,
      mainCompanyId: intake.mainCompanyId || null,
      modelId,
      companyId: intake.firmId || null,
      orderNo:
        lines.find((line: any) => clean(line.orderNo))?.orderNo || dispatchNo,
      dispatchNo,
      expectedQty,
      regions,
    });
    await this.refreshPlanTotals({ mainCompanySlug, modelId, dispatchNo });
    return {
      intakeId: intake.id,
      dispatchNo,
      expectedQty,
      model,
      canonicalModelId: modelId,
      linkedLineCount: lines.length,
      printAreas: regions,
      planLines,
    };
  }

  async refreshPlanTotals(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelId = clean(input.modelId);
    const dispatchNo = clean(input.dispatchNo || input.orderNo);
    if (!modelId || !dispatchNo) return { updated: 0 };
    const [records, plans] = await Promise.all([
      this.db().productionRecord.findMany({
        where: { mainCompanySlug, modelId, orderNo: dispatchNo },
      }),
      this.db().productionPlanLine.findMany({
        where: { mainCompanySlug, modelId, sourceDispatchNo: dispatchNo },
      }),
    ]);
    const byRegion = new Map<string, RegionTotal>();
    for (const record of records) {
      const values = this.productionValues(record);
      const current = byRegion.get(values.printArea) || {
        gross: 0,
        printDefect: 0,
        fabricDefect: 0,
        waste: 0,
      };
      current.gross += values.gross;
      current.printDefect += values.printDefect;
      current.fabricDefect += values.fabricDefect;
      current.waste += values.waste;
      byRegion.set(values.printArea, current);
    }
    for (const plan of plans) {
      const values = byRegion.get(clean(plan.printArea)) || {
        gross: 0,
        printDefect: 0,
        fabricDefect: 0,
        waste: 0,
      };
      const expected = numberValue(plan.expectedQty);
      const status =
        values.gross >= expected && expected > 0
          ? "COMPLETED"
          : values.gross > 0
            ? "PARTIAL"
            : "WAITING";
      await this.db().productionPlanLine.update({
        where: { id: plan.id },
        data: {
          producedQty: values.gross,
          wasteQty: values.waste,
          status,
        },
      });
    }
    return { updated: plans.length };
  }

  async reconciliation(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const [plans, records, modelRows] = await Promise.all([
      this.db().productionPlanLine.findMany({
        where: { mainCompanySlug },
        orderBy: [{ updatedAt: "desc" }],
        take: 10000,
      }),
      this.db().productionRecord.findMany({
        where: { mainCompanySlug },
        orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
        take: 20000,
      }),
      this.db().modelRecord.findMany({
        where: { mainCompanySlug, NOT: { status: "ARCHIVED" } },
        take: 10000,
      }),
    ]);
    const modelMap = new Map(
      modelRows.map((row: any) => [String(row.id), row]),
    );
    const groups = new Map<string, any>();
    const ensure = (modelId: string, dispatchNo: string) => {
      const key = `${modelId}|${dispatchNo}`;
      if (!groups.has(key)) {
        const model = modelMap.get(modelId);
        const raw = this.rawOf(model);
        groups.set(key, {
          key,
          modelId,
          modelName: clean(model?.modelName),
          companyId: clean(raw.companyId || raw.firmaId),
          companyName: clean(
            raw.firmaAdi || raw.companyName || raw.musteriFirma,
          ),
          dispatchNo,
          orderNo: "",
          issueDate: "",
          expectedQty: 0,
          requiredRegions: [] as string[],
          regionTotals: new Map<string, RegionTotal>(),
          printDefectQty: 0,
          fabricDefectQty: 0,
          wasteQty: 0,
          productionRecordCount: 0,
        });
      }
      return groups.get(key);
    };
    for (const plan of plans) {
      const modelId = clean(plan.modelId);
      const dispatchNo = clean(plan.sourceDispatchNo || plan.orderNo);
      if (!modelId || !dispatchNo) continue;
      const group = ensure(modelId, dispatchNo);
      group.expectedQty = Math.max(
        numberValue(group.expectedQty),
        numberValue(plan.expectedQty),
      );
      group.orderNo = group.orderNo || clean(plan.orderNo);
      group.companyId = group.companyId || clean(plan.companyId);
      if (!group.requiredRegions.includes(clean(plan.printArea))) {
        group.requiredRegions.push(clean(plan.printArea));
      }
    }
    for (const record of records) {
      const modelId = clean(record.modelId);
      const values = this.productionValues(record);
      if (!modelId || !values.dispatchNo) continue;
      const group = ensure(modelId, values.dispatchNo);
      group.modelName = group.modelName || clean(record.modelName);
      if (!group.requiredRegions.length) {
        group.requiredRegions = this.regionNames(modelMap.get(modelId));
      }
      const current = group.regionTotals.get(values.printArea) || {
        gross: 0,
        printDefect: 0,
        fabricDefect: 0,
        waste: 0,
      };
      current.gross += values.gross;
      current.printDefect += values.printDefect;
      current.fabricDefect += values.fabricDefect;
      current.waste += values.waste;
      group.regionTotals.set(values.printArea, current);
      group.printDefectQty += values.printDefect;
      group.fabricDefectQty += values.fabricDefect;
      group.wasteQty += values.waste;
      group.productionRecordCount += 1;
      group.issueDate = group.issueDate || record.productionDate;
    }
    let rows = Array.from(groups.values()).map((group: any) =>
      this.calculateRow(group),
    );
    const q = normalizeKey(input.q || input.search);
    if (q) {
      rows = rows.filter((row: any) =>
        normalizeKey(
          `${row.modelName} ${row.companyName} ${row.dispatchNo} ${row.orderNo} ${row.status}`,
        ).includes(q),
      );
    }
    if (clean(input.status)) {
      rows = rows.filter((row: any) => row.status === clean(input.status));
    }
    rows.sort((a: any, b: any) =>
      String(b.issueDate || "").localeCompare(String(a.issueDate || "")),
    );
    return {
      rows,
      summary: {
        totalDispatchQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.expectedQty),
          0,
        ),
        completedGrossQty: rows.reduce(
          (sum: number, row: any) =>
            sum + numberValue(row.completedGrossQty),
          0,
        ),
        netGoodQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.netGoodQty),
          0,
        ),
        printDefectQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.printDefectQty),
          0,
        ),
        fabricDefectQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.fabricDefectQty),
          0,
        ),
        remainingQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.remainingQty),
          0,
        ),
        overQty: rows.reduce(
          (sum: number, row: any) => sum + numberValue(row.overQty),
          0,
        ),
        controlRequired: rows.filter(
          (row: any) => !["DENGELİ", "SAKATLI TAMAM"].includes(row.status),
        ).length,
      },
    };
  }
}
