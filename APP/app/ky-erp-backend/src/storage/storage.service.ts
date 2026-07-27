import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { calculateFileHash } from "./file-hash.util";
import { sanitizeFileName, uniqueStoredFileName } from "./file-name.util";
import { ImageResizeService } from "./image-resize.service";
import { buildStoragePath, getStorageRoot } from "./storage-path.util";
import { StorageRulesService } from "./storage-rules.service";
import { SaveFileInput } from "./storage.types";

@Injectable()
export class StorageService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(StorageRulesService)
    private readonly rulesService: StorageRulesService,
    @Inject(ImageResizeService)
    private readonly imageResizeService: ImageResizeService,
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  calculateFileHash(buffer: Buffer) {
    return calculateFileHash(buffer);
  }

  sanitizeFileName(fileName: string) {
    return sanitizeFileName(fileName);
  }

  buildStoragePath(input: Parameters<typeof buildStoragePath>[0]) {
    return buildStoragePath(input);
  }

  async saveImage(input: SaveFileInput) {
    return this.saveFile(input);
  }

  async saveFile(input: SaveFileInput) {
    if (!input?.buffer || !Buffer.isBuffer(input.buffer)) {
      throw new BadRequestException("Dosya buffer zorunludur.");
    }
    const rule = await this.rulesService.getRule(
      input.mainCompanyId,
      input.module,
      input.documentType,
    );
    const extension = path
      .extname(input.originalFileName || "")
      .replace(".", "")
      .toLocaleLowerCase("tr-TR");
    this.validateExtension(extension, rule.allowedExtensions);
    this.validateFileSize(input.buffer.length, rule.maxFileSizeMb);

    const fileHash = this.calculateFileHash(input.buffer);
    const duplicate = await this.findDuplicateByHash(
      fileHash,
      input.mainCompanyId,
    );
    if (duplicate) {
      return { ...duplicate, duplicate: true };
    }

    const storedFileName = uniqueStoredFileName(
      input.originalFileName,
      fileHash,
    );
    const storagePath = this.buildStoragePath({
      targetPathTemplate: rule.targetPathTemplate,
      originalFileName: input.originalFileName,
      storedFileName,
      date: input.date,
      firmSlug: input.firmSlug || input.firmId,
      modelSlug: input.modelSlug || input.modelId,
      personelSlug: input.personelSlug || input.personelId,
      extraTokens: input.extraTokens,
    });

    await this.copyToStorage({
      buffer: input.buffer,
      absolutePath: storagePath.absolutePath,
    });
    const imageWarnings: string[] = [];
    try {
      await this.imageResizeService.resizeImageIfEnabled({
        absolutePath: storagePath.absolutePath,
        mimeType: input.mimeType,
        fileName: storedFileName,
        enabled: rule.imageResizeEnabled,
        maxWidth: rule.imageMaxWidth,
        maxHeight: rule.imageMaxHeight,
      });
    } catch (error) {
      imageWarnings.push(error instanceof Error ? error.message : String(error));
    }
    let thumbnailRelativePath = "";
    try {
      thumbnailRelativePath = await this.imageResizeService.createThumbnail(
        {
          absolutePath: storagePath.absolutePath,
          relativePath: storagePath.relativePath,
          mimeType: input.mimeType,
          fileName: storedFileName,
          enabled: rule.thumbEnabled,
          width: rule.thumbWidth,
          height: rule.thumbHeight,
        },
      );
    } catch (error) {
      imageWarnings.push(error instanceof Error ? error.message : String(error));
    }

    const storedFile = await this.db.storedFile.create({
      data: {
        mainCompanyId: input.mainCompanyId,
        module: input.module,
        documentType: input.documentType,
        ownerType: input.ownerType || "NONE",
        ownerId: input.ownerId || null,
        firmId: input.firmId || null,
        modelId: input.modelId || null,
        personelId: input.personelId || null,
        cariId: input.cariId || null,
        originalFileName: input.originalFileName,
        storedFileName,
        mimeType: input.mimeType || null,
        extension,
        fileSize: input.buffer.length,
        fileHash,
        sourcePath: input.sourcePath || null,
        relativePath: storagePath.relativePath,
        absolutePath: storagePath.absolutePath,
        publicUrl: storagePath.publicUrl,
        thumbnailPath: thumbnailRelativePath
          ? `/storage/${thumbnailRelativePath}`
          : null,
        previewPath: storagePath.publicUrl,
        status: "ACTIVE",
        createdBy: input.createdBy || null,
      },
    });
    return imageWarnings.length ? { ...storedFile, imageWarnings } : storedFile;
  }

  async copyToStorage(input: { buffer: Buffer; absolutePath: string }) {
    const resolvedRoot = path.resolve(getStorageRoot());
    const resolvedTarget = path.resolve(input.absolutePath);
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new BadRequestException("Storage hedef yolu geçersiz.");
    }
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
    fs.writeFileSync(resolvedTarget, input.buffer);
    return resolvedTarget;
  }

  async findDuplicateByHash(fileHash: string, mainCompanyId: string) {
    if (!fileHash) return null;
    return this.db.storedFile.findFirst({
      where: { mainCompanyId, fileHash, isDeleted: false },
      orderBy: { createdAt: "asc" },
    });
  }

  async softDeleteFile(fileId: string) {
    const existing = await this.db.storedFile.findUnique({
      where: { id: fileId },
    });
    if (!existing || existing.isDeleted)
      throw new NotFoundException("Dosya bulunamadı.");
    return this.db.storedFile.update({
      where: { id: fileId },
      data: { isDeleted: true, status: "DELETED", deletedAt: new Date() },
    });
  }

  async getPublicFileUrl(fileId: string) {
    const file = await this.db.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.isDeleted)
      throw new NotFoundException("Dosya bulunamadı.");
    return file.publicUrl;
  }

  async getFile(fileId: string) {
    const file = await this.db.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException("Dosya bulunamadı.");
    return file;
  }

  async listFiles(query: any) {
    const mainCompanyId = await this.rulesService.resolveMainCompanyId(query);
    const where: any = { mainCompanyId };
    if (query.module) where.module = String(query.module);
    if (query.documentType) where.documentType = String(query.documentType);
    if (query.status) where.status = String(query.status);
    if (query.firmId) where.firmId = String(query.firmId);
    if (query.modelId) where.modelId = String(query.modelId);
    if (query.personelId) where.personelId = String(query.personelId);
    if (query.includeDeleted !== "true") where.isDeleted = false;
    if (query.date) {
      const start = new Date(query.date);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.createdAt = { gte: start, lt: end };
      }
    }
    return this.db.storedFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.take || 500), 10000),
    });
  }

  async getStorageStatus(query: any) {
    const mainCompanyId = await this.rulesService.resolveMainCompanyId(query);
    const root = getStorageRoot();
    const storageRootExists = fs.existsSync(root);
    let accessible = false;
    let error = "";
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
      accessible = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const [totalFiles, lastFile] = await Promise.all([
      this.db.storedFile.count({ where: { mainCompanyId, isDeleted: false } }),
      this.db.storedFile.findFirst({
        where: { mainCompanyId, isDeleted: false },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      storageRoot: root,
      storageRootExists,
      lastFileCreatedAt: lastFile?.createdAt ?? null,
      totalFiles,
      // Backward compatibility for current UI consumers
      accessible,
      error,
      totalFileCount: totalFiles,
      lastFile,
    };
  }

  async importWatchFolder(ruleId: string, input: any = {}) {
    const rule = await this.rulesService.getRuleById(ruleId);
    const watchSourcePath = String(rule.watchSourcePath || "").trim();
    if (!watchSourcePath) {
      throw new BadRequestException("İzlenecek klasör yolu boş.");
    }
    if (
      !fs.existsSync(watchSourcePath) ||
      !fs.statSync(watchSourcePath).isDirectory()
    ) {
      throw new BadRequestException("İzlenecek klasör bulunamadı veya klasör değil.");
    }

    const collectFiles = (dir: string): string[] =>
      fs
        .readdirSync(dir)
        .flatMap((name) => {
          const filePath = path.join(dir, name);
          if (!fs.existsSync(filePath)) return [];
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) return collectFiles(filePath);
          return stat.isFile() ? [filePath] : [];
        });
    const files = collectFiles(watchSourcePath).sort((a, b) => {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;
      return bTime - aTime;
    });
    const imported: any[] = [];
    const skipped: any[] = [];
    let allowedFileCount = 0;
    let duplicateCount = 0;
    let importedNewCount = 0;
    for (const filePath of files) {
      const originalFileName = path.basename(filePath);
      if (originalFileName.startsWith("~") || originalFileName.startsWith(".")) {
        skipped.push({ fileName: originalFileName, reason: "geçici/gizli dosya" });
        continue;
      }
      const firstStat = fs.statSync(filePath);
      if (!firstStat.size) {
        skipped.push({ fileName: originalFileName, reason: "boş dosya" });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      const secondStat = fs.statSync(filePath);
      if (firstStat.size !== secondStat.size || firstStat.mtimeMs !== secondStat.mtimeMs) {
        skipped.push({ fileName: originalFileName, reason: "dosya hala kopyalanıyor" });
        continue;
      }
      const extension = path
        .extname(originalFileName)
        .replace(".", "")
        .toLocaleLowerCase("tr-TR");
      const allowed = String(rule.allowedExtensions || "")
        .split(",")
        .map((item) => item.trim().replace(/^\./, "").toLocaleLowerCase("tr-TR"))
        .filter(Boolean);
      if (!allowed.includes(extension)) {
        skipped.push({ fileName: originalFileName, reason: "uzantı uygun değil" });
        continue;
      }
      allowedFileCount += 1;

      const modelName = path
        .parse(originalFileName)
        .name.replace(/\s*\(\d+\)\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (rule.documentType === "DESEN_GORSEL" && !modelName) {
        skipped.push({ fileName: originalFileName, reason: "model adı okunamadı" });
        continue;
      }
      try {
        const stored = await this.saveFile({
          buffer: fs.readFileSync(filePath),
          originalFileName,
          mimeType: this.guessMimeType(extension),
          module: rule.module,
          documentType: rule.documentType,
          ownerType: rule.documentType === "DESEN_GORSEL" ? "MODEL" : "NONE",
          ownerId: modelName,
          modelSlug: modelName,
          firmSlug: input.firmSlug || "desen",
          sourcePath: filePath,
          date: new Date(),
          mainCompanyId: rule.mainCompanyId,
          createdBy: input.createdBy || "folder-import",
        } as any);
        if (stored?.duplicate) duplicateCount += 1;
        else importedNewCount += 1;
        imported.push({ ...stored, modelName });
      } catch (error) {
        skipped.push({
          fileName: originalFileName,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      totalFileCount: files.length,
      allowedFileCount,
      registeredCount: imported.length,
      importedNewCount,
      duplicateCount,
      failedCount: skipped.length,
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    };
  }

  private guessMimeType(extension: string) {
    const ext = extension.toLocaleLowerCase("tr-TR");
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "pdf") return "application/pdf";
    if (ext === "xml") return "application/xml";
    if (ext === "zip") return "application/zip";
    return "application/octet-stream";
  }

  private validateExtension(extension: string, allowedExtensions: string) {
    const allowed = String(allowedExtensions || "")
      .split(",")
      .map((item) => item.trim().replace(/^\./, "").toLocaleLowerCase("tr-TR"))
      .filter(Boolean);
    if (!allowed.length || !allowed.includes(extension)) {
      throw new BadRequestException(
        `Bu dosya uzantısı kabul edilmiyor: ${extension || "yok"}`,
      );
    }
  }

  private validateFileSize(fileSize: number, maxFileSizeMb?: number | null) {
    if (!maxFileSizeMb) return;
    if (fileSize > Number(maxFileSizeMb) * 1024 * 1024) {
      throw new BadRequestException(
        `Dosya boyutu ${maxFileSizeMb} MB sınırını aşıyor.`,
      );
    }
  }
}
