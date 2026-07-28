import { Body, Controller, Param, Post } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetInvoicePreparationService } from "./isnet-invoice-preparation.service";

@Controller("isnet/invoice-preparation")
@RequireModule(ModuleKey.ISNET)
export class IsnetInvoicePreparationController {
  constructor(private readonly service: IsnetInvoicePreparationService) {}

  @Post("dispatches/:id/draft")
  async createFromDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.createFromDispatch(id, body));
  }
}
