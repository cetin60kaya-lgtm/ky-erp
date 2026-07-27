import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  NotFoundException,
  Patch,
  Post,
  Param,
  Query,
  Res,
  Put,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "fs";
import * as path from "path";
import type { Response } from "express";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { AdminService } from "../admin/admin.service";
import { apiSuccess } from "../common/api-helpers";
import { DocumentIntakeService } from "./document-intake.service";
import { DocumentFolderWatcherService } from "./document-folder-watcher.service";
import { MuhasebeBelgeService } from "./muhasebe-belge.service";
import { MuhasebeDocumentWorkflowService } from "./muhasebe-document-workflow.service";
import { FirmaKartlariDbService } from "./firma-kartlari-db.service";
import { MuhasebeDbService } from "./muhasebe-db.service";
import { MuhasebeIntegrationService } from "./muhasebe-integration.service";
import { MuhasebeService } from "./muhasebe.service";
import { MuhasebeFinalService } from "./muhasebe-final.service";
import { AccountingApiService } from "./accounting-api.service";
import { ModelService } from "../modules/models/model.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseKyDocumentFromPdfText } from "./pdf/kyerp-pdf-parser";
import { SalesInvoicePoolService } from "./sales-invoice-pool.service";
import { getStorageRoot } from "../storage/storage-path.util";
import { DispatchReconciliationService } from "./dispatch-reconciliation.service";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function sanitizeFilePart(value: string) {
  const raw = String(value || "");
  const repaired = /[\u00c4\u00c3\u00c5\u00c2\u00b0]/.test(raw)
    ? Buffer.from(raw, "latin1").toString("utf8")
    : raw;
  return repaired
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

@Controller(["muhasebe", "api/muhasebe"])
export class MuhasebeController {
  constructor(
    private readonly belgService: MuhasebeBelgeService,
    private readonly muhasebeService: MuhasebeService,
    private readonly documentWorkflowService: MuhasebeDocumentWorkflowService,
    private readonly documentIntakeService: DocumentIntakeService,
    private readonly folderWatcher: DocumentFolderWatcherService,
    private readonly adminService: AdminService,
    private readonly firmaKartlariDb: FirmaKartlariDbService,
    private readonly muhasebeDb: MuhasebeDbService,
    private readonly muhasebeIntegration: MuhasebeIntegrationService,
    private readonly muhasebeFinal: MuhasebeFinalService,
    private readonly accountingApi: AccountingApiService,
    private readonly modelService: ModelService,
    private readonly prisma: PrismaService,
    private readonly salesInvoicePool: SalesInvoicePoolService,
    private readonly dispatchReconciliation: DispatchReconciliationService,
  ) {}

  private resolveSlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const requestedSlug = String(mainCompanySlug || "").trim();
    const requestedId = String(mainCompanyId || "").trim();
    if (!requestedSlug && !requestedId) {
      return "mecit-hakan";
    }
    return requestedSlug || requestedId;
  }
  private odemeKey(value: any) {
    return String(value || "")
      .trim()
      .toLocaleUpperCase("tr-TR")
      .replace(/\s+/g, " ");
  }

  private odemeAmount(value: any) {
    const parsed = Number(
      String(value ?? "0")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^0-9.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private odemeDate(value: any) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text)
      ? text.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  }

  private odemeFirmName(firmaId: string, firms: any[]) {
    const wanted = String(firmaId || "").trim();
    const firm = firms.find(
      (item) =>
        String(item.id || item.firmaId || "") === wanted ||
        this.odemeKey(item.firma || item.firmaAdi || item.name) ===
          this.odemeKey(wanted),
    );
    if (!firm) throw new NotFoundException("Firma/cari bulunamadi.");
    return String(firm.firma || firm.firmaAdi || firm.name || "").trim();
  }

  private odemeFirmPool() {
    const firms = this.muhasebeService.getFirmaKartlari();
    const checks = this.muhasebeService.getCekler();
    const cards = this.muhasebeService.getKrediKartlari();
    const movements = this.muhasebeService.getCariHareketleri();
    const payments = this.muhasebeService.getOdemeler();

    return firms
      .filter((firm: any) => firm?.aktif !== false)
      .map((firm: any) => {
        const name = String(firm.firma || firm.firmaAdi || firm.name || "");
        const key = this.odemeKey(name);
        const firmChecks = checks.filter(
          (row: any) => this.odemeKey(row.firma) === key,
        );
        const firmCards = cards.filter(
          (row: any) => this.odemeKey(row.firma) === key,
        );
        const firmMovements = movements.filter(
          (row: any) => this.odemeKey(row.firma) === key,
        );
        const firmPayments = payments.filter(
          (row: any) => this.odemeKey(row.firma) === key,
        );
        const openChecks = firmChecks.filter((row: any) => {
          const status = this.odemeKey(row.durum || row.status);
          return !["KAPANDI", "TAHSIL", "TAHSIL EDILDI", "IPTAL", "IADE"].some(
            (closed) => status.includes(closed),
          );
        });
        const openCards = firmCards.filter((row: any) => row.aktif !== false);
        const lastDates = [
          ...firmMovements.map((row: any) => row.tarih),
          ...firmChecks.map((row: any) => row.vadeTarihi || row.vade),
          ...firmPayments.map((row: any) => row.tarih),
        ]
          .map((value) => String(value || "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .reverse();
        const balance = Number(firm.mevcutBakiye ?? firm.bakiye ?? 0);
        return {
          id: String(firm.id || name),
          firmaId: String(firm.id || name),
          firmaAdi: name,
          name,
          firmaTipi: firm.tip || firm.firmaTipi || "SATICI",
          firmType:
            firm.tip === "MUSTERI"
              ? "CUSTOMER"
              : firm.tip === "GENEL"
                ? "BOTH"
                : "SUPPLIER",
          resmiGayri:
            firm.varsayilanRecordType === "GAYRI_RESMI"
              ? "GAYRI_RESMI"
              : "RESMI",
          officialType:
            firm.varsayilanRecordType === "GAYRI_RESMI"
              ? "UNOFFICIAL"
              : "OFFICIAL",
          bakiye: balance,
          openCheckCount: openChecks.length,
          openCheckTotal: openChecks.reduce(
            (sum: number, row: any) => sum + this.odemeAmount(row.tutar),
            0,
          ),
          openCardCount: openCards.length,
          openCardTotal: openCards.reduce(
            (sum: number, row: any) =>
              sum + this.odemeAmount(row.toplamBorc || row.tutar),
            0,
          ),
          creditCardMovementCount: openCards.length,
          cashTransferMovementCount: firmMovements.filter((row: any) =>
            ["ODEME", "NAKIT", "HAVALE", "EFT"].some((token) =>
              this.odemeKey(row.sourceType || row.islemTipi).includes(token),
            ),
          ).length,
          lastMovementDate: lastDates[0] || firm.sonIslem || "",
          sonIslemTarihi: lastDates[0] || firm.sonIslem || "",
        };
      });
  }

  private odemeResponse(data: any) {
    return { success: true, ok: true, data };
  }

  private resolveSlugFromLegacyQuery(args: {
    mainCompanySlug?: string;
    mainCompanyId?: string;
    companySlug?: string;
    companyId?: string;
  }) {
    const slug = String(args.mainCompanySlug || args.companySlug || "").trim();
    if (slug) return slug;
    return this.resolveSlug(
      args.mainCompanySlug || args.companySlug,
      args.mainCompanyId || args.companyId,
    );
  }

  private requireMainCompanySlug(slug?: string) {
    if (!slug) {
      throw new BadRequestException(
        "mainCompanyId veya mainCompanySlug zorunludur",
      );
    }
    return slug;
  }

  private integrationScopeFromQuery(
    mainCompanySlug?: string,
    mainCompanyId?: string,
  ) {
    return this.muhasebeIntegration.scope(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      mainCompanyId,
    );
  }

  private integrationScopeFromBody(body: any = {}) {
    return this.muhasebeIntegration.scope(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
      body.mainCompanyId,
    );
  }

  @Get("contact-people")
  getContactPeople(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.muhasebeIntegration.listContactPeople(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
      query,
    );
  }

  @Post("contact-people")
  createContactPerson(@Body() body: any) {
    return this.muhasebeIntegration.createContactPerson(
      this.integrationScopeFromBody(body),
      body,
    );
  }

  @Patch("contact-people/:id")
  updateContactPerson(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.updateContactPerson(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  @Patch("contact-people/:id/passive")
  passiveContactPerson(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.passiveContactPerson(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Get("contact-departments")
  getContactDepartments(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.muhasebeIntegration.listContactDepartments(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
      query,
    );
  }

  @Post("contact-departments")
  createContactDepartment(@Body() body: any) {
    return this.muhasebeIntegration.upsertContactDepartment(
      this.integrationScopeFromBody(body),
      body,
    );
  }

  @Patch("contact-departments/:id")
  updateContactDepartment(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.upsertContactDepartment(
      this.integrationScopeFromBody(body),
      body,
      id,
    );
  }

  @Patch("contact-departments/:id/passive")
  passiveContactDepartment(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.passiveContactDepartment(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Get("mail-logs")
  getMailLogs(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.muhasebeIntegration.listMailLogs(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
      query,
    );
  }

  @Post("mail-logs/prepare")
  prepareMailLog(@Body() body: any) {
    return this.muhasebeIntegration.prepareMailLog(
      this.integrationScopeFromBody(body),
      body,
    );
  }

  @Post("mail-logs/:id/mark-sent")
  markMailLogSent(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.markMailSent(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Post("mail-logs/:id/reminder")
  remindMailLog(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.createReminder(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  @Patch("mail-logs/:id")
  updateMailLog(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.updateMailLog(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  @Post("statements/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(
              path.join(process.cwd(), "storage", "muhasebe", "statements"),
            ),
          ),
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${sanitizeFilePart(file.originalname)}`),
      }),
    }),
  )
  uploadStatement(@UploadedFile() file: any, @Body() body: any) {
    return this.muhasebeIntegration.createStatementImport(
      this.integrationScopeFromBody(body),
      file,
      body,
    );
  }

  @Post("statements/:id/compare")
  compareStatement(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.compareStatement(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  @Get("statements")
  getStatements(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeIntegration.listStatements(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
    );
  }

  @Get("statements/compare-results")
  getStatementCompareResults(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.muhasebeIntegration.listStatementResults(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
      query,
    );
  }

  @Post("statements/compare-results/:id/create-reminder")
  createStatementReminder(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.reminderFromStatementResult(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Get("supplier-invoice-lots")
  getSupplierInvoiceLots(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeIntegration.listSupplierLots(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
    );
  }

  @Post("supplier-invoice-lots")
  createSupplierInvoiceLot(@Body() body: any) {
    return this.muhasebeIntegration.upsertSupplierLot(
      this.integrationScopeFromBody(body),
      body,
    );
  }

  @Patch("supplier-invoice-lots/:id")
  updateSupplierInvoiceLot(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.upsertSupplierLot(
      this.integrationScopeFromBody(body),
      body,
      id,
    );
  }

  @Post("supplier-invoice-lots/:id/transfer-to-boyahane")
  transferSupplierInvoiceLot(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.transferSupplierLot(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Patch("supplier-invoice-lots/:id/passive")
  passiveSupplierInvoiceLot(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.passiveSupplierLot(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Get("manual-customer-dispatches")
  getManualCustomerDispatches(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeIntegration.listManualDispatches(
      this.integrationScopeFromQuery(mainCompanySlug, mainCompanyId),
    );
  }

  @Post("manual-customer-dispatches")
  createManualCustomerDispatch(@Body() body: any) {
    return this.muhasebeIntegration.upsertManualDispatch(
      this.integrationScopeFromBody(body),
      body,
    );
  }

  @Patch("manual-customer-dispatches/:id")
  updateManualCustomerDispatch(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.upsertManualDispatch(
      this.integrationScopeFromBody(body),
      body,
      id,
    );
  }

  @Post("manual-customer-dispatches/:id/approve-suggestion")
  approveManualSuggestion(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.approveManualSuggestion(
      this.integrationScopeFromBody(body),
      id,
    );
  }

  @Post("manual-customer-dispatches/:id/link-model")
  linkManualCustomerDispatchModel(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.linkManualModel(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  @Post("manual-customer-dispatches/:id/create-model-and-link")
  createManualDispatchModelAndLink(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeIntegration.createModelAndLink(
      this.integrationScopeFromBody(body),
      id,
      body,
    );
  }

  private resolveDbSlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = String(mainCompanySlug || "").trim();
    if (slug) return slug;
    return this.resolveSlug(undefined, mainCompanyId) || "mecit-hakan";
  }

  @Get("bootstrap")
  getBootstrap(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () => ({
      companies: this.muhasebeService.getFirmaKartlari(slug),
      paymentTypes: this.muhasebeService.getOdemeTurleri(),
      cariler: this.muhasebeService.getCariler(),
      odemeler: this.muhasebeService.getOdemeler(),
      cekler: this.muhasebeService.getCekler(),
      krediKartlari: this.muhasebeService.getKrediKartlari(),
      belgeler: this.muhasebeService.getBelgeler(),
      epostaKisileri: this.muhasebeService.getEpostaKisileri(),
      urunler: this.muhasebeService.getUrunler(),
    }));
  }

  @Get("dashboard-summary")
  getDashboardSummary(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getDashboardSummary(),
    );
  }

  @Get("document-path-settings")
  getDocumentPathSettings(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getDocumentPathSettings(),
    );
  }

  @Post("document-path-settings")
  saveDocumentPathSettings(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveDocumentPathSettings(body),
    );
  }

  @Post("document-upload")
  @UseInterceptors(
    FilesInterceptor("files", 500, {
      fileFilter: (req, file, cb) => {
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        const mimeType = String(file?.mimetype || "").toLowerCase();
        if (
          ext === ".xml" ||
          ext === ".pdf" ||
          ext === ".zip" ||
          ext === ".xlsx" ||
          ext === ".csv" ||
          ext === ".jpg" ||
          ext === ".jpeg" ||
          ext === ".png" ||
          mimeType === "application/xml" ||
          mimeType === "text/xml" ||
          mimeType === "application/pdf" ||
          mimeType === "application/zip" ||
          mimeType === "application/x-zip-compressed" ||
          mimeType ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          mimeType === "text/csv" ||
          mimeType === "application/csv" ||
          mimeType === "image/jpeg" ||
          mimeType === "image/jpg" ||
          mimeType === "image/png"
        ) {
          cb(null, true);
          return;
        }
        cb(
          new Error(
            "Sadece XML, PDF, ZIP, XLSX, CSV, JPEG ve PNG dosyaları yükleyebilirsiniz.",
          ),
          false,
        );
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(
            process.cwd(),
            "uploads",
            "kyerp-data",
            "_document-upload-temp",
          ),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadDocuments(@UploadedFiles() files: any[], @Body() body: any) {
    const uploadedFiles = Array.isArray(files) ? files : [];
    const safeFiles: any[] = [];
    const supportedZipExtensions = new Set([
      ".xml",
      ".pdf",
      ".xlsx",
      ".csv",
      ".jpg",
      ".jpeg",
      ".png",
    ]);
    const mimeByExtension: Record<string, string> = {
      ".xml": "application/xml",
      ".pdf": "application/pdf",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".csv": "text/csv",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    };
    for (const file of uploadedFiles) {
      if (String(path.extname(file?.originalname || "")).toLowerCase() !== ".zip") {
        safeFiles.push(file);
        continue;
      }
      const archive = new AdmZip(file.path);
      const entries = archive
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .filter((entry) => supportedZipExtensions.has(path.extname(entry.entryName).toLowerCase()));
      if (safeFiles.length + entries.length > 500) {
        throw new BadRequestException("Bir yüklemede en fazla 500 belge işlenebilir.");
      }
      for (const entry of entries) {
        if (Number(entry.header?.size || 0) > 50 * 1024 * 1024) {
          throw new BadRequestException(`${path.basename(entry.entryName)} 50 MB sınırını aşıyor.`);
        }
        const extension = path.extname(entry.entryName).toLowerCase();
        const originalName = sanitizeFilePart(path.basename(entry.entryName));
        const buffer = entry.getData();
        const targetPath = path.join(
          path.dirname(file.path),
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${originalName}`,
        );
        fs.writeFileSync(targetPath, buffer);
        safeFiles.push({
          ...file,
          originalname: originalName,
          filename: path.basename(targetPath),
          path: targetPath,
          size: buffer.length,
          mimetype: mimeByExtension[extension] || "application/octet-stream",
          buffer,
        });
      }
    }
    if (!safeFiles.length) {
      throw new BadRequestException("Yüklenecek desteklenen dosya bulunamadı.");
    }
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const options = {
      documentType: body.documentType,
      targetType: body.targetType,
      templateId: body.templateId,
      templateCompanyName: body.templateCompanyName,
      notes: body.notes,
    };
    const result = await this.muhasebeDb.uploadAndClassifyDocuments(
      safeFiles,
      slug,
      body.mainCompanyId,
      options,
    );
    if (String(options.targetType || "").toUpperCase() === "MUSTERIDEN_GELEN_IRSALIYE") {
      try {
        const reconciliation = await this.dispatchReconciliation.recalculate(slug, "document-upload");
        return { ...result, reconciliation: reconciliation.data };
      } catch (error: any) {
        return { ...result, reconciliationWarning: error?.message || "Fatura eşleştirmesi daha sonra yenilenecek." };
      }
    }
    return result;
  }

  @Get("document-upload/history")
  async getDocumentUploadHistory(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return apiSuccess(await this.muhasebeDb.getUploadHistory(slug));
  }

  @Get("document-upload/summary")
  async getDocumentUploadSummary(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return apiSuccess(await this.muhasebeDb.getUploadSummary(slug));
  }

  @Get("belge-havuzu")
  getBelgeHavuzu(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("durum") durum?: string,
    @Query("belgeTipi") belgeTipi?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("type") type?: string,
    @Query("status") status?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.belgeHavuzu({
      mainCompanySlug: slug,
      durum: status || durum,
      type: type || belgeTipi,
      page,
      limit,
      q,
    });
  }

  @Get("belge-havuzu/:id")
  getBelgeHavuzuById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.belgeDetay(slug, id);
  }

  @Patch("belge-havuzu/:id")
  updateBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.updateDocument(slug, id, body);
  }

  @Post("belge-havuzu/:id/reject")
  rejectBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.rejectDocument(slug, id, body);
  }

  @Post("belge-havuzu/:id/reddet")
  reddetBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    return this.rejectBelgeHavuzu(id, body);
  }

  @Post("belge-havuzu/onay-kuyrugu")
  enqueueBelgeHavuzuApprovals() {
    throw new GoneException(
      "Belge onay kuyrugu devre disi. Toplu onay icin her belgeyi /muhasebe/belge-havuzu/:id/onayla endpointine sirali gonderin.",
    );
  }

  @Get("belge-havuzu/onay-kuyrugu/:jobId")
  getBelgeHavuzuApprovalQueue() {
    throw new GoneException(
      "Belge onay kuyrugu devre disi.",
    );
  }

  @Post("belge-havuzu/:id/onayla")
  approveBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeFinal.approveDocument(slug, id, body);
  }

  @Post("fatura-kesim/pdf-oku")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (req, file, cb) => {
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        const mimeType = String(file?.mimetype || "").toLowerCase();
        if (ext === ".pdf" || mimeType === "application/pdf") {
          cb(null, true);
          return;
        }
        cb(new Error("Sadece PDF dosyasÄ± yÃ¼kleyebilirsiniz."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(process.cwd(), "uploads", "kyerp-data", "_fatura-kesim"),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async readFaturaKesimPdf(@UploadedFile() file: any, @Body() body: any) {
    if (!file) throw new BadRequestException("PDF dosyasÄ± gereklidir.");
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const extracted = await this.belgService.parseUploadedPdf(file, "");
    const parsed = parseKyDocumentFromPdfText(extracted.rawText || "");
    return this.muhasebeFinal.saveFaturaKesimParsedDocument(slug, parsed, file);
  }

  @Get("fatura-kesim/havuz")
  getFaturaKesimHavuz(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.faturaKesimHavuz({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Get("fatura-kesim/:id")
  getFaturaKesimDetail(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.faturaKesimDetail(slug, id);
  }

  @Post("fatura-kesim/:id/link-model")
  linkFaturaKesimModel(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeFinal.linkFaturaKesimLineToModel(slug, id, body);
  }

  @Post("fatura-kesim/:id/fatura-kaydi")
  createFaturaKesimInvoiceRecord(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeFinal.createFaturaKesimInvoiceRecord(slug, id, body);
  }

  @Post("fatura-kesim/:id/isnet-dosyalari")
  @UseInterceptors(
    FilesInterceptor("files", 4, {
      fileFilter: (req, file, cb) => {
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        const mimeType = String(file?.mimetype || "").toLowerCase();
        if (ext === ".pdf" || mimeType === "application/pdf") {
          cb(null, true);
          return;
        }
        cb(new Error("Sadece PDF dosyasÄ± yÃ¼kleyebilirsiniz."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(process.cwd(), "uploads", "kyerp-data", "_fatura-kesim"),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadFaturaKesimIsnetFiles(
    @Param("id") id: string,
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    if (!Array.isArray(files) || !files.length) {
      throw new BadRequestException("En az bir PDF dosyasÄ± gereklidir.");
    }
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const parsedFiles = [];
    for (const file of files) {
      const extracted = await this.belgService.parseUploadedPdf(file, "");
      parsedFiles.push({
        file,
        parsed: parseKyDocumentFromPdfText(extracted.rawText || ""),
      });
    }
    return this.muhasebeFinal.registerFaturaKesimIsnetFiles(
      slug,
      id,
      parsedFiles,
      body,
    );
  }

  @Get("kesilen-faturalar")
  getSalesInvoices(@Query() query: any) {
    return this.salesInvoicePool.list(query);
  }

  @Post("kesilen-faturalar/yukle")
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { files: 500 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file?.originalname || "").toLowerCase();
        if ([".xml", ".pdf", ".zip"].includes(ext)) return cb(null, true);
        return cb(new Error("Yalnızca XML, PDF veya ZIP yüklenebilir."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(
            getStorageRoot(),
            "muhasebe",
            "musteri",
            "kesilen-fatura",
          ),
        ),
        filename: (_req, file, cb) => {
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizeFilePart(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadSalesInvoices(
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    const result = await this.salesInvoicePool.upload(body, files);
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    try {
      const reconciliation = await this.dispatchReconciliation.recalculate(slug, "sales-invoice-upload");
      return { ...result, reconciliation: reconciliation.data };
    } catch (error: any) {
      return { ...result, reconciliationWarning: error?.message || "İrsaliye eşleştirmesi daha sonra yenilenecek." };
    }
  }

  @Get("kesilen-faturalar/:invoiceId")
  getSalesInvoice(
    @Param("invoiceId") invoiceId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.salesInvoicePool.detail(slug, invoiceId);
  }

  @Get("kesilen-faturalar/:invoiceId/goruntule")
  previewSalesInvoice(
    @Param("invoiceId") invoiceId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.salesInvoicePool.detail(slug, invoiceId);
  }

  @Get("kesilen-faturalar/:invoiceId/kalemler")
  async getSalesInvoiceLines(
    @Param("invoiceId") invoiceId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const detail = await this.salesInvoicePool.detail(slug, invoiceId);
    return detail.lines;
  }

  @Get("kesilen-faturalar/:invoiceId/gecmis")
  async getSalesInvoiceHistory(
    @Param("invoiceId") invoiceId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const detail = await this.salesInvoicePool.detail(slug, invoiceId);
    return detail.history;
  }

  @Post("kesilen-faturalar/:invoiceId/cari-isle")
  processSalesInvoiceCari(
    @Param("invoiceId") invoiceId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.salesInvoicePool.processCari(slug, invoiceId);
  }

  @Patch("kesilen-faturalar/:invoiceId/kalemler/:lineId")
  updateSalesInvoiceLine(
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.salesInvoicePool.updateLine(slug, invoiceId, lineId, body);
  }

  @Post("kesilen-faturalar/:invoiceId/kalemler/:lineId/model-bagla")
  linkSalesInvoiceLineModel(
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.salesInvoicePool.linkModel(slug, invoiceId, lineId, body);
  }

  @Delete(
    "kesilen-faturalar/:invoiceId/kalemler/:lineId/model-baglantisi/:linkId",
  )
  removeSalesInvoiceLineModel(
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Param("linkId") linkId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.salesInvoicePool.removeLink(slug, invoiceId, lineId, linkId);
  }

  @Post("kesilen-faturalar/:invoiceId/kalemler/:lineId/model-disi")
  markSalesInvoiceLineOutside(
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.salesInvoicePool.markOutside(slug, invoiceId, lineId);
  }

  @Get("kesilen-faturalar/:invoiceId/dosya/:fileId")
  async viewSalesInvoiceFile(
    @Param("invoiceId") invoiceId: string,
    @Param("fileId") fileId: string,
    @Query("mainCompanySlug") mainCompanySlug: string,
    @Query("mainCompanyId") mainCompanyId: string,
    @Res() res: Response,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const file = await this.salesInvoicePool.file(slug, invoiceId, fileId);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    return res.sendFile(path.resolve(file.filePath));
  }

  @Get("yonetim-ozeti")
  getFinalYonetimOzeti(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeFinal.yonetimOzeti({
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
    });
  }

  @Get("yaklasan-odemeler")
  async getYaklasanOdemeler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const summary: any = await this.getFinalYonetimOzeti(
      mainCompanySlug,
      mainCompanyId,
    );
    const data = summary?.data || summary;
    const rows = Array.isArray(data?.yaklasanOdemeler)
      ? data.yaklasanOdemeler
      : [];
    return apiSuccess(rows);
  }

  @Get("belge-islem")
  getBelgeIslem(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.belgeHavuzu({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Get("fatura-yardimci")
  getFaturaYardimci(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeFinal.faturaKesimHavuz({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Post("fatura-kayit")
  createFaturaKayitCompat(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const recordId = String(
      body.id || body.recordId || body.documentId || body.faturaKesimId || "",
    ).trim();
    if (!recordId) {
      throw new BadRequestException(
        "fatura-kayit iÃ§in id/recordId/documentId alanlarÄ±ndan biri zorunludur.",
      );
    }
    return this.muhasebeFinal.createFaturaKesimInvoiceRecord(
      slug,
      recordId,
      body,
    );
  }

  @Get("raporlar")
  getFinalRaporlar(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeFinal.raporlar({
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
    });
  }

  @Get("rapor-kategorileri")
  getRaporKategorileri(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.listReportCategories(slug, query);
  }

  @Post("rapor-kategorileri")
  postRaporKategori(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.saveReportCategory(slug, body);
  }

  @Patch("rapor-kategorileri/:id")
  patchRaporKategori(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.saveReportCategory(slug, { ...body, id });
  }

  @Delete("rapor-kategorileri/:id")
  deleteRaporKategori(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.deleteReportCategory(slug, id);
  }

  @Get("rapor-kategori-eksikleri")
  getRaporKategoriEksikleri(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.listMissingCategoryCompanies(slug);
  }

  @Get("rapor-kategori-firmalari")
  getRaporKategoriFirmalari(@Query() query: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    return this.firmaKartlariDb.listReportCategoryCompanies(slug, query);
  }

  @Post("rapor-kategori-firmalari/ata")
  postRaporKategoriFirmaAta(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.assignReportCategoryToCompanies(slug, body);
  }

  @Get("rapor-ozet")
  getRaporOzet(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.buildPeriodReport(slug, query);
  }

  @Get("accounting/reports/records")
  getAccountingReportRecords(@Query() query: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    return this.firmaKartlariDb.buildReportControl(slug, query);
  }

  @Post("accounting/sync/company-rules")
  syncAccountingCompanyRules(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.syncCompanyAccountingRules(slug, body);
  }

  @Post("accounting/sync/hr-expenses")
  syncAccountingHrExpenses(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.syncHrAccountingExpenses(slug, body);
  }

  @Get("accounting/reports/summary")
  async getAccountingReportSummary(@Query() query: any) {
    const report = await this.getAccountingReportRecords(query);
    return apiSuccess((report as any).data?.summary || {});
  }

  @Get("accounting/reports/company-summary")
  async getAccountingReportCompanySummary(@Query() query: any) {
    const report = await this.getAccountingReportRecords(query);
    return apiSuccess((report as any).data?.companySummary || []);
  }

  @Get("accounting/reports/general-expenses")
  async getAccountingReportGeneralExpenses(@Query() query: any) {
    const report = await this.getAccountingReportRecords(query);
    return apiSuccess((report as any).data?.generalExpenses || []);
  }

  @Get("accounting/reports/vat-in")
  async getAccountingReportVatIn(@Query() query: any) {
    const report = await this.getAccountingReportRecords(query);
    return apiSuccess((report as any).data?.vatIn || []);
  }

  @Get("accounting/reports/vat-out")
  async getAccountingReportVatOut(@Query() query: any) {
    const report = await this.getAccountingReportRecords(query);
    return apiSuccess((report as any).data?.vatOut || []);
  }

  @Put("accounting/reports/record/:sourceType/:sourceId")
  putAccountingReportRecord(@Param("sourceType") sourceType: string, @Param("sourceId") sourceId: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.saveReportRecordOverride(slug, sourceType, sourceId, body);
  }

  @Post("accounting/reports/bulk-include")
  postAccountingReportBulkInclude(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.bulkSaveReportRecordOverride(slug, body, true);
  }

  @Post("accounting/reports/bulk-exclude")
  postAccountingReportBulkExclude(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.bulkSaveReportRecordOverride(slug, body, false);
  }

  @Post("accounting/reports/manual-expense")
  postAccountingReportManualExpense(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.saveManualReportItem(slug, body);
  }

  @Put("accounting/reports/manual-expense/:id")
  putAccountingReportManualExpense(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.saveManualReportItem(slug, { ...body, id });
  }

  @Delete("accounting/reports/manual-expense/:id")
  deleteAccountingReportManualExpense(@Param("id") id: string, @Query() query: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    return this.firmaKartlariDb.deleteManualReportItem(slug, id);
  }

  @Get("accounting/fixed-expenses")
  getFixedExpenseTemplates(@Query() query: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    return this.firmaKartlariDb.listFixedExpenseTemplates(slug, query);
  }

  @Post("accounting/fixed-expenses")
  postFixedExpenseTemplate(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.saveFixedExpenseTemplate(slug, body);
  }

  @Put("accounting/fixed-expenses/:id")
  putFixedExpenseTemplate(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.saveFixedExpenseTemplate(slug, { ...body, id });
  }

  @Post("accounting/fixed-expenses/:id/generate")
  generateFixedExpense(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.generateFixedExpense(slug, id, body.month);
  }

  @Post("accounting/fixed-expenses-generate-month")
  generateFixedExpensesForMonth(@Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.generateFixedExpensesForMonth(slug, body.month);
  }

  @Post("accounting/fixed-expenses/:id/copy")
  copyFixedExpenseTemplate(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId));
    return this.firmaKartlariDb.copyFixedExpenseTemplate(slug, id, body.targetMonth);
  }

  @Delete("accounting/fixed-expenses/:id")
  passiveFixedExpenseTemplate(@Param("id") id: string, @Query() query: any) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    return this.firmaKartlariDb.passiveFixedExpenseTemplate(slug, id);
  }

  @Get("accounting/reports/export")
  async exportAccountingReportControl(@Query() query: any, @Res() res: Response) {
    const slug = this.requireMainCompanySlug(this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId));
    const result: any = await this.firmaKartlariDb.buildReportControl(slug, query);
    const data = result.data || {};
    const workbook = new ExcelJS.Workbook();
    const moneyFormat = '₺#,##0.00;[Red]-₺#,##0.00';
    const styleSheet = (sheet: ExcelJS.Worksheet) => {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, sheet.columnCount) } };
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      sheet.getRow(1).height = 24;
      sheet.columns.forEach((column) => { column.width = Math.min(42, Math.max(12, Number(column.width || 12))); });
      sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) { if (rowNumber % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FC" } }; row.eachCell((cell) => { if (typeof cell.value === "number") cell.numFmt = moneyFormat; cell.border = { bottom: { style: "hair", color: { argb: "FFD9E2F3" } } }; }); } });
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    };
    const tabColors = ["FF4472C4", "FF70AD47", "FFFFC000", "FFED7D31", "FF5B9BD5", "FFA5A5A5", "FF7030A0", "FFC00000"];
    const addRows = (name: string, columns: any[], rows: any[]) => {
      const sheet = workbook.addWorksheet(name);
      sheet.properties.tabColor = { argb: tabColors[workbook.worksheets.length % tabColors.length] };
      sheet.columns = columns;
      rows.forEach((row) => sheet.addRow(row));
      styleSheet(sheet);
      return sheet;
    };
    const summary = data.summary || {};
    const summarySheet = workbook.addWorksheet("Genel Özet");
    summarySheet.properties.tabColor = { argb: "FF17365D" };
    summarySheet.columns = Array.from({ length: 8 }, () => ({ width: 18 }));
    summarySheet.mergeCells("A1:H2");
    summarySheet.getCell("A1").value = "KY ERP MUHASEBE YÖNETİCİ ÖZETİ";
    summarySheet.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
    summarySheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
    summarySheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    summarySheet.mergeCells("A3:H3");
    summarySheet.getCell("A3").value = `Dönem: ${data.filters?.startDate || ""} - ${data.filters?.endDate || ""}   |   Hazırlanma: ${new Date().toLocaleString("tr-TR")}`;
    summarySheet.getCell("A3").alignment = { horizontal: "center" };

    const addCard = (range: string, label: string, value: number, color: string, currency = true) => {
      summarySheet.mergeCells(range);
      const cell = summarySheet.getCell(range.split(":")[0]);
      cell.value = { richText: [
        { text: `${label}\n`, font: { bold: true, size: 10, color: { argb: "FFFFFFFF" } } },
        { text: currency ? Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" }) : Number(value || 0).toLocaleString("tr-TR"), font: { bold: true, size: 16, color: { argb: "FFFFFFFF" } } },
      ] };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    };
    addCard("A5:B7", "TOPLAM GELİR", summary.totalIncome, "FF2E7D32");
    addCard("C5:D7", "TOPLAM GİDER", summary.totalExpense, "FFC62828");
    addCard("E5:F7", "NET KÂR / ZARAR", summary.netResult, Number(summary.netResult || 0) >= 0 ? "FF1565C0" : "FFC62828");
    addCard("G5:H7", "DEVREDEN KDV", summary.carryVat, "FF6A1B9A");
    addCard("A9:B11", "GELEN KDV", summary.incomingVat, "FF0277BD");
    addCard("C9:D11", "GİDEN KDV", summary.outgoingVat, "FFEF6C00");
    addCard("E9:F11", "RAPORDAKİ FİRMA", (data.companySummary || []).filter((row: any) => row.reportStatus === "DAHIL").length, "FF455A64", false);
    addCard("G9:H11", "TOPLAM FİRMA", (data.companySummary || []).length, "FF455A64", false);

    const incomeFirms = (data.companySummary || []).filter((row: any) => Number(row.incomeTotal || 0) > 0)
      .sort((a: any, b: any) => Number(b.incomeTotal || 0) - Number(a.incomeTotal || 0)).slice(0, 8);
    const expenseCategoryMap = new Map<string, any>();
    (data.generalExpenses || []).forEach((row: any) => {
      const key = row.categoryId || row.category || "Kategorisiz";
      const item = expenseCategoryMap.get(key) || {
        category: row.category || "Kategorisiz",
        recordCount: 0,
        baseAmount: 0,
        vat: 0,
        total: 0,
        firms: new Set<string>(),
      };
      item.recordCount += 1;
      item.baseAmount += Number(row.baseAmount || 0);
      item.vat += Number(row.reportVatAmount || 0);
      item.total += Number(row.reportAmount || 0);
      item.firms.add(row.companyName || "Genel / firmasız gider");
      expenseCategoryMap.set(key, item);
    });
    const expenseCategories = [...expenseCategoryMap.values()].sort(
      (a: any, b: any) => b.total - a.total,
    );
    const writeRanking = (startColumn: number, title: string, rows: any[], valueKey: string, color: string) => {
      summarySheet.mergeCells(13, startColumn, 13, startColumn + 3);
      const titleCell = summarySheet.getCell(13, startColumn);
      titleCell.value = title;
      titleCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      summarySheet.mergeCells(14, startColumn, 14, startColumn + 1);
      summarySheet.getCell(14, startColumn).value = "Firma";
      summarySheet.getCell(14, startColumn + 2).value = "Tutar";
      summarySheet.getCell(14, startColumn + 3).value = "Gelire Oranı";
      rows.forEach((row: any, index: number) => {
        const line = 15 + index;
        summarySheet.mergeCells(line, startColumn, line, startColumn + 1);
        summarySheet.getCell(line, startColumn).value = row.companyName || "Firma bilgisi yok";
        summarySheet.getCell(line, startColumn + 2).value = Number(row[valueKey] || 0);
        summarySheet.getCell(line, startColumn + 2).numFmt = moneyFormat;
        summarySheet.getCell(line, startColumn + 3).value = Number(summary.totalIncome || 0) ? Number(row[valueKey] || 0) / Number(summary.totalIncome) : 0;
        summarySheet.getCell(line, startColumn + 3).numFmt = "0.0%";
      });
    };
    writeRanking(1, "NE GELDİ? - EN YÜKSEK GELİRLER", incomeFirms, "incomeTotal", "FF2E7D32");
    writeRanking(
      5,
      "NE GİTTİ? - GİDER KATEGORİLERİ",
      expenseCategories.slice(0, 8).map((row: any) => ({
        companyName: row.category,
        total: row.total,
      })),
      "total",
      "FFC62828",
    );
    summarySheet.views = [{ state: "frozen", ySplit: 3 }];
    summarySheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    summarySheet.getRow(1).height = 28;
    summarySheet.getRow(2).height = 28;
    addRows("Firma Bazlı Rapor", [
      { header: "Firma Adı", key: "companyName", width: 38 }, { header: "Firma Davranışı", key: "companyBehavior", width: 24 }, { header: "Resmi / Gayri", key: "officialType" },
      { header: "İlk Tarih", key: "firstDate" }, { header: "Son Tarih", key: "lastDate" }, { header: "Fatura Sayısı", key: "invoiceCount" },
      { header: "Matrah", key: "baseAmount" }, { header: "KDV", key: "vat" }, { header: "Genel Toplam", key: "grandTotal" },
      { header: "Genel Gidere Dahil", key: "generalExpenseTotal" }, { header: "Gelire Oranı", key: "expenseIncomeRatio" }, { header: "Rapor Durumu", key: "reportStatus" },
    ], (data.companySummary || []).map((row: any) => ({ ...row, expenseIncomeRatio: Number(summary.totalIncome || 0) ? Number(row.generalExpenseTotal || 0) / Number(summary.totalIncome) : 0 })));
    const companySheet = workbook.getWorksheet("Firma Bazlı Rapor");
    if (companySheet) { companySheet.getColumn("expenseIncomeRatio").numFmt = "0.0%"; companySheet.getColumn("invoiceCount").numFmt = "0"; }
    const detailColumns = [
      { header: "Tarih", key: "date" }, { header: "Firma", key: "companyName", width: 38 }, { header: "İşlem Türü", key: "sourceLabel" },
      { header: "Resmi / Gayri", key: "officialType" }, { header: "Kategori", key: "category", width: 24 }, { header: "Belge No", key: "documentNo", width: 20 },
      { header: "Açıklama", key: "reportDescription", width: 42 }, { header: "Matrah", key: "baseAmount" }, { header: "KDV", key: "reportVatAmount" },
      { header: "Genel Toplam", key: "grandTotal" }, { header: "Rapora Giren", key: "reportAmount" },
    ];
    const expenseCompanyMap = new Map<string, any>();
    (data.generalExpenses || []).forEach((row: any) => {
      const key = row.companyId || row.companyName || "Genel / firmasız gider";
      const item = expenseCompanyMap.get(key) || {
        companyName: row.companyName || "Genel / firmasız gider",
        categories: new Set<string>(),
        recordCount: 0,
        baseAmount: 0,
        vat: 0,
        total: 0,
      };
      item.recordCount += 1;
      item.baseAmount += Number(row.baseAmount || 0);
      item.vat += Number(row.reportVatAmount || 0);
      item.total += Number(row.reportAmount || 0);
      item.categories.add(row.category || "Kategorisiz");
      expenseCompanyMap.set(key, item);
    });
    const expenseCompanyRows = [...expenseCompanyMap.values()]
      .sort((a: any, b: any) => b.total - a.total)
      .map((row: any) => ({
        ...row,
        categories: [...row.categories].sort((a, b) => a.localeCompare(b, "tr")).join(", "),
        incomeRatio: Number(summary.totalIncome || 0)
          ? row.total / Number(summary.totalIncome)
          : 0,
      }));
    const expenseCompanySheet = addRows(
      "Gider - Firma Bazlı",
      [
        { header: "Firma", key: "companyName", width: 40 },
        { header: "Kategoriler", key: "categories", width: 38 },
        { header: "Gider Kaydı", key: "recordCount" },
        { header: "Matrah", key: "baseAmount" },
        { header: "KDV", key: "vat" },
        { header: "Toplam Gider", key: "total" },
        { header: "Toplam Gelire Oranı", key: "incomeRatio", width: 20 },
      ],
      expenseCompanyRows,
    );
    expenseCompanySheet.getColumn("recordCount").numFmt = "0";
    expenseCompanySheet.getColumn("incomeRatio").numFmt = "0.0%";

    const expenseCategoryRows = expenseCategories.map((row: any) => ({
      ...row,
      firms: [...row.firms].sort((a, b) => a.localeCompare(b, "tr")).join(", "),
      firmCount: row.firms.size,
      incomeRatio: Number(summary.totalIncome || 0)
        ? row.total / Number(summary.totalIncome)
        : 0,
    }));
    const expenseCategorySheet = addRows(
      "Gider - Kategori Bazlı",
      [
        { header: "Kategori", key: "category", width: 34 },
        { header: "Firmalar", key: "firms", width: 48 },
        { header: "Firma Sayısı", key: "firmCount" },
        { header: "Gider Kaydı", key: "recordCount" },
        { header: "Matrah", key: "baseAmount" },
        { header: "KDV", key: "vat" },
        { header: "Toplam Gider", key: "total" },
        { header: "Toplam Gelire Oranı", key: "incomeRatio", width: 20 },
      ],
      expenseCategoryRows,
    );
    expenseCategorySheet.getColumn("firmCount").numFmt = "0";
    expenseCategorySheet.getColumn("recordCount").numFmt = "0";
    expenseCategorySheet.getColumn("incomeRatio").numFmt = "0.0%";

    addRows("Firma Fatura Detayları", detailColumns, data.records || []);
    addRows("Genel Giderler", detailColumns, data.generalExpenses || []);
    addRows("Gelirler", detailColumns, (data.records || []).filter((row: any) => row.transactionType === "GELIR" && row.reportIncluded === true));
    addRows("Gelen KDV", detailColumns, data.vatIn || []);
    addRows("Giden KDV", detailColumns, data.vatOut || []);
    const buffer = await workbook.xlsx.writeBuffer();
    const period = String(data.filters?.startDate || new Date().toISOString().slice(0, 7)).slice(0, 7).replace("-", "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="KY_ERP_Muhasebe_Raporu_${period}.xlsx"`);
    res.send(Buffer.from(buffer));
  }

  @Get("rapor-manuel-kalemler")
  getRaporManuelKalemler(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.listManualReportItems(slug, query);
  }

  @Post("rapor-manuel-kalemler")
  postRaporManuelKalem(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.saveManualReportItem(slug, body);
  }

  @Patch("rapor-manuel-kalemler/:id")
  patchRaporManuelKalem(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.saveManualReportItem(slug, { ...body, id });
  }

  @Delete("rapor-manuel-kalemler/:id")
  deleteRaporManuelKalem(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.deleteManualReportItem(slug, id);
  }

  @Get("rapor-ayarlari")
  async getRaporAyarlari(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    const rows = await this.prisma.setting.findMany({
      where: { mainCompanySlug: slug, scope: "MUHASEBE_RAPOR", deletedAt: null },
      orderBy: { key: "asc" },
    });
    return apiSuccess(rows);
  }

  @Post("rapor-ayarlari")
  async postRaporAyari(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const key = String(body.key || "kategori_gorunurluk").trim();
    const saved = await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "MUHASEBE_RAPOR",
          mainCompanySlug: slug,
          key,
        },
      },
      create: {
        scope: "MUHASEBE_RAPOR",
        mainCompanySlug: slug,
        key,
        value: body.value || {},
      },
      update: { value: body.value || {}, deletedAt: null },
    });
    return apiSuccess(saved);
  }

  @Patch("rapor-ayarlari/:id")
  async patchRaporAyari(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const saved = await this.prisma.setting.update({
      where: { id },
      data: { value: body.value || {}, mainCompanySlug: slug },
    });
    return apiSuccess(saved);
  }

  @Get("rapor-excel")
  async getRaporExcel(@Query() query: any, @Res() res?: Response) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    const payload: any = await this.firmaKartlariDb.buildPeriodReport(slug, query);
    const report = payload?.data || payload;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "KY ERP";
    workbook.company = "KY ERP";
    workbook.subject = "Muhasebe Dönem Özeti";
    const moneyFormat = '₺#,##0.00;[Red]-₺#,##0.00';
    const applyHeaderStyle = (sheet: ExcelJS.Worksheet, row = 1) => {
      const header = sheet.getRow(row);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" },
      };
      header.alignment = { vertical: "middle", horizontal: "center" };
    };
    const applyTableStyle = (sheet: ExcelJS.Worksheet, moneyColumns: number[] = []) => {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: Math.max(1, sheet.columnCount) },
      };
      applyHeaderStyle(sheet);
      moneyColumns.forEach((index) => {
        sheet.getColumn(index).numFmt = moneyFormat;
      });
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD9E2F3" } },
            left: { style: "thin", color: { argb: "FFD9E2F3" } },
            bottom: { style: "thin", color: { argb: "FFD9E2F3" } },
            right: { style: "thin", color: { argb: "FFD9E2F3" } },
          };
        });
        if (rowNumber % 2 === 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF7FAFC" },
          };
        }
      });
    };
    const addKpiCard = (
      sheet: ExcelJS.Worksheet,
      title: string,
      value: number | string,
      row: number,
      column: number,
      color: string,
    ) => {
      sheet.mergeCells(row, column, row, column + 2);
      sheet.mergeCells(row + 1, column, row + 2, column + 2);
      const titleCell = sheet.getCell(row, column);
      const valueCell = sheet.getCell(row + 1, column);
      titleCell.value = title;
      valueCell.value = value;
      [titleCell, valueCell].forEach((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: cell === valueCell ? 16 : 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      if (typeof value === "number") valueCell.numFmt = moneyFormat;
    };
    const summary = workbook.addWorksheet("DONEM OZETI");
    summary.columns = [
      { header: "Alan", key: "alan", width: 34 },
      { header: "Tutar", key: "tutar", width: 18 },
    ];
    const ana = report.anaOzet || {};
    [
      ["Tarih Araligi", `${report.filtreBilgisi?.baslangic || ""} - ${report.filtreBilgisi?.bitis || ""}`],
      ["Kesilen Fatura", ana.kesilenFatura?.toplam || 0],
      ["Kesilen Fatura KDV", ana.kesilenFatura?.kdv || 0],
      ["Resmi Gelen Fatura", ana.gelenFaturalar?.resmiToplam || 0],
      ["Gayri Resmi Gider", ana.gelenFaturalar?.gayriResmiToplam || 0],
      ["Gelen KDV", ana.kdvDurumu?.gelenKdv || 0],
      ["Devreden KDV", ana.kdvDurumu?.devredenKdv || 0],
      ["Odenecek KDV", ana.kdvDurumu?.odenecekKdv || 0],
      ["Devredecek KDV", ana.kdvDurumu?.devredecekKdv || 0],
      ["Personel", ana.personelIsletme?.personel || 0],
      ["Yemek", ana.personelIsletme?.yemek || 0],
      ["Haftalik", ana.personelIsletme?.haftalik || 0],
      ["Yevmiyeci", ana.personelIsletme?.yevmiyeci || 0],
      ["Toplam Gider", ana.gelenFaturalar?.toplam || 0],
    ].forEach(([alan, tutar]) => summary.addRow({ alan, tutar }));
    const categorySheet = workbook.addWorksheet("KATEGORI OZETI");
    categorySheet.columns = [
      { header: "Kategori", key: "kategori", width: 34 },
      { header: "Belge Adedi", key: "belgeAdedi", width: 14 },
      { header: "Matrah", key: "matrah", width: 16 },
      { header: "KDV", key: "kdv", width: 16 },
      { header: "Genel Toplam", key: "genelToplam", width: 18 },
    ];
    (report.kategoriOzetleri || []).forEach((row: any) => categorySheet.addRow(row));
    const movementSheet = workbook.addWorksheet("HAREKET LISTESI");
    movementSheet.columns = [
      { header: "Tarih", key: "tarih", width: 14 },
      { header: "Tur", key: "turEtiketi", width: 18 },
      { header: "Kategori", key: "kategori", width: 32 },
      { header: "Firma", key: "firma", width: 34 },
      { header: "Belge No", key: "belgeNo", width: 18 },
      { header: "Aciklama", key: "aciklama", width: 42 },
      { header: "Tutar", key: "tutar", width: 16 },
      { header: "KDV", key: "kdv", width: 16 },
      { header: "Genel Toplam", key: "genelToplam", width: 18 },
    ];
    (report.hareketler || []).forEach((row: any) => movementSheet.addRow(row));
    const dashboard = workbook.addWorksheet("DASHBOARD");
    dashboard.views = [{ state: "frozen", ySplit: 4 }];
    dashboard.columns = [
      { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }, { width: 26 }, { width: 16 }, { width: 16 },
    ];
    dashboard.mergeCells("A1:G1");
    dashboard.getCell("A1").value = "Muhasebe Dönem Dashboard";
    dashboard.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF0F172A" } };
    dashboard.getCell("A1").alignment = { horizontal: "center" };
    dashboard.mergeCells("A2:G2");
    dashboard.getCell("A2").value = `${report.filtreBilgisi?.baslangic || ""} - ${report.filtreBilgisi?.bitis || ""}`;
    dashboard.getCell("A2").alignment = { horizontal: "center" };
    addKpiCard(dashboard, "Toplam Gider", ana.gelenFaturalar?.toplam || 0, 4, 1, "FFE11D48");
    addKpiCard(dashboard, "Toplam Gelir", ana.kesilenFatura?.toplam || 0, 4, 5, "FF0F766E");
    addKpiCard(dashboard, "Gelen KDV", ana.kdvDurumu?.gelenKdv || 0, 8, 1, "FF2563EB");
    addKpiCard(dashboard, "Ödenecek KDV", ana.kdvDurumu?.odenecekKdv || 0, 8, 5, "FFF59E0B");
    dashboard.getCell("A13").value = "En Büyük 10 Gider Kategorisi";
    dashboard.getCell("E13").value = "En Büyük 10 Firma";
    dashboard.getCell("A13").font = dashboard.getCell("E13").font = { bold: true, size: 12, color: { argb: "FF1F2937" } };
    applyHeaderStyle(dashboard, 14);
    dashboard.getRow(14).values = ["Kategori", "Belge", "Matrah", "Genel Toplam", "Firma", "Belge", "Genel Toplam"];
    const topCategories = [...(report.kategoriOzetleri || [])].sort((a: any, b: any) => Number(b.genelToplam || 0) - Number(a.genelToplam || 0)).slice(0, 10);
    const topFirmsMap = new Map<string, { firma: string; belge: number; toplam: number }>();
    for (const row of report.hareketler || []) {
      const key = String(row.firma || "Firma Yok");
      const current = topFirmsMap.get(key) || { firma: key, belge: 0, toplam: 0 };
      current.belge += 1;
      current.toplam += Number(row.genelToplam || 0);
      topFirmsMap.set(key, current);
    }
    const topFirms = [...topFirmsMap.values()].sort((a, b) => b.toplam - a.toplam).slice(0, 10);
    const maxRows = Math.max(topCategories.length, topFirms.length, 1);
    for (let i = 0; i < maxRows; i += 1) {
      const left = topCategories[i];
      const right = topFirms[i];
      dashboard.addRow([
        left?.kategori || "",
        Number(left?.belgeAdedi || 0),
        Number(left?.matrah || 0),
        Number(left?.genelToplam || 0),
        right?.firma || "",
        Number(right?.belge || 0),
        Number(right?.toplam || 0),
      ]);
    }
    dashboard.getColumn(3).numFmt = moneyFormat;
    dashboard.getColumn(4).numFmt = moneyFormat;
    dashboard.getColumn(7).numFmt = moneyFormat;
    summary.getColumn(2).numFmt = moneyFormat;
    applyTableStyle(summary, [2]);
    applyTableStyle(categorySheet, [3, 4, 5]);
    applyTableStyle(movementSheet, [7, 8, 9]);
    applyTableStyle(dashboard, [3, 4, 7]);
    const buffer = await workbook.xlsx.writeBuffer();
    res
      ?.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .setHeader(
        "Content-Disposition",
        `attachment; filename="muhasebe-donem-ozeti-${Date.now()}.xlsx"`,
      )
      .send(Buffer.from(buffer));
  }

  @Get("raporlar/:tip")
  getFinalRapor(
    @Param("tip") tip: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const yeniRaporTipleri = new Set([
      "yonetici-ozet",
      "satis-musteri",
      "tedarikci-satin-alma",
      "pesin-giderler",
      "personel-giderleri",
      "kdv-ozet",
      "nakit-cek-ozet",
      "isveren-ozeti",
    ]);
    if (yeniRaporTipleri.has(String(tip || ""))) {
      return this.firmaKartlariDb.buildAccountingReport(
        this.requireMainCompanySlug(
          this.resolveDbSlug(mainCompanySlug, mainCompanyId),
        ),
        tip === "isveren-ozeti" ? "yonetici-ozet" : tip,
        query,
      );
    }
    return this.muhasebeFinal.rapor(
      {
        ...query,
        mainCompanySlug: this.requireMainCompanySlug(
          this.resolveDbSlug(mainCompanySlug, mainCompanyId),
        ),
      },
      tip,
    );
  }

  @Get("isveren-ozeti")
  getIsverenOzeti(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.firmaKartlariDb.buildAccountingReport(
      this.requireMainCompanySlug(this.resolveDbSlug(mainCompanySlug, mainCompanyId)),
      "yonetici-ozet",
      query,
    );
  }

  @Post("raporlar/excel-paketi")
  async createReportExcelPackage(@Body() body: any, @Res() res?: Response) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const report = await this.firmaKartlariDb.buildAccountingReport(
      slug,
      body.tip || "yonetici-ozet",
      body,
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "KY ERP";
    const summarySheet = workbook.addWorksheet("Yonetici Ozeti");
    summarySheet.columns = [
      { header: "Alan", key: "label", width: 32 },
      { header: "Tutar", key: "value", width: 18 },
    ];
    (report.summaryCards || []).forEach((row: any) => summarySheet.addRow(row));
    for (const [key, section] of Object.entries(report.sections || {})) {
      const sheet = workbook.addWorksheet(String(key).slice(0, 31));
      sheet.columns = [
        { header: "Tarih", key: "tarih", width: 14 },
        { header: "Firma", key: "firmaAdi", width: 32 },
        { header: "Alan", key: "alan", width: 28 },
        { header: "Profil", key: "profile", width: 18 },
        { header: "Belge No", key: "belgeNo", width: 18 },
        { header: "Aciklama", key: "aciklama", width: 40 },
        { header: "Tutar", key: "tutar", width: 18 },
      ];
      ((section as any).rows || []).forEach((row: any) => sheet.addRow(row));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    res
      ?.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .setHeader(
        "Content-Disposition",
        `attachment; filename="kyerp-muhasebe-rapor-paketi-${Date.now()}.xlsx"`,
      )
      .send(Buffer.from(buffer));
  }

  @Post("raporlar/manuel-duzenleme")
  async saveReportManualAdjustments(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.saveAccountingReportAdjustments(slug, body);
  }

  @Get("raporlar/:tip/yazdir")
  async getFinalPrintableRapor(
    @Param("tip") tip: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
    @Res() res?: Response,
  ) {
    const html = await this.muhasebeFinal.printableReport(
      {
        ...query,
        mainCompanySlug: this.requireMainCompanySlug(
          this.resolveDbSlug(mainCompanySlug, mainCompanyId),
        ),
      },
      tip,
    );
    res?.type("html").send(html);
  }

  @Get("settings/document-folders")
  getDocumentFolderSettings(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.folderWatcher.listFolderSettings(slug);
  }

  @Post("settings/document-folders")
  saveDocumentFolderSettings(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.saveFolderSettings(
      slug,
      body.rows || body.folders || [],
    );
  }

  @Patch("settings/document-folders/:id")
  updateDocumentFolderSetting(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.updateFolderSetting(slug, id, body);
  }

  @Post("folder-watch/start")
  startFolderWatch(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.start(slug);
  }

  @Post("folder-watch/stop")
  stopFolderWatch(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.stop(slug);
  }

  @Post("folder-watch/scan-now")
  scanFoldersNow(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.scanNow(
      slug,
      body.folderSettingId || body.folderId,
      body.folderKey,
    );
  }

  @Get("folder-watch/status")
  folderWatchStatus(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.folderWatcher.status(slug);
  }

  @Post("folder-watch/retry-failed")
  retryFailedFolderWatch(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.retryFailed(slug);
  }

  @Post("folder-watch/open-folder")
  openWatchedFolder(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.openFolder(
      slug,
      body.folderSettingId || body.folderId,
      body.folderPath,
    );
  }

  @Get("document-read-templates")
  listDocumentReadTemplates(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.folderWatcher.listTemplates(slug);
  }

  @Post("document-read-templates")
  saveDocumentReadTemplate(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.saveTemplate(slug, body);
  }

  @Patch("document-read-templates/:id")
  updateDocumentReadTemplate(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.folderWatcher.updateTemplate(slug, id, body);
  }

  @Delete("document-read-templates/:id")
  deleteDocumentReadTemplate(
    @Param("id") id: string,
    @Body() body: any,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(
        body?.mainCompanySlug || mainCompanySlug,
        body?.mainCompanyId || mainCompanyId,
      ),
    );
    return this.folderWatcher.deleteTemplate(slug, id);
  }

  @Post("belge-havuzu/:id/tekrar-tasnif-et")
  reprocessBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.reprocessDocument(slug, id);
  }

  @Post("belge-havuzu/yeniden-isle")
  reprocessPendingBelgeHavuzu(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.reprocessPendingDocuments(slug);
  }

  @Post("belge-yukleme/tasnif-bekleyenleri-yeniden-isle")
  reprocessPendingUploads(@Body() body: any) {
    return this.reprocessPendingBelgeHavuzu(body);
  }

  @Post("belge-yukleme/:id/tekrar-tasnif")
  reprocessUpload(@Param("id") id: string, @Body() body: any) {
    return this.reprocessBelgeHavuzu(id, body);
  }

  @Patch("belge-yukleme/:id/sil")
  softDeleteUpload(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.softDeleteDocument(slug, id, body);
  }

  @Post("belge-yukleme/eski-kayitlari-temizle")
  cleanupOldDocumentUploads(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.cleanupOldDocumentRecords(slug, body);
  }

  @Patch("belge-havuzu/:id/sil")
  softDeleteBelgeHavuzu(@Param("id") id: string, @Body() body: any) {
    return this.softDeleteUpload(id, body);
  }

  @Get("models")
  listAvailableModels(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("q") q?: string,
    @Query("firma") firma?: string,
  ) {
    return this.documentWorkflowService.listAvailableModels(
      mainCompanySlug,
      mainCompanyId,
      { q, firma },
    );
  }

  private cleanModelText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private modelNumber(value: any) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private modelMuhasebeDocumentTypeLabel(value: any) {
    const type = this.cleanModelText(value).toLocaleLowerCase("tr-TR");
    if (type === "musteriden_gelen_irsaliye")
      return "MÃ¼ÅŸteriden Gelen Ä°rsaliye";
    if (type === "bizim_kestigimiz_irsaliye") return "Bizim Ä°rsaliye";
    if (type === "bizim_kestigimiz_fatura") return "Bizim Fatura";
    return this.cleanModelText(value) || "Belge";
  }

  private modelMuhasebePackageKey(doc: any) {
    const type = this.cleanModelText(doc?.belgeTipi || doc?.documentType);
    const linkedDispatchNo = this.cleanModelText(doc?.bagliIrsaliyeNo);
    const linkedDispatchId = this.cleanModelText(doc?.bagliIrsaliyeId);
    const dispatchNo = this.cleanModelText(doc?.irsaliyeNo);
    const belgeNo = this.cleanModelText(doc?.belgeNo || doc?.documentNo);
    const currentId = this.cleanModelText(doc?.id);

    if (type === "bizim_kestigimiz_fatura") {
      return (
        linkedDispatchNo ||
        linkedDispatchId ||
        dispatchNo ||
        belgeNo ||
        currentId
      );
    }
    return dispatchNo || belgeNo || currentId;
  }

  private modelMuhasebeDocumentQty(doc: any) {
    const sourceLines = Array.isArray(doc?.invoiceItems)
      ? doc.invoiceItems
      : Array.isArray(doc?.kalemler)
        ? doc.kalemler
        : [];
    const lineTotal = sourceLines.reduce(
      (sum: number, line: any) =>
        sum + this.modelNumber(line?.quantity ?? line?.miktar ?? line?.adet),
      0,
    );
    return lineTotal || this.modelNumber(doc?.gelenAdet ?? doc?.adet);
  }

  private modelMuhasebeLineText(value: any) {
    return this.cleanModelText(value);
  }

  private modelMuhasebeSourceLines(doc: any) {
    const source = Array.isArray(doc?.invoiceItems)
      ? doc.invoiceItems
      : Array.isArray(doc?.kalemler)
        ? doc.kalemler
        : [];
    if (source.length) return source;
    return [
      {
        description:
          doc?.aciklama ||
          doc?.taslakAlanlar?.aciklama ||
          this.modelMuhasebeDocumentTypeLabel(
            doc?.belgeTipi || doc?.documentType,
          ),
        quantity: this.modelMuhasebeDocumentQty(doc),
      },
    ];
  }

  private modelMuhasebeLineMaterialNo(line: any) {
    return this.modelMuhasebeLineText(
      line?.materialNo ||
        line?.malzemeNo ||
        line?.itemCode ||
        line?.productCode ||
        line?.code ||
        line?.raw?.materialNo ||
        line?.raw?.malzemeNo,
    );
  }

  private modelMuhasebeLineOrderNo(line: any, doc: any) {
    return this.modelMuhasebeLineText(
      line?.orderNo ||
        line?.siparisNo ||
        line?.siparisNumarasi ||
        line?.orderNumber ||
        line?.purchaseOrderNo ||
        line?.musteriSiparisNo ||
        line?.raw?.orderNo ||
        line?.raw?.siparisNo ||
        doc?.taslakAlanlar?.siparisNo ||
        doc?.siparisNo,
    );
  }

  private modelMuhasebeLineDescription(line: any, doc: any) {
    return this.modelMuhasebeLineText(
      line?.description ||
        line?.productName ||
        line?.rawDescription ||
        line?.aciklama ||
        line?.raw?.description ||
        line?.raw?.rawDescription ||
        doc?.aciklama ||
        doc?.taslakAlanlar?.aciklama ||
        this.modelMuhasebeDocumentTypeLabel(
          doc?.belgeTipi || doc?.documentType,
        ),
    );
  }

  private modelMuhasebeLineCandidateModelName(line: any, doc: any) {
    return this.modelMuhasebeLineText(
      line?.candidateModelName ||
        line?.modelName ||
        line?.modelAdi ||
        line?.modelAdiOnerisi ||
        line?.modelSuggestion ||
        line?.raw?.modelAdi ||
        line?.raw?.modelAdiOnerisi ||
        doc?.guessedModelName ||
        doc?.modelAdi,
    );
  }

  private modelMuhasebeLineBindingKey(
    packageId: string,
    line: any,
    doc: any,
    index: number,
  ) {
    const dispatchNo = this.cleanModelText(
      doc?.irsaliyeNo || doc?.belgeNo || doc?.documentNo || packageId,
    );
    const orderNo = this.modelMuhasebeLineOrderNo(line, doc);
    const modelToken =
      this.modelMuhasebeLineCandidateModelName(line, doc) ||
      this.modelMuhasebeLineDescription(line, doc) ||
      this.modelMuhasebeLineMaterialNo(line) ||
      `satir-${index + 1}`;
    const materialNo = this.modelMuhasebeLineMaterialNo(line);
    return [
      dispatchNo || packageId,
      modelToken,
      orderNo || materialNo || `satir-${index + 1}`,
    ]
      .map((item) => this.cleanModelText(item).toLocaleLowerCase("tr-TR"))
      .join("|");
  }

  private buildModelMuhasebeRows(packageId: string, docs: any[]) {
    const grouped = new Map<string, any>();
    for (const doc of docs) {
      const docType = this.cleanModelText(doc?.belgeTipi || doc?.documentType);
      const savedLines: any[] = Array.isArray(doc?.raw?.modelMuhasebe?.lines)
        ? doc.raw.modelMuhasebe.lines
        : [];
      const savedMap = new Map<string, any>(
        savedLines.map((line: any, index: number) => [
          this.cleanModelText(line?.bindingKey) ||
            this.modelMuhasebeLineBindingKey(packageId, line, doc, index),
          line,
        ]),
      );
      const sourceLines = this.modelMuhasebeSourceLines(doc);
      sourceLines.forEach((line: any, index: number) => {
        const bindingKey =
          this.cleanModelText(line?.bindingKey) ||
          this.modelMuhasebeLineBindingKey(packageId, line, doc, index);
        const savedLine = savedMap.get(bindingKey) || {};
        const quantity = this.modelNumber(
          line?.quantity ??
            line?.miktar ??
            line?.adet ??
            line?.incomingQty ??
            (sourceLines.length === 1 ? this.modelMuhasebeDocumentQty(doc) : 0),
        );
        const row = grouped.get(bindingKey) || {
          id: bindingKey,
          bindingKey,
          sourceDispatchNo: packageId,
          materialNo: this.modelMuhasebeLineMaterialNo(line),
          description: this.modelMuhasebeLineDescription(line, doc),
          candidateModelName:
            this.modelMuhasebeLineCandidateModelName(savedLine, doc) ||
            this.modelMuhasebeLineCandidateModelName(line, doc),
          modelId: this.cleanModelText(savedLine?.modelId || line?.modelId),
          modelName: this.cleanModelText(
            savedLine?.modelName ||
              savedLine?.modelAdi ||
              line?.modelName ||
              line?.modelAdi,
          ),
          companyName: this.cleanModelText(doc?.companyName || doc?.firma),
          orderNo:
            this.modelMuhasebeLineOrderNo(savedLine, doc) ||
            this.modelMuhasebeLineOrderNo(line, doc),
          incomingQty: 0,
          ourDispatchQty: 0,
          invoiceQty: 0,
          printStructure: this.cleanModelText(
            savedLine?.printStructure ||
              line?.printStructure ||
              doc?.raw?.modelMuhasebe?.printStructure ||
              doc?.taslakAlanlar?.printStructure ||
              "Diger",
          ),
          documentTypeLabels: [],
          documentRefs: [],
        };

        if (docType === "musteriden_gelen_irsaliye")
          row.incomingQty += quantity;
        if (docType === "bizim_kestigimiz_irsaliye")
          row.ourDispatchQty += quantity;
        if (docType === "bizim_kestigimiz_fatura") row.invoiceQty += quantity;

        row.materialNo =
          row.materialNo || this.modelMuhasebeLineMaterialNo(line);
        row.description =
          row.description || this.modelMuhasebeLineDescription(line, doc);
        row.candidateModelName =
          row.candidateModelName ||
          this.modelMuhasebeLineCandidateModelName(line, doc);
        row.orderNo = row.orderNo || this.modelMuhasebeLineOrderNo(line, doc);
        row.modelId = row.modelId || this.cleanModelText(savedLine?.modelId);
        row.modelName =
          row.modelName ||
          this.cleanModelText(savedLine?.modelName || savedLine?.modelAdi);
        row.printStructure =
          row.printStructure || this.cleanModelText(savedLine?.printStructure);
        row.documentTypeLabels = Array.from(
          new Set([
            ...row.documentTypeLabels,
            this.modelMuhasebeDocumentTypeLabel(docType),
          ]),
        );
        row.documentRefs = row.documentRefs.some(
          (item: any) => item.id === doc.id,
        )
          ? row.documentRefs
          : [
              ...row.documentRefs,
              {
                id: doc.id,
                belgeNo: this.cleanModelText(
                  doc?.belgeNo || doc?.documentNo || doc?.id,
                ),
                documentTypeLabel: this.modelMuhasebeDocumentTypeLabel(docType),
              },
            ];
        grouped.set(bindingKey, row);
      });
    }

    return Array.from(grouped.values())
      .sort((left, right) => {
        const leftKey = `${left.orderNo || ""}-${left.description || ""}-${left.materialNo || ""}`;
        const rightKey = `${right.orderNo || ""}-${right.description || ""}-${right.materialNo || ""}`;
        return leftKey.localeCompare(rightKey, "tr");
      })
      .map((row, index) =>
        this.normalizeModelMuhasebeLine(
          {
            ...row,
            sira: index + 1,
          },
          index,
        ),
      );
  }

  private buildModelMuhasebePackageSummary(
    packageId: string,
    docs: any[],
    rows?: any[],
  ) {
    const packageRows = Array.isArray(rows)
      ? rows
      : this.buildModelMuhasebeRows(packageId, docs);
    const orderedDocs = docs.slice().sort((left: any, right: any) => {
      const order = [
        "musteriden_gelen_irsaliye",
        "bizim_kestigimiz_irsaliye",
        "bizim_kestigimiz_fatura",
      ];
      return (
        order.indexOf(
          this.cleanModelText(left?.belgeTipi || left?.documentType),
        ) -
        order.indexOf(
          this.cleanModelText(right?.belgeTipi || right?.documentType),
        )
      );
    });
    const primaryDoc = orderedDocs[0] || {};
    const uniqueModels = Array.from(
      new Set(
        packageRows
          .map((row: any) =>
            this.cleanModelText(row?.modelName || row?.modelAdi),
          )
          .filter(Boolean),
      ),
    );
    const uniqueModelIds = Array.from(
      new Set(
        packageRows
          .map((row: any) => this.cleanModelText(row?.modelId))
          .filter(Boolean),
      ),
    );
    const incomingQty = packageRows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row?.incomingQty),
      0,
    );
    const ourDispatchQty = packageRows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row?.ourDispatchQty),
      0,
    );
    const invoiceQty = packageRows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row?.invoiceQty),
      0,
    );
    const waitingCount = packageRows.filter(
      (row: any) => row.status !== "Tamam",
    ).length;

    return {
      packageId,
      companyName: this.cleanModelText(
        primaryDoc?.firma || primaryDoc?.companyName,
      ),
      belgeNo: this.cleanModelText(
        primaryDoc?.belgeNo || primaryDoc?.documentNo || packageId,
      ),
      documentTypes: orderedDocs.map((doc: any) =>
        this.modelMuhasebeDocumentTypeLabel(
          doc?.belgeTipi || doc?.documentType,
        ),
      ),
      modelId: uniqueModelIds.length === 1 ? uniqueModelIds[0] : "",
      modelName: uniqueModels.length === 1 ? uniqueModels[0] : "",
      lineCount: packageRows.length,
      waitingCount,
      incomingQty,
      ourDispatchQty,
      invoiceQty,
      dispatchDiff: incomingQty - ourDispatchQty,
      invoiceDiff: incomingQty - invoiceQty,
      waiting: waitingCount > 0,
      documents: orderedDocs.map((doc: any) => ({
        id: doc.id,
        belgeNo: this.cleanModelText(
          doc?.belgeNo || doc?.documentNo || doc?.id,
        ),
        documentType: this.cleanModelText(doc?.belgeTipi || doc?.documentType),
        documentTypeLabel: this.modelMuhasebeDocumentTypeLabel(
          doc?.belgeTipi || doc?.documentType,
        ),
        qty: this.modelMuhasebeDocumentQty(doc),
        lineCount: this.modelMuhasebeSourceLines(doc).length,
        status: this.cleanModelText(doc?.durum || doc?.status),
      })),
    };
  }

  private buildModelMuhasebePackageList(docs: any[]) {
    const packageMap = new Map<string, any[]>();
    for (const doc of docs) {
      const packageId = this.modelMuhasebePackageKey(doc);
      if (!packageId) continue;
      const group = packageMap.get(packageId) || [];
      group.push(doc);
      packageMap.set(packageId, group);
    }
    return Array.from(packageMap.entries())
      .map(([packageId, groupedDocs]) =>
        this.buildModelMuhasebePackageSummary(packageId, groupedDocs),
      )
      .filter((item) => item.waiting)
      .sort((left, right) =>
        `${right.belgeNo}-${right.packageId}`.localeCompare(
          `${left.belgeNo}-${left.packageId}`,
          "tr",
        ),
      );
  }

  private normalizeModelMuhasebeLine(line: any, index: number) {
    const incomingQty = this.modelNumber(
      line.incomingQty ?? line.gelenAdet ?? line.quantity,
    );
    const ourDispatchQty = this.modelNumber(
      line.ourDispatchQty ?? line.bizimIrsaliyeAdedi,
    );
    const invoiceQty = this.modelNumber(line.invoiceQty ?? line.faturaAdedi);
    const unitPrice = this.modelNumber(line.unitPrice ?? line.birimFiyat);
    const invoicePrice = this.modelNumber(
      line.invoicePrice ?? line.faturaFiyat ?? unitPrice,
    );
    const remainingQty = incomingQty - invoiceQty;
    const remainingAmount = remainingQty * unitPrice;
    const status = !this.cleanModelText(line.modelId || line.modelName)
      ? "Kontrol Bekliyor"
      : invoiceQty > incomingQty || ourDispatchQty > incomingQty
        ? "Kontrol Bekliyor"
        : invoiceQty < incomingQty || ourDispatchQty < incomingQty
          ? "Kismi"
          : Math.abs(unitPrice - invoicePrice) > 0.0001
            ? "Kontrol Bekliyor"
            : "Tamam";

    return {
      id: this.cleanModelText(line.id) || `line-${index + 1}`,
      sira: index + 1,
      materialNo: this.cleanModelText(line.materialNo || line.malzemeNo),
      description: this.cleanModelText(line.description || line.aciklama),
      modelId: this.cleanModelText(line.modelId),
      modelName: this.cleanModelText(line.modelName || line.modelAdi),
      modelImageUrl: this.cleanModelText(
        line.modelImageUrl || line.previewUrl || line.thumbnailUrl,
      ),
      companyName: this.cleanModelText(line.companyName || line.firma),
      orderNo: this.cleanModelText(line.orderNo || line.siparisNo),
      repete: this.cleanModelText(line.repete),
      incomingQty,
      ourDispatchQty,
      invoiceQty,
      unitPrice,
      invoicePrice,
      remainingQty,
      remainingAmount,
      printStructure: this.cleanModelText(line.printStructure || "Diger"),
      status,
    };
  }

  private splitPrintAreas(printStructure: string) {
    const normalized = this.cleanModelText(printStructure)
      .toLocaleLowerCase("tr-TR")
      .replace(/\+/g, " + ");
    if (
      normalized.includes("on") &&
      normalized.includes("arka") &&
      normalized.includes("2 kol")
    ) {
      return ["On Baski", "Arka Baski", "Sag Kol", "Sol Kol"];
    }
    if (normalized.includes("on") && normalized.includes("2 kol")) {
      return ["On Baski", "Sag Kol", "Sol Kol"];
    }
    if (normalized.includes("iki kol") || normalized.includes("2 kol")) {
      return ["Sag Kol", "Sol Kol"];
    }
    if (normalized.includes("on") && normalized.includes("arka")) {
      return ["On Baski", "Arka Baski"];
    }
    if (normalized.includes("sag kol")) return ["Sag Kol"];
    if (normalized.includes("sol kol")) return ["Sol Kol"];
    if (normalized.includes("arka")) return ["Arka Baski"];
    if (normalized.includes("on")) return ["On Baski"];
    if (normalized.includes("ense")) return ["Ense"];
    if (normalized.includes("cep")) return ["Cep"];
    return ["Diger"];
  }

  private buildProductionPlanDrafts(rows: any[]) {
    const drafts: any[] = [];
    for (const row of rows) {
      if (!row.modelId || !row.incomingQty || !row.printStructure) continue;
      const areas = this.splitPrintAreas(row.printStructure);
      for (const area of areas) {
        drafts.push({
          modelOrderLineId: row.id,
          modelId: row.modelId,
          modelName: row.modelName,
          orderNo: row.orderNo,
          sourceDispatchNo: row.sourceDispatchNo || row.orderNo,
          companyName: row.companyName,
          printArea: area,
          expectedQty: row.incomingQty,
          producedQty: 0,
          wasteQty: 0,
          status: "Bekliyor",
        });
      }
    }
    return drafts;
  }

  private async saveProductionPlanLines(slug: string, drafts: any[]) {
    const passiveStatuses = [
      "DELETED",
      "ARCHIVED",
      "CANCELLED",
      "PASSIVE",
      "SOFT_DELETED",
    ];
    const company = await (this.prisma as any).mainCompany
      .findFirst({ where: { OR: [{ slug }, { id: slug }] } })
      .catch(() => null);
    const saved: any[] = [];
    for (const draft of drafts) {
      const modelOrderLineId = this.cleanModelText(draft.modelOrderLineId);
      const modelId = this.cleanModelText(draft.modelId);
      const printArea = this.cleanModelText(draft.printArea || "Diger");
      if (!modelOrderLineId || !modelId || !printArea) continue;
      const where = {
        mainCompanySlug: slug,
        modelOrderLineId,
        modelId,
        printArea,
        NOT: { status: { in: passiveStatuses } },
      };
      const existing = await (this.prisma as any).productionPlanLine.findFirst({
        where,
      });
      const data = {
        mainCompanyId: company?.id || null,
        mainCompanySlug: slug,
        modelOrderId: this.cleanModelText(draft.modelOrderId) || null,
        modelOrderLineId,
        modelId,
        companyId: this.cleanModelText(draft.companyId) || null,
        orderNo: this.cleanModelText(draft.orderNo) || null,
        sourceDispatchNo:
          this.cleanModelText(draft.sourceDispatchNo || draft.orderNo) || null,
        printArea,
        expectedQty: this.modelNumber(draft.expectedQty),
        producedQty: this.modelNumber(draft.producedQty),
        wasteQty: this.modelNumber(draft.wasteQty),
        status: this.cleanModelText(draft.status) || "WAITING",
      };
      const row = existing
        ? await (this.prisma as any).productionPlanLine.update({
            where: { id: existing.id },
            data,
          })
        : await (this.prisma as any).productionPlanLine.create({ data });
      saved.push(row);
    }
    return saved;
  }

  private buildModelMuhasebePackage(packageId: string, docs: any[]) {
    const lines = this.buildModelMuhasebeRows(packageId, docs);
    const summary = this.buildModelMuhasebePackageSummary(
      packageId,
      docs,
      lines,
    );
    return {
      packageId,
      summary,
      documents: docs,
      rows: lines,
      totals: {
        incomingQty: summary.incomingQty,
        ourDispatchQty: summary.ourDispatchQty,
        invoiceQty: summary.invoiceQty,
        remainingQty: summary.invoiceDiff,
        remainingAmount: lines.reduce(
          (sum, row) => sum + this.modelNumber(row.remainingAmount),
          0,
        ),
      },
    };
  }

  @Get("model-muhasebe/packages")
  async listModelMuhasebePackages(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const docs = await this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
    ]);
    return apiSuccess(this.buildModelMuhasebePackageList(docs));
  }

  @Get("model-muhasebe/package/:packageId")
  async getModelMuhasebePackage(
    @Param("packageId") packageId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const docs = await this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
    ]);
    const filtered = docs.filter(
      (doc: any) => this.modelMuhasebePackageKey(doc) === String(packageId),
    );
    if (!filtered.length) {
      throw new NotFoundException("Belge paketi bulunamadÄ±.");
    }
    return apiSuccess(this.buildModelMuhasebePackage(packageId, filtered));
  }

  @Post("model-muhasebe/read-package")
  async readModelMuhasebePackage(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    if (body.packageId) {
      return this.getModelMuhasebePackage(
        body.packageId,
        slug,
        body.mainCompanyId,
      );
    }

    const docs = await this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
    ]);
    const packageId =
      this.cleanModelText(body.belgeNo || body.packageNo) ||
      this.cleanModelText(docs[0]?.documentNo || docs[0]?.belgeNo) ||
      `PKG-${Date.now()}`;
    const filtered = body.belgeNo
      ? docs.filter(
          (doc: any) =>
            this.cleanModelText(doc.documentNo || doc.belgeNo) ===
            this.cleanModelText(body.belgeNo),
        )
      : docs.slice(0, 3);
    return apiSuccess(this.buildModelMuhasebePackage(packageId, filtered));
  }

  @Post("model-muhasebe/save-package")
  async saveModelMuhasebePackage(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const packageId = this.cleanModelText(body.packageId);
    if (!packageId) {
      throw new BadRequestException("Belge paketi seÃ§ilmeden kayÄ±t yapÄ±lamaz.");
    }

    const docs = await this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
    ]);
    const packageDocs = docs.filter(
      (doc: any) => this.modelMuhasebePackageKey(doc) === packageId,
    );
    if (!packageDocs.length) {
      throw new NotFoundException("Belge paketi bulunamadÄ±.");
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      throw new BadRequestException("Kaydedilecek kalem bulunamadÄ±.");
    }
    const normalizedRows = rows
      .map((row, index) =>
        this.normalizeModelMuhasebeLine(
          {
            ...row,
            bindingKey:
              this.cleanModelText(row?.bindingKey) ||
              this.modelMuhasebeLineBindingKey(packageId, row, {}, index),
            sourceDispatchNo: packageId,
          },
          index,
        ),
      )
      .filter((row) => row.incomingQty || row.ourDispatchQty || row.invoiceQty);
    const missingModel = normalizedRows.find((row) => !row.modelId);
    if (missingModel) {
      throw new BadRequestException(
        `${missingModel.description || missingModel.orderNo || missingModel.id} iÃ§in model seÃ§imi zorunludur.`,
      );
    }

    const summary = this.buildModelMuhasebePackageSummary(
      packageId,
      packageDocs,
      normalizedRows,
    );
    const productionPlanLines = this.buildProductionPlanDrafts(normalizedRows);
    const savedProductionPlanLines = await this.saveProductionPlanLines(
      slug,
      productionPlanLines,
    );

    for (const doc of packageDocs) {
      await this.muhasebeDb.updateDocument(slug, doc.id, {
        targetRecordId: "",
        raw: {
          modelId: "",
          modelName: "",
          modelAdi: "",
          targetRecordId: null,
          modelMuhasebe: {
            packageId,
            lines: normalizedRows,
            incomingQty: summary.incomingQty,
            ourDispatchQty: summary.ourDispatchQty,
            invoiceQty: summary.invoiceQty,
            dispatchDiff: summary.dispatchDiff,
            invoiceDiff: summary.invoiceDiff,
            savedAt: new Date().toISOString(),
          },
        },
        taslakAlanlar: {
          modelAdi:
            normalizedRows.length === 1 ? normalizedRows[0].modelName : "",
          gelenAdet: summary.incomingQty,
          bizimIrsaliyeAdedi: summary.ourDispatchQty,
          faturaAdedi: summary.invoiceQty,
          modelMuhasebePackageId: packageId,
        },
      });
    }

    return apiSuccess({
      packageId,
      summary: {
        ...summary,
        waiting: false,
      },
      rows: normalizedRows,
      productionPlanLines,
      savedProductionPlanLines,
      savedProductionPlanLineCount: savedProductionPlanLines.length,
      waitingControlCount: normalizedRows.filter(
        (row) => row.status !== "Tamam",
      ).length,
      message:
        "Belge, model ve adet baÄŸlantÄ±sÄ± kaydedildi. Uygun satÄ±rlar iÃ§in imalat taslaÄŸÄ± hazÄ±rlandÄ±.",
    });
  }

  @Get("model-muhasebe/models/search")
  async searchModelMuhasebeModels(
    @Query("q") q = "",
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const result: any = await this.modelService.list({
      mainCompanySlug: slug,
      q,
      limit: 50,
    });
    const rows = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result)
        ? result
        : [];
    return apiSuccess(rows);
  }

  @Get("model-muhasebe/model/:modelId/summary")
  async getModelMuhasebeModelSummary(
    @Param("modelId") modelId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const docs = await this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
      "bizim_kestigimiz_irsaliye",
      "bizim_kestigimiz_fatura",
    ]);
    const lines = docs.flatMap((doc: any) => {
      const source = Array.isArray(doc?.invoiceItems) ? doc.invoiceItems : [];
      return source
        .filter(
          (line: any) =>
            this.cleanModelText(line.modelId || line.modelKaydiId) ===
            this.cleanModelText(modelId),
        )
        .map((line: any, index: number) =>
          this.normalizeModelMuhasebeLine(line, index),
        );
    });
    return apiSuccess({
      modelId,
      lineCount: lines.length,
      incomingQty: lines.reduce((sum, row) => sum + row.incomingQty, 0),
      invoiceQty: lines.reduce((sum, row) => sum + row.invoiceQty, 0),
      remainingQty: lines.reduce((sum, row) => sum + row.remainingQty, 0),
      remainingAmount: lines.reduce((sum, row) => sum + row.remainingAmount, 0),
    });
  }

  @Get("model-muhasebe/model-order/:id/compare")
  async getModelOrderCompare(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const payload: any = await this.getModelMuhasebePackage(
      id,
      mainCompanySlug,
      mainCompanyId,
    );
    const data = payload?.data || payload;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const incomingQty = rows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row.incomingQty),
      0,
    );
    const ourDispatchQty = rows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row.ourDispatchQty),
      0,
    );
    const invoiceQty = rows.reduce(
      (sum: number, row: any) => sum + this.modelNumber(row.invoiceQty),
      0,
    );
    const unitPrice = rows.length ? this.modelNumber(rows[0].unitPrice) : 0;
    const invoicePrice = rows.length
      ? this.modelNumber(rows[0].invoicePrice)
      : 0;
    return apiSuccess({
      modelOrderId: id,
      incomingQty,
      ourDispatchQty,
      invoiceQty,
      remainingQty: incomingQty - invoiceQty,
      remainingAmount: (incomingQty - invoiceQty) * unitPrice,
      expectedAmount: incomingQty * unitPrice,
      invoiceAmount: invoiceQty * invoicePrice,
      priceDiff: unitPrice - invoicePrice,
      dispatchDiff: incomingQty - ourDispatchQty,
      invoiceDiff: incomingQty - invoiceQty,
    });
  }

  @Get("incoming-deliveries/pool")
  getIncomingDeliveriesPool(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    // Eski kayitlar `musteri_irsaliye`, yeni XML akisi ise
    // `musteriden_gelen_irsaliye` tipini kullaniyor. Havuz ikisini de gostermeli.
    return this.documentListForUi(slug, [
      "musteriden_gelen_irsaliye",
      "musteri_irsaliye",
    ]);
  }

  @Get("incoming-deliveries/:id")
  getIncomingDelivery(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getDocument(slug, id);
  }

  @Post("incoming-deliveries")
  saveIncomingDelivery(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveManualModelDocument(
      slug,
      undefined,
      body,
      "MUSTERIDEN_GELEN_IRSALIYE",
    );
  }

  private async documentListForUi(mainCompanySlug: string, types: string[]) {
    const lists = await Promise.all(
      types.map((type) =>
        this.muhasebeDb.listDocuments({
          mainCompanySlug,
          type,
          limit: 1000,
        }),
      ),
    );
    const unique = new Map<string, any>();
    lists
      .flatMap((list: any) => list?.data || [])
      .forEach((row: any) => unique.set(String(row?.id || row?.documentId), row));
    return [...unique.values()].sort((a: any, b: any) =>
      String(b?.tarih || b?.date || b?.createdAt || "").localeCompare(
        String(a?.tarih || a?.date || a?.createdAt || ""),
      ),
    );
  }

  @Get("musteri-irsaliye")
  getMusteriIrsaliye(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.getIncomingDeliveriesPool(mainCompanySlug, mainCompanyId);
  }

  @Post("musteri-irsaliye")
  saveMusteriIrsaliye(@Body() body: any) {
    return this.saveIncomingDelivery(body);
  }

  @Patch("musteri-irsaliye/:id")
  patchMusteriIrsaliye(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveManualModelDocument(
      slug,
      id,
      body,
      "MUSTERIDEN_GELEN_IRSALIYE",
    );
  }

  @Patch("musteri-irsaliye/:id/sil")
  softDeleteMusteriIrsaliye(@Param("id") id: string, @Body() body: any) {
    return this.softDeleteUpload(id, body);
  }

  @Patch("incoming-deliveries/:id")
  patchIncomingDelivery(@Param("id") id: string, @Body() body: any) {
    return this.patchMusteriIrsaliye(id, body);
  }

  @Post("incoming-deliveries/:id/link-model")
  async linkIncomingDeliveryToModel(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.linkDocumentToModel(slug, id, body);
  }

  @Post("incoming-deliveries/:id/link-models")
  async linkIncomingDeliveryLinesToModels(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.linkIncomingDeliveryLinesToModels(slug, id, body);
  }

  @Get("model-reconciliation")
  getModelReconciliations(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listModelReconciliations(slug);
  }

  @Post("model-reconciliation/complete")
  completeModelReconciliation(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.completeModelReconciliation(slug, body);
  }

  @Get("outgoing-documents/pool")
  getOutgoingDocumentsPool(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.documentListForUi(slug, ["bizim_kestigimiz_fatura"]);
  }

  @Get("outgoing-documents/:id")
  getOutgoingDocument(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getDocument(slug, id);
  }

  @Post("outgoing-documents")
  saveOutgoingDocument(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveManualModelDocument(
      slug,
      undefined,
      body,
      "BIZIM_GIDEN_FATURA",
    );
  }

  @Get("bizim-belgeler")
  getBizimBelgeler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.getOutgoingDocumentsPool(mainCompanySlug, mainCompanyId);
  }

  @Post("bizim-belgeler")
  saveBizimBelgeler(@Body() body: any) {
    return this.saveOutgoingDocument(body);
  }

  @Patch("bizim-belgeler/:id")
  patchBizimBelgeler(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveManualModelDocument(
      slug,
      id,
      body,
      "BIZIM_GIDEN_FATURA",
    );
  }

  @Patch("bizim-belgeler/:id/sil")
  softDeleteBizimBelge(@Param("id") id: string, @Body() body: any) {
    return this.softDeleteUpload(id, body);
  }

  @Patch("outgoing-documents/:id")
  patchOutgoingDocument(@Param("id") id: string, @Body() body: any) {
    return this.patchBizimBelgeler(id, body);
  }

  @Post("outgoing-documents/:id/link-model")
  async linkOutgoingDocumentToModel(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.linkDocumentToModel(slug, id, body);
  }

  @Post("outgoing-documents/:id/create-model")
  createModelFromOutgoingDocument(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.createModelFromOutgoingDocument(
      body.mainCompanySlug,
      body.mainCompanyId,
      id,
      body,
    );
  }

  @Post("outgoing-documents/:id/mail-package")
  prepareOutgoingMailPackage(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.prepareOutgoingMailPackage(
      body.mainCompanySlug,
      body.mainCompanyId,
      id,
      body,
    );
  }

  @Post("outgoing-documents/suggest-models")
  suggestModelsForOutgoingDocument(@Body() body: any) {
    return this.documentWorkflowService.suggestModelsForOutgoingDocument(
      body.mainCompanySlug,
      body.mainCompanyId,
      body,
    );
  }

  @Get("supplier-invoices/pool")
  getSupplierInvoicesPool(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.documentListForUi(slug, ["tedarikci_gelen_fatura"]);
  }

  @Get("supplier-invoices/:id")
  getSupplierInvoice(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getDocument(slug, id);
  }

  @Post("supplier-invoices")
  saveSupplierInvoice(@Body() body: any) {
    return this.documentWorkflowService.saveSupplierInvoice(
      body.mainCompanySlug,
      body.mainCompanyId,
      body,
    );
  }

  @Patch("supplier-invoices/:id")
  patchSupplierInvoice(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.saveSupplierInvoice(
      body.mainCompanySlug,
      body.mainCompanyId,
      { ...body, id },
    );
  }

  @Get("tedarikci-fatura")
  getTedarikciFatura(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.getSupplierInvoicesPool(mainCompanySlug, mainCompanyId);
  }

  @Patch("tedarikci-fatura/:id/sil")
  softDeleteTedarikciFatura(@Param("id") id: string, @Body() body: any) {
    return this.softDeleteUpload(id, body);
  }

  @Post("tedarikci-fatura/:id/firma-eslestir")
  matchTedarikciFaturaFirma(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeDb.updateDocument(
      this.requireMainCompanySlug(
        this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
      id,
      body,
    );
  }

  @Post("belge-yukleme/:id/firma-eslestir")
  matchUploadFirma(@Param("id") id: string, @Body() body: any) {
    return this.matchTedarikciFaturaFirma(id, body);
  }

  @Post("belge-yukleme/:id/yeni-firma-ac")
  createFirmForUpload(@Param("id") id: string, @Body() body: any) {
    return this.matchTedarikciFaturaFirma(id, body);
  }

  @Get("firma-eslestirme-onerileri")
  async getFirmaEslestirmeOnerileri(
    @Query("name") name?: string,
    @Query("vkn") vkn?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return apiSuccess(
      await this.muhasebeDb.findFirmMatchCandidates(slug, name, vkn),
    );
  }

  @Post("supplier-invoices/:id/match-lines")
  matchSupplierInvoiceLines(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.matchSupplierInvoiceLines(
      body.mainCompanySlug,
      body.mainCompanyId,
      id,
      body,
    );
  }

  @Post("supplier-invoices/:id/save-lines")
  saveSupplierInvoiceLines(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.saveSupplierInvoiceLines(
      body.mainCompanySlug,
      body.mainCompanyId,
      id,
      body,
    );
  }

  @Post("supplier-invoices/:id/generate-lot-records")
  generateSupplierInvoiceLots(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.generateRawMaterialLots(
      body.mainCompanySlug,
      body.mainCompanyId,
      id,
    );
  }

  @Get("raw-material-lots")
  getRawMaterialLots(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.documentWorkflowService.getRawMaterialLots(
      mainCompanySlug,
      mainCompanyId,
    );
  }

  @Get("raw-material-lots/:id")
  getRawMaterialLot(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.documentWorkflowService.getRawMaterialLotById(
      mainCompanySlug,
      mainCompanyId,
      id,
    );
  }

  @Post("raw-material-lots")
  saveRawMaterialLot(@Body() body: any) {
    return this.documentWorkflowService.saveRawMaterialLot(
      body.mainCompanySlug,
      body.mainCompanyId,
      body,
    );
  }

  @Patch("raw-material-lots/:id")
  patchRawMaterialLot(@Param("id") id: string, @Body() body: any) {
    return this.documentWorkflowService.saveRawMaterialLot(
      body.mainCompanySlug,
      body.mainCompanyId,
      { ...body, id },
    );
  }

  @Get("raw-material-lots/by-product/:productId")
  getRawMaterialLotsByProduct(
    @Param("productId") productId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.documentWorkflowService.getRawMaterialLots(
      mainCompanySlug,
      mainCompanyId,
      { productId },
    );
  }

  @Get("raw-material-lots/by-lot/:lotNo")
  getRawMaterialLotsByLot(
    @Param("lotNo") lotNo: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.documentWorkflowService.getRawMaterialLots(
      mainCompanySlug,
      mainCompanyId,
      { lotNo },
    );
  }

  @Get("companies")
  getCompanies(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("companySlug") companySlug?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.getFirmaKartlari(
      mainCompanySlug,
      mainCompanyId,
      companySlug,
      companyId,
    );
  }

  @Get("firmalar")
  getFirmalar(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("companySlug") companySlug?: string,
    @Query("companyId") companyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("type") type?: string,
    @Query("officialType") officialType?: string,
    @Query("active") active?: string,
    @Query("balanceType") balanceType?: string,
    @Query("sort") sort?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlugFromLegacyQuery({
        mainCompanySlug,
        mainCompanyId,
        companySlug,
        companyId,
      }),
    );
    return this.firmaKartlariDb.listCompanies({
      mainCompanySlug: slug,
      page,
      limit,
      q,
      type,
      officialType,
      active,
      balanceType,
      sort,
    });
  }

  @Get("firmalar/siniflandirma")
  getFirmaSiniflandirma(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlugFromLegacyQuery({
        mainCompanySlug: query.mainCompanySlug,
        mainCompanyId: query.mainCompanyId,
        companySlug: query.companySlug,
        companyId: query.companyId,
      }),
    );
    return this.firmaKartlariDb.listCompanyClassifications(slug, query);
  }

  @Patch("firmalar/:id/siniflandirma")
  async updateFirmaSiniflandirma(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(
      await this.firmaKartlariDb.updateCompanyClassification(slug, id, body),
    );
  }

  @Post("firmalar/toplu-siniflandirma")
  async bulkFirmaSiniflandirma(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.bulkUpdateCompanyClassification(slug, body);
  }

  @Get("firmalar/:id")
  getFirmaDetay(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.getCompany(slug, id);
  }

  @Get("firmalar/:id/cari-ozet")
  getFirmaCariOzet(@Param("id") id: string, @Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.getCompanySummary(slug, id, query);
  }

  @Post("firmalar")
  async createFirma(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(await this.firmaKartlariDb.saveCompany(slug, body));
  }

  @Put("firmalar/:id")
  async updateFirma(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(await this.firmaKartlariDb.updateCompany(slug, id, body));
  }

  @Patch("firmalar/:id")
  patchFirma(@Param("id") id: string, @Body() body: any) {
    return this.updateFirma(id, body);
  }

  @Post("firmalar/:id/alias")
  async saveFirmaAlias(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(await this.firmaKartlariDb.saveCompanyAlias(slug, id, body));
  }

  @Post("firmalar/:sourceId/merge-into/:targetId")
  async mergeFirmaInto(
    @Param("sourceId") sourceId: string,
    @Param("targetId") targetId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(
      await this.firmaKartlariDb.mergeCompanyInto(slug, sourceId, targetId, body),
    );
  }

  @Post("firmalar/:id/pasife-al")
  async passiveFirma(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return apiSuccess(
      await this.firmaKartlariDb.updateCompany(slug, id, {
        ...body,
        isActive: false,
        aktif: false,
      }),
    );
  }

  @Post("companies")
  saveCompanies(@Body() body: any) {
    return this.saveFirmaKartlari(body);
  }

  @Get("company-match")
  getCompanyMatch(
    @Query("name") name?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.matchCompanyName(name || ""),
    );
  }

  @Get("product-match")
  getProductMatch(
    @Query("name") name?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.matchProductName(name || ""),
    );
  }

  @Get("company-aliases")
  getCompanyAliases(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getCompanyAliases(),
    );
  }

  @Get("company-merge-suggestions")
  getCompanyMergeSuggestions(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("limit") limit?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getCompanyMergeSuggestions(Number(limit || 100)),
    );
  }

  @Get("company-matching-status")
  getCompanyMatchingStatus(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getCompanyMatchingStatus(),
    );
  }

  @Post("company-aliases")
  saveCompanyAlias(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveCompanyAlias(body),
    );
  }

  @Patch("company-aliases/:id")
  patchCompanyAlias(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.updateCompanyAlias(id, body),
    );
  }

  @Get("product-aliases")
  getProductAliases(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getProductAliases(),
    );
  }

  @Post("product-aliases")
  saveProductAlias(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveProductAlias(body),
    );
  }

  @Patch("product-aliases/:id")
  patchProductAlias(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.updateProductAlias(id, body),
    );
  }

  @Get("belgeler")
  getBelgeler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () => this.muhasebeService.getBelgeler(),
    );
  }

  @Post("belgeler")
  saveBelgeler(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveBelge(body),
    );
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `belgeler` zincirini kullanir.
  @Post("documents")
  saveDocuments(@Body() body: any) {
    return this.saveBelgeler(body);
  }

  // LEGACY alias endpoint: aktif muhasebe frontend taslagi `belgeler` zinciriyle olusturur.
  @Post("documents/draft")
  saveDocumentDraft(@Body() body: any) {
    return this.saveBelgeler({ ...body, status: "TASLAK" });
  }

  // LEGACY alias endpoint: aktif muhasebe frontend onayi `belgeler` zinciriyle verir.
  @Post("documents/confirm")
  confirmDocument(@Body() body: any) {
    return this.saveBelgeler({ ...body, status: "ONAYLANDI" });
  }

  @Delete("belgeler/:documentId")
  deleteBelge(
    @Param("documentId") documentId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deleteBelge(documentId),
    );
  }

  @Delete("documents/:documentId")
  deleteDocument(
    @Param("documentId") documentId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.deleteBelge(documentId, mainCompanySlug, mainCompanyId);
  }

  @Get("urunler")
  getUrunler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listProducts({
      mainCompanySlug: slug,
      page,
      limit,
      q,
    });
  }

  @Post("urunler")
  saveUrun(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProduct(slug, body);
  }

  @Get("urunler/:id")
  getUrunById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getProduct(slug, id);
  }

  @Patch("urunler/:id")
  patchUrun(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProduct(slug, body, id);
  }

  @Get("envanter-urunleri")
  getEnvanterUrunleri(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listInventoryProducts({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Post("envanter-urunleri")
  saveEnvanterUrunu(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProduct(slug, body);
  }

  @Patch("envanter-urunleri/:id")
  patchEnvanterUrunu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProduct(slug, body, id);
  }

  @Put("envanter-urunleri/:id")
  putEnvanterUrunu(@Param("id") id: string, @Body() body: any) {
    return this.patchEnvanterUrunu(id, body);
  }

  @Post("envanter-urunleri/:id/pasife-al")
  passiveEnvanterUrunu(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.passiveProduct(slug, id);
  }

  @Post("urunler/:id/aliases")
  saveUrunAlias(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProductAlias(slug, id, body);
  }

  @Patch("urunler/:id/aliases/:aliasId")
  patchUrunAlias(
    @Param("id") id: string,
    @Param("aliasId") aliasId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveProductAlias(slug, id, body, aliasId);
  }

  @Get("urun-eslesmeleri")
  getUrunEslesmeleri(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listProductAliases({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Get("urun-eslestirme-kuyrugu")
  getUrunEslestirmeKuyrugu(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listProductMatchQueue({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Post("urun-eslestirme/toplu-isle")
  processUrunEslestirmeKuyrugu(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.processPendingProductLines(slug, body);
  }

  @Post("urun-eslesmeleri")
  saveUrunEslesmesi(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const productId = String(body.productId || body.urunId || "").trim();
    if (!productId) {
      throw new BadRequestException("productId zorunludur.");
    }
    return this.muhasebeDb.saveProductAlias(
      slug,
      productId,
      body,
      body.aliasId,
    );
  }

  @Get("belgeler/:documentId/kalemler")
  getBelgeKalemleri(
    @Param("documentId") documentId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listDocumentProductLines(slug, documentId);
  }

  @Post("belgeler/:documentId/kalemleri-eslestir")
  autoMatchBelgeKalemleri(
    @Param("documentId") documentId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.autoMatchDocumentLines(slug, documentId, body);
  }

  @Post("belge-kalemleri/:lineId/urune-bagla")
  bindBelgeKalemiToProduct(@Param("lineId") lineId: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.bindDocumentLineToProduct(slug, lineId, body);
  }

  @Post("belge-kalemleri/:lineId/urun-olustur-ve-bagla")
  createProductAndBindBelgeKalemi(
    @Param("lineId") lineId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.createProductFromDocumentLine(slug, lineId, body);
  }

  @Get("stok-hareketleri")
  getStokHareketleri(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listStockMovements({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Get("urun-kullanimlari")
  getUrunKullanimlari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listProductMonthlyUsage({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Get("urunler/:id/evraklar")
  getUrunEvraklari(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getUrunEvraklari(id),
    );
  }

  @Post("urunler/evraklar")
  saveUrunEvragi(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveUrunEvragi(body),
    );
  }

  @Post("urunler/evraklar/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (req, file, cb) => {
        const mimeType = String(file?.mimetype || "").toLowerCase();
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        if (
          [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp",
          ].includes(mimeType) ||
          [".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(ext)
        ) {
          cb(null, true);
          return;
        }
        cb(
          new Error("Sadece PDF, JPG, JPEG, PNG ve WEBP yÃ¼kleyebilirsiniz."),
          false,
        );
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(
            process.cwd(),
            "uploads",
            "kyerp-data",
            "_product-doc-temp",
          ),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  saveUrunEvragiUpload(@UploadedFile() file: any, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveUrunEvragi(body, file),
    );
  }

  @Patch("urunler/evraklar/:id")
  updateUrunEvragi(
    @Param("id") id: string,
    @Body() body: any,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(
        mainCompanySlug || body.mainCompanySlug,
        mainCompanyId || body.mainCompanyId,
      ),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.updateUrunEvragi(id, body),
    );
  }

  @Post("urunler/evraklar/:id/pasife-al")
  deactivateUrunEvragi(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deactivateUrunEvragi(id),
    );
  }

  @Get("urunler/evraklar/:id/file")
  getUrunEvrakDosya(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug: string | undefined,
    @Query("mainCompanyId") mainCompanyId: string | undefined,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () => {
      const row = this.muhasebeService.getUrunEvrakDosya(id);
      const fullPath = path.resolve(process.cwd(), row.dosyaYolu);
      if (!fs.existsSync(fullPath)) {
        throw new NotFoundException(
          "ÃœrÃ¼n evrak dosyasÄ± fiziksel olarak bulunamadÄ±.",
        );
      }
      const safeName = sanitizeFilePart(row.dosyaAdi || row.belgeAdi || id);
      if (String(download || "").toLowerCase() === "true") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=\"${safeName}\"`,
        );
      }
      return res.sendFile(fullPath);
    });
  }

  @Get("urunler/:id/lotlar")
  getUrunLotlari(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getUrunLotlari(id),
    );
  }

  @Post("urunler/:id/lotlar")
  saveUrunLot(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveUrunLot(id, body),
    );
  }

  @Get("urunler/:id/delete-check")
  getUrunDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getUrunDeleteSummary(id),
    );
  }

  @Post("urunler/:id/delete")
  deleteUrun(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    this.adminService.validateDeleteCompanyPassword(body.adminPassword);
    if (String(id || "").includes("-")) {
      return this.muhasebeDb.passiveProduct(slug, id);
    }
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deleteUrun(id),
    );
  }

  @Get("firma-kartlari")
  async getFirmaKartlari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("companySlug") companySlug?: string,
    @Query("companyId") companyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("balanceFilter") balanceFilter?: string,
    @Query("sort") sort?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlugFromLegacyQuery({
        mainCompanySlug,
        mainCompanyId,
        companySlug,
        companyId,
      }),
    );
    return this.muhasebeFinal.firmaKartlari({
      mainCompanySlug: slug,
      page,
      limit,
      q,
      balanceFilter,
      sort,
    });
  }

  @Post("firma-kartlari")
  async saveFirmaKartlari(@Body() body: any) {
    return this.muhasebeFinal.saveFirmaKarti({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
    });
  }

  @Patch("firma-kartlari/:id")
  async patchFirmaKartlari(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.updateCompany(slug, id, body);
  }

  @Post("firma-kartlari/:id/contacts")
  async saveFirmaKartiContact(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeFinal.saveFirmaContact(id, {
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
    });
  }

  @Patch("firma-kartlari/:id/contacts/:contactId")
  async patchFirmaKartiContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() body: any,
  ) {
    return this.muhasebeFinal.saveFirmaContact(id, {
      ...body,
      id: contactId,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
    });
  }

  @Delete("firma-kartlari/:id/contacts/:contactId")
  async passiveFirmaKartiContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeFinal.passiveFirmaContact(
      this.requireMainCompanySlug(
        this.resolveSlug(mainCompanySlug, mainCompanyId),
      ),
      id,
      contactId,
    );
  }

  @Post("firma-kartlari/:id/opening-balance")
  async addFirmaOpeningById(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.addOpeningBalance(slug, id, body);
  }

  @Post("firma-kartlari/:id/adjust-balance")
  async adjustFirmaBalanceById(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.adjustBalance(slug, id, body);
  }

  @Get("firma-kartlari/:id/hareketler")
  async getFirmaHareketleriById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.listMovements(slug, id, page, limit);
  }

  @Get("firma-kartlari/:id/delete-check")
  getFirmaDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getFirmaDeleteSummary(id),
    );
  }

  @Post("firma-kartlari/:id/delete")
  deleteFirmaKarti(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    this.adminService.validateDeleteCompanyPassword(body.adminPassword);
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deleteFirmaKarti(id),
    );
  }

  @Post("firma-kartlari/delete-multi")
  deleteFirmaKartiMulti(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    this.adminService.validateDeleteCompanyPassword(body.adminPassword);
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deleteFirmaKartiMulti(body.ids),
    );
  }

  @Post("firma-kartlari/import")
  importFirmaKartlari(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.importFirmaBakiyeleri(body),
    );
  }

  @Post("firma-kartlari/import/preview")
  previewFirmaKartlariImport(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.previewFirmaBakiyeleri({
      ...body,
      mainCompanySlug: slug,
    });
  }

  @Post("firma-kartlari/opening")
  addFirmaOpening(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.addFirmaOpening({
      ...body,
      mainCompanySlug: slug,
    });
  }

  @Post("firma-kartlari/adjust-total")
  adjustFirmaTotal(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.adjustFirmaTotalBalance({
      ...body,
      mainCompanySlug: slug,
    });
  }

  @Get("firma-kartlari/merged")
  getMergedFirmaKartlari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getMergedFirmaKartlari(),
    );
  }

  @Post("firma-kartlari/merge")
  mergeFirmaKartlari(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.mergeFirmaKarti(body),
    );
  }

  @Get("firma-kartlari/:id")
  async getFirmaKartlariById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.getCompany(slug, id);
  }

  @Post("firma-kartlari/:id/restore-merge")
  restoreMergedFirma(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.restoreMergedFirma(Number(id)),
    );
  }

  @Get("cari-kasa")
  getCariKasa(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("companyId") companyFilterId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listCariKasa({
      mainCompanySlug: slug,
      page,
      limit,
      q,
      companyId: companyFilterId,
      dateFrom,
      dateTo,
    });
  }

  @Get("cari-kasa/:companyId/hareketler")
  getCariKasaCompanyMovements(
    @Param("companyId") movementCompanyId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listCariKasa({
      mainCompanySlug: slug,
      companyId: movementCompanyId,
      page,
      limit,
    });
  }

  @Post("cari-kasa/manual-movement")
  saveCariKasaManualMovement(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveManualMovement(slug, body);
  }

  @Patch("cari-kasa/movement/:id")
  patchCariKasaMovement(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.updateMovement(slug, id, body);
  }

  @Delete("cari-kasa/movement/:id")
  deleteCariKasaMovement(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.deleteMovement(slug, id);
  }

  @Post("cari-kasa/add")
  addCariFirma(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.addCariFirma(body),
    );
  }

  @Get("cari-hareketler")
  getCariHareketler(@Query() query: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(query.mainCompanySlug, query.mainCompanyId),
    );
    return this.firmaKartlariDb.listCurrentAccountMovements(slug, query);
  }

  @Get("cari-hareket")
  getCariHareketAlias(@Query() query: any) {
    return this.getCariHareketler(query);
  }

  @Get("activity-logs")
  getActivityLogs(
    @Query("limit") limit?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () => this.muhasebeService.getActivityLogs(Number(limit || 50)),
    );
  }

  @Post("cari-hareketler")
  saveCariHareket(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.createCurrentAccountMovement(slug, body);
  }

  @Post("cari-hareket")
  saveCariHareketAlias(@Body() body: any) {
    return this.saveCariHareket(body);
  }

  @Get("cari-hareketler/:id")
  getCariHareketDetay(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.firmaKartlariDb.getCurrentAccountMovement(slug, id);
  }

  @Get("cari-hareketler/:id/belge-detay")
  async getCariHareketBelgeDetay(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const movementPayload: any =
      await this.firmaKartlariDb.getCurrentAccountMovement(slug, id);
    const movement = movementPayload?.data || movementPayload;
    const documentId = String(movement?.documentId || "").trim();
    if (!documentId) {
      return apiSuccess({
        movement,
        document: null,
      });
    }

    try {
      const document: any = await this.muhasebeFinal.belgeDetay(
        slug,
        documentId,
      );
      return apiSuccess({
        movement,
        document: {
          id: document.id,
          documentNo: document.belgeNo || "",
          documentType: document.belgeTuru || "",
          firmName:
            document.firma || movement?.firmaAdi || movement?.firma || "",
          taxNo: document.faturaBilgileri?.vergiNo || "",
          taxOffice: document.faturaBilgileri?.vergiDairesi || "",
          date: document.tarih || "",
          dueDate:
            document.faturaBilgileri?.vade ||
            document.faturaBilgileri?.vadeTarihi ||
            movement?.vade ||
            "",
          officialType: document.resmiGayri || movement?.resmiGayri || "RESMI",
          status: document.durum || movement?.durum || "-",
          source: movement?.kaynak || movement?.sourceType || "-",
          subtotal: this.modelNumber(document.kdvOzeti?.matrah),
          vatTotal: this.modelNumber(document.kdvOzeti?.kdv),
          grandTotal: this.modelNumber(
            document.kdvOzeti?.toplam || document.tutar,
          ),
          cariDebit: this.modelNumber(movement?.borc),
          cariCredit: this.modelNumber(movement?.alacak),
          processedAmount: this.modelNumber(movement?.tutar),
          pdfUrl: document.pdfPath || "",
          xmlUrl: document.xmlPath || "",
          belgeKaynagi: movement?.kaynak || movement?.sourceType || "-",
          movementRef: movement?.id || "",
          modelName: document.modelName || "",
          lines: Array.isArray(document.kalemler)
            ? document.kalemler.map((line: any, index: number) => ({
                lineNo: line.sira || index + 1,
                name: line.aciklama || "",
                quantity: this.modelNumber(line.miktar),
                unit: line.birim || "",
                unitPrice: this.modelNumber(line.birimFiyat),
                vatRate: this.modelNumber(line.kdvOrani),
                vatAmount: this.modelNumber(line.kdvTutari),
                lineTotal: this.modelNumber(line.toplam ?? line.matrah),
              }))
            : [],
        },
      });
    } catch (error) {
      return apiSuccess({
        movement,
        document: null,
      });
    }
  }

  @Put("cari-hareketler/:id")
  updateCariHareket(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.updateCurrentAccountMovement(slug, id, body);
  }

  @Put("cari-hareket/:id")
  updateCariHareketAlias(@Param("id") id: string, @Body() body: any) {
    return this.updateCariHareket(id, body);
  }

  @Patch("cari-hareketler/:id")
  patchCariHareket(@Param("id") id: string, @Body() body: any) {
    return this.updateCariHareket(id, body);
  }

  @Post("cari-hareketler/:id/pasife-al")
  passiveCariHareket(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.firmaKartlariDb.passiveCurrentAccountMovement(slug, id);
  }

  @Get("cari-hareketler/:firmaId/ekstre")
  async getCariEkstre(
    @Param("firmaId") firmaId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("officialType") officialType?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const payload: any = await this.muhasebeFinal.cariHareketler(slug, firmaId);
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];
    const filtered = rows.filter((row: any) => {
      const date = String(row.date || row.tarih || row.movementDate || "");
      const workType = String(
        row.officialType || row.workType || row.resmiGayri || "",
      );
      if (startDate && date && date < startDate) return false;
      if (endDate && date && date > endDate) return false;
      if (officialType && workType && workType !== officialType) return false;
      return true;
    });
    let balance = 0;
    const movements = filtered.map((row: any) => {
      const debit = this.modelNumber(row.debit ?? row.borc);
      const credit = this.modelNumber(row.credit ?? row.alacak);
      balance += debit - credit;
      return {
        ...row,
        borc: debit,
        alacak: credit,
        bakiye: row.balanceAfter ?? row.bakiye ?? balance,
      };
    });
    return apiSuccess({
      firmaId,
      startDate,
      endDate,
      officialType,
      oncekiDonemDevri: 0,
      movements,
      totals: {
        borc: movements.reduce(
          (sum: number, row: any) => sum + this.modelNumber(row.borc),
          0,
        ),
        alacak: movements.reduce(
          (sum: number, row: any) => sum + this.modelNumber(row.alacak),
          0,
        ),
        guncelBakiye: movements.length
          ? movements[movements.length - 1].bakiye
          : 0,
      },
    });
  }

  @Post("cari-hareketler/:firmaId/ekstre-mail-hazirla")
  prepareCariEkstreMail(@Param("firmaId") firmaId: string, @Body() body: any) {
    return apiSuccess({
      firmaId,
      subject: `[ ${body.firmaAdi || body.companyName || "Firma"} ] Cari Ekstre HakkÄ±nda`,
      body: "Merhaba,\n\nTalebiniz Ã¼zerine seÃ§ili tarih aralÄ±ÄŸÄ±na ait cari ekstreniz ekte bilgilerinize sunulmuÅŸtur.\n\nKontrol ederek tarafÄ±mÄ±za dÃ¶nÃ¼ÅŸ yapmanÄ±zÄ± rica ederiz.\n\nÄ°yi Ã§alÄ±ÅŸmalar.",
      withAttachments: Boolean(body.withAttachments),
      status: "DRAFT",
      warning: body.to?.length ? "" : "Ekstre alÄ±cÄ±sÄ± eksik",
    });
  }

  @Post("cari-hareketler/:firmaId/cari-gonder")
  sendCariEkstre(@Param("firmaId") firmaId: string, @Body() body: any) {
    return apiSuccess({
      firmaId,
      sendMode: body.withAttachments
        ? "Cari ekstre + fatura PDF ekleri"
        : "Sadece cari ekstre",
      status: "READY_TO_SEND",
      warning: body.to?.length ? "" : "Ekstre alÄ±cÄ±sÄ± eksik",
    });
  }

  @Get("cari-hareketler/firma/:firmaId")
  getCariHareketlerByFirma(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.firmaKartlariDb.listCurrentAccountMovements(
      this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
      { firmId: firmaId },
    );
  }

  @Get("cari-hareketler/:id/delete-check")
  getCariHareketDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getCariHareketDeleteSummary(id),
    );
  }

  @Post("cari-hareketler/:id/delete")
  deleteCariHareket(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    this.adminService.validateDeleteCompanyPassword(body.adminPassword);
    if (String(id || "").includes("-")) {
      return this.firmaKartlariDb.passiveCurrentAccountMovement(slug, id);
    }
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.deleteCariHareket(id),
    );
  }

  @Post("cari")
  saveCari(@Body() body: any) {
    return this.saveCariHareket(body);
  }

  @Get("kdv")
  getKdv(
    @Query("companyId") companyId?: string,
    @Query("companyName") companyName?: string,
    @Query("documentNo") documentNo?: string,
    @Query("documentType") documentType?: string,
    @Query("period") period?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("vatRate") vatRate?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("periodMonth") periodMonth?: string,
    @Query("direction") direction?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    void companyId;
    void companyName;
    void documentNo;
    void documentType;
    void period;
    void fromDate;
    void toDate;
    void vatRate;
    return this.muhasebeDb.listVat({
      mainCompanySlug: slug,
      page,
      limit,
      periodMonth,
      direction,
    });
  }

  @Get("kdv/summary")
  getKdvDbSummary(
    @Query("periodMonth") periodMonth?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.vatSummary({ mainCompanySlug: slug, periodMonth });
  }

  @Get("kdv-kontrol")
  getFinalKdvKontrol(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeFinal.kdvKontrol({
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
    });
  }

  @Post("kdv/devreden")
  saveKdvDevreden(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveCarryVat(slug, body);
  }

  @Patch("kdv/:id")
  patchKdv(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.updateVat(slug, id, body);
  }

  @Get("kdv-summary")
  getKdvSummary(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("month") month?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () => {
      const report = this.muhasebeService.getKdv({ period: month });
      return {
        ok: true,
        summary: report.summary,
        vatPeriod: report.vatPeriod,
      };
    });
  }

  @Get("kdv-movements")
  getKdvMovements(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
    @Query("type") type?: string,
    @Query("rate") rate?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () => {
      const report = this.muhasebeService.getKdv({
        fromDate: start,
        toDate: end,
        documentType: type,
        vatRate: rate,
      });
      return {
        ok: true,
        rows: report.rows,
      };
    });
  }

  @Get("vat-periods")
  getVatPeriods(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getVatPeriods(),
    );
  }

  @Post("vat-periods")
  saveVatPeriod(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveVatPeriod(body),
    );
  }

  @Get("odemeler")
  getOdemeler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listPayments({
      mainCompanySlug: slug,
      page,
      limit,
      q,
      companyId,
      dateFrom,
      dateTo,
    });
  }

  @Post("odemeler")
  saveOdeme(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return body.id
      ? this.muhasebeDb.savePayment(slug, body, body.id)
      : this.muhasebeDb.savePayment(slug, body);
  }

  @Get("odemeler/:id")
  getOdemeById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getPayment(slug, id);
  }

  @Patch("odemeler/:id")
  patchOdeme(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.savePayment(slug, body, id);
  }

  @Get("odemeler/:id/delete-check")
  getOdemeDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getOdemeDeleteSummary(id),
    );
  }

  @Post("odemeler/:id/delete")
  deleteOdeme(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.deletePayment(slug, id);
  }

  @Delete("odemeler/:id")
  deleteOdemeRest(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.deletePayment(slug, id);
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `odemeler` endpointini kullanir.
  @Get("payments")
  getPayments(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.getOdemeler(
      mainCompanySlug,
      mainCompanyId,
      page,
      limit,
      q,
      companyId,
      dateFrom,
      dateTo,
    );
  }

  @Post("payments")
  savePayments(@Body() body: any) {
    return this.saveOdeme(body);
  }

  @Patch("payments/:id")
  patchPayment(@Param("id") id: string, @Body() body: any) {
    return this.patchOdeme(id, body);
  }

  @Get("odeme-turleri")
  getOdemeTurleri(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () => this.muhasebeService.getOdemeTurleri(),
    );
  }

  @Get("payment-types")
  getPaymentTypes(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.getOdemeTurleri(mainCompanySlug, mainCompanyId);
  }

  @Get("odeme/firmalar")
  getOdemeFirmalar(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("active") active?: string,
  ) {
    return this.accountingApi.paymentCenterFirms({
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(mainCompanySlug, mainCompanyId)),
      active: active || "active",
    });
  }

  @Get("odeme/firmalar/:firmaId/ozet")
  getOdemeFirmaOzet(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.paymentCenterFirmSummary(firmaId);
  }

  @Get("odeme/firmalar/:firmaId/hareketler")
  getOdemeFirmaHareketler(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.firmMovements(firmaId);
  }

  @Get("odeme/firmalar/:firmaId/cekler")
  getOdemeFirmaCekler(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.paymentCenterFirmChecks(firmaId);
  }

  @Get("odeme/firmalar/:firmaId/kartlar")
  getOdemeFirmaKartlar(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.paymentCenterFirmCards(firmaId);
  }

  @Get("odeme/firmalar/:firmaId/nakit-havale")
  getOdemeFirmaNakitHavale(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.paymentCenterFirmCashTransfers(firmaId);
  }

  @Get("odeme/firmalar/:firmaId/acik-borclar")
  getOdemeFirmaAcikBorclarAlias(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.getOdemeFirmaAcikBorclar(firmaId, mainCompanySlug, mainCompanyId);
  }
  @Get("odeme/firmalar/:firmaId/acik-kalemler")
  getOdemeFirmaAcikBorclar(
    @Param("firmaId") firmaId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    void mainCompanySlug;
    void mainCompanyId;
    return this.accountingApi.paymentCenterOpenDebts(firmaId);
  }

  @Post("odeme/firma")
  createOdemeFirma(@Body() body: any) {
    return this.accountingApi.createPaymentCenterFirm({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId)),
    });
  }

  @Post("odeme/cek")
  createOdemeCek(@Body() body: any) {
    return this.accountingApi.createPaymentCenterCheck({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId)),
    });
  }

  @Post("odeme/kart")
  createOdemeKart(@Body() body: any) {
    return this.accountingApi.createPaymentCenterCard({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId)),
    });
  }

  @Post("odeme/islem")
  saveOdemeIslem(@Body() body: any) {
    return this.accountingApi.savePaymentCenterTransaction({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId)),
    });
  }
  @Get("cek-odeme")
  getFinalCekOdeme(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeFinal.cekOdeme({
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
    });
  }

  @Post("cek-odeme")
  createFinalCekOdeme(@Body() body: any) {
    return this.muhasebeFinal.createCekOdeme({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
    });
  }

  @Patch("cek-odeme/:id/odendi")
  markFinalCekOdemePaid(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeFinal.markPaid(
      {
        ...body,
        mainCompanySlug: this.requireMainCompanySlug(
          this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
        ),
      },
      id,
    );
  }

  @Post("odeme-turleri")
  saveOdemeTuru(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveOdemeTuru(body),
    );
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `odeme-turleri` endpointini kullanir.
  @Post("payment-types")
  savePaymentType(@Body() body: any) {
    return this.saveOdemeTuru(body);
  }

  @Get("cekler")
  getCekler(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listChecks({
      mainCompanySlug: slug,
      page,
      limit,
      q,
      status,
      dateFrom,
      dateTo,
    });
  }

  @Post("cekler")
  saveCek(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return body.id
      ? this.muhasebeDb.saveCheck(slug, body, body.id)
      : this.muhasebeDb.saveCheck(slug, body);
  }

  @Get("cekler/:id")
  getCekById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getCheck(slug, id);
  }

  @Patch("cekler/:id")
  patchCek(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveCheck(slug, body, id);
  }

  @Put("cekler/:id")
  putCek(@Param("id") id: string, @Body() body: any) {
    return this.patchCek(id, body);
  }

  @Post("cekler/:id/odendi")
  markCekOdendi(@Param("id") id: string, @Body() body: any) {
    return this.patchCek(id, {
      ...body,
      status: "ODENDI",
      durum: "Ã–dendi",
      odendi: true,
      isPaid: true,
    });
  }

  @Get("cekler/:id/delete-check")
  getCekDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getCekDeleteSummary(id),
    );
  }

  @Post("cekler/:id/delete")
  deleteCek(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.deleteCheck(slug, id);
  }

  @Delete("cekler/:id")
  deleteCekRest(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.deleteCheck(slug, id);
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `cekler` endpointini kullanir.
  @Get("cheques")
  getCheques(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.getCekler(
      mainCompanySlug,
      mainCompanyId,
      page,
      limit,
      q,
      status,
      dateFrom,
      dateTo,
    );
  }

  @Post("checks")
  saveChecks(@Body() body: any) {
    return this.saveCek(body);
  }

  @Post("cheques")
  saveCheque(@Body() body: any) {
    return this.saveCek(body);
  }

  @Patch("cheques/:id")
  patchCheque(@Param("id") id: string, @Body() body: any) {
    return this.patchCek(id, body);
  }

  @Patch("cheques/:id/passive")
  passiveCheque(@Param("id") id: string, @Body() body: any) {
    return this.patchCek(id, { ...body, status: "IPTAL", isActive: false });
  }

  @Post("cheques/:id/front-image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(
              path.join(process.cwd(), "storage", "muhasebe", "cheques"),
            ),
          ),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-front-${sanitizeFilePart(file.originalname)}`,
          ),
      }),
    }),
  )
  uploadChequeFrontImage(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    return this.muhasebeIntegration.updateCheckImage(
      this.integrationScopeFromBody(body),
      id,
      "front",
      file,
    );
  }

  @Post("cheques/:id/back-image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(
              path.join(process.cwd(), "storage", "muhasebe", "cheques"),
            ),
          ),
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-back-${sanitizeFilePart(file.originalname)}`),
      }),
    }),
  )
  uploadChequeBackImage(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    return this.muhasebeIntegration.updateCheckImage(
      this.integrationScopeFromBody(body),
      id,
      "back",
      file,
    );
  }

  @Get("cek-ozet")
  getCekOzet(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () => this.muhasebeService.getCekOzet(),
    );
  }

  @Get("kredi-kartlari")
  getKrediKartlari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listCreditCards({
      mainCompanySlug: slug,
      page,
      limit,
      q,
    });
  }

  @Post("kredi-kartlari")
  saveKrediKartlari(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return body.id
      ? this.muhasebeDb.saveCreditCard(slug, body, body.id)
      : this.muhasebeDb.saveCreditCard(slug, body);
  }

  @Get("kredi-kartlari/:id")
  getKrediKartiById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getCreditCard(slug, id);
  }

  @Patch("kredi-kartlari/:id")
  patchKrediKarti(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveCreditCard(slug, body, id);
  }

  @Post("kredi-kartlari/:id/pasife-al")
  passiveKrediKarti(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.deleteCreditCard(slug, id);
  }

  @Get("kredi-kart-hareketleri")
  getKrediKartHareketleri(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listAllCreditCardMovements({
      ...query,
      mainCompanySlug: slug,
    });
  }

  @Post("kredi-kart-hareketleri/firma-odemesi")
  createKrediKartFirmaOdemesi(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.createCreditCardFirmPayment(slug, body);
  }

  @Post("kredi-kart-hareketleri/ekstre-odemesi")
  createKrediKartEkstreOdemesi(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.createCreditCardStatementPayment(slug, body);
  }

  @Post("kredi-kart-hareketleri/:id/gorsel")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(
              path.join(process.cwd(), "storage", "muhasebe", "credit-cards"),
            ),
          ),
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-slip-${sanitizeFilePart(file.originalname)}`),
      }),
    }),
  )
  uploadKrediKartHareketGorsel(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.uploadCreditCardMovementSlip(slug, id, file);
  }

  @Get("kredi-kartlari/:id/hareketler")
  getKrediKartiHareketler(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.listCreditCardMovements(slug, id, { page, limit });
  }

  @Post("kredi-kartlari/:id/hareketler")
  saveKrediKartiHareket(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveCreditCardMovement(slug, id, body);
  }

  @Patch("kredi-kartlari/:id/hareketler/:movementId")
  patchKrediKartiHareket(
    @Param("id") id: string,
    @Param("movementId") movementId: string,
    @Body() body: any,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.saveCreditCardMovement(slug, id, body, movementId);
  }

  @Delete("kredi-kartlari/:id/hareketler/:movementId")
  deleteKrediKartiHareket(
    @Param("id") id: string,
    @Param("movementId") movementId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.deleteCreditCardMovement(slug, id, movementId);
  }

  @Get("kredi-kartlari/:id/delete-check")
  getKrediKartiDeleteCheck(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.getKrediKartiDeleteSummary(id),
    );
  }

  @Post("kredi-kartlari/:id/delete")
  deleteKrediKarti(@Param("id") id: string, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeDb.deleteCreditCard(slug, id);
  }

  @Delete("kredi-kartlari/:id")
  deleteKrediKartiRest(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.deleteCreditCard(slug, id);
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `kredi-kartlari` endpointini kullanir.
  @Get("credit-cards")
  getCreditCards(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
  ) {
    return this.getKrediKartlari(
      mainCompanySlug,
      mainCompanyId,
      page,
      limit,
      q,
    );
  }

  @Post("credit-cards")
  saveCreditCards(@Body() body: any) {
    return this.saveKrediKartlari(body);
  }

  @Patch("credit-cards/:id")
  patchCreditCard(@Param("id") id: string, @Body() body: any) {
    return this.patchKrediKarti(id, body);
  }

  @Get("eposta-gruplari")
  getEpostaGruplari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () => this.muhasebeService.getEpostaGruplari(),
    );
  }

  @Get("mail-ekstre")
  getFinalMailEkstre(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query() query?: any,
  ) {
    return this.muhasebeFinal.mailEkstre({
      ...query,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
    });
  }

  @Post("mail-ekstre/:id/mail-hazirla")
  prepareFinalMail(@Param("id") id: string, @Body() body: any) {
    return this.muhasebeFinal.prepareMail(
      {
        ...body,
        mainCompanySlug: this.requireMainCompanySlug(
          this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
        ),
      },
      id,
    );
  }

  @Post("mail-ekstre/ekstre-karsilastir")
  compareFinalStatement(@Body() body: any) {
    return this.muhasebeFinal.compareStatement({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId),
      ),
    });
  }

  @Get("eposta-kisileri")
  getEpostaKisileri(
    @Query("anaFirma") anaFirma?: string,
    @Query("bagliFirma") bagliFirma?: string,
    @Query("departman") departman?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.muhasebeService.withCtx(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      () =>
        this.muhasebeService.getEpostaKisileri({
          anaFirma,
          bagliFirma,
          departman,
        }),
    );
  }

  @Post("eposta-kisileri")
  saveEpostaKisileri(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.saveEpostaKisi(body),
    );
  }

  // LEGACY alias endpoint: aktif muhasebe frontend `eposta-kisileri` endpointini kullanir.
  @Post("email-contacts")
  saveEmailContacts(@Body() body: any) {
    return this.saveEpostaKisileri(body);
  }

  @Post("eposta-kisileri/varsayilan-sec")
  setEpostaVarsayilanlari(@Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.setVarsayilanForDepartment(body),
    );
  }

  @Get("documents/preview")
  previewDocument(
    @Query("draftId") draftId?: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Res() res?: Response,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const normalizedDraftId = String(draftId || "").trim();
    if (!normalizedDraftId) throw new BadRequestException("draftId zorunludur");
    const draft = this.documentIntakeService.readDraftJson(
      slug,
      normalizedDraftId,
    );
    if (!draft?.draftId || !draft?.originalRelativePath) {
      throw new NotFoundException("Belge taslaÄŸÄ± meta kaydÄ± eksik veya bozuk");
    }
    const relativePath = String(draft?.originalRelativePath || "");
    const fullPath = relativePath
      ? path.resolve(process.cwd(), relativePath)
      : "";
    if (!fullPath || !fs.existsSync(fullPath)) {
      throw new NotFoundException("Belge Ã¶nizleme dosyasÄ± bulunamadÄ±");
    }
    res?.sendFile(fullPath);
  }

  @Get("documents/:id")
  getDocumentById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getDocument(slug, id);
  }

  @Get("documents/:id/preview")
  async previewDbDocument(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Res() res?: Response,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    const fullPath = await this.muhasebeDb.getDocumentPreviewPath(slug, id);
    res?.sendFile(fullPath);
  }

  @Get("documents/:id/files")
  getDocumentFiles(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.requireMainCompanySlug(
      this.resolveDbSlug(mainCompanySlug, mainCompanyId),
    );
    return this.muhasebeDb.getDocumentFiles(slug, id);
  }

  @Post("belge-pdf/parse")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (req, file, cb) => {
        const mimeType = String(file?.mimetype || "").toLowerCase();
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        if (
          ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
            mimeType,
          ) ||
          [".pdf", ".jpg", ".jpeg", ".png"].includes(ext)
        ) {
          cb(null, true);
          return;
        }
        cb(new Error("Sadece PDF, JPG, JPEG ve PNG yÃ¼kleyebilirsiniz."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(process.cwd(), "uploads", "kyerp-data", "_intake-temp"),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadBelgePdf(@UploadedFile() file: any, @Body() body: any) {
    const slug = this.requireMainCompanySlug(
      this.resolveSlug(body.mainCompanySlug, body.mainCompanyId),
    );
    const result = await this.documentIntakeService.intakeUploadedDocument({
      file,
      mainCompanySlug: slug,
      firma: String(body.firma || ""),
      sectionKey: String(body.sectionKey || "alis-gider-belgeleri"),
      flowType: String(body.flowType || ""),
      workflowType: String(body.workflowType || ""),
      documentClass: String(body.documentClass || ""),
      modelKaydiId: String(body.modelKaydiId || ""),
      modelAdi: String(body.modelAdi || ""),
      storeOnly: String(body.storeOnly || "").toLowerCase() === "true",
    });
    return this.muhasebeService.withCtx(slug, () =>
      this.muhasebeService.enrichDocumentMatches(result),
    );
  }

  @Post("documents/intake")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (req, file, cb) => {
        const mimeType = String(file?.mimetype || "").toLowerCase();
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        if (
          ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
            mimeType,
          ) ||
          [".pdf", ".jpg", ".jpeg", ".png"].includes(ext)
        ) {
          cb(null, true);
          return;
        }
        cb(new Error("Sadece PDF, JPG, JPEG ve PNG yÃ¼kleyebilirsiniz."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(process.cwd(), "uploads", "kyerp-data", "_intake-temp"),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  intakeDocument(@UploadedFile() file: any, @Body() body: any) {
    return this.uploadBelgePdf(file, body);
  }

  @Post("parse-pdf")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (req, file, cb) => {
        const mimeType = String(file?.mimetype || "").toLowerCase();
        const ext = String(
          path.extname(file?.originalname || ""),
        ).toLowerCase();
        if (
          ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
            mimeType,
          ) ||
          [".pdf", ".jpg", ".jpeg", ".png"].includes(ext)
        ) {
          cb(null, true);
          return;
        }
        cb(new Error("Sadece PDF ve resim dosyalarÄ± desteklenir."), false);
      },
      storage: diskStorage({
        destination: ensureDir(
          path.join(process.cwd(), "uploads", "kyerp-data", "_parse-temp"),
        ),
        filename: (req, file, cb) => {
          const sanitized = sanitizeFilePart(
            path.parse(file.originalname).name,
          );
          cb(
            null,
            `${sanitized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async parsePdf(
    @UploadedFile() file: any,
    @Body() body: any,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    try {
      if (!file) {
        throw new BadRequestException("PDF dosyasÄ± gereklidir.");
      }

      const slug = this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      );

      const documentType = String(body.documentType || "tedarikci-fatura");
      const filePath = file.path;

      // Parse PDF using existing service
      const parseResult = await this.belgService.parseUploadedPdf(file, "");

      // Clean up temp file
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore cleanup errors
      }

      return {
        success: true,
        data: {
          firma: parseResult.header?.companyName || "",
          belgeNo: parseResult.header?.documentNo || "",
          faturaNo: parseResult.header?.documentNo || "",
          irsaliyeNo: parseResult.header?.dispatchNo || "",
          tarih: parseResult.header?.date || "",
          kalemler: (parseResult.parsedItems || []).map((item: any) => ({
            urunAdi: item.description || "",
            kod: item.productCode || "",
            lot: item.lotNo || "",
            adet: item.quantity || 0,
            birim: item.unit || "Adet",
            birimFiyat: item.unitPrice || 0,
            toplam: item.lineTotal || 0,
            kdvOrani: item.kdvRate || 0,
            kdv: item.kdvAmount || 0,
          })),
          genelToplam: parseResult.header?.grandTotal || 0,
          kdv: parseResult.header?.kdv || 0,
          aciklama: parseResult.rawText?.slice(0, 200) || "",
          detectionConfidence: parseResult.metrics?.confidenceAverage || 0,
          warnings: parseResult.header?.warnings || [],
        },
      };
    } catch (error: any) {
      throw new BadRequestException(
        `PDF parse hatasÄ±: ${error.message || "Bilinmeyen hata"}`,
      );
    }
  }
}





