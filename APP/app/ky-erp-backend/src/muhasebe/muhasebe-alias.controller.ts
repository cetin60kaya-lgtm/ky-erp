import { Controller, Get, Query } from "@nestjs/common";
import { AccountingApiService } from "./accounting-api.service";

function slug(input: Record<string, any> = {}) {
  return String(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan").trim();
}

@Controller()
export class MuhasebeAliasController {
  constructor(private readonly accounting: AccountingApiService) {}

  @Get([
    "vat/summary",
    "api/vat/summary",
    "muhasebe/vat/summary",
    "api/muhasebe/vat/summary",
    "api/muhasebe/kdv/summary",
    "api/muhasebe/kdv-kontrol",
  ])
  vatSummary(@Query() query: Record<string, any>) {
    return this.accounting.vatSummary({ ...query, mainCompanySlug: slug(query) });
  }

  @Get([
    "mail-tracking",
    "api/mail-tracking",
    "api/muhasebe/mail-tracking",
    "api/muhasebe/mail-ekstre",
    "api/muhasebe/ekstre-eslestirme",
  ])
  mailTracking(@Query() query: Record<string, any>) {
    return this.accounting.mailTracking({ ...query, mainCompanySlug: slug(query) });
  }
}
