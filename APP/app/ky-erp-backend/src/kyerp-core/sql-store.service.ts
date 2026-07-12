import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type MainCompanyRef = {
  id: string;
  slug: string;
  name: string;
};

@Injectable()
export class SqlStoreService implements OnModuleInit {
  private readonly baseDir = this.resolveBaseDir();
  private readonly consolidatedIds = new Set<string>();
  private readonly sqlCache = new Map<string, unknown>();
  private sqlLoaded = false;
  private readonly writeQueue = new Map<string, Promise<unknown>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadSqlCache();
  }

  // In-memory read cache: keyed by absolute file path, stores parsed data + timestamp.
  // Invalidated on every write so reads are always coherent.
  private readonly FILE_CACHE_TTL_MS = 30_000;
  private readonly fileReadCache = new Map<
    string,
    { data: unknown; ts: number }
  >();

  private fileCacheGet(fullPath: string): unknown | undefined {
    const entry = this.fileReadCache.get(fullPath);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.FILE_CACHE_TTL_MS) {
      this.fileReadCache.delete(fullPath);
      return undefined;
    }
    return entry.data;
  }

  private fileCacheSet(fullPath: string, data: unknown) {
    this.fileReadCache.set(fullPath, { data, ts: Date.now() });
  }

  private fileCacheInvalidate(fullPath: string) {
    this.fileReadCache.delete(fullPath);
  }

  private storeKey(scope: string, mainCompanySlug: string | null, fileName: string) {
    return `${scope}|${mainCompanySlug || ""}|${fileName.replace(/\\/g, "/")}`;
  }

  private async loadSqlCache() {
    if (this.sqlLoaded) return;
    this.sqlLoaded = true;
    try {
      const rows = await (this.prisma as any)["json" + "Store"].findMany();
      for (const row of rows) {
        this.sqlCache.set(this.storeKey(row.scope, row.mainCompanySlug, row.fileName), row.data);
      }
      const mainCompanyKey = this.storeKey("global", null, "main-companies");
      const cachedMainCompanies = this.sqlCache.get(mainCompanyKey);
      if (!Array.isArray(cachedMainCompanies) || cachedMainCompanies.length === 0) {
        const mainCompanies = await this.prisma.mainCompany.findMany({
          where: { isActive: true },
          select: { id: true, slug: true, name: true },
          orderBy: { name: "asc" },
        });
        if (mainCompanies.length) {
          const rows = mainCompanies.map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
          }));
          this.sqlCache.set(mainCompanyKey, rows);
          void this.persistSqlStore("global", null, "main-companies", rows);
        }
      }
    } catch {
      this.sqlLoaded = false;
    }
  }

  private readSqlStore<T>(
    scope: string,
    mainCompanySlug: string | null,
    fileName: string,
    fallback: T,
    legacyFullPath?: string,
  ): T {
    const normalizedFileName = fileName.replace(/\\/g, "/");
    const key = this.storeKey(scope, mainCompanySlug, normalizedFileName);
    if (this.sqlCache.has(key)) return this.sqlCache.get(key) as T;
    let initial = fallback;
    const legacyCandidates = [
      legacyFullPath,
      legacyFullPath && !legacyFullPath.toLowerCase().endsWith(".json")
        ? `${legacyFullPath}.json`
        : "",
    ].filter(Boolean) as string[];
    const existingLegacy = legacyCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (existingLegacy) {
      try {
        initial = JSON.parse(fs.readFileSync(existingLegacy, "utf8")) as T;
      } catch {
        initial = fallback;
      }
    }
    this.sqlCache.set(key, initial);
    void this.persistSqlStore(scope, mainCompanySlug, normalizedFileName, initial);
    return initial;
  }

  private writeSqlStore<T>(
    scope: string,
    mainCompanySlug: string | null,
    fileName: string,
    data: T,
  ): T {
    const normalizedFileName = fileName.replace(/\\/g, "/");
    JSON.parse(JSON.stringify(data ?? null));
    const key = this.storeKey(scope, mainCompanySlug, normalizedFileName);
    this.sqlCache.set(key, data);
    void this.persistSqlStore(scope, mainCompanySlug, normalizedFileName, data);
    return data;
  }

  private async persistSqlStore<T>(
    scope: string,
    mainCompanySlug: string | null,
    fileName: string,
    data: T,
  ) {
    const key = this.storeKey(scope, mainCompanySlug, fileName);
    const previous = this.writeQueue.get(key) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() =>
        (this.prisma as any)["json" + "Store"].upsert({
          where: {
            scope_mainCompanySlug_fileName: {
              scope,
              mainCompanySlug: mainCompanySlug || "",
              fileName,
            },
          },
          update: { data: data as any },
          create: {
            scope,
            mainCompanySlug: mainCompanySlug || "",
            fileName,
            data: data as any,
          },
        }),
      )
      .finally(() => {
        if (this.writeQueue.get(key) === next) this.writeQueue.delete(key);
      });
    this.writeQueue.set(key, next);
    return next;
  }

  private resolveBaseDir() {
    const candidates = [
      path.join(process.cwd(), "uploads", "kyerp-data"),
      path.join(process.cwd(), "app", "ky-erp-backend", "uploads", "kyerp-data"),
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
  }

  private ensureDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private nowStamp() {
    return new Date().toISOString();
  }

  private isIkFile(fullPath: string) {
    const name = path.basename(fullPath).toLowerCase();
    return name.includes("ik.") || name.includes("personel") || name.includes("yevmiyeci") || name.includes("system-migration");
  }

  private readLegacyFile<T>(fullPath: string, fallback: T): T {
    if (!this.isIkFile(fullPath)) return fallback;
    try {
      if (!fs.existsSync(fullPath)) return fallback;
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private isRetryableFileReplaceError(error: any) {
    return ["EPERM", "EACCES", "EBUSY"].includes(String(error?.code || ""));
  }

  private waitForFileRetry(ms: number) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }

  private replaceJsonFile(temp: string, fullPath: string) {
    const delays = [25, 50, 100, 200, 400, 800];
    let lastError: any = null;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        fs.renameSync(temp, fullPath);
        return;
      } catch (error: any) {
        lastError = error;
        if (
          !this.isRetryableFileReplaceError(error) ||
          attempt === delays.length ||
          !fs.existsSync(temp)
        ) {
          break;
        }
        this.waitForFileRetry(delays[attempt]);
      }
    }

    if (this.isRetryableFileReplaceError(lastError) && fs.existsSync(temp)) {
      try {
        fs.copyFileSync(temp, fullPath);
        try {
          fs.unlinkSync(temp);
        } catch {
          // The target file has been updated; a stale temp file is harmless.
        }
        return;
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private writeLegacyFile<T>(fullPath: string, data: T) {
    if (!this.isIkFile(fullPath)) return data;
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const serialized = JSON.stringify(data, null, 2);
    JSON.parse(serialized);
    const temp = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, serialized, "utf8");
    this.replaceJsonFile(temp, fullPath);
    this.fileCacheInvalidate(fullPath);
    return data;
  }

  private appendSystemLog(message: string) {
    const fullPath = path.join(this.baseDir, "_system-migration.log");
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.appendFileSync(
      fullPath,
      `[${this.nowStamp()}] ${message}${process.platform === "win32" ? "\r\n" : "\n"}`,
      "utf8",
    );
  }

  public logSystemEvent(message: string) {
    this.appendSystemLog(message);
  }

  private createMergeBackup(targetCompanyId: string, directories: string[]) {
    const stamp = this.nowStamp().replace(/[:.]/g, "-");
    const backupRoot = path.join(
      this.baseDir,
      "_safety-backups",
      `${targetCompanyId}-${stamp}`,
    );
    fs.mkdirSync(backupRoot, { recursive: true });
    for (const directory of directories) {
      if (!fs.existsSync(directory)) continue;
      const folderName = path.basename(directory);
      fs.cpSync(directory, path.join(backupRoot, folderName), {
        recursive: true,
        force: true,
      });
    }
    this.appendSystemLog(
      `Main company consolidation backup created: ${backupRoot}`,
    );
    return backupRoot;
  }

  private mergeArrayRecords<T extends Record<string, any>>(
    currentRows: T[],
    legacyRows: T[],
    stableKeyBuilder: (row: T) => string,
  ) {
    const output = Array.isArray(currentRows) ? [...currentRows] : [];
    const indexByKey = new Map<string, number>();
    output.forEach((row, index) => {
      const key = stableKeyBuilder(row);
      if (key) indexByKey.set(key, index);
    });

    for (const legacyRow of Array.isArray(legacyRows) ? legacyRows : []) {
      const key = stableKeyBuilder(legacyRow);
      if (!key) {
        output.push(legacyRow);
        continue;
      }
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        output.push(legacyRow);
        indexByKey.set(key, output.length - 1);
        continue;
      }

      const currentRow = output[existingIndex];
      const mergedRow = { ...currentRow };
      for (const [field, value] of Object.entries(legacyRow)) {
        const currentValue = (mergedRow as any)[field];
        const currentEmpty =
          currentValue === undefined ||
          currentValue === null ||
          currentValue === "" ||
          (Array.isArray(currentValue) && currentValue.length === 0);
        const legacyHasValue =
          value !== undefined &&
          value !== null &&
          value !== "" &&
          (!Array.isArray(value) || value.length > 0);
        if (currentEmpty && legacyHasValue) {
          (mergedRow as any)[field] = value;
        }
      }
      output[existingIndex] = mergedRow;
    }

    return output;
  }

  private mergeMainCompanyFile(
    targetDir: string,
    legacyDir: string,
    fileName: string,
    stableKeyBuilder: (row: Record<string, any>) => string,
  ) {
    const targetPath = path.join(targetDir, fileName);
    const legacyPath = path.join(legacyDir, fileName);
    const targetRows = this.readLegacyFile<any[]>(targetPath, []);
    const legacyRows = this.readLegacyFile<any[]>(legacyPath, []);
    if (!legacyRows.length) return { changed: false, addedCount: 0 };
    if (!targetRows.length) {
      this.writeLegacyFile(targetPath, legacyRows);
      return { changed: true, addedCount: legacyRows.length };
    }

    const beforeCount = targetRows.length;
    const mergedRows = this.mergeArrayRecords(targetRows, legacyRows, stableKeyBuilder);
    const changed = JSON.stringify(mergedRows) !== JSON.stringify(targetRows);
    if (changed) this.writeLegacyFile(targetPath, mergedRows);
    return {
      changed,
      addedCount: Math.max(0, mergedRows.length - beforeCount),
    };
  }

  private ensureMainCompanyConsolidation(mainCompany: MainCompanyRef) {
    if (!mainCompany?.id || this.consolidatedIds.has(mainCompany.id)) return;
    this.consolidatedIds.add(mainCompany.id);

    const mainCompanyRoot = path.join(this.baseDir, "main-companies");
    fs.mkdirSync(mainCompanyRoot, { recursive: true });

    const directories = fs
      .readdirSync(mainCompanyRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        slug: entry.name,
        fullPath: path.join(mainCompanyRoot, entry.name),
      }));

    const related = directories.filter((entry) => {
      const meta = this.readLegacyFile<any>(path.join(entry.fullPath, "meta.json"), {});
      return this.cleanText(meta.mainCompanyId) === mainCompany.id;
    });

    const legacyDirs = related.filter((entry) => {
      if (entry.slug === mainCompany.slug) return false;
      const marker = this.readLegacyFile<any>(
        path.join(entry.fullPath, "legacy-marker.json"),
        {},
      );
      return !(
        this.cleanText(marker?.activeSlug) === mainCompany.slug &&
        this.cleanText(marker?.activeMainCompanyId) === mainCompany.id
      );
    });
    if (!legacyDirs.length) return;

    const targetDir = path.join(mainCompanyRoot, mainCompany.slug);
    fs.mkdirSync(targetDir, { recursive: true });
    const backupPath = this.createMergeBackup(mainCompany.id, [
      targetDir,
      ...legacyDirs.map((entry) => entry.fullPath),
    ]);

    const fileStrategies: Array<{
      fileName: string;
      stableKeyBuilder: (row: Record<string, any>) => string;
    }> = [
      {
        fileName: "companies",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          this.cleanText(row.firma || row.name || "").toLocaleLowerCase("tr-TR"),
      },
      {
        fileName: "company-aliases",
        stableKeyBuilder: (row) =>
          this.cleanText(row.normalizedRawName || "") || this.cleanText(row.id || ""),
      },
      {
        fileName: "products",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          this.cleanText(row.urunAdi || row.ticariAdi || row.productCode || "").toLocaleLowerCase("tr-TR"),
      },
      {
        fileName: "documents",
        stableKeyBuilder: (row) =>
          this.cleanText(row.documentId || row.id || row.belge || ""),
      },
      {
        fileName: "checks",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.cekNo || ""),
            this.cleanText(row.banka || ""),
            this.cleanText(row.vadeTarihi || ""),
            this.cleanText(row.firma || ""),
          ].join("|"),
      },
      {
        fileName: "credit-cards",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.kartAdi || ""),
            this.cleanText(row.banka || ""),
            this.cleanText(row.son4Hane || ""),
            this.cleanText(row.firma || ""),
          ].join("|"),
      },
      {
        fileName: "payments",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.firma || ""),
            this.cleanText(row.tarih || ""),
            this.cleanText(row.odemeTuru || ""),
            this.cleanText(row.tutar || ""),
          ].join("|"),
      },
      {
        fileName: "cari-movements",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.firma || ""),
            this.cleanText(row.tarih || ""),
            this.cleanText(row.sourceType || ""),
            this.cleanText(row.belge || ""),
            this.cleanText(row.tutar || ""),
          ].join("|"),
      },
      {
        fileName: "email-contacts",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.mainCompanyId || row.anaFirma || ""),
            this.cleanText(
              row.relatedCompanyId || row.relatedCompanyName || row.gonderilenFirma || "",
            ),
            this.cleanText(row.departman || ""),
            this.cleanText(row.kisiAdi || ""),
            this.cleanText(row.eposta || ""),
          ].join("|"),
      },
      {
        fileName: "activity-logs",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          [
            this.cleanText(row.entityType || ""),
            this.cleanText(row.entityId || ""),
            this.cleanText(row.actionType || ""),
            this.cleanText(row.createdAt || ""),
          ].join("|"),
      },
      {
        fileName: "vat-periods",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          this.cleanText(row.period || ""),
      },
      {
        fileName: "payment-types.json",
        stableKeyBuilder: (row) =>
          this.cleanText(row.id || "") ||
          this.cleanText(row.ad || row.name || "").toLocaleLowerCase("tr-TR"),
      },
      {
        fileName: "product-aliases",
        stableKeyBuilder: (row) =>
          this.cleanText(row.normalizedRawName || "") || this.cleanText(row.id || ""),
      },
    ];

    for (const legacyDir of legacyDirs) {
      for (const strategy of fileStrategies) {
        const result = this.mergeMainCompanyFile(
          targetDir,
          legacyDir.fullPath,
          strategy.fileName,
          strategy.stableKeyBuilder,
        );
        if (result.changed) {
          this.appendSystemLog(
            `Consolidated ${strategy.fileName}: ${legacyDir.slug} -> ${mainCompany.slug} (added ${result.addedCount})`,
          );
        }
      }

      const legacyUploadsDir = path.join(legacyDir.fullPath, "uploads");
      const targetUploadsDir = path.join(targetDir, "uploads");
      if (fs.existsSync(legacyUploadsDir) && !fs.existsSync(targetUploadsDir)) {
        fs.cpSync(legacyUploadsDir, targetUploadsDir, {
          recursive: true,
          force: false,
        });
        this.appendSystemLog(
          `Consolidated uploads directory: ${legacyDir.slug} -> ${mainCompany.slug}`,
        );
      }

      this.writeLegacyFile(path.join(legacyDir.fullPath, "legacy-marker.json"), {
        type: "temporary-main-company-consolidation",
        activeSlug: mainCompany.slug,
        activeMainCompanyId: mainCompany.id,
        backupPath,
        consolidatedAt: this.nowStamp(),
      });
    }
  }

  private fullPath(fileName: string) {
    this.ensureDir();
    return path.join(this.baseDir, fileName);
  }

  readStore<T>(fileName: string, fallback: T): T {
    const full = this.fullPath(fileName);
    return this.readSqlStore("global", null, fileName, fallback, full);
  }

  writeStore<T>(fileName: string, data: T) {
    return this.writeSqlStore("global", null, fileName, data);
  }

  getMainCompanies(): MainCompanyRef[] {
    return this.readStore<MainCompanyRef[]>("main-companies", []).map((row) => ({
      id: this.cleanText(row?.id),
      slug: this.cleanText(row?.slug),
      name: this.cleanText(row?.name),
    }));
  }

  private findMainCompanyRecord(
    mainCompanyId?: string,
    mainCompanySlug?: string,
  ): MainCompanyRef | null {
    const companies = this.getMainCompanies();
    const cleanedId = this.cleanText(mainCompanyId);
    const cleanedSlug = this.cleanText(mainCompanySlug);

    let resolved =
      companies.find((row) => cleanedSlug && row.slug === cleanedSlug) ||
      companies.find((row) => cleanedId && row.id === cleanedId) ||
      null;

    if (!resolved && cleanedSlug) {
      const legacyMeta = this.readLegacyFile<any>(
        path.join(this.baseDir, "main-companies", cleanedSlug, "meta.json"),
        {},
      );
      const legacyId = this.cleanText(legacyMeta.mainCompanyId);
      resolved = companies.find((row) => legacyId && row.id === legacyId) || null;
    }

    return resolved;
  }

  resolveMainCompany(
    mainCompanyId?: string,
    mainCompanySlug?: string,
  ): MainCompanyRef | null {
    const resolved = this.findMainCompanyRecord(mainCompanyId, mainCompanySlug);
    if (resolved) {
      this.ensureMainCompanyConsolidation(resolved);
    }

    return resolved;
  }

  requireMainCompany(
    mainCompanyId?: string,
    mainCompanySlug?: string,
  ): MainCompanyRef {
    const resolved = this.resolveMainCompany(mainCompanyId, mainCompanySlug);
    if (!resolved?.slug) {
      throw new Error("Geçerli bir mainCompanySlug çözülemedi.");
    }
    return resolved;
  }

  getMainCompanyDir(slug: string): string {
    const resolvedSlug = this.findMainCompanyRecord(undefined, slug)?.slug || slug;
    const dir = path.join(this.baseDir, "main-companies", resolvedSlug);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  readMainCompanyStore<T>(slug: string, fileName: string, fallback: T): T {
    const full = path.join(this.getMainCompanyDir(slug), fileName);
    return this.readSqlStore("main-company", slug, fileName, fallback, full);
  }

  writeMainCompanyStore<T>(slug: string, fileName: string, data: T): T {
    return this.writeSqlStore("main-company", slug, fileName, data);
  }

  buildExcelBuffer(rows: Record<string, any>[], sheetTitle: string): Buffer {
    const safeRows = Array.isArray(rows) ? rows : [];
    const headers = safeRows.length ? Object.keys(safeRows[0]) : ["bos"];
    const headerHtml = headers.map((h) => `<th>${String(h)}</th>`).join("");
    const bodyHtml = safeRows
      .map((row) => {
        const cells = headers.map((h) => `<td>${row?.[h] ?? ""}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8" /><title>${sheetTitle}</title></head>
        <body>
          <table border="1">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </body>
      </html>
    `;
    return Buffer.from(html, "utf8");
  }
}
