import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { BoyahaneController } from "./boyahane.controller";
import { BoyahaneService } from "./boyahane.service";
import { BoyahaneWorkflowService } from "./boyahane-workflow.service";

@Module({
  controllers: [BoyahaneController],
  providers: [BoyahaneService, BoyahaneWorkflowService, SqlStoreService],
  exports: [BoyahaneWorkflowService],
})
export class BoyahaneModule {}

