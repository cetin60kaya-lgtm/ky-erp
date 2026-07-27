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
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import type {
  ApproveDocumentIntakeDto,
  DocumentIntakeQueryDto,
} from "./document-intake/dto/document-intake.dto";

function slugOf(value: any) {
  return String(value?.mainCompanySlug || value?.mainCompanyId || "mecit-hakan");
}

const belgeImportFilesInterceptor = FilesInterceptor("files", 200, {
  storage: memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLocaleLowerCase("tr-TR");
    if (
      name.endsWith(".pdf") ||
      name.endsWith(".xml") ||
      name.endsWith(".zip") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png")
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Sadece PDF, XML ve ZIP dosyaları yüklenebilir."), false);
  },
});

@Controller(["muhasebe/belge-import", "api/muhasebe/belge-import"])
export class BelgeImportController {
  constructor(private readonly service: DocumentIntakeServiceV2) {}

  @Post("upload")
  @UseInterceptors(belgeImportFilesInterceptor)
  upload(@UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    return this.service.upload(files, { ...body, autoApprove: false });
  }

  @Post("parse")
  @UseInterceptors(belgeImportFilesInterceptor)
  parse(@UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    return this.service.upload(files, { ...body, autoApprove: false });
  }

  @Post("auto-process")
  @UseInterceptors(belgeImportFilesInterceptor)
  autoProcess(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: ApproveDocumentIntakeDto & { id?: string },
  ) {
    if (Array.isArray(files) && files.length) {
      return this.service.upload(files, { ...body, autoApprove: true });
    }
    return this.service.autoProcess(slugOf(body), String(body.id || ""), {
      ...body,
      confirm: true,
    });
  }

  @Get()
  list(@Query() query: DocumentIntakeQueryDto) {
    return this.service.list(query);
  }

  @Get(":id")
  detail(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.detail(mainCompanySlug || mainCompanyId || "mecit-hakan", id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.autoProcess(slugOf(body), id, { ...body, confirm: true });
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.autoProcess(slugOf(body), id, { ...body, confirm: true });
  }

  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @Body() body: { mainCompanySlug?: string; mainCompanyId?: string; reason?: string },
  ) {
    return this.service.reject(slugOf(body), id, body);
  }

  @Post(":id/convert-to-paid-expense")
  convertToPaidExpense(
    @Param("id") id: string,
    @Body()
    body: {
      mainCompanySlug?: string;
      mainCompanyId?: string;
      postingType?: string;
      reason?: string;
    },
  ) {
    return this.service.convertToPaidExpense(slugOf(body), id, body);
  }
}
