import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { CanonicalDispatchSyncService } from "./canonical-dispatch-sync.service";
import { CanonicalModelFlowController } from "./canonical-model-flow.controller";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";
import { ModelService } from "./model.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CanonicalModelFlowController],
  providers: [ModelService, CanonicalModelFlowService, CanonicalDispatchSyncService],
  exports: [ModelService, CanonicalModelFlowService, CanonicalDispatchSyncService],
})
export class ModelModule {}
