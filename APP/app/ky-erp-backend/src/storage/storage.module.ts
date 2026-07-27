import { Global, Module } from "@nestjs/common";
import { ImageResizeService } from "./image-resize.service";
import { StorageController } from "./storage.controller";
import { StorageRulesService } from "./storage-rules.service";
import { StorageService } from "./storage.service";

@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService, StorageRulesService, ImageResizeService],
  exports: [StorageService, StorageRulesService, ImageResizeService],
})
export class StorageModule {}
