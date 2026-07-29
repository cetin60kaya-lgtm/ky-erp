import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ModelService } from "./model.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

  private dispatchNoOf(intake: any) {
    return clean(intake?.dispatchNo || intake?.documentNo || intake?.invoiceNo || intake?.id);
  }

  private productionValues(row: any) {
    const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
    const printDefect = numberValue(
      raw.baskiHatasiAdet ?? raw.printDefectQty ?? row?.printDefect,
    );
    const fabricDefect = numberValue(
      raw.kumasHatasiAdet ?? raw.fabricDefectQty ?? row?.fabricDefect,
    );
    const explicitWaste = numberValue(raw.hataliAdet ?? raw.wasteQty);
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
      printArea: clean(row?.printArea || raw.baskiBolgesi || raw.grup || "GENEL") || "GENEL",
      dispatchNo: clean(row?.orderNo || raw.musteriIrsaliyeNo || raw.irsaliyeNo),
    };
  }

  private regionNames(model: any) {
    const source = model?.activePrintRegions || model?.printRegions || model?.baskiBolgeleri || [];
    const rows = Array.isArray(source) ? source : [source];
    const names = rows
      .map((row: any) => clean(typeof row === "string" ? row : row?.regionName || row?.name))
      .filter(Boolean);
    return Array.from(new Set(names.length ? names : ["Ön"]));
  }

  private calculateRow(input: Input) {
    const expectedQty = numberValue(input.expectedQty);
    const requiredRegions = Array.isArray(input.requiredRegions) && input.requiredRegions.length
      ? input.requiredRegions.map(clean).filter(Boolean)
      : Array.from(input.regionTotals?.keys?.() || []);
    const regionTotals: Map<string, number> = input.regionTotals || new Map();
    const operationRows = requiredRegions.map((region: string) => ({
      region,
      producedQty: numberValue(regionTotals.get(region)),
      missingQty: Math.max(0, expectedQty - numberValue(regionTotals.get(region))),
    }));
    const observed = operationRows.length
      ? operationRows.map((row: any) => row.producedQty)
      : Array.from(regionTotals.values()).map(numberValue);
    const completedGrossQty = observed.length ? Math.min(...observed) : 0;
    const missingRegions = operationRows.filter((row: any) => row.producedQty <= 0).map((row: any) => row.region);
    const remainingQty = Math.max(0, expectedQty - completedGrossQty);
    const overQty = Math.max(0, completedGrossQty - expectedQty);
    const printDefectQty = numberValue(input.printDefectQty);
    const fabricDefectQty = numberValue(input.fabricDefectQty);
    const wasteQty = Math.max(numberValue(input.wasteQty), printDefectQty + fabricDefectQty);
    const netGoodQty = Math.max(0, completedGrossQty - wasteQty);
    let status = "DENGELİ";
    if (!(expectedQty > 0)) status = "İRSALİYE YOK";
    else if (!completedGrossQty) status = missingRegions.length ? "EKSİK BÖLGE" : "BEKLİYOR";
    else if (missingRegions.length) status = "EKSİK BÖLGE";
    else if (remainingQty > 0) status = "EKSİK";
    else if (overQty > 0) status = "FAZLA";
    else if (wasteQty > 0) status = "SAKATLI TAMAM";
    return {
      ...input,
      requiredRegions,
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
    return { model, canonicalModelId: model.id, existing: false };
  }

  async linkDispatch(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const modelId = clean(input.modelId || input.canonicalModelId);
    if (!modelId) throw new BadRequestException("Bağlanacak model zorunludur.");
    const model = await this.models.getById(modelId, mainCompanySlug);
    const documentKey = clean(
      input.documentIntakeId || input.intakeId || input.dispatchNo || input.documentNo,
    );
    if (!documentKey) throw new BadRequestException("Gelen irsaliye kimliği zorunludur.");
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
    if (!intake) throw new NotFoundException("Gelen irsaliye kaydı bulunamadı.");
    const selectedLineIds = Array.isArray(input.lineIds)
      ? input.lineIds.map(clean).filter(Boolean)
      : [];
    const lines = (intake.lines || []).filter(
      (line: any) => !selectedLineIds.length || selectedLineIds.includes(String(line.id)),
    );
    if (!lines.length) throw new BadRequestException("Bağlanacak irsaliye kalemi bulunamadı.");
    const dispatchNo = this.dispatchNoOf(intake);
    const expectedQty = numberValue(input.expectedQty) || lines.reduce(
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
        data: { modelId, matchStatus: "MATCHED", matchConfidence: 100 },
      });
      for (const printArea of this.regionNames(model)) {
        const current = await tx.productionPlanLine.findFirst({
          where: { mainCompanySlug, modelId, sourceDispatchNo: dispatchNo, printArea },
        });
        const data = {
          mainCompanySlug,
          mainCompanyId: intake.mainCompanyId || null,
          modelId,
          companyId: intake.firmId || null,
          orderNo: lines.find((line: any) => clean(line.orderNo))?.orderNo || dispatchNo,
          sourceDispatchNo: dispatchNo,
          printArea,
          expectedQty,
          status: "WAITING",
        };
        if (current) {
          await tx.productionPlanLine.update({
            where: { id: current.id },
            data: { ...data, expectedQty },
          });
        } else {
          await tx.productionPlanLine.create({ data });
        }
      }
    });
    await this.refreshPlanTotals({ mainCompanySlug, modelId, dispatchNo });
    return {
      intakeId: intake.id,
      dispatchNo,
      expectedQty,
      model,
      canonicalModelId: modelId,
      linkedLineCount: lines.length,
      printAreas: this.regionNames(model),
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
    const byRegion = new Map<string, { gross: number; waste: number }>();
    for (const record of records) {
      const values = this.productionValues(record);
      const current = byRegion.get(values.printArea) || { gross: 0, waste: 0 };
      current.gross += values.gross;
      current.waste += values.waste;
      byRegion.set(values.printArea, current);
    }
    for (const plan of plans) {
      const values = byRegion.get(clean(plan.printArea)) || { gross: 0, waste: 0 };
      const expected = numberValue(plan.expectedQty);
      const status = values.gross >= expected && expected > 0
        ? "COMPLETED"
        : values.gross > 0
          ? "PARTIAL"
          : "WAITING";
      await this.db().productionPlanLine.update({
        where: { id: plan.id },
        data: { producedQty: values.gross, wasteQty: values.waste, status },
      });
    }
    return { updated: plans.length };
  }

  async reconciliation(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const whereIntake: any = {
      mainCompanySlug,
      documentKind: "CUSTOMER_DISPATCH",
    };
    if (clean(input.startDate)) whereIntake.issueDate = { gte: new Date(clean(input.startDate)) };
    if (clean(input.endDate)) {
      whereIntake.issueDate = {
        ...(whereIntake.issueDate || {}),
        lte: new Date(`${clean(input.endDate)}T23:59:59.999Z`),
      };
    }
    const intakes = await this.db().documentIntake.findMany({
      where: whereIntake,
      include: { lines: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    const modelIds = Array.from(new Set(
      intakes.flatMap((intake: any) => (intake.lines || []).map((line: any) => clean(line.modelId || intake.modelId))).filter(Boolean),
    ));
    const [records, modelRows] = await Promise.all([
      this.db().productionRecord.findMany({
        where: { mainCompanySlug, ...(modelIds.length ? { modelId: { in: modelIds } } : {}) },
        orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
        take: 10000,
      }),
      this.db().modelRecord.findMany({
        where: { mainCompanySlug, ...(modelIds.length ? { id: { in: modelIds } } : {}) },
      }),
    ]);
    const modelMap = new Map(modelRows.map((row: any) => [String(row.id), row]));
    const groups = new Map<string, any>();
    const ensure = (modelId: string, dispatchNo: string) => {
      const key = `${modelId}|${dispatchNo}`;
      if (!groups.has(key)) {
        const model = modelMap.get(modelId);
        const raw = model?.raw && typeof model.raw === "object" ? model.raw : {};
        groups.set(key, {
          key,
          modelId,
          modelName: clean(model?.modelName),
          companyId: clean(raw.companyId || raw.firmaId),
          companyName: clean(raw.firmaAdi || raw.companyName || raw.musteriFirma),
          dispatchNo,
          issueDate: "",
          expectedQty: 0,
          requiredRegions: this.regionNames({ ...raw, ...model }),
          regionTotals: new Map<string, number>(),
          printDefectQty: 0,
          fabricDefectQty: 0,
          wasteQty: 0,
          productionRecordCount: 0,
        });
      }
      return groups.get(key);
    };
    for (const intake of intakes) {
      const dispatchNo = this.dispatchNoOf(intake);
      for (const line of intake.lines || []) {
        const modelId = clean(line.modelId || intake.modelId);
        if (!modelId) continue;
        const group = ensure(modelId, dispatchNo);
        group.modelName = group.modelName || clean(line.modelGuess || intake.modelGuess);
        group.companyId = group.companyId || clean(intake.firmId);
        group.companyName = group.companyName || clean(intake.issuerName);
        group.issueDate = intake.issueDate || group.issueDate;
        group.expectedQty += numberValue(line.quantity);
      }
    }
    for (const record of records) {
      const modelId = clean(record.modelId);
      const values = this.productionValues(record);
      if (!modelId || !values.dispatchNo) continue;
      const group = ensure(modelId, values.dispatchNo);
      group.modelName = group.modelName || clean(record.modelName);
      group.regionTotals.set(
        values.printArea,
        numberValue(group.regionTotals.get(values.printArea)) + values.gross,
      );
      group.printDefectQty += values.printDefect;
      group.fabricDefectQty += values.fabricDefect;
      group.wasteQty += values.waste;
      group.productionRecordCount += 1;
    }
    let rows = Array.from(groups.values()).map((group: any) => this.calculateRow(group));
    const q = clean(input.q || input.search).toLocaleLowerCase("tr-TR");
    if (q) rows = rows.filter((row: any) => `${row.modelName} ${row.companyName} ${row.dispatchNo} ${row.status}`.toLocaleLowerCase("tr-TR").includes(q));
    if (clean(input.status)) rows = rows.filter((row: any) => row.status === clean(input.status));
    rows.sort((a: any, b: any) => String(b.issueDate || "").localeCompare(String(a.issueDate || "")));
    return {
      rows,
      summary: {
        totalDispatchQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.expectedQty), 0),
        completedGrossQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.completedGrossQty), 0),
        netGoodQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.netGoodQty), 0),
        printDefectQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.printDefectQty), 0),
        fabricDefectQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.fabricDefectQty), 0),
        remainingQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.remainingQty), 0),
        overQty: rows.reduce((sum: number, row: any) => sum + numberValue(row.overQty), 0),
        controlRequired: rows.filter((row: any) => !["DENGELİ", "SAKATLI TAMAM"].includes(row.status)).length,
      },
    };
  }
}
