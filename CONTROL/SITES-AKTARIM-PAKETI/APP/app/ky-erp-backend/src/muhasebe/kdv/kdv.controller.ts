import { Controller, Get, Query } from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";

@Controller(["muhasebe/kdv", "api/muhasebe/kdv"])
export class KdvController {
  constructor(private readonly service: AccountingApiService) {}

  @Get("summary") summary(@Query() query: Record<string, any>) { return this.service.kdvSummary(query); }
  @Get("records") records(@Query() query: Record<string, any>) { return this.service.kdvRecords(query); }
}
