import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { EBelgeCenterService } from "./e-belge-center.service";

@Controller(["e-belge", "api/e-belge"])
export class EBelgeCenterController {
  constructor(private readonly service: EBelgeCenterService) {}

  @Post("upload")
  @UseInterceptors(
    FilesInterceptor("files", 200, {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const name = String(file.originalname || "").toLocaleLowerCase("tr-TR");
        if (
          name.endsWith(".xml") ||
          name.endsWith(".pdf") ||
          name.endsWith(".zip") ||
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png") ||
          name.endsWith(".webp")
        ) {
          cb(null, true);
          return;
        }
        cb(new Error("e-Belge Merkezi yalnız XML, PDF, ZIP, JPG, PNG ve WEBP kabul eder."), false);
      },
      limits: {
        files: 200,
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    return this.service.upload(files, body || {});
  }

  @Get("pool")
  pool(@Query() query: Record<string, any>) {
    return this.service.list(query || {});
  }

  @Get("documents/:id")
  detail(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.detail(String(mainCompanySlug || mainCompanyId || ""), id);
  }

  @Post("documents/:id/reconcile")
  reconcile(
    @Param("id") id: string,
    @Body() body: { mainCompanySlug?: string; mainCompanyId?: string },
  ) {
    const slug = String(body?.mainCompanySlug || body?.mainCompanyId || "").trim();
    return this.service.reconcileOne(slug, id);
  }

  @Post("reconcile-all")
  reconcileAll(@Body() body: Record<string, any>) {
    return this.service.reconcileAll(body || {});
  }
}
