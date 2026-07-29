import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";
import { ModelService } from "./model.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

@Injectable()
export class CanonicalDispatchSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelFlow: CanonicalModelFlowService,
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

  private async syncDesignModels(mainCompanySlug: string) {
    const designRows = await this.db().designWorkflowModel.findMany({
      where: { mainCompanySlug },
      orderBy: [{ createdAt: "asc" }],
      take: 10000,
    });
    if (!designRows.length) return { scanned: 0, linked: 0 };

    const ids = designRows.map((row: any) => row.id);
    const [existingLinks, operations] = await Promise.all([
      this.db().designModelLink.findMany({
        where: { mainCompanySlug, designRecordId: { in: ids } },
      }),
      this.db().designModelOperation.findMany({
        where: { modelId: { in: ids } },
        orderBy: [{ sequence: "asc" }],
      }),
    ]);
    const linkedIds = new Set(
      existingLinks.map((row: any) => clean(row.designRecordId)),
    );
    const operationsByModel = new Map<string, any[]>();
    for (const operation of operations) {
      const list = operationsByModel.get(clean(operation.modelId)) || [];
      list.push(operation);
      operationsByModel.set(clean(operation.modelId), list);
    }

    let linked = 0;
    for (const design of designRows) {
      if (linkedIds.has(clean(design.id))) continue;
      const metadata =
        design.metadata && typeof design.metadata === "object"
          ? design.metadata
          : {};
      const printRegions = (operationsByModel.get(clean(design.id)) || [])
        .map((row: any) => clean(row.printAreaName || row.printAreaCode))
        .filter(Boolean);
      const canonical = await this.models.create({
        mainCompanySlug,
        modelName: design.modelName,
        modelCode: design.modelCode,
        companyId: design.companyId,
        firmaId: design.companyId,
        firmaAdi: clean((metadata as any).companyName),
        groundColor: design.groundColor,
        zeminRenk: design.groundColor,
        printRegions,
        sourceModule: "DESEN",
        sourceType: design.sourceType || "DESEN_WORKFLOW",
        sourceExternalId: design.id,
        imageUrl: clean(
          (metadata as any).imageUrl ||
            (metadata as any).thumbnail ||
            (metadata as any).previewUrl,
        ),
        canonicalModel: true,
      });
      await this.db().designModelLink.create({
        data: {
          mainCompanySlug,
          designRecordId: design.id,
          modelId: canonical.id,
          raw: { source: "DESEN_WORKFLOW_AUTO_SYNC" },
        },
      });
      await this.db().designWorkflowModel.update({
        where: { id: design.id },
        data: {
          metadata: {
            ...metadata,
            canonicalModelId: canonical.id,
            canonicalLinkedAt: new Date().toISOString(),
          },
        },
      });
      linkedIds.add(clean(design.id));
      linked += 1;
    }
    return { scanned: designRows.length, linked };
  }

  async listModels(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const designSync = await this.syncDesignModels(mainCompanySlug);
    const result = await this.models.list({
      mainCompanySlug,
      q: clean(input.q || input.search),
      pageSize: Math.min(5000, Number(input.limit || 5000)),
      customerOnly: input.customerOnly ?? false,
    });
    const rows = Array.isArray(result) ? result : result.rows || [];
    return {
      rows: rows.map((row: any) => ({
        ...row,
        id: row.id,
        modelId: row.id,
        modelName: row.modelName || row.modelAdi,
        modelAdi: row.modelAdi || row.modelName,
        printRegions:
          row.activePrintRegions || row.printRegions || row.baskiBolgeleri || [],
      })),
      total: rows.length,
      designSync,
    };
  }

  async linkIsnetFlow(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    await this.syncDesignModels(mainCompanySlug);
    const flowId = clean(input.flowId || input.id);
    if (!flowId) throw new BadRequestException("İşNet akış kimliği zorunludur.");
    const setting = await this.db().setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug,
          key: "AUTO_FLOWS",
        },
      },
    });
    const rows = Array.isArray(setting?.value?.rows) ? setting.value.rows : [];
    const flow = rows.find((row: any) => clean(row.id) === flowId);
    if (!flow) throw new NotFoundException("İşNet model akışı bulunamadı.");
    const modelId = clean(input.modelId || flow.modelId);
    if (!modelId) throw new BadRequestException("İşNet akışında model seçilmemiş.");
    return this.modelFlow.linkDispatch({
      mainCompanySlug,
      documentIntakeId: flow.incomingIntakeId,
      modelId,
    });
  }

  async syncLinkedIntakes(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const designSync = await this.syncDesignModels(mainCompanySlug);
    const intakes = await this.db().documentIntake.findMany({
      where: {
        mainCompanySlug,
        documentKind: "CUSTOMER_DISPATCH",
        OR: [
          { modelId: { not: null } },
          { lines: { some: { modelId: { not: null } } } },
        ],
      },
      include: { lines: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: Math.min(2000, Number(input.limit || 1000)),
    });
    const success: any[] = [];
    const failed: any[] = [];
    for (const intake of intakes) {
      const byModel = new Map<string, string[]>();
      for (const line of intake.lines || []) {
        const modelId = clean(line.modelId || intake.modelId);
        if (!modelId) continue;
        const idsForModel = byModel.get(modelId) || [];
        idsForModel.push(line.id);
        byModel.set(modelId, idsForModel);
      }
      if (!byModel.size && clean(intake.modelId)) {
        byModel.set(
          clean(intake.modelId),
          (intake.lines || []).map((line: any) => line.id),
        );
      }
      for (const [modelId, lineIds] of byModel.entries()) {
        try {
          const linked = await this.modelFlow.linkDispatch({
            mainCompanySlug,
            documentIntakeId: intake.id,
            modelId,
            lineIds,
          });
          success.push(linked);
        } catch (error: any) {
          failed.push({
            intakeId: intake.id,
            dispatchNo: intake.dispatchNo || intake.documentNo,
            modelId,
            error: clean(error?.message || error),
          });
        }
      }
    }
    return {
      designSync,
      scannedIntakes: intakes.length,
      linkedPlans: success.length,
      failedCount: failed.length,
      success,
      failed,
    };
  }
}
