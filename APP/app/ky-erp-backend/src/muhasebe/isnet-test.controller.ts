import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { apiSuccess } from "../common/api-helpers";
import { IsnetTestService } from "./isnet-test.service";

@Controller("isnet-test")
export class IsnetTestController {
  constructor(private readonly isnetTestService: IsnetTestService) {}

  @Get("health")
  async health(@Query("mainCompanySlug") mainCompanySlug?: string) {
    return apiSuccess(
      await this.isnetTestService.health(mainCompanySlug),
      "İşNet sağlık kontrolü tamamlandı.",
    );
  }

  @Get("recipients")
  async recipients(@Query("mainCompanySlug") mainCompanySlug?: string) {
    return apiSuccess(
      await this.isnetTestService.getRecipients(mainCompanySlug),
      "İşNet alıcı listesi alındı.",
    );
  }

  @Post("despatch-draft")
  async createDespatchDraft(
    @Body() body: any,
    @Query("mainCompanySlug") mainCompanySlug?: string,
  ) {
    return apiSuccess(
      await this.isnetTestService.createDespatchDraft(body, mainCompanySlug),
      "İşNet test irsaliye taslağı oluşturuldu.",
    );
  }

  @Get("despatch-drafts")
  async getDespatchDrafts(@Query("mainCompanySlug") mainCompanySlug?: string) {
    return apiSuccess(
      await this.isnetTestService.getDespatchDrafts(mainCompanySlug),
      "İşNet taslak irsaliye listesi alındı.",
    );
  }
}
