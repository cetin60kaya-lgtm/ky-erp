import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { apiSuccess } from "../../common/api-helpers";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";

@Controller(["model-flow", "production/model-flow", "isnet/model-flow"])
export class CanonicalModelFlowController {
  constructor(private readonly service: CanonicalModelFlowService) {}

  @Post("quick-create")
  async quickCreate(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.quickCreate(body ?? {}),
      "Model tek merkezde oluşturuldu",
    );
  }

  @Post("link-dispatch")
  async linkDispatch(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.linkDispatch(body ?? {}),
      "Gelen irsaliye modele ve imalat planına bağlandı",
    );
  }

  @Post("refresh-plan")
  async refreshPlan(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.refreshPlanTotals(body ?? {}));
  }

  @Get("reconciliation")
  async reconciliation(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.reconciliation(query ?? {}));
  }
}
