import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { PersonelController } from "./personel.controller";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { PersonelService } from "./personel.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PersonelController, HrController],
  providers: [PersonelService, HrService],
})
export class PersonelModule {}
