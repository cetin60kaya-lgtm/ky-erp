import { Controller, Get, Query } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetDocumentCenterService } from "./isnet-document-center.service";

@Controller("isnet/document-center")
@RequireModule(ModuleKey.ISNET)
export class IsnetDocumentCenterController {
  constructor(private readonly service: IsnetDocumentCenterService) {}

  @Get()
  async list(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.list(query));
  }
}
