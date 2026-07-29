import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";
import { ModelService } from "./model.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function jsonObject(value: unknown): Input {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : {};
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

  private async syncDyehouseLinks(
    mainCompanySlug: string,
    links: Array<{ designRecordId: string; modelId: string }> = [],
  ) {
    if (!links.length) return { scanned: 0, linked: 0 };
    const designIds = links.map((row) => clean(row.designRecordId)).filter(Boolean);
    const byDesign = new Map(
      links.map((row) => [clean(row.designRecordId), clean(row.modelId)]),
    );
    const jobs = await this.db().dyehouseModel.findMany({
      where: { mainCompanySlug },
      orderBy: [{ updatedAt: "desc" }],
      take: 10000,
    });
    let linked = 0;
    for (const job of jobs) {
      const raw = jsonObject(job.raw);
      const workflow = jsonObject(raw.designWorkflow);
      const designRecordId = clean(
        job.designId || workflow.modelId || raw.designRecordId,
      );
      if (!designRecordId || !designIds.includes(designRecordId)) continue;
      const canonicalModelId = clean(byDesign.get(designRecordId));
      if (!canonicalModelId) continue;
      if (clean(raw.canonicalModelId) === canonicalModelId) continue;
      await this.db().dyehouseModel.update({
        where: { id: job.id },
        data: {
          raw: {
            ...raw,
            canonicalModelId,
            designRecordId,
            canonicalLinkedAt: new Date().toISOString(),
            designWorkflow: {
              ...workflow,
              canonicalModelId,
            },
          },
        },
      });
      linked += 1;
    }
    return { scanned: jobs.length, linked };
  }

  private async syncDesignModels(mainCompanySlug: string) {
    const designRows = await this.db().designWorkflowModel.findMany({
      where: { mainCompanySlug, isActive: true },
      orderBy: [{ createdAt: "asc" }],
      take: 10000,
    });
    if (!designRows.length) {
      return {
        scanned: 0,
        linked: 0,
        existing: 0,
        dyehouse: { scanned: 0, linked: 0 },
      };
    }

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
    const linkByDesign = new Map(
      existingLinks.map((row: any) => [
        clean(row.designRecordId),
        clean(row.modelId),
      ]),
    );
    const operationsByModel = new Map<string, any[]>();
    for (const operation of operations) {
      const list = operationsByModel.get(clean(operation.modelId)) || [];
      list.push(operation);
      operationsByModel.set(clean(operation.modelId), list);
    }

    let linked = 0;
    const allLinks: Array<{ designRecordId: string; modelId: string }> = [];
    for (const design of designRows) {
      const currentModelId = clean(linkByDesign.get(clean(design.id)));
      if (currentModelId) {
        allLinks.push({ designRecordId: design.id, modelId: currentModelId });
        const metadata = jsonObject(design.metadata);
        if (clean(metadata.canonicalModelId) !== currentModelId) {
          await this.db().designWorkflowModel.update({
            where: { id: design.id },
            data: {
              metadata: {
                ...metadata,
                canonicalModelId: currentModelId,
                canonicalLinkedAt:
                  metadata.canonicalLinkedAt || new Date().toISOString(),
              },
            },
          });
        }
        continue;
      }

      const metadata = jsonObject(design.metadata);
      const printRegions = (operationsByModel.get(clean(design.id)) || [])
        .map((row: any) => clean(row.printAreaName || row.printAreaCode))
        .filter(Boolean);
      const canonical = await this.models.create({
        mainCompanySlug,
        modelName: design.modelName,
        modelCode: design.modelCode,
        companyId: design.companyId,
        firmaId: design.companyId,
        firmaAdi: clean(metadata.companyName),
        groundColor: design.groundColor,
        zeminRenk: design.groundColor,
        printRegions,
        sourceModule: "DESEN",
        sourceType: design.sourceType || "DESEN_WORKFLOW",
        sourceExternalId: design.id,
        imageUrl: clean(
          metadata.imageUrl || metadata.thumbnail || metadata.previewUrl,
        ),
        canonicalModel: true,
      });
      if (!canonical?.id) {
        throw new BadRequestException(
          `${clean(design.modelName) || design.id} için tek merkez model oluşturulamadı.`,
        );
      }
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
      linkByDesign.set(clean(design.id), clean(canonical.id));
      allLinks.push({ designRecordId: design.id, modelId: canonical.id });
      linked += 1;
    }

    const dyehouse = await this.syncDyehouseLinks(mainCompanySlug, allLinks);
    return {
      scanned: designRows.length,
      linked,
      existing: designRows.length - linked,
      dyehouse,
    };
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
    const sourceRows = Array.isArray(result) ? result : result.rows || [];
    const rows = sourceRows.filter(
      (row: any) =>
        !row?.isFromDesenStorage &&
        !clean(row?.id).startsWith("desen-") &&
        clean(row?.id) &&
        clean(row?.modelName || row?.modelAdi),
    );
    const modelIds = rows.map((row: any) => clean(row.id)).filter(Boolean);
    const [openPlans, dyehouseJobs] = await Promise.all([
      modelIds.length
        ? this.db().productionPlanLine.findMany({
            where: {
              mainCompanySlug,
              modelId: { in: modelIds },
              NOT: { status: "COMPLETED" },
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 10000,
          })
        : [],
      this.db().dyehouseModel.findMany({
        where: { mainCompanySlug },
        orderBy: [{ updatedAt: "desc" }],
        take: 10000,
      }),
    ]);
    const openPlanByModel = new Map<string, any>();
    for (const plan of openPlans) {
      const modelId = clean(plan.modelId);
      if (modelId && !openPlanByModel.has(modelId)) {
        openPlanByModel.set(modelId, plan);
      }
    }
    const dyehouseByModel = new Map<string, any>();
    for (const job of dyehouseJobs) {
      const raw = jsonObject(job.raw);
      const modelId = clean(
        raw.canonicalModelId || jsonObject(raw.designWorkflow).canonicalModelId,
      );
      if (modelId && !dyehouseByModel.has(modelId)) {
        dyehouseByModel.set(modelId, job);
      }
    }
    return {
      rows: rows.map((row: any) => {
        const modelId = clean(row.id);
        const openPlan = openPlanByModel.get(modelId);
        const dyehouseJob = dyehouseByModel.get(modelId);
        return {
          ...row,
          id: row.id,
          modelId: row.id,
          canonicalModelId: row.id,
          modelName: row.modelName || row.modelAdi,
          modelAdi: row.modelAdi || row.modelName,
          printRegions:
            row.activePrintRegions || row.printRegions || row.baskiBolgeleri || [],
          defaultDispatchNo:
            clean(openPlan?.sourceDispatchNo || openPlan?.orderNo) || "",
          defaultOrderNo: clean(openPlan?.orderNo) || "",
          defaultPrintArea: clean(openPlan?.printArea) || "",
          openExpectedQty: Number(openPlan?.expectedQty || 0),
          openProducedQty: Number(openPlan?.producedQty || 0),
          dyehouseStatus: clean(dyehouseJob?.status),
          dyehouseJobId: clean(dyehouseJob?.id),
        };
      }),
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
    const linked = await this.modelFlow.linkDispatch({
      mainCompanySlug,
      mainCompanyId: input.mainCompanyId,
      documentIntakeId: flow.incomingIntakeId,
      modelId,
      expectedQty: flow.quantity,
    });
    return {
      ...linked,
      flowId,
      flowStatus: flow.status,
    };
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
            mainCompanyId: intake.mainCompanyId,
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
