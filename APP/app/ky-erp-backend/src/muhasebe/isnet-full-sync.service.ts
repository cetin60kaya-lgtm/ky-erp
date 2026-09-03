import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import { IsnetOperationsService } from "./isnet-operations.service";
import { MuhasebeSmartMatchService } from "./muhasebe-smart-match.service";

type Query = Record<string, any>;

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

@Injectable()
export class IsnetFullSyncService {
  private readonly activeRuns = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: IsnetOperationsService,
    private readonly documentIntake: DocumentIntakeServiceV2,
    private readonly smartMatch: MuhasebeSmartMatchService,
  ) {}

  async run(body: Query = {}) {
    const slug = clean(body.mainCompanySlug || body.companyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");

    const active = this.activeRuns.get(slug);
    if (active) return active;

    const operation = this.runInternal(slug, body);
    this.activeRuns.set(slug, operation);
    try {
      return await operation;
    } finally {
      if (this.activeRuns.get(slug) === operation) this.activeRuns.delete(slug);
    }
  }

  private async runInternal(slug: string, body: Query) {
    const maxPasses = Math.min(
      Math.max(numberValue(body.maxPasses) || 200, 1),
      500,
    );
    const batchSize = 50;
    const startedAt = new Date();
    let pass = 0;
    let lastResult: Query | null = null;
    let remaining = Number.POSITIVE_INFINITY;
    let downloaded = 0;
    let processed = 0;
    let markedRead = 0;
    let newDocuments = 0;
    const errors: Query[] = [];
    const seenErrors = new Set<string>();

    while (remaining > 0 && pass < maxPasses) {
      pass += 1;
      const result = await this.operations.sync({
        ...body,
        mainCompanySlug: slug,
        batchSize,
        force: body.force === true,
      });
      lastResult = result || {};
      const automation = result?.automation || {};
      const passDownloaded = numberValue(automation.downloaded);
      downloaded += passDownloaded;
      processed += numberValue(automation.processed);
      markedRead += numberValue(automation.markedRead);
      newDocuments = Math.max(
        newDocuments,
        numberValue(automation.newDocuments),
      );
      remaining = numberValue(automation.remaining);

      for (const error of Array.isArray(automation.errors)
        ? automation.errors
        : []) {
        const key = `${clean(error?.key)}:${clean(error?.documentNo)}:${clean(error?.message)}`;
        if (!seenErrors.has(key)) {
          seenErrors.add(key);
          errors.push(error);
        }
      }

      if (remaining > 0 && passDownloaded === 0) {
        throw new ServiceUnavailableException(
          `İşNet senkronizasyonu ilerleyemedi. ${remaining} belge kaldı; ilk hata: ${clean(errors[0]?.message) || "belge indirilemedi"}.`,
        );
      }
    }

    if (remaining > 0) {
      throw new ServiceUnavailableException(
        `İşNet senkronizasyonu güvenlik sınırına ulaştı. ${remaining} belge kaldı.`,
      );
    }

    // İşNet artık yalnızca e-Belge Merkezi'nin kaynaklarından biridir.
    // Portal belgelerini havuza alırız; nihai muhasebe postası kullanıcı onayında kalır.
    const supplierAccounting = await this.stageSupplierInvoices(slug);
    // Önceden onaylanmış / muhasebeleşmiş belgelerin mevcut ürün-stock-LOT yönlendirmesi
    // idempotent biçimde çalışmaya devam eder. Yeni staged intakeler Document olmadığı için
    // bu aşamada stok veya LOT oluşturmaz.
    const supplierRouting = await this.smartMatch.synchronizeSupplierRouting({
      mainCompanySlug: slug,
    });
    const completedAt = new Date();

    await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "FULL_SYNC_STATUS",
        },
      },
      update: {
        value: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          passes: pass,
          downloaded,
          processed,
          markedRead,
          newDocuments,
          remaining: 0,
          errorCount: errors.length,
          supplierAccounting,
          supplierRouting,
        },
        deletedAt: null,
      },
      create: {
        scope: "ISNET",
        mainCompanySlug: slug,
        key: "FULL_SYNC_STATUS",
        value: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          passes: pass,
          downloaded,
          processed,
          markedRead,
          newDocuments,
          remaining: 0,
          errorCount: errors.length,
          supplierAccounting,
          supplierRouting,
        },
      },
    });

    return {
      ...(lastResult || {}),
      ok: true,
      fullSync: true,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      passes: pass,
      supplierAccounting,
      supplierRouting,
      automation: {
        ...(lastResult?.automation || {}),
        downloaded,
        processed,
        markedRead,
        newDocuments,
        remaining: 0,
        batchSize,
        errors,
      },
    };
  }

  private multerFile(
    filePath: string,
    contentType: string,
  ): Express.Multer.File {
    const buffer = fs.readFileSync(filePath);
    return {
      fieldname: "files",
      originalname: path.basename(filePath),
      encoding: "7bit",
      mimetype: contentType,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  private async stageSupplierInvoices(slug: string) {
    const states = await this.prisma.isnetDocumentState.findMany({
      where: {
        mainCompanySlug: slug,
        direction: "incoming",
        kind: "invoice",
        completed: true,
      },
      orderBy: { downloadedAt: "asc" },
    });

    let alreadyComplete = 0;
    let stagedForReview = 0;
    let alreadyInPool = 0;
    const failures: Query[] = [];

    for (const state of states) {
      const documentNo = clean(state.documentNo);
      if (!documentNo) continue;

      const document = await this.prisma.document.findFirst({
        where: { mainCompanySlug: slug, documentNo, deletedAt: null },
        select: { id: true, companyId: true },
      });
      const movement = document
        ? await this.prisma.currentAccountMovement.findFirst({
            where: {
              mainCompanySlug: slug,
              documentNo,
              documentId: document.id,
            },
            select: { id: true },
          })
        : null;
      const vat = document
        ? await this.prisma.vatRecord.findFirst({
            where: { mainCompanySlug: slug, documentId: document.id },
            select: { id: true },
          })
        : null;

      if (document && movement && vat) {
        alreadyComplete += 1;
        continue;
      }

      const xmlPath = clean(state.xmlPath);
      const pdfPath = clean(state.pdfPath);
      try {
        if (!xmlPath || !fs.existsSync(xmlPath)) {
          throw new Error("Yerel XML dosyası bulunamadı.");
        }
        const files: Express.Multer.File[] = [
          this.multerFile(xmlPath, "application/xml"),
        ];
        if (pdfPath && fs.existsSync(pdfPath)) {
          files.push(this.multerFile(pdfPath, "application/pdf"));
        }

        const result = await this.documentIntake.upload(files, {
          mainCompanySlug: slug,
          autoApprove: false,
          sourceProvider: "ISNET",
        });
        if (result?.errors?.length) {
          throw new Error(
            result.errors
              .map((row: any) => clean(row?.message))
              .filter(Boolean)
              .join(" ") || "Fatura e-Belge Havuzuna alınamadı.",
          );
        }

        const created = Number(result?.items?.length || 0);
        const skipped = Number(result?.skipped?.length || 0);
        if (!created && !skipped) {
          throw new Error("Belge e-Belge Havuzunda doğrulanamadı.");
        }
        stagedForReview += created;
        alreadyInPool += skipped;
      } catch (error: any) {
        failures.push({
          documentNo,
          partnerName: state.partnerName,
          message:
            clean(error?.message) || "Tedarikçi faturası havuza alınamadı.",
        });
      }
    }

    return {
      total: states.length,
      alreadyComplete,
      imported: 0,
      stagedForReview,
      alreadyInPool,
      failed: failures.length,
      failures,
      approvalMode: "MANUAL_REVIEW_REQUIRED",
    };
  }
}
