import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { apiSuccess } from "../../common/api-helpers";
import { CanonicalDispatchSyncService } from "./canonical-dispatch-sync.service";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";
import { CanonicalWorkflowOrchestratorService } from "./canonical-workflow-orchestrator.service";

@Controller(["model-flow", "production/model-flow", "isnet/model-flow"])
export class CanonicalModelFlowController {
  constructor(
    private readonly service: CanonicalModelFlowService,
    private readonly sync: CanonicalDispatchSyncService,
    private readonly orchestrator: CanonicalWorkflowOrchestratorService,
  ) {}

  @Get("models")
  async models(@Query() query: Record<string, any>) {
    return apiSuccess(await this.sync.listModels(query ?? {}));
  }

  @Post("quick-create")
  async quickCreate(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.orchestrator.quickCreate(body ?? {}),
      "Model tek merkezde oluşturuldu",
    );
  }

  @Post("link-dispatch")
  async linkDispatch(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.orchestrator.linkDispatch(body ?? {}),
      "Gelen irsaliye modele ve imalat planına bağlandı",
    );
  }

  @Post("link-isnet-flow")
  async linkIsnetFlow(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.sync.linkIsnetFlow(body ?? {}),
      "İşNet model eşleşmesi üretim planına bağlandı",
    );
  }

  @Post("sync-intakes")
  async syncIntakes(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.sync.syncLinkedIntakes(body ?? {}),
      "Model eşleşmiş irsaliyeler üretim planına senkronize edildi",
    );
  }

  @Post("refresh-plan")
  async refreshPlan(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.refreshPlanTotals(body ?? {}));
  }

  @Get("reconciliation")
  async reconciliation(@Query() query: Record<string, any>) {
    await this.sync.syncLinkedIntakes(query ?? {});
    return apiSuccess(await this.orchestrator.reconciliation(query ?? {}));
  }

  @Get("timeline")
  async timeline(@Query() query: Record<string, any>) {
    const safeQuery = { ...(query ?? {}) };
    delete safeQuery.dispatchNo;
    delete safeQuery.orderNo;
    return apiSuccess(await this.orchestrator.timeline(safeQuery));
  }
}
