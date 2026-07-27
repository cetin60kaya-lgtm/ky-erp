import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiToolsService } from "./ai-tools.service";
import { AiDevelopmentService } from "./ai-development.service";
import { MuhasebeModule } from "../muhasebe/muhasebe.module";
import { BoyahaneModule } from "../modules/boyahane/boyahane.module";
import { ModelModule } from "../modules/models/model.module";

@Module({ imports: [MuhasebeModule, BoyahaneModule, ModelModule], controllers: [AiController], providers: [AiService, AiToolsService, AiDevelopmentService] })
export class AiModule {}
