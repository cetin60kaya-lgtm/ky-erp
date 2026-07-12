import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BackboneApiController } from "./backbone-api.controller";
import { BackboneApiService } from "./backbone-api.service";

@Module({
  controllers: [BackboneApiController],
  providers: [BackboneApiService, PrismaService],
})
export class BackboneApiModule {}
