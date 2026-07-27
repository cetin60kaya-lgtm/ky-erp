import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import {
  createActivityLog,
  getModuleCompanyRoot,
} from "../common/api-helpers";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { ModelTakipStore } from "../modules/model-takip/model-takip.shared";
import { ModelService } from "../modules/models/model.service";
import { PdfExtractionService } from "./pdf-extraction.service";

type MainCompany = { id: string; slug: string; name: string };
type DocumentKind =
  | "supplier-invoice"
  | "incoming-delivery"
  | "outgoing-document"
  | "statement-file"
  | "pending";

type MonthFile =
  | "supplierInvoices"
  | "incomingDeliveries"
  | "outgoingDocuments"
  | "rawMaterialLots"
  | "documentUploadHistory"
  | "belgeHavuzu";

type ApprovalQueueItem = {
  id: string;
  belgeNo: string;
  payload: any;
  status: "queued" | "processing" | "completed" | "error";
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
};

type ApprovalQueueJob = {
  id: string;
  company: MainCompany;
  status: "queued" | "processing" | "completed" | "completed_with_errors";
  createdAt: string;
  updatedAt: string;
  items: ApprovalQueueItem[];
};

@Injectable()
export class MuhasebeDocumentWorkflowService {
  private readonly modelStore: ModelTakipStore;
  private readonly approvalQueues = new Map<
    string,
    {
      running: boolean;
      timer?: ReturnType<typeof setTimeout>;
      jobs: ApprovalQueueJob[];
    }
  >();

  /** Onay süreci boyunca activity log'ları bellekte tamponlar, sona tek yazışla flush eder. */
  private _logBuffer: Array<{ filePath: string; row: any }> = [];
  private _logBufferActive = false;

  private startLogBuffer() {
    this._logBuffer = [];
    this._logBufferActive = true;
  }

  private flushLogBuffer() {
    this._logBufferActive = false;
    this._logBuffer = [];
  }

  private readonly moduleDirs = {
    supplierInvoices: "supplier-invoices",
    incomingDeliveries: "incoming-deliveries",
    outgoingDocuments: "outgoing-documents",
    rawMaterialLots: "raw-material-lots",
    documentUploadHistory: "document-upload-history",
    belgeHavuzu: "belge-havuzu",
  } as const;

  constructor(
    private readonly db: SqlStoreService,
    private readonly pdfExtraction: PdfExtractionService,
    private readonly modelService: ModelService,
  ) {
    this.modelStore = new ModelTakipStore(db);
  }

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeKey(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/ı/g, "I")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ş/g, "S")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  private parseAmount(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.\-]/g, "");
    if (!raw) return 0;
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    let normalized = raw;
    if (lastComma > lastDot)
      normalized = raw.replace(/\./g, "").replace(",", ".");
    else normalized = raw.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }

  private parseQuantity(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.\-]/g, "");
    if (!raw) return 0;
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/\./g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizePdfText(value: any) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u00ad/g, "-")
      .replace(/[ \t]+/g, " ")
      .replace(/\r/g, "")
      .trim();
  }

  private parsePdfDate(value: any) {
    const text = this.cleanText(value);
    const match = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!match) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  private normalizeDepartment(value: any) {
    return this.cleanText(value).toLocaleUpperCase("tr-TR");
  }

  private isInvoiceType(value: any) {
    return this.normalizeKey(value).includes("FATURA");
  }

  private isDispatchType(value: any) {
    const key = this.normalizeKey(value);
    return key.includes("IRSALIYE") || key.includes("DESPATCH");
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private uid(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private slugPart(value: any) {
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

  private sanitizeFilePart(value: any) {
    return this.cleanText(value)
      .replace(/[<>:"/\\|?*]/g, " ")
      .trim();
  }

  private decodeUploadName(value: any) {
    const text = this.cleanText(value);
    if (!/[\u00C4\u00C5\u00C3\u00C2]/.test(text)) return text;
    try {
      return Buffer.from(text, "latin1").toString("utf8");
    } catch {
      return text;
    }
  }

  private requireCompany(
    mainCompanySlug?: string,
    mainCompanyId?: string,
  ): MainCompany {
    try {
      return this.db.requireMainCompany(mainCompanyId, mainCompanySlug);
    } catch {
      throw new BadRequestException("Ana firma zorunludur.");
    }
  }

  private getMonthKey(dateValue?: any) {
    const text = this.cleanText(dateValue);
    const date = /^\d{4}-\d{2}/.test(text) ? text : this.today();
    return date.slice(0, 7);
  }

  private fileNameForMonth(kind: MonthFile, monthKey: string) {
    return path
      .join(this.moduleDirs[kind], `${monthKey}.json`)
      .replace(/\\/g, "/");
  }

  private readMonthRows<T>(
    company: MainCompany,
    kind: MonthFile,
    monthKey?: string,
  ) {
    const key = monthKey || this.getMonthKey();
    const fileName = this.fileNameForMonth(kind, key);
    return this.cachedRead<T[]>(company.slug, fileName);
  }

  private writeMonthRows<T>(
    company: MainCompany,
    kind: MonthFile,
    monthKey: string,
    rows: T[],
  ) {
    const fileName = this.fileNameForMonth(kind, monthKey);
    const cacheKey = `${company.slug}:${fileName}`;
    this._readCache.delete(cacheKey);
    return this.db.writeMainCompanyStore(company.slug, fileName, rows);
  }

  private listMonthRows<T>(
    company: MainCompany,
    kind: MonthFile,
    limitMonths = 18,
  ) {
    const root = path.join(
      this.db.getMainCompanyDir(company.slug),
      this.moduleDirs[kind],
    );
    if (!fs.existsSync(root)) return [] as T[];
    return fs
      .readdirSync(root)
      .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limitMonths)
      .flatMap((name) =>
        this.db.readMainCompanyStore<T[]>(
          company.slug,
          path.join(this.moduleDirs[kind], name).replace(/\\/g, "/"),
          [],
        ),
      );
  }

  private upsertMonthRow<T extends Record<string, any>>(
    company: MainCompany,
    kind: MonthFile,
    row: T,
    dateValue?: any,
  ) {
    const monthKey = this.getMonthKey(
      dateValue || row.date || row.tarih || row.invoiceDate,
    );
    const rows = this.readMonthRows<T>(company, kind, monthKey);
    const id = this.cleanText(row.id || row.documentId || row.invoiceId);
    const next = [
      row,
      ...rows.filter(
        (item) =>
          this.cleanText(item.id || item.documentId || item.invoiceId) !== id,
      ),
    ];
    this.writeMonthRows(company, kind, monthKey, next);
    return row;
  }

  private _readCache = new Map<string, { time: number; data: any }>();

  private cachedRead<T>(companySlug: string, fileName: string): T {
    const key = `${companySlug}:${fileName}`;
    const cached = this._readCache.get(key);
    if (cached && Date.now() - cached.time < 3000) {
      return cached.data;
    }
    const data = this.db.readMainCompanyStore<T>(
      companySlug,
      fileName,
      [] as any,
    );
    this._readCache.set(key, { time: Date.now(), data });
    return data;
  }

  private getCompanies(company: MainCompany) {
    return this.cachedRead<any[]>(company.slug, "companies");
  }

  private getProducts(company: MainCompany) {
    return this.cachedRead<any[]>(company.slug, "products");
  }

  private getCompanyAliases(company: MainCompany) {
    return this.cachedRead<any[]>(company.slug, "company-aliases");
  }

  private getProductAliases(company: MainCompany) {
    return this.cachedRead<any[]>(company.slug, "product-aliases");
  }

  private readCompanyStoreRows<T>(company: MainCompany, fileName: string) {
    return this.cachedRead<T[]>(company.slug, fileName);
  }

  private writeCompanyStoreRows<T>(
    company: MainCompany,
    fileName: string,
    rows: T[],
  ) {
    const key = `${company.slug}:${fileName}`;
    this._readCache.delete(key);
    return this.db.writeMainCompanyStore(company.slug, fileName, rows);
  }

  private resolveCompanyAlias(company: MainCompany, rawName: any) {
    const rawText = this.cleanText(rawName);
    const query = this.normalizeKey(rawText).replace(/\s+/g, "");
    if (!query) {
      return {
        matched: false,
        rawName: rawText,
        cleanCompanyName: rawText,
        companyId: "",
        aliasId: "",
      };
    }
    const aliases = this.getCompanyAliases(company);
    const alias = aliases.find((row) => {
      if (row?.isActive === false || row?.isDeleted === true) return false;
      const rawKey = this.normalizeKey(row.rawName).replace(/\s+/g, "");
      const normalizedKey = this.normalizeKey(row.normalizedRawName).replace(
        /\s+/g,
        "",
      );
      return rawKey === query || normalizedKey === query;
    });
    if (!alias) {
      return {
        matched: false,
        rawName: rawText,
        cleanCompanyName: rawText,
        companyId: "",
        aliasId: "",
      };
    }
    const companies = this.getCompanies(company);
    const target =
      companies.find(
        (row) => String(row.id || "") === String(alias.matchedCompanyId || ""),
      ) ||
      companies.find(
        (row) =>
          this.normalizeKey(row.firma || row.name) ===
          this.normalizeKey(alias.matchedCompanyName),
      );
    return {
      matched: true,
      rawName: rawText,
      cleanCompanyName:
        this.cleanText(
          target?.firma || target?.name || alias.matchedCompanyName,
        ) || rawText,
      companyId: target?.id || alias.matchedCompanyId || "",
      aliasId: alias.id || "",
    };
  }

  private matchCompany(company: MainCompany, rawName: any) {
    const resolved = this.resolveCompanyAlias(company, rawName);
    const query = this.normalizeKey(resolved.cleanCompanyName || rawName);
    if (!query) return null;
    const matched =
      this.getCompanies(company).find((row) => {
        const name = this.normalizeKey(row.firma || row.name);
        return name === query || name.includes(query) || query.includes(name);
      }) || null;
    return matched && resolved.matched
      ? {
          ...matched,
          rawCompanyName: resolved.rawName,
          aliasMatched: true,
          aliasId: resolved.aliasId,
        }
      : matched;
  }

  private matchProduct(
    company: MainCompany,
    rawName: any,
    skipSuggestions = false,
  ) {
    const query = this.normalizeKey(rawName);
    if (!query)
      return { product: null, suggestions: [] as any[], status: "Eşleşmedi" };
    const aliases = this.getProductAliases(company);
    const products = this.getProducts(company);
    const alias = aliases.find(
      (row) =>
        this.normalizeKey(row.rawName || row.normalizedRawName) === query,
    );
    const exactId = this.cleanText(alias?.matchedProductId);
    const exact =
      products.find((row) => exactId && String(row.id) === exactId) ||
      products.find((row) => {
        const keys = [row.urunAdi, row.ticariAdi, row.productName, row.kod].map(
          (x) => this.normalizeKey(x),
        );
        return keys.some(
          (key) =>
            key &&
            (key === query || query.includes(key) || key.includes(query)),
        );
      }) ||
      null;

    let suggestions: any[] = [];
    if (!exact && !skipSuggestions) {
      suggestions = products
        .map((row) => {
          const name = this.normalizeKey(
            row.urunAdi || row.ticariAdi || row.productName,
          );
          const tokens = name.split(" ").filter(Boolean);
          const score = tokens.length
            ? tokens.filter((token) => query.includes(token)).length /
              tokens.length
            : 0;
          return { ...row, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
    return {
      product: exact,
      alias,
      suggestions,
      status: exact
        ? "Eşleşti"
        : suggestions.length
          ? "Öneri Var"
          : "Eşleşmedi",
    };
  }

  private extractLotAndPackaging(description: any) {
    const text = this.cleanText(description);
    const lotMatch = text.match(
      /\b(?:LOT|Lot|lot|PART[Iİ]|Parti|parti|BATCH|Batch|SER[Iİ]|Seri)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-_/.]{1,30})/,
    );
    const packagingMatch = text.match(
      /\b(\d+(?:[,.]\d+)?)\s*(KG|KGS|LT|L|ML|GR|G|ADET)\b/i,
    );
    return {
      lotNo: this.cleanText(lotMatch?.[1] || ""),
      packaging: packagingMatch
        ? `${packagingMatch[1]} ${packagingMatch[2].toLocaleUpperCase("tr-TR")}`
        : "",
      productText: this.cleanText(
        text
          .replace(
            /\b(?:LOT|Lot|lot|PART[Iİ]|Parti|parti|BATCH|Batch|SER[Iİ]|Seri)\s*[:#\-]?\s*[A-Z0-9][A-Z0-9\-_/.]{1,30}/g,
            "",
          )
          .replace(/\b\d+(?:[,.]\d+)?\s*(KG|KGS|LT|L|ML|GR|G|ADET)\b/gi, ""),
      ),
    };
  }

  private normalizeLine(company: MainCompany, rawLine: any, index: number) {
    const description = this.cleanText(
      rawLine.rawDescription ||
        rawLine.description ||
        rawLine.urunAdi ||
        rawLine.itemName ||
        rawLine.name,
    );
    const extracted = this.extractLotAndPackaging(description);
    const match = this.matchProduct(
      company,
      rawLine.matchedProductName || extracted.productText || description,
    );
    const product = match.product;
    const quantity = this.parseQuantity(
      rawLine.quantity ?? rawLine.miktar ?? rawLine.adet,
    );
    const unitPrice = this.parseAmount(rawLine.unitPrice ?? rawLine.birimFiyat);
    const kdvRate = this.parseAmount(rawLine.kdvRate ?? rawLine.kdvOrani);
    const baseTotal = this.parseAmount(rawLine.lineTotal ?? rawLine.toplam);
    const lineTotal = baseTotal || Number((quantity * unitPrice).toFixed(2));
    const kdvAmount =
      this.parseAmount(rawLine.kdvAmount ?? rawLine.kdv) ||
      Number(((lineTotal * kdvRate) / 100).toFixed(2));
    return {
      id: this.cleanText(rawLine.id) || this.uid(`line-${index + 1}`),
      sourceLineNo: rawLine.sourceLineNo || index + 1,
      rawDescription: description,
      matchedProductId: this.cleanText(rawLine.matchedProductId || product?.id),
      matchedProductName: this.cleanText(
        rawLine.matchedProductName ||
          product?.urunAdi ||
          product?.ticariAdi ||
          "",
      ),
      packaging: this.cleanText(
        rawLine.packaging ||
          rawLine.ambalaj ||
          extracted.packaging ||
          match.alias?.packaging ||
          match.alias?.ambalaj ||
          product?.varsayilanAmbalaj ||
          product?.ambalaj,
      ),
      lotNo: this.cleanText(rawLine.lotNo || rawLine.lot || extracted.lotNo),
      quantity,
      unit: this.cleanText(
        rawLine.unit || rawLine.birim || product?.birim || "ADET",
      ),
      unitPrice,
      kdvRate,
      kdvAmount,
      lineTotal,
      matchStatus: this.cleanText(rawLine.matchStatus) || match.status,
      suggestions: Array.isArray(rawLine.suggestions)
        ? rawLine.suggestions
        : match.suggestions,
      notes: this.cleanText(rawLine.notes || rawLine.not),
    };
  }

  private normalizeSupplierInvoice(company: MainCompany, payload: any) {
    const now = this.nowIso();
    const id =
      this.cleanText(payload.id || payload.invoiceId || payload.documentId) ||
      this.uid("sinv");
    const supplierName = this.cleanText(
      payload.supplierName || payload.firma || payload.companyName,
    );
    const supplier = this.matchCompany(company, supplierName);
    const lines = (
      Array.isArray(payload.lines)
        ? payload.lines
        : Array.isArray(payload.items)
          ? payload.items
          : []
    ).map((line: any, index: number) =>
      this.normalizeLine(company, line, index),
    );
    const subtotal =
      this.parseAmount(payload.subtotal ?? payload.araToplam) ||
      Number(
        lines
          .reduce(
            (sum: number, line: any) => sum + Number(line.lineTotal || 0),
            0,
          )
          .toFixed(2),
      );
    const kdv =
      this.parseAmount(payload.kdv ?? payload.kdvAmount) ||
      Number(
        lines
          .reduce(
            (sum: number, line: any) => sum + Number(line.kdvAmount || 0),
            0,
          )
          .toFixed(2),
      );
    const grandTotal =
      this.parseAmount(payload.grandTotal ?? payload.genelToplam) ||
      Number((subtotal + kdv).toFixed(2));
    return {
      id,
      invoiceId: id,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      supplierCompanyId: this.cleanText(
        payload.supplierCompanyId || supplier?.id,
      ),
      supplierName: supplier?.firma || supplierName,
      tedarikciAdi: supplier?.firma || this.cleanText(payload.tedarikciAdi) || supplierName,
      firma: supplier?.firma || supplierName,
      invoiceNo: this.cleanText(
        payload.invoiceNo || payload.faturaNo || payload.documentNo,
      ),
      faturaNo: this.cleanText(
        payload.faturaNo || payload.invoiceNo || payload.documentNo,
      ),
      dispatchNo: this.cleanText(payload.dispatchNo || payload.irsaliyeNo),
      irsaliyeNo: this.cleanText(payload.irsaliyeNo || payload.dispatchNo),
      invoiceDate: this.cleanText(
        payload.invoiceDate || payload.tarih || this.today(),
      ),
      tarih: this.cleanText(
        payload.tarih || payload.invoiceDate || this.today(),
      ),
      status: this.cleanText(payload.status || payload.durum || "Havuzda"),
      durum: this.cleanText(payload.durum || payload.status || "Havuzda"),
      belgeTipi: this.cleanText(payload.belgeTipi || "TEDARIKCI_GELEN_FATURA"),
      belgeTuru: this.cleanText(payload.belgeTuru || "Tedarikçi Fatura"),
      belgeNo: this.cleanText(payload.belgeNo || payload.faturaNo || payload.invoiceNo),
      resmiDurum: this.cleanText(payload.resmiDurum || "RESMI"),
      odemeDurumu: this.cleanText(payload.odemeDurumu || "ODENMEDI"),
      urunEslestirmeDurumu: this.cleanText(
        payload.urunEslestirmeDurumu || "ESLESME_BEKLIYOR",
      ),
      belgeDosyaYolu: this.cleanText(
        payload.belgeDosyaYolu || payload.pdfPath || payload.dosyaYolu,
      ),
      subtotal,
      araToplam: subtotal,
      kdv,
      grandTotal,
      genelToplam: grandTotal,
      currency: this.cleanText(payload.currency || "TRY"),
      notes: this.cleanText(payload.notes || payload.aciklama),
      aciklama: this.cleanText(payload.aciklama || payload.notes),
      sourceUploadId: this.cleanText(payload.sourceUploadId),
      xmlTotals: payload.xmlTotals || null,
      lines,
      updatedAt: now,
      createdAt: this.cleanText(payload.createdAt) || now,
    };
  }

  private normalizeIncomingDelivery(company: MainCompany, payload: any) {
    const now = this.nowIso();
    const id =
      this.cleanText(payload.id || payload.deliveryId || payload.documentId) ||
      this.uid("idel");
    const firmName = this.cleanText(payload.companyName || payload.firma);
    const firm = this.matchCompany(company, firmName);
    return {
      id,
      deliveryId: id,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      companyId: this.cleanText(payload.companyId || firm?.id),
      firma: firm?.firma || firmName,
      companyName: firm?.firma || firmName,
      tarih: this.cleanText(payload.tarih || payload.date || this.today()),
      date: this.cleanText(payload.date || payload.tarih || this.today()),
      irsaliyeNo: this.cleanText(
        payload.irsaliyeNo || payload.dispatchNo || payload.documentNo,
      ),
      dispatchNo: this.cleanText(
        payload.dispatchNo || payload.irsaliyeNo || payload.documentNo,
      ),
      zemin: this.cleanText(payload.zemin),
      kesimhaneAdi: this.cleanText(
        payload.kesimhaneAdi || payload.kesimhaneBilgisi,
      ),
      gelenAdet: this.parseQuantity(payload.gelenAdet || payload.quantity),
      piyonNo: this.cleanText(payload.piyonNo),
      siparisNo: this.cleanText(payload.siparisNo || payload.orderNo),
      orderNo: this.cleanText(payload.orderNo || payload.siparisNo),
      planTarihi: this.cleanText(payload.planTarihi || payload.plannedDate),
      plannedDate: this.cleanText(payload.plannedDate || payload.planTarihi),
      beklenenTeslimTarihi: this.cleanText(
        payload.beklenenTeslimTarihi || payload.dueDate,
      ),
      dueDate: this.cleanText(payload.dueDate || payload.beklenenTeslimTarihi),
      planlananAdet: this.parseQuantity(
        payload.planlananAdet || payload.plannedQuantity || payload.plannedQty,
      ),
      plannedQuantity: this.parseQuantity(
        payload.plannedQuantity || payload.planlananAdet || payload.plannedQty,
      ),
      birimFiyat: this.parseAmount(payload.birimFiyat || payload.unitPrice),
      unitPrice: this.parseAmount(payload.unitPrice || payload.birimFiyat),
      fiyatKaynagi: this.cleanText(payload.fiyatKaynagi || payload.priceSource),
      priceSource: this.cleanText(payload.priceSource || payload.fiyatKaynagi),
      isPlannedJob:
        payload.isPlannedJob !== undefined
          ? Boolean(payload.isPlannedJob)
          : this.cleanText(payload.belgeTipi) === "PLANLI_MUSTERI_IS",
      aciklama: this.cleanText(payload.aciklama || payload.notes),
      modelId: this.cleanText(payload.modelId || payload.modelKaydiId),
      modelAdi: this.cleanText(payload.modelAdi),
      modelAdiOnerisi: this.cleanText(payload.modelAdiOnerisi),
      hamAciklama: this.cleanText(
        payload.hamAciklama || payload.rawDescription || payload.aciklama,
      ),
      rawDescription: this.cleanText(
        payload.rawDescription || payload.hamAciklama || payload.aciklama,
      ),
      modelMappingRule: payload.modelMappingRule || payload.mappingRuleDraft || null,
      belgeTipi: this.cleanText(payload.belgeTipi || "MUSTERIDEN_GELEN_IRSALIYE"),
      belgeNo: this.cleanText(
        payload.belgeNo || payload.irsaliyeNo || payload.dispatchNo,
      ),
      birim: this.cleanText(payload.birim || "ADET"),
      belgeDosyaYolu: this.cleanText(
        payload.belgeDosyaYolu || payload.pdfPath || payload.dosyaYolu,
      ),
      sourceUploadId: this.cleanText(payload.sourceUploadId),
      status: this.cleanText(
        payload.status ||
          payload.durum ||
          (this.cleanText(payload.modelId || payload.modelKaydiId)
            ? "İrsaliye Geldi / Fatura Kesilmedi"
            : "Model Bağlantısı Bekliyor"),
      ),
      durum: this.cleanText(
        payload.durum ||
          payload.status ||
          (this.cleanText(payload.modelId || payload.modelKaydiId)
            ? "İrsaliye Geldi / Fatura Kesilmedi"
            : "Model Bağlantısı Bekliyor"),
      ),
      lines: Array.isArray(payload.lines)
        ? payload.lines
        : Array.isArray(payload.items)
          ? payload.items
          : [],
      createdAt: this.cleanText(payload.createdAt) || now,
      updatedAt: now,
    };
  }

  private normalizeOutgoingDocument(company: MainCompany, payload: any) {
    const now = this.nowIso();
    const id =
      this.cleanText(payload.id || payload.documentId) || this.uid("odoc");
    const firmName = this.cleanText(payload.companyName || payload.firma);
    const firm = this.matchCompany(company, firmName);
    const documentType = this.cleanText(
      payload.documentType ||
        payload.belgeTuru ||
        payload.belgeTipi ||
        "Fatura",
    );
    const isDispatch = this.isDispatchType(documentType);
    const invoiceNo = this.cleanText(
      payload.faturaNo ||
        payload.invoiceNo ||
        (!isDispatch ? payload.documentNo || payload.belgeNo : ""),
    );
    const dispatchNo = this.cleanText(
      payload.irsaliyeNo ||
        payload.dispatchNo ||
        payload.bagliIrsaliyeNo ||
        (isDispatch ? payload.documentNo || payload.belgeNo : ""),
    );
    return {
      id,
      documentId: id,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      companyId: this.cleanText(payload.companyId || firm?.id),
      firma: firm?.firma || firmName,
      companyName: firm?.firma || firmName,
      tarih: this.cleanText(payload.tarih || payload.date || this.today()),
      date: this.cleanText(payload.date || payload.tarih || this.today()),
      belgeTuru: documentType,
      documentType,
      belgeTipi: isDispatch ? "BIZIM_GIDEN_IRSALIYE" : "BIZIM_GIDEN_FATURA",
      belgeNo: isDispatch ? dispatchNo : invoiceNo,
      faturaNo: invoiceNo,
      irsaliyeNo: dispatchNo,
      bagliIrsaliyeNo: this.cleanText(payload.bagliIrsaliyeNo || dispatchNo),
      bagliFaturaNo: this.cleanText(payload.bagliFaturaNo),
      bagliIrsaliyeId: this.cleanText(payload.bagliIrsaliyeId),
      bagliFaturaId: this.cleanText(payload.bagliFaturaId),
      kdv: this.parseAmount(payload.kdv),
      araToplam: this.parseAmount(payload.araToplam || payload.subtotal),
      toplamTutar: this.parseAmount(payload.toplamTutar || payload.grandTotal),
      aciklama: this.cleanText(payload.aciklama || payload.notes),
      modelId: this.cleanText(payload.modelId || payload.modelKaydiId),
      modelAdi: this.cleanText(payload.modelAdi),
      modelAdiOnerisi: this.cleanText(payload.modelAdiOnerisi),
      adet: this.parseQuantity(
        payload.adet ||
          payload.quantity ||
          payload.lines?.[0]?.adet ||
          payload.lines?.[0]?.quantity,
      ),
      birimFiyat: this.parseAmount(payload.birimFiyat || payload.unitPrice),
      tutar: this.parseAmount(payload.tutar || payload.araToplam || payload.subtotal),
      genelToplam: this.parseAmount(payload.genelToplam || payload.toplamTutar || payload.grandTotal),
      resmiDurum: this.cleanText(payload.resmiDurum || payload.recordGroup || "RESMI"),
      kdvDahilHaric: this.cleanText(payload.kdvDahilHaric || payload.kdvMode || "HARIC"),
      cariDurum: this.cleanText(payload.cariDurum),
      odemeDurumu: this.cleanText(payload.odemeDurumu || payload.ödemeDurumu || (isDispatch ? "" : "ODENMEDI")),
      ekstreDurumu: this.cleanText(payload.ekstreDurumu || payload.statementStatus || (isDispatch ? "" : "KONTROL_EDILMEDI")),
      mailDurumu: this.cleanText(payload.mailDurumu || (isDispatch ? "" : "GONDERILMEDI")),
      mailEkiOlarakKullan:
        payload.mailEkiOlarakKullan !== undefined
          ? Boolean(payload.mailEkiOlarakKullan)
          : isDispatch,
      faturaPdfPath: this.cleanText(
        payload.faturaPdfPath || (!isDispatch ? payload.pdfPath || payload.dosyaYolu : ""),
      ),
      irsaliyePdfPath: this.cleanText(
        payload.irsaliyePdfPath || (isDispatch ? payload.pdfPath || payload.dosyaYolu : ""),
      ),
      belgeDosyaYolu: this.cleanText(
        payload.belgeDosyaYolu || payload.pdfPath || payload.dosyaYolu,
      ),
      sourceUploadId: this.cleanText(payload.sourceUploadId),
      status: this.cleanText(
        payload.status ||
          payload.durum ||
          (this.cleanText(payload.modelId || payload.modelKaydiId)
            ? "Kaydedildi"
            : "Model Bağlantısı Bekliyor"),
      ),
      durum: this.cleanText(
        payload.durum ||
          payload.status ||
          (this.cleanText(payload.modelId || payload.modelKaydiId)
            ? "Kaydedildi"
            : "Model Bağlantısı Bekliyor"),
      ),
      lines: Array.isArray(payload.lines) ? payload.lines : [],
      createdAt: this.cleanText(payload.createdAt) || now,
      updatedAt: now,
    };
  }

  private detectDocumentKind(fileName: string, text: string): DocumentKind {
    const source = this.normalizeKey(`${fileName} ${text.slice(0, 4000)}`);
    const ext = path.extname(fileName || "").toLocaleLowerCase("tr-TR");
    if (ext === ".xlsx" || ext === ".csv") return "statement-file";
    if (/^DDM\d{8,}/i.test(this.cleanText(fileName))) return "outgoing-document";
    if (/^HKN\d{8,}/i.test(this.cleanText(fileName))) return "outgoing-document";
    if (/^TIA\d{8,}/i.test(this.cleanText(fileName))) return "incoming-delivery";
    if (source.includes("IRSALIYE") || source.includes("DESPATCH")) {
      return source.includes("HAKAN") ||
        source.includes("MECIT") ||
        source.includes("DDM")
        ? "outgoing-document"
        : "incoming-delivery";
    }
    if (
      source.includes("INVOICE") ||
      source.includes("FATURA") ||
      source.includes("E FATURA")
    ) {
      return source.includes("HAKAN BASKI") || source.includes("MECIT HAKAN")
        ? "outgoing-document"
        : "supplier-invoice";
    }
    if (source.includes("INV")) return "supplier-invoice";
    if (source.includes("IRS") || source.includes("IR-"))
      return "incoming-delivery";
    return "pending";
  }

  private kindLabel(kind: DocumentKind) {
    if (kind === "supplier-invoice") return "Tedarikçi Fatura";
    if (kind === "incoming-delivery") return "Müşteriden Gelen İrsaliye";
    if (kind === "outgoing-document") return "Bizim Belge";
    if (kind === "statement-file") return "Ekstre Dosyası";
    return "Tasnif Bekleyen";
  }

  private poolLabel(kind: DocumentKind) {
    if (kind === "supplier-invoice") return "Tedarikçi Fatura Havuzu";
    if (kind === "incoming-delivery") return "Müşteriden Gelen İrsaliye Havuzu";
    if (kind === "outgoing-document") return "Bizim Belgeler Havuzu";
    if (kind === "statement-file") return "Ekstre Dosyası";
    return "Tasnif Bekleyen";
  }

  private kindFromBelgeTipi(belgeTipi: string): DocumentKind {
    if (belgeTipi === "tedarikci_gelen_fatura") return "supplier-invoice";
    if (belgeTipi === "musteriden_gelen_irsaliye") return "incoming-delivery";
    if (
      belgeTipi === "bizim_kestigimiz_fatura" ||
      belgeTipi === "bizim_kestigimiz_irsaliye"
    )
      return "outgoing-document";
    if (belgeTipi === "kayit_odeme_cari_hareket") return "statement-file";
    return "pending";
  }

  private folderName(kind: DocumentKind, fileType: string) {
    if (fileType === "XML") return "HKN XML";
    if (kind === "supplier-invoice") return "HKN GELEN FATURA";
    if (kind === "incoming-delivery") return "HKN GELEN İRSALİYE";
    if (kind === "outgoing-document") return "HKN FATURA";
    if (kind === "statement-file") return "EKSTRE";
    return "TASNIF BEKLEYEN";
  }

  private getDocumentPathSettings(company: MainCompany) {
    return this.db.readMainCompanyStore<any>(
      company.slug,
      "document-path-settings.json",
      {},
    );
  }

  private cleanUploadFolderSetting(
    value: any,
    fallback: string,
    options?: { allowAbsolutePath?: boolean },
  ) {
    const normalized = this.cleanText(value)
      .replace(/^"+|"+$/g, "")
      .replace(/^'+|'+$/g, "")
      .trim();
    if (!normalized) return fallback;
    const looksLikePath =
      path.isAbsolute(normalized) ||
      normalized.includes("\\") ||
      normalized.includes("/");
    if (looksLikePath && !options?.allowAbsolutePath) return fallback;
    return normalized;
  }

  private folderNameFromSettings(
    company: MainCompany,
    kind: DocumentKind,
    fileType: string,
  ) {
    const settings = this.getDocumentPathSettings(company);
    if (fileType === "XML") {
      return this.cleanUploadFolderSetting(
        settings.belgeYuklemeXmlFolder,
        "HKN XML",
        { allowAbsolutePath: true },
      );
    }
    if (kind === "supplier-invoice") {
      return this.cleanUploadFolderSetting(
        settings.belgeYuklemeGelenFaturaFolder,
        "HKN GELEN FATURA",
      );
    }
    if (kind === "incoming-delivery") {
      return this.cleanUploadFolderSetting(
        settings.belgeYuklemeGelenIrsaliyeFolder,
        "HKN GELEN İRSALİYE",
      );
    }
    if (kind === "outgoing-document") {
      return this.cleanUploadFolderSetting(
        settings.belgeYuklemeFaturaFolder,
        "HKN FATURA",
      );
    }
    return this.cleanUploadFolderSetting(
      settings.belgeYuklemeTasnifFolder,
      "TASNIF BEKLEYEN",
    );
  }

  private archiveRoot(company: MainCompany) {
    const settings = this.getDocumentPathSettings(company);
    const configured = this.cleanText(settings.documentArchiveRootPath);
    if (configured) return configured;
    return path.join(this.db.getMainCompanyDir(company.slug), "documents");
  }

  private resolveArchiveTargetDir(
    company: MainCompany,
    folder: string,
    monthKey: string,
  ) {
    const cleanFolder = this.cleanText(folder) || "TASNIF BEKLEYEN";
    const baseDir = path.isAbsolute(cleanFolder)
      ? cleanFolder
      : path.join(this.archiveRoot(company), cleanFolder);
    return path.join(baseDir, monthKey.slice(0, 4), monthKey.slice(5, 7));
  }

  private savedFolderLabel(folder: string, monthKey: string) {
    const cleanFolder = this.cleanText(folder) || "TASNIF BEKLEYEN";
    const label = path.isAbsolute(cleanFolder)
      ? path.basename(cleanFolder) || cleanFolder
      : cleanFolder;
    return `${label} / ${monthKey.replace("-", " / ")}`;
  }

  private extractXmlText(filePath: string) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  }

  private tag(xml: string, name: string) {
    const match = xml.match(
      new RegExp(
        `<(?:[^>\\s]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[^>\\s]+:)?${name}>`,
        "i",
      ),
    );
    return this.cleanText((match?.[1] || "").replace(/<[^>]+>/g, " "));
  }

  private block(xml: string, name: string) {
    const match = xml.match(
      new RegExp(
        `<(?:[^>\\s]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[^>\\s]+:)?${name}>`,
        "i",
      ),
    );
    return match?.[1] || "";
  }

  private tagAttr(xml: string, name: string, attr: string) {
    const match = xml.match(
      new RegExp(
        `<(?:[^>\\s]+:)?${name}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`,
        "i",
      ),
    );
    return this.cleanText(match?.[1] || "");
  }

  private xmlPartyInfo(xml: string) {
    const supplierBlock =
      this.block(xml, "AccountingSupplierParty") ||
      this.block(xml, "DespatchSupplierParty") ||
      this.block(xml, "SellerSupplierParty");
    const customerBlock =
      this.block(xml, "AccountingCustomerParty") ||
      this.block(xml, "DeliveryCustomerParty") ||
      this.block(xml, "BuyerCustomerParty");
    const pick = (partyBlock: string) => ({
      name:
        this.tag(partyBlock, "RegistrationName") ||
        this.tag(partyBlock, "Name") ||
        this.tag(partyBlock, "PartyName"),
      taxNo: this.tag(partyBlock, "CompanyID") || this.tag(partyBlock, "ID"),
    });
    return {
      supplier: pick(supplierBlock),
      customer: pick(customerBlock),
    };
  }

  private isMainCompanyParty(
    company: MainCompany,
    party: { name?: string; taxNo?: string },
  ) {
    const partyName = this.normalizeKey(party?.name);
    const partyTax = this.normalizeKey(party?.taxNo);
    const companyName = this.normalizeKey(company.name);
    const companySlug = this.normalizeKey(company.slug);
    const settings = this.getDocumentPathSettings(company);
    const settingsKeys = [
      settings.companyName,
      settings.mainCompanyName,
      settings.vkn,
      settings.taxNo,
      settings.vergiNo,
    ].map((value) => this.normalizeKey(value));
    const fixedMainCompanyAliases = [
      "MECIT HAKAN",
      "MECİT HAKAN",
      "HAKAN GURSU",
      "HAKAN GÜRSU",
      "HAKAN EMP",
      "HAKAN EMP AKS",
      "HAKAN EMPRIME",
      "HAKAN EMPRİME",
    ].map((value) => this.normalizeKey(value));
    const keys = [
      companyName,
      companySlug,
      ...settingsKeys,
      ...fixedMainCompanyAliases,
    ].filter(Boolean);
    return keys.some((key) => {
      if (!key) return false;
      return (
        (partyName &&
          (partyName === key ||
            partyName.includes(key) ||
            key.includes(partyName))) ||
        (partyTax && partyTax === key)
      );
    });
  }

  private detectXmlDocumentKind(
    company: MainCompany,
    fileName: string,
    xmlText: string,
  ): DocumentKind {
    const source = this.normalizeKey(`${fileName} ${xmlText.slice(0, 4000)}`);
    const isDespatch =
      source.includes("DESPATCH") || source.includes("IRSALIYE");
    const isInvoice = source.includes("INVOICE") || source.includes("FATURA");
    const parties = this.xmlPartyInfo(xmlText);
    const supplierIsMain = this.isMainCompanyParty(company, parties.supplier);
    const customerIsMain = this.isMainCompanyParty(company, parties.customer);

    if (supplierIsMain) return "outgoing-document";
    if (customerIsMain && isDespatch) return "incoming-delivery";
    if (customerIsMain && isInvoice) return "supplier-invoice";
    if (isDespatch) return "incoming-delivery";
    if (isInvoice) return "supplier-invoice";
    return this.detectDocumentKind(fileName, xmlText);
  }

  private hasPdfInvoiceSignals(text: string) {
    const key = this.normalizeKey(text);
    const signals = [
      key.includes("E FATURA") || key.includes("EFATURA"),
      key.includes("FATURA NO"),
      key.includes("FATURA TARIHI"),
      key.includes("VKN") || key.includes("TCKN"),
      key.includes("MAL HIZMET"),
      key.includes("KDV"),
    ];
    return signals.filter(Boolean).length >= 2;
  }

  private hasPdfDispatchSignals(fileName: string, text: string) {
    const key = this.normalizeKey(`${fileName} ${text}`);
    return (
      key.includes("IRSALIYE") ||
      key.includes("DESPATCH") ||
      /^DDM\d{8,}/i.test(this.cleanText(fileName)) ||
      /^TIA\d{8,}/i.test(this.cleanText(fileName))
    );
  }

  private documentNoFromName(fileName: string) {
    const base = path.parse(this.cleanText(fileName)).name;
    const match = base.match(/\b([A-Z]{2,4}\d{10,16})\b/i);
    return this.cleanText(match?.[1] || "");
  }

  private pdfLineAfter(lines: string[], label: string) {
    const labelKey = this.normalizeKey(label);
    const index = lines.findIndex((line) =>
      this.normalizeKey(line).includes(labelKey),
    );
    return index >= 0 ? this.cleanText(lines[index + 1] || "") : "";
  }

  private pdfLabelValue(text: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*:?\\s*([^\\n]+)`, "i"));
    return this.cleanText(match?.[1] || "");
  }

  private pdfLabelValueAny(text: string, labels: string[]) {
    for (const label of labels) {
      const value = this.pdfLabelValue(text, label);
      if (value) return value;
    }
    return "";
  }

  private pdfAmountAfter(text: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(
      new RegExp(`${escaped}\\s*([0-9.]+,[0-9]{2})`, "i"),
    );
    return this.parseAmount(match?.[1] || "");
  }

  private pdfAmountAfterAny(text: string, labels: string[]) {
    for (const label of labels) {
      const value = this.pdfAmountAfter(text, label);
      if (value) return value;
    }
    return 0;
  }

  private extractPdfPartyByLabels(text: string, labels: string[]) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => this.cleanText(line))
      .filter(Boolean);
    const labelKeys = labels.map((label) => this.normalizeKey(label));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const key = this.normalizeKey(line);
      const labelKey = labelKeys.find((candidate) => key.includes(candidate));
      if (!labelKey) continue;
      const inline = this.cleanText(line.split(":").slice(1).join(":"));
      if (inline) return inline;
      for (const nextLine of lines.slice(index + 1, index + 5)) {
        const nextKey = this.normalizeKey(nextLine);
        if (
          !nextKey ||
          labelKeys.some((candidate) => nextKey.includes(candidate)) ||
          nextKey.includes("VKN") ||
          nextKey.includes("TCKN") ||
          nextKey.includes("VERGI") ||
          nextKey.includes("ADRES")
        ) {
          continue;
        }
        return nextLine;
      }
    }
    return "";
  }

  private simplifyKnownCompanyName(value: any) {
    const key = this.normalizeKey(value);
    if (key.includes("TAHA GIYIM")) return "TAHA GİYİM";
    if (key.includes("SELVI KIMYA")) return "SELVİ KİMYA";
    if (key.includes("MECIT HAKAN") || key.includes("HAKAN EMPRIME"))
      return "MECİT HAKAN GÜRSU";
    return this.cleanText(value);
  }

  private modelSuggestionFromText(value: any) {
    return this.cleanText(value)
      .replace(/[,/]+/g, " ")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractPdfCustomerTitle(lines: string[]) {
    const start = lines.findIndex(
      (line) => this.normalizeKey(line) === "SAYIN",
    );
    if (start < 0) return "";
    const titleLines: string[] = [];
    for (const line of lines.slice(start + 1, start + 5)) {
      const key = this.normalizeKey(line);
      if (
        !key ||
        key.includes("E POSTA") ||
        key.includes("TEL") ||
        key.includes("VERGI")
      )
        break;
      if (
        key.includes(" MAH") ||
        key.includes(" MH") ||
        key.includes(" SOKAK") ||
        key.includes(" SK") ||
        key.includes(" CAD") ||
        key.includes(" CD") ||
        key.includes("ISTANBUL")
      )
        break;
      titleLines.push(line);
    }
    return this.cleanText(titleLines.join(" "));
  }

  private extractPdfLineItems(text: string) {
    const compact = this.normalizePdfText(text).replace(/\n/g, " ");
    const rows: any[] = [];
    const invoiceRow =
      /\b([1-9]\d{0,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*(Kg|KG|KGS|ADET|Adet|LT|L|GR|G)\.?\s+(\d{1,3}(?:\.\d{3})*,\d{2}|0,00)\s*TL(?:\s+%?\d+(?:,\d{2})?){0,3}\s+(\d{1,3}(?:\.\d{3})*,\d{2}|0,00)\s*TL\s+(\d{1,3}(?:\.\d{3})*,\d{2}|0,00)\s*TL/gi;
    for (const match of compact.matchAll(invoiceRow)) {
      const description = this.cleanText(match[2])
        .replace(/^.*?\bTutar[ıi]?\s+/i, "")
        .replace(/\bLOT\s*NO\b.*$/i, "")
        .trim();
      if (!description || this.normalizeKey(description).includes("MAL HIZMET"))
        continue;
      rows.push({
        id: this.uid(`line-${rows.length + 1}`),
        lineNo: rows.length + 1,
        sourceLineNo: rows.length + 1,
        rawDescription: description,
        productName: description,
        matchedProductId: "",
        matchedProductName: "",
        quantity: this.parseQuantity(match[3]),
        unit: match[4]
          .toLocaleUpperCase("tr-TR")
          .replace(/\.$/, "")
          .replace("KG.", "KG")
          .replace("ADET", "ADET"),
        unitPrice: this.parseAmount(match[5]),
        kdvRate: 20,
        kdvAmount: this.parseAmount(match[6]),
        lineTotal: this.parseAmount(match[7]),
        lotNo: "",
        packaging: "",
        matchStatus: "eslesme_bekliyor",
        suggestions: [],
        notes: "PDF taslak kalemi; XML ile doğrulama önerilir.",
      });
    }
    if (rows.length) return rows;

    const dispatchRow =
      /\b([1-9]\d{0,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*(ADET|Adet)\b/gi;
    for (const match of compact.matchAll(dispatchRow)) {
      const description = this.cleanText(match[2])
        .replace(/^.*?\bTutar[ıi]?\s+/i, "")
        .trim();
      if (!description || this.normalizeKey(description).includes("MAL HIZMET"))
        continue;
      rows.push({
        id: this.uid(`line-${rows.length + 1}`),
        lineNo: rows.length + 1,
        sourceLineNo: rows.length + 1,
        rawDescription: description,
        productName: description,
        quantity: this.parseQuantity(match[3]),
        unit: "ADET",
        unitPrice: 0,
        kdvRate: 0,
        kdvAmount: 0,
        lineTotal: 0,
        lotNo: "",
        packaging: "",
        matchStatus: "eslesme_bekliyor",
        suggestions: [],
        notes: "PDF irsaliye taslak kalemi.",
      });
    }
    if (rows.length) return rows;

    const match = compact.match(
      /(?:^|\s)1\s*(.+?)(\d+(?:[,.]\d+)?)\s*(Kg|KG|KGS|ADET|LT|L|GR|G)\.?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL\s*%?(\d{1,2})(?:,\d{2})?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/i,
    );
    if (!match) return [];
    const description = this.cleanText(match[1]).replace(/^\d+/, "");
    if (!description || this.normalizeKey(description).includes("MAL HIZMET"))
      return [];
    return [
      {
        id: this.uid("line-1"),
        lineNo: 1,
        sourceLineNo: 1,
        rawDescription: description,
        productName: description,
        matchedProductId: "",
        matchedProductName: "",
        quantity: this.parseQuantity(match[2]),
        unit: match[3]
          .toLocaleUpperCase("tr-TR")
          .replace(/\.$/, "")
          .replace("KG.", "KG"),
        unitPrice: this.parseAmount(match[4]),
        kdvRate: this.parseAmount(match[5]),
        kdvAmount: this.parseAmount(match[6]),
        lineTotal: this.parseAmount(match[7]),
        lotNo: "",
        packaging: "",
        matchStatus: "eslesme_bekliyor",
        suggestions: [],
        notes: "PDF taslak kalemi; XML ile doğrulama önerilir.",
      },
    ];
  }

  private parsePoolPdf(company: MainCompany, filePath: string, fileName = "") {
    return this.pdfExtraction.extractTextFromPdf(filePath).then((result) => {
      const text = this.normalizePdfText(result.text);
      const lines = text
        .split(/\n+/)
        .map((line) => this.cleanText(line))
        .filter(Boolean);
      const warnings: string[] = [
        "PDF’den okunan taslak bilgidir. XML yüklerseniz daha temiz kayıt alınır.",
      ];
      const sellerName =
        this.extractPdfPartyByLabels(text, [
          "Gönderen/Satıcı",
          "Gönderici",
          "Satıcı",
          "Asıl Satıcı Ünvan",
          "Asıl Satıcı Unvan",
        ]) || this.pdfLineAfter(lines, "İrsaliye Tarihi");
      const buyerName =
        this.extractPdfPartyByLabels(text, [
          "Alıcı",
          "Alıcı Ünvan",
          "Alıcı Unvan",
          "Sayın",
        ]) || this.extractPdfCustomerTitle(lines);

      if (!this.hasPdfInvoiceSignals(text) && this.hasPdfDispatchSignals(fileName, text)) {
        const irsaliyeNo =
          this.pdfLabelValueAny(text, ["İrsaliye No", "Irsaliye No", "İrsaliye Numarası"]) ||
          this.documentNoFromName(fileName);
        const tarih =
          this.parsePdfDate(
            this.pdfLabelValueAny(text, ["İrsaliye Tarihi", "Irsaliye Tarihi", "Düzenleme Tarihi"]),
          ) ||
          this.parsePdfDate(this.pdfLabelValue(text, "Düzenleme Tarihi"));
        const parties = {
          supplier: { name: sellerName, taxNo: "" },
          customer: { name: buyerName, taxNo: "" },
        };
        const supplierIsMain =
          this.isMainCompanyParty(company, parties.supplier) ||
          /^DDM\d{8,}/i.test(this.cleanText(fileName));
        const customerIsMain = this.isMainCompanyParty(company, parties.customer);
        const kind: DocumentKind = supplierIsMain
          ? "outgoing-document"
          : "incoming-delivery";
        const counterparty = supplierIsMain ? buyerName : sellerName;
        const kalemler = this.extractPdfLineItems(text);
        const adet =
          kalemler.reduce((sum, line) => sum + Number(line.quantity || 0), 0) ||
          this.parseQuantity(
            Array.from(text.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:ADET|Adet|ad\.?)/g)).at(-1)?.[1],
          );
        const aciklama =
          this.pdfLabelValueAny(text, ["Açıklama", "Aciklama"]) ||
          this.cleanText(kalemler[0]?.rawDescription || "");
        return {
          kind,
          belgeTipiHint:
            kind === "outgoing-document"
              ? "bizim_kestigimiz_irsaliye"
              : "musteriden_gelen_irsaliye",
          warnings: customerIsMain || supplierIsMain ? warnings : [...warnings, "Ana firma tarafı zayıf okundu; belge tipi yine yönlendirildi."],
          extraction: {
            pageCount: result.pageCount,
            extractorUsed: result.extractorUsed,
            quality: result.quality,
          },
          taslakAlanlar: {
            belgeNo: irsaliyeNo,
            faturaNo: "",
            irsaliyeNo,
            tarih: tarih || this.today(),
            saticiUnvan: parties.supplier.name,
            saticiVkn: "",
            aliciUnvan: parties.customer.name,
            aliciVkn: "",
            paraBirimi: "TRY",
            araToplam: 0,
            kdvToplam: 0,
            genelToplam: 0,
            gelenAdet: adet,
            adet,
            firmaAdi: this.simplifyKnownCompanyName(counterparty),
            aciklama,
          },
          kalemler,
        };
      }
      if (!this.hasPdfInvoiceSignals(text)) {
        return {
          kind: "pending" as DocumentKind,
          warnings: ["PDF’den temel e-Fatura bilgileri net okunamadı."],
          taslakAlanlar: null,
          kalemler: [],
        };
      }

      const faturaNo =
        this.pdfLabelValueAny(text, ["Fatura No", "Fatura Numarası"]) ||
        this.documentNoFromName(fileName);
      const tarih = this.parsePdfDate(
        this.pdfLabelValueAny(text, ["Fatura Tarihi", "Tarih"]),
      );
      const irsaliyeNo = this.pdfLabelValueAny(text, ["İrsaliye No", "Irsaliye No"]);
      const saticiUnvan = sellerName;
      const saticiVkn = this.pdfLabelValue(text, "VKN");
      const aliciUnvan = buyerName;
      const parties = {
        supplier: { name: saticiUnvan, taxNo: saticiVkn },
        customer: { name: aliciUnvan, taxNo: this.pdfLabelValue(text, "TCKN") },
      };
      const supplierIsMain = this.isMainCompanyParty(company, parties.supplier);
      const customerIsMain =
        this.isMainCompanyParty(company, parties.customer) ||
        ["HAKAN EMPRIME", "MECIT HAKAN", "MECİT HAKAN"].some((token) =>
          this.normalizeKey(aliciUnvan).includes(this.normalizeKey(token)),
        );
      const kind: DocumentKind =
        customerIsMain && !supplierIsMain
          ? "supplier-invoice"
          : supplierIsMain
            ? "outgoing-document"
            : "supplier-invoice";
      const belgeTipiHint =
        kind === "outgoing-document" ? "bizim_kestigimiz_fatura" : "";
      const kalemler = this.extractPdfLineItems(text);
      if (!kalemler.length)
        warnings.push(
          "PDF’den kalemler net okunamadı, XML ile doğrulama önerilir.",
        );

      return {
        kind,
        belgeTipiHint,
        warnings,
        extraction: {
          pageCount: result.pageCount,
          extractorUsed: result.extractorUsed,
          quality: result.quality,
        },
        taslakAlanlar: {
          belgeNo: faturaNo,
          faturaNo,
          tarih,
          irsaliyeNo,
          saticiUnvan,
          saticiVkn,
          aliciUnvan,
          aliciVkn: parties.customer.taxNo,
          paraBirimi: "TRY",
          araToplam: this.pdfAmountAfterAny(text, [
            "Mal Hizmet Toplam Tutarı",
            "Mal Hizmet Toplam Tutari",
          ]),
          kdvToplam: this.pdfAmountAfterAny(text, [
            "Hesaplanan KDV %20",
            "Hesaplanan KDV(%20)",
            "Hesaplanan KDV",
            "KDV",
          ]),
          genelToplam:
            this.pdfAmountAfterAny(text, [
              "Ödenecek Tutar",
              "Odenecek Tutar",
              "Vergiler Dahil Toplam Tutar",
            ]),
          adet: kalemler.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
          firmaAdi: this.simplifyKnownCompanyName(
            kind === "outgoing-document" ? aliciUnvan : saticiUnvan,
          ),
          aciklama: this.cleanText(kalemler[0]?.rawDescription || ""),
        },
        kalemler,
      };
    });
  }

  private extractXmlLines(company: MainCompany, xml: string) {
    const lineBlocks = Array.from(
      xml.matchAll(
        /<(?:[^>]+:)?(?:InvoiceLine|DespatchLine)[^>]*>([\s\S]*?)<\/(?:[^>]+:)?(?:InvoiceLine|DespatchLine)>/gi,
      ),
    );
    return lineBlocks.map((match, index) => {
      const block = match[1] || "";
      const itemBlock = this.block(block, "Item");
      const description =
        this.tag(itemBlock, "Name") ||
        this.tag(itemBlock, "Description") ||
        this.tag(block, "Description") ||
        `Kalem ${index + 1}`;
      const quantityTag =
        this.tag(block, "InvoicedQuantity") ||
        this.tag(block, "DeliveredQuantity");
      const unitCode =
        this.tagAttr(block, "InvoicedQuantity", "unitCode") ||
        this.tagAttr(block, "DeliveredQuantity", "unitCode");
      const lineNote = this.tag(block, "Note");
      return this.normalizeLine(
        company,
        {
          rawDescription: description,
          lotNo: this.lotNoFromText(lineNote),
          quantity: quantityTag,
          unit: unitCode === "C62" ? "ADET" : unitCode,
          unitPrice: this.tag(block, "PriceAmount"),
          kdvRate: this.tag(block, "Percent"),
          kdvAmount: this.tag(block, "TaxAmount"),
          lineTotal: this.tag(block, "LineExtensionAmount"),
          notes: lineNote,
        },
        index,
      );
    });
  }

  private normalizeBelgeTipi(value: any) {
    const raw = this.cleanText(value).toLocaleLowerCase("tr-TR");
    const map: Record<string, string> = {
      tedarikci_gelen_fatura: "tedarikci_gelen_fatura",
      supplier_invoice: "tedarikci_gelen_fatura",
      "supplier-invoice": "tedarikci_gelen_fatura",
      gelen_fatura: "tedarikci_gelen_fatura",
      musteriden_gelen_irsaliye: "musteriden_gelen_irsaliye",
      incoming_delivery: "musteriden_gelen_irsaliye",
      "incoming-delivery": "musteriden_gelen_irsaliye",
      gelen_irsaliye: "musteriden_gelen_irsaliye",
      bizim_kestigimiz_fatura: "bizim_kestigimiz_fatura",
      bizim_fatura: "bizim_kestigimiz_fatura",
      bizim_kestigimiz_irsaliye: "bizim_kestigimiz_irsaliye",
      bizim_irsaliye: "bizim_kestigimiz_irsaliye",
      kayit_odeme_cari_hareket: "kayit_odeme_cari_hareket",
      bilinmeyen: "bilinmeyen",
    };
    if (map[raw]) return map[raw];
    const key = raw.replace(/[\s-]+/g, "_");
    return map[key] || "";
  }

  private belgeTipiFromKind(kind: DocumentKind) {
    if (kind === "supplier-invoice") return "tedarikci_gelen_fatura";
    if (kind === "incoming-delivery") return "musteriden_gelen_irsaliye";
    if (kind === "outgoing-document") return "bizim_kestigimiz_fatura";
    if (kind === "statement-file") return "kayit_odeme_cari_hareket";
    return "bilinmeyen";
  }

  private isOutgoingBelgeTipi(belgeTipi: string) {
    return (
      belgeTipi === "bizim_kestigimiz_fatura" ||
      belgeTipi === "bizim_kestigimiz_irsaliye"
    );
  }

  private belgeTipiFamilyKey(belgeTipi: string) {
    if (this.isOutgoingBelgeTipi(belgeTipi)) return "outgoing-document";
    return belgeTipi;
  }

  private folderKeyForBelgeTipi(belgeTipi: string, role?: string) {
    if (role === "xml") return "XML";
    const map: Record<string, string> = {
      tedarikci_gelen_fatura: "GELEN-FATURA",
      musteriden_gelen_irsaliye: "GELEN-IRSALIYE",
      bizim_kestigimiz_fatura: "BIZIM-FATURA",
      bizim_kestigimiz_irsaliye: "BIZIM-IRSALIYE",
      kayit_odeme_cari_hareket: "CARI-HAREKET",
      bilinmeyen: "TASNIF-BEKLEYEN",
    };
    return map[belgeTipi] || "TASNIF-BEKLEYEN";
  }

  private roleForFile(file: any) {
    const ext = path
      .extname(file?.originalname || file?.filename || "")
      .toLowerCase();
    const mime = this.cleanText(file?.mimetype).toLowerCase();
    if (ext === ".xml" || mime.includes("xml")) return "xml";
    if (ext === ".pdf" || mime === "application/pdf") return "pdf";
    if (ext === ".xlsx" || ext === ".csv" || mime.includes("spreadsheet") || mime.includes("csv"))
      return "statement";
    if ([".jpg", ".jpeg", ".png"].includes(ext) || mime.startsWith("image/"))
      return "image";
    return "archive";
  }

  private sourceFromRoles(roles: string[]) {
    const unique = new Set(roles);
    if (unique.size > 1) return "mixed";
    if (unique.has("xml")) return "xml";
    if (unique.has("pdf")) return "pdf";
    if (unique.has("statement")) return "statement";
    if (unique.has("image")) return "image";
    return "mixed";
  }

  private lotNoFromText(value: any) {
    const text = this.cleanText(value);
    const match = text.match(
      /\b(?:LOT|Lot No|Lot|PARTI|Parti|Batch|Seri)\s*[:#-]?\s*([A-Z0-9./_-]+)/i,
    );
    if (match?.[1]) return this.cleanText(match[1]);
    if (/^[A-Z0-9][A-Z0-9./_-]{4,30}$/i.test(text) && /\d/.test(text))
      return text;
    return "";
  }

  private parsePoolXml(company: MainCompany, xmlText: string, fileName = "") {
    const warnings: string[] = [];
    const kind = this.detectXmlDocumentKind(company, fileName, xmlText);
    const rootIsDespatch = /<\s*(?:[^>\s]+:)?DespatchAdvice\b/i.test(xmlText);
    const rootIsInvoice = /<\s*(?:[^>\s]+:)?Invoice\b/i.test(xmlText);
    const belgeTipiHint =
      kind === "outgoing-document"
        ? rootIsDespatch && !rootIsInvoice
          ? "bizim_kestigimiz_irsaliye"
          : "bizim_kestigimiz_fatura"
        : "";
    const parties = this.xmlPartyInfo(xmlText);
    const belgeNo = this.tag(xmlText, "ID");
    const dispatchRef =
      this.tag(this.block(xmlText, "DespatchDocumentReference"), "ID") ||
      this.tag(this.block(xmlText, "DespatchLineReference"), "LineID");
    const tarih = this.tag(xmlText, "IssueDate");
    const paraBirimi =
      this.tagAttr(xmlText, "DocumentCurrencyCode", "listID") ||
      this.tag(xmlText, "DocumentCurrencyCode") ||
      this.tagAttr(xmlText, "PayableAmount", "currencyID") ||
      "TRY";
    const lines = this.extractXmlLines(company, xmlText).map(
      (line: any, index) => ({
        id: this.uid("line"),
        lineNo: index + 1,
        rawDescription: line.rawDescription || line.productName || "",
        productName: line.productName || line.rawDescription || "",
        quantity: Number(line.quantity || 0),
        unit: line.unit || "",
        unitPrice: Number(line.unitPrice || 0),
        kdvRate: Number(line.kdvRate || 0),
        kdvAmount: Number(line.kdvAmount || 0),
        lineTotal: Number(line.lineTotal || 0),
        lotNo:
          line.lotNo ||
          this.lotNoFromText(
            `${line.notes || ""} ${line.rawDescription || ""} ${line.productName || ""}`,
          ),
        matchStatus: "bekliyor",
        matchedProductId: "",
        notes: line.notes || "",
      }),
    );
    if (!belgeNo) warnings.push("XML içinde belge no okunamadı.");
    if (!tarih) warnings.push("XML içinde tarih okunamadı.");
    return {
      kind,
      belgeTipiHint,
      warnings,
      taslakAlanlar: {
        belgeNo,
        faturaNo: rootIsInvoice ? belgeNo : "",
        irsaliyeNo: rootIsDespatch ? belgeNo : dispatchRef,
        bagliIrsaliyeNo: rootIsInvoice ? dispatchRef : "",
        tarih,
        saticiUnvan: parties.supplier?.name || "",
        saticiVkn: parties.supplier?.taxNo || "",
        aliciUnvan: parties.customer?.name || "",
        aliciVkn: parties.customer?.taxNo || "",
        paraBirimi,
        araToplam: this.parseAmount(this.tag(xmlText, "LineExtensionAmount")),
        kdvToplam: this.parseAmount(this.tag(xmlText, "TaxAmount")),
        genelToplam: this.parseAmount(this.tag(xmlText, "PayableAmount")),
        aciklama: this.tag(xmlText, "Note"),
      },
      kalemler: lines,
    };
  }

  private hydratePoolLotsFromXml(company: MainCompany, row: any) {
    const lines = Array.isArray(row?.kalemler) ? row.kalemler : [];
    if (!lines.length || lines.every((line: any) => this.cleanText(line.lotNo)))
      return row;
    const xmlFile = (Array.isArray(row?.dosyalar) ? row.dosyalar : []).find(
      (file: any) =>
        file.role === "xml" || String(file.ext || "").toLowerCase() === ".xml",
    );
    if (!xmlFile?.path) return row;
    const candidatePaths = [
      path.resolve(xmlFile.path),
      path.resolve(process.cwd(), xmlFile.path),
      path.resolve(process.cwd(), "..", xmlFile.path),
    ];
    const filePath = candidatePaths.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!filePath) return row;
    try {
      const parsed = this.parsePoolXml(
        company,
        fs.readFileSync(filePath, "utf8"),
        xmlFile.originalName || xmlFile.savedName || "",
      );
      const parsedLines = Array.isArray(parsed.kalemler) ? parsed.kalemler : [];
      if (!parsedLines.length) return row;
      return {
        ...row,
        kalemler: lines.map((line: any, index: number) => ({
          ...line,
          lotNo:
            this.cleanText(line.lotNo) ||
            this.cleanText(parsedLines[index]?.lotNo),
          notes:
            this.cleanText(line.notes) ||
            this.cleanText(parsedLines[index]?.notes),
        })),
      };
    } catch {
      return row;
    }
  }

  private hydratePoolProductAliases(company: MainCompany, row: any) {
    if (
      row.durum === "islendi" ||
      row.durum === "onaylandi" ||
      row.status === "islendi"
    )
      return row;
    const lines = Array.isArray(row?.kalemler) ? row.kalemler : [];
    if (!lines.length) return row;
    let changed = false;
    const nextLines = lines.map((line: any, index: number) => {
      const rawName =
        line.rawDescription || line.productName || line.description;
      const match = this.matchProduct(company, rawName, true);
      if (!match.product && !match.alias) return line;
      const product = match.product || {};
      const matchedProductId =
        this.cleanText(line.matchedProductId) ||
        this.cleanText(match.alias?.matchedProductId || product.id);
      const matchedProductName =
        this.cleanText(line.matchedProductName) ||
        this.cleanText(
          match.alias?.matchedProductName ||
            product.urunAdi ||
            product.ticariAdi,
        );
      const packaging =
        this.cleanText(line.packaging || line.ambalaj) ||
        this.cleanText(
          match.alias?.packaging ||
            match.alias?.ambalaj ||
            product.varsayilanAmbalaj ||
            product.ambalaj,
        );
      const next = {
        ...line,
        matchedProductId,
        matchedProductName,
        productName: matchedProductName || line.productName,
        packaging,
        matchStatus: matchedProductId ? "eslesti" : line.matchStatus,
      };
      if (JSON.stringify(next) !== JSON.stringify(line)) changed = true;
      return next;
    });
    return changed ? { ...row, kalemler: nextLines } : row;
  }

  private hydratePoolCompanyAlias(company: MainCompany, row: any) {
    if (
      row.durum === "islendi" ||
      row.durum === "onaylandi" ||
      row.status === "islendi"
    )
      return row;
    const draft = row?.taslakAlanlar || {};
    const rawSupplier = this.cleanText(
      draft.rawSupplierName || draft.saticiUnvan || draft.supplierName,
    );
    const resolved = this.resolveCompanyAlias(company, rawSupplier);
    if (
      !resolved.matched ||
      !resolved.cleanCompanyName ||
      this.normalizeKey(resolved.cleanCompanyName) ===
        this.normalizeKey(rawSupplier)
    ) {
      return row;
    }
    return {
      ...row,
      aliasMatched: true,
      rawSupplierName: rawSupplier,
      supplierName: resolved.cleanCompanyName,
      supplierCompanyId: resolved.companyId,
      taslakAlanlar: {
        ...draft,
        rawSupplierName: rawSupplier,
        saticiUnvan: resolved.cleanCompanyName,
        supplierName: resolved.cleanCompanyName,
        supplierCompanyId: resolved.companyId,
        aliasMatched: true,
        supplierAliasId: resolved.aliasId,
        supplierAliasNote: `${rawSupplier}, ${resolved.cleanCompanyName} ile eşleşti.`,
      },
    };
  }

  private savePoolFile(
    company: MainCompany,
    file: any,
    belgeTipi: string,
    role: string,
    dateValue?: any,
  ) {
    const monthKey = this.getMonthKey(dateValue);
    const [year, month] = monthKey.split("-");
    const folderKey = this.folderKeyForBelgeTipi(belgeTipi, role);
    const targetDir = path.join(
      process.cwd(),
      "data",
      "documents",
      company.slug,
      "MUHASEBE",
      folderKey,
      year,
      month,
    );
    fs.mkdirSync(targetDir, { recursive: true });
    const originalName = this.decodeUploadName(
      file.originalname || file.filename || "belge",
    );
    const ext = path.extname(originalName).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${this.sanitizeFilePart(path.parse(originalName).name)}${ext}`;
    const targetPath = path.join(targetDir, safeName);
    try {
      fs.renameSync(file.path, targetPath);
    } catch {
      fs.copyFileSync(file.path, targetPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    return {
      id: this.uid("file"),
      originalName,
      savedName: safeName,
      mimeType: file.mimetype || "",
      size: Number(file.size || 0),
      ext: ext.replace(".", ""),
      role,
      path: path.relative(process.cwd(), targetPath).replace(/\\/g, "/"),
      uploadedAt: this.nowIso(),
      folderKey,
    };
  }

  private listBelgeHavuzuRows(company: MainCompany) {
    return this.listMonthRows<any>(company, "belgeHavuzu").sort((a, b) =>
      this.cleanText(b.createdAt).localeCompare(this.cleanText(a.createdAt)),
    );
  }

  private saveBelgeHavuzuRow(company: MainCompany, row: any) {
    return this.upsertMonthRow(
      company,
      "belgeHavuzu",
      row,
      row.taslakAlanlar?.tarih || row.createdAt,
    );
  }

  private modelSuggestionFromUpload(fileName: string, documentNo: any, lines: any[]) {
    const lineSuggestion = (Array.isArray(lines) ? lines : [])
      .map((line) => this.cleanText(line.modelAdi || line.modelAdayi || line.productName || line.rawDescription))
      .find(Boolean);
    if (lineSuggestion) return this.modelSuggestionFromText(lineSuggestion);
    const base = path.parse(this.cleanText(fileName)).name;
    const docNo = this.cleanText(documentNo);
    return this.cleanText(
      (docNo ? base.replace(new RegExp(`^${docNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "") : base)
        .replace(/^[A-Z]{2,4}\d{8,}/i, "")
        .replace(/^[-_\s]+/, ""),
    );
  }

  private existingIncomingDeliveryId(company: MainCompany, irsaliyeNo: any) {
    const no = this.cleanText(irsaliyeNo);
    if (!no) return "";
    return (
      this.listMonthRows<any>(company, "incomingDeliveries", 36).find(
        (row) => this.cleanText(row.irsaliyeNo || row.dispatchNo || row.belgeNo) === no,
      )?.id || ""
    );
  }

  private existingOutgoingDocumentId(company: MainCompany, belgeTipi: string, no: any) {
    const documentNo = this.cleanText(no);
    if (!documentNo) return "";
    const wantsDispatch = belgeTipi === "bizim_kestigimiz_irsaliye";
    return (
      this.listMonthRows<any>(company, "outgoingDocuments", 36).find((row) => {
        const isDispatch = this.isDispatchType(row.documentType || row.belgeTuru || row.belgeTipi);
        if (wantsDispatch !== isDispatch) return false;
        return this.cleanText(isDispatch ? row.irsaliyeNo || row.belgeNo : row.faturaNo || row.belgeNo) === documentNo;
      })?.id || ""
    );
  }

  private existingSupplierInvoiceId(company: MainCompany, faturaNo: any, supplierName: any) {
    const no = this.cleanText(faturaNo);
    const supplierKey = this.normalizeKey(supplierName);
    if (!no) return "";
    return (
      this.listMonthRows<any>(company, "supplierInvoices", 36).find((row) => {
        if (this.cleanText(row.faturaNo || row.invoiceNo) !== no) return false;
        if (!supplierKey) return true;
        const rowSupplier = this.normalizeKey(row.tedarikciAdi || row.supplierName || row.firma);
        return !rowSupplier || rowSupplier === supplierKey || rowSupplier.includes(supplierKey) || supplierKey.includes(rowSupplier);
      })?.id || ""
    );
  }

  private primaryPdfPath(row: any) {
    return (
      (Array.isArray(row?.dosyalar) ? row.dosyalar : []).find(
        (file: any) => file.role === "pdf",
      )?.path || ""
    );
  }

  private saveIncomingFromUpload(company: MainCompany, row: any) {
    const taslak = row?.taslakAlanlar || {};
    const lines = Array.isArray(row?.kalemler) ? row.kalemler : [];
    const irsaliyeNo = this.cleanText(taslak.irsaliyeNo || taslak.belgeNo);
    const firmaAdi = this.simplifyKnownCompanyName(taslak.firmaAdi || taslak.saticiUnvan);
    const quantity =
      this.parseQuantity(taslak.gelenAdet || taslak.adet) ||
      lines.reduce((sum: number, line: any) => sum + this.parseQuantity(line.quantity || line.adet), 0);
    const modelSuggestion =
      row.modelAdiOnerisi || this.modelSuggestionFromText(taslak.aciklama || lines[0]?.rawDescription || "");
    return this.saveIncomingDelivery(company.slug, company.id, {
      id: this.existingIncomingDeliveryId(company, irsaliyeNo),
      sourceUploadId: row.id,
      belgeTipi: "MUSTERIDEN_GELEN_IRSALIYE",
      belgeNo: irsaliyeNo,
      irsaliyeNo,
      dispatchNo: irsaliyeNo,
      tarih: taslak.tarih,
      firma: firmaAdi,
      companyName: firmaAdi,
      gelenAdet: quantity,
      birim: "ADET",
      aciklama: taslak.aciklama || modelSuggestion,
      modelAdi: "",
      modelAdiOnerisi: modelSuggestion,
      durum: "MODEL_BAGLANTISI_BEKLIYOR",
      status: "MODEL_BAGLANTISI_BEKLIYOR",
      belgeDosyaYolu: this.primaryPdfPath(row),
      lines,
    });
  }

  private saveOutgoingFromUpload(company: MainCompany, row: any) {
    const taslak = row?.taslakAlanlar || {};
    const lines = Array.isArray(row?.kalemler) ? row.kalemler : [];
    const isDispatch = row.belgeTipi === "bizim_kestigimiz_irsaliye";
    const pdfFile = (Array.isArray(row?.dosyalar) ? row.dosyalar : []).find(
      (file: any) => file.role === "pdf",
    );
    const quantity =
      this.parseQuantity(taslak.adet || taslak.gelenAdet) ||
      lines.reduce((sum: number, line: any) => sum + this.parseQuantity(line.quantity || line.adet), 0);
    const belgeNo = isDispatch
      ? this.cleanText(taslak.irsaliyeNo || taslak.belgeNo)
      : this.cleanText(taslak.faturaNo || taslak.belgeNo);
    const modelSuggestion =
      row.modelAdiOnerisi || this.modelSuggestionFromText(taslak.aciklama || lines[0]?.rawDescription || "");
    return this.saveOutgoingDocument(company.slug, company.id, {
      id: this.existingOutgoingDocumentId(company, row.belgeTipi, belgeNo),
      sourceUploadId: row.id,
      firma: this.simplifyKnownCompanyName(taslak.firmaAdi || taslak.aliciUnvan),
      belgeTuru: isDispatch ? "Giden İrsaliye" : "Giden Fatura",
      documentType: isDispatch ? "Giden İrsaliye" : "Giden Fatura",
      belgeNo,
      faturaNo: isDispatch ? "" : belgeNo,
      irsaliyeNo: isDispatch ? belgeNo : taslak.irsaliyeNo,
      bagliIrsaliyeNo: isDispatch ? "" : taslak.bagliIrsaliyeNo || taslak.irsaliyeNo,
      tarih: taslak.tarih,
      adet: quantity,
      araToplam: taslak.araToplam,
      kdv: taslak.kdvToplam,
      toplamTutar: taslak.genelToplam,
      genelToplam: taslak.genelToplam,
      modelAdi: "",
      modelAdiOnerisi: modelSuggestion,
      aciklama: taslak.aciklama,
      lines,
      pdfPath: pdfFile?.path || "",
      belgeDosyaYolu: pdfFile?.path || "",
      mailEkiOlarakKullan: isDispatch,
      resmiDurum: "RESMI",
      kdvDahilHaric: "KDV_HARIC",
      odemeDurumu: isDispatch ? "" : "ODENMEDI",
      ekstreDurumu: isDispatch ? "" : "KONTROL_EDILMEDI",
      mailDurumu: isDispatch ? "" : "GONDERILMEDI",
      durum: "MODEL_BAGLANTISI_BEKLIYOR",
      status: "MODEL_BAGLANTISI_BEKLIYOR",
    });
  }

  private saveSupplierFromUpload(company: MainCompany, row: any) {
    const taslak = row?.taslakAlanlar || {};
    const lines = Array.isArray(row?.kalemler) ? row.kalemler : [];
    const faturaNo = this.cleanText(taslak.faturaNo || taslak.belgeNo);
    const supplierName = this.simplifyKnownCompanyName(taslak.firmaAdi || taslak.saticiUnvan);
    return this.saveSupplierInvoice(company.slug, company.id, {
      id: this.existingSupplierInvoiceId(company, faturaNo, supplierName),
      sourceUploadId: row.id,
      belgeTipi: "TEDARIKCI_GELEN_FATURA",
      belgeTuru: "Tedarikçi Fatura",
      belgeNo: faturaNo,
      invoiceNo: faturaNo,
      faturaNo,
      irsaliyeNo: taslak.irsaliyeNo,
      dispatchNo: taslak.irsaliyeNo,
      tarih: taslak.tarih,
      invoiceDate: taslak.tarih,
      firma: supplierName,
      supplierName,
      tedarikciAdi: supplierName,
      araToplam: taslak.araToplam,
      kdv: taslak.kdvToplam,
      genelToplam: taslak.genelToplam,
      resmiDurum: "RESMI",
      odemeDurumu: "ODENMEDI",
      urunEslestirmeDurumu: "ESLESME_BEKLIYOR",
      durum: "BEKLEYEN",
      status: "BEKLEYEN",
      belgeDosyaYolu: this.primaryPdfPath(row),
      lines,
    });
  }

  private routePoolRecordToTarget(company: MainCompany, row: any) {
    if (row.belgeTipi === "musteriden_gelen_irsaliye")
      return this.saveIncomingFromUpload(company, row);
    if (this.isOutgoingBelgeTipi(row.belgeTipi))
      return this.saveOutgoingFromUpload(company, row);
    if (row.belgeTipi === "tedarikci_gelen_fatura")
      return this.saveSupplierFromUpload(company, row);
    return null;
  }

  private logDocumentActivity(
    mainCompanySlug: string,
    action: string,
    entityId: string,
    message: string,
    detail: any = {},
  ) {
    try {
      const payload = {
        mainCompanySlug,
        module: "muhasebe",
        action,
        entityType: "belge-havuzu",
        entityId,
        detail: { message, ...detail },
      };
      if (this._logBufferActive) {
        const filePath = path.join(
          getModuleCompanyRoot("muhasebe", mainCompanySlug),
          "activity-logs",
        );
        const row = {
          id: this.uid("alog"),
          mainCompanySlug,
          moduleName: "muhasebe",
          action,
          entityType: "belge-havuzu",
          entityId,
          detail: { message, ...detail },
          createdAt: this.nowIso(),
          createdBy: "system",
        };
        this._logBuffer.push({ filePath, row });
      } else {
        createActivityLog(payload);
      }
    } catch {
      // Activity log yazılamaması belge yükleme akışını durdurmaz.
    }
  }

  private buildDraftFromUpload(
    company: MainCompany,
    upload: any,
    xmlText: string,
  ) {
    const date = this.tag(xmlText, "IssueDate") || this.today();
    const documentNo =
      this.tag(xmlText, "ID") || path.parse(upload.fileName).name;
    const parties = this.xmlPartyInfo(xmlText);
    const companyName =
      upload.documentKind === "outgoing-document"
        ? parties.customer.name ||
          this.cleanText(upload.detectedCounterpartyName)
        : parties.supplier.name ||
          this.cleanText(upload.detectedCounterpartyName);
    if (upload.documentKind === "supplier-invoice") {
      return this.saveSupplierInvoice(company.slug, company.id, {
        sourceUploadId: upload.id,
        firma: companyName,
        invoiceNo: documentNo,
        faturaNo: documentNo,
        tarih: date,
        araToplam: this.tag(xmlText, "LineExtensionAmount"),
        kdv: this.tag(xmlText, "TaxAmount"),
        genelToplam: this.tag(xmlText, "PayableAmount"),
        lines: this.extractXmlLines(company, xmlText),
        status: "Havuzda",
      });
    }
    if (upload.documentKind === "incoming-delivery") {
      return this.saveIncomingDelivery(company.slug, company.id, {
        sourceUploadId: upload.id,
        firma: companyName,
        irsaliyeNo: documentNo,
        tarih: date,
        gelenAdet: this.extractXmlLines(company, xmlText).reduce(
          (sum, line) => sum + Number(line.quantity || 0),
          0,
        ),
        lines: this.extractXmlLines(company, xmlText),
        status: "Taslak",
      });
    }
    if (upload.documentKind === "outgoing-document") {
      return this.saveOutgoingDocument(company.slug, company.id, {
        sourceUploadId: upload.id,
        firma: companyName,
        faturaNo: documentNo,
        tarih: date,
        belgeTuru: xmlText.toUpperCase().includes("DESPATCH")
          ? "İrsaliye"
          : "Fatura",
        araToplam: this.tag(xmlText, "LineExtensionAmount"),
        kdv: this.tag(xmlText, "TaxAmount"),
        toplamTutar: this.tag(xmlText, "PayableAmount"),
        lines: this.extractXmlLines(company, xmlText),
        status: "Taslak",
      });
    }
    return null;
  }

  async uploadAndClassifyDocuments(
    files: any[],
    mainCompanySlug?: string,
    mainCompanyId?: string,
    options: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const safeFiles = Array.isArray(files) ? files : [];
    if (!safeFiles.length)
      throw new BadRequestException("Yüklenecek dosya bulunamadı.");
    const warnings: string[] = [];
    const missingFields: string[] = [];
    let parsedXml: any = null;
    let parsedPdf: any = null;
    let parseError = "";
    let uploadDate = this.today();
    const explicitType = this.normalizeBelgeTipi(options.documentType);
    const xmlFile = safeFiles.find((file) => this.roleForFile(file) === "xml");
    if (xmlFile) {
      try {
        const xmlText = this.extractXmlText(xmlFile.path);
        parsedXml = this.parsePoolXml(
          company,
          xmlText,
          this.decodeUploadName(xmlFile.originalname || xmlFile.filename || ""),
        );
        uploadDate = parsedXml.taslakAlanlar?.tarih || this.today();
        warnings.push(...(parsedXml.warnings || []));
        this.logDocumentActivity(company.slug, "xml-okundu", "", "XML okundu", {
          belgeNo: parsedXml.taslakAlanlar?.belgeNo,
        });
      } catch (error: any) {
        parseError = this.cleanText(error?.message || "XML parse hatası");
        warnings.push(parseError);
        this.logDocumentActivity(
          company.slug,
          "xml-parse-hatasi",
          "",
          "XML parse hatası",
          { error: parseError },
        );
      }
    }
    const pdfFile = !parsedXml
      ? safeFiles.find((file) => this.roleForFile(file) === "pdf")
      : null;
    if (pdfFile) {
      try {
        parsedPdf = await this.parsePoolPdf(
          company,
          pdfFile.path,
          this.decodeUploadName(pdfFile.originalname || pdfFile.filename || ""),
        );
        if (parsedPdf?.taslakAlanlar?.tarih)
          uploadDate = parsedPdf.taslakAlanlar.tarih;
        warnings.push(...(parsedPdf?.warnings || []));
        this.logDocumentActivity(
          company.slug,
          "pdf-taslak-okundu",
          "",
          "PDF taslak bilgileri okundu",
          {
            belgeNo: parsedPdf?.taslakAlanlar?.belgeNo,
            kind: parsedPdf?.kind,
          },
        );
      } catch (error: any) {
        const pdfError = this.cleanText(error?.message || "PDF parse hatası");
        warnings.push(pdfError);
        this.logDocumentActivity(
          company.slug,
          "pdf-parse-hatasi",
          "",
          "PDF parse hatası",
          { error: pdfError },
        );
      }
    }
    const parsedDraft = parsedXml || parsedPdf;
    const parsedBelgeTipiHint = this.normalizeBelgeTipi(
      parsedDraft?.belgeTipiHint,
    );
    const roles = safeFiles.map((file) => this.roleForFile(file));
    const fileKind = roles.includes("statement") ? "statement-file" : "pending";
    const detectedType =
      explicitType ||
      parsedBelgeTipiHint ||
      this.belgeTipiFromKind(parsedDraft?.kind || fileKind);
    const belgeTipi = detectedType || "bilinmeyen";
    const filesSaved = safeFiles.map((file) =>
      this.savePoolFile(
        company,
        file,
        belgeTipi,
        this.roleForFile(file),
        uploadDate,
      ),
    );
    const taslakAlanlar = parsedDraft?.taslakAlanlar || {
      belgeNo: "",
      faturaNo: "",
      tarih: "",
      irsaliyeNo: "",
      saticiUnvan: "",
      saticiVkn: "",
      aliciUnvan: "",
      aliciVkn: "",
      paraBirimi: "",
      araToplam: 0,
      kdvToplam: 0,
      genelToplam: 0,
      aciklama: this.cleanText(options.notes),
    };
    ["belgeNo", "tarih"].forEach((field) => {
      if (!this.cleanText(taslakAlanlar[field])) missingFields.push(field);
    });
    const duplicate = this.listBelgeHavuzuRows(company).find(
      (row) =>
        this.cleanText(row.taslakAlanlar?.belgeNo) &&
        this.cleanText(row.taslakAlanlar?.belgeNo) ===
          this.cleanText(taslakAlanlar.belgeNo) &&
        this.cleanText(row.taslakAlanlar?.saticiVkn) ===
          this.cleanText(taslakAlanlar.saticiVkn) &&
        this.belgeTipiFamilyKey(this.cleanText(row.belgeTipi)) ===
          this.belgeTipiFamilyKey(belgeTipi),
    );
    if (duplicate)
      warnings.push("Muhtemel mükerrer belge. Mevcut kayıt güncellendi.");
    const isKnownRoutedType = belgeTipi !== "bilinmeyen";
    const status = !isKnownRoutedType
      ? "tasnif_bekleyen"
      : parseError
        ? "eksik_bilgi"
        : this.isOutgoingBelgeTipi(belgeTipi) ||
            belgeTipi === "musteriden_gelen_irsaliye"
          ? "model_baglantisi_bekliyor"
          : missingFields.length
            ? "firma_eslesmesi_bekliyor"
            : "kontrol_bekliyor";
    const now = this.nowIso();
    const documentKind = this.kindFromBelgeTipi(belgeTipi);
    const row = {
      id: this.uid("bhv"),
      mainCompanySlug: company.slug,
      belgeTipi,
      durum: status,
      kaynak: this.sourceFromRoles(roles),
      dosyalar: filesSaved,
      xmlVerisi: parsedXml
        ? {
            parsed: true,
            belgeNo: taslakAlanlar.belgeNo,
            tarih: taslakAlanlar.tarih,
          }
        : null,
      pdfVerisi: parsedPdf
        ? {
            parsed: Boolean(parsedPdf.taslakAlanlar),
            belgeNo: taslakAlanlar.belgeNo,
            tarih: taslakAlanlar.tarih,
            extraction: parsedPdf.extraction || null,
            taslak: true,
          }
        : null,
      taslakAlanlar,
      kalemler: parsedDraft?.kalemler || [],
      belgeTuru:
        belgeTipi === "bizim_kestigimiz_irsaliye"
          ? "Giden İrsaliye"
          : belgeTipi === "bizim_kestigimiz_fatura"
            ? "Giden Fatura"
            : this.kindLabel(documentKind),
      belgeNo: taslakAlanlar.belgeNo,
      faturaNo: taslakAlanlar.faturaNo,
      irsaliyeNo: taslakAlanlar.irsaliyeNo,
      firmaAdi:
        belgeTipi === "bizim_kestigimiz_fatura" ||
        belgeTipi === "bizim_kestigimiz_irsaliye"
          ? taslakAlanlar.aliciUnvan
          : taslakAlanlar.saticiUnvan,
      modelAdiOnerisi: this.modelSuggestionFromUpload(
        filesSaved[0]?.originalName || "",
        taslakAlanlar.belgeNo,
        parsedDraft?.kalemler || [],
      ),
      eksikAlanlar: missingFields,
      uyarilar: warnings,
      klasorBilgisi: {
        root: `data/documents/${company.slug}/MUHASEBE`,
        folderKeys: Array.from(
          new Set(filesSaved.map((file) => file.folderKey)),
        ),
      },
      createdAt: now,
      updatedAt: now,
      rejectedAt: "",
      rejectReason: "",
    };
    const effectiveRow = duplicate
      ? {
          ...duplicate,
          durum: status,
          dosyalar: [
            ...(Array.isArray(duplicate.dosyalar) ? duplicate.dosyalar : []),
            ...filesSaved,
          ],
          xmlVerisi: row.xmlVerisi || duplicate.xmlVerisi || null,
          pdfVerisi: row.pdfVerisi || duplicate.pdfVerisi || null,
          taslakAlanlar: {
            ...(duplicate.taslakAlanlar || {}),
            ...(row.taslakAlanlar || {}),
            belgeNo:
              this.cleanText(duplicate.taslakAlanlar?.belgeNo) ||
              this.cleanText(row.taslakAlanlar?.belgeNo),
            tarih:
              this.cleanText(duplicate.taslakAlanlar?.tarih) ||
              this.cleanText(row.taslakAlanlar?.tarih),
            saticiVkn:
              this.cleanText(duplicate.taslakAlanlar?.saticiVkn) ||
              this.cleanText(row.taslakAlanlar?.saticiVkn),
          },
          kalemler:
            Array.isArray(row.kalemler) && row.kalemler.length
              ? row.kalemler
              : Array.isArray(duplicate.kalemler)
                ? duplicate.kalemler
                : [],
          eksikAlanlar: Array.from(
            new Set([
              ...(Array.isArray(duplicate.eksikAlanlar)
                ? duplicate.eksikAlanlar
                : []),
              ...missingFields,
            ]),
          ),
          uyarilar: Array.from(
            new Set([
              ...(Array.isArray(duplicate.uyarilar) ? duplicate.uyarilar : []),
              ...warnings,
            ]),
          ),
          klasorBilgisi: {
            root: `data/documents/${company.slug}/MUHASEBE`,
            folderKeys: Array.from(
              new Set([
                ...(Array.isArray(duplicate?.klasorBilgisi?.folderKeys)
                  ? duplicate.klasorBilgisi.folderKeys
                  : []),
                ...filesSaved.map((file) => file.folderKey),
              ]),
            ),
          },
          updatedAt: now,
        }
      : row;
    let autoRecord: any = null;
    autoRecord = this.routePoolRecordToTarget(company, effectiveRow);
    const targetType =
      belgeTipi === "musteriden_gelen_irsaliye"
        ? "MUSTERIDEN_GELEN_IRSALIYE"
        : belgeTipi === "bizim_kestigimiz_irsaliye"
          ? "BIZIM_GIDEN_IRSALIYE"
          : belgeTipi === "bizim_kestigimiz_fatura"
            ? "BIZIM_GIDEN_FATURA"
            : belgeTipi === "tedarikci_gelen_fatura"
              ? "TEDARIKCI_GELEN_FATURA"
              : "";
    const routedRow = {
      ...effectiveRow,
      targetType,
      targetModule: targetType ? this.poolLabel(documentKind) : "",
      targetRecordId:
        autoRecord?.id || autoRecord?.invoiceId || autoRecord?.deliveryId || "",
      routeStatus: autoRecord
        ? "ROUTED"
        : belgeTipi === "bilinmeyen"
          ? "UNKNOWN"
          : "NEEDS_REVIEW",
      routeMessage: autoRecord
        ? "Hedef ekran kaydı otomatik oluşturuldu/güncellendi."
        : belgeTipi === "bilinmeyen"
          ? "Belge tipi net tespit edilemedi."
          : "Hedef kayıt için manuel kontrol gerekiyor.",
      durum: autoRecord
        ? belgeTipi === "tedarikci_gelen_fatura"
          ? "bekleyen"
          : "model_baglantisi_bekliyor"
        : effectiveRow.durum,
      updatedAt: now,
    };
    this.saveBelgeHavuzuRow(company, routedRow);
    const upload = {
      id: routedRow.id,
      uploadedAt: now,
      uploadTime: now,
      fileName: filesSaved.map((file) => file.originalName).join(", "),
      storedFileName: filesSaved.map((file) => file.savedName).join(", "),
      fileType: routedRow.kaynak.toUpperCase(),
      tip: routedRow.kaynak.toUpperCase(),
      documentKind: targetType || belgeTipi,
      detectedDocumentType: targetType || belgeTipi,
      detectedType: belgeTipi,
      targetType,
      targetModule: routedRow.targetModule,
      targetRecordId: routedRow.targetRecordId,
      documentNo: taslakAlanlar.belgeNo || "",
      firmName: routedRow.firmaAdi || "",
      amount:
        taslakAlanlar.genelToplam || taslakAlanlar.adet || taslakAlanlar.gelenAdet || 0,
      detectedMainCompanyName: company.name,
      detectedCounterpartyName:
        taslakAlanlar.saticiUnvan || taslakAlanlar.aliciUnvan,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      routedPool: routedRow.targetModule || this.poolLabel(documentKind),
      savedFolder: routedRow.klasorBilgisi.folderKeys.join(", "),
      savedRelativePath: filesSaved[0]?.path || "",
      status: routedRow.durum,
      routeStatus: routedRow.routeStatus,
      routeMessage: routedRow.routeMessage,
      size: filesSaved.reduce((sum, file) => sum + Number(file.size || 0), 0),
      detail: routedRow.id,
    };
    this.upsertMonthRow(company, "documentUploadHistory", upload, uploadDate);
    this.logDocumentActivity(
      company.slug,
      "belge-yuklendi",
      routedRow.id,
      "Belge yüklendi",
      { files: filesSaved.length },
    );
    this.logDocumentActivity(
      company.slug,
      "havuz-kaydi-olusturuldu",
      routedRow.id,
      "Belge havuzu kaydı oluşturuldu",
      routedRow,
    );
    return {
      ok: true,
      data: {
        record: routedRow,
        autoRecord,
        results: [upload],
        summary: this.getUploadSummary(company.slug, company.id),
      },
      results: [upload],
      summary: this.getUploadSummary(company.slug, company.id),
      message: "Dosya yüklendi",
    };
  }

  async reprocessBelgeHavuzu(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    id?: string,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const current = this.getBelgeHavuzuById(company.slug, company.id, id || "");
    let next = { ...current };
    const pdfFile = (Array.isArray(current.dosyalar) ? current.dosyalar : []).find(
      (file: any) => file.role === "pdf" && file.path,
    );
    if (
      (!current.belgeTipi || current.belgeTipi === "bilinmeyen") &&
      pdfFile?.path
    ) {
      const parsed = await this.parsePoolPdf(
        company,
        path.resolve(process.cwd(), pdfFile.path),
        pdfFile.originalName || pdfFile.savedName || "",
      );
      const parsedBelgeTipi =
        this.normalizeBelgeTipi(parsed?.belgeTipiHint) ||
        this.belgeTipiFromKind(parsed?.kind || "pending");
      next = {
        ...next,
        belgeTipi: parsedBelgeTipi || "bilinmeyen",
        belgeTuru:
          parsedBelgeTipi === "bizim_kestigimiz_irsaliye"
            ? "Giden İrsaliye"
            : parsedBelgeTipi === "bizim_kestigimiz_fatura"
              ? "Giden Fatura"
              : this.kindLabel(this.kindFromBelgeTipi(parsedBelgeTipi)),
        taslakAlanlar: {
          ...(next.taslakAlanlar || {}),
          ...(parsed?.taslakAlanlar || {}),
        },
        kalemler: Array.isArray(parsed?.kalemler) ? parsed.kalemler : next.kalemler,
        belgeNo: parsed?.taslakAlanlar?.belgeNo || next.belgeNo,
        faturaNo: parsed?.taslakAlanlar?.faturaNo || next.faturaNo,
        irsaliyeNo: parsed?.taslakAlanlar?.irsaliyeNo || next.irsaliyeNo,
        firmaAdi:
          parsedBelgeTipi === "bizim_kestigimiz_fatura" ||
          parsedBelgeTipi === "bizim_kestigimiz_irsaliye"
            ? parsed?.taslakAlanlar?.aliciUnvan || next.firmaAdi
            : parsed?.taslakAlanlar?.saticiUnvan || next.firmaAdi,
        modelAdiOnerisi:
          next.modelAdiOnerisi ||
          this.modelSuggestionFromUpload(
            pdfFile.originalName || "",
            parsed?.taslakAlanlar?.belgeNo || next.belgeNo,
            parsed?.kalemler || [],
          ),
        pdfVerisi: {
          parsed: Boolean(parsed?.taslakAlanlar),
          belgeNo: parsed?.taslakAlanlar?.belgeNo || "",
          tarih: parsed?.taslakAlanlar?.tarih || "",
          extraction: parsed?.extraction || null,
          taslak: true,
        },
      };
    }
    const autoRecord = this.routePoolRecordToTarget(company, next);
    const targetType =
      next.belgeTipi === "musteriden_gelen_irsaliye"
        ? "MUSTERIDEN_GELEN_IRSALIYE"
        : next.belgeTipi === "bizim_kestigimiz_irsaliye"
          ? "BIZIM_GIDEN_IRSALIYE"
          : next.belgeTipi === "bizim_kestigimiz_fatura"
            ? "BIZIM_GIDEN_FATURA"
            : next.belgeTipi === "tedarikci_gelen_fatura"
              ? "TEDARIKCI_GELEN_FATURA"
              : "";
    next = {
      ...next,
      targetType,
      targetModule: targetType ? this.poolLabel(this.kindFromBelgeTipi(next.belgeTipi)) : "",
      targetRecordId:
        autoRecord?.id || autoRecord?.invoiceId || autoRecord?.deliveryId || "",
      routeStatus: autoRecord ? "ROUTED" : "UNKNOWN",
      routeMessage: autoRecord
        ? "Yeniden tasnif edildi ve hedef kayıt güncellendi."
        : "Yeniden tasnifte hedef belge tipi netleşmedi.",
      durum: autoRecord
        ? next.belgeTipi === "tedarikci_gelen_fatura"
          ? "bekleyen"
          : "model_baglantisi_bekliyor"
        : "tasnif_bekleyen",
      updatedAt: this.nowIso(),
    };
    this.saveBelgeHavuzuRow(company, next);
    return { record: next, autoRecord };
  }

  async reprocessPendingBelgeHavuzu(
    mainCompanySlug?: string,
    mainCompanyId?: string,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const pending = this.listBelgeHavuzuRows(company).filter((row) => {
      const durum = this.cleanText(row.durum).toLocaleLowerCase("tr-TR");
      return row.belgeTipi === "bilinmeyen" || durum.includes("tasnif");
    });
    const results = [];
    for (const row of pending) {
      results.push(await this.reprocessBelgeHavuzu(company.slug, company.id, row.id));
    }
    return {
      ok: true,
      count: results.length,
      results,
      summary: this.getUploadSummary(company.slug, company.id),
    };
  }

  getUploadHistory(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    return this.listMonthRows<any>(company, "documentUploadHistory").sort(
      (a, b) =>
        this.cleanText(b.uploadedAt).localeCompare(
          this.cleanText(a.uploadedAt),
        ),
    );
  }

  getUploadSummary(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const rows = this.getUploadHistory(company.slug, company.id);
    const poolRows = this.listBelgeHavuzuRows(company);
    const waitingStatuses = new Set([
      "taslak",
      "kontrol_bekliyor",
      "eksik_bilgi",
      "onay_bekliyor",
      "model_baglantisi_bekliyor",
      "bekleyen",
      "firma_eslesmesi_bekliyor",
      "urun_eslesmesi_bekliyor",
      "tasnif_bekleyen",
      "",
    ]);
    const countPool = (belgeTipi: string) =>
      poolRows.filter(
        (row) =>
          row.belgeTipi === belgeTipi &&
          waitingStatuses.has(
            this.cleanText(row.durum).toLocaleLowerCase("tr-TR"),
          ),
      ).length;
    const pendingCount = poolRows.filter((row) => {
      const durum = this.cleanText(row.durum).toLocaleLowerCase("tr-TR");
      return (
        (row.belgeTipi === "bilinmeyen" || durum.includes("tasnif")) &&
        waitingStatuses.has(durum)
      );
    }).length;
    return {
      supplierInvoices: countPool("tedarikci_gelen_fatura"),
      incomingDeliveries: countPool("musteriden_gelen_irsaliye"),
      outgoingDocuments:
        countPool("bizim_kestigimiz_fatura") +
        countPool("bizim_kestigimiz_irsaliye"),
      pending: pendingCount,
      folders: [
        this.folderNameFromSettings(company, "outgoing-document", "PDF"),
        this.cleanText(
          this.getDocumentPathSettings(company).belgeYuklemeIrsaliyeFolder,
        ) || "HKN İRSALİYE",
        this.folderNameFromSettings(company, "pending", "XML"),
        this.folderNameFromSettings(company, "incoming-delivery", "PDF"),
        this.folderNameFromSettings(company, "supplier-invoice", "PDF"),
      ],
      recentResults: rows.slice(0, 5),
    };
  }

  getBelgeHavuzu(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    filters: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const durum = this.cleanText(filters.durum);
    const belgeTipi = this.cleanText(filters.belgeTipi);
    return this.listBelgeHavuzuRows(company)
      .filter((row) => {
        if (durum && row.durum !== durum) return false;
        if (belgeTipi && row.belgeTipi !== belgeTipi) return false;
        return true;
      })
      .map((row) =>
        this.hydratePoolCompanyAlias(
          company,
          this.hydratePoolProductAliases(
            company,
            this.hydratePoolLotsFromXml(company, row),
          ),
        ),
      );
  }

  getBelgeHavuzuById(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
  ) {
    const row = this.getBelgeHavuzu(mainCompanySlug, mainCompanyId).find(
      (item) => item.id === id,
    );
    if (!row) throw new NotFoundException("Belge havuzu kaydı bulunamadı.");
    return row;
  }

  updateBelgeHavuzu(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const current = this.getBelgeHavuzuById(company.slug, company.id, id);
    const next = {
      ...current,
      ...payload,
      id: current.id,
      mainCompanySlug: company.slug,
      taslakAlanlar: {
        ...(current.taslakAlanlar || {}),
        ...(payload?.taslakAlanlar || {}),
      },
      kalemler: Array.isArray(payload?.kalemler)
        ? payload.kalemler
        : current.kalemler,
      updatedAt: this.nowIso(),
    };
    this.saveBelgeHavuzuRow(company, next);
    this.logDocumentActivity(
      company.slug,
      "belge-havuzu-guncellendi",
      id,
      "Belge havuzu güncellendi",
      {
        before: current,
        after: next,
      },
    );
    return next;
  }

  rejectBelgeHavuzu(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const next = this.updateBelgeHavuzu(mainCompanySlug, mainCompanyId, id, {
      durum: "reddedildi",
      rejectedAt: this.nowIso(),
      rejectReason: this.cleanText(
        payload?.reason || payload?.rejectReason || "Reddedildi",
      ),
    });
    this.logDocumentActivity(
      next.mainCompanySlug,
      "belge-reddedildi",
      id,
      "Belge reddedildi",
      {
        reason: next.rejectReason,
      },
    );
    return next;
  }

  approveBelgeHavuzu(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    return this.approvePoolRecord(company, id, payload || {});
  }

  enqueueBelgeHavuzuApprovals(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const items: ApprovalQueueItem[] = rawItems
      .map((item: any) => {
        const id = this.cleanText(item?.id || item?.poolId);
        if (!id) return null;
        return {
          id,
          belgeNo: this.cleanText(item?.belgeNo || item?.faturaNo || id),
          payload: {
            ...(item?.payload || {}),
            confirm: true,
            mainCompanySlug: company.slug,
            mainCompanyId: company.id,
          },
          status: "queued" as const,
        };
      })
      .filter(Boolean) as ApprovalQueueItem[];
    if (!items.length) {
      throw new BadRequestException("İşlem kuyruğuna alınacak belge bulunamadı.");
    }

    const now = this.nowIso();
    const job: ApprovalQueueJob = {
      id: this.uid("bhq"),
      company,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      items,
    };
    for (const item of items) {
      try {
        const current = this.getBelgeHavuzuById(company.slug, company.id, item.id);
        const durum = this.cleanText(current.durum).toLocaleLowerCase("tr-TR");
        if (!["islendi", "reddedildi"].includes(durum)) {
          this.saveBelgeHavuzuRow(company, {
            ...current,
            durum: "islemde",
            status: "islemde",
            processJobId: job.id,
            processQueuedAt: now,
            updatedAt: now,
          });
        }
      } catch (error: any) {
        item.status = "error";
        item.error = this.queueErrorMessage(error);
        item.completedAt = now;
      }
    }

    const queue = this.getApprovalQueue(company.slug);
    queue.jobs.unshift(job);
    queue.jobs = queue.jobs.slice(0, 25);
    this.scheduleApprovalQueue(company.slug);
    return this.summarizeApprovalJob(job);
  }

  getBelgeHavuzuApprovalQueue(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    jobId: string,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const job = this.getApprovalQueue(company.slug).jobs.find(
      (item) => item.id === jobId,
    );
    if (!job) throw new NotFoundException("İşlem kuyruğu kaydı bulunamadı.");
    return this.summarizeApprovalJob(job);
  }

  private getApprovalQueue(companySlug: string) {
    if (!this.approvalQueues.has(companySlug)) {
      this.approvalQueues.set(companySlug, { running: false, jobs: [] });
    }
    return this.approvalQueues.get(companySlug)!;
  }

  private scheduleApprovalQueue(companySlug: string) {
    const queue = this.getApprovalQueue(companySlug);
    if (queue.timer) return;
    queue.timer = setTimeout(() => {
      queue.timer = undefined;
      this.runApprovalQueueStep(companySlug);
    }, 25);
  }

  private runApprovalQueueStep(companySlug: string) {
    const queue = this.getApprovalQueue(companySlug);
    if (queue.running) return;
    const job = queue.jobs.find((item) =>
      item.items.some((queueItem) => queueItem.status === "queued"),
    );
    if (!job) return;

    queue.running = true;
    const item = job.items.find((queueItem) => queueItem.status === "queued");
    const now = this.nowIso();
    if (!item) {
      queue.running = false;
      return;
    }

    item.status = "processing";
    item.startedAt = now;
    job.status = "processing";
    job.updatedAt = now;
    try {
      item.result = this.approvePoolRecord(job.company, item.id, item.payload);
      item.status = "completed";
      item.completedAt = this.nowIso();
    } catch (error: any) {
      item.status = "error";
      item.error = this.queueErrorMessage(error);
      item.completedAt = this.nowIso();
      try {
        const current = this.getBelgeHavuzuById(
          job.company.slug,
          job.company.id,
          item.id,
        );
        const durum = this.cleanText(current.durum).toLocaleLowerCase("tr-TR");
        if (!["islendi", "reddedildi"].includes(durum)) {
          this.saveBelgeHavuzuRow(job.company, {
            ...current,
            durum: "hata",
            status: "hata",
            processError: item.error,
            updatedAt: item.completedAt,
          });
        }
      } catch {
        // Kuyruk hatası havuz okuma hatasıyla gölgelenmesin.
      }
    } finally {
      const pending = job.items.some((queueItem) => queueItem.status === "queued");
      if (!pending) {
        const hasError = job.items.some((queueItem) => queueItem.status === "error");
        job.status = hasError ? "completed_with_errors" : "completed";
      }
      job.updatedAt = this.nowIso();
      queue.running = false;
    }

    if (
      queue.jobs.some((queueJob) =>
        queueJob.items.some((queueItem) => queueItem.status === "queued"),
      )
    ) {
      this.scheduleApprovalQueue(companySlug);
    }
  }

  private summarizeApprovalJob(job: ApprovalQueueJob) {
    const completed = job.items.filter((item) => item.status === "completed").length;
    const failed = job.items.filter((item) => item.status === "error").length;
    const processing = job.items.filter(
      (item) => item.status === "processing",
    ).length;
    const queued = job.items.filter((item) => item.status === "queued").length;
    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      total: job.items.length,
      completed,
      failed,
      processing,
      queued,
      items: job.items.map((item) => ({
        id: item.id,
        belgeNo: item.belgeNo,
        status: item.status,
        error: item.error,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
      })),
    };
  }

  private queueErrorMessage(error: any) {
    const response = error?.response;
    if (typeof response?.message === "string") return response.message;
    if (Array.isArray(response?.message)) return response.message.join(", ");
    if (typeof response?.error === "string") return response.error;
    if (typeof error?.message === "string") return error.message;
    return "İşlem tamamlanamadı.";
  }

  private approvalError(message: string, errors: any[] = []): never {
    throw new BadRequestException({ ok: false, message, errors });
  }

  private approvePoolRecord(
    company: MainCompany,
    poolId: string,
    payload: any,
  ) {
    const poolRecord = this.getBelgeHavuzuById(
      company.slug,
      company.id,
      poolId,
    );
    this.validatePoolRecordForApprove(company, poolRecord, payload);
    if (poolRecord.belgeTipi === "tedarikci_gelen_fatura") {
      return this.approveSupplierInvoice(company, poolRecord, payload);
    }
    if (poolRecord.belgeTipi === "bizim_kestigimiz_fatura")
      return this.approveOutgoingInvoice(company, poolRecord, payload);
    if (poolRecord.belgeTipi === "bizim_kestigimiz_irsaliye")
      return this.approveOutgoingDelivery(company, poolRecord, payload);
    if (poolRecord.belgeTipi === "musteriden_gelen_irsaliye")
      return this.approveIncomingDelivery(company, poolRecord, payload);
    this.approvalError("Bu belge tipi için onay işleyicisi henüz hazır değil.");
  }

  private validatePoolRecordForApprove(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    if (!this.cleanText(payload?.mainCompanySlug))
      this.approvalError("Ana firma zorunludur.");
    if (this.cleanText(poolRecord.mainCompanySlug) !== company.slug) {
      this.approvalError("Ana firma eşleşmeden onay yapılamaz.");
    }
    if (payload?.confirm !== true)
      this.approvalError("Onay için confirm=true gönderilmelidir.");
    const durum = this.cleanText(poolRecord.durum);
    if (durum === "islendi") this.approvalError("Bu belge daha önce işlenmiş.");
    if (durum === "reddedildi")
      this.approvalError("Reddedilmiş belge onaylanamaz.");
    if (
      ![
        "kontrol_bekliyor",
        "eksik_bilgi",
        "onay_bekliyor",
        "onaylandi",
        "islemde",
      ].includes(durum)
    ) {
      this.approvalError("Belge durumu onaya uygun değil.");
    }
    if (this.cleanText(poolRecord.belgeTipi) === "bilinmeyen") {
      this.approvalError("Belge tipi netleşmeden onay yapılamaz.");
    }
  }

  private approveSupplierInvoice(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    this.startLogBuffer();
    try {
      const warnings: string[] = [];
      const invoice = this.createSupplierInvoiceFromPool(
        company,
        poolRecord,
        payload,
      );
      const lines = this.createSupplierInvoiceLines(
        company,
        invoice,
        poolRecord,
        payload,
      );
      if (lines.some((line) => line.matchStatus === "eslesme_bekliyor")) {
        warnings.push("Ürün eşleşmesi bekleyen kalem var.");
      }
      if (
        this.isLotRequiredForSupplierInvoice(invoice, lines) &&
        lines.some((line) => !this.cleanText(line.lotNo))
      ) {
        warnings.push("Lot numarası olmayan kalem var.");
      }
      const lots = this.createRawMaterialLotsFromInvoice(
        company,
        invoice,
        lines,
        poolRecord,
        warnings,
      );
      const cariMovement = this.createCariMovementFromSupplierInvoice(
        company,
        invoice,
      );
      const kdvRecords = this.createKdvRecordsFromSupplierInvoice(
        company,
        invoice,
        lines,
        warnings,
      );
      const documentHistory = this.createDocumentHistoryFromPool(
        company,
        poolRecord,
        {
          sourceType: "supplier_invoice",
          sourceId: invoice.id,
          belgeNo: invoice.belgeNo || invoice.faturaNo || invoice.invoiceNo,
          firma: invoice.supplierName,
          tarih: invoice.tarih,
          total: invoice.genelToplam,
        },
      );
      const processedResult = {
        supplierInvoiceId: invoice.id,
        supplierInvoiceLineIds: lines.map((line) => line.id),
        cariMovementId: cariMovement.id,
        kdvRecordIds: kdvRecords.map((row) => row.id),
        rawMaterialLotIds: lots.map((row) => row.id),
        documentHistoryId: documentHistory.id,
        warnings,
      };
      this.logDocumentActivity(
        company.slug,
        "belge-onaylandi",
        poolRecord.id,
        "Tedarikçi gelen fatura işlendi",
        {
          processedResult,
        },
      );
      return this.markPoolAsProcessed(
        company,
        poolRecord,
        processedResult,
        warnings,
      );
    } finally {
      this.flushLogBuffer();
    }
  }

  private supplierInvoiceDraft(poolRecord: any) {
    const draft = poolRecord?.taslakAlanlar || {};
    return {
      belgeNo: this.cleanText(draft.belgeNo || draft.faturaNo),
      tarih: this.cleanText(draft.tarih || draft.issueDate),
      supplierName: this.cleanText(draft.saticiUnvan || draft.supplierName),
      supplierVkn: this.cleanText(draft.saticiVkn || draft.supplierVkn),
      currency: this.cleanText(draft.paraBirimi || draft.currency || "TRY"),
      araToplam: this.parseAmount(draft.araToplam || draft.subtotal),
      kdvToplam: this.parseAmount(
        draft.kdvToplam || draft.kdv || draft.kdvAmount,
      ),
      genelToplam: this.parseAmount(
        draft.genelToplam || draft.grandTotal || draft.total,
      ),
      aciklama: this.cleanText(draft.aciklama || draft.notes),
    };
  }

  private createSupplierInvoiceFromPool(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    const draft = this.supplierInvoiceDraft(poolRecord);
    const lines = Array.isArray(poolRecord.kalemler) ? poolRecord.kalemler : [];
    const draftFields = poolRecord?.taslakAlanlar || {};
    const hasValue = (value: any) =>
      value !== undefined && value !== null && String(value).trim() !== "";
    const hasTotalValue =
      hasValue(draftFields.genelToplam) ||
      hasValue(draftFields.grandTotal) ||
      hasValue(draftFields.total) ||
      lines.some(
        (line: any) => hasValue(line.lineTotal) || hasValue(line.toplam),
      );
    const missing = [
      !draft.belgeNo ? "belgeNo/faturaNo" : "",
      !draft.tarih ? "tarih" : "",
      !draft.supplierName && !draft.supplierVkn ? "saticiUnvan/saticiVkn" : "",
      !hasTotalValue ? "genelToplam" : "",
      !lines.length ? "kalemler" : "",
    ].filter(Boolean);
    if (missing.length)
      this.approvalError("Tedarikçi faturası zorunlu alanları eksik.", missing);
    const supplier = this.matchCompany(company, draft.supplierName);
    const supplierAlias = this.resolveCompanyAlias(company, draft.supplierName);
    const cleanSupplierName = this.cleanText(
      supplier?.firma ||
        supplier?.name ||
        supplierAlias.cleanCompanyName ||
        draft.supplierName,
    );
    const invoice = {
      id: this.uid("sinv"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      poolId: poolRecord.id,
      belgeNo: draft.belgeNo,
      faturaNo: draft.belgeNo,
      invoiceNo: draft.belgeNo,
      tarih: draft.tarih,
      invoiceDate: draft.tarih,
      supplierCompanyId: this.cleanText(
        payload?.supplierCompanyId || supplier?.id || supplierAlias.companyId,
      ),
      supplierName: cleanSupplierName,
      rawSupplierName: supplierAlias.matched ? supplierAlias.rawName : "",
      aliasMatched: supplierAlias.matched,
      supplierAliasId: supplierAlias.aliasId,
      supplierVkn: draft.supplierVkn,
      firma: cleanSupplierName,
      currency: draft.currency,
      araToplam: draft.araToplam,
      subtotal: draft.araToplam,
      kdvToplam: draft.kdvToplam,
      kdv: draft.kdvToplam,
      genelToplam: draft.genelToplam,
      grandTotal: draft.genelToplam,
      status: "onaylandi",
      durum: "onaylandi",
      files: Array.isArray(poolRecord.dosyalar) ? poolRecord.dosyalar : [],
      notes: this.cleanText(payload?.notes || draft.aciklama),
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.upsertMonthRow(company, "supplierInvoices", invoice, invoice.tarih);
    this.logDocumentActivity(
      company.slug,
      "tedarikci-fatura-olusturuldu",
      invoice.id,
      "Tedarikçi fatura kaydı oluşturuldu",
      {
        poolId: poolRecord.id,
        after: invoice,
      },
    );
    return invoice;
  }

  private productMatchForLine(payload: any, line: any, index: number) {
    const matches = Array.isArray(payload?.productMatches)
      ? payload.productMatches
      : [];
    return matches.find((match: any) => {
      const keys = [
        match.lineId,
        match.id,
        match.sourceLineId,
        match.sourceLineNo,
        match.lineNo,
      ]
        .map((value) => this.cleanText(value))
        .filter(Boolean);
      return (
        keys.includes(this.cleanText(line.id)) ||
        keys.includes(this.cleanText(line.lineNo)) ||
        keys.includes(this.cleanText(line.sourceLineNo)) ||
        keys.includes(String(index + 1))
      );
    });
  }

  private createSupplierInvoiceLines(
    company: MainCompany,
    invoice: any,
    poolRecord: any,
    payload: any,
  ) {
    const overrides = Array.isArray(payload?.lineOverrides)
      ? payload.lineOverrides
      : [];
    const poolLines = Array.isArray(poolRecord.kalemler)
      ? poolRecord.kalemler
      : [];
    const lines = poolLines.map((line: any, index: number) => {
      const override =
        overrides.find(
          (item: any) =>
            this.cleanText(item.id || item.lineId) === this.cleanText(line.id),
        ) || {};
      const merged = { ...line, ...override };
      const match = this.productMatchForLine(payload, merged, index) || {};
      const productName = this.cleanText(
        match.matchedProductName ||
          match.productName ||
          merged.matchedProductName ||
          merged.productName,
      );
      const productId = this.cleanText(
        match.matchedProductId || match.productId || merged.matchedProductId,
      );
      return {
        id: this.cleanText(merged.id) || this.uid(`sinv-line-${index + 1}`),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        invoiceId: invoice.id,
        lineNo: Number(merged.lineNo || merged.sourceLineNo || index + 1),
        rawDescription: this.cleanText(
          merged.rawDescription || merged.description || merged.productName,
        ),
        productName: this.cleanText(
          merged.productName || merged.rawDescription,
        ),
        matchedProductId: productId,
        matchedProductName: productName,
        matchStatus: productId
          ? "eslesti"
          : this.cleanText(merged.matchStatus) || "eslesme_bekliyor",
        lotNo: this.cleanText(merged.lotNo),
        packaging: this.cleanText(merged.packaging),
        quantity: this.parseAmount(merged.quantity),
        unit: this.cleanText(merged.unit || "ADET"),
        unitPrice: this.parseAmount(merged.unitPrice),
        kdvRate: this.parseAmount(merged.kdvRate),
        kdvAmount: this.parseAmount(merged.kdvAmount),
        lineTotal: this.parseAmount(merged.lineTotal),
        notes: this.cleanText(merged.notes),
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
      };
    });
    const allRows = this.readCompanyStoreRows<any>(
      company,
      "supplier-invoice-lines",
    );
    this.writeCompanyStoreRows(company, "supplier-invoice-lines", [
      ...lines,
      ...allRows.filter((row) => row.invoiceId !== invoice.id),
    ]);
    this.upsertMonthRow(
      company,
      "supplierInvoices",
      { ...invoice, lines },
      invoice.tarih,
    );
    this.logDocumentActivity(
      company.slug,
      "tedarikci-fatura-kalemleri-olusturuldu",
      invoice.id,
      "Tedarikçi fatura kalemleri oluşturuldu",
      {
        lineCount: lines.length,
      },
    );
    this.createProductAliasesFromInvoiceLines(company, lines);
    return lines;
  }

  private createProductAliasesFromInvoiceLines(
    company: MainCompany,
    lines: any[],
  ) {
    const aliases = this.getProductAliases(company);
    let changed = false;
    for (const line of lines) {
      const rawName = this.cleanText(line.rawDescription || line.productName);
      const matchedProductId = this.cleanText(line.matchedProductId);
      const matchedProductName = this.cleanText(line.matchedProductName);
      if (!rawName || (!matchedProductId && !matchedProductName)) continue;
      const normalizedRawName = this.normalizeKey(rawName);
      const existing = aliases.find(
        (row) =>
          this.normalizeKey(row.rawName || row.normalizedRawName) ===
          normalizedRawName,
      );
      if (existing) {
        existing.matchedProductId =
          matchedProductId || existing.matchedProductId || "";
        existing.matchedProductName =
          matchedProductName || existing.matchedProductName || "";
        existing.packaging =
          this.cleanText(line.packaging || line.ambalaj) ||
          existing.packaging ||
          "";
        existing.sourceType =
          existing.sourceType || "SUPPLIER_INVOICE_APPROVAL";
        existing.isActive = existing.isActive !== false;
        existing.hitCount = Number(existing.hitCount || 0) + 1;
        existing.lastSeenAt = this.nowIso();
        existing.updatedAt = this.nowIso();
        changed = true;
        continue;
      }
      aliases.unshift({
        id: this.uid("palias"),
        rawName,
        normalizedRawName,
        matchedProductId,
        matchedProductName,
        packaging: this.cleanText(line.packaging || line.ambalaj),
        sourceType: "SUPPLIER_INVOICE_APPROVAL",
        matchType: "Fatura Kalemi",
        isActive: true,
        hitCount: 1,
        lastSeenAt: this.nowIso(),
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
      });
      changed = true;
    }
    if (!changed) return;
    this.db.writeMainCompanyStore(company.slug, "product-aliases", aliases);
    this.logDocumentActivity(
      company.slug,
      "urun-aliaslari-guncellendi",
      "product-aliases",
      "Fatura kalemlerinden ürün alias kayıtları güncellendi",
      {
        aliasCount: aliases.length,
      },
    );
  }

  private normalizeLotRuleText(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/İ/g, "I");
  }

  private isLotRequiredForSupplierInvoice(invoice: any, lines: any[]) {
    const supplierText = this.normalizeLotRuleText(
      [
        invoice?.supplierName,
        invoice?.firma,
        invoice?.saticiUnvan,
        invoice?.rawSupplierName,
      ].join(" "),
    );
    const supplierKeywords = ["URAS", "TURAN", "KIMYA", "BOYA", "KIMYEVI"];
    if (supplierKeywords.some((keyword) => supplierText.includes(keyword))) {
      return true;
    }
    const productKeywords = [
      "KIMYA",
      "BOYA",
      "PIGMENT",
      "BASE",
      "FIKSATOR",
      "TUTKAL",
    ];
    return (Array.isArray(lines) ? lines : []).some((line) => {
      const productText = this.normalizeLotRuleText(
        [
          line?.category,
          line?.productCategory,
          line?.productName,
          line?.matchedProductName,
          line?.rawDescription,
        ].join(" "),
      );
      return productKeywords.some((keyword) => productText.includes(keyword));
    });
  }

  private createRawMaterialLotsFromInvoice(
    company: MainCompany,
    invoice: any,
    lines: any[],
    poolRecord: any,
    warnings: string[],
  ) {
    if (!this.isLotRequiredForSupplierInvoice(invoice, lines)) {
      return [];
    }
    if (!lines.some((line) => this.cleanText(line.lotNo))) {
      return [];
    }
    const existingLots = this.getRawMaterialLots(company.slug, company.id);
    const created: any[] = [];
    for (const line of lines) {
      const lotNo = this.cleanText(line.lotNo);
      if (!lotNo) continue;
      const productId = this.cleanText(line.matchedProductId);
      const productName = this.cleanText(
        line.matchedProductName || line.productName || line.rawDescription,
      );
      if (!productId && !productName) {
        warnings.push(
          `${line.lineNo}. kalemde ürün eşleşmesi olmadığı için lot oluşturulmadı.`,
        );
        continue;
      }
      const duplicate = existingLots.find((row) => {
        const sameInvoice =
          this.normalizeKey(row.invoiceNo) ===
          this.normalizeKey(invoice.invoiceNo || invoice.faturaNo);
        const sameProduct =
          (productId && this.cleanText(row.productId) === productId) ||
          (!productId &&
            this.normalizeKey(row.productName) ===
              this.normalizeKey(productName));
        return (
          sameInvoice &&
          sameProduct &&
          this.normalizeKey(row.lotNo) === this.normalizeKey(lotNo)
        );
      });
      if (duplicate) {
        warnings.push(
          `${lotNo} lotu daha önce işlendi, yeni lot oluşturulmadı.`,
        );
        this.logDocumentActivity(
          company.slug,
          "hammadde-lot-mukerrer-atlandi",
          duplicate.id,
          "Mükerrer hammadde lotu atlandı",
          {
            invoiceId: invoice.id,
            sourceLineId: line.id,
          },
        );
        continue;
      }
      const quantity = this.parseAmount(line.quantity);
      const lot = {
        id: this.uid("rmlot"),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
        supplierCompanyId: invoice.supplierCompanyId || "",
        supplierName: invoice.supplierName || "",
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo || invoice.faturaNo || "",
        invoiceDate: invoice.invoiceDate || invoice.tarih,
        productId,
        productName,
        lotNo,
        packaging: line.packaging,
        quantity,
        unit: line.unit,
        remainingQuantity: quantity,
        unitPrice: this.parseAmount(line.unitPrice),
        kdvRate: this.parseAmount(line.kdvRate),
        lineTotal: this.parseAmount(line.lineTotal),
        currency: invoice.currency || "TRY",
        status: "active",
        sourcePoolId: poolRecord.id,
        sourceLineId: line.id,
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
      };
      created.push(lot);
      existingLots.push(lot);
      this.logDocumentActivity(
        company.slug,
        "hammadde-lot-olusturuldu",
        lot.id,
        "Hammadde lot kaydı oluşturuldu",
        {
          invoiceId: invoice.id,
          sourcePoolId: poolRecord.id,
        },
      );
    }
    // Tüm yeni lotları tek seferde yaz (N kez upsertMonthRow yerine 1 kez)
    if (created.length) {
      const monthKey = this.getMonthKey(invoice.tarih);
      const monthRows = this.readMonthRows<any>(
        company,
        "rawMaterialLots",
        monthKey,
      );
      const createdIds = new Set(created.map((l) => l.id));
      this.writeMonthRows(company, "rawMaterialLots", monthKey, [
        ...created,
        ...monthRows.filter((r) => !createdIds.has(r.id)),
      ]);
    }
    return created;
  }

  private createCariMovementFromSupplierInvoice(
    company: MainCompany,
    invoice: any,
  ) {
    const rows = this.readCompanyStoreRows<any>(company, "cari-movements");
    const existing = rows.find(
      (row) =>
        row.sourceType === "supplier_invoice" && row.sourceId === invoice.id,
    );
    if (existing) return existing;
    const amount = this.parseAmount(invoice.genelToplam || invoice.grandTotal);
    const row = {
      id: this.uid("cari"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      companyId: invoice.supplierCompanyId || "",
      companyName: invoice.supplierName || invoice.firma,
      firma: invoice.supplierName || invoice.firma,
      rawCompanyName: invoice.rawSupplierName || "",
      aliasMatched: Boolean(invoice.aliasMatched),
      aliasId: invoice.supplierAliasId || "",
      date: invoice.tarih,
      tarih: invoice.tarih,
      type: "fatura",
      islemTipi: "FATURA",
      sourceType: "supplier_invoice",
      sourceId: invoice.id,
      documentNo: invoice.invoiceNo || invoice.faturaNo,
      belge: invoice.invoiceNo || invoice.faturaNo,
      description: `Tedarikçi faturası ${invoice.invoiceNo || invoice.faturaNo}`,
      aciklama: `Tedarikçi faturası ${invoice.invoiceNo || invoice.faturaNo}`,
      debit: 0,
      credit: amount,
      amount,
      tutar: amount,
      etkisi: amount,
      bakiye: 0,
      currency: invoice.currency || "TRY",
      createdAt: this.nowIso(),
    };
    this.writeCompanyStoreRows(company, "cari-movements", [row, ...rows]);
    this.logDocumentActivity(
      company.slug,
      "cari-hareket-olusturuldu",
      row.id,
      "Cari hareket oluşturuldu",
      {
        sourceId: invoice.id,
        after: row,
      },
    );
    return row;
  }

  private createKdvRecordsFromSupplierInvoice(
    company: MainCompany,
    invoice: any,
    lines: any[],
    warnings: string[],
  ) {
    const rows = this.readCompanyStoreRows<any>(company, "kdv-records");
    const withRate = lines.filter((line) => this.parseAmount(line.kdvRate) > 0);
    const created: any[] = [];
    if (!withRate.length) {
      warnings.push("KDV oranı kalemlerden net okunamadı.");
      created.push({
        id: this.uid("kdv"),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        sourceType: "supplier_invoice",
        sourceId: invoice.id,
        belgeNo: invoice.invoiceNo || invoice.faturaNo,
        date: invoice.tarih,
        companyName: invoice.supplierName,
        direction: "gelen",
        matrah: this.parseAmount(invoice.araToplam || invoice.subtotal),
        kdvRate: 0,
        kdvAmount: this.parseAmount(invoice.kdvToplam || invoice.kdv),
        total: this.parseAmount(invoice.genelToplam || invoice.grandTotal),
        createdAt: this.nowIso(),
      });
    } else {
      const groups = new Map<number, any>();
      for (const line of withRate) {
        const rate = this.parseAmount(line.kdvRate);
        const current = groups.get(rate) || {
          matrah: 0,
          kdvAmount: 0,
          total: 0,
        };
        current.matrah += this.parseAmount(line.lineTotal);
        current.kdvAmount += this.parseAmount(line.kdvAmount);
        current.total +=
          this.parseAmount(line.lineTotal) + this.parseAmount(line.kdvAmount);
        groups.set(rate, current);
      }
      for (const [rate, totals] of groups) {
        created.push({
          id: this.uid("kdv"),
          mainCompanyId: company.id,
          mainCompanySlug: company.slug,
          sourceType: "supplier_invoice",
          sourceId: invoice.id,
          belgeNo: invoice.invoiceNo || invoice.faturaNo,
          date: invoice.tarih,
          companyName: invoice.supplierName,
          direction: "gelen",
          matrah: Number(totals.matrah.toFixed(2)),
          kdvRate: rate,
          kdvAmount: Number(totals.kdvAmount.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          createdAt: this.nowIso(),
        });
      }
    }
    const remaining = rows.filter(
      (row) =>
        !(row.sourceType === "supplier_invoice" && row.sourceId === invoice.id),
    );
    this.writeCompanyStoreRows(company, "kdv-records", [
      ...created,
      ...remaining,
    ]);
    this.logDocumentActivity(
      company.slug,
      "kdv-kaydi-olusturuldu",
      invoice.id,
      "KDV kayıtları oluşturuldu",
      {
        recordCount: created.length,
      },
    );
    return created;
  }

  private createDocumentHistoryFromPool(
    company: MainCompany,
    poolRecord: any,
    source: any,
  ) {
    const rows = this.readCompanyStoreRows<any>(company, "document-history");
    const existing = rows.find(
      (row) => row.poolId === poolRecord.id && row.sourceId === source.sourceId,
    );
    if (existing) return existing;
    const row = {
      id: this.uid("dhist"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      poolId: poolRecord.id,
      belgeTipi: poolRecord.belgeTipi,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      belgeNo: source.belgeNo,
      firma: source.firma,
      tarih: source.tarih,
      total: source.total,
      files: Array.isArray(poolRecord.dosyalar) ? poolRecord.dosyalar : [],
      status: "processed",
      createdAt: this.nowIso(),
    };
    this.writeCompanyStoreRows(company, "document-history", [row, ...rows]);
    this.logDocumentActivity(
      company.slug,
      "belge-gecmisi-olusturuldu",
      row.id,
      "Belge geçmişi kaydı oluşturuldu",
      {
        sourceId: source.sourceId,
        poolId: poolRecord.id,
      },
    );
    return row;
  }

  private markPoolAsProcessed(
    company: MainCompany,
    poolRecord: any,
    processedResult: any,
    warnings: string[] = [],
  ) {
    const next = {
      ...poolRecord,
      durum: "islendi",
      processedAt: this.nowIso(),
      processedResult,
      uyarilar: [
        ...(Array.isArray(poolRecord.uyarilar) ? poolRecord.uyarilar : []),
        ...warnings,
      ],
      updatedAt: this.nowIso(),
    };
    this.saveBelgeHavuzuRow(company, next);
    this.logDocumentActivity(
      company.slug,
      "havuz-kaydi-islendi",
      poolRecord.id,
      "Belge havuzu kaydı işlendi",
      {
        processedResult,
      },
    );
    return next;
  }

  private approvedPoolModelLinks(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    const requested = Array.isArray(payload?.modelLinks)
      ? payload.modelLinks
      : [];
    if (!requested.length) {
      this.approvalError("Belge modele bağlanmadan işlenemez.");
    }
    const links = requested.map((link: any, index: number) => {
      const modelId = this.cleanText(
        link.modelId || link.modelKaydiId || link.id,
      );
      if (!modelId) {
        this.approvalError(`${index + 1}. model bağlantısında model ID eksik.`);
      }
      const model = this.modelStore.getById(
        company.slug,
        company.id,
        modelId,
      );
      if (!model) {
        this.approvalError(
          `${index + 1}. model bağlantısındaki model Desen Havuzu'nda bulunamadı.`,
        );
      }
      return {
        ...link,
        modelId: model.id,
        modelKaydiId: model.id,
        modelAdi: this.cleanText(
          model.modelAdi || (model as any).modelName || (model as any).name,
        ),
      };
    });
    const poolLines = Array.isArray(poolRecord?.kalemler)
      ? poolRecord.kalemler
      : [];
    const linkForLine = (line: any, index: number) => {
      const lineKeys = [
        line.id,
        line.lineId,
        line.lineNo,
        line.sourceLineNo,
        index + 1,
      ]
        .map((value) => this.cleanText(value))
        .filter(Boolean);
      const explicit = links.find((link: any) =>
        [
          link.lineId,
          link.documentLineId,
          link.sourceLineId,
          link.lineNo,
          link.sourceLineNo,
        ]
          .map((value) => this.cleanText(value))
          .filter(Boolean)
          .some((value) => lineKeys.includes(value)),
      );
      return explicit || (links.length === 1 ? links[0] : null);
    };
    const lines = poolLines.map((line: any, index: number) => {
      const link = linkForLine(line, index);
      if (!link) {
        this.approvalError(
          `${index + 1}. belge kalemi için model bağlantısı eksik.`,
        );
      }
      return {
        ...line,
        modelId: link.modelId,
        modelKaydiId: link.modelId,
        modelAdi: link.modelAdi,
        matchStatus: "APPROVED",
        matchConfidence: Number(link.confidence || 100),
      };
    });
    return {
      links,
      lines,
      primary: links[0],
    };
  }

  private outgoingTargetFromPool(company: MainCompany, poolRecord: any) {
    if (this.cleanText(poolRecord.targetRecordId)) {
      try {
        return this.getOutgoingDocumentById(
          company.slug,
          company.id,
          poolRecord.targetRecordId,
        );
      } catch {
        // Hedef kayıt taşınmışsa belge no ile güvenli upsert yeniden çalıştırılır.
      }
    }
    return this.saveOutgoingFromUpload(company, poolRecord);
  }

  private incomingTargetFromPool(company: MainCompany, poolRecord: any) {
    if (this.cleanText(poolRecord.targetRecordId)) {
      try {
        return this.getIncomingDeliveryById(
          company.slug,
          company.id,
          poolRecord.targetRecordId,
        );
      } catch {
        // Hedef kayıt taşınmışsa belge no ile güvenli upsert yeniden çalıştırılır.
      }
    }
    return this.saveIncomingFromUpload(company, poolRecord);
  }

  private approveOutgoingInvoice(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    this.startLogBuffer();
    try {
      const mapping = this.approvedPoolModelLinks(
        company,
        poolRecord,
        payload,
      );
      const current = this.outgoingTargetFromPool(company, poolRecord);
      const document = this.saveOutgoingDocument(company.slug, company.id, {
        ...current,
        modelId: mapping.primary.modelId,
        modelKaydiId: mapping.primary.modelId,
        modelAdi: mapping.primary.modelAdi,
        modelLinks: mapping.links,
        lines: mapping.lines,
        status: "onaylandi",
        durum: "onaylandi",
      });
      const cariMovement =
        this.createOrUpdateCariMovementFromOutgoingDocument(company, document);
      const kdvRecords =
        this.createOrUpdateKdvRecordsFromOutgoingDocument(company, document);
      const documentHistory = this.createDocumentHistoryFromPool(
        company,
        poolRecord,
        {
          sourceType: "outgoing_invoice",
          sourceId: document.id,
          belgeNo: document.faturaNo || document.belgeNo,
          firma: document.firma,
          tarih: document.tarih,
          total: document.genelToplam || document.toplamTutar,
        },
      );
      const processedResult = {
        outgoingInvoiceId: document.id,
        cariMovementId: cariMovement.id,
        kdvRecordIds: kdvRecords.map((row) => row.id),
        documentHistoryId: documentHistory.id,
        modelIds: mapping.links.map((link: any) => link.modelId),
      };
      this.logDocumentActivity(
        company.slug,
        "belge-onaylandi",
        poolRecord.id,
        "Bizim kestiğimiz fatura işlendi",
        { processedResult },
      );
      return this.markPoolAsProcessed(company, poolRecord, processedResult);
    } finally {
      this.flushLogBuffer();
    }
  }

  private approveOutgoingDelivery(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    this.startLogBuffer();
    try {
      const mapping = this.approvedPoolModelLinks(
        company,
        poolRecord,
        payload,
      );
      const current = this.outgoingTargetFromPool(company, poolRecord);
      const document = this.saveOutgoingDocument(company.slug, company.id, {
        ...current,
        modelId: mapping.primary.modelId,
        modelKaydiId: mapping.primary.modelId,
        modelAdi: mapping.primary.modelAdi,
        modelLinks: mapping.links,
        lines: mapping.lines,
        status: "onaylandi",
        durum: "onaylandi",
      });
      const documentHistory = this.createDocumentHistoryFromPool(
        company,
        poolRecord,
        {
          sourceType: "outgoing_dispatch",
          sourceId: document.id,
          belgeNo: document.irsaliyeNo || document.belgeNo,
          firma: document.firma,
          tarih: document.tarih,
          total: 0,
        },
      );
      const processedResult = {
        outgoingDispatchId: document.id,
        documentHistoryId: documentHistory.id,
        modelIds: mapping.links.map((link: any) => link.modelId),
      };
      this.logDocumentActivity(
        company.slug,
        "belge-onaylandi",
        poolRecord.id,
        "Bizim kestiğimiz irsaliye işlendi",
        { processedResult },
      );
      return this.markPoolAsProcessed(company, poolRecord, processedResult);
    } finally {
      this.flushLogBuffer();
    }
  }

  private approveIncomingDelivery(
    company: MainCompany,
    poolRecord: any,
    payload: any,
  ) {
    this.startLogBuffer();
    try {
      const mapping = this.approvedPoolModelLinks(
        company,
        poolRecord,
        payload,
      );
      const current = this.incomingTargetFromPool(company, poolRecord);
      const delivery = this.saveIncomingDelivery(company.slug, company.id, {
        ...current,
        modelId: mapping.primary.modelId,
        modelKaydiId: mapping.primary.modelId,
        modelAdi: mapping.primary.modelAdi,
        modelLinks: mapping.links,
        lines: mapping.lines,
        status: "İrsaliye Geldi / Fatura Kesilmedi",
        durum: "İrsaliye Geldi / Fatura Kesilmedi",
      });
      const documentHistory = this.createDocumentHistoryFromPool(
        company,
        poolRecord,
        {
          sourceType: "incoming_dispatch",
          sourceId: delivery.id,
          belgeNo: delivery.irsaliyeNo || delivery.belgeNo,
          firma: delivery.firma,
          tarih: delivery.tarih,
          total: 0,
        },
      );
      const processedResult = {
        incomingDispatchId: delivery.id,
        documentHistoryId: documentHistory.id,
        modelIds: mapping.links.map((link: any) => link.modelId),
      };
      this.logDocumentActivity(
        company.slug,
        "belge-onaylandi",
        poolRecord.id,
        "Müşteriden gelen irsaliye işlendi",
        { processedResult },
      );
      return this.markPoolAsProcessed(company, poolRecord, processedResult);
    } finally {
      this.flushLogBuffer();
    }
  }

  listAvailableModels(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    filters: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const query = this.normalizeKey(filters.q || filters.query || "");
    const firma = this.normalizeKey(filters.firma || filters.companyName || "");
    return this.modelStore
      .getSummaryRows(company.slug, company.id)
      .filter((model: any) => {
        if (firma && this.normalizeKey(model.musteriFirma) !== firma)
          return false;
        if (!query) return true;
        return this.normalizeKey(
          `${model.modelAdi} ${model.musteriFirma} ${model.zemin}`,
        ).includes(query);
      })
      .slice(0, 80);
  }

  getIncomingDeliveryPool(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    return this.listMonthRows<any>(company, "incomingDeliveries");
  }

  getIncomingDeliveryById(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
  ) {
    const row = this.getIncomingDeliveryPool(
      mainCompanySlug,
      mainCompanyId,
    ).find((item) => item.id === id);
    if (!row) throw new NotFoundException("İrsaliye kaydı bulunamadı.");
    return row;
  }

  saveIncomingDelivery(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const row = this.normalizeIncomingDelivery(company, payload);
    return this.upsertMonthRow(company, "incomingDeliveries", row, row.tarih);
  }

  async linkIncomingDeliveryToModel(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const delivery = this.getIncomingDeliveryById(company.slug, company.id, id);
    const modelId = this.cleanText(payload.modelId || payload.modelKaydiId);
    const legacyModel = this.modelStore.getById(company.slug, company.id, modelId);
    const model =
      legacyModel ||
      (modelId
        ? await this.modelService.getById(modelId, company.slug)
        : null);
    if (!model) throw new NotFoundException("Bağlanacak model bulunamadı.");
    const updated = this.saveIncomingDelivery(company.slug, company.id, {
      ...delivery,
      modelId: model.id,
      modelKaydiId: model.id,
      modelAdi: model.modelAdi,
      status: "Modele Bağlı",
      durum: "Modele Bağlı",
    });
    if (legacyModel) {
      this.modelStore.saveModel(company.slug, company.id, {
        ...legacyModel,
        musteriIrsaliyeleri: [
          ...(Array.isArray(legacyModel.musteriIrsaliyeleri)
            ? legacyModel.musteriIrsaliyeleri
            : []),
          {
            dispatchNo: updated.irsaliyeNo,
            date: updated.tarih,
            quantity: updated.gelenAdet,
            companyName: updated.firma,
            zemin: updated.zemin,
            piyonNo: updated.piyonNo,
            kesimhaneAdi: updated.kesimhaneAdi,
            sourceBelgeId: updated.id,
            note: updated.aciklama,
          },
        ],
      });
    }
    return updated;
  }

  getOutgoingDocumentPool(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    return this.listMonthRows<any>(company, "outgoingDocuments");
  }

  getOutgoingDocumentById(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
  ) {
    const row = this.getOutgoingDocumentPool(
      mainCompanySlug,
      mainCompanyId,
    ).find((item) => item.id === id);
    if (!row) throw new NotFoundException("Belge kaydı bulunamadı.");
    return row;
  }

  saveOutgoingDocument(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const row = this.normalizeOutgoingDocument(company, payload);
    const saved = this.upsertMonthRow(company, "outgoingDocuments", row, row.tarih);
    const linked = this.autoLinkOutgoingInvoiceAndDispatch(company, saved);
    this.syncOutgoingDocumentFinancials(company, linked);
    return linked;
  }

  private outgoingDocNo(row: any) {
    return this.cleanText(row?.belgeNo || row?.faturaNo || row?.irsaliyeNo || row?.documentNo);
  }

  private autoLinkOutgoingInvoiceAndDispatch(company: MainCompany, saved: any) {
    const type = this.cleanText(saved.documentType || saved.belgeTuru || saved.belgeTipi);
    const isInvoice = this.isInvoiceType(type);
    const isDispatch = this.isDispatchType(type);
    const allRows = this.listMonthRows<any>(company, "outgoingDocuments", 36);
    const invoiceNo = this.cleanText(saved.faturaNo || (!isDispatch ? saved.belgeNo : ""));
    const dispatchNo = this.cleanText(saved.irsaliyeNo || saved.bagliIrsaliyeNo || (isDispatch ? saved.belgeNo : ""));
    if (!dispatchNo && !invoiceNo) return saved;

    let invoice = isInvoice ? saved : null;
    let dispatch = isDispatch ? saved : null;
    if (!invoice && invoiceNo) {
      invoice = allRows.find((row) => this.isInvoiceType(row.documentType || row.belgeTuru) && this.cleanText(row.faturaNo || row.belgeNo) === invoiceNo);
    }
    if (!dispatch && dispatchNo) {
      dispatch = allRows.find((row) => this.isDispatchType(row.documentType || row.belgeTuru) && this.cleanText(row.irsaliyeNo || row.belgeNo) === dispatchNo);
    }
    if (!invoice && isInvoice) invoice = saved;
    if (!dispatch && isDispatch) dispatch = saved;

    const rowsByMonth = new Map<string, any[]>();
    const writeRow = (row: any) => {
      const monthKey = this.getMonthKey(row.tarih || row.date || saved.tarih);
      if (!rowsByMonth.has(monthKey)) {
        rowsByMonth.set(monthKey, this.readMonthRows<any>(company, "outgoingDocuments", monthKey));
      }
      const rows = rowsByMonth.get(monthKey)!;
      const index = rows.findIndex((item) => this.cleanText(item.id) === this.cleanText(row.id));
      if (index >= 0) rows[index] = row;
      else rows.unshift(row);
    };

    if (invoice) {
      invoice = {
        ...invoice,
        bagliIrsaliyeNo: dispatchNo || invoice.bagliIrsaliyeNo,
        bagliIrsaliyeId: dispatch?.id || invoice.bagliIrsaliyeId || "",
        irsaliyePdfPath: dispatch?.irsaliyePdfPath || dispatch?.pdfPath || invoice.irsaliyePdfPath || "",
      };
      writeRow(invoice);
    }
    if (dispatch && invoice) {
      dispatch = {
        ...dispatch,
        bagliFaturaNo: invoice.faturaNo || invoice.belgeNo || dispatch.bagliFaturaNo,
        bagliFaturaId: invoice.id || dispatch.bagliFaturaId || "",
        mailEkiOlarakKullan: true,
      };
      writeRow(dispatch);
    }
    for (const [monthKey, rows] of rowsByMonth) {
      this.writeMonthRows(company, "outgoingDocuments", monthKey, rows);
    }
    return this.cleanText(invoice?.id) === this.cleanText(saved.id)
      ? invoice
      : this.cleanText(dispatch?.id) === this.cleanText(saved.id)
        ? dispatch
        : saved;
  }

  suggestModelsForOutgoingDocument(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    payload?: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const queryFirm = this.normalizeKey(payload?.firma || payload?.companyName);
    const queryText = this.normalizeKey(
      `${payload?.aciklama || ""} ${payload?.modelAdi || ""}`,
    );
    return this.modelStore
      .getSummaryRows(company.slug, company.id)
      .map((model: any) => {
        const firmScore =
          queryFirm && this.normalizeKey(model.musteriFirma) === queryFirm
            ? 2
            : 0;
        const textScore =
          queryText && queryText.includes(this.normalizeKey(model.modelAdi))
            ? 3
            : 0;
        return { ...model, score: firmScore + textScore };
      })
      .filter((model: any) => model.score > 0 || !queryFirm)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 8);
  }

  async linkOutgoingDocumentToModel(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const document = this.getOutgoingDocumentById(company.slug, company.id, id);
    const modelId = this.cleanText(payload.modelId || payload.modelKaydiId);
    const model =
      this.modelStore.getById(company.slug, company.id, modelId) ||
      (modelId
        ? await this.modelService.getById(modelId, company.slug)
        : null);
    if (!model) throw new NotFoundException("Bağlanacak model bulunamadı.");
    return this.saveOutgoingDocument(company.slug, company.id, {
      ...document,
      modelId: model.id,
      modelKaydiId: model.id,
      modelAdi: model.modelAdi,
      status: "Modele Bağlı",
      durum: "Modele Bağlı",
    });
  }

  async createModelFromOutgoingDocument(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const document = this.getOutgoingDocumentById(company.slug, company.id, id);
    const model = await this.modelService.create({
      mainCompanySlug: company.slug,
      mainCompanyId: company.id,
      anaFirma: company.name,
      firma: document.firma,
      firmaAdi: document.firma,
      musteriFirma: document.firma,
      modelAdi: this.cleanText(
        payload.modelAdi ||
          document.modelAdi ||
          document.aciklama ||
          document.faturaNo ||
          document.irsaliyeNo,
      ),
      musteriIrsaliyeNo: document.irsaliyeNo,
      tarih: document.tarih,
      gelenAdet: Number(
        document.lines?.[0]?.adet || document.lines?.[0]?.quantity || 0,
      ),
      zemin: this.cleanText(payload.zemin),
      kaynak: "Muhasebe Bizim Belgeler",
      kaynakBelgeId: document.id,
      status: "ACTIVE",
    });
    await this.linkOutgoingDocumentToModel(company.slug, company.id, id, {
      modelId: model?.id,
    });
    return model;
  }

  prepareOutgoingMailPackage(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const document = this.getOutgoingDocumentById(company.slug, company.id, id);
    if (!this.isInvoiceType(document.documentType || document.belgeTuru)) {
      throw new BadRequestException("Mail paketi ana işlem olarak fatura satırından hazırlanır.");
    }
    const linked = this.autoLinkOutgoingInvoiceAndDispatch(company, document);
    const model =
      this.modelStore.getById(company.slug, company.id, linked.modelId || linked.modelKaydiId) ||
      null;
    const modelAny = (model || {}) as any;
    const department = this.normalizeDepartment(
      payload.departmanNo ||
        modelAny.departmanNo ||
        modelAny.bolumNo ||
        linked.departmanNo ||
        linked.bolumNo,
    );
    const companyName = this.cleanText(linked.firma || linked.companyName);
    const contacts = this.readCompanyStoreRows<any>(company, "email-contacts")
      .filter((item) => item?.aktif !== false)
      .filter((item) => {
        const contactFirm = this.normalizeKey(item.gonderilenFirma || item.firmaAdi || item.firma);
        const docFirm = this.normalizeKey(companyName);
        if (docFirm && contactFirm && contactFirm !== docFirm) return false;
        const codes = [
          item.departman,
          item.departmanNo,
          ...(Array.isArray(item.departmanKodlari) ? item.departmanKodlari : []),
        ]
          .map((value) => this.normalizeDepartment(value))
          .filter(Boolean);
        return !department || !codes.length || codes.includes(department);
      });
    const invoiceRecipients = contacts.filter(
      (item) =>
        item.faturaMailiAlirMi !== false ||
        item.irsaliyeMailiAlirMi !== false ||
        item.varsayilan,
    );
    const tasnifRecipients = invoiceRecipients.filter(
      (item) => item.tasnifRaporuAlirMi === true,
    );
    const plainRecipients = invoiceRecipients.filter(
      (item) => item.tasnifRaporuAlirMi !== true,
    );
    const dispatchNo = linked.bagliIrsaliyeNo || linked.irsaliyeNo;
    const subject = `${companyName} - ${linked.modelAdi || model?.modelAdi || ""} - Fatura ve İrsaliye Hk. - ${linked.faturaNo}`.replace(/\s+/g, " ").trim();
    const baseBody = [
      "Merhaba,",
      "",
      `${linked.modelAdi || model?.modelAdi || ""} modeli için düzenlenen ${linked.faturaNo} numaralı faturamız ve bağlı ${dispatchNo || "-"} numaralı irsaliyemiz ekte bilgilerinize sunulmuştur.`,
      "",
      `Fatura No: ${linked.faturaNo || "-"}`,
      `İrsaliye No: ${dispatchNo || "-"}`,
      `Model: ${linked.modelAdi || modelAny.modelAdi || "-"}`,
      `Sipariş No: ${modelAny.siparisNo || modelAny.orderNo || ""}`,
      `Departman: ${department || ""}`,
      `Adet: ${linked.adet || ""}`,
      `Tutar: ${linked.genelToplam || linked.toplamTutar || ""}`,
      "",
      "Kontrol ederek tarafımıza dönüş yapmanızı rica ederiz.",
      "",
      "İyi çalışmalar.",
      "",
      company.name,
    ].join("\n");
    const attachmentsBase = [
      {
        type: "FATURA_PDF",
        fileName: `${linked.faturaNo || "Fatura"}.pdf`,
        path: linked.faturaPdfPath || linked.pdfPath || "",
        required: true,
      },
      {
        type: "IRSALIYE_PDF",
        fileName: `${dispatchNo || "Irsaliye"}.pdf`,
        path: linked.irsaliyePdfPath || "",
        required: true,
      },
    ];
    const tasnifAttachment = {
      type: "TASNIF_RAPORU_XLSX",
      fileName: `Tasnif_Raporu_${linked.faturaNo || linked.id}.xlsx`,
      path: "",
      required: false,
      generated: true,
    };
    const packageResult = {
      id: this.uid("mailpkg"),
      faturaNo: linked.faturaNo,
      irsaliyeNo: dispatchNo,
      modelId: model?.id || linked.modelId || "",
      modelAdi: linked.modelAdi || modelAny.modelAdi || "",
      departmanNo: department,
      firma: companyName,
      subject,
      groups: [
        {
          key: "tasnif-alanlar",
          label: "Tasnif alanlar",
          to: tasnifRecipients.map((item) => item.eposta).filter(Boolean),
          cc: [],
          body: `${baseBody}\n\nTasnif raporu da ekte bilgilerinize sunulmuştur.`,
          attachments: [...attachmentsBase, tasnifAttachment],
          tasnifEklendiMi: tasnifRecipients.length > 0,
        },
        {
          key: "tasnif-almayanlar",
          label: "Tasnif almayanlar",
          to: plainRecipients.map((item) => item.eposta).filter(Boolean),
          cc: [],
          body: baseBody,
          attachments: attachmentsBase,
          tasnifEklendiMi: false,
        },
      ].filter((group) => group.to.length),
      createdAt: this.nowIso(),
      status: "TASLAK",
    };
    const logs = this.readCompanyStoreRows<any>(company, "mail-logs");
    this.writeCompanyStoreRows(company, "mail-logs", [
      {
        id: packageResult.id,
        faturaNo: linked.faturaNo,
        irsaliyeNo: dispatchNo,
        modelId: packageResult.modelId,
        departmanNo: department,
        firmaId: linked.companyId || "",
        toList: packageResult.groups.flatMap((group) => group.to),
        ccList: [],
        ekler: packageResult.groups.flatMap((group) =>
          group.attachments.map((attachment) => attachment.fileName),
        ),
        tasnifEklendiMi: tasnifRecipients.length > 0,
        sentAt: "",
        status: "TASLAK",
        createdAt: packageResult.createdAt,
      },
      ...logs,
    ]);
    return packageResult;
  }

  private syncOutgoingDocumentFinancials(company: MainCompany, document: any) {
    const type = this.normalizeKey(
      document.documentType || document.belgeTuru || document.belgeTipi,
    );
    const isInvoice = type.includes("FATURA");
    if (!isInvoice) return;
    this.createOrUpdateCariMovementFromOutgoingDocument(company, document);
    this.createOrUpdateKdvRecordsFromOutgoingDocument(company, document);
  }

  private createOrUpdateCariMovementFromOutgoingDocument(
    company: MainCompany,
    document: any,
  ) {
    const rows = this.readCompanyStoreRows<any>(company, "cari-movements");
    const amount = this.parseAmount(
      document.genelToplam || document.toplamTutar || document.grandTotal,
    );
    const existing = rows.find(
      (row) =>
        row.sourceType === "outgoing_document" && row.sourceId === document.id,
    );
    const row = {
      ...(existing || {}),
      id: existing?.id || this.uid("cari"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      companyId: document.companyId || "",
      companyName: document.firma || document.companyName || "",
      firma: document.firma || document.companyName || "",
      date: document.tarih || document.date || this.today(),
      tarih: document.tarih || document.date || this.today(),
      type: "fatura",
      islemTipi: "FATURA",
      sourceType: "outgoing_document",
      sourceId: document.id,
      modelId: document.modelId || document.modelKaydiId || "",
      modelKaydiId: document.modelId || document.modelKaydiId || "",
      modelAdi: document.modelAdi || "",
      documentNo: document.faturaNo || document.documentNo || document.id,
      belge: document.faturaNo || document.documentNo || document.id,
      description: `Giden fatura ${document.faturaNo || document.documentNo || document.id}`,
      aciklama: `Giden fatura ${document.faturaNo || document.documentNo || document.id}`,
      debit: amount,
      credit: 0,
      amount,
      tutar: amount,
      etkisi: amount,
      bakiye: existing?.bakiye || 0,
      currency: document.currency || "TRY",
      resmiDurum: document.resmiDurum || "RESMI",
      updatedAt: this.nowIso(),
      createdAt: existing?.createdAt || this.nowIso(),
    };
    this.writeCompanyStoreRows(company, "cari-movements", [
      row,
      ...rows.filter((item) => item.id !== row.id),
    ]);
    if (!existing) {
      this.logDocumentActivity(
        company.slug,
        "cari-hareket-olusturuldu",
        row.id,
        "Giden faturadan cari hareket oluşturuldu",
        { sourceId: document.id, after: row },
      );
    }
    return row;
  }

  private createOrUpdateKdvRecordsFromOutgoingDocument(
    company: MainCompany,
    document: any,
  ) {
    const rows = this.readCompanyStoreRows<any>(company, "kdv-records");
    const remaining = rows.filter(
      (row) =>
        !(row.sourceType === "outgoing_document" && row.sourceId === document.id),
    );
    const recordType = this.normalizeKey(document.resmiDurum || "RESMI");
    if (recordType.includes("GAYRI")) {
      this.writeCompanyStoreRows(company, "kdv-records", remaining);
      return [];
    }
    const kdvAmount = this.parseAmount(document.kdv || document.kdvToplam);
    const subtotal = this.parseAmount(document.araToplam || document.subtotal);
    const total = this.parseAmount(
      document.genelToplam || document.toplamTutar || document.grandTotal,
    );
    const rate =
      this.parseAmount(document.kdvOrani || document.vatRate) ||
      (subtotal > 0 ? Number(((kdvAmount / subtotal) * 100).toFixed(2)) : 0);
    if (kdvAmount <= 0 && subtotal <= 0 && total <= 0) {
      this.writeCompanyStoreRows(company, "kdv-records", remaining);
      return [];
    }
    const row = {
      id: this.uid("kdv"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      sourceType: "outgoing_document",
      sourceId: document.id,
      belgeNo: document.faturaNo || document.documentNo || document.id,
      date: document.tarih || document.date || this.today(),
      companyName: document.firma || document.companyName || "",
      modelId: document.modelId || document.modelKaydiId || "",
      modelAdi: document.modelAdi || "",
      direction: "giden",
      matrah: subtotal,
      kdvRate: rate,
      kdvAmount,
      total,
      createdAt: this.nowIso(),
    };
    this.writeCompanyStoreRows(company, "kdv-records", [row, ...remaining]);
    return [row];
  }

  getSupplierInvoicePool(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    return this.listMonthRows<any>(company, "supplierInvoices");
  }

  getSupplierInvoiceById(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
  ) {
    const row = this.getSupplierInvoicePool(
      mainCompanySlug,
      mainCompanyId,
    ).find((item) => item.id === id);
    if (!row) throw new NotFoundException("Tedarikçi faturası bulunamadı.");
    return row;
  }

  saveSupplierInvoice(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const row = this.normalizeSupplierInvoice(company, payload);
    const saved = this.upsertMonthRow(
      company,
      "supplierInvoices",
      row,
      row.tarih,
    );
    this.generateRawMaterialLots(company.slug, company.id, row.id);
    return saved;
  }

  matchSupplierInvoiceLines(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const invoice = this.getSupplierInvoiceById(company.slug, company.id, id);
    const lines = (
      Array.isArray(payload.lines) ? payload.lines : invoice.lines || []
    ).map((line: any, index: number) =>
      this.normalizeLine(company, line, index),
    );
    return { ...invoice, lines };
  }

  saveSupplierInvoiceLines(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const invoice = this.getSupplierInvoiceById(company.slug, company.id, id);
    return this.saveSupplierInvoice(company.slug, company.id, {
      ...invoice,
      lines: Array.isArray(payload.lines) ? payload.lines : [],
    });
  }

  generateRawMaterialLots(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    invoiceId: string,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const invoice = this.getSupplierInvoiceById(
      company.slug,
      company.id,
      invoiceId,
    );
    const now = this.nowIso();
    const createdOrUpdated: any[] = [];
    for (const line of Array.isArray(invoice.lines) ? invoice.lines : []) {
      if (!this.cleanText(line.matchedProductId) || !this.cleanText(line.lotNo))
        continue;
      const lotDate = invoice.tarih || invoice.invoiceDate || this.today();
      const monthKey = this.getMonthKey(lotDate);
      const rows = this.readMonthRows<any>(
        company,
        "rawMaterialLots",
        monthKey,
      );
      const duplicateKey = [
        this.cleanText(line.matchedProductId),
        this.normalizeKey(line.lotNo),
        this.normalizeKey(invoice.invoiceNo || invoice.faturaNo),
      ].join("|");
      const existingIndex = rows.findIndex((row) => {
        const rowKey = [
          this.cleanText(row.productId),
          this.normalizeKey(row.lotNo),
          this.normalizeKey(row.invoiceNo),
        ].join("|");
        return rowKey === duplicateKey;
      });
      const quantity = this.parseAmount(line.quantity);
      const lotRow = {
        id: existingIndex >= 0 ? rows[existingIndex].id : this.uid("rmlot"),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
        supplierCompanyId: invoice.supplierCompanyId || "",
        supplierName: invoice.supplierName || invoice.firma || "",
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo || invoice.faturaNo || "",
        invoiceDate: invoice.invoiceDate || invoice.tarih || "",
        productId: line.matchedProductId,
        productName: line.rawDescription,
        matchedProductName: line.matchedProductName,
        lotNo: line.lotNo,
        packaging: line.packaging,
        quantity,
        unit: line.unit,
        remainingQuantity:
          existingIndex >= 0 ? rows[existingIndex].remainingQuantity : quantity,
        unitPrice: this.parseAmount(line.unitPrice),
        kdvRate: this.parseAmount(line.kdvRate),
        lineTotal: this.parseAmount(line.lineTotal),
        currency: invoice.currency || "TRY",
        notes: line.notes || "",
        status:
          existingIndex >= 0
            ? rows[existingIndex].status || "active"
            : "active",
        createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : now,
        updatedAt: now,
      };
      if (existingIndex >= 0)
        rows[existingIndex] = { ...rows[existingIndex], ...lotRow };
      else rows.unshift(lotRow);
      this.writeMonthRows(company, "rawMaterialLots", monthKey, rows);
      createdOrUpdated.push(lotRow);
    }
    return { ok: true, invoiceId, lots: createdOrUpdated };
  }

  getRawMaterialLots(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    filters: any = {},
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const productId = this.cleanText(filters.productId);
    const lotNo = this.normalizeKey(filters.lotNo);
    return this.listMonthRows<any>(company, "rawMaterialLots").filter((row) => {
      if (productId && this.cleanText(row.productId) !== productId)
        return false;
      if (lotNo && this.normalizeKey(row.lotNo) !== lotNo) return false;
      return true;
    });
  }

  getRawMaterialLotById(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id: string,
  ) {
    const row = this.getRawMaterialLots(mainCompanySlug, mainCompanyId).find(
      (item) => item.id === id,
    );
    if (!row) throw new NotFoundException("Hammadde lot kaydı bulunamadı.");
    return row;
  }

  saveRawMaterialLot(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: any,
  ) {
    const company = this.requireCompany(mainCompanySlug, mainCompanyId);
    const now = this.nowIso();
    const row = {
      ...payload,
      id: this.cleanText(payload.id) || this.uid("rmlot"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
      quantity: this.parseAmount(payload.quantity),
      remainingQuantity: this.parseAmount(
        payload.remainingQuantity ?? payload.quantity,
      ),
      updatedAt: now,
      createdAt: this.cleanText(payload.createdAt) || now,
    };
    return this.upsertMonthRow(
      company,
      "rawMaterialLots",
      row,
      row.invoiceDate || row.createdAt,
    );
  }
}
