import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveDbService } from "./live-db.service";

@Global()
@Module({
  providers: [PrismaService, LiveDbService],
  exports: [PrismaService, LiveDbService],
})
export class DatabaseModule {}
