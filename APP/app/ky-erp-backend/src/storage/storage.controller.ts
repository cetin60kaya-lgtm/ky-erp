import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { StorageRulesService } from "./storage-rules.service";
import { StorageService } from "./storage.service";
import { getStorageRoot, readStorageSettings, writeStorageSettings } from "./storage-path.util";

@Controller(["admin/file-storage", "api/admin/file-storage"])
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly rulesService: StorageRulesService,
  ) {}

  @Get("status")
  getStatus(@Query() query: any) {
    return this.storageService.getStorageStatus(query);
  }

  @Get("settings")
  getSettings() {
    return {
      ...readStorageSettings(),
      storageRoot: getStorageRoot(),
    };
  }

  @Patch("settings")
  updateSettings(@Body() body: any) {
    const storageRoot = String(body?.storageRoot || "").trim();
    return writeStorageSettings({ storageRoot });
  }

  @Get("rules")
  async getRules(@Query() query: any) {
    const mainCompanyId = await this.rulesService.resolveMainCompanyId(query);
    return this.rulesService.getRules(mainCompanyId);
  }

  @Get("rules/:id")
  getRule(@Param("id") id: string) {
    return this.rulesService.getRuleById(id);
  }

  @Post("rules")
  createRule(@Body() body: any, @Query() query: any) {
    return this.rulesService.createRule({ ...query, ...body });
  }

  @Patch("rules/:id")
  updateRule(@Param("id") id: string, @Body() body: any, @Query() query: any) {
    return this.rulesService.updateRule(id, { ...query, ...body });
  }

  @Post("rules/:id/toggle-watch")
  toggleWatch(@Param("id") id: string, @Body() body: any) {
    return this.rulesService.toggleWatch(
      id,
      body?.isActive ?? body?.watchEnabled,
    );
  }

  @Post("rules/:id/test-watch-path")
  testWatchPath(@Param("id") id: string) {
    return this.rulesService.testWatchPath(id);
  }

  @Post("rules/:id/import-watch-folder")
  importWatchFolder(@Param("id") id: string, @Body() body: any) {
    return this.storageService.importWatchFolder(id, body);
  }

  @Post("seed-default-rules")
  async seedDefaultRules(@Body() body: any, @Query() query: any) {
    const mainCompanyId = await this.rulesService.resolveMainCompanyId({
      ...query,
      ...body,
    });
    return this.rulesService.seedDefaultRules(mainCompanyId);
  }

  @Get("files")
  listFiles(@Query() query: any) {
    return this.storageService.listFiles(query);
  }

  @Get("files/:id")
  getFile(@Param("id") id: string) {
    return this.storageService.getFile(id);
  }

  @Delete("files/:id")
  softDeleteFile(@Param("id") id: string) {
    return this.storageService.softDeleteFile(id);
  }
}
