import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { ModelModule } from "../models/model.module";
import { DesenController, SharedModelsController } from "./desen.controller";
import { DesenWorkflowService } from "./desen-workflow.service";
import { DesenService } from "./desen.service";

@Module({
  imports: [ModelModule],
  controllers: [DesenController, SharedModelsController],
  providers: [DesenService, DesenWorkflowService, SqlStoreService],
})
export class DesenModule {}
