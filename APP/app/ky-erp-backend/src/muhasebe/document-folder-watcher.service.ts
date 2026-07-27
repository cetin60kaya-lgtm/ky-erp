import { Injectable, OnModuleDestroy } from "@nestjs/common";
import * as crypto from "crypto";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { MuhasebeDbService } from "./muhasebe-db.service";

type FolderSettingInput = {
  id?: string;
  mainCompanyId?: string;
  mainCompanySlug: string;
  folderKey: string;
  folderName: string;
  folderPath: string;
  targetType: string;
  targetModule: string;
  active?: boolean;
};

const DEFAULT_FOLDERS = [
  {
    folderKey: "archive-root",
    folderName: "Belge ArÅŸiv KÃ¶k KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv",
    targetType: "ARCHIVE_ROOT",
    targetModule: "BELGE_ARSIV",
  },
  {
    folderKey: "bizim-giden-fatura",
    folderName: "Bizim KestiÄŸimiz Fatura KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\HKN E-FATURA",
    targetType: "BIZIM_GIDEN_FATURA",
    targetModule: "BIZIM_BELGELER",
  },
  {
    folderKey: "bizim-giden-irsaliye",
    folderName: "Bizim KestiÄŸimiz Ä°rsaliye KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\DDM E-IRSALIYE",
    targetType: "BIZIM_GIDEN_IRSALIYE",
    targetModule: "BIZIM_BELGELER",
  },
  {
    folderKey: "tedarikci-gelen-fatura",
    folderName: "TedarikÃ§iden Gelen Fatura KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\HKN GELEN FATURA",
    targetType: "TEDARIKCI_GELEN_FATURA",
    targetModule: "TEDARIKCI_FATURA",
  },
  {
    folderKey: "musteriden-gelen-irsaliye",
    folderName: "MÃ¼ÅŸteriden / Kesimden Gelen Ä°rsaliye KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\KESIMDEN GELEN IRSALIYE",
    targetType: "MUSTERIDEN_GELEN_IRSALIYE",
    targetModule: "MUSTERI_IRSALIYE",
  },
  {
    folderKey: "xml",
    folderName: "XML KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\HKN XML",
    targetType: "XML",
    targetModule: "BELGE_ARSIV",
  },
  {
    folderKey: "tasnif-bekleyen",
    folderName: "Tasnif Bekleyen KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\TASNIF BEKLEYEN",
    targetType: "UNKNOWN",
    targetModule: "TASNIF_BEKLEYEN",
  },
  {
    folderKey: "MODEL_FILE_ROOT",
    folderName: "Model Dosya KÃ¶k KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\model-dosyalari",
    targetType: "MODEL_FILES_ROOT",
    targetModule: "MODEL_TAKIP",
  },
  {
    folderKey: "MODEL_PREVIEW_ROOT",
    folderName: "Kart Ã–nizleme GÃ¶rsel KlasÃ¶rÃ¼",
    folderPath: "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\onizleme-gorseller",
    targetType: "MODEL_PREVIEW_ROOT",
    targetModule: "MODEL_TAKIP",
  },
];

@Injectable()
export class DocumentFolderWatcherService implements OnModuleDestroy {
  private watchers = new Map<string, fs.FSWatcher>();
  private scanTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly muhasebeDb: MuhasebeDbService,
  ) {}

  onModuleDestroy() {
    this.stopAll();
  }

  private clean(value: unknown) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  private async ensureDefaults(mainCompanySlug: string) {
    for (const item of DEFAULT_FOLDERS) {
      const row = await this.prisma.documentFolderSetting.upsert({
        where: {
          mainCompanySlug_folderKey: {
            mainCompanySlug,
            folderKey: item.folderKey,
          },
        },
        update: {},
        create: {
          mainCompanySlug,
          folderKey: item.folderKey,
          folderName: item.folderName,
          folderPath: item.folderPath,
          targetType: item.targetType,
          targetModule: item.targetModule,
          active: String(item.folderKey).startsWith("MODEL_"),
        },
      });
      if (!this.clean(row.folderPath)) {
        await this.prisma.documentFolderSetting.update({
          where: { id: row.id },
          data: { folderPath: item.folderPath },
        });
      }
    }
  }

  async listFolderSettings(mainCompanySlug: string) {
    await this.ensureDefaults(mainCompanySlug);
    return this.prisma.documentFolderSetting.findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        OR: [
          { targetModule: { not: "MODEL_TAKIP" } },
          { folderKey: { in: ["MODEL_FILE_ROOT", "MODEL_PREVIEW_ROOT"] } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  async saveFolderSettings(mainCompanySlug: string, rows: FolderSettingInput[]) {
    const safeRows = Array.isArray(rows) ? rows : [];
    for (const row of safeRows) {
      const folderKey = this.clean(row.folderKey);
      if (!folderKey) continue;
      await this.prisma.documentFolderSetting.upsert({
        where: { mainCompanySlug_folderKey: { mainCompanySlug, folderKey } },
        update: {
          mainCompanyId: this.clean(row.mainCompanyId) || null,
          folderName: this.clean(row.folderName) || folderKey,
          folderPath: this.clean(row.folderPath),
          targetType: this.clean(row.targetType),
          targetModule: this.clean(row.targetModule),
          active: Boolean(row.active),
          deletedAt: null,
        },
        create: {
          mainCompanyId: this.clean(row.mainCompanyId) || null,
          mainCompanySlug,
          folderKey,
          folderName: this.clean(row.folderName) || folderKey,
          folderPath: this.clean(row.folderPath),
          targetType: this.clean(row.targetType),
          targetModule: this.clean(row.targetModule),
          active: Boolean(row.active),
        },
      });
    }
    return this.listFolderSettings(mainCompanySlug);
  }

  async updateFolderSetting(mainCompanySlug: string, id: string, payload: any) {
    return this.prisma.documentFolderSetting.update({
      where: { id },
      data: {
        folderName: payload.folderName,
        folderPath: payload.folderPath,
        targetType: payload.targetType,
        targetModule: payload.targetModule,
        active: payload.active,
      },
    });
  }

  private fileHash(filePath: string) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  }

  private async waitStable(filePath: string) {
    let lastSize = -1;
    for (let i = 0; i < 5; i += 1) {
      const size = fs.statSync(filePath).size;
      if (size > 0 && size === lastSize) return;
      lastSize = size;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  private isSupported(filePath: string) {
    return [".pdf", ".xml", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"].includes(
      path.extname(filePath).toLowerCase(),
    );
  }

  private mimeType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".xml") return "application/xml";
    if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === ".csv") return "text/csv";
    if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
    if (ext === ".png") return "image/png";
    return "application/octet-stream";
  }

  async scanNow(mainCompanySlug: string, folderId?: string, folderKey?: string) {
    const where: any = { mainCompanySlug, deletedAt: null };
    if (folderId) where.id = folderId;
    else if (folderKey) where.folderKey = folderKey;
    else where.active = true;
    const folders = await this.prisma.documentFolderSetting.findMany({ where });
    const summary = { processed: 0, duplicate: 0, failed: 0, skipped: 0, logs: [] as any[] };
    for (const folder of folders) {
      const folderPath = this.clean(folder.folderPath);
      if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        summary.skipped += 1;
        continue;
      }
      const files = fs.readdirSync(folderPath)
        .map((name) => path.join(folderPath, name))
        .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile() && this.isSupported(filePath));
      for (const filePath of files) {
        const fileName = path.basename(filePath);
        try {
          await this.waitStable(filePath);
          const hash = this.fileHash(filePath);
          const existing = await this.prisma.document.findFirst({
            where: { mainCompanySlug, fileHash: hash, deletedAt: null },
          });
          const file = {
            path: filePath,
            originalname: fileName,
            filename: fileName,
            mimetype: this.mimeType(filePath),
            size: fs.statSync(filePath).size,
            preserveSource: true,
          };
          const response = await this.muhasebeDb.uploadAndClassifyDocuments(
            [file],
            mainCompanySlug,
            folder.mainCompanyId || undefined,
            { targetType: folder.targetType, source: "FOLDER_WATCH" },
          );
          const uploadResponse: any = response || {};
          const record =
            uploadResponse?.data?.records?.[0] ||
            uploadResponse?.records?.[0] ||
            uploadResponse?.results?.[0] ||
            {};
          const status = existing ? "DUPLICATE" : record.routeStatus || "ROUTED";
          await this.prisma.folderWatchLog.create({
            data: {
              mainCompanyId: folder.mainCompanyId,
              mainCompanySlug,
              folderSettingId: folder.id,
              fileName,
              filePath,
              fileHash: hash,
              status,
              targetType: record.targetType || folder.targetType,
              targetModule: record.targetModule || folder.targetModule,
              targetRecordId: record.targetRecordId || record.id || null,
              message: record.routeMessage || (existing ? "Duplicate dosya" : "Dosya iÅŸlendi"),
            },
          });
          await this.prisma.documentFolderSetting.update({
            where: { id: folder.id },
            data: {
              lastScanAt: new Date(),
              processedCount: { increment: existing ? 0 : 1 },
              duplicateCount: { increment: existing ? 1 : 0 },
            },
          });
          if (existing) summary.duplicate += 1;
          else summary.processed += 1;
        } catch (error: any) {
          summary.failed += 1;
          await this.prisma.folderWatchLog.create({
            data: {
              mainCompanySlug,
              mainCompanyId: folder.mainCompanyId,
              folderSettingId: folder.id,
              fileName,
              filePath,
              status: "FAILED",
              targetType: folder.targetType,
              targetModule: folder.targetModule,
              message: this.clean(error?.message || "Dosya iÅŸlenemedi"),
            },
          });
          await this.prisma.documentFolderSetting.update({
            where: { id: folder.id },
            data: { lastScanAt: new Date(), failedCount: { increment: 1 } },
          });
        }
      }
    }
    return summary;
  }

  async start(mainCompanySlug: string) {
    const folders = await this.prisma.documentFolderSetting.findMany({
      where: { mainCompanySlug, active: true, deletedAt: null },
    });
    for (const folder of folders) {
      const folderPath = this.clean(folder.folderPath);
      if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) continue;
      if (this.watchers.has(folder.id)) continue;
      const watcher = fs.watch(folderPath, () => {
        const key = `${mainCompanySlug}:${folder.id}`;
        const oldTimer = this.scanTimers.get(key);
        if (oldTimer) clearTimeout(oldTimer);
        this.scanTimers.set(
          key,
          setTimeout(() => this.scanNow(mainCompanySlug, folder.id).catch(() => undefined), 2500),
        );
      });
      this.watchers.set(folder.id, watcher);
    }
    return this.status(mainCompanySlug);
  }

  stop(mainCompanySlug: string) {
    for (const [id, watcher] of this.watchers.entries()) {
      watcher.close();
      this.watchers.delete(id);
    }
    for (const [key, timer] of this.scanTimers.entries()) {
      if (key.startsWith(`${mainCompanySlug}:`)) {
        clearTimeout(timer);
        this.scanTimers.delete(key);
      }
    }
    return this.status(mainCompanySlug);
  }

  stopAll() {
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    for (const timer of this.scanTimers.values()) clearTimeout(timer);
    this.scanTimers.clear();
  }

  async status(mainCompanySlug: string) {
    const rows = await this.listFolderSettings(mainCompanySlug);
    const logs = await this.prisma.folderWatchLog.findMany({
      where: { mainCompanySlug },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const pendingCount = await this.prisma.document.count({
      where: {
        mainCompanySlug,
        deletedAt: null,
        OR: [{ routeStatus: "UNKNOWN" }, { status: "tasnif_bekliyor" }],
      },
    });
    return {
      active: rows.some((row) => this.watchers.has(row.id)),
      watchedCount: rows.filter((row) => this.watchers.has(row.id)).length,
      lastScanAt: rows.map((row) => row.lastScanAt).filter(Boolean).sort().at(-1) || null,
      todayProcessed: logs.filter((log) => log.createdAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) && log.status !== "FAILED").length,
      failedCount: logs.filter((log) => log.status === "FAILED").length,
      duplicateCount: logs.filter((log) => log.status === "DUPLICATE").length,
      pendingCount,
      logs,
    };
  }

  async retryFailed(mainCompanySlug: string) {
    return this.scanNow(mainCompanySlug);
  }

  async openFolder(mainCompanySlug: string, folderId?: string, folderPathInput?: string) {
    const folder = folderId
      ? await this.prisma.documentFolderSetting.findFirst({
          where: { id: folderId, mainCompanySlug, deletedAt: null },
        })
      : null;
    const folderPath = this.clean(folderPathInput || folder?.folderPath);
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { ok: false, message: "KlasÃ¶r bulunamadÄ±. Yolu manuel aÃ§Ä±n.", folderPath };
    }
    exec(`explorer.exe "${folderPath.replace(/"/g, "")}"`, () => undefined);
    return { ok: true, message: "KlasÃ¶r aÃ§Ä±lÄ±yor.", folderPath };
  }

  async listTemplates(mainCompanySlug: string) {
    return this.prisma.documentReadTemplate.findMany({
      where: { mainCompanySlug, deletedAt: null },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    });
  }

  async saveTemplate(mainCompanySlug: string, payload: any) {
    return this.prisma.documentReadTemplate.create({
      data: {
        mainCompanySlug,
        mainCompanyId: this.clean(payload.mainCompanyId) || null,
        companyId: this.clean(payload.companyId) || null,
        companyName: this.clean(payload.companyName),
        documentType: this.clean(payload.documentType),
        targetType: this.clean(payload.targetType),
        templateName: this.clean(payload.templateName || payload.name || "Okuma Åablonu"),
        active: payload.active !== false,
        priority: Number(payload.priority || 100),
        matchKeywordsJson: payload.matchKeywordsJson || payload.matchKeywords || [],
        fieldRulesJson: payload.fieldRulesJson || payload.fieldRules || {},
        lineRulesJson: payload.lineRulesJson || payload.lineRules || {},
      },
    });
  }

  async updateTemplate(mainCompanySlug: string, id: string, payload: any) {
    return this.prisma.documentReadTemplate.update({
      where: { id },
      data: {
        companyId: payload.companyId,
        companyName: payload.companyName,
        documentType: payload.documentType,
        targetType: payload.targetType,
        templateName: payload.templateName,
        active: payload.active,
        priority: payload.priority === undefined ? undefined : Number(payload.priority),
        matchKeywordsJson: payload.matchKeywordsJson,
        fieldRulesJson: payload.fieldRulesJson,
        lineRulesJson: payload.lineRulesJson,
      },
    });
  }

  async deleteTemplate(_mainCompanySlug: string, id: string) {
    return this.prisma.documentReadTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }
}

