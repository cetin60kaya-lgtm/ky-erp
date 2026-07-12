import { Module } from "@nestjs/common";
import { MobileCompatController } from "./mobile-compat.controller";
import { MobileCompatService } from "./mobile-compat.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [MobileCompatController],
  providers: [MobileCompatService],
})
export class MobileCompatModule {}
