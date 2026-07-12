import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";

@Controller(["muhasebe/cari", "api/muhasebe/cari"])
export class CariController {
  constructor(private readonly service: AccountingApiService) {}

  @Get() list(@Query() query: Record<string, any>) { return this.service.listCari(query); }
  @Post("manual") createManual(@Body() body: Record<string, any>) { return this.service.createManualCari(body); }
  @Get(":firmId/movements") firmMovements(@Param("firmId") firmId: string) { return this.service.firmMovements(firmId); }
}
