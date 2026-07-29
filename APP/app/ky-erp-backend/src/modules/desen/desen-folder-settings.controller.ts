import { Body, Controller, Get, Post, Put, Query } from "@nestjs/common";
import { exec } from "child_process";
import * as fs from "fs";
import { apiSuccess, requireMainCompanySlug } from "../../common/api-helpers";
import {
  getDesenFolderSettings,
  saveDesenFolderSettings,
  testDesenFolderSettings,
} from "./desen-folder-settings.util";

@Controller("desen/folder-settings")
export class DesenFolderSettingsController {
  private slug(payload: Record<string, any>) {
    return requireMainCompanySlug(payload || {});
  }

  @Get()
  getSettings(@Query() query: Record<string, any>) {
    const slug = this.slug(query);
    const result = testDesenFolderSettings(slug);
    return apiSuccess({
      ...result,
      mainCompanySlug: slug,
    });
  }

  @Post("test")
  testSettings(@Body() body: Record<string, any>) {
    const slug = this.slug(body);
    return apiSuccess(
      {
        ...testDesenFolderSettings(slug, body),
        mainCompanySlug: slug,
      },
      "Desen klasörleri erişim ve yazma testinden geçti",
    );
  }

  @Put()
  saveSettings(@Body() body: Record<string, any>) {
    const slug = this.slug(body);
    const settings = saveDesenFolderSettings(slug, body);
    const tested = testDesenFolderSettings(slug);
    return apiSuccess(
      {
        ...tested,
        settings,
        mainCompanySlug: slug,
      },
      "Desen klasör ayarları kaydedildi",
    );
  }

  @Post("open")
  openIncomingFolder(@Body() body: Record<string, any>) {
    const slug = this.slug(body);
    const settings = getDesenFolderSettings(slug);
    fs.mkdirSync(settings.incomingFolder, { recursive: true });
    if (process.platform === "win32") {
      exec(`cmd /c start "" "${settings.incomingFolder.replace(/"/g, '""')}"`);
      return apiSuccess({
        opened: true,
        folderPath: settings.incomingFolder,
      });
    }
    return apiSuccess({
      opened: false,
      folderPath: settings.incomingFolder,
      message: "Explorer açma yalnızca Windows'ta desteklenir.",
    });
  }
}
