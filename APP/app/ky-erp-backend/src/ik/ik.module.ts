import { Module } from "@nestjs/common";
import { IkAdvancedController } from "./ik-advanced.controller";
import { IkAdvancedService } from "./ik-advanced.service";
import { IkController } from "./ik.controller";
import { IkService } from "./ik.service";

@Module({
  controllers: [IkController, IkAdvancedController],
  providers: [IkService, IkAdvancedService],
})
export class IkModule {}
