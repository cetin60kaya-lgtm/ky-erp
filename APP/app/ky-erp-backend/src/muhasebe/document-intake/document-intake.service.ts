import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import AdmZip from "adm-zip";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { lookup as mimeLookup } from "mime-types";
import { PrismaService } from "../../prisma/prisma.service";
import { ensureMainCompany } from "../../database/db-company-scope";
import { safeDecimal, normalizeSearchText } from "../../database/db-normalize";
import { DocumentClassifierService } from "./document-classifier.service";
import { DocumentMatcherService } from "./document-matcher.service";
import { DocumentParserService } from "./document-parser.service";
import type {
  ApproveDocumentIntakeDto,
  BulkApproveDocumentIntakeDto,
  CreateFirmDraftDto,
  CreateProductDraftDto,
  DocumentIntakeFixDto,
  DocumentIntakeQueryDto,
  DocumentIntakeStatus,
  DocumentKind,
  ParsedDocument,
} from "./dto/document-intake.dto";

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function dateValue(value: unknown) {
  const text = clean(value);
  const date = text
    ? new Date(`${text.slice(0, 10)}T00:00:00.000Z`)
    : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function id(prefix = "di") {
  return `${prefix}_${crypto.randomUUID()}`;
}

const PURGEABLE_STATUSES = new Set([
  "REJECTED",
  "MISSING_INFO",
  "CONTROL_WAITING",
  "ERROR",
  "ARCHIVED",
]);

const PROCESSED_INTAKE_STATUSES = new Set([
  "APPROVED",
  "PROCESSED",
  "AUTO_PROCESSED",
  "POSTED",
  "ISLENEN",
]);

const EXPENSE_POSTING_TYPES = new Set([
  "PAID_EXPENSE",
  "CREDIT_CARD_EXPENSE",
  "CASH_EXPENSE",
  "BANK_PAID_EXPENSE",
  "VAT_ONLY_EXPENSE",
]);

const MANUAL_APPROVAL_BLOCKERS = new Set([
  "DOCUMENT_NO",
  "FIRM",
  "TOTAL_ZERO",
  "VAT_INVALID",
]);

@Injectable()
export class DocumentIntakeServiceV2 {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: DocumentParserService,
    private readonly classifier: DocumentClassifierService,
    private readonly matcher: DocumentMatcherService,
  ) {}

  async upload(files: Express.Multer.File[], body: any = {}) {
    const mainCompanySlug = clean(
      body.mainCompanySlug || body.mainCompanyId || "mecit-hakan",
    );
    const autoApprove =
      String(body.autoApprove || "") !== "false" && body.autoApprove !== false;
    await ensureMainCompany(this.prisma, mainCompanySlug);
    if (!Array.isArray(files) || !files.length) {
      throw new BadRequestException(
        "Yüklenecek PDF/XML/ZIP dosyası bulunamadı.",
      );
    }
    const batchId = crypto.randomUUID();
    const expanded = await this.expandFiles(mainCompanySlug, batchId, files);
    const items = [];
    const skipped = [];
    const autoApproved = [];
    for (const file of expanded) {
      const parsed = await this.parser.parseFile(file);
      const duplicate = await this.findUploadDuplicate(mainCompanySlug, parsed);
      if (duplicate) {
        skipped.push({
          fileName: parsed.originalFileName,
          duplicate: true,
          existingId: duplicate.id,
          status: duplicate.status,
          reason: duplicate.reason,
        });
        continue;
      }
      const classified = this.classifier.classify(parsed);
      const matched = await this.matcher.enrich(
        mainCompanySlug,
        parsed,
        classified.documentKind,
      );
      const item = await this.createIntakeRecord({
        batchId,
        mainCompanySlug,
        mainCompanyId: clean(body.mainCompanyId),
        parsed,
        classified,
        matched,
      });
      items.push(item);
      if (autoApprove) {
        try {
          const approveResult = await this.autoProcess(mainCompanySlug, item.id, {
            confirm: true,
            mainCompanySlug,
            manualApproval: true,
            manualApprovalReason:
              "XML/PDF yukleme sonrasi kritik olmayan kontrol uyarilari otomatik kabul edildi.",
          });
          autoApproved.push({ id: item.id, ...approveResult });
        } catch (error: any) {
          autoApproved.push({
            id: item.id,
            ok: false,
            skipped: true,
            reason: error?.message || "Toplu otomatik isleme alinamadi.",
          });
        }
      }
    }
    return { ok: true, batchId, items, skipped, autoApproved };
  }

  async list(query: DocumentIntakeQueryDto) {
    const mainCompanySlug = clean(
      query.mainCompanySlug || query.mainCompanyId || "mecit-hakan",
    );
    const rows = await this.readRows(mainCompanySlug);
    const search = clean(query.search).toLocaleLowerCase("tr-TR");
    const statusFilter = clean(query.status).toUpperCase();
    return rows
      .filter((row) => row.status !== "ARCHIVED")
      .filter((row) => {
        if (!statusFilter) return true;
        const status = String(row.status || "").toUpperCase();
        if (statusFilter === "APPROVED" || statusFilter === "PROCESSED") {
          return PROCESSED_INTAKE_STATUSES.has(status);
        }
        return status === statusFilter;
      })
      .filter(
        (row) => !query.documentKind || row.documentKind === query.documentKind,
      )
      .filter((row) => !query.firmId || row.firmId === query.firmId)
      .filter((row) => !query.modelId || row.modelId === query.modelId)
      .filter(
        (row) =>
          !query.startDate ||
          String(row.issueDate || "") >= String(query.startDate),
      )
      .filter(
        (row) =>
          !query.endDate ||
          String(row.issueDate || "") <= String(query.endDate),
      )
      .filter((row) => {
        if (!search) return true;
        return `${row.originalFileName} ${row.documentNo} ${row.issuerName} ${row.receiverName} ${row.modelGuess}`
          .toLocaleLowerCase("tr-TR")
          .includes(search);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async archive(mainCompanySlug: string, idValue: string, body: any = {}) {
    const row = await this.findRow(mainCompanySlug, idValue);
    const next = {
      ...row,
      status: "ARCHIVED" as DocumentIntakeStatus,
      archiveReason: clean(body.reason) || "Kullanici tarafindan kaldirildi.",
      archivedAt: new Date().toISOString(),
    };
    await this.saveRow(mainCompanySlug, next);
    return { ok: true, id: row.id, status: next.status };
  }

  async reject(mainCompanySlug: string, idValue: string, body: any = {}) {
    const row = await this.findRow(mainCompanySlug, idValue);
    const next = {
      ...row,
      status: "REJECTED" as DocumentIntakeStatus,
      archiveReason: clean(body.reason) || "Belge reddedildi.",
      updatedAt: new Date().toISOString(),
    };
    await this.saveRow(mainCompanySlug, next);
    return { ok: true, id: row.id, status: next.status, item: next };
  }

  async convertToPaidExpense(mainCompanySlug: string, idValue: string, body: any = {}) {
    const row = await this.findRow(mainCompanySlug, idValue);
    const document = await this.findLinkedSqlDocument(mainCompanySlug, row);
    if (!document?.id) throw new NotFoundException("SQL'e islenmis belge bulunamadi.");
    const postingType = clean(body.postingType || "PAID_EXPENSE").toUpperCase();
    const nextPostingType = EXPENSE_POSTING_TYPES.has(postingType)
      ? postingType
      : "PAID_EXPENSE";
    const result = await this.prisma.$transaction(async (tx) => {
      const movements = await tx.currentAccountMovement.findMany({
        where: { mainCompanySlug, documentId: document.id, companyId: row.firmId || undefined },
        orderBy: { createdAt: "asc" },
      });
      let reversalId = "";
      let balanceAfter: number | null = null;
      for (const movement of movements) {
        const effect = Number(movement.effect || 0);
        if (!effect) continue;
        const company = await tx.company.findFirst({
          where: { id: movement.companyId, mainCompanySlug },
        });
        balanceAfter = Number(company?.currentBalance || 0) - effect;
        const reversal = await tx.currentAccountMovement.create({
          data: {
            mainCompanySlug,
            companyId: movement.companyId,
            movementDate: new Date(),
            movementType: "PESIN_GIDER_DUZELTME",
            sourceType: "DOCUMENT_INTAKE_EXPENSE_CONVERSION",
            documentNo: movement.documentNo,
            documentId: document.id,
            description: "Belge pesin gidere cevrildi; acik cari etkisi iptal edildi.",
            debit: safeDecimal(effect < 0 ? Math.abs(effect) : 0),
            credit: safeDecimal(effect > 0 ? effect : 0),
            amount: safeDecimal(Math.abs(effect)),
            effect: safeDecimal(-effect),
            balanceAfter: safeDecimal(balanceAfter),
            raw: {
              documentIntakeId: row.id,
              reversedMovementId: movement.id,
              supplierPostingType: nextPostingType,
              approvalReason: clean(body.reason),
            },
          },
        });
        reversalId = reversal.id;
        await tx.company.update({
          where: { id: movement.companyId },
          data: { currentBalance: safeDecimal(balanceAfter) },
        });
      }
      await tx.document.update({
        where: { id: document.id },
        data: {
          raw: {
            ...((document.raw && typeof document.raw === "object" ? document.raw : {}) as any),
            supplierPostingType: nextPostingType,
            paymentStatus: "PAID",
            convertedToPaidExpenseAt: new Date().toISOString(),
            convertedToPaidExpenseReason:
              clean(body.reason) || "Kullanici belgeyi pesin gidere cevirdi.",
          },
        },
      });
      return { reversalId, balanceAfter };
    });
    const next = {
      ...row,
      accountingEffects: {
        ...(row.accountingEffects || {}),
        supplierPostingType: nextPostingType,
        paymentStatus: "PAID",
        openPayableEffect: 0,
        expenseEffect: Number(row.grandTotal || 0),
        conversionMovementId: result.reversalId,
        balanceAfter: result.balanceAfter,
      },
    };
    await this.saveRow(mainCompanySlug, next);
    return { ok: true, id: row.id, documentId: document.id, ...result, item: next };
  }

  async purge(mainCompanySlug: string, idValue: string, body: any = {}) {
    const row = await this.findRow(mainCompanySlug, idValue);
    const linkedDocument = await this.assertPurgeAllowed(mainCompanySlug, row);
    await this.deleteIntakeArtifacts(row);
    const result = await this.prisma.$transaction(async (tx) => {
      const matches = await tx.documentIntakeMatch.deleteMany({
        where: { documentIntakeId: row.id },
      });
      const lines = await tx.documentIntakeLine.deleteMany({
        where: { documentIntakeId: row.id },
      });
      const intake = await tx.documentIntake.deleteMany({
        where: { id: row.id, mainCompanySlug },
      });
      if (linkedDocument?.id) {
        await tx.document.updateMany({
          where: {
            id: linkedDocument.id,
            mainCompanySlug,
            deletedAt: null,
          },
          data: {
            status: "PURGED_INTAKE",
            deletedAt: new Date(),
            deleteReason: clean(body.reason) || "Document intake purge",
          },
        });
      }
      if (row.fileHash) {
        await tx.folderWatchLog.deleteMany({
          where: {
            mainCompanySlug,
            fileHash: row.fileHash,
            targetRecordId: row.id,
          },
        });
      }
      await (tx as any).storedFile
        .updateMany({
          where: {
            OR: [
              row.fileHash ? { fileHash: row.fileHash } : undefined,
              row.filePath ? { absolutePath: row.filePath } : undefined,
              row.filePath ? { sourcePath: row.filePath } : undefined,
            ].filter(Boolean) as any[],
            isDeleted: false,
          },
          data: {
            isDeleted: true,
            status: "DELETED",
            deletedAt: new Date(),
          },
        })
        .catch(() => null);
      return {
        matches: matches.count,
        lines: lines.count,
        intakes: intake.count,
      };
    });
    return {
      ok: true,
      id: row.id,
      purged: true,
      reason: clean(body.reason) || "Belge havuzundan kalici olarak silindi.",
      deleted: result,
    };
  }

  async purgeRejected(mainCompanySlug: string, body: any = {}) {
    const documentKind = clean(body.documentKind);
    const rows = (await this.readRows(mainCompanySlug)).filter((row) => {
      if (documentKind && row.documentKind !== documentKind) return false;
      return PURGEABLE_STATUSES.has(String(row.status || "").toUpperCase());
    });
    const results = [];
    for (const row of rows) {
      try {
        const result = await this.purge(mainCompanySlug, row.id, {
          reason: clean(body.reason) || "Hata/kontrol bekleyen belge temizligi.",
        });
        results.push({ id: row.id, ok: true, ...result });
      } catch (error: any) {
        results.push({
          id: row.id,
          ok: false,
          skipped: true,
          reason: error?.message || "Silinemedi.",
        });
      }
    }
    return {
      ok: true,
      scanned: rows.length,
      purged: results.filter((item) => item.ok).length,
      skipped: results.filter((item) => !item.ok).length,
      results,
    };
  }

  async detail(mainCompanySlug: string, idValue: string) {
    const row = await this.findRow(mainCompanySlug, idValue);
    return row;
  }

  async fix(
    mainCompanySlug: string,
    idValue: string,
    body: DocumentIntakeFixDto,
  ) {
    const row = await this.findRow(mainCompanySlug, idValue);
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const patchedLines = lines.map((line: any) => {
      const override = body.lines?.find(
        (item) => item.lineId === line.id || item.lineId === line.lineId,
      );
      return override
        ? {
            ...line,
            productId: override.productId || line.productId,
            lotNo: override.lotNo ?? line.lotNo,
            productMatchStatus: override.productId
              ? "MATCHED"
              : line.productMatchStatus,
          }
        : line;
    });
    const next = {
      ...row,
      firmId: body.firmId || row.firmId,
      modelId: body.modelId || row.modelId,
      documentKind: body.documentKind || row.documentKind,
      lines: patchedLines,
    };
    next.missingFields = this.computeMissing(next);
    next.status = this.statusForMissing(next.missingFields);
    await this.saveRow(mainCompanySlug, next);
    return next;
  }

  async createFirm(
    mainCompanySlug: string,
    idValue: string,
    body: CreateFirmDraftDto,
  ) {
    if (body.confirm !== true)
      throw new BadRequestException(
        "Firma açmak için confirm=true gereklidir.",
      );
    const row = await this.findRow(mainCompanySlug, idValue);
    if (row.firmId) return row;
    const draft = row.firmDraftJson || {};
    const name = clean(draft.name || row.issuerName || row.receiverName);
    if (!name) throw new BadRequestException("Firma taslağında ad yok.");
    const company = await this.prisma.company.create({
      data: {
        mainCompanySlug,
        name,
        normalizedName: normalizeSearchText(name),
        type: clean(body.firmType || draft.suggestedType || "SUPPLIER"),
        taxNo: clean(draft.taxNo) || null,
        taxOffice: clean(draft.taxOffice) || null,
        address: clean(draft.address) || null,
        email: clean(draft.email) || null,
        phone: clean(draft.phone) || null,
        source: "DOCUMENT_INTAKE",
        raw: draft,
      },
    });
    const next = {
      ...row,
      firmId: company.id,
      firmMatchStatus: "MATCHED",
      firmDraftJson: null,
    };
    next.missingFields = this.computeMissing(next);
    next.status = this.statusForMissing(next.missingFields);
    await this.saveRow(mainCompanySlug, next);
    return next;
  }

  async createProduct(
    mainCompanySlug: string,
    idValue: string,
    lineId: string,
    body: CreateProductDraftDto,
  ) {
    if (body.confirm !== true)
      throw new BadRequestException("Ürün açmak için confirm=true gereklidir.");
    const row = await this.findRow(mainCompanySlug, idValue);
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const target = lines.find(
      (line: any) => line.id === lineId || line.lineId === lineId,
    );
    if (!target) throw new NotFoundException("Belge kalemi bulunamadı.");
    if (!target.productId) {
      const draft = target.productDraftJson || {};
      const name = clean(draft.rawName || target.rawName || target.description);
      const normalizedName = normalizeSearchText(draft.normalizedName || name);
      let product = await this.prisma.product.findFirst({
        where: { mainCompanySlug, normalizedName },
      });
      let productCreated = false;
      if (!product) {
        product = await this.prisma.product.create({
          data: {
            mainCompanySlug,
            name,
            normalizedName,
            unit: clean(body.unit || draft.unit || target.unit || "ADET"),
            defaultVatRate: safeDecimal(
              draft.defaultVatRate || target.vatRate || 20,
            ),
            raw: {
              ...draft,
              productGroup: body.productGroup || draft.productGroup,
              supplierFirmId: draft.supplierFirmId || row.firmId || null,
              sourceDocumentNo: row.documentNo || row.invoiceNo || row.dispatchNo || "",
              firstPrice: draft.firstPrice || target.unitPrice || 0,
              status: "yeni_olusturuldu",
            },
          },
        });
        productCreated = true;
      }
      target.productId = product.id;
      target.productCreated = productCreated;
      const aliasName = clean(target.rawName || target.description || name);
      if (aliasName) {
        await this.prisma.productAlias.upsert({
          where: {
            mainCompanySlug_normalizedName: {
              mainCompanySlug,
              normalizedName: normalizeSearchText(aliasName),
            },
          },
          update: {
            productId: product.id,
            raw: {
              source: "DOCUMENT_INTAKE",
              sellerItemId: draft.sellerItemId || target.sellerItemId || "",
              manufacturerItemId: draft.manufacturerItemId || target.manufacturerItemId || "",
              standardItemId: draft.standardItemId || target.standardItemId || "",
              supplierFirmId: draft.supplierFirmId || row.firmId || null,
            },
          },
          create: {
            mainCompanySlug,
            productId: product.id,
            rawName: aliasName,
            normalizedName: normalizeSearchText(aliasName),
            raw: {
              source: "DOCUMENT_INTAKE",
              sellerItemId: draft.sellerItemId || target.sellerItemId || "",
              manufacturerItemId: draft.manufacturerItemId || target.manufacturerItemId || "",
              standardItemId: draft.standardItemId || target.standardItemId || "",
              supplierFirmId: draft.supplierFirmId || row.firmId || null,
            },
          },
        });
      }
    }
    target.productMatchStatus = "MATCHED";
    target.productDraftJson = null;
    const next = { ...row, lines };
    next.missingFields = this.computeMissing(next);
    next.status = this.statusForMissing(next.missingFields);
    await this.saveRow(mainCompanySlug, next);
    return next;
  }

  async autoProcess(
    mainCompanySlug: string,
    idValue: string,
    body: ApproveDocumentIntakeDto = {},
  ) {
    if (body.confirm !== true)
      throw new BadRequestException("Otomatik işlem için confirm=true gönderilmelidir.");
    let row = await this.findRow(mainCompanySlug, idValue);
    if (row.status === "APPROVED") {
      return { ok: true, skipped: true, reason: "Belge daha önce onaylanmış.", item: row };
    }
    if (!row.firmId && row.firmDraftJson) {
      row = await this.createFirm(mainCompanySlug, row.id, {
        confirm: true,
        firmType: "SUPPLIER",
      });
    }
    for (const line of row.lines || []) {
      if (!line.productId && line.productDraftJson) {
        row = await this.createProduct(mainCompanySlug, row.id, line.id || line.lineId, {
          confirm: true,
          productGroup: line.productDraftJson?.productGroup || "GENEL",
          unit: line.unit || line.productDraftJson?.unit || "ADET",
        });
      }
    }
    row = await this.findRow(mainCompanySlug, idValue);
    const missing = this.computeMissing(row);
    if (missing.length) {
      const manualBlockers = missing.filter((field) =>
        MANUAL_APPROVAL_BLOCKERS.has(field),
      );
      if (!manualBlockers.length) {
        return this.approve(mainCompanySlug, idValue, {
          ...body,
          confirm: true,
          manualApproval: true,
          manualApprovalReason:
            clean(body.manualApprovalReason) ||
            `Kritik olmayan XML/PDF kontrol uyarilari kabul edildi: ${missing.join(", ")}`,
          approvedBy: clean(body.approvedBy) || "AUTO_PROCESS",
        });
      }
      const next = {
        ...row,
        status: "MISSING_INFO" as DocumentIntakeStatus,
        missingFields: missing,
        updatedAt: new Date().toISOString(),
      };
      await this.saveRow(mainCompanySlug, next);
      return {
        ok: false,
        id: row.id,
        skipped: true,
        quarantine: true,
        reason: `Kritik eksik: ${manualBlockers.join(", ")}`,
        item: next,
      };
    }
    return this.approve(mainCompanySlug, idValue, body);
  }

  async approve(
    mainCompanySlug: string,
    idValue: string,
    body: ApproveDocumentIntakeDto = {},
  ) {
    if (body.confirm !== true)
      throw new BadRequestException("Onay için confirm=true gönderilmelidir.");
    const slug = clean(
      body.mainCompanySlug || mainCompanySlug || "mecit-hakan",
    );
    const row = await this.findRow(slug, idValue);
    const missing = this.computeMissing(row);
    const manualApproval = body.manualApproval === true;
    const manualBlockers = missing.filter((field) =>
      MANUAL_APPROVAL_BLOCKERS.has(field),
    );
    if (missing.length && (!manualApproval || manualBlockers.length)) {
      return {
        ok: false,
        id: row.id,
        skipped: true,
        reason: manualBlockers.length
          ? `Manuel onaya kapali kritik hatalar: ${manualBlockers.join(", ")}`
          : `Eksik alanlar: ${missing.join(", ")}`,
      };
    }
    const duplicate = await this.findApprovedDuplicate(slug, row);
    if (duplicate)
      throw new BadRequestException(
        "Bu belge daha önce fileHash veya documentNo ile onaylanmış.",
      );

    const approved = await this.prisma.$transaction(async (tx) => {
      const documentType = this.legacyType(row.documentKind);
      const posting = await this.resolveSupplierPosting(tx, slug, row);
      const companyForCategory = row.firmId
        ? await tx.company.findFirst({
            where: { id: row.firmId, mainCompanySlug: slug },
            select: { varsayilanRaporKategoriId: true, raw: true },
          })
        : null;
      const rawCompany =
        companyForCategory?.raw && typeof companyForCategory.raw === "object"
          ? (companyForCategory.raw as any)
          : {};
      const approvalBody = body as any;
      let raporKategoriId =
        clean(approvalBody.raporKategoriId) ||
        clean(approvalBody.varsayilanRaporKategoriId) ||
        clean(companyForCategory?.varsayilanRaporKategoriId) ||
        clean(rawCompany.varsayilanRaporKategoriId) ||
        clean(rawCompany.defaultReportCategoryId);
      let kategoriKaynagi = raporKategoriId
        ? clean(approvalBody.raporKategoriId)
          ? "MANUEL"
          : "FIRMA_KARTI"
        : "";
      if (!raporKategoriId) {
        const defaultCategory = await (tx as any).muhasebeRaporKategorisi.upsert({
          where: {
            mainCompanySlug_ad: {
              mainCompanySlug: slug,
              ad: "Diğer Giderler",
            },
          },
          create: {
            mainCompanySlug: slug,
            ad: "Diğer Giderler",
            kod: "DIGER_GIDERLER",
            kategoriTipi: "DIGER",
            sira: 999,
            aktifMi: true,
            sistemKategorisiMi: true,
          },
          update: {},
        });
        raporKategoriId = defaultCategory.id;
        kategoriKaynagi = "SISTEM";
      }
      const document = await tx.document.create({
        data: {
          mainCompanySlug: slug,
          companyId: row.firmId || null,
          documentNo: row.documentNo || row.invoiceNo || row.dispatchNo || null,
          documentType,
          sourceType: "DOCUMENT_INTAKE",
          date: dateValue(row.issueDate),
          subtotal: safeDecimal(row.subtotal),
          vatTotal: safeDecimal(row.vatTotal),
          grandTotal: safeDecimal(row.grandTotal),
          status: "islendi",
          processedAt: new Date(),
          fileHash: row.fileHash || null,
          detectedType: row.documentKind,
          targetType: row.documentKind,
          targetModule: "DOCUMENT_INTAKE",
          firmMatchStatus: row.firmMatchStatus,
          raporKategoriId,
          kategoriKaynagi,
          raw: {
            documentIntakeId: row.id,
            documentKind: row.documentKind,
            supplierPostingType: posting.type,
            paymentStatus: posting.paymentStatus,
            expenseCategory: posting.expenseCategory,
            manualApproval: manualApproval
              ? {
                  approvedBy: clean(body.approvedBy) || "SYSTEM",
                  approvedAt: new Date().toISOString(),
                  reason:
                    clean(body.manualApprovalReason) ||
                    "Kullanici manuel onay verdi.",
                  acceptedWarnings: missing,
                  oldStatus: row.status,
                  newStatus: "APPROVED",
                }
              : null,
            direction: row.direction,
            issuerName: row.issuerName,
            receiverName: row.receiverName,
            modelGuess: row.modelGuess,
            lines: row.lines,
          },
        },
      });
      await tx.documentFile.create({
        data: {
          mainCompanySlug: slug,
          documentId: document.id,
          filePath: row.filePath,
          fileName: row.originalFileName,
          mimeType: row.mimeType || null,
          checksum: row.fileHash || null,
          role: "archive",
        },
      });
      for (const line of row.lines || []) {
        const lineQuantity = Number(line.quantity || 0);
        const lineUnitPrice = Number(line.unitPrice || 0);
        const derivedLineTotal =
          lineQuantity > 0 && lineUnitPrice > 0
            ? lineQuantity * lineUnitPrice
            : Number(line.subtotal || line.total || 0);
        const invoiceItem = await tx.invoiceItem.create({
          data: {
            mainCompanySlug: slug,
            documentId: document.id,
            productId: line.productId || null,
            lineNo: Number(line.lineNo || 0) || null,
            productName: clean(line.rawName || line.description) || null,
            normalizedProductName:
              normalizeSearchText(line.rawName || line.description) || null,
            description: clean(line.description) || null,
            quantity: safeDecimal(lineQuantity || 0),
            unit: clean(line.unit) || null,
            unitPrice: safeDecimal(lineUnitPrice || 0),
            vatRate: safeDecimal(line.vatRate || 0),
            vatAmount: safeDecimal(line.vatAmount || 0),
            lineTotal: safeDecimal(derivedLineTotal),
            lotNo: clean(line.lotNo) || null,
            raw: {
              ...line,
              accountingLineTotal: derivedLineTotal,
              accountingLineTotalSource:
                lineQuantity > 0 && lineUnitPrice > 0
                  ? "unitPriceQuantity"
                  : "parsedSubtotal",
            },
          },
        });
        if (
          row.documentKind === "SUPPLIER_INVOICE" &&
          line.lotNo &&
          line.productId
        ) {
          await tx.boyahaneLot.upsert({
            where: {
              mainCompanySlug_lotNo: {
                mainCompanySlug: slug,
                lotNo: clean(line.lotNo),
              },
            },
            update: {
              productId: line.productId,
              supplierCompanyId: row.firmId || null,
              invoiceItemId: invoiceItem.id,
              quantity: safeDecimal(line.quantity || 0),
              remainingQuantity: safeDecimal(line.quantity || 0),
              raw: { source: "DOCUMENT_INTAKE", documentId: document.id, line },
            },
            create: {
              mainCompanySlug: slug,
              productId: line.productId,
              supplierCompanyId: row.firmId || null,
              invoiceItemId: invoiceItem.id,
              lotNo: clean(line.lotNo),
              quantity: safeDecimal(line.quantity || 0),
              remainingQuantity: safeDecimal(line.quantity || 0),
              raw: { source: "DOCUMENT_INTAKE", documentId: document.id, line },
            },
          });
        }
      }
      if (
        row.modelId &&
        ["OUR_INVOICE", "OUR_DISPATCH", "CUSTOMER_DISPATCH"].includes(
          row.documentKind,
        )
      ) {
        await tx.modelDocumentLink.upsert({
          where: {
            mainCompanySlug_modelId_documentId: {
              mainCompanySlug: slug,
              modelId: row.modelId,
              documentId: document.id,
            },
          },
          update: {
            raw: {
              source: "DOCUMENT_INTAKE",
              documentKind: row.documentKind,
              quantity: this.totalQuantity(row),
            },
          },
          create: {
            mainCompanySlug: slug,
            modelId: row.modelId,
            documentId: document.id,
            raw: {
              source: "DOCUMENT_INTAKE",
              documentKind: row.documentKind,
              quantity: this.totalQuantity(row),
            },
          },
        });
      }
      if (
        row.firmId &&
        ["OUR_INVOICE", "SUPPLIER_INVOICE"].includes(row.documentKind)
      ) {
        const createOpenPayable =
          row.documentKind === "OUR_INVOICE" || posting.type === "OPEN_PAYABLE";
        const effect =
          row.documentKind === "OUR_INVOICE"
            ? Number(row.grandTotal || 0)
            : -Number(row.grandTotal || 0);
        const company = await tx.company.findFirst({
          where: { id: row.firmId, mainCompanySlug: slug },
        });
        const cariEffect = createOpenPayable ? effect : 0;
        const balanceAfter = Number(company?.currentBalance || 0) + cariEffect;
        const currentAccountMovement = await tx.currentAccountMovement.create({
          data: {
            mainCompanySlug: slug,
            companyId: row.firmId,
            movementDate: dateValue(row.issueDate),
            movementType:
              row.documentKind === "OUR_INVOICE"
                ? "SATIS_FATURA"
                : "ALIS_FATURA",
            sourceType: "DOCUMENT_INTAKE",
            documentNo: row.documentNo || row.invoiceNo,
            documentId: document.id,
            description: `Belge onayı: ${row.documentKind}`,
            debit: safeDecimal(cariEffect > 0 ? cariEffect : 0),
            credit: safeDecimal(cariEffect < 0 ? Math.abs(cariEffect) : 0),
            amount: safeDecimal(Math.abs(cariEffect)),
            effect: safeDecimal(cariEffect),
            balanceAfter: safeDecimal(balanceAfter),
            raw: { documentIntakeId: row.id, supplierPostingType: posting.type },
          },
        });
        await tx.company.update({
          where: { id: row.firmId },
          data: { currentBalance: safeDecimal(balanceAfter) },
        });
        const legacyCariMovement = await (tx as any).cariMovement
          .create({
            data: {
              mainCompanyId: slug,
              firmId: row.firmId,
              documentId: document.id,
              movementType:
                row.documentKind === "OUR_INVOICE" ? "CREDIT" : "DEBIT",
              workType: "OFFICIAL",
              date: dateValue(row.issueDate),
              dueDate: dateValue(row.dueDate || row.issueDate),
              description: `Belge onayı: ${row.documentKind}`,
              debit: safeDecimal(
                createOpenPayable && row.documentKind !== "OUR_INVOICE"
                  ? row.grandTotal || 0
                  : 0,
              ),
              credit: safeDecimal(
                createOpenPayable && row.documentKind === "OUR_INVOICE"
                  ? row.grandTotal || 0
                  : 0,
              ),
              balanceAfter: safeDecimal(balanceAfter),
            },
          })
          .catch(() => null);
        if (!createOpenPayable && posting.type !== "VAT_ONLY_EXPENSE") {
          await tx.payment
            .create({
              data: {
                mainCompanySlug: slug,
                companyId: row.firmId,
                paymentDate: dateValue(row.issueDate),
                paymentType: posting.type,
                direction: "OUT",
                amount: safeDecimal(row.grandTotal || 0),
                currency: row.currency || "TRY",
                description: `Odenmis gider: ${row.documentNo || row.invoiceNo || ""}`,
                documentNo: row.documentNo || row.invoiceNo,
                sourceType: "DOCUMENT_INTAKE_EXPENSE",
                raw: {
                  documentId: document.id,
                  documentIntakeId: row.id,
                  supplierPostingType: posting.type,
                  expenseCategory: posting.expenseCategory,
                  openPayableEffect: 0,
                },
              },
            })
            .catch(() => null);
        }
        (document as any)._accountingEffects = {
          ...((document as any)._accountingEffects || {}),
          currentAccountMovementId: currentAccountMovement.id,
          cariMovementId: legacyCariMovement?.id || "",
          balanceAfter,
          supplierPostingType: posting.type,
          paymentStatus: posting.paymentStatus,
          openPayableEffect: cariEffect,
          expenseEffect:
            createOpenPayable || posting.type === "VAT_ONLY_EXPENSE"
              ? 0
              : Number(row.grandTotal || 0),
        };
      }
      if (["OUR_INVOICE", "SUPPLIER_INVOICE"].includes(row.documentKind)) {
        const periodDate = dateValue(row.issueDate);
        const vatRecord = await tx.vatRecord.create({
          data: {
            mainCompanySlug: slug,
            companyId: row.firmId || null,
            firmId: row.firmId || null,
            documentId: document.id,
            direction:
              row.documentKind === "OUR_INVOICE" ? "OUTGOING" : "INCOMING",
            workType: "OFFICIAL",
            date: periodDate,
            subtotal: safeDecimal(row.subtotal || 0),
            total: safeDecimal(row.grandTotal || 0),
            periodMonth: periodDate.getUTCMonth() + 1,
            periodYear: periodDate.getUTCFullYear(),
            vatDirection:
              row.documentKind === "OUR_INVOICE" ? "SALES" : "PURCHASE",
            vatRate: safeDecimal((row.lines || [])[0]?.vatRate || 0),
            baseAmount: safeDecimal(row.subtotal || 0),
            vatAmount: safeDecimal(row.vatTotal || 0),
            documentNo: row.documentNo || row.invoiceNo,
            documentDate: periodDate,
            incomingVat: safeDecimal(
              row.documentKind === "OUR_INVOICE" ? 0 : row.vatTotal || 0,
            ),
            outgoingVat: safeDecimal(
              row.documentKind === "OUR_INVOICE" ? row.vatTotal || 0 : 0,
            ),
            raw: {
              documentIntakeId: row.id,
              taxBreakdown: row.taxBreakdown || row.parseRawJson?.taxBreakdown || null,
              controlSummary: row.controlSummary || null,
              kdvControlStatus: missing.includes("VAT_REVIEW")
                ? "KDV_KONTROL_BEKLIYOR"
                : "KDV_KAYDI_OLUSTU",
              manualApproval: manualApproval || false,
              manualApprovalReason: body.manualApprovalReason || "",
            },
          },
        });
        (document as any)._accountingEffects = {
          ...((document as any)._accountingEffects || {}),
          vatRecordId: vatRecord.id,
        };
      }
      if (row.documentKind === "OUR_INVOICE" && row.firmId) {
        await (tx as any).mailTask
          .create({
            data: {
              mainCompanyId: slug,
              firmId: row.firmId,
              modelId: row.modelId || null,
              invoiceDocumentId: document.id,
              dispatchDocumentId: null,
              mailType: "INVOICE_SEND",
              subject:
                `Fatura gönderimi ${row.invoiceNo || row.documentNo || ""}`.trim(),
              body: "Onaylanan fatura için mail görevi oluşturuldu.",
              status: "DRAFT",
              toJson: [],
              ccJson: [],
              attachmentJson: [
                { documentId: document.id, filePath: row.filePath },
              ],
            },
          })
          .catch(() => null);
      }
      return document;
    });
    const next = {
      ...row,
      status: "APPROVED" as DocumentIntakeStatus,
      approvedDocumentId: approved.id,
      accountingEffects: {
        documentId: approved.id,
        supplierPostingType:
          (approved as any)._accountingEffects?.supplierPostingType ||
          "OPEN_PAYABLE",
        paymentStatus:
          (approved as any)._accountingEffects?.paymentStatus || "UNPAID",
        openPayableEffect:
          (approved as any)._accountingEffects?.openPayableEffect ?? null,
        expenseEffect:
          (approved as any)._accountingEffects?.expenseEffect ?? null,
        currentAccountMovementId:
          (approved as any)._accountingEffects?.currentAccountMovementId || "",
        cariMovementId: (approved as any)._accountingEffects?.cariMovementId || "",
        vatRecordId: (approved as any)._accountingEffects?.vatRecordId || "",
        balanceAfter: (approved as any)._accountingEffects?.balanceAfter ?? null,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.saveRow(slug, next);
    return { ok: true, item: next, documentId: approved.id };
  }

  async bulkApprove(
    mainCompanySlug: string,
    body: BulkApproveDocumentIntakeDto,
  ) {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const results = [];
    for (const itemId of ids) {
      try {
        const result = await this.approve(mainCompanySlug, itemId, body);
        results.push({ id: itemId, ...result });
      } catch (error: any) {
        results.push({
          id: itemId,
          ok: false,
          skipped: true,
          reason: error?.message || "Onaylanamadı",
        });
      }
    }
    return { ok: true, results };
  }

  private async expandFiles(
    mainCompanySlug: string,
    batchId: string,
    files: Express.Multer.File[],
  ) {
    const out: Array<{
      buffer: Buffer;
      fileName: string;
      filePath: string;
      fileHash: string;
      mimeType: string;
    }> = [];
    const baseDir = path.join(
      process.cwd(),
      "storage",
      "muhasebe",
      "document-intake",
      mainCompanySlug,
      batchId,
    );
    fs.mkdirSync(baseDir, { recursive: true });
    for (const file of files) {
      const buffer = file.buffer || fs.readFileSync(file.path);
      const ext = path.extname(file.originalname).toLocaleLowerCase("tr-TR");
      if (ext === ".zip") {
        const zip = new AdmZip(buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const entryExt = path
            .extname(entry.entryName)
            .toLocaleLowerCase("tr-TR");
          if (![".pdf", ".xml", ".jpg", ".jpeg", ".png"].includes(entryExt)) continue;
          const entryBuffer = entry.getData();
          out.push(
            this.persistBuffer(
              baseDir,
              path.basename(entry.entryName),
              entryBuffer,
            ),
          );
        }
      } else if ([".pdf", ".xml", ".jpg", ".jpeg", ".png"].includes(ext)) {
        out.push(
          this.persistBuffer(baseDir, file.originalname, buffer, file.mimetype),
        );
      }
    }
    return out;
  }

  private persistBuffer(
    baseDir: string,
    fileName: string,
    buffer: Buffer,
    mimeType?: string,
  ) {
    const safeName = `${Date.now()}-${fileName.replace(/[<>:"/\\|?*]/g, " ")}`;
    const filePath = path.join(baseDir, safeName);
    fs.writeFileSync(filePath, buffer);
    return {
      buffer,
      fileName,
      filePath,
      fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
      mimeType:
        mimeType || String(mimeLookup(fileName) || "application/octet-stream"),
    };
  }

  private async createIntakeRecord(args: any) {
    const {
      batchId,
      mainCompanySlug,
      mainCompanyId,
      parsed,
      classified,
      matched,
    } = args as {
      batchId: string;
      mainCompanySlug: string;
      mainCompanyId: string;
      parsed: ParsedDocument;
      classified: {
        documentKind: DocumentKind;
        direction: string;
        reasons: string[];
      };
      matched: any;
    };
    const lineRows = matched.lines.map((line: any, index: number) => ({
      id: line.lineId || id("line"),
      lineId: line.lineId || id("line"),
      lineNo: line.lineNo || index + 1,
      rawName: line.rawName,
      description: line.description,
      productId: line.productId || null,
      productDraftJson: line.productDraftJson || null,
      productMatchStatus: line.productMatchStatus || "PENDING",
      quantity: line.quantity || 0,
      unit: line.unit || "",
      unitPrice: line.unitPrice || 0,
      subtotal: line.subtotal || 0,
      vatRate: line.vatRate || 0,
      vatAmount: line.vatAmount || 0,
      total: line.total || 0,
      lotNo: line.lotNo || "",
      modelGuess: line.modelGuess || parsed.modelGuess || "",
      sellerItemId: line.sellerItemId || "",
      manufacturerItemId: line.manufacturerItemId || "",
      standardItemId: line.standardItemId || "",
      missingFields: line.missingFields || [],
    }));
    const row: any = {
      id: id("doc"),
      batchId,
      mainCompanyId,
      mainCompanySlug,
      originalFileName: parsed.originalFileName,
      filePath: parsed.filePath,
      fileHash: parsed.fileHash,
      mimeType: parsed.mimeType,
      documentNo: parsed.documentNo || parsed.invoiceNo || parsed.dispatchNo,
      invoiceNo: parsed.invoiceNo,
      dispatchNo: parsed.dispatchNo,
      documentKind: classified.documentKind,
      direction: classified.direction,
      scenario: parsed.scenario,
      documentType: parsed.documentType,
      issueDate: parsed.issueDate,
      dueDate: parsed.dueDate || "",
      issuerName: parsed.issuerName,
      issuerTaxNo: parsed.issuerTaxNo,
      receiverName: parsed.receiverName,
      receiverTaxNo: parsed.receiverTaxNo,
      firmId: matched.firmMatch.firmId,
      firmDraftJson: matched.firmMatch.firmDraftJson,
      firmMatchStatus: matched.firmMatch.firmMatchStatus,
      productMatchStatus: lineRows.some(
        (line: any) => line.productMatchStatus === "NEW_DRAFT",
      )
        ? "PENDING"
        : "MATCHED",
      modelId: matched.modelMatch.modelId,
      modelGuess: parsed.modelGuess,
      modelMatchStatus: matched.modelMatch.modelMatchStatus,
      currency: parsed.currency || "TRY",
      subtotal: parsed.subtotal,
      vatTotal: parsed.vatTotal,
      grandTotal: parsed.grandTotal,
      lines: lineRows,
      parseRawJson: parsed.parseRawJson,
      taxBreakdown: parsed.taxBreakdown || parsed.parseRawJson?.taxBreakdown || null,
      classificationReasons: classified.reasons,
      missingFields: [],
      status: "CONTROL_WAITING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    row.controlSummary = this.buildControlSummary(row);
    row.missingFields = this.computeMissing(row);
    row.controlSummary = this.buildControlSummary(row);
    row.status = this.statusForMissing(row.missingFields);
    await this.saveRow(mainCompanySlug, row);
    return this.publicRow(row);
  }

  private moneyNumber(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private taxBreakdownFromRow(row: any) {
    const raw = row.parseRawJson && typeof row.parseRawJson === "object" ? row.parseRawJson : {};
    const rawTax = (raw as any).taxBreakdown || (raw as any).raw?.taxBreakdown || {};
    return row.taxBreakdown || rawTax || {};
  }

  private buildControlSummary(row: any) {
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const taxBreakdown = this.taxBreakdownFromRow(row);
    const documentSubtotal = this.moneyNumber(row.subtotal);
    const subtotalFromRows = lines.reduce((sum: number, line: any) => sum + this.moneyNumber(line.subtotal), 0);
    const subtotalFromUnitPrice = lines.reduce(
      (sum: number, line: any) =>
        sum + this.moneyNumber(line.unitPrice) * this.moneyNumber(line.quantity || 1),
      0,
    );
    const subtotalFromTotals = lines.reduce((sum: number, line: any) => sum + this.moneyNumber(line.total), 0);
    const subtotalCandidates = [
      { source: "TaxableAmount", value: this.moneyNumber(taxBreakdown.lineSubtotal) },
      { source: "LineSubtotal", value: subtotalFromRows },
      { source: "UnitPriceQuantity", value: subtotalFromUnitPrice },
      { source: "LineTotal", value: subtotalFromTotals },
    ].filter((item) => item.value > 0);
    const lineSubtotalChoice =
      documentSubtotal > 0 && subtotalCandidates.length
        ? subtotalCandidates.reduce((best, item) =>
            Math.abs(item.value - documentSubtotal) < Math.abs(best.value - documentSubtotal)
              ? item
              : best,
          )
        : subtotalCandidates[0] || { source: "", value: 0 };
    const lineSubtotal = lineSubtotalChoice.value;
    const lineVat =
      this.moneyNumber(taxBreakdown.lineVat) ||
      lines.reduce((sum: number, line: any) => sum + this.moneyNumber(line.vatAmount), 0);
    const expectedVatByLineRate = lines.reduce((sum: number, line: any) => {
      const quantity = this.moneyNumber(line.quantity || 1) || 1;
      const basis =
        this.moneyNumber(line.unitPrice) > 0
          ? this.moneyNumber(line.unitPrice) * quantity
          : this.moneyNumber(line.subtotal || line.total);
      return sum + (basis * this.moneyNumber(line.vatRate)) / 100;
    }, 0);
    const documentVat = this.moneyNumber(row.vatTotal);
    const documentTaxTotal = this.moneyNumber(taxBreakdown.documentTaxTotal) || documentVat;
    const normalVat = this.moneyNumber(taxBreakdown.normalVat) || lineVat;
    const withholdingVat = this.moneyNumber(taxBreakdown.withholdingVat);
    const otherTax = this.moneyNumber(taxBreakdown.otherTax);
    const discountTotal = this.moneyNumber(taxBreakdown.discountTotal);
    const chargeTotal = this.moneyNumber(taxBreakdown.chargeTotal);
    const grandTotal = this.moneyNumber(row.grandTotal);
    const tolerance = Math.max(0.05, Math.abs(grandTotal) * 0.01);
    const subtotalDiff = lineSubtotal - documentSubtotal;
    const subtotalOk = documentSubtotal <= 0 || Math.abs(subtotalDiff) <= tolerance;
    const vatControlBase = expectedVatByLineRate > 0 ? expectedVatByLineRate : lineVat;
    const vatDiff = vatControlBase - documentTaxTotal;
    const vatReview =
      subtotalOk &&
      documentTaxTotal > 0 &&
      vatControlBase > 0 &&
      Math.abs(vatDiff) > tolerance;
    const grandExpected = documentSubtotal - discountTotal + chargeTotal + documentTaxTotal - withholdingVat;
    const fallbackGrandExpected = documentSubtotal + documentTaxTotal;
    const chosenGrandExpected =
      discountTotal || chargeTotal || withholdingVat ? grandExpected : fallbackGrandExpected;
    const grandDiff = chosenGrandExpected - grandTotal;
    const grandTotalOk = grandTotal <= 0 || Math.abs(grandDiff) <= tolerance;
    const zeroPriceLineCount = lines.filter((line: any) => this.moneyNumber(line.unitPrice) <= 0).length;
    const missingPriceLineCount = lines.filter(
      (line: any) =>
        this.moneyNumber(line.unitPrice) <= 0 &&
        !(this.moneyNumber(line.subtotal) > 0 && this.moneyNumber(line.quantity) > 0),
    ).length;
    let quarantineCode = "READY";
    if (missingPriceLineCount) quarantineCode = "LINE_PRICE_MISSING";
    else if (!subtotalOk) quarantineCode = "LINE_TOTAL_MISMATCH";
    else if (!grandTotalOk) quarantineCode = "GRAND_TOTAL_MISMATCH";
    else if (vatReview) quarantineCode = "VAT_REVIEW";
    return {
      quarantineCode,
      subtotalOk,
      vatReview,
      grandTotalOk,
      tolerance,
      lineSubtotal,
      lineSubtotalSource: lineSubtotalChoice.source,
      documentSubtotal,
      subtotalDiff,
      lineVat,
      expectedVatByLineRate,
      vatControlBase,
      documentVat,
      documentTaxTotal,
      normalVat,
      withholdingVat,
      otherTax,
      discountTotal,
      chargeTotal,
      vatDiff,
      grandExpected: chosenGrandExpected,
      grandTotal,
      grandDiff,
      zeroPriceLineCount,
      missingPriceLineCount,
      taxSubtotals: taxBreakdown.taxSubtotals || [],
      withholdingSubtotals: taxBreakdown.withholdingSubtotals || [],
      allowanceCharges: taxBreakdown.allowanceCharges || [],
      explanation:
        quarantineCode === "VAT_REVIEW"
          ? "Satir matrah toplami belge matrahiyla uyumlu; belge KDV/vergi toplamı satir KDV toplamindan farkli. XML vergi dokumu kontrol edilerek manuel onaylanabilir."
          : quarantineCode === "LINE_TOTAL_MISMATCH"
            ? "Satir matrah toplami belge matrahiyla uyusmuyor."
            : quarantineCode === "GRAND_TOTAL_MISMATCH"
              ? "Genel toplam kontrolu belge toplami ile uyusmuyor."
              : quarantineCode === "LINE_PRICE_MISSING"
                ? "Satir fiyati XML'den guvenli sekilde okunamadi."
                : "Belge kontrolu tamam.",
    };
  }

  private computeMissing(row: any) {
    const missing = new Set<string>();
    const control = this.buildControlSummary(row);
    row.controlSummary = control;
    if (!row.documentNo && !row.invoiceNo && !row.dispatchNo)
      missing.add("DOCUMENT_NO");
    if (!row.firmId) missing.add("FIRM");
    if (["OUR_INVOICE", "SUPPLIER_INVOICE", "EXPENSE_INVOICE"].includes(row.documentKind)) {
      if (Number(row.subtotal || 0) <= 0) missing.add("SUBTOTAL_ZERO");
      if (Number(row.grandTotal || 0) <= 0) missing.add("TOTAL_ZERO");
      if (Number(row.vatTotal || 0) < 0) missing.add("VAT_INVALID");
    }
    if (
      ["OUR_INVOICE", "OUR_DISPATCH"].includes(row.documentKind) &&
      !row.modelId
    )
      missing.add("MODEL");
    if (row.documentKind === "CUSTOMER_DISPATCH" && !row.modelId)
      missing.add("MODEL");
    if (row.documentKind === "SUPPLIER_INVOICE") {
      for (const line of row.lines || []) {
        if (!line.productId) missing.add("PRODUCT");
        if (Number(line.quantity || 0) <= 0) missing.add("LINE_QUANTITY_ZERO");
        if (
          Number(line.unitPrice || 0) <= 0 &&
          Number(line.subtotal || 0) > 0 &&
          Number(line.quantity || 0) > 0
        ) {
          line.unitPrice = Number(line.subtotal || 0) / Number(line.quantity || 1);
          line.priceDerived = true;
          line.priceSource = line.priceSource || "Subtotal/Quantity";
        }
        if (Number(line.unitPrice || 0) <= 0) missing.add("LINE_PRICE_MISSING");
        if (Number(line.subtotal || line.total || 0) <= 0)
          missing.add("LINE_TOTAL_ZERO");
      }
      if (!control.subtotalOk) missing.add("LINE_TOTAL_MISMATCH");
      if (control.vatReview) missing.add("VAT_REVIEW");
      if (!control.grandTotalOk) missing.add("GRAND_TOTAL_MISMATCH");
    }
    if (
      [...missing].some((field) =>
        ["DOCUMENT_NO", "FIRM", "SUBTOTAL_ZERO", "TOTAL_ZERO", "LINE_QUANTITY_ZERO", "LINE_PRICE_MISSING"].includes(field),
      )
    ) {
      missing.add("MISSING_REQUIRED_DATA");
    }
    return [...missing];
  }

  private statusForMissing(missing: string[]) {
    return missing.length ? "MISSING_INFO" : "READY";
  }

  private async readRows(mainCompanySlug: string): Promise<any[]> {
    const rows = await this.prisma.documentIntake.findMany({
      where: { mainCompanySlug },
      include: {
        lines: { orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row: any) => {
      const meta =
        row.parseRawJson && typeof row.parseRawJson === "object"
          ? row.parseRawJson
          : {};
      const intakeMeta =
        meta._intakeMeta && typeof meta._intakeMeta === "object"
          ? meta._intakeMeta
          : {};
      const mapped = {
        ...intakeMeta,
        id: row.id,
        batchId: row.batchId,
        mainCompanyId: row.mainCompanyId || "",
        mainCompanySlug: row.mainCompanySlug,
        originalFileName: row.originalFileName,
        filePath: row.filePath,
        fileHash: row.fileHash || "",
        mimeType: row.mimeType || "",
        documentNo: row.documentNo || "",
        invoiceNo: row.invoiceNo || "",
        dispatchNo: row.dispatchNo || "",
        documentKind: row.documentKind,
        direction: row.direction || "",
        scenario: row.scenario || "",
        documentType: row.documentType || "",
        issueDate: row.issueDate
          ? row.issueDate.toISOString().slice(0, 10)
          : "",
        dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : "",
        issuerName: row.issuerName || "",
        issuerTaxNo: row.issuerTaxNo || "",
        receiverName: row.receiverName || "",
        receiverTaxNo: row.receiverTaxNo || "",
        firmId: row.firmId || "",
        firmDraftJson: row.firmDraftJson || null,
        modelId: row.modelId || "",
        modelGuess: row.modelGuess || "",
        currency: row.currency || "TRY",
        subtotal: Number(row.subtotal || 0),
        vatTotal: Number(row.vatTotal || 0),
        grandTotal: Number(row.grandTotal || 0),
        status: row.status,
        parseRawJson: meta.raw || meta,
        taxBreakdown: intakeMeta.taxBreakdown || meta.taxBreakdown || meta.raw?.taxBreakdown || null,
        controlSummary: intakeMeta.controlSummary || null,
        missingFields: Array.isArray(meta._missingFields)
          ? meta._missingFields
          : [],
        lines: row.lines.map((line: any) => {
          const lineMeta =
            line.missingFieldsJson && typeof line.missingFieldsJson === "object"
              ? line.missingFieldsJson
              : {};
          return {
            id: line.id,
            lineId: line.id,
            lineNo: line.lineNo,
            rawName: line.rawName || "",
            description: line.description || "",
            productId: line.productId || "",
            productDraftJson: line.productDraftJson || null,
            quantity: Number(line.quantity || 0),
            unit: line.unit || "",
            kg: Number(line.kg || 0),
            packageInfo: line.packageInfo || "",
            unitPrice: Number(line.unitPrice || 0),
            discountRate: Number(line.discountRate || 0),
            discountAmount: Number(line.discountAmount || 0),
            subtotal: Number(line.subtotal || 0),
            vatRate: Number(line.vatRate || 0),
            vatAmount: Number(line.vatAmount || 0),
            total: Number(line.total || 0),
            lotNo: line.lotNo || "",
            modelGuess: line.modelGuess || "",
            productMatchStatus: lineMeta.productMatchStatus || "",
            productCreated: lineMeta.productCreated === true,
            sellerItemId: lineMeta.sellerItemId || "",
            manufacturerItemId: lineMeta.manufacturerItemId || "",
            standardItemId: lineMeta.standardItemId || "",
            priceDerived: lineMeta.priceDerived === true,
            priceSource: lineMeta.priceSource || "",
            missingFields: Array.isArray(lineMeta.missingFields)
              ? lineMeta.missingFields
              : [],
          };
        }),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
      if (
        !PROCESSED_INTAKE_STATUSES.has(String(mapped.status || "").toUpperCase()) &&
        !["REJECTED", "ARCHIVED"].includes(String(mapped.status || "").toUpperCase())
      ) {
        mapped.controlSummary = this.buildControlSummary(mapped);
        mapped.missingFields = this.computeMissing(mapped);
        mapped.controlSummary = this.buildControlSummary(mapped);
        mapped.status = this.statusForMissing(mapped.missingFields);
      }
      return mapped;
    });
  }

  private async saveRow(mainCompanySlug: string, row: any) {
    const parseRawJson = {
      raw: row.parseRawJson || null,
      _missingFields: row.missingFields || [],
      _intakeMeta: {
        firmMatchStatus: row.firmMatchStatus || "",
        productMatchStatus: row.productMatchStatus || "",
        modelMatchStatus: row.modelMatchStatus || "",
        classificationReasons: row.classificationReasons || [],
        approvedDocumentId: row.approvedDocumentId || "",
        accountingEffects: row.accountingEffects || null,
        taxBreakdown: row.taxBreakdown || row.parseRawJson?.taxBreakdown || null,
        controlSummary: row.controlSummary || null,
        archiveReason: row.archiveReason || "",
        archivedAt: row.archivedAt || "",
      },
    };
    const documentKind =
      row.documentKind === "EXPENSE_INVOICE"
        ? "SUPPLIER_INVOICE"
        : row.documentKind || "UNKNOWN";
    const status = row.status || this.statusForMissing(row.missingFields || []);
    await this.prisma.$transaction(async (tx) => {
      await tx.documentIntake.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          batchId: row.batchId,
          mainCompanyId: clean(row.mainCompanyId) || null,
          mainCompanySlug,
          originalFileName: clean(row.originalFileName),
          filePath: clean(row.filePath),
          fileHash: clean(row.fileHash) || null,
          mimeType: clean(row.mimeType) || null,
          documentNo: clean(row.documentNo) || null,
          invoiceNo: clean(row.invoiceNo) || null,
          dispatchNo: clean(row.dispatchNo) || null,
          documentKind,
          direction: clean(row.direction) || null,
          scenario: clean(row.scenario) || null,
          documentType: clean(row.documentType) || null,
          issueDate: row.issueDate ? dateValue(row.issueDate) : null,
          dueDate: row.dueDate ? dateValue(row.dueDate) : null,
          issuerName: clean(row.issuerName) || null,
          issuerTaxNo: clean(row.issuerTaxNo) || null,
          receiverName: clean(row.receiverName) || null,
          receiverTaxNo: clean(row.receiverTaxNo) || null,
          firmId: clean(row.firmId) || null,
          firmDraftJson: row.firmDraftJson || undefined,
          modelId: clean(row.modelId) || null,
          modelGuess: clean(row.modelGuess) || null,
          currency: clean(row.currency) || "TRY",
          subtotal: safeDecimal(row.subtotal || 0),
          vatTotal: safeDecimal(row.vatTotal || 0),
          grandTotal: safeDecimal(row.grandTotal || 0),
          status,
          missingFieldsJson: row.missingFields || [],
          parseRawJson,
        },
        update: {
          firmId: clean(row.firmId) || null,
          firmDraftJson: row.firmDraftJson || undefined,
          modelId: clean(row.modelId) || null,
          documentKind,
          subtotal: safeDecimal(row.subtotal || 0),
          vatTotal: safeDecimal(row.vatTotal || 0),
          grandTotal: safeDecimal(row.grandTotal || 0),
          status,
          missingFieldsJson: row.missingFields || [],
          parseRawJson,
        },
      });
      await tx.documentIntakeLine.deleteMany({
        where: { documentIntakeId: row.id },
      });
      if (Array.isArray(row.lines) && row.lines.length) {
        await tx.documentIntakeLine.createMany({
          data: row.lines.map((line: any, index: number) => ({
            id: clean(line.id || line.lineId) || id("line"),
            documentIntakeId: row.id,
            lineNo: Number(line.lineNo || index + 1),
            rawName: clean(line.rawName) || null,
            description: clean(line.description) || null,
            productId: clean(line.productId) || null,
            productDraftJson: line.productDraftJson || undefined,
            quantity: safeDecimal(line.quantity || 0),
            unit: clean(line.unit) || null,
            kg: safeDecimal(line.kg || 0),
            packageInfo: clean(line.packageInfo) || null,
            unitPrice: safeDecimal(line.unitPrice || 0),
            discountRate: safeDecimal(line.discountRate || 0),
            discountAmount: safeDecimal(line.discountAmount || 0),
            subtotal: safeDecimal(line.subtotal || 0),
            vatRate: safeDecimal(line.vatRate || 0),
            vatAmount: safeDecimal(line.vatAmount || 0),
            total: safeDecimal(line.total || 0),
            lotNo: clean(line.lotNo) || null,
            modelGuess: clean(line.modelGuess) || null,
            missingFieldsJson: {
              productMatchStatus: line.productMatchStatus || "",
              productCreated: line.productCreated === true,
              sellerItemId: line.sellerItemId || "",
              manufacturerItemId: line.manufacturerItemId || "",
              standardItemId: line.standardItemId || "",
              priceDerived: line.priceDerived === true,
              priceSource: line.priceSource || "",
              missingFields: line.missingFields || [],
            },
          })),
        });
      }
    });
  }

  private async findRow(mainCompanySlug: string, idValue: string) {
    const row = (await this.readRows(mainCompanySlug)).find(
      (item) => item.id === idValue,
    );
    if (!row) throw new NotFoundException("Belge intake kaydı bulunamadı.");
    return row;
  }

  private documentDuplicateConditions(row: any) {
    const documentNo = clean(row.documentNo || row.invoiceNo || row.dispatchNo);
    return [
      row.id ? { raw: { path: "$.documentIntakeId", equals: row.id } } : undefined,
      clean(row.approvedDocumentId) ? { id: clean(row.approvedDocumentId) } : undefined,
      row.fileHash ? { fileHash: row.fileHash } : undefined,
      documentNo ? { documentNo } : undefined,
    ].filter(Boolean) as any[];
  }

  private documentExactIntakeConditions(row: any) {
    return [
      row.id ? { raw: { path: "$.documentIntakeId", equals: row.id } } : undefined,
      clean(row.approvedDocumentId) ? { id: clean(row.approvedDocumentId) } : undefined,
    ].filter(Boolean) as any[];
  }

  private async findLinkedSqlDocument(mainCompanySlug: string, row: any) {
    const OR = this.documentExactIntakeConditions(row);
    if (!OR.length) return null;
    return this.prisma.document.findFirst({
      where: {
        mainCompanySlug,
        deletedAt: null,
        OR,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async documentAccountingEffectCounts(
    mainCompanySlug: string,
    documentId: string,
  ) {
    const [currentAccount, vat, invoiceItems, cari] = await Promise.all([
      this.prisma.currentAccountMovement.count({
        where: { mainCompanySlug, documentId },
      }),
      this.prisma.vatRecord.count({
        where: { mainCompanySlug, documentId },
      }),
      this.prisma.invoiceItem.count({
        where: { mainCompanySlug, documentId },
      }),
      (this.prisma as any).cariMovement
        .count({ where: { mainCompanyId: mainCompanySlug, documentId } })
        .catch(() => 0),
    ]);
    return { currentAccount, vat, invoiceItems, cari };
  }

  private async assertPurgeAllowed(mainCompanySlug: string, row: any) {
    const status = String(row.status || "").toUpperCase();
    if (PURGEABLE_STATUSES.has(status) && status !== "APPROVED") {
      return null;
    }
    const document = await this.findLinkedSqlDocument(mainCompanySlug, row);
    if (document) {
      const counts = await this.documentAccountingEffectCounts(
        mainCompanySlug,
        document.id,
      );
      if (counts.currentAccount > 0 || counts.vat > 0 || counts.cari > 0) {
        throw new BadRequestException(
          "Bu belge SQL’e işlenmiş, önce muhasebe hareketi iptal edilmelidir.",
        );
      }
      if (counts.invoiceItems > 0 && !PURGEABLE_STATUSES.has(status)) {
        throw new BadRequestException(
          "Bu belge SQL’e işlenmiş, önce muhasebe hareketi iptal edilmelidir.",
        );
      }
    }
    if (status === "APPROVED" || clean(row.approvedDocumentId)) {
      return document;
    }
    if (!PURGEABLE_STATUSES.has(status) && status !== "READY") {
      throw new BadRequestException(
        "Sadece reddedilen, hatalı, eksik, kontrolde bekleyen veya SQL’e hareket oluşturmamış intake kayıtları silinebilir.",
      );
    }
    return document;
  }

  private async deleteIntakeArtifacts(row: any) {
    const filePath = clean(row.filePath);
    if (!filePath) return;
    try {
      const storageRoot = path.resolve(
        process.cwd(),
        "storage",
        "muhasebe",
        "document-intake",
      );
      const target = path.resolve(filePath);
      if (target.startsWith(storageRoot + path.sep) && fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch {
      // Dosya silinemese bile DB purge akışını engelleme.
    }
  }

  private publicRow(row: any) {
    const quantity = (row.lines || []).reduce(
      (sum: number, line: any) => sum + Number(line.quantity || 0),
      0,
    );
    return {
      ...row,
      date: row.issueDate,
      fileName: row.originalFileName,
      adet: quantity,
      missingFields: row.missingFields || [],
    };
  }

  private totalQuantity(row: any) {
    return (row.lines || []).reduce(
      (sum: number, line: any) => sum + Number(line.quantity || 0),
      0,
    );
  }

  private async resolveSupplierPosting(tx: any, mainCompanySlug: string, row: any) {
    if (row.documentKind !== "SUPPLIER_INVOICE") {
      return {
        type: "OPEN_PAYABLE",
        paymentStatus: "UNPAID",
        expenseCategory: "",
      };
    }
    const company = row.firmId
      ? await tx.company.findFirst({
          where: { id: row.firmId, mainCompanySlug },
          select: { name: true, raw: true },
        })
      : null;
    const raw =
      company?.raw && typeof company.raw === "object" ? (company.raw as any) : {};
    const profile = clean(
      raw.companyTransactionProfile ||
        raw.calismaProfili ||
        raw.transactionProfile,
    ).toUpperCase();
    const trackReceivablePayable =
      raw.trackReceivablePayable ??
      raw.cariTakipEdilsin ??
      raw.cariTakip;
    const defaultCashSettlement =
      raw.defaultCashSettlement ??
      raw.varsayilanPesinKapama ??
      raw.pesinKapat;
    const configured = clean(raw.defaultSupplierPostingType).toUpperCase();
    if (
      [
        "CASH_EXPENSE",
        "VAT_ONLY_EXPENSE",
        "UNOFFICIAL_EXPENSE",
        "PERSONNEL_EXPENSE",
      ].includes(profile) ||
      trackReceivablePayable === false ||
      defaultCashSettlement === true
    ) {
      const expenseType =
        configured && configured !== "OPEN_PAYABLE"
          ? configured
          : profile === "VAT_ONLY_EXPENSE"
            ? "VAT_ONLY_EXPENSE"
            : "PAID_EXPENSE";
      return {
        type: EXPENSE_POSTING_TYPES.has(expenseType)
          ? expenseType
          : "PAID_EXPENSE",
        paymentStatus: clean(raw.defaultPaymentStatus) || "PAID",
        expenseCategory: clean(raw.expenseCategory),
      };
    }
    const type =
      configured === "OPEN_PAYABLE" || EXPENSE_POSTING_TYPES.has(configured)
        ? configured
        : this.suggestSupplierPostingType(company?.name || row.issuerName);
    return {
      type,
      paymentStatus:
        clean(raw.defaultPaymentStatus) ||
        (type === "OPEN_PAYABLE" ? "UNPAID" : "PAID"),
      expenseCategory: clean(raw.expenseCategory),
    };
  }

  private suggestSupplierPostingType(value: unknown) {
    const text = clean(value).toLocaleUpperCase("tr-TR");
    if (
      /(FILE MARKET|BIM|BİM|A101|ŞOK|SOK|MARKET|KUYUMCU|YEMEK|KIRTASIYE|KIRTASİYE|AKARYAKIT|RESTORAN|KAFE|TTNET|TURKCELL|TELEFON)/i.test(
        text,
      )
    ) {
      return "PAID_EXPENSE";
    }
    return "OPEN_PAYABLE";
  }

  private legacyType(kind: string) {
    const map: Record<string, string> = {
      OUR_INVOICE: "bizim_kestigimiz_fatura",
      OUR_DISPATCH: "bizim_kestigimiz_irsaliye",
      CUSTOMER_DISPATCH: "musteriden_gelen_irsaliye",
      SUPPLIER_INVOICE: "tedarikci_gelen_fatura",
      EXPENSE_INVOICE: "gider_faturasi",
    };
    return map[kind] || "bilinmeyen";
  }

  private async findApprovedDuplicate(mainCompanySlug: string, row: any) {
    const where: any = {
      mainCompanySlug,
      status: "islendi",
      deletedAt: null,
      OR: [
        row.fileHash ? { fileHash: row.fileHash } : undefined,
        row.documentNo ? { documentNo: row.documentNo } : undefined,
      ].filter(Boolean) as any[],
    };
    if (!where.OR?.length) return null;
    const candidates = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return (
      candidates.find((document) => !this.isZeroValueImportedDocument(document)) ||
      null
    );
  }

  private isZeroValueImportedDocument(document: any) {
    const subtotal = Number(document?.subtotal || 0);
    const vatTotal = Number(document?.vatTotal || 0);
    const grandTotal = Number(document?.grandTotal || 0);
    return subtotal <= 0 && vatTotal <= 0 && grandTotal <= 0;
  }

  private async findUploadDuplicate(
    mainCompanySlug: string,
    parsed: ParsedDocument,
  ) {
    const documentNo = clean(
      parsed.documentNo || parsed.invoiceNo || parsed.dispatchNo,
    );
    const issuerTaxNo = clean(parsed.issuerTaxNo);
    const intakeDuplicate = await this.prisma.documentIntake.findFirst({
      where: {
        mainCompanySlug,
        status: { notIn: ["REJECTED", "ARCHIVED", "APPROVED"] },
        OR: [
          parsed.fileHash ? { fileHash: parsed.fileHash } : undefined,
          documentNo
            ? {
                documentNo,
                ...(issuerTaxNo ? { issuerTaxNo } : {}),
              }
            : undefined,
        ].filter(Boolean) as any[],
      },
      orderBy: { createdAt: "desc" },
    });
    if (intakeDuplicate) {
      return {
        id: intakeDuplicate.id,
        status: intakeDuplicate.status,
        reason: "Ayni belge daha once intake havuzuna alinmis.",
      };
    }
    const approvedDuplicate = await this.findApprovedDuplicate(
      mainCompanySlug,
      {
        fileHash: parsed.fileHash,
        documentNo,
      },
    );
    if (approvedDuplicate) {
      return {
        id: approvedDuplicate.id,
        status: approvedDuplicate.status,
        reason: "Ayni belge daha once SQL tarafina islenmis.",
      };
    }
    return null;
  }
}
