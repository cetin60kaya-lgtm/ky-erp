import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { CanonicalDispatchSyncService } from "./canonical-dispatch-sync.service";
import { CanonicalModelFlowController } from "./canonical-model-flow.controller";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";
import { CanonicalWorkflowOrchestratorService } from "./canonical-workflow-orchestrator.service";
import { ModelService } from "./model.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CanonicalModelFlowController],
  providers: [
    ModelService,
    CanonicalModelFlowService,
    CanonicalDispatchSyncService,
    CanonicalWorkflowOrchestratorService,
  ],
  exports: [
    ModelService,
    CanonicalModelFlowService,
    CanonicalDispatchSyncService,
    CanonicalWorkflowOrchestratorService,
  ],
})
export class ModelModule {}
