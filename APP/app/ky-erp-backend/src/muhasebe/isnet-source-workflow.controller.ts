import { Body, Controller, Param, Post } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetSourceWorkflowService } from "./isnet-source-workflow.service";

@Controller("isnet/source-workflow")
@RequireModule(ModuleKey.ISNET)
export class IsnetSourceWorkflowController {
  constructor(private readonly service: IsnetSourceWorkflowService) {}

  @Post(":id/outgoing-dispatch")
  async createOutgoingDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.createOutgoingDraft(id, body));
  }

  @Post(":id/invoice")
  async prepareInvoice(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.prepareInvoice(id, body));
  }
}
