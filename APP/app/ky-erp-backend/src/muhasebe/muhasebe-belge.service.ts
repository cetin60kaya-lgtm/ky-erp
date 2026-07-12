import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PdfExtractionService } from "./pdf-extraction.service";

type DocumentClass =
  | "FATURA"
  | "IRSALIYE"
  | "IRSALIYE_YERINE_GECEN_FATURA"
  | "ALIS_GIDER_BELGESI"
  | "DIGER_PDF_BELGE";

type WorkflowType =
  | "GELEN_ALIS_FATURASI"
  | "GELEN_IRSALIYE"
  | "BIZIM_IRSALIYE"
  | "BIZIM_FATURA"
  | "GIDER_BELGESI";

type ParseProfile =
  | "URAS_PROFILE"
  | "AVRASYA_PROFILE"
  | "SIMPLE_SINGLE_ROW_PROFILE";

type Mode = "AUTO_PARSE_MODE" | "CANDIDATE_REVIEW_MODE";

type CandidateRow = {
  id: string;
  rawText: string;
  normalizedText: string;
  score: number;
  detectedNumbers: number[];
  detectedUnit: string;
  looksLikeItem: boolean;
  rejectReason?: string;
};

type ParsedDocumentItem = {
  id: string;
  rowNo: number;
  description: string;
  productCode: string;
  lotNo: string;
  quantity: number;
  quantity2: number;
  unit: string;
  unit2: string;
  unitPrice: number;
  lineTotal: number;
  discountRate: number;
  discountAmount: number;
  kdvRate: number;
  kdvAmount: number;
  confidence: number;
  needsReview: boolean;
  sourceProfile: ParseProfile;
  modelAdayi?: string;
};

type HeaderModel = {
  documentClass: DocumentClass;
  workflowType: WorkflowType;
  documentNo: string;
  invoiceNo: string;
  date: string;
  invoiceDate: string;
  issueDate: string;
  dueDate: string;
  sellerName: string;
  buyerName: string;
  companyName: string;
  companyTaxNo: string;
  customerName: string;
  customerTaxNo: string;
  dispatchNo: string;
  dispatchDate: string;
  dispatchReferences: string[];
  dispatchDocumentNo?: string;
  dispatchDocumentDate?: string;
  dispatchNoRaw?: string;
  taxOffice?: string;
  invoiceNoRaw?: string;
  invoiceDateRaw?: string;
  dispatchDateRaw?: string;
  buyerTaxOffice?: string;
  sellerTaxOffice?: string;
  subtotal: number;
  kdv: number;
  grandTotal: number;
  currency: string;
  warnings: string[];
};

type ParseMetrics = {
  rawLineCount: number;
  candidateLineCount: number;
  parsedItemCount: number;
  rawLineCandidateCount?: number;
  totalsMatch: boolean;
  confidenceAverage: number;
  textQualityScore: number;
  sellerAnchor?: number;
  buyerAnchor?: number;
  sayinAnchor?: number;
  tableStart?: number;
  totalsAnchor?: number;
  sellerBlockLineCount?: number;
  buyerBlockLineCount?: number;
};

type ParseResponse = {
  ok: boolean;
  fileName: string;
  rawText?: string;
  detectedProfile: ParseProfile;
  documentClass: DocumentClass;
  workflowType: WorkflowType;
  mode: Mode;
  header: HeaderModel;
  items: ParsedDocumentItem[];
  normalizedItems?: ParsedDocumentItem[];
  parsedItems: ParsedDocumentItem[];
  candidateRows: CandidateRow[];
  rawLineCandidates?: CandidateRow[];
  warnings: string[];
  parseWarnings?: string[];
  metrics: ParseMetrics;
  extractorUsed?: "pdf-parse" | "pdfjs-dist";
  ocrAttempted?: boolean;
  ocrAvailable?: boolean;
  ocrUsed?: boolean;
  belgeNo?: string;
  faturaNo?: string;
  irsaliyeNo?: string;
  belgeTarihi?: string;
  parsedCompanyName?: string;
  araToplam?: number;
  kdv?: number;
  genelToplam?: number;
  gelenAdet?: number;
  parseStatus?: "TAM_BASARILI" | "KISMI_BASARILI" | "BASARISIZ";
  confidence?: number;
  needsReview?: boolean;
  parseSource?: "text_layer_rule_based";
};

const FAKE_ROW_KEYWORDS = [
  "miktar",
  "birim",
  "ürün kodu",
  "urun kodu",
  "lot no",
  "birim fiyat",
  "kdv oranı",
  "kdv orani",
  "kdv tutarı",
  "kdv tutari",
  "toplam tutar",
  "mal hizmet toplam tutarı",
  "mal hizmet toplam tutari",
  "toplam miktar",
  "genel toplam",
  "ödenecek tutar",
  "odenecek tutar",
  "hesaplanan kdv",
  "vergiler dahil toplam tutar",
  "usd kuru",
  "eur kuru",
  "odeme sekli",
  "odeme kosullari",
  "son odeme tarihi",
  "ilave dokumanlar",
  "banka",
  "eur :",
  "vade tarihi:",
  "delivery",
  "ticari sicil",
  "mersis",
  "yalnız",
  "yalniz",
  "irsaliye yerine geçer",
  "bakiyeniz:",
  "iban",
] as const;

const TABLE_STOP_KEYWORDS = [
  "mal hizmet toplam tutarı",
  "mal hizmet toplam tutari",
  "genel toplam",
  "ödenecek tutar",
  "vergiler dahil toplam tutar",
  "vade tarihi:",
  "bakiyeniz:",
  "iban",
  "delivery",
  "ticari sicil",
  "mersis",
  "yalnız",
  "yalniz",
  "t.iş bankası",
  "t.is bankasi",
  "vadesinde ödenmeyen",
  "senaryo",
  "fatura notu",
  "usd kuru",
  "eur kuru",
  "odeme sekli",
  "odeme kosullari",
  "son odeme tarihi",
  "ilave dokumanlar",
  "banka",
  "swift",
] as const;

@Injectable()
export class MuhasebeBelgeService {
  private readonly pdfDir = path.join(
    process.cwd(),
    "uploads",
    "muhasebe",
    "pdf-documents",
  );

  constructor(private readonly pdfExtraction: PdfExtractionService) {
    fs.mkdirSync(this.pdfDir, { recursive: true });
  }

  private makeId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private sanitizeInlineText(value: string) {
    return String(value || "")
      .replace(/[\u0000-\u001F]/g, " ")
      .replace(/[\u00A0\u202F\u2007]/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeText(value: string) {
    return this.sanitizeInlineText(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c");
  }

  private toNumber(value: string | number | undefined | null) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "")
      .replace(/\s+/g, "")
      .replace(/[^0-9,.-]/g, "");
    if (!cleaned) return 0;
    if (cleaned.includes(",") && cleaned.includes(".")) {
      return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
    }
    if (cleaned.includes(",")) return Number(cleaned.replace(",", ".")) || 0;
    // Turkish thousands separator: "9.325" -> 9325, "1.234.567" -> 1234567
    if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
      return Number(cleaned.replace(/\./g, "")) || 0;
    }
    return Number(cleaned) || 0;
  }

  private onlyAmountMatches(text: string) {
    return Array.from(
      String(text || "").matchAll(/(\d[\d.]*,\d{2,3})\s*TL/gi),
    ).map((match) => this.toNumber(match[1]));
  }

  private allNumberMatches(text: string) {
    return Array.from(
      String(text || "").matchAll(/-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{2})?/g),
    ).map((match) => this.toNumber(match[0]));
  }

  private normalizeDate(raw: string) {
    const text = this.sanitizeInlineText(raw)
      .replace(/[^0-9.\/-]/g, " ")
      .trim();
    if (!text) return "";
    const compact = text.replace(/\s+/g, "");
    if (/^\d{8}$/.test(compact)) {
      const yearFirstMonth = Number(compact.slice(4, 6));
      const yearFirstDay = Number(compact.slice(6, 8));
      if (
        /^20\d{6}$/.test(compact) &&
        yearFirstMonth >= 1 &&
        yearFirstMonth <= 12 &&
        yearFirstDay >= 1 &&
        yearFirstDay <= 31
      ) {
        return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
      }
      return `${compact.slice(4, 8)}-${compact.slice(2, 4)}-${compact.slice(0, 2)}`;
    }
    const match = compact.match(/(\d{2})[./-]?(\d{2})[./-]?(\d{4})/);
    if (!match) return "";
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  private isValidIsoDate(value: string) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return (
      year >= 2000 &&
      year <= 2100 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    );
  }

  private computeTextQuality(lines: string[]) {
    const joined = lines.join(" ");
    if (!joined.trim()) return 0;
    const alphaNum = (joined.match(/[A-Za-zÇĞİÖŞÜçğıöşü0-9]/g) || []).length;
    const ratio = alphaNum / Math.max(joined.length, 1);
    const lineScore = Math.min(1, lines.length / 80);
    return Number(((ratio * 0.65 + lineScore * 0.35) * 100).toFixed(2));
  }

  private isFakeRow(line: string) {
    const normalized = this.normalizeText(line);
    if (!normalized) return true;
    if (normalized.startsWith("-- ")) return true;
    return FAKE_ROW_KEYWORDS.some((token) => normalized.includes(token));
  }

  private shouldStopTable(line: string) {
    const normalized = this.normalizeText(line);
    return TABLE_STOP_KEYWORDS.some((token) => normalized.includes(token));
  }

  private async extractPdfText(filePath: string) {
    return this.pdfExtraction.extractTextFromPdf(filePath);
  }

  private splitLines(rawText: string) {
    return String(rawText || "")
      .split(/\r?\n/)
      .map((line) => this.sanitizeInlineText(line))
      .filter(Boolean)
      .filter((line) => !/^--\s+\d+\s+of\s+\d+\s+--$/i.test(line));
  }

  private detectProfile(lines: string[], fileName: string): ParseProfile {
    const joined = this.normalizeText(lines.join(" \n "));
    const normalizedFile = this.normalizeText(fileName);
    if (
      joined.includes("urun kodu mal hizmet") ||
      joined.includes(" lot no") ||
      joined.includes(" ur02.") ||
      joined.includes(" ub02.") ||
      joined.includes(" urb")
    ) {
      return "URAS_PROFILE";
    }
    if (
      joined.includes("avrasya mh dijital") ||
      joined.includes("sira no mal hizmet")
    ) {
      return "AVRASYA_PROFILE";
    }
    if (normalizedFile.includes("urs") || normalizedFile.includes("uras")) {
      return "URAS_PROFILE";
    }
    if (normalizedFile.includes("adg") || normalizedFile.includes("avrasya")) {
      return "AVRASYA_PROFILE";
    }
    return "SIMPLE_SINGLE_ROW_PROFILE";
  }

  private detectDocumentClass(
    lines: string[],
    fileName: string,
  ): DocumentClass {
    const joined = this.normalizeText(`${fileName} ${lines.join(" ")}`);
    if (joined.includes("irsaliye yerine gecer"))
      return "IRSALIYE_YERINE_GECEN_FATURA";
    if (joined.includes("fatura no") || joined.includes("efatura"))
      return "FATURA";
    if (joined.includes("irsaliye no")) return "IRSALIYE";
    return "DIGER_PDF_BELGE";
  }

  private workflowFor(
    documentClass: DocumentClass,
    profile: ParseProfile,
  ): WorkflowType {
    if (documentClass === "IRSALIYE") return "GELEN_IRSALIYE";
    if (documentClass === "FATURA" && profile === "SIMPLE_SINGLE_ROW_PROFILE") {
      return "GELEN_ALIS_FATURASI";
    }
    return "GELEN_ALIS_FATURASI";
  }

  private createEmptyHeader(): HeaderModel {
    return {
      documentClass: "DIGER_PDF_BELGE",
      workflowType: "GELEN_ALIS_FATURASI",
      documentNo: "",
      invoiceNo: "",
      date: new Date().toISOString().slice(0, 10),
      invoiceDate: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      sellerName: "",
      buyerName: "",
      companyName: "",
      companyTaxNo: "",
      customerName: "",
      customerTaxNo: "",
      dispatchNo: "",
      dispatchDate: "",
      dispatchDocumentNo: "",
      dispatchDocumentDate: "",
      dispatchNoRaw: "",
      taxOffice: "",
      invoiceNoRaw: "",
      invoiceDateRaw: "",
      dispatchDateRaw: "",
      buyerTaxOffice: "",
      sellerTaxOffice: "",
      dispatchReferences: [],
      subtotal: 0,
      kdv: 0,
      grandTotal: 0,
      currency: "TRY",
      warnings: [],
    };
  }

  private parseHeader(
    lines: string[],
    fallbackFirma: string,
    documentClass: DocumentClass,
    workflowType: WorkflowType,
  ) {
    const header = this.createEmptyHeader();
    header.documentClass = documentClass;
    header.workflowType = workflowType;
    const joined = lines.join(" \n ");

    const docNoLine = lines.find((line) => {
      const normalized = this.normalizeText(line);
      return (
        normalized.includes("fatura no") || normalized.includes("belge no")
      );
    });
    const tarihLine = lines.find((line) => {
      const normalized = this.normalizeText(line);
      return (
        normalized.includes("fatura tarihi") || normalized.startsWith("tarih:")
      );
    });
    const dueLine = lines.find((line) => {
      const normalized = this.normalizeText(line);
      return (
        normalized.includes("odeme tarihi") ||
        normalized.includes("vade tarihi")
      );
    });
    const dispatchNoLine = lines.find((line) =>
      this.normalizeText(line).includes("irsaliye no"),
    );
    const dispatchDateLine = lines.find((line) =>
      this.normalizeText(line).includes("irsaliye tarihi"),
    );
    const sellerAnchor = lines.findIndex((line) =>
      /as[ıi]l\s*sat[ıi]c[ıi]\s*(ünvan|unvan)/i.test(line),
    );
    const buyerAnchor = lines.findIndex((line) =>
      /as[ıi]l\s*al[ıi]c[ıi]\s*(ünvan|unvan)/i.test(line),
    );
    const vknMatches = Array.from(
      joined.matchAll(/VKN[:\s]+(\d{10,11})/gi),
    ).map((m) => m[1]);
    const companyIndex = lines.findIndex((line) =>
      /a\.s|a\.ş|limited|san\.ve|sanayi|dijital|pinar/i.test(line),
    );
    const customerAnchor = lines.findIndex(
      (line) => this.normalizeText(line) === "sayin",
    );

    header.documentNo = this.sanitizeInlineText(
      docNoLine?.split(":").pop() || "",
    );
    header.date = this.normalizeDate(tarihLine || "");
    header.issueDate = header.date;
    header.dueDate = this.normalizeDate(dueLine || "");
    header.dispatchNo = this.sanitizeInlineText(
      dispatchNoLine?.split(":").pop() || "",
    );
    header.dispatchDate = this.normalizeDate(dispatchDateLine || "");
    // e-İrsaliye: date may only be in dispatchDate (irsaliye tarihi)
    if (!header.date && header.dispatchDate) {
      header.date = header.dispatchDate;
      header.issueDate = header.dispatchDate;
    }
    const sellerName = this.sanitizeInlineText(
      sellerAnchor >= 0
        ? lines[sellerAnchor].split(":").slice(1).join(":") ||
            lines[sellerAnchor + 1] ||
            ""
        : "",
    );
    const buyerName = this.sanitizeInlineText(
      buyerAnchor >= 0
        ? lines[buyerAnchor].split(":").slice(1).join(":") ||
            lines[buyerAnchor + 1] ||
            ""
        : "",
    );
    const sayinIndex = lines.findIndex(
      (line) => this.normalizeText(line) === "sayin",
    );
    const sayinBuyer =
      sayinIndex >= 0
        ? this.cleanupCompanyName(lines[sayinIndex + 1] || "")
        : "";
    const taxOfficeLine = lines.find((line) =>
      /vergi dairesi/i.test(this.normalizeText(line)),
    );
    header.companyTaxNo = vknMatches[0] || "";
    header.customerTaxNo = vknMatches[1] || "";
    header.sellerName = this.cleanupCompanyName(
      sellerName || (companyIndex >= 0 ? lines[companyIndex] : fallbackFirma),
    );
    header.buyerName = this.cleanupCompanyName(
      buyerName ||
        sayinBuyer ||
        (customerAnchor >= 0 && lines[customerAnchor + 1]
          ? lines[customerAnchor + 1]
          : ""),
    );
    header.companyName =
      header.sellerName || this.cleanupCompanyName(fallbackFirma);
    header.customerName =
      header.buyerName || this.cleanupCompanyName(fallbackFirma);
    header.taxOffice = this.sanitizeInlineText(
      taxOfficeLine?.split(":").slice(1).join(":") || "",
    );
    header.sellerTaxOffice = header.taxOffice;
    header.buyerTaxOffice = "";

    const subtotalLine = lines.find((line) =>
      /mal hizmet toplam tutar/i.test(line),
    );
    const kdvLine = lines.find((line) => /hesaplanan kdv|kdv \(%/i.test(line));
    const grandTotalLine = lines.find((line) =>
      /genel toplam|vergiler dahil toplam tutar|ödenecek tutar/i.test(line),
    );
    header.subtotal = this.onlyAmountMatches(subtotalLine || "")[0] || 0;
    header.kdv = this.onlyAmountMatches(kdvLine || "")[0] || 0;
    header.grandTotal = this.onlyAmountMatches(grandTotalLine || "")[0] || 0;
    if (!header.grandTotal) {
      const totals = this.onlyAmountMatches(joined);
      header.grandTotal = totals[totals.length - 1] || 0;
    }
    if (!header.subtotal && header.grandTotal && header.kdv) {
      header.subtotal = Number((header.grandTotal - header.kdv).toFixed(2));
    }

    if (/\bEUR\b/i.test(joined)) header.currency = "TRY";

    header.invoiceNo = header.documentNo;
    header.invoiceDate = header.date;
    header.invoiceNoRaw = header.documentNo;
    header.invoiceDateRaw = header.date;
    header.dispatchNoRaw = header.dispatchNo;
    header.dispatchDateRaw = header.dispatchDate;
    header.dispatchDocumentNo = header.dispatchNo;
    header.dispatchDocumentDate = header.dispatchDate;
    this.enrichHeaderFromLines(header, lines, fallbackFirma, documentClass);
    return header;
  }

  private enrichHeaderFromLines(
    header: HeaderModel,
    lines: string[],
    fallbackFirma: string,
    documentClass: DocumentClass,
  ) {
    const joined = lines.join("\n");
    const findValue = (pattern: RegExp) => {
      const match = joined.match(pattern);
      return this.sanitizeInlineText(match?.[1] || "");
    };

    const faturaNo = findValue(/\bFatura\s*No\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
    const irsaliyeNo = findValue(
      /\b[İI]rsaliye\s*No\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    );
    const belgeNo = findValue(/\bBelge\s*No\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
    const faturaTarihi = this.findDateAfterLabel(lines, /Fatura\s*Tarihi/i);
    const irsaliyeTarihi = this.findDateAfterLabel(
      lines,
      /[İI]rsaliye\s*Tarihi/i,
    );

    if (!header.documentNo) {
      header.documentNo =
        documentClass === "IRSALIYE" ? irsaliyeNo : faturaNo || belgeNo;
    }
    header.invoiceNo = header.invoiceNo || faturaNo || header.documentNo;
    if (!header.dispatchNo && irsaliyeNo) header.dispatchNo = irsaliyeNo;
    header.dispatchDocumentNo = header.dispatchDocumentNo || header.dispatchNo;
    if (!this.isValidIsoDate(header.date)) {
      header.date = this.normalizeDate(faturaTarihi || irsaliyeTarihi);
    }
    header.invoiceDate = header.invoiceDate || header.date;
    if (!header.issueDate) header.issueDate = header.date;
    if (!header.dispatchDate && irsaliyeTarihi) {
      header.dispatchDate = this.normalizeDate(irsaliyeTarihi);
    }
    header.dispatchDocumentDate =
      header.dispatchDocumentDate || header.dispatchDate;
    if (!header.date && header.dispatchDate) {
      header.date = header.dispatchDate;
      header.issueDate = header.dispatchDate;
      header.invoiceDate = header.dispatchDate;
    }

    if (!header.companyName || header.companyName === fallbackFirma) {
      const sayinIndex = lines.findIndex(
        (line) => this.normalizeText(line) === "sayin",
      );
      const sellerLines = (sayinIndex > 0 ? lines.slice(0, sayinIndex) : lines)
        .filter((line) =>
          /san|tic|ltd|şti|sti|anonim|kimya|gürsu|gursu|tekstil/i.test(line),
        )
        .filter(
          (line) =>
            !/vergi|mersis|ticaret sicil|web|eposta|tel|fax/i.test(line),
        );
      header.companyName = this.cleanupCompanyName(
        sellerLines[0] || fallbackFirma,
      );
    }
    header.companyName = this.cleanupCompanyName(header.companyName);
    header.sellerName = header.sellerName || header.companyName;
    header.customerName = this.cleanupCompanyName(header.customerName);
    header.buyerName = header.buyerName || header.customerName;
    header.invoiceNoRaw = header.invoiceNoRaw || header.invoiceNo;
    header.invoiceDateRaw = header.invoiceDateRaw || header.invoiceDate;
    header.dispatchNoRaw = header.dispatchNoRaw || header.dispatchNo;
    header.dispatchDateRaw = header.dispatchDateRaw || header.dispatchDate;

    const subtotal = this.extractAmountAfterLabel(lines, [
      /mal hizmet toplam tutar/i,
      /ara toplam/i,
    ]);
    const kdv = this.extractAmountAfterLabel(lines, [
      /hesaplanan kdv/i,
      /\bkdv\b/i,
    ]);
    const grandTotal = this.extractAmountAfterLabel(lines, [
      /vergiler dahil toplam tutar/i,
      /ödenecek tutar/i,
      /odenecek tutar/i,
      /genel toplam/i,
    ]);

    if (!header.subtotal && subtotal) header.subtotal = subtotal;
    if (!header.kdv && kdv) header.kdv = kdv;
    if (!header.grandTotal && grandTotal) header.grandTotal = grandTotal;
  }

  private cleanupCompanyName(value: string) {
    return this.sanitizeInlineText(value)
      .replace(
        /\s+(Özelleştirme|Ozellestirme|Senaryo|Fatura Tipi|İrsaliye Tipi)\b.*$/i,
        "",
      )
      .trim();
  }

  private extractAmountAfterLabel(lines: string[], labels: RegExp[]) {
    for (const line of lines) {
      if (!labels.some((label) => label.test(line))) continue;
      const amounts = this.onlyAmountMatches(line);
      if (amounts.length) return amounts[amounts.length - 1];
    }
    return 0;
  }

  private findDateAfterLabel(lines: string[], label: RegExp) {
    for (const line of lines) {
      const match = label.exec(line);
      if (!match || match.index === undefined) continue;
      const afterLabel = line.slice(match.index + match[0].length);
      const dateMatch = afterLabel.match(/(\d{8}|\d{2}[./-]\d{2}[./-]\d{4})/);
      if (dateMatch) return dateMatch[1];
    }
    return "";
  }

  private findTableStart(lines: string[], profile: ParseProfile) {
    const normalizedLines = lines.map((line) => this.normalizeText(line));
    // e-İrsaliye format: "Sıra No  Malzeme No  Açıklama  Miktar" table header
    const eIrsaliyeIdx = normalizedLines.findIndex(
      (line) =>
        line.includes("sira no") &&
        (line.includes("aciklama") ||
          line.includes("malzeme") ||
          line.includes(" mal ")),
    );
    if (eIrsaliyeIdx >= 0) return eIrsaliyeIdx + 1;
    const genericHeaderIdx = normalizedLines.findIndex(
      (line) =>
        line.includes("miktar") &&
        (line.includes("mal aciklama") || line.includes("mal hizmet aciklama")),
    );
    if (genericHeaderIdx >= 0) return genericHeaderIdx + 1;
    if (profile === "URAS_PROFILE") {
      const idx = normalizedLines.findIndex(
        (line) =>
          line.includes("urun kodu mal hizmet") || line.includes("urun kodu"),
      );
      if (idx >= 0) {
        const next = lines.findIndex(
          (line, lineIdx) => lineIdx > idx && /^\d+\s+Adet/i.test(line),
        );
        return next >= 0 ? next : idx + 1;
      }
    }
    if (profile === "AVRASYA_PROFILE") {
      const idx = normalizedLines.findIndex((line) =>
        line.includes("sira no mal hizmet"),
      );
      return idx >= 0 ? idx + 1 : 0;
    }
    const idx = normalizedLines.findIndex(
      (line) =>
        line.includes("hizmet / urun adi") ||
        line.includes("hizmet / ürün adı"),
    );
    return idx >= 0 ? idx + 1 : 0;
  }

  private collectTableLines(lines: string[], startIndex: number) {
    const tableLines: string[] = [];
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) continue;
      if (this.shouldStopTable(line)) break;
      tableLines.push(line);
    }
    return tableLines;
  }

  private isNoiseLine(line: string) {
    const normalized = this.normalizeText(line);
    if (!normalized) return true;
    if (this.isFakeRow(line) || this.shouldStopTable(line)) return true;
    if (
      /(usd kuru|eur kuru|yalniz|ilave dokumanlar|odeme sekli|odeme kosullari|son odeme tarihi|swift|iban)/i.test(
        normalized,
      )
    ) {
      return true;
    }
    return false;
  }

  private looksLikeContinuationLine(line: string) {
    const cleaned = this.sanitizeInlineText(line);
    if (!cleaned) return false;
    if (/^\d+\s+/.test(cleaned)) return false;
    if (/(?:\d[\d.]*,\d{2}\s*TL)|%(\d+(?:,\d+)?)/i.test(cleaned)) return false;
    return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(cleaned);
  }

  private buildRawLineCandidates(tableLines: string[]) {
    const merged: string[] = [];
    for (const rawLine of tableLines) {
      const line = this.sanitizeInlineText(rawLine);
      if (!line) continue;
      const previous = merged[merged.length - 1] || "";
      if (
        merged.length > 0 &&
        this.looksLikeContinuationLine(line) &&
        !this.isNoiseLine(line) &&
        /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(previous)
      ) {
        merged[merged.length - 1] = `${previous} ${line}`
          .replace(/\s+/g, " ")
          .trim();
      } else {
        merged.push(line);
      }
    }

    return merged.map((line) =>
      this.makeCandidateRow(line, this.computeCandidateRejectReason(line)),
    );
  }

  private computeDocumentConfidence(input: {
    header: HeaderModel;
    items: ParsedDocumentItem[];
    rawLineCandidates: CandidateRow[];
    candidateRows: CandidateRow[];
    textQualityScore: number;
    ocrUsed?: boolean;
  }) {
    const parts = [
      input.header.companyName ? 0.16 : 0,
      input.header.documentNo ||
      input.header.invoiceNo ||
      input.header.dispatchNo
        ? 0.16
        : 0,
      input.header.date || input.header.invoiceDate || input.header.dispatchDate
        ? 0.14
        : 0,
      input.header.grandTotal > 0 || input.header.subtotal > 0 ? 0.14 : 0,
      input.items.length > 0 ? 0.22 : 0,
      Math.min(0.12, Math.max(0, input.textQualityScore / 100) * 0.12),
    ];
    const unresolved = input.rawLineCandidates.filter(
      (row) => row.looksLikeItem && !row.rejectReason,
    ).length;
    const unresolvedPenalty = input.rawLineCandidates.length
      ? Math.min(0.18, (unresolved / input.rawLineCandidates.length) * 0.18)
      : 0;
    const ocrPenalty = input.ocrUsed ? 0.06 : 0;
    const candidatePenalty = input.candidateRows.length > 4 ? 0.05 : 0;
    const value = Math.max(
      0,
      Math.min(
        0.99,
        parts.reduce((sum, x) => sum + x, 0) -
          unresolvedPenalty -
          ocrPenalty -
          candidatePenalty,
      ),
    );
    return Number(value.toFixed(3));
  }

  private computeNeedsReview(input: {
    header: HeaderModel;
    items: ParsedDocumentItem[];
    confidence: number;
    rawLineCandidates: CandidateRow[];
    ocrUsed?: boolean;
  }) {
    const missingCompany = !input.header.companyName;
    const missingDocumentNo = !(
      input.header.documentNo ||
      input.header.invoiceNo ||
      input.header.dispatchNo
    );
    const missingItems = input.items.length === 0;
    const unresolvedRaw = input.rawLineCandidates.filter(
      (row) => row.looksLikeItem && !row.rejectReason,
    ).length;
    const unresolvedTooHigh =
      unresolvedRaw >=
      Math.max(3, Math.ceil(input.rawLineCandidates.length * 0.45));
    const ocrLowConfidence = Boolean(input.ocrUsed) && input.confidence < 0.7;
    return (
      missingCompany ||
      missingDocumentNo ||
      missingItems ||
      unresolvedTooHigh ||
      ocrLowConfidence
    );
  }

  private extractLayoutRegions(lines: string[], tableStart: number) {
    const sellerAnchor = lines.findIndex((line) =>
      /as[ıi]l\s*sat[ıi]c[ıi]\s*(ünvan|unvan)/i.test(line),
    );
    const buyerAnchor = lines.findIndex((line) =>
      /as[ıi]l\s*al[ıi]c[ıi]\s*(ünvan|unvan)/i.test(line),
    );
    const sayinAnchor = lines.findIndex(
      (line) => this.normalizeText(line) === "sayin",
    );
    const totalsAnchor = lines.findIndex((line) => this.shouldStopTable(line));

    const sellerBlock = lines
      .slice(
        sellerAnchor >= 0 ? sellerAnchor : 0,
        sellerAnchor >= 0 ? Math.min(lines.length, sellerAnchor + 6) : 0,
      )
      .filter(Boolean);
    const buyerBlock = lines
      .slice(
        buyerAnchor >= 0 ? buyerAnchor : sayinAnchor >= 0 ? sayinAnchor : 0,
        buyerAnchor >= 0
          ? Math.min(lines.length, buyerAnchor + 6)
          : sayinAnchor >= 0
            ? Math.min(lines.length, sayinAnchor + 6)
            : 0,
      )
      .filter(Boolean);

    return {
      sellerAnchor,
      buyerAnchor,
      sayinAnchor,
      tableStart,
      totalsAnchor,
      sellerBlockLineCount: sellerBlock.length,
      buyerBlockLineCount: buyerBlock.length,
    };
  }

  private parseGenericRows(tableLines: string[], documentClass: DocumentClass) {
    const items: ParsedDocumentItem[] = [];
    const candidateRows: CandidateRow[] = [];
    let pendingDescription = "";

    for (const line of tableLines) {
      if (this.isFakeRow(line)) continue;

      if (!/^\d+\s+/.test(line)) {
        if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) {
          pendingDescription = this.sanitizeInlineText(
            line.replace(/\bZDHC\b|\bLEVEL\s*\d+\b/gi, ""),
          );
        }
        continue;
      }

      const parsed =
        documentClass === "FATURA"
          ? this.parseGenericInvoiceRow(line, items.length + 1)
          : this.parseGenericDispatchRow(
              line,
              pendingDescription,
              items.length + 1,
            );

      if (parsed) {
        items.push(parsed);
        pendingDescription = "";
      } else {
        candidateRows.push(this.makeCandidateRow(line));
      }
    }

    return { items, candidateRows };
  }

  private parseGenericDispatchRow(
    line: string,
    pendingDescription: string,
    rowNo: number,
  ): ParsedDocumentItem | null {
    const normalized = this.sanitizeInlineText(line);
    const pendingQuantityMatch = pendingDescription
      ? normalized.match(
          /^(\d+)\s+(\d[\d.]*(?:,\d+)?)\s*(Adet|ADET|AD|KG|Kg|kg)\b/i,
        )
      : null;
    if (pendingQuantityMatch) {
      return this.makeDispatchItemFromParts({
        rowNo,
        description: pendingDescription,
        productCode: "",
        lotNo: "",
        quantity: this.toNumber(pendingQuantityMatch[2]),
        unit: pendingQuantityMatch[3],
      });
    }

    const quantityMatch = normalized.match(
      /(.+?)\s+(\d[\d.]*(?:,\d+)?)\s*(Adet|ADET|AD|KG|Kg|kg)\b/i,
    );
    if (!quantityMatch) return null;

    const beforeQuantity = this.sanitizeInlineText(quantityMatch[1]);
    const rowMatch = beforeQuantity.match(/^(\d+)\s+(.+)$/);
    if (!rowMatch) return null;

    let description = this.sanitizeInlineText(rowMatch[2]);
    if (/^\d+$/.test(description) && pendingDescription) {
      description = pendingDescription;
    }
    description = description.replace(/\bZDHC\b|\bLEVEL\s*\d+\b/gi, "").trim();
    if (!description || /^\d+$/.test(description)) return null;

    const tokens = description.split(/\s+/);
    const firstTokenLooksCode = /[0-9.]/.test(tokens[0] || "");
    const productCode = firstTokenLooksCode ? tokens[0] || "" : "";
    const lotNo =
      productCode && tokens.length > 2 && /^[A-Z0-9]{6,}$/i.test(tokens[1])
        ? tokens[1]
        : "";
    const cleanDescription = productCode
      ? lotNo
        ? tokens.slice(2).join(" ")
        : tokens.slice(1).join(" ")
      : description;
    const finalDescription = cleanDescription || description;

    return this.makeDispatchItemFromParts({
      rowNo,
      description: finalDescription,
      productCode,
      lotNo,
      quantity: this.toNumber(quantityMatch[2]),
      unit: quantityMatch[3],
    });
  }

  private makeDispatchItemFromParts(input: {
    rowNo: number;
    description: string;
    productCode: string;
    lotNo: string;
    quantity: number;
    unit: string;
  }): ParsedDocumentItem {
    return {
      id: this.makeId("itm"),
      rowNo: input.rowNo,
      description: this.sanitizeInlineText(input.description),
      productCode: this.sanitizeInlineText(input.productCode),
      lotNo: this.sanitizeInlineText(input.lotNo),
      quantity: input.quantity,
      quantity2: 0,
      unit: input.unit.replace(/^AD$/i, "ADET").toLocaleUpperCase("tr-TR"),
      unit2: "",
      unitPrice: 0,
      lineTotal: 0,
      discountRate: 0,
      discountAmount: 0,
      kdvRate: 0,
      kdvAmount: 0,
      confidence: 0.82,
      needsReview: true,
      sourceProfile: "SIMPLE_SINGLE_ROW_PROFILE",
      modelAdayi: this.extractModelNameFromDescription(input.description),
    };
  }

  private parseGenericInvoiceRow(
    line: string,
    rowNo: number,
  ): ParsedDocumentItem | null {
    const normalized = this.sanitizeInlineText(line);
    const rowMatch = normalized.match(
      /^(\d+)\s+(.+?)\s+(\d[\d.]*(?:,\d+)?)\s*(Adet|ADET|AD|KG|Kg|kg)\s+(.+)$/i,
    );
    if (!rowMatch) return null;

    const rest = rowMatch[5];
    const amounts = this.onlyAmountMatches(rest);
    const rateMatches = Array.from(rest.matchAll(/%(\d+(?:,\d+)?)/g)).map((m) =>
      this.toNumber(m[1]),
    );
    const unitPriceMatch = rest.match(/(\d+(?:,\d+)?)\s*TL/i);

    return {
      id: this.makeId("itm"),
      rowNo,
      description: this.sanitizeInlineText(rowMatch[2]),
      productCode: "",
      lotNo: "",
      quantity: this.toNumber(rowMatch[3]),
      quantity2: 0,
      unit: rowMatch[4].replace(/^AD$/i, "ADET").toLocaleUpperCase("tr-TR"),
      unit2: "",
      unitPrice: this.toNumber(unitPriceMatch?.[1] || amounts[0] || 0),
      lineTotal: amounts[amounts.length - 1] || 0,
      discountRate: rateMatches[0] || 0,
      discountAmount: 0,
      kdvRate: rateMatches[rateMatches.length - 1] || 0,
      kdvAmount: 0,
      confidence: 0.86,
      needsReview: true,
      sourceProfile: "SIMPLE_SINGLE_ROW_PROFILE",
      modelAdayi: this.extractModelNameFromDescription(rowMatch[2]),
    };
  }

  private extractTotalQuantity(lines: string[], items: ParsedDocumentItem[]) {
    const totalLine = lines.find((line) => /toplam\s+miktar/i.test(line));
    const match = totalLine?.match(
      /toplam\s+miktar\s*:?\s*(\d[\d.]*(?:,\d+)?)/i,
    );
    if (match) return this.toNumber(match[1]);
    return Number(
      items.reduce((sum, item) => sum + (item.quantity || 0), 0).toFixed(3),
    );
  }

  private calculateParseStatus(
    header: HeaderModel,
    items: ParsedDocumentItem[],
  ) {
    const signals = [
      header.documentNo || header.dispatchNo,
      header.date || header.dispatchDate,
      header.companyName,
      header.subtotal || header.grandTotal,
      items.length,
    ].filter(Boolean).length;

    if (signals >= 4 && items.length > 0) return "TAM_BASARILI" as const;
    if (signals >= 2) return "KISMI_BASARILI" as const;
    return "BASARISIZ" as const;
  }

  private detectUnitFromText(text: string) {
    const match = /(KG\/Metre Kare|KG|Kg|Adet|AD|ADET|LT|ML|M|CM)\b/i.exec(
      text,
    );
    return match?.[1] ? match[1].replace(/^AD$/i, "ADET") : "ADET";
  }

  private extractModelNameFromDescription(description: string) {
    const raw = this.sanitizeInlineText(description || "");
    if (!raw) return "";

    const upper = raw.toLocaleUpperCase("tr-TR");
    if (upper.includes("TEST NUMUNESI") || upper.includes("TEST NUMUNESİ")) {
      return "";
    }

    const commaTokens = raw
      .split(/[;,]/)
      .map((part) => this.sanitizeInlineText(part))
      .filter(Boolean);
    if (commaTokens.length >= 2) {
      const middle = commaTokens[1]
        .toLocaleUpperCase("tr-TR")
        .replace(/[^A-Z0-9]/g, "");
      if (middle && /[A-Z]/.test(middle) && !/^\d+$/.test(middle)) {
        return middle;
      }
    }

    const slashTokens = raw
      .split("/")
      .map((part) => this.sanitizeInlineText(part))
      .filter(Boolean);
    if (slashTokens.length >= 2) {
      const second = slashTokens[1]
        .toLocaleUpperCase("tr-TR")
        .replace(/[^A-Z0-9]/g, "");
      if (second && /[A-Z]/.test(second) && !/^\d+$/.test(second)) {
        return second;
      }
    }

    const tokens = raw
      .replace(/[()\[\]{}]/g, " ")
      .split(/\s+/)
      .map((part) =>
        part
          .toLocaleUpperCase("tr-TR")
          .replace(/[^A-Z0-9-]/g, "")
          .trim(),
      )
      .filter(Boolean)
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !/^\d+[A-Z]?$/.test(token))
      .filter(
        (token) =>
          ![
            "MAT",
            "MAVI",
            "MAVI",
            "KARBON",
            "LILA",
            "LILA",
            "Y",
            "TL",
            "ADET",
            "KG",
            "METRE",
            "KARE",
          ].includes(token),
      );

    const model = tokens.find(
      (token) =>
        token.length >= 3 &&
        /[A-Z]/.test(token) &&
        !/^(NO|FATURA|IRSALIYE|URUN|HIZMET|ACIKLAMA)$/.test(token),
    );
    return model || "";
  }

  private makeCandidateRow(line: string, rejectReason = ""): CandidateRow {
    const normalizedText = this.normalizeText(line);
    const detectedNumbers = this.allNumberMatches(line);
    const detectedUnit = this.detectUnitFromText(line);
    const computedRejectReason =
      rejectReason || this.computeCandidateRejectReason(line);
    const hasAlpha = /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line);
    const looksLikeItem = Boolean(
      !computedRejectReason &&
      hasAlpha &&
      (detectedNumbers.length > 0 || detectedUnit || line.length >= 8),
    );
    const score = computedRejectReason
      ? 0.25
      : detectedNumbers.length >= 2
        ? 0.82
        : detectedNumbers.length === 1
          ? 0.72
          : 0.58;
    return {
      id: this.makeId("cand"),
      rawText: line,
      normalizedText,
      score,
      detectedNumbers,
      detectedUnit,
      looksLikeItem,
      rejectReason: computedRejectReason,
    };
  }

  private computeCandidateRejectReason(line: string) {
    const normalized = this.normalizeText(line);
    if (!normalized) return "bos_satir";
    if (normalized.length < 4) return "satir_kisa";
    if (this.isFakeRow(line)) return "sahte_satir_filtre";
    if (this.shouldStopTable(line)) return "toplam_odeme_blok";
    if (/^(sayin|sayfa|page)\b/i.test(normalized)) return "ust_bilgi";
    return "";
  }

  private parseUrasRows(tableLines: string[]) {
    const items: ParsedDocumentItem[] = [];
    const candidateRows: CandidateRow[] = [];

    for (let index = 0; index < tableLines.length; index += 1) {
      const first = tableLines[index];
      if (!/^\d+\s+Adet/i.test(first)) {
        if (!this.isFakeRow(first))
          candidateRows.push(this.makeCandidateRow(first));
        continue;
      }
      const second = tableLines[index + 1] || "";
      const firstMatch = first.match(
        /^(\d+(?:,\d+)?)\s+Adet\s+(\d+(?:,\d+)?)\s+KG\s+([ÜU][A-Z0-9ÇĞİÖŞÜ.]+)\s+(.+?)\s+(\d{8,9})\s+(\d[\d.]*,\d{2})$/i,
      );
      if (!firstMatch || !/TL/i.test(second)) {
        candidateRows.push(this.makeCandidateRow(first));
        continue;
      }
      const secondAmounts = this.onlyAmountMatches(second);
      const kdvRateMatch = second.match(/%(\d+(?:,\d+)?)/);
      items.push({
        id: this.makeId("itm"),
        rowNo: items.length + 1,
        description: this.sanitizeInlineText(firstMatch[4]),
        productCode: this.sanitizeInlineText(firstMatch[3]),
        lotNo: this.sanitizeInlineText(firstMatch[5]),
        quantity: this.toNumber(firstMatch[1]),
        quantity2: this.toNumber(firstMatch[2]),
        unit: "ADET",
        unit2: "KG",
        unitPrice: this.toNumber(firstMatch[6]),
        lineTotal: secondAmounts[secondAmounts.length - 1] || 0,
        discountRate: 0,
        discountAmount: 0,
        kdvRate: this.toNumber(kdvRateMatch?.[1] || 0),
        kdvAmount: secondAmounts[0] || 0,
        confidence: 0.96,
        needsReview: false,
        sourceProfile: "URAS_PROFILE",
        modelAdayi: this.extractModelNameFromDescription(
          this.sanitizeInlineText(firstMatch[4]),
        ),
      });
      index += 1;
    }

    return { items, candidateRows };
  }

  private parseAvrasyaContent(content: string, rowNo: number) {
    const normalized = this.sanitizeInlineText(content);
    const moneyMatches = this.onlyAmountMatches(normalized);
    if (moneyMatches.length < 2) return null;

    const firstMoneyRaw =
      normalized.match(/\d[\d.]*,\d{2}\s*TL/i)?.index ?? normalized.length;
    const beforeMoney = normalized.slice(0, firstMoneyRaw).trim();
    const qtyMatches = Array.from(
      beforeMoney.matchAll(
        /(\d+(?:,\d+)?)\s*(KG\/Metre Kare|KG|Kg|Adet|AD|ADET)\b/gi,
      ),
    );
    const preferredQty = [...qtyMatches]
      .reverse()
      .find((match) => this.toNumber(match[1]) > 0);
    const quantity = this.toNumber(preferredQty?.[1] || 1);
    const unit = preferredQty?.[2]
      ? preferredQty[2].replace(/^AD$/i, "ADET")
      : "ADET";
    const withoutLeadingNo = normalized.replace(/^\d+\s+/, "");
    const description = qtyMatches.length
      ? this.sanitizeInlineText(
          withoutLeadingNo
            .slice(0, withoutLeadingNo.indexOf(qtyMatches[0][0]))
            .trim(),
        )
      : withoutLeadingNo;

    return {
      id: this.makeId("itm"),
      rowNo,
      description: description || withoutLeadingNo,
      productCode: "",
      lotNo: "",
      quantity,
      quantity2: 0,
      unit,
      unit2: "",
      unitPrice: moneyMatches[0] || 0,
      lineTotal: moneyMatches[1] || moneyMatches[0] || 0,
      discountRate: 0,
      discountAmount: 0,
      kdvRate: this.toNumber(/%(\d+(?:,\d+)?)/.exec(normalized)?.[1] || 0),
      kdvAmount: moneyMatches[2] || 0,
      confidence: 0.9,
      needsReview: false,
      sourceProfile: "AVRASYA_PROFILE" as ParseProfile,
      modelAdayi: this.extractModelNameFromDescription(
        description || withoutLeadingNo,
      ),
    };
  }

  private parseAvrasyaRows(tableLines: string[]) {
    const items: ParsedDocumentItem[] = [];
    const candidateRows: CandidateRow[] = [];

    for (let index = 0; index < tableLines.length; index += 1) {
      const line = tableLines[index];
      if (!/^\d+\s+/.test(line)) {
        if (!this.isFakeRow(line))
          candidateRows.push(this.makeCandidateRow(line));
        continue;
      }
      let content = line;
      let consumedNext = false;
      if (
        !/TL/i.test(line) &&
        tableLines[index + 1] &&
        !/^\d+\s+/.test(tableLines[index + 1])
      ) {
        content = `${line} ${tableLines[index + 1]}`;
        consumedNext = true;
      }
      const parsed = this.parseAvrasyaContent(content, items.length + 1);
      if (parsed) {
        items.push(parsed);
        if (consumedNext) index += 1;
      } else {
        candidateRows.push(this.makeCandidateRow(content));
      }
    }

    return { items, candidateRows };
  }

  private parseSimpleRows(tableLines: string[]) {
    const items: ParsedDocumentItem[] = [];
    const candidateRows: CandidateRow[] = [];

    for (const line of tableLines) {
      if (this.isFakeRow(line)) continue;
      const match = line.match(
        /^\d+\s+(.+?)\s+(\d+(?:,\d+)?)\s+(\d[\d.]*,\d{2})\s*TL\s+%(\d+(?:,\d+)?)\s+(\d[\d.]*,\d{2})\s*TL$/i,
      );
      if (!match) {
        candidateRows.push(this.makeCandidateRow(line));
        continue;
      }
      items.push({
        id: this.makeId("itm"),
        rowNo: items.length + 1,
        description: this.sanitizeInlineText(match[1]),
        productCode: "",
        lotNo: "",
        quantity: this.toNumber(match[2]),
        quantity2: 0,
        unit: "ADET",
        unit2: "",
        unitPrice: this.toNumber(match[3]),
        lineTotal: this.toNumber(match[5]),
        discountRate: 0,
        discountAmount: 0,
        kdvRate: this.toNumber(match[4]),
        kdvAmount: 0,
        confidence: 0.93,
        needsReview: false,
        sourceProfile: "SIMPLE_SINGLE_ROW_PROFILE",
        modelAdayi: this.extractModelNameFromDescription(
          this.sanitizeInlineText(match[1]),
        ),
      });
    }

    return { items, candidateRows };
  }

  private collapseDocumentLines(lines: string[]) {
    return this.sanitizeInlineText(
      lines
        .join(" ")
        .replace(/\u00ad/g, "-")
        .replace(/[–—]/g, "-"),
    );
  }

  private sliceEArchiveTableText(lines: string[]) {
    const text = this.collapseDocumentLines(lines);
    const normalized = this.normalizeText(text);
    const startCandidates = [
      normalized.indexOf("sira no"),
      normalized.indexOf("mal hizmetaciklama"),
      normalized.indexOf("mal hizmet aciklama"),
      normalized.indexOf("aciklamamiktar"),
    ].filter((index) => index >= 0);
    const start = startCandidates.length ? Math.min(...startCandidates) : 0;
    const stopPatterns = [
      "mal hizmet toplam tutari",
      "toplam iskonto",
      "hesaplanan kdv",
      "vergiler dahil toplam tutar",
      "odenecek tutar",
      "toplam miktar",
      "yalniz",
    ];
    const relativeStop = stopPatterns
      .map((pattern) => normalized.indexOf(pattern, start + 1))
      .filter((index) => index > start)
      .sort((a, b) => a - b)[0];
    const end = relativeStop ? relativeStop : text.length;
    return text.slice(start, end);
  }

  private extractProductCodeFromDescription(description: string) {
    const cleaned = this.sanitizeInlineText(description);
    const match = cleaned.match(/^([A-Z0-9./-]{4,})(?:\s*[-/]\s*|\s+)/i);
    return match?.[1] || "";
  }

  private makeAutoParsedCandidate(rawText: string) {
    return this.makeCandidateRow(rawText, "otomatik_ayristirildi");
  }

  private parseEArchiveRows(
    lines: string[],
    documentClass: DocumentClass,
  ): {
    items: ParsedDocumentItem[];
    candidateRows: CandidateRow[];
    rawLineCandidates: CandidateRow[];
  } {
    const tableText = this.sliceEArchiveTableText(lines);
    const items: ParsedDocumentItem[] = [];
    const rawLineCandidates: CandidateRow[] = [];
    if (!/Adet/i.test(tableText)) {
      return { items, candidateRows: [], rawLineCandidates };
    }

    if (documentClass === "FATURA") {
      const invoiceRowRegex =
        /\b([1-9]\d{0,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)\s*Adet\s+(\d+(?:,\d+)?)\s*TL\s+%(\d+(?:,\d+)?)\s+%(\d+(?:,\d+)?)\s+(\d[\d.]*,\d{2}|0,00)\s*TL\s+(\d[\d.]*,\d{2}|0,00)\s*TL/gi;
      for (const match of tableText.matchAll(invoiceRowRegex)) {
        const rawDescription = this.sanitizeInlineText(match[2]);
        const description = rawDescription
          .replace(/^.*?\bTutar[ıi]?\s+/i, "")
          .trim();
        if (!description || /^(mal|hizmet|açıklama|aciklama)$/i.test(description)) {
          continue;
        }
        const rawRow = this.sanitizeInlineText(match[0]);
        rawLineCandidates.push(this.makeAutoParsedCandidate(rawRow));
        items.push({
          id: this.makeId("itm"),
          rowNo: items.length + 1,
          description,
          productCode: this.extractProductCodeFromDescription(description),
          lotNo: "",
          quantity: this.toNumber(match[3]),
          quantity2: 0,
          unit: "ADET",
          unit2: "",
          unitPrice: this.toNumber(match[4]),
          lineTotal: this.toNumber(match[8]),
          discountRate: this.toNumber(match[5]),
          discountAmount: 0,
          kdvRate: this.toNumber(match[6]),
          kdvAmount: this.toNumber(match[7]),
          confidence: 0.96,
          needsReview: false,
          sourceProfile: "SIMPLE_SINGLE_ROW_PROFILE",
          modelAdayi: this.extractModelNameFromDescription(description),
        });
      }
      return { items, candidateRows: [], rawLineCandidates };
    }

    if (documentClass === "IRSALIYE") {
      const dispatchRowRegex =
        /\b([1-9]\d{0,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)\s*Adet(?:\s*\(Unit\))?\s+0\s*TL/gi;
      for (const match of tableText.matchAll(dispatchRowRegex)) {
        const rawDescription = this.sanitizeInlineText(match[2]);
        const description = rawDescription
          .replace(/^.*?\bTutar[ıi]?\s+/i, "")
          .trim();
        if (!description || /^(mal|hizmet|açıklama|aciklama)$/i.test(description)) {
          continue;
        }
        const rawRow = this.sanitizeInlineText(match[0]);
        rawLineCandidates.push(this.makeAutoParsedCandidate(rawRow));
        items.push({
          id: this.makeId("itm"),
          rowNo: items.length + 1,
          description,
          productCode: this.extractProductCodeFromDescription(description),
          lotNo: "",
          quantity: this.toNumber(match[3]),
          quantity2: 0,
          unit: "ADET",
          unit2: "",
          unitPrice: 0,
          lineTotal: 0,
          discountRate: 0,
          discountAmount: 0,
          kdvRate: 0,
          kdvAmount: 0,
          confidence: 0.94,
          needsReview: false,
          sourceProfile: "SIMPLE_SINGLE_ROW_PROFILE",
          modelAdayi: this.extractModelNameFromDescription(description),
        });
      }
    }

    return { items, candidateRows: [], rawLineCandidates };
  }

  private buildCandidateFallback(tableLines: string[]) {
    return tableLines
      .filter((line) => !this.isFakeRow(line))
      .map((line) => this.makeCandidateRow(line));
  }

  private detectMode(
    header: HeaderModel,
    items: ParsedDocumentItem[],
    candidates: CandidateRow[],
    textQualityScore: number,
  ): Mode {
    const calculatedTotal = Number(
      items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const totalsMatch =
      !header.subtotal ||
      Math.abs(Number((header.subtotal - calculatedTotal).toFixed(2))) < 5;
    const avgConfidence = items.length
      ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
      : 0;
    if (
      textQualityScore >= 60 &&
      totalsMatch &&
      items.length > 0 &&
      items.length <= 12 &&
      avgConfidence >= 0.85 &&
      candidates.length <= 2
    ) {
      return "AUTO_PARSE_MODE";
    }
    return "CANDIDATE_REVIEW_MODE";
  }

  private buildEmptyParse(
    fileName: string,
    fallbackFirma: string,
    warning: string,
  ): ParseResponse {
    const header = this.createEmptyHeader();
    header.companyName = fallbackFirma;
    return {
      ok: false,
      fileName,
      rawText: "",
      detectedProfile: "SIMPLE_SINGLE_ROW_PROFILE",
      documentClass: "DIGER_PDF_BELGE",
      workflowType: "GELEN_ALIS_FATURASI",
      mode: "CANDIDATE_REVIEW_MODE",
      header,
      items: [],
      parsedItems: [],
      candidateRows: [],
      warnings: [warning],
      metrics: {
        rawLineCount: 0,
        candidateLineCount: 0,
        parsedItemCount: 0,
        totalsMatch: false,
        confidenceAverage: 0,
        textQualityScore: 0,
      },
    };
  }

  private parseFromLines(
    fileName: string,
    lines: string[],
    fallbackFirma: string,
  ): ParseResponse {
    const detectedProfile = this.detectProfile(lines, fileName);
    const documentClass = this.detectDocumentClass(lines, fileName);
    const workflowType = this.workflowFor(documentClass, detectedProfile);
    const header = this.parseHeader(
      lines,
      fallbackFirma,
      documentClass,
      workflowType,
    );
    const tableStart = this.findTableStart(lines, detectedProfile);
    const tableLines = this.collectTableLines(lines, tableStart);
    const eArchiveResult = this.parseEArchiveRows(lines, documentClass);
    const usedEArchiveParser = eArchiveResult.items.length > 0;
    const rawLineCandidates = usedEArchiveParser
      ? eArchiveResult.rawLineCandidates
      : this.buildRawLineCandidates(tableLines);
    const normalizedSourceLines = rawLineCandidates.map((row) => row.rawText);
    let parsedResult:
      | { items: ParsedDocumentItem[]; candidateRows: CandidateRow[] }
      | undefined;

    if (usedEArchiveParser) {
      parsedResult = eArchiveResult;
    } else if (detectedProfile === "URAS_PROFILE") {
      parsedResult = this.parseUrasRows(normalizedSourceLines);
    } else if (detectedProfile === "AVRASYA_PROFILE") {
      parsedResult = this.parseAvrasyaRows(normalizedSourceLines);
    } else {
      parsedResult = this.parseSimpleRows(normalizedSourceLines);
    }

    const genericResult =
      parsedResult.items.length === 0
        ? this.parseGenericRows(normalizedSourceLines, documentClass)
        : undefined;
    const items = genericResult?.items.length
      ? genericResult.items
      : parsedResult.items;
    const normalizedItems = items;
    const parsedCandidates = genericResult?.items.length
      ? genericResult.candidateRows
      : parsedResult.candidateRows;
    const candidateRows = usedEArchiveParser
      ? []
      : parsedCandidates.length
      ? parsedCandidates
      : this.buildCandidateFallback(
          normalizedSourceLines.filter((line) => !/^\d+\s+/.test(line)),
        );
    const layoutRegions = this.extractLayoutRegions(lines, tableStart);
    const textQualityScore = this.computeTextQuality(lines);
    const confidenceAverage = this.computeDocumentConfidence({
      header,
      items,
      rawLineCandidates,
      candidateRows,
      textQualityScore,
    });
    const calculatedSubtotal = Number(
      items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    if (!header.subtotal && calculatedSubtotal)
      header.subtotal = calculatedSubtotal;
    const totalsMatch =
      !header.subtotal ||
      Math.abs(Number((header.subtotal - calculatedSubtotal).toFixed(2))) < 5;
    const mode = this.detectMode(
      header,
      items,
      candidateRows,
      textQualityScore,
    );
    const gelenAdet =
      documentClass === "IRSALIYE"
        ? this.extractTotalQuantity(lines, items)
        : 0;
    const parseStatus = this.calculateParseStatus(header, items);

    const warnings: string[] = [];
    if (!items.length)
      warnings.push(
        "Kalemler otomatik ayrıştırılamadı, aday satırları kontrol edin.",
      );
    if (!totalsMatch)
      warnings.push(
        "Toplamlar birebir eşleşmedi, final öncesi manuel kontrol gerekli.",
      );
    if (candidateRows.length > 0)
      warnings.push("Belirsiz satırlar candidateRows içinde bırakıldı.");
    const parseWarnings = warnings;
    const needsReview =
      mode === "CANDIDATE_REVIEW_MODE" ||
      this.computeNeedsReview({
        header,
        items,
        confidence: confidenceAverage,
        rawLineCandidates,
      }) ||
      warnings.length > 0;

    return {
      ok: true,
      fileName,
      rawText: lines.join("\n"),
      detectedProfile,
      documentClass,
      workflowType,
      mode,
      header,
      items,
      normalizedItems,
      parsedItems: items,
      candidateRows,
      rawLineCandidates,
      warnings,
      parseWarnings,
      belgeNo: header.documentNo || header.dispatchNo,
      faturaNo: documentClass === "FATURA" ? header.documentNo : "",
      irsaliyeNo:
        header.dispatchNo ||
        (documentClass === "IRSALIYE" ? header.documentNo : ""),
      belgeTarihi: header.date || header.dispatchDate,
      parsedCompanyName: header.companyName,
      araToplam: header.subtotal,
      kdv: header.kdv,
      genelToplam: header.grandTotal,
      gelenAdet,
      parseStatus,
      confidence: confidenceAverage,
      needsReview,
      parseSource: "text_layer_rule_based",
      metrics: {
        rawLineCount: lines.length,
        candidateLineCount: candidateRows.length,
        parsedItemCount: items.length,
        rawLineCandidateCount: rawLineCandidates.length,
        totalsMatch,
        confidenceAverage,
        textQualityScore,
        ...layoutRegions,
      },
    };
  }

  parseTextDocument(
    fileName: string,
    rawText: string,
    fallbackFirma: string,
    meta?: {
      extractorUsed?: "pdf-parse" | "pdfjs-dist";
      ocrAttempted?: boolean;
      ocrAvailable?: boolean;
      ocrUsed?: boolean;
    },
  ): ParseResponse {
    const lines = this.splitLines(rawText);
    if (!lines.length) {
      return this.buildEmptyParse(
        fileName,
        fallbackFirma,
        "Belgeden okunabilir metin çıkarılamadı.",
      );
    }
    const parsed = this.parseFromLines(fileName, lines, fallbackFirma);
    return {
      ...parsed,
      rawText,
      extractorUsed: meta?.extractorUsed,
      ocrAttempted: Boolean(meta?.ocrAttempted),
      ocrAvailable: Boolean(meta?.ocrAvailable),
      ocrUsed: Boolean(meta?.ocrUsed),
    };
  }

  async parseUploadedPdf(
    file: any,
    fallbackFirma: string,
  ): Promise<ParseResponse> {
    if (!file?.path) {
      return this.buildEmptyParse("", fallbackFirma, "PDF dosyası alınamadı.");
    }

    const fileName = file.originalname || path.basename(file.path);
    const extraction = await this.extractPdfText(file.path);
    return this.parseTextDocument(fileName, extraction.text, fallbackFirma, {
      extractorUsed: extraction.extractorUsed,
      ocrAttempted: false,
      ocrAvailable: false,
      ocrUsed: false,
    });
  }
}
