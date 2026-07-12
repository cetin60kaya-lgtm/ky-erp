import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { BoyahaneController } from "./boyahane.controller";
import { BoyahaneService } from "./boyahane.service";

@Module({
  controllers: [BoyahaneController],
  providers: [BoyahaneService, SqlStoreService],
})
export class BoyahaneModule {}

