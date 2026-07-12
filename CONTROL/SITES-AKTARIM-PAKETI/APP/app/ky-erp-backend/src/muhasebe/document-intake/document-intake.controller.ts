import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { DocumentIntakeServiceV2 } from "./document-intake.service";
import type {
  ApproveDocumentIntakeDto,
  BulkApproveDocumentIntakeDto,
  CreateFirmDraftDto,
  CreateProductDraftDto,
  DocumentIntakeFixDto,
  DocumentIntakeQueryDto,
} from "./dto/document-intake.dto";

@Controller([
  "muhasebe/document-intake",
  "api/muhasebe/document-intake",
  "muhasebe/tedarikci-belgeler",
  "api/muhasebe/tedarikci-belgeler",
])
export class DocumentIntakeController {
  constructor(private readonly service: DocumentIntakeServiceV2) {}

  @Post("upload")
  @UseInterceptors(
    FilesInterceptor("files", 200, {
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
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    return this.service.upload(files, {
      ...body,
      documentKind: body?.documentKind || "SUPPLIER_INVOICE",
    });
  }

  @Get()
  list(@Query() query: DocumentIntakeQueryDto) {
    return this.service.list(query);
  }

  @Get(":id/preview")
  async preview(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const row = await this.service.detail(
      mainCompanySlug || mainCompanyId || "mecit-hakan",
      id,
    );
    return {
      ok: true,
      sourceType: row.sourceType,
      filePath: row.filePath,
      originalFileName: row.originalFileName,
      documentNo: row.documentNo || row.invoiceNo || row.dispatchNo,
      supplierName: row.issuerName,
      issueDate: row.issueDate,
      lines: row.lines || [],
      totals: {
        taxBase: row.subtotal || 0,
        normalVat: row.controlSummary?.normalVat ?? row.vatTotal ?? 0,
        withholding: row.controlSummary?.withholdingVat ?? 0,
        otherTax: row.controlSummary?.otherTax ?? 0,
        discount: row.controlSummary?.discountTotal ?? 0,
        grandTotal: row.grandTotal || 0,
      },
      warnings: row.missingFields || [],
    };
  }

  @Get(":id/lines")
  async lines(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const row = await this.service.detail(
      mainCompanySlug || mainCompanyId || "mecit-hakan",
      id,
    );
    return { ok: true, items: row.lines || [] };
  }

  @Get(":id/taxes")
  async taxes(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const row = await this.service.detail(
      mainCompanySlug || mainCompanyId || "mecit-hakan",
      id,
    );
    return {
      ok: true,
      taxBreakdown: row.taxBreakdown || row.parseRawJson?.taxBreakdown || null,
      controlSummary: row.controlSummary || null,
    };
  }

  @Get(":id")
  detail(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.detail(
      mainCompanySlug || mainCompanyId || "mecit-hakan",
      id,
    );
  }

  @Patch(":id/fix")
  fix(@Param("id") id: string, @Body() body: DocumentIntakeFixDto) {
    return this.service.fix(
      body["mainCompanySlug"] || body["mainCompanyId"] || "mecit-hakan",
      id,
      body,
    );
  }

  @Post(":id/create-firm")
  createFirm(
    @Param("id") id: string,
    @Body()
    body: CreateFirmDraftDto & {
      mainCompanySlug?: string;
      mainCompanyId?: string;
    },
  ) {
    return this.service.createFirm(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      body,
    );
  }

  @Post(":id/lines/:lineId/create-product")
  createProduct(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body()
    body: CreateProductDraftDto & {
      mainCompanySlug?: string;
      mainCompanyId?: string;
    },
  ) {
    return this.service.createProduct(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      lineId,
      body,
    );
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.approve(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      body,
    );
  }

  @Post(":id/reparse")
  reparse(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.autoProcess(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      { ...body, confirm: true },
    );
  }

  @Post(":id/recalculate-prices")
  recalculatePrices(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.autoProcess(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      { ...body, confirm: true },
    );
  }

  @Post(":id/match-products")
  matchProducts(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.autoProcess(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      { ...body, confirm: true },
    );
  }

  @Post(":id/send-vat-review")
  sendVatReview(@Param("id") id: string, @Body() body: ApproveDocumentIntakeDto) {
    return this.service.detail(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
    );
  }

  @Post(":id/archive")
  archive(
    @Param("id") id: string,
    @Body()
    body: { mainCompanySlug?: string; mainCompanyId?: string; reason?: string },
  ) {
    return this.service.archive(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      body,
    );
  }

  @Delete(":id/purge")
  purgeDelete(
    @Param("id") id: string,
    @Body()
    body: { mainCompanySlug?: string; mainCompanyId?: string; reason?: string },
  ) {
    return this.service.purge(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      body,
    );
  }

  @Post(":id/purge")
  purgePost(
    @Param("id") id: string,
    @Body()
    body: { mainCompanySlug?: string; mainCompanyId?: string; reason?: string },
  ) {
    return this.service.purge(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      id,
      body,
    );
  }

  @Post("purge-rejected")
  purgeRejected(
    @Body()
    body: {
      mainCompanySlug?: string;
      mainCompanyId?: string;
      documentKind?: string;
      reason?: string;
    },
  ) {
    return this.service.purgeRejected(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      body,
    );
  }

  @Post("bulk-approve")
  bulkApprove(@Body() body: BulkApproveDocumentIntakeDto) {
    return this.service.bulkApprove(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
      body,
    );
  }
}
