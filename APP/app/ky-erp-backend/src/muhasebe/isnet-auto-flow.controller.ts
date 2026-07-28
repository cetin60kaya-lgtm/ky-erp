import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetAutoFlowService } from "./isnet-auto-flow.service";

@Controller("isnet/auto-flows")
@RequireModule(ModuleKey.ISNET)
export class IsnetAutoFlowController {
  constructor(private readonly service: IsnetAutoFlowService) {}

  @Get()
  async list(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.list(query));
  }

  @Post("incoming/:sourceId/prepare")
  async prepareIncoming(
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.prepareIncoming(sourceId, body));
  }

  @Post(":id/model")
  async assignModel(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.assignModel(id, body));
  }

  @Patch(":id/outgoing-document-no")
  async setOutgoingDocumentNo(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.setOutgoingDocumentNo(id, body));
  }

  @Post(":id/refresh")
  async refreshAfterDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.refreshAfterDispatch(id, body));
  }

  @Patch(":id/invoice-state")
  async updateInvoiceState(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.updateInvoiceState(id, body));
  }
}
