import { Module } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { ModelModule } from "../models/model.module";
import { UretimController } from "./uretim.controller";
import { UretimService } from "./uretim.service";

@Module({
  imports: [ModelModule],
  controllers: [UretimController],
  providers: [UretimService, SqlStoreService],
  exports: [UretimService],
})
export class UretimModule {}
