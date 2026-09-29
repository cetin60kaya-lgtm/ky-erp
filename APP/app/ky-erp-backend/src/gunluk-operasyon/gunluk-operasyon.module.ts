import { Module } from "@nestjs/common";
import { GunlukOperasyonController } from "./gunluk-operasyon.controller";
import { GunlukOperasyonService } from "./gunluk-operasyon.service";

@Module({
  controllers: [GunlukOperasyonController],
  providers: [GunlukOperasyonService],
})
export class GunlukOperasyonModule {}
