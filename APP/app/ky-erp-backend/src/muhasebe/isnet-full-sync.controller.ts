import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetFullSyncService } from "./isnet-full-sync.service";

@Controller("isnet")
@RequireModule(ModuleKey.ISNET)
export class IsnetFullSyncController {
  constructor(
    private readonly service: IsnetFullSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("full-sync")
  async fullSync(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.run(body));
  }

  @Get("full-sync/status")
  async status(@Query("mainCompanySlug") mainCompanySlug?: string) {
    const slug = String(mainCompanySlug || "").trim();
    if (!slug) return apiSuccess(null);
    const row = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "FULL_SYNC_STATUS",
        },
      },
    });
    return apiSuccess(row?.value || null);
  }
}
