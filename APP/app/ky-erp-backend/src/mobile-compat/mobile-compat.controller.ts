import { Controller, Get, Query } from "@nestjs/common";
import { MobileCompatService } from "./mobile-compat.service";

@Controller("mobile")
export class MobileCompatController {
  constructor(private readonly service: MobileCompatService) {}

  @Get("yonetim")
  async getYonetim(@Query("mainCompanySlug") mainCompanySlug: string) {
    return { ok: true, data: await this.service.getYonetimSummary(mainCompanySlug) };
  }

  @Get("muhasebe")
  async getMuhasebe(@Query("mainCompanySlug") mainCompanySlug: string) {
    return { ok: true, data: await this.service.getMuhasebeSummary(mainCompanySlug) };
  }

  @Get("ik")
  async getIk(@Query("mainCompanySlug") mainCompanySlug: string) {
    return { ok: true, data: await this.service.getIkSummary(mainCompanySlug) };
  }

  @Get("imalat")
  async getImalat(@Query("mainCompanySlug") mainCompanySlug: string) {
    return { ok: true, data: await this.service.getImalatSummary(mainCompanySlug) };
  }

  @Get("desen")
  async getDesen(@Query("mainCompanySlug") mainCompanySlug: string) {
    return { ok: true, data: await this.service.getDesenSummary(mainCompanySlug) };
  }
}
