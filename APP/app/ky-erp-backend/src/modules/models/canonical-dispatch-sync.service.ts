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

  async listModels(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
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
    };
  }

  async linkIsnetFlow(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
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
        const ids = byModel.get(modelId) || [];
        ids.push(line.id);
        byModel.set(modelId, ids);
      }
      if (!byModel.size && clean(intake.modelId)) {
        byModel.set(clean(intake.modelId), (intake.lines || []).map((line: any) => line.id));
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
      scannedIntakes: intakes.length,
      linkedPlans: success.length,
      failedCount: failed.length,
      success,
      failed,
    };
  }
}
