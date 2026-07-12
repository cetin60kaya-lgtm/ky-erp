import { BadRequestException, Injectable } from "@nestjs/common";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { MuhasebeBelgeService } from "./muhasebe-belge.service";
import { MuhasebeService } from "./muhasebe.service";

@Injectable()
export class DocumentIntakeService {
  constructor(
    private readonly db: SqlStoreService,
    private readonly belgeService: MuhasebeBelgeService,
    private readonly muhasebeService: MuhasebeService,
  ) {}

  private readonly supportedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
  ]);

  private readonly fakeRowHints = [
    "miktar",
    "birim",
    "birim fiyat",
    "kdv oranı",
    "kdv orani",
    "kdv tutarı",
    "kdv tutari",
    "mal hizmet toplam tutarı",
    "mal hizmet toplam tutari",
    "vergiler dahil toplam tutar",
    "ödenecek tutar",
    "odenecek tutar",
    "kdv matrahı",
    "kdv matrahi",
    "hesaplanan kdv",
    "toplam iskonto",
    "iskonto sonrası tutar",
    "iskonto sonrasi tutar",
    "banka",
    "iban",
    "delivery",
    "mersis",
    "ticari sicil",
    "yalnız",
    "yalniz",
    "notlar",
    "irsaliyeler",
    "vade farkı",
    "vade farki",
  ] as const;

  isSupportedMimeType(mimeType: string) {
    return this.supportedMimeTypes.has(String(mimeType || "").toLowerCase());
  }

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private sanitizeFilePart(value: string) {
    return this.cleanText(value).replace(/[<>:"/\\|?*]/g, "-");
  }

  private slugifyPart(value: string) {
    return this.cleanText(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private normalizeDocumentFlowType(value: any) {
    const raw = this.cleanText(value).toLocaleUpperCase("tr-TR");
    if (raw === "GELEN_FATURA" || raw === "GELEN_ALIS_FATURASI")
      return "GELEN_FATURA";
    if (raw === "GELEN_IRSALIYE") return "GELEN_IRSALIYE";
    if (raw === "GIDEN_FATURA" || raw === "BIZIM_FATURA") return "GIDEN_FATURA";
    if (raw === "GIDEN_IRSALIYE" || raw === "BIZIM_IRSALIYE")
      return "GIDEN_IRSALIYE";
    return "";
  }

  private deriveFlowTypeFromClass(documentClass: string) {
    const cls = this.cleanText(documentClass).toLocaleUpperCase("tr-TR");
    if (cls === "FATURA" || cls === "IRSALIYE_YERINE_GECEN_FATURA") {
      return "GELEN_FATURA";
    }
    if (cls === "IRSALIYE") {
      return "GELEN_IRSALIYE";
    }
    return "";
  }

  private flowFolder(flowType: string) {
    if (flowType === "GELEN_FATURA") return "gelen-fatura";
    if (flowType === "GELEN_IRSALIYE") return "gelen-irsaliye";
    if (flowType === "GIDEN_FATURA") return "giden-fatura";
    if (flowType === "GIDEN_IRSALIYE") return "giden-irsaliye";
    return "";
  }

  private buildDocumentFileName(args: {
    draftId: string;
    extension: string;
    documentNo?: string;
    secondaryLabel?: string;
    fallbackName?: string;
  }) {
    const fromDocumentNo = this.sanitizeFilePart(
      this.cleanText(args.documentNo),
    );
    const fromSecondary = this.sanitizeFilePart(
      this.cleanText(args.secondaryLabel || ""),
    );
    const fromFallback = this.slugifyPart(args.fallbackName || "");
    const base =
      fromDocumentNo && fromSecondary
        ? `${fromDocumentNo} ${fromSecondary}`
        : fromDocumentNo || fromFallback || this.slugifyPart(args.draftId);
    return `${base || "belge"}${args.extension}`;
  }

  private extractModelNameFromFileName(fileName: string, documentNo?: string) {
    const parsedName = path.parse(this.cleanText(fileName)).name;
    const normalizedDocumentNo = this.cleanText(documentNo);
    let modelName = parsedName;
    if (normalizedDocumentNo) {
      modelName = modelName.replace(
        new RegExp(`^${normalizedDocumentNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        "",
      );
    } else {
      modelName = modelName.replace(/^[A-Z]{2,4}\d{8,}\s*/i, "");
    }
    return this.cleanText(modelName.replace(/^[-_\s]+/, ""));
  }

  private getConfiguredBaseDir(mainCompanySlug: string, flowType: string) {
    const settings = this.muhasebeService.withCtx(mainCompanySlug, () =>
      this.muhasebeService.getDocumentPathSettings(),
    );
    if (flowType === "GIDEN_IRSALIYE") {
      return this.cleanText(settings?.gidenIrsaliyeBasePath);
    }
    if (flowType === "GIDEN_FATURA") {
      return this.cleanText(settings?.gidenFaturaBasePath);
    }
    if (flowType === "GELEN_FATURA") {
      return this.cleanText(settings?.tedarikciFaturaBasePath);
    }
    return "";
  }

  private resolveTargetDocumentPath(args: {
    mainCompanySlug: string;
    firma: string;
    flowType: string;
    fileName: string;
  }) {
    const companySlug = this.slugifyPart(args.firma);
    if (!companySlug) {
      throw new BadRequestException(
        "Belge klasörleme için firma zorunludur. Önce firma seçip tekrar deneyin.",
      );
    }
    const flowFolder = this.flowFolder(args.flowType);
    if (!flowFolder) {
      throw new BadRequestException(
        "Belge yönü/tipi net değil. Gelen Fatura, Gelen İrsaliye, Giden Fatura veya Giden İrsaliye seçin.",
      );
    }
    const configuredBaseDir = this.getConfiguredBaseDir(
      args.mainCompanySlug,
      args.flowType,
    );
    const useConfiguredDirDirectly =
      configuredBaseDir &&
      (args.flowType === "GIDEN_FATURA" ||
        args.flowType === "GIDEN_IRSALIYE");
    const targetDir = configuredBaseDir
      ? useConfiguredDirDirectly
        ? configuredBaseDir
        : path.join(configuredBaseDir, companySlug)
      : path.join(
          this.db.getMainCompanyDir(args.mainCompanySlug),
          "documents",
          flowFolder,
          companySlug,
        );
    return path.join(
      targetDir,
      this.ensureUniqueFileName(targetDir, args.fileName),
    );
  }

  private ensureUniqueFileName(directory: string, fileName: string) {
    const parsed = path.parse(fileName);
    const safeBase = this.sanitizeFilePart(parsed.name || "belge");
    const safeExt = parsed.ext || ".pdf";
    let attempt = `${safeBase}${safeExt}`;
    let counter = 2;
    while (fs.existsSync(path.join(directory, attempt))) {
      attempt = `${safeBase}-${counter}${safeExt}`;
      counter += 1;
    }
    return attempt;
  }

  private parseAmount(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value || "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }

  private normalizeDateInput(value: any) {
    const text = this.cleanText(value);
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const compact = text.replace(/\s+/g, "");
    const match = compact.match(/^(\d{2})[./-]?(\d{2})[./-]?(\d{4})$/);
    if (!match) return "";
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  private makeDraftId() {
    return `DRF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private ensureUploadDirs(slug: string) {
    const baseDir = path.join(this.db.getMainCompanyDir(slug), "uploads");
    const originalsDir = path.join(baseDir, "originals");
    const pagesDir = path.join(baseDir, "pages");
    const draftsDir = path.join(baseDir, "drafts");
    fs.mkdirSync(originalsDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.mkdirSync(draftsDir, { recursive: true });
    return { baseDir, originalsDir, pagesDir, draftsDir };
  }

  private moveFile(sourcePath: string, targetPath: string) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
    }
  }

  private detectFileType(file: any) {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (mimeType === "application/pdf") return "pdf";
    if (["image/jpeg", "image/png", "image/jpg"].includes(mimeType))
      return "image";
    const ext = String(path.extname(file?.originalname || file?.filename || ""))
      .toLowerCase()
      .replace(/^\./, "");
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png"].includes(ext)) return "image";
    return "unknown";
  }

  private getTesseractStatus() {
    const executable = this.cleanText(
      process.env.TESSERACT_PATH || "tesseract",
    );
    try {
      execFileSync(executable, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 12000,
        windowsHide: true,
      });
      return { available: true, executable, error: "" };
    } catch (error: any) {
      return {
        available: false,
        executable,
        error: this.cleanText(error?.message || "tesseract bulunamadı"),
      };
    }
  }

  private tryOcrText(filePath: string) {
    const status = this.getTesseractStatus();
    if (!status.available) {
      return {
        text: "",
        attempted: true,
        available: false,
        used: false,
        warning: `OCR yapılamadı: tesseract erişilemedi (${status.error})`,
      };
    }
    try {
      const stdout = execFileSync(
        status.executable,
        [filePath, "stdout", "-l", "tur+eng"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 45000,
          windowsHide: true,
        },
      );
      const text = String(stdout || "");
      return {
        text,
        attempted: true,
        available: true,
        used: Boolean(this.cleanText(text)),
        warning: this.cleanText(text)
          ? ""
          : "OCR çalıştı ancak metin boş döndü.",
      };
    } catch (error: any) {
      return {
        text: "",
        attempted: true,
        available: true,
        used: false,
        warning: `OCR komutu başarısız: ${this.cleanText(error?.message || "bilinmeyen hata")}`,
      };
    }
  }

  private shouldAttemptOcrForPdf(parsed: any) {
    const metrics = parsed?.metrics || {};
    const textQualityScore = Number(metrics.textQualityScore || 0);
    const confidenceAverage = Number(
      metrics.confidenceAverage || metrics.avgConfidence || 0,
    );
    const itemCount = Number(metrics.parsedItemCount || 0);
    const header = parsed?.header || {};
    const missingCompany = !this.cleanText(
      header.companyName || parsed?.parsedCompanyName,
    );
    const missingDocNo = !this.cleanText(
      header.documentNo ||
        header.faturaNo ||
        header.irsaliyeNo ||
        header.dispatchNo,
    );
    return (
      textQualityScore < 55 ||
      confidenceAverage < 0.65 ||
      itemCount === 0 ||
      missingCompany ||
      missingDocNo
    );
  }

  private pickBetterParse(currentParsed: any, ocrParsed: any) {
    const currentScore = Number(currentParsed?.metrics?.confidenceAverage || 0);
    const ocrScore = Number(ocrParsed?.metrics?.confidenceAverage || 0);
    const currentItems = Number(currentParsed?.metrics?.parsedItemCount || 0);
    const ocrItems = Number(ocrParsed?.metrics?.parsedItemCount || 0);
    const currentCompany = this.cleanText(currentParsed?.header?.companyName);
    const ocrCompany = this.cleanText(ocrParsed?.header?.companyName);
    const currentDocNo = this.cleanText(
      currentParsed?.header?.documentNo ||
        currentParsed?.header?.faturaNo ||
        currentParsed?.header?.irsaliyeNo ||
        currentParsed?.header?.dispatchNo,
    );
    const ocrDocNo = this.cleanText(
      ocrParsed?.header?.documentNo ||
        ocrParsed?.header?.faturaNo ||
        ocrParsed?.header?.irsaliyeNo ||
        ocrParsed?.header?.dispatchNo,
    );

    const currentSignals = [
      currentCompany,
      currentDocNo,
      currentItems > 0 ? "i" : "",
      currentScore >= 0.7 ? "c" : "",
    ].filter(Boolean).length;
    const ocrSignals = [
      ocrCompany,
      ocrDocNo,
      ocrItems > 0 ? "i" : "",
      ocrScore >= 0.7 ? "c" : "",
    ].filter(Boolean).length;
    return ocrSignals > currentSignals ||
      (ocrSignals === currentSignals && ocrScore > currentScore)
      ? ocrParsed
      : currentParsed;
  }

  private scoreTextQuality(text: string) {
    const normalized = this.cleanText(text);
    if (!normalized) return 0;
    const lines = normalized.split(/\r?\n|(?<=\.)\s+/).filter(Boolean);
    const letters = (normalized.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    const digits = (normalized.match(/[0-9]/g) || []).length;
    const usefulRatio = Math.min(
      1,
      (letters + digits) / Math.max(normalized.length, 1),
    );
    const lineRatio = Math.min(1, lines.length / 20);
    return Number(((usefulRatio * 0.65 + lineRatio * 0.35) * 100).toFixed(2));
  }

  private detectWorkflowType(sectionKey: string, documentClass: string) {
    if (sectionKey === "bizim-belgeler") {
      if (
        documentClass === "FATURA" ||
        documentClass === "IRSALIYE_YERINE_GECEN_FATURA"
      ) {
        return "BIZIM_FATURA";
      }
      return "BIZIM_IRSALIYE";
    }
    if (sectionKey === "irsaliye-fatura") {
      if (documentClass === "FATURA") return "BIZIM_FATURA";
      if (documentClass === "IRSALIYE") return "GELEN_IRSALIYE";
      if (documentClass === "IRSALIYE_YERINE_GECEN_FATURA")
        return "GELEN_ALIS_FATURASI";
      return "BIZIM_IRSALIYE";
    }
    return documentClass === "ALIS_GIDER_BELGESI"
      ? "GIDER_BELGESI"
      : "GELEN_ALIS_FATURASI";
  }

  private flowMeta(flowType: string) {
    if (flowType === "GELEN_FATURA")
      return { belgeYonu: "gelen", belgeTipi: "fatura" };
    if (flowType === "GELEN_IRSALIYE")
      return { belgeYonu: "gelen", belgeTipi: "irsaliye" };
    if (flowType === "GIDEN_FATURA")
      return { belgeYonu: "giden", belgeTipi: "fatura" };
    if (flowType === "GIDEN_IRSALIYE")
      return { belgeYonu: "giden", belgeTipi: "irsaliye" };
    return { belgeYonu: "", belgeTipi: "" };
  }

  private ensureParsedCollections(parsed: any) {
    const parsedItems = Array.isArray(parsed?.parsedItems)
      ? parsed.parsedItems
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];
    const candidateRows = Array.isArray(parsed?.candidateRows)
      ? parsed.candidateRows
      : [];
    const fallbackItems =
      !parsedItems.length && candidateRows.length
        ? candidateRows
            .filter((row: any) => row && row.looksLikeItem && !row.rejectReason)
            .slice(0, 50)
            .map((row: any, index: number) => ({
              id: String(row.id || `item_${index + 1}`),
              description: this.cleanText(row.rawText),
              productCode: "",
              lotNo: "",
              quantity: Number(row.detectedNumbers?.[0] || 0),
              quantity2: 0,
              unit: this.cleanText(row.detectedUnit || "ADET") || "ADET",
              unit2: "",
              unitPrice: Number(row.detectedNumbers?.[1] || 0),
              lineTotal: Number(
                row.detectedNumbers?.[2] ||
                  Number(row.detectedNumbers?.[0] || 0) *
                    Number(row.detectedNumbers?.[1] || 0),
              ),
              discountRate: 0,
              discountAmount: 0,
              kdvRate: 0,
              kdvAmount: 0,
              confidence: Number(row.score || 0.6),
              needsReview: true,
              sourceProfile: this.cleanText(
                parsed?.detectedProfile || "fallback",
              ),
              modelAdayi: "",
            }))
        : [];
    return {
      parsedItems: parsedItems.length ? parsedItems : fallbackItems,
      candidateRows,
    };
  }

  private getParseCompleteness(parsed: any, flowType: string) {
    const header =
      parsed?.header && typeof parsed.header === "object" ? parsed.header : {};
    const items = Array.isArray(parsed?.parsedItems)
      ? parsed.parsedItems
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];
    const metrics = parsed?.metrics || {};
    const confidence = Number(
      metrics.confidenceAverage || metrics.avgConfidence || 0,
    );
    const normalizedFlow = this.normalizeDocumentFlowType(flowType);
    if (normalizedFlow === "GELEN_IRSALIYE") {
      const fields = [
        header.companyName || parsed?.parsedCompanyName,
        header.irsaliyeNo || header.dispatchNo || parsed?.irsaliyeNo,
        header.date || header.belgeTarihi || parsed?.belgeTarihi,
        Number(
          header.gelenAdet ||
            header.belgeAdediToplami ||
            header.irsaliyeAdedi ||
            parsed?.gelenAdet ||
            0,
        ) > 0
          ? "adet"
          : "",
        header.hamAciklama ||
          header.aciklama ||
          parsed?.aciklamaSuggestion ||
          parsed?.aiFallback?.aciklama,
      ].filter(Boolean).length;
      return { requiredCount: fields, requiredTotal: 5, confidence };
    }
    if (normalizedFlow === "GELEN_FATURA") {
      const fields = [
        header.companyName || parsed?.parsedCompanyName,
        header.faturaNo || header.documentNo || parsed?.faturaNo,
        header.date || header.belgeTarihi || parsed?.belgeTarihi,
        Number(header.grandTotal || parsed?.grandTotal || 0) > 0
          ? "toplam"
          : "",
        items.length > 0 ? "kalem" : "",
      ].filter(Boolean).length;
      return { requiredCount: fields, requiredTotal: 5, confidence };
    }
    const fields = [
      header.documentNo || header.faturaNo || header.irsaliyeNo,
      header.date || header.belgeTarihi,
      Number(
        header.belgeAdediToplami ||
          header.faturalananAdet ||
          header.irsaliyeAdedi ||
          header.grandTotal ||
          0,
      ) > 0
        ? "miktar"
        : "",
    ].filter(Boolean).length;
    return { requiredCount: fields, requiredTotal: 3, confidence };
  }

  private shouldRunAiFallback(parsed: any, flowType: string) {
    const completeness = this.getParseCompleteness(parsed, flowType);
    const lowConfidence =
      completeness.confidence > 0 && completeness.confidence < 0.65;
    const missingRequired =
      completeness.requiredCount < completeness.requiredTotal;
    return {
      ...completeness,
      shouldRun: missingRequired || lowConfidence,
    };
  }

  private aiExtractionSchema(flowType: string) {
    const normalizedFlow = this.normalizeDocumentFlowType(flowType);
    if (normalizedFlow === "GELEN_IRSALIYE") {
      return {
        belgeTipi: "musteri_irsaliye",
        firmaAdi: "",
        irsaliyeNo: "",
        tarih: "",
        adet: 0,
        piyonNo: "",
        aciklama: "",
        confidence: 0,
        parseDurumu: "kismi",
      };
    }
    if (normalizedFlow === "GELEN_FATURA") {
      return {
        belgeTipi: "tedarikci_fatura",
        firmaAdi: "",
        faturaNo: "",
        tarih: "",
        araToplam: 0,
        kdv: 0,
        genelToplam: 0,
        kalemler: [],
        confidence: 0,
        parseDurumu: "kismi",
      };
    }
    return {
      belgeTipi: "bizim_belge",
      firmaAdi: "",
      belgeNo: "",
      tarih: "",
      adet: 0,
      tutar: 0,
      kdv: 0,
      confidence: 0,
      parseDurumu: "kismi",
    };
  }

  private safeJsonObject(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      const match = String(value || "").match(/\{[\s\S]*\}/);
      if (!match?.[0]) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  private async runAiFallbackIfNeeded(parsed: any, flowType: string) {
    const fallbackDecision = this.shouldRunAiFallback(parsed, flowType);
    const baseMetrics = {
      ...(parsed?.metrics || {}),
      hybridParse: true,
      ruleParseRequiredCount: fallbackDecision.requiredCount,
      ruleParseRequiredTotal: fallbackDecision.requiredTotal,
      aiFallbackDecision: fallbackDecision.shouldRun ? "needed" : "not_needed",
    };
    if (!fallbackDecision.shouldRun) {
      return { ...parsed, metrics: baseMetrics };
    }

    const apiKey = this.cleanText(process.env.OPENAI_API_KEY || "");
    if (!apiKey) {
      return {
        ...parsed,
        metrics: {
          ...baseMetrics,
          aiFallbackDecision: "needed_but_disabled",
        },
        warnings: [
          ...(Array.isArray(parsed?.warnings) ? parsed.warnings : []),
          "Kural tabanlı parse bazı alanları eksik bıraktı. AI fallback için OPENAI_API_KEY tanımlı değil; manuel kontrol gerekli.",
        ],
      };
    }

    const rawText = this.cleanText(String(parsed?.rawText || "")).slice(
      0,
      12000,
    );
    if (!rawText) {
      return {
        ...parsed,
        metrics: { ...baseMetrics, aiFallbackDecision: "skipped_no_text" },
      };
    }

    try {
      const schema = this.aiExtractionSchema(flowType);
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.KYERP_AI_PARSE_MODEL || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "Sen ERP belge okuma yardımcısısın. Sadece verilen metinden emin olduğun alanları çıkar. Gelen irsaliyede açıklama alanına malzeme/model/açıklama satırının tamamını, miktar ve toplam satırı hariç, olduğu gibi yaz. JSON dışında cevap verme.",
            },
            {
              role: "user",
              content: `Hedef JSON şeması: ${JSON.stringify(schema)}\nBelge tipi: ${flowType}\nMetin:\n${rawText}`,
            },
          ],
          temperature: 0,
        }),
      });
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const body: any = await response.json();
      const outputText = this.cleanText(
        body.output_text ||
          body.output
            ?.flatMap((item: any) => item.content || [])
            ?.map((item: any) => item.text || "")
            ?.join(" ") ||
          "",
      );
      const ai = this.safeJsonObject(outputText);
      if (!ai || typeof ai !== "object") throw new Error("AI JSON okunamadı");

      const normalizedFlow = this.normalizeDocumentFlowType(flowType);
      const header = { ...(parsed?.header || {}) };
      if (normalizedFlow === "GELEN_IRSALIYE") {
        header.companyName = header.companyName || ai.firmaAdi || "";
        header.irsaliyeNo = header.irsaliyeNo || ai.irsaliyeNo || "";
        header.dispatchNo = header.dispatchNo || header.irsaliyeNo;
        header.date =
          header.date || this.normalizeDateInput(ai.tarih || "") || "";
        header.belgeTarihi = header.belgeTarihi || header.date;
        header.gelenAdet = header.gelenAdet || this.parseAmount(ai.adet || 0);
        header.belgeAdediToplami = header.belgeAdediToplami || header.gelenAdet;
        header.irsaliyeAdedi = header.irsaliyeAdedi || header.gelenAdet;
        header.piyonNo = header.piyonNo || ai.piyonNo || "";
        header.hamAciklama =
          header.hamAciklama || ai.aciklama || ai.hamAciklama || "";
        header.aciklama = header.aciklama || header.hamAciklama;
        header.belgeHamKod = header.belgeHamKod || header.hamAciklama || "";
      } else if (normalizedFlow === "GELEN_FATURA") {
        header.companyName = header.companyName || ai.firmaAdi || "";
        header.faturaNo = header.faturaNo || ai.faturaNo || "";
        header.documentNo = header.documentNo || header.faturaNo;
        header.date =
          header.date || this.normalizeDateInput(ai.tarih || "") || "";
        header.subtotal = header.subtotal || this.parseAmount(ai.araToplam);
        header.kdv = header.kdv || this.parseAmount(ai.kdv);
        header.grandTotal =
          header.grandTotal || this.parseAmount(ai.genelToplam);
      } else {
        header.companyName = header.companyName || ai.firmaAdi || "";
        header.documentNo = header.documentNo || ai.belgeNo || "";
        header.date =
          header.date || this.normalizeDateInput(ai.tarih || "") || "";
        header.belgeAdediToplami =
          header.belgeAdediToplami || this.parseAmount(ai.adet || 0);
        header.kdv = header.kdv || this.parseAmount(ai.kdv);
        header.grandTotal = header.grandTotal || this.parseAmount(ai.tutar);
      }

      return {
        ...parsed,
        header,
        aiFallback: ai,
        metrics: {
          ...baseMetrics,
          aiFallbackDecision: "used",
          aiFallbackConfidence: Number(ai.confidence || 0),
        },
        warnings: [
          ...(Array.isArray(parsed?.warnings) ? parsed.warnings : []),
          "AI fallback sadece eksik alan önerisi olarak kullanıldı; final öncesi kullanıcı kontrolü gereklidir.",
        ],
      };
    } catch (error: any) {
      return {
        ...parsed,
        metrics: {
          ...baseMetrics,
          aiFallbackDecision: "failed",
          aiFallbackError: this.cleanText(error?.message || "bilinmeyen hata"),
        },
        warnings: [
          ...(Array.isArray(parsed?.warnings) ? parsed.warnings : []),
          "AI fallback çalıştırılamadı; kural tabanlı sonuç ve manuel giriş kullanılacak.",
        ],
      };
    }
  }

  private normalizeDraftHeader(parsed: any, flowType: string) {
    const header =
      parsed?.header && typeof parsed.header === "object" ? parsed.header : {};
    const normalizedDocumentNo = this.cleanText(
      header.documentNo || header.faturaNo || "",
    );
    const normalizedIrsaliyeNo = this.cleanText(
      header.irsaliyeNo || header.dispatchNo || "",
    );
    const modelFromItems = Array.isArray(parsed?.parsedItems)
      ? parsed.parsedItems
          .map((item: any) => this.cleanText(item?.modelAdayi))
          .find(Boolean) || ""
      : "";
    const meta = this.flowMeta(flowType);
    const normalizedFlowType =
      this.normalizeDocumentFlowType(flowType) ||
      this.normalizeDocumentFlowType(parsed?.flowType) ||
      this.normalizeDocumentFlowType(parsed?.workflowType);
    const sellerName = this.cleanText(
      header.companyName || header.saticiFirma || header.sellerName,
    );
    const buyerName = this.cleanText(
      header.customerName || header.aliciFirma || header.buyerName,
    );
    const companyByFlow =
      normalizedFlowType === "GIDEN_FATURA" ||
      normalizedFlowType === "GIDEN_IRSALIYE"
        ? buyerName || sellerName
        : sellerName || buyerName;
    return {
      ...header,
      belgeYonu: this.cleanText(
        header.belgeYonu || meta.belgeYonu,
      ).toLowerCase(),
      belgeTipi: this.cleanText(
        header.belgeTipi || meta.belgeTipi,
      ).toLowerCase(),
      documentNo: normalizedDocumentNo,
      faturaNo: this.cleanText(header.faturaNo || normalizedDocumentNo),
      irsaliyeNo: normalizedIrsaliyeNo,
      dispatchNo: normalizedIrsaliyeNo,
      modelAdi: this.cleanText(header.modelAdi || modelFromItems),
      subtotal: this.parseAmount(header.subtotal),
      kdv: this.parseAmount(header.kdv),
      grandTotal: this.parseAmount(header.grandTotal),
      date: this.cleanText(header.date),
      companyName: companyByFlow,
      sellerName,
      buyerName,
    };
  }

  private parseHeaderFromText(text: string, fallbackCompany = "") {
    const normalized = String(text || "");
    const dateMatch = normalized.match(/\b(\d{2}[./-]\d{2}[./-]\d{4})\b/);
    const dueDateMatch = normalized.match(
      /vade[^\d]*(\d{2}[./-]\d{2}[./-]\d{4})/i,
    );
    const docNoMatch = normalized.match(
      /(?:fatura|belge|evrak)\s*no[^A-Z0-9]*([A-Z0-9-]+)/i,
    );
    const dispatchNoMatch = normalized.match(
      /(?:irsaliye|dispatch)\s*no[^A-Z0-9]*([A-Z0-9-]+)/i,
    );
    const companyTaxNoMatch = normalized.match(
      /(?:vkn|vergi no|tax no)[^0-9]*(\d{10,11})/i,
    );
    const amounts = Array.from(
      normalized.matchAll(/-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g),
    ).map((match) => this.parseAmount(match[0]));
    const grandTotal = amounts.length ? amounts[amounts.length - 1] : 0;
    const kdv = amounts.length > 1 ? amounts[amounts.length - 2] : 0;
    const subtotal =
      amounts.length > 2
        ? amounts[amounts.length - 3]
        : Math.max(0, grandTotal - kdv);
    return {
      documentNo: this.cleanText(docNoMatch?.[1]),
      date: dateMatch?.[1]?.replace(/\./g, "-").replace(/\//g, "-") || "",
      dueDate: dueDateMatch?.[1]?.replace(/\./g, "-").replace(/\//g, "-") || "",
      companyName: this.cleanText(fallbackCompany),
      companyTaxNo: this.cleanText(companyTaxNoMatch?.[1]),
      customerName: "",
      customerTaxNo: "",
      dispatchNo: this.cleanText(dispatchNoMatch?.[1]),
      dispatchDate: "",
      dispatchReferences: [],
      subtotal,
      kdv,
      grandTotal,
      currency: "TRY",
    };
  }

  private buildCandidateRowsFromText(text: string) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => this.cleanText(line))
      .filter(Boolean)
      .map((line, index) => {
        const lower = line.toLocaleLowerCase("tr-TR");
        const rejectReason = this.fakeRowHints.some((token) =>
          lower.includes(token),
        )
          ? "sahte_satir_filtre"
          : "";
        const numbers = Array.from(
          line.matchAll(/-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}|\b\d+\b/g),
        ).map((match) => this.parseAmount(match[0]));
        const looksLikeItem =
          !rejectReason && numbers.length > 0 && line.length > 5;
        return {
          id: `cand_${index + 1}`,
          rawText: line,
          normalizedText: lower,
          score: looksLikeItem ? 0.75 : rejectReason ? 0.2 : 0.45,
          rejectReason,
          looksLikeItem,
          detectedNumbers: numbers,
          detectedUnit: /\b(kg|adet|lt|paket|m|metre)\b/i.exec(line)?.[1] || "",
        };
      });
  }

  private buildParsedItems(candidateRows: any[]) {
    return candidateRows
      .filter((row) => row.looksLikeItem)
      .slice(0, 50)
      .map((row, index) => {
        const quantity = Number(row.detectedNumbers?.[0] || 0);
        const unitPrice = Number(row.detectedNumbers?.[1] || 0);
        const lineTotal = Number(
          row.detectedNumbers?.[2] ||
            (quantity && unitPrice ? quantity * unitPrice : 0),
        );
        return {
          id: `item_${index + 1}`,
          description: row.rawText,
          productCode: "",
          lotNo: "",
          quantity,
          quantity2: 0,
          unit: row.detectedUnit || "ADET",
          unit2: "",
          unitPrice,
          lineTotal,
          discountRate: 0,
          discountAmount: 0,
          kdvRate: 0,
          kdvAmount: 0,
          confidence: row.score,
          needsReview: row.score < 0.8,
          sourceProfile: "simple_single_row",
        };
      });
  }

  private extractDispatchNoFromFileName(fileName: string) {
    const base = this.cleanText(path.parse(fileName || "").name).toUpperCase();
    if (!base) return "";
    // TIA, MNN, RF0, DDM, IUR gibi e-irsaliye prefixleri
    const direct = base.match(/\b([A-Z]{2,6}0?\d{7,})\b/);
    if (direct?.[1]) return this.cleanText(direct[1]);
    const compact = base.replace(/[^A-Z0-9]/g, "");
    const compactMatch = compact.match(/([A-Z]{2,6}0?\d{7,})/);
    return this.cleanText(compactMatch?.[1] || "");
  }

  private parseIncomingDispatchAdet(args: {
    parsedItems: any[];
    candidateRows: any[];
    header: any;
    rawText?: string;
  }) {
    const headerAmount = this.parseAmount(
      args.header?.gelenAdet ||
        args.header?.irsaliyeAdedi ||
        args.header?.belgeAdediToplami ||
        args.header?.toplamAdet ||
        args.header?.adetToplami ||
        args.header?.miktarToplami ||
        args.header?.quantityTotal ||
        args.header?.totalQuantity,
    );
    if (headerAmount > 0) return headerAmount;

    const itemAmount = (Array.isArray(args.parsedItems) ? args.parsedItems : [])
      .map((item) => this.parseAmount(item?.quantity || item?.miktar))
      .reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
    if (itemAmount > 0) return Number(itemAmount.toFixed(3));

    const textPool = [
      ...(Array.isArray(args.candidateRows)
        ? args.candidateRows.map((row) => this.cleanText(row?.rawText))
        : []),
      this.cleanText(args.rawText),
    ]
      .filter(Boolean)
      .join("\n");
    const toplamAdetMatch = textPool.match(
      /(?:toplam\s*adet|adet\s*toplam[ıi]?|belge\s*adedi\s*toplam[ıi]?|toplam\s*miktar)\D{0,20}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)/i,
    );
    if (toplamAdetMatch?.[1]) return this.parseAmount(toplamAdetMatch[1]);

    // "Toplam  4.365 Adet" veya "4.365 Adet" format (e-irsaliye toplam satırı)
    const toplamLineMatch = textPool.match(
      /\bToplam\b[^\n]{0,30}?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)\s*Adet/i,
    );
    if (toplamLineMatch?.[1]) return this.parseAmount(toplamLineMatch[1]);

    const adetMatch = textPool.match(
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)\s*(?:adet|ad\.)\b/i,
    );
    return this.parseAmount(adetMatch?.[1] || 0);
  }

  private cleanIncomingDispatchModelText(value: any) {
    let text = this.cleanText(value)
      .replace(/\b(?:malzeme\s*no|malzeme|açıklama|aciklama)\b\s*:?\s*/gi, "")
      .replace(/^miktar\s+\d+\s+/i, "")
      .replace(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s*(?:adet|ad\.)\b.*$/i, "")
      .replace(/\b(?:adet|ad\.)\b.*$/i, "")
      .replace(/^\d+\s+/, "")
      .trim();

    const tokens = text.split(/\s+/).filter(Boolean);
    if (
      tokens.length > 1 &&
      /^\d{5,}$/.test(tokens[0]) &&
      /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tokens.slice(1).join(" "))
    ) {
      text = tokens.slice(1).join(" ");
    } else if (
      tokens.length > 1 &&
      /^\d{5,}$/.test(tokens[tokens.length - 1]) &&
      /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tokens.slice(0, -1).join(" "))
    ) {
      text = tokens.slice(0, -1).join(" ");
    }

    return this.cleanText(
      text.replace(/\s+\d{6,}\b$/g, "").replace(/^[;:,\-.]+|[;:,\-.]+$/g, ""),
    );
  }

  private extractIncomingDispatchAciklama(args: {
    parsedItems: any[];
    candidateRows: any[];
    rawText?: string;
  }) {
    const parsedItemDescription = (
      Array.isArray(args.parsedItems) ? args.parsedItems : []
    )
      .map((item) =>
        this.cleanText(
          item?.description ||
            item?.rawDescription ||
            item?.aciklama ||
            item?.name,
        ),
      )
      .find(Boolean);
    if (parsedItemDescription) {
      return this.cleanIncomingDispatchModelText(parsedItemDescription);
    }

    const candidateDescription = (
      Array.isArray(args.candidateRows) ? args.candidateRows : []
    )
      .map((row) => this.cleanText(row?.rawText))
      .find(
        (line) =>
          Boolean(line) &&
          /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s*Adet\b/i.test(line) &&
          !/\bToplam\b/i.test(line),
      );
    if (candidateDescription) {
      return this.cleanIncomingDispatchModelText(candidateDescription);
    }

    const compactText = this.cleanText(
      String(args.rawText || "").replace(/\s+/g, " "),
    );
    const singleLineMatch = compactText.match(
      /\b1\s+(\d+)\s+(.+?)\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*Adet\b/i,
    );
    if (singleLineMatch?.[1] && singleLineMatch?.[2]) {
      return this.cleanIncomingDispatchModelText(singleLineMatch[2]);
    }

    return "";
  }

  private extractIncomingDispatchModelSuggestion(args: {
    parsedItems: any[];
    candidateRows: any[];
    rawText?: string;
    header?: any;
  }) {
    const headerSuggestion = this.cleanIncomingDispatchModelText(
      args.header?.modelAdi || args.header?.modelLineSuggestion,
    );
    if (headerSuggestion) return headerSuggestion;

    const parsedSuggestion = (
      Array.isArray(args.parsedItems) ? args.parsedItems : []
    )
      .map((item) =>
        this.cleanIncomingDispatchModelText(
          item?.aciklama ||
            item?.description ||
            item?.rawDescription ||
            item?.malzemeNo ||
            item?.productCode ||
            item?.name,
        ),
      )
      .find((value) => Boolean(value));
    if (parsedSuggestion) return parsedSuggestion;

    const compactText = this.cleanText(
      String(args.rawText || "").replace(/\s+/g, " "),
    );
    const labeledDescription = compactText.match(
      /(?:Açıklama|Aciklama)\s*:?\s*([A-ZÇĞİÖŞÜ0-9.,/_ -]{3,}?)(?=\s+(?:Miktar|Malzeme\s*No|Birim|Teslim|Toplam|$))/i,
    );
    const descriptionSuggestion = this.cleanIncomingDispatchModelText(
      labeledDescription?.[1] || "",
    );
    if (descriptionSuggestion) return descriptionSuggestion;

    const labeledMaterial = compactText.match(
      /(?:Malzeme\s*No|Malzeme)\s*:?\s*([A-ZÇĞİÖŞÜ0-9.,/_ -]{3,}?)(?=\s+(?:Açıklama|Aciklama|Miktar|Birim|Teslim|Toplam|$))/i,
    );
    const materialSuggestion = this.cleanIncomingDispatchModelText(
      labeledMaterial?.[1] || "",
    );
    if (materialSuggestion) return materialSuggestion;

    const candidateSuggestion = (
      Array.isArray(args.candidateRows) ? args.candidateRows : []
    )
      .map((row) => this.cleanIncomingDispatchModelText(row?.rawText))
      .find(
        (value) =>
          Boolean(value) &&
          /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value) &&
          !/\bToplam\b/i.test(value),
      );
    if (candidateSuggestion) return candidateSuggestion;

    return "";
  }

  private extractIncomingDispatchSignals(parsed: any, fileName: string) {
    const header =
      parsed?.header && typeof parsed.header === "object" ? parsed.header : {};
    const parsedItems = Array.isArray(parsed?.parsedItems)
      ? parsed.parsedItems
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];
    const candidateRows = Array.isArray(parsed?.candidateRows)
      ? parsed.candidateRows
      : [];
    const fullText = String(parsed?.rawText || "");

    const irsaliyeNo = this.cleanText(
      header?.irsaliyeNo ||
        header?.dispatchNo ||
        this.extractDispatchNoFromFileName(fileName),
    );
    const parsedCompanyName = this.cleanText(
      header?.companyName ||
        parsed?.parsedCompanyName ||
        parsed?.rawDetectedCompanyName,
    );
    const dispatchDate = this.normalizeDateInput(
      header?.dispatchDate || header?.irsaliyeTarihi || "",
    );
    const documentDate = this.normalizeDateInput(header?.date || "");
    const gelenAdet = this.parseIncomingDispatchAdet({
      parsedItems,
      candidateRows,
      header,
      rawText:
        fullText ||
        candidateRows
          .map((row: any) => this.cleanText(row?.rawText))
          .join("\n"),
    });

    const aciklamaSuggestion =
      this.cleanText(header?.hamAciklama || header?.aciklama) ||
      this.extractIncomingDispatchAciklama({
        parsedItems,
        candidateRows,
        rawText: fullText,
      });
    const fallbackAciklamaSuggestion =
      this.extractIncomingDispatchModelSuggestion({
        parsedItems,
        candidateRows,
        rawText: fullText,
        header,
      });
    const finalAciklamaSuggestion =
      aciklamaSuggestion || fallbackAciklamaSuggestion;

    return {
      parsedCompanyName,
      irsaliyeNo,
      belgeTarihi: dispatchDate || documentDate,
      gelenAdet,
      zeminSuggestion: "",
      modelLineSuggestion: "",
      aciklamaSuggestion: finalAciklamaSuggestion,
    };
  }

  private applyParseModeByFlow(
    parsed: any,
    flowType: string,
    fileName: string,
  ) {
    if (flowType !== "GELEN_IRSALIYE") {
      const isInvoiceFlow = ["GELEN_FATURA", "GIDEN_FATURA"].includes(
        this.normalizeDocumentFlowType(flowType),
      );
      return {
        ...parsed,
        mode: isInvoiceFlow ? "fatura_kalem_modu" : parsed?.mode,
      };
    }

    const signals = this.extractIncomingDispatchSignals(parsed, fileName);
    const parsedSignalCount = [
      signals.parsedCompanyName,
      signals.irsaliyeNo,
      signals.belgeTarihi,
      signals.gelenAdet > 0 ? "adet" : "",
      signals.aciklamaSuggestion,
    ].filter(Boolean).length;
    const incomingLineCount =
      signals.aciklamaSuggestion
        ? 1
        : Math.max(
            Number(parsed?.metrics?.parsedItemCount || 0),
            Number(parsed?.metrics?.candidateLineCount || 0),
          );
    const parseStatus =
      parsedSignalCount >= 5
        ? "TAM_BASARILI"
        : parsedSignalCount > 0
          ? "KISMI_BASARILI"
          : "BASARISIZ";
    const nextHeader = {
      ...(parsed?.header || {}),
      companyName:
        signals.parsedCompanyName ||
        this.cleanText(parsed?.header?.companyName),
      parsedCompanyName: signals.parsedCompanyName,
      irsaliyeNo: signals.irsaliyeNo,
      dispatchNo: signals.irsaliyeNo,
      date:
        signals.belgeTarihi || this.normalizeDateInput(parsed?.header?.date),
      belgeTarihi:
        signals.belgeTarihi || this.normalizeDateInput(parsed?.header?.date),
      gelenAdet: signals.gelenAdet,
      belgeAdediToplami: signals.gelenAdet,
      irsaliyeAdedi: signals.gelenAdet,
      zeminSuggestion: "",
      modelAdi: parsed?.header?.modelAdi || "",
      modelLineSuggestion: "",
      malzemeNo: this.cleanText(parsed?.header?.malzemeNo || ""),
      hamAciklama: this.cleanText(
        parsed?.header?.hamAciklama ||
          parsed?.header?.aciklama ||
          signals.aciklamaSuggestion,
      ),
      belgeHamKod: this.cleanText(
        parsed?.header?.belgeHamKod ||
          parsed?.header?.malzemeNo ||
          signals.aciklamaSuggestion,
      ),
      aciklama: this.cleanText(
        parsed?.header?.aciklama || signals.aciklamaSuggestion,
      ),
    };

    const warnings =
      parsedSignalCount >= 5
        ? (Array.isArray(parsed?.warnings) ? parsed.warnings : []).filter(
            (warning: any) =>
              !/belirsiz satırlar candidateRows içinde bırakıldı/i.test(
                this.cleanText(warning),
              ),
          )
        : [...(Array.isArray(parsed?.warnings) ? parsed.warnings : [])];
    if (!signals.irsaliyeNo) {
      warnings.push(
        "Gelen irsaliye için irsaliye no tespit edilemedi. Manuel kontrol gerekli.",
      );
    }
    if (!signals.gelenAdet) {
      warnings.push(
        "Gelen irsaliye için adet tespit edilemedi. Manuel kontrol gerekli.",
      );
    }

    return {
      ...parsed,
      mode: "gelen_irsaliye_sade_mod",
      parsedCompanyName: signals.parsedCompanyName,
      dispatchNo: signals.irsaliyeNo,
      irsaliyeNo: signals.irsaliyeNo,
      belgeTarihi: signals.belgeTarihi,
      gelenAdet: signals.gelenAdet,
      zeminSuggestion: "",
      modelAdi: "",
      modelLineSuggestion: "",
      aciklamaSuggestion: signals.aciklamaSuggestion,
      parseStatus,
      header: nextHeader,
      parsedItems: [],
      items: [],
      candidateRows: [],
      warnings,
      metrics: {
        ...(parsed?.metrics || {}),
        parsedItemCount: incomingLineCount,
        candidateLineCount: incomingLineCount,
        incomingParsedLineCount: incomingLineCount,
        partialFieldCount: parsedSignalCount,
        parseStatus,
        sadeMode: true,
      },
      needsReview: Boolean(
        !signals.irsaliyeNo || !signals.gelenAdet || warnings.length,
      ),
    };
  }

  private buildFallbackParse(args: {
    text: string;
    fileName: string;
    fileType: string;
    intakeMethod: string;
    sectionKey: string;
    firma: string;
    warnings: string[];
  }) {
    const candidateRows = this.buildCandidateRowsFromText(args.text);
    const parsedItems = this.buildParsedItems(candidateRows);
    const header = this.parseHeaderFromText(args.text, args.firma);
    const textQualityScore = this.scoreTextQuality(args.text);
    const confidenceAverage = parsedItems.length
      ? Number(
          (
            parsedItems.reduce(
              (acc: number, item: any) => acc + Number(item.confidence || 0),
              0,
            ) / parsedItems.length
          ).toFixed(2),
        )
      : 0;
    const parsedTotal = parsedItems.reduce(
      (acc, item) => acc + Number(item.lineTotal || 0),
      0,
    );
    const totalsMatch =
      !header.grandTotal ||
      Math.abs(parsedTotal - Number(header.grandTotal || 0)) <=
        Math.max(5, Number(header.grandTotal || 0) * 0.05);
    const documentClass = "DIGER_PDF_BELGE";
    const mode =
      textQualityScore >= 55 && confidenceAverage >= 0.72 && totalsMatch
        ? "AUTO_READY_MODE"
        : "CANDIDATE_REVIEW_MODE";

    return {
      ok: true,
      fileName: args.fileName,
      fileType: args.fileType,
      intakeMethod: args.intakeMethod,
      documentClass,
      workflowType: this.detectWorkflowType(args.sectionKey, documentClass),
      detectedProfile: "fallback_multiline",
      mode,
      header,
      parsedItems,
      normalizedItems: parsedItems,
      candidateRows,
      rawLineCandidates: candidateRows,
      warnings: args.warnings,
      parseWarnings: args.warnings,
      confidence: confidenceAverage,
      needsReview: mode !== "AUTO_READY_MODE" || candidateRows.length > 0,
      metrics: {
        rawLineCount: String(args.text || "")
          .split(/\r?\n/)
          .filter(Boolean).length,
        candidateLineCount: candidateRows.length,
        parsedItemCount: parsedItems.length,
        confidenceAverage,
        totalsMatch,
        textQualityScore,
      },
    };
  }

  private saveDraftFile(
    draftsDir: string,
    draftId: string,
    payload: Record<string, any>,
  ) {
    const fullPath = path.join(draftsDir, `${draftId}.json`);
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
    return fullPath;
  }

  private ensureDraftMetaConsistency(
    slug: string,
    draftId: string,
    draftPayload: Record<string, any>,
    originalFullPath: string,
    draftFilePath: string,
  ) {
    if (!fs.existsSync(originalFullPath)) {
      this.db.logSystemEvent(
        `Document intake meta error: original file missing for ${slug}/${draftId}`,
      );
      throw new BadRequestException(
        "Belge orijinal dosyası bulunamadı. Yeniden yükleyin.",
      );
    }
    if (!fs.existsSync(draftFilePath)) {
      this.db.logSystemEvent(
        `Document intake meta error: draft json missing for ${slug}/${draftId}`,
      );
      throw new BadRequestException(
        "Belge taslak meta dosyası oluşturulamadı. Yeniden deneyin.",
      );
    }
    const readBack = this.readDraftJson(slug, draftId);
    if (
      !readBack?.draftId ||
      !readBack?.originalRelativePath ||
      !readBack?.previewUrl
    ) {
      this.db.logSystemEvent(
        `Document intake meta error: draft json incomplete for ${slug}/${draftId}`,
      );
      throw new BadRequestException(
        "Belge taslağı eksik meta ile oluştu. Yeniden deneyin.",
      );
    }
    return {
      ...draftPayload,
      needsReview: Boolean(readBack.needsReview),
    };
  }

  resolveDraftJsonPath(slug: string, draftId: string) {
    const { draftsDir } = this.ensureUploadDirs(slug);
    return path.join(draftsDir, `${draftId}.json`);
  }

  readDraftJson(slug: string, draftId: string) {
    const fullPath = this.resolveDraftJsonPath(slug, draftId);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  }

  async intakeUploadedDocument(payload: {
    file: any;
    mainCompanySlug: string;
    firma?: string;
    sectionKey?: string;
    flowType?: string;
    workflowType?: string;
    documentClass?: string;
    modelKaydiId?: string;
    modelAdi?: string;
    storeOnly?: boolean;
  }) {
    const mainCompanySlug = this.cleanText(payload.mainCompanySlug);
    if (!mainCompanySlug) {
      throw new BadRequestException("mainCompanySlug zorunludur.");
    }
    const resolved = this.db.resolveMainCompany(undefined, mainCompanySlug);
    if (!resolved?.slug || resolved.slug !== mainCompanySlug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. Belge intake işlemi durduruldu.",
      );
    }
    const normalizedSectionKey = this.cleanText(payload.sectionKey);
    const sectionKey =
      normalizedSectionKey === "bizim-belgeler"
        ? "bizim-belgeler"
        : normalizedSectionKey === "irsaliye-fatura"
          ? "irsaliye-fatura"
          : "alis-gider-belgeleri";
    const fileType = this.detectFileType(payload.file);
    if (fileType === "unknown") {
      throw new Error(
        "Desteklenmeyen dosya türü. PDF, JPG, JPEG veya PNG yükleyin.",
      );
    }

    const draftId = this.makeDraftId();
    const dirs = this.ensureUploadDirs(mainCompanySlug);
    const extension =
      path.extname(
        payload.file?.originalname || payload.file?.filename || "",
      ) || (fileType === "pdf" ? ".pdf" : ".png");
    const tempParsedName = `${draftId}-${this.sanitizeFilePart(path.parse(payload.file?.originalname || "belge").name)}${extension}`;
    const tempInputPath = payload.file.path;

    let parsed: any;
    const warnings: string[] = [];

    if (fileType === "pdf") {
      try {
        const raw = await this.belgeService.parseUploadedPdf(
          {
            ...payload.file,
            path: tempInputPath,
            filename: tempParsedName,
            originalname: payload.file?.originalname || tempParsedName,
          },
          payload.firma || "",
        );
        const normalized = this.muhasebeService.withCtx(mainCompanySlug, () =>
          this.muhasebeService.normalizePdfParseResult(
            raw,
            payload.file?.originalname || tempParsedName,
          ),
        );
        const textQualityScore = Number(
          normalized?.metrics?.textQualityScore ||
            normalized?.metrics?.avgConfidence ||
            0,
        );
        const shouldTryOcr = this.shouldAttemptOcrForPdf(normalized);
        const ocrResult = shouldTryOcr
          ? this.tryOcrText(tempInputPath)
          : {
              text: "",
              attempted: false,
              available: false,
              used: false,
              warning: "",
            };
        if (ocrResult.warning) {
          this.db.logSystemEvent(`PDF OCR warning: ${ocrResult.warning}`);
        }

        let normalizedFromOcr: any = null;
        if (ocrResult.used && this.cleanText(ocrResult.text)) {
          const ocrRaw = this.belgeService.parseTextDocument(
            payload.file?.originalname || tempParsedName,
            ocrResult.text,
            payload.firma || "",
            {
              ocrAttempted: true,
              ocrAvailable: ocrResult.available,
              ocrUsed: true,
            },
          );
          normalizedFromOcr = this.muhasebeService.withCtx(
            mainCompanySlug,
            () =>
              this.muhasebeService.normalizePdfParseResult(
                ocrRaw,
                payload.file?.originalname || tempParsedName,
              ),
          );
        }

        const bestNormalized = normalizedFromOcr
          ? this.pickBetterParse(normalized, normalizedFromOcr)
          : normalized;
        const ocrWasSelected = Boolean(
          normalizedFromOcr && bestNormalized === normalizedFromOcr,
        );
        parsed = {
          ok: true,
          fileName: payload.file?.originalname || tempParsedName,
          fileType,
          intakeMethod: ocrWasSelected
            ? "pdf_ocr"
            : textQualityScore >= 55
              ? "pdf_text"
              : "pdf_ocr",
          documentClass:
            payload.documentClass ||
            bestNormalized.documentClass ||
            "DIGER_PDF_BELGE",
          workflowType:
            payload.workflowType ||
            bestNormalized.workflowType ||
            this.detectWorkflowType(sectionKey, bestNormalized.documentClass),
          parseSource:
            this.cleanText(bestNormalized.parseSource || "") ||
            "text_layer_rule_based",
          confidence: Number(bestNormalized.metrics?.avgConfidence || 0),
          needsReview: Boolean(bestNormalized.needsReview),
          detectedProfile: bestNormalized.detectedProfile,
          mode: bestNormalized.mode,
          header: bestNormalized.header,
          rawText: bestNormalized.rawText || raw?.rawText || "",
          rawDetectedCompanyName:
            bestNormalized.rawDetectedCompanyName ||
            bestNormalized.header?.companyName ||
            "",
          matchedCompanyId: bestNormalized.matchedCompanyId || "",
          matchedCompanyName: bestNormalized.matchedCompanyName || "",
          parsedItems: bestNormalized.parsedItems,
          normalizedItems:
            bestNormalized.normalizedItems || bestNormalized.parsedItems || [],
          candidateRows: bestNormalized.candidateRows,
          rawLineCandidates:
            bestNormalized.rawLineCandidates ||
            bestNormalized.candidateRows ||
            [],
          warnings: bestNormalized.warnings || [],
          parseWarnings:
            bestNormalized.parseWarnings || bestNormalized.warnings || [],
          extractorUsed: raw?.extractorUsed || bestNormalized.extractorUsed,
          ocrAttempted: ocrResult.attempted,
          ocrAvailable: ocrResult.available,
          ocrUsed: ocrWasSelected,
          metrics: {
            rawLineCount:
              Number(bestNormalized.metrics?.itemCount || 0) +
              Number(bestNormalized.metrics?.candidateCount || 0),
            candidateLineCount: Number(
              bestNormalized.metrics?.candidateCount || 0,
            ),
            parsedItemCount: Number(bestNormalized.metrics?.itemCount || 0),
            rawLineCandidateCount: Number(
              bestNormalized.metrics?.rawLineCandidateCount ||
                bestNormalized.rawLineCandidates?.length ||
                0,
            ),
            confidenceAverage: Number(
              bestNormalized.metrics?.avgConfidence || 0,
            ),
            totalsMatch: Number(bestNormalized.metrics?.totalsDiff || 999) < 5,
            textQualityScore,
            ocrAttempted: ocrResult.attempted,
            ocrAvailable: ocrResult.available,
            ocrUsed: ocrWasSelected,
          },
        };
        if (ocrResult.attempted && !ocrResult.available) {
          parsed.warnings = [
            ...parsed.warnings,
            "OCR fallback tetiklendi ancak tesseract erişilebilir değil.",
          ];
        }
        if (ocrResult.attempted && ocrResult.available && !ocrResult.used) {
          parsed.warnings = [
            ...parsed.warnings,
            "OCR fallback çalıştı ancak anlamlı metin üretmedi.",
          ];
        }
        if (parsed.intakeMethod === "pdf_ocr") {
          parsed.warnings = [
            ...parsed.warnings,
            "PDF metin kalitesi düşük. OCR fallback mantığına düşüldü; final kayıt için manuel onay zorunlu.",
          ];
        }
      } catch (error: any) {
        const ocrResult = this.tryOcrText(tempInputPath);
        if (ocrResult.warning) {
          this.db.logSystemEvent(
            `PDF parse sonrası OCR warning: ${ocrResult.warning}`,
          );
        }
        warnings.push(
          `PDF parse başarısız: ${this.cleanText(error?.message || "bilinmeyen hata")}`,
        );
        parsed = this.buildFallbackParse({
          text: ocrResult.text,
          fileName: payload.file?.originalname || tempParsedName,
          fileType,
          intakeMethod: "pdf_ocr",
          sectionKey,
          firma: payload.firma || "",
          warnings: [
            ...warnings,
            this.cleanText(ocrResult.text)
              ? "PDF parse başarısız olduğu için OCR fallback ile taslak üretildi."
              : "Belgeden metin çıkarılamadı. Önizleme var ancak alanlar manuel kontrol gerektirir.",
            "Belge kaybı önlendi. PDF parse edilemese de taslak oluşturuldu.",
            ...(ocrResult.warning ? [ocrResult.warning] : []),
          ],
        });
        parsed.ocrAttempted = ocrResult.attempted;
        parsed.ocrAvailable = ocrResult.available;
        parsed.ocrUsed = ocrResult.used;
        parsed.parseWarnings = parsed.warnings || [];
      }
    } else {
      const ocrResult = this.tryOcrText(tempInputPath);
      if (ocrResult.warning) {
        this.db.logSystemEvent(`Image OCR warning: ${ocrResult.warning}`);
      }
      const parsedDoc = this.belgeService.parseTextDocument(
        payload.file?.originalname || tempParsedName,
        ocrResult.text,
        payload.firma || "",
        {
          ocrAttempted: ocrResult.attempted,
          ocrAvailable: ocrResult.available,
          ocrUsed: ocrResult.used,
        },
      );
      const parsedDocAny: any = parsedDoc as any;
      parsed = {
        ok: true,
        fileName: payload.file?.originalname || tempParsedName,
        fileType,
        intakeMethod: "image_ocr",
        documentClass: parsedDoc.documentClass,
        workflowType: parsedDoc.workflowType,
        parseSource:
          this.cleanText(parsedDocAny.parseSource || "") ||
          "ocr_fallback_rule_based",
        confidence: Number(parsedDocAny.confidence || 0),
        needsReview: Boolean(parsedDocAny.needsReview),
        detectedProfile: parsedDoc.detectedProfile,
        mode: parsedDoc.mode,
        header: parsedDoc.header,
        rawText: parsedDocAny.rawText || ocrResult.text || "",
        rawDetectedCompanyName:
          parsedDocAny.rawDetectedCompanyName ||
          parsedDoc.header?.companyName ||
          "",
        matchedCompanyId: parsedDocAny.matchedCompanyId || "",
        matchedCompanyName: parsedDocAny.matchedCompanyName || "",
        parsedItems: parsedDoc.parsedItems || parsedDoc.items || [],
        normalizedItems:
          parsedDoc.normalizedItems ||
          parsedDoc.parsedItems ||
          parsedDoc.items ||
          [],
        rawLineCandidates:
          parsedDoc.rawLineCandidates || parsedDoc.candidateRows || [],
        candidateRows: parsedDoc.candidateRows || [],
        warnings: parsedDoc.warnings || [],
        parseWarnings: parsedDoc.parseWarnings || parsedDoc.warnings || [],
        extractorUsed: parsedDoc.extractorUsed,
        ocrAttempted: ocrResult.attempted,
        ocrAvailable: ocrResult.available,
        ocrUsed: ocrResult.used,
        metrics: {
          rawLineCount: Number(parsedDoc.metrics?.rawLineCount || 0),
          candidateLineCount: Number(
            parsedDoc.metrics?.candidateLineCount || 0,
          ),
          parsedItemCount: Number(parsedDoc.metrics?.parsedItemCount || 0),
          confidenceAverage: Number(parsedDoc.metrics?.confidenceAverage || 0),
          totalsMatch: Boolean(parsedDoc.metrics?.totalsMatch),
          textQualityScore: Number(parsedDoc.metrics?.textQualityScore || 0),
        },
      };
      if (!this.cleanText(ocrResult.text)) {
        parsed.warnings = [
          ...parsed.warnings,
          "Görsel için OCR sonucu zayıf veya boş döndü. Belge taslağı yine de oluşturuldu.",
        ];
      }
      parsed.documentClass = payload.documentClass || parsed.documentClass;
      parsed.workflowType =
        payload.workflowType ||
        parsed.workflowType ||
        this.detectWorkflowType(sectionKey, parsed.documentClass);
    }

    const selectedFlowType =
      this.normalizeDocumentFlowType(payload.flowType) ||
      this.normalizeDocumentFlowType(payload.workflowType) ||
      this.normalizeDocumentFlowType(parsed.workflowType) ||
      this.deriveFlowTypeFromClass(parsed.documentClass);
    if (!selectedFlowType) {
      throw new BadRequestException(
        "Belge yönü/tipi belirlenemedi. Yükleme sırasında 4 tipten birini seçin.",
      );
    }

    const collections = this.ensureParsedCollections(parsed);
    const normalizedHeader = this.normalizeDraftHeader(
      parsed,
      selectedFlowType,
    );
    parsed = {
      ...parsed,
      parsedItems: collections.parsedItems,
      normalizedItems:
        Array.isArray(parsed?.normalizedItems) && parsed.normalizedItems.length
          ? parsed.normalizedItems
          : collections.parsedItems,
      items: collections.parsedItems,
      candidateRows: collections.candidateRows,
      rawLineCandidates:
        Array.isArray(parsed?.rawLineCandidates) &&
        parsed.rawLineCandidates.length
          ? parsed.rawLineCandidates
          : collections.candidateRows,
      parseWarnings:
        Array.isArray(parsed?.parseWarnings) && parsed.parseWarnings.length
          ? parsed.parseWarnings
          : Array.isArray(parsed?.warnings)
            ? parsed.warnings
            : [],
      header: normalizedHeader,
      parsedCompanyName:
        this.cleanText(parsed?.parsedCompanyName) ||
        this.cleanText(normalizedHeader.companyName),
      rawDetectedCompanyName:
        this.cleanText(parsed?.rawDetectedCompanyName) ||
        this.cleanText(normalizedHeader.companyName),
    };
    parsed = this.applyParseModeByFlow(
      parsed,
      selectedFlowType,
      payload.file?.originalname || tempParsedName,
    );
    parsed = await this.runAiFallbackIfNeeded(parsed, selectedFlowType);
    parsed = this.applyParseModeByFlow(
      parsed,
      selectedFlowType,
      payload.file?.originalname || tempParsedName,
    );

    const resolvedFirmaName =
      this.cleanText(parsed?.matchedCompanyName) ||
      this.cleanText(parsed?.rawDetectedCompanyName) ||
      this.cleanText(parsed?.parsedCompanyName) ||
      this.cleanText(parsed?.header?.companyName) ||
      this.cleanText(payload.firma) ||
      "";
    const firmaForFolder = resolvedFirmaName;
    if (!firmaForFolder) {
      throw new BadRequestException(
        "Belge klasörleme için firma zorunludur. Önce firma seçip tekrar yükleyin.",
      );
    }

    const documentNoForFile =
      parsed?.header?.documentNo ||
      parsed?.header?.faturaNo ||
      parsed?.header?.irsaliyeNo ||
      parsed?.header?.dispatchNo;
    const modelNameForFile =
      this.cleanText(payload.modelAdi) ||
      this.cleanText(parsed?.header?.modelAdi) ||
      this.cleanText(parsed?.modelAdi) ||
      this.cleanText(parsed?.modelLineSuggestion) ||
      this.cleanText(parsed?.header?.modelLineSuggestion) ||
      this.extractModelNameFromFileName(
        payload.file?.originalname || tempParsedName,
        documentNoForFile,
      );
    if (
      (selectedFlowType === "GIDEN_FATURA" ||
        selectedFlowType === "GIDEN_IRSALIYE") &&
      modelNameForFile
    ) {
      parsed.header = {
        ...(parsed.header || {}),
        modelAdi: this.cleanText(parsed?.header?.modelAdi) || modelNameForFile,
      };
      if (
        Array.isArray(parsed.parsedItems) &&
        parsed.parsedItems.length === 1
      ) {
        parsed.parsedItems = parsed.parsedItems.map((item: any) => ({
          ...item,
          modelAdayi: modelNameForFile,
          modelAdi: modelNameForFile,
        }));
        parsed.items = parsed.parsedItems;
        parsed.normalizedItems = parsed.parsedItems;
      }
    }
    const secondaryLabel =
      selectedFlowType === "GELEN_FATURA"
        ? resolvedFirmaName
        : modelNameForFile || resolvedFirmaName;
    const targetFileName = this.buildDocumentFileName({
      draftId,
      extension,
      documentNo: documentNoForFile,
      secondaryLabel,
      fallbackName: payload.file?.originalname || tempParsedName,
    });
    const originalFullPath = this.resolveTargetDocumentPath({
      mainCompanySlug,
      firma: firmaForFolder,
      flowType: selectedFlowType,
      fileName: targetFileName,
    });
    this.moveFile(tempInputPath, originalFullPath);

    if (payload.storeOnly) {
      return {
        ok: true,
        storeOnly: true,
        fileName: payload.file?.originalname || tempParsedName,
        originalFileName: payload.file?.originalname || tempParsedName,
        originalStoredName: targetFileName,
        originalRelativePath: path
          .relative(process.cwd(), originalFullPath)
          .replace(/\\/g, "/"),
        originalFullPath: originalFullPath.replace(/\\/g, "/"),
        flowType: selectedFlowType,
        documentClass: parsed?.documentClass || payload.documentClass || "",
        header: {
          ...(parsed?.header || {}),
          modelAdi: modelNameForFile || parsed?.header?.modelAdi || "",
        },
        modelAdi: modelNameForFile || "",
        message: "Dosya ilgili klasöre kaydedildi.",
      };
    }

    const needsReview =
      String(parsed.mode || "")
        .toUpperCase()
        .includes("REVIEW") ||
      Boolean(parsed.warnings?.length) ||
      Boolean(parsed.candidateRows?.length) ||
      Number(parsed.metrics?.confidenceAverage || 0) < 0.75;
    const previewUrl = `/muhasebe/documents/preview?mainCompanySlug=${encodeURIComponent(mainCompanySlug)}&draftId=${encodeURIComponent(draftId)}`;
    const draftPayload = {
      ...parsed,
      gelenAdet:
        Number(
          parsed?.gelenAdet ||
            parsed?.header?.gelenAdet ||
            parsed?.header?.belgeAdediToplami ||
            parsed?.header?.irsaliyeAdedi ||
            0,
        ) || 0,
      draftId,
      documentId: draftId,
      sourceTab: sectionKey,
      status: "TASLAK",
      originalFileName: payload.file?.originalname || tempParsedName,
      originalStoredName: targetFileName,
      originalRelativePath: path
        .relative(process.cwd(), originalFullPath)
        .replace(/\\/g, "/"),
      originalFullPath: originalFullPath.replace(/\\/g, "/"),
      previewUrl,
      needsReview,
      flowType: selectedFlowType,
      createdAt: new Date().toISOString(),
    };

    const draftFilePath = this.saveDraftFile(
      dirs.draftsDir,
      draftId,
      draftPayload,
    );

    let savedDocument: any = null;
    try {
      savedDocument = this.muhasebeService.withCtx(mainCompanySlug, () =>
        this.muhasebeService.saveBelge({
          documentId: draftId,
          modelKaydiId: this.cleanText(payload.modelKaydiId || ""),
          documentType:
            sectionKey === "alis-gider-belgeleri"
              ? "ALIS_GIDER"
              : draftPayload.workflowType,
          documentClass: draftPayload.documentClass,
          workflowType: draftPayload.workflowType,
          companyType: "RESMI",
          firma:
            draftPayload.matchedCompanyName ||
            draftPayload.rawDetectedCompanyName ||
            draftPayload.header?.companyName ||
            payload.firma ||
            "",
          rawDetectedCompanyName: draftPayload.rawDetectedCompanyName || "",
          matchedCompanyId: draftPayload.matchedCompanyId || "",
          matchedCompanyName: draftPayload.matchedCompanyName || "",
          sourceType: "PARSE",
          sourceTab: sectionKey,
          pdfFileName: draftPayload.originalFileName,
          status: "TASLAK",
          header: draftPayload.header,
          items: draftPayload.parsedItems,
          parsedItems: draftPayload.parsedItems,
          candidateRows: draftPayload.candidateRows,
          warnings: draftPayload.warnings,
          metrics: {
            ...draftPayload.metrics,
            flowType: selectedFlowType,
            fileType: draftPayload.fileType,
            intakeMethod: draftPayload.intakeMethod,
            previewUrl,
            draftFilePath: draftFilePath.replace(/\\/g, "/"),
            originalRelativePath: draftPayload.originalRelativePath,
            originalFullPath: draftPayload.originalFullPath,
          },
          detectedProfile: draftPayload.detectedProfile,
        }),
      );
    } catch (error: any) {
      throw new BadRequestException(
        `Belge parse edildi ancak taslağa kaydedilemedi: ${this.cleanText(error?.message || "bilinmeyen hata")}`,
      );
    }

    return this.ensureDraftMetaConsistency(
      mainCompanySlug,
      draftId,
      {
        ...draftPayload,
        gelenAdet:
          Number(
            savedDocument?.header?.gelenAdet ||
              savedDocument?.header?.belgeAdediToplami ||
              savedDocument?.header?.irsaliyeAdedi ||
              draftPayload?.gelenAdet ||
              0,
          ) || 0,
        firma:
          savedDocument?.firma ||
          draftPayload?.matchedCompanyName ||
          draftPayload?.firma ||
          payload.firma ||
          "",
        rawDetectedCompanyName:
          savedDocument?.rawDetectedCompanyName ||
          draftPayload?.rawDetectedCompanyName ||
          draftPayload?.header?.companyName ||
          "",
        matchedCompanyId:
          savedDocument?.matchedCompanyId ||
          draftPayload?.matchedCompanyId ||
          "",
        matchedCompanyName:
          savedDocument?.matchedCompanyName ||
          draftPayload?.matchedCompanyName ||
          "",
        firmaEslesmeTipi:
          savedDocument?.firmaEslesmeTipi ||
          draftPayload?.firmaEslesmeTipi ||
          "",
        parsedItems: Array.isArray(savedDocument?.items)
          ? savedDocument.items
          : draftPayload.parsedItems,
        items: Array.isArray(savedDocument?.items)
          ? savedDocument.items
          : draftPayload.items,
        warnings: Array.isArray(savedDocument?.warnings)
          ? savedDocument.warnings
          : draftPayload.warnings,
        metrics: {
          ...(draftPayload.metrics || {}),
          ...(savedDocument?.metrics || {}),
        },
      },
      originalFullPath,
      draftFilePath,
    );
  }
}
