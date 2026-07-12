import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";

@Controller(["muhasebe/statement", "api/muhasebe/statement"])
export class StatementController {
  constructor(private readonly service: AccountingApiService) {}

  @Post("compare") compare(@Body() body: Record<string, any>) { return this.service.compareStatement(body); }
  @Get(":firmId/missing-invoices") missing(@Param("firmId") firmId: string) { return this.service.missingInvoices(firmId); }
}
