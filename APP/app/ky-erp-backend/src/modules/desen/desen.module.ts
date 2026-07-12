import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { ModelModule } from "../models/model.module";
import { DesenController, SharedModelsController } from "./desen.controller";
import { DesenService } from "./desen.service";

@Module({
  imports: [ModelModule],
  controllers: [DesenController, SharedModelsController],
  providers: [DesenService, SqlStoreService],
})
export class DesenModule {}
