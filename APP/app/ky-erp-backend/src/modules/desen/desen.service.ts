import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { exec } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  createActivityLog,
  requireMainCompanySlug,
  slugifyTr,
} from "../../common/api-helpers";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageRulesService } from "../../storage/storage-rules.service";
import { StorageService } from "../../storage/storage.service";
import { getStorageRoot } from "../../storage/storage-path.util";
import { ModelService } from "../models/model.service";
import { ModelTakipStore } from "../model-takip/model-takip.shared";
import {
  DesenFileRecord,
  DesenFileRole,
  DesenRecord,
  KalipParsedItem,
  KalipYerlesimRecord,
  YerlesimRecord,
} from "./desen.types";

const FILE_ROLE_FOLDERS: Record<DesenFileRole, string> = {
  desen_gorseli: "desen-gorseli",
  kanal_gorseli_psd: "kanal-gorseli",
  musteri_calisma_psd: "musteri-calisma-psd",
  yerlesim_pdf: "yerlesim",
  teknik_gorsel: "yerlesim",
  revizyon_notu: "yerlesim",
  kalip_hazir_dosya: "kalip-yerlesim",
};

const DEFAULT_DESEN_FIRMA = "TAHA GIYIM SAN. VE TIC.";
const DESEN_MODEL_RESET_KEYS = [
  "desen.havuz-meta",
  "desen.havuz-folder-scan-state",
  "desen.records",
  "desen.files",
  "desen.yerlesim",
  "desen.kalip-yerlesim",
  "desen.activity-logs",
];

const DESEN_SEMANTIC_EQUIVALENTS: Record<string, string[]> = {
  AYICIK: ["AYI", "BEAR", "TEDDY"],
  AYICIKLI: ["AYICIK", "AYI", "BEAR"],
  COCUK: ["KIZ COCUK", "ERKEK COCUK", "BEBEK"],
  KIZ: ["KIZ COCUK", "GIRL"],
  ERKEK: ["ERKEK COCUK", "BOY"],
  ON: ["ON BASKI", "GOGUS", "FRONT"],
  ARKA: ["ARKA BASKI", "BACK"],
  YAZILI: ["YAZI", "TEXT", "TIPOGRAFI"],
  BROWN: ["KAHVERENGI"],
  KAHVERENGI: ["BROWN"],
  PEMBE: ["PINK"],
  MICKEY: ["MOUSE", "DISNEY"],
};

const DEFAULT_BEDEN_ROWS = [
  ["9-12 AY", "Göğüs Ön Orta", "3,5", "orta", "5,0", "4,7"],
  ["1-2 YAŞ", "Göğüs Ön Orta", "4,0", "orta", "5,0", "4,7"],
  ["2-3 YAŞ", "Göğüs Ön Orta", "4,0", "orta", "5,0", "4,7"],
  ["3-4 YAŞ", "Göğüs Ön Orta", "4,5", "orta", "5,0", "4,7"],
  ["4-5 YAŞ", "Göğüs Ön Orta", "4,5", "orta", "5,75", "5,4"],
  ["5-6 YAŞ", "Göğüs Ön Orta", "5,0", "orta", "5,75", "5,4"],
  ["6-7 YAŞ", "Göğüs Ön Orta", "5,0", "orta", "5,75", "5,4"],
  ["7-8 YAŞ", "Göğüs Ön Orta", "5,5", "orta", "5,75", "5,4"],
].map(
  ([
    bedenYas,
    baskiYeri,
    ustMesafeCm,
    ortaHizalama,
    baskiEnCm,
    baskiBoyCm,
  ]) => ({
    id: randomUUID(),
    bedenYas,
    baskiYeri,
    ustMesafeCm,
    ortaHizalama,
    baskiEnCm,
    baskiBoyCm,
    not: "",
  }),
);

@Injectable()
export class DesenService {
  private readonly modelStore: ModelTakipStore;
  private readonly havuzOcrInFlight = new Set<string>();
  private readonly havuzScanLocks = new Set<string>();
  private ocrRecognizeFnPromise: Promise<any> | null = null;

  constructor(
    @Inject(SqlStoreService)
    private readonly db: SqlStoreService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(StorageRulesService)
    private readonly storageRulesService?: StorageRulesService,
    @Optional() @Inject(ModelService) private readonly modelService?: ModelService,
  ) {
    this.modelStore = new ModelTakipStore(db);
  }

  private now() {
    return new Date().toISOString();
  }

  private clean(value: any) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private bool(value: any) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  private normalizeKey(value: any) {
    return this.clean(value).toLocaleUpperCase("tr-TR");
  }

  private normalizeModelName(value: any) {
    return this.clean(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/ı/g, "I")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ş/g, "S")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseKeywords(value: any) {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.clean(item))
        .filter(Boolean)
        .slice(0, 30);
    }
    return this.clean(value)
      .split(/[,;\n]/)
      .map((item) => this.clean(item))
      .filter(Boolean)
      .slice(0, 30);
  }

  private cleanOcrText(value: any) {
    return String(value ?? "")
      .replace(/[\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeSearchText(value: any) {
    return this.normalizeModelName(value);
  }

  private tokenizeSearchText(value: any) {
    return this.normalizeSearchText(value)
      .split(/\s+/)
      .map((token) => this.clean(token))
      .filter(Boolean)
      .slice(0, 60);
  }

  private normalizeSemanticToken(value: string) {
    const token = this.normalizeSearchText(value);
    if (!token) return "";
    return token.replace(/(LI|LIK|LU|LUK|LUK|LIĞI|LIK)$/g, "");
  }

  private expandSemanticTokens(tokens: string[]) {
    const expanded = new Set<string>();
    for (const rawToken of tokens) {
      const token = this.normalizeSemanticToken(rawToken);
      if (!token) continue;
      expanded.add(token);
      const equivalents = DESEN_SEMANTIC_EQUIVALENTS[token] || [];
      equivalents.forEach((item) => {
        const normalized = this.normalizeSemanticToken(item);
        if (normalized) expanded.add(normalized);
      });
    }
    return Array.from(expanded);
  }

  private extractFieldByWords(text: string, dictionary: Record<string, string[]>) {
    const normalized = this.normalizeSearchText(text);
    for (const [field, words] of Object.entries(dictionary)) {
      const found = words.some((word) => normalized.includes(this.normalizeSearchText(word)));
      if (found) return field;
    }
    return "";
  }

  private extractUniqueWords(text: string) {
    return Array.from(new Set(this.tokenizeSearchText(text))).slice(0, 20);
  }

  private extractSizeInfo(text: string) {
    const source = this.clean(text);
    const regexes = [
      /\b(\d{1,3}\s?[xX]\s?\d{1,3}(?:\s?cm)?)\b/g,
      /\b(\d{1,2}\s?[-/]\s?\d{1,2}\s?(?:YAS|YAŞ|AY))\b/gi,
      /\b(XXS|XS|S|M|L|XL|XXL|3XL|4XL)\b/g,
    ];
    const found: string[] = [];
    regexes.forEach((regex) => {
      let match: RegExpExecArray | null = regex.exec(source);
      while (match) {
        const value = this.clean(match[1]);
        if (value) found.push(value);
        match = regex.exec(source);
      }
    });
    return Array.from(new Set(found)).slice(0, 8).join(", ");
  }

  private extractColorCount(text: string) {
    const normalized = this.clean(text);
    const match = normalized.match(/(\d{1,2})\s*renk/i);
    if (match?.[1]) return Number(match[1]);
    return 0;
  }

  private async analyzeImageColors(sourcePath: string) {
    if (!this.isOcrProcessableImage(sourcePath)) {
      return { colors: [] as string[], colorCount: 0 };
    }
    try {
      const sharp = require("sharp");
      const stats = await sharp(sourcePath).stats();
      const channels = Array.isArray(stats?.channels) ? stats.channels : [];
      if (channels.length < 3) return { colors: [], colorCount: 0 };
      const [r, g, b] = channels.map((channel: any) => Number(channel?.mean || 0));
      const colors: string[] = [];
      if (r > 155 && g > 130 && b < 120) colors.push("kahverengi");
      if (r > 170 && g < 140 && b > 140) colors.push("pembe");
      if (r > 150 && g > 150 && b > 150) colors.push("beyaz");
      if (r < 90 && g < 90 && b < 90) colors.push("siyah");
      if (b > r + 12 && b > g + 12) colors.push("mavi");
      if (g > r + 12 && g > b + 12) colors.push("yesil");
      if (r > g + 12 && r > b + 12) colors.push("kirmizi");
      const entropyAvg = channels.reduce((sum: number, c: any) => sum + Number(c?.entropy || 0), 0) / channels.length;
      const colorCount = Math.max(1, Math.min(8, Math.round(entropyAvg * 1.8)));
      return { colors: Array.from(new Set(colors)).slice(0, 4), colorCount };
    } catch {
      return { colors: [], colorCount: 0 };
    }
  }

  private async buildSmartHavuzMeta(args: {
    modelName: string;
    originalFileName: string;
    firmName: string;
    sourcePath: string;
    ocrText?: string;
    current?: any;
  }) {
    const seedText = [
      args.modelName,
      args.originalFileName,
      args.ocrText || "",
      args.current?.tagsText || "",
      args.current?.aciklama || "",
    ].join(" ");

    const productType = this.extractFieldByWords(seedText, {
      "tisortu": ["tisort", "t-shirt", "shirt"],
      "sweatshirt": ["sweat", "hoodie"],
      "elbise": ["elbise", "dress"],
      "sort": ["sort", "short"],
      "pijama": ["pijama"],
    });
    const printArea = this.extractFieldByWords(seedText, {
      "on baski": ["on", "gogus", "front"],
      "arka baski": ["arka", "back", "ense"],
      "kol": ["kol", "sleeve"],
    });
    const figure = this.extractFieldByWords(seedText, {
      "ayicik": ["ayicik", "ayi", "teddy", "bear"],
      "araba": ["araba", "car", "race"],
      "mickey": ["mickey", "mouse", "disney"],
      "cicek": ["cicek", "flower"],
      "kalp": ["kalp", "heart"],
    });

    const sizeInfo = this.extractSizeInfo(seedText);
    const textWords = this.extractUniqueWords(this.cleanOcrText(args.ocrText)).filter(
      (token) => token.length >= 4,
    );
    const writtenText = textWords.slice(0, 8).join(", ");
    const colorAnalysis = await this.analyzeImageColors(args.sourcePath);
    const explicitColorCount = this.extractColorCount(seedText);
    const colorCount = explicitColorCount || Number(args.current?.renkSayisi || colorAnalysis.colorCount || 0);
    const colorText = colorAnalysis.colors.join(", ");

    const technicalNotes = [
      printArea ? `${printArea} alaninda baski` : "",
      sizeInfo ? `olcu/beden: ${sizeInfo}` : "",
      colorCount ? `${colorCount} renk` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const description = [
      productType || "tekstil deseni",
      printArea || "baski alani belirtilmedi",
      figure || "tema bilgisi yok",
      colorText || "renk analizi kisitli",
      writtenText ? `yazi: ${writtenText}` : "",
      technicalNotes,
    ]
      .filter(Boolean)
      .join(", ")
      .slice(0, 1200);

    const keywords = this.parseKeywords([
      args.modelName,
      args.originalFileName,
      args.firmName,
      productType,
      printArea,
      figure,
      colorText,
      writtenText,
      sizeInfo,
      technicalNotes,
    ]);
    const searchText = this.clean(
      [
        args.modelName,
        args.originalFileName,
        args.firmName,
        description,
        args.ocrText || "",
        keywords.join(" "),
      ].join(" "),
    ).slice(0, 3000);

    return {
      modelAdi: args.modelName,
      urunTipi: productType,
      baskiBolgesi: printArea || args.current?.baskiBolgesi || "",
      renkler: colorText,
      yazilar: writtenText,
      temaFigur: figure,
      olcuBeden: sizeInfo,
      renkSayisi: colorCount,
      teknikNotlar: technicalNotes,
      aciklama: description || this.clean(args.current?.aciklama),
      tagsText: [productType, printArea, figure, colorText].filter(Boolean).join(", "),
      searchKeywords: keywords,
      searchText,
    };
  }

  private semanticSearchMatch(row: any, queryText: any) {
    const queryTokens = this.expandSemanticTokens(this.tokenizeSearchText(queryText));
    if (!queryTokens.length) return true;
    const haystack = this.normalizeSearchText(
      row?.searchText ||
        [
          row?.modelName,
          row?.originalFileName,
          row?.firmName,
          row?.aciklama,
          row?.ocrText,
          row?.tagsText,
          row?.temaFigur,
          row?.urunTipi,
          ...(Array.isArray(row?.fileNames) ? row.fileNames : []),
          ...(Array.isArray(row?.searchKeywords) ? row.searchKeywords : []),
        ].join(" "),
    );
    if (!haystack) return false;
    const score = queryTokens.reduce((sum, token) => {
      if (!token) return sum;
      return haystack.includes(token) ? sum + 1 : sum;
    }, 0);
    return score >= Math.min(2, queryTokens.length);
  }

  private mergeDescriptionWithOcr(currentDescription: any, ocrText: string) {
    const cleanCurrent = this.clean(currentDescription);
    const cleanOcr = this.cleanOcrText(ocrText);
    if (!cleanOcr) return cleanCurrent;
    const normalizedCurrent = cleanCurrent.toLocaleLowerCase("tr-TR");
    const normalizedOcr = cleanOcr.toLocaleLowerCase("tr-TR");
    if (normalizedCurrent.includes(normalizedOcr)) {
      return cleanCurrent.slice(0, 1200);
    }
    if (!cleanCurrent) {
      return cleanOcr.slice(0, 1200);
    }
    return `${cleanCurrent} OCR: ${cleanOcr}`.slice(0, 1200);
  }

  private async getOcrRecognizeFn() {
    if (!this.ocrRecognizeFnPromise) {
      this.ocrRecognizeFnPromise = import("tesseract.js").then(
        (tesseractModule: any) =>
          tesseractModule?.recognize || tesseractModule?.default?.recognize,
      );
    }
    const recognize = await this.ocrRecognizeFnPromise;
    if (typeof recognize !== "function") {
      throw new BadRequestException("OCR motoru bulunamadı.");
    }
    return recognize;
  }

  private readHavuzImageSourcePath(row: any) {
    return this.clean(
      row?.sourcePath || row?.absolutePath || row?.storagePath || row?.path,
    );
  }

  private isOcrProcessableImage(sourcePath: string) {
    if (!sourcePath || !fs.existsSync(sourcePath)) return false;
    const ext = path.extname(sourcePath).toLocaleLowerCase("tr-TR");
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return false;
    const stat = fs.statSync(sourcePath);
    return stat.size > 0 && stat.size <= 8 * 1024 * 1024;
  }

  private async indexHavuzOcrTargets(
    slug: string,
    targets: Array<{ id: string; sourcePath: string }>,
    options?: { force?: boolean },
  ) {
    const force = Boolean(options?.force);
    if (!targets.length) {
      return {
        indexedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errors: [],
      };
    }

    const recognize = await this.getOcrRecognizeFn();
    const meta = this.readHavuzMeta(slug);
    const errors: Array<{ id: string; message: string }> = [];
    let indexedCount = 0;
    let skippedCount = 0;

    for (const target of targets) {
      const current = meta[target.id] || {};
      if (!force && this.clean(current.ocrIndexedAt)) {
        skippedCount += 1;
        continue;
      }
      if (!this.isOcrProcessableImage(target.sourcePath)) {
        skippedCount += 1;
        continue;
      }

      try {
        const sharp = require("sharp");
        const metadata = await sharp(target.sourcePath).metadata();
        if (!metadata.width || !metadata.height || metadata.width < 10 || metadata.height < 10) {
           throw new Error("Görsel OCR için çok küçük veya geçersiz");
        }

        const result: any = await recognize(target.sourcePath, "tur+eng", {
          logger: () => undefined,
        });
        const rawText =
          result?.data?.text ?? result?.text ?? result?.data?.hocr ?? "";
        const ocrText = this.cleanOcrText(rawText);
        const smartMeta = await this.buildSmartHavuzMeta({
          modelName: this.clean(current.modelName || current.modelAdi),
          originalFileName: this.clean(current.originalFileName || path.basename(target.sourcePath)),
          firmName: this.clean(current.firmName),
          sourcePath: target.sourcePath,
          ocrText,
          current,
        });
        meta[target.id] = {
          ...current,
          ocrText,
          ...smartMeta,
          aciklama: this.mergeDescriptionWithOcr(smartMeta.aciklama, ocrText),
          ocrUpdatedAt: this.now(),
          ocrIndexedAt: this.now(),
          ocrError: "",
          updatedAt: this.now(),
        };
        indexedCount += 1;
      } catch (error: any) {
        meta[target.id] = {
          ...current,
          ocrIndexedAt: this.now(),
          ocrError: this.clean(error?.message || "OCR başarısız"),
          updatedAt: this.now(),
        };
        errors.push({
          id: target.id,
          message: this.clean(error?.message || "OCR başarısız"),
        });
      }
    }

    this.writeHavuzMeta(slug, meta);
    return {
      indexedCount,
      skippedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 25),
    };
  }

  private async triggerOneTimeAutoOcr(slug: string, rows: any[]) {
    if (this.havuzOcrInFlight.has(slug)) return;
    const meta = this.readHavuzMeta(slug);
    const target = rows.find((row: any) => {
      const id = this.clean(row?.id);
      if (!id) return false;
      if (this.clean(meta[id]?.ocrIndexedAt)) return false;
      return this.isOcrProcessableImage(
        this.readHavuzImageSourcePath({
          sourcePath: row?.sourcePath,
          absolutePath: row?.absolutePath,
        }),
      );
    });
    if (!target) return;

    const id = this.clean(target.id);
    const sourcePath = this.readHavuzImageSourcePath({
      sourcePath: target.sourcePath,
      absolutePath: target.absolutePath,
    });
    if (!id || !sourcePath) return;

    this.havuzOcrInFlight.add(slug);
    this.indexHavuzOcrTargets(slug, [{ id, sourcePath }], { force: false })
      .catch(() => undefined)
      .finally(() => {
        this.havuzOcrInFlight.delete(slug);
      });
  }

  private readHavuzMeta(slug: string) {
    return this.db.readMainCompanyStore<Record<string, any>>(
      slug,
      "desen.havuz-meta",
      {},
    );
  }

  private writeHavuzMeta(slug: string, rows: Record<string, any>) {
    return this.db.writeMainCompanyStore(slug, "desen.havuz-meta", rows);
  }

  private parseModelNameFromFile(file: any) {
    const fromFileName = path.parse(this.clean(file?.originalFileName)).name;
    const sourcePath = this.clean(
      file?.sourcePath || file?.relativePath || file?.absolutePath,
    );
    const parts = sourcePath
      .split(/[\\/]/)
      .map((item) => this.clean(item))
      .filter(Boolean);
    const pathStem =
      parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "";
    const pickedPathName =
      pathStem &&
      !/^(desen|kanal|pdf|storage|uploads?|documents?|models?)$/i.test(pathStem)
        ? pathStem
        : "";
    return this.clean(
      this.clean(file?.modelId) ||
        this.clean(file?.ownerId) ||
        this.clean(fromFileName) ||
        pickedPathName,
    )
      .replace(/-thumb$/i, "")
      .replace(/-[a-f0-9]{8,}$/i, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("tr-TR");
  }

  private isThumbFileName(fileName: any) {
    const stem = path.parse(this.clean(fileName)).name;
    return /(^|[-_\s])thumb$/i.test(stem);
  }

  private modelNameFromStorageFileName(fileName: any) {
    return path
      .parse(this.clean(fileName))
      .name.replace(/-thumb$/i, "")
      .replace(/-[a-f0-9]{8,}$/i, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("tr-TR");
  }

  private thumbPairKey(fileName: any) {
    return path
      .parse(this.clean(fileName))
      .name.replace(/-thumb$/i, "")
      .toLocaleLowerCase("tr-TR");
  }

  private normalizeKanalBilgileri(value: any, fallback: any[] = []) {
    const list = Array.isArray(value) ? value : fallback;
    return list.map((item: any, index: number) => ({
      id: this.clean(item?.id) || randomUUID(),
      kanalNo: Number(item?.kanalNo ?? index + 1),
      kanalAdi: this.clean(item?.kanalAdi || `Kanal ${index + 1}`),
      renkKodu: this.clean(item?.renkKodu),
      boyaTuru: this.clean(item?.boyaTuru || "Subazlı"),
      hex: this.clean(item?.hex || "#E2E8F0"),
      aktif: this.bool(item?.aktif ?? true),
    }));
  }

  private slugify(value: any) {
    return slugifyTr(value);
  }

  private successLog(
    slug: string,
    action: string,
    detail: Record<string, any>,
  ) {
    createActivityLog({
      mainCompanySlug: slug,
      moduleName: "desen",
      action,
      entityType: detail.desenId ? "desen" : "activity",
      entityId: detail.desenId || detail.fileId || detail.kalipId || "",
      detail,
    });
    const rows = this.db.readMainCompanyStore<any[]>(
      slug,
      "desen.activity-logs",
      [],
    );
    this.db.writeMainCompanyStore(slug, "desen.activity-logs", [
      { id: randomUUID(), action, createdAt: this.now(), ...detail },
      ...rows,
    ]);
  }

  private requireSlug(payload: Record<string, any>) {
    return requireMainCompanySlug(payload);
  }

  private readRecords(slug: string) {
    return this.db.readMainCompanyStore<DesenRecord[]>(
      slug,
      "desen.records",
      [],
    );
  }

  private writeRecords(slug: string, rows: DesenRecord[]) {
    return this.db.writeMainCompanyStore(slug, "desen.records", rows);
  }

  private readFiles(slug: string) {
    return this.db.readMainCompanyStore<DesenFileRecord[]>(
      slug,
      "desen.files",
      [],
    );
  }

  private writeFiles(slug: string, rows: DesenFileRecord[]) {
    return this.db.writeMainCompanyStore(slug, "desen.files", rows);
  }

  private readYerlesim(slug: string) {
    return this.db.readMainCompanyStore<YerlesimRecord[]>(
      slug,
      "desen.yerlesim",
      [],
    );
  }

  private writeYerlesim(slug: string, rows: YerlesimRecord[]) {
    return this.db.writeMainCompanyStore(slug, "desen.yerlesim", rows);
  }

  private readKalip(slug: string) {
    return this.db.readMainCompanyStore<KalipYerlesimRecord[]>(
      slug,
      "desen.kalip-yerlesim",
      [],
    );
  }

  private writeKalip(slug: string, rows: KalipYerlesimRecord[]) {
    return this.db.writeMainCompanyStore(slug, "desen.kalip-yerlesim", rows);
  }

  private getRecordOrThrow(id: string, payload: Record<string, any>) {
    const slug = this.requireSlug(payload);
    const record = this.readRecords(slug).find(
      (row) => row.id === id && !row.deletedAt,
    );
    if (!record) throw new NotFoundException("Desen kaydı bulunamadı.");
    return { slug, record };
  }

  private documentRoot(slug: string, desenSlug: string) {
    return path.join(
      process.cwd(),
      "data",
      "documents",
      slug,
      "DESEN",
      desenSlug,
    );
  }

  private readDocuments(slug: string) {
    if (process.env.KYERP_ENABLE_MODEL_DOCUMENT_IMPORT !== "true") {
      return [];
    }
    return this.db.readMainCompanyStore<any[]>(slug, "documents", []);
  }

  private listDocumentModels(slug: string) {
    const rows = this.readDocuments(slug);
    const map = new Map<string, any>();
    const push = (
      source: any,
      modelAdi: any,
      extra: Record<string, any> = {},
    ) => {
      const name = this.clean(modelAdi);
      if (!name) return;
      const customer = this.clean(
        extra.musteri ||
          source?.header?.musteriFirma ||
          source?.header?.cariFirma ||
          source?.matchedCompanyName ||
          source?.firma,
      );
      const key = [this.normalizeKey(name), this.normalizeKey(customer)].join(
        "|",
      );
      const current = map.get(key);
      const date = this.clean(
        source?.header?.date || source?.updatedAt || source?.createdAt,
      );
      const id = `doc-model-${Buffer.from(key).toString("base64url").slice(0, 24)}`;
      if (
        this.modelStore.isModelHidden(slug, undefined, {
          id,
          docModelKey: id,
          sourceKey: id,
          modelAdi: name,
          musteriFirma: customer,
        })
      ) {
        return;
      }
      const next = {
        id,
        modelAdi: name,
        musteriFirma: customer,
        musteri: customer,
        musteriIrsaliyeNo: this.clean(
          extra.siparisNo ||
            source?.header?.musteriIrsaliyeNo ||
            source?.header?.irsaliyeNo ||
            source?.header?.documentNo,
        ),
        siparisNo: this.clean(
          extra.siparisNo ||
            source?.header?.musteriIrsaliyeNo ||
            source?.header?.irsaliyeNo ||
            source?.header?.documentNo,
        ),
        zemin: this.clean(extra.zemin || source?.header?.zemin),
        zeminRenk: this.clean(extra.zemin || source?.header?.zemin),
        durum: this.clean(source?.status) || "Aktif",
        aktif: true,
        tarih: date,
        updatedAt: this.clean(source?.updatedAt || source?.createdAt || date),
        kaynak: "Muhasebe",
        mainCompanySlug: slug,
      };
      if (
        !current ||
        String(next.updatedAt || "").localeCompare(
          String(current.updatedAt || ""),
        ) > 0
      ) {
        map.set(key, next);
      }
    };

    rows.forEach((document) => {
      push(document, document?.header?.modelAdi);
      if (Array.isArray(document?.items)) {
        document.items.forEach((item: any) => {
          push(document, item?.modelAdi || item?.modelName, {
            zemin: item?.zemin,
            siparisNo: item?.siparisNo || item?.musteriIrsaliyeNo,
            musteri: item?.musteriFirma,
          });
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      `${a.musteriFirma} ${a.modelAdi}`.localeCompare(
        `${b.musteriFirma} ${b.modelAdi}`,
        "tr",
        {
          sensitivity: "base",
        },
      ),
    );
  }

  private ensureDesenFolders(slug: string, desenSlug: string) {
    const root = this.documentRoot(slug, desenSlug);
    [
      "desen-gorseli",
      "kanal-gorseli",
      "musteri-calisma-psd",
      "yerlesim",
      "kalip-yerlesim",
      "hazir-dosya",
      "arsiv",
    ].forEach((folder) =>
      fs.mkdirSync(path.join(root, folder), { recursive: true }),
    );
    return root;
  }

  private relativeFromCwd(fullPath: string) {
    return path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
  }

  private uniqueFileName(dir: string, desired: string) {
    const parsed = path.parse(desired);
    const base = this.slugify(parsed.name).slice(0, 80) || "dosya";
    const ext = parsed.ext.toLocaleLowerCase("tr-TR");
    let candidate = `${base}${ext}`;
    let index = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base}-${index}${ext}`;
      index += 1;
    }
    return candidate;
  }

  private async mirrorFileToStorageService(args: {
    slug: string;
    record: DesenRecord;
    role: DesenFileRole;
    file: any;
    body: Record<string, any>;
  }) {
    if (!this.storageService || !this.storageRulesService) return null;
    const documentTypeMap: Partial<Record<DesenFileRole, any>> = {
      desen_gorseli: "DESEN_GORSEL",
      kanal_gorseli_psd: "KANAL_GORSEL",
      yerlesim_pdf: "DESEN_PDF",
    };
    const documentType = documentTypeMap[args.role];
    if (!documentType) return null;
    try {
      const mainCompanyId = await this.storageRulesService.resolveMainCompanyId(
        {
          mainCompanySlug: args.slug,
        },
      );
      return await this.storageService.saveFile({
        buffer: args.file.buffer,
        originalFileName: this.clean(args.file.originalname),
        mimeType: this.clean(args.file.mimetype),
        module: "DESEN",
        documentType,
        ownerType: "DESEN",
        ownerId: args.record.id,
        modelId: this.clean(args.body.modelId || args.record.modelId),
        modelSlug: this.clean(args.record.modelAdi || args.record.desenAdi),
        firmSlug: this.clean(args.record.musteri || args.slug),
        sourcePath: "",
        date: new Date(),
        mainCompanyId,
        createdBy: this.clean(args.body.uploadedBy || "system"),
      });
    } catch {
      return null;
    }
  }

  listSharedModels(query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const trackedModels = this.modelStore.getSummaryRows(slug, undefined);
    const modelsById = new Map<string, any>();
    [...trackedModels, ...this.listDocumentModels(slug)].forEach(
      (model: any) => {
        if (!model?.id) return;
        modelsById.set(model.id, model);
      },
    );
    const models = Array.from(modelsById.values());
    const records = this.readRecords(slug).filter((row) => !row.deletedAt);
    const files = this.readFiles(slug).filter((row) => !row.deletedAt);
    return models.map((model: any) => {
      const modelRecords = records.filter((row) => row.modelId === model.id);
      const fileRoles = new Set(
        files
          .filter((file) => file.modelId === model.id)
          .map((file) => file.fileRole),
      );
      return {
        id: model.id,
        modelAdi: model.modelAdi,
        musteri: model.musteriFirma,
        musteriFirma: model.musteriFirma,
        siparisNo: model.musteriIrsaliyeNo || model.sonIrsaliyeNo || "",
        zemin: model.zemin,
        zeminRenk: model.zemin,
        durum: model.aktif === false ? "Pasif" : model.durum || "Aktif",
        thumbnailPath: model.desenGorseli || "",
        desenGorseli: model.desenGorseli || "",
        desenDurumu:
          fileRoles.has("desen_gorseli") || modelRecords.length
            ? "tamam"
            : "eksik",
        yerlesimDurumu: fileRoles.has("yerlesim_pdf") ? "tamam" : "eksik",
        kalipDurumu: fileRoles.has("kalip_hazir_dosya") ? "tamam" : "kontrol",
        sonIslemTarihi:
          modelRecords[0]?.updatedAt || model.updatedAt || model.tarih || "",
        source: model.kaynak || "Model Takip",
      };
    });
  }

  deleteSharedModel(id: string, query: Record<string, any>) {
    const slug = this.requireSlug(query);
    return this.modelStore.deleteModel(slug, undefined, id, query);
  }

  getSharedModel(id: string, query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const model =
      this.modelStore.getById(slug, undefined, id) ||
      this.listSharedModels({ mainCompanySlug: slug }).find(
        (item: any) => item.id === id,
      );
    if (!model) throw new NotFoundException("Model bulunamadı.");
    return model;
  }

  saveSharedModel(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    return this.modelStore.saveModel(slug, undefined, {
      id: this.clean(body.id),
      anaFirma: this.clean(body.anaFirma || body.mainCompanyName || slug),
      musteriFirma: this.clean(body.musteri || body.musteriFirma),
      modelAdi: this.clean(body.modelAdi),
      musteriIrsaliyeNo: this.clean(body.siparisNo || body.musteriIrsaliyeNo),
      zemin: this.clean(body.zemin || body.zeminRenk),
      durum: this.clean(body.durum || "Aktif"),
      tarih: this.clean(body.tarih) || new Date().toISOString().slice(0, 10),
      kaynak: this.clean(body.kaynak || "Desen"),
      mainCompanySlug: slug,
    } as any);
  }

  listRecords(query: Record<string, any>) {
    const slug = this.requireSlug(query);
    return this.readRecords(slug).filter((row) => !row.deletedAt);
  }

  async listSimpleModels(query: Record<string, any>) {
    if (!this.storageService) return [];
    const files = await this.storageService.listFiles({
      ...query,
      module: "DESEN",
      documentType: "DESEN_GORSEL",
      take: 5000,
    });
    return files.map((file: any) => ({
      id: file.id,
      modelAdi:
        this.clean(file.ownerId) ||
        this.clean(file.modelId) ||
        path.parse(this.clean(file.originalFileName)).name,
      imageUrl: file.publicUrl || "",
      thumbnailUrl: file.thumbnailPath || file.publicUrl || "",
      originalFileName: file.originalFileName,
      sourcePath: file.sourcePath,
      createdAt: file.createdAt,
    }));
  }

  async getModelImageByModelId(modelId: string, query: Record<string, any>) {
    if (this.modelService) {
      try {
        const model = await this.modelService.getById(
          String(modelId),
          query.mainCompanySlug || query.mainCompanyId,
        );
        const image =
          model?.desenImageThumb ||
          model?.imageUrl ||
          model?.thumbnail ||
          model?.desenGorseli ||
          model?.images?.[0]?.url ||
          model?.images?.[0]?.path ||
          "";
        if (image) {
          return {
            id: model.id,
            publicUrl: model.desenImageOriginal || image,
            thumbnail: image,
            originalFileName: model.modelName,
            mimeType: "",
          };
        }
      } catch {
        // Storage fallback below covers older visual-only records.
      }
    }
    if (!this.storageService) return null;
    const files = await this.storageService.listFiles({
      ...query,
      module: "DESEN",
      documentType: "DESEN_GORSEL",
      modelId: String(modelId),
      take: 1,
    });
    if (!Array.isArray(files) || !files.length) return null;
    const file = files[0];
    return {
      id: file.id,
      publicUrl: file.publicUrl || file.previewPath || file.relativePath || null,
      thumbnail: file.thumbnailPath || null,
      originalFileName: file.originalFileName,
      mimeType: file.mimeType,
    };
  }

  private fallbackModelFolderPath() {
    return path.join(getStorageRoot(), "desen", "modeller");
  }

  private defaultIncomingModelFolderPath() {
    return path.join(getStorageRoot(), "desen", "gelen");
  }

  private defaultProcessedModelFolderPath(status: "islenen" | "hata") {
    const now = new Date();
    return path.join(
      getStorageRoot(),
      "desen",
      status,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
    );
  }

  private defaultDuplicateFolderPath() {
    const now = new Date();
    return path.join(
      getStorageRoot(),
      "desen",
      "islenen",
      "duplicate",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
    );
  }

  private readHavuzFolderScanState(slug: string) {
    return this.db.readMainCompanyStore<Record<string, any>>(
      slug,
      "desen.havuz-folder-scan-state",
      {},
    );
  }

  private writeHavuzFolderScanState(slug: string, state: Record<string, any>) {
    return this.db.writeMainCompanyStore(
      slug,
      "desen.havuz-folder-scan-state",
      state,
    );
  }

  private isTempOrAuxiliaryFileName(fileName: string) {
    const name = this.clean(fileName);
    if (!name) return true;
    if (name.startsWith(".") || name.startsWith("~") || name.startsWith("$")) {
      return true;
    }
    if (/(\.tmp|\.part|\.partial|\.crdownload|\.download)$/i.test(name)) {
      return true;
    }
    const stem = path.parse(name).name;
    return /(^|[-_\s])(thumb|preview)([-_\s]|$)/i.test(stem);
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async isFileCopyCompleted(filePath: string) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const first = fs.statSync(filePath);
    if (!first.size) return false;
    await this.delay(220);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const second = fs.statSync(filePath);
    return first.size === second.size && first.mtimeMs === second.mtimeMs;
  }

  private async isValidImageFile(filePath: string) {
    try {
      const sharp = require("sharp");
      const metadata = await sharp(filePath).metadata();
      return Boolean(metadata.width && metadata.height && metadata.width > 8 && metadata.height > 8);
    } catch {
      return false;
    }
  }

  private isPdfFile(filePath: string) {
    return path.extname(filePath).toLocaleLowerCase("tr-TR") === ".pdf";
  }

  private isImageFile(filePath: string) {
    const ext = path.extname(filePath).toLocaleLowerCase("tr-TR");
    return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
  }

  private guessFileMime(extension: string) {
    const ext = extension.toLocaleLowerCase("tr-TR");
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "pdf") return "application/pdf";
    return "image/jpeg";
  }

  private guessFileDocumentType(extension: string) {
    const ext = extension.toLocaleLowerCase("tr-TR");
    if (ext === "pdf") return "DESEN_PDF" as any;
    return "DESEN_GORSEL" as any;
  }

  private async isValidDesenSourceFile(filePath: string) {
    if (this.isPdfFile(filePath)) {
      try {
        return fs.statSync(filePath).size > 0;
      } catch {
        return false;
      }
    }
    if (this.isImageFile(filePath)) {
      return this.isValidImageFile(filePath);
    }
    return false;
  }

  private isCustomerType(type: any) {
    const normalized = this.clean(type).toLocaleUpperCase("tr-TR");
    return !normalized || normalized === "MUSTERI" || normalized === "CUSTOMER";
  }

  private resolveDefaultFirma(slug: string, input?: Record<string, any>) {
    const firmId = this.clean(
      input?.firmId || input?.firmaId || input?.defaultFirmId,
    );
    const firmName = this.clean(
      input?.firmName ||
        input?.firmaAdi ||
        input?.firmaName ||
        input?.defaultFirmName,
    );
    if (firmId) {
      return { id: firmId, name: firmName || DEFAULT_DESEN_FIRMA };
    }
    const companies = this.db.readMainCompanyStore<any[]>(slug, "companies", []);
    const customerRows = (Array.isArray(companies) ? companies : []).filter((row: any) =>
      this.isCustomerType(row?.type || row?.companyType || row?.firmaTipi),
    );
    const defaultRow = customerRows.find((row: any) => {
      const marker = this.clean(
        row?.varsayilan ?? row?.default ?? row?.isDefault ?? row?.defaultCustomer,
      ).toLocaleUpperCase("tr-TR");
      return marker === "EVET" || marker === "TRUE" || marker === "1";
    });
    const tahaRow = customerRows.find((row: any) => {
      const name = this.clean(row?.name || row?.firmaAdi || row?.unvan).toLocaleUpperCase("tr-TR");
      return name.includes("TAHA");
    });
    const picked = defaultRow || tahaRow || customerRows[0] || null;
    if (!picked) return { id: "", name: DEFAULT_DESEN_FIRMA };
    return {
      id: this.clean(picked.id || picked.firmaId || picked.companyId),
      name:
        this.clean(picked.name || picked.firmaAdi || picked.unvan) ||
        DEFAULT_DESEN_FIRMA,
    };
  }

  private async ensureDefaultFirmaForImport(
    slug: string,
    input?: Record<string, any>,
  ) {
    const resolved = await this.resolveDefaultFirma(slug, input);
    if (resolved.id) return resolved;
    if (!this.prisma) return resolved;
    try {
      const normalizedName = this.clean(DEFAULT_DESEN_FIRMA)
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      let company = await (this.prisma as any).company.findFirst({
        where: {
          mainCompanySlug: slug,
          normalizedName,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!company) {
        company = await (this.prisma as any).company.create({
          data: {
            mainCompanySlug: slug,
            name: DEFAULT_DESEN_FIRMA,
            normalizedName,
            type: "MUSTERI",
            source: "AUTO_DESEN",
            isActive: true,
          },
        });
      }
      return {
        id: this.clean(company?.id),
        name: this.clean(company?.name) || DEFAULT_DESEN_FIRMA,
      };
    } catch {
      return resolved;
    }
  }

  private countPendingIncomingFiles(folderPath: string) {
    const allFiles = this.collectModelFiles(folderPath);
    return allFiles.filter((filePath) => {
      const fileName = path.basename(filePath);
      if (this.isThumbFileName(fileName)) return false;
      if (this.isTempOrAuxiliaryFileName(fileName)) return false;
      return true;
    }).length;
  }

  private safeMoveImportedSource(
    filePath: string,
    status: "islenen" | "hata" | "duplicate",
  ) {
    const source = path.resolve(filePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return "";
    const targetDir =
      status === "duplicate"
        ? this.defaultDuplicateFolderPath()
        : this.defaultProcessedModelFolderPath(status);
    fs.mkdirSync(targetDir, { recursive: true });
    const parsed = path.parse(source);
    let target = path.join(targetDir, path.basename(source));
    let index = 1;
    while (fs.existsSync(target)) {
      target = path.join(targetDir, `${parsed.name}-${index}${parsed.ext}`);
      index += 1;
    }
    try {
      fs.renameSync(source, target);
    } catch {
      fs.copyFileSync(source, target);
      fs.unlinkSync(source);
    }
    return target;
  }

  async openHavuzIncomingFolder(query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const folderPath = this.defaultIncomingModelFolderPath();
    fs.mkdirSync(folderPath, { recursive: true });
    this.writeHavuzFolderScanState(slug, {
      ...this.readHavuzFolderScanState(slug),
      folderPath,
      connected: fs.existsSync(folderPath),
      lastControlAt: this.now(),
    });
    if (process.platform === "win32") {
      exec(`cmd /c start "" "${folderPath.replace(/"/g, '""')}"`);
      return { opened: true, folderPath };
    }
    return { opened: false, folderPath, message: "Explorer açma yalnızca Windows'ta desteklenir." };
  }

  async getHavuzFolderStatus(query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const folderPath = this.defaultIncomingModelFolderPath();
    const connected =
      fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
    const state = this.readHavuzFolderScanState(slug);
    const pendingFileCount = connected ? this.countPendingIncomingFiles(folderPath) : 0;
    const defaultFirma = this.resolveDefaultFirma(slug, query);
    const nextState: Record<string, any> = {
      ...state,
      folderPath,
      connected,
      pendingFileCount,
      scanRunning: this.havuzScanLocks.has(slug),
      lastControlAt: this.now(),
      defaultFirmId: this.clean(state.defaultFirmId || defaultFirma.id),
      defaultFirmName: this.clean(state.defaultFirmName || defaultFirma.name),
    };
    this.writeHavuzFolderScanState(slug, nextState);
    return {
      connected,
      folderPath,
      pendingFileCount,
      lastScanAt: this.clean(nextState.lastScanAt) || null,
      scanRunning: this.bool(nextState.scanRunning),
      lastScanNewModels: Number(nextState.lastScanNewModels || 0),
      alreadyProcessedCount: Number(nextState.alreadyProcessedCount || 0),
      failedCount: Number(nextState.failedCount || 0),
      processedFileCount: Number(nextState.processedFileCount || 0),
      errorFileCount: Number(nextState.errorFileCount || 0),
      defaultFirmId: this.clean(nextState.defaultFirmId),
      defaultFirmName: this.clean(nextState.defaultFirmName),
      lastControlAt: this.clean(nextState.lastControlAt) || null,
    };
  }

  async scanHavuzIncomingFolder(body: Record<string, any>) {
    if (!this.storageService || !this.storageRulesService) {
      throw new BadRequestException("Dosya saklama servisi hazır değil.");
    }
    const slug = this.requireSlug(body);
    const folderPath = this.defaultIncomingModelFolderPath();
    fs.mkdirSync(folderPath, { recursive: true });

    if (this.havuzScanLocks.has(slug)) {
      return {
        success: true,
        status: "SCAN_ALREADY_RUNNING",
        message: "Bağlı klasör kontrolü zaten devam ediyor.",
      };
    }

    this.havuzScanLocks.add(slug);
    const baseState = this.readHavuzFolderScanState(slug);
    this.writeHavuzFolderScanState(slug, {
      ...baseState,
      folderPath,
      connected: true,
      scanRunning: true,
      lastControlAt: this.now(),
    });

    const defaultFirma = await this.ensureDefaultFirmaForImport(slug, body);
    const meta = this.readHavuzMeta(slug);
    const allFiles = this.collectModelFiles(folderPath);
    const files = allFiles.filter((filePath) => {
      const fileName = path.basename(filePath);
      if (this.isThumbFileName(fileName)) return false;
      if (this.isTempOrAuxiliaryFileName(fileName)) return false;
      return true;
    });

    const importedItems: any[] = [];
    const ocrTargets: Array<{ id: string; sourcePath: string }> = [];
    const skippedItems: any[] = [];
    let newModels = 0;
    let alreadyProcessed = 0;
    let failed = 0;

    const mainCompanyId = await this.storageRulesService.resolveMainCompanyId({
      mainCompanyId: body.mainCompanyId,
      mainCompanySlug: slug,
    });

    try {
      for (const filePath of files) {
        const originalFileName = path.basename(filePath);
        const extension = path
          .extname(originalFileName)
          .replace(".", "")
          .toLocaleLowerCase("tr-TR");
        const modelName = this.modelNameFromStorageFileName(originalFileName);
        if (!modelName) {
          failed += 1;
          skippedItems.push({
            fileName: originalFileName,
            reason: "model adı okunamadı",
          });
          continue;
        }
        const copyCompleted = await this.isFileCopyCompleted(filePath);
        if (!copyCompleted) {
          skippedItems.push({
            fileName: originalFileName,
            reason: "dosya kopyalanması tamamlanmadı",
          });
          continue;
        }
        const validFile = await this.isValidDesenSourceFile(filePath);
        if (!validFile) {
          failed += 1;
          let errorPath = "";
          try {
            errorPath = this.safeMoveImportedSource(filePath, "hata");
          } catch {
            errorPath = "";
          }
          skippedItems.push({
            fileName: originalFileName,
            reason: "bozuk veya okunamayan görsel",
            errorPath,
          });
          continue;
        }
        try {
          const stored = await this.storageService.saveFile({
            buffer: fs.readFileSync(filePath),
            originalFileName,
            mimeType: this.guessFileMime(extension),
            module: "DESEN" as any,
            documentType: this.guessFileDocumentType(extension),
            ownerType: "MODEL",
            ownerId: modelName,
            modelSlug: modelName,
            firmId: defaultFirma.id || null,
            firmSlug: defaultFirma.name || body.firmSlug || "firma-yok",
            sourcePath: filePath,
            date: new Date(),
            mainCompanyId,
            createdBy: body.createdBy || "desen-havuzu-folder-scan",
          } as any);

          const rowId = `desen-file-${this.clean(stored?.id || stored?.fileHash || "")}`;
          if (stored?.duplicate) {
            alreadyProcessed += 1;
            const duplicatePath = this.safeMoveImportedSource(filePath, "duplicate");
            skippedItems.push({
              fileName: originalFileName,
              reason: "daha önce işlenmiş",
              duplicatePath,
            });
            continue;
          }

          newModels += 1;
          const processedPath = this.safeMoveImportedSource(filePath, "islenen");
          const smartMeta = await this.buildSmartHavuzMeta({
            modelName,
            originalFileName,
            firmName: this.clean(defaultFirma.name),
            sourcePath: this.clean(stored?.absolutePath || stored?.sourcePath || filePath),
            ocrText: this.clean(meta[rowId]?.ocrText),
            current: meta[rowId],
          });
          let createdModel: any = null;
          let modelCreateError = "";
          if (this.modelService && defaultFirma.id) {
            try {
              createdModel = await this.modelService.create({
                mainCompanySlug: slug,
                modelName,
                modelAdi: modelName,
                firmId: defaultFirma.id,
                firmaId: defaultFirma.id,
                firmaAdi: defaultFirma.name,
                musteriFirma: defaultFirma.name,
                desenImageThumb: this.clean(stored.thumbnailPath || stored.publicUrl),
                imageUrl: this.clean(stored.thumbnailPath || stored.publicUrl),
                durum: "ACTIVE",
              });
              await this.modelService.saveImages(slug, createdModel.id, [
                {
                  url: this.clean(stored.thumbnailPath || stored.publicUrl),
                  path: this.clean(stored.publicUrl || stored.thumbnailPath),
                  note: "desen-havuzu-otomatik",
                },
              ]);
            } catch (error: any) {
              modelCreateError = this.clean(
                error?.message || "Model kaydı oluşturulamadı.",
              );
            }
          }
          if (rowId !== "desen-file-") {
            meta[rowId] = {
              ...(meta[rowId] || {}),
              originalFileName,
              modelName,
              modelAdi: modelName,
              firmId: this.clean(defaultFirma.id),
              firmName: this.clean(defaultFirma.name),
              isInGlobalModelPool: Boolean(createdModel),
              pendingModelPool: !this.clean(defaultFirma.id),
              pendingFirm: !this.clean(defaultFirma.id),
              imageHash: this.clean(stored?.fileHash),
              sourcePath: this.clean(stored?.sourcePath || filePath),
              absolutePath: this.clean(stored?.absolutePath),
              relativePath: this.clean(stored?.relativePath),
              ...smartMeta,
              newlyImportedAt: this.now(),
              updatedAt: this.now(),
              modelCreateError,
            };
            const sourcePath = this.readHavuzImageSourcePath(stored);
            if (sourcePath && this.isImageFile(sourcePath)) {
              ocrTargets.push({ id: rowId, sourcePath });
            }
          }
          importedItems.push({
            id: rowId,
            modelId: this.clean(createdModel?.id),
            modelName,
            fileName: originalFileName,
            processedPath,
          });
        } catch (error: any) {
          failed += 1;
          let errorPath = "";
          try {
            errorPath = this.safeMoveImportedSource(filePath, "hata");
          } catch {
            errorPath = "";
          }
          skippedItems.push({
            fileName: originalFileName,
            reason: this.clean(error?.message || error),
            errorPath,
          });
        }
      }

      if (ocrTargets.length) {
        await this.indexHavuzOcrTargets(slug, ocrTargets, { force: false }).catch(
          () => undefined,
        );
      }

      this.writeHavuzMeta(slug, meta);
      const pendingFileCount = this.countPendingIncomingFiles(folderPath);
      const nextState = {
        ...baseState,
        folderPath,
        connected: true,
        scanRunning: false,
        lastScanAt: this.now(),
        lastControlAt: this.now(),
        pendingFileCount,
        defaultFirmId: this.clean(defaultFirma.id),
        defaultFirmName: this.clean(defaultFirma.name),
        lastScanNewModels: newModels,
        alreadyProcessedCount: alreadyProcessed,
        failedCount: failed,
        processedFileCount:
          Number(baseState.processedFileCount || 0) + alreadyProcessed + newModels,
        errorFileCount: Number(baseState.errorFileCount || 0) + failed,
      };
      this.writeHavuzFolderScanState(slug, nextState);

      return {
        success: true,
        status: "SCAN_COMPLETED",
        folderPath,
        connected: true,
        newModels,
        alreadyProcessed,
        failed,
        importedNewCount: newModels,
        duplicateCount: alreadyProcessed,
        failedCount: failed,
        importedCount: importedItems.length,
        registeredCount: importedItems.length,
        skippedCount: skippedItems.length,
        items: importedItems,
        skipped: skippedItems,
        pendingFileCount,
        defaultFirmId: this.clean(defaultFirma.id),
        defaultFirmName: this.clean(defaultFirma.name),
      };
    } finally {
      this.havuzScanLocks.delete(slug);
      const state = this.readHavuzFolderScanState(slug);
      this.writeHavuzFolderScanState(slug, {
        ...state,
        folderPath,
        connected: fs.existsSync(folderPath),
        scanRunning: false,
      });
    }
  }

  private collectModelFiles(root = this.fallbackModelFolderPath()) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
    const excludedDirs = new Set([
      "modeller",
      "thumb",
      "thumbs",
      "thumbnail",
      "thumbnails",
      "preview",
      "previews",
      "original",
      "originals",
      "channel",
      "kanal",
      "islenen",
      "hata",
    ]);
    const collect = (dir: string): string[] =>
      fs.readdirSync(dir).flatMap((name) => {
        const filePath = path.join(dir, name);
        if (!fs.existsSync(filePath)) return [];
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const normalizedName = name.toLocaleLowerCase("tr-TR");
          if (dir !== root && excludedDirs.has(normalizedName)) return [];
          if (dir === root && excludedDirs.has(normalizedName)) return [];
          return collect(filePath);
        }
        if (!stat.isFile()) return [];
        if (!allowed.has(path.extname(filePath).toLocaleLowerCase("tr-TR"))) {
          return [];
        }
        return path.basename(filePath).startsWith(".") ? [] : [filePath];
      });
    return collect(root)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }

  private collectFallbackModelFiles() {
    return this.collectModelFiles();
  }

  private fallbackStoredFileRows() {
    const files = this.collectFallbackModelFiles();
    const thumbByKey = new Map<string, string>();
    files
      .filter((filePath) => this.isThumbFileName(path.basename(filePath)))
      .forEach((filePath) => {
        thumbByKey.set(this.thumbPairKey(path.basename(filePath)), filePath);
      });
    return files
      .filter((filePath) => !this.isThumbFileName(path.basename(filePath)))
      .map((filePath) => {
      const stat = fs.statSync(filePath);
      const originalFileName = path.basename(filePath);
      const relativePath = `desen/modeller/${originalFileName}`;
      const thumbPath = thumbByKey.get(this.thumbPairKey(originalFileName));
      const thumbRelativePath = thumbPath
        ? `desen/modeller/${path.basename(thumbPath)}`
        : relativePath;
      return {
        id: `fallback-${Buffer.from(relativePath).toString("base64url")}`,
        fileHash: "",
        originalFileName,
        storedFileName: originalFileName,
        ownerId: this.modelNameFromStorageFileName(originalFileName),
        modelId: this.modelNameFromStorageFileName(originalFileName),
        relativePath,
        sourcePath: filePath,
        absolutePath: filePath,
        publicUrl: `/storage/${relativePath}`,
        thumbnailPath: `/storage/${thumbRelativePath}`,
        createdAt: new Date(stat.ctimeMs).toISOString(),
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        fallbackStorageFile: true,
      };
    });
  }

  private normalizeFileStem(value: any) {
    const base = path.basename(this.clean(value));
    const stem = path
      .parse(base)
      .name.replace(/-thumb$/i, "")
      .replace(/-[a-f0-9]{8,}$/i, "")
      .replace(/\s*\(\d+\)\s*$/, "");
    return this.normalizeModelName(stem);
  }

  private buildHavuzDedupKey(row: any) {
    const modelKey = this.normalizeModelName(
      row?.modelName || row?.normalizedModelName,
    );
    const fileStemKey =
      this.normalizeFileStem(row?.originalFileName) ||
      this.normalizeFileStem(row?.fileNames?.[0]) ||
      modelKey;
    const firmKey =
      this.normalizeModelName(row?.firmId) ||
      this.normalizeModelName(row?.firmName) ||
      "FIRMA_YOK";
    return `${modelKey}|${fileStemKey}|${firmKey}`;
  }

  private pickBestHavuzDuplicate(current: any, next: any) {
    const currentScore =
      (current?.desenImageThumb ? 4 : 0) +
      (current?.isInGlobalModelPool ? 2 : 0) +
      (current?.isActive ? 1 : 0);
    const nextScore =
      (next?.desenImageThumb ? 4 : 0) +
      (next?.isInGlobalModelPool ? 2 : 0) +
      (next?.isActive ? 1 : 0);
    if (nextScore !== currentScore) {
      return nextScore > currentScore ? next : current;
    }
    const currentDate = new Date(current?.lastUpdatedAt || 0).getTime();
    const nextDate = new Date(next?.lastUpdatedAt || 0).getTime();
    return nextDate > currentDate ? next : current;
  }

  private dedupeHavuzRows(rows: any[]) {
    const passiveStatuses = new Set([
      "PASIF",
      "PASSIVE",
      "DELETED",
      "SOFT_DELETED",
      "ARCHIVED",
      "CANCELLED",
    ]);
    const byKey = new Map<string, any>();
    for (const row of rows) {
      const status = this.clean((row as any)?.status).toLocaleUpperCase("tr-TR");
      const isActive = row?.isActive !== false;
      if (!isActive || passiveStatuses.has(status)) continue;
      if (!this.clean(row?.desenImageThumb) && !this.clean(row?.desenImageOriginal)) {
        continue;
      }
      const key = this.buildHavuzDedupKey(row);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, row);
        continue;
      }
      byKey.set(key, this.pickBestHavuzDuplicate(current, row));
    }
    return Array.from(byKey.values());
  }

  async listHavuz(query: Record<string, any>) {
    if (!this.storageService) return [];
    const slug = this.requireSlug(query);
    if (this.clean(query.syncWatchFolder) === "true") {
      await this.syncHavuzWatchFolder({ ...query, mainCompanySlug: slug }).catch(
        () => undefined,
      );
    }
    const meta = this.readHavuzMeta(slug);
    const [desenFiles, kanalFiles, pdfFiles, sharedModelsPayload] =
      await Promise.all([
        this.storageService.listFiles({
          ...query,
          module: "DESEN",
          documentType: "DESEN_GORSEL",
          take: 5000,
        }),
        this.storageService.listFiles({
          ...query,
          module: "DESEN",
          documentType: "KANAL_GORSEL",
          take: 5000,
        }),
        this.storageService.listFiles({
          ...query,
          module: "DESEN",
          documentType: "DESEN_PDF",
          take: 5000,
        }),
        this.modelService
          ? this.modelService.list({
              mainCompanySlug: slug,
              limit: 5000,
              pageSize: 5000,
            })
          : Promise.resolve({ rows: [] }),
      ]);

    const sharedRows = Array.isArray((sharedModelsPayload as any)?.rows)
      ? (sharedModelsPayload as any).rows
      : Array.isArray(sharedModelsPayload)
        ? (sharedModelsPayload as any)
        : [];
    const hasSqlDesenFiles = Array.isArray(desenFiles) && desenFiles.length > 0;
    const fallbackFiles = hasSqlDesenFiles ? [] : this.fallbackStoredFileRows();
    let effectiveDesenFiles = [
      ...(Array.isArray(desenFiles) ? desenFiles : []),
      ...fallbackFiles,
    ];
    if (query.legacyWatchFilter === "true" && this.storageRulesService) {
      try {
        const mainCompanyId =
          await this.storageRulesService.resolveMainCompanyId({
            mainCompanyId: query.mainCompanyId,
            mainCompanySlug: slug,
          });
        const rule = await this.storageRulesService.getRule(
          mainCompanyId,
          "DESEN" as any,
          "DESEN_GORSEL" as any,
        );
        const watchRoot = this.clean(
          (rule as any).watchSourcePath,
        ).toLocaleLowerCase("tr-TR");
        if (watchRoot) {
          effectiveDesenFiles = effectiveDesenFiles.filter((file: any) => {
            if (file.fallbackStorageFile) return true;
            const sourcePath = String(file.sourcePath || "").trim();
            if (!sourcePath) return true;
            return (
              sourcePath.toLocaleLowerCase("tr-TR").startsWith(watchRoot) &&
              fs.existsSync(sourcePath)
            );
          });
          const uniqueBySourcePath = new Map<string, any>();
          effectiveDesenFiles.forEach((file: any) => {
            const sourcePath = String(file.sourcePath || "").trim();
            if (sourcePath && !uniqueBySourcePath.has(sourcePath)) {
              uniqueBySourcePath.set(sourcePath, file);
            }
          });
          effectiveDesenFiles = Array.from(uniqueBySourcePath.values());
        }
      } catch {
        // Kural okunamazsa mevcut kayıtları göstermeye devam et.
      }
    }
    const inPoolNameSet = new Set(
      sharedRows.map((row: any) =>
        this.normalizeModelName(row.modelAdi || row.modelName),
      ),
    );

    const map = new Map<string, any>();
    const normalizedRowKeys = new Map<string, string[]>();
    const applyFile = (file: any, type: "desen" | "kanal" | "pdf") => {
      if (type === "desen" && this.isThumbFileName(file?.originalFileName)) {
        return;
      }
      const modelName = this.parseModelNameFromFile(file);
      if (!modelName) return;
      const baseNormalized = this.normalizeModelName(modelName);
      const legacyKey = `desen-hvz-${Buffer.from(baseNormalized).toString("base64url").slice(0, 32)}`;
      const currentMeta = meta[legacyKey] || {};
      const effectiveModelName = this.clean(currentMeta.modelName) || modelName;
      const normalized = this.normalizeModelName(effectiveModelName);
      const key =
        type === "desen"
          ? `desen-file-${this.clean(file.id || file.fileHash || legacyKey)}`
          : legacyKey;
      const matchingKeys = normalizedRowKeys.get(normalized) || [];
      const targetKeys =
        type === "desen" || !matchingKeys.length ? [key] : matchingKeys;

      targetKeys.forEach((targetKey) => {
        const currentMeta = meta[targetKey] || meta[legacyKey] || {};
        const row = map.get(targetKey) || {
          id: targetKey,
          modelName: this.clean(currentMeta.modelName) || effectiveModelName,
          modelAdi: this.clean(currentMeta.modelAdi) || this.clean(currentMeta.modelName) || effectiveModelName,
          normalizedModelName: normalized,
          storedFileId: this.clean(file.id),
          originalFileName: this.clean(file.originalFileName),
          sourcePath: this.clean(file.sourcePath),
          firmId: this.clean(currentMeta.firmId),
          firmName: this.clean(currentMeta.firmName),
          renkSayisi: Number(currentMeta.renkSayisi || 0),
          searchKeywords: this.parseKeywords(currentMeta.searchKeywords),
          isInGlobalModelPool: this.bool(currentMeta.isInGlobalModelPool),
          pendingModelPool: this.bool(currentMeta.pendingModelPool),
          isActive:
            currentMeta.isActive === undefined
              ? true
              : this.bool(currentMeta.isActive),
          kanalInfo: this.clean(currentMeta.kanalInfo),
          baskiBolgesi: this.clean(currentMeta.baskiBolgesi),
          urunTipi: this.clean(currentMeta.urunTipi),
          renkler: this.clean(currentMeta.renkler),
          yazilar: this.clean(currentMeta.yazilar),
          temaFigur: this.clean(currentMeta.temaFigur),
          olcuBeden: this.clean(currentMeta.olcuBeden),
          teknikNotlar: this.clean(currentMeta.teknikNotlar),
          zemin: this.clean(currentMeta.zemin),
          aciklama: this.clean(currentMeta.aciklama),
          tagsText: this.clean(currentMeta.tagsText),
          searchText: this.clean(currentMeta.searchText),
          ocrText: this.cleanOcrText(currentMeta.ocrText),
          ocrUpdatedAt: this.clean(currentMeta.ocrUpdatedAt),
          ocrIndexedAt: this.clean(currentMeta.ocrIndexedAt),
          ocrError: this.clean(currentMeta.ocrError),
          absolutePath: this.clean(file.absolutePath),
          fileNames: [],
          lastUpdatedAt: "",
          desenImageThumb: "",
          desenImageOriginal: "",
          hasKanalImage: false,
          kanalImageThumb: "",
          hasPdf: false,
          pdfFileName: "",
          createdAt: this.clean(file.createdAt),
          updatedAt: this.clean(file.updatedAt),
        };

        row.fileNames = Array.from(
          new Set(
            [
              ...row.fileNames,
              this.clean(file.originalFileName),
              this.clean(file.storedFileName),
              this.clean(file.relativePath),
              this.clean(file.sourcePath),
            ].filter(Boolean),
          ),
        );
        row.createdAt = this.clean(row.createdAt || file.createdAt);
        row.updatedAt = this.clean(file.updatedAt || row.updatedAt);
        row.lastUpdatedAt = this.clean(
          file.createdAt || file.updatedAt || row.lastUpdatedAt,
        );
        if (type === "desen") {
          row.desenImageThumb = this.clean(
            file.thumbnailPath || file.publicUrl,
          );
          row.desenImageOriginal = this.clean(
            file.publicUrl || file.thumbnailPath,
          );
        } else if (type === "kanal") {
          row.hasKanalImage = true;
          row.kanalImageThumb = this.clean(
            file.thumbnailPath || file.publicUrl,
          );
        } else {
          row.hasPdf = true;
          row.pdfFileName = this.clean(
            file.originalFileName || file.storedFileName,
          );
        }
        row.isInGlobalModelPool =
          row.isInGlobalModelPool || inPoolNameSet.has(normalized);
        row.pendingFirm = !this.clean(row.firmId);
        row.poolStatus = row.isInGlobalModelPool
          ? "model_havuzu"
          : row.pendingFirm || row.pendingModelPool
            ? "bekleyen"
            : "hazir";
        map.set(targetKey, row);
        if (type === "desen") {
          normalizedRowKeys.set(normalized, [
            ...new Set([
              ...(normalizedRowKeys.get(normalized) || []),
              targetKey,
            ]),
          ]);
        }
      });
    };

    effectiveDesenFiles.forEach((row: any) => applyFile(row, "desen"));
    (Array.isArray(kanalFiles) ? kanalFiles : []).forEach((row: any) =>
      applyFile(row, "kanal"),
    );
    (Array.isArray(pdfFiles) ? pdfFiles : []).forEach((row: any) =>
      applyFile(row, "pdf"),
    );

    const q = this.normalizeModelName(query.q || query.search);
    const firma = this.clean(query.firmId || query.firmaId);
    const activeFilter = this.clean(query.isActive);
    const hasVisual = this.clean(query.hasVisual);
    const hasKanal = this.clean(query.hasKanal);
    const hasPdf = this.clean(query.hasPdf);
    const inPool = this.clean(query.inGlobalPool);
    const pendingFirm = this.clean(query.pendingFirm);
    const renk = this.clean(query.renkSayisi);

    const rows = Array.from(map.values()).filter((row: any) => {
      if (firma && row.firmId !== firma) return false;
      if (activeFilter === "true" && !row.isActive) return false;
      if (activeFilter === "false" && row.isActive) return false;
      if (hasVisual === "true" && !row.desenImageThumb) return false;
      if (hasVisual === "false" && row.desenImageThumb) return false;
      if (hasKanal === "true" && !row.hasKanalImage) return false;
      if (hasKanal === "false" && row.hasKanalImage) return false;
      if (hasPdf === "true" && !row.hasPdf) return false;
      if (hasPdf === "false" && row.hasPdf) return false;
      if (inPool === "true" && !row.isInGlobalModelPool) return false;
      if (inPool === "false" && row.isInGlobalModelPool) return false;
      if (pendingFirm === "true" && !row.pendingFirm) return false;
      if (pendingFirm === "false" && row.pendingFirm) return false;
      if (renk && Number(row.renkSayisi || 0) !== Number(renk)) return false;
      if (!q) return true;
      const composedSearchText = this.clean(
        row.searchText ||
          [
            row.modelName,
            row.modelAdi,
            row.firmName,
            row.renkSayisi,
            row.baskiBolgesi,
            row.urunTipi,
            row.renkler,
            row.yazilar,
            row.temaFigur,
            row.olcuBeden,
            row.teknikNotlar,
            row.zemin,
            row.kanalInfo,
            row.aciklama,
            row.tagsText,
            row.ocrText,
            row.pdfFileName,
            ...(Array.isArray(row.fileNames) ? row.fileNames : []),
            ...(Array.isArray(row.searchKeywords) ? row.searchKeywords : []),
          ].join(" "),
      );
      return this.semanticSearchMatch({ ...row, searchText: composedSearchText }, q);
    });

    const sortBy = this.clean(query.sortBy || query.sort).toLocaleLowerCase(
      "tr-TR",
    );
    const sortedRows = rows.sort((a: any, b: any) => {
      if (!sortBy || sortBy === "date" || sortBy === "newest" || sortBy === "tarih") {
        const dateOf = (row: any) => {
          const raw =
            row?.createdAt ||
            row?.created_at ||
            row?.lastUpdatedAt ||
            row?.updatedAt ||
            row?.updated_at ||
            "";
          const time = raw ? new Date(raw).getTime() : 0;
          return Number.isFinite(time) ? time : 0;
        };
        const dateDiff = dateOf(b) - dateOf(a);
        if (dateDiff) return dateDiff;
        return String(a.modelName || "").localeCompare(
          String(b.modelName || ""),
          "tr",
          { sensitivity: "base" },
        );
      }
      return `${a.modelName} ${a.firmName}`.localeCompare(
        `${b.modelName} ${b.firmName}`,
        "tr",
        {
          sensitivity: "base",
        },
      );
    });

    const dedupedRows = this.dedupeHavuzRows(sortedRows);

    if (this.clean(query.skipAutoOcr) !== "true") {
      this.triggerOneTimeAutoOcr(slug, dedupedRows);
    }

    return dedupedRows;
  }

  async havuzStorageDurum(query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const storagePath = this.clean(query.path || query.storagePath) || this.fallbackModelFolderPath();
    const pathExists =
      Boolean(storagePath) &&
      fs.existsSync(storagePath) &&
      fs.statSync(storagePath).isDirectory();
    const files = pathExists ? this.collectModelFiles(storagePath) : [];
    const thumbCount = files.filter((filePath) =>
      this.isThumbFileName(path.basename(filePath)),
    ).length;
    const mainImageCount = files.length - thumbCount;
    const storageRows = this.storageService
      ? await this.storageService.listFiles({
          ...query,
          mainCompanySlug: slug,
          module: "DESEN",
          documentType: "DESEN_GORSEL",
          take: 5000,
        })
      : [];
    const dbRows = (Array.isArray(storageRows) ? storageRows : []).filter(
      (row: any) => !this.isThumbFileName(row?.originalFileName),
    );
    const latest = dbRows
      .map((row: any) => this.clean(row.updatedAt || row.createdAt))
      .filter(Boolean)
      .sort()
      .pop() || null;
    return {
      storagePath,
      pathExists,
      imageFileCount: files.length,
      mainImageCount,
      thumbCount,
      dbRecordCount: dbRows.length,
      lastImportAt: latest,
    };
  }

  async searchHavuz(query: Record<string, any>) {
    return this.listHavuz(query);
  }

  async syncHavuzWatchFolder(body: Record<string, any>) {
    return this.scanHavuzIncomingFolder(body);
  }

  async uploadHavuzImage(file: any, body: Record<string, any>) {
    if (!this.storageService || !this.storageRulesService) {
      throw new BadRequestException("Dosya saklama servisi hazır değil.");
    }
    const slug = this.requireSlug(body);
    const defaultFirma = await this.ensureDefaultFirmaForImport(slug, body);
    const explicitFirmId = this.clean(body.firmId || body.firmaId);
    const explicitFirmName = this.clean(body.firmName || body.firmaAdi);
    const modelName =
      this.clean(body.modelName || body.modelAdi) ||
      path.parse(this.clean(file.originalname)).name;
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");
    const mainCompanyId = await this.storageRulesService.resolveMainCompanyId({
      mainCompanyId: body.mainCompanyId,
      mainCompanySlug: slug,
    });
    const stored = await this.storageService.saveFile({
      buffer: file.buffer,
      originalFileName: this.clean(file.originalname),
      mimeType: this.clean(file.mimetype),
      module: "DESEN" as any,
      documentType: "DESEN_GORSEL" as any,
      ownerType: "MODEL",
      ownerId: modelName,
      modelSlug: modelName,
      firmId: explicitFirmId || null,
      firmSlug: this.clean(body.firmName || body.firmaAdi || defaultFirma.name || "desen"),
      sourcePath: "",
      date: new Date(),
      mainCompanyId,
      createdBy: this.clean(body.createdBy || "desen-havuzu-upload"),
    } as any);
    let model: any = null;
    const firmId = explicitFirmId;
    const firmName = explicitFirmName;
    if (this.modelService) {
      model = await this.modelService.create({
        mainCompanySlug: slug,
        mainCompanyId: slug,
        modelName,
        modelAdi: modelName,
        firmId,
        firmaId: firmId,
        firmaAdi: firmName,
        musteriFirma: firmName,
        desenImageThumb: stored.thumbnailPath || stored.publicUrl,
        imageUrl: stored.thumbnailPath || stored.publicUrl,
        durum: "ACTIVE",
      });
      await this.modelService.saveImages(slug, model.id, [
        {
          url: stored.thumbnailPath || stored.publicUrl,
          path: stored.publicUrl || stored.thumbnailPath,
          note: "desen-havuzu-manuel",
        },
      ]);
    }
    const rowId = `desen-file-${this.clean(stored.id || stored.fileHash || "")}`;
    if (rowId !== "desen-file-") {
      const meta = this.readHavuzMeta(slug);
      const smartMeta = await this.buildSmartHavuzMeta({
        modelName,
        originalFileName: this.clean(file.originalname),
        firmName,
        sourcePath: this.clean(stored?.absolutePath || stored?.sourcePath),
        ocrText: this.clean(meta[rowId]?.ocrText),
        current: meta[rowId],
      });
      meta[rowId] = {
        ...(meta[rowId] || {}),
        modelAdi: modelName,
        modelName,
        originalFileName: this.clean(file.originalname),
        firmId,
        firmName,
        imageHash: this.clean(stored?.fileHash),
        isInGlobalModelPool: Boolean(model),
        pendingModelPool: !firmId,
        ...smartMeta,
        updatedAt: this.now(),
      };
      this.writeHavuzMeta(slug, meta);

      const sourcePath = this.readHavuzImageSourcePath(stored);
      if (sourcePath) {
        await this.indexHavuzOcrTargets(
          slug,
          [{ id: rowId, sourcePath }],
          { force: false },
        ).catch(() => undefined);
      }
    }
    return { stored, model, modelName, rowId, pendingFirm: !firmId };
  }

  async getHavuzById(id: string, query: Record<string, any>) {
    const rows = await this.listHavuz(query);
    const row = rows.find((item: any) => item.id === id);
    if (!row) throw new NotFoundException("Havuz kaydı bulunamadı.");
    return row;
  }

  patchHavuz(id: string, body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const meta = this.readHavuzMeta(slug);
    const current = meta[id] || {};
    meta[id] = {
      ...current,
      firmId:
        body.firmId !== undefined ? this.clean(body.firmId) : current.firmId,
      firmName:
        body.firmName !== undefined
          ? this.clean(body.firmName)
          : current.firmName,
      renkSayisi:
        body.renkSayisi !== undefined
          ? Number(body.renkSayisi || 0)
          : current.renkSayisi,
      searchKeywords:
        body.searchKeywords !== undefined
          ? this.parseKeywords(body.searchKeywords)
          : current.searchKeywords,
      isInGlobalModelPool:
        body.isInGlobalModelPool !== undefined
          ? this.bool(body.isInGlobalModelPool)
          : current.isInGlobalModelPool,
      pendingModelPool:
        body.pendingModelPool !== undefined
          ? this.bool(body.pendingModelPool)
          : current.pendingModelPool,
      isActive:
        body.isActive !== undefined
          ? this.bool(body.isActive)
          : current.isActive,
      kanalInfo:
        body.kanalInfo !== undefined
          ? this.clean(body.kanalInfo)
          : current.kanalInfo,
      baskiBolgesi:
        body.baskiBolgesi !== undefined
          ? this.clean(body.baskiBolgesi)
          : current.baskiBolgesi,
      urunTipi:
        body.urunTipi !== undefined
          ? this.clean(body.urunTipi)
          : current.urunTipi,
      renkler:
        body.renkler !== undefined
          ? this.clean(body.renkler)
          : current.renkler,
      yazilar:
        body.yazilar !== undefined
          ? this.clean(body.yazilar)
          : current.yazilar,
      temaFigur:
        body.temaFigur !== undefined
          ? this.clean(body.temaFigur)
          : current.temaFigur,
      olcuBeden:
        body.olcuBeden !== undefined
          ? this.clean(body.olcuBeden)
          : current.olcuBeden,
      teknikNotlar:
        body.teknikNotlar !== undefined
          ? this.clean(body.teknikNotlar)
          : current.teknikNotlar,
      zemin: body.zemin !== undefined ? this.clean(body.zemin) : current.zemin,
      aciklama:
        body.aciklama !== undefined
          ? this.clean(body.aciklama)
          : current.aciklama,
      tagsText:
        body.tagsText !== undefined
          ? this.clean(body.tagsText)
          : current.tagsText,
      searchText:
        body.searchText !== undefined
          ? this.clean(body.searchText)
          : this.clean(
              [
                body.modelName !== undefined ? body.modelName : current.modelName,
                body.firmName !== undefined ? body.firmName : current.firmName,
                body.aciklama !== undefined ? body.aciklama : current.aciklama,
                body.ocrText !== undefined ? body.ocrText : current.ocrText,
                body.tagsText !== undefined ? body.tagsText : current.tagsText,
                body.searchKeywords !== undefined
                  ? this.parseKeywords(body.searchKeywords).join(" ")
                  : this.parseKeywords(current.searchKeywords).join(" "),
              ].join(" "),
            ),
      ocrText:
        body.ocrText !== undefined
          ? this.cleanOcrText(body.ocrText)
          : current.ocrText,
      ocrUpdatedAt:
        body.ocrText !== undefined ? this.now() : current.ocrUpdatedAt,
      ocrIndexedAt:
        body.ocrText !== undefined ? this.now() : current.ocrIndexedAt,
      modelName:
        body.modelName !== undefined
          ? this.clean(body.modelName)
          : current.modelName,
      updatedAt: this.now(),
    };
    this.writeHavuzMeta(slug, meta);
    return { id, ...meta[id] };
  }

  async indexHavuzOcr(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const requestedIds = Array.isArray(body.ids)
      ? body.ids.map((item) => this.clean(item)).filter(Boolean)
      : [];
    const applyAll = this.bool(body.applyAll || body.all || body.full);
    const limit = applyAll
      ? 5000
      : Math.max(1, Math.min(Number(body.limit || 1) || 1, 50));
    const force = this.bool(body.force);

    const rows = await this.listHavuz({
      mainCompanySlug: slug,
      includePassive: true,
      includeAllStorage: "true",
      skipAutoOcr: "true",
    });
    const byId = new Map(rows.map((row: any) => [this.clean(row.id), row]));
    const targets = (
      requestedIds.length
        ? requestedIds.map((id) => byId.get(id)).filter(Boolean)
        : rows
    )
      .slice(0, limit)
      .map((row: any) => ({
        id: this.clean(row.id),
        sourcePath: this.clean(row.absolutePath || row.sourcePath),
      }))
      .filter(
        (row) => row.id && row.sourcePath && fs.existsSync(row.sourcePath),
      );
    if (!targets.length) {
      return {
        indexedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        totalTargetCount: 0,
        force,
        applyAll,
        errors: [],
      };
    }

    let indexedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ id: string; message: string }> = [];
    const batchSize = applyAll ? 50 : targets.length;
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const result = await this.indexHavuzOcrTargets(slug, batch, { force });
      indexedCount += Number(result.indexedCount || 0);
      skippedCount += Number(result.skippedCount || 0);
      errorCount += Number(result.errorCount || 0);
      if (Array.isArray(result.errors) && result.errors.length) {
        errors.push(...result.errors);
      }
    }
    return {
      indexedCount,
      skippedCount,
      errorCount,
      totalTargetCount: targets.length,
      force,
      applyAll,
      errors: errors.slice(0, 50),
    };
  }

  async bulkFirmaAta(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const ids = Array.isArray(body.ids)
      ? body.ids.map((item) => this.clean(item)).filter(Boolean)
      : [];
    if (!ids.length) {
      throw new BadRequestException("Atama için en az bir kayıt seçilmelidir.");
    }
    const firmId = this.clean(body.firmId || body.firmaId);
    const firmName = this.clean(
      body.firmName || body.firmaName || body.firmaAdi,
    );
    if (!firmId) {
      throw new BadRequestException("Firma ataması için firmId zorunludur.");
    }
    const meta = this.readHavuzMeta(slug);
    const rows = await this.listHavuz({
      mainCompanySlug: slug,
      includePassive: true,
      skipAutoOcr: "true",
    });
    const rowMap = new Map(rows.map((row: any) => [row.id, row]));
    const promoted: any[] = [];
    const errors: any[] = [];
    for (const id of ids) {
      const current = meta[id] || {};
      meta[id] = {
        ...current,
        firmId,
        firmName: firmName || current.firmName || "",
        pendingModelPool: false,
        updatedAt: this.now(),
      };
      const row = rowMap.get(id);
      if (this.bool(current.pendingModelPool) && row && this.modelService) {
        try {
          const model = await this.createModelFromHavuzRow(slug, row, {
            firmId,
            firmName: firmName || current.firmName || "",
          });
          promoted.push({ id, modelId: model.id, modelName: row.modelName });
          meta[id] = {
            ...meta[id],
            isInGlobalModelPool: true,
            pendingModelPool: false,
          };
        } catch (error: any) {
          errors.push({
            id,
            modelName: row.modelName,
            message: this.clean(error?.message || "Model havuzuna aktarılamadı."),
          });
        }
      }
    }
    this.writeHavuzMeta(slug, meta);
    return {
      updatedCount: ids.length,
      firmId,
      firmName,
      promotedCount: promoted.length,
      errorCount: errors.length,
      promoted,
      errors,
    };
  }

  private async createModelFromHavuzRow(
    slug: string,
    row: any,
    firm: { firmId: string; firmName: string },
  ) {
    if (!this.modelService) {
      throw new BadRequestException("Model servisi hazır değil.");
    }
    const payload: Record<string, any> = {
      mainCompanySlug: slug,
      modelName: row.modelName,
      modelAdi: row.modelName,
      firmId: firm.firmId,
      firmaId: firm.firmId,
      firmaAdi: firm.firmName,
      musteriFirma: firm.firmName,
      renkSayisi: Number(row.renkSayisi || 0),
      searchKeywords: row.searchKeywords,
      isInGlobalModelPool: true,
      isActive: row.isActive !== false,
      desenImageThumb: row.desenImageThumb,
      kanalImageThumb: row.kanalImageThumb,
      durum: row.isActive === false ? "PASIF" : "ACTIVE",
    };
    const model = await this.modelService.create(payload);
    if (row.desenImageThumb) {
      await this.modelService.saveImages(slug, model.id, [
        {
          url: row.desenImageThumb,
          path: row.desenImageThumb,
          note: "desen-havuzu",
        },
      ]);
    }
    return model;
  }

  async bulkModelHavuzunaEkle(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    if (!this.modelService) {
      throw new BadRequestException("Model servisi hazır değil.");
    }
    const ids = Array.isArray(body.ids)
      ? body.ids.map((item) => this.clean(item)).filter(Boolean)
      : [];
    if (!ids.length) {
      throw new BadRequestException(
        "Model havuzuna ekleme için en az bir kayıt seçin.",
      );
    }
    const fallbackFirmId = this.clean(body.firmId || body.firmaId);
    const fallbackFirmName = this.clean(
      body.firmName || body.firmaAdi || body.firmaName,
    );
    const rows = await this.listHavuz({
      mainCompanySlug: slug,
      includePassive: true,
    });
    const rowMap = new Map(rows.map((row: any) => [row.id, row]));
    const meta = this.readHavuzMeta(slug);
    const created: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const id of ids) {
      const row = rowMap.get(id);
      if (!row) {
        errors.push({ id, message: "Havuz kaydı bulunamadı." });
        continue;
      }
      const firmId = this.clean(row.firmId || fallbackFirmId);
      const firmName = this.clean(row.firmName || fallbackFirmName);
      if (!firmId) {
        meta[id] = {
          ...(meta[id] || {}),
          pendingModelPool: true,
          updatedAt: this.now(),
        };
        skipped.push({
          id,
          modelName: row.modelName,
          message: "Firma bekleniyor.",
        });
        continue;
      }
      try {
        const model = await this.createModelFromHavuzRow(slug, row, {
          firmId,
          firmName,
        });
        created.push({ id, modelId: model.id, modelName: row.modelName });
        meta[id] = {
          ...(meta[id] || {}),
          firmId,
          firmName,
          isInGlobalModelPool: true,
          pendingModelPool: false,
          updatedAt: this.now(),
        };
      } catch (error: any) {
        const message = this.clean(
          error?.message || "Model havuzuna eklenemedi.",
        );
        if (/zaten|already|exists|mevcut/i.test(message)) {
          skipped.push({ id, modelName: row.modelName, message });
          meta[id] = {
            ...(meta[id] || {}),
            firmId,
            firmName,
            isInGlobalModelPool: true,
            pendingModelPool: false,
            updatedAt: this.now(),
          };
        } else {
          errors.push({ id, modelName: row.modelName, message });
        }
      }
    }

    this.writeHavuzMeta(slug, meta);
    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      created,
      skipped,
      errors,
    };
  }

  private workspaceRootPath() {
    return path.resolve(process.cwd(), "..", "..", "..");
  }

  private formatReportStamp(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return {
      compact: `${yyyy}${mm}${dd}_${hh}${mi}${ss}`,
      fileStamp: `${yyyy}${mm}${dd}_${hh}${mi}${ss}`,
      pretty: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    };
  }

  private resolveSqliteDbPath() {
    const url = this.clean(process.env.DATABASE_URL);
    const filePrefix = "file:";
    if (!url.toLocaleLowerCase("tr-TR").startsWith(filePrefix)) {
      return path.join(this.workspaceRootPath(), "DATA", "KYERP.db");
    }
    const rawPath = url.slice(filePrefix.length);
    if (/^[A-Za-z]:\//.test(rawPath)) {
      return path.resolve(rawPath.replace(/\//g, path.sep));
    }
    return path.resolve(process.cwd(), rawPath);
  }

  private clearDirectoryContents(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return 0;
    }
    let removed = 0;
    for (const entry of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }

  private async cleanupDesenModelData(slug: string, mainCompanyId?: string) {
    const clearedStoreKeys: string[] = [];
    DESEN_MODEL_RESET_KEYS.forEach((key) => {
      const fallback = key === "desen.havuz-meta" || key === "desen.havuz-folder-scan-state" ? {} : [];
      this.db.writeMainCompanyStore(slug, key, fallback as any);
      clearedStoreKeys.push(key);
    });

    if (!this.prisma) {
      return {
        clearedStoreKeys,
        prismaCleanup: {
          skipped: true,
        },
      };
    }

    const whereMainCompany = { mainCompanySlug: slug };
    const prismaCleanup: Record<string, number> = {};
    prismaCleanup.modelImage = Number(
      (await (this.prisma as any).modelImage.deleteMany({ where: whereMainCompany }))?.count || 0,
    );
    prismaCleanup.modelDocumentLink = Number(
      (await (this.prisma as any).modelDocumentLink.deleteMany({ where: whereMainCompany }))?.count || 0,
    );
    prismaCleanup.modelProductionLink = Number(
      (await (this.prisma as any).modelProductionLink.deleteMany({ where: whereMainCompany }))?.count || 0,
    );
    prismaCleanup.modelRecord = Number(
      (await (this.prisma as any).modelRecord.deleteMany({ where: whereMainCompany }))?.count || 0,
    );

    if (mainCompanyId) {
      prismaCleanup.storedFile = Number(
        (
          await (this.prisma as any).storedFile.deleteMany({
            where: {
              mainCompanyId,
              module: "DESEN",
            },
          })
        )?.count || 0,
      );
    } else {
      prismaCleanup.storedFile = 0;
    }

    return {
      clearedStoreKeys,
      prismaCleanup,
    };
  }

  async resetDesenAiKurulum(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const stamp = this.formatReportStamp(new Date());
    const workspaceRoot = this.workspaceRootPath();
    const logsDir = path.join(workspaceRoot, "LOGS");
    const reportPath = path.join(
      logsDir,
      `KYERP_DESEN_SIFIR_YUKLEME_AI_ARAMA_RAPORU_${stamp.fileStamp}.md`,
    );
    fs.mkdirSync(logsDir, { recursive: true });

    const dbPath = this.resolveSqliteDbPath();
    const dbBackupPath = path.join(
      path.dirname(dbPath),
      `KYERP.db.bak.${stamp.fileStamp}`,
    );
    if (!fs.existsSync(dbPath)) {
      throw new BadRequestException(`DB bulunamadi: ${dbPath}`);
    }
    fs.copyFileSync(dbPath, dbBackupPath);

    const mainCompanyId = this.storageRulesService
      ? await this.storageRulesService
          .resolveMainCompanyId({ mainCompanySlug: slug, mainCompanyId: body.mainCompanyId })
          .catch(() => "")
      : "";

    const cleanupSummary = await this.cleanupDesenModelData(slug, mainCompanyId || "");
    const modellerPath = this.fallbackModelFolderPath();
    const clearedModelFolderEntries = this.clearDirectoryContents(modellerPath);

    const defaultFirma = await this.ensureDefaultFirmaForImport(slug, {
      ...body,
      firmName: this.clean(body.firmName || body.firmaAdi || DEFAULT_DESEN_FIRMA),
    });
    const importSummary = await this.scanHavuzIncomingFolder({
      ...body,
      mainCompanySlug: slug,
      mainCompanyId: body.mainCompanyId,
      firmId: this.clean(body.firmId || body.firmaId || defaultFirma.id),
      firmName: this.clean(body.firmName || body.firmaAdi || defaultFirma.name),
      createdBy: this.clean(body.createdBy || "desen-sifir-kurulum"),
    });

    const reportLines = [
      `# KY ERP Desen Sifir Yukleme ve AI Arama Raporu`,
      "",
      `- Tarih: ${stamp.pretty}`,
      `- Ana firma slug: ${slug}`,
      `- Varsayilan firma: ${this.clean(defaultFirma.name || DEFAULT_DESEN_FIRMA)}`,
      `- DB yedegi: ${dbBackupPath}`,
      `- Modeller klasoru: ${modellerPath}`,
      "",
      "## Yapilan Islemler",
      `- Eski desen/model kayitlari temizlendi: ${JSON.stringify(cleanupSummary.prismaCleanup || {})}`,
      `- JSON store temizlenen anahtarlar: ${(cleanupSummary.clearedStoreKeys || []).join(", ")}`,
      `- Modeller klasorunden silinen giris sayisi: ${clearedModelFolderEntries}`,
      "",
      "## Yeniden Ice Aktarim",
      `- Yeni kayit: ${Number(importSummary?.newModels || 0)}`,
      `- Duplicate: ${Number(importSummary?.alreadyProcessed || 0)}`,
      `- Hatali: ${Number(importSummary?.failed || 0)}`,
      `- Bekleyen gelen dosya: ${Number(importSummary?.pendingFileCount || 0)}`,
      "",
      "## Notlar",
      "- OCR ve goruntu analizi yerel olarak (tesseract.js + sharp) calistirildi.",
      "- Arama metni model adi, dosya adi, OCR metni, analiz etiketleri ve firma adi ile olusturuldu.",
    ];
    fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

    return {
      ok: true,
      dbPath,
      dbBackupPath,
      reportPath,
      defaultFirma,
      cleanupSummary,
      importSummary,
      modellerPath,
      clearedModelFolderEntries,
    };
  }

  getRecord(id: string, query: Record<string, any>) {
    return this.getRecordOrThrow(id, query).record;
  }

  saveRecord(body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const rows = this.readRecords(slug);
    const existing = rows.find((row) => row.id === this.clean(body.id));
    const now = this.now();
    const model = body.modelId
      ? this.modelStore.getById(slug, undefined, this.clean(body.modelId))
      : null;
    const desenAdi = this.clean(
      body.desenAdi || existing?.desenAdi || body.modelAdi || model?.modelAdi,
    );
    const record: DesenRecord = {
      id: existing?.id || randomUUID(),
      mainCompanySlug: slug,
      desenAdi,
      desenSlug: existing?.desenSlug || this.slugify(desenAdi),
      modelId: this.clean(body.modelId || existing?.modelId || model?.id),
      modelAdi: this.clean(
        body.modelAdi || model?.modelAdi || existing?.modelAdi || desenAdi,
      ),
      musteri: this.clean(
        body.musteri || model?.musteriFirma || existing?.musteri,
      ),
      siparisNo: this.clean(
        body.siparisNo || model?.musteriIrsaliyeNo || existing?.siparisNo,
      ),
      zeminRenk: this.clean(
        body.zeminRenk || body.zemin || model?.zemin || existing?.zeminRenk,
      ),
      durum: this.clean(body.durum || existing?.durum || "Aktif"),
      tarih:
        this.clean(body.tarih || existing?.tarih) ||
        new Date().toISOString().slice(0, 10),
      aciklama: this.clean(body.aciklama || existing?.aciklama),
      notes: this.clean(body.notes || body.notlar || existing?.notes),
      kanalSayisi: Number(body.kanalSayisi ?? existing?.kanalSayisi ?? 0),
      kanalBilgileri: this.normalizeKanalBilgileri(
        body.kanalBilgileri,
        existing?.kanalBilgileri,
      ),
      boyahaneNotu: this.clean(body.boyahaneNotu || existing?.boyahaneNotu),
      files: { ...(existing?.files || {}), ...(body.files || {}) },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: existing?.deletedAt,
    };
    this.ensureDesenFolders(slug, record.desenSlug);
    this.writeRecords(slug, [
      record,
      ...rows.filter((row) => row.id !== record.id),
    ]);
    this.successLog(
      slug,
      existing ? "desen güncellendi" : "desen oluşturuldu",
      {
        desenId: record.id,
        modelId: record.modelId,
      },
    );
    return record;
  }

  async saveFile(recordId: string, file: any, body: Record<string, any>) {
    const { slug, record } = this.getRecordOrThrow(recordId, body);
    const role = this.clean(body.fileRole) as DesenFileRole;
    if (!FILE_ROLE_FOLDERS[role])
      throw new BadRequestException("Geçersiz dosya rolü.");
    const folder = FILE_ROLE_FOLDERS[role];
    const date = new Date();
    const extra =
      role === "kalip_hazir_dosya"
        ? path.join(
            String(date.getFullYear()),
            String(date.getMonth() + 1).padStart(2, "0"),
          )
        : "";
    const dir = path.join(
      this.ensureDesenFolders(slug, record.desenSlug),
      folder,
      extra,
    );
    fs.mkdirSync(dir, { recursive: true });
    const fileName = this.uniqueFileName(
      dir,
      this.clean(body.targetFileName || file.originalname),
    );
    const fullPath = path.join(dir, fileName);
    fs.writeFileSync(fullPath, file.buffer);
    const row: DesenFileRecord = {
      id: randomUUID(),
      mainCompanySlug: slug,
      desenId: record.id,
      modelId: this.clean(body.modelId || record.modelId),
      fileRole: role,
      originalName: this.clean(file.originalname),
      fileName,
      mimeType: this.clean(file.mimetype),
      size: Number(file.size || 0),
      path: this.relativeFromCwd(fullPath),
      previewPath: this.relativeFromCwd(fullPath),
      thumbnailPath: /^image\//i.test(file.mimetype)
        ? this.relativeFromCwd(fullPath)
        : "",
      status: "uploaded",
      uploadedAt: this.now(),
      uploadedBy: this.clean(body.uploadedBy || "system"),
    };
    const storedFile = await this.mirrorFileToStorageService({
      slug,
      record,
      role,
      file,
      body,
    });
    if (storedFile?.id) {
      (row as any).storedFileId = storedFile.id;
      (row as any).storagePublicUrl = storedFile.publicUrl;
    }
    const files = this.readFiles(slug);
    this.writeFiles(slug, [row, ...files]);
    const records = this.readRecords(slug);
    const updatedRecord = {
      ...record,
      files: {
        ...(record.files || {}),
        [role]:
          role === "kalip_hazir_dosya"
            ? [
                ...(Array.isArray(record.files?.[role])
                  ? (record.files[role] as string[])
                  : []),
                row.id,
              ]
            : row.id,
      },
      updatedAt: this.now(),
    };
    this.writeRecords(slug, [
      updatedRecord,
      ...records.filter((item) => item.id !== record.id),
    ]);
    this.successLog(slug, "dosya yüklendi", {
      desenId: record.id,
      modelId: row.modelId,
      fileId: row.id,
      fileRole: role,
    });
    return row;
  }

  getFile(id: string, query: Record<string, any>) {
    const slug = this.requireSlug(query);
    const file = this.readFiles(slug).find(
      (row) => row.id === id && !row.deletedAt,
    );
    if (!file) throw new NotFoundException("Dosya bulunamadı.");
    return file;
  }

  resolveFilePath(id: string, query: Record<string, any>) {
    const file = this.getFile(id, query);
    const full = path.resolve(process.cwd(), file.path);
    const root = path.resolve(
      process.cwd(),
      "data",
      "documents",
      file.mainCompanySlug,
    );
    if (!full.startsWith(root) || !fs.existsSync(full))
      throw new NotFoundException("Dosya bulunamadı.");
    return full;
  }

  softDeleteFile(id: string, body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const files = this.readFiles(slug);
    const existing = files.find((row) => row.id === id);
    if (!existing) throw new NotFoundException("Dosya bulunamadı.");
    const updated = { ...existing, status: "archived", deletedAt: this.now() };
    this.writeFiles(slug, [updated, ...files.filter((row) => row.id !== id)]);
    this.successLog(slug, "dosya silindi/arşivlendi", {
      fileId: id,
      desenId: existing.desenId,
      modelId: existing.modelId,
    });
    return updated;
  }

  listYerlesim(recordId: string, query: Record<string, any>) {
    const { slug } = this.getRecordOrThrow(recordId, query);
    return this.readYerlesim(slug).filter((row) => row.desenId === recordId);
  }

  saveYerlesim(recordId: string, body: Record<string, any>) {
    const { slug, record } = this.getRecordOrThrow(recordId, body);
    const rows = this.readYerlesim(slug);
    const existing = rows.find((row) => row.id === this.clean(body.id));
    const now = this.now();
    const next: YerlesimRecord = {
      id: existing?.id || randomUUID(),
      mainCompanySlug: slug,
      desenId: record.id,
      modelId: this.clean(body.modelId || record.modelId),
      yerlesimDosyaAdi: this.clean(
        body.yerlesimDosyaAdi || existing?.yerlesimDosyaAdi || record.desenAdi,
      ),
      tarih:
        this.clean(body.tarih || existing?.tarih) ||
        new Date().toISOString().slice(0, 10),
      baskiBolgesi: this.clean(body.baskiBolgesi || existing?.baskiBolgesi),
      baskiEn: this.clean(body.baskiEn || existing?.baskiEn),
      baskiBoy: this.clean(body.baskiBoy || existing?.baskiBoy),
      cekmePayiEn: this.clean(body.cekmePayiEn || existing?.cekmePayiEn),
      cekmePayiBoy: this.clean(body.cekmePayiBoy || existing?.cekmePayiBoy),
      teknikNot: this.clean(body.teknikNot || existing?.teknikNot),
      pdfFileId: this.clean(body.pdfFileId || existing?.pdfFileId),
      teknikGorselFileId: this.clean(
        body.teknikGorselFileId || existing?.teknikGorselFileId,
      ),
      revizyonFileId: this.clean(
        body.revizyonFileId || existing?.revizyonFileId,
      ),
      bedenSatirlari: Array.isArray(body.bedenSatirlari)
        ? body.bedenSatirlari
        : existing?.bedenSatirlari || DEFAULT_BEDEN_ROWS,
      status: this.clean(body.status || existing?.status || "Aktif"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.writeYerlesim(slug, [
      next,
      ...rows.filter((row) => row.id !== next.id),
    ]);
    this.successLog(slug, "yerleşim kaydedildi", {
      desenId: record.id,
      modelId: next.modelId,
      yerlesimId: next.id,
    });
    return next;
  }

  parseKalipFileName(fileName: string) {
    const base = this.clean(fileName).replace(/\.[^.]+$/, "");
    if (!base) return [];
    const patterns = [
      "XL BOY",
      "L BOY",
      "M BOY",
      "K BOY",
      "B BOY",
      "1-2 YAS",
      "2-3 YAS",
      "3-4 YAS",
      "4-5 YAS",
      "5-6 YAS",
      "6-7 YAS",
      "7-8 YAS",
      "9-12 AY",
      "A MODEL",
      "B MODEL",
    ];
    return base
      .split(/\s+-\s+/g)
      .map((part) => {
        const rawText = this.clean(part.replace(/_/g, " "));
        const upper = this.normalizeKey(rawText).replace(/YAŞ/g, "YAS");
        const bedenBoy =
          patterns.find((pattern) => upper.endsWith(pattern)) || "";
        const modelPart = bedenBoy
          ? rawText.slice(0, rawText.length - bedenBoy.length).trim()
          : rawText;
        return {
          rawText,
          parsedModelName: this.normalizeKey(modelPart || rawText),
          bedenBoy: bedenBoy.replace(/YAS/g, "YAŞ"),
        };
      })
      .filter((item) => item.rawText);
  }

  parseKalipForRecord(recordId: string, body: Record<string, any>) {
    const { slug } = this.getRecordOrThrow(recordId, body);
    const parsed = this.parseKalipFileName(body.fileName || body.dosyaAdi);
    if (parsed.length > 8) {
      throw new BadRequestException(
        "Bu dosyada 8’den fazla model algılandı. Lütfen dosya adını kontrol edin.",
      );
    }
    const models = this.listSharedModels({ mainCompanySlug: slug });
    const cards: KalipParsedItem[] = parsed.map((item) => {
      const exact = models.find(
        (model: any) =>
          this.normalizeKey(model.modelAdi) === item.parsedModelName,
      );
      const close =
        exact ||
        models.find(
          (model: any) =>
            this.normalizeKey(model.modelAdi).includes(item.parsedModelName) ||
            item.parsedModelName.includes(this.normalizeKey(model.modelAdi)),
        );
      return {
        id: randomUUID(),
        rawText: item.rawText,
        parsedModelName: item.parsedModelName,
        bedenBoy: item.bedenBoy,
        matchedModelId: close?.id || "",
        matchedModelName: close?.modelAdi || "",
        musteri: close?.musteri || close?.musteriFirma || "",
        zemin: close?.zemin || "",
        matchStatus: exact ? "Eşleşti" : close ? "Kontrol" : "Eşleşmedi",
        approved: false,
      };
    });
    this.successLog(slug, "dosya adından model ayıklandı", {
      desenId: recordId,
      fileName: body.fileName || body.dosyaAdi,
      count: cards.length,
    });
    return cards;
  }

  nextKalipCode(recordId: string, body: Record<string, any>) {
    const { slug } = this.getRecordOrThrow(recordId, body);
    const kalipEbatti = this.clean(body.kalipEbatti || body.kalipEbati);
    if (!kalipEbatti) throw new BadRequestException("Kalıp ebatı zorunludur.");
    const rows = this.readKalip(slug);
    const max = rows.reduce((acc, row) => {
      const match = row.kalipKodu?.match(
        new RegExp(
          `^${kalipEbatti.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`,
        ),
      );
      return match ? Math.max(acc, Number(match[1] || 0)) : acc;
    }, 0);
    return { kalipKodu: `${kalipEbatti}-${String(max + 1).padStart(2, "0")}` };
  }

  listKalip(recordId: string, query: Record<string, any>) {
    const { slug } = this.getRecordOrThrow(recordId, query);
    const q = this.normalizeKey(query.q);
    const rows = this.readKalip(slug).filter((row) => row.desenId === recordId);
    if (!q) return rows;
    return rows.filter((row) =>
      this.normalizeKey(JSON.stringify(row)).includes(q),
    );
  }

  saveKalip(recordId: string, body: Record<string, any>) {
    const { slug, record } = this.getRecordOrThrow(recordId, body);
    const rows = this.readKalip(slug);
    const existing = rows.find((row) => row.id === this.clean(body.id));
    const approvedCount = Array.isArray(body.parsedItems)
      ? body.parsedItems.filter((item: any) => this.bool(item.approved)).length
      : existing?.parsedItems?.filter((item) => item.approved).length || 0;
    if (!approvedCount)
      throw new BadRequestException(
        "Kayıt için en az 1 model kartı onaylı olmalı.",
      );
    const code =
      this.clean(body.kalipKodu || existing?.kalipKodu) ||
      this.nextKalipCode(recordId, body).kalipKodu;
    const next: KalipYerlesimRecord = {
      id: existing?.id || randomUUID(),
      mainCompanySlug: slug,
      desenId: record.id,
      kalipKodu: code,
      kalipEbatti: this.clean(
        body.kalipEbatti || body.kalipEbati || existing?.kalipEbatti,
      ),
      kalipSayisi: Number(body.kalipSayisi ?? existing?.kalipSayisi ?? 1),
      yuksekKalipVar: this.bool(
        body.yuksekKalipVar ?? existing?.yuksekKalipVar,
      ),
      yuksekKalipAdedi: Number(
        body.yuksekKalipAdedi ?? existing?.yuksekKalipAdedi ?? 0,
      ),
      simVar: this.bool(body.simVar ?? existing?.simVar),
      simNotu: this.clean(body.simNotu || existing?.simNotu),
      aciklama: this.clean(body.aciklama || existing?.aciklama),
      dosyaAdi: this.clean(
        body.dosyaAdi || existing?.dosyaAdi || `${code}.psd`,
      ),
      hazirDosyaFileId: this.clean(
        body.hazirDosyaFileId || existing?.hazirDosyaFileId,
      ),
      parsedItems: Array.isArray(body.parsedItems)
        ? body.parsedItems
        : existing?.parsedItems || [],
      status: this.clean(
        body.status ||
          existing?.status ||
          (approvedCount ? "Onaylandı" : "Kontrol Bekliyor"),
      ),
      createdAt: existing?.createdAt || this.now(),
      updatedAt: this.now(),
    };
    this.writeKalip(slug, [next, ...rows.filter((row) => row.id !== next.id)]);
    this.successLog(
      slug,
      existing ? "kalıp yerleşim kaydedildi" : "kalıp kodu oluşturuldu",
      { desenId: record.id, kalipId: next.id, kalipKodu: next.kalipKodu },
    );
    return next;
  }

  approveKalipCard(
    recordId: string,
    kalipId: string,
    body: Record<string, any>,
  ) {
    const { slug } = this.getRecordOrThrow(recordId, body);
    const rows = this.readKalip(slug);
    const row = rows.find((item) => item.id === kalipId);
    if (!row) throw new NotFoundException("Kalıp kaydı bulunamadı.");
    const cardId = this.clean(body.cardId || body.itemId);
    const next = {
      ...row,
      parsedItems: row.parsedItems.map((item) =>
        item.id === cardId
          ? { ...item, approved: true, matchStatus: "Onaylandı" as const }
          : item,
      ),
      updatedAt: this.now(),
    };
    this.writeKalip(slug, [
      next,
      ...rows.filter((item) => item.id !== kalipId),
    ]);
    this.successLog(slug, "model kartı onaylandı", {
      desenId: recordId,
      kalipId,
      cardId,
    });
    return next;
  }

  approveAllKalipCards(
    recordId: string,
    kalipId: string,
    body: Record<string, any>,
  ) {
    const { slug } = this.getRecordOrThrow(recordId, body);
    const rows = this.readKalip(slug);
    const row = rows.find((item) => item.id === kalipId);
    if (!row) throw new NotFoundException("Kalıp kaydı bulunamadı.");
    const next = {
      ...row,
      parsedItems: row.parsedItems.map((item) => ({
        ...item,
        approved: true,
        matchStatus: "Onaylandı" as const,
      })),
      updatedAt: this.now(),
    };
    this.writeKalip(slug, [
      next,
      ...rows.filter((item) => item.id !== kalipId),
    ]);
    this.successLog(slug, "model kartı onaylandı", {
      desenId: recordId,
      kalipId,
      all: true,
    });
    return next;
  }

  archiveRecord(id: string, body: Record<string, any>) {
    const { slug, record } = this.getRecordOrThrow(id, body);
    const rows = this.readRecords(slug);
    const next = {
      ...record,
      deletedAt: this.now(),
      durum: "Arşiv",
      updatedAt: this.now(),
    };
    this.writeRecords(slug, [next, ...rows.filter((row) => row.id !== id)]);
    this.successLog(slug, "desen arşivlendi", {
      desenId: id,
      modelId: record.modelId,
    });
    return next;
  }

  restoreRecord(id: string, body: Record<string, any>) {
    const slug = this.requireSlug(body);
    const rows = this.readRecords(slug);
    const record = rows.find((row) => row.id === id);
    if (!record) throw new NotFoundException("Desen kaydı bulunamadı.");
    const next = {
      ...record,
      deletedAt: undefined,
      durum: "Aktif",
      updatedAt: this.now(),
    };
    this.writeRecords(slug, [next, ...rows.filter((row) => row.id !== id)]);
    this.successLog(slug, "desen geri alındı", {
      desenId: id,
      modelId: record.modelId,
    });
    return next;
  }
}
