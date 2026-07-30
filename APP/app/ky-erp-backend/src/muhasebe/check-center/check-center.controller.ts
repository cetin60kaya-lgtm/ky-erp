import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "fs";
import * as path from "path";
import type { Response } from "express";
import { getStorageRoot } from "../../storage/storage-path.util";
import { CheckCenterService } from "./check-center.service";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function safeFilePart(value: string) {
  return String(value || "dosya")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

@Controller(["muhasebe/odeme", "api/muhasebe/odeme"])
export class CheckCenterController {
  constructor(private readonly checks: CheckCenterService) {}

  @Get("cekler")
  overview(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.checks.overview({ mainCompanySlug, mainCompanyId });
  }

  @Post("cek-v3")
  create(@Body() body: any) {
    return this.checks.create(body);
  }

  @Post("cek/:id/dosyalar")
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(
              path.join(getStorageRoot(), "muhasebe", "cekler", "_temp"),
            ),
          ),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFilePart(file.originalname)}`,
          ),
      }),
      limits: { files: 3, fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @Param("id") id: string,
    @UploadedFiles() files: any[],
  ) {
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
    const targetDir = ensureDir(
      path.join(getStorageRoot(), "muhasebe", "cekler", id),
    );
    const saved: Record<string, string> = {};
    for (const file of files || []) {
      const side = String(file.fieldname || "").toLowerCase();
      if (!["front", "back", "receipt"].includes(side)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        continue;
      }
      const ext = path
        .extname(file.originalname || file.filename || "")
        .toLowerCase();
      if (!allowed.has(ext)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new BadRequestException(
          "Çek ekleri JPG, PNG, WEBP veya PDF olmalıdır.",
        );
      }
      const targetPath = path.join(targetDir, `${side}-${Date.now()}${ext}`);
      try {
        fs.renameSync(file.path, targetPath);
      } catch {
        fs.copyFileSync(file.path, targetPath);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
      saved[`${side}Path`] = targetPath;
    }
    return this.checks.saveAttachments(id, saved);
  }

  @Get("cek/:id/dosya/:side")
  async file(
    @Param("id") id: string,
    @Param("side") side: string,
    @Res() res: Response,
  ) {
    const filePath = await this.checks.filePath(id, side);
    return res.sendFile(filePath);
  }
}
