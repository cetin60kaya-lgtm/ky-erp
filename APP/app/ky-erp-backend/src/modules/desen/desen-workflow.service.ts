import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import * as ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { requireMainCompanySlug } from "../../common/api-helpers";
import { PrismaService } from "../../prisma/prisma.service";
import { getStorageRoot } from "../../storage/storage-path.util";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const CHANNEL_MARKERS = ["KANAL", "CHANNEL", "KANALLAR", "RENK", "COLOR"];
const PLACEMENT_MARKERS = ["YERLESIM", "YERLEŞİM", "K-BOY", "B-BOY", "KALIP"];

const DESIGN_SEARCH_EQUIVALENTS: Record<string, string[]> = {
  MICKEY: ["MICKET", "MIKI", "MOUSE", "DISNEY"],
  MICKET: ["MICKEY", "MIKI", "MOUSE", "DISNEY"],
  MINNIE: ["MINI", "MOUSE", "DISNEY"],
  AYI: ["AYICIK", "BEAR", "TEDDY"],
  AYICIK: ["AYI", "BEAR", "TEDDY"],
  KALP: ["HEART", "LOVE"],
  HEART: ["KALP", "LOVE"],
  LOVE: ["KALP", "HEART"],
  CICEK: ["FLOWER", "FLORAL"],
  FLOWER: ["CICEK", "FLORAL"],
  KELEBEK: ["BUTTERFLY"],
  BUTTERFLY: ["KELEBEK"],
  TAVSAN: ["RABBIT", "BUNNY"],
  KEDI: ["CAT", "KITTY"],
  KOPEK: ["DOG", "PUPPY"],
  DINAZOR: ["DINOSAUR", "DINO"],
  ARABA: ["CAR", "RACING", "RACE"],
  CAR: ["ARABA", "RACING", "RACE"],
  YILDIZ: ["STAR"],
  GOKKUSAGI: ["RAINBOW"],
  UNICORN: ["TEKBOYNUZ"],
  YAZI: ["TEXT", "TYPOGRAPHY", "TIPOGRAFI"],
  COFFEE: ["KAHVE", "CAFE"],
  KAHVE: ["COFFEE", "CAFE"],
};

const DESIGN_THEME_WORDS: Record<string, string[]> = {
  mickey: ["MICKEY", "MICKET", "MIKI", "MOUSE", "DISNEY"],
  minnie: ["MINNIE", "MINI"],
  "ayıcık": ["AYICIK", "AYI", "BEAR", "TEDDY"],
  kalp: ["KALP", "HEART", "LOVE"],
  "çiçek": ["CICEK", "FLOWER", "FLORAL"],
  kelebek: ["KELEBEK", "BUTTERFLY"],
  "tavşan": ["TAVSAN", "RABBIT", "BUNNY"],
  kedi: ["KEDI", "CAT", "KITTY"],
  "köpek": ["KOPEK", "DOG", "PUPPY"],
  dinozor: ["DINAZOR", "DINOSAUR", "DINO"],
  araba: ["ARABA", "CAR", "RACING", "RACE"],
  "yıldız": ["YILDIZ", "STAR"],
  "gökkuşağı": ["GOKKUSAGI", "RAINBOW"],
  unicorn: ["UNICORN", "TEKBOYNUZ"],
  "yazı": ["YAZI", "TEXT", "TYPOGRAPHY", "TIPOGRAFI"],
  "kahve": ["KAHVE", "COFFEE", "CAFE"],
  "uzay": ["UZAY", "SPACE", "PLANET", "ASTRONAUT"],
  "noel": ["NOEL", "CHRISTMAS", "XMAS", "SANTA"],
};

const PRINT_AREAS: Record<string, string> = {
  FRONT: "Ön",
  BACK: "Arka",
  NECK: "Ense",
  NECK_LABEL: "Ense Etiket",
  LEFT_SLEEVE: "Sol Kol",
  RIGHT_SLEEVE: "Sağ Kol",
  LEFT_LEG: "Sol Paça",
  RIGHT_LEG: "Sağ Paça",
  POCKET: "Cep",
  COLLAR: "Yaka",
  FRONT_HEM: "Ön Etek",
  BACK_HEM: "Arka Etek",
  HOOD: "Kapüşon",
  SIDE_PANEL: "Yan Panel",
  STRIP: "Şerit",
  OTHER: "Diğer",
};

const ROLE_FOLDERS: Record<string, string> = {
  MODEL_IMAGE: "model",
  CHANNEL_IMAGE: "kanal",
  PLACEMENT_IMAGE: "yerlesim",
  TECHNICAL_IMAGE: "teknik",
  OTHER: "arsiv",
};

const STATUS_LABELS: Record<string, string> = {
  NEW_ARRIVAL: "Yeni Geldi",
  MODEL_INFO_MISSING: "Model Bilgisi Eksik",
  CHANNEL_IMAGE_MISSING: "Kanal Görseli Eksik",
  CHANNEL_REVIEW_PENDING: "Kanal Kontrolü Bekliyor",
  COLOR_MATCH_MISSING: "Renk Eşleşmesi Eksik",
  PLACEMENT_WAITING: "Yerleşim Bekliyor",
  DYEHOUSE_READY: "Boyahaneye Hazır",
  PRODUCTION_READY: "Üretime Hazır",
  REVISION_PENDING: "Revize Bekliyor",
  PASSIVE: "Pasif",
  ARCHIVE: "Arşiv",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "evet", "yes", "on"].includes(clean(value).toLowerCase());
}

function normalizeSearch(value: unknown) {
  return clean(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSegment(value: unknown, fallback: string) {
  const safe = clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return safe || fallback;
}

function mimeFor(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

@Injectable()
export class DesenWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly legacyImportInFlight = new Map<string, Promise<any>>();
  private readonly modelAnalysisInFlight = new Map<string, Promise<any>>();
  private ocrWorkersPromise: Promise<any[]> | null = null;
  private readonly availableOcrWorkers: any[] = [];
  private readonly ocrWorkerWaiters: Array<(worker: any) => void> = [];

  private workflowDb(client: any = this.prisma) {
    return client as any;
  }

  private slug(payload: Record<string, any>) {
    return requireMainCompanySlug(payload || {});
  }

  private folders() {
    const root = path.join(getStorageRoot(), "desen");
    const result = {
      root,
      incoming: path.join(root, "gelen"),
      error: path.join(root, "islenemeyen"),
      models: path.join(root, "modeller"),
      archive: path.join(root, "arsiv"),
      staging: path.join(root, ".staging"),
    };
    Object.values(result).forEach((folder) => fs.mkdirSync(folder, { recursive: true }));
    return result;
  }

  private async log(
    data: {
      modelId?: string;
      operationId?: string;
      fileId?: string;
      userId?: string;
      action: string;
      oldValue?: any;
      newValue?: any;
      description?: string;
    },
    client: any = this.prisma,
  ) {
    return this.workflowDb(client).designActionLog.create({
      data: {
        modelId: data.modelId || null,
        operationId: data.operationId || null,
        fileId: data.fileId || null,
        userId: data.userId || null,
        action: data.action,
        oldValueJson: data.oldValue ?? undefined,
        newValueJson: data.newValue ?? undefined,
        description: data.description || null,
      },
    });
  }

  private hashFile(filePath: string) {
    const hash = createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  }

  private uniqueStrings(values: unknown[], limit = 40) {
    return Array.from(new Set(values.flatMap((value: any) => Array.isArray(value) ? value : [value])
      .map((value) => clean(value))
      .filter(Boolean))).slice(0, limit);
  }

  private searchTokenGroups(value: unknown) {
    return normalizeSearch(value).split(/\s+/).filter(Boolean).map((token) =>
      this.uniqueStrings([token, ...(DESIGN_SEARCH_EQUIVALENTS[token] || [])].map(normalizeSearch), 12),
    );
  }

  private extractPantoneCodes(value: unknown) {
    const source = clean(value).toLocaleUpperCase("tr-TR")
      .replace(/[–—_]/g, "-")
      .replace(/(?<=\d)[OQ](?=\d)/g, "0")
      .replace(/(?<=\d)[IL](?=\d)/g, "1");
    const found: string[] = [];
    const codeRegex = /(?:^|\D)(\d{2})\s*[- ]\s*(\d{4})(?:\s+([CU])\b)?(?=\D|$)/g;
    let match: RegExpExecArray | null = codeRegex.exec(source);
    while (match) {
      found.push(`${match[1]}-${match[2]}${match[3] ? ` ${match[3]}` : ""}`);
      match = codeRegex.exec(source);
    }
    const suffixRegex = /(?:^|\D)(\d{4})\s+([CU])\b/g;
    match = suffixRegex.exec(source);
    while (match) {
      found.push(`${match[1]} ${match[2]}`);
      match = suffixRegex.exec(source);
    }
    return this.uniqueStrings(found, 30);
  }

  private extractThemes(value: unknown) {
    const normalized = normalizeSearch(value);
    return Object.entries(DESIGN_THEME_WORDS)
      .filter(([, words]) => words.some((word) => normalized.includes(normalizeSearch(word))))
      .map(([theme]) => theme);
  }

  private extractWrittenText(value: unknown) {
    const ignored = new Set(["CM", "EN", "BOY", "BASKI", "PRINT", "PANTONE", "RENK", "COLOR", "ARTWORK", "DETAY", "DETAILS", "TEKNIK"]);
    return this.uniqueStrings(normalizeSearch(value).split(/\s+/)
      .filter((word) => word.length >= 3 && !ignored.has(word) && !/^\d+$/.test(word)), 35);
  }

  private colorName(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 55) return "siyah";
    if (min > 225) return "beyaz";
    if (max - min < 22) return max > 165 ? "gri açık" : "gri";
    if (r > g * 1.25 && r > b * 1.25) return r > 190 && g < 120 ? "kırmızı" : "bordo";
    if (r > 180 && g > 110 && b < 110) return "turuncu";
    if (r > 180 && g > 165 && b < 135) return "sarı";
    if (g > r * 1.15 && g > b * 1.12) return "yeşil";
    if (b > r * 1.18 && b > g * 1.08) return "mavi";
    if (r > 170 && b > 145 && g < 165) return "pembe";
    if (r > 110 && b > 110 && g < Math.min(r, b) * 0.9) return "mor";
    if (r > 120 && g > 80 && b < 80) return "kahverengi";
    return "çok renkli";
  }

  private async localImageAnalysis(filePath: string) {
    const sharp = require("sharp");
    const image = sharp(filePath).rotate();
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    const dominant = stats?.dominant || { r: 0, g: 0, b: 0 };
    const means = (stats?.channels || []).slice(0, 3).map((channel: any) => Math.round(Number(channel.mean || 0)));
    const dominantName = this.colorName(Number(dominant.r || 0), Number(dominant.g || 0), Number(dominant.b || 0));
    const meanName = means.length === 3 ? this.colorName(means[0], means[1], means[2]) : "";
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    return {
      width,
      height,
      orientation: width && height ? (width > height * 1.15 ? "yatay" : height > width * 1.15 ? "dikey" : "kare") : "",
      colors: this.uniqueStrings([dominantName, meanName], 6),
      dominantRgb: `rgb(${Number(dominant.r || 0)}, ${Number(dominant.g || 0)}, ${Number(dominant.b || 0)})`,
    };
  }

  private async getOcrWorkers() {
    if (!this.ocrWorkersPromise) {
      this.ocrWorkersPromise = import("tesseract.js").then(async (module: any) => {
        const createWorker = module?.createWorker || module?.default?.createWorker;
        if (typeof createWorker !== "function") throw new Error("OCR motoru bulunamadı.");
        const count = Math.max(1, Math.min(Number(process.env.KYERP_DESEN_OCR_WORKERS || 2), 3));
        const workers = await Promise.all(Array.from({ length: count }, async () => {
          try { return await createWorker(["tur", "eng"], undefined, { logger: () => undefined }); }
          catch { return createWorker("eng", undefined, { logger: () => undefined }); }
        }));
        this.availableOcrWorkers.push(...workers);
        return workers;
      });
    }
    return this.ocrWorkersPromise;
  }

  private async acquireOcrWorker() {
    await this.getOcrWorkers();
    const worker = this.availableOcrWorkers.pop();
    if (worker) return worker;
    return new Promise<any>((resolve) => this.ocrWorkerWaiters.push(resolve));
  }

  private releaseOcrWorker(worker: any) {
    const waiter = this.ocrWorkerWaiters.shift();
    if (waiter) waiter(worker);
    else this.availableOcrWorkers.push(worker);
  }

  private async recognizeDesign(filePath: string) {
    const sharp = require("sharp");
    const metadata = await sharp(filePath).rotate().metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const prepared = await sharp(filePath).rotate().resize({ width: 2400, height: 2400, fit: "inside" })
      .grayscale().normalize().sharpen().png().toBuffer();
    const worker = await this.acquireOcrWorker();
    try {
      await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      const generalResult = await worker.recognize(prepared);
      const texts = [generalResult?.data?.text || generalResult?.text || ""];
      if (width >= 80 && height >= 80) {
        const bottomTop = Math.max(0, Math.floor(height * 0.76));
        const bottom = await sharp(filePath).rotate().extract({ left: 0, top: bottomTop, width, height: height - bottomTop })
          .resize({ width: 3200 }).grayscale().normalize().sharpen().png().toBuffer();
        await worker.setParameters({ tessedit_char_whitelist: "0123456789-PANTONEZEMINCU ", tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
        const numericResult = await worker.recognize(bottom);
        texts.push(numericResult?.data?.text || numericResult?.text || "");

        const centerLeft = Math.floor(width * 0.12);
        const centerTop = Math.floor(height * 0.16);
        const centerWidth = Math.max(20, width - centerLeft * 2);
        const centerHeight = Math.max(20, Math.floor(height * 0.64));
        const center = await sharp(filePath).rotate().extract({ left: centerLeft, top: centerTop, width: centerWidth, height: Math.min(centerHeight, height - centerTop) })
          .resize({ width: 2400 }).grayscale().normalize().threshold(235).png().toBuffer();
        await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
        const centerResult = await worker.recognize(center);
        texts.push(centerResult?.data?.text || centerResult?.text || "");
      }
      return clean(texts.join(" ")).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
    } finally {
      this.releaseOcrWorker(worker);
    }
  }

  private safeJsonObject(value: unknown) {
    const source = clean(value).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(source); } catch {
      const match = source.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try { return JSON.parse(match[0]); } catch { return null; }
    }
  }

  private async visionAnalysis(filePath: string, ocrText: string) {
    const apiKey = clean(process.env.OPENAI_API_KEY);
    if (!apiKey) return { status: "DISABLED_NO_KEY", data: null };
    const sharp = require("sharp");
    const buffer = await sharp(filePath).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: clean(process.env.KYERP_DESEN_VISION_MODEL) || "gpt-4.1-mini",
        input: [{ role: "user", content: [
          { type: "input_text", text: `Bu tekstil desenini arama indeksine dönüştür. Görünen tüm yazıları, Pantone kodlarını, karakterleri, nesneleri, şekilleri, temaları, renkleri ve stili çıkar. Emin olmadığın özel karakter adını yazma. Türkçe anahtar kelimeler üret. OCR ön okuması: ${ocrText.slice(0, 4000)}. Yalnız JSON döndür: {"themes":[],"characters":[],"objects":[],"shapes":[],"colors":[],"style":[],"writtenText":[],"pantoneCodes":[],"keywords":[],"summary":""}` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${buffer.toString("base64")}` },
        ] }],
        temperature: 0,
      }),
    });
    if (!response.ok) throw new Error(`Görsel analiz HTTP ${response.status}`);
    const body: any = await response.json();
    const outputText = clean(body?.output_text || body?.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join(" ") || "");
    const data = this.safeJsonObject(outputText);
    if (!data) throw new Error("Görsel analiz JSON sonucu okunamadı.");
    return { status: "COMPLETED", data };
  }

  private resolveAnalysisFilePath(file: any) {
    const candidate = file?.storagePath && !path.isAbsolute(file.storagePath)
      ? path.join(getStorageRoot(), file.storagePath)
      : clean(file?.filePath || file?.previewPath);
    return candidate && fs.existsSync(candidate) ? candidate : "";
  }

  private async runModelAnalysis(modelId: string, body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const model = await this.workflowDb().designWorkflowModel.findFirst({ where: { id: modelId, mainCompanySlug } });
    if (!model) throw new NotFoundException("Desen modeli bulunamadı.");
    const files = await this.workflowDb().designFile.findMany({ where: { modelId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    const file = files.find((row: any) => row.id === model.mainImageFileId) || files.find((row: any) => row.fileRole === "MODEL_IMAGE");
    const filePath = this.resolveAnalysisFilePath(file);
    if (!file || !filePath || !IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      throw new BadRequestException("Analiz edilebilecek model görseli bulunamadı.");
    }
    const previousMetadata: any = model.metadata && typeof model.metadata === "object" ? model.metadata : {};
    const previousAnalysis: any = previousMetadata.analysis || {};
    const fileHash = clean(file.fileHash) || this.hashFile(filePath);
    if (!bool(body.force) && previousAnalysis.version === "2" && previousAnalysis.fileHash === fileHash) {
      return { skipped: true, model: await this.getModel(modelId, { mainCompanySlug }) };
    }

    const analyzedAt = new Date().toISOString();
    let ocrText = "";
    let ocrStatus = "COMPLETED";
    let ocrError = "";
    try { ocrText = await this.recognizeDesign(filePath); } catch (error: any) {
      ocrStatus = "ERROR";
      ocrError = clean(error?.message || "OCR başarısız");
    }
    const local = await this.localImageAnalysis(filePath);
    let vision: any = { status: "SKIPPED", data: null };
    if (body.useVision !== false && clean(body.useVision) !== "false") {
      try { vision = await this.visionAnalysis(filePath, ocrText); } catch (error: any) {
        vision = { status: "ERROR", data: null, error: clean(error?.message || "Görsel analiz başarısız") };
      }
    }
    const sourceText = [model.modelName, model.modelCode, model.designName, model.groundColor, file.originalFileName, file.fileName, ocrText, JSON.stringify(vision.data || {})].join(" ");
    const pantoneCodes = this.uniqueStrings([this.extractPantoneCodes(sourceText), vision.data?.pantoneCodes], 30);
    const themes = this.uniqueStrings([this.extractThemes(sourceText), vision.data?.themes], 30);
    const characters = this.uniqueStrings([vision.data?.characters, themes.filter((item) => ["mickey", "minnie", "ayıcık", "tavşan", "kedi", "köpek", "dinozor", "unicorn"].includes(item))], 30);
    const objects = this.uniqueStrings([vision.data?.objects], 30);
    const shapes = this.uniqueStrings([vision.data?.shapes, themes.filter((item) => ["kalp", "çiçek", "kelebek", "yıldız", "gökkuşağı"].includes(item))], 30);
    const colors = this.uniqueStrings([local.colors, vision.data?.colors, previousMetadata.renkler], 20);
    const writtenText = this.uniqueStrings([vision.data?.writtenText, this.extractWrittenText(ocrText)], 40);
    const style = this.uniqueStrings([vision.data?.style], 20);
    const keywords = this.uniqueStrings([vision.data?.keywords, themes, characters, objects, shapes, colors, writtenText, pantoneCodes], 80);
    const summary = clean(vision.data?.summary) || [themes.join(", "), shapes.join(", "), colors.join(", ")].filter(Boolean).join("; ") || "Görsel OCR ile indekslendi.";
    const analysis = {
      version: "2", analyzedAt, fileId: file.id, fileHash, ocrStatus, ocrError, ocrText,
      pantoneCodes, themes, characters, objects, shapes, colors, writtenText, style, keywords, summary,
      width: local.width, height: local.height, orientation: local.orientation, dominantRgb: local.dominantRgb,
      visionStatus: vision.status, visionError: clean(vision.error),
    };
    const searchText = clean([model.modelName, model.modelCode, model.designName, model.groundColor, file.originalFileName, ocrText, pantoneCodes, themes, characters, objects, shapes, colors, writtenText, style, keywords, summary].flat().join(" ")).slice(0, 16000);
    const metadata = {
      ...previousMetadata,
      analysis,
      ocrText,
      pantoneCodes,
      searchKeywords: keywords,
      searchText,
      temaFigur: this.uniqueStrings([previousMetadata.temaFigur, themes, characters, objects, shapes], 40).join(", "),
      yazilar: writtenText.join(", "),
      renkler: colors.join(", "),
      aciklama: summary,
    };
    await this.workflowDb().designWorkflowModel.update({ where: { id: modelId }, data: { metadata, updatedAt: new Date() } });
    await this.log({ modelId, fileId: file.id, userId: clean(body.userId), action: "MODEL_ANALYZED", newValue: { analyzedAt, pantoneCodes, themes, visionStatus: vision.status }, description: "Desen OCR ve görsel özellikleri arama indeksine yazıldı." });
    return { skipped: false, analysis, model: await this.getModel(modelId, { mainCompanySlug }) };
  }

  async analyzeModel(modelId: string, body: Record<string, any>) {
    const key = `${this.slug(body)}:${modelId}`;
    const running = this.modelAnalysisInFlight.get(key);
    if (running) return running;
    const task = this.runModelAnalysis(modelId, body);
    this.modelAnalysisInFlight.set(key, task);
    try { return await task; } finally { this.modelAnalysisInFlight.delete(key); }
  }

  async analyzeModels(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const ids = Array.isArray(body.ids) ? body.ids.map(clean).filter(Boolean) : [];
    const limit = bool(body.applyAll) ? 1000 : Math.max(1, Math.min(Number(body.limit || 25), 100));
    const models = await this.workflowDb().designWorkflowModel.findMany({
      where: { mainCompanySlug, isActive: true, ...(ids.length ? { id: { in: ids } } : {}) },
      orderBy: { updatedAt: "asc" }, take: ids.length ? Math.min(ids.length, 1000) : limit,
    });
    const results: any[] = [];
    const concurrency = Math.max(1, Math.min(Number(process.env.KYERP_DESEN_OCR_WORKERS || 2), 3));
    for (let index = 0; index < models.length; index += concurrency) {
      const batch = await Promise.all(models.slice(index, index + concurrency).map(async (model: any) => {
        try {
          const result = await this.analyzeModel(model.id, { ...body, mainCompanySlug });
          return { id: model.id, modelName: model.modelName, ok: true, skipped: result.skipped, pantoneCodes: result.analysis?.pantoneCodes || [] };
        } catch (error: any) {
          return { id: model.id, modelName: model.modelName, ok: false, error: clean(error?.message || error) };
        }
      }));
      results.push(...batch);
    }
    return { total: models.length, analyzed: results.filter((row) => row.ok && !row.skipped).length, skipped: results.filter((row) => row.skipped).length, errors: results.filter((row) => !row.ok).length, results };
  }

  async analysisStatus(query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    const rows = await this.workflowDb().designWorkflowModel.findMany({ where: { mainCompanySlug, isActive: true }, select: { metadata: true } });
    const analyzed = rows.filter((row: any) => (row.metadata as any)?.analysis?.version === "2").length;
    return { total: rows.length, analyzed, pending: rows.length - analyzed, localOcrReady: true, visionConfigured: Boolean(clean(process.env.OPENAI_API_KEY)), visionModel: clean(process.env.KYERP_DESEN_VISION_MODEL) || "gpt-4.1-mini" };
  }

  private legacyStoragePath(value: unknown) {
    const raw = clean(value);
    if (!raw) return "";
    if (path.isAbsolute(raw)) return raw;
    const withoutPrefix = raw
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/storage\//i, "")
      .replace(/^storage\//i, "");
    try {
      return path.join(getStorageRoot(), ...decodeURIComponent(withoutPrefix).split("/").filter(Boolean));
    } catch {
      return path.join(getStorageRoot(), ...withoutPrefix.split("/").filter(Boolean));
    }
  }

  private publicStorageUrl(filePath: unknown) {
    const absolute = clean(filePath);
    if (!absolute) return "";
    const relative = path.relative(getStorageRoot(), path.resolve(absolute));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
    return `/storage/${relative.split(path.sep).map((segment) => encodeURIComponent(segment)).join("/")}`;
  }

  private legacyPrintArea(value: unknown) {
    const normalized = normalizeSearch(value);
    const candidates: Array<[string, string[]]> = [
      ["BACK", ["ARKA", "BACK"]],
      ["NECK_LABEL", ["ENSE ETIKET", "YAKA ETIKET"]],
      ["NECK", ["ENSE", "NECK"]],
      ["LEFT_SLEEVE", ["SOL KOL"]],
      ["RIGHT_SLEEVE", ["SAG KOL"]],
      ["LEFT_LEG", ["SOL PACA"]],
      ["RIGHT_LEG", ["SAG PACA"]],
      ["POCKET", ["CEP", "POCKET"]],
      ["COLLAR", ["YAKA", "COLLAR"]],
      ["HOOD", ["KAPUSON", "HOOD"]],
      ["FRONT", ["ON BASKI", "ON", "FRONT"]],
    ];
    return candidates.find(([, markers]) => markers.some((marker) => normalized.includes(marker)))?.[0] || "FRONT";
  }

  private collectIncomingFiles(root: string) {
    const output: string[] = [];
    const walk = (folder: string) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile()) output.push(fullPath);
      }
    };
    walk(root);
    return output;
  }

  private suggestRole(fileName: string) {
    const normalized = normalizeSearch(path.parse(fileName).name);
    if (PLACEMENT_MARKERS.some((marker) => normalized.includes(normalizeSearch(marker)))) {
      return "PLACEMENT_IMAGE";
    }
    if (CHANNEL_MARKERS.some((marker) => normalized.includes(normalizeSearch(marker)))) {
      return "CHANNEL_IMAGE";
    }
    return "MODEL_IMAGE";
  }

  private suggestModelName(fileName: string) {
    let value = normalizeSearch(path.parse(fileName).name);
    for (const marker of [...CHANNEL_MARKERS, ...PLACEMENT_MARKERS]) {
      value = value.replace(new RegExp(`\\b${normalizeSearch(marker).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "g"), " ");
    }
    return value.replace(/\s+/g, " ").replace(/[-_ ]+$/g, "").trim() || path.parse(fileName).name;
  }

  private inferChannel(rawValue: unknown, index: number) {
    const rawName = clean(rawValue).replace(/^\s*\d+[.)\-:\s]+/, "").trim();
    const normalizedName = normalizeSearch(rawName);
    const pantone = normalizedName.match(/\b\d{2}-\d{4}\b/)?.[0] || null;
    let channelType = "OTHER";
    if (/SEFFAF/.test(normalizedName)) channelType = "TRANSPARENT";
    else if (/BEYAZ FON|WHITE BASE|UNDERBASE/.test(normalizedName)) channelType = "WHITE_BASE";
    else if (/\bBEYAZ\b|\bWHITE\b/.test(normalizedName)) channelType = "WHITE";
    else if (/\bSIYAH\b|\bBLACK\b/.test(normalizedName)) channelType = "BLACK";
    else if (pantone) channelType = "PANTONE";
    else if (/\bSIM\b|GLITTER/.test(normalizedName)) channelType = "GLITTER";
    else if (/KABARAN|PUFF/.test(normalizedName)) channelType = "PUFF";
    else if (rawName) channelType = "STANDARD_COLOR";
    const colorCode = pantone || (channelType === "WHITE" || channelType === "WHITE_BASE" ? "WHITE" : channelType === "BLACK" ? "BLACK" : null);
    const groupKey = colorCode || (channelType === "TRANSPARENT" ? "TRANSPARENT" : normalizeSearch(rawName).replace(/\s+/g, "_") || `KANAL_${index + 1}`);
    return {
      sequence: index + 1,
      rawName: rawName || `Kanal ${index + 1}`,
      normalizedName: normalizedName || `KANAL ${index + 1}`,
      channelType,
      colorCode,
      groupKey,
      included: true,
      status: "PENDING",
    };
  }

  parseChannels(body: Record<string, any>) {
    const source = clean(body.text || body.value);
    const rough = source.includes("\n")
      ? source.split(/\r?\n/)
      : source.split(/[;,\t]+/);
    return rough.map((item) => item.trim()).filter(Boolean).map((item, index) => this.inferChannel(item, index));
  }

  async scanInbox(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const { incoming } = this.folders();
    const filePaths = this.collectIncomingFiles(incoming);
    const firstStats = new Map<string, { size: number; modified: number }>();
    for (const filePath of filePaths) {
      const stat = fs.statSync(filePath);
      firstStats.set(filePath, { size: stat.size, modified: stat.mtimeMs });
    }
    if (filePaths.length) await new Promise((resolve) => setTimeout(resolve, 2000));

    const processedHashes = new Set<string>(
      (await this.workflowDb().designFile.findMany({
        where: { mainCompanySlug, fileHash: { not: null } },
        select: { fileHash: true },
      })).map((row: any) => row.fileHash).filter(Boolean),
    );

    const items: any[] = [];
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const extension = path.extname(fileName).toLowerCase();
      const first = firstStats.get(filePath)!;
      let current: fs.Stats;
      try {
        current = fs.statSync(filePath);
        const descriptor = fs.openSync(filePath, "r");
        fs.closeSync(descriptor);
      } catch (error: any) {
        current = fs.statSync(filePath);
      }
      const stable = first.size === current.size && first.modified === current.mtimeMs;
      const supported = SUPPORTED_EXTENSIONS.has(extension);
      const fileHash = stable && supported ? this.hashFile(filePath) : null;
      const duplicate = Boolean(fileHash && processedHashes.has(fileHash));
      const status = !supported ? "UNSUPPORTED" : !stable ? "UPLOADING" : duplicate ? "DUPLICATE" : "READY";
      const suggestedModelName = this.suggestModelName(fileName);
      const suggestedRole = supported ? this.suggestRole(fileName) : "OTHER";
      const groupKey = normalizeSearch(suggestedModelName).replace(/\s+/g, "-");
      const queue = await this.workflowDb().designImportQueue.upsert({
        where: { mainCompanySlug_originalPath: { mainCompanySlug, originalPath: path.resolve(filePath) } },
        update: {
          fileName,
          fileHash,
          fileSize: Math.min(current.size, 2147483647),
          modifiedAt: current.mtime,
          mimeType: supported ? mimeFor(fileName) : "application/octet-stream",
          suggestedModelName,
          suggestedRole,
          groupKey,
          status,
          errorMessage: !supported ? (extension === ".psd" ? "PSD yerine model veya kanal görseli yükleyin." : "Desteklenmeyen dosya türü.") : null,
          metadata: { extension, imagePreview: IMAGE_EXTENSIONS.has(extension) },
        },
        create: {
          mainCompanySlug,
          originalPath: path.resolve(filePath),
          fileName,
          fileHash,
          fileSize: Math.min(current.size, 2147483647),
          modifiedAt: current.mtime,
          mimeType: supported ? mimeFor(fileName) : "application/octet-stream",
          suggestedModelName,
          suggestedRole,
          groupKey,
          status,
          errorMessage: !supported ? (extension === ".psd" ? "PSD yerine model veya kanal görseli yükleyin." : "Desteklenmeyen dosya türü.") : null,
          metadata: { extension, imagePreview: IMAGE_EXTENSIONS.has(extension) },
        },
      });
      items.push(queue);
    }
    await this.log({ action: "INBOX_SCANNED", description: `Gelen klasör tarandı: ${items.length} dosya`, newValue: { count: items.length } });
    return this.buildInboxResult(mainCompanySlug, items);
  }

  private buildInboxResult(mainCompanySlug: string, rows: any[]) {
    const active = rows.filter((row) => !["PROCESSED", "IGNORED"].includes(row.status));
    const groups = new Map<string, any>();
    for (const row of active) {
      const key = row.groupKey || row.id;
      const group = groups.get(key) || {
        id: key,
        modelName: row.suggestedModelName || row.fileName,
        files: [],
        hasModelImage: false,
        hasChannelImage: false,
        hasPlacementImage: false,
        status: "READY",
      };
      group.files.push({ ...row, previewUrl: this.publicStorageUrl(row.originalPath) || `/desen/workflow/inbox/${row.id}/preview?mainCompanySlug=${encodeURIComponent(mainCompanySlug)}` });
      if (row.suggestedRole === "MODEL_IMAGE") group.hasModelImage = true;
      if (row.suggestedRole === "CHANNEL_IMAGE") group.hasChannelImage = true;
      if (row.suggestedRole === "PLACEMENT_IMAGE") group.hasPlacementImage = true;
      if (row.status !== "READY") group.status = row.status;
      groups.set(key, group);
    }
    const groupRows = [...groups.values()].map((group) => ({
      ...group,
      fileCount: group.files.length,
      status: group.status === "READY" && !group.hasModelImage ? "MODEL_IMAGE_MISSING" : group.status === "READY" && !group.hasChannelImage ? "CHANNEL_IMAGE_MISSING" : group.status,
    }));
    return {
      folderPath: this.folders().incoming,
      lastScanAt: new Date().toISOString(),
      items: active,
      groups: groupRows,
      summary: {
        readyFiles: active.filter((row) => row.status === "READY").length,
        suggestedGroups: groupRows.length,
        missingModelImage: groupRows.filter((row) => !row.hasModelImage).length,
        missingChannelImage: groupRows.filter((row) => !row.hasChannelImage).length,
        duplicates: active.filter((row) => row.status === "DUPLICATE").length,
        errors: active.filter((row) => ["ERROR", "UNSUPPORTED"].includes(row.status)).length,
      },
    };
  }

  async listInbox(query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    this.folders();
    const items = await this.workflowDb().designImportQueue.findMany({
      where: { mainCompanySlug },
      orderBy: [{ updatedAt: "desc" }, { fileName: "asc" }],
      take: 1000,
    });
    return this.buildInboxResult(mainCompanySlug, items);
  }

  async resolveInboxFile(id: string, query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    const item = await this.workflowDb().designImportQueue.findFirst({ where: { id, mainCompanySlug } });
    if (!item || !fs.existsSync(item.originalPath)) throw new NotFoundException("Gelen dosya bulunamadı.");
    return item.originalPath;
  }

  async ignoreInbox(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const ids = Array.isArray(body.ids) ? body.ids.map(clean).filter(Boolean) : [clean(body.id)].filter(Boolean);
    await this.workflowDb().designImportQueue.updateMany({ where: { id: { in: ids }, mainCompanySlug }, data: { status: "IGNORED", processedAt: new Date() } });
    return { updated: ids.length };
  }

  async moveInboxToError(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const ids = Array.isArray(body.ids) ? body.ids.map(clean).filter(Boolean) : [clean(body.id)].filter(Boolean);
    const rows = await this.workflowDb().designImportQueue.findMany({ where: { id: { in: ids }, mainCompanySlug } });
    const { error } = this.folders();
    for (const row of rows) {
      if (!fs.existsSync(row.originalPath)) continue;
      const desired = path.join(error, safeSegment(row.fileName, `${row.id}.bin`));
      const target = this.uniquePath(desired);
      fs.renameSync(row.originalPath, target);
      await this.workflowDb().designImportQueue.update({ where: { id: row.id }, data: { originalPath: target, status: "ERROR", errorMessage: clean(body.reason) || "Kullanıcı tarafından işlenemeyen klasörüne taşındı." } });
    }
    return { moved: rows.length, folderPath: error };
  }

  private uniquePath(desired: string) {
    if (!fs.existsSync(desired)) return desired;
    const parsed = path.parse(desired);
    let index = 2;
    let candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    while (fs.existsSync(candidate)) {
      index += 1;
      candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    }
    return candidate;
  }

  private operationInput(value: Record<string, any>, sequence: number) {
    const code = clean(value.printAreaCode || value.code || "FRONT").toUpperCase();
    return {
      printAreaCode: PRINT_AREAS[code] ? code : "OTHER",
      printAreaName: clean(value.printAreaName || value.name) || PRINT_AREAS[code] || "Diğer",
      sequence,
      moldType: clean(value.moldType) || null,
      moldWidth: value.moldWidth === "" || value.moldWidth == null ? null : Number(value.moldWidth),
      moldHeight: value.moldHeight === "" || value.moldHeight == null ? null : Number(value.moldHeight),
      placementStatus: clean(value.placementStatus) || "WAITING",
      dyehouseStatus: clean(value.dyehouseStatus) || "WAITING",
      productionReady: bool(value.productionReady),
      notes: clean(value.notes) || null,
      metadata: value.metadata || undefined,
    };
  }

  private async createChannels(client: any, operationId: string, channelRows: any[]) {
    const groups = new Map<string, any>();
    const prepared = channelRows.map((row, index) => {
      const inferred = this.inferChannel(row.rawName || row.name || row.normalizedName, index);
      return { ...inferred, ...row, sequence: Number(row.sequence || index + 1), groupKey: clean(row.groupKey || row.colorGroupKey || inferred.groupKey) };
    });
    for (const row of prepared) {
      const groupKey = row.groupKey;
      if (!groupKey) continue;
      let group = groups.get(groupKey);
      if (!group) {
        group = await client.designColorGroup.upsert({
          where: { operationId_groupKey: { operationId, groupKey } },
          update: { displayName: clean(row.groupName || row.colorCode || row.normalizedName || groupKey), colorCode: clean(row.colorCode) || null },
          create: { operationId, groupKey, displayName: clean(row.groupName || row.colorCode || row.normalizedName || groupKey), colorCode: clean(row.colorCode) || null },
        });
        groups.set(groupKey, group);
      }
      row.colorGroupId = group.id;
    }
    for (const row of prepared) {
      await client.designOperationChannel.create({
        data: {
          operationId,
          sequence: row.sequence,
          rawName: clean(row.rawName || row.name) || `Kanal ${row.sequence}`,
          normalizedName: clean(row.normalizedName) || normalizeSearch(row.rawName || row.name),
          channelType: clean(row.channelType) || "OTHER",
          colorCode: clean(row.colorCode) || null,
          colorGroupId: row.colorGroupId || null,
          registeredColorId: clean(row.registeredColorId) || null,
          included: bool(row.included, true),
          status: clean(row.status) || "PENDING",
          notes: clean(row.notes) || null,
        },
      });
    }
    await this.refreshGroupCounts(operationId, client);
  }

  async processInbox(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const queueIds = Array.isArray(body.queueIds) ? body.queueIds.map(clean).filter(Boolean) : [];
    if (!queueIds.length) throw new BadRequestException("En az bir gelen dosya seçilmelidir.");
    const modelName = clean(body.modelName);
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");
    const items = await this.workflowDb().designImportQueue.findMany({ where: { id: { in: queueIds }, mainCompanySlug } });
    if (items.length !== queueIds.length) throw new BadRequestException("Seçilen dosyalardan bazıları bulunamadı.");
    const unavailable = items.find((row: any) => !["READY", "DUPLICATE"].includes(row.status) || !fs.existsSync(row.originalPath));
    if (unavailable) throw new BadRequestException(`${unavailable.fileName} işlem için hazır değil.`);

    const operationsInput = Array.isArray(body.operations) && body.operations.length ? body.operations : [{ printAreaCode: "FRONT", printAreaName: "Ön", channels: body.channels || [] }];
    const company = body.companyId ? await this.workflowDb().company.findFirst({ where: { id: clean(body.companyId), mainCompanySlug, deletedAt: null } }) : null;
    const companyFolder = safeSegment(body.companyName || company?.name || "FIRMA-YOK", "FIRMA-YOK");
    const modelFolder = safeSegment(modelName, "MODEL");
    const { models, staging } = this.folders();
    const stageRoot = path.join(staging, randomUUID());
    fs.mkdirSync(stageRoot, { recursive: true });
    const roleOverrides = new Map<string, any>((Array.isArray(body.files) ? body.files : []).map((row: any) => [clean(row.queueId || row.id), row]));
    const preparedFiles: any[] = [];
    const finalPaths: string[] = [];
    try {
      for (const item of items) {
        const override = roleOverrides.get(item.id) || {};
        const role = clean(override.role || item.suggestedRole) || "OTHER";
        const folder = ROLE_FOLDERS[role] || "arsiv";
        const targetDir = path.join(models, companyFolder, modelFolder, folder);
        fs.mkdirSync(targetDir, { recursive: true });
        const storedFileName = safeSegment(item.fileName, `${item.id}${path.extname(item.fileName)}`);
        const stagePath = path.join(stageRoot, `${item.id}${path.extname(storedFileName)}`);
        fs.copyFileSync(item.originalPath, stagePath);
        const copiedHash = this.hashFile(stagePath);
        if (item.fileHash && copiedHash !== item.fileHash) throw new BadRequestException(`${item.fileName} kopya doğrulaması başarısız.`);
        const finalPath = this.uniquePath(path.join(targetDir, storedFileName));
        preparedFiles.push({ item, override, role, stagePath, finalPath, copiedHash });
      }

      const model = await this.workflowDb().$transaction(async (tx: any) => {
        const db = this.workflowDb(tx);
        const createdModel = await db.designWorkflowModel.create({
          data: {
            mainCompanySlug,
            companyId: clean(body.companyId) || null,
            modelCode: clean(body.modelCode) || modelName,
            modelName,
            designName: clean(body.designName) || null,
            groundColor: clean(body.groundColor) || null,
            sourceType: "FOLDER_SCAN",
            status: clean(body.status) || "CHANNEL_REVIEW_PENDING",
            notes: clean(body.notes) || null,
            metadata: { importGroup: clean(body.groupKey), companyName: company?.name || clean(body.companyName) || null },
          },
        });
        const operationMap = new Map<string, any>();
        for (let index = 0; index < operationsInput.length; index += 1) {
          const input = operationsInput[index] || {};
          const createdOperation = await db.designModelOperation.create({ data: { modelId: createdModel.id, ...this.operationInput(input, index + 1) } });
          operationMap.set(createdOperation.printAreaCode, createdOperation);
          if (Array.isArray(input.channels) && input.channels.length) await this.createChannels(db, createdOperation.id, input.channels);
          await this.log({ modelId: createdModel.id, operationId: createdOperation.id, action: "PRINT_AREA_ADDED", newValue: createdOperation, description: `${createdOperation.printAreaName} baskı bölgesi eklendi.` }, db);
        }
        let mainImageFileId: string | null = null;
        for (const prepared of preparedFiles) {
          fs.renameSync(prepared.stagePath, prepared.finalPath);
          finalPaths.push(prepared.finalPath);
          const operation = operationMap.get(clean(prepared.override.printAreaCode).toUpperCase()) || operationMap.values().next().value;
          const file = await db.designFile.create({
            data: {
              mainCompanySlug,
              filePath: prepared.finalPath,
              fileName: path.basename(prepared.finalPath),
              mimeType: mimeFor(prepared.item.fileName),
              modelId: createdModel.id,
              operationId: prepared.role === "MODEL_IMAGE" ? null : operation?.id || null,
              fileRole: prepared.role,
              originalFileName: prepared.item.fileName,
              storedFileName: path.basename(prepared.finalPath),
              storagePath: path.relative(getStorageRoot(), prepared.finalPath).replace(/\\/g, "/"),
              fileHash: prepared.copiedHash,
              fileSize: prepared.item.fileSize,
              sourceType: "FOLDER_SCAN",
              previewPath: prepared.finalPath,
              status: "ACTIVE",
              raw: { queueId: prepared.item.id, originalPath: prepared.item.originalPath },
            },
          });
          if (prepared.role === "MODEL_IMAGE" && !mainImageFileId) mainImageFileId = file.id;
          if (operation && prepared.role === "CHANNEL_IMAGE") await db.designModelOperation.update({ where: { id: operation.id }, data: { channelImageFileId: file.id } });
          if (operation && prepared.role === "PLACEMENT_IMAGE") await db.designModelOperation.update({ where: { id: operation.id }, data: { placementFileId: file.id, placementStatus: "READY" } });
          await db.designImportQueue.update({ where: { id: prepared.item.id }, data: { status: "PROCESSED", processedAt: new Date() } });
          await this.log({ modelId: createdModel.id, operationId: operation?.id, fileId: file.id, action: "FILE_MOVED", newValue: { role: prepared.role, storagePath: file.storagePath }, description: `${prepared.item.fileName} model klasörüne taşındı.` }, db);
        }
        if (mainImageFileId) await db.designWorkflowModel.update({ where: { id: createdModel.id }, data: { mainImageFileId } });
        await this.log({ modelId: createdModel.id, action: "MODEL_CREATED", newValue: createdModel, description: "Model gelen klasörden oluşturuldu." }, db);
        return createdModel;
      }, { timeout: 30000 });
      for (const item of items) {
        try { if (fs.existsSync(item.originalPath)) fs.unlinkSync(item.originalPath); } catch { /* Kaynak kopya kalırsa hash kontrolü mükerreri engeller. */ }
      }
      fs.rmSync(stageRoot, { recursive: true, force: true });
      if (bool(body.skipAnalysis)) return this.getModel(model.id, { mainCompanySlug });
      try {
        const analyzed = await this.analyzeModel(model.id, { mainCompanySlug, useVision: true });
        return analyzed.model;
      } catch (error: any) {
        await this.log({ modelId: model.id, action: "MODEL_ANALYSIS_FAILED", description: clean(error?.message || "Otomatik desen analizi başarısız oldu.") });
        return this.getModel(model.id, { mainCompanySlug });
      }
    } catch (error) {
      fs.rmSync(stageRoot, { recursive: true, force: true });
      for (const finalPath of finalPaths) {
        try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch { /* Güvenli temizlik en iyi çaba ile yapılır. */ }
      }
      throw error;
    }
  }

  async processInboxBulk(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const groups = Array.isArray(body.groups) ? body.groups.slice(0, 500) : [];
    if (!groups.length) throw new BadRequestException("Toplu kayıt için en az bir desen grubu seçilmelidir.");
    if (!clean(body.companyId)) throw new BadRequestException("Toplu kayıt için firma seçilmelidir.");
    const results: any[] = [];
    const errors: any[] = [];
    for (const group of groups) {
      try {
        const model = await this.processInbox({
          ...group,
          mainCompanySlug,
          mainCompanyId: body.mainCompanyId,
          companyId: body.companyId,
          companyName: body.companyName,
          skipAnalysis: true,
        });
        results.push({ id: model.id, modelName: model.modelName });
      } catch (error: any) {
        errors.push({ modelName: clean(group?.modelName) || "Adsız desen", message: clean(error?.message || "Kayıt başarısız") });
      }
    }
    return { saved: results.length, failed: errors.length, results, errors };
  }

  private async refreshGroupCounts(operationId: string, client: any = this.prisma) {
    const db = this.workflowDb(client);
    const channels = await db.designOperationChannel.findMany({ where: { operationId, included: true } });
    const counts = new Map<string, number>();
    channels.forEach((channel: any) => {
      if (channel.colorGroupId) counts.set(channel.colorGroupId, (counts.get(channel.colorGroupId) || 0) + 1);
    });
    const groups = await db.designColorGroup.findMany({ where: { operationId } });
    for (const group of groups) await db.designColorGroup.update({ where: { id: group.id }, data: { moldCount: counts.get(group.id) || 0 } });
  }

  async calculateTotals(operationId: string, client: any = this.prisma) {
    const db = this.workflowDb(client);
    const channels = await db.designOperationChannel.findMany({ where: { operationId, included: true }, orderBy: { sequence: "asc" } });
    const groupIds = [...new Set(channels.map((row: any) => row.colorGroupId).filter(Boolean))] as string[];
    const groups = groupIds.length ? await db.designColorGroup.findMany({ where: { id: { in: groupIds } } }) : [];
    const groupMap = new Map<string, any>(groups.map((row: any) => [row.id, row]));
    const counts = new Map<string, number>();
    channels.forEach((row: any) => { if (row.colorGroupId) counts.set(row.colorGroupId, (counts.get(row.colorGroupId) || 0) + 1); });
    const unresolvedWithoutGroup = channels.filter((row: any) => !row.colorGroupId).length;
    const unresolvedGroups = groups.filter((row: any) => !row.registeredColorId).length;
    return {
      activeChannelCount: channels.length,
      totalMoldCount: channels.length,
      uniqueColorCount: groupIds.length,
      transparentChannelCount: channels.filter((row: any) => row.channelType === "TRANSPARENT").length,
      registeredColorCount: groups.filter((row: any) => row.registeredColorId).length,
      unresolvedColorCount: unresolvedWithoutGroup + unresolvedGroups,
      repeatedColorGroups: [...counts.entries()].filter(([, count]) => count > 1).map(([colorGroupId, moldCount]) => ({ colorGroupId, displayName: groupMap.get(colorGroupId)?.displayName || colorGroupId, moldCount })),
    };
  }

  private async decorateModels(models: any[]) {
    if (!models.length) return [];
    const modelIds = models.map((row) => row.id);
    const operations = await this.workflowDb().designModelOperation.findMany({ where: { modelId: { in: modelIds } }, orderBy: [{ modelId: "asc" }, { sequence: "asc" }] });
    const operationIds = operations.map((row: any) => row.id);
    const [channels, groups, files, logs, companies] = await Promise.all([
      operationIds.length ? this.workflowDb().designOperationChannel.findMany({ where: { operationId: { in: operationIds } }, orderBy: { sequence: "asc" } }) : [],
      operationIds.length ? this.workflowDb().designColorGroup.findMany({ where: { operationId: { in: operationIds } } }) : [],
      this.workflowDb().designFile.findMany({ where: { modelId: { in: modelIds }, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
      this.workflowDb().designActionLog.findMany({ where: { modelId: { in: modelIds } }, orderBy: { createdAt: "desc" }, take: 500 }),
      this.workflowDb().company.findMany({ where: { id: { in: models.map((row) => row.companyId).filter(Boolean) } }, select: { id: true, name: true } }),
    ]);
    const companyMap = new Map(companies.map((row: any) => [row.id, row.name]));
    return Promise.all(models.map(async (model) => {
      const modelOperations = operations.filter((row: any) => row.modelId === model.id);
      const decoratedOperations = await Promise.all(modelOperations.map(async (operation: any) => ({
        ...operation,
        channels: channels.filter((row: any) => row.operationId === operation.id),
        colorGroups: groups.filter((row: any) => row.operationId === operation.id),
        totals: await this.calculateTotals(operation.id),
      })));
      const total = decoratedOperations.reduce((acc, operation) => ({
        activeChannelCount: acc.activeChannelCount + operation.totals.activeChannelCount,
        totalMoldCount: acc.totalMoldCount + operation.totals.totalMoldCount,
        uniqueColorCount: acc.uniqueColorCount + operation.totals.uniqueColorCount,
        registeredColorCount: acc.registeredColorCount + operation.totals.registeredColorCount,
        unresolvedColorCount: acc.unresolvedColorCount + operation.totals.unresolvedColorCount,
      }), { activeChannelCount: 0, totalMoldCount: 0, uniqueColorCount: 0, registeredColorCount: 0, unresolvedColorCount: 0 });
      const modelFiles = files.filter((row: any) => row.modelId === model.id).map((file: any) => ({ ...file, previewUrl: this.publicStorageUrl(file.filePath) || `/desen/workflow/files/${file.id}/preview` }));
      return {
        ...model,
        companyName: companyMap.get(model.companyId) || (model.metadata as any)?.companyName || "-",
        statusLabel: STATUS_LABELS[model.status] || model.status,
        operations: decoratedOperations,
        files: modelFiles,
        logs: logs.filter((row: any) => row.modelId === model.id),
        mainImage: modelFiles.find((row: any) => row.id === model.mainImageFileId) || modelFiles.find((row: any) => row.fileRole === "MODEL_IMAGE") || null,
        totals: total,
      };
    }));
  }

  async importLegacyHavuz(payload: Record<string, any>, legacyRows: any[]) {
    const mainCompanySlug = this.slug(payload);
    const running = this.legacyImportInFlight.get(mainCompanySlug);
    if (running) return running;

    const importTask = (async () => {
      const rows = (Array.isArray(legacyRows) ? legacyRows : []).filter((row: any) => clean(row?.id) && clean(row?.modelName || row?.modelAdi));
      if (!rows.length) return { imported: 0, existing: 0, total: 0 };

      const sourceIds = [...new Set(rows.map((row: any) => clean(row.id)))];
      const existingSourceIds = new Set<string>();
      for (let index = 0; index < sourceIds.length; index += 400) {
        const existing = await this.workflowDb().designWorkflowModel.findMany({
          where: {
            mainCompanySlug,
            sourceType: "LEGACY_HAVUZ",
            sourceExternalId: { in: sourceIds.slice(index, index + 400) },
          },
          select: { sourceExternalId: true },
        });
        existing.forEach((row: any) => row.sourceExternalId && existingSourceIds.add(row.sourceExternalId));
      }

      const pending = rows.filter((row: any) => !existingSourceIds.has(clean(row.id)));
      if (!pending.length) return { imported: 0, existing: rows.length, total: rows.length };

      const companies = await this.workflowDb().company.findMany({
        where: { mainCompanySlug, isActive: true },
        select: { id: true, name: true, normalizedName: true },
      });
      const companiesById = new Map(companies.map((row: any) => [row.id, row]));
      const companyFor = (legacy: any) => {
        const exact = companiesById.get(clean(legacy.firmId));
        if (exact) return exact;
        const wanted = normalizeSearch(legacy.firmName);
        if (!wanted) return null;
        return companies.find((company: any) => {
          const candidate = normalizeSearch(`${company.name} ${company.normalizedName}`);
          return candidate === wanted || candidate.includes(wanted) || wanted.includes(normalizeSearch(company.name));
        }) || null;
      };

      let imported = 0;
      for (let start = 0; start < pending.length; start += 40) {
        const chunk = pending.slice(start, start + 40);
        const modelRows: any[] = [];
        const operationRows: any[] = [];
        const fileRows: any[] = [];

        for (const legacy of chunk) {
          const modelId = randomUUID();
          const operationId = randomUUID();
          const mainPath = this.legacyStoragePath(legacy.absolutePath || legacy.desenImageOriginal || legacy.desenImageThumb);
          const channelPath = this.legacyStoragePath(legacy.kanalImageOriginal || legacy.kanalImageThumb);
          const hasMainFile = Boolean(mainPath && fs.existsSync(mainPath) && fs.statSync(mainPath).isFile());
          const hasChannelFile = Boolean(channelPath && fs.existsSync(channelPath) && fs.statSync(channelPath).isFile());
          const mainFileId = hasMainFile ? randomUUID() : null;
          const channelFileId = hasChannelFile ? randomUUID() : null;
          const company = companyFor(legacy);
          const printAreaCode = this.legacyPrintArea(legacy.baskiBolgesi);
          const createdAt = legacy.createdAt && !Number.isNaN(new Date(legacy.createdAt).getTime()) ? new Date(legacy.createdAt) : new Date();
          const modelName = clean(legacy.modelName || legacy.modelAdi);
          const status = hasChannelFile || bool(legacy.hasKanalImage) ? "CHANNEL_REVIEW_PENDING" : "CHANNEL_IMAGE_MISSING";

          modelRows.push({
            id: modelId,
            mainCompanySlug,
            companyId: company?.id || null,
            modelCode: modelName,
            modelName,
            designName: clean(legacy.urunTipi) || null,
            groundColor: clean(legacy.zemin) || null,
            mainImageFileId: mainFileId,
            sourceType: "LEGACY_HAVUZ",
            sourceExternalId: clean(legacy.id),
            status,
            notes: clean(legacy.teknikNotlar || legacy.aciklama) || null,
            metadata: {
              legacyHavuz: true,
              companyName: clean(legacy.firmName) || company?.name || "",
              renkSayisi: Number(legacy.renkSayisi || 0),
              renkler: clean(legacy.renkler),
              yazilar: clean(legacy.yazilar),
              temaFigur: clean(legacy.temaFigur),
              olcuBeden: clean(legacy.olcuBeden),
              kanalInfo: clean(legacy.kanalInfo),
              originalRecordId: clean(legacy.id),
            },
            isActive: legacy.isActive === false ? false : true,
            createdAt,
            updatedAt: createdAt,
          });

          operationRows.push({
            id: operationId,
            modelId,
            printAreaCode,
            printAreaName: PRINT_AREAS[printAreaCode] || clean(legacy.baskiBolgesi) || "Ön",
            sequence: 1,
            modelImageFileId: mainFileId,
            channelImageFileId: channelFileId,
            placementStatus: "WAITING",
            dyehouseStatus: "WAITING",
            productionReady: false,
            notes: clean(legacy.kanalInfo || legacy.teknikNotlar) || null,
            metadata: { legacyHavuz: true, renkSayisi: Number(legacy.renkSayisi || 0) },
            createdAt,
            updatedAt: createdAt,
          });

          const addFile = (fileId: string | null, filePath: string, fileRole: string) => {
            if (!fileId) return;
            const stat = fs.statSync(filePath);
            const relative = path.relative(getStorageRoot(), filePath);
            fileRows.push({
              id: fileId,
              mainCompanySlug,
              filePath,
              fileName: path.basename(filePath),
              mimeType: mimeFor(filePath),
              modelId,
              operationId,
              fileRole,
              originalFileName: path.basename(filePath),
              storedFileName: path.basename(filePath),
              storagePath: relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative.replace(/\\/g, "/") : null,
              fileSize: Math.min(stat.size, 2147483647),
              sourceType: "LEGACY_HAVUZ",
              sourceExternalId: clean(legacy.id),
              previewPath: filePath,
              status: "ACTIVE",
              raw: { legacyHavuz: true },
              createdAt,
              updatedAt: createdAt,
            });
          };
          addFile(mainFileId, mainPath, "MODEL_IMAGE");
          addFile(channelFileId, channelPath, "CHANNEL_IMAGE");
        }

        await this.workflowDb().$transaction(async (tx: any) => {
          const db = this.workflowDb(tx);
          if (modelRows.length) await db.designWorkflowModel.createMany({ data: modelRows });
          if (operationRows.length) await db.designModelOperation.createMany({ data: operationRows });
          if (fileRows.length) await db.designFile.createMany({ data: fileRows });
        });
        imported += modelRows.length;
      }

      return { imported, existing: rows.length - imported, total: rows.length };
    })();

    this.legacyImportInFlight.set(mainCompanySlug, importTask);
    try {
      return await importTask;
    } finally {
      this.legacyImportInFlight.delete(mainCompanySlug);
    }
  }

  async listModels(query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    const where: any = { mainCompanySlug, isActive: query.includeArchive === "true" ? undefined : true };
    if (clean(query.companyId)) where.companyId = clean(query.companyId);
    if (clean(query.status)) where.status = clean(query.status);
    const models = await this.workflowDb().designWorkflowModel.findMany({ where, orderBy: { updatedAt: "desc" }, take: Math.min(Number(query.limit || 1000), 1000) });
    let rows = await this.decorateModels(models);
    const searchGroups = this.searchTokenGroups(query.q || query.search);
    if (searchGroups.length) rows = rows.filter((row: any) => {
      const haystack = normalizeSearch([
        row.modelName,
        row.modelCode,
        row.designName,
        row.companyName,
        row.groundColor,
        row.notes,
        JSON.stringify(row.metadata || {}),
        ...(row.files || []).map((file: any) => `${file.originalFileName || ""} ${file.fileName || ""}`),
      ].join(" "));
      return searchGroups.every((group) => group.some((token) => haystack.includes(token)));
    });
    if (clean(query.printAreaCode)) rows = rows.filter((row: any) => row.operations.some((operation: any) => operation.printAreaCode === clean(query.printAreaCode)));
    if (clean(query.placementStatus)) rows = rows.filter((row: any) => row.operations.some((operation: any) => operation.placementStatus === clean(query.placementStatus)));
    return { rows, total: rows.length };
  }

  async getModel(id: string, query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    const model = await this.workflowDb().designWorkflowModel.findFirst({ where: { id, mainCompanySlug } });
    if (!model) throw new NotFoundException("Desen modeli bulunamadı.");
    return (await this.decorateModels([model]))[0];
  }

  async createModel(body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    if (!clean(body.modelName)) throw new BadRequestException("Model adı zorunludur.");
    const operations = Array.isArray(body.operations) && body.operations.length ? body.operations : [{ printAreaCode: "FRONT", printAreaName: "Ön", channels: body.channels || [] }];
    const model = await this.workflowDb().$transaction(async (tx: any) => {
      const db = this.workflowDb(tx);
      const created = await db.designWorkflowModel.create({ data: { mainCompanySlug, companyId: clean(body.companyId) || null, modelCode: clean(body.modelCode) || clean(body.modelName), modelName: clean(body.modelName), designName: clean(body.designName) || null, groundColor: clean(body.groundColor) || null, sourceType: clean(body.sourceType) || "MANUAL_UPLOAD", sourceExternalId: clean(body.sourceExternalId) || null, status: clean(body.status) || "NEW_ARRIVAL", notes: clean(body.notes) || null, metadata: body.metadata || undefined } });
      for (let index = 0; index < operations.length; index += 1) {
        const operation = await db.designModelOperation.create({ data: { modelId: created.id, ...this.operationInput(operations[index], index + 1) } });
        if (Array.isArray(operations[index].channels) && operations[index].channels.length) await this.createChannels(db, operation.id, operations[index].channels);
      }
      await this.log({ modelId: created.id, userId: clean(body.userId), action: "MODEL_CREATED", newValue: created, description: "Model manuel oluşturuldu." }, db);
      return created;
    });
    return this.getModel(model.id, { mainCompanySlug });
  }

  async updateModel(id: string, body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    const current = await this.getModel(id, { mainCompanySlug });
    const model = await this.workflowDb().designWorkflowModel.update({ where: { id }, data: { companyId: body.companyId === undefined ? undefined : clean(body.companyId) || null, modelCode: body.modelCode === undefined ? undefined : clean(body.modelCode) || null, modelName: body.modelName === undefined ? undefined : clean(body.modelName), designName: body.designName === undefined ? undefined : clean(body.designName) || null, groundColor: body.groundColor === undefined ? undefined : clean(body.groundColor) || null, status: body.status === undefined ? undefined : clean(body.status), notes: body.notes === undefined ? undefined : clean(body.notes) || null, metadata: body.metadata === undefined ? undefined : body.metadata, isActive: body.isActive === undefined ? undefined : bool(body.isActive, true) } });
    await this.log({ modelId: id, userId: clean(body.userId), action: "MODEL_UPDATED", oldValue: current, newValue: model, description: "Model bilgileri güncellendi." });
    return this.getModel(id, { mainCompanySlug });
  }

  async archiveModel(id: string, body: Record<string, any>) {
    const mainCompanySlug = this.slug(body);
    await this.getModel(id, { mainCompanySlug });
    await this.workflowDb().designWorkflowModel.update({ where: { id }, data: { isActive: false, status: "ARCHIVE" } });
    await this.log({ modelId: id, userId: clean(body.userId), action: "MODEL_ARCHIVED", description: "Model arşivlendi." });
    return { id, archived: true };
  }

  async createOperation(modelId: string, body: Record<string, any>) {
    const model = await this.getModel(modelId, body);
    const operation = await this.workflowDb().designModelOperation.create({ data: { modelId, ...this.operationInput(body, model.operations.length + 1) } });
    if (Array.isArray(body.channels) && body.channels.length) await this.createChannels(this.workflowDb(), operation.id, body.channels);
    await this.log({ modelId, operationId: operation.id, userId: clean(body.userId), action: "PRINT_AREA_ADDED", newValue: operation, description: `${operation.printAreaName} baskı bölgesi eklendi.` });
    return this.getModel(modelId, body);
  }

  async updateOperation(operationId: string, body: Record<string, any>) {
    const current = await this.workflowDb().designModelOperation.findUnique({ where: { id: operationId } });
    if (!current) throw new NotFoundException("Baskı bölgesi bulunamadı.");
    const input = this.operationInput({ ...current, ...body }, current.sequence);
    const operation = await this.workflowDb().designModelOperation.update({ where: { id: operationId }, data: input });
    await this.log({ modelId: current.modelId, operationId, userId: clean(body.userId), action: "PRINT_AREA_UPDATED", oldValue: current, newValue: operation, description: `${operation.printAreaName} teknik bilgileri güncellendi.` });
    return operation;
  }

  async deleteOperation(operationId: string, body: Record<string, any>) {
    const current = await this.workflowDb().designModelOperation.findUnique({ where: { id: operationId } });
    if (!current) throw new NotFoundException("Baskı bölgesi bulunamadı.");
    await this.workflowDb().$transaction(async (tx: any) => {
      const db = this.workflowDb(tx);
      await db.designOperationChannel.deleteMany({ where: { operationId } });
      await db.designColorGroup.deleteMany({ where: { operationId } });
      await db.designModelOperation.delete({ where: { id: operationId } });
      await this.log({ modelId: current.modelId, operationId, userId: clean(body.userId), action: "PRINT_AREA_REMOVED", oldValue: current, description: `${current.printAreaName} baskı bölgesi kaldırıldı.` }, db);
    });
    return { id: operationId, deleted: true };
  }

  async replaceChannels(operationId: string, body: Record<string, any>) {
    const operation = await this.workflowDb().designModelOperation.findUnique({ where: { id: operationId } });
    if (!operation) throw new NotFoundException("Baskı bölgesi bulunamadı.");
    const rows = Array.isArray(body.channels) ? body.channels : this.parseChannels(body);
    await this.workflowDb().$transaction(async (tx: any) => {
      const db = this.workflowDb(tx);
      await db.designOperationChannel.deleteMany({ where: { operationId } });
      await db.designColorGroup.deleteMany({ where: { operationId } });
      await this.createChannels(db, operationId, rows);
      await this.log({ modelId: operation.modelId, operationId, userId: clean(body.userId), action: "CHANNELS_REPLACED", newValue: rows, description: `${rows.length} kanal kaydedildi.` }, db);
    });
    return this.calculateTotals(operationId);
  }

  async updateChannel(channelId: string, body: Record<string, any>) {
    const current = await this.workflowDb().designOperationChannel.findUnique({ where: { id: channelId } });
    if (!current) throw new NotFoundException("Kanal bulunamadı.");
    let colorGroupId = body.colorGroupId === undefined ? current.colorGroupId : clean(body.colorGroupId) || null;
    if (clean(body.groupKey)) {
      const group = await this.workflowDb().designColorGroup.upsert({ where: { operationId_groupKey: { operationId: current.operationId, groupKey: clean(body.groupKey) } }, update: { displayName: clean(body.groupName || body.colorCode || body.groupKey), colorCode: clean(body.colorCode) || null }, create: { operationId: current.operationId, groupKey: clean(body.groupKey), displayName: clean(body.groupName || body.colorCode || body.groupKey), colorCode: clean(body.colorCode) || null } });
      colorGroupId = group.id;
    }
    const channel = await this.workflowDb().designOperationChannel.update({ where: { id: channelId }, data: { sequence: body.sequence === undefined ? undefined : Number(body.sequence), rawName: body.rawName === undefined ? undefined : clean(body.rawName), normalizedName: body.normalizedName === undefined ? undefined : clean(body.normalizedName), channelType: body.channelType === undefined ? undefined : clean(body.channelType), colorCode: body.colorCode === undefined ? undefined : clean(body.colorCode) || null, colorGroupId, registeredColorId: body.registeredColorId === undefined ? undefined : clean(body.registeredColorId) || null, included: body.included === undefined ? undefined : bool(body.included, true), status: body.status === undefined ? undefined : clean(body.status), notes: body.notes === undefined ? undefined : clean(body.notes) || null } });
    await this.refreshGroupCounts(current.operationId);
    await this.log({ operationId: current.operationId, action: "CHANNEL_UPDATED", oldValue: current, newValue: channel, description: `${channel.normalizedName} kanalı güncellendi.` });
    return channel;
  }

  async deleteChannel(channelId: string, body: Record<string, any>) {
    const current = await this.workflowDb().designOperationChannel.findUnique({ where: { id: channelId } });
    if (!current) throw new NotFoundException("Kanal bulunamadı.");
    await this.workflowDb().designOperationChannel.delete({ where: { id: channelId } });
    await this.refreshGroupCounts(current.operationId);
    await this.log({ operationId: current.operationId, userId: clean(body.userId), action: "CHANNEL_REMOVED", oldValue: current, description: "Kanal kaldırıldı." });
    return { id: channelId, deleted: true };
  }

  async reorderChannels(operationId: string, body: Record<string, any>) {
    const ids = Array.isArray(body.channelIds) ? body.channelIds.map(clean).filter(Boolean) : [];
    await this.workflowDb().$transaction(ids.map((id: string, index: number) => this.workflowDb().designOperationChannel.update({ where: { id }, data: { sequence: index + 1 } })));
    await this.log({ operationId, userId: clean(body.userId), action: "CHANNELS_REORDERED", newValue: ids, description: "Kanal sırası güncellendi." });
    return this.calculateTotals(operationId);
  }

  async upsertColorGroup(operationId: string, body: Record<string, any>, groupId?: string) {
    const groupKey = clean(body.groupKey);
    if (!groupKey) throw new BadRequestException("Renk grubu anahtarı zorunludur.");
    const data = { operationId, groupKey, displayName: clean(body.displayName || body.groupName || groupKey), colorCode: clean(body.colorCode) || null, registeredColorId: clean(body.registeredColorId) || null, status: clean(body.status) || (body.registeredColorId ? "MATCHED" : "UNRESOLVED") };
    const group = groupId ? await this.workflowDb().designColorGroup.update({ where: { id: groupId }, data }) : await this.workflowDb().designColorGroup.upsert({ where: { operationId_groupKey: { operationId, groupKey } }, update: data, create: data });
    const channelIds = Array.isArray(body.channelIds) ? body.channelIds.map(clean).filter(Boolean) : [];
    if (channelIds.length) await this.workflowDb().designOperationChannel.updateMany({ where: { id: { in: channelIds }, operationId }, data: { colorGroupId: group.id, registeredColorId: group.registeredColorId } });
    await this.refreshGroupCounts(operationId);
    await this.log({ operationId, action: "COLOR_GROUP_SAVED", newValue: group, description: `${group.displayName} renk grubu kaydedildi.` });
    return group;
  }

  async linkRegisteredColor(groupId: string, body: Record<string, any>) {
    const group = await this.workflowDb().designColorGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException("Renk grubu bulunamadı.");
    const registeredColorId = clean(body.registeredColorId) || null;
    const updated = await this.workflowDb().designColorGroup.update({ where: { id: groupId }, data: { registeredColorId, status: registeredColorId ? "MATCHED" : "UNRESOLVED" } });
    await this.workflowDb().designOperationChannel.updateMany({ where: { operationId: group.operationId, colorGroupId: group.id }, data: { registeredColorId, status: registeredColorId ? "MATCHED" : "PENDING" } });
    await this.log({ operationId: group.operationId, action: "REGISTERED_COLOR_LINKED", oldValue: group, newValue: updated, description: registeredColorId ? "Kayıtlı Boyahane rengi bağlandı." : "Kayıtlı renk bağlantısı kaldırıldı." });
    return updated;
  }

  async searchRegisteredColors(query: Record<string, any>) {
    const mainCompanySlug = this.slug(query);
    const q = clean(query.q || query.search);
    const where: any = { mainCompanySlug, active: true, deletedAt: null };
    if (q) where.OR = [{ colorCode: { contains: q } }, { colorName: { contains: q } }];
    const colors = await this.workflowDb().boyahaneColor.findMany({ where, orderBy: { colorName: "asc" }, take: 100 });
    return Promise.all(colors.map(async (color: any) => ({ ...color, recipeCount: await this.workflowDb().boyahaneRecipe.count({ where: { mainCompanySlug, colorId: color.id, active: true, deletedAt: null } }), latestRecipe: await this.workflowDb().boyahaneRecipe.findFirst({ where: { mainCompanySlug, colorId: color.id, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, recipeName: true, updatedAt: true } }) })));
  }

  async resolveWorkflowFile(id: string) {
    const file = await this.workflowDb().designFile.findUnique({ where: { id } });
    const filePath = file?.storagePath && !path.isAbsolute(file.storagePath) ? path.join(getStorageRoot(), file.storagePath) : file?.filePath;
    if (!file || !filePath || !fs.existsSync(filePath)) throw new NotFoundException("Desen dosyası bulunamadı.");
    return { file, filePath };
  }

  async uploadWorkflowFile(modelId: string, file: any, body: Record<string, any>) {
    const model = await this.getModel(modelId, body);
    const role = clean(body.fileRole) || "OTHER";
    const extension = path.extname(file?.originalname || "").toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new BadRequestException("Yalnız JPG, JPEG, PNG, WEBP ve PDF dosyaları yüklenebilir.");
    }
    const operationId = clean(body.operationId) || null;
    if (operationId && !model.operations.some((operation: any) => operation.id === operationId)) {
      throw new BadRequestException("Baskı bölgesi bu modele ait değil.");
    }
    const companyFolder = safeSegment(model.companyName, "FIRMA-YOK");
    const modelFolder = safeSegment(model.modelName, "MODEL");
    const targetDir = path.join(this.folders().models, companyFolder, modelFolder, ROLE_FOLDERS[role] || "arsiv");
    fs.mkdirSync(targetDir, { recursive: true });
    const originalFileName = safeSegment(file.originalname, `${randomUUID()}${extension}`);
    const targetPath = this.uniquePath(path.join(targetDir, originalFileName));
    const temporaryPath = `${targetPath}.upload-${randomUUID()}`;
    fs.writeFileSync(temporaryPath, file.buffer);
    const fileHash = this.hashFile(temporaryPath);
    fs.renameSync(temporaryPath, targetPath);
    try {
      const saved = await this.workflowDb().designFile.create({ data: { mainCompanySlug: model.mainCompanySlug, filePath: targetPath, fileName: path.basename(targetPath), mimeType: mimeFor(originalFileName), modelId, operationId, fileRole: role, originalFileName: file.originalname, storedFileName: path.basename(targetPath), storagePath: path.relative(getStorageRoot(), targetPath).replace(/\\/g, "/"), fileHash, fileSize: Math.min(Number(file.size || file.buffer?.length || 0), 2147483647), sourceType: "MANUAL_UPLOAD", previewPath: targetPath, status: "ACTIVE" } });
      if (role === "MODEL_IMAGE") await this.workflowDb().designWorkflowModel.update({ where: { id: modelId }, data: { mainImageFileId: saved.id } });
      if (operationId && role === "CHANNEL_IMAGE") await this.workflowDb().designModelOperation.update({ where: { id: operationId }, data: { channelImageFileId: saved.id } });
      if (operationId && role === "PLACEMENT_IMAGE") await this.workflowDb().designModelOperation.update({ where: { id: operationId }, data: { placementFileId: saved.id, placementStatus: "READY" } });
      await this.log({ modelId, operationId: operationId || undefined, fileId: saved.id, action: "FILE_UPLOADED", newValue: { role, storagePath: saved.storagePath }, description: `${file.originalname} dosyası yüklendi.` });
      if (role === "MODEL_IMAGE") {
        try { await this.analyzeModel(modelId, { ...body, mainCompanySlug: model.mainCompanySlug, useVision: true, force: true }); }
        catch (error: any) { await this.log({ modelId, fileId: saved.id, action: "MODEL_ANALYSIS_FAILED", description: clean(error?.message || "Otomatik desen analizi başarısız oldu.") }); }
      }
      return saved;
    } catch (error) {
      try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* DB hatasında yarım dosya bırakma. */ }
      throw error;
    }
  }

  async syncDyehouse(modelId: string, body: Record<string, any>) {
    const model = await this.getModel(modelId, body);
    if (!model.operations.length) throw new BadRequestException("Boyahane senkronu için en az bir baskı bölgesi gereklidir.");
    const incomplete = model.operations.find((operation: any) => operation.totals.activeChannelCount === 0 || operation.totals.unresolvedColorCount > 0);
    if (incomplete && !bool(body.force)) throw new BadRequestException(`${incomplete.printAreaName} için kanal veya renk grubu bilgileri eksik.`);
    const existingRows = await this.workflowDb().dyehouseModel.findMany({ where: { mainCompanySlug: model.mainCompanySlug } });
    const jobs: any[] = [];
    for (const operation of model.operations) {
      const workflowPayload = { modelId: model.id, companyId: model.companyId, modelName: model.modelName, printAreaId: operation.id, printAreaCode: operation.printAreaCode, modelImage: model.mainImage?.previewUrl || null, channelImage: model.files.find((file: any) => file.id === operation.channelImageFileId)?.previewUrl || null, totalChannelCount: operation.totals.activeChannelCount, totalMoldCount: operation.totals.totalMoldCount, uniqueColorCount: operation.totals.uniqueColorCount, unresolvedColorCount: operation.totals.unresolvedColorCount, placementStatus: operation.placementStatus, designStatus: model.status, channels: operation.channels.filter((row: any) => row.included).map((row: any) => ({ sequence: row.sequence, channelName: row.normalizedName, channelType: row.channelType, colorCode: row.colorCode, colorGroupId: row.colorGroupId, registeredColorId: row.registeredColorId })) };
      const existing = existingRows.find((row: any) => (row.raw as any)?.designWorkflow?.modelId === model.id && (row.raw as any)?.designWorkflow?.printAreaId === operation.id);
      const job = existing ? await this.workflowDb().dyehouseModel.update({ where: { id: existing.id }, data: { modelName: `${model.modelName} / ${operation.printAreaName}`, status: incomplete ? "REVISION_PENDING" : "DESIGN_READY", raw: { ...((existing.raw as any) || {}), designWorkflow: workflowPayload } } }) : await this.workflowDb().dyehouseModel.create({ data: { mainCompanySlug: model.mainCompanySlug, modelName: `${model.modelName} / ${operation.printAreaName}`, status: incomplete ? "REVISION_PENDING" : "DESIGN_READY", raw: { designWorkflow: workflowPayload } } });
      await this.workflowDb().designModelOperation.update({ where: { id: operation.id }, data: { dyehouseStatus: incomplete ? "REVISION_PENDING" : "READY" } });
      jobs.push(job);
    }
    await this.workflowDb().designWorkflowModel.update({ where: { id: model.id }, data: { status: incomplete ? "REVISION_PENDING" : "DYEHOUSE_READY" } });
    await this.log({ modelId, userId: clean(body.userId), action: "DYEHOUSE_SYNCED", newValue: jobs.map((job) => job.id), description: `${jobs.length} Boyahane işi güncellendi.` });
    return { jobs, duplicateCreated: false };
  }

  async reports(query: Record<string, any>) {
    const result = await this.listModels({ ...query, limit: 1000 });
    let rows = result.rows;
    if (clean(query.dyehouseStatus)) rows = rows.filter((row: any) => row.operations.some((operation: any) => operation.dyehouseStatus === clean(query.dyehouseStatus)));
    const statusCount = (status: string) => rows.filter((row: any) => row.status === status).length;
    return {
      rows,
      summary: {
        totalModels: rows.length,
        newArrival: statusCount("NEW_ARRIVAL"),
        channelImageMissing: statusCount("CHANNEL_IMAGE_MISSING"),
        channelReviewPending: statusCount("CHANNEL_REVIEW_PENDING"),
        colorMatchMissing: rows.filter((row: any) => row.totals.unresolvedColorCount > 0).length,
        placementWaiting: rows.filter((row: any) => row.operations.some((operation: any) => operation.placementStatus === "WAITING")).length,
        dyehouseReady: statusCount("DYEHOUSE_READY"),
        productionReady: statusCount("PRODUCTION_READY"),
      },
    };
  }

  async exportReports(query: Record<string, any>) {
    const report = await this.reports(query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Desen Raporu");
    sheet.columns = [
      { header: "Model", key: "modelName", width: 24 },
      { header: "Firma", key: "companyName", width: 30 },
      { header: "Baskı Bölgeleri", key: "printAreas", width: 34 },
      { header: "Kanal", key: "channels", width: 10 },
      { header: "Kalıp", key: "molds", width: 10 },
      { header: "Benzersiz Boya", key: "colors", width: 16 },
      { header: "Kayıtlı Renk", key: "registered", width: 14 },
      { header: "Eksik Renk", key: "unresolved", width: 12 },
      { header: "Yerleşim", key: "placement", width: 20 },
      { header: "Boyahane", key: "dyehouse", width: 20 },
      { header: "Durum", key: "status", width: 24 },
      { header: "Son Güncelleme", key: "updatedAt", width: 22 },
    ];
    report.rows.forEach((row: any) => sheet.addRow({ modelName: row.modelName, companyName: row.companyName, printAreas: row.operations.map((operation: any) => operation.printAreaName).join(", "), channels: row.totals.activeChannelCount, molds: row.totals.totalMoldCount, colors: row.totals.uniqueColorCount, registered: row.totals.registeredColorCount, unresolved: row.totals.unresolvedColorCount, placement: row.operations.map((operation: any) => operation.placementStatus).join(", "), dyehouse: row.operations.map((operation: any) => operation.dyehouseStatus).join(", "), status: row.statusLabel, updatedAt: row.updatedAt }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B64" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async getProductionSummary(modelId: string, query: Record<string, any>) {
    const model = await this.getModel(modelId, query);
    return { modelId: model.id, modelName: model.modelName, printAreas: model.operations.map((operation: any) => ({ id: operation.id, code: operation.printAreaCode, name: operation.printAreaName, moldCount: operation.totals.totalMoldCount, uniqueColorCount: operation.totals.uniqueColorCount, dyehouseStatus: operation.dyehouseStatus, unresolvedColorCount: operation.totals.unresolvedColorCount, placementStatus: operation.placementStatus })) };
  }
}
