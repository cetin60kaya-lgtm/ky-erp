import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ModelService } from "./model.service";

@Module({
  imports: [DatabaseModule],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
