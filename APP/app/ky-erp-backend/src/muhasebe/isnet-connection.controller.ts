import { Body, Controller, Post, Put } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetConnectionService } from "./isnet-connection.service";

@Controller("isnet/connection")
@RequireModule(ModuleKey.ISNET)
export class IsnetConnectionController {
  constructor(private readonly service: IsnetConnectionService) {}

  @Post("test")
  async test(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.test(body ?? {}),
      "İşNet bağlantısı doğrulandı",
    );
  }

  @Put()
  async save(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.save(body ?? {}),
      "İşNet bağlantısı güvenli biçimde kaydedildi",
    );
  }
}
