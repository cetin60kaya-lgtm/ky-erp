import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import * as path from "path";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { ModelTakipStore } from "../modules/model-takip/model-takip.shared";

type FirmaTipi = "SATICI" | "MUSTERI" | "GENEL";
type HareketTipi = "BAKIYE" | "ODEME";

type FirmaKartiRow = {
  id: number;
  firma: string;
  tip: FirmaTipi;
  aktif: boolean;
  favori: boolean;
  not: string;
  vergiNo: string;
  eposta: string;
  telefon: string;
  sonIslem: string;
  createdAt: string;
  updatedAt: string;
  // KDV defaults
  varsayilanRecordType?: "RESMI" | "GAYRI_RESMI";
  varsayilanVatRate?: number;
  varsayilanVatMode?: "DAHIL" | "HARIC";
  vatApplicable?: boolean;
  // Merge/alias fields
  isAliasMerged?: boolean;
  hiddenFromMainList?: boolean;
  mergedIntoCompanyId?: number | string;
  mergedIntoCompanyName?: string;
  mergedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
};

type CariRow = {
  id: number;
  firma: string;
  tip: FirmaTipi;
  sonIslem: string;
  bakiye: number;
  odenenToplam: number;
};

type CariHareketRow = {
  id: number;
  firma: string;
  tarih: string;
  islemTipi: HareketTipi;
  aciklama: string;
  tutar: number;
  etkisi: number;
  bakiye: number;
  belge: string;
  sourceType: string;
  resmiDurum?: "RESMI" | "GAYRI_RESMI";
  odemeSozuTarihi?: string;
  hatirlatmaTarihi?: string;
  takipNotu?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type OwnedRow = {
  mainCompanyId?: string;
  mainCompanySlug?: string;
  mainCompanyName?: string;
  relatedCompanyId?: number | string;
  relatedCompanyName?: string;
  ownershipStatus?: "OK" | "MISSING_COMPANY_LINK";
};

type ActivityLogRow = {
  id: number;
  entityType: string;
  entityId: string;
  actionType: string;
  title: string;
  description: string;
  oldValue: any;
  newValue: any;
  source: string;
  actor: string;
  mainCompanyId?: string;
  mainCompanySlug?: string;
  mainCompanyName?: string;
  recordName?: string;
  createdAt: string;
};

type FirmaImportPreviewItem = {
  companyName: string;
  balance: number;
  exists: boolean;
  action: "new" | "existing" | "update" | "created" | "updated" | "skipped";
  currentBalance: number;
};

type MuhasebeBelgeRow = OwnedRow & {
  documentId: string;
  modelKaydiId?: string;
  sourceType?: string;
  documentType: string;
  documentClass: string;
  workflowType: string;
  companyType: string;
  firma: string;
  rawParsedCompanyName?: string;
  rawDetectedCompanyName?: string;
  matchedCompanyId?: number | string;
  matchedCompanyName?: string;
  firmaEslesmeTipi?: string;
  sourceTab: string;
  pdfFileName: string;
  status: string;
  header: Record<string, any>;
  items: Record<string, any>[];
  candidateRows?: Record<string, any>[];
  warnings: string[];
  metrics: Record<string, any>;
  detectedProfile: string;
  needsReview?: boolean;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type DocumentPathSettings = {
  documentArchiveRootPath: string;
  gidenIrsaliyeBasePath: string;
  gidenFaturaBasePath: string;
  tedarikciFaturaBasePath: string;
  belgeYuklemeFaturaFolder: string;
  belgeYuklemeIrsaliyeFolder: string;
  belgeYuklemeXmlFolder: string;
  belgeYuklemeGelenIrsaliyeFolder: string;
  belgeYuklemeGelenFaturaFolder: string;
  belgeYuklemeTasnifFolder: string;
  faturaDosyaPrefix: string;
  irsaliyeDosyaPrefix: string;
};

type UrunRow = {
  id: number;
  urunAdi: string;
  ticariAdi: string;
  kategori: string;
  birim: string;
  bagliFirmaId?: number | string;
  bagliFirma?: string;
  durum?: ProductStatus;
  varsayilanAmbalaj?: string;
  ambalaj?: string;
  not?: string;
  aktif?: boolean;
  ambalajVaryantlari?: string[];
  lotKayitlari?: UrunLotRow[];
  kullanilanLotlar?: LotKullanimRow[];
  modelBazliHammaddeKullanimi?: LotKullanimRow[];
  lot?: string;
};

type UrunLotRow = {
  id: string;
  lotNo: string;
  girisTarihi: string;
  tedarikciFirma: string;
  belgeNo: string;
  belgeTarihi: string;
  miktar: number;
  kalanMiktar: number;
  ambalaj: string;
  not: string;
  createdAt: string;
  updatedAt: string;
};

type LotKullanimRow = {
  id: string;
  urunId: number | string;
  lotNo: string;
  kullanilanMiktar: number;
  kullanimTarihi: string;
  bagliModelKaydiId: string;
};

type NormalizedUrunRow = UrunRow & {
  varsayilanAmbalaj: string;
  not: string;
  aktif: boolean;
  ambalajVaryantlari: string[];
  lotKayitlari: UrunLotRow[];
  kullanilanLotlar: LotKullanimRow[];
  modelBazliHammaddeKullanimi: LotKullanimRow[];
};

type ProductStatus = "ONAY_BEKLIYOR" | "ONAYLANDI" | "EKSIK_EVRAK" | "PASIF";

type ProductDocumentType =
  | "MSDS"
  | "TDS"
  | "ZDHC"
  | "TEKNIK_FOY"
  | "UYGUNLUK_BELGESI"
  | "SERTIFIKA"
  | "DIGER";

type ProductDocumentScopeType = "product" | "shared";
type SharedScopeType = "mainCompany" | "company" | null;

type ProductDocumentRow = {
  id: string;
  productId?: number | string;
  mainCompanyId: string;
  mainCompanySlug?: string;
  mainCompanyName?: string;
  companyId?: number | string;
  companyName?: string;
  belgeTipi: ProductDocumentType;
  belgeAdi: string;
  kapsamTipi: ProductDocumentScopeType;
  sharedScopeType: SharedScopeType;
  sharedScopeRef: string | null;
  dosyaYolu: string;
  dosyaAdi: string;
  mimeType: string;
  not: string;
  belgeTarihi: string;
  gecerlilikBaslangic: string;
  gecerlilikBitis: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
};

type KdvRow = {
  firma: string;
  ay: string;
  yil: number;
  devredenKdv: number;
  gelenKdv: number;
  gidenKdv: number;
  netSonuc: number;
};

type KdvReportFilter = {
  companyId?: string;
  companyName?: string;
  documentNo?: string;
  documentType?: string;
  period?: string;
  fromDate?: string;
  toDate?: string;
  vatRate?: string;
};

type KdvReportRow = {
  id: string;
  date: string;
  companyId: string;
  companyName: string;
  documentNo: string;
  documentType: string;
  flowSide: "PURCHASE" | "SALES";
  recordType: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  source: string;
  sourceId: string;
  direction: "ALIS" | "SATIS";
};

type KdvReportSummary = {
  period: string;
  totalPurchaseVat: number;
  totalSalesVat: number;
  carriedVatFromPreviousMonth: number;
  netVat: number;
  carriedVatToNextMonth: number;
  documentCount: number;
  rateBreakdown: Array<{
    vatRate: number;
    purchaseVat: number;
    salesVat: number;
    netVat: number;
  }>;
};

type KdvReportResponse = {
  ok: boolean;
  summary: KdvReportSummary;
  rows: KdvReportRow[];
  vatPeriod: VatPeriodRow | null;
};

type VatPeriodRow = {
  id: string;
  period: string;
  mainCompanyId: string;
  carriedVatFromPreviousMonth: number;
  purchaseVatTotal: number;
  salesVatTotal: number;
  netVat: number;
  carriedVatToNextMonth: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

type OdemeRow = OwnedRow & {
  id: number;
  firma: string;
  tarih: string;
  odemeTuru: string;
  tutar: number;
  aciklama: string;
  resmiDurum?: "RESMI" | "GAYRI_RESMI";
  cariOnce?: number;
  cariSonra?: number;
  kalanTutar?: number;
  odemeSozuTarihi?: string;
  hatirlatmaTarihi?: string;
  haftaSonuHatirlat?: boolean;
  cariNot?: string;
  relatedCardId?: number | string;
  relatedCardName?: string;
  relatedCheckId?: number | string;
  relatedCheckNo?: string;
  isDeleted?: boolean;
  deletedAt?: string;
};

type CekRow = OwnedRow & {
  id: number;
  firma?: string;
  yon: "AlÄ±ndÄ±" | "Verildi";
  banka: string;
  cekNo: string;
  kesideTarihi: string;
  vadeTarihi: string;
  tutar: number;
  aciklama: string;
  durum: string;
  hesapNo?: string;
  karsilikDurumu?: "VAR" | "YOK" | "KISMEN" | "KONTROL";
  karsilikTutar?: number;
  odemeBaglantisi?: string;
  relatedPaymentId?: number | string;
  relatedPaymentNote?: string;
  hatirlatmaTarihi?: string;
  onFoto: string;
  arkaFoto: string;
  isDeleted?: boolean;
  deletedAt?: string;
};

type KrediKartiRow = OwnedRow & {
  id: number;
  kartAdi: string;
  banka: string;
  kartSahibi: string;
  son4Hane: string;
  hesapNo: string;
  aciklama: string;
  not?: string;
  sonOdemeTarihi: string;
  aktif: boolean;
  firma?: string;
  tarih?: string;
  tutar?: number;
  donem?: string;
  toplamBorc?: number;
  asgariOdeme?: number;
  kullanimAmaci?: string;
  cariEtki?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
};

type PaymentTypeRow = {
  id: number;
  ad: string;
  aktif: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyAliasRow = {
  id: number;
  rawName: string;
  normalizedRawName: string;
  matchedCompanyId: number | string;
  matchedCompanyName: string;
  sourceType: string;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string;
  note: string;
};

type ProductAliasRow = {
  id: number;
  rawName: string;
  normalizedRawName: string;
  matchedProductId: number | string;
  matchedProductName: string;
  matchedProductCode: string;
  packaging?: string;
  sourceType: string;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string;
  note: string;
};

type EpostaKisiRow = OwnedRow & {
  id: number;
  anaFirma: string;
  gonderilenFirma: string;
  firmaId?: number | string;
  firmaAdi?: string;
  departman: string;
  departmanNo?: string;
  departmanKodlari?: string[];
  kisiAdi: string;
  eposta: string;
  gorev?: string;
  not?: string;
  oncelikli?: boolean;
  topluListe?: boolean;
  tasnifRaporuAlirMi?: boolean;
  faturaMailiAlirMi?: boolean;
  irsaliyeMailiAlirMi?: boolean;
  varsayilan: boolean;
  aktif: boolean;
};

@Injectable()
export class MuhasebeService {
  private readonly modelStore: ModelTakipStore;

  constructor(private readonly db: SqlStoreService) {
    this.modelStore = new ModelTakipStore(db);
  }

  private readonly PDF_FAKE_ROW_HINTS = [
    "miktar",
    "birim",
    "birim fiyat",
    "kdv oranÄ±",
    "kdv orani",
    "kdv tutarÄ±",
    "kdv tutari",
    "mal hizmet toplam tutarÄ±",
    "mal hizmet toplam tutari",
    "vergiler dahil toplam tutar",
    "Ã¶denecek tutar",
    "odenecek tutar",
    "kdv matrahÄ±",
    "kdv matrahi",
    "hesaplanan kdv",
    "toplam iskonto",
    "iskonto sonrasÄ± tutar",
    "iskonto sonrasi tutar",
    "banka",
    "iban",
    "delivery",
    "mersis",
    "ticari sicil",
    "yalnÄ±z",
    "yalniz",
    "notlar",
    "irsaliyeler",
    "vade farkÄ±",
    "vade farki",
  ] as const;

  private readonly COMPANY_STOP_WORDS = new Set([
    "SAN",
    "SANAYI",
    "SANAYII",
    "TIC",
    "TICARET",
    "VE",
    "LTD",
    "LIMITED",
    "STI",
    "SIRKETI",
    "SIRKET",
    "AS",
    "ANONIM",
    "PAZARLAMA",
    "DIS",
    "DISTIC",
    "DISTICARET",
    "TICARETI",
    "DIÅ",
    "DIÅTIC",
    "DIÅTÄ°C",
    "DIÅTICARET",
    "DIÅTÄ°CARET",
    "A",
    "S",
  ]);

  private readonly COMPANY_MATCH_THRESHOLD = 0.86;

  private readonly PRODUCT_MATCH_THRESHOLD = 0.82;

  private readonly files = {
    firmaKartlari: "muhasebe.firma-kartlari.v3.json",
    cariler: "muhasebe.cariler.v3.json",
    hareketler: "muhasebe.hareketler.v3.json",
    belgeler: "muhasebe.belgeler.core.json",
    urunler: "muhasebe.urunler.json",
    odemeler: "muhasebe.odemeler.v3.json",
    odemeTurleri: "muhasebe.odeme-turleri.v1.json",
    companyAliases: "muhasebe.company-aliases.v1.json",
    productAliases: "muhasebe.product-aliases.v1.json",
    cekler: "muhasebe.cekler.v3.json",
    krediKartlari: "muhasebe.kredi-kartlari.v3.json",
    epostaKisileri: "muhasebe.eposta-kisileri.v2.json",
    activityLogs: "muhasebe.activity-logs.v1.json",
  };

  private readonly mcFiles = {
    firmaKartlari: "companies",
    hareketler: "cari-movements",
    belgeler: "documents",
    urunler: "products",
    odemeler: "payments",
    odemeTurleri: "payment-types.json",
    companyAliases: "company-aliases",
    productAliases: "product-aliases",
    cekler: "checks",
    krediKartlari: "credit-cards",
    epostaKisileri: "email-contacts",
    activityLogs: "activity-logs",
    vatPeriods: "vat-periods",
    documentPathSettings: "document-path-settings.json",
    productDocuments: "product-documents",
  } as const;

  private _ctxSlug: string | undefined = undefined;

  public withCtx<T>(slug: string | undefined, fn: () => T): T {
    const prev = this._ctxSlug;
    if (slug !== undefined) this._ctxSlug = slug || undefined;
    try {
      return fn();
    } finally {
      this._ctxSlug = prev;
    }
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private nextId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  private roundAmount(value: any) {
    return Number(Number(value || 0).toFixed(2));
  }

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private cleanPathText(value: any) {
    const normalized = this.cleanText(value);
    if (!normalized) return "";
    return normalized
      .replace(/^"+|"+$/g, "")
      .replace(/^'+|'+$/g, "")
      .trim();
  }

  private cleanUploadFolderText(
    value: any,
    fallback: string,
    options?: { allowAbsolutePath?: boolean },
  ) {
    const normalized = this.cleanPathText(value);
    if (!normalized) return fallback;
    const looksLikePath =
      /^[a-zA-Z]:\\/.test(normalized) ||
      normalized.includes("\\") ||
      normalized.includes("/");
    if (looksLikePath && !options?.allowAbsolutePath) return fallback;
    return normalized;
  }

  private requireText(
    value: any,
    fieldLabel: string,
    options?: { allowEmpty?: boolean },
  ) {
    const normalized = this.cleanText(value);
    if (!options?.allowEmpty && !normalized) {
      throw new BadRequestException(`${fieldLabel} zorunludur.`);
    }
    return normalized;
  }

  private parseAmountInternal(value: any) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : Number.NaN;
    }
    const raw = this.cleanText(value).replace(/[^\d,.\-]/g, "");
    if (!raw) return Number.NaN;
    const negative = raw.startsWith("-");
    const unsigned = raw.replace(/-/g, "");
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    let decimalSeparator = "";

    if (lastComma >= 0 && lastDot >= 0) {
      decimalSeparator = lastComma > lastDot ? "," : ".";
    } else if (lastComma >= 0) {
      const digitsAfter = unsigned.length - lastComma - 1;
      decimalSeparator = digitsAfter === 1 || digitsAfter === 2 ? "," : "";
    } else if (lastDot >= 0) {
      const digitsAfter = unsigned.length - lastDot - 1;
      decimalSeparator = digitsAfter === 1 || digitsAfter === 2 ? "." : "";
    }

    let normalized = unsigned;
    if (decimalSeparator === ",") {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (decimalSeparator === ".") {
      normalized = normalized.replace(/,/g, "");
    } else {
      normalized = normalized.replace(/[.,]/g, "");
    }

    const parsed = Number(`${negative ? "-" : ""}${normalized}`);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : Number.NaN;
  }

  private getCurrentMainCompany() {
    return this.db.resolveMainCompany(undefined, this._ctxSlug);
  }

  private requireCurrentMainCompany() {
    const current = this.getCurrentMainCompany();
    if (!current?.id || !current?.slug) {
      throw new BadRequestException(
        "mainCompanyId ve mainCompanySlug zorunludur.",
      );
    }
    return current;
  }

  private findCompanyCardByPayload(
    payload: Record<string, any>,
    required = true,
  ): FirmaKartiRow | null {
    const requestedId = this.cleanText(
      payload.relatedCompanyId || payload.companyId || payload.matchedCompanyId,
    );
    const requestedName = this.cleanText(
      payload.relatedCompanyName ||
        payload.companyName ||
        payload.matchedCompanyName ||
        payload.gonderilenFirma ||
        payload.firma,
    );
    const cards = this.getFirmaKartRaw();
    const card =
      cards.find((item) => requestedId && String(item.id) === requestedId) ||
      cards.find(
        (item) =>
          requestedName &&
          this.companyCardKey(item.firma) ===
            this.companyCardKey(requestedName),
      ) ||
      null;
    if (!card && required) {
      throw new BadRequestException(
        "BaÄŸlÄ± firma kaydÄ± zorunludur. KayÄ±tlÄ± firma seÃ§in.",
      );
    }
    return card;
  }

  private attachMainCompanyOwnership<T extends OwnedRow>(
    row: T,
    companyCard?: FirmaKartiRow | null,
  ): T {
    const mainCompany = this.requireCurrentMainCompany();
    const relatedCompany = companyCard || null;
    return {
      ...row,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: relatedCompany?.id || row.relatedCompanyId || "",
      relatedCompanyName:
        relatedCompany?.firma ||
        this.cleanText(
          row.relatedCompanyName ||
            (row as any).gonderilenFirma ||
            (row as any).firma,
        ),
      ownershipStatus:
        relatedCompany ||
        this.cleanText((row as any).firma || (row as any).gonderilenFirma)
          ? relatedCompany
            ? "OK"
            : "MISSING_COMPANY_LINK"
          : row.ownershipStatus,
    };
  }

  private annotateOwnership<T extends OwnedRow>(rows: T[]) {
    const cards = this.getFirmaKartRaw();
    return rows.map((row) => {
      const companyName = this.cleanText(
        (row as any).relatedCompanyName ||
          (row as any).gonderilenFirma ||
          (row as any).firma,
      );
      const relatedCompany =
        cards.find(
          (item) =>
            this.cleanText((row as any).relatedCompanyId) &&
            String(item.id) === String((row as any).relatedCompanyId),
        ) ||
        cards.find(
          (item) =>
            companyName &&
            this.companyCardKey(item.firma) ===
              this.companyCardKey(companyName),
        ) ||
        null;
      return this.attachMainCompanyOwnership(row, relatedCompany);
    });
  }

  private normalizeAscii(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/Ä°/g, "I")
      .replace(/IÌ‡/g, "I")
      .replace(/Ä±/g, "I")
      .replace(/Å/g, "S")
      .replace(/ÅŸ/g, "S")
      .replace(/Ä/g, "G")
      .replace(/ÄŸ/g, "G")
      .replace(/Ãœ/g, "U")
      .replace(/Ã¼/g, "U")
      .replace(/Ã–/g, "O")
      .replace(/Ã¶/g, "O")
      .replace(/Ã‡/g, "C")
      .replace(/Ã§/g, "C");
  }

  private normalizeLookupBase(value: any) {
    return this.normalizeAscii(value)
      .replace(/['â€™`]/g, "")
      .replace(/[.\-/()\\_[\],;+]+/g, " ")
      .replace(/([A-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Z])/g, "$1 $2")
      .replace(/[^A-Z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildLookupProfile(value: any, mode: "company" | "product") {
    const base = this.normalizeLookupBase(value);
    let tokens = base.split(" ").filter(Boolean);
    if (mode === "company") {
      tokens = tokens.filter((token) => !this.COMPANY_STOP_WORDS.has(token));
    }
    const normalized = tokens.join(" ").trim();
    return {
      normalized,
      compact: normalized.replace(/\s+/g, ""),
      tokens,
    };
  }

  private aliasKey(value: any, mode: "company" | "product") {
    const profile = this.buildLookupProfile(value, mode);
    return String(profile.compact || "").toLocaleLowerCase("tr-TR");
  }

  private companyCardKey(value: any) {
    return (
      this.aliasKey(value, "company") || this.firmaKey(String(value || ""))
    );
  }

  private productCardKey(value: any) {
    return this.aliasKey(value, "product") || this.cleanText(value);
  }

  private getCompanyAliasesRaw(): CompanyAliasRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<CompanyAliasRow[]>(
      s,
      this.mcFiles.companyAliases,
      [],
    );
  }

  private saveCompanyAliasesRaw(rows: CompanyAliasRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.companyAliases, rows);
    return rows;
  }

  private getProductAliasesRaw(): ProductAliasRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<ProductAliasRow[]>(
      s,
      this.mcFiles.productAliases,
      [],
    );
  }

  private saveProductAliasesRaw(rows: ProductAliasRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.productAliases, rows);
    return rows;
  }

  public getDocumentPathSettings(): DocumentPathSettings {
    const slug = this.requireCompanyScopedSlug();
    const settings = this.db.readMainCompanyStore<DocumentPathSettings>(
      slug,
      this.mcFiles.documentPathSettings,
      {
        documentArchiveRootPath: "",
        gidenIrsaliyeBasePath: "",
        gidenFaturaBasePath: "",
        tedarikciFaturaBasePath:
          "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\belge-arsiv\\HKN GELEN",
        belgeYuklemeFaturaFolder: "HKN FATURA",
        belgeYuklemeIrsaliyeFolder: "HKN Ä°RSALÄ°YE",
        belgeYuklemeXmlFolder: "HKN XML",
        belgeYuklemeGelenIrsaliyeFolder: "HKN GELEN Ä°RSALÄ°YE",
        belgeYuklemeGelenFaturaFolder: "HKN GELEN FATURA",
        belgeYuklemeTasnifFolder: "TASNIF BEKLEYEN",
        faturaDosyaPrefix: "HKN",
        irsaliyeDosyaPrefix: "DDM",
      },
    );
    return {
      documentArchiveRootPath: this.cleanPathText(
        settings?.documentArchiveRootPath,
      ),
      gidenIrsaliyeBasePath: this.cleanPathText(settings?.gidenIrsaliyeBasePath),
      gidenFaturaBasePath: this.cleanPathText(settings?.gidenFaturaBasePath),
      tedarikciFaturaBasePath: this.cleanPathText(
        settings?.tedarikciFaturaBasePath,
      ),
      belgeYuklemeFaturaFolder:
        this.cleanUploadFolderText(
          settings?.belgeYuklemeFaturaFolder,
          "HKN FATURA",
        ),
      belgeYuklemeIrsaliyeFolder:
        this.cleanUploadFolderText(
          settings?.belgeYuklemeIrsaliyeFolder,
          "HKN Ä°RSALÄ°YE",
        ),
      belgeYuklemeXmlFolder:
        this.cleanUploadFolderText(settings?.belgeYuklemeXmlFolder, "HKN XML", {
          allowAbsolutePath: true,
        }),
      belgeYuklemeGelenIrsaliyeFolder:
        this.cleanUploadFolderText(
          settings?.belgeYuklemeGelenIrsaliyeFolder,
          "HKN GELEN Ä°RSALÄ°YE",
        ),
      belgeYuklemeGelenFaturaFolder:
        this.cleanUploadFolderText(
          settings?.belgeYuklemeGelenFaturaFolder,
          "HKN GELEN FATURA",
        ),
      belgeYuklemeTasnifFolder:
        this.cleanUploadFolderText(
          settings?.belgeYuklemeTasnifFolder,
          "TASNIF BEKLEYEN",
        ),
      faturaDosyaPrefix: this.cleanText(settings?.faturaDosyaPrefix) || "HKN",
      irsaliyeDosyaPrefix:
        this.cleanText(settings?.irsaliyeDosyaPrefix) || "DDM",
    };
  }

  public saveDocumentPathSettings(payload: Record<string, any>) {
    const slug = this.requireCompanyScopedSlug();
    const faturaPrefix = this.cleanText(payload?.faturaDosyaPrefix) || "HKN";
    const irsaliyePrefix =
      this.cleanText(payload?.irsaliyeDosyaPrefix) || "DDM";
    if (
      faturaPrefix &&
      irsaliyePrefix &&
      faturaPrefix.toLocaleUpperCase("tr-TR") ===
        irsaliyePrefix.toLocaleUpperCase("tr-TR")
    ) {
      throw new BadRequestException(
        "Fatura Prefix ve Ä°rsaliye Prefix aynÄ± olamaz. Ã‡ift kayÄ±t riskini Ã¶nlemek iÃ§in farklÄ± prefix kullanÄ±n.",
      );
    }
    const nextSettings: DocumentPathSettings = {
      documentArchiveRootPath: this.cleanPathText(
        payload?.documentArchiveRootPath,
      ),
      gidenIrsaliyeBasePath: this.cleanPathText(payload?.gidenIrsaliyeBasePath),
      gidenFaturaBasePath: this.cleanPathText(payload?.gidenFaturaBasePath),
      tedarikciFaturaBasePath: this.cleanPathText(
        payload?.tedarikciFaturaBasePath,
      ),
      belgeYuklemeFaturaFolder:
        this.cleanUploadFolderText(
          payload?.belgeYuklemeFaturaFolder,
          "HKN FATURA",
        ),
      belgeYuklemeIrsaliyeFolder:
        this.cleanUploadFolderText(
          payload?.belgeYuklemeIrsaliyeFolder,
          "HKN Ä°RSALÄ°YE",
        ),
      belgeYuklemeXmlFolder:
        this.cleanUploadFolderText(payload?.belgeYuklemeXmlFolder, "HKN XML", {
          allowAbsolutePath: true,
        }),
      belgeYuklemeGelenIrsaliyeFolder:
        this.cleanUploadFolderText(
          payload?.belgeYuklemeGelenIrsaliyeFolder,
          "HKN GELEN Ä°RSALÄ°YE",
        ),
      belgeYuklemeGelenFaturaFolder:
        this.cleanUploadFolderText(
          payload?.belgeYuklemeGelenFaturaFolder,
          "HKN GELEN FATURA",
        ),
      belgeYuklemeTasnifFolder:
        this.cleanUploadFolderText(
          payload?.belgeYuklemeTasnifFolder,
          "TASNIF BEKLEYEN",
        ),
      faturaDosyaPrefix: faturaPrefix,
      irsaliyeDosyaPrefix: irsaliyePrefix,
    };
    this.db.writeMainCompanyStore(
      slug,
      this.mcFiles.documentPathSettings,
      nextSettings,
    );
    return nextSettings;
  }

  private findCompanyAlias(rawName: any) {
    const normalizedRawName = this.aliasKey(rawName, "company");
    if (!normalizedRawName) return null;
    const aliases = this.getCompanyAliasesRaw();
    return (
      aliases.find(
        (item) =>
          item.isActive !== false &&
          item.isDeleted !== true &&
          item.normalizedRawName === normalizedRawName,
      ) || null
    );
  }

  private resolveCompanyAlias(rawName: any) {
    const rawText = this.cleanText(rawName);
    const alias = this.findCompanyAlias(rawText);
    if (!alias) {
      return {
        matched: false,
        rawName: rawText,
        cleanCompanyName: rawText,
        companyId: "",
        aliasId: "",
        alias: null as CompanyAliasRow | null,
      };
    }
    const cards = this.getFirmaKartRaw();
    const target =
      cards.find(
        (item) =>
          String(item.id || "") === String(alias.matchedCompanyId || ""),
      ) ||
      cards.find(
        (item) =>
          this.companyCardKey(item.firma) ===
          this.companyCardKey(alias.matchedCompanyName),
      );
    return {
      matched: true,
      rawName: rawText,
      cleanCompanyName:
        this.cleanText(target?.firma || alias.matchedCompanyName) || rawText,
      companyId: target?.id || alias.matchedCompanyId || "",
      aliasId: alias.id,
      alias,
    };
  }

  private hasInactiveCompanyAlias(rawName: any) {
    const normalizedRawName = this.aliasKey(rawName, "company");
    if (!normalizedRawName) return false;
    const aliases = this.getCompanyAliasesRaw();
    return aliases.some(
      (item) =>
        item.isDeleted !== true &&
        item.isActive === false &&
        item.normalizedRawName === normalizedRawName,
    );
  }

  public getCompanyAliases() {
    return this.getCompanyAliasesRaw().sort((a, b) => {
      if ((a.isDeleted === true) !== (b.isDeleted === true))
        return a.isDeleted ? 1 : -1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return Number(b.hitCount || 0) - Number(a.hitCount || 0);
    });
  }

  public getProductAliases() {
    return this.getProductAliasesRaw().sort((a, b) => {
      if ((a.isDeleted === true) !== (b.isDeleted === true))
        return a.isDeleted ? 1 : -1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return Number(b.hitCount || 0) - Number(a.hitCount || 0);
    });
  }

  public getCompanyMergeSuggestions(limit = 100) {
    const cards = this.getFirmaKartRaw().filter(
      (item) => !item.hiddenFromMainList && !item.isAliasMerged,
    );
    const aliases = this.getCompanyAliasesRaw();
    const aliasKeys = new Set(
      aliases
        .map((item) => this.cleanText(item.normalizedRawName))
        .filter(Boolean),
    );

    const groups = new Map<string, any[]>();
    for (const card of cards) {
      const key = this.companyCardKey(card?.firma);
      if (!key) continue;
      const bucket = groups.get(key) || [];
      bucket.push(card);
      groups.set(key, bucket);
    }

    const suggestions: Array<Record<string, any>> = [];
    for (const [normalizedKey, group] of groups.entries()) {
      if (!Array.isArray(group) || group.length < 2) continue;
      const sorted = [...group].sort((a, b) => {
        const aName = this.cleanText(a?.firma);
        const bName = this.cleanText(b?.firma);
        if (aName.length !== bName.length) return aName.length - bName.length;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });
      const target = sorted[0];
      for (const source of sorted.slice(1)) {
        const rawName = this.cleanText(source?.firma);
        const normalizedRawName = this.aliasKey(rawName, "company");
        if (!rawName || !normalizedRawName) continue;
        suggestions.push({
          sourceCompanyId: source?.id || "",
          sourceCompanyName: rawName,
          suggestedCompanyId: target?.id || "",
          suggestedCompanyName: this.cleanText(target?.firma),
          normalizedRawName,
          normalizedKey,
          alreadyAliased: aliasKeys.has(normalizedRawName),
        });
      }
    }

    return suggestions.slice(0, Math.max(1, Number(limit) || 100));
  }

  public getCompanyMatchingStatus() {
    const aliases = this.getCompanyAliasesRaw();
    const activeSuggestions = this.getCompanyMergeSuggestions(5000).filter(
      (item) => item?.alreadyAliased !== true,
    );

    const unresolvedAliasCount = aliases.filter((item) => {
      if (!item || item.isDeleted === true) return false;
      const hasTarget = Boolean(
        item.matchedCompanyId || item.matchedCompanyName,
      );
      return item.isActive === false || !hasTarget;
    }).length;

    return {
      activeAliasSuggestionCount: activeSuggestions.length,
      unresolvedCompanyAliasCount: unresolvedAliasCount,
      pendingCompanyMatchingRecords: activeSuggestions.length,
    };
  }

  public saveCompanyAlias(
    payload: Partial<CompanyAliasRow> & Record<string, any>,
  ) {
    const rawName = this.cleanText(payload.rawName);
    const normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.aliasKey(rawName, "company");
    const matchedCompanyName = this.cleanText(payload.matchedCompanyName);
    let matchedCompanyId: any = payload.matchedCompanyId || "";

    if (!rawName) throw new Error("Ham firma adÄ± zorunludur.");
    if (!normalizedRawName)
      throw new Error("Normalize firma anahtarÄ± boÅŸ olamaz.");

    const cards = this.getFirmaKartlari();
    if (matchedCompanyId) {
      const byId = cards.find(
        (item) => Number(item.id) === Number(matchedCompanyId),
      );
      if (!byId) throw new Error("SeÃ§ilen firma kartÄ± bulunamadÄ±.");
      matchedCompanyId = byId.id;
    }

    const targetCard = matchedCompanyId
      ? cards.find((item) => Number(item.id) === Number(matchedCompanyId))
      : cards.find(
          (item) =>
            this.companyCardKey(item.firma) ===
            this.companyCardKey(matchedCompanyName),
        );

    if (!targetCard) {
      throw new Error("EÅŸleÅŸen firma kartÄ± zorunludur.");
    }

    this.upsertCompanyAlias({
      rawName,
      matchedCompanyId: targetCard.id,
      matchedCompanyName: targetCard.firma,
      sourceType: this.cleanText(payload.sourceType) || "MANUAL",
      allowReactivate: true,
    });

    const rows = this.getCompanyAliasesRaw();
    const row = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    if (!row) return null;

    row.isActive =
      payload.isActive !== undefined ? Boolean(payload.isActive) : row.isActive;
    if (payload.note !== undefined) row.note = this.cleanText(payload.note);
    if (payload.isDeleted !== undefined) {
      row.isDeleted = Boolean(payload.isDeleted);
      row.deletedAt = row.isDeleted ? this.nowIso() : "";
      if (row.isDeleted) row.isActive = false;
    }
    row.updatedAt = this.nowIso();
    this.saveCompanyAliasesRaw(rows);
    this.addActivityLog({
      entityType: "company_alias",
      entityId: String(row.id),
      actionType: "LINKED",
      title: "Firma alias baÄŸlandÄ±",
      description: `${row.rawName} alias olarak ${row.matchedCompanyName} firmasÄ±na baÄŸlandÄ±`,
      oldValue: null,
      newValue: row,
      source: row.sourceType || "MANUAL",
    });
    return row;
  }

  public updateCompanyAlias(
    id: number | string,
    payload: Partial<CompanyAliasRow> & Record<string, any>,
  ) {
    const rows = this.getCompanyAliasesRaw();
    const alias = rows.find((item) => Number(item.id) === Number(id));
    if (!alias) throw new Error("Alias kaydÄ± bulunamadÄ±.");
    const oldAlias = { ...alias };

    const cards = this.getFirmaKartlari();
    const matchedCompanyId = payload.matchedCompanyId || alias.matchedCompanyId;
    const card = cards.find(
      (item) => Number(item.id) === Number(matchedCompanyId),
    );
    if (!card) throw new Error("EÅŸleÅŸen firma kartÄ± bulunamadÄ±.");

    alias.rawName = this.cleanText(payload.rawName || alias.rawName);
    alias.normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.aliasKey(alias.rawName, "company");
    alias.matchedCompanyId = card.id;
    alias.matchedCompanyName = card.firma;
    alias.sourceType = this.cleanText(
      payload.sourceType || alias.sourceType || "MANUAL",
    );
    alias.isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : alias.isActive;
    alias.note =
      payload.note !== undefined ? this.cleanText(payload.note) : alias.note;
    if (payload.isDeleted !== undefined) {
      alias.isDeleted = Boolean(payload.isDeleted);
      alias.deletedAt = alias.isDeleted ? this.nowIso() : "";
      if (alias.isDeleted) alias.isActive = false;
    }
    alias.updatedAt = this.nowIso();
    if (payload.hitCount !== undefined)
      alias.hitCount = Number(payload.hitCount || 0);
    alias.lastSeenAt = this.cleanText(payload.lastSeenAt || alias.lastSeenAt);

    this.saveCompanyAliasesRaw(rows);
    this.addActivityLog({
      entityType: "company_alias",
      entityId: String(alias.id),
      actionType: "UPDATED",
      title: "Firma alias gÃ¼ncellendi",
      description: `${alias.rawName} alias kaydÄ± gÃ¼ncellendi`,
      oldValue: oldAlias,
      newValue: alias,
      source: alias.sourceType || "MANUAL",
    });
    return alias;
  }

  public activateCompanyAlias(id: number | string) {
    const rows = this.getCompanyAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("Alias kaydÄ± bulunamadÄ±.");
    row.isActive = true;
    row.isDeleted = false;
    row.deletedAt = "";
    row.updatedAt = this.nowIso();
    this.saveCompanyAliasesRaw(rows);
    return row;
  }

  public deactivateCompanyAlias(id: number | string) {
    const rows = this.getCompanyAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("Alias kaydÄ± bulunamadÄ±.");
    row.isActive = false;
    row.updatedAt = this.nowIso();
    this.saveCompanyAliasesRaw(rows);
    return row;
  }

  public deleteCompanyAlias(id: number | string) {
    const rows = this.getCompanyAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("Alias kaydÄ± bulunamadÄ±.");
    row.isDeleted = true;
    row.deletedAt = this.nowIso();
    row.isActive = false;
    row.updatedAt = this.nowIso();
    this.saveCompanyAliasesRaw(rows);
    return row;
  }

  public restoreCompanyAlias(id: number | string) {
    const rows = this.getCompanyAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("Alias kaydÄ± bulunamadÄ±.");
    row.isDeleted = false;
    row.deletedAt = "";
    row.isActive = true;
    row.updatedAt = this.nowIso();
    this.saveCompanyAliasesRaw(rows);
    return row;
  }

  // â”€â”€â”€ Firma BirleÅŸtirme (Merge) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  public mergeFirmaKarti(payload: Record<string, any>) {
    const sourceCompanyId = Number(payload.sourceCompanyId || 0);
    const targetCompanyId = Number(payload.targetCompanyId || 0);
    if (!sourceCompanyId || !targetCompanyId)
      throw new Error("sourceCompanyId ve targetCompanyId zorunludur.");
    if (sourceCompanyId === targetCompanyId)
      throw new Error("Kaynak ve hedef firma aynÄ± olamaz.");

    const cards = this.getFirmaKartRaw();
    const source = cards.find((item) => Number(item.id) === sourceCompanyId);
    const target = cards.find((item) => Number(item.id) === targetCompanyId);
    if (!source) throw new Error("Kaynak firma kartÄ± bulunamadÄ±.");
    if (!target) throw new Error("Hedef firma kartÄ± bulunamadÄ±.");

    const now = this.nowIso();
    const oldSource = { ...source };

    // 1) Kaynak firmayÄ± gizle (soft hide)
    source.isAliasMerged = true;
    source.hiddenFromMainList = true;
    source.mergedIntoCompanyId = target.id;
    source.mergedIntoCompanyName = this.cleanText(target.firma);
    source.mergedAt = now;
    source.aktif = false;
    source.updatedAt = now;
    this.saveFirmaKartRaw(cards);

    // 2) Alias kaydÄ± oluÅŸtur / gÃ¼ncelle
    this.upsertCompanyAlias({
      rawName: this.cleanText(source.firma),
      matchedCompanyId: target.id,
      matchedCompanyName: this.cleanText(target.firma),
      sourceType: this.cleanText(payload.sourceType) || "MERGE",
      allowReactivate: true,
    });

    // 3) BaÄŸlÄ± kayÄ±tlarÄ± hedef firmaya yÃ¶nlendir (relink)
    const relinkCounts: Record<string, number> = {
      documents: 0,
      cariMovements: 0,
      payments: 0,
      checks: 0,
      creditCards: 0,
      emailContacts: 0,
    };
    const sourceKey = this.firmaKey(source.firma);
    const targetName = this.cleanText(target.firma);

    const hareketler = this.getHareketRaw().filter(
      (row) => row?.isDeleted !== true,
    );
    for (const row of hareketler) {
      if (this.firmaKey(row.firma) === sourceKey) {
        row.firma = targetName;
        row.updatedAt = now;
        relinkCounts.cariMovements++;
      }
    }
    if (relinkCounts.cariMovements > 0) {
      this.saveHareketRaw(hareketler);
      this.recalcCariBalancesForFirma(targetName);
    }

    const belgeler = this.getBelgeRaw();
    for (const row of belgeler) {
      if (this.firmaKey(row.firma) === sourceKey) {
        row.firma = targetName;
        if (Number(row.matchedCompanyId) === sourceCompanyId) {
          row.matchedCompanyId = target.id;
          row.matchedCompanyName = targetName;
        }
        (row as any).updatedAt = now;
        relinkCounts.documents++;
      }
    }
    if (relinkCounts.documents > 0) this.saveBelgeRaw(belgeler);

    const odemeler = this.getOdemeRaw();
    for (const row of odemeler) {
      if (this.firmaKey(row.firma) === sourceKey) {
        row.firma = targetName;
        (row as any).updatedAt = now;
        relinkCounts.payments++;
      }
    }
    if (relinkCounts.payments > 0) this.saveOdemeRaw(odemeler);

    const cekler = this.getCekRaw();
    for (const row of cekler) {
      if (this.firmaKey((row as any).firma) === sourceKey) {
        (row as any).firma = targetName;
        (row as any).updatedAt = now;
        relinkCounts.checks++;
      }
    }
    if (relinkCounts.checks > 0) this.saveCekRaw(cekler);

    const kartlar = this.getKrediKartiRaw();
    for (const row of kartlar) {
      if (this.firmaKey((row as any).firma) === sourceKey) {
        (row as any).firma = targetName;
        (row as any).updatedAt = now;
        relinkCounts.creditCards++;
      }
    }
    if (relinkCounts.creditCards > 0) this.saveKrediKartiRaw(kartlar);

    const eposta = this.getEpostaKisiRaw();
    for (const row of eposta) {
      if (this.firmaKey(row.gonderilenFirma) === sourceKey) {
        row.gonderilenFirma = targetName;
        relinkCounts.emailContacts++;
      }
    }
    if (relinkCounts.emailContacts > 0) this.saveEpostaKisiRaw(eposta);

    this.syncCariSummaries();

    // 4) Log
    this.addActivityLog({
      entityType: "company_alias",
      entityId: String(source.id),
      actionType: "MERGED",
      title: "Firma birleÅŸtirildi",
      description: `${source.firma} -> ${target.firma} olarak birleÅŸtirildi. YÃ¶nlendirilen kayÄ±t: ${JSON.stringify(relinkCounts)}`,
      oldValue: { firma: oldSource.firma, id: oldSource.id },
      newValue: {
        firma: source.firma,
        mergedInto: target.firma,
        mergedIntoId: target.id,
        relinkCounts,
      },
      source: payload.sourceType || "MERGE",
    });

    return {
      source: source,
      target: target,
      relinkCounts,
    };
  }

  public restoreMergedFirma(sourceCompanyId: number | string) {
    const id = Number(sourceCompanyId);
    if (!id) throw new Error("sourceCompanyId zorunludur.");
    const cards = this.getFirmaKartRaw();
    const card = cards.find((item) => Number(item.id) === id);
    if (!card) throw new Error("Firma kartÄ± bulunamadÄ±.");
    if (!card.isAliasMerged) throw new Error("Bu firma birleÅŸtirilmiÅŸ deÄŸil.");

    const oldCard = { ...card };
    const now = this.nowIso();
    card.isAliasMerged = false;
    card.hiddenFromMainList = false;
    card.aktif = true;
    card.mergedIntoCompanyId = undefined;
    card.mergedIntoCompanyName = undefined;
    card.mergedAt = undefined;
    card.updatedAt = now;
    this.saveFirmaKartRaw(cards);

    // Alias kaydÄ±nÄ± pasife al
    const aliases = this.getCompanyAliasesRaw();
    const alias = aliases.find(
      (item) =>
        this.firmaKey(item.rawName) === this.firmaKey(card.firma) &&
        item.isActive,
    );
    if (alias) {
      alias.isActive = false;
      alias.updatedAt = now;
      this.saveCompanyAliasesRaw(aliases);
    }

    this.addActivityLog({
      entityType: "company_alias",
      entityId: String(card.id),
      actionType: "RESTORED",
      title: "Firma birleÅŸtirmesi geri alÄ±ndÄ±",
      description: `${card.firma} firmasÄ± tekrar aktif listeye alÄ±ndÄ±`,
      oldValue: {
        firma: oldCard.firma,
        mergedInto: oldCard.mergedIntoCompanyName,
      },
      newValue: { firma: card.firma, hiddenFromMainList: false },
      source: "RESTORE",
    });

    return card;
  }

  public getMergedFirmaKartlari() {
    const cards = this.getFirmaKartRaw().filter(
      (item) => item.isAliasMerged === true,
    );
    const cariByKey = new Map(
      this.getCariler().map((item) => [this.firmaKey(item.firma), item]),
    );
    return cards.map((item) => {
      const cari = cariByKey.get(this.firmaKey(item.firma));
      return {
        ...item,
        mevcutBakiye: this.roundAmount(Number(cari?.bakiye || 0)),
      };
    });
  }

  public matchCompanyName(rawName: any) {
    const cleaned = this.cleanText(rawName);
    const match = this.findMatchingCompany(cleaned, "");
    return {
      rawName: cleaned,
      normalizedRawName: this.aliasKey(cleaned, "company"),
      matchedCompanyId: match?.row?.id || "",
      matchedCompanyName: this.cleanText(match?.row?.firma),
      confidence: Number(match?.confidence || 0),
      aliasMatched: Boolean((match as any)?.aliasMatched),
      matchType: this.cleanText((match as any)?.matchType || ""),
      firmaEslesmeTipi: this.cleanText((match as any)?.matchType || ""),
    };
  }

  public matchProductName(rawName: any) {
    const cleaned = this.cleanText(rawName);
    const match = this.findMatchingProduct(cleaned, "", cleaned);
    return {
      rawName: cleaned,
      normalizedRawName: this.aliasKey(cleaned, "product"),
      matchedProductId: match?.row?.id || "",
      matchedProductName: this.cleanText(
        match?.row ? this.getProductCode(match.row) : "",
      ),
      matchedProductCode: this.cleanText(
        match?.row ? this.getProductCode(match.row) : "",
      ),
      confidence: Number(match?.confidence || 0),
      aliasMatched: Boolean((match as any)?.aliasMatched),
      matchType: this.cleanText((match as any)?.matchType || ""),
      urunEslesmeTipi: this.cleanText((match as any)?.matchType || ""),
    };
  }

  private findProductAlias(rawName: any) {
    const normalizedRawName = this.aliasKey(rawName, "product");
    if (!normalizedRawName) return null;
    const aliases = this.getProductAliasesRaw();
    return (
      aliases.find(
        (item) =>
          item.isActive !== false &&
          item.isDeleted !== true &&
          item.normalizedRawName === normalizedRawName,
      ) || null
    );
  }

  private hasInactiveProductAlias(rawName: any) {
    const normalizedRawName = this.aliasKey(rawName, "product");
    if (!normalizedRawName) return false;
    const aliases = this.getProductAliasesRaw();
    const hasActive = aliases.some(
      (item) =>
        item.isDeleted !== true &&
        item.isActive !== false &&
        item.normalizedRawName === normalizedRawName,
    );
    if (hasActive) return false;
    return aliases.some(
      (item) =>
        item.isDeleted !== true &&
        item.isActive === false &&
        item.normalizedRawName === normalizedRawName,
    );
  }

  public saveProductAlias(
    payload: Partial<ProductAliasRow> & Record<string, any>,
  ) {
    const rawName = this.cleanText(payload.rawName);
    const normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.aliasKey(rawName, "product");
    if (!rawName) throw new Error("Ham Ã¼rÃ¼n adÄ± zorunludur.");
    if (!normalizedRawName)
      throw new Error("Normalize Ã¼rÃ¼n anahtarÄ± boÅŸ olamaz.");

    const products = this.getUrunler() as any[];
    const matchedProductId = Number(payload.matchedProductId || 0);
    const target = matchedProductId
      ? products.find((item) => Number(item.id) === matchedProductId)
      : products.find(
          (item) =>
            this.productCardKey(item?.urunAdi || item?.ticariAdi) ===
            this.productCardKey(payload.matchedProductName),
        );
    if (!target) throw new Error("EÅŸleÅŸen Ã¼rÃ¼n zorunludur.");

    this.upsertProductAlias({
      rawName,
      matchedProductId: target.id,
      matchedProductName: this.getProductDisplayName(target),
      matchedProductCode: this.getProductCode(target),
      packaging: payload.packaging || payload.ambalaj,
      sourceType: this.cleanText(payload.sourceType) || "MANUAL",
      allowReactivate: true,
    } as any);

    const rows = this.getProductAliasesRaw();
    const row = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    if (!row) return null;
    row.isActive =
      payload.isActive !== undefined ? Boolean(payload.isActive) : row.isActive;
    if (payload.packaging !== undefined || payload.ambalaj !== undefined) {
      row.packaging = this.cleanText(payload.packaging || payload.ambalaj);
    }
    if (payload.note !== undefined) row.note = this.cleanText(payload.note);
    if (payload.isDeleted !== undefined) {
      row.isDeleted = Boolean(payload.isDeleted);
      row.deletedAt = row.isDeleted ? this.nowIso() : "";
      if (row.isDeleted) row.isActive = false;
    }
    row.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    this.addActivityLog({
      entityType: "product_alias",
      entityId: String(row.id),
      actionType: "LINKED",
      title: "ÃœrÃ¼n alias baÄŸlandÄ±",
      description: `${row.rawName} alias olarak ${row.matchedProductName} Ã¼rÃ¼nÃ¼ne baÄŸlandÄ±`,
      oldValue: null,
      newValue: row,
      source: row.sourceType || "MANUAL",
    });
    return row;
  }

  public updateProductAlias(
    id: number | string,
    payload: Partial<ProductAliasRow> & Record<string, any>,
  ) {
    const rows = this.getProductAliasesRaw();
    const alias = rows.find((item) => Number(item.id) === Number(id));
    if (!alias) throw new Error("ÃœrÃ¼n alias kaydÄ± bulunamadÄ±.");
    const oldAlias = { ...alias };

    const products = this.getUrunler() as any[];
    const matchedProductId = Number(
      payload.matchedProductId || alias.matchedProductId || 0,
    );
    const target = products.find(
      (item) => Number(item.id) === matchedProductId,
    );
    if (!target) throw new Error("EÅŸleÅŸen Ã¼rÃ¼n bulunamadÄ±.");

    alias.rawName = this.cleanText(payload.rawName || alias.rawName);
    alias.normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.aliasKey(alias.rawName, "product");
    alias.matchedProductId = target.id;
    alias.matchedProductName = this.getProductDisplayName(target);
    alias.matchedProductCode = this.getProductCode(target);
    alias.sourceType = this.cleanText(
      payload.sourceType || alias.sourceType || "MANUAL",
    );
    alias.isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : alias.isActive;
    alias.note =
      payload.note !== undefined ? this.cleanText(payload.note) : alias.note;
    if (payload.isDeleted !== undefined) {
      alias.isDeleted = Boolean(payload.isDeleted);
      alias.deletedAt = alias.isDeleted ? this.nowIso() : "";
      if (alias.isDeleted) alias.isActive = false;
    }
    if (payload.hitCount !== undefined)
      alias.hitCount = Number(payload.hitCount || 0);
    if (payload.lastSeenAt !== undefined)
      alias.lastSeenAt = this.cleanText(payload.lastSeenAt);
    alias.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    this.addActivityLog({
      entityType: "product_alias",
      entityId: String(alias.id),
      actionType: "UPDATED",
      title: "ÃœrÃ¼n alias gÃ¼ncellendi",
      description: `${alias.rawName} Ã¼rÃ¼n alias kaydÄ± gÃ¼ncellendi`,
      oldValue: oldAlias,
      newValue: alias,
      source: alias.sourceType || "MANUAL",
    });
    return alias;
  }

  public activateProductAlias(id: number | string) {
    const rows = this.getProductAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("ÃœrÃ¼n alias kaydÄ± bulunamadÄ±.");
    row.isActive = true;
    row.isDeleted = false;
    row.deletedAt = "";
    row.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    return row;
  }

  public deactivateProductAlias(id: number | string) {
    const rows = this.getProductAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("ÃœrÃ¼n alias kaydÄ± bulunamadÄ±.");
    row.isActive = false;
    row.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    return row;
  }

  public deleteProductAlias(id: number | string) {
    const rows = this.getProductAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("ÃœrÃ¼n alias kaydÄ± bulunamadÄ±.");
    row.isDeleted = true;
    row.deletedAt = this.nowIso();
    row.isActive = false;
    row.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    return row;
  }

  public restoreProductAlias(id: number | string) {
    const rows = this.getProductAliasesRaw();
    const row = rows.find((item) => Number(item.id) === Number(id));
    if (!row) throw new Error("ÃœrÃ¼n alias kaydÄ± bulunamadÄ±.");
    row.isDeleted = false;
    row.deletedAt = "";
    row.isActive = true;
    row.updatedAt = this.nowIso();
    this.saveProductAliasesRaw(rows);
    return row;
  }

  private upsertCompanyAlias(args: {
    rawName: any;
    matchedCompanyId?: any;
    matchedCompanyName?: any;
    sourceType?: string;
    allowReactivate?: boolean;
  }) {
    const rawName = this.cleanText(args.rawName);
    const normalizedRawName = this.aliasKey(rawName, "company");
    const matchedCompanyName = this.cleanText(args.matchedCompanyName);
    const matchedCompanyId = args.matchedCompanyId || "";
    if (!rawName || !normalizedRawName || !matchedCompanyName) return;

    const now = this.nowIso();
    const rows = this.getCompanyAliasesRaw();
    const existing = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    if (existing) {
      if (existing.isDeleted === true) {
        if (args.allowReactivate !== true) return;
        existing.isDeleted = false;
        existing.deletedAt = "";
      }
      if (existing.isActive === false && args.allowReactivate !== true) {
        return;
      }
      existing.rawName = rawName;
      existing.matchedCompanyId = matchedCompanyId;
      existing.matchedCompanyName = matchedCompanyName;
      existing.sourceType =
        this.cleanText(args.sourceType) || existing.sourceType || "BELGE";
      existing.hitCount = Number(existing.hitCount || 0) + 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.isActive = true;
      existing.note = existing.note || "";
      this.saveCompanyAliasesRaw(rows);
      return;
    }

    rows.unshift({
      id: this.nextId(),
      rawName,
      normalizedRawName,
      matchedCompanyId,
      matchedCompanyName,
      sourceType: this.cleanText(args.sourceType) || "BELGE",
      hitCount: 1,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      isDeleted: false,
      deletedAt: "",
      note: "",
    });
    this.saveCompanyAliasesRaw(rows);
  }

  private upsertProductAlias(args: {
    rawName: any;
    matchedProductId?: any;
    matchedProductName?: any;
    matchedProductCode?: any;
    packaging?: any;
    sourceType?: string;
    allowReactivate?: boolean;
  }) {
    const rawName = this.cleanText(args.rawName);
    const normalizedRawName = this.aliasKey(rawName, "product");
    const matchedProductName = this.cleanText(args.matchedProductName);
    const matchedProductId = args.matchedProductId || "";
    const matchedProductCode = this.cleanText(args.matchedProductCode);
    if (!rawName || !normalizedRawName || !matchedProductName) return;

    const now = this.nowIso();
    const rows = this.getProductAliasesRaw();
    const existing = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    if (existing) {
      if (existing.isDeleted === true) return;
      if (existing.isActive === false && args.allowReactivate !== true) return;
      existing.rawName = rawName;
      existing.matchedProductId = matchedProductId;
      existing.matchedProductName = matchedProductName;
      existing.matchedProductCode = matchedProductCode;
      existing.packaging =
        this.cleanText(args.packaging) || existing.packaging || "";
      existing.sourceType =
        this.cleanText(args.sourceType) || existing.sourceType || "BELGE";
      existing.hitCount = Number(existing.hitCount || 0) + 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.isActive = true;
      existing.isDeleted = false;
      existing.deletedAt = "";
      this.saveProductAliasesRaw(rows);
      return;
    }

    rows.unshift({
      id: this.nextId(),
      rawName,
      normalizedRawName,
      matchedProductId,
      matchedProductName,
      matchedProductCode,
      packaging: this.cleanText(args.packaging),
      sourceType: this.cleanText(args.sourceType) || "BELGE",
      hitCount: 1,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      isDeleted: false,
      deletedAt: "",
      note: "",
    });
    this.saveProductAliasesRaw(rows);
  }

  private scoreLookupMatch(
    source: { normalized: string; compact: string; tokens: string[] },
    target: { normalized: string; compact: string; tokens: string[] },
  ) {
    if (!source.compact || !target.compact) return 0;
    if (source.compact === target.compact) return 1;
    if (source.normalized === target.normalized) return 0.99;

    const targetSet = new Set(target.tokens);
    const overlap = source.tokens.filter((token) =>
      targetSet.has(token),
    ).length;
    const coverage = overlap / Math.max(target.tokens.length, 1);
    const precision = overlap / Math.max(source.tokens.length, 1);
    const contains =
      source.compact.includes(target.compact) ||
      target.compact.includes(source.compact);
    const prefix =
      source.compact.startsWith(target.compact) ||
      target.compact.startsWith(source.compact);

    return Number(
      Math.min(
        0.99,
        coverage * 0.55 +
          precision * 0.2 +
          (contains ? 0.18 : 0) +
          (prefix ? 0.07 : 0),
      ).toFixed(3),
    );
  }

  private findMatchingCompany(rawName: any, explicitCompanyId?: any) {
    const cards = this.getFirmaKartlari();
    const source = this.buildLookupProfile(rawName, "company");
    const explicitId = Number(explicitCompanyId || 0);
    if (explicitId) {
      const explicit = cards.find((item) => Number(item.id) === explicitId);
      if (explicit) {
        return {
          row: explicit,
          confidence: 1,
          normalizedSource: source.normalized,
          matchType: "KULLANICI_SECIMI",
        };
      }
    }

    if (!source.compact) return null;

    const exactCard = cards.find(
      (item) =>
        this.companyCardKey(item.firma) === this.companyCardKey(rawName),
    );
    if (exactCard) {
      return {
        row: exactCard,
        confidence: 1,
        normalizedSource: source.normalized,
        matchType: "BIREBIR",
      };
    }

    if (this.hasInactiveCompanyAlias(rawName)) {
      return null;
    }

    // Admin alias is explicit user intent and must win over heuristic normalize matching.
    const alias = this.findCompanyAlias(rawName);
    if (alias?.matchedCompanyId) {
      const matchedById = cards.find(
        (item) => Number(item.id) === Number(alias.matchedCompanyId),
      );
      if (matchedById) {
        return {
          row: matchedById,
          confidence: 1,
          normalizedSource: source.normalized,
          aliasMatched: true,
          matchType: "ADMIN_ESLEME",
        };
      }
    }
    if (alias?.matchedCompanyName) {
      const matchedByName = cards.find(
        (item) =>
          this.firmaKey(item.firma) ===
          this.firmaKey(String(alias.matchedCompanyName || "")),
      );
      if (matchedByName) {
        return {
          row: matchedByName,
          confidence: 0.99,
          normalizedSource: source.normalized,
          aliasMatched: true,
          matchType: "ADMIN_ESLEME",
        };
      }
    }

    let normalizedBest: {
      row: any;
      confidence: number;
      normalizedSource: string;
    } | null = null;
    for (const item of cards) {
      const target = this.buildLookupProfile(item.firma, "company");
      const score = this.scoreLookupMatch(source, target);
      if (!normalizedBest || score > normalizedBest.confidence) {
        normalizedBest = {
          row: item,
          confidence: score,
          normalizedSource: source.normalized,
        };
      }
    }
    if (normalizedBest && normalizedBest.confidence >= 0.98) {
      return {
        ...normalizedBest,
        matchType: "NORMALIZE",
      };
    }

    let best: {
      row: any;
      confidence: number;
      normalizedSource: string;
    } | null = null;

    for (const item of cards) {
      const target = this.buildLookupProfile(item.firma, "company");
      const score = this.scoreLookupMatch(source, target);
      if (!best || score > best.confidence) {
        best = {
          row: item,
          confidence: score,
          normalizedSource: source.normalized,
        };
      }
    }

    return best && best.confidence >= this.COMPANY_MATCH_THRESHOLD
      ? { ...best, matchType: "BENZERLIK" }
      : null;
  }

  private getProductDisplayName(product: any) {
    return this.cleanText(product?.urunAdi || product?.ticariAdi || "");
  }

  private getProductCode(product: any) {
    return this.cleanText(
      product?.productCode ||
        product?.urunKodu ||
        product?.stokKodu ||
        product?.kod ||
        "",
    );
  }

  private normalizePackageText(value: any) {
    return this.cleanText(value).toLocaleUpperCase("tr-TR");
  }

  private normalizeLotRow(row: any): UrunLotRow {
    const now = this.nowIso();
    const miktar = this.parseAmount(row?.miktar);
    const kalanMiktarRaw = this.parseAmount(row?.kalanMiktar);
    return {
      id: this.cleanText(
        row?.id ||
          `lot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ),
      lotNo: this.cleanText(row?.lotNo || row?.lot),
      girisTarihi: this.normalizeDateInput(
        row?.girisTarihi || row?.belgeTarihi || this.today(),
        "Lot giriÅŸ tarihi",
        true,
      ),
      tedarikciFirma: this.cleanText(row?.tedarikciFirma),
      belgeNo: this.cleanText(row?.belgeNo),
      belgeTarihi: this.normalizeOptionalDateInput(
        row?.belgeTarihi,
        "Lot belge tarihi",
      ),
      miktar,
      kalanMiktar: kalanMiktarRaw > 0 ? kalanMiktarRaw : miktar,
      ambalaj: this.normalizePackageText(row?.ambalaj),
      not: this.cleanText(row?.not),
      createdAt: this.cleanText(row?.createdAt || now),
      updatedAt: now,
    };
  }

  private normalizeUsageRow(row: any): LotKullanimRow {
    return {
      id: this.cleanText(
        row?.id ||
          `use-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ),
      urunId: row?.urunId || "",
      lotNo: this.cleanText(row?.lotNo),
      kullanilanMiktar: this.parseAmount(row?.kullanilanMiktar),
      kullanimTarihi: this.normalizeDateInput(
        row?.kullanimTarihi || this.today(),
        "KullanÄ±m tarihi",
        true,
      ),
      bagliModelKaydiId: this.cleanText(row?.bagliModelKaydiId),
    };
  }

  private normalizeUrunRow(row: any): NormalizedUrunRow {
    const varsayilanAmbalaj = this.normalizePackageText(
      row?.varsayilanAmbalaj || row?.ambalaj,
    );
    const ambalajVaryantlari = Array.from(
      new Set(
        [
          varsayilanAmbalaj,
          ...(Array.isArray(row?.ambalajVaryantlari)
            ? row.ambalajVaryantlari.map((item: any) =>
                this.normalizePackageText(item),
              )
            : []),
        ].filter(Boolean),
      ),
    );
    const lotKayitlari = Array.isArray(row?.lotKayitlari)
      ? row.lotKayitlari.map((item: any) => this.normalizeLotRow(item))
      : row?.lot || row?.ambalaj
        ? [
            this.normalizeLotRow({
              lotNo: row?.lot,
              ambalaj: row?.ambalaj,
              miktar: 0,
              kalanMiktar: 0,
            }),
          ].filter((item) => item.lotNo || item.ambalaj)
        : [];

    return {
      id: Number(row?.id) || this.nextId(),
      urunAdi: this.cleanText(row?.urunAdi),
      ticariAdi: this.cleanText(row?.ticariAdi),
      kategori: this.cleanText(row?.kategori) || "Genel",
      birim: this.cleanText(row?.birim) || "ADET",
      bagliFirmaId:
        row?.bagliFirmaId !== undefined && row?.bagliFirmaId !== null
          ? Number(row?.bagliFirmaId) || this.cleanText(row?.bagliFirmaId)
          : "",
      bagliFirma: this.cleanText(row?.bagliFirma),
      durum: this.normalizeProductStatus(row?.durum, row?.aktif !== false),
      varsayilanAmbalaj,
      ambalaj: varsayilanAmbalaj,
      not: this.cleanText(row?.not),
      aktif: row?.aktif !== false,
      ambalajVaryantlari,
      lotKayitlari,
      kullanilanLotlar: Array.isArray(row?.kullanilanLotlar)
        ? row.kullanilanLotlar.map((item: any) => this.normalizeUsageRow(item))
        : [],
      modelBazliHammaddeKullanimi: Array.isArray(
        row?.modelBazliHammaddeKullanimi,
      )
        ? row.modelBazliHammaddeKullanimi.map((item: any) =>
            this.normalizeUsageRow(item),
          )
        : [],
      lot: this.cleanText(row?.lot),
    };
  }

  private extractLotCandidate(value: any) {
    const text = this.cleanText(value);
    if (!text) return "";
    const match =
      text.match(
        /\b(?:LOT|PARTI|PARTÄ°|SERI|SERÄ°)[:\s-]*([A-Z0-9./_-]{3,})\b/i,
      ) || text.match(/\bL[:\s-]*([A-Z0-9./_-]{3,})\b/i);
    return this.cleanText(match?.[1] || "");
  }

  private extractPackageCandidate(value: any) {
    const text = this.cleanText(value);
    if (!text) return "";
    const match = text.match(
      /\b(\d+(?:[.,]\d+)?)\s*(KG|GR|G|LT|L|ML|ADET|TOP|KOVA|VARIL)\b/i,
    );
    if (!match) return "";
    return this.normalizePackageText(`${match[1]} ${match[2]}`);
  }

  private buildProductReference(product: any) {
    if (!product) return null;
    const stockInfo =
      product?.stok ??
      product?.stokMiktari ??
      product?.envanter ??
      product?.inventory ??
      null;
    const rawPrice =
      product?.fiyat ??
      product?.defaultPrice ??
      product?.alisFiyati ??
      product?.satisFiyati ??
      null;
    const referencePrice =
      rawPrice === null || rawPrice === undefined
        ? null
        : this.parseAmount(rawPrice);

    return {
      productId: Number(product?.id || 0) || "",
      productName: this.getProductDisplayName(product),
      productCode: this.getProductCode(product),
      defaultUnit: this.cleanText(product?.birim || product?.defaultUnit),
      packaging: this.cleanText(
        product?.varsayilanAmbalaj || product?.ambalaj || "",
      ),
      stockInfo,
      referencePrice,
    };
  }

  private findMatchingProduct(
    rawDescription: any,
    explicitProductId?: any,
    explicitProductName?: any,
  ) {
    const products = this.getUrunler() as any[];
    const source = this.buildLookupProfile(
      explicitProductName || rawDescription,
      "product",
    );
    const explicitId = Number(explicitProductId || 0);
    if (explicitId) {
      const explicit = products.find((item) => Number(item.id) === explicitId);
      if (explicit) {
        return {
          row: explicit,
          confidence: 1,
          normalizedSource: source.normalized,
          matchType: "KULLANICI_SECIMI",
        };
      }
    }

    if (!source.compact) return null;

    const exact = products.find((item) => {
      const candidates = [item?.urunAdi, item?.ticariAdi]
        .map((name) => this.cleanText(name))
        .filter(Boolean);
      return candidates.some(
        (candidate) =>
          this.productCardKey(candidate) ===
          this.productCardKey(explicitProductName || rawDescription),
      );
    });
    if (exact) {
      return {
        row: exact,
        confidence: 1,
        normalizedSource: source.normalized,
        matchType: "BIREBIR",
      };
    }

    let normalizedBest: {
      row: any;
      confidence: number;
      normalizedSource: string;
    } | null = null;
    for (const item of products) {
      const candidates = [item?.urunAdi, item?.ticariAdi]
        .map((name) => this.cleanText(name))
        .filter(Boolean);
      for (const candidateName of candidates) {
        const target = this.buildLookupProfile(candidateName, "product");
        const score = this.scoreLookupMatch(source, target);
        if (!normalizedBest || score > normalizedBest.confidence) {
          normalizedBest = {
            row: item,
            confidence: score,
            normalizedSource: source.normalized,
          };
        }
      }
    }
    if (normalizedBest && normalizedBest.confidence >= 0.98) {
      return {
        ...normalizedBest,
        matchType: "NORMALIZE",
      };
    }

    if (this.hasInactiveProductAlias(rawDescription)) {
      return null;
    }
    const alias = this.findProductAlias(rawDescription);
    if (alias?.matchedProductId) {
      const matchedById = products.find(
        (item) => Number(item.id) === Number(alias.matchedProductId),
      );
      if (matchedById) {
        return {
          row: matchedById,
          confidence: 1,
          normalizedSource: source.normalized,
          aliasMatched: true,
          matchType: "ADMIN_ESLEME",
        };
      }
    }
    if (alias?.matchedProductName) {
      const matchedByName = products.find((item) => {
        const name = this.getProductDisplayName(item);
        return (
          this.aliasKey(name, "product") ===
          this.aliasKey(alias.matchedProductName, "product")
        );
      });
      if (matchedByName) {
        return {
          row: matchedByName,
          confidence: 0.99,
          normalizedSource: source.normalized,
          aliasMatched: true,
          matchType: "ADMIN_ESLEME",
        };
      }
    }

    let best: {
      row: any;
      confidence: number;
      normalizedSource: string;
    } | null = null;

    for (const item of products) {
      const candidates = [item?.urunAdi, item?.ticariAdi]
        .map((name) => this.cleanText(name))
        .filter(Boolean);
      if (!candidates.length) continue;

      for (const candidateName of candidates) {
        const target = this.buildLookupProfile(candidateName, "product");
        const score = this.scoreLookupMatch(source, target);
        if (!best || score > best.confidence) {
          best = {
            row: item,
            confidence: score,
            normalizedSource: source.normalized,
          };
        }
      }
    }

    return best && best.confidence >= this.PRODUCT_MATCH_THRESHOLD
      ? {
          ...best,
          matchType: "BENZERLIK",
        }
      : null;
  }

  public enrichDocumentMatches(raw: any) {
    const aliasAlreadyApplied = Boolean(raw?._aliasApplied);
    const header =
      raw?.header && typeof raw.header === "object" ? raw.header : {};
    const rawDetectedCompanyName = this.cleanText(
      raw?.rawDetectedCompanyName ||
        raw?.matchedCompanyName ||
        raw?.firma ||
        header?.companyName,
    );
    const companyMatch = this.findMatchingCompany(
      rawDetectedCompanyName,
      raw?.matchedCompanyId,
    );
    const companyName = this.cleanText(
      companyMatch?.row?.firma || raw?.matchedCompanyName,
    );
    const selectedFirma = this.cleanText(raw?.firma);
    const effectiveFirma = companyName || selectedFirma;
    const companyMatchType = this.cleanText(
      (companyMatch as any)?.matchType || "KULLANICI_ONAYI",
    );
    const normalizedRawCompanyName = this.aliasKey(
      rawDetectedCompanyName,
      "company",
    );

    if (!aliasAlreadyApplied && companyMatch?.row) {
      this.upsertCompanyAlias({
        rawName: rawDetectedCompanyName,
        matchedCompanyId: companyMatch.row.id,
        matchedCompanyName: companyMatch.row.firma,
        sourceType: this.cleanText(raw?.sourceType || raw?.fileType || "BELGE"),
      });
    }

    const sourceItems = Array.isArray(raw?.parsedItems)
      ? raw.parsedItems
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

    const items = sourceItems.map((item: any, idx: number) => {
      const rawDescription = this.cleanText(
        item?.rawDescription ||
          item?.description ||
          item?.aciklama ||
          item?.name,
      );
      const productMatch = this.findMatchingProduct(
        rawDescription,
        item?.matchedProductId,
        item?.matchedProductName,
      );
      const reference = this.buildProductReference(
        productMatch?.row || item?.productReference,
      );
      const quantity = this.parseAmount(item?.quantity ?? item?.miktar);
      const quantity2 = this.parseAmount(item?.quantity2 ?? item?.kg);
      const unit = this.cleanText(
        item?.unit || item?.birim || reference?.defaultUnit || "ADET",
      );
      const unit2 = this.cleanText(item?.unit2 || item?.birim2);
      const unitPrice = this.parseAmount(item?.unitPrice ?? item?.birimFiyat);
      const lineTotal = this.parseAmount(item?.lineTotal ?? item?.tutar);
      const discountRate = this.parseAmount(
        item?.discountRate ?? item?.iskontoOrani,
      );
      const discountAmount = this.parseAmount(
        item?.discountAmount ?? item?.iskontoTutari,
      );
      const kdvRate = this.parseAmount(item?.kdvRate ?? item?.kdvOrani);
      const kdvAmount = this.parseAmount(item?.kdvAmount ?? item?.kdvTutari);
      const confidence = Number(
        item?.confidence ?? item?.matchConfidence ?? 0.7,
      );
      const matchedProductName = this.cleanText(
        productMatch?.row
          ? this.getProductDisplayName(productMatch.row)
          : item?.matchedProductName,
      );
      const matchedProductCode = this.cleanText(
        productMatch?.row
          ? this.getProductCode(productMatch.row)
          : item?.matchedProductCode || item?.productCode || item?.urunKodu,
      );
      const matchConfidence = Number(
        (
          productMatch?.confidence ?? Number(item?.matchConfidence || 0)
        ).toFixed(3),
      );
      const productMatchType = this.cleanText(
        (productMatch as any)?.matchType || "KULLANICI_ONAYI",
      );
      const matchWarning = matchedProductName
        ? ""
        : "KayÄ±tlÄ± Ã¼rÃ¼n eÅŸleÅŸmesi bulunamadÄ±";
      const expenseLike = this.isExpenseLikeItem(rawDescription);
      const eslesmeTipi = matchedProductName
        ? productMatchType
        : expenseLike
          ? "GIDER_HIZMET"
          : "KULLANICI_ONAYI";

      const manualSource =
        String(raw?.sourceType || item?.sourceType || "")
          .toLocaleUpperCase("tr-TR")
          .includes("MANUEL") ||
        String(raw?.intakeMethod || "")
          .toLocaleLowerCase("tr-TR")
          .includes("manual");
      const kaynak =
        matchedProductName && productMatchType === "ADMIN_ESLEME"
          ? "admin_esleme"
          : manualSource
            ? "manuel"
            : "parse";

      if (!aliasAlreadyApplied && matchedProductName) {
        this.upsertProductAlias({
          rawName: rawDescription,
          matchedProductId: productMatch?.row?.id || item?.matchedProductId,
          matchedProductName,
          matchedProductCode,
          sourceType: this.cleanText(
            raw?.sourceType || raw?.fileType || "BELGE",
          ),
        });
      }

      return {
        ...item,
        id: String(item?.id || `item_${idx + 1}`),
        description: rawDescription,
        rawDescription,
        hamKalemMetni: this.cleanText(
          item?.hamKalemMetni || item?.orijinalKalemMetni || rawDescription,
        ),
        orijinalKalemMetni: rawDescription,
        normalizedDescription: this.buildLookupProfile(
          rawDescription,
          "product",
        ).normalized,
        normalizedRawName: this.aliasKey(rawDescription, "product"),
        firmaId:
          companyMatch?.row?.id || raw?.matchedCompanyId || item?.firmaId || "",
        firmaAdi: companyName,
        urunId:
          productMatch?.row?.id || item?.urunId || item?.matchedProductId || "",
        urunAdi:
          matchedProductName ||
          this.cleanText(item?.urunAdi || item?.matchedProductName),
        matchedProductId: productMatch?.row?.id || item?.matchedProductId || "",
        matchedProductName,
        matchedProductCode,
        matchConfidence,
        eslesmeTipi,
        firmaEslesmeTipi: companyMatchType,
        urunEslesmeTipi: productMatchType,
        eslesenUrunId: productMatch?.row?.id || item?.matchedProductId || "",
        productReference: reference,
        productStatus: matchedProductName
          ? "ESLESTI"
          : expenseLike
            ? "GIDER_HIZMET"
            : "ESLESME_BEKLIYOR",
        matchWarning: expenseLike
          ? "Gider/Hizmet kalemi olarak bÄ±rakÄ±labilir"
          : matchWarning,
        productCode: matchedProductCode,
        ambalaj: this.normalizePackageText(
          item?.ambalaj ||
            item?.paket ||
            item?.packaging ||
            reference?.packaging ||
            this.extractPackageCandidate(rawDescription),
        ),
        lotNo: this.cleanText(
          item?.lotNo || item?.lot || this.extractLotCandidate(rawDescription),
        ),
        quantity,
        quantity2,
        unit,
        unit2,
        unitPrice,
        lineTotal,
        discountRate,
        discountAmount,
        kdvRate,
        kdvAmount,
        confidence: Number.isFinite(confidence) ? confidence : 0.7,
        needsReview:
          Boolean(item?.needsReview) ||
          !matchedProductName ||
          confidence < 0.75,
        sourceProfile: this.cleanText(
          item?.sourceProfile || raw?.detectedProfile,
        ),
        aciklama: rawDescription,
        miktar: quantity,
        kg: quantity2,
        birim: unit,
        birim2: unit2,
        birimFiyat: unitPrice,
        tutar: lineTotal,
        kdvOrani: kdvRate,
        kdvTutari: kdvAmount,
        kaynak,
        modelAdayi:
          this.cleanText(item?.modelAdayi) ||
          this.extractModelCandidate(rawDescription),
      };
    });

    const warnings = Array.isArray(raw?.warnings)
      ? raw.warnings.map((item: any) => this.cleanText(item)).filter(Boolean)
      : [];
    if (items.some((item: any) => !item.matchedProductId)) {
      warnings.push("KayÄ±tlÄ± Ã¼rÃ¼n eÅŸleÅŸmesi bulunamadÄ±");
    }

    return {
      ...raw,
      _aliasApplied: true,
      firma: effectiveFirma,
      rawDetectedCompanyName,
      normalizedRawName: normalizedRawCompanyName,
      matchedCompanyId: companyMatch?.row?.id || raw?.matchedCompanyId || "",
      matchedCompanyName: companyName,
      firmaEslesmeTipi: companyMatchType,
      header: {
        ...header,
        companyName: companyName || this.cleanText(header?.companyName),
      },
      parsedItems: items,
      items,
      warnings: Array.from(new Set(warnings)),
      metrics: {
        ...(raw?.metrics || {}),
        matchedProductCount: items.filter((item: any) => item.matchedProductId)
          .length,
        unmatchedProductCount: items.filter(
          (item: any) => !item.matchedProductId,
        ).length,
        companyMatchConfidence: Number(companyMatch?.confidence || 0),
      },
    };
  }

  private firmaKey(value: string) {
    return this.cleanText(value).toLocaleUpperCase("tr-TR");
  }

  private parseAmount(value: any) {
    const parsed = this.parseAmountInternal(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private requireAmount(
    value: any,
    fieldLabel: string,
    options?: { allowZero?: boolean; allowNegative?: boolean },
  ) {
    const parsed = this.parseAmountInternal(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(
        `${fieldLabel} geÃ§erli sayÄ±sal formatta olmalÄ±dÄ±r.`,
      );
    }
    if (options?.allowNegative !== true && parsed < 0) {
      throw new BadRequestException(`${fieldLabel} negatif olamaz.`);
    }
    if (options?.allowZero !== true && parsed === 0) {
      throw new BadRequestException(`${fieldLabel} 0 olamaz.`);
    }
    return Number(parsed.toFixed(2));
  }

  private normalizeDateInput(value: any, fieldLabel: string, required = false) {
    const text = this.cleanText(value);
    if (!text) {
      if (required) {
        throw new BadRequestException(`${fieldLabel} zorunludur.`);
      }
      return "";
    }
    const compact = text.replace(/\s+/g, "");
    let year = "";
    let month = "";
    let day = "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
      [year, month, day] = compact.split("-");
    } else {
      const match = compact.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (match) {
        day = match[1];
        month = match[2];
        year = match[3];
      }
    }

    if (!year || !month || !day) {
      throw new BadRequestException(
        `${fieldLabel} formatÄ± geÃ§ersiz. Desteklenen formatlar: dd.MM.yyyy, dd-MM-yyyy, yyyy-MM-dd, dd/MM/yyyy.`,
      );
    }

    const normalized = `${year}-${month}-${day}`;
    const probe = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(probe.getTime()) ||
      probe.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException(
        `${fieldLabel} geÃ§erli bir tarih olmalÄ±dÄ±r.`,
      );
    }
    return normalized;
  }

  private normalizeOptionalDateInput(value: any, fieldLabel: string) {
    try {
      return this.normalizeDateInput(value, fieldLabel, false);
    } catch {
      return "";
    }
  }

  private requireEnum<T extends string>(
    value: any,
    fieldLabel: string,
    allowed: readonly T[],
    fallback?: T,
  ) {
    const normalized = this.cleanText(value).toLocaleUpperCase("tr-TR") as T;
    if (!normalized && fallback) return fallback;
    const found = allowed.find(
      (item) => this.cleanText(item).toLocaleUpperCase("tr-TR") === normalized,
    );
    if (!found) {
      throw new BadRequestException(
        `${fieldLabel} geÃ§ersiz. Ä°zin verilen deÄŸerler: ${allowed.join(", ")}.`,
      );
    }
    return found;
  }

  private normalizeDepartment(value: any) {
    return this.cleanText(value)
      .split(" ")
      .filter(Boolean)
      .map(
        (part) =>
          part.charAt(0).toLocaleUpperCase("tr-TR") +
          part.slice(1).toLocaleLowerCase("tr-TR"),
      )
      .join(" ");
  }

  private requireEmail(value: any, fieldLabel: string) {
    const email = this.cleanText(value).toLocaleLowerCase("tr-TR");
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      throw new BadRequestException(`${fieldLabel} formatÄ± geÃ§ersiz.`);
    }
    return email;
  }

  private buildDuplicateException(
    message: string,
    existingId?: number | string,
  ) {
    return new ConflictException({
      message,
      code: "DUPLICATE_RECORD",
      existingId: existingId ? String(existingId) : "",
    });
  }

  private buildDuplicateWarning(
    existingId?: number | string,
    message?: string,
  ) {
    return {
      code: "DUPLICATE_RECORD",
      existingId: existingId ? String(existingId) : "",
      message: message || "Benzer kayÄ±t zaten mevcut.",
    };
  }

  private getDocumentNeedsReviewState(payload: {
    warnings?: any[];
    metrics?: Record<string, any>;
    candidateRows?: any[];
    items?: any[];
    mode?: any;
  }) {
    const warnings = Array.isArray(payload.warnings)
      ? payload.warnings.filter(Boolean)
      : [];
    const candidateRows = Array.isArray(payload.candidateRows)
      ? payload.candidateRows.filter(Boolean)
      : [];
    const items = Array.isArray(payload.items) ? payload.items : [];
    const avgConfidence = Number(
      payload.metrics?.avgConfidence ?? payload.metrics?.confidenceAverage ?? 0,
    );
    const totalsMatch =
      payload.metrics?.totalsMatch !== undefined
        ? Boolean(payload.metrics?.totalsMatch)
        : Number(payload.metrics?.totalsDiff ?? 999) < 5;
    const needsReview =
      String(payload.mode || "")
        .toUpperCase()
        .includes("REVIEW") ||
      warnings.length > 0 ||
      candidateRows.length > 0 ||
      items.some((item) => Boolean(item?.needsReview)) ||
      (avgConfidence > 0 && avgConfidence < 0.75) ||
      !totalsMatch;

    return {
      needsReview,
      avgConfidence,
      totalsMatch,
      warningCount: warnings.length,
      candidateCount: candidateRows.length,
    };
  }

  private normalizePdfClass(value: any) {
    const text = this.cleanText(value).toUpperCase();
    const allowed = new Set([
      "FATURA",
      "IRSALIYE",
      "IRSALIYE_YERINE_GECEN_FATURA",
      "ALIS_GIDER_BELGESI",
      "DIGER_PDF_BELGE",
    ]);
    return allowed.has(text) ? text : "DIGER_PDF_BELGE";
  }

  private defaultWorkflowForClass(documentClass: string) {
    if (documentClass === "ALIS_GIDER_BELGESI") return "GIDER_BELGESI";
    if (documentClass === "FATURA") return "BIZIM_FATURA";
    if (documentClass === "IRSALIYE") return "GELEN_IRSALIYE";
    if (documentClass === "IRSALIYE_YERINE_GECEN_FATURA")
      return "GELEN_ALIS_FATURASI";
    return "GIDER_BELGESI";
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

  private flowTypeToWorkflow(flowType: string) {
    if (flowType === "GELEN_FATURA") return "GELEN_ALIS_FATURASI";
    if (flowType === "GELEN_IRSALIYE") return "GELEN_IRSALIYE";
    if (flowType === "GIDEN_FATURA") return "BIZIM_FATURA";
    if (flowType === "GIDEN_IRSALIYE") return "BIZIM_IRSALIYE";
    return "";
  }

  private flowTypeToDirectionAndType(flowType: string) {
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

  private folderByFlowType(flowType: string) {
    if (flowType === "GELEN_FATURA") return "gelen-fatura";
    if (flowType === "GELEN_IRSALIYE") return "gelen-irsaliye";
    if (flowType === "GIDEN_FATURA") return "giden-fatura";
    if (flowType === "GIDEN_IRSALIYE") return "giden-irsaliye";
    return "";
  }

  private slugifyPathPart(value: any) {
    return this.cleanText(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/Ä±/g, "i")
      .replace(/ÄŸ/g, "g")
      .replace(/Ã¼/g, "u")
      .replace(/ÅŸ/g, "s")
      .replace(/Ã¶/g, "o")
      .replace(/Ã§/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private extractModelCandidate(text: any) {
    const raw = this.cleanText(text);
    if (!raw) return "";
    const upper = raw.toLocaleUpperCase("tr-TR");
    if (upper.includes("TEST NUMUNESI") || upper.includes("TEST NUMUNESÄ°")) {
      return "";
    }
    const commaParts = raw
      .split(/[;,]/)
      .map((item) => this.cleanText(item))
      .filter(Boolean);
    if (commaParts.length >= 2) {
      const token = commaParts[1]
        .replace(/[^A-Za-z0-9]/g, "")
        .toLocaleUpperCase("tr-TR");
      if (token && /[A-Z]/.test(token) && !/^\d+$/.test(token)) return token;
    }
    const slashParts = raw
      .split("/")
      .map((item) => this.cleanText(item))
      .filter(Boolean);
    if (slashParts.length >= 2) {
      const token = slashParts[1]
        .replace(/[^A-Za-z0-9]/g, "")
        .toLocaleUpperCase("tr-TR");
      if (token && /[A-Z]/.test(token) && !/^\d+$/.test(token)) return token;
    }
    const token = raw
      .split(/\s+/)
      .map((item) =>
        item.replace(/[^A-Za-z0-9-]/g, "").toLocaleUpperCase("tr-TR"),
      )
      .find(
        (item) =>
          item.length >= 3 &&
          /[A-Z]/.test(item) &&
          !/^\d+$/.test(item) &&
          !/^(MAT|KARBON|LILA|MAVI|ADET|KG|TL|Y|NO)$/.test(item),
      );
    return token || "";
  }

  private isExpenseLikeItem(text: any) {
    const normalized = this.cleanText(text).toLocaleUpperCase("tr-TR");
    return ["YEMEK", "YOÄURT", "YOGURT", "HIZMET", "SERVIS", "SERVÄ°S"].some(
      (token) => normalized.includes(token),
    );
  }

  private isFakePdfItemRow(text: string) {
    const normalized = this.cleanText(text).toLocaleLowerCase("tr-TR");
    if (!normalized) return true;
    return this.PDF_FAKE_ROW_HINTS.some((token) => normalized.includes(token));
  }

  normalizePdfParseResult(raw: any, fallbackFileName = "") {
    const header =
      raw?.header && typeof raw.header === "object" ? raw.header : {};
    const parsedSeed = Array.isArray(raw?.parsedItems)
      ? raw.parsedItems
      : Array.isArray(raw?.items)
        ? raw.items
        : [];
    const sourceCandidates = Array.isArray(raw?.candidateRows)
      ? raw.candidateRows
      : Array.isArray(raw?.candidates)
        ? raw.candidates
        : [];

    const parsedItems = parsedSeed
      .map((item: any, idx: number) => {
        const description = this.cleanText(
          item?.description || item?.aciklama || item?.name,
        );
        const quantity = this.parseAmount(item?.quantity ?? item?.miktar);
        const unitPrice = this.parseAmount(item?.unitPrice ?? item?.birimFiyat);
        const lineTotal = this.parseAmount(item?.lineTotal ?? item?.tutar);
        const kdvRate = this.parseAmount(item?.kdvRate ?? item?.kdvOrani);
        const confidence = Number(item?.confidence ?? 0.7);
        return {
          id: String(item?.id || `item_${idx + 1}`),
          description,
          productCode: this.cleanText(item?.productCode || item?.urunKodu),
          lotNo: this.cleanText(item?.lotNo || item?.lot),
          quantity,
          quantity2: this.parseAmount(item?.quantity2),
          unit: this.cleanText(item?.unit || item?.birim),
          unit2: this.cleanText(item?.unit2),
          unitPrice,
          lineTotal,
          discountRate: this.parseAmount(item?.discountRate),
          discountAmount: this.parseAmount(item?.discountAmount),
          kdvRate,
          kdvAmount: this.parseAmount(item?.kdvAmount),
          confidence: Number.isFinite(confidence) ? confidence : 0.7,
          needsReview: Boolean(item?.needsReview) || confidence < 0.75,
          sourceProfile: this.cleanText(
            item?.sourceProfile || raw?.detectedProfile || "simple_single_row",
          ),
          modelAdayi:
            this.cleanText(item?.modelAdayi) ||
            this.extractModelCandidate(description),
        };
      })
      .filter((item: any) => !this.isFakePdfItemRow(item.description));

    const candidateRows = [
      ...parsedSeed.map((item: any, idx: number) => {
        const text = this.cleanText(
          item?.description || item?.aciklama || item?.rawText || "",
        );
        const detectedNumbers = [
          this.parseAmount(item?.quantity ?? item?.miktar),
          this.parseAmount(item?.unitPrice ?? item?.birimFiyat),
          this.parseAmount(item?.lineTotal ?? item?.tutar),
        ].filter((n) => Number.isFinite(n) && n !== 0);
        const rejectReason = this.isFakePdfItemRow(text)
          ? "sahte_satir_filtre"
          : "";
        return {
          id: String(item?.id || `cand_${idx + 1}`),
          rawText: text,
          normalizedText: text.toLocaleLowerCase("tr-TR"),
          score: Number(item?.score ?? item?.confidence ?? 0.6),
          detectedNumbers,
          detectedUnit: this.cleanText(item?.unit || item?.birim),
          looksLikeItem: !rejectReason,
          rejectReason,
        };
      }),
      ...sourceCandidates.map((item: any, idx: number) => ({
        id: String(item?.id || `rawcand_${idx + 1}`),
        rawText: this.cleanText(item?.rawText || item?.text || ""),
        normalizedText: this.cleanText(
          item?.normalizedText || item?.text || "",
        ).toLocaleLowerCase("tr-TR"),
        score: Number(item?.score ?? 0.5),
        detectedNumbers: Array.isArray(item?.detectedNumbers)
          ? item.detectedNumbers.map((x: any) => this.parseAmount(x))
          : [],
        detectedUnit: this.cleanText(item?.detectedUnit),
        looksLikeItem: Boolean(item?.looksLikeItem),
        rejectReason: this.cleanText(item?.rejectReason),
      })),
    ];

    const warnings = Array.isArray(raw?.warnings)
      ? raw.warnings.map((x: any) => this.cleanText(x)).filter(Boolean)
      : [];

    const metrics = {
      itemCount: parsedItems.length,
      candidateCount: candidateRows.length,
      lowConfidenceCount: parsedItems.filter((x: any) => x.confidence < 0.75)
        .length,
      fakeRowCount: candidateRows.filter(
        (x: any) => x.rejectReason === "sahte_satir_filtre",
      ).length,
      ...(raw?.metrics || {}),
    };

    const grandTotal = this.parseAmount(header?.grandTotal ?? header?.toplam);
    const lineTotals = parsedItems.reduce(
      (acc: number, item: any) => acc + this.parseAmount(item.lineTotal),
      0,
    );
    const totalsDiff = Math.abs(Number((grandTotal - lineTotals).toFixed(2)));
    const avgConfidence = parsedItems.length
      ? parsedItems.reduce(
          (acc: number, item: any) => acc + Number(item.confidence || 0),
          0,
        ) / parsedItems.length
      : 0;
    const fakeRate = metrics.candidateCount
      ? metrics.fakeRowCount / metrics.candidateCount
      : 0;
    const mode =
      parsedItems.length > 0 &&
      totalsDiff < 5 &&
      avgConfidence >= 0.75 &&
      fakeRate < 0.35
        ? "AUTO_PARSE_MODE"
        : "CANDIDATE_REVIEW_MODE";

    const documentClass = this.normalizePdfClass(
      raw?.documentClass || raw?.classification || header?.documentClass,
    );
    const workflowType = this.cleanText(
      raw?.workflowType || this.defaultWorkflowForClass(documentClass),
    );
    const flowType =
      this.normalizeDocumentFlowType(raw?.flowType) ||
      this.normalizeDocumentFlowType(workflowType);
    return this.enrichDocumentMatches({
      fileName: this.cleanText(raw?.fileName || fallbackFileName),
      rawText: this.cleanText(raw?.rawText || ""),
      documentClass,
      workflowType,
      flowType,
      detectedProfile: this.cleanText(
        raw?.detectedProfile || "simple_single_row",
      ),
      parseSource: this.cleanText(raw?.parseSource || "text_layer_rule_based"),
      extractorUsed: this.cleanText(raw?.extractorUsed),
      ocrAttempted: Boolean(raw?.ocrAttempted),
      ocrAvailable: Boolean(raw?.ocrAvailable),
      ocrUsed: Boolean(raw?.ocrUsed),
      mode,
      header: {
        documentNo: this.cleanText(header?.documentNo),
        invoiceNo: this.cleanText(
          header?.invoiceNo || header?.faturaNo || header?.documentNo,
        ),
        date: this.cleanText(header?.date),
        invoiceDate: this.cleanText(header?.invoiceDate || header?.date),
        dueDate: this.cleanText(header?.dueDate),
        sellerName: this.cleanText(header?.sellerName || header?.companyName),
        buyerName: this.cleanText(header?.buyerName || header?.customerName),
        companyName: this.cleanText(header?.companyName),
        companyTaxNo: this.cleanText(header?.companyTaxNo),
        customerName: this.cleanText(header?.customerName),
        customerTaxNo: this.cleanText(header?.customerTaxNo),
        dispatchNo: this.cleanText(header?.dispatchNo),
        dispatchDate: this.cleanText(header?.dispatchDate),
        dispatchDocumentNo: this.cleanText(
          header?.dispatchDocumentNo || header?.dispatchNo,
        ),
        dispatchDocumentDate: this.cleanText(
          header?.dispatchDocumentDate || header?.dispatchDate,
        ),
        dispatchReferences: Array.isArray(header?.dispatchReferences)
          ? header.dispatchReferences
          : [],
        subtotal: this.parseAmount(header?.subtotal),
        kdv: this.parseAmount(header?.kdv),
        grandTotal: this.parseAmount(header?.grandTotal),
        currency: this.cleanText(header?.currency || "TRY"),
      },
      parsedItems,
      normalizedItems: Array.isArray(raw?.normalizedItems)
        ? raw.normalizedItems
        : parsedItems,
      candidateRows,
      rawLineCandidates: Array.isArray(raw?.rawLineCandidates)
        ? raw.rawLineCandidates
        : candidateRows,
      warnings,
      parseWarnings: Array.isArray(raw?.parseWarnings)
        ? raw.parseWarnings
        : warnings,
      metrics: {
        ...metrics,
        flowType,
        totalsDiff,
        avgConfidence: Number(avgConfidence.toFixed(3)),
      },
    });
  }

  private sameAmount(left: any, right: any) {
    return this.roundAmount(left) === this.roundAmount(right);
  }

  private dataFilePath(fileName: string) {
    return path.join(process.cwd(), "uploads", "kyerp-data", fileName);
  }

  private createFirmaImportBackup() {
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    const backupDir = path.resolve(
      process.cwd(),
      "..",
      "..",
      "backup",
      `firma-kartlari-import-${stamp}`,
    );
    fs.mkdirSync(backupDir, { recursive: true });
    const slug = this._ctxSlug;
    if (slug) {
      const mcDir = this.db.getMainCompanyDir(slug);
      const slugBackupDir = path.join(backupDir, slug);
      fs.mkdirSync(slugBackupDir, { recursive: true });
      for (const fileName of [
        this.mcFiles.firmaKartlari,
        this.mcFiles.hareketler,
      ]) {
        const source = path.join(mcDir, fileName);
        if (fs.existsSync(source))
          fs.copyFileSync(source, path.join(slugBackupDir, fileName));
      }
    } else {
      for (const fileName of [
        this.files.firmaKartlari,
        this.files.cariler,
        this.files.hareketler,
      ]) {
        const source = this.dataFilePath(fileName);
        if (fs.existsSync(source))
          fs.copyFileSync(source, path.join(backupDir, fileName));
      }
    }
    return backupDir;
  }

  private firmaKartSeed(): FirmaKartiRow[] {
    return [];
  }

  private cariSeed(): CariRow[] {
    return [];
  }

  private hareketSeed(): CariHareketRow[] {
    return [];
  }

  private urunSeed(): UrunRow[] {
    return [];
  }

  private epostaSeed(): EpostaKisiRow[] {
    return [];
  }

  private readRows<T>(fileName: string, fallback: T[]): T[] {
    return this.db.readStore<T[]>(fileName, fallback);
  }

  private writeRows<T>(fileName: string, rows: T[]) {
    return this.db.writeStore(fileName, rows);
  }

  private requireCompanyScopedSlug() {
    const slug = this.cleanText(this._ctxSlug);
    if (!slug) {
      throw new BadRequestException(
        "Ana firma baÄŸlamÄ± olmadan legacy global muhasebe storage kullanÄ±lamaz.",
      );
    }
    return slug;
  }

  private removeFileIfExists(targetPath: string) {
    if (!targetPath || !fs.existsSync(targetPath)) return false;
    fs.unlinkSync(targetPath);
    return true;
  }

  private toAbsolutePathWithinWorkspace(relativePath: string) {
    const normalized = this.cleanText(relativePath).replace(/\\/g, "/");
    if (!normalized) return "";
    const absolutePath = path.resolve(process.cwd(), normalized);
    const workspaceRoot = path.resolve(process.cwd());
    if (
      absolutePath !== workspaceRoot &&
      !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)
    ) {
      return "";
    }
    return absolutePath;
  }

  private clearModelDocumentLinks(
    mainCompany: { slug: string; id: string; name: string },
    row: MuhasebeBelgeRow,
  ) {
    const modelKaydiId = this.cleanText(
      row.modelKaydiId || row.header?.modelKaydiId,
    );
    if (!modelKaydiId) return false;
    const linkedModel = this.modelStore.getById(
      mainCompany.slug,
      mainCompany.id,
      modelKaydiId,
    );
    if (!linkedModel) return false;
    const linkedToThisDocument =
      this.cleanText(linkedModel.gelenBelgeId) ===
        this.cleanText(row.documentId) ||
      this.cleanText(linkedModel.kaynakBelgeId) ===
        this.cleanText(row.documentId);
    if (!linkedToThisDocument) return false;
    this.modelStore.saveModel(mainCompany.slug, mainCompany.id, {
      ...linkedModel,
      gelenBelgeId: "",
      kaynakBelgeId: "",
      gelenBelgePdf: "",
    });
    return true;
  }

  private getDocumentRelationSummary(row: MuhasebeBelgeRow) {
    const documentId = this.cleanText(row.documentId);
    const modelKaydiId = this.cleanText(
      row.modelKaydiId || row.header?.modelKaydiId,
    );
    const sameModelDocuments = modelKaydiId
      ? this.getBelgeRaw().filter(
          (item) =>
            item.documentId !== documentId &&
            this.cleanText(item.modelKaydiId || item.header?.modelKaydiId) ===
              modelKaydiId,
        )
      : [];
    const linkedCariMovement = this.getHareketRaw().find(
      (item) =>
        item.sourceType === "ALIS_GIDER_BELGE" &&
        this.cleanText(item.belge) === documentId,
    );
    return {
      bagliKayitVar: Boolean(
        modelKaydiId || sameModelDocuments.length || linkedCariMovement,
      ),
      modelKaydiVar: Boolean(modelKaydiId),
      ayniModeleBagliBelgeSayisi: sameModelDocuments.length,
      cariHareketVar: Boolean(linkedCariMovement),
      modelKaydiId,
    };
  }

  private getFirmaKartRaw(): FirmaKartiRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<FirmaKartiRow[]>(
      s,
      this.mcFiles.firmaKartlari,
      this.firmaKartSeed(),
    );
  }

  private saveFirmaKartRaw(rows: FirmaKartiRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.firmaKartlari, rows);
    return rows;
  }

  private getCariRaw(): CariRow[] {
    const s = this._ctxSlug;
    if (s) return [];
    return this.readRows<CariRow>(this.files.cariler, this.cariSeed());
  }

  private saveCariRaw(rows: CariRow[]) {
    const s = this._ctxSlug;
    if (s) return rows;
    return this.writeRows(this.files.cariler, rows);
  }

  private getHareketRaw(): CariHareketRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db
      .readMainCompanyStore<
        any[]
      >(s, this.mcFiles.hareketler, this.hareketSeed())
      .map((row) => this.normalizeCariMovementRow(row));
  }

  private normalizeCariMovementRow(row: any): CariHareketRow {
    const firma = this.cleanText(
      row?.firma || row?.companyName || row?.company,
    );
    const tarih = this.cleanText(
      row?.tarih || row?.date || row?.createdAt || this.today(),
    ).slice(0, 10);
    const sourceType = this.cleanText(
      row?.sourceType || row?.source || "MANUAL",
    );
    const rawType = this.cleanText(
      row?.islemTipi || row?.type,
    ).toLocaleUpperCase("tr-TR");
    const isPayment =
      rawType === "ODEME" || sourceType.toLocaleUpperCase("tr-TR") === "ODEME";
    const amount = this.roundAmount(
      Math.abs(
        this.parseAmount(
          row?.tutar ?? row?.amount ?? row?.credit ?? row?.debit ?? row?.total,
        ),
      ),
    );
    const explicitEffect = this.parseAmount(row?.etkisi);
    const hasExplicitEffect =
      row?.etkisi !== undefined &&
      row?.etkisi !== null &&
      this.cleanText(row?.etkisi) !== "";
    return {
      ...row,
      id: row?.id || this.nextId(),
      firma,
      tarih,
      islemTipi: isPayment ? "ODEME" : "BAKIYE",
      aciklama: this.cleanText(row?.aciklama || row?.description || row?.notes),
      tutar: amount,
      etkisi: this.roundAmount(
        hasExplicitEffect ? explicitEffect : isPayment ? -amount : amount,
      ),
      bakiye: this.parseAmount(row?.bakiye),
      belge: this.cleanText(
        row?.belge || row?.documentNo || row?.documentNumber,
      ),
      sourceType,
      resmiDurum: row?.resmiDurum === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI",
      odemeSozuTarihi: this.cleanText(row?.odemeSozuTarihi),
      hatirlatmaTarihi: this.cleanText(row?.hatirlatmaTarihi),
      takipNotu: this.cleanText(row?.takipNotu),
      createdAt: row?.createdAt || this.nowIso(),
      updatedAt: row?.updatedAt || row?.createdAt || this.nowIso(),
    } as CariHareketRow;
  }

  private saveHareketRaw(rows: CariHareketRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.hareketler, rows);
    return rows;
  }

  private getBelgeRaw(): MuhasebeBelgeRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<MuhasebeBelgeRow[]>(
      s,
      this.mcFiles.belgeler,
      [],
    );
  }

  private saveBelgeRaw(rows: MuhasebeBelgeRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.belgeler, rows);
    return rows;
  }

  private getActivityLogRaw(): ActivityLogRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<ActivityLogRow[]>(
      s,
      this.mcFiles.activityLogs,
      [],
    );
  }

  private saveActivityLogRaw(rows: ActivityLogRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.activityLogs, rows);
    return rows;
  }

  getActivityLogs(limit = 100) {
    return this.getActivityLogRaw().slice(0, Math.max(1, Number(limit) || 100));
  }

  private summarizeForLog(value: any) {
    if (!value || typeof value !== "object") return value;
    const summary: Record<string, any> = {};
    const keys = [
      "id",
      "documentId",
      "firma",
      "tarih",
      "islemTipi",
      "aciklama",
      "tutar",
      "etkisi",
      "bakiye",
      "status",
      "sourceType",
      "belge",
      "updatedAt",
      "createdAt",
      "rawDetectedCompanyName",
      "matchedCompanyName",
      "matchedCompanyId",
    ];
    for (const key of keys) {
      if (value[key] !== undefined) summary[key] = value[key];
    }
    if (value.header) {
      summary.header = {
        documentNo: value.header.documentNo,
        date: value.header.date,
        grandTotal: value.header.grandTotal,
      };
    }
    if (Array.isArray(value.items)) {
      summary.itemCount = value.items.length;
    }
    return summary;
  }

  private addActivityLog(
    payload: Partial<ActivityLogRow> & Record<string, any>,
  ) {
    const now = this.nowIso();
    const rows = this.getActivityLogRaw();
    const mainCompany = this.getCurrentMainCompany();
    const row: ActivityLogRow = {
      id: this.nextId(),
      entityType: this.cleanText(payload.entityType) || "unknown",
      entityId: this.cleanText(payload.entityId),
      actionType: this.cleanText(payload.actionType) || "UPDATED",
      title: this.cleanText(payload.title),
      description: this.cleanText(payload.description),
      oldValue: this.summarizeForLog(payload.oldValue),
      newValue: this.summarizeForLog(payload.newValue),
      source: this.cleanText(payload.source) || "MUHASEBE",
      actor: this.cleanText(payload.actor) || "system",
      mainCompanyId: this.cleanText(payload.mainCompanyId || mainCompany?.id),
      mainCompanySlug: this.cleanText(
        payload.mainCompanySlug || mainCompany?.slug,
      ),
      mainCompanyName: this.cleanText(
        payload.mainCompanyName || mainCompany?.name,
      ),
      recordName: this.cleanText(payload.recordName),
      createdAt: now,
    };
    rows.unshift(row);
    this.saveActivityLogRaw(rows);
    return row;
  }

  private getUrunRaw(): UrunRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<UrunRow[]>(
      s,
      this.mcFiles.urunler,
      this.urunSeed(),
    );
  }

  private saveUrunRaw(rows: UrunRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.urunler, rows);
    return rows;
  }

  private getProductDocumentRaw(): ProductDocumentRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db
      .readMainCompanyStore<
        ProductDocumentRow[]
      >(s, this.mcFiles.productDocuments, [])
      .map((item) => this.normalizeProductDocumentRow(item));
  }

  private saveProductDocumentRaw(rows: ProductDocumentRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(
      s,
      this.mcFiles.productDocuments,
      rows.map((item) => this.normalizeProductDocumentRow(item)),
    );
    return rows;
  }

  private getNormalizedUrunRows(): NormalizedUrunRow[] {
    return this.getUrunRaw().map((item) => this.normalizeUrunRow(item));
  }

  private getOdemeRaw(): OdemeRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<OdemeRow[]>(
      s,
      this.mcFiles.odemeler,
      [],
    );
  }

  private odemeTurleriSeed(): PaymentTypeRow[] {
    const now = this.nowIso();
    return [
      { id: 1, ad: "Nakit", aktif: true, createdAt: now, updatedAt: now },
      { id: 2, ad: "Banka", aktif: true, createdAt: now, updatedAt: now },
      {
        id: 3,
        ad: "Kredi KartÄ±",
        aktif: true,
        createdAt: now,
        updatedAt: now,
      },
      { id: 4, ad: "Ã‡ek", aktif: true, createdAt: now, updatedAt: now },
      { id: 5, ad: "Elden", aktif: true, createdAt: now, updatedAt: now },
      {
        id: 6,
        ad: "Havale / EFT",
        aktif: true,
        createdAt: now,
        updatedAt: now,
      },
      { id: 7, ad: "Mahsup", aktif: true, createdAt: now, updatedAt: now },
      { id: 8, ad: "DiÄŸer", aktif: true, createdAt: now, updatedAt: now },
    ];
  }

  private getOdemeTurleriRaw(): PaymentTypeRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<PaymentTypeRow[]>(
      s,
      this.mcFiles.odemeTurleri,
      this.odemeTurleriSeed(),
    );
  }

  private saveOdemeTurleriRaw(rows: PaymentTypeRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.odemeTurleri, rows);
    return rows;
  }

  private saveOdemeRaw(rows: OdemeRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.odemeler, rows);
    return rows;
  }

  private getCekRaw(): CekRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<CekRow[]>(s, this.mcFiles.cekler, []);
  }

  private saveCekRaw(rows: CekRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.cekler, rows);
    return rows;
  }

  private getKrediKartiRaw(): KrediKartiRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<KrediKartiRow[]>(
      s,
      this.mcFiles.krediKartlari,
      [],
    );
  }

  private saveKrediKartiRaw(rows: KrediKartiRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.krediKartlari, rows);
    return rows;
  }

  private getEpostaKisiRaw(): EpostaKisiRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<EpostaKisiRow[]>(
      s,
      this.mcFiles.epostaKisileri,
      this.epostaSeed(),
    );
  }

  private saveEpostaKisiRaw(rows: EpostaKisiRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.epostaKisileri, rows);
    return rows;
  }

  // â”€â”€â”€ KDV DÃ¶nem KayÄ±tlarÄ± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private getVatPeriodsRaw(): VatPeriodRow[] {
    const s = this.requireCompanyScopedSlug();
    return this.db.readMainCompanyStore<VatPeriodRow[]>(
      s,
      this.mcFiles.vatPeriods,
      [],
    );
  }

  private saveVatPeriodsRaw(rows: VatPeriodRow[]) {
    const s = this.requireCompanyScopedSlug();
    this.db.writeMainCompanyStore(s, this.mcFiles.vatPeriods, rows);
    return rows;
  }

  getVatPeriods(): VatPeriodRow[] {
    return this.getVatPeriodsRaw().sort((a, b) =>
      b.period.localeCompare(a.period),
    );
  }

  saveVatPeriod(payload: Partial<VatPeriodRow>): VatPeriodRow {
    const current = this.requireCurrentMainCompany();
    const period = this.requireText(payload.period, "DÃ¶nem");
    const now = this.nowIso();
    const rows = this.getVatPeriodsRaw();
    const existing = rows.find((item) => item.period === period);
    const normalizedNote = this.cleanText(payload.note);
    const nextValues = {
      carriedVatFromPreviousMonth: this.parseAmount(
        payload.carriedVatFromPreviousMonth ??
          existing?.carriedVatFromPreviousMonth ??
          0,
      ),
      purchaseVatTotal: this.parseAmount(
        payload.purchaseVatTotal ?? existing?.purchaseVatTotal ?? 0,
      ),
      salesVatTotal: this.parseAmount(
        payload.salesVatTotal ?? existing?.salesVatTotal ?? 0,
      ),
      netVat: this.parseAmount(payload.netVat ?? existing?.netVat ?? 0),
      carriedVatToNextMonth: this.parseAmount(
        payload.carriedVatToNextMonth ?? existing?.carriedVatToNextMonth ?? 0,
      ),
    };

    if (existing) {
      existing.carriedVatFromPreviousMonth =
        nextValues.carriedVatFromPreviousMonth;
      existing.purchaseVatTotal = nextValues.purchaseVatTotal;
      existing.salesVatTotal = nextValues.salesVatTotal;
      existing.netVat = nextValues.netVat;
      existing.carriedVatToNextMonth = nextValues.carriedVatToNextMonth;
      if (payload.note !== undefined) existing.note = normalizedNote;
      existing.updatedAt = now;
      this.saveVatPeriodsRaw(rows);
      this.addActivityLog({
        entityType: "vat_period",
        entityId: existing.id,
        actionType: "UPDATED",
        title: "KDV dÃ¶nem kaydÄ± gÃ¼ncellendi",
        description: `${period} dÃ¶nemi KDV Ã¶zeti gÃ¼ncellendi`,
        oldValue: null,
        newValue: existing,
        source: "VAT_PERIOD",
        recordName: period,
      });
      return existing;
    }
    const next: VatPeriodRow = {
      id: `vp-${period}-${Date.now()}`,
      period,
      mainCompanyId: this.cleanText(payload.mainCompanyId || current.id),
      carriedVatFromPreviousMonth: nextValues.carriedVatFromPreviousMonth,
      purchaseVatTotal: nextValues.purchaseVatTotal,
      salesVatTotal: nextValues.salesVatTotal,
      netVat: nextValues.netVat,
      carriedVatToNextMonth: nextValues.carriedVatToNextMonth,
      note: normalizedNote,
      createdAt: now,
      updatedAt: now,
    };
    rows.unshift(next);
    this.saveVatPeriodsRaw(rows);
    this.addActivityLog({
      entityType: "vat_period",
      entityId: next.id,
      actionType: "CREATED",
      title: "KDV dÃ¶nem kaydÄ± oluÅŸturuldu",
      description: `${period} dÃ¶nemi KDV Ã¶zeti kaydedildi`,
      oldValue: null,
      newValue: next,
      source: "VAT_PERIOD",
      recordName: period,
    });
    return next;
  }

  private syncCariSummaries() {
    const cards = this.getFirmaKartRaw();
    const rawRows = this.getCariRaw();
    const hareketler = this.getHareketRaw();
    const rawByKey = new Map(
      rawRows.map((item) => [this.firmaKey(item.firma), item]),
    );
    const cardByKey = new Map(
      cards.map((item) => [this.firmaKey(item.firma), item]),
    );
    const summaryByKey = new Map<string, CariRow>();

    const ensureSummary = (firma: string, tip: FirmaTipi = "SATICI") => {
      const resolved = this.resolveCompanyAlias(firma);
      const cleanFirma = this.cleanText(resolved.cleanCompanyName || firma);
      if (!cleanFirma) return null;

      const key = this.firmaKey(cleanFirma);
      if (summaryByKey.has(key)) {
        const existing = summaryByKey.get(key) as any;
        if (
          resolved.matched &&
          resolved.rawName &&
          this.firmaKey(resolved.rawName) !== key
        ) {
          const rawNames = Array.isArray(existing.rawCompanyNames)
            ? existing.rawCompanyNames
            : [];
          if (!rawNames.includes(resolved.rawName)) {
            existing.rawCompanyNames = [...rawNames, resolved.rawName];
          }
          existing.aliasMatched = true;
        }
        return existing || null;
      }

      const card = cardByKey.get(key);
      const raw = rawByKey.get(key);
      const row: CariRow & Record<string, any> = {
        id: raw?.id || card?.id || this.nextId(),
        firma: card?.firma || raw?.firma || cleanFirma,
        tip: (card?.tip || raw?.tip || tip) as FirmaTipi,
        sonIslem: "",
        bakiye: 0,
        odenenToplam: 0,
      };
      if (
        resolved.matched &&
        resolved.rawName &&
        this.firmaKey(resolved.rawName) !== key
      ) {
        row.aliasMatched = true;
        row.rawCompanyNames = [resolved.rawName];
      }

      summaryByKey.set(key, row);
      return row;
    };

    for (const card of cards) ensureSummary(card.firma, card.tip);
    for (const raw of rawRows) ensureSummary(raw.firma, raw.tip);
    for (const hareket of hareketler) ensureSummary(hareket.firma);

    for (const hareket of hareketler) {
      const target = ensureSummary(hareket.firma);
      if (!target) continue;

      target.bakiye = this.roundAmount(
        Number(target.bakiye || 0) + Number(hareket.etkisi || 0),
      );
      if (hareket.islemTipi === "ODEME") {
        target.odenenToplam = this.roundAmount(
          Number(target.odenenToplam || 0) +
            Math.abs(Number(hareket.tutar || 0)),
        );
      }
      if (
        hareket.tarih &&
        (!target.sonIslem || hareket.tarih > target.sonIslem)
      ) {
        target.sonIslem = hareket.tarih;
      }
    }

    const rows = Array.from(summaryByKey.values()).map((row) => {
      const card = cardByKey.get(this.firmaKey(row.firma));
      const raw = rawByKey.get(this.firmaKey(row.firma));
      return {
        ...row,
        id: raw?.id || card?.id || row.id,
        tip: (card?.tip || raw?.tip || row.tip || "SATICI") as FirmaTipi,
        bakiye: this.roundAmount(row.bakiye),
        odenenToplam: this.roundAmount(row.odenenToplam),
      };
    });

    this.saveCariRaw(rows);
    return rows;
  }

  private createBalanceMovement(payload: {
    firma: string;
    tarih?: string;
    etki: number;
    aciklama?: string;
    sourceType: string;
    belge?: string;
    dedupeKey?: string;
  }) {
    const firma = this.cleanText(payload.firma);
    if (!firma) throw new Error("Firma zorunludur.");

    const etki = this.roundAmount(payload.etki);
    if (!etki) return { created: false, row: null };

    this.ensureFirmaCard(firma);
    this.ensureCariSummary(firma);

    const hareketler = this.getHareketRaw();
    if (payload.dedupeKey) {
      const existing = hareketler.find(
        (item) =>
          this.firmaKey(item.firma) === this.firmaKey(firma) &&
          item.sourceType === payload.sourceType &&
          item.belge === payload.dedupeKey,
      );
      if (existing) return { created: false, row: existing };
    }

    const cari = this.getCariler().find(
      (item) => this.firmaKey(item.firma) === this.firmaKey(firma),
    );
    const currentBalance = Number(cari?.bakiye || 0);
    const row: CariHareketRow = {
      id: this.nextId(),
      firma,
      tarih: payload.tarih || this.today(),
      islemTipi: "BAKIYE",
      aciklama: this.cleanText(payload.aciklama),
      tutar: this.roundAmount(Math.abs(etki)),
      etkisi: etki,
      bakiye: this.roundAmount(currentBalance + etki),
      belge:
        payload.dedupeKey ||
        this.cleanText(payload.belge) ||
        `${payload.sourceType}-${Date.now()}`,
      sourceType: payload.sourceType,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };

    hareketler.unshift(row);
    this.saveHareketRaw(hareketler);
    this.applyCariEffect(firma, row.tarih, etki, false);
    const actionType = payload.sourceType.includes("ACILIS")
      ? "OPENING_CREATED"
      : payload.sourceType.includes("DUZELTME")
        ? "BALANCE_ADJUSTED"
        : "CREATED";
    this.addActivityLog({
      entityType: "cari_movement",
      entityId: String(row.id),
      actionType,
      title:
        actionType === "OPENING_CREATED"
          ? "AÃ§Ä±lÄ±ÅŸ bakiyesi kaydedildi"
          : actionType === "BALANCE_ADJUSTED"
            ? "Bakiye dÃ¼zeltmesi kaydedildi"
            : "Cari hareket oluÅŸturuldu",
      description:
        actionType === "OPENING_CREATED"
          ? `${firma} iÃ§in aÃ§Ä±lÄ±ÅŸ bakiyesi hareketi oluÅŸturuldu`
          : actionType === "BALANCE_ADJUSTED"
            ? `${firma} iÃ§in bakiye dÃ¼zeltme hareketi oluÅŸturuldu`
            : `${firma} iÃ§in cari hareket oluÅŸturuldu`,
      oldValue: null,
      newValue: row,
      source: payload.sourceType,
    });
    return { created: true, row };
  }

  private ensureFirmaCard(firma: string, tip: FirmaTipi = "SATICI") {
    const normalizedName = this.cleanText(firma);
    if (!normalizedName) return null;

    const cards = this.getFirmaKartRaw();
    const key = this.companyCardKey(normalizedName);

    const aliasBeforeExact = this.findCompanyAlias(normalizedName);
    if (aliasBeforeExact && aliasBeforeExact.matchedCompanyId) {
      const matchedCard = cards.find(
        (item) => Number(item.id) === Number(aliasBeforeExact.matchedCompanyId),
      );
      if (matchedCard) {
        this.upsertCompanyAlias({
          rawName: normalizedName,
          matchedCompanyId: matchedCard.id,
          matchedCompanyName: matchedCard.firma,
          sourceType: aliasBeforeExact.sourceType || "AUTO_NORMALIZE",
          allowReactivate: true,
        });
        return matchedCard;
      }
    }

    // 1) Exact match by normalized key
    const found = cards.find((item) => this.companyCardKey(item.firma) === key);
    if (found) {
      // Create alias if raw name differs from stored name
      if (this.firmaKey(found.firma) !== this.firmaKey(normalizedName)) {
        this.upsertCompanyAlias({
          rawName: normalizedName,
          matchedCompanyId: found.id,
          matchedCompanyName: found.firma,
          sourceType: "AUTO_NORMALIZE",
        });
      }
      return found;
    }

    // 2) Check admin eÅŸleme table before creating new card
    // If there's an active alias for this raw name, use the matched company
    const alias = this.findCompanyAlias(normalizedName);
    if (alias && alias.matchedCompanyId) {
      const matchedCard = cards.find(
        (item) => Number(item.id) === Number(alias.matchedCompanyId),
      );
      if (matchedCard) {
        // Update alias hit count
        this.upsertCompanyAlias({
          rawName: normalizedName,
          matchedCompanyId: matchedCard.id,
          matchedCompanyName: matchedCard.firma,
          sourceType: alias.sourceType || "AUTO_NORMALIZE",
          allowReactivate: true,
        });
        return matchedCard;
      }
    }

    // 2.5) Similarity fallback: if raw value is very close to an existing
    // clean card, bind as alias instead of creating a new ham card.
    const source = this.buildLookupProfile(normalizedName, "company");
    let bestMatch: { row: FirmaKartiRow; score: number } | null = null;
    for (const item of cards) {
      const target = this.buildLookupProfile(item.firma, "company");
      const score = this.scoreLookupMatch(source, target);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { row: item, score };
      }
    }
    if (bestMatch && bestMatch.score >= this.COMPANY_MATCH_THRESHOLD) {
      this.upsertCompanyAlias({
        rawName: normalizedName,
        matchedCompanyId: bestMatch.row.id,
        matchedCompanyName: bestMatch.row.firma,
        sourceType: "AUTO_SIMILARITY",
      });
      return bestMatch.row;
    }

    // 3) Only create new card if no alias mapping exists
    const now = this.nowIso();
    const next: FirmaKartiRow = {
      id: this.nextId(),
      firma: normalizedName,
      tip,
      aktif: true,
      favori: false,
      not: "",
      vergiNo: "",
      eposta: "",
      telefon: "",
      sonIslem: "",
      createdAt: now,
      updatedAt: now,
    };
    cards.unshift(next);
    this.saveFirmaKartRaw(cards);
    return next;
  }

  private ensureCariSummary(firma: string, tip: FirmaTipi = "SATICI") {
    const normalizedName = this.cleanText(firma);
    if (!normalizedName) return null;
    this.ensureFirmaCard(normalizedName, tip);
    return (
      this.syncCariSummaries().find(
        (item) => this.firmaKey(item.firma) === this.firmaKey(normalizedName),
      ) || null
    );
  }

  private applyCariEffect(
    firma: string,
    tarih: string,
    etki: number,
    isOdeme: boolean,
  ) {
    const card = this.ensureFirmaCard(firma);
    if (card) {
      const cards = this.getFirmaKartRaw();
      const foundCard = cards.find((item) => item.id === card.id);
      if (foundCard) {
        foundCard.sonIslem = tarih;
        foundCard.updatedAt = this.nowIso();
        this.saveFirmaKartRaw(cards);
      }
    }

    this.syncCariSummaries();
  }

  private addBalanceAdjust(
    firma: string,
    hedefBakiye: number,
    tarih: string,
    aciklama: string,
    sourceType = "BAKIYE_DUZELTME",
  ) {
    const temizFirma = this.cleanText(firma);
    this.ensureFirmaCard(temizFirma);
    this.ensureCariSummary(temizFirma);
    const cari = this.getCariler().find(
      (item) => this.firmaKey(item.firma) === this.firmaKey(temizFirma),
    );
    const mevcut = Number(cari?.bakiye || 0);
    const fark = Number((Number(hedefBakiye || 0) - mevcut).toFixed(2));
    if (!fark) {
      return {
        changed: false,
        mevcutBakiye: mevcut,
        hedefBakiye: mevcut,
        fark: 0,
      };
    }

    const result = this.createBalanceMovement({
      firma: temizFirma,
      tarih,
      etki: fark,
      aciklama: this.cleanText(aciklama) || "Bakiye DÃ¼zeltme",
      sourceType,
    });

    if (result.created) {
      this.addActivityLog({
        entityType: "balance_adjustment",
        entityId: String(result.row?.id || ""),
        actionType: "BALANCE_TARGET_SET",
        title: "Toplam bakiye hedefe Ã§ekildi",
        description: `${temizFirma} iÃ§in toplam bakiye hedef deÄŸere getirildi`,
        oldValue: {
          firma: temizFirma,
          mevcutBakiye: mevcut,
        },
        newValue: {
          firma: temizFirma,
          hedefBakiye,
          fark,
          hareketId: result.row?.id,
        },
        source: sourceType,
      });
    }

    return {
      changed: Boolean(result.created),
      mevcutBakiye: mevcut,
      hedefBakiye,
      fark,
      hareket: result.row,
    };
  }

  private recalcCariBalancesForFirma(firma: string) {
    const key = this.firmaKey(firma);
    const hareketler = this.getHareketRaw();
    const targets = hareketler
      .filter(
        (row) => row?.isDeleted !== true && this.firmaKey(row.firma) === key,
      )
      .sort((a, b) => {
        if (a.tarih !== b.tarih) return a.tarih.localeCompare(b.tarih);
        return Number(a.id || 0) - Number(b.id || 0);
      });

    let running = 0;
    const now = this.nowIso();
    for (const row of targets) {
      const amount = Math.abs(this.parseAmount(row.tutar));
      const defaultEtki = row.islemTipi === "ODEME" ? -amount : amount;
      const etki = Number.isFinite(Number(row.etkisi))
        ? Number(row.etkisi)
        : defaultEtki;
      running = this.roundAmount(running + etki);
      row.tutar = this.roundAmount(amount);
      row.etkisi = this.roundAmount(etki);
      row.bakiye = running;
      row.updatedAt = row.updatedAt || now;
      row.createdAt = row.createdAt || now;
    }

    this.saveHareketRaw(hareketler);
    this.syncCariSummaries();
  }

  private renameCompanyReferences(oldName: string, newName: string) {
    if (this.firmaKey(oldName) === this.firmaKey(newName)) return;

    const updateFirmaField = (
      rows: Record<string, any>[],
      fields: string[],
    ) => {
      for (const row of rows) {
        for (const field of fields) {
          if (this.firmaKey(row[field]) === this.firmaKey(oldName))
            row[field] = newName;
        }
      }
    };

    const cariler = this.getCariRaw();
    updateFirmaField(cariler as any, ["firma"]);
    this.saveCariRaw(cariler);

    const hareketler = this.getHareketRaw();
    updateFirmaField(hareketler as any, ["firma"]);
    this.saveHareketRaw(hareketler);

    const odemeler = this.getOdemeRaw();
    updateFirmaField(odemeler as any, ["firma"]);
    this.saveOdemeRaw(odemeler);

    const cekler = this.getCekRaw();
    updateFirmaField(cekler as any, ["firma"]);
    this.saveCekRaw(cekler);

    const kartlar = this.getKrediKartiRaw();
    updateFirmaField(kartlar as any, ["firma"]);
    this.saveKrediKartiRaw(kartlar);

    const belgeler = this.getBelgeRaw();
    updateFirmaField(belgeler as any, ["firma"]);
    this.saveBelgeRaw(belgeler);

    const eposta = this.getEpostaKisiRaw();
    updateFirmaField(eposta as any, ["anaFirma", "gonderilenFirma"]);
    this.saveEpostaKisiRaw(eposta);
  }

  private parseImportedLines(rawText: string) {
    const warnings: string[] = [];
    const items: Array<{
      companyName: string;
      balance: number;
      rawLine: string;
      lineNumber: number;
    }> = [];

    String(rawText || "")
      .split(/\r?\n/)
      .forEach((rawLine, index) => {
        const line = String(rawLine || "").trim();
        if (!line) return;

        const match = line.match(
          /^(.*\S)\s+(-?(?:[0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+),[0-9]{2})\s*$/,
        );
        if (!match) {
          warnings.push(`SatÄ±r ${index + 1} Ã§Ã¶zÃ¼mlenemedi: ${line}`);
          return;
        }

        const companyName = this.cleanText(match[1]);
        if (!companyName) {
          warnings.push(`SatÄ±r ${index + 1} firma adÄ± iÃ§ermiyor: ${line}`);
          return;
        }

        items.push({
          companyName,
          balance: this.roundAmount(this.parseAmount(match[2])),
          rawLine: line,
          lineNumber: index + 1,
        });
      });

    return { items, warnings };
  }

  previewFirmaBakiyeleri(payload: {
    rawText?: string;
    mainCompanySlug?: string;
  }) {
    return this.withCtx(payload.mainCompanySlug, () =>
      this._previewFirmaBakiyeleri(payload),
    );
  }

  private _previewFirmaBakiyeleri(payload: { rawText?: string }) {
    const parsed = this.parseImportedLines(payload.rawText || "");
    const existingByKey = new Map(
      this.getFirmaKartlari().map((item) => [
        this.companyCardKey(item.firma),
        item,
      ]),
    );
    const items: FirmaImportPreviewItem[] = parsed.items.map((row) => {
      const existing = existingByKey.get(this.companyCardKey(row.companyName));
      const currentBalance = this.roundAmount(
        Number(existing?.mevcutBakiye || 0),
      );
      let action: FirmaImportPreviewItem["action"] = "new";

      if (existing) {
        action = this.sameAmount(currentBalance, row.balance)
          ? "existing"
          : "update";
      }

      return {
        companyName: row.companyName,
        balance: row.balance,
        exists: Boolean(existing),
        action,
        currentBalance,
      };
    });

    return {
      ok: true,
      createdCount: items.filter((item) => item.action === "new").length,
      updatedCount: items.filter((item) => item.action === "update").length,
      skippedCount: items.filter((item) => item.action === "existing").length,
      warnings: parsed.warnings,
      items,
    };
  }

  getFirmaKartlari(slug?: string) {
    return this.withCtx(slug, () => this._getFirmaKartlari());
  }

  private _getFirmaKartlari() {
    const cariler = this.getCariRaw();
    for (const cari of cariler) this.ensureFirmaCard(cari.firma, cari.tip);
    for (const hareket of this.getHareketRaw().filter(
      (row) => row?.isDeleted !== true,
    ))
      this.ensureFirmaCard(hareket.firma);

    const cards = this.getFirmaKartRaw();
    const activeAliases = this.getCompanyAliasesRaw().filter(
      (item) => item.isActive !== false && item.isDeleted !== true,
    );
    const aliasRawKeys = new Set(
      activeAliases
        .map((item) => {
          const rawKey = this.companyCardKey(item.rawName);
          const targetKey = this.companyCardKey(item.matchedCompanyName);
          return rawKey && rawKey !== targetKey ? rawKey : "";
        })
        .filter(Boolean),
    );
    const aliasesByTargetKey = new Map<string, CompanyAliasRow[]>();
    const aliasesByTargetId = new Map<string, CompanyAliasRow[]>();
    for (const alias of activeAliases) {
      const targetKey = this.companyCardKey(alias.matchedCompanyName);
      if (targetKey) {
        aliasesByTargetKey.set(targetKey, [
          ...(aliasesByTargetKey.get(targetKey) || []),
          alias,
        ]);
      }
      const targetId = this.cleanText(alias.matchedCompanyId);
      if (targetId) {
        aliasesByTargetId.set(targetId, [
          ...(aliasesByTargetId.get(targetId) || []),
          alias,
        ]);
      }
    }
    const uniqueByKey = new Map<string, FirmaKartiRow>();
    for (const item of cards) {
      if (item.hiddenFromMainList || item.isAliasMerged || item.isDeleted)
        continue;
      const key = this.companyCardKey(item.firma);
      if (!key) continue;
      if (aliasRawKeys.has(key)) continue;
      const existing = uniqueByKey.get(key);
      if (!existing) {
        uniqueByKey.set(key, item);
        continue;
      }
      // Prefer more curated records in the visible list.
      const existingScore =
        (existing.favori ? 4 : 0) +
        (existing.aktif ? 2 : 0) +
        (this.cleanText(existing.not) ? 1 : 0);
      const nextScore =
        (item.favori ? 4 : 0) +
        (item.aktif ? 2 : 0) +
        (this.cleanText(item.not) ? 1 : 0);
      if (nextScore > existingScore) {
        uniqueByKey.set(key, item);
      }
    }

    const syncedCari = this.syncCariSummaries();
    const cariByKey = new Map(
      syncedCari.map((item) => [this.firmaKey(item.firma), item]),
    );
    return Array.from(uniqueByKey.values())
      .map((item) => {
        const cari = cariByKey.get(this.firmaKey(item.firma));
        return {
          ...item,
          aliases: [
            ...(aliasesByTargetId.get(String(item.id || "")) || []),
            ...(aliasesByTargetKey.get(this.companyCardKey(item.firma)) || []),
          ].filter(
            (alias, index, list) =>
              list.findIndex((candidate) => candidate.id === alias.id) ===
              index,
          ),
          sonIslem: cari?.sonIslem || "",
          mevcutBakiye: this.roundAmount(Number(cari?.bakiye || 0)),
          odenenToplam: this.roundAmount(Number(cari?.odenenToplam || 0)),
        };
      })
      .sort((a, b) => {
        if (a.favori !== b.favori) return a.favori ? -1 : 1;
        if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;
        return a.firma.localeCompare(b.firma, "tr", { sensitivity: "base" });
      });
  }

  saveFirmaKarti(
    payload: Partial<FirmaKartiRow> & Record<string, any>,
    slug?: string,
  ) {
    return this.withCtx(slug ?? payload.mainCompanySlug, () =>
      this._saveFirmaKarti(payload),
    );
  }

  private _saveFirmaKarti(
    payload: Partial<FirmaKartiRow> & Record<string, any>,
  ) {
    const mainCompany = this.requireCurrentMainCompany();
    const cards = this.getFirmaKartRaw();
    const nextName = this.requireText(payload.firma, "Firma adÄ±");
    const tip = this.requireEnum<FirmaTipi>(
      payload.tip || "SATICI",
      "Firma tipi",
      ["SATICI", "MUSTERI", "GENEL"],
      "SATICI",
    );
    const now = this.nowIso();

    const existing = cards.find((item) => item.id === Number(payload.id));
    const nextKey = this.companyCardKey(nextName);
    const duplicate = cards.find(
      (item) =>
        item.isDeleted !== true &&
        item.id !== existing?.id &&
        this.companyCardKey(item.firma) === nextKey,
    );
    if (duplicate)
      throw this.buildDuplicateException(
        "Bu firma mevcut gÃ¶rÃ¼nÃ¼yor. Yeni kart aÃ§mak yerine mevcut kaydÄ± gÃ¼ncelleyin veya eÅŸleÅŸtirme kullanÄ±n.",
        duplicate.id,
      );

    if (existing) {
      const oldName = existing.firma;
      const oldValue = { ...existing };
      existing.firma = nextName;
      existing.tip = tip;
      existing.aktif = Boolean(payload.aktif ?? existing.aktif);
      existing.favori = Boolean(payload.favori ?? existing.favori);
      existing.not = this.cleanText(payload.not);
      existing.vergiNo = this.cleanText(payload.vergiNo);
      existing.eposta = this.cleanText(payload.eposta);
      existing.telefon = this.cleanText(payload.telefon);
      existing.sonIslem =
        this.cleanText(payload.sonIslem) || existing.sonIslem || "";
      // KDV varsayÄ±lanlarÄ±
      if (payload.varsayilanRecordType !== undefined)
        existing.varsayilanRecordType =
          payload.varsayilanRecordType === "GAYRI_RESMI"
            ? "GAYRI_RESMI"
            : "RESMI";
      if (payload.varsayilanVatRate !== undefined)
        existing.varsayilanVatRate = Number(payload.varsayilanVatRate ?? 0);
      if (payload.varsayilanVatMode !== undefined)
        existing.varsayilanVatMode =
          payload.varsayilanVatMode === "DAHIL" ? "DAHIL" : "HARIC";
      if (payload.vatApplicable !== undefined)
        existing.vatApplicable = Boolean(payload.vatApplicable);
      existing.updatedAt = now;
      this.saveFirmaKartRaw(cards);
      this.renameCompanyReferences(oldName, nextName);
      this.addActivityLog({
        entityType: "company_card",
        entityId: String(existing.id),
        actionType: "UPDATED",
        title: "Firma kartÄ± gÃ¼ncellendi",
        description: `${nextName} firma kartÄ± gÃ¼ncellendi`,
        oldValue,
        newValue: existing,
        source: "FIRMA_KARTI",
        recordName: nextName,
        mainCompanyId: mainCompany.id,
        mainCompanySlug: mainCompany.slug,
        mainCompanyName: mainCompany.name,
      });
    } else {
      const rawRecordType = this.cleanText(
        payload.varsayilanRecordType || "RESMI",
      ).toLocaleUpperCase("tr-TR");
      const rawVatMode = this.cleanText(
        payload.varsayilanVatMode || "HARIC",
      ).toLocaleUpperCase("tr-TR");
      cards.unshift({
        id: this.nextId(),
        firma: nextName,
        tip,
        aktif: payload.aktif !== false,
        favori: Boolean(payload.favori),
        not: this.cleanText(payload.not),
        vergiNo: this.cleanText(payload.vergiNo),
        eposta: this.cleanText(payload.eposta),
        telefon: this.cleanText(payload.telefon),
        sonIslem: this.cleanText(payload.sonIslem) || "",
        varsayilanRecordType:
          rawRecordType === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI",
        varsayilanVatRate: Number(payload.varsayilanVatRate ?? 0),
        varsayilanVatMode: rawVatMode === "DAHIL" ? "DAHIL" : "HARIC",
        vatApplicable: payload.vatApplicable !== false,
        createdAt: now,
        updatedAt: now,
      });
      this.saveFirmaKartRaw(cards);
      const created = cards[0];
      this.addActivityLog({
        entityType: "company_card",
        entityId: String(created.id),
        actionType: "CREATED",
        title: "Firma kartÄ± oluÅŸturuldu",
        description: `${nextName} firma kartÄ± oluÅŸturuldu`,
        oldValue: null,
        newValue: created,
        source: "FIRMA_KARTI",
        recordName: nextName,
        mainCompanyId: mainCompany.id,
        mainCompanySlug: mainCompany.slug,
        mainCompanyName: mainCompany.name,
      });
    }

    this.ensureCariSummary(nextName, tip);
    if (payload.createOpening && this.parseAmount(payload.acilisBakiye)) {
      this.createBalanceMovement({
        firma: nextName,
        tarih: payload.acilisTarih || this.today(),
        etki: this.parseAmount(payload.acilisBakiye),
        aciklama: this.cleanText(payload.aciklama) || "AÃ§Ä±lÄ±ÅŸ Bakiyesi",
        sourceType: this.cleanText(payload.sourceType) || "ACILIS_BAKIYESI",
      });
    }

    return this.getFirmaKartlari().find(
      (item) => this.companyCardKey(item.firma) === nextKey,
    );
  }

  private requireFirmaKartiById(id: number | string) {
    const numericId = Number(id);
    if (!numericId) {
      throw new BadRequestException("Firma id zorunludur.");
    }
    const card = this.getFirmaKartRaw().find(
      (item) => Number(item.id) === numericId,
    );
    if (!card) {
      throw new NotFoundException("Firma kartÄ± bulunamadÄ±.");
    }
    return card;
  }

  private deleteBackupRootDir() {
    return path.resolve(process.cwd(), "..", "..", "backup");
  }

  private backupStamp() {
    return new Date().toISOString().replace(/[.:]/g, "-");
  }

  private slugifyForPath(value: any, fallback = "kayit") {
    const cleaned = this.cleanText(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || fallback;
  }

  private createDeleteBackupDir(parts: string[]) {
    const dir = path.join(this.deleteBackupRootDir(), ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private writeBackupJson(backupDir: string, fileName: string, data: any) {
    fs.writeFileSync(
      path.join(backupDir, fileName),
      JSON.stringify(data ?? null, null, 2),
      "utf8",
    );
  }

  private sanitizeDocumentBackupPart(value: any, fallback = "kayit") {
    const cleaned = this.cleanText(value)
      .replace(/[<>:"/\\|?*]+/g, " ")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  private backupOutgoingDocumentFile(
    mainCompany: { slug: string; id: string; name: string },
    row: MuhasebeBelgeRow,
  ) {
    if (this.cleanText(row.sourceTab) !== "bizim-belgeler") return "";
    const flowType = this.normalizeDocumentFlowType(
      row.header?.flowType || row.workflowType,
    );
    const folder =
      flowType === "GIDEN_IRSALIYE"
        ? "giden-irsaliye"
        : flowType === "GIDEN_FATURA"
          ? "giden-fatura"
          : "";
    if (!folder) return "";
    const originalFilePath = this.toAbsolutePathWithinWorkspace(
      row.metrics?.originalRelativePath || "",
    );
    if (!originalFilePath || !fs.existsSync(originalFilePath)) return "";
    const ext =
      path.extname(originalFilePath) ||
      path.extname(this.cleanText(row.pdfFileName || "")) ||
      ".pdf";
    const datePart = this.sanitizeDocumentBackupPart(
      this.cleanText(row.header?.date).slice(0, 10) || this.today(),
      "tarih",
    );
    const modelPart = this.sanitizeDocumentBackupPart(
      row.header?.modelAdi,
      "model",
    );
    const numberPart = this.sanitizeDocumentBackupPart(
      flowType === "GIDEN_FATURA"
        ? row.header?.faturaNo || row.header?.documentNo || row.documentId
        : row.header?.documentNo || row.header?.irsaliyeNo || row.documentId,
      flowType === "GIDEN_FATURA" ? "FAT" : "IRS",
    );
    const backupDir = path.join(
      this.deleteBackupRootDir(),
      "documents",
      mainCompany.slug,
      folder,
    );
    fs.mkdirSync(backupDir, { recursive: true });
    const rawNumber =
      flowType === "GIDEN_FATURA"
        ? this.cleanText(
            row.header?.faturaNo ||
              row.header?.documentNo ||
              row.documentId ||
              "",
          )
        : this.cleanText(
            row.header?.irsaliyeNo ||
              row.header?.documentNo ||
              row.documentId ||
              "",
          );
    const rawModel = this.cleanText(row.header?.modelAdi || "model");
    const safeName = (s: string) =>
      s
        .replace(/[<>:"/\\|?*]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const safeNumber =
      safeName(rawNumber) ||
      (flowType === "GIDEN_FATURA" ? "fatura" : "irsaliye");
    const safeModel = safeName(rawModel) || "model";
    const targetFileName = `${safeNumber}_${safeModel}${ext}`;
    const targetPath = path.join(backupDir, targetFileName);
    fs.copyFileSync(originalFilePath, targetPath);
    return targetPath;
  }

  private rebuildVatPeriodsFromCurrentDocuments() {
    const mainCompany = this.requireCurrentMainCompany();
    const periodSet = new Set<string>();
    const docs = this.getBelgeler();
    for (const doc of docs) {
      const dateText = this.cleanText(
        doc?.header?.date || doc?.updatedAt || doc?.createdAt,
      ).slice(0, 10);
      if (!dateText) continue;
      if (
        this.cleanText(doc?.status).toLocaleUpperCase("tr-TR") !== "ONAYLANDI"
      )
        continue;
      if (!this.isOfficialDocument(doc)) continue;
      if (!this.isVatEligibleDocument(doc)) continue;
      periodSet.add(this.toKdvPeriod(dateText));
    }

    const periods = Array.from(periodSet).sort();
    const previousRows = this.getVatPeriodsRaw();
    const previousByPeriod = new Map(
      previousRows.map((row) => [row.period, row]),
    );
    let carriedFromPrev = 0;
    const nextRows: VatPeriodRow[] = [];

    for (const period of periods) {
      const rows = this.getVatRows(mainCompany.slug, period, { period });
      const summary = this.getVatSummary(
        mainCompany.slug,
        period,
        rows,
        carriedFromPrev,
      );
      const existing = previousByPeriod.get(period);
      nextRows.push({
        id: existing?.id || `vp-${period}-${Date.now()}`,
        period,
        mainCompanyId: mainCompany.id,
        carriedVatFromPreviousMonth: Number(
          summary.carriedVatFromPreviousMonth || 0,
        ),
        purchaseVatTotal: Number(summary.totalPurchaseVat || 0),
        salesVatTotal: Number(summary.totalSalesVat || 0),
        netVat: Number(summary.netVat || 0),
        carriedVatToNextMonth: Number(summary.carriedVatToNextMonth || 0),
        note: this.cleanText(existing?.note),
        createdAt: existing?.createdAt || this.nowIso(),
        updatedAt: this.nowIso(),
      });
      carriedFromPrev = Number(summary.carriedVatToNextMonth || 0);
    }

    this.saveVatPeriodsRaw(
      nextRows.sort((a, b) => b.period.localeCompare(a.period)),
    );
    return nextRows;
  }

  private collectCompanyDeletionBundle(card: FirmaKartiRow) {
    const mainCompany = this.requireCurrentMainCompany();
    const companyKey = this.firmaKey(card.firma);
    const allDocuments = this.getBelgeRaw();
    const documents = allDocuments.filter(
      (row) =>
        this.firmaKey(
          row?.firma || row?.relatedCompanyName || row?.header?.cariFirma,
        ) === companyKey,
    );
    const documentIds = new Set(
      documents.map((row) => this.cleanText(row?.documentId)).filter(Boolean),
    );

    const allMovements = this.getHareketRaw();
    const cariMovements = allMovements.filter(
      (row) => this.firmaKey(row?.firma) === companyKey,
    );
    const balanceAdjustments = cariMovements.filter((row) =>
      ["BAKIYE_DUZELTME", "IMPORT_BAKIYE_DUZELTME"].includes(
        this.cleanText(row?.sourceType),
      ),
    );
    const openingBalances = cariMovements.filter((row) =>
      ["ACILIS_BAKIYESI", "IMPORT_ACILIS", "MANUAL_ACILIS"].includes(
        this.cleanText(row?.sourceType),
      ),
    );

    const allPayments = this.getOdemeRaw();
    const payments = allPayments.filter(
      (row) => this.firmaKey(row?.firma) === companyKey,
    );
    const allChecks = this.getCekRaw();
    const checks = allChecks.filter(
      (row) => this.firmaKey((row as any)?.firma) === companyKey,
    );
    const allCards = this.getKrediKartiRaw();
    const creditCards = allCards.filter(
      (row) => this.firmaKey((row as any)?.firma) === companyKey,
    );

    const allModels = this.db.readMainCompanyStore<any[]>(
      mainCompany.slug,
      "model-takip",
      [],
    );
    const modelTracking = allModels.filter((row) => {
      const rowCompany = this.cleanText(row?.musteriFirma || row?.firma);
      return this.firmaKey(rowCompany) === companyKey;
    });
    const modelIds = new Set(
      modelTracking.map((row) => this.cleanText(row?.id)).filter(Boolean),
    );

    const allProduction = this.db.readMainCompanyStore<any[]>(
      mainCompany.slug,
      "uretim.kayitlar",
      [],
    );
    const production = allProduction.filter((row) => {
      const rowCompany = this.cleanText(row?.firma);
      const modelKaydiId = this.cleanText(row?.modelKaydiId);
      return (
        this.firmaKey(rowCompany) === companyKey ||
        (modelKaydiId && modelIds.has(modelKaydiId))
      );
    });

    const incomingDispatchDocs = documents.filter(
      (row) => this.cleanText(row?.workflowType) === "GELEN_IRSALIYE",
    );
    const outgoingDocs = documents.filter((row) =>
      ["BIZIM_IRSALIYE", "GIDEN_IRSALIYE", "GIDEN_FATURA"].includes(
        this.cleanText(row?.workflowType),
      ),
    );
    const supplierDocs = documents.filter((row) =>
      ["ALIS_GIDER_BELGE", "ALIS_FATURA", "TEDARIKCI_FATURA"].includes(
        this.cleanText(row?.workflowType),
      ),
    );

    const allProducts = this.getNormalizedUrunRows();
    const relatedProductIds = new Set<number>();
    const documentLines: any[] = [];
    for (const document of documents) {
      const lines = Array.isArray(document?.items) ? document.items : [];
      for (const line of lines) {
        const pid = Number(
          line?.urunId || line?.matchedProductId || line?.eslesenUrunId || 0,
        );
        if (pid) relatedProductIds.add(pid);
        documentLines.push({
          documentId: document.documentId,
          line,
        });
      }
    }
    const products = allProducts.filter((row) =>
      relatedProductIds.has(Number(row.id)),
    );
    const productIds = new Set(products.map((row) => Number(row.id)));
    const lots = products.flatMap((row) => row.lotKayitlari || []);

    const allProductDocuments = this.getProductDocumentRaw();
    const productDocuments = allProductDocuments.filter((item) => {
      const rowCompanyKey = this.firmaKey(item.companyName);
      const sharedScopeRef = this.cleanText(item.sharedScopeRef);
      return (
        productIds.has(Number(item.productId || 0)) ||
        Number(item.companyId || 0) === Number(card.id) ||
        rowCompanyKey === companyKey ||
        sharedScopeRef === String(card.id)
      );
    });

    const allProductAliases = this.getProductAliasesRaw();
    const productAliases = allProductAliases.filter((item) =>
      productIds.has(Number(item.matchedProductId || 0)),
    );

    const allCompanyAliases = this.getCompanyAliasesRaw();
    const companyAliases = allCompanyAliases.filter(
      (item) =>
        Number(item.matchedCompanyId) === Number(card.id) ||
        this.firmaKey(item.matchedCompanyName) === companyKey,
    );

    const emailContacts = this.getEpostaKisiRaw().filter(
      (item) => this.firmaKey(item.gonderilenFirma) === companyKey,
    );
    const logs = this.getActivityLogRaw().filter((row) => {
      if (this.firmaKey(row?.recordName) === companyKey) return true;
      const oldValue = JSON.stringify(row?.oldValue || {}).toLocaleUpperCase(
        "tr-TR",
      );
      const newValue = JSON.stringify(row?.newValue || {}).toLocaleUpperCase(
        "tr-TR",
      );
      return (
        oldValue.includes(
          this.cleanText(card.firma).toLocaleUpperCase("tr-TR"),
        ) ||
        newValue.includes(this.cleanText(card.firma).toLocaleUpperCase("tr-TR"))
      );
    });

    const vatRecords = documents
      .filter(
        (row) =>
          this.cleanText(row?.status).toLocaleUpperCase("tr-TR") ===
          "ONAYLANDI",
      )
      .map((row) => {
        const items = Array.isArray(row?.items) ? row.items : [];
        const vatAmount = items.reduce((sum: number, item: any) => {
          return sum + Number(item?.kdvAmount ?? item?.kdvTutari ?? 0);
        }, 0);
        return {
          documentId: row.documentId,
          workflowType: row.workflowType,
          date: row?.header?.date || row?.updatedAt || "",
          vatAmount: Number(vatAmount || 0),
          companyName: card.firma,
        };
      })
      .filter((item) => Number(item.vatAmount || 0) !== 0);
    const vatSummaryBefore = {
      totalVatRecords: vatRecords.length,
      totalVatAmount: Number(
        vatRecords.reduce((sum, item) => sum + Number(item.vatAmount || 0), 0),
      ),
    };

    const breakdown = {
      companyCards: 1,
      documents: documents.length,
      incomingDispatchDocs: incomingDispatchDocs.length,
      outgoingDocs: outgoingDocs.length,
      supplierDocs: supplierDocs.length,
      cariMovements: cariMovements.length,
      balanceAdjustments: balanceAdjustments.length,
      openingBalances: openingBalances.length,
      vatRecords: vatRecords.length,
      payments: payments.length,
      checks: checks.length,
      creditCards: creditCards.length,
      products: products.length,
      productDocuments: productDocuments.length,
      productAliases: productAliases.length,
      companyAliases: companyAliases.length,
      emailContacts: emailContacts.length,
      modelRecords: modelTracking.length,
      productionRecords: production.length,
      lots: lots.length,
      logs: logs.length,
    };

    const totalLinkedRecords = Object.values(breakdown).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    );

    return {
      mainCompany,
      companyKey,
      card,
      breakdown,
      totalLinkedRecords,
      cardsAfterDelete: this.getFirmaKartRaw().filter(
        (item) => Number(item.id) !== Number(card.id),
      ),
      companyAliases,
      allCompanyAliases,
      allMovements,
      cariMovements,
      balanceAdjustments,
      openingBalances,
      allDocuments,
      documents,
      documentIds,
      allPayments,
      payments,
      allChecks,
      checks,
      allCards,
      creditCards,
      allModels,
      modelTracking,
      modelIds,
      allProduction,
      production,
      allProducts,
      products,
      productIds,
      allProductDocuments,
      productDocuments,
      productAliases,
      allProductAliases,
      lots,
      documentLines,
      emailContacts,
      logs,
      vatRecords,
      vatSummaryBefore,
    };
  }

  getFirmaDeleteSummary(id: number | string) {
    const bundle = this.collectCompanyDeletionBundle(
      this.requireFirmaKartiById(id),
    );
    return {
      companyId: bundle.card.id,
      companyName: bundle.card.firma,
      mainCompanyId: bundle.mainCompany.id,
      mainCompanySlug: bundle.mainCompany.slug,
      mainCompanyName: bundle.mainCompany.name,
      breakdown: bundle.breakdown,
      totalLinkedRecords: bundle.totalLinkedRecords,
      canDelete: true,
      message:
        "Yedek alÄ±narak baÄŸlÄ± kayÄ±tlarla birlikte kalÄ±cÄ± silme yapÄ±lacak.",
    };
  }

  // Tek firma silme â€” arka planda sync Ã§alÄ±ÅŸÄ±r
  deleteFirmaKarti(id: number | string) {
    const result = this.deleteFirmaKartiCore(id);
    setImmediate(() => {
      try {
        this.syncCariSummaries();
      } catch (e) {
        console.error("[deleteFirmaKarti] syncCariSummaries hatasÄ±:", e);
      }
      try {
        this.rebuildVatPeriodsFromCurrentDocuments();
      } catch (e) {
        console.error("[deleteFirmaKarti] rebuildVatPeriods hatasÄ±:", e);
      }
    });
    return result;
  }

  // Ã‡oklu firma silme â€” tÃ¼mÃ¼ silinince tek seferde sync
  deleteFirmaKartiMulti(ids: (number | string)[]) {
    if (!ids?.length)
      throw new BadRequestException("Silinecek firma seÃ§ilmedi.");
    const results: ReturnType<typeof this.deleteFirmaKartiCore>[] = [];
    for (const id of ids) {
      results.push(this.deleteFirmaKartiCore(id));
    }
    setImmediate(() => {
      try {
        this.syncCariSummaries();
      } catch (e) {
        console.error("[deleteFirmaKartiMulti] syncCariSummaries hatasÄ±:", e);
      }
      try {
        this.rebuildVatPeriodsFromCurrentDocuments();
      } catch (e) {
        console.error("[deleteFirmaKartiMulti] rebuildVatPeriods hatasÄ±:", e);
      }
    });
    return {
      success: true,
      deletedCount: results.length,
      deleted: results.map((r) => ({
        id: r.deletedCompanyId,
        name: r.deletedCompanyName,
      })),
      message: `${results.length} firma iÃ§in yedek alÄ±ndÄ± ve baÄŸlÄ± kayÄ±tlarla birlikte kalÄ±cÄ± silme tamamlandÄ±.`,
    };
  }

  // Core silme mantÄ±ÄŸÄ± â€” sync/rebuild YOK, Ã§aÄŸÄ±ran Ã¼stlenir
  private deleteFirmaKartiCore(id: number | string) {
    const card = this.requireFirmaKartiById(id);
    const mainCompany = this.requireCurrentMainCompany();
    const protectedMainNames = new Set([this.firmaKey(mainCompany.name)]);
    if (protectedMainNames.has(this.firmaKey(card.firma))) {
      throw new BadRequestException("Ana firma kaydÄ± bu ekrandan silinemez.");
    }

    const bundle = this.collectCompanyDeletionBundle(card);
    const stamp = this.backupStamp();
    const companyPathSlug = `${this.slugifyForPath(card.firma, "firma")}-${card.id}`;
    const backupDir = this.createDeleteBackupDir([
      "deleted-companies",
      mainCompany.slug,
      companyPathSlug,
      stamp,
    ]);

    this.writeBackupJson(backupDir, "company.json", card);
    this.writeBackupJson(
      backupDir,
      "cari-movements",
      bundle.cariMovements,
    );
    this.writeBackupJson(
      backupDir,
      "balance-adjustments.json",
      bundle.balanceAdjustments,
    );
    this.writeBackupJson(
      backupDir,
      "opening-balances.json",
      bundle.openingBalances,
    );
    this.writeBackupJson(backupDir, "documents", bundle.documents);
    this.writeBackupJson(backupDir, "vat-records.json", bundle.vatRecords);
    this.writeBackupJson(
      backupDir,
      "vat-summary-before.json",
      bundle.vatSummaryBefore,
    );
    this.writeBackupJson(backupDir, "payments", bundle.payments);
    this.writeBackupJson(backupDir, "checks", bundle.checks);
    this.writeBackupJson(backupDir, "credit-cards", bundle.creditCards);
    this.writeBackupJson(backupDir, "products", bundle.products);
    this.writeBackupJson(
      backupDir,
      "product-documents",
      bundle.productDocuments,
    );
    this.writeBackupJson(
      backupDir,
      "product-aliases",
      bundle.productAliases,
    );
    this.writeBackupJson(
      backupDir,
      "company-aliases",
      bundle.companyAliases,
    );
    this.writeBackupJson(
      backupDir,
      "email-contacts",
      bundle.emailContacts,
    );
    this.writeBackupJson(
      backupDir,
      "model-tracking.json",
      bundle.modelTracking,
    );
    this.writeBackupJson(backupDir, "production.json", bundle.production);
    this.writeBackupJson(backupDir, "lots.json", bundle.lots);
    this.writeBackupJson(backupDir, "logs.json", bundle.logs);
    this.writeBackupJson(backupDir, "summary.json", {
      companyId: card.id,
      companyName: card.firma,
      mainCompanySlug: mainCompany.slug,
      totalCari: bundle.cariMovements.length,
      totalBalanceAdjustments: bundle.balanceAdjustments.length,
      totalOpeningBalances: bundle.openingBalances.length,
      totalDocuments: bundle.documents.length,
      totalVatRecords: bundle.vatRecords.length,
      totalPayments: bundle.payments.length,
      totalChecks: bundle.checks.length,
      totalCreditCards: bundle.creditCards.length,
      totalProducts: bundle.products.length,
      totalProductDocuments: bundle.productDocuments.length,
      totalProductAliases: bundle.productAliases.length,
      totalCompanyAliases: bundle.companyAliases.length,
      totalEmailContacts: bundle.emailContacts.length,
      totalModels: bundle.modelTracking.length,
      totalProduction: bundle.production.length,
      totalLots: bundle.lots.length,
      backupAt: this.nowIso(),
      backupPath: backupDir,
    });

    const movementSet = new Set(bundle.cariMovements);
    const documentSet = new Set(bundle.documents);
    const paymentSet = new Set(bundle.payments);
    const checkSet = new Set(bundle.checks);
    const creditCardSet = new Set(bundle.creditCards);
    const productAliasSet = new Set(bundle.productAliases);
    const companyAliasSet = new Set(bundle.companyAliases);
    const emailContactSet = new Set(bundle.emailContacts);
    const logSet = new Set(bundle.logs);
    const productDocumentIds = new Set(
      bundle.productDocuments
        .map((item) => this.cleanText(item.id))
        .filter(Boolean),
    );

    for (const document of bundle.productDocuments) {
      const absolutePath = this.toAbsolutePathWithinWorkspace(
        document.dosyaYolu,
      );
      if (absolutePath) this.removeFileIfExists(absolutePath);
    }

    this.saveFirmaKartRaw(bundle.cardsAfterDelete);
    this.saveCariRaw(
      this.getCariRaw().filter(
        (row) => this.firmaKey(row?.firma) !== bundle.companyKey,
      ),
    );
    this.saveHareketRaw(
      bundle.allMovements.filter((row) => !movementSet.has(row)),
    );
    this.saveBelgeRaw(
      bundle.allDocuments.filter((row) => !documentSet.has(row)),
    );
    this.saveOdemeRaw(bundle.allPayments.filter((row) => !paymentSet.has(row)));
    this.saveCekRaw(bundle.allChecks.filter((row) => !checkSet.has(row)));
    this.saveKrediKartiRaw(
      bundle.allCards.filter((row) => !creditCardSet.has(row)),
    );
    this.saveUrunRaw(
      this.getUrunRaw().filter(
        (row) => !bundle.productIds.has(Number(row?.id || 0)),
      ),
    );
    this.saveProductDocumentRaw(
      bundle.allProductDocuments.filter(
        (row) => !productDocumentIds.has(this.cleanText(row.id)),
      ),
    );
    this.saveProductAliasesRaw(
      bundle.allProductAliases.filter((row) => !productAliasSet.has(row)),
    );
    this.saveCompanyAliasesRaw(
      bundle.allCompanyAliases.filter((row) => !companyAliasSet.has(row)),
    );
    this.saveEpostaKisiRaw(
      this.getEpostaKisiRaw().filter((row) => !emailContactSet.has(row)),
    );
    this.saveActivityLogRaw(
      this.getActivityLogRaw().filter((row) => !logSet.has(row)),
    );
    this.db.writeMainCompanyStore(
      mainCompany.slug,
      "model-takip",
      bundle.allModels.filter(
        (row) => !bundle.modelIds.has(this.cleanText(row?.id)),
      ),
    );
    this.db.writeMainCompanyStore(
      mainCompany.slug,
      "uretim.kayitlar",
      bundle.allProduction.filter((row) => !bundle.production.includes(row)),
    );

    // Silme tamamlandÄ± â€” aÄŸÄ±r senkronizasyonlarÄ± arka planda Ã§alÄ±ÅŸtÄ±r
    // bÃ¶ylece HTTP yanÄ±tÄ± hemen gÃ¶nderilir, zaman aÅŸÄ±mÄ± olmaz

    this.addActivityLog({
      entityType: "company_card",
      entityId: String(card.id),
      actionType: "DELETED",
      title: "Firma kartÄ± kalÄ±cÄ± silindi",
      description: `${card.firma} iÃ§in yedek alÄ±ndÄ± ve baÄŸlÄ± kayÄ±tlarla birlikte kalÄ±cÄ± silme yapÄ±ldÄ±`,
      oldValue: card,
      newValue: {
        backupPath: backupDir,
        totalLinkedRecords: bundle.totalLinkedRecords,
      },
      source: "FIRMA_KARTI_DELETE",
      recordName: card.firma,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      success: true,
      deletedCompanyId: card.id,
      deletedCompanyName: card.firma,
      backupPath: backupDir,
      message: `${card.firma} iÃ§in yedek alÄ±ndÄ± ve baÄŸlÄ± kayÄ±tlarla birlikte kalÄ±cÄ± silme tamamlandÄ±.`,
    };
  }

  private normalizeProductStatus(value: any, aktif = true): ProductStatus {
    if (!aktif) return "PASIF";
    const normalized = this.cleanText(value).toLocaleUpperCase("tr-TR");
    if (normalized === "ONAYLANDI") return "ONAYLANDI";
    if (normalized === "EKSIK_EVRAK") return "EKSIK_EVRAK";
    if (normalized === "PASIF") return "PASIF";
    return "ONAY_BEKLIYOR";
  }

  private normalizeProductDocumentType(value: any): ProductDocumentType {
    const normalized = this.cleanText(value).toLocaleUpperCase("tr-TR");
    if (normalized === "MSDS") return "MSDS";
    if (normalized === "TDS") return "TDS";
    if (normalized === "ZDHC") return "ZDHC";
    if (normalized === "TEKNIK_FOY") return "TEKNIK_FOY";
    if (normalized === "UYGUNLUK_BELGESI") return "UYGUNLUK_BELGESI";
    if (normalized === "SERTIFIKA") return "SERTIFIKA";
    return "DIGER";
  }

  private normalizeProductDocumentScope(value: any): ProductDocumentScopeType {
    return this.cleanText(value).toLocaleLowerCase("tr-TR") === "shared"
      ? "shared"
      : "product";
  }

  private normalizeSharedScopeType(value: any): SharedScopeType {
    const normalized = this.cleanText(value).toLocaleLowerCase("tr-TR");
    if (normalized === "maincompany") return "mainCompany";
    if (normalized === "company") return "company";
    return null;
  }

  private requiredProductDocumentTypes(
    _category?: string,
  ): ProductDocumentType[] {
    return ["MSDS", "TDS", "ZDHC"];
  }

  private normalizeProductDocumentRow(row: any): ProductDocumentRow {
    const now = this.nowIso();
    const isActive = row?.isActive !== false;
    const isDeleted = row?.isDeleted === true;
    return {
      id:
        this.cleanText(row?.id) ||
        `prd-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId:
        row?.productId !== undefined && row?.productId !== null
          ? Number(row.productId) || this.cleanText(row.productId)
          : "",
      mainCompanyId: this.cleanText(row?.mainCompanyId),
      mainCompanySlug: this.cleanText(row?.mainCompanySlug),
      mainCompanyName: this.cleanText(row?.mainCompanyName),
      companyId:
        row?.companyId !== undefined && row?.companyId !== null
          ? Number(row.companyId) || this.cleanText(row.companyId)
          : "",
      companyName: this.cleanText(row?.companyName),
      belgeTipi: this.normalizeProductDocumentType(row?.belgeTipi),
      belgeAdi: this.cleanText(row?.belgeAdi),
      kapsamTipi: this.normalizeProductDocumentScope(row?.kapsamTipi),
      sharedScopeType: this.normalizeSharedScopeType(row?.sharedScopeType),
      sharedScopeRef: this.cleanText(row?.sharedScopeRef) || null,
      dosyaYolu: this.cleanText(row?.dosyaYolu),
      dosyaAdi: this.cleanText(row?.dosyaAdi),
      mimeType: this.cleanText(row?.mimeType),
      not: this.cleanText(row?.not),
      belgeTarihi: this.normalizeOptionalDateInput(
        row?.belgeTarihi,
        "Belge tarihi",
      ),
      gecerlilikBaslangic: this.normalizeOptionalDateInput(
        row?.gecerlilikBaslangic,
        "GeÃ§erlilik baÅŸlangÄ±Ã§",
      ),
      gecerlilikBitis: this.normalizeOptionalDateInput(
        row?.gecerlilikBitis,
        "GeÃ§erlilik bitiÅŸ",
      ),
      isActive,
      isDeleted,
      createdAt: this.cleanText(row?.createdAt || now),
      updatedAt: this.cleanText(row?.updatedAt || now),
      deletedAt: isDeleted ? this.cleanText(row?.deletedAt || now) : "",
    };
  }

  private getVisibleProductDocuments(product: NormalizedUrunRow) {
    const mainCompany = this.requireCurrentMainCompany();
    const productCompanyId = this.cleanText(product?.bagliFirmaId);
    return this.getProductDocumentRaw()
      .filter((item) => item.isDeleted !== true && item.isActive !== false)
      .filter((item) => {
        if (
          item.kapsamTipi === "product" &&
          Number(item.productId) === Number(product.id)
        ) {
          return true;
        }
        if (item.kapsamTipi !== "shared") return false;
        if (item.sharedScopeType === "mainCompany") {
          return (
            this.cleanText(item.sharedScopeRef || item.mainCompanyId) ===
            this.cleanText(mainCompany.id)
          );
        }
        if (item.sharedScopeType === "company" && productCompanyId) {
          return (
            this.cleanText(item.sharedScopeRef || item.companyId) ===
            productCompanyId
          );
        }
        return false;
      })
      .map((item) => ({
        ...item,
        kapsamEtiketi:
          item.kapsamTipi === "product"
            ? "ÃœrÃ¼ne Ã–zel"
            : item.sharedScopeType === "company"
              ? "Firma Ortak"
              : "Ana Firma Ortak",
      }))
      .sort((a, b) => {
        const scopeRank = (value: any) =>
          value.kapsamTipi === "product"
            ? 0
            : value.sharedScopeType === "mainCompany"
              ? 1
              : 2;
        return (
          scopeRank(a) - scopeRank(b) ||
          String(b.gecerlilikBitis || "").localeCompare(
            String(a.gecerlilikBitis || ""),
            "tr",
          ) ||
          String(a.belgeTipi || "").localeCompare(
            String(b.belgeTipi || ""),
            "tr",
          )
        );
      });
  }

  private getProductDocumentCoverage(
    product: NormalizedUrunRow,
    visibleDocuments = this.getVisibleProductDocuments(product),
  ) {
    const requiredTypes = this.requiredProductDocumentTypes(product.kategori);
    const availableTypes = new Set(
      visibleDocuments
        .filter((item) => item.isDeleted !== true && item.isActive !== false)
        .map((item) => item.belgeTipi),
    );
    const missingTypes = requiredTypes.filter(
      (item) => !availableTypes.has(item),
    );
    const suggestedStatus =
      product.aktif === false
        ? "PASIF"
        : missingTypes.length
          ? "EKSIK_EVRAK"
          : "ONAYLANDI";
    return {
      requiredTypes,
      missingTypes,
      suggestedStatus,
    };
  }

  addFirmaOpening(payload: {
    firma?: string;
    tutar?: number;
    tarih?: string;
    aciklama?: string;
    sourceType?: string;
    mainCompanySlug?: string;
  }) {
    return this.withCtx(payload.mainCompanySlug, () =>
      this._addFirmaOpening(payload),
    );
  }

  private _addFirmaOpening(payload: {
    firma?: string;
    tutar?: number;
    tarih?: string;
    aciklama?: string;
    sourceType?: string;
    mainCompanySlug?: string;
  }) {
    this.requireCurrentMainCompany();
    const firma = this.requireText(payload.firma, "Firma");
    this.findCompanyCardByPayload({ firma }, true);
    const tutar = this.requireAmount(payload.tutar, "AÃ§Ä±lÄ±ÅŸ bakiyesi", {
      allowNegative: true,
    });
    const result = this.createBalanceMovement({
      firma,
      tarih: this.normalizeDateInput(
        payload.tarih || this.today(),
        "Tarih",
        true,
      ),
      etki: tutar,
      aciklama: this.cleanText(payload.aciklama) || "AÃ§Ä±lÄ±ÅŸ Bakiyesi",
      sourceType: this.cleanText(payload.sourceType) || "ACILIS_BAKIYESI",
    });
    return result.row;
  }

  adjustFirmaTotalBalance(payload: {
    firma?: string;
    hedefBakiye?: number;
    tarih?: string;
    aciklama?: string;
    sourceType?: string;
    mainCompanySlug?: string;
  }) {
    return this.withCtx(payload.mainCompanySlug, () =>
      this._adjustFirmaTotalBalance(payload),
    );
  }

  private _adjustFirmaTotalBalance(payload: {
    firma?: string;
    hedefBakiye?: number;
    tarih?: string;
    aciklama?: string;
    sourceType?: string;
    mainCompanySlug?: string;
  }) {
    this.requireCurrentMainCompany();
    const firma = this.requireText(payload.firma, "Firma");
    this.findCompanyCardByPayload({ firma }, true);
    const hedefBakiye = this.requireAmount(
      payload.hedefBakiye,
      "Hedef bakiye",
      {
        allowZero: true,
        allowNegative: true,
      },
    );
    return this.addBalanceAdjust(
      firma,
      hedefBakiye,
      this.normalizeDateInput(payload.tarih || this.today(), "Tarih", true),
      this.cleanText(payload.aciklama) || "Toplam bakiyeyi ayarla",
      this.cleanText(payload.sourceType) || "BAKIYE_DUZELTME",
    );
  }

  importFirmaBakiyeleri(payload: {
    rawText?: string;
    mode?: "OPENING" | "ADJUST";
    tarih?: string;
    updateExisting?: boolean;
    varsayilanRecordType?: "RESMI" | "GAYRI_RESMI";
    varsayilanVatRate?: number;
    varsayilanVatMode?: "DAHIL" | "HARIC";
    vatApplicable?: boolean;
  }) {
    const preview = this.previewFirmaBakiyeleri({
      rawText: payload.rawText || "",
    });
    const items: FirmaImportPreviewItem[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    if (!preview.items.length) {
      return {
        ok: true,
        createdCount,
        updatedCount,
        skippedCount,
        warnings: preview.warnings,
        items,
      };
    }

    const backupPath = this.createFirmaImportBackup();

    for (const previewItem of preview.items) {
      const existing = this.getFirmaKartlari().find(
        (item) =>
          this.companyCardKey(item.firma) ===
          this.companyCardKey(previewItem.companyName),
      );
      const existedBefore = Boolean(existing);

      if (existedBefore && payload.updateExisting !== true) {
        skippedCount += 1;
        items.push({ ...previewItem, action: "skipped" });
        continue;
      }

      if (!existedBefore) {
        this.saveFirmaKarti({
          firma: previewItem.companyName,
          tip: existing?.tip || "SATICI",
          aktif: existing?.aktif ?? true,
          favori: existing?.favori ?? false,
          not: existing?.not || "Toplu Firma Aktar",
          vergiNo: existing?.vergiNo || "",
          eposta: existing?.eposta || "",
          telefon: existing?.telefon || "",
          varsayilanRecordType: payload.varsayilanRecordType || "RESMI",
          varsayilanVatRate: Number(payload.varsayilanVatRate ?? 0),
          varsayilanVatMode: payload.varsayilanVatMode || "HARIC",
          vatApplicable: payload.vatApplicable !== false,
        });
        createdCount += 1;
      } else if (payload.updateExisting === true && existing?.id) {
        this.saveFirmaKarti({
          id: existing.id,
          firma: existing.firma,
          varsayilanRecordType:
            payload.varsayilanRecordType ||
            existing.varsayilanRecordType ||
            "RESMI",
          varsayilanVatRate: Number(
            payload.varsayilanVatRate ?? existing.varsayilanVatRate ?? 0,
          ),
          varsayilanVatMode:
            payload.varsayilanVatMode || existing.varsayilanVatMode || "HARIC",
          vatApplicable:
            payload.vatApplicable !== undefined
              ? payload.vatApplicable
              : existing.vatApplicable !== false,
        });
      }

      let action: FirmaImportPreviewItem["action"] = existedBefore
        ? "skipped"
        : "created";

      if ((payload.mode || "ADJUST") === "OPENING") {
        if (!this.sameAmount(previewItem.balance, 0)) {
          const result = this.createBalanceMovement({
            firma: previewItem.companyName,
            tarih: payload.tarih || this.today(),
            etki: previewItem.balance,
            aciklama: "Toplu AÃ§Ä±lÄ±ÅŸ Bakiyesi",
            sourceType: "IMPORT_ACILIS",
            dedupeKey: `IMPORT_ACILIS:${this.companyCardKey(previewItem.companyName)}:${previewItem.balance.toFixed(2)}`,
          });

          if (result.created) {
            if (existedBefore) {
              updatedCount += 1;
              action = "updated";
            } else {
              action = "created";
            }
          } else if (existedBefore) {
            skippedCount += 1;
            action = "skipped";
          }
        }
      } else {
        const result = this.addBalanceAdjust(
          previewItem.companyName,
          previewItem.balance,
          payload.tarih || this.today(),
          "Toplu aktarÄ±m ile net bakiye ayarÄ±",
          "IMPORT_BAKIYE_DUZELTME",
        );

        if (result.changed && existedBefore) {
          updatedCount += 1;
          action = "updated";
        } else if (!result.changed && existedBefore) {
          skippedCount += 1;
          action = "skipped";
        }
      }

      items.push({
        companyName: previewItem.companyName,
        balance: previewItem.balance,
        exists: existedBefore,
        action,
        currentBalance: previewItem.currentBalance,
      });
    }

    return {
      ok: true,
      createdCount,
      updatedCount,
      skippedCount,
      warnings: preview.warnings,
      backupPath,
      items,
    };
  }

  getCariler() {
    const cards = this.getFirmaKartRaw();
    for (const card of cards) this.ensureCariSummary(card.firma, card.tip);

    return this.syncCariSummaries()
      .map((row) => {
        const card = cards.find(
          (item) => this.firmaKey(item.firma) === this.firmaKey(row.firma),
        );
        return {
          ...row,
          tip: (card?.tip || row.tip) as FirmaTipi,
          aktif: card?.aktif ?? true,
          favori: card?.favori ?? false,
        };
      })
      .sort((a, b) => {
        if ((a as any).favori !== (b as any).favori)
          return (a as any).favori ? -1 : 1;
        return a.firma.localeCompare(b.firma, "tr", { sensitivity: "base" });
      });
  }

  addCariFirma(payload: { firma?: string; tip?: FirmaTipi }) {
    const firma = this.requireText(payload.firma, "Firma adÄ±");
    this.saveFirmaKarti({ firma, tip: payload.tip || "SATICI" });
    return this.getCariler().find(
      (item) => this.firmaKey(item.firma) === this.firmaKey(firma),
    );
  }

  getCariHareketleri(firma?: string) {
    const rows = this.getHareketRaw()
      .filter((row) => row?.isDeleted !== true)
      .map((row) => {
        const resolved = this.resolveCompanyAlias(row.firma);
        if (
          !resolved.matched ||
          this.firmaKey(resolved.cleanCompanyName) === this.firmaKey(row.firma)
        ) {
          return row;
        }
        return {
          ...row,
          rawCompanyName: row.firma,
          firma: resolved.cleanCompanyName,
          companyName: resolved.cleanCompanyName,
          aliasMatched: true,
          aliasId: resolved.aliasId,
        };
      })
      .sort((a, b) => {
        if (a.tarih !== b.tarih) return b.tarih.localeCompare(a.tarih);
        return String(b.id || "").localeCompare(String(a.id || ""), "tr", {
          numeric: true,
        });
      });
    if (!firma) return rows;
    const requested = this.resolveCompanyAlias(firma);
    const requestedKey = this.firmaKey(requested.cleanCompanyName || firma);
    return rows.filter(
      (item: any) =>
        this.firmaKey(item.firma) === requestedKey ||
        this.firmaKey(item.rawCompanyName) === requestedKey,
    );
  }

  saveCariHareket(
    payload: Partial<CariHareketRow> & {
      firma?: string;
      operation?: HareketTipi;
      hedefBakiye?: number;
    },
  ) {
    const firma = this.requireText(payload.firma, "Firma");

    this.ensureFirmaCard(firma);
    this.ensureCariSummary(firma);

    const sourceType = this.cleanText(payload.sourceType) || "MANUAL";
    if (["IMPORT_ACILIS", "MANUAL_ACILIS"].includes(sourceType)) {
      const existing = this.getHareketRaw().find(
        (item) =>
          this.firmaKey(item.firma) === this.firmaKey(firma) &&
          item.sourceType === sourceType,
      );
      if (existing) return existing;
    }

    if (payload.operation === "BAKIYE" && payload.hedefBakiye !== undefined) {
      return this.addBalanceAdjust(
        firma,
        this.requireAmount(payload.hedefBakiye, "Hedef bakiye", {
          allowZero: true,
          allowNegative: true,
        }),
        this.normalizeDateInput(payload.tarih || this.today(), "Tarih", true),
        this.cleanText(payload.aciklama) || "Toplam bakiye dÃ¼zeltmesi",
        sourceType || "BAKIYE_DUZELTME",
      );
    }

    const amount = this.requireAmount(payload.tutar, "Tutar");
    const islemTipi = this.requireEnum<HareketTipi>(
      payload.islemTipi || payload.operation || "BAKIYE",
      "Hareket tipi",
      ["BAKIYE", "ODEME"],
      "BAKIYE",
    );
    const etki = islemTipi === "ODEME" ? -amount : amount;
    const hareketler = this.getHareketRaw();
    const existing = hareketler.find(
      (item) => Number(item.id) === Number(payload.id || 0),
    );
    const now = this.nowIso();

    if (existing) {
      const oldRow = { ...existing };
      const oldFirma = existing.firma;
      existing.firma = firma;
      existing.tarih = this.normalizeDateInput(
        payload.tarih || existing.tarih || this.today(),
        "Tarih",
        true,
      );
      existing.islemTipi = islemTipi;
      existing.aciklama = this.cleanText(payload.aciklama);
      existing.tutar = amount;
      existing.etkisi = etki;
      existing.belge =
        this.cleanText(payload.belge) ||
        existing.belge ||
        `${sourceType}-${Date.now()}`;
      existing.sourceType = sourceType;
      existing.resmiDurum =
        (payload as any).resmiDurum === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI";
      existing.odemeSozuTarihi = this.normalizeDateInput(
        (payload as any).odemeSozuTarihi,
        "Ã–deme sÃ¶zÃ¼ tarihi",
      );
      existing.hatirlatmaTarihi = this.normalizeDateInput(
        (payload as any).hatirlatmaTarihi,
        "HatÄ±rlatma tarihi",
      );
      existing.takipNotu = this.cleanText((payload as any).takipNotu);
      existing.updatedAt = now;
      existing.createdAt = existing.createdAt || now;
      this.saveHareketRaw(hareketler);
      this.recalcCariBalancesForFirma(firma);
      if (this.firmaKey(oldFirma) !== this.firmaKey(firma)) {
        this.recalcCariBalancesForFirma(oldFirma);
      }
      const updated = this.getHareketRaw().find(
        (item) => Number(item.id) === Number(existing.id),
      );
      this.addActivityLog({
        entityType: "cari_movement",
        entityId: String(existing.id),
        actionType: "UPDATED",
        title: "Cari hareket gÃ¼ncellendi",
        description: `${firma} cari hareketi dÃ¼zeltildi`,
        oldValue: oldRow,
        newValue: updated || existing,
        source: sourceType || "MANUAL",
      });
      return updated || existing;
    }

    const row: CariHareketRow = {
      id: this.nextId(),
      firma,
      tarih: this.normalizeDateInput(
        payload.tarih || this.today(),
        "Tarih",
        true,
      ),
      islemTipi,
      aciklama: this.cleanText(payload.aciklama),
      tutar: amount,
      etkisi: etki,
      bakiye: 0,
      belge: this.cleanText(payload.belge) || `${sourceType}-${Date.now()}`,
      sourceType,
      resmiDurum:
        (payload as any).resmiDurum === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI",
      odemeSozuTarihi: this.normalizeDateInput(
        (payload as any).odemeSozuTarihi,
        "Ã–deme sÃ¶zÃ¼ tarihi",
      ),
      hatirlatmaTarihi: this.normalizeDateInput(
        (payload as any).hatirlatmaTarihi,
        "HatÄ±rlatma tarihi",
      ),
      takipNotu: this.cleanText((payload as any).takipNotu),
      createdAt: now,
      updatedAt: now,
    };

    hareketler.unshift(row);
    this.saveHareketRaw(hareketler);
    this.recalcCariBalancesForFirma(firma);
    const created = this.getHareketRaw().find(
      (item) => Number(item.id) === Number(row.id),
    );
    this.addActivityLog({
      entityType: "cari_movement",
      entityId: String(row.id),
      actionType: "CREATED",
      title: "Cari hareket oluÅŸturuldu",
      description: `${firma} iÃ§in yeni cari hareket kaydedildi`,
      oldValue: null,
      newValue: created || row,
      source: sourceType || "MANUAL",
    });
    return created || row;
  }

  getCariHareketDeleteSummary(id: number | string) {
    const hareketId = Number(id);
    if (!hareketId)
      throw new BadRequestException("Cari hareket id zorunludur.");
    const movement = this.getHareketRaw().find(
      (item) => item?.isDeleted !== true && Number(item.id) === hareketId,
    );
    if (!movement) throw new NotFoundException("Cari hareket bulunamadÄ±.");
    return {
      id: movement.id,
      firma: movement.firma,
      tarih: movement.tarih,
      sourceType: movement.sourceType,
      belge: movement.belge,
      tutar: movement.tutar,
      etki: movement.etkisi,
      message: "Yedek alÄ±narak cari hareket pasife alÄ±nacak.",
    };
  }

  deleteCariHareket(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const summary = this.getCariHareketDeleteSummary(id);
    const allRows = this.getHareketRaw();
    const movement = allRows.find((item) => Number(item.id) === Number(id));
    if (!movement) throw new NotFoundException("Cari hareket bulunamadÄ±.");

    const backupDir = this.createDeleteBackupDir([
      "deleted-cari-movements",
      mainCompany.slug,
      String(movement.id),
      this.backupStamp(),
    ]);
    this.writeBackupJson(backupDir, "movement.json", movement);
    this.writeBackupJson(backupDir, "linked-company.json", {
      firma: movement.firma,
      sourceType: movement.sourceType,
    });
    this.writeBackupJson(backupDir, "summary.json", {
      movementId: movement.id,
      firma: movement.firma,
      backupPath: backupDir,
      deletedAt: this.nowIso(),
    });

    const now = this.nowIso();
    this.saveHareketRaw(
      allRows.map((item) =>
        Number(item.id) === Number(movement.id)
          ? {
              ...item,
              isDeleted: true,
              deletedAt: now,
              updatedAt: now,
            }
          : item,
      ),
    );
    this.recalcCariBalancesForFirma(movement.firma);

    this.addActivityLog({
      entityType: "cari_movement",
      entityId: String(movement.id),
      actionType: "DELETED",
      title: "Cari hareket pasife alÄ±ndÄ±",
      description: `${movement.firma} cari hareket kaydÄ± veri kaybÄ±nÄ± Ã¶nlemek iÃ§in pasife alÄ±ndÄ±`,
      oldValue: movement,
      newValue: { backupPath: backupDir },
      source: "CARI_HAREKET_DELETE",
      recordName: movement.firma,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ok: true,
      message: "Cari hareket pasife alÄ±ndÄ±.",
      movementId: movement.id,
      backupPath: backupDir,
      preview: summary,
    };
  }

  getBelgeler() {
    return this.getBelgeRaw()
      .filter((row) => row?.isDeleted !== true)
      .map((row) => ({
        ...row,
        ...this.getDocumentRelationSummary(row),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteBelge(documentId: string) {
    const mainCompany = this.requireCurrentMainCompany();
    const normalizedDocumentId = this.requireText(documentId, "Belge id");
    const rows = this.getBelgeRaw();
    const row = rows.find((item) => item.documentId === normalizedDocumentId);
    if (!row) {
      throw new NotFoundException("Silinecek belge kaydÄ± bulunamadÄ±.");
    }

    const relationSummary = this.getDocumentRelationSummary(row);
    const now = this.nowIso();
    const nextRows = rows.map((item) =>
      item.documentId === normalizedDocumentId
        ? {
            ...item,
            isDeleted: true,
            deletedAt: now,
            updatedAt: now,
            isActive: false,
            status: item.status || "TASLAK",
          }
        : item,
    );
    this.saveBelgeRaw(nextRows);

    const hareketler = this.getHareketRaw();
    const linkedMovement = hareketler.find(
      (item) =>
        item.sourceType === "ALIS_GIDER_BELGE" &&
        this.cleanText(item.belge) === normalizedDocumentId,
    );
    if (linkedMovement) {
      const nowForMovement = this.nowIso();
      this.saveHareketRaw(
        hareketler.map((item) =>
          Number(item.id) === Number(linkedMovement.id)
            ? {
                ...item,
                isDeleted: true,
                deletedAt: nowForMovement,
                updatedAt: nowForMovement,
              }
            : item,
        ),
      );
      if (row.firma) {
        this.recalcCariBalancesForFirma(row.firma);
      } else {
        this.syncCariSummaries();
      }
    }

    const removedModelLink = this.clearModelDocumentLinks(mainCompany, row);
    const metricDraftPath = this.toAbsolutePathWithinWorkspace(
      row.metrics?.draftFilePath || "",
    );
    const fallbackDraftPath = this.toAbsolutePathWithinWorkspace(
      path.join(
        "uploads",
        "kyerp-data",
        mainCompany.slug,
        "_drafts",
        `${normalizedDocumentId}.json`,
      ),
    );
    const originalFilePath = this.toAbsolutePathWithinWorkspace(
      row.metrics?.originalRelativePath || "",
    );

    const draftJsonRemoved =
      this.removeFileIfExists(metricDraftPath) ||
      this.removeFileIfExists(fallbackDraftPath);

    let originalFileRemoved = false;
    if (originalFilePath) {
      const sharedOriginalFile = nextRows.some(
        (item) =>
          item.documentId !== normalizedDocumentId &&
          item.isDeleted !== true &&
          this.toAbsolutePathWithinWorkspace(
            item.metrics?.originalRelativePath || "",
          ) === originalFilePath,
      );
      if (!sharedOriginalFile) {
        originalFileRemoved = this.removeFileIfExists(originalFilePath);
      }
    }

    this.addActivityLog({
      entityType: "document",
      entityId: normalizedDocumentId,
      actionType: "DELETED",
      title: "Belge silindi",
      description: `${normalizedDocumentId} numaralÄ± belge silindi`,
      oldValue: row,
      newValue: {
        deleted: true,
        draftJsonRemoved,
        originalFileRemoved,
        linkedCariMovementRemoved: Boolean(linkedMovement),
        removedModelLink,
      },
      source: "BELGE_EDITOR",
    });

    return {
      ok: true,
      message: "Belge silindi.",
      documentId: normalizedDocumentId,
      status: row.status,
      sourceTab: row.sourceTab,
      bagliKayitVar: relationSummary.bagliKayitVar,
      iliskiOzeti: relationSummary,
      temizlenenler: {
        belgeKaydiSilindi: true,
        cariHareketSilindi: Boolean(linkedMovement),
        modelBaglantisiTemizlendi: removedModelLink,
        draftJsonSilindi: draftJsonRemoved,
        orijinalDosyaSilindi: originalFileRemoved,
      },
    };
  }

  saveBelge(payload: Partial<MuhasebeBelgeRow> & Record<string, any>) {
    const mainCompany = this.requireCurrentMainCompany();
    const rows = this.getBelgeRaw();
    const documentId =
      this.cleanText(payload.documentId) || `BELGE-${Date.now()}`;
    const now = this.nowIso();
    const existing = rows.find((item) => item.documentId === documentId);
    const nextStatus = this.requireEnum<string>(
      payload.status || "TASLAK",
      "Belge durumu",
      ["TASLAK", "ONAYLANDI"],
      "TASLAK",
    );
    const requestedFlowType =
      this.normalizeDocumentFlowType(
        payload.flowType || payload.workflowType || payload.header?.flowType,
      ) || "";
    const selectedCompanyId = this.cleanText(
      payload.selectedCompanyId || payload.matchedCompanyId,
    );
    const selectedCompanyName = this.cleanText(
      payload.selectedCompanyName ||
        payload.matchedCompanyName ||
        payload.firma,
    );
    const rawParsedCompanyName = this.cleanText(
      payload.rawParsedCompanyName ||
        payload.rawDetectedCompanyName ||
        payload.header?.companyName,
    );
    const detectedFlowType = this.normalizeDocumentFlowType(
      payload.metrics?.flowType ||
        payload.detectedFlowType ||
        payload.header?.detectedFlowType,
    );
    const flowType = requestedFlowType || detectedFlowType;
    const mappedWorkflowType = this.flowTypeToWorkflow(flowType);
    const enriched = this.enrichDocumentMatches({
      ...payload,
      firma: selectedCompanyName || payload.firma,
      matchedCompanyId: selectedCompanyId,
      matchedCompanyName: selectedCompanyName,
      rawDetectedCompanyName: rawParsedCompanyName,
      items: Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.parsedItems)
          ? payload.parsedItems
          : [],
      header: {
        ...(payload.header || {}),
        companyName:
          selectedCompanyName ||
          payload.header?.companyName ||
          rawParsedCompanyName ||
          payload.firma ||
          "",
      },
    });
    const resolvedCompanyName = this.cleanText(
      enriched.matchedCompanyName || enriched.firma || payload.firma,
    );
    const selectedModelKaydiId = this.cleanText(
      payload.modelKaydiId ||
        payload.header?.modelKaydiId ||
        existing?.modelKaydiId,
    );
    const selectedModelKaydi = selectedModelKaydiId
      ? this.modelStore.getById(
          mainCompany.slug,
          mainCompany.id,
          selectedModelKaydiId,
        )
      : null;
    if (selectedModelKaydiId && !selectedModelKaydi) {
      throw new BadRequestException("SeÃ§ilen model kaydÄ± bulunamadÄ±.");
    }
    const companyCard = this.getFirmaKartRaw().find(
      (item) =>
        this.firmaKey(item.firma) === this.firmaKey(resolvedCompanyName),
    );
    const isIncomingDispatchFlow =
      flowType === "GELEN_IRSALIYE" ||
      (requestedFlowType === "GELEN_IRSALIYE" && !flowType);
    if (
      nextStatus === "ONAYLANDI" &&
      !companyCard?.id &&
      !isIncomingDispatchFlow
    ) {
      throw new BadRequestException(
        "Belge onayÄ± iÃ§in baÄŸlÄ± firma seÃ§imi zorunludur. Ã–nce kayÄ±tlÄ± firma ile eÅŸleÅŸtirin.",
      );
    }
    const documentReview = this.getDocumentNeedsReviewState({
      warnings: enriched.warnings,
      metrics: enriched.metrics,
      candidateRows:
        Array.isArray(payload.candidateRows) && payload.candidateRows.length
          ? payload.candidateRows
          : (existing as any)?.candidateRows,
      items: Array.isArray(enriched.items) ? enriched.items : [],
      mode: enriched.mode,
    });
    const defaultRecordType = this.cleanText(
      companyCard?.varsayilanRecordType || "RESMI",
    );
    const incomingRecordType = this.cleanText(
      payload.header?.resmiDurum || payload.companyType,
    );
    const resolvedRecordType =
      incomingRecordType || defaultRecordType || "RESMI";
    const isDirectNonOfficialSupplierSave =
      (Boolean((payload as any).directCariSave) ||
        this.cleanText((payload as any).sourceType) === "MANUEL_DIREKT_CARI" ||
        this.cleanText((existing as any)?.sourceType) ===
          "MANUEL_DIREKT_CARI") &&
      this.cleanText(payload.sourceTab) === "tedarikci-fatura" &&
      flowType === "GELEN_FATURA" &&
      resolvedRecordType === "GAYRI_RESMI";

    const nextHeader: Record<string, any> = {
      ...(enriched.header || {}),
    };
    nextHeader.resmiDurum =
      this.cleanText(nextHeader.resmiDurum || resolvedRecordType) || "RESMI";
    nextHeader.date = this.normalizeDateInput(
      nextHeader.date ||
        payload.tarih ||
        existing?.header?.date ||
        this.today(),
      "Belge tarihi",
      true,
    );
    if (nextHeader.dueDate) {
      nextHeader.dueDate = this.normalizeOptionalDateInput(
        nextHeader.dueDate,
        "Vade tarihi",
      );
    }
    if (nextHeader.dispatchDate) {
      nextHeader.dispatchDate = this.normalizeOptionalDateInput(
        nextHeader.dispatchDate,
        "Ä°rsaliye tarihi",
      );
    }

    const flowMeta = this.flowTypeToDirectionAndType(flowType);
    const itemRows = Array.isArray(enriched.items) ? enriched.items : [];
    const computedModelFromItems =
      itemRows
        .map(
          (item) =>
            this.cleanText(item?.modelAdayi) ||
            this.extractModelCandidate(
              item?.rawDescription || item?.description || item?.aciklama,
            ),
        )
        .find(Boolean) || "";

    nextHeader.flowType = flowType;
    nextHeader.belgeYonu = this.cleanText(
      nextHeader.belgeYonu || payload.belgeYonu || flowMeta.belgeYonu,
    ).toLocaleLowerCase("tr-TR");
    nextHeader.belgeTipi = this.cleanText(
      nextHeader.belgeTipi || payload.belgeTipi || flowMeta.belgeTipi,
    ).toLocaleLowerCase("tr-TR");
    nextHeader.anaFirma = this.cleanText(
      payload.mainCompanyName || nextHeader.anaFirma || mainCompany.name,
    );
    nextHeader.tedarikciFirma = this.cleanText(
      nextHeader.tedarikciFirma || payload.tedarikciFirma || enriched.firma,
    );
    nextHeader.cariFirma = this.cleanText(
      nextHeader.cariFirma || payload.cariFirma || enriched.firma,
    );
    nextHeader.faturaNo = this.cleanText(
      nextHeader.faturaNo || payload.faturaNo || nextHeader.documentNo,
    );
    nextHeader.musteriIrsaliyeNo = this.cleanText(
      nextHeader.musteriIrsaliyeNo ||
        payload.musteriIrsaliyeNo ||
        payload.header?.musteriIrsaliyeNo,
    );
    nextHeader.irsaliyeNo = this.cleanText(
      nextHeader.irsaliyeNo || payload.irsaliyeNo || nextHeader.dispatchNo,
    );
    nextHeader.modelAdi = this.cleanText(
      nextHeader.modelAdi || payload.modelAdi || computedModelFromItems,
    );
    if (selectedModelKaydi) {
      nextHeader.modelKaydiId = selectedModelKaydi.id;
      nextHeader.modelAdi = selectedModelKaydi.modelAdi;
      nextHeader.zemin = this.cleanText(
        nextHeader.zemin || payload.zemin || selectedModelKaydi.zemin,
      );
      nextHeader.cariFirma = selectedModelKaydi.musteriFirma;
      nextHeader.tedarikciFirma = selectedModelKaydi.musteriFirma;
      nextHeader.anaFirma = selectedModelKaydi.anaFirma || mainCompany.name;
      if (nextHeader.belgeYonu === "giden") {
        nextHeader.musteriIrsaliyeNo = this.cleanText(
          nextHeader.musteriIrsaliyeNo ||
            payload.musteriIrsaliyeNo ||
            selectedModelKaydi.musteriIrsaliyeNo,
        );
        nextHeader.irsaliyeNo = this.cleanText(
          nextHeader.irsaliyeNo ||
            (nextHeader.belgeTipi === "irsaliye"
              ? payload.documentNo || payload.irsaliyeNo
              : nextHeader.musteriIrsaliyeNo || payload.irsaliyeNo) ||
            selectedModelKaydi.musteriIrsaliyeNo,
        );
        nextHeader.dispatchNo = this.cleanText(
          nextHeader.dispatchNo ||
            nextHeader.irsaliyeNo ||
            nextHeader.musteriIrsaliyeNo,
        );
      }
    }
    nextHeader.belgeAdediToplami = Number(
      payload.belgeAdediToplami ??
        nextHeader.belgeAdediToplami ??
        itemRows.reduce(
          (sum: number, item: any) =>
            sum + this.parseAmount(item?.quantity ?? item?.miktar),
          0,
        ) ??
        0,
    );
    nextHeader.faturalananAdet = Number(
      payload.faturalananAdet ??
        nextHeader.faturalananAdet ??
        (nextHeader.belgeTipi === "fatura" ? nextHeader.belgeAdediToplami : 0),
    );
    nextHeader.irsaliyeAdedi = Number(
      payload.irsaliyeAdedi ??
        nextHeader.irsaliyeAdedi ??
        (nextHeader.belgeTipi === "irsaliye"
          ? nextHeader.belgeAdediToplami
          : 0),
    );
    nextHeader.makinaKarsilastirmaKey = this.cleanText(
      payload.makinaKarsilastirmaKey ||
        nextHeader.makinaKarsilastirmaKey ||
        [nextHeader.modelAdi, nextHeader.irsaliyeNo].filter(Boolean).join("__"),
    );

    const itemsForVat = Array.isArray(enriched.items) ? enriched.items : [];
    const hasItemVat = itemsForVat.some((item) => {
      const rate = this.parseAmount(item?.kdvRate ?? item?.kdvOrani);
      const amount = this.parseAmount(item?.kdvAmount ?? item?.kdvTutari);
      return rate > 0 || amount > 0;
    });

    const headerSubtotal = this.parseAmount(nextHeader.subtotal);
    const headerKdv = this.parseAmount(nextHeader.kdv);
    const headerGrandTotal = this.parseAmount(nextHeader.grandTotal);
    const defaultVatRate = Number(companyCard?.varsayilanVatRate ?? 0);
    const defaultVatMode = this.cleanText(
      companyCard?.varsayilanVatMode || "HARIC",
    );
    const vatApplicable = companyCard?.vatApplicable !== false;

    // Belgede parser/manÃ¼el KDV varsa onu koru; boÅŸsa firma varsayÄ±lanÄ±nÄ± Ã¶neri olarak uygula.
    if (!hasItemVat && headerKdv <= 0) {
      if (vatApplicable && defaultVatRate > 0 && headerSubtotal > 0) {
        const suggestedKdv = Number(
          ((headerSubtotal * defaultVatRate) / 100).toFixed(2),
        );
        nextHeader.kdv = suggestedKdv;
        if (headerGrandTotal <= 0) {
          nextHeader.grandTotal =
            defaultVatMode === "DAHIL"
              ? Number(headerSubtotal.toFixed(2))
              : Number((headerSubtotal + suggestedKdv).toFixed(2));
        }
      } else if (!vatApplicable) {
        nextHeader.kdv = 0;
      }
    }

    const baseRow: MuhasebeBelgeRow = {
      documentId,
      modelKaydiId: selectedModelKaydi?.id || selectedModelKaydiId || "",
      documentType: this.requireText(
        payload.documentType ||
          flowType ||
          existing?.documentType ||
          "ALIS_GIDER",
        "Belge tipi",
      ),
      documentClass:
        this.cleanText(enriched.documentClass || payload.documentClass) ||
        "ALIS_GIDER_BELGESI",
      workflowType:
        this.cleanText(
          mappedWorkflowType || enriched.workflowType || payload.workflowType,
        ) || "GELEN_ALIS_FATURASI",
      companyType: nextHeader.resmiDurum,
      firma: this.cleanText(enriched.matchedCompanyName || enriched.firma),
      rawDetectedCompanyName: this.cleanText(enriched.rawDetectedCompanyName),
      rawParsedCompanyName: rawParsedCompanyName,
      matchedCompanyId: enriched.matchedCompanyId || "",
      matchedCompanyName: this.cleanText(enriched.matchedCompanyName),
      firmaEslesmeTipi: this.cleanText(enriched.firmaEslesmeTipi),
      sourceType:
        this.cleanText((payload as any).sourceType) ||
        this.cleanText((existing as any)?.sourceType) ||
        "MANUEL",
      sourceTab: this.cleanText(payload.sourceTab) || "alis-gider-belgeleri",
      pdfFileName: this.cleanText(payload.pdfFileName),
      status: nextStatus,
      header: nextHeader,
      items: Array.isArray(enriched.items) ? enriched.items : [],
      warnings: Array.isArray(enriched.warnings) ? enriched.warnings : [],
      metrics: {
        ...(enriched.metrics || {}),
        flowType: flowType || (enriched.metrics || {}).flowType || "",
      },
      candidateRows: Array.isArray(payload.candidateRows)
        ? payload.candidateRows
        : Array.isArray((existing as any)?.candidateRows)
          ? (existing as any).candidateRows
          : [],
      detectedProfile:
        this.cleanText(enriched.detectedProfile || payload.detectedProfile) ||
        "manual_core_mode",
      needsReview: isDirectNonOfficialSupplierSave
        ? false
        : documentReview.needsReview,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: companyCard?.id || enriched.matchedCompanyId || "",
      relatedCompanyName: companyCard?.firma || resolvedCompanyName,
    };
    const nextRow = this.attachMainCompanyOwnership(
      baseRow,
      companyCard || null,
    );

    if (nextStatus === "ONAYLANDI") {
      if (!flowType) {
        throw new BadRequestException(
          "Final kayÄ±tta belge yÃ¶nÃ¼/tipi zorunludur. 4 tipten birini seÃ§in.",
        );
      }
      if (detectedFlowType && flowType && detectedFlowType !== flowType) {
        throw new BadRequestException(
          "Parse edilen belge tipi ile seÃ§ilen belge tipi farklÄ±. YanlÄ±ÅŸ klasÃ¶rlemeyi Ã¶nlemek iÃ§in yÃ¶n/tip seÃ§imini dÃ¼zeltin.",
        );
      }
      if (!nextRow.documentType) {
        throw new BadRequestException(
          "Belge onayÄ± iÃ§in belge tipi zorunludur.",
        );
      }
      if (!nextRow.header?.belgeYonu || !nextRow.header?.belgeTipi) {
        throw new BadRequestException(
          "Final kayÄ±tta belge yÃ¶nÃ¼ ve belge tipi zorunludur.",
        );
      }
      if (!nextRow.firma && !this.cleanText(nextRow.header?.modelAdi)) {
        throw new BadRequestException(
          "Belge onayÄ± iÃ§in firma eÅŸleÅŸmesi zorunludur.",
        );
      }
      if (!nextRow.mainCompanyId || !nextRow.mainCompanySlug) {
        throw new BadRequestException("Gelen belgede ana firma zorunludur.");
      }
      if (!nextRow.header?.date) {
        throw new BadRequestException("Belge onayÄ± iÃ§in tarih zorunludur.");
      }
      const isIncomingDispatchFinal =
        nextRow.header?.belgeYonu === "gelen" &&
        nextRow.header?.belgeTipi === "irsaliye";
      if (
        !isIncomingDispatchFinal &&
        this.parseAmount(nextRow.header?.grandTotal) <= 0
      ) {
        throw new BadRequestException(
          "Belge onayÄ± iÃ§in genel toplam pozitif olmalÄ±dÄ±r.",
        );
      }
      if (!isIncomingDispatchFinal && nextRow.needsReview) {
        throw new BadRequestException(
          "Belge doÄŸrulama uyarÄ±larÄ± tamamlanmadan final onaya alÄ±namaz.",
        );
      }

      const isGiden = nextRow.header?.belgeYonu === "giden";
      const isGelen = nextRow.header?.belgeYonu === "gelen";
      const isIrsaliye = nextRow.header?.belgeTipi === "irsaliye";
      const isFatura = nextRow.header?.belgeTipi === "fatura";
      if (isGiden && isIrsaliye) {
        if (!this.cleanText(nextRow.header?.irsaliyeNo)) {
          throw new BadRequestException(
            "Giden irsaliyede irsaliye no zorunludur.",
          );
        }
      }
      if (isGiden && isFatura) {
        if (!this.cleanText(nextRow.header?.irsaliyeNo)) {
          throw new BadRequestException(
            "Giden faturada irsaliye no zorunludur.",
          );
        }
        if (!this.cleanText(nextRow.header?.faturaNo)) {
          throw new BadRequestException("Giden faturada fatura no zorunludur.");
        }
      }
      if (nextRow.header?.belgeYonu === "gelen") {
        if (!this.cleanText(nextRow.header?.anaFirma)) {
          throw new BadRequestException("Gelen belgede ana firma zorunludur.");
        }
        if (!this.cleanText(nextRow.firma)) {
          throw new BadRequestException("Gelen belgede firma zorunludur.");
        }
      }
      if (isGelen && isIrsaliye) {
        if (!this.cleanText(nextRow.header?.irsaliyeNo)) {
          throw new BadRequestException(
            "Gelen irsaliyede irsaliye no zorunludur.",
          );
        }
        const incomingQty = this.parseAmount(
          nextRow.header?.belgeAdediToplami ||
            nextRow.header?.irsaliyeAdedi ||
            nextRow.header?.gelenAdet,
        );
        if (incomingQty <= 0) {
          throw new BadRequestException(
            "Gelen irsaliyede gelen adet zorunludur.",
          );
        }
        if (!this.cleanText(nextRow.modelKaydiId)) {
          throw new BadRequestException(
            "Gelen irsaliyede final iÃ§in mevcut model baÄŸÄ± zorunludur.",
          );
        }
      }

      const duplicateDocumentNo = this.cleanText(
        isFatura
          ? nextRow.header?.faturaNo || nextRow.header?.documentNo
          : nextRow.header?.irsaliyeNo || nextRow.header?.documentNo,
      );
      if (duplicateDocumentNo) {
        const duplicateFinal = rows.find((item) => {
          if (item.documentId === documentId) return false;
          if (this.cleanText(item.status) !== "ONAYLANDI") return false;
          if (
            this.cleanText(item.mainCompanySlug) !==
            this.cleanText(mainCompany.slug)
          )
            return false;
          const itemFlow = this.normalizeDocumentFlowType(
            item.header?.flowType || item.workflowType,
          );
          if (itemFlow !== flowType) return false;
          const itemNo = this.cleanText(
            isFatura
              ? item.header?.faturaNo || item.header?.documentNo
              : item.header?.irsaliyeNo || item.header?.documentNo,
          );
          const itemCompany = this.firmaKey(
            item.matchedCompanyName ||
              item.firma ||
              item.header?.cariFirma ||
              item.header?.tedarikciFirma,
          );
          const nextCompany = this.firmaKey(
            nextRow.matchedCompanyName ||
              nextRow.firma ||
              nextRow.header?.cariFirma ||
              nextRow.header?.tedarikciFirma,
          );
          return (
            itemNo === duplicateDocumentNo &&
            (!itemCompany || !nextCompany || itemCompany === nextCompany)
          );
        });
        if (duplicateFinal) {
          throw new BadRequestException(
            `Bu belge no ile final kayÄ±t zaten var: ${duplicateDocumentNo}. Mevcut kaydÄ± aÃ§Ä±p gÃ¼ncelleyin.`,
          );
        }
      }
    }

    if (
      nextStatus === "ONAYLANDI" &&
      existing?.status !== "ONAYLANDI" &&
      this.cleanText(nextRow.sourceTab) === "tedarikci-fatura" &&
      nextRow.header?.belgeYonu === "gelen" &&
      nextRow.header?.belgeTipi === "fatura"
    ) {
      this.syncIncomingDocumentLotsToProducts(nextRow);
    }

    const next = [
      nextRow,
      ...rows.filter((item) => item.documentId !== documentId),
    ];
    this.saveBelgeRaw(next);
    const backupPath =
      nextRow.status === "ONAYLANDI"
        ? this.backupOutgoingDocumentFile(mainCompany, nextRow)
        : "";

    if (
      this.normalizeDocumentFlowType(
        nextRow.header?.flowType || nextRow.workflowType,
      ) === "GELEN_IRSALIYE" &&
      this.cleanText(nextRow.header?.modelAdi) &&
      this.cleanText(nextRow.header?.irsaliyeNo)
    ) {
      this.modelStore.saveModel(mainCompany.slug, mainCompany.id, {
        id: selectedModelKaydi?.id || "",
        forceNewModel: Boolean((payload as any)?.forceNewModel),
        anaFirma: nextRow.header?.anaFirma || mainCompany.name,
        musteriFirma: nextRow.firma || nextRow.header?.cariFirma || "",
        modelAdi: nextRow.header?.modelAdi,
        musteriIrsaliyeNo: nextRow.header?.irsaliyeNo,
        musteriIrsaliyeleri: [
          {
            dispatchNo: nextRow.header?.irsaliyeNo,
            date: nextRow.header?.date || this.today(),
            quantity:
              nextRow.header?.belgeAdediToplami ||
              nextRow.header?.irsaliyeAdedi ||
              0,
            companyName: nextRow.firma || nextRow.header?.cariFirma || "",
            zemin: nextRow.header?.zemin || "",
            piyonNo: nextRow.header?.piyonNo || "",
            kesimhaneAdi:
              nextRow.header?.kesimhaneAdi ||
              nextRow.header?.kesimhaneBilgisi ||
              "",
            sourceBelgeId: nextRow.documentId,
            note: nextRow.header?.aciklama || "",
          },
        ],
        zemin: nextRow.header?.zemin || "",
        gelenAdet:
          nextRow.header?.belgeAdediToplami ||
          nextRow.header?.irsaliyeAdedi ||
          0,
        not: nextRow.header?.aciklama || "",
        tarih: nextRow.header?.date || this.today(),
        kaynak: "Muhasebe Gelen Ä°rsaliye",
        gelenBelgeId: nextRow.documentId,
        gelenBelgePdf: nextRow.metrics?.previewUrl || nextRow.pdfFileName || "",
      });
    }

    const belgeCariSourceType =
      nextRow.sourceTab === "tedarikci-fatura"
        ? "TEDARIKCI_FATURA"
        : "ALIS_GIDER_BELGE";
    const existingBelgeHareket = this.getHareketRaw().find(
      (item) =>
        this.cleanText(item.sourceType) === belgeCariSourceType &&
        this.cleanText(item.belge) === documentId,
    );

    const hareketFirma = this.cleanText(companyCard?.firma || "");
    if (hareketFirma) {
      this.ensureFirmaCard(hareketFirma);
      const alisGider = ["alis-gider-belgeleri", "tedarikci-fatura"].includes(
        this.cleanText(nextRow.sourceTab),
      );
      if (alisGider && nextRow.status === "ONAYLANDI") {
        const total = this.parseAmount(nextRow.header?.grandTotal || 0);
        this.saveCariHareket({
          id: existingBelgeHareket?.id,
          firma: hareketFirma,
          tarih: nextRow.header?.date || this.today(),
          islemTipi: "BAKIYE",
          aciklama: `Belge kaydÄ±: ${nextRow.documentClass}`,
          tutar: total,
          sourceType: belgeCariSourceType,
          belge: nextRow.documentId,
        });
      }
      if (alisGider && nextRow.status !== "ONAYLANDI" && existingBelgeHareket) {
        this.saveCariHareket({
          id: existingBelgeHareket.id,
          firma: hareketFirma,
          tarih: nextRow.header?.date || this.today(),
          islemTipi: "BAKIYE",
          aciklama: `Belge etkisi sÄ±fÄ±rlandÄ±: ${nextRow.documentClass}`,
          tutar: 0,
          sourceType: belgeCariSourceType,
          belge: nextRow.documentId,
        });
      }
    }

    const actionType = existing
      ? nextRow.status === "ONAYLANDI"
        ? "FINALIZED"
        : "UPDATED"
      : nextRow.status === "ONAYLANDI"
        ? "FINALIZED"
        : "CREATED";
    this.addActivityLog({
      entityType: "document",
      entityId: documentId,
      actionType,
      title:
        actionType === "CREATED"
          ? "Belge oluÅŸturuldu"
          : actionType === "FINALIZED"
            ? "Belge final onaya alÄ±ndÄ±"
            : "Belge gÃ¼ncellendi",
      description: `${documentId} numaralÄ± belge ${
        actionType === "CREATED"
          ? "oluÅŸturuldu"
          : actionType === "FINALIZED"
            ? "final kaydedildi"
            : "gÃ¼ncellendi"
      }`,
      oldValue: existing || null,
      newValue: nextRow,
      source: "BELGE_EDITOR",
    });

    return {
      ...nextRow,
      backupPath,
    };
  }

  getUrunler() {
    const aliases = this.getProductAliasesRaw();
    const documents = this.getProductDocumentRaw();
    return this.getNormalizedUrunRows()
      .map((row) => {
        const visibleDocuments = this.getVisibleProductDocuments(row);
        const coverage = this.getProductDocumentCoverage(row, visibleDocuments);
        return {
          ...row,
          aliasCount: aliases.filter(
            (item) =>
              item.isDeleted !== true &&
              Number(item.matchedProductId) === Number(row.id),
          ).length,
          evrakSayisi: documents.filter(
            (item) =>
              item.isDeleted !== true &&
              Number(item.productId) === Number(row.id),
          ).length,
          gorunenEvrakSayisi: visibleDocuments.length,
          durumOnerisi: coverage.suggestedStatus,
          eksikEvrakTipleri: coverage.missingTypes,
        };
      })
      .sort((a, b) =>
        a.urunAdi.localeCompare(b.urunAdi, "tr", { sensitivity: "base" }),
      );
  }

  saveUrun(payload: Partial<UrunRow> & Record<string, any>) {
    const rows = this.getNormalizedUrunRows();
    const relatedCompany =
      payload.bagliFirmaId || payload.bagliFirma
        ? this.findCompanyCardByPayload(
            {
              companyId: payload.bagliFirmaId,
              companyName: payload.bagliFirma,
            },
            false,
          )
        : null;
    const nextRow: NormalizedUrunRow = this.normalizeUrunRow({
      id: Number(payload.id) || this.nextId(),
      urunAdi: this.requireText(payload.urunAdi, "ÃœrÃ¼n adÄ±"),
      ticariAdi: this.cleanText(payload.ticariAdi),
      kategori: this.cleanText(payload.kategori) || "Genel",
      birim: this.cleanText(payload.birim) || "ADET",
      bagliFirmaId: relatedCompany?.id || payload.bagliFirmaId,
      bagliFirma: relatedCompany?.firma || payload.bagliFirma,
      durum: payload.durum,
      varsayilanAmbalaj: this.cleanText(
        payload.varsayilanAmbalaj || payload.ambalaj,
      ),
      not: this.cleanText(payload.not),
      aktif: payload.aktif !== false,
      ambalajVaryantlari: Array.isArray(payload.ambalajVaryantlari)
        ? payload.ambalajVaryantlari
        : String(payload.ambalajVaryantlariMetni || "")
            .split(",")
            .map((item) => this.cleanText(item))
            .filter(Boolean),
      lotKayitlari: Array.isArray(payload.lotKayitlari)
        ? payload.lotKayitlari
        : rows.find((item) => Number(item.id) === Number(payload.id))
            ?.lotKayitlari || [],
      kullanilanLotlar: Array.isArray(payload.kullanilanLotlar)
        ? payload.kullanilanLotlar
        : rows.find((item) => Number(item.id) === Number(payload.id))
            ?.kullanilanLotlar || [],
      modelBazliHammaddeKullanimi: Array.isArray(
        payload.modelBazliHammaddeKullanimi,
      )
        ? payload.modelBazliHammaddeKullanimi
        : rows.find((item) => Number(item.id) === Number(payload.id))
            ?.modelBazliHammaddeKullanimi || [],
    });
    const nextKey = this.productCardKey(nextRow.urunAdi || nextRow.ticariAdi);
    const duplicate = rows.find((item) => {
      if (Number(item.id) === Number(nextRow.id)) return false;
      const key = this.productCardKey(item.urunAdi || item.ticariAdi);
      return key && nextKey && key === nextKey;
    });
    if (duplicate) {
      throw this.buildDuplicateException(
        "Bu Ã¼rÃ¼n mevcut gÃ¶rÃ¼nÃ¼yor. Yeni kart aÃ§mak yerine mevcut kaydÄ± gÃ¼ncelleyin veya eÅŸleÅŸtirme kullanÄ±n.",
        duplicate.id,
      );
    }

    const next = [nextRow, ...rows.filter((item) => item.id !== nextRow.id)];
    this.saveUrunRaw(next);
    return nextRow;
  }

  getUrunEvraklari(urunId: string | number) {
    const product = this.getNormalizedUrunRows().find(
      (item) => Number(item.id) === Number(urunId),
    );
    if (!product) {
      throw new NotFoundException("ÃœrÃ¼n evrak listesi iÃ§in Ã¼rÃ¼n bulunamadÄ±.");
    }
    const visibleDocuments = this.getVisibleProductDocuments(product);
    const coverage = this.getProductDocumentCoverage(product, visibleDocuments);
    return {
      productId: product.id,
      productName: product.urunAdi,
      productStatus: product.durum,
      suggestedStatus: coverage.suggestedStatus,
      requiredTypes: coverage.requiredTypes,
      missingTypes: coverage.missingTypes,
      rows: visibleDocuments,
    };
  }

  saveUrunEvragi(
    payload: Partial<ProductDocumentRow> & Record<string, any>,
    file?: any,
  ) {
    const mainCompany = this.requireCurrentMainCompany();
    const rows = this.getProductDocumentRaw();
    const scopeKey = this.cleanText(payload.scopeSelection).toLocaleLowerCase(
      "tr-TR",
    );
    const kapsamTipi =
      scopeKey === "maincompanyshared" || scopeKey === "companyshared"
        ? "shared"
        : this.normalizeProductDocumentScope(payload.kapsamTipi);
    const sharedScopeType =
      scopeKey === "maincompanyshared"
        ? "mainCompany"
        : scopeKey === "companyshared"
          ? "company"
          : this.normalizeSharedScopeType(payload.sharedScopeType);
    const productId =
      payload.productId !== undefined && payload.productId !== null
        ? Number(payload.productId) || this.cleanText(payload.productId)
        : "";
    const product =
      productId !== ""
        ? this.getNormalizedUrunRows().find(
            (item) => Number(item.id) === Number(productId),
          ) || null
        : null;
    if (kapsamTipi === "product" && !product) {
      throw new BadRequestException(
        "ÃœrÃ¼ne Ã¶zel belge iÃ§in Ã¼rÃ¼n seÃ§imi zorunlu.",
      );
    }
    const relatedCompany =
      sharedScopeType === "company" ||
      payload.companyId ||
      payload.companyName ||
      product?.bagliFirmaId
        ? this.findCompanyCardByPayload(
            {
              companyId: payload.companyId || product?.bagliFirmaId,
              companyName: payload.companyName || product?.bagliFirma,
            },
            sharedScopeType === "company",
          )
        : null;
    const relativePath = this.cleanText(
      payload.dosyaYolu ||
        (file?.path ? path.relative(process.cwd(), file.path) : ""),
    ).replace(/\\/g, "/");
    const mimeType = this.cleanText(payload.mimeType || file?.mimetype);
    const fileName = this.cleanText(payload.dosyaAdi || file?.originalname);
    if (!relativePath) {
      throw new BadRequestException("ÃœrÃ¼n evraÄŸÄ± iÃ§in dosya zorunludur.");
    }
    const belgeAdi =
      this.cleanText(payload.belgeAdi) ||
      this.cleanText(path.parse(fileName || relativePath).name);
    if (!belgeAdi) {
      throw new BadRequestException("Belge adÄ± zorunludur.");
    }
    const baseRow = this.normalizeProductDocumentRow({
      id: this.cleanText(payload.id),
      productId: kapsamTipi === "product" ? product?.id || productId : "",
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      companyId:
        sharedScopeType === "company"
          ? relatedCompany?.id || payload.companyId
          : product?.bagliFirmaId || "",
      companyName:
        sharedScopeType === "company"
          ? relatedCompany?.firma || payload.companyName
          : product?.bagliFirma || "",
      belgeTipi: payload.belgeTipi,
      belgeAdi,
      kapsamTipi,
      sharedScopeType: kapsamTipi === "shared" ? sharedScopeType : null,
      sharedScopeRef:
        kapsamTipi === "shared"
          ? sharedScopeType === "mainCompany"
            ? mainCompany.id
            : relatedCompany?.id || this.cleanText(payload.companyId) || null
          : null,
      dosyaYolu: relativePath,
      dosyaAdi: fileName,
      mimeType,
      not: payload.not,
      belgeTarihi: payload.belgeTarihi,
      gecerlilikBaslangic: payload.gecerlilikBaslangic,
      gecerlilikBitis: payload.gecerlilikBitis,
      isActive: payload.isActive !== false,
      isDeleted: false,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
      deletedAt: "",
    });
    const nextRows = [
      baseRow,
      ...rows.filter((item) => this.cleanText(item.id) !== baseRow.id),
    ];
    this.saveProductDocumentRaw(nextRows);
    this.addActivityLog({
      entityType: "product_document",
      entityId: baseRow.id,
      actionType: "CREATED",
      title: "ÃœrÃ¼n evraÄŸÄ± eklendi",
      description: `${baseRow.belgeAdi} Ã¼rÃ¼n evraÄŸÄ± kaydedildi`,
      oldValue: null,
      newValue: baseRow,
      source: "URUN_EVRAK",
      recordName: baseRow.belgeAdi,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });
    return baseRow;
  }

  updateUrunEvragi(
    id: string,
    payload: Partial<ProductDocumentRow> & Record<string, any>,
  ) {
    const rows = this.getProductDocumentRaw();
    const row = rows.find(
      (item) => this.cleanText(item.id) === this.cleanText(id),
    );
    if (!row || row.isDeleted) {
      throw new NotFoundException("GÃ¼ncellenecek Ã¼rÃ¼n evraÄŸÄ± bulunamadÄ±.");
    }
    const oldRow = { ...row };
    row.belgeTipi =
      payload.belgeTipi !== undefined
        ? this.normalizeProductDocumentType(payload.belgeTipi)
        : row.belgeTipi;
    row.belgeAdi =
      payload.belgeAdi !== undefined
        ? this.requireText(payload.belgeAdi, "Belge adÄ±")
        : row.belgeAdi;
    row.not = payload.not !== undefined ? this.cleanText(payload.not) : row.not;
    row.belgeTarihi =
      payload.belgeTarihi !== undefined
        ? this.normalizeOptionalDateInput(payload.belgeTarihi, "Belge tarihi")
        : row.belgeTarihi;
    row.gecerlilikBaslangic =
      payload.gecerlilikBaslangic !== undefined
        ? this.normalizeOptionalDateInput(
            payload.gecerlilikBaslangic,
            "GeÃ§erlilik baÅŸlangÄ±Ã§",
          )
        : row.gecerlilikBaslangic;
    row.gecerlilikBitis =
      payload.gecerlilikBitis !== undefined
        ? this.normalizeOptionalDateInput(
            payload.gecerlilikBitis,
            "GeÃ§erlilik bitiÅŸ",
          )
        : row.gecerlilikBitis;
    row.isActive =
      payload.isActive !== undefined ? Boolean(payload.isActive) : row.isActive;
    row.updatedAt = this.nowIso();
    this.saveProductDocumentRaw(rows);
    this.addActivityLog({
      entityType: "product_document",
      entityId: row.id,
      actionType: "UPDATED",
      title: "ÃœrÃ¼n evraÄŸÄ± gÃ¼ncellendi",
      description: `${row.belgeAdi} Ã¼rÃ¼n evraÄŸÄ± gÃ¼ncellendi`,
      oldValue: oldRow,
      newValue: row,
      source: "URUN_EVRAK",
      recordName: row.belgeAdi,
    });
    return row;
  }

  deactivateUrunEvragi(id: string) {
    const rows = this.getProductDocumentRaw();
    const row = rows.find(
      (item) => this.cleanText(item.id) === this.cleanText(id),
    );
    if (!row || row.isDeleted) {
      throw new NotFoundException("Pasife alÄ±nacak Ã¼rÃ¼n evraÄŸÄ± bulunamadÄ±.");
    }
    const oldRow = { ...row };
    row.isActive = false;
    row.isDeleted = true;
    row.deletedAt = this.nowIso();
    row.updatedAt = row.deletedAt;
    this.saveProductDocumentRaw(rows);
    this.addActivityLog({
      entityType: "product_document",
      entityId: row.id,
      actionType: "SOFT_DELETED",
      title: "ÃœrÃ¼n evraÄŸÄ± pasife alÄ±ndÄ±",
      description: `${row.belgeAdi} Ã¼rÃ¼n evraÄŸÄ± pasife alÄ±ndÄ±`,
      oldValue: oldRow,
      newValue: row,
      source: "URUN_EVRAK",
      recordName: row.belgeAdi,
    });
    return row;
  }

  getUrunEvrakDosya(id: string) {
    const row = this.getProductDocumentRaw().find(
      (item) => this.cleanText(item.id) === this.cleanText(id),
    );
    if (!row || row.isDeleted) {
      throw new NotFoundException("ÃœrÃ¼n evrak dosyasÄ± bulunamadÄ±.");
    }
    return row;
  }

  getUrunLotlari(urunId: string | number) {
    const product = this.getNormalizedUrunRows().find(
      (item) => Number(item.id) === Number(urunId),
    );
    if (!product) {
      throw new BadRequestException("Lot listesi iÃ§in Ã¼rÃ¼n bulunamadÄ±.");
    }
    return product.lotKayitlari.sort((a, b) =>
      String(b.girisTarihi || "").localeCompare(String(a.girisTarihi || "")),
    );
  }

  saveUrunLot(
    urunId: string | number,
    payload: Partial<UrunLotRow> & Record<string, any>,
  ) {
    const rows = this.getNormalizedUrunRows();
    const product = rows.find((item) => Number(item.id) === Number(urunId));
    if (!product) {
      throw new BadRequestException("Lot eklenecek Ã¼rÃ¼n bulunamadÄ±.");
    }
    const nextLot = this.normalizeLotRow({
      ...payload,
      ambalaj:
        payload.ambalaj ||
        product.varsayilanAmbalaj ||
        product.ambalajVaryantlari?.[0] ||
        "",
    });
    const lotRows = [
      nextLot,
      ...product.lotKayitlari.filter((item) => item.id !== nextLot.id),
    ];
    const nextVariants = Array.from(
      new Set(
        [
          product.varsayilanAmbalaj,
          ...(product.ambalajVaryantlari || []),
          nextLot.ambalaj,
        ].filter(Boolean),
      ),
    );
    const nextProduct = this.normalizeUrunRow({
      ...product,
      varsayilanAmbalaj: product.varsayilanAmbalaj || nextLot.ambalaj,
      ambalajVaryantlari: nextVariants,
      lotKayitlari: lotRows,
    });
    this.saveUrunRaw([
      nextProduct,
      ...rows.filter((item) => Number(item.id) !== Number(product.id)),
    ]);
    return nextLot;
  }

  private syncIncomingDocumentLotsToProducts(document: MuhasebeBelgeRow) {
    const supplier = this.cleanText(
      document.firma ||
        document.header?.tedarikciFirma ||
        document.header?.cariFirma,
    );
    const documentNo = this.cleanText(
      document.header?.faturaNo ||
        document.header?.irsaliyeNo ||
        document.header?.documentNo,
    );
    const entryDate = this.normalizeDateInput(
      document.header?.date || this.today(),
      "Lot giriÅŸ tarihi",
      true,
    );
    const aggregated = new Map();

    (Array.isArray(document.items) ? document.items : []).forEach(
      (item: any) => {
        const productId = Number(
          item?.urunId || item?.matchedProductId || item?.eslesenUrunId || 0,
        );
        const lotNo = this.cleanText(item?.lotNo || item?.lot);
        if (!productId || !lotNo) return;
        const miktar = this.parseAmount(
          item?.quantity2 || item?.kg || item?.quantity || item?.miktar,
        );
        if (!(miktar > 0)) return;
        const ambalaj = this.normalizePackageText(item?.ambalaj);
        const key = `${productId}__${lotNo}`;
        const current = aggregated.get(key);
        if (current) {
          current.miktar += miktar;
          if (!current.ambalaj && ambalaj) current.ambalaj = ambalaj;
          return;
        }
        aggregated.set(key, {
          productId,
          lotNo,
          miktar,
          ambalaj,
        });
      },
    );

    aggregated.forEach((row) => {
      const product = this.getNormalizedUrunRows().find(
        (item) => Number(item.id) === row.productId,
      );
      if (!product) return;
      const existingLot = product.lotKayitlari.find(
        (item) => this.cleanText(item.lotNo) === row.lotNo,
      );
      this.saveUrunLot(row.productId, {
        id: existingLot?.id,
        lotNo: row.lotNo,
        tedarikciFirma: supplier || product.bagliFirma,
        belgeNo: documentNo,
        belgeTarihi: entryDate,
        girisTarihi: entryDate,
        miktar: Number(existingLot?.miktar || 0) + row.miktar,
        kalanMiktar: Number(existingLot?.kalanMiktar || 0) + row.miktar,
        ambalaj:
          row.ambalaj ||
          existingLot?.ambalaj ||
          product.varsayilanAmbalaj ||
          product.ambalaj ||
          "",
        not: this.cleanText(
          existingLot?.not ||
            `Belgeden otomatik lot kaydÄ±: ${document.documentId}`,
        ),
      });
    });
  }

  getUrunDeleteSummary(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const product = this.getNormalizedUrunRows().find(
      (item) => Number(item.id) === Number(id),
    );
    if (!product) {
      throw new NotFoundException("Silinecek Ã¼rÃ¼n bulunamadÄ±.");
    }

    const productId = Number(product.id);
    const aliases = this.getProductAliasesRaw().filter(
      (item) =>
        item.isDeleted !== true && Number(item.matchedProductId) === productId,
    );
    const allDocuments = this.getBelgeRaw().filter(
      (item) => item.isDeleted !== true,
    );
    const documentLines: Array<{ documentId: string; line: any }> = [];
    for (const doc of allDocuments) {
      const lines = Array.isArray(doc?.items) ? doc.items : [];
      for (const line of lines) {
        const matchedId = Number(
          line?.urunId || line?.matchedProductId || line?.eslesenUrunId || 0,
        );
        if (matchedId === productId) {
          documentLines.push({
            documentId: this.cleanText(doc.documentId),
            line,
          });
        }
      }
    }

    const supplierLinks = documentLines.filter(({ documentId }) => {
      const doc = allDocuments.find(
        (item) =>
          this.cleanText(item.documentId) === this.cleanText(documentId),
      );
      return ["ALIS_GIDER_BELGE", "ALIS_FATURA", "TEDARIKCI_FATURA"].includes(
        this.cleanText(doc?.workflowType),
      );
    });

    const stockMovements = [
      ...(product.kullanilanLotlar || []),
      ...(product.modelBazliHammaddeKullanimi || []),
    ];

    const breakdown = {
      aliases: aliases.length,
      documentLines: documentLines.length,
      lots: (product.lotKayitlari || []).length,
      stockMovements: stockMovements.length,
      supplierLinks: supplierLinks.length,
      modelLotLinks: (product.modelBazliHammaddeKullanimi || []).length,
    };

    return {
      ok: true,
      productId: product.id,
      productName: product.urunAdi,
      tradeName: product.ticariAdi || "",
      mainCompanySlug: mainCompany.slug,
      breakdown,
      totalLinkedRecords: Object.values(breakdown).reduce(
        (sum, count) => sum + Number(count || 0),
        0,
      ),
      message: "Yedek alÄ±narak Ã¼rÃ¼n ve baÄŸlÄ± kayÄ±tlarÄ± kalÄ±cÄ± silinecek.",
    };
  }

  deleteUrun(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const summary = this.getUrunDeleteSummary(id);
    const product = this.getNormalizedUrunRows().find(
      (item) => Number(item.id) === Number(id),
    );
    if (!product) {
      throw new NotFoundException("Silinecek Ã¼rÃ¼n bulunamadÄ±.");
    }
    const productId = Number(product.id);
    const aliases = this.getProductAliasesRaw().filter(
      (item) => Number(item.matchedProductId) === productId,
    );

    const allDocuments = this.getBelgeRaw();
    const removedDocumentLines: Array<{ documentId: string; line: any }> = [];
    const nextDocuments = allDocuments.map((doc) => {
      const lines = Array.isArray(doc?.items) ? doc.items : [];
      const nextLines = lines.filter((line) => {
        const matchedId = Number(
          line?.urunId || line?.matchedProductId || line?.eslesenUrunId || 0,
        );
        const remove = matchedId === productId;
        if (remove) {
          removedDocumentLines.push({
            documentId: this.cleanText(doc.documentId),
            line,
          });
        }
        return !remove;
      });
      if (nextLines.length === lines.length) return doc;
      return {
        ...doc,
        items: nextLines,
        updatedAt: this.nowIso(),
      };
    });

    const backupDir = this.createDeleteBackupDir([
      "deleted-products",
      mainCompany.slug,
      `${this.slugifyForPath(product.urunAdi, "urun")}-${product.id}`,
      this.backupStamp(),
    ]);
    this.writeBackupJson(backupDir, "product.json", product);
    this.writeBackupJson(backupDir, "aliases.json", aliases);
    this.writeBackupJson(
      backupDir,
      "document-lines.json",
      removedDocumentLines,
    );
    this.writeBackupJson(backupDir, "lots.json", product.lotKayitlari || []);
    this.writeBackupJson(backupDir, "stock-movements.json", [
      ...(product.kullanilanLotlar || []),
      ...(product.modelBazliHammaddeKullanimi || []),
    ]);
    this.writeBackupJson(
      backupDir,
      "supplier-links.json",
      removedDocumentLines,
    );
    this.writeBackupJson(
      backupDir,
      "logs.json",
      this.getActivityLogRaw().filter(
        (row) => this.cleanText(row.entityId) === String(product.id),
      ),
    );
    this.writeBackupJson(backupDir, "summary.json", {
      ...summary,
      backupPath: backupDir,
      deletedAt: this.nowIso(),
    });

    this.saveUrunRaw(
      this.getNormalizedUrunRows().filter(
        (item) => Number(item.id) !== productId,
      ),
    );
    this.saveProductAliasesRaw(
      this.getProductAliasesRaw().filter(
        (item) => Number(item.matchedProductId) !== productId,
      ),
    );
    this.saveBelgeRaw(nextDocuments);
    this.rebuildVatPeriodsFromCurrentDocuments();

    this.addActivityLog({
      entityType: "product",
      entityId: String(product.id),
      actionType: "DELETED",
      title: "ÃœrÃ¼n silindi",
      description: `${product.urunAdi} Ã¼rÃ¼nÃ¼ baÄŸlÄ± kayÄ±tlarÄ± ile silindi`,
      oldValue: product,
      newValue: {
        backupPath: backupDir,
        removedDocumentLines: removedDocumentLines.length,
      },
      source: "URUN_DELETE",
      recordName: product.urunAdi,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ok: true,
      message: `${product.urunAdi} Ã¼rÃ¼nÃ¼ silindi.`,
      productId: product.id,
      backupPath: backupDir,
      summary,
    };
  }

  private isOfficialDocument(row: MuhasebeBelgeRow) {
    const recordType = this.cleanText(
      row?.header?.resmiDurum || row?.companyType || "RESMI",
    ).toLocaleUpperCase("tr-TR");
    return !recordType.includes("GAYRI");
  }

  private isVatEligibleDocument(row: MuhasebeBelgeRow) {
    const workflow = this.cleanText(row?.workflowType).toLocaleUpperCase(
      "tr-TR",
    );
    const klass = this.cleanText(row?.documentClass).toLocaleUpperCase("tr-TR");
    const sourceType = this.cleanText(
      (row as any)?.sourceType,
    ).toLocaleUpperCase("tr-TR");

    // Ä°rsaliyeler KDV Ã¼retmez
    if (workflow === "GELEN_IRSALIYE" || workflow === "BIZIM_IRSALIYE")
      return false;
    if (klass === "IRSALIYE") return false;

    // AÃ§Ä±lÄ±ÅŸ / bakiye / Ã¶deme hareketleri KDV Ã¼retmez
    const noVatSources = [
      "ACILIS_BAKIYESI",
      "IMPORT_ACILIS",
      "BAKIYE_DUZELTME",
      "IMPORT_BAKIYE_DUZELTME",
      "ODEME",
      "CEK",
      "KREDI_KARTI",
      "SALT_CARI",
    ];
    if (noVatSources.includes(sourceType)) return false;

    // Salt cari / Ã¶deme workflowlarÄ± KDV Ã¼retmez
    const noVatWorkflows = [
      "CARI_HAREKET",
      "ODEME_HAREKETI",
      "ACILIS_BAKIYESI",
      "BAKIYE_DUZELTME",
      "CEK_ALINDI",
      "CEK_VERILDI",
      "KREDI_KARTI",
    ];
    if (noVatWorkflows.includes(workflow)) return false;

    return true;
  }

  private toKdvPeriod(date: string) {
    const d = String(date || this.today()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    return d.slice(0, 7);
  }

  private classifyKdvDirection(row: MuhasebeBelgeRow): "ALIS" | "SATIS" {
    const workflow = this.cleanText(row?.workflowType).toLocaleUpperCase(
      "tr-TR",
    );
    const type = this.cleanText(row?.documentType).toLocaleUpperCase("tr-TR");
    const klass = this.cleanText(row?.documentClass).toLocaleUpperCase("tr-TR");

    // SatÄ±ÅŸ tarafÄ±: Bizim Fatura, resmi satÄ±ÅŸ faturalarÄ±, irsaliye yerine geÃ§en satÄ±ÅŸ faturalarÄ±
    if (
      workflow === "BIZIM_FATURA" ||
      type === "BIZIM_FATURA" ||
      klass === "BIZIM_FATURA"
    )
      return "SATIS";

    // IRSALIYE_YERINE_GECEN_FATURA: direction belge adÄ± veya tab'Ä±ndan anlaÅŸÄ±lÄ±r
    // sourceTab bizim satÄ±ÅŸ tabÄ±ysa SATIS, deÄŸilse ALIS
    const tab = this.cleanText((row as any)?.sourceTab).toLocaleLowerCase(
      "tr-TR",
    );
    if (
      klass === "IRSALIYE_YERINE_GECEN_FATURA" &&
      (tab.includes("satis") || tab.includes("bizim"))
    )
      return "SATIS";

    return "ALIS";
  }

  private classifyVatFlowSide(row: MuhasebeBelgeRow): "PURCHASE" | "SALES" {
    return this.classifyKdvDirection(row) === "SATIS" ? "SALES" : "PURCHASE";
  }

  private prevPeriod(period: string): string {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return "";
    const [y, m] = period.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  private getVatRows(
    mainCompanyId: string,
    period: string,
    filters: KdvReportFilter,
  ): KdvReportRow[] {
    const rows: KdvReportRow[] = [];

    const cards = this.getFirmaKartlari(mainCompanyId).filter(
      (item) => item.aktif && !item.hiddenFromMainList && !item.isAliasMerged,
    );
    const cardById = new Map(
      cards
        .filter((item) => item.id !== undefined && item.id !== null)
        .map((item) => [String(item.id), item]),
    );
    const cardByKey = new Map(
      cards.map((item) => [this.firmaKey(item.firma), item]),
    );

    const filterCompanyId = this.cleanText(filters.companyId);
    const filterCompanyName = this.cleanText(filters.companyName);
    const filterCompanyCard = filterCompanyId
      ? cardById.get(filterCompanyId)
      : filterCompanyName
        ? cardByKey.get(this.firmaKey(filterCompanyName))
        : null;
    const resolvedFilterCompanyId = filterCompanyCard
      ? String(filterCompanyCard.id)
      : filterCompanyId;
    const resolvedFilterCompanyName = this.cleanText(
      filterCompanyCard?.firma || filterCompanyName,
    ).toLocaleLowerCase("tr-TR");

    const filterDocumentNo = this.cleanText(
      filters.documentNo,
    ).toLocaleLowerCase("tr-TR");
    const filterDocumentType = this.cleanText(
      filters.documentType,
    ).toLocaleUpperCase("tr-TR");
    const filterPeriod = this.cleanText(filters.period);
    const filterFromDate = this.cleanText(filters.fromDate);
    const filterToDate = this.cleanText(filters.toDate);
    const vatRateFilterActive = this.cleanText(filters.vatRate) !== "";
    const filterVatRate = this.parseAmount(filters.vatRate);

    const approvedKdvRecords = this.db.readMainCompanyStore<any[]>(
      this.requireCompanyScopedSlug(),
      "kdv-records",
      [],
    );

    for (const record of approvedKdvRecords) {
      const date = this.cleanText(
        record?.date || record?.tarih || this.today(),
      ).slice(0, 10);
      const rowPeriod = this.toKdvPeriod(date);
      const rawCompanyName = this.cleanText(
        record?.companyName || record?.firma,
      );
      const companyCard = cardByKey.get(this.firmaKey(rawCompanyName)) || null;
      const companyId = this.cleanText(
        companyCard?.id || record?.companyId || "",
      );
      const companyName = this.cleanText(companyCard?.firma || rawCompanyName);
      const documentNo = this.cleanText(record?.belgeNo || record?.documentNo);
      const sourceType = this.cleanText(
        record?.sourceType || "supplier_invoice",
      );
      const documentType =
        sourceType === "supplier_invoice"
          ? "TEDARIKCI_FATURA"
          : sourceType.toLocaleUpperCase("tr-TR");
      const vatRate = this.parseAmount(record?.kdvRate ?? record?.vatRate);
      const vatAmount = this.parseAmount(
        record?.kdvAmount ?? record?.vatAmount,
      );
      const subtotal = this.parseAmount(record?.matrah ?? record?.subtotal);
      const grandTotal = this.parseAmount(record?.total ?? record?.grandTotal);
      const flowSide =
        this.cleanText(record?.direction).toLocaleLowerCase("tr-TR") === "giden"
          ? "SALES"
          : "PURCHASE";
      const direction = flowSide === "SALES" ? "SATIS" : "ALIS";

      if (resolvedFilterCompanyId && companyId !== resolvedFilterCompanyId)
        continue;
      if (
        resolvedFilterCompanyName &&
        !companyName
          .toLocaleLowerCase("tr-TR")
          .includes(resolvedFilterCompanyName)
      )
        continue;
      if (
        filterDocumentNo &&
        !documentNo.toLocaleLowerCase("tr-TR").includes(filterDocumentNo)
      )
        continue;
      if (
        filterDocumentType &&
        documentType.toLocaleUpperCase("tr-TR") !== filterDocumentType
      )
        continue;
      if (filterPeriod && rowPeriod !== filterPeriod) continue;
      if (!filterPeriod && rowPeriod !== period) continue;
      if (filterFromDate && date < filterFromDate) continue;
      if (filterToDate && date > filterToDate) continue;
      if (
        vatRateFilterActive &&
        Number(vatRate.toFixed(2)) !== Number(filterVatRate.toFixed(2))
      )
        continue;

      rows.push({
        id: this.cleanText(record?.id || `kdv-record-${rows.length + 1}`),
        date,
        companyId,
        companyName,
        documentNo,
        documentType,
        flowSide,
        recordType: "RESMI",
        subtotal,
        vatRate,
        vatAmount,
        grandTotal,
        source: "ONAY_API",
        sourceId: this.cleanText(record?.sourceId || record?.id || ""),
        direction,
      });
    }

    const documents = this.getBelgeler();

    for (const doc of documents) {
      if (this.cleanText(doc.status).toLocaleUpperCase("tr-TR") !== "ONAYLANDI")
        continue;
      if (!this.isOfficialDocument(doc)) continue;
      if (!this.isVatEligibleDocument(doc)) continue;

      const date = this.cleanText(
        doc.header?.date || doc.updatedAt || this.today(),
      ).slice(0, 10);
      const rowPeriod = this.toKdvPeriod(date);
      const documentNo = this.cleanText(doc.header?.documentNo);
      const documentType = this.cleanText(
        doc.documentClass || doc.documentType || doc.workflowType,
      );
      const rawCompanyName = this.cleanText(
        doc.matchedCompanyName || doc.firma || doc.header?.companyName,
      );
      const matchedCompanyId = this.cleanText(doc.matchedCompanyId || "");
      const companyCard =
        (matchedCompanyId && cardById.get(matchedCompanyId)) ||
        cardByKey.get(this.firmaKey(rawCompanyName)) ||
        null;
      const companyId = this.cleanText(companyCard?.id || matchedCompanyId);
      const companyName = this.cleanText(companyCard?.firma || rawCompanyName);
      const vatApplicable =
        companyCard?.vatApplicable !== false &&
        doc?.header?.vatApplicable !== false;

      if (!vatApplicable) continue;
      if (resolvedFilterCompanyId && companyId !== resolvedFilterCompanyId)
        continue;
      if (
        resolvedFilterCompanyName &&
        !companyName
          .toLocaleLowerCase("tr-TR")
          .includes(resolvedFilterCompanyName)
      )
        continue;
      if (
        filterDocumentNo &&
        !documentNo.toLocaleLowerCase("tr-TR").includes(filterDocumentNo)
      )
        continue;
      if (
        filterDocumentType &&
        documentType.toLocaleUpperCase("tr-TR") !== filterDocumentType
      )
        continue;
      if (filterPeriod && rowPeriod !== filterPeriod) continue;
      if (!filterPeriod && rowPeriod !== period) continue;
      if (filterFromDate && date < filterFromDate) continue;
      if (filterToDate && date > filterToDate) continue;

      const recordType =
        this.cleanText(doc.header?.resmiDurum || doc.companyType || "RESMI") ||
        "RESMI";
      const subtotal = this.parseAmount(doc.header?.subtotal);
      const grandTotal = this.parseAmount(doc.header?.grandTotal);
      const headerVat = this.parseAmount(doc.header?.kdv);
      const flowSide = this.classifyVatFlowSide(doc);
      const direction = flowSide === "SALES" ? "SATIS" : "ALIS";

      const vatBreakdown = new Map<number, number>();
      const items = Array.isArray(doc.items) ? doc.items : [];
      for (const item of items) {
        const rate = this.parseAmount(item?.kdvRate ?? item?.kdvOrani);
        const amount = this.parseAmount(item?.kdvAmount ?? item?.kdvTutari);
        if (amount === 0 && rate === 0) continue;
        const key = Number(rate.toFixed(2));
        vatBreakdown.set(key, Number((vatBreakdown.get(key) || 0) + amount));
      }

      if (vatBreakdown.size === 0) {
        const derivedRate =
          subtotal > 0 ? Number(((headerVat / subtotal) * 100).toFixed(2)) : 0;
        const defaultRate = Number(companyCard?.varsayilanVatRate ?? 0);
        const fallbackRate = Number(
          (derivedRate || defaultRate || 0).toFixed(2),
        );
        if (headerVat > 0 || subtotal > 0 || grandTotal > 0) {
          vatBreakdown.set(fallbackRate, headerVat);
        }
      }

      if (vatBreakdown.size === 0) continue;

      for (const [vatRate, vatAmountValue] of vatBreakdown.entries()) {
        const vatAmount = Number(vatAmountValue || 0);
        if (
          vatRateFilterActive &&
          Number(vatRate.toFixed(2)) !== Number(filterVatRate.toFixed(2))
        )
          continue;

        rows.push({
          id: `${doc.documentId}_${vatRate}_${rows.length + 1}`,
          date,
          companyId,
          companyName,
          documentNo,
          documentType,
          flowSide,
          recordType,
          subtotal,
          vatRate,
          vatAmount,
          grandTotal,
          source: "BELGE",
          sourceId: String(doc.documentId || ""),
          direction,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(a.companyName).localeCompare(String(b.companyName), "tr", {
        sensitivity: "base",
      });
    });

    return rows;
  }

  private getVatSummary(
    mainCompanyId: string,
    period: string,
    rows: KdvReportRow[],
    carriedVatFromPreviousMonth: number,
  ): KdvReportSummary {
    const summary: KdvReportSummary = {
      period,
      totalPurchaseVat: 0,
      totalSalesVat: 0,
      carriedVatFromPreviousMonth: Number(carriedVatFromPreviousMonth || 0),
      netVat: 0,
      carriedVatToNextMonth: 0,
      documentCount: 0,
      rateBreakdown: [],
    };
    const countedDocuments = new Set<string>();
    const rateMap = new Map<
      number,
      { purchaseVat: number; salesVat: number }
    >();

    for (const row of rows) {
      if (row.vatAmount > 0) {
        const rate = Number(Number(row.vatRate || 0).toFixed(2));
        const current = rateMap.get(rate) || { purchaseVat: 0, salesVat: 0 };
        if (row.flowSide === "SALES") {
          summary.totalSalesVat += row.vatAmount;
          current.salesVat += row.vatAmount;
        } else {
          summary.totalPurchaseVat += row.vatAmount;
          current.purchaseVat += row.vatAmount;
        }
        rateMap.set(rate, current);

        if (!countedDocuments.has(row.sourceId)) {
          countedDocuments.add(row.sourceId);
          summary.documentCount += 1;
        }
      }
    }

    summary.totalPurchaseVat = Number(summary.totalPurchaseVat.toFixed(2));
    summary.totalSalesVat = Number(summary.totalSalesVat.toFixed(2));

    const rawNet =
      summary.totalSalesVat -
      summary.totalPurchaseVat -
      summary.carriedVatFromPreviousMonth;
    summary.netVat = Number(rawNet.toFixed(2));
    summary.carriedVatToNextMonth =
      summary.netVat < 0 ? Number(Math.abs(summary.netVat).toFixed(2)) : 0;
    summary.rateBreakdown = Array.from(rateMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([vatRate, value]) => ({
        vatRate,
        purchaseVat: Number(value.purchaseVat.toFixed(2)),
        salesVat: Number(value.salesVat.toFixed(2)),
        netVat: Number((value.salesVat - value.purchaseVat).toFixed(2)),
      }));

    return summary;
  }

  private upsertVatPeriod(
    mainCompanyId: string,
    period: string,
    carriedVatData: {
      carriedVatFromPreviousMonth: number;
      purchaseVatTotal: number;
      salesVatTotal: number;
      netVat: number;
      carriedVatToNextMonth: number;
    },
  ): VatPeriodRow | null {
    if (!mainCompanyId) return null;
    return this.saveVatPeriod({
      period,
      mainCompanyId,
      carriedVatFromPreviousMonth: Number(
        carriedVatData.carriedVatFromPreviousMonth || 0,
      ),
      purchaseVatTotal: Number(carriedVatData.purchaseVatTotal || 0),
      salesVatTotal: Number(carriedVatData.salesVatTotal || 0),
      netVat: Number(carriedVatData.netVat || 0),
      carriedVatToNextMonth: Number(carriedVatData.carriedVatToNextMonth || 0),
    });
  }

  getKdvReport(filters: KdvReportFilter = {}): KdvReportResponse {
    const mainCompanyId = this.cleanText(this._ctxSlug);
    const targetPeriod =
      this.cleanText(filters.period) || this.toKdvPeriod(this.today());

    const prevP = this.prevPeriod(targetPeriod);
    const allPeriods = this.getVatPeriodsRaw();
    const currentPeriodRow =
      allPeriods.find((item) => item.period === targetPeriod) || null;
    const prevPeriodRow = prevP
      ? allPeriods.find((item) => item.period === prevP) || null
      : null;
    const carriedVatFromPreviousMonth = currentPeriodRow
      ? Number(currentPeriodRow.carriedVatFromPreviousMonth ?? 0)
      : Number(prevPeriodRow?.carriedVatToNextMonth ?? 0);

    const rows = this.getVatRows(mainCompanyId, targetPeriod, filters);
    const summary = this.getVatSummary(
      mainCompanyId,
      targetPeriod,
      rows,
      carriedVatFromPreviousMonth,
    );

    const vatPeriodRow = this.upsertVatPeriod(mainCompanyId, targetPeriod, {
      carriedVatFromPreviousMonth: summary.carriedVatFromPreviousMonth,
      purchaseVatTotal: summary.totalPurchaseVat,
      salesVatTotal: summary.totalSalesVat,
      netVat: summary.netVat,
      carriedVatToNextMonth: summary.carriedVatToNextMonth,
    });

    return {
      ok: true,
      summary,
      rows,
      vatPeriod: vatPeriodRow,
    };
  }

  getKdv(filters: KdvReportFilter = {}) {
    return this.getKdvReport(filters);
  }

  getDashboardSummary() {
    const companies = this.getFirmaKartlari();
    const cari = companies.map((item: any) => ({
      id: item.id,
      firma: item.firma,
      tip: item.tip,
      sonIslem: item.sonIslem || "",
      bakiye: this.roundAmount(Number(item.mevcutBakiye || 0)),
      odenenToplam: this.roundAmount(Number(item.odenenToplam || 0)),
      aktif: item.aktif,
      favori: item.favori,
    }));
    const payments = this.getOdemeler();
    const checks = this.getCekler();
    const creditCards = this.getKrediKartlari();
    const documents = this.getBelgeler();
    const products = this.getUrunler();
    const activityLogs = this.getActivityLogs(8);
    const today = this.today();
    const currentMonth = today.slice(0, 7);
    const now = new Date(`${today}T00:00:00`);

    const dateDiff = (value: any) => {
      const dateText = this.cleanText(value).slice(0, 10);
      if (!dateText) return Number.POSITIVE_INFINITY;
      const date = new Date(`${dateText}T00:00:00`);
      if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
      return Math.floor((date.getTime() - now.getTime()) / 86400000);
    };

    const upcomingChecks = checks.filter((row: any) => {
      const diff = dateDiff(row?.vadeTarihi);
      return diff >= 0 && diff <= 15;
    });
    const overdueChecks = checks.filter((row: any) => {
      const diff = dateDiff(row?.vadeTarihi);
      const status = this.cleanText(row?.durum).toLocaleLowerCase("tr-TR");
      return diff < 0 && !["kapandÄ±", "tahsil", "Ã¶dendi"].includes(status);
    });
    const openDocuments = documents.filter((row: any) => {
      const status = this.cleanText(row?.status).toLocaleUpperCase("tr-TR");
      return !["ONAYLANDI", "FINAL", "TAMAMLANDI"].includes(status);
    });
    const topCari = [...cari]
      .sort(
        (a: any, b: any) =>
          Math.abs(Number(b?.bakiye || 0)) - Math.abs(Number(a?.bakiye || 0)),
      )
      .slice(0, 12);
    const topChecks = [...checks]
      .sort((a: any, b: any) =>
        this.cleanText(a?.vadeTarihi).localeCompare(
          this.cleanText(b?.vadeTarihi),
        ),
      )
      .slice(0, 12);
    const topDocuments = openDocuments.slice(0, 12);
    const monthlyPayments = payments
      .filter((row: any) => this.cleanText(row?.tarih).startsWith(currentMonth))
      .reduce((sum: number, row: any) => sum + Number(row?.tutar || 0), 0);

    return {
      ok: true,
      mainCompany: this.getCurrentMainCompany(),
      generatedAt: this.nowIso(),
      kpis: {
        totalBalance: this.roundAmount(
          cari.reduce(
            (sum: number, row: any) => sum + Number(row?.bakiye || 0),
            0,
          ),
        ),
        monthlyPayments: this.roundAmount(monthlyPayments),
        upcomingChecksAmount: this.roundAmount(
          upcomingChecks.reduce(
            (sum: number, row: any) => sum + Number(row?.tutar || 0),
            0,
          ),
        ),
        creditCardDebt: this.roundAmount(
          creditCards.reduce(
            (sum: number, row: any) => sum + Number(row?.toplamBorc || 0),
            0,
          ),
        ),
        openDocuments: openDocuments.length,
        criticalReminder: overdueChecks.length + upcomingChecks.length,
      },
      companies: companies.slice(0, 12),
      companyCount: companies.length,
      cari: topCari,
      checks: topChecks,
      creditCards,
      documents: topDocuments,
      documentCount: documents.length,
      activityLogs,
      paymentsCount: payments.length,
      productsCount: Array.isArray(products) ? products.length : 0,
      reminders: [
        ...upcomingChecks.slice(0, 6).map((row: any) => ({
          type: "Ã‡ek",
          description: `${row.firma || "-"} - ${row.cekNo || ""}`,
          date: row.vadeTarihi || "",
          status: "YaklaÅŸan",
        })),
        ...openDocuments.slice(0, 6).map((row: any) => ({
          type: "Belge",
          description: row.header?.documentNo || row.documentId || "Belge",
          date: row.header?.date || row.createdAt || "",
          status: row.needsReview ? "Onay Bekleyen" : row.status || "Taslak",
        })),
      ].slice(0, 8),
    };
  }

  getOdemeler() {
    return this.annotateOwnership(
      this.getOdemeRaw().filter((row) => row?.isDeleted !== true),
    ).sort((a, b) => {
      if (a.tarih !== b.tarih) return b.tarih.localeCompare(a.tarih);
      return b.id - a.id;
    });
  }

  getOdemeTurleri() {
    return this.getOdemeTurleriRaw().sort((a, b) => {
      if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;
      return a.ad.localeCompare(b.ad, "tr", { sensitivity: "base" });
    });
  }

  saveOdemeTuru(payload: Partial<PaymentTypeRow> & Record<string, any>) {
    const rows = this.getOdemeTurleriRaw();
    const ad = this.cleanText(payload.ad);
    if (!ad) throw new Error("Ã–deme tÃ¼rÃ¼ adÄ± zorunludur.");

    const now = this.nowIso();
    const existing = rows.find((item) => item.id === Number(payload.id));
    const duplicate = rows.find(
      (item) =>
        item.id !== existing?.id &&
        this.cleanText(item.ad).toLocaleLowerCase("tr-TR") ===
          ad.toLocaleLowerCase("tr-TR"),
    );
    if (duplicate) throw new Error("Bu Ã¶deme tÃ¼rÃ¼ zaten mevcut.");

    if (existing) {
      existing.ad = ad;
      existing.aktif =
        payload.aktif !== undefined ? Boolean(payload.aktif) : true;
      existing.updatedAt = now;
      this.saveOdemeTurleriRaw(rows);
      return existing;
    }

    const next: PaymentTypeRow = {
      id: this.nextId(),
      ad,
      aktif: payload.aktif !== false,
      createdAt: now,
      updatedAt: now,
    };
    rows.unshift(next);
    this.saveOdemeTurleriRaw(rows);
    return next;
  }

  saveOdeme(payload: Partial<OdemeRow>) {
    const mainCompany = this.requireCurrentMainCompany();
    const firma = this.requireText(payload.firma, "BaÄŸlÄ± firma");
    const relatedCompany = this.findCompanyCardByPayload(
      payload as Record<string, any>,
      true,
    );

    const activePaymentTypes = this.getOdemeTurleri().filter(
      (item) => item.aktif,
    );
    const normalizedRequestedType = this.requireText(
      payload.odemeTuru,
      "Ã–deme tÃ¼rÃ¼",
    );
    const matchedType = activePaymentTypes.find(
      (item) =>
        item.ad.toLocaleLowerCase("tr-TR") ===
        normalizedRequestedType.toLocaleLowerCase("tr-TR"),
    );
    if (!matchedType) {
      throw new BadRequestException("GeÃ§erli ve aktif bir Ã¶deme tÃ¼rÃ¼ seÃ§in.");
    }
    const odemeTuru = matchedType.ad;

    const rows = this.getOdemeRaw();
    const existing = rows.find(
      (item) => Number(item.id) === Number(payload.id),
    );
    const selectedCard = this.cleanText(payload.relatedCardId)
      ? this.getKrediKartiRaw().find(
          (item) => String(item.id) === this.cleanText(payload.relatedCardId),
        ) || null
      : null;
    const selectedCheck = this.cleanText(payload.relatedCheckId)
      ? this.getCekRaw().find(
          (item) => String(item.id) === this.cleanText(payload.relatedCheckId),
        ) || null
      : null;
    const odemeTypeKey = odemeTuru.toLocaleLowerCase("tr-TR");
    if (odemeTypeKey.includes("kredi") && !selectedCard) {
      throw new Error("Kredi kartÄ± Ã¶demesinde baÄŸlÄ± kart zorunludur.");
    }
    if (
      (odemeTypeKey.includes("Ã§ek") || odemeTypeKey.includes("cek")) &&
      !selectedCheck
    ) {
      throw new Error("Ã‡ek Ã¶demesinde baÄŸlÄ± Ã§ek zorunludur.");
    }
    const paymentAmount = this.requireAmount(payload.tutar, "Ã–deme tutarÄ±");
    const currentCari = this.syncCariSummaries().find(
      (item) => this.firmaKey(item.firma) === this.firmaKey(firma),
    );
    const autoCariOnce = Number(currentCari?.bakiye || 0);
    const autoCariSonra = this.roundAmount(autoCariOnce - paymentAmount);
    const baseRow: OdemeRow = {
      id: existing?.id || this.nextId(),
      firma,
      tarih: this.normalizeDateInput(payload.tarih, "Ã–deme tarihi", true),
      odemeTuru,
      tutar: paymentAmount,
      aciklama: this.cleanText(payload.aciklama),
      resmiDurum:
        (payload as any).resmiDurum === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI",
      cariOnce:
        (payload as any).cariOnce !== undefined
          ? this.parseAmount((payload as any).cariOnce)
          : autoCariOnce,
      cariSonra:
        (payload as any).cariSonra !== undefined
          ? this.parseAmount((payload as any).cariSonra)
          : autoCariSonra,
      kalanTutar:
        (payload as any).kalanTutar !== undefined
          ? this.parseAmount((payload as any).kalanTutar)
          : Math.max(0, autoCariSonra),
      odemeSozuTarihi: this.normalizeDateInput(
        (payload as any).odemeSozuTarihi,
        "Ã–deme sÃ¶zÃ¼ tarihi",
      ),
      hatirlatmaTarihi: this.normalizeDateInput(
        (payload as any).hatirlatmaTarihi,
        "HatÄ±rlatma tarihi",
      ),
      haftaSonuHatirlat: Boolean((payload as any).haftaSonuHatirlat),
      cariNot: this.cleanText((payload as any).cariNot),
      relatedCardId: selectedCard?.id || "",
      relatedCardName: this.cleanText(
        selectedCard?.kartAdi || payload.relatedCardName,
      ),
      relatedCheckId: selectedCheck?.id || "",
      relatedCheckNo: this.cleanText(
        selectedCheck?.cekNo || payload.relatedCheckNo,
      ),
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: relatedCompany?.id || "",
      relatedCompanyName: relatedCompany?.firma || firma,
    };
    const row = this.attachMainCompanyOwnership(baseRow, relatedCompany);

    const nextRows = [row, ...rows.filter((item) => item.id !== row.id)];
    this.saveOdemeRaw(nextRows);

    this.saveCariHareket({
      id: existing ? row.id : undefined,
      firma,
      tarih: row.tarih,
      islemTipi: "ODEME",
      aciklama: row.aciklama || `Ã–deme / ${row.odemeTuru}`,
      tutar: row.tutar,
      sourceType: "ODEME",
      belge: `ODEME-${row.id}`,
    });

    this.addActivityLog({
      entityType: "payment",
      entityId: String(row.id),
      actionType: existing ? "UPDATED" : "CREATED",
      title: existing ? "Ã–deme gÃ¼ncellendi" : "Ã–deme oluÅŸturuldu",
      description: `${firma} iÃ§in Ã¶deme kaydÄ± ${existing ? "gÃ¼ncellendi" : "oluÅŸturuldu"}`,
      oldValue: existing || null,
      newValue: row,
      source: "ODEME",
      recordName: firma,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ...row,
      warning: null,
    };
  }

  getOdemeDeleteSummary(id: number | string) {
    const paymentId = Number(id);
    if (!paymentId) throw new BadRequestException("Ã–deme id zorunludur.");
    const row = this.getOdemeRaw().find(
      (item) => item?.isDeleted !== true && Number(item.id) === paymentId,
    );
    if (!row) throw new NotFoundException("Silinecek Ã¶deme bulunamadÄ±.");
    const linkedMovements = this.getHareketRaw().filter(
      (item) =>
        this.cleanText(item.sourceType) === "ODEME" &&
        this.cleanText(item.belge) === `ODEME-${row.id}`,
    );
    return {
      paymentId: row.id,
      companyName: row.firma,
      paymentType: row.odemeTuru,
      amount: row.tutar,
      breakdown: {
        linkedMovements: linkedMovements.length,
      },
      message: "Yedek alÄ±narak Ã¶deme kalÄ±cÄ± silinecek.",
    };
  }

  deleteOdeme(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const summary = this.getOdemeDeleteSummary(id);
    const row = this.getOdemeRaw().find(
      (item) => Number(item.id) === Number(id),
    );
    if (!row) throw new NotFoundException("Silinecek Ã¶deme bulunamadÄ±.");
    const allRows = this.getOdemeRaw();
    const allMovements = this.getHareketRaw();
    const linkedMovements = allMovements.filter(
      (item) =>
        this.cleanText(item.sourceType) === "ODEME" &&
        this.cleanText(item.belge) === `ODEME-${row.id}`,
    );

    const backupDir = this.createDeleteBackupDir([
      "deleted-payments",
      mainCompany.slug,
      String(row.id),
      this.backupStamp(),
    ]);
    this.writeBackupJson(backupDir, "payments", [row]);
    this.writeBackupJson(backupDir, "linked-company.json", {
      companyName: row.firma,
      companyId: row.relatedCompanyId || "",
    });
    this.writeBackupJson(backupDir, "logs.json", linkedMovements);
    this.writeBackupJson(backupDir, "summary.json", {
      ...summary,
      backupPath: backupDir,
      deletedAt: this.nowIso(),
    });

    const now = this.nowIso();
    this.saveOdemeRaw(
      allRows.map((item) =>
        Number(item.id) === Number(row.id)
          ? { ...item, isDeleted: true, deletedAt: now }
          : item,
      ),
    );
    this.saveHareketRaw(
      allMovements.map((item) =>
        this.cleanText(item.sourceType) === "ODEME" &&
        this.cleanText(item.belge) === `ODEME-${row.id}`
          ? {
              ...item,
              isDeleted: true,
              deletedAt: now,
              updatedAt: now,
            }
          : item,
      ),
    );
    this.recalcCariBalancesForFirma(row.firma);

    this.addActivityLog({
      entityType: "payment",
      entityId: String(row.id),
      actionType: "SOFT_DELETED",
      title: "Ã–deme iptal edildi",
      description: `${row.firma} Ã¶deme kaydÄ± veri kaybÄ±nÄ± Ã¶nlemek iÃ§in iptal/pasif yapÄ±ldÄ±`,
      oldValue: row,
      newValue: { backupPath: backupDir },
      source: "ODEME_DELETE",
      recordName: row.firma,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ok: true,
      message: "Ã–deme iptal/pasif yapÄ±ldÄ±.",
      paymentId: row.id,
      backupPath: backupDir,
      summary,
    };
  }

  getCekler() {
    return this.annotateOwnership(
      this.getCekRaw().filter((row) => row?.isDeleted !== true),
    ).sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi));
  }

  saveCek(payload: Partial<CekRow>) {
    const mainCompany = this.requireCurrentMainCompany();
    this.requireText(payload.cekNo, "Ã‡ek no");
    this.requireText(payload.firma, "BaÄŸlÄ± firma");
    const relatedCompany = this.findCompanyCardByPayload(
      payload as Record<string, any>,
      true,
    );

    const rows = this.getCekRaw();
    const existing = rows.find(
      (item) => Number(item.id) === Number(payload.id),
    );
    const normalizedVade = this.normalizeDateInput(
      payload.vadeTarihi,
      "Vade tarihi",
      true,
    );
    const duplicate = rows.find(
      (item) =>
        Number(item.id) !== Number(existing?.id) &&
        item.isDeleted !== true &&
        this.firmaKey(item.firma || "") ===
          this.firmaKey(relatedCompany?.firma || payload.firma || "") &&
        this.cleanText(item.cekNo) === this.cleanText(payload.cekNo) &&
        this.cleanText(item.vadeTarihi) === normalizedVade,
    );
    if (duplicate) {
      throw this.buildDuplicateException(
        "AynÄ± firma, Ã§ek no ve vade ile kayÄ±t zaten mevcut. Mevcut kaydÄ± gÃ¼ncelleyin.",
        duplicate.id,
      );
    }
    const baseRow: CekRow = {
      id: existing?.id || this.nextId(),
      firma: relatedCompany?.firma || this.cleanText(payload.firma),
      yon: this.requireEnum<"AlÄ±ndÄ±" | "Verildi">(
        payload.yon || "AlÄ±ndÄ±",
        "Ã‡ek yÃ¶nÃ¼",
        ["AlÄ±ndÄ±", "Verildi"],
        "AlÄ±ndÄ±",
      ),
      banka: this.requireText(payload.banka, "Banka"),
      cekNo: this.requireText(payload.cekNo, "Ã‡ek no"),
      kesideTarihi: this.normalizeDateInput(
        payload.kesideTarihi || this.today(),
        "KeÅŸide tarihi",
        true,
      ),
      vadeTarihi: normalizedVade,
      tutar: this.requireAmount(payload.tutar, "Ã‡ek tutarÄ±"),
      aciklama: this.cleanText(payload.aciklama),
      durum: this.requireEnum<string>(
        payload.durum || "PortfÃ¶yde",
        "Ã‡ek durumu",
        ["PortfÃ¶yde", "Tahsil", "Ciro", "Ä°ade", "KapandÄ±"],
        "PortfÃ¶yde",
      ),
      hesapNo: this.cleanText((payload as any).hesapNo),
      karsilikDurumu: this.requireEnum<"VAR" | "YOK" | "KISMEN" | "KONTROL">(
        (payload as any).karsilikDurumu || "KONTROL",
        "KarÅŸÄ±lÄ±k durumu",
        ["VAR", "YOK", "KISMEN", "KONTROL"],
        "KONTROL",
      ),
      karsilikTutar: Math.abs(
        this.parseAmount((payload as any).karsilikTutar || 0),
      ),
      odemeBaglantisi: this.cleanText((payload as any).odemeBaglantisi),
      relatedPaymentId: this.cleanText((payload as any).relatedPaymentId),
      relatedPaymentNote: this.cleanText((payload as any).relatedPaymentNote),
      hatirlatmaTarihi: this.normalizeDateInput(
        (payload as any).hatirlatmaTarihi,
        "HatÄ±rlatma tarihi",
      ),
      onFoto: this.cleanText(payload.onFoto),
      arkaFoto: this.cleanText(payload.arkaFoto),
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: relatedCompany?.id || "",
      relatedCompanyName: relatedCompany?.firma || "",
    };
    const row = this.attachMainCompanyOwnership(baseRow, relatedCompany);

    const nextRows = [row, ...rows.filter((item) => item.id !== row.id)];
    this.saveCekRaw(nextRows);

    this.addActivityLog({
      entityType: "check",
      entityId: String(row.id),
      actionType: existing ? "UPDATED" : "CREATED",
      title: existing ? "Ã‡ek gÃ¼ncellendi" : "Ã‡ek oluÅŸturuldu",
      description: `${row.cekNo || row.id} numaralÄ± Ã§ek ${existing ? "gÃ¼ncellendi" : "kaydedildi"}`,
      oldValue: existing || null,
      newValue: row,
      source: "CEK",
      recordName: row.cekNo || row.firma || "",
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ...row,
      warning: null,
    };
  }

  getCekDeleteSummary(id: number | string) {
    const checkId = Number(id);
    if (!checkId) throw new BadRequestException("Ã‡ek id zorunludur.");
    const check = this.getCekRaw().find(
      (item) => item?.isDeleted !== true && Number(item.id) === checkId,
    );
    if (!check) throw new NotFoundException("Silinecek Ã§ek bulunamadÄ±.");
    const linkedPayments = this.getOdemeRaw().filter(
      (item) =>
        item?.isDeleted !== true && Number(item.relatedCheckId) === checkId,
    );
    return {
      checkId: check.id,
      checkNo: check.cekNo,
      companyName: check.firma || "",
      amount: check.tutar,
      dueDate: check.vadeTarihi,
      status: check.durum,
      breakdown: {
        linkedPayments: linkedPayments.length,
      },
      message: "Yedek alÄ±narak Ã§ek ve baÄŸlÄ± Ã¶demeler pasife alÄ±nacak.",
    };
  }

  deleteCek(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const summary = this.getCekDeleteSummary(id);
    const check = this.getCekRaw().find(
      (item) => Number(item.id) === Number(id),
    );
    if (!check) throw new NotFoundException("Silinecek Ã§ek bulunamadÄ±.");
    const checkId = Number(check.id);
    const allChecks = this.getCekRaw();
    const allPayments = this.getOdemeRaw();
    const linkedPayments = allPayments.filter(
      (item) => Number(item.relatedCheckId) === checkId,
    );
    const linkedPaymentIds = new Set(
      linkedPayments.map((item) => Number(item.id)),
    );
    const allMovements = this.getHareketRaw();
    const linkedMovements = allMovements.filter(
      (item) =>
        linkedPaymentIds.has(
          Number(this.cleanText(item.belge).replace("ODEME-", "")),
        ) || this.cleanText(item.belge) === `CEK-${checkId}`,
    );

    const backupDir = this.createDeleteBackupDir([
      "deleted-checks",
      mainCompany.slug,
      String(check.id),
      this.backupStamp(),
    ]);
    this.writeBackupJson(backupDir, "check.json", check);
    this.writeBackupJson(backupDir, "linked-movements.json", linkedMovements);
    this.writeBackupJson(backupDir, "images.json", {
      onFoto: check.onFoto || "",
      arkaFoto: check.arkaFoto || "",
    });
    this.writeBackupJson(backupDir, "logs.json", linkedPayments);
    this.writeBackupJson(backupDir, "summary.json", {
      ...summary,
      linkedPaymentCount: linkedPayments.length,
      backupPath: backupDir,
      deletedAt: this.nowIso(),
    });

    const now = this.nowIso();
    this.saveCekRaw(
      allChecks.map((item) =>
        Number(item.id) === checkId
          ? {
              ...item,
              isDeleted: true,
              deletedAt: now,
              durum: item.durum === "KapandÄ±" ? item.durum : "Ä°ade",
            }
          : item,
      ),
    );
    this.saveOdemeRaw(
      allPayments.map((item) =>
        Number(item.relatedCheckId) === checkId
          ? { ...item, isDeleted: true, deletedAt: now }
          : item,
      ),
    );
    this.saveHareketRaw(
      allMovements.map((item) => {
        const paymentId = Number(
          this.cleanText(item.belge).replace("ODEME-", ""),
        );
        if (
          linkedPaymentIds.has(paymentId) ||
          this.cleanText(item.belge) === `CEK-${checkId}`
        ) {
          return { ...item, isDeleted: true, deletedAt: now, updatedAt: now };
        }
        return item;
      }),
    );
    if (check.firma) {
      this.recalcCariBalancesForFirma(check.firma);
    } else {
      this.syncCariSummaries();
    }

    this.addActivityLog({
      entityType: "check",
      entityId: String(check.id),
      actionType: "SOFT_DELETED",
      title: "Ã‡ek pasife alÄ±ndÄ±",
      description: `${check.cekNo || check.id} Ã§ek kaydÄ± veri kaybÄ±nÄ± Ã¶nlemek iÃ§in pasife alÄ±ndÄ±`,
      oldValue: check,
      newValue: {
        backupPath: backupDir,
        linkedPayments: linkedPayments.length,
      },
      source: "CEK_DELETE",
      recordName: check.cekNo || check.firma || "",
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ok: true,
      message: "Ã‡ek pasife alÄ±ndÄ±.",
      checkId: check.id,
      backupPath: backupDir,
      summary,
    };
  }

  getCekOzet() {
    const rows = this.getCekler();
    const today = this.today();
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const soonText = soon.toISOString().slice(0, 10);

    return {
      toplam: rows.length,
      bugun: rows.filter((item) => item.vadeTarihi === today).length,
      yaklasan: rows.filter(
        (item) => item.vadeTarihi > today && item.vadeTarihi <= soonText,
      ).length,
      geciken: rows.filter(
        (item) => item.vadeTarihi < today && item.durum !== "KapandÄ±",
      ).length,
    };
  }

  getKrediKartlari() {
    return this.annotateOwnership(
      this.getKrediKartiRaw().filter((row) => row?.isDeleted !== true),
    ).sort((a, b) => {
      const left = String(a.tarih || "");
      const right = String(b.tarih || "");
      if (left !== right) return right.localeCompare(left);
      return b.id - a.id;
    });
  }

  saveKrediKarti(payload: Partial<KrediKartiRow>) {
    const mainCompany = this.requireCurrentMainCompany();
    const relatedCompany = this.findCompanyCardByPayload(
      payload as Record<string, any>,
      true,
    );
    const rows = this.getKrediKartiRaw();
    const existing = rows.find(
      (item) => Number(item.id) === Number(payload.id),
    );
    const banka = this.requireText(payload.banka, "Banka");
    const kartAdi = this.cleanText(payload.kartAdi);
    const son4Hane = this.cleanText(payload.son4Hane);
    if (!kartAdi && !son4Hane) {
      throw new BadRequestException("Kart adÄ± veya son 4 hane zorunludur.");
    }
    const normalizedSonOdeme = this.normalizeDateInput(
      payload.sonOdemeTarihi,
      "Son Ã¶deme tarihi",
      true,
    );
    const duplicate = rows.find(
      (item) =>
        Number(item.id) !== Number(existing?.id) &&
        item.isDeleted !== true &&
        this.firmaKey(item.firma || "") ===
          this.firmaKey(relatedCompany?.firma || payload.firma || "") &&
        this.cleanText(item.banka) === banka &&
        this.cleanText(item.kartAdi || item.son4Hane) ===
          this.cleanText(kartAdi || son4Hane),
    );
    if (duplicate) {
      throw this.buildDuplicateException(
        "AynÄ± firma iÃ§in bu kredi kartÄ± zaten kayÄ±tlÄ±. Mevcut kaydÄ± gÃ¼ncelleyin.",
        duplicate.id,
      );
    }
    const baseRow: KrediKartiRow = {
      id: existing?.id || this.nextId(),
      kartAdi: kartAdi,
      banka,
      kartSahibi: this.cleanText(payload.kartSahibi),
      son4Hane,
      hesapNo: this.cleanText(payload.hesapNo),
      aciklama: this.cleanText(payload.aciklama),
      not: this.cleanText((payload as any).not),
      sonOdemeTarihi: normalizedSonOdeme,
      aktif: payload.aktif !== false,
      firma: relatedCompany?.firma || this.cleanText(payload.firma),
      tarih: this.normalizeDateInput(payload.tarih, "KayÄ±t tarihi"),
      tutar: Math.abs(this.parseAmount(payload.tutar || 0)),
      donem: this.cleanText(payload.donem),
      toplamBorc: this.requireAmount(
        (payload as any).toplamBorc,
        "Toplam borÃ§",
      ),
      asgariOdeme: Math.abs(
        this.parseAmount((payload as any).asgariOdeme || 0),
      ),
      kullanimAmaci: this.cleanText((payload as any).kullanimAmaci),
      cariEtki: Boolean(payload.cariEtki),
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: relatedCompany?.id || "",
      relatedCompanyName: relatedCompany?.firma || "",
    };
    const row = this.attachMainCompanyOwnership(baseRow, relatedCompany);

    const nextRows = [row, ...rows.filter((item) => item.id !== row.id)];
    this.saveKrediKartiRaw(nextRows);

    this.addActivityLog({
      entityType: "credit_card",
      entityId: String(row.id),
      actionType: existing ? "UPDATED" : "CREATED",
      title: existing ? "Kredi kartÄ± gÃ¼ncellendi" : "Kredi kartÄ± kaydedildi",
      description: `${row.kartAdi || row.id} kart kaydÄ± ${existing ? "gÃ¼ncellendi" : "oluÅŸturuldu"}`,
      oldValue: existing || null,
      newValue: row,
      source: "KREDI_KARTI",
      recordName: row.kartAdi || row.son4Hane || row.firma || "",
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ...row,
      warning: null,
    };
  }

  getKrediKartiDeleteSummary(id: number | string) {
    const cardId = Number(id);
    if (!cardId) throw new BadRequestException("Kredi kartÄ± id zorunludur.");
    const card = this.getKrediKartiRaw().find(
      (item) => item?.isDeleted !== true && Number(item.id) === cardId,
    );
    if (!card) throw new NotFoundException("Silinecek kredi kartÄ± bulunamadÄ±.");
    const linkedPayments = this.getOdemeRaw().filter(
      (item) =>
        item?.isDeleted !== true && Number(item.relatedCardId) === cardId,
    );
    return {
      cardId: card.id,
      cardName: card.kartAdi,
      last4: card.son4Hane,
      companyName: card.firma || "",
      period: card.donem || "",
      totalDebt: Number(card.toplamBorc || 0),
      breakdown: {
        linkedPayments: linkedPayments.length,
      },
      message: "Yedek alÄ±narak kredi kartÄ± ve baÄŸlÄ± Ã¶demeler pasife alÄ±nacak.",
    };
  }

  deleteKrediKarti(id: number | string) {
    const mainCompany = this.requireCurrentMainCompany();
    const summary = this.getKrediKartiDeleteSummary(id);
    const card = this.getKrediKartiRaw().find(
      (item) => Number(item.id) === Number(id),
    );
    if (!card) throw new NotFoundException("Silinecek kredi kartÄ± bulunamadÄ±.");
    const cardId = Number(card.id);
    const allCards = this.getKrediKartiRaw();
    const allPayments = this.getOdemeRaw();
    const linkedPayments = allPayments.filter(
      (item) => Number(item.relatedCardId) === cardId,
    );
    const linkedPaymentIds = new Set(
      linkedPayments.map((item) => Number(item.id)),
    );
    const allMovements = this.getHareketRaw();

    const backupDir = this.createDeleteBackupDir([
      "deleted-credit-cards",
      mainCompany.slug,
      String(card.id),
      this.backupStamp(),
    ]);
    this.writeBackupJson(backupDir, "credit-card.json", card);
    this.writeBackupJson(backupDir, "linked-payments", linkedPayments);
    this.writeBackupJson(
      backupDir,
      "logs.json",
      this.getActivityLogRaw().filter(
        (row) => this.cleanText(row.entityId) === String(card.id),
      ),
    );
    this.writeBackupJson(backupDir, "summary.json", {
      ...summary,
      backupPath: backupDir,
      deletedAt: this.nowIso(),
    });

    const now = this.nowIso();
    this.saveKrediKartiRaw(
      allCards.map((item) =>
        Number(item.id) === cardId
          ? {
              ...item,
              aktif: false,
              isDeleted: true,
              deletedAt: now,
            }
          : item,
      ),
    );
    this.saveOdemeRaw(
      allPayments.map((item) =>
        Number(item.relatedCardId) === cardId
          ? { ...item, isDeleted: true, deletedAt: now }
          : item,
      ),
    );
    this.saveHareketRaw(
      allMovements.map((item) => {
        const paymentId = Number(
          this.cleanText(item.belge).replace("ODEME-", ""),
        );
        return linkedPaymentIds.has(paymentId)
          ? { ...item, isDeleted: true, deletedAt: now, updatedAt: now }
          : item;
      }),
    );
    if (card.firma) {
      this.recalcCariBalancesForFirma(card.firma);
    } else {
      this.syncCariSummaries();
    }

    this.addActivityLog({
      entityType: "credit_card",
      entityId: String(card.id),
      actionType: "SOFT_DELETED",
      title: "Kredi kartÄ± pasife alÄ±ndÄ±",
      description: `${card.kartAdi || card.id} kart kaydÄ± veri kaybÄ±nÄ± Ã¶nlemek iÃ§in pasife alÄ±ndÄ±`,
      oldValue: card,
      newValue: {
        backupPath: backupDir,
        linkedPayments: linkedPayments.length,
      },
      source: "KREDI_KARTI_DELETE",
      recordName: card.kartAdi || card.son4Hane || "",
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });

    return {
      ok: true,
      message: "Kredi kartÄ± pasife alÄ±ndÄ±.",
      cardId: card.id,
      backupPath: backupDir,
      summary,
    };
  }

  getEpostaGruplari() {
    const mainCompany = this.requireCurrentMainCompany();
    const rows = this.annotateOwnership(this.getEpostaKisiRaw());
    const combos = new Map<
      string,
      { anaFirma: string; bagliFirma: string; departmanlar: string[] }
    >();

    for (const row of rows) {
      const key = `${row.anaFirma}__${row.gonderilenFirma}`;
      const current = combos.get(key) || {
        anaFirma: row.anaFirma,
        bagliFirma: row.gonderilenFirma,
        departmanlar: [],
      };
      if (!current.departmanlar.includes(row.departman))
        current.departmanlar.push(row.departman);
      combos.set(key, current);
    }

    const firmaKartlari = this.getFirmaKartlari();
    for (const sender of firmaKartlari) {
      const key = `${mainCompany.name}__${sender.firma}`;
      if (!combos.has(key)) {
        combos.set(key, {
          anaFirma: mainCompany.name,
          bagliFirma: sender.firma,
          departmanlar: [],
        });
      }
    }

    return Array.from(combos.values()).sort((a, b) =>
      `${a.anaFirma} ${a.bagliFirma}`.localeCompare(
        `${b.anaFirma} ${b.bagliFirma}`,
        "tr",
        {
          sensitivity: "base",
        },
      ),
    );
  }

  getEpostaKisileri(filters?: {
    anaFirma?: string;
    bagliFirma?: string;
    departman?: string;
  }) {
    return this.annotateOwnership(this.getEpostaKisiRaw()).filter((item) => {
      if (
        filters?.anaFirma &&
        this.firmaKey(item.anaFirma) !== this.firmaKey(filters.anaFirma)
      )
        return false;
      if (
        filters?.bagliFirma &&
        this.firmaKey(item.gonderilenFirma) !==
          this.firmaKey(filters.bagliFirma)
      )
        return false;
      if (
        filters?.departman &&
        this.cleanText(item.departman) !== this.cleanText(filters.departman)
      )
        return false;
      return true;
    });
  }

  saveEpostaKisi(payload: Partial<EpostaKisiRow>) {
    const mainCompany = this.requireCurrentMainCompany();
    const relatedCompany = this.findCompanyCardByPayload(
      payload as Record<string, any>,
      true,
    );
    const rows = this.getEpostaKisiRaw();
    const kisiAdi = this.requireText(payload.kisiAdi, "KiÅŸi adÄ±");
    const eposta = this.requireEmail(payload.eposta, "E-posta");
    const departman = this.normalizeDepartment(
      this.requireText(payload.departman, "Departman"),
    );
    const baseRow: EpostaKisiRow = {
      id: Number(payload.id) || this.nextId(),
      anaFirma: mainCompany.name,
      gonderilenFirma:
        relatedCompany?.firma ||
        this.requireText(payload.gonderilenFirma, "BaÄŸlÄ± firma"),
      firmaId: relatedCompany?.id || (payload as any).firmaId || "",
      firmaAdi:
        relatedCompany?.firma ||
        this.cleanText((payload as any).firmaAdi) ||
        this.cleanText(payload.gonderilenFirma),
      departman,
      departmanNo: this.cleanText((payload as any).departmanNo || departman),
      departmanKodlari: Array.isArray((payload as any).departmanKodlari)
        ? (payload as any).departmanKodlari
            .map((item: any) => this.cleanText(item))
            .filter(Boolean)
        : String((payload as any).departmanKodlari || departman)
            .split(",")
            .map((item) => this.cleanText(item))
            .filter(Boolean),
      kisiAdi,
      eposta,
      gorev: this.cleanText((payload as any).gorev),
      not: this.cleanText((payload as any).not),
      oncelikli: Boolean((payload as any).oncelikli),
      topluListe: Boolean((payload as any).topluListe),
      tasnifRaporuAlirMi: Boolean((payload as any).tasnifRaporuAlirMi),
      faturaMailiAlirMi: (payload as any).faturaMailiAlirMi !== false,
      irsaliyeMailiAlirMi: (payload as any).irsaliyeMailiAlirMi !== false,
      varsayilan: Boolean(payload.varsayilan),
      aktif: payload.aktif !== false,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
      relatedCompanyId: relatedCompany?.id || "",
      relatedCompanyName: relatedCompany?.firma || "",
    };
    const nextRow = this.attachMainCompanyOwnership(baseRow, relatedCompany);
    const duplicate = rows.find(
      (item) =>
        Number(item.id) !== Number(nextRow.id) &&
        this.firmaKey(item.gonderilenFirma) ===
          this.firmaKey(nextRow.gonderilenFirma) &&
        this.firmaKey(item.kisiAdi) === this.firmaKey(nextRow.kisiAdi) &&
        this.cleanText(item.eposta).toLocaleLowerCase("tr-TR") ===
          nextRow.eposta.toLocaleLowerCase("tr-TR"),
    );
    if (duplicate) {
      throw this.buildDuplicateException(
        "AynÄ± firma, kiÅŸi ve e-posta ile kayÄ±t zaten mevcut. Mevcut kaydÄ± gÃ¼ncelleyin.",
        duplicate.id,
      );
    }

    const next = [nextRow, ...rows.filter((item) => item.id !== nextRow.id)];

    if (nextRow.varsayilan) {
      for (const row of next) {
        if (
          row.id !== nextRow.id &&
          this.firmaKey(row.anaFirma) === this.firmaKey(nextRow.anaFirma) &&
          this.firmaKey(row.gonderilenFirma) ===
            this.firmaKey(nextRow.gonderilenFirma) &&
          this.cleanText(row.departman) === this.cleanText(nextRow.departman)
        ) {
          row.varsayilan = false;
        }
      }
    }

    this.saveEpostaKisiRaw(next);
    this.addActivityLog({
      entityType: "email_contact",
      entityId: String(nextRow.id),
      actionType: rows.some((item) => Number(item.id) === Number(nextRow.id))
        ? "UPDATED"
        : "CREATED",
      title: rows.some((item) => Number(item.id) === Number(nextRow.id))
        ? "E-posta kiÅŸi gÃ¼ncellendi"
        : "E-posta kiÅŸi kaydedildi",
      description: `${nextRow.kisiAdi} / ${nextRow.gonderilenFirma} e-posta kaydÄ± iÅŸlendi`,
      oldValue:
        rows.find((item) => Number(item.id) === Number(nextRow.id)) || null,
      newValue: nextRow,
      source: "EMAIL_CONTACT",
      recordName: nextRow.kisiAdi,
      mainCompanyId: mainCompany.id,
      mainCompanySlug: mainCompany.slug,
      mainCompanyName: mainCompany.name,
    });
    return {
      ...nextRow,
      warning: null,
    };
  }

  setVarsayilanForDepartment(payload: {
    anaFirma?: string;
    bagliFirma?: string;
    departman?: string;
  }) {
    this.requireCurrentMainCompany();
    const departman = this.normalizeDepartment(
      this.requireText(payload.departman, "Departman"),
    );
    const relatedCompany = this.findCompanyCardByPayload(
      {
        gonderilenFirma: payload.bagliFirma,
      },
      true,
    );
    const rows = this.getEpostaKisiRaw();
    for (const row of rows) {
      const match =
        this.firmaKey(row.anaFirma) ===
          this.firmaKey(this.requireCurrentMainCompany().name) &&
        this.firmaKey(row.gonderilenFirma) ===
          this.firmaKey(relatedCompany?.firma || "") &&
        this.cleanText(row.departman) === departman;
      row.varsayilan = match && row.aktif;
    }

    this.saveEpostaKisiRaw(rows);
    return this.getEpostaKisileri({
      anaFirma: payload.anaFirma,
      bagliFirma: payload.bagliFirma,
      departman,
    });
  }
}

// Controller can call withCtx(...) to route all subsequent raw file access

