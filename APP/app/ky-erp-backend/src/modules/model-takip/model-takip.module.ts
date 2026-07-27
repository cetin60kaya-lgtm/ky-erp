import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { ModelModule } from "../models/model.module";
import { UretimModule } from "../uretim/uretim.module";
import {
  ModelTakipController,
  ModelTakipSummaryController,
} from "./model-takip.controller";

@Module({
  imports: [ModelModule, UretimModule],
  controllers: [ModelTakipController, ModelTakipSummaryController],
  providers: [SqlStoreService],
})
export class ModelTakipModule {}
