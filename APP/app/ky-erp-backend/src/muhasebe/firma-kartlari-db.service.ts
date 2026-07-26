import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ListCompaniesQuery = {
  mainCompanySlug: string;
  page?: string;
  limit?: string;
  q?: string;
  type?: string;
  officialType?: string;
  active?: string;
  balanceFilter?: string;
  balanceType?: string;
  sort?: string;
};

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: unknown) {
  return cleanText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/Ä±/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ÄŸÃ¼ÅŸÃ¶Ã§Ä±Ä°ÄÃœÅÃ–Ã‡]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCompanyName(value: unknown) {
  const stopWords = new Set([
    "a",
    "s",
    "as",
    "aş",
    "anonim",
    "ltd",
    "limited",
    "sti",
    "şti",
    "sirketi",
    "şirketi",
    "san",
    "sanayi",
    "tic",
    "ticaret",
    "ve",
  ]);
  return normalizeName(value)
    .split(" ")
    .filter((part) => part.length > 1 && !stopWords.has(part))
    .join(" ");
}

function similarityScore(left: unknown, right: unknown) {
  const a = canonicalCompanyName(left);
  const b = canonicalCompanyName(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size || 1;
  return Math.round((common / total) * 100);
}

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  if (value == null) return 0;
  return Number(value);
}

function parseUserNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = cleanText(value).replace(/[₺\s]/g, "");
  if (!text) return 0;
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,(?=\d{3}(?:\D|$))/g, "");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function upper(value: unknown) {
  return cleanText(value).toUpperCase();
}

function normalizedToken(value: unknown) {
  return cleanText(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function officialTypeValue(value: unknown) {
  const raw = upper(value);
  if (["UNOFFICIAL", "GAYRI", "GAYRİ", "GAYRI_RESMI", "GAYRİ_RESMİ"].includes(raw))
    return "GAYRI";
  if (raw === "BOTH") return "BOTH";
  return "RESMI";
}

function firmTypeValue(value: unknown) {
  const raw = upper(value);
  if (["CUSTOMER", "MUSTERI", "MÜŞTERİ"].includes(raw)) return "MUSTERI";
  if (["SUPPLIER", "SATICI", "TEDARIKCI", "TEDARİKÇİ"].includes(raw))
    return "SATICI";
  if (raw === "BOTH") return "BOTH";
  return raw || "SATICI";
}

const COMPANY_TRANSACTION_PROFILES = new Set([
  "CUSTOMER",
  "SUPPLIER",
  "CUSTOMER_SUPPLIER",
  "CASH_EXPENSE",
  "VAT_ONLY_EXPENSE",
  "UNOFFICIAL_EXPENSE",
  "PERSONNEL_EXPENSE",
  "OTHER",
]);

const CASH_SETTLED_PROFILES = new Set([
  "CASH_EXPENSE",
  "VAT_ONLY_EXPENSE",
  "UNOFFICIAL_EXPENSE",
  "PERSONNEL_EXPENSE",
]);

const TRACKABLE_PROFILES = new Set([
  "CUSTOMER",
  "SUPPLIER",
  "CUSTOMER_SUPPLIER",
]);

const CURRENT_ACCOUNT_CREDIT_TYPES = new Set([
  "ALACAK",
  "TAHSILAT",
  "CEK_GIRISI",
  "CEK_TAHSILATI",
  "KREDI_KARTI_TAHSILATI",
  "IADE",
  "ISKONTO",
]);

const CURRENT_ACCOUNT_DEBIT_TYPES = new Set([
  "BORC",
  "ODEME",
  "KREDI_KARTI_ODEMESI",
  "CEK_ODEMESI",
  "SATIS",
  "FATURA",
  "BORCLANDIRMA",
]);

const CURRENT_ACCOUNT_SUPPLIER_INVOICE_TYPES = new Set(["ALIS", "GELEN_FATURA", "GIDER"]);

const CURRENT_ACCOUNT_SIGNED_TYPES = new Set(["VIRMAN", "DUZELTME", "BAKIYE"]);

const DEFAULT_REPORT_CATEGORIES = [
  ["Kesilen Fatura Geliri", "GELIR"],
  ["Sabit Giderler", "GIDER"],
  ["Personel Gideri", "PERSONEL"],
  ["Boya / Kimyasal", "GIDER"],
  ["Kalıp Gideri", "GIDER"],
  ["Ambalaj Gideri", "GIDER"],
  ["Yemek Gideri", "GIDER"],
  ["Kira Gideri", "GIDER"],
  ["KDV Matrah Dışı", "DIGER"],
  ["Diğer Giderler", "DIGER"],
].map(([ad, kategoriTipi], index) => ({
  ad,
  kategoriTipi,
  sira: index + 1,
}));

@Injectable()
export class FirmaKartlariDbService {
  constructor(private readonly prisma: PrismaService) {}

  private rawOf(row: any) {
    return asObject(row?.raw);
  }

  private openingDirectionOf(row: any) {
    return upper(
      this.rawOf(row).openingBalanceDirection ||
        this.rawOf(row).borcAlacakYonu ||
        "BORC",
    );
  }

  private openingSigned(row: any) {
    const openingBalance = Math.abs(decimalToNumber(row?.openingBalance));
    return this.openingDirectionOf(row) === "ALACAK"
      ? -openingBalance
      : openingBalance;
  }

  private balanceDirection(balance: number) {
    if (balance > 0) return "BORCLU";
    if (balance < 0) return "ALACAKLI";
    return "SIFIR";
  }

  private profileFromLegacy(row: any, raw = this.rawOf(row)) {
    const configured = upper(
      raw.companyTransactionProfile ||
        raw.calismaProfili ||
        raw.transactionProfile ||
        raw.cariSiniflandirma,
    );
    if (COMPANY_TRANSACTION_PROFILES.has(configured)) return configured;

    const postingType = upper(raw.defaultSupplierPostingType);
    if (postingType === "VAT_ONLY_EXPENSE") return "VAT_ONLY_EXPENSE";
    if (postingType && postingType !== "OPEN_PAYABLE") {
      return upper(raw.resmiGayri) === "GAYRI_RESMI" ||
        upper(raw.defaultVatType) === "KDV_YOK"
        ? "UNOFFICIAL_EXPENSE"
        : "CASH_EXPENSE";
    }

    const type = firmTypeValue(row?.type || raw.type || raw.tip);
    if (type === "MUSTERI") return "CUSTOMER";
    if (["BOTH", "GENEL"].includes(type)) return "CUSTOMER_SUPPLIER";
    if (type === "SATICI") return "SUPPLIER";
    return "OTHER";
  }

  private profileDefaults(profile: string, raw: Record<string, any> = {}) {
    const normalized = COMPANY_TRANSACTION_PROFILES.has(upper(profile))
      ? upper(profile)
      : "SUPPLIER";
    const explicitTrack =
      raw.trackReceivablePayable ??
      raw.cariTakipEdilsin ??
      raw.cariTakip ??
      undefined;
    const explicitCash =
      raw.defaultCashSettlement ??
      raw.varsayilanPesinKapama ??
      raw.pesinKapat ??
      undefined;
    const trackReceivablePayable = normalized === "UNOFFICIAL_EXPENSE"
      ? true
      : explicitTrack === undefined
        ? TRACKABLE_PROFILES.has(normalized)
        : explicitTrack !== false && explicitTrack !== "false";
    const defaultCashSettlement = normalized === "UNOFFICIAL_EXPENSE"
      ? false
      : explicitCash === undefined
        ? CASH_SETTLED_PROFILES.has(normalized)
        : explicitCash === true || explicitCash === "true";
    return {
      profile: normalized,
      trackReceivablePayable,
      defaultCashSettlement,
    };
  }

  private suggestedExpenseCategory(name: unknown, profile: string) {
    const text = cleanText(name).toLocaleUpperCase("tr-TR");
    if (profile === "VAT_ONLY_EXPENSE") return "KDV Matrah Dışı";
    if (profile === "PERSONNEL_EXPENSE") return "Personel gideri";
    if (profile === "UNOFFICIAL_EXPENSE") return "Gayri resmi gider";
    if (/ELEKTRIK|ELEKTR/.test(text)) return "Elektrik";
    if (/MARKET|BIM|A101|SOK|KUYUMCU/.test(text)) return "Market";
    if (/AKARYAKIT|PETROL|OPET|SHELL|BP/.test(text)) return "Akaryakit";
    if (/BORUSAN|TURKCELL|TTNET|TELEKOM|VODAFONE/.test(text))
      return "Hizmet";
    return "";
  }

  private expenseCalculationMode(rowOrRaw: any) {
    const raw =
      rowOrRaw?.raw && typeof rowOrRaw.raw === "object"
        ? rowOrRaw.raw
        : rowOrRaw && typeof rowOrRaw === "object"
          ? rowOrRaw
          : {};
    const profile = upper(
      raw.companyTransactionProfile ||
        raw.calismaProfili ||
        raw.transactionProfile,
    );
    const postingType = upper(raw.defaultSupplierPostingType);
    const mode = upper(raw.expenseCalculationMode || raw.giderHesaplamaTipi);
    if (
      profile === "VAT_ONLY_EXPENSE" ||
      postingType === "VAT_ONLY_EXPENSE" ||
      mode === "VAT_ONLY"
    ) {
      return "VAT_ONLY";
    }
    return mode || "FULL";
  }

  private isVatOnlyExpense(rowOrRaw: any) {
    return this.expenseCalculationMode(rowOrRaw) === "VAT_ONLY";
  }

  private vatPayablePercentage(rowOrRaw: any) {
    const raw =
      rowOrRaw?.raw && typeof rowOrRaw.raw === "object"
        ? rowOrRaw.raw
        : rowOrRaw && typeof rowOrRaw === "object"
          ? rowOrRaw
          : {};
    const value = Number(
      raw.vatPayablePercentage ?? raw.kdvCariBorcYuzdesi ?? 0,
    );
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }

  private currentAccountPostingMode(rowOrRaw: any) {
    const raw =
      rowOrRaw?.raw && typeof rowOrRaw.raw === "object"
        ? rowOrRaw.raw
        : rowOrRaw && typeof rowOrRaw === "object"
          ? rowOrRaw
          : {};
    const configured = upper(
      raw.currentAccountPostingMode || raw.cariKayitModu,
    );
    if (["FULL_DOCUMENT", "NONE", "VAT_PERCENTAGE"].includes(configured))
      return configured;
    if (this.isVatOnlyExpense(raw)) return "VAT_PERCENTAGE";
    return raw.trackReceivablePayable === false || raw.cariTakipEdilsin === false
      ? "NONE"
      : "FULL_DOCUMENT";
  }

  private reportBehaviorForCompany(row: any) {
    const raw = this.rawOf(row);
    const profile = this.profileFromLegacy(row, raw);
    const classification = this.classificationFor(row);
    const vatEnabled = upper(raw.defaultVatType) !== "KDV_YOK";
    const postingMode = this.currentAccountPostingMode(row);
    const code = profile === "UNOFFICIAL_EXPENSE"
      ? "UNOFFICIAL_EXPENSE"
      : classification.trackReceivablePayable
        ? vatEnabled
          ? "OFFICIAL_CARI"
          : "OFFICIAL_CARI_ONLY"
        : this.isVatOnlyExpense(row)
          ? "OFFICIAL_VAT_ONLY"
          : "OFFICIAL_CASH_VAT";
    const labels: Record<string, string> = {
      OFFICIAL_CARI: "KDV + Cari",
      OFFICIAL_CARI_ONLY: "Sadece Cari / KDV Yok",
      OFFICIAL_CASH_VAT: "Peşin Gider + KDV",
      OFFICIAL_VAT_ONLY: "KDV dahil / gider dışı",
      UNOFFICIAL_EXPENSE: "Gayri Gider",
    };
    const configuredReport = upper(raw.defaultReportBehavior || raw.varsayilanRaporDavranisi || "");
    const configuredExpense = upper(raw.defaultGeneralExpense || raw.genelGiderVarsayilani || "");
    const defaultIncluded = configuredReport === "DAHIL" || configuredReport === "RAPORA_DAHIL"
      ? true
      : configuredReport === "HARIC" || configuredReport === "RAPORDAN_HARIC"
        ? false
        : ["UNOFFICIAL_EXPENSE", "OFFICIAL_VAT_ONLY", "OFFICIAL_CASH_VAT"].includes(code)
          ? true
          : this.companyDefaultCategoryId(row)
            ? true
            : null;
    const defaultExpenseStatus = configuredExpense === "GENEL_GIDER"
      ? "GENEL_GIDER"
      : configuredExpense === "GIDER_DISI" || configuredExpense === "GENEL_GIDER_DEGIL"
        ? "GENEL_GIDER_DEGIL"
        : code === "UNOFFICIAL_EXPENSE"
          ? "GENEL_GIDER"
          : code === "OFFICIAL_VAT_ONLY"
            ? "GENEL_GIDER_DEGIL"
            : code === "OFFICIAL_CASH_VAT" || this.companyDefaultCategoryId(row)
              ? "GENEL_GIDER"
              : "KONTROL_BEKLIYOR";
    return {
      code,
      label: labels[code],
      officialType: code === "UNOFFICIAL_EXPENSE" ? "GAYRI_RESMI" : "RESMI",
      vatIncluded: vatEnabled && code !== "UNOFFICIAL_EXPENSE",
      currentAccountIncluded: postingMode !== "NONE",
      defaultIncluded,
      defaultExpenseStatus,
    };
  }

  private normalizeReportStatus(value: unknown) {
    const raw = upper(value);
    if (["DAHIL", "INCLUDED", "RAPORA_DAHIL"].includes(raw)) return "DAHIL";
    if (["HARIC", "EXCLUDED", "RAPORDAN_HARIC"].includes(raw)) return "HARIC";
    return "KONTROL_BEKLIYOR";
  }

  private normalizeExpenseStatus(value: unknown) {
    const raw = upper(value);
    if (["GENEL_GIDER", "GENERAL_EXPENSE"].includes(raw)) return "GENEL_GIDER";
    if (["GENEL_GIDER_DEGIL", "GENERAL_EXPENSE_EXCLUDED", "GIDER_DISI"].includes(raw)) return "GENEL_GIDER_DEGIL";
    return "KONTROL_BEKLIYOR";
  }

  private companyDefaultCategoryId(company: any) {
    return cleanText(
      company?.varsayilanRaporKategoriId ||
        company?.raw?.varsayilanRaporKategoriId ||
        company?.raw?.defaultReportCategoryId,
    );
  }

  private explicitCompanyReportStatus(company: any) {
    return this.normalizeReportStatus(
      company?.raw?.defaultReportBehavior ||
        company?.raw?.varsayilanRaporDavranisi,
    );
  }

  private explicitCompanyExpenseStatus(company: any) {
    return this.normalizeExpenseStatus(
      company?.raw?.defaultGeneralExpense ||
        company?.raw?.genelGiderVarsayilani,
    );
  }

  private categoryBySourceValue(
    value: unknown,
    byId: Map<string, any>,
    byName: Map<string, any>,
  ) {
    const key = cleanText(value);
    if (!key) return null;
    return byId.get(key) || byName.get(key) || null;
  }

  resolveCompanyAccountingBehavior(
    company: any,
    sourceRecord: Record<string, any>,
    override: Record<string, any> | null | undefined,
    categories: any[],
  ) {
      const byId = new Map(categories.map((row: any) => [row.id, row]));
      const byName = new Map(categories.map((row: any) => [row.ad, row]));
      const isCurrentAccountSource = upper(sourceRecord.sourceType) === "CURRENT_ACCOUNT";
      const behavior = this.reportBehaviorForCompany(company || {});
      const overrideCategory = this.categoryBySourceValue(
        override?.reportCategoryId,
        byId,
        byName,
      );
      const companyCategory = isCurrentAccountSource
        ? null
        : this.categoryBySourceValue(
            this.companyDefaultCategoryId(company),
            byId,
            byName,
          );
      const sourceCategory =
        this.categoryBySourceValue(
          sourceRecord.sourceCategoryId || sourceRecord.categoryId,
          byId,
          byName,
        ) ||
        this.categoryBySourceValue(
          sourceRecord.sourceCategoryName || sourceRecord.categoryName,
          byId,
          byName,
        );
      const effectiveCategory = overrideCategory || companyCategory || sourceCategory || null;
  
      const overrideReportStatus =
        override?.reportIncluded === null || override?.reportIncluded === undefined
          ? null
          : override.reportIncluded
            ? "DAHIL"
            : "HARIC";
      const companyReportStatus = isCurrentAccountSource
        ? "KONTROL_BEKLIYOR"
        : this.explicitCompanyReportStatus(company);
      const sourceReportStatus = this.normalizeReportStatus(sourceRecord.reportStatus);
      const inferredReportStatus =
        isCurrentAccountSource
          ? "HARIC"
          : sourceRecord.transactionType === "GELIR"
            ? "DAHIL"
          : behavior.defaultIncluded === true
          ? "DAHIL"
          : behavior.defaultIncluded === false
            ? "HARIC"
            : "KONTROL_BEKLIYOR";
      let reportStatus =
        overrideReportStatus ||
        (companyReportStatus !== "KONTROL_BEKLIYOR"
          ? companyReportStatus
          : inferredReportStatus !== "KONTROL_BEKLIYOR"
            ? inferredReportStatus
            : sourceReportStatus);
  
      const overrideExpenseStatus = override?.reportExpenseStatus
        ? this.normalizeExpenseStatus(override.reportExpenseStatus)
        : null;
      const companyExpenseStatus = isCurrentAccountSource
        ? "KONTROL_BEKLIYOR"
        : this.explicitCompanyExpenseStatus(company);
      const sourceExpenseStatus = this.normalizeExpenseStatus(sourceRecord.expenseStatus);
      const inferredExpenseStatus = isCurrentAccountSource
        ? "GENEL_GIDER_DEGIL"
        : sourceRecord.transactionType === "GELIR"
        ? "GENEL_GIDER_DEGIL"
        : behavior.defaultExpenseStatus;
      let expenseStatus =
        overrideExpenseStatus ||
        (companyExpenseStatus !== "KONTROL_BEKLIYOR"
          ? companyExpenseStatus
          : inferredExpenseStatus !== "KONTROL_BEKLIYOR"
            ? inferredExpenseStatus
            : sourceExpenseStatus);
      const officialType = override?.reportOfficialType
        ? officialTypeValue(override.reportOfficialType)
        : behavior.code === "UNOFFICIAL_EXPENSE"
          ? "GAYRI_RESMI"
          : officialTypeValue(
            override?.reportOfficialType ||
              sourceRecord.officialType ||
              company?.defaultRecordType ||
              behavior.officialType,
          );
      const vatIncluded =
        behavior.code === "UNOFFICIAL_EXPENSE"
          ? false
          : override?.reportVatIncluded === null || override?.reportVatIncluded === undefined
          ? behavior.vatIncluded && officialType === "RESMI"
          : Boolean(override.reportVatIncluded);
      const cariIncluded = Boolean(behavior.currentAccountIncluded);
      const sourceOfCategory = overrideCategory ? "RECORD_OVERRIDE" : companyCategory ? "COMPANY_DEFAULT" : sourceCategory ? "SOURCE_RECORD" : "UNRESOLVED";
      const sourceOfReportStatus = overrideReportStatus ? "RECORD_OVERRIDE" : companyReportStatus !== "KONTROL_BEKLIYOR" ? "COMPANY_DEFAULT" : inferredReportStatus !== "KONTROL_BEKLIYOR" ? "COMPANY_BEHAVIOR" : sourceReportStatus !== "KONTROL_BEKLIYOR" ? "SOURCE_RECORD" : "UNRESOLVED";
      const sourceOfExpenseStatus = overrideExpenseStatus ? "RECORD_OVERRIDE" : companyExpenseStatus !== "KONTROL_BEKLIYOR" ? "COMPANY_DEFAULT" : inferredExpenseStatus !== "KONTROL_BEKLIYOR" ? "COMPANY_BEHAVIOR" : sourceExpenseStatus !== "KONTROL_BEKLIYOR" ? "SOURCE_RECORD" : "UNRESOLVED";
      const sourceOfDecision = overrideCategory || overrideReportStatus || overrideExpenseStatus || override?.reportOfficialType
        ? "RECORD_OVERRIDE"
        : companyCategory || companyReportStatus !== "KONTROL_BEKLIYOR" || companyExpenseStatus !== "KONTROL_BEKLIYOR"
          ? "COMPANY_DEFAULT"
          : sourceCategory || sourceReportStatus !== "KONTROL_BEKLIYOR" || sourceExpenseStatus !== "KONTROL_BEKLIYOR"
            ? "SOURCE_RECORD"
            : "UNRESOLVED";
  
      return {
        effectiveCategoryId: effectiveCategory?.id || "",
        effectiveCategoryName: effectiveCategory?.ad || "Kategorisiz",
        officialType,
        cariIncluded,
        currentAccountIncluded: cariIncluded,
        vatIncluded,
        expenseStatus,
        reportStatus,
        reportIncluded: reportStatus === "DAHIL" ? true : reportStatus === "HARIC" ? false : null,
        ledgerIncluded: cariIncluded,
        incomeIncluded: sourceRecord.transactionType === "GELIR" && reportStatus === "DAHIL",
        expenseIncluded: sourceRecord.transactionType === "GIDER" && reportStatus === "DAHIL" && expenseStatus === "GENEL_GIDER",
        sourceOfCategory,
        sourceOfReportStatus,
        sourceOfExpenseStatus,
        unresolvedReasons: [
          !effectiveCategory ? "CATEGORY_MISSING" : "",
          reportStatus === "KONTROL_BEKLIYOR" ? "REPORT_STATUS_PENDING" : "",
          expenseStatus === "KONTROL_BEKLIYOR" ? "EXPENSE_STATUS_PENDING" : "",
        ].filter(Boolean),
        sourceOfDecision,
        companyBehaviorCode: behavior.code,
        companyBehavior: behavior.label,
        companyDefaultCategoryId: companyCategory?.id || "",
        companyDefaultCategoryName: companyCategory?.ad || "Kategorisiz",
        defaultReportStatus: companyReportStatus,
        defaultExpenseStatus: companyExpenseStatus,
      };
  }

  private classificationFor(row: any, summary?: Record<string, any>) {
    const raw = this.rawOf(row);
    const profile = this.profileFromLegacy(row, raw);
    const defaults = this.profileDefaults(profile, raw);
    const realBalance =
      summary?.mevcutBakiye ?? decimalToNumber(row?.currentBalance);
    return {
      ...defaults,
      realBalance,
      visibleBalance: realBalance,
      cariTakipDisi: !defaults.trackReceivablePayable,
      balanceNote: defaults.trackReceivablePayable ? "" : "Cari takip disi",
    };
  }

  private isMovementActive(row: any) {
    const raw = this.rawOf(row);
    const status = upper(raw.status || raw.durum || "ISLENDI");
    if (raw.active === false) return false;
    return !["PASIF", "PASSIVE", "IPTAL", "CANCELLED"].includes(status);
  }

  private movementMeta(row: any) {
    const raw = this.rawOf(row);
    const debit = decimalToNumber(row.debit);
    const credit = decimalToNumber(row.credit);
    const amount = decimalToNumber(row.amount) || Math.max(debit, credit);
    const dueDate = cleanText(raw.vade || raw.dueDate || "");
    const officialType = officialTypeValue(raw.resmiGayri || raw.officialType);
    const status = upper(
      raw.status || raw.durum || (row.documentId ? "ISLENDI" : "BEKLIYOR"),
    );
    return {
      documentType: cleanText(
        raw.documentType || raw.belgeTipi || row.movementType,
      ),
      officialType,
      dueDate,
      status,
      source:
        cleanText(
          raw.source || row.sourceType || (row.documentId ? "BELGE" : "MANUEL"),
        ) || "MANUEL",
      active: this.isMovementActive(row),
      amount,
      direction:
        debit > 0
          ? "BORC"
          : credit > 0
            ? "ALACAK"
            : amount < 0
              ? "ALACAK"
              : "BORC",
    };
  }

  private parseNumericFilter(value: unknown) {
    const cleaned = String(value ?? "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private matchesBalanceType(balance: number, value: unknown) {
    const type = upper(value || "ALL");
    if (!type || type === "ALL" || type === "TUMU") return true;
    if (["HAS_BALANCE", "BAKIYESI_OLAN", "NON_ZERO"].includes(type))
      return balance !== 0;
    if (["DEBITOR", "BORCLU", "POSITIVE"].includes(type)) return balance > 0;
    if (["CREDITOR", "ALACAKLI", "NEGATIVE"].includes(type)) return balance < 0;
    if (["ZERO", "SIFIR"].includes(type)) return balance === 0;
    return true;
  }

  private filterMovementRows(rows: any[], query: Record<string, any>) {
    const dateFrom = cleanText(query.dateFrom || query.startDate || "");
    const dateTo = cleanText(query.dateTo || query.endDate || "");
    const documentNo = cleanText(
      query.documentNo || query.belgeNo || "",
    ).toLocaleLowerCase("tr-TR");
    const description = cleanText(
      query.description || query.aciklama || "",
    ).toLocaleLowerCase("tr-TR");
    const amountMin = this.parseNumericFilter(query.amountMin);
    const amountMax = this.parseNumericFilter(query.amountMax);
    const direction = upper(query.direction || query.islemYonu || "ALL");
    const officialType = officialTypeValue(
      query.officialType || query.resmiGayri || "",
    );
    const rawOfficialType = upper(query.officialType || query.resmiGayri || "");
    const status = upper(query.status || "ALL");
    const overdueOnly =
      String(query.overdueOnly || "").toLowerCase() === "true" ||
      query.overdueOnly === true;
    const today = new Date().toISOString().slice(0, 10);

    return rows.filter((row) => {
      const meta = this.movementMeta(row);
      const rowDate = cleanText(
        row.movementDate?.toISOString?.().slice(0, 10) ||
          row.movementDate ||
          row.tarih ||
          "",
      );
      if (!meta.active) return false;
      if (dateFrom && rowDate && rowDate < dateFrom) return false;
      if (dateTo && rowDate && rowDate > dateTo) return false;
      if (
        documentNo &&
        !cleanText(row.documentNo)
          .toLocaleLowerCase("tr-TR")
          .includes(documentNo)
      )
        return false;
      if (
        description &&
        !cleanText(row.description)
          .toLocaleLowerCase("tr-TR")
          .includes(description)
      )
        return false;
      if (amountMin != null && meta.amount < amountMin) return false;
      if (amountMax != null && meta.amount > amountMax) return false;
      if (
        !["", "ALL", "TUMU"].includes(direction) &&
        meta.direction !== direction
      )
        return false;
      if (
        !["", "ALL", "TUMU", "BOTH"].includes(rawOfficialType) &&
        meta.officialType !== officialType
      )
        return false;
      if (!["", "ALL", "TUMU"].includes(status) && meta.status !== status)
        return false;
      if (overdueOnly && (!meta.dueDate || meta.dueDate >= today)) return false;
      return true;
    });
  }

  private summarizeCompanyFromRows(
    company: any,
    movementRows: any[],
    filteredRows = movementRows,
  ) {
    const opening = this.openingSigned(company);
    const allActiveRows = movementRows.filter((row) =>
      this.isMovementActive(row),
    );
    const activeFilteredRows = filteredRows.filter((row) =>
      this.isMovementActive(row),
    );
    const totalDebit = allActiveRows.reduce(
      (sum, row) => sum + decimalToNumber(row.debit),
      0,
    );
    const totalCredit = allActiveRows.reduce(
      (sum, row) => sum + decimalToNumber(row.credit),
      0,
    );
    const filteredDebit = activeFilteredRows.reduce(
      (sum, row) => sum + decimalToNumber(row.debit),
      0,
    );
    const filteredCredit = activeFilteredRows.reduce(
      (sum, row) => sum + decimalToNumber(row.credit),
      0,
    );
    const currentBalance = opening + totalDebit - totalCredit;
    const filteredBalance = opening + filteredDebit - filteredCredit;
    const officialBalance = allActiveRows
      .filter((row) => this.movementMeta(row).officialType === "RESMI")
      .reduce((sum, row) => sum + decimalToNumber(row.debit) - decimalToNumber(row.credit), 0);
    const unofficialBalance = allActiveRows
      .filter((row) => this.movementMeta(row).officialType === "GAYRI")
      .reduce((sum, row) => sum + decimalToNumber(row.debit) - decimalToNumber(row.credit), 0);
    const lastMovement = [...allActiveRows].sort((a, b) => {
      const left = new Date(a.movementDate || a.createdAt || 0).getTime();
      const right = new Date(b.movementDate || b.createdAt || 0).getTime();
      return right - left;
    })[0];
    const today = new Date().toISOString().slice(0, 10);
    const overdue = allActiveRows.reduce((sum, row) => {
      const meta = this.movementMeta(row);
      if (!meta.dueDate || meta.dueDate >= today) return sum;
      return sum + decimalToNumber(row.debit) - decimalToNumber(row.credit);
    }, 0);
    const classification = this.classificationFor(company, {
      mevcutBakiye: currentBalance,
    });
    return {
      acilisBakiyesi: Math.abs(decimalToNumber(company.openingBalance)),
      acilisBakiyeSigned: opening,
      toplamBorc: totalDebit,
      toplamAlacak: totalCredit,
      resmiBakiye: officialBalance,
      gayriResmiBakiye: unofficialBalance,
      donemBorc: filteredDebit,
      donemAlacak: filteredCredit,
      mevcutBakiye: currentBalance,
      guncelBakiye: currentBalance,
      filtrelenenBakiye: filteredBalance,
      bakiyeYonu: classification.trackReceivablePayable
        ? this.balanceDirection(currentBalance)
        : "CARI_TAKIP_DISI",
      vadesiGecen: overdue,
      sonIslemTarihi: lastMovement?.movementDate || company.updatedAt,
      hareketSayisi: activeFilteredRows.length,
    };
  }

  private mapMovementDetail(row: any) {
    const meta = this.movementMeta(row);
    return {
      id: row.id,
      companyId: row.companyId,
      firmaId: row.companyId,
      documentId: row.documentId || "",
      belgeNo: row.documentNo || "",
      belgeTipi: meta.documentType || row.movementType || "-",
      resmiGayri: meta.officialType,
      aciklama: row.description || "",
      borc: decimalToNumber(row.debit),
      alacak: decimalToNumber(row.credit),
      bakiye: decimalToNumber(row.balanceAfter),
      tutar: meta.amount,
      vade: meta.dueDate || "",
      durum: meta.status,
      kaynak: meta.source,
      tarih: row.movementDate?.toISOString?.().slice(0, 10) || row.movementDate,
      sourceType: row.sourceType || meta.source,
      movementType: row.movementType,
      active: meta.active,
      manual: !row.documentId,
    };
  }

  private async recalculateCompanyBalance(
    client: any,
    mainCompanySlug: string,
    companyId: string,
  ) {
    const company = await client.company.findFirst({
      where: { id: companyId, mainCompanySlug },
    });
    if (!company) throw new NotFoundException("Firma kartÄ± bulunamadÄ±.");
    let balance = this.openingSigned(company);
    const rows = await client.currentAccountMovement.findMany({
      where: { mainCompanySlug, companyId },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
    });
    for (const row of rows) {
      if (!this.isMovementActive(row)) continue;
      balance += decimalToNumber(row.debit) - decimalToNumber(row.credit);
      await client.currentAccountMovement.update({
        where: { id: row.id },
        data: { balanceAfter: new Prisma.Decimal(balance) },
      });
    }
    await client.company.update({
      where: { id: companyId },
      data: { currentBalance: new Prisma.Decimal(balance) },
    });
    return balance;
  }

  private async ensureMainCompany(mainCompanySlug: string) {
    const slug = cleanText(mainCompanySlug);
    if (!slug) throw new BadRequestException("Ana firma zorunludur.");
    return this.prisma.mainCompany.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
  }

  private response(page: number, limit: number, total: number, data: any[]) {
    return {
      ok: true,
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapCompany(row: any, summary?: Record<string, any>) {
    const raw = this.rawOf(row);
    const classification = this.classificationFor(row, summary);
    const currentBalance = classification.visibleBalance;
    const realCurrentBalance = classification.realBalance;
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      name: row.name,
      normalizedName: row.normalizedName,
      shortName: cleanText(row.legacyId || raw.shortName || raw.kisaAd),
      type: row.type,
      taxNo: row.taxNo || "",
      taxOffice: row.taxOffice || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      defaultRecordType: row.defaultRecordType || "RESMI",
      firmaTuru: row.firmaTuru || raw.firmaTuru || row.type || "TEDARIKCI",
      varsayilanRaporKategoriId:
        row.varsayilanRaporKategoriId ||
        raw.varsayilanRaporKategoriId ||
        raw.defaultReportCategoryId ||
        "",
      defaultVatRate: decimalToNumber(row.defaultVatRate),
      vatIncludedMode: row.vatIncludedMode || "HARIC",
      currentBalance,
      realCurrentBalance,
      rawCurrentBalance: realCurrentBalance,
      openingBalance: decimalToNumber(row.openingBalance),
      isActive: row.isActive,
      isFavorite: row.isFavorite,
      note: row.note || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      legacyId: row.legacyId || "",
      firma: row.name,
      firmaAdi: row.name,
      kisaAd: cleanText(row.legacyId || raw.shortName || raw.kisaAd),
      tip: row.type,
      firmaTipi: firmTypeValue(row.type),
      raporKategorisiId:
        row.varsayilanRaporKategoriId ||
        raw.varsayilanRaporKategoriId ||
        raw.defaultReportCategoryId ||
        "",
      vergiNo: row.taxNo || "",
      vergiDairesi: row.taxOffice || "",
      telefon: row.phone || "",
      eposta: row.email || "",
      adres: row.address || "",
      varsayilanRecordType: row.defaultRecordType || "RESMI",
      resmiGayri: officialTypeValue(row.defaultRecordType || raw.resmiGayri),
      varsayilanVatRate: decimalToNumber(row.defaultVatRate),
      varsayilanKdv: decimalToNumber(row.defaultVatRate),
      varsayilanVatMode: row.vatIncludedMode || "HARIC",
      aktif: row.isActive,
      favori: row.isFavorite,
      not: row.note || "",
      mevcutBakiye: currentBalance,
      bakiye: currentBalance,
      gercekCariBakiye: realCurrentBalance,
      rawCariBakiye: realCurrentBalance,
      borcAlacakYonu: upper(
        raw.openingBalanceDirection || raw.borcAlacakYonu || "BORC",
      ),
      bakiyeYonu: this.balanceDirection(currentBalance),
      acilisBakiye: Math.abs(decimalToNumber(row.openingBalance)),
      acilisBakiyesi: Math.abs(decimalToNumber(row.openingBalance)),
      acilisBakiyeTarihi: cleanText(
        raw.openingBalanceDate || raw.acilisBakiyeTarihi,
      ),
      devredenKdv: decimalToNumber(raw.transferredVat ?? raw.devredenKdv),
      devredenKdvAyi: cleanText(raw.transferredVatMonth || raw.devredenKdvAyi),
      defaultSupplierPostingType:
        cleanText(raw.defaultSupplierPostingType) || "OPEN_PAYABLE",
      varsayilanTedarikciIslemTipi:
        cleanText(raw.defaultSupplierPostingType) || "OPEN_PAYABLE",
      defaultPaymentStatus: cleanText(raw.defaultPaymentStatus) || "UNPAID",
      expenseCategory: cleanText(raw.expenseCategory),
      giderKategorisi: cleanText(raw.expenseCategory),
      defaultVatType: cleanText(raw.defaultVatType) || "INDIRILECEK_KDV",
      varsayilanKdvTipi: cleanText(raw.defaultVatType) || "INDIRILECEK_KDV",
      expenseCalculationMode: this.expenseCalculationMode(raw),
      giderHesaplamaTipi: this.expenseCalculationMode(raw),
      currentAccountPostingMode: this.currentAccountPostingMode(raw),
      cariKayitModu: this.currentAccountPostingMode(raw),
      vatPayablePercentage: this.vatPayablePercentage(raw),
      kdvCariBorcYuzdesi: this.vatPayablePercentage(raw),
      vatOnlyExpense: this.isVatOnlyExpense(raw),
      sadeceKdvKullan: this.isVatOnlyExpense(raw),
      defaultReportBehavior: cleanText(raw.defaultReportBehavior || raw.varsayilanRaporDavranisi) || "KONTROL_BEKLIYOR",
      varsayilanRaporDavranisi: cleanText(raw.defaultReportBehavior || raw.varsayilanRaporDavranisi) || "KONTROL_BEKLIYOR",
      defaultGeneralExpense: cleanText(raw.defaultGeneralExpense || raw.genelGiderVarsayilani) || "KONTROL_BEKLIYOR",
      genelGiderVarsayilani: cleanText(raw.defaultGeneralExpense || raw.genelGiderVarsayilani) || "KONTROL_BEKLIYOR",
      autoProcessSupplierInvoices: Boolean(raw.autoProcessSupplierInvoices),
      allowManualApprovalWarnings: Boolean(raw.allowManualApprovalWarnings),
      companyTransactionProfile: classification.profile,
      calismaProfili: classification.profile,
      trackReceivablePayable: classification.trackReceivablePayable,
      cariTakipEdilsin: classification.trackReceivablePayable,
      defaultCashSettlement: classification.defaultCashSettlement,
      varsayilanPesinKapama: classification.defaultCashSettlement,
      cariTakipDisi: classification.cariTakipDisi,
      bakiyeNotu: classification.balanceNote,
      cariBakiyesiBilgiAmacli: classification.cariTakipDisi,
      giderFirmasi:
        Boolean(cleanText(raw.defaultSupplierPostingType)) &&
        cleanText(raw.defaultSupplierPostingType) !== "OPEN_PAYABLE",
      vadeGunu: raw.dueDay ?? raw.vadeGunu ?? "",
      riskLimiti: decimalToNumber(raw.riskLimit ?? raw.riskLimiti),
      toplamBorc: classification.trackReceivablePayable
        ? (summary?.toplamBorc ?? 0)
        : 0,
      toplamAlacak: classification.trackReceivablePayable
        ? (summary?.toplamAlacak ?? 0)
        : 0,
      gercekToplamBorc: summary?.toplamBorc ?? 0,
      gercekToplamAlacak: summary?.toplamAlacak ?? 0,
      sonIslemTarihi: summary?.sonIslemTarihi || row.updatedAt,
      sonIslem: summary?.sonIslemTarihi || row.updatedAt,
      aliases: [],
    };
  }

  private mapMovement(row: any) {
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      companyId: row.companyId,
      movementDate: row.movementDate,
      movementType: row.movementType,
      sourceType: row.sourceType,
      documentNo: row.documentNo || "",
      documentId: row.documentId || "",
      description: row.description || "",
      debit: decimalToNumber(row.debit),
      credit: decimalToNumber(row.credit),
      amount: decimalToNumber(row.amount),
      effect: decimalToNumber(row.effect),
      balanceAfter: decimalToNumber(row.balanceAfter),
      legacyId: row.legacyId || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tarih: row.movementDate?.toISOString?.().slice(0, 10) || row.movementDate,
      islemTipi: row.movementType,
      belge: row.documentNo || "",
      aciklama: row.description || "",
      tutar: decimalToNumber(row.amount),
      etkisi: decimalToNumber(row.effect),
      bakiye: decimalToNumber(row.balanceAfter),
    };
  }

  async listCompanies(query: ListCompaniesQuery) {
    await this.ensureMainCompany(query.mainCompanySlug);
    const page = Math.max(1, Number(query.page || 1) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT),
    );
    const q = cleanText(query.q);
    const type = firmTypeValue(query.type || "");
    const rawType = upper(query.type || "");
    const officialType = officialTypeValue(query.officialType || "");
    const rawOfficialType = upper(query.officialType || "");
    const active = upper(query.active || "ACTIVE");
    const balanceFilter = cleanText(
      query.balanceType || query.balanceFilter || "ALL",
    ).toUpperCase();
    const sort = cleanText(query.sort || "BALANCE_DESC").toUpperCase();
    const where: Prisma.CompanyWhereInput = {
      mainCompanySlug: query.mainCompanySlug,
    };

    if (q) {
      const normalized = normalizeName(q);
      where.OR = [
        { normalizedName: { contains: normalized } },
        { name: { contains: q } },
        { legacyId: { contains: q } },
        { taxNo: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];
    }

    if (!["", "ALL", "TUMU", "BOTH"].includes(rawType)) {
      where.type = type;
    }
    if (!["", "ALL", "TUMU", "BOTH"].includes(rawOfficialType)) {
      where.defaultRecordType = officialType;
    }
    if (active === "ACTIVE" || active === "AKTIF") {
      where.isActive = true;
      where.deletedAt = null;
    }
    if (active === "PASSIVE" || active === "PASIF") {
      where.OR = [
        ...(where.OR || []),
        { isActive: false },
        { deletedAt: { not: null } },
      ];
    }

    const orderBy: Prisma.CompanyOrderByWithRelationInput[] =
      sort === "NAME_ASC"
        ? [{ name: "asc" }]
        : sort === "NAME_DESC"
          ? [{ name: "desc" }]
          : sort === "UPDATED_ASC"
            ? [{ updatedAt: "asc" }]
            : sort === "UPDATED_DESC"
              ? [{ updatedAt: "desc" }]
              : sort === "BALANCE_ASC"
                ? [{ currentBalance: "asc" }, { name: "asc" }]
                : [{ currentBalance: "desc" }, { name: "asc" }];

    const rows = await this.prisma.company.findMany({
      where,
      orderBy,
      take: 1000,
    });
    const companyIds = rows.map((row) => row.id);
    const movementRows = companyIds.length
      ? await this.prisma.currentAccountMovement.findMany({
          where: {
            mainCompanySlug: query.mainCompanySlug,
            companyId: { in: companyIds },
          },
          orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
        })
      : [];
    const movementMap = new Map<string, any[]>();
    movementRows.forEach((row) => {
      const list = movementMap.get(row.companyId) || [];
      list.push(row);
      movementMap.set(row.companyId, list);
    });

    const mapped = rows
      .map((row) => {
        const summary = this.summarizeCompanyFromRows(
          row,
          movementMap.get(row.id) || [],
        );
        return this.mapCompany(row, summary);
      })
      .filter((row) =>
        row.trackReceivablePayable === false &&
        ["DEBITOR", "BORCLU", "POSITIVE", "CREDITOR", "ALACAKLI", "NEGATIVE"].includes(
          upper(balanceFilter),
        )
          ? false
          : this.matchesBalanceType(Number(row.mevcutBakiye || 0), balanceFilter),
      );

    if (sort === "BALANCE_ABS_ASC" || sort === "BAKIYE_ABS_ASC") {
      mapped.sort(
        (a, b) =>
          Math.abs(Number(a.mevcutBakiye || 0)) -
            Math.abs(Number(b.mevcutBakiye || 0)) ||
          String(a.firma || a.name || "").localeCompare(
            String(b.firma || b.name || ""),
            "tr-TR",
          ),
      );
    }
    if (sort === "BALANCE_ABS_DESC" || sort === "BAKIYE_ABS_DESC") {
      mapped.sort(
        (a, b) =>
          Math.abs(Number(b.mevcutBakiye || 0)) -
            Math.abs(Number(a.mevcutBakiye || 0)) ||
          String(a.firma || a.name || "").localeCompare(
            String(b.firma || b.name || ""),
            "tr-TR",
          ),
      );
    }

    const total = mapped.length;
    const paged = mapped.slice((page - 1) * limit, page * limit);
    return this.response(page, limit, total, paged);
  }

  async saveCompany(mainCompanySlug: string, payload: Record<string, any>) {
    await this.ensureMainCompany(mainCompanySlug);
    const id = cleanText(payload.id);
    const name = cleanText(payload.name || payload.firma);
    if (!name) throw new BadRequestException("Firma adÄ± zorunludur.");
    const normalizedName = normalizeName(payload.normalizedName || name);
    const taxNo = cleanText(payload.taxNo || payload.vergiNo);
    const existing = id
      ? await this.prisma.company.findFirst({ where: { id, mainCompanySlug } })
      : null;
    if (taxNo) {
      const taxNoOwner = await this.prisma.company.findFirst({
        where: {
          mainCompanySlug,
          taxNo,
          deletedAt: null,
          ...(id ? { id: { not: id } } : {}),
        },
      });
      if (taxNoOwner) {
        throw new ConflictException({
          message:
            "Bu vergi numarası başka bir aktif firma kartında kayıtlı. Mevcut firmayı kullanın veya kartları birleştirin.",
          code: "DUPLICATE_TAX_NO",
          companyId: taxNoOwner.id,
          companyName: taxNoOwner.name,
          taxNo,
        });
      }
    }
    if (!id && cleanText(payload.aliasOfCompanyId)) {
      return this.saveCompanyAlias(mainCompanySlug, cleanText(payload.aliasOfCompanyId), {
        rawName: name,
        taxNo,
        source: "FIRMA_KARTI_ESLESTIRME",
      });
    }
    if (!id && payload.forceDuplicate !== true) {
      const rows = await this.prisma.company.findMany({
        where: { mainCompanySlug, deletedAt: null },
        take: 1000,
      });
      const candidates = rows
        .map((row) => ({
          id: row.id,
          firmaAdi: row.name,
          name: row.name,
          kisaAd: row.legacyId || "",
          vergiNo: row.taxNo || "",
          taxNo: row.taxNo || "",
          score:
            taxNo && row.taxNo === taxNo
              ? 100
              : similarityScore(name, row.name),
        }))
        .filter((row) => row.score >= 72)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (candidates.length) {
        throw new ConflictException({
          message:
            "Bu firma kayÄ±tlÄ± bir firmaya benziyor. Yeni kart aÃ§mak yerine eÅŸleştirme yapÄ±n veya mevcut firmayÄ± gÃ¼ncelleyin.",
          code: "SIMILAR_COMPANY",
          candidates,
        });
      }
    }
    const existingRaw = this.rawOf(existing);
    const requestedProfile =
      upper(
        payload.companyTransactionProfile ||
          payload.calismaProfili ||
          payload.transactionProfile ||
          existingRaw.companyTransactionProfile,
      ) || this.profileFromLegacy({ ...existing, type: payload.type || payload.tip }, existingRaw);
    const classificationDefaults = this.profileDefaults(requestedProfile, {
      ...existingRaw,
      ...asObject(payload.raw),
      trackReceivablePayable:
        payload.trackReceivablePayable ??
        payload.cariTakipEdilsin ??
        existingRaw.trackReceivablePayable,
      defaultCashSettlement:
        payload.defaultCashSettlement ??
        payload.varsayilanPesinKapama ??
        existingRaw.defaultCashSettlement,
    });
    const inferredExpenseCategory =
      cleanText(payload.expenseCategory || payload.giderKategorisi) ||
      cleanText(existingRaw.expenseCategory) ||
      this.suggestedExpenseCategory(name, classificationDefaults.profile);
    const expenseCalculationMode =
      classificationDefaults.profile === "VAT_ONLY_EXPENSE"
        ? "VAT_ONLY"
        : upper(
            payload.expenseCalculationMode ||
              payload.giderHesaplamaTipi ||
              existingRaw.expenseCalculationMode ||
              existingRaw.giderHesaplamaTipi,
          ) || "FULL";
    const inferredPostingType = classificationDefaults.trackReceivablePayable
      ? "OPEN_PAYABLE"
      : expenseCalculationMode === "VAT_ONLY"
        ? "VAT_ONLY_EXPENSE"
      : cleanText(
          payload.defaultSupplierPostingType ||
            payload.varsayilanTedarikciIslemTipi ||
            existingRaw.defaultSupplierPostingType,
        ) || "PAID_EXPENSE";
    const nextRaw = {
      ...existingRaw,
      ...(asObject(payload.raw) || {}),
      shortName: cleanText(
        payload.shortName ||
          payload.kisaAd ||
          payload.legacyId ||
          existingRaw.shortName,
      ),
      openingBalanceDirection:
        cleanText(
          payload.openingBalanceDirection ||
            payload.borcAlacakYonu ||
            existingRaw.openingBalanceDirection ||
            "BORC",
        ) || "BORC",
      openingBalanceDate:
        cleanText(
          payload.openingBalanceDate ||
            payload.acilisBakiyeTarihi ||
            existingRaw.openingBalanceDate,
        ) || null,
      transferredVat:
        Number(
          payload.openingVatAmount ??
            payload.devredenKdv ??
            existingRaw.transferredVat ??
            0,
        ) || 0,
      transferredVatMonth:
        cleanText(
          payload.openingVatPeriod ||
            payload.devredenKdvAyi ||
            existingRaw.transferredVatMonth,
        ) || null,
      dueDay:
        payload.dueDay === "" || payload.vadeGunu === ""
          ? null
          : (payload.dueDay ?? payload.vadeGunu ?? existingRaw.dueDay ?? null),
      riskLimit:
        Number(
          payload.riskLimit ?? payload.riskLimiti ?? existingRaw.riskLimit ?? 0,
        ) || 0,
      companyTransactionProfile: classificationDefaults.profile,
      calismaProfili: classificationDefaults.profile,
      firmaTuru:
        cleanText(payload.firmaTuru || payload.companyKind || existingRaw.firmaTuru) ||
        (classificationDefaults.profile === "CUSTOMER"
          ? "MUSTERI"
          : classificationDefaults.profile === "PERSONNEL_EXPENSE"
            ? "PERSONEL_ODEME"
            : classificationDefaults.profile === "CASH_EXPENSE"
              ? "HIZMET_SAGLAYICI"
              : "TEDARIKCI"),
      varsayilanRaporKategoriId:
        cleanText(
          payload.varsayilanRaporKategoriId ||
            payload.raporKategoriId ||
            payload.defaultReportCategoryId ||
            existingRaw.varsayilanRaporKategoriId ||
            existingRaw.defaultReportCategoryId,
        ) || null,
      defaultReportBehavior:
        cleanText(payload.defaultReportBehavior || payload.varsayilanRaporDavranisi || existingRaw.defaultReportBehavior || existingRaw.varsayilanRaporDavranisi) || "KONTROL_BEKLIYOR",
      varsayilanRaporDavranisi:
        cleanText(payload.defaultReportBehavior || payload.varsayilanRaporDavranisi || existingRaw.defaultReportBehavior || existingRaw.varsayilanRaporDavranisi) || "KONTROL_BEKLIYOR",
      defaultGeneralExpense:
        cleanText(payload.defaultGeneralExpense || payload.genelGiderVarsayilani || existingRaw.defaultGeneralExpense || existingRaw.genelGiderVarsayilani) || "KONTROL_BEKLIYOR",
      genelGiderVarsayilani:
        cleanText(payload.defaultGeneralExpense || payload.genelGiderVarsayilani || existingRaw.defaultGeneralExpense || existingRaw.genelGiderVarsayilani) || "KONTROL_BEKLIYOR",
      trackReceivablePayable: classificationDefaults.trackReceivablePayable,
      cariTakipEdilsin: classificationDefaults.trackReceivablePayable,
      defaultCashSettlement: classificationDefaults.defaultCashSettlement,
      varsayilanPesinKapama: classificationDefaults.defaultCashSettlement,
      defaultSupplierPostingType:
        classificationDefaults.defaultCashSettlement &&
        inferredPostingType === "OPEN_PAYABLE"
          ? "PAID_EXPENSE"
          : inferredPostingType,
      expenseCalculationMode,
      giderHesaplamaTipi: expenseCalculationMode,
      currentAccountPostingMode:
        upper(
          payload.currentAccountPostingMode ||
            payload.cariKayitModu ||
            existingRaw.currentAccountPostingMode ||
            existingRaw.cariKayitModu,
        ) ||
        (expenseCalculationMode === "VAT_ONLY"
          ? "VAT_PERCENTAGE"
          : classificationDefaults.trackReceivablePayable
            ? "FULL_DOCUMENT"
            : "NONE"),
      cariKayitModu:
        upper(
          payload.currentAccountPostingMode ||
            payload.cariKayitModu ||
            existingRaw.currentAccountPostingMode ||
            existingRaw.cariKayitModu,
        ) ||
        (expenseCalculationMode === "VAT_ONLY"
          ? "VAT_PERCENTAGE"
          : classificationDefaults.trackReceivablePayable
            ? "FULL_DOCUMENT"
            : "NONE"),
      vatPayablePercentage: Math.min(
        100,
        Math.max(
          0,
          Number(
            payload.vatPayablePercentage ??
              payload.kdvCariBorcYuzdesi ??
              existingRaw.vatPayablePercentage ??
              existingRaw.kdvCariBorcYuzdesi ??
              0,
          ) || 0,
        ),
      ),
      kdvCariBorcYuzdesi: Math.min(
        100,
        Math.max(
          0,
          Number(
            payload.vatPayablePercentage ??
              payload.kdvCariBorcYuzdesi ??
              existingRaw.vatPayablePercentage ??
              existingRaw.kdvCariBorcYuzdesi ??
              0,
          ) || 0,
        ),
      ),
      defaultPaymentStatus:
        cleanText(
          payload.defaultPaymentStatus ||
            payload.varsayilanOdemeDurumu ||
            existingRaw.defaultPaymentStatus ||
            (classificationDefaults.defaultCashSettlement ? "PAID" : "UNPAID"),
        ) || (classificationDefaults.defaultCashSettlement ? "PAID" : "UNPAID"),
      expenseCategory: inferredExpenseCategory || null,
      defaultVatType:
        cleanText(
          payload.defaultVatType ||
            payload.varsayilanKdvTipi ||
            existingRaw.defaultVatType ||
            (classificationDefaults.profile === "UNOFFICIAL_EXPENSE"
              ? "KDV_YOK"
              : expenseCalculationMode === "VAT_ONLY"
                ? "INDIRILECEK_KDV"
              : "INDIRILECEK_KDV"),
        ) ||
        (classificationDefaults.profile === "UNOFFICIAL_EXPENSE"
          ? "KDV_YOK"
          : "INDIRILECEK_KDV"),
      autoProcessSupplierInvoices: Boolean(
        payload.autoProcessSupplierInvoices ??
          payload.otomatikGiderIsle ??
          existingRaw.autoProcessSupplierInvoices ??
          false,
      ),
      allowManualApprovalWarnings: Boolean(
        payload.allowManualApprovalWarnings ??
          payload.manuelUyariOnayi ??
          existingRaw.allowManualApprovalWarnings ??
          false,
      ),
      resmiGayri:
        cleanText(
          payload.officialType ||
            payload.defaultRecordType ||
            payload.resmiGayri ||
            existingRaw.resmiGayri ||
            "RESMI",
        ) || "RESMI",
    };
    const data = {
      name,
      normalizedName,
      type: cleanText(payload.type || payload.tip || "SATICI") || "SATICI",
      legacyId:
        cleanText(payload.legacyId || payload.shortName || payload.kisaAd) ||
        null,
      taxNo: taxNo || null,
      taxOffice: cleanText(payload.taxOffice || payload.vergiDairesi) || null,
      phone: cleanText(payload.phone || payload.telefon) || null,
      email: cleanText(payload.email || payload.eposta) || null,
      address: cleanText(payload.address || payload.adres) || null,
      defaultRecordType:
        cleanText(
          payload.defaultRecordType || payload.varsayilanRecordType || "RESMI",
        ) || "RESMI",
      firmaTuru:
        cleanText(payload.firmaTuru || payload.companyKind || nextRaw.firmaTuru) ||
        null,
      varsayilanRaporKategoriId:
        cleanText(
          payload.varsayilanRaporKategoriId ||
            payload.raporKategoriId ||
            payload.defaultReportCategoryId ||
            nextRaw.varsayilanRaporKategoriId,
        ) || null,
      defaultVatRate: new Prisma.Decimal(
        Number(payload.defaultVatRate ?? payload.varsayilanVatRate ?? 0) || 0,
      ),
      vatIncludedMode:
        cleanText(
          payload.vatIncludedMode || payload.varsayilanVatMode || "HARIC",
        ) || "HARIC",
      openingBalance: new Prisma.Decimal(
        Math.abs(
          Number(
            payload.openingBalance ??
              payload.acilisBakiyesi ??
              payload.acilisBakiye ??
              0,
          ) || 0,
        ),
      ),
      isActive: payload.isActive ?? payload.aktif ?? true,
      deletedAt:
        payload.deletedAt === null ||
        (payload.isActive !== false && payload.aktif !== false)
          ? null
          : undefined,
      isFavorite: Boolean(payload.isFavorite ?? payload.favori),
      note: cleanText(payload.note || payload.not) || null,
      raw: nextRaw,
    };

    try {
      const saved = id
        ? await this.prisma.company.update({
            where: { id },
            data,
          })
        : await this.prisma.company.create({
            data: {
              ...data,
              mainCompanySlug,
            },
          });

      await this.recalculateCompanyBalance(
        this.prisma,
        mainCompanySlug,
        saved.id,
      );
      const refreshed = await this.prisma.company.findFirst({
        where: { id: saved.id, mainCompanySlug },
      });

      await this.log(
        mainCompanySlug,
        "company",
        saved.id,
        id ? "UPDATED" : "CREATED",
        {
          newValue: this.mapCompany(refreshed || saved),
        },
      );
      return this.mapCompany(refreshed || saved);
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "Bu firma mevcut gÃ¶rÃ¼nÃ¼yor. Mevcut kaydÄ± gÃ¼ncelleyin.",
        );
      }
      throw error;
    }
  }

  async updateCompany(
    mainCompanySlug: string,
    id: string,
    payload: Record<string, any>,
  ) {
    const existing = await this.requireCompany(mainCompanySlug, id);
    return this.saveCompany(mainCompanySlug, {
      ...existing,
      ...payload,
      id,
      name: payload.name ?? payload.firma ?? existing.name,
    });
  }

  async listCompanyClassifications(
    mainCompanySlug: string,
    query: Record<string, any> = {},
  ) {
    const profileFilter = upper(query.profile || query.calismaProfili || "");
    const includeNonTrackable = query.includeNonTrackable !== "false";
    const companies = await this.listCompanies({
      mainCompanySlug,
      page: query.page,
      limit: query.limit || "500",
      q: query.q || query.search,
      type: query.type,
      officialType: query.officialType,
      active: query.active || "active",
      sort: query.sort || "UPDATED_DESC",
    });
    const rows = (companies.data || [])
      .filter((row: any) =>
        profileFilter && profileFilter !== "ALL"
          ? row.companyTransactionProfile === profileFilter
          : true,
      )
      .filter((row: any) =>
        includeNonTrackable ? true : row.trackReceivablePayable !== false,
      )
      .map((row: any) => ({
        id: row.id,
        firmaId: row.id,
        firmaAdi: row.firmaAdi || row.name,
        name: row.name,
        type: row.type,
        companyTransactionProfile: row.companyTransactionProfile,
        calismaProfili: row.calismaProfili,
        trackReceivablePayable: row.trackReceivablePayable,
        cariTakipEdilsin: row.cariTakipEdilsin,
        defaultCashSettlement: row.defaultCashSettlement,
        varsayilanPesinKapama: row.varsayilanPesinKapama,
        defaultSupplierPostingType: row.defaultSupplierPostingType,
        defaultPaymentStatus: row.defaultPaymentStatus,
        expenseCategory: row.expenseCategory,
        defaultVatType: row.defaultVatType,
        mevcutBakiye: row.mevcutBakiye,
        gercekCariBakiye: row.gercekCariBakiye,
        bakiyeNotu: row.bakiyeNotu,
        suggestedProfile: this.profileFromLegacy(row, {
          ...this.rawOf(row),
          companyTransactionProfile: "",
        }),
        suggestedExpenseCategory:
          row.expenseCategory ||
          this.suggestedExpenseCategory(
            row.firmaAdi || row.name,
            row.companyTransactionProfile,
          ),
        sonIslemTarihi: row.sonIslemTarihi || row.sonIslem,
      }));
    return {
      ...companies,
      data: rows,
      total: rows.length,
    };
  }

  async updateCompanyClassification(
    mainCompanySlug: string,
    id: string,
    payload: Record<string, any>,
  ) {
    const existing = await this.requireCompany(mainCompanySlug, id);
    const mapped = this.mapCompany(existing);
    const saved = await this.saveCompany(mainCompanySlug, {
      ...mapped,
      id,
      name: existing.name,
      companyTransactionProfile:
        payload.companyTransactionProfile || payload.calismaProfili,
      trackReceivablePayable:
        payload.trackReceivablePayable ?? payload.cariTakipEdilsin,
      defaultCashSettlement:
        payload.defaultCashSettlement ?? payload.varsayilanPesinKapama,
      defaultSupplierPostingType:
        payload.defaultSupplierPostingType ||
        payload.varsayilanTedarikciIslemTipi,
      defaultPaymentStatus: payload.defaultPaymentStatus,
      expenseCategory: payload.expenseCategory || payload.giderKategorisi,
      defaultVatType: payload.defaultVatType || payload.varsayilanKdvTipi,
      expenseCalculationMode:
        payload.expenseCalculationMode || payload.giderHesaplamaTipi || mapped.expenseCalculationMode,
      currentAccountPostingMode:
        payload.currentAccountPostingMode ||
        payload.cariKayitModu ||
        mapped.currentAccountPostingMode,
      vatPayablePercentage:
        payload.vatPayablePercentage ??
        payload.kdvCariBorcYuzdesi ??
        mapped.vatPayablePercentage,
      varsayilanRaporKategoriId:
        payload.varsayilanRaporKategoriId !== undefined
          ? payload.varsayilanRaporKategoriId
          : mapped.varsayilanRaporKategoriId,
      defaultReportBehavior:
        payload.defaultReportBehavior || payload.varsayilanRaporDavranisi || mapped.defaultReportBehavior,
      defaultGeneralExpense:
        payload.defaultGeneralExpense || payload.genelGiderVarsayilani || mapped.defaultGeneralExpense,
      allowManualApprovalWarnings: payload.allowManualApprovalWarnings,
      autoProcessSupplierInvoices: payload.autoProcessSupplierInvoices,
    });
    await this.log(mainCompanySlug, "company", id, "CLASSIFICATION_UPDATED", {
      newValue: saved,
    });
    return saved;
  }

  async bulkUpdateCompanyClassification(
    mainCompanySlug: string,
    payload: Record<string, any>,
  ) {
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map((id: any) => cleanText(id)).filter(Boolean)
      : [];
    if (!ids.length) throw new BadRequestException("Firma secimi zorunludur.");
    const results = [];
    for (const id of ids) {
      results.push(
        await this.updateCompanyClassification(mainCompanySlug, id, payload),
      );
    }
    return { ok: true, data: { updated: results.length, rows: results } };
  }

  private kategoriClient() {
    return (this.prisma as any).muhasebeRaporKategorisi;
  }

  private manuelKalemClient() {
    return (this.prisma as any).muhasebeRaporManuelKalem;
  }

  private raporKayitAyariClient() {
    return (this.prisma as any).muhasebeRaporKayitAyari;
  }

  private sabitGiderSablonuClient() {
    return (this.prisma as any).muhasebeSabitGiderSablonu;
  }

  private async ensureReportCategories(mainCompanySlug: string) {
    await this.ensureMainCompany(mainCompanySlug);
    const client = this.kategoriClient();
    for (const category of DEFAULT_REPORT_CATEGORIES) {
      const existing = await client.findFirst({
        where: { mainCompanySlug, ad: category.ad },
      });
      if (existing) continue;
      await client.create({
        data: {
          mainCompanySlug,
          ad: category.ad,
          kod: normalizeName(category.ad).replace(/\s+/g, "_").toUpperCase(),
          kategoriTipi: category.kategoriTipi,
          sira: category.sira,
          aktifMi: true,
          sistemKategorisiMi: true,
        },
      });
    }
    return client.findMany({
      where: { mainCompanySlug },
      orderBy: [{ sira: "asc" }, { ad: "asc" }],
    });
  }

  private async categoryByName(mainCompanySlug: string, name: string) {
    await this.ensureReportCategories(mainCompanySlug);
    return this.kategoriClient().findFirst({
      where: { mainCompanySlug, ad: name },
    });
  }

  private suggestReportCategoryName(value: unknown) {
    const text = cleanText(value).toLocaleUpperCase("tr-TR");
    if (/SELVI|SELVİ|KIMYA|KİMYA|BOYA|TINER|TİNER|SOLVENT/.test(text))
      return "Boya / Kimyasal";
    if (/PERSONEL|MAAŞ|MAAS|ÜCRET|UCRET|SGK|HAFTALIK|YEVMİYE|YEVMIYE|YEVMİYECİ|YEVMIYECI/.test(text))
      return "Sabit Giderler";
    if (/KALIP/.test(text)) return "Kalıp Gideri";
    if (/AMBALAJ|KOLI|KOLİ/.test(text)) return "Ambalaj Gideri";
    if (/YEMEK|LOKANTA|RESTORAN/.test(text)) return "Yemek Gideri";
    if (/KIRA|KİRA/.test(text)) return "Kira Gideri";
    return "Diğer Giderler";
  }

  async listReportCategories(mainCompanySlug: string, query: Record<string, any> = {}) {
    const rows = await this.ensureReportCategories(mainCompanySlug);
    const [companies, documents] = await Promise.all([
      this.prisma.company.findMany({
        where: { mainCompanySlug, deletedAt: null, isActive: true },
        select: { varsayilanRaporKategoriId: true },
      }),
      this.prisma.document.findMany({
        where: { mainCompanySlug, deletedAt: null },
        select: { raporKategoriId: true },
      }),
    ]);
    const companyCounts = new Map<string, number>();
    const documentCounts = new Map<string, number>();
    companies.forEach((row) => {
      const key = cleanText(row.varsayilanRaporKategoriId);
      if (key) companyCounts.set(key, (companyCounts.get(key) || 0) + 1);
    });
    documents.forEach((row) => {
      const key = cleanText(row.raporKategoriId);
      if (key) documentCounts.set(key, (documentCounts.get(key) || 0) + 1);
    });
    const tip = upper(query.kategoriTipi || query.tip || "");
    const active = upper(query.active || query.aktif || "");
    const data = rows
      .filter((row: any) => (tip && tip !== "ALL" ? row.kategoriTipi === tip : true))
      .filter((row: any) =>
        active === "ACTIVE" || active === "AKTIF"
          ? row.aktifMi !== false
          : active === "PASSIVE" || active === "PASIF"
            ? row.aktifMi === false
            : true,
      )
      .map((row: any) => ({
        id: row.id,
        ad: row.ad,
        kod: row.kod || "",
        kategoriTipi: row.kategoriTipi,
        anaKategoriId: row.anaKategoriId || "",
        sira: row.sira || 0,
        aktifMi: row.aktifMi !== false,
        sistemKategorisiMi: Boolean(row.sistemKategorisiMi),
        renk: row.renk || "",
        aciklama: row.aciklama || "",
        firmaSayisi: companyCounts.get(row.id) || 0,
        belgeSayisi: documentCounts.get(row.id) || 0,
      }));
    return { ok: true, data, total: data.length };
  }

  async saveReportCategory(mainCompanySlug: string, payload: Record<string, any>) {
    await this.ensureReportCategories(mainCompanySlug);
    const id = cleanText(payload.id);
    const ad = cleanText(payload.ad || payload.name);
    if (!ad) throw new BadRequestException("Kategori adi zorunludur.");
    const data = {
      ad,
      kod: cleanText(payload.kod || payload.code) || null,
      kategoriTipi: upper(payload.kategoriTipi || payload.tip || "GIDER") || "GIDER",
      anaKategoriId: cleanText(payload.anaKategoriId || payload.parentId) || null,
      sira: Number(payload.sira ?? payload.order ?? 0) || 0,
      aktifMi: payload.aktifMi ?? payload.active ?? true,
      sistemKategorisiMi: Boolean(payload.sistemKategorisiMi ?? false),
      renk: cleanText(payload.renk || payload.color) || null,
      aciklama: cleanText(payload.aciklama || payload.description) || null,
    };
    const client = this.kategoriClient();
    const existing = !id
      ? await client.findFirst({ where: { mainCompanySlug, ad } })
      : null;
    const saved = id
      ? await client.update({ where: { id }, data })
      : existing
        ? await client.update({
            where: { id: existing.id },
            data: { ...data, aktifMi: true },
          })
        : await client.create({ data: { ...data, mainCompanySlug } });
    return { ok: true, data: saved };
  }

  async deleteReportCategory(mainCompanySlug: string, id: string) {
    await this.ensureReportCategories(mainCompanySlug);
    const category = await this.kategoriClient().findFirst({
      where: { id, mainCompanySlug },
    });
    if (!category) throw new NotFoundException("Kategori bulunamadi.");
    const [companyCount, documentCount] = await Promise.all([
      this.prisma.company.count({
        where: { mainCompanySlug, varsayilanRaporKategoriId: id },
      }),
      this.prisma.document.count({
        where: { mainCompanySlug, raporKategoriId: id },
      }),
    ]);
    if (category.sistemKategorisiMi || companyCount || documentCount) {
      const saved = await this.kategoriClient().update({
        where: { id },
        data: { aktifMi: false },
      });
      return {
        ok: true,
        data: saved,
        passiveOnly: true,
        reason: "Kategori kullanildigi veya sistem kategorisi oldugu icin pasife alindi.",
      };
    }
    await this.kategoriClient().delete({ where: { id } });
    return { ok: true, data: { deleted: true } };
  }

  async listReportCategoryCompanies(mainCompanySlug: string, query: Record<string, any> = {}) {
    await this.ensureMainCompany(mainCompanySlug);
    const categoryId = cleanText(query.categoryId || query.kategoriId);
    const search = cleanText(query.search || query.q).toLocaleLowerCase("tr-TR");
    const companies = await this.prisma.company.findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        isActive: true,
        ...(categoryId === "UNCATEGORIZED" || categoryId === "KATEGORISIZ"
          ? { varsayilanRaporKategoriId: null }
          : categoryId
            ? { varsayilanRaporKategoriId: categoryId }
            : {}),
      },
      orderBy: { name: "asc" },
      take: 5000,
    });
    const data = companies
      .map((row: any) => this.mapCompany(row))
      .filter((row: any) => !search || [row.firmaAdi, row.vergiNo, row.firmaTipi].join(" ").toLocaleLowerCase("tr-TR").includes(search));
    return { ok: true, data, total: data.length };
  }

  async assignReportCategoryToCompanies(mainCompanySlug: string, payload: Record<string, any>) {
    await this.ensureMainCompany(mainCompanySlug);
    const companyIds = (Array.isArray(payload.companyIds) ? payload.companyIds : [payload.companyId])
      .map((value: any) => cleanText(value))
      .filter(Boolean);
    if (!companyIds.length) throw new BadRequestException("Firma seçimi zorunludur.");
    const categoryId = cleanText(payload.categoryId || payload.kategoriId) || null;
    if (categoryId) {
      const category = await this.kategoriClient().findFirst({ where: { id: categoryId, mainCompanySlug, aktifMi: true } });
      if (!category) throw new NotFoundException("Aktif kategori bulunamadı.");
    }
    const rows = await this.prisma.company.findMany({ where: { id: { in: companyIds }, mainCompanySlug, deletedAt: null } });
    for (const row of rows) {
      const raw = this.rawOf(row);
      await this.prisma.company.update({
        where: { id: row.id },
        data: {
          varsayilanRaporKategoriId: categoryId,
          raw: { ...raw, varsayilanRaporKategoriId: categoryId, defaultReportCategoryId: categoryId },
        },
      });
      await this.log(mainCompanySlug, "company", row.id, "REPORT_CATEGORY_ASSIGNED", { oldValue: row.varsayilanRaporKategoriId, newValue: categoryId });
    }
    return { ok: true, data: { updated: rows.length, categoryId } };
  }

  async listMissingCategoryCompanies(mainCompanySlug: string) {
    const categories = await this.ensureReportCategories(mainCompanySlug);
    const categoryByName = new Map<string, any>(
      categories.map((row: any) => [row.ad, row]),
    );
    const rows = await this.prisma.company.findMany({
      where: { mainCompanySlug, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      take: 1000,
    });
    const data = rows
      .filter((row: any) => !cleanText(row.varsayilanRaporKategoriId))
      .map((row: any) => {
        const suggestedName = this.suggestReportCategoryName(row.name);
        const suggested: any = categoryByName.get(suggestedName);
        return {
          id: row.id,
          firmaAdi: row.name,
          firmaTuru: row.firmaTuru || row.type || "TEDARIKCI",
          suggestedCategoryId: suggested?.id || "",
          suggestedCategoryName: suggestedName,
        };
      });
    return { ok: true, data, total: data.length };
  }

  private documentReportType(document: any, company: any) {
    const text = upper(
      [
        document.documentType,
        document.sourceType,
        document.detectedType,
        document.targetType,
        document.raw?.documentKind,
        document.raw?.flowType,
      ].join(" "),
    );
    if (/OUR|GIDEN|SATIS|SATIÅ|KESILEN|KESÄ°LEN|CUSTOMER/.test(text))
      return "KESILEN";
    const official = upper(
      document.raw?.resmiGayri ||
        document.raw?.officialType ||
        company?.defaultRecordType ||
        "",
    );
    if (official.includes("GAYRI") || official.includes("GAYR"))
      return "GAYRI_RESMI";
    return "RESMI_GELEN";
  }

  private reportTypeLabel(type: string) {
    const labels: Record<string, string> = {
      KESILEN: "Kesilen",
      RESMI_GELEN: "Resmi Gelen",
      GAYRI_RESMI: "Gayri Resmi",
      PERSONEL: "Personel",
      YEMEK: "Yemek",
      HAFTALIK: "Haftalik",
      YEVMIYECI: "Yevmiyeci",
      MANUEL: "Manuel",
    };
    return labels[type] || type || "Diger";
  }

  private async resolveReportCategory(
    mainCompanySlug: string,
    document: any,
    company: any,
    categories: any[],
    type: string,
  ) {
    const byId = new Map(categories.map((row) => [row.id, row]));
    const byName = new Map(categories.map((row) => [row.ad, row]));
    const documentCategoryId =
      cleanText(document?.raporKategoriId) ||
      cleanText(document?.raw?.raporKategoriId) ||
      cleanText(document?.metadata?.raporKategoriId);
    if (documentCategoryId && byId.has(documentCategoryId)) {
      return { category: byId.get(documentCategoryId), source: "BELGE_UZERINDEN" };
    }
    const companyCategoryId =
      cleanText(company?.varsayilanRaporKategoriId) ||
      cleanText(company?.raw?.varsayilanRaporKategoriId) ||
      cleanText(company?.raw?.defaultReportCategoryId);
    if (companyCategoryId && byId.has(companyCategoryId)) {
      return { category: byId.get(companyCategoryId), source: "FIRMA_KARTI" };
    }
    if (type === "KESILEN") {
      return {
        category: byName.get("Kesilen Fatura Geliri") || categories[0],
        source: "SISTEM",
      };
    }
    if (this.isVatOnlyExpense(company?.raw || {})) {
      return {
        category:
          byName.get("KDV Matrah Dışı") ||
          byName.get("Diğer Giderler") ||
          categories[0],
        source: "FIRMA_KARTI_KDV_ONLY",
      };
    }
    const suggested =
      byName.get(this.suggestReportCategoryName(company?.name || document?.description)) ||
      byName.get("Diğer Giderler");
    return { category: suggested || categories[0], source: "SISTEM" };
  }

  private addSummaryRow(
    map: Map<string, any>,
    category: any,
    amount: number,
    vat: number,
    totalOverride?: number,
  ) {
    const key = category?.id || "uncategorized";
    const row =
      map.get(key) ||
      {
        kategoriId: key,
        kategori: category?.ad || "Diğer Giderler",
        kategoriTipi: category?.kategoriTipi || "DIGER",
        belgeAdedi: 0,
        matrah: 0,
        kdv: 0,
        genelToplam: 0,
      };
    row.belgeAdedi += 1;
    row.matrah += amount;
    row.kdv += vat;
    row.genelToplam +=
      totalOverride === undefined ? amount + vat : totalOverride;
    map.set(key, row);
  }

  async buildPeriodReport(mainCompanySlug: string, query: Record<string, any> = {}) {
    await this.ensureMainCompany(mainCompanySlug);
    const range = this.reportRange({
      dateFrom: query.baslangic || query.dateFrom || query.startDate,
      dateTo: query.bitis || query.dateTo || query.endDate,
    });
    const firmId = cleanText(query.firmaId || query.companyId);
    const kategoriId = cleanText(query.kategoriId || query.raporKategoriId);
    const turFilter = upper(query.tur || "");
    const search = cleanText(query.q || query.search).toLocaleLowerCase("tr-TR");
    const control = await this.buildReportControl(mainCompanySlug, {
      ...query,
      startDate: range.dateFrom,
      endDate: range.dateTo,
      firmId,
      categoryId: kategoriId || undefined,
      search: search || undefined,
    });
    const data = (control as any).data || {};
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const manualRows = await this.manuelKalemClient().findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        aktifMi: true,
        ...(firmId ? { firmaId: firmId } : {}),
        OR: [
          { tarih: { gte: range.gte, lte: range.lte } },
          { tarih: null, baslangic: { lte: range.lte }, bitis: { gte: range.gte } },
          { tarih: null, baslangic: { lte: range.lte }, bitis: null },
          { tarih: null, baslangic: null, bitis: { gte: range.gte } },
        ],
      },
      orderBy: [{ tarih: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    const sourceRows = (Array.isArray(data.records) ? data.records : [])
      .filter((row: any) => row.sourceType !== "CURRENT_ACCOUNT")
      .map((row: any) => ({
        id: row.sourceId,
        tarih: row.date,
        tur: row.transactionType === "GELIR" ? "KESILEN" : row.officialType === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI_GELEN",
        turEtiketi: row.sourceLabel,
        kategoriId: row.categoryId || "",
        kategori: row.category || "Kategorisiz",
        kategoriKaynagi: row.sourceOfDecision || row.categorySource || "UNRESOLVED",
        firmaId: row.companyId || "",
        firma: row.companyName || "",
        belgeNo: row.documentNo || "",
        aciklama: row.reportDescription || row.description || "",
        tutar: Number(row.baseAmount || 0),
        kdv: Number(row.reportVatAmount ?? row.vat ?? 0),
        genelToplam: Number(row.reportAmount ?? row.grandTotal ?? 0),
        hamMatrah: Number(row.baseAmount || 0),
        hamGenelToplam: Number(row.grandTotal || 0),
        giderHesabinaDahil: row.expenseStatus === "GENEL_GIDER",
        kdvHesabinaDahil: Boolean(row.reportVatIncluded),
        giderHesaplamaTipi: row.expenseStatus === "GENEL_GIDER" ? "FULL" : "EXCLUDED",
        hesapNotu: row.sourceOfDecision === "UNRESOLVED" ? "Firma kartı veya kayıt override kararı eksik." : "",
      }))
      .filter((row: any) => (turFilter && turFilter !== "ALL" ? row.tur === turFilter : true));
    const categoryById = new Map<string, any>(categories.map((row: any) => [row.id, row]));
    const categorySummary = new Map<string, any>();
    sourceRows.forEach((row: any) => {
      const category = categoryById.get(row.kategoriId) || {
        id: row.kategoriId || "uncategorized",
        ad: row.kategori || "Kategorisiz",
        kategoriTipi: row.tur === "KESILEN" ? "GELIR" : "DIGER",
      };
      this.addSummaryRow(categorySummary, category, Number(row.tutar || 0), Number(row.kdv || 0), Number(row.genelToplam || 0));
    });
    const hareketler = sourceRows
      .filter((row: any) => {
        if (!search) return true;
        return [row.firma, row.kategori, row.belgeNo, row.aciklama]
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(search);
      })
      .sort((a: any, b: any) => String(b.tarih).localeCompare(String(a.tarih)));
    const kategoriOzetleri = [...categorySummary.values()]
      .filter((row: any) => (kategoriId ? row.kategoriId === kategoriId : true))
      .sort((a: any, b: any) => b.genelToplam - a.genelToplam);
    const sum = (type: string, key: string) =>
      hareketler
        .filter((row: any) => row.tur === type)
        .reduce((total: number, row: any) => total + Number(row[key] || 0), 0);
    const kesilenToplam = sum("KESILEN", "tutar");
    const kesilenKdv = sum("KESILEN", "kdv");
    const resmiGelenToplam = sum("RESMI_GELEN", "genelToplam");
    const gayriResmiToplam = sum("GAYRI_RESMI", "genelToplam");
    const gelenKdv = sum("RESMI_GELEN", "kdv");
    const devreden = decimalToNumber(query.devredenKdv || 0);
    const kdvSonucu = kesilenKdv - gelenKdv - devreden;
    const personel = kategoriOzetleri.filter((row: any) => row.kategoriTipi === "PERSONEL").reduce((total: number, row: any) => total + Number(row.genelToplam || 0), 0);
    const yemek = kategoriOzetleri.filter((row: any) => /yemek/i.test(row.kategori)).reduce((total: number, row: any) => total + Number(row.genelToplam || 0), 0);
    const haftalik = hareketler.filter((row: any) => /haftalik|haftalÄ±k/i.test(row.kategori)).reduce((total: number, row: any) => total + Number(row.genelToplam || 0), 0);
    const yevmiyeci = hareketler.filter((row: any) => /yevmiyeci/i.test(row.kategori)).reduce((total: number, row: any) => total + Number(row.genelToplam || 0), 0);
    return {
      ok: true,
      data: {
        anaOzet: {
          kesilenFatura: { toplam: kesilenToplam, kdv: kesilenKdv, belgeAdedi: hareketler.filter((row: any) => row.tur === "KESILEN").length },
          gelenFaturalar: { resmiToplam: resmiGelenToplam, gayriResmiToplam, toplam: resmiGelenToplam + gayriResmiToplam },
          kdvDurumu: { hesaplananKdv: kesilenKdv, gelenKdv, devredenKdv: devreden, sonuc: kdvSonucu, odenecekKdv: Math.max(0, kdvSonucu), devredecekKdv: Math.max(0, -kdvSonucu) },
          personelIsletme: { personel, yemek, haftalik, yevmiyeci, toplam: personel + yemek + haftalik + yevmiyeci },
        },
        kategoriOzetleri,
        hareketler,
        kullaniciKalemleri: manualRows,
        filtreBilgisi: { baslangic: range.dateFrom, bitis: range.dateTo, firmaId: firmId, kategoriId, tur: turFilter || "ALL", search },
      },
    };
  }

  async listManualReportItems(mainCompanySlug: string, query: Record<string, any> = {}) {
    await this.ensureMainCompany(mainCompanySlug);
    const range = this.reportRange(query);
    const rows = await this.manuelKalemClient().findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        ...(query.all === "true" ? {} : { aktifMi: true }),
        OR: [
          { tarih: { gte: range.gte, lte: range.lte } },
          { tarih: null, baslangic: { lte: range.lte }, bitis: { gte: range.gte } },
          { tarih: null, baslangic: { lte: range.lte }, bitis: null },
          { tarih: null, baslangic: null, bitis: { gte: range.gte } },
          { tarih: null, baslangic: null, bitis: null },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
    });
    return { ok: true, data: rows };
  }

  async saveManualReportItem(mainCompanySlug: string, payload: Record<string, any>) {
    await this.ensureMainCompany(mainCompanySlug);
    const id = cleanText(payload.id);
    const client = this.manuelKalemClient();
    const existing = id
      ? await client.findFirst({ where: { id, mainCompanySlug, deletedAt: null } })
      : null;
    if (id && !existing) throw new NotFoundException("Manuel gider bulunamadı.");
    const ad = cleanText(payload.ad || payload.name);
    if (!ad) throw new BadRequestException("Kalem adi zorunludur.");
    const kartTipi = upper(payload.kartTipi || payload.cardType || "KUCUK") || "KUCUK";
    const aylikSabit = kartTipi === "AYLIK_SABIT" || upper(payload.tekrar || payload.repeat) === "AYLIK";
    const tarihValue = cleanText(payload.tarih || payload.date);
    const baslangicValue = cleanText(payload.baslangic || payload.dateFrom || (aylikSabit ? tarihValue : ""));
    const bitisValue = cleanText(payload.bitis || payload.dateTo || payload.endDate);
    const reportOnly = payload.reportOnly === undefined ? undefined : Boolean(payload.reportOnly);
    const postToLedger = payload.postToLedger === undefined ? undefined : Boolean(payload.postToLedger);
    const currentAccountRequested = reportOnly === true
      ? false
      : postToLedger ?? Boolean(payload.cariyeEkle ?? payload.addToCurrentAccount ?? existing?.cariyeEkle ?? false);
    const data = {
      ad,
      kartTipi: aylikSabit ? "AYLIK_SABIT" : kartTipi,
      kategoriId: cleanText(payload.kategoriId || payload.categoryId || existing?.kategoriId) || null,
      firmaId: cleanText(payload.firmaId || payload.companyId || existing?.firmaId) || null,
      tarih: !aylikSabit && tarihValue
        ? this.parseDate(tarihValue)
        : existing?.tarih || null,
      baslangic: baslangicValue
        ? this.parseDate(baslangicValue)
        : existing?.baslangic || null,
      bitis: bitisValue
        ? this.parseDate(bitisValue)
        : existing?.bitis || null,
      tutar: new Prisma.Decimal(Number(payload.tutar ?? payload.amount ?? existing?.tutar ?? 0) || 0),
      kdv: new Prisma.Decimal(Number(payload.kdv ?? payload.vat ?? existing?.kdv ?? 0) || 0),
      aciklama: cleanText(payload.aciklama || payload.description || existing?.aciklama) || null,
      belgeNo: cleanText(payload.belgeNo || payload.documentNo || existing?.belgeNo) || null,
      resmiTip: upper(payload.resmiTip || payload.officialType || existing?.resmiTip || "GAYRI_RESMI") || "GAYRI_RESMI",
      kdvOrani: new Prisma.Decimal(Number(payload.kdvOrani ?? payload.vatRate ?? existing?.kdvOrani ?? 0) || 0),
      raporaDahil: payload.raporaDahil ?? payload.reportIncluded ?? existing?.raporaDahil ?? true,
      odemeSekli: cleanText(payload.odemeSekli || payload.paymentType || existing?.odemeSekli) || null,
      not: cleanText(payload.not || payload.note || existing?.not) || null,
      cariyeEkle: currentAccountRequested,
      sabitSablonId: cleanText(payload.sabitSablonId || payload.templateId || existing?.sabitSablonId) || null,
      tahakkukAyi: cleanText(payload.tahakkukAyi || payload.accrualMonth || existing?.tahakkukAyi) || null,
      islemTuru: upper(payload.islemTuru || payload.transactionType || existing?.islemTuru || "GIDER") === "GELIR" ? "GELIR" : "GIDER",
      aktifMi: payload.aktifMi ?? payload.active ?? existing?.aktifMi ?? true,
    };
    let saved = id
      ? await client.update({ where: { id }, data })
      : await client.create({ data: { ...data, mainCompanySlug } });
    const synced = await this.syncManualReportItemLedger(mainCompanySlug, saved);
    if (synced) saved = synced;
    return { ok: true, data: saved };
  }

  async deleteManualReportItem(mainCompanySlug: string, id: string) {
    await this.ensureMainCompany(mainCompanySlug);
    const existing = await this.manuelKalemClient().findFirst({
      where: { id, mainCompanySlug, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Manuel kalem bulunamadi.");
    const saved = await this.manuelKalemClient().update({
      where: { id },
      data: { deletedAt: new Date(), aktifMi: false },
    });
    await this.syncManualReportItemLedger(mainCompanySlug, saved);
    return { ok: true, data: saved };
  }

  async listFixedExpenseTemplates(mainCompanySlug: string, query: Record<string, any> = {}) {
    await this.ensureMainCompany(mainCompanySlug);
    const month = cleanText(query.month || query.ay || new Date().toISOString().slice(0, 7));
    const [rows, accruals] = await Promise.all([
      this.sabitGiderSablonuClient().findMany({
        where: { mainCompanySlug, deletedAt: null, ...(query.all === "true" ? {} : { aktifMi: true }) },
        orderBy: [{ aktifMi: "desc" }, { ad: "asc" }],
      }),
      this.manuelKalemClient().findMany({ where: { mainCompanySlug, deletedAt: null, tahakkukAyi: month }, select: { sabitSablonId: true, id: true } }),
    ]);
    const generated = new Map(accruals.map((row: any) => [row.sabitSablonId, row.id]));
    return {
      ok: true,
      data: rows.map((row: any) => {
        const validationErrors = [
          ...(decimalToNumber(row.tutar) > 0 ? [] : ["TUTAR_EKSIK"]),
          ...(cleanText(row.kategoriId) ? [] : ["KATEGORI_EKSIK"]),
        ];
        return {
          ...row,
          gecerliMi: validationErrors.length === 0,
          validationErrors,
          buAyOlusturuldu: generated.has(row.id),
          tahakkukId: generated.get(row.id) || "",
        };
      }),
    };
  }

  async saveFixedExpenseTemplate(mainCompanySlug: string, payload: Record<string, any>) {
    await this.ensureMainCompany(mainCompanySlug);
    const id = cleanText(payload.id);
    const existing = id
      ? await this.sabitGiderSablonuClient().findFirst({
          where: { id, mainCompanySlug, deletedAt: null },
        })
      : null;
    if (id && !existing)
      throw new NotFoundException("Sabit gider şablonu bulunamadı.");
    const ad = cleanText(payload.ad || payload.name);
    if (!ad) throw new BadRequestException("Gider adı zorunludur.");
    const kategoriId = cleanText(
      payload.kategoriId || payload.categoryId || existing?.kategoriId,
    );
    if (!kategoriId)
      throw new BadRequestException("Gider kategorisi zorunludur.");
    const category = await this.kategoriClient().findFirst({
      where: { id: kategoriId, mainCompanySlug, aktifMi: true },
    });
    if (!category)
      throw new BadRequestException("Seçilen gider kategorisi bulunamadı veya pasif.");
    const firmaId = cleanText(
      payload.firmaId || payload.companyId || existing?.firmaId,
    );
    if (firmaId) {
      const company = await this.prisma.company.findFirst({
        where: { id: firmaId, mainCompanySlug, deletedAt: null },
        select: { id: true },
      });
      if (!company)
        throw new BadRequestException("Seçilen firma bu ana firmaya ait değil.");
    }
    const amount = parseUserNumber(
      payload.tutar ?? payload.amount ?? existing?.tutar,
    );
    if (amount <= 0)
      throw new BadRequestException("Sabit gider tutarı sıfırdan büyük olmalıdır.");
    const startMonth = cleanText(
      payload.baslangicAyi ||
        payload.startMonth ||
        existing?.baslangicAyi ||
        new Date().toISOString().slice(0, 7),
    );
    const endMonth = cleanText(
      payload.bitisAyi || payload.endMonth || existing?.bitisAyi,
    );
    if (!/^\d{4}-\d{2}$/.test(startMonth))
      throw new BadRequestException("Başlangıç ayı YYYY-AA biçiminde olmalıdır.");
    if (endMonth && !/^\d{4}-\d{2}$/.test(endMonth))
      throw new BadRequestException("Bitiş ayı YYYY-AA biçiminde olmalıdır.");
    if (endMonth && endMonth < startMonth)
      throw new BadRequestException("Bitiş ayı başlangıç ayından önce olamaz.");
    const officialType =
      upper(payload.resmiTip || payload.officialType || existing?.resmiTip || "GAYRI_RESMI") ===
      "RESMI"
        ? "RESMI"
        : "GAYRI_RESMI";
    const data = {
      ad,
      kategoriId,
      firmaId: firmaId || null,
      tutar: new Prisma.Decimal(amount),
      resmiTip: officialType,
      kdvOrani: new Prisma.Decimal(
        officialType === "RESMI"
          ? parseUserNumber(payload.kdvOrani ?? payload.vatRate ?? existing?.kdvOrani)
          : 0,
      ),
      baslangicAyi: startMonth,
      bitisAyi: endMonth || null,
      herAyOtomatik:
        payload.herAyOtomatik ?? payload.autoMonthly ?? existing?.herAyOtomatik ?? true,
      cariyeEkle: Boolean(
        payload.cariyeEkle ??
          payload.addToCurrentAccount ??
          existing?.cariyeEkle ??
          false,
      ),
      aktifMi: payload.aktifMi ?? payload.active ?? existing?.aktifMi ?? true,
      aciklama:
        cleanText(payload.aciklama || payload.description || existing?.aciklama) ||
        null,
    };
    const saved = id
      ? await this.sabitGiderSablonuClient().update({ where: { id }, data })
      : await this.sabitGiderSablonuClient().create({ data: { ...data, mainCompanySlug } });
    return { ok: true, data: saved };
  }

  async generateFixedExpense(mainCompanySlug: string, id: string, monthValue: string) {
    await this.ensureMainCompany(mainCompanySlug);
    const month = cleanText(monthValue || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("Tahakkuk ayı YYYY-AA biçiminde olmalıdır.");
    const template = await this.sabitGiderSablonuClient().findFirst({ where: { id, mainCompanySlug, deletedAt: null, aktifMi: true } });
    if (!template) throw new NotFoundException("Sabit gider şablonu bulunamadı.");
    if (!cleanText(template.kategoriId))
      throw new BadRequestException("Sabit gider şablonunda kategori seçilmelidir.");
    if (decimalToNumber(template.tutar) <= 0)
      throw new BadRequestException("Sabit gider şablonunda tutar sıfırdan büyük olmalıdır.");
    if (month < template.baslangicAyi || (template.bitisAyi && month > template.bitisAyi)) throw new BadRequestException("Şablon seçilen ayda geçerli değil.");
    const existing = await this.manuelKalemClient().findFirst({ where: { mainCompanySlug, sabitSablonId: id, tahakkukAyi: month, deletedAt: null } });
    if (existing) return { ok: true, data: existing, alreadyGenerated: true };
    const amount = decimalToNumber(template.tutar);
    const vat = template.resmiTip === "RESMI" ? amount * decimalToNumber(template.kdvOrani) / 100 : 0;
    const saved = await this.saveManualReportItem(mainCompanySlug, {
      ad: template.ad, kartTipi: "SABIT_TAHAKKUK", kategoriId: template.kategoriId, firmaId: template.firmaId,
      tarih: `${month}-01`, tutar: amount, kdv: vat, kdvOrani: template.kdvOrani, resmiTip: template.resmiTip,
      raporaDahil: true, aciklama: template.aciklama || `${month} sabit gider tahakkuku`, cariyeEkle: template.cariyeEkle,
      sabitSablonId: template.id, tahakkukAyi: month,
    });
    return { ...saved, alreadyGenerated: false };
  }

  async generateFixedExpensesForMonth(mainCompanySlug: string, monthValue: string) {
    const month = cleanText(monthValue || new Date().toISOString().slice(0, 7));
    const templates = await this.sabitGiderSablonuClient().findMany({
      where: { mainCompanySlug, deletedAt: null, aktifMi: true, herAyOtomatik: true, baslangicAyi: { lte: month }, OR: [{ bitisAyi: null }, { bitisAyi: { gte: month } }] },
    });
    let created = 0;
    let existing = 0;
    let skipped = 0;
    for (const template of templates) {
      if (!cleanText(template.kategoriId) || decimalToNumber(template.tutar) <= 0) {
        skipped += 1;
        continue;
      }
      const result = await this.generateFixedExpense(mainCompanySlug, template.id, month);
      if (result.alreadyGenerated) existing += 1;
      else created += 1;
    }
    return { ok: true, data: { month, templates: templates.length, created, existing, skipped } };
  }

  async passiveFixedExpenseTemplate(mainCompanySlug: string, id: string) {
    const existing = await this.sabitGiderSablonuClient().findFirst({ where: { id, mainCompanySlug, deletedAt: null } });
    if (!existing) throw new NotFoundException("Sabit gider şablonu bulunamadı.");
    const saved = await this.sabitGiderSablonuClient().update({ where: { id }, data: { aktifMi: false } });
    return { ok: true, data: saved, pastAccrualsPreserved: true };
  }

  async copyFixedExpenseTemplate(mainCompanySlug: string, id: string, targetMonth: string) {
    const existing = await this.sabitGiderSablonuClient().findFirst({ where: { id, mainCompanySlug, deletedAt: null } });
    if (!existing) throw new NotFoundException("Sabit gider şablonu bulunamadı.");
    return this.saveFixedExpenseTemplate(mainCompanySlug, { ...existing, id: undefined, ad: `${existing.ad} - ${targetMonth}`, baslangicAyi: targetMonth, bitisAyi: null });
  }

  async saveReportRecordOverride(mainCompanySlug: string, sourceType: string, sourceId: string, payload: Record<string, any>) {
    await this.ensureMainCompany(mainCompanySlug);
    const normalizedSourceType = upper(sourceType);
    if (!normalizedSourceType || !cleanText(sourceId)) throw new BadRequestException("Kaynak kaydı zorunludur.");
    if (normalizedSourceType === "MANUEL_GENEL_GIDER") {
      const existing = await this.manuelKalemClient().findFirst({ where: { id: sourceId, mainCompanySlug, deletedAt: null } });
      if (!existing) throw new NotFoundException("Manuel gider bulunamadı.");
      return this.saveManualReportItem(mainCompanySlug, {
        id: sourceId,
        ad: existing.ad,
        kartTipi: existing.kartTipi,
        kategoriId: payload.reportCategoryId ?? existing.kategoriId,
        firmaId: existing.firmaId,
        tarih: existing.tarih?.toISOString?.().slice(0, 10),
        baslangic: existing.baslangic?.toISOString?.().slice(0, 10),
        bitis: existing.bitis?.toISOString?.().slice(0, 10),
        tutar: payload.reportAmount ?? existing.tutar,
        kdv: payload.reportVatAmount ?? existing.kdv,
        kdvOrani: existing.kdvOrani,
        resmiTip: payload.reportOfficialType ?? existing.resmiTip,
        raporaDahil: payload.reportIncluded ?? existing.raporaDahil,
        belgeNo: existing.belgeNo,
        aciklama: payload.reportDescription ?? existing.aciklama,
        not: payload.reportNote ?? existing.not,
        odemeSekli: existing.odemeSekli,
        cariyeEkle: existing.cariyeEkle,
        islemTuru: existing.islemTuru,
        aktifMi: existing.aktifMi,
      });
    }
    const data = {
      reportIncluded: payload.reportIncluded === null || payload.reportIncluded === undefined ? null : Boolean(payload.reportIncluded),
      reportCategoryId: cleanText(payload.reportCategoryId || payload.categoryId) || null,
      reportAmount: payload.reportAmount === "" || payload.reportAmount === null || payload.reportAmount === undefined ? null : new Prisma.Decimal(Number(payload.reportAmount) || 0),
      reportDescription: cleanText(payload.reportDescription || payload.description) || null,
      reportOfficialType: cleanText(payload.reportOfficialType || payload.officialType) || null,
      reportVatAmount: payload.reportVatAmount === "" || payload.reportVatAmount === null || payload.reportVatAmount === undefined ? null : new Prisma.Decimal(Number(payload.reportVatAmount) || 0),
      reportVatIncluded: payload.reportVatIncluded === null || payload.reportVatIncluded === undefined ? null : Boolean(payload.reportVatIncluded),
      reportExpenseStatus: cleanText(payload.reportExpenseStatus || payload.expenseStatus) || null,
      reportNote: cleanText(payload.reportNote || payload.note) || null,
    };
    const saved = await this.raporKayitAyariClient().upsert({
      where: { mainCompanySlug_sourceType_sourceId: { mainCompanySlug, sourceType: normalizedSourceType, sourceId } },
      create: { mainCompanySlug, sourceType: normalizedSourceType, sourceId, ...data },
      update: data,
    });
    return { ok: true, data: saved };
  }

  async bulkSaveReportRecordOverride(mainCompanySlug: string, payload: Record<string, any>, included: boolean) {
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (!records.length) throw new BadRequestException("En az bir rapor kaydı seçmelisiniz.");
    for (const row of records) {
      await this.saveReportRecordOverride(mainCompanySlug, row.sourceType, row.sourceId, { reportIncluded: included });
    }
    return { ok: true, data: { updated: records.length, reportIncluded: included } };
  }

  async buildReportControl(mainCompanySlug: string, query: Record<string, any> = {}) {
    await this.ensureMainCompany(mainCompanySlug);
    const range = this.reportRange(query);
    const firmId = cleanText(query.firmaId || query.firmId);
    const officialFilter = upper(query.officialType || query.resmiTip || "");
    const categoryId = cleanText(query.categoryId || query.kategoriId);
    const sourceFilter = upper(query.sourceType || query.islemTuru || "");
    const statusFilter = upper(query.reportStatus || query.raporDurumu || "");
    const behaviorFilter = upper(query.companyBehavior || query.firmaDavranisi || "");
    const search = cleanText(query.search || query.q).toLocaleLowerCase("tr-TR");
    const [categories, companies, documents, currentMovements, manualRows, overrides] = await Promise.all([
      this.ensureReportCategories(mainCompanySlug),
      this.prisma.company.findMany({ where: { mainCompanySlug, deletedAt: null, isActive: true }, take: 5000 }),
      this.prisma.document.findMany({
        where: {
          mainCompanySlug,
          deletedAt: null,
          ...(firmId ? { companyId: firmId } : {}),
          OR: [{ date: { gte: range.gte, lte: range.lte } }, { processedAt: { gte: range.gte, lte: range.lte } }, { createdAt: { gte: range.gte, lte: range.lte } }],
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 20000,
      }),
      this.prisma.currentAccountMovement.findMany({
        where: { mainCompanySlug, ...(firmId ? { companyId: firmId } : {}), movementDate: { gte: range.gte, lte: range.lte }, documentId: null },
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
        take: 10000,
      }),
      this.manuelKalemClient().findMany({
        where: { mainCompanySlug, deletedAt: null, aktifMi: true, ...(firmId ? { firmaId: firmId } : {}), OR: [{ tarih: { gte: range.gte, lte: range.lte } }, { tarih: null, baslangic: { lte: range.lte } }] },
        orderBy: [{ tarih: "desc" }, { createdAt: "desc" }], take: 5000,
      }),
      this.raporKayitAyariClient().findMany({ where: { mainCompanySlug }, take: 50000 }),
    ]);
    const standaloneCurrentMovements = currentMovements.filter(
      (movement: any) =>
        !cleanText(asObject(movement.raw).reportManualExpenseId),
    );
    const companyMap = new Map(companies.map((row: any) => [row.id, row]));
    const categoryMap = new Map<string, any>(categories.map((row: any) => [row.id, row]));
    const overrideMap = new Map(overrides.map((row: any) => [`${row.sourceType}:${row.sourceId}`, row]));
    const applyDecision = (base: any, company: any) => {
      const override: any = overrideMap.get(`${base.sourceType}:${base.sourceId}`) || null;
      const decision = this.resolveCompanyAccountingBehavior(company, base, override, categories);
      return {
        ...base,
        categoryId: decision.effectiveCategoryId,
        category: decision.effectiveCategoryName,
        categorySource: decision.sourceOfDecision,
        sourceOfDecision: decision.sourceOfDecision,
        sourceOfCategory: decision.sourceOfCategory,
        sourceOfReportStatus: decision.sourceOfReportStatus,
        sourceOfExpenseStatus: decision.sourceOfExpenseStatus,
        unresolvedReasons: decision.unresolvedReasons,
        officialType: decision.officialType,
        currentAccountIncluded: decision.currentAccountIncluded,
        cariIncluded: decision.cariIncluded,
        reportIncluded: decision.reportIncluded,
        reportStatus: decision.reportStatus,
        expenseStatus: decision.expenseStatus,
        reportVatIncluded: decision.vatIncluded,
        companyBehaviorCode: decision.companyBehaviorCode,
        companyBehavior: decision.companyBehavior,
        companyDefaultCategoryId: decision.companyDefaultCategoryId,
        companyDefaultCategoryName: decision.companyDefaultCategoryName,
        defaultReportStatus: decision.defaultReportStatus,
        defaultExpenseStatus: decision.defaultExpenseStatus,
        reportAmount: override?.reportAmount == null ? base.grandTotal : decimalToNumber(override.reportAmount),
        reportVatAmount: override?.reportVatAmount == null ? base.vat : decimalToNumber(override.reportVatAmount),
        reportDescription: override?.reportDescription || base.description || "",
        reportNote: override?.reportNote || "",
        hasOverride: Boolean(
          override &&
            [
              override.reportIncluded,
              override.reportCategoryId,
              override.reportAmount,
              override.reportDescription,
              override.reportOfficialType,
              override.reportVatAmount,
              override.reportVatIncluded,
              override.reportExpenseStatus,
              override.reportNote,
            ].some((value) => value !== null && value !== undefined && value !== ""),
        ),
      };
    };
    const records: any[] = [];
    for (const document of documents) {
      if (document.companyId && !companyMap.has(document.companyId)) continue;
      const company: any = companyMap.get(document.companyId || "");
      const reportType = this.documentReportType(document, company);
      const officialType = reportType === "GAYRI_RESMI"
        ? "GAYRI_RESMI"
        : officialTypeValue(company?.defaultRecordType || "RESMI");
      const isSale = reportType === "KESILEN";
      records.push(applyDecision({
        sourceType: "DOCUMENT", sourceId: document.id, sourceLabel: isSale ? "Kesilen Fatura" : "Gelen Fatura",
        date: document.date?.toISOString?.().slice(0, 10) || document.processedAt?.toISOString?.().slice(0, 10) || document.createdAt.toISOString().slice(0, 10),
        companyId: company?.id || "", companyName: company?.name || "Firma Bilgisi Yok", transactionType: isSale ? "GELIR" : "GIDER",
        officialType, companyType: company?.firmaTuru || company?.type || "TEDARIKCI",
        sourceCategoryId: cleanText(document.raporKategoriId || asObject(document.raw).raporKategoriId || asObject(document.metadata).raporKategoriId),
        sourceCategoryName: cleanText(asObject(document.raw).raporKategoriAdi || asObject(document.metadata).raporKategoriAdi),
        expenseStatus: isSale ? "GENEL_GIDER_DEGIL" : "KONTROL_BEKLIYOR", categoryId: "", category: "Kategorisiz",
        documentNo: document.documentNo || "", description: asObject(document.raw).description || document.routeMessage || "",
        baseAmount: decimalToNumber(document.subtotal), vat: officialType === "RESMI" ? decimalToNumber(document.vatTotal) : 0,
        vatRate: decimalToNumber(document.subtotal) ? (decimalToNumber(document.vatTotal) / decimalToNumber(document.subtotal)) * 100 : 0,
        grandTotal: decimalToNumber(document.grandTotal) || decimalToNumber(document.subtotal) + decimalToNumber(document.vatTotal),
        originalRoute: isSale ? "kesilen-faturalar" : "tedarikci-faturalari",
      }, company));
    }
    standaloneCurrentMovements.forEach((movement: any) => {
      if (movement.companyId && !companyMap.has(movement.companyId)) return;
      const company: any = companyMap.get(movement.companyId || "");
      const movementType = this.canonicalMovementType(movement.movementType);
      const manualExpense = movementType === "GELEN_FATURA";
      const manualIncome = movementType === "SATIS";
      const incoming = decimalToNumber(movement.credit) > decimalToNumber(movement.debit);
      records.push(applyDecision({
        sourceType: manualExpense ? "MANUAL_CARI_EXPENSE" : manualIncome ? "MANUAL_CARI_INCOME" : "CURRENT_ACCOUNT", sourceId: movement.id, sourceLabel: manualExpense ? "Gelen Fatura" : manualIncome ? "Giden Fatura" : "Cari Hareket", date: movement.movementDate.toISOString().slice(0, 10),
        companyId: company?.id || "", companyName: company?.name || "Firma Bilgisi Yok", transactionType: manualExpense ? "GIDER" : manualIncome ? "GELIR" : incoming ? "GELIR" : "GIDER",
        officialType: upper(asObject(movement.raw).officialType || company?.defaultRecordType) === "GAYRI" ? "GAYRI_RESMI" : officialTypeValue(company?.defaultRecordType || "RESMI"),
        companyType: company?.firmaTuru || company?.type || "TEDARIKCI",
        sourceCategoryId: cleanText(asObject(movement.raw).reportCategoryId || asObject(movement.raw).kategoriId),
        sourceCategoryName: cleanText(asObject(movement.raw).reportCategoryName || asObject(movement.raw).kategori),
        expenseStatus: manualExpense ? "KONTROL_BEKLIYOR" : "GENEL_GIDER_DEGIL", reportStatus: manualExpense || manualIncome ? "KONTROL_BEKLIYOR" : "HARIC", reportIncluded: manualExpense || manualIncome ? null : false,
        categoryId: "", category: "Kategorisiz", documentNo: movement.documentNo || "", description: movement.description || "",
        baseAmount: Math.abs(decimalToNumber(movement.amount) || decimalToNumber(movement.effect)), vat: 0, vatRate: 0,
        grandTotal: Math.abs(decimalToNumber(movement.amount) || decimalToNumber(movement.effect)), originalRoute: "cari-hareketler",
      }, company));
    });
    manualRows.forEach((manual: any) => {
      const company: any = companyMap.get(manual.firmaId || "");
      const category: any = categoryMap.get(manual.kategoriId || "");
      records.push(applyDecision({
        sourceType: "MANUEL_GENEL_GIDER", sourceId: manual.id, sourceLabel: "Manuel Genel Gider", date: manual.tarih?.toISOString?.().slice(0, 10) || manual.baslangic?.toISOString?.().slice(0, 10) || range.dateFrom,
        companyId: company?.id || "", companyName: company?.name || manual.ad || "Firma Bilgisi Yok", transactionType: manual.islemTuru || "GIDER", officialType: manual.resmiTip || "GAYRI_RESMI",
        companyType: company?.firmaTuru || company?.type || "MANUEL",
        sourceCategoryId: manual.kategoriId || "",
        sourceCategoryName: category?.ad || manual.ad || "",
        expenseStatus: manual.islemTuru === "GELIR" ? "GENEL_GIDER_DEGIL" : "GENEL_GIDER", categoryId: manual.kategoriId || "", category: category?.ad || manual.ad || "Kategorisiz", documentNo: manual.belgeNo || "",
        description: manual.aciklama || manual.ad || "", baseAmount: decimalToNumber(manual.tutar), vat: decimalToNumber(manual.kdv), vatRate: decimalToNumber(manual.kdvOrani),
        grandTotal: decimalToNumber(manual.tutar) + decimalToNumber(manual.kdv), reportAmount: decimalToNumber(manual.tutar) + decimalToNumber(manual.kdv), reportVatAmount: decimalToNumber(manual.kdv),
        reportVatIncluded: manual.resmiTip === "RESMI", reportIncluded: manual.raporaDahil !== false, reportStatus: manual.raporaDahil === false ? "HARIC" : "DAHIL",
        reportDescription: manual.aciklama || manual.ad || "", reportNote: manual.not || "", originalRoute: "muhasebe-raporlari", manual: true,
      }, company));
    });
    const filtered = records.filter((row) => !officialFilter || officialFilter === "TUMU" || row.officialType === officialFilter)
      .filter((row) => !behaviorFilter || behaviorFilter === "TUMU" || row.companyBehaviorCode === behaviorFilter)
      .filter((row) => !categoryId || row.categoryId === categoryId)
      .filter((row) => !sourceFilter || sourceFilter === "TUMU" || row.sourceType === sourceFilter || upper(row.sourceLabel) === sourceFilter)
      .filter((row) => !statusFilter || statusFilter === "TUMU" || row.reportStatus === statusFilter)
      .filter((row) => !search || [row.companyName, row.documentNo, row.description, row.reportDescription, row.category, row.baseAmount, row.grandTotal].join(" ").toLocaleLowerCase("tr-TR").includes(search));
    const included = filtered.filter((row) => row.reportIncluded === true);
    const expenses = included.filter((row) => row.transactionType === "GIDER" && row.expenseStatus === "GENEL_GIDER");
    const incomes = included.filter((row) => row.transactionType === "GELIR");
    const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    const vatInRows = filtered.filter(
      (row) =>
        row.transactionType === "GIDER" &&
        row.officialType === "RESMI" &&
        row.reportVatIncluded,
    );
    const vatOutRows = filtered.filter(
      (row) =>
        row.transactionType === "GELIR" &&
        row.officialType === "RESMI" &&
        row.reportVatIncluded,
    );
    const companyGroups = new Map<string, any>();
    filtered.forEach((row) => {
      if (row.sourceType === "CURRENT_ACCOUNT") return;
      const key = row.companyId || row.companyName;
      const group = companyGroups.get(key) || { companyId: row.companyId, companyName: row.companyName, companyType: row.companyType, companyBehaviorCode: row.companyBehaviorCode, companyBehavior: row.companyBehavior, officialType: row.officialType, currentAccountIncluded: row.currentAccountIncluded, firstDate: row.date, lastDate: row.date, invoiceCount: 0, officialTotal: 0, unofficialTotal: 0, baseAmount: 0, vat: 0, grandTotal: 0, currentAccountTotal: 0, incomeTotal: 0, includedCount: 0, excludedCount: 0, pendingCount: 0, generalExpenseTotal: 0, companyDefaultCategoryId: row.companyDefaultCategoryId || "", companyDefaultCategoryName: row.companyDefaultCategoryName || "Kategorisiz", defaultReportStatus: row.defaultReportStatus || "KONTROL_BEKLIYOR", defaultExpenseStatus: row.defaultExpenseStatus || "KONTROL_BEKLIYOR", records: [] };
      const contributesFinancialTotals = row.sourceType !== "CURRENT_ACCOUNT";
      group.firstDate = group.firstDate < row.date ? group.firstDate : row.date; group.lastDate = group.lastDate > row.date ? group.lastDate : row.date;
      if (contributesFinancialTotals) {
        if (row.officialType === "RESMI") group.officialTotal += row.grandTotal; else group.unofficialTotal += row.grandTotal;
        group.baseAmount += row.baseAmount; group.vat += row.vat; group.grandTotal += row.grandTotal;
      }
      if (["DOCUMENT", "MANUAL_CARI_EXPENSE", "MANUAL_CARI_INCOME"].includes(row.sourceType)) group.invoiceCount += 1;
      if (row.currentAccountIncluded) group.currentAccountTotal += row.grandTotal;
      if (row.reportIncluded === true) group.includedCount += 1; if (row.reportIncluded === false) group.excludedCount += 1;
      if (row.reportIncluded == null) group.pendingCount += 1;
      if (row.reportIncluded === true && row.expenseStatus === "GENEL_GIDER") group.generalExpenseTotal += row.reportAmount;
      if (row.reportIncluded === true && row.transactionType === "GELIR") group.incomeTotal += row.reportAmount;
      group.records.push(row); companyGroups.set(key, group);
    });
    const companySummary = [...companyGroups.values()].map((group) => ({
      ...group,
      categoryId: group.companyDefaultCategoryId,
      category: group.companyDefaultCategoryName,
      reportStatus: group.pendingCount > 0 ? "KONTROL_BEKLIYOR" : group.includedCount > 0 ? "DAHIL" : "HARIC",
      expenseEffect: group.generalExpenseTotal > 0 ? "GENEL_GIDER" : group.pendingCount > 0 ? "KONTROL_BEKLIYOR" : "GENEL_GIDER_DEGIL",
      currentAccountEffect: group.currentAccountIncluded ? "CARI_DAHIL" : "CARI_DISI",
    })).sort((a, b) => b.grandTotal - a.grandTotal);
    const includedExpenseCompanies = companySummary.filter((row) => row.generalExpenseTotal > 0).length;
    const pendingCompanies = companySummary.filter((row) => row.pendingCount > 0).length;
    return { ok: true, data: {
      records: filtered, companySummary,
      generalExpenses: expenses.filter((row) => row.expenseStatus === "GENEL_GIDER"), vatIn: vatInRows, vatOut: vatOutRows,
      summary: { totalExpense: sum(expenses, "reportAmount"), totalIncome: sum(incomes, "reportAmount"), netResult: sum(incomes, "reportAmount") - sum(expenses, "reportAmount"), incomingVat: sum(vatInRows, "reportVatAmount"), outgoingVat: sum(vatOutRows, "reportVatAmount"), carryVat: Math.max(0, sum(vatInRows, "reportVatAmount") - sum(vatOutRows, "reportVatAmount")), includedCount: included.length, excludedCount: filtered.filter((row) => row.reportIncluded === false).length, pendingCount: filtered.filter((row) => row.reportIncluded == null).length, includedExpenseCompanies, pendingCompanies },
      filters: { startDate: range.dateFrom, endDate: range.dateTo }, categories,
    }};
  }

  async syncCompanyAccountingRules(mainCompanySlug: string, payload: Record<string, any> = {}) {
    const companyId = cleanText(payload.companyId);
    const dryRun = payload.dryRun !== false;
    const preserveExplicitOverrides = payload.preserveExplicitOverrides !== false;
    const result: any = await this.buildReportControl(mainCompanySlug, {
      startDate: "2000-01-01",
      endDate: "2100-12-31",
    });
    const allRecords = (result.data?.records || []).filter((row: any) => !companyId || row.companyId === companyId);
    const companyRows = (result.data?.companySummary || []).filter((row: any) => !companyId || row.companyId === companyId);
    const explicitOverrides = allRecords.filter((row: any) => row.sourceOfDecision === "RECORD_OVERRIDE");
    const resolvablePending = allRecords.filter((row: any) => row.reportStatus !== "KONTROL_BEKLIYOR" && row.expenseStatus !== "KONTROL_BEKLIYOR" && row.sourceOfDecision !== "RECORD_OVERRIDE");
    const unresolved = allRecords.filter((row: any) => row.reportStatus === "KONTROL_BEKLIYOR" || row.expenseStatus === "KONTROL_BEKLIYOR" || !row.categoryId);
    const categoriesResolved = allRecords.filter((row: any) => row.categoryId && row.sourceOfCategory === "COMPANY_DEFAULT").length;
    const reportStatusesResolved = allRecords.filter((row: any) => row.reportStatus !== "KONTROL_BEKLIYOR" && row.sourceOfReportStatus === "COMPANY_BEHAVIOR").length;
    const expenseStatusesResolved = allRecords.filter((row: any) => row.expenseStatus !== "KONTROL_BEKLIYOR" && row.sourceOfExpenseStatus === "COMPANY_BEHAVIOR").length;
    const report = {
      dryRun,
      companiesProcessed: companyRows.length,
      recordsProcessed: allRecords.length,
      categoriesResolved,
      reportStatusesResolved,
      expenseStatusesResolved,
      pendingRecordsResolved: resolvablePending.length,
      explicitOverridesPreserved: preserveExplicitOverrides ? explicitOverrides.length : 0,
      unresolvedCompanies: companyRows.filter((row: any) => row.pendingCount > 0 || !row.categoryId).map((row: any) => ({ companyId: row.companyId, companyName: row.companyName, pendingRecordCount: row.pendingCount, reason: !row.categoryId ? "CATEGORY_MISSING" : "COMPANY_DECISION_MISSING" })),
      unresolvedRecords: unresolved.map((row: any) => ({ sourceType: row.sourceType, sourceId: row.sourceId, companyId: row.companyId, companyName: row.companyName, reasons: row.unresolvedReasons || [] })),
      synchronizedAt: new Date().toISOString(),
    };
    if (!dryRun) {
      await this.prisma.setting.upsert({
        where: { scope_mainCompanySlug_key: { scope: "MUHASEBE_RAPOR", mainCompanySlug, key: companyId ? `company_rules_sync_${companyId}` : "company_rules_sync_all" } },
        create: { scope: "MUHASEBE_RAPOR", mainCompanySlug, key: companyId ? `company_rules_sync_${companyId}` : "company_rules_sync_all", value: report },
        update: { value: report, deletedAt: null },
      });
    }
    return { ok: true, data: report };
  }

  async syncHrAccountingExpenses(mainCompanySlug: string, payload: Record<string, any> = {}) {
    const dryRun = payload.dryRun !== false;
    const monthText = cleanText(payload.month || payload.period);
    const year = Number(monthText.slice(0, 4) || payload.year || new Date().getFullYear());
    const month = Number(monthText.slice(5, 7) || payload.monthNumber || new Date().getMonth() + 1);
    const categories = await this.ensureReportCategories(mainCompanySlug);
    const monthlyCategory = categories.find((row: any) => upper(row.ad) === "PERSONEL AYLIK");
    const weeklyCategory = categories.find((row: any) => /HAFTALIK|YEVM/.test(upper(row.ad)));
    const payrollRows = await (this.prisma as any).hrPayroll.findMany({ where: { mainCompanyId: mainCompanySlug, year, month } });
    const payrollAmount = payrollRows.reduce((sum: number, row: any) => sum + decimalToNumber(row.bankAmount) + decimalToNumber(row.cashAmount), 0);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const candidates: any[] = [];
    if (payrollRows.length) candidates.push({
      sourceType: "MONTHLY_PAYROLL", sourceKey: `HR_PAYROLL_${year}_${String(month).padStart(2, "0")}`,
      ad: `İK Aylık Bordro ${monthKey}`, kategoriId: monthlyCategory?.id || null, tarih: new Date(`${monthKey}-01T00:00:00.000Z`),
      tutar: payrollAmount, resmiTip: "KARMA", aciklama: "İK bordro net toplamı (banka + elden)",
    });
    const weeklyRows = await (this.prisma as any).weeklyPaymentSlip.findMany({ where: { mainCompanySlug } });
    for (const row of weeklyRows) {
      const raw = asObject(row.raw); const start = cleanText(raw.startDate || row.week?.split("-")?.[0]); const end = cleanText(raw.endDate || row.week?.split("-")?.slice(-1)?.[0]);
      if (!start.startsWith(monthKey) && !end.startsWith(monthKey)) continue;
      const sourceKey = `HR_WEEKLY_${monthKey}_${start}_${end}`;
      candidates.push({ sourceType: "WEEKLY_DAILY_WORKER", sourceKey, ad: `İK Haftalık Gündelikçi ${start} - ${end}`, kategoriId: weeklyCategory?.id || null, tarih: new Date(`${start}T00:00:00.000Z`), tutar: decimalToNumber(row.amount), resmiTip: "GAYRI_RESMI", aciklama: "İK haftalık gündüz + gece toplamı" });
    }
    let created = 0, updated = 0, duplicatesPrevented = 0;
    if (!dryRun) for (const item of candidates) {
      const existing = await this.manuelKalemClient().findFirst({ where: { mainCompanySlug, belgeNo: item.sourceKey, deletedAt: null } });
      const data = { ad: item.ad, kategoriId: item.kategoriId, tarih: item.tarih, tutar: item.tutar, kdv: 0, aciklama: item.aciklama, belgeNo: item.sourceKey, resmiTip: item.resmiTip, raporaDahil: true, cariyeEkle: false, islemTuru: "GIDER", aktifMi: true, not: `sourceModule=HR;sourceType=${item.sourceType};sourceKey=${item.sourceKey}` };
      if (existing) { await this.manuelKalemClient().update({ where: { id: existing.id }, data }); updated++; duplicatesPrevented++; }
      else { await this.manuelKalemClient().create({ data: { mainCompanySlug, ...data } }); created++; }
    }
    return { ok: true, data: { dryRun, period: monthKey, payrollRecords: payrollRows.length, payrollAmount, weeklyRecords: candidates.filter((x) => x.sourceType === "WEEKLY_DAILY_WORKER").length, weeklyAmount: candidates.filter((x) => x.sourceType === "WEEKLY_DAILY_WORKER").reduce((s, x) => s + x.tutar, 0), recordsPlanned: candidates.length, created, updated, duplicatesPrevented, unresolvedCategories: [!monthlyCategory ? "PERSONEL AYLIK" : "", !weeklyCategory ? "HAFTALIK/YEVMİYECİ" : ""].filter(Boolean) } };
  }

  private reportRange(query: Record<string, any> = {}) {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dateFrom = cleanText(query.dateFrom || query.startDate) || firstDay.toISOString().slice(0, 10);
    const dateTo = cleanText(query.dateTo || query.endDate) || now.toISOString().slice(0, 10);
    return {
      dateFrom,
      dateTo,
      gte: new Date(`${dateFrom}T00:00:00.000Z`),
      lte: new Date(`${dateTo}T23:59:59.999Z`),
    };
  }

  private sumRows(rows: any[], selector: (row: any) => number) {
    return rows.reduce((sum, row) => sum + selector(row), 0);
  }

  private compactReportRows(rows: any[]) {
    return rows
      .filter((row) => Number(row.tutar || row.total || row.bakiye || 0) !== 0)
      .sort((a, b) => Math.abs(Number(b.tutar || b.total || 0)) - Math.abs(Number(a.tutar || a.total || 0)))
      .slice(0, 300);
  }

  private reportAdjustmentKey(range: { dateFrom: string; dateTo: string }) {
    return `${range.dateFrom}_${range.dateTo}`;
  }

  private async loadReportManualAdjustments(mainCompanySlug: string, range: { dateFrom: string; dateTo: string }) {
    const setting = await this.prisma.setting.findFirst({
      where: {
        scope: "MUHASEBE",
        mainCompanySlug,
        key: "report_manual_adjustments",
        deletedAt: null,
      },
    });
    const allValues = asObject(setting?.value);
    return asObject(allValues[this.reportAdjustmentKey(range)]);
  }

  async saveAccountingReportAdjustments(
    mainCompanySlug: string,
    payload: Record<string, any> = {},
  ) {
    await this.ensureMainCompany(mainCompanySlug);
    const range = this.reportRange(payload);
    const key = this.reportAdjustmentKey(range);
    const adjustments = asObject(payload.adjustments);
    const existing = await this.prisma.setting.findFirst({
      where: {
        scope: "MUHASEBE",
        mainCompanySlug,
        key: "report_manual_adjustments",
        deletedAt: null,
      },
    });
    const nextValue = {
      ...asObject(existing?.value),
      [key]: Object.fromEntries(
        Object.entries(adjustments).map(([field, value]) => [
          field,
          Number(value || 0),
        ]),
      ),
    };
    if (existing) {
      await this.prisma.setting.update({
        where: { id: existing.id },
        data: { value: nextValue },
      });
    } else {
      await this.prisma.setting.create({
        data: {
          scope: "MUHASEBE",
          mainCompanySlug,
          key: "report_manual_adjustments",
          value: nextValue,
        },
      });
    }
    return this.buildAccountingReport(mainCompanySlug, "yonetici-ozet", payload);
  }

  async buildAccountingReport(
    mainCompanySlug: string,
    tip: string,
    query: Record<string, any> = {},
  ) {
    await this.ensureMainCompany(mainCompanySlug);
    const range = this.reportRange(query);
    const [companyRows, movementRows, vatRows, paymentRows, checkRows, payrollRows] =
      await Promise.all([
        this.prisma.company.findMany({
          where: { mainCompanySlug, deletedAt: null },
          take: 5000,
        }),
        this.prisma.currentAccountMovement.findMany({
          where: {
            mainCompanySlug,
            movementDate: { gte: range.gte, lte: range.lte },
          },
          orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
          take: 20000,
        }),
        this.prisma.vatRecord.findMany({
          where: {
            mainCompanySlug,
            OR: [
              { date: { gte: range.gte, lte: range.lte } },
              { documentDate: { gte: range.gte, lte: range.lte } },
            ],
          },
          take: 20000,
        }),
        this.prisma.payment.findMany({
          where: {
            mainCompanySlug,
            paymentDate: { gte: range.gte, lte: range.lte },
          },
          take: 10000,
        }),
        this.prisma.check.findMany({
          where: {
            mainCompanySlug,
            dueDate: { gte: range.gte, lte: range.lte },
          },
          take: 10000,
        }),
        this.prisma.payrollRecord.findMany({
          where: { mainCompanySlug },
          take: 5000,
        }),
      ]);
    const companyMap = new Map(
      companyRows.map((row) => [row.id, this.mapCompany(row)]),
    );
    const companyOf = (id: any) =>
      companyMap.get(cleanText(id)) || {
        firmaAdi: "",
        companyTransactionProfile: "OTHER",
        trackReceivablePayable: false,
      };
    const movementReportRows = movementRows.map((row) => {
      const company: any = companyOf(row.companyId);
      const debit = decimalToNumber(row.debit);
      const credit = decimalToNumber(row.credit);
      const amount = decimalToNumber(row.amount) || Math.max(debit, credit);
      return {
        id: row.id,
        tarih: row.movementDate?.toISOString?.().slice(0, 10) || row.movementDate,
        firmaId: row.companyId,
        firmaAdi: company.firmaAdi || company.name || "",
        profile: company.companyTransactionProfile,
        cariTakip: company.trackReceivablePayable !== false,
        sourceType: row.sourceType,
        belgeNo: row.documentNo || "",
        aciklama: row.description || "",
        borc: debit,
        alacak: credit,
        tutar: amount,
        netEtki: debit - credit,
      };
    });
    const salesRows = movementReportRows.filter((row) =>
      ["CUSTOMER", "CUSTOMER_SUPPLIER"].includes(row.profile),
    );
    const supplierRows = movementReportRows.filter((row) => row.profile === "SUPPLIER");
    const cashExpenseRows = movementReportRows.filter(
      (row) =>
        !row.cariTakip ||
        ["CASH_EXPENSE", "UNOFFICIAL_EXPENSE"].includes(row.profile),
    );
    const personnelMovementRows = movementReportRows.filter(
      (row) => row.profile === "PERSONNEL_EXPENSE",
    );
    const officialVatRows = vatRows.filter((row: any) => {
      const company: any = companyOf(row.companyId || row.firmId);
      return company.companyTransactionProfile !== "UNOFFICIAL_EXPENSE";
    });
    const incomingVat = this.sumRows(officialVatRows, (row) =>
      decimalToNumber(row.incomingVat || row.vatAmount),
    );
    const outgoingVat = this.sumRows(officialVatRows, (row) =>
      decimalToNumber(row.outgoingVat),
    );
    const cashIn = this.sumRows(paymentRows, (row) =>
      upper(row.direction) === "IN" ? decimalToNumber(row.amount) : 0,
    );
    const cashOut = this.sumRows(paymentRows, (row) =>
      upper(row.direction) !== "IN" ? decimalToNumber(row.amount) : 0,
    );
    const checkOpen = checkRows.filter(
      (row) => !["KAPANDI", "IPTAL", "CANCELLED"].includes(upper(row.status)),
    );
    const payrollTotal = this.sumRows(payrollRows, (row) =>
      decimalToNumber(row.amount),
    );
    const personnelTotal =
      payrollTotal + this.sumRows(personnelMovementRows, (row) => row.tutar);
    const salesTotal = this.sumRows(salesRows, (row) => row.borc);
    const supplierPurchaseTotal = this.sumRows(supplierRows, (row) => row.alacak || row.tutar);
    const cashExpenseTotal = this.sumRows(cashExpenseRows, (row) => row.tutar);
    const officialIncomingInvoiceTotal = this.sumRows(
      [...supplierRows, ...cashExpenseRows].filter(
        (row) => row.profile !== "UNOFFICIAL_EXPENSE",
      ),
      (row) => row.tutar,
    );
    const unofficialIncomingInvoiceTotal = this.sumRows(
      [...supplierRows, ...cashExpenseRows].filter(
        (row) => row.profile === "UNOFFICIAL_EXPENSE",
      ),
      (row) => row.tutar,
    );
    const carriedVat = this.sumRows(officialVatRows, (row) =>
      decimalToNumber(row.carryVat),
    );
    const manualAdjustments = await this.loadReportManualAdjustments(
      mainCompanySlug,
      range,
    );
    const baseEditableSummary = {
      resmiGelenFatura: officialIncomingInvoiceTotal,
      gayriResmiGelenFatura: unofficialIncomingInvoiceTotal,
      gelenKdv: incomingVat,
      devredenKdv: carriedVat,
      odenecekKdv: Math.max(0, outgoingVat - incomingVat - carriedVat),
      kesilenFaturaKdv: outgoingVat,
      kalanKdv: incomingVat + carriedVat - outgoingVat,
      personel: personnelTotal,
      yemek: 0,
      haftalik: 0,
      yevmiyeci: 0,
    };
    const editableSummary = {
      ...baseEditableSummary,
      ...Object.fromEntries(
        Object.entries(manualAdjustments).map(([key, value]) => [
          key,
          Number(value || 0),
        ]),
      ),
    };
    const detailRows = this.compactReportRows([
      ...movementReportRows.map((row) => ({
        ...row,
        tur:
          row.profile === "UNOFFICIAL_EXPENSE"
            ? "Gayri resmi gelen fatura/gider"
            : ["SUPPLIER", "CASH_EXPENSE"].includes(row.profile)
              ? "Resmi gelen fatura/gider"
              : ["CUSTOMER", "CUSTOMER_SUPPLIER"].includes(row.profile)
                ? "Kesilen fatura/satis"
                : row.profile === "PERSONNEL_EXPENSE"
                  ? "Personel"
                  : "Cari hareket",
        kdv: 0,
      })),
      ...officialVatRows.map((row: any) => ({
        id: `vat-${row.id}`,
        tarih:
          row.date?.toISOString?.().slice(0, 10) ||
          row.documentDate?.toISOString?.().slice(0, 10) ||
          "",
        firmaAdi: companyOf(row.companyId || row.firmId).firmaAdi || "",
        tur:
          decimalToNumber(row.outgoingVat) > 0
            ? "Kesilen fatura KDV"
            : "Gelen KDV",
        belgeNo: row.documentNo || "",
        aciklama: "KDV kaydi",
        tutar: decimalToNumber(row.baseAmount || row.total),
        kdv:
          decimalToNumber(row.incomingVat) ||
          decimalToNumber(row.outgoingVat) ||
          decimalToNumber(row.vatAmount),
      })),
    ]);
    const estimatedProfit =
      salesTotal - supplierPurchaseTotal - cashExpenseTotal - personnelTotal;
    const sections: Record<string, any> = {
      yonetici: {
        summaryCards: [
          { label: "Satis / Musteri", value: salesTotal },
          { label: "Tedarikci / Satin Alma", value: supplierPurchaseTotal },
          { label: "Pesin ve Takip Disi Gider", value: cashExpenseTotal },
          { label: "Personel Gideri", value: personnelTotal },
          { label: "Tahmini Kar / Zarar", value: estimatedProfit },
        ],
        rows: [
          { alan: "Satis / musteri", tutar: salesTotal },
          { alan: "Tedarikci / satin alma", tutar: supplierPurchaseTotal },
          { alan: "Pesin gider", tutar: cashExpenseTotal },
          { alan: "Personel gideri", tutar: personnelTotal },
          { alan: "KDV odenecek/devreden", tutar: outgoingVat - incomingVat },
          { alan: "Nakit giris", tutar: cashIn },
          { alan: "Nakit cikis", tutar: cashOut },
          { alan: "Tahmini kar zarar", tutar: estimatedProfit },
        ],
      },
      "satis-musteri": { rows: this.compactReportRows(salesRows) },
      "tedarikci-satin-alma": {
        rows: this.compactReportRows(supplierRows),
      },
      "pesin-giderler": {
        rows: this.compactReportRows(cashExpenseRows),
      },
      "personel-giderleri": {
        rows: [
          ...this.compactReportRows(personnelMovementRows),
          ...payrollRows.map((row) => ({
            id: row.id,
            tarih: row.month,
            firmaAdi: row.personnelId || "IK bordro",
            profile: "PERSONNEL_EXPENSE",
            tutar: decimalToNumber(row.amount),
            aciklama: "PayrollRecord",
          })),
        ],
      },
      "kdv-ozet": {
        rows: [
          { alan: "Indirilecek KDV", tutar: incomingVat },
          { alan: "Hesaplanan KDV", tutar: outgoingVat },
          { alan: "Odenecek / devreden", tutar: outgoingVat - incomingVat },
        ],
      },
      "nakit-cek-ozet": {
        rows: [
          { alan: "Nakit giris", tutar: cashIn },
          { alan: "Nakit cikis", tutar: cashOut },
          { alan: "Acik cek sayisi", tutar: checkOpen.length },
          {
            alan: "Acik cek tutari",
            tutar: this.sumRows(checkOpen, (row) => decimalToNumber(row.amount)),
          },
        ],
      },
    };
    const selected = sections[tip] || sections.yonetici;
    return {
      tip,
      title: tip === "yonetici-ozet" ? "Yonetici Kar Zarar Ozeti" : tip,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      editableSummary,
      calculatedSummary: baseEditableSummary,
      manualAdjustments,
      detailRows,
      summaryCards: selected.summaryCards || sections.yonetici.summaryCards,
      rows: selected.rows || [],
      sections,
      sourceCounts: {
        companies: companyRows.length,
        movements: movementRows.length,
        vatRecords: vatRows.length,
        payments: paymentRows.length,
        checks: checkRows.length,
        payrollRecords: payrollRows.length,
      },
      note: "Sadece mevcut SQLite kayitlarindan hesaplandi; demo veri eklenmedi.",
    };
  }

  async saveCompanyAlias(
    mainCompanySlug: string,
    companyId: string,
    payload: Record<string, any>,
  ) {
    await this.ensureMainCompany(mainCompanySlug);
    const company = await this.requireCompany(mainCompanySlug, companyId);
    const rawName = cleanText(payload.rawName || payload.alias || payload.name);
    if (!rawName) throw new BadRequestException("EÅŸleştirilecek firma adÄ± zorunludur.");
    const normalizedName = normalizeName(rawName);
    const existingAlias = await this.prisma.companyAlias.findFirst({
      where: { mainCompanySlug, normalizedName },
    });
    const aliasData = {
      companyId: company.id,
      rawName,
      normalizedName,
      isActive: payload.isActive ?? payload.aktif ?? true,
      source: cleanText(payload.source || "MANUAL") || "MANUAL",
      taxNo: cleanText(payload.taxNo || payload.vergiNo) || null,
      deletedAt: null,
    };
    if (existingAlias) {
      await this.prisma.companyAlias.update({
        where: { id: existingAlias.id },
        data: aliasData,
      });
    } else {
      await this.prisma.companyAlias.create({
        data: { ...aliasData, mainCompanySlug },
      });
    }
    return this.mapCompany(company);
  }

  async mergeCompanyInto(
    mainCompanySlug: string,
    sourceCompanyId: string,
    targetCompanyId: string,
    payload: Record<string, any> = {},
  ) {
    if (sourceCompanyId === targetCompanyId) {
      throw new BadRequestException("AynÄ± firma kendi iÃ§ine eÅŸleştirilemez.");
    }
    await this.ensureMainCompany(mainCompanySlug);
    const source = await this.requireCompany(mainCompanySlug, sourceCompanyId);
    const target = await this.requireCompany(mainCompanySlug, targetCompanyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.companyAlias.upsert({
        where: {
          mainCompanySlug_normalizedName: {
            mainCompanySlug,
            normalizedName: normalizeName(source.name),
          },
        },
        create: {
          mainCompanySlug,
          companyId: target.id,
          rawName: source.name,
          normalizedName: normalizeName(source.name),
          source: cleanText(payload.source || "FIRMA_BIRLESTIRME") || "FIRMA_BIRLESTIRME",
          taxNo: source.taxNo || null,
          isActive: true,
        },
        update: {
          companyId: target.id,
          rawName: source.name,
          taxNo: source.taxNo || null,
          source: cleanText(payload.source || "FIRMA_BIRLESTIRME") || "FIRMA_BIRLESTIRME",
          isActive: true,
          deletedAt: null,
        },
      });
      await tx.companyAlias.updateMany({
        where: { mainCompanySlug, companyId: source.id },
        data: { companyId: target.id },
      });
      await tx.currentAccountMovement.updateMany({
        where: { mainCompanySlug, companyId: source.id },
        data: { companyId: target.id },
      });
      await tx.document.updateMany({
        where: { mainCompanySlug, companyId: source.id },
        data: { companyId: target.id },
      });
      await tx.vatRecord.updateMany({
        where: { mainCompanySlug, companyId: source.id },
        data: { companyId: target.id },
      });
      await tx.salesInvoiceState.updateMany({
        where: { mainCompanySlug, companyId: source.id },
        data: { companyId: target.id },
      });
      await tx.company.update({
        where: { id: target.id },
        data: {
          isActive: true,
          deletedAt: null,
          raw: {
            ...this.rawOf(target),
            lastMergedCompanyId: source.id,
            lastMergedCompanyName: source.name,
            lastMergedAt: new Date().toISOString(),
          },
        },
      });
      await tx.company.update({
        where: { id: source.id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          raw: {
            ...this.rawOf(source),
            mergedIntoCompanyId: target.id,
            mergedIntoCompanyName: target.name,
            mergedAt: new Date().toISOString(),
          },
        },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug,
          entityType: "company",
          entityId: target.id,
          actionType: "MERGED",
          description: `${source.name} kaydÄ± ${target.name} firmasÄ±na birleştirildi.`,
          oldValue: this.mapCompany(source),
          newValue: {
            sourceCompanyId: source.id,
            sourceCompanyName: source.name,
            targetCompanyId: target.id,
            targetCompanyName: target.name,
          },
        },
      });
    });
    await this.recalculateCompanyBalance(this.prisma, mainCompanySlug, target.id);
    await this.recalculateCompanyBalance(this.prisma, mainCompanySlug, source.id);
    const refreshed = await this.requireCompany(mainCompanySlug, target.id);
    return this.mapCompany(refreshed);
  }

  async getCompany(mainCompanySlug: string, id: string) {
    const row = await this.requireCompany(mainCompanySlug, id);
    const aliases = await this.prisma.companyAlias.findMany({
      where: { mainCompanySlug, companyId: id },
      orderBy: { rawName: "asc" },
    });
    const logs = await this.prisma.activityLog.findMany({
      where: {
        mainCompanySlug,
        entityType: "company",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const movementRows = await this.prisma.currentAccountMovement.findMany({
      where: { mainCompanySlug, companyId: id },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
    });
    return {
      ok: true,
      data: {
        ...this.mapCompany(
          row,
          this.summarizeCompanyFromRows(row, movementRows),
        ),
        aliases,
        logs,
      },
    };
  }

  private async requireCompany(mainCompanySlug: string, id: string) {
    await this.ensureMainCompany(mainCompanySlug);
    const row = await this.prisma.company.findFirst({
      where: { id, mainCompanySlug },
    });
    if (!row) throw new NotFoundException("Firma kartÄ± bulunamadÄ±.");
    return row;
  }

  private parseDate(value: unknown) {
    const text = cleanText(value) || new Date().toISOString().slice(0, 10);
    const date = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException("Tarih geÃ§ersiz.");
    return date;
  }

  private canonicalMovementType(value: unknown) {
    const token = normalizedToken(value);
    const aliases: Record<string, string> = {
      BORC: "BORC",
      ALACAK: "ALACAK",
      TAHSILAT: "TAHSILAT",
      ODEME: "ODEME",
      CEK_GIRISI: "CEK_GIRISI",
      KREDI_KARTI_ODEMESI: "KREDI_KARTI_ODEMESI",
      KREDI_KARTI_TAHSILATI: "KREDI_KARTI_TAHSILATI",
      CEK_ODEMESI: "CEK_ODEMESI",
      CEK_TAHSILATI: "CEK_TAHSILATI",
      GELIR: "GELIR",
      GIDER: "GIDER",
      SATIS: "SATIS",
      FATURA: "FATURA",
      BORCLANDIRMA: "BORCLANDIRMA",
      ALIS: "ALIS",
      GELEN_FATURA: "GELEN_FATURA",
      IADE: "IADE",
      ISKONTO: "ISKONTO",
      VIRMAN: "VIRMAN",
      DUZELTME: "DUZELTME",
      BAKIYE: "BAKIYE",
    };
    return aliases[token] || token || "BORC";
  }

  private resolveCurrentAccountDirection(
    movementType: unknown,
    companyType: unknown,
  ) {
    const token = this.canonicalMovementType(movementType);
    if (CURRENT_ACCOUNT_SUPPLIER_INVOICE_TYPES.has(token)) return "CREDIT" as const;
    if (CURRENT_ACCOUNT_CREDIT_TYPES.has(token)) return "CREDIT" as const;
    if (CURRENT_ACCOUNT_DEBIT_TYPES.has(token)) return "DEBIT" as const;
    if (token === "GELIR") {
      return firmTypeValue(companyType) === "SATICI"
        ? ("CREDIT" as const)
        : ("DEBIT" as const);
    }
    return "DEBIT" as const;
  }

  private resolveCurrentAccountPosting(
    company: any,
    movementType: unknown,
    amountValue: number,
  ) {
    const normalizedType = this.canonicalMovementType(movementType);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      throw new BadRequestException("Tutar zorunludur.");
    }
    const absoluteAmount = Math.abs(amountValue);
    const effect = CURRENT_ACCOUNT_SIGNED_TYPES.has(normalizedType)
      ? amountValue
      : this.resolveCurrentAccountDirection(normalizedType, company?.type) ===
          "CREDIT"
        ? -absoluteAmount
        : absoluteAmount;
    return {
      movementType: normalizedType,
      effect,
      debit: effect > 0 ? effect : 0,
      credit: effect < 0 ? Math.abs(effect) : 0,
      amount: Math.abs(effect),
    };
  }

  private async findLinkedManualLedgerMovement(
    client: any,
    mainCompanySlug: string,
    manualId: string,
    linkedMovementId?: string | null,
  ) {
    const preferredId = cleanText(linkedMovementId);
    if (preferredId) {
      const linked = await client.currentAccountMovement.findFirst({
        where: { id: preferredId, mainCompanySlug },
      });
      if (linked) return linked;
    }
    const candidates = await client.currentAccountMovement.findMany({
      where: { mainCompanySlug, sourceType: "RAPOR_MANUEL_GIDER" },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    return (
      candidates.find(
        (row: any) =>
          cleanText(this.rawOf(row).reportManualExpenseId) === manualId,
      ) || null
    );
  }

  private async syncManualReportItemLedger(
    mainCompanySlug: string,
    manual: any,
  ) {
    const manualId = cleanText(manual?.id);
    if (!manualId) return manual;
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.muhasebeRaporManuelKalem.findFirst({
        where: { id: manualId, mainCompanySlug },
      });
      if (!latest) return manual;

      const linked = await this.findLinkedManualLedgerMovement(
        tx,
        mainCompanySlug,
        latest.id,
        latest.cariHareketId,
      );
      const desiredPosting =
        latest.aktifMi !== false &&
        !latest.deletedAt &&
        Boolean(latest.cariyeEkle) &&
        cleanText(latest.firmaId);
      const affectedCompanyIds = new Set<string>();

      if (linked) affectedCompanyIds.add(linked.companyId);

      if (!desiredPosting) {
        if (linked && this.isMovementActive(linked)) {
          await tx.currentAccountMovement.update({
            where: { id: linked.id },
            data: {
              raw: {
                ...this.rawOf(linked),
                source: "RAPOR_MANUEL_GIDER",
                status: "PASIF",
                durum: "PASIF",
                active: false,
                passiveAt: new Date().toISOString(),
                reportManualExpenseId: latest.id,
              },
            },
          });
        }
        if (latest.cariHareketId) {
          await tx.muhasebeRaporManuelKalem.update({
            where: { id: latest.id },
            data: { cariHareketId: null },
          });
        }
        for (const companyId of affectedCompanyIds) {
          await this.recalculateCompanyBalance(tx, mainCompanySlug, companyId);
        }
        return tx.muhasebeRaporManuelKalem.findUnique({
          where: { id: latest.id },
        });
      }

      const company = await tx.company.findFirst({
        where: { id: latest.firmaId, mainCompanySlug },
      });
      if (!company) {
        throw new BadRequestException("Cari için seçilen firma bulunamadı.");
      }

      const total = decimalToNumber(latest.tutar) + decimalToNumber(latest.kdv);
      if (!(total > 0)) {
        throw new BadRequestException("Cari hareket için toplam tutar 0'dan büyük olmalıdır.");
      }

      const posting = this.resolveCurrentAccountPosting(
        company,
        latest.islemTuru || "GIDER",
        total,
      );
      affectedCompanyIds.add(company.id);

      const baseData = {
        mainCompanySlug,
        companyId: company.id,
        movementDate: latest.tarih || latest.baslangic || new Date(),
        movementType: posting.movementType,
        sourceType: "RAPOR_MANUEL_GIDER",
        documentNo: latest.belgeNo || null,
        documentId: null,
        description: latest.aciklama || latest.ad,
        debit: new Prisma.Decimal(posting.debit),
        credit: new Prisma.Decimal(posting.credit),
        amount: new Prisma.Decimal(posting.amount),
        effect: new Prisma.Decimal(posting.effect),
        balanceAfter: new Prisma.Decimal(0),
        raw: {
          ...(linked ? this.rawOf(linked) : {}),
          reportManualExpenseId: latest.id,
          linkedLedgerMovementId: linked?.id || latest.cariHareketId || "",
          resmiGayri: officialTypeValue(latest.resmiTip),
          status: "ISLENDI",
          durum: "ISLENDI",
          active: true,
          source: "RAPOR_MANUEL_GIDER",
          documentType: latest.islemTuru === "GELIR" ? "MANUEL_GELIR" : "MANUEL_GIDER",
          postToLedger: true,
          reportOnly: false,
        },
      };

      const movement = linked
        ? await tx.currentAccountMovement.update({
            where: { id: linked.id },
            data: baseData,
          })
        : await tx.currentAccountMovement.create({ data: baseData });

      if (latest.cariHareketId !== movement.id) {
        await tx.muhasebeRaporManuelKalem.update({
          where: { id: latest.id },
          data: { cariHareketId: movement.id },
        });
      }

      for (const companyId of affectedCompanyIds) {
        await this.recalculateCompanyBalance(tx, mainCompanySlug, companyId);
      }

      return tx.muhasebeRaporManuelKalem.findUnique({
        where: { id: latest.id },
      });
    });
  }

  private async addMovement(
    mainCompanySlug: string,
    companyId: string,
    payload: {
      date?: unknown;
      movementType: string;
      sourceType: string;
      documentNo?: unknown;
      description?: unknown;
      effect: number;
      legacyId?: unknown;
    },
  ) {
    const effect = Number(payload.effect || 0);
    if (!Number.isFinite(effect))
      throw new BadRequestException("Tutar geÃ§ersiz.");
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, mainCompanySlug },
      });
      if (!company) throw new NotFoundException("Firma kartÄ± bulunamadÄ±.");
      const currentBalance = decimalToNumber(company.currentBalance);
      const balanceAfter = currentBalance + effect;
      const movement = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug,
          companyId,
          movementDate: this.parseDate(payload.date),
          movementType: payload.movementType,
          sourceType: payload.sourceType,
          documentNo: cleanText(payload.documentNo) || null,
          documentId: cleanText((payload as any).documentId) || null,
          description: cleanText(payload.description) || null,
          debit: new Prisma.Decimal(effect > 0 ? effect : 0),
          credit: new Prisma.Decimal(effect < 0 ? Math.abs(effect) : 0),
          amount: new Prisma.Decimal(Math.abs(effect)),
          effect: new Prisma.Decimal(effect),
          balanceAfter: new Prisma.Decimal(balanceAfter),
          legacyId: cleanText(payload.legacyId) || null,
          raw: (payload as any).raw ?? null,
        },
      });
      await tx.company.update({
        where: { id: company.id },
        data: { currentBalance: new Prisma.Decimal(balanceAfter) },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug,
          entityType: "current_account_movement",
          entityId: movement.id,
          actionType: "CREATED",
          description: `${company.name} cari hareketi oluÅŸturuldu`,
          newValue: this.mapMovement(movement),
        },
      });
      return this.mapMovement(movement);
    });
  }

  async addOpeningBalance(
    mainCompanySlug: string,
    companyId: string,
    payload: Record<string, any>,
  ) {
    await this.requireCompany(mainCompanySlug, companyId);
    return this.addMovement(mainCompanySlug, companyId, {
      date: payload.date || payload.tarih,
      movementType: "BAKIYE",
      sourceType: cleanText(payload.sourceType || "ACILIS_BAKIYESI"),
      documentNo: payload.documentNo || payload.belge,
      description:
        payload.description || payload.aciklama || "AÃ§Ä±lÄ±ÅŸ Bakiyesi",
      effect: Number(payload.amount ?? payload.tutar ?? 0),
    });
  }

  async adjustBalance(
    mainCompanySlug: string,
    companyId: string,
    payload: Record<string, any>,
  ) {
    const company = await this.requireCompany(mainCompanySlug, companyId);
    const target = Number(payload.targetBalance ?? payload.hedefBakiye ?? 0);
    if (!Number.isFinite(target))
      throw new BadRequestException("Hedef bakiye geÃ§ersiz.");
    const effect = target - decimalToNumber(company.currentBalance);
    if (Math.abs(effect) < 0.005) {
      return {
        ok: true,
        skipped: true,
        reason: "BALANCE_ALREADY_MATCHES",
        data: {
          companyId,
          currentBalance: decimalToNumber(company.currentBalance),
          targetBalance: target,
          difference: 0,
        },
      };
    }
    return this.addMovement(mainCompanySlug, companyId, {
      date: payload.date || payload.tarih,
      movementType: "BAKIYE",
      sourceType: cleanText(payload.sourceType || "BAKIYE_DUZELTME"),
      documentNo: payload.documentNo || payload.belge,
      description:
        payload.description || payload.aciklama || "Toplam bakiyeyi ayarla",
      effect,
    });
  }

  async listMovements(
    mainCompanySlug: string,
    companyId: string,
    pageText?: string,
    limitText?: string,
  ) {
    await this.requireCompany(mainCompanySlug, companyId);
    const page = Math.max(1, Number(pageText || 1) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(limitText || DEFAULT_LIMIT) || DEFAULT_LIMIT),
    );
    const where = { mainCompanySlug, companyId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.currentAccountMovement.count({ where }),
      this.prisma.currentAccountMovement.findMany({
        where,
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return this.response(
      page,
      limit,
      total,
      rows.map((row) => this.mapMovement(row)),
    );
  }

  async getCompanySummary(
    mainCompanySlug: string,
    companyId: string,
    query: Record<string, any> = {},
  ) {
    const company = await this.requireCompany(mainCompanySlug, companyId);
    const rows = await this.prisma.currentAccountMovement.findMany({
      where: { mainCompanySlug, companyId },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
    });
    const filteredRows = this.filterMovementRows(rows, query);
    return {
      ok: true,
      data: {
        companyId,
        firmaId: companyId,
        firmaAdi: company.name,
        ...this.summarizeCompanyFromRows(company, rows, filteredRows),
        ...(() => {
          const classification = this.classificationFor(
            company,
            this.summarizeCompanyFromRows(company, rows, filteredRows),
          );
          return classification.trackReceivablePayable
            ? {}
            : {
                toplamBorc: 0,
                toplamAlacak: 0,
                mevcutBakiye: classification.realBalance,
                guncelBakiye: classification.realBalance,
                filtrelenenBakiye: classification.realBalance,
                bakiyeYonu: "CARI_TAKIP_DISI",
                bakiyeNotu: classification.balanceNote,
                cariTakipDisi: true,
                cariBakiyesiBilgiAmacli: true,
                gercekCariBakiye: classification.realBalance,
              };
        })(),
      },
    };
  }

  async listCurrentAccountMovements(
    mainCompanySlug: string,
    query: Record<string, any> = {},
  ) {
    const firmId = cleanText(query.firmId || query.companyId);
    const where: Prisma.CurrentAccountMovementWhereInput = {
      mainCompanySlug,
      ...(firmId ? { companyId: firmId } : {}),
    };
    const rows = await this.prisma.currentAccountMovement.findMany({
      where,
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: firmId ? 2000 : 500,
    });
    const companyIds = [...new Set(rows.map((row) => row.companyId))];
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { mainCompanySlug, id: { in: companyIds } },
        })
      : [];
    const trackableMap = new Map(
      companies.map((row) => [
        row.id,
        this.classificationFor(row).trackReceivablePayable,
      ]),
    );
    const includeNonTrackable =
      query.includeNonTrackable === "true" ||
      query.cariTakipDisi === "true" ||
      query.showCariTakipDisi === "true";
    const filtered = this.filterMovementRows(rows, query).filter((row) =>
      includeNonTrackable ? true : trackableMap.get(row.companyId) !== false,
    );
    return {
      ok: true,
      data: filtered.map((row) => this.mapMovementDetail(row)),
    };
  }

  async getCurrentAccountMovement(mainCompanySlug: string, movementId: string) {
    const row = await this.prisma.currentAccountMovement.findFirst({
      where: { id: movementId, mainCompanySlug },
    });
    if (!row) throw new NotFoundException("Cari hareket bulunamadÄ±.");
    const company = await this.prisma.company.findFirst({
      where: { id: row.companyId, mainCompanySlug },
    });
    return {
      ok: true,
      data: {
        ...this.mapMovementDetail(row),
        firma: company?.name || "",
        firmaAdi: company?.name || "",
      },
    };
  }

  async createCurrentAccountMovement(
    mainCompanySlug: string,
    payload: Record<string, any>,
  ) {
    const companyId = cleanText(
      payload.firmId || payload.firmaId || payload.companyId,
    );
    const company = await this.requireCompany(mainCompanySlug, companyId);
    const amountRaw = Number(payload.tutar ?? payload.amount ?? 0);
    const posting = this.resolveCurrentAccountPosting(
      company,
      payload.islemTipi || payload.movementType || "BORC",
      amountRaw,
    );
    const description = cleanText(payload.aciklama || payload.description);
    if (!description) {
      throw new BadRequestException("AÃ§Ä±klama zorunludur.");
    }
    const raw = {
      ...asObject(payload.raw),
      resmiGayri: officialTypeValue(
        payload.resmiGayri ||
          payload.officialType ||
          company.defaultRecordType ||
          "RESMI",
      ),
      vade: cleanText(payload.vade || payload.dueDate),
      status: upper(payload.status || payload.durum || "ISLENDI") || "ISLENDI",
      source:
        cleanText(payload.source || payload.kaynak || "MANUEL") || "MANUEL",
      active: payload.active === undefined ? true : Boolean(payload.active),
      documentType: cleanText(payload.documentType || payload.belgeTipi),
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug,
          companyId,
          movementDate: this.parseDate(payload.tarih || payload.date),
          movementType: posting.movementType,
          sourceType:
            cleanText(payload.source || payload.kaynak || "MANUAL") || "MANUAL",
          documentNo: cleanText(payload.documentNo || payload.belgeNo) || null,
          documentId: cleanText(payload.documentId) || null,
          description,
          debit: new Prisma.Decimal(posting.debit),
          credit: new Prisma.Decimal(posting.credit),
          amount: new Prisma.Decimal(posting.amount),
          effect: new Prisma.Decimal(posting.effect),
          balanceAfter: new Prisma.Decimal(0),
          raw,
        },
      });
      await this.recalculateCompanyBalance(tx, mainCompanySlug, companyId);
      await tx.activityLog.create({
        data: {
          mainCompanySlug,
          entityType: "current_account_movement",
          entityId: row.id,
          actionType: "CREATED",
          description: `${company.name} iÃ§in manuel cari hareket oluÅŸturuldu`,
          newValue: this.mapMovementDetail(row),
        },
      });
      return row;
    });
    return this.getCurrentAccountMovement(mainCompanySlug, saved.id);
  }

  async updateCurrentAccountMovement(
    mainCompanySlug: string,
    movementId: string,
    payload: Record<string, any>,
  ) {
    const existing = await this.prisma.currentAccountMovement.findFirst({
      where: { id: movementId, mainCompanySlug },
    });
    if (!existing) throw new NotFoundException("Cari hareket bulunamadÄ±.");
    if (existing.documentId) {
      throw new BadRequestException("Belgeden gelen hareket dÃ¼zenlenemez.");
    }
    const amountValue = payload.tutar ?? payload.amount;
    const hasAmount =
      amountValue !== undefined &&
      amountValue !== null &&
      String(amountValue).trim() !== "";
    const parsedAmount = hasAmount
      ? Number(amountValue)
      : decimalToNumber(existing.effect || existing.amount);
    const company = await this.requireCompany(mainCompanySlug, existing.companyId);
    const posting = this.resolveCurrentAccountPosting(
      company,
      payload.islemTipi || payload.movementType || existing.movementType || "BORC",
      parsedAmount,
    );
    const nextRaw = {
      ...this.rawOf(existing),
      ...asObject(payload.raw),
      resmiGayri: officialTypeValue(
        payload.resmiGayri ||
          payload.officialType ||
          this.rawOf(existing).resmiGayri ||
          "RESMI",
      ),
      vade:
        payload.vade === "" || payload.dueDate === ""
          ? ""
          : cleanText(
              payload.vade || payload.dueDate || this.rawOf(existing).vade,
            ),
      status:
        upper(
          payload.status ||
            payload.durum ||
            this.rawOf(existing).status ||
            "ISLENDI",
        ) || "ISLENDI",
      source:
        cleanText(
          payload.source ||
            payload.kaynak ||
            this.rawOf(existing).source ||
            existing.sourceType ||
            "MANUEL",
        ) || "MANUEL",
      active:
        payload.active === undefined
          ? this.rawOf(existing).active !== false
          : Boolean(payload.active),
      documentType: cleanText(
        payload.documentType ||
          payload.belgeTipi ||
          this.rawOf(existing).documentType,
      ),
    };
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.currentAccountMovement.update({
        where: { id: movementId },
        data: {
          movementDate:
            payload.tarih || payload.date
              ? this.parseDate(payload.tarih || payload.date)
              : undefined,
          movementType: posting.movementType,
          sourceType:
            cleanText(
              payload.source || payload.kaynak || existing.sourceType,
            ) || existing.sourceType,
          documentNo:
            payload.documentNo !== undefined || payload.belgeNo !== undefined
              ? cleanText(payload.documentNo || payload.belgeNo) || null
              : undefined,
          description:
            payload.aciklama !== undefined || payload.description !== undefined
              ? cleanText(payload.aciklama || payload.description) || null
              : undefined,
          debit: new Prisma.Decimal(posting.debit),
          credit: new Prisma.Decimal(posting.credit),
          amount: new Prisma.Decimal(posting.amount),
          effect: new Prisma.Decimal(posting.effect),
          raw: nextRaw,
        },
      });
      await this.recalculateCompanyBalance(
        tx,
        mainCompanySlug,
        existing.companyId,
      );
      await tx.activityLog.create({
        data: {
          mainCompanySlug,
          entityType: "current_account_movement",
          entityId: movementId,
          actionType: "UPDATED",
          description: "Cari hareket gÃ¼ncellendi",
          oldValue: this.mapMovementDetail(existing),
          newValue: this.mapMovementDetail(updated),
        },
      });
    });
    return this.getCurrentAccountMovement(mainCompanySlug, movementId);
  }

  async passiveCurrentAccountMovement(
    mainCompanySlug: string,
    movementId: string,
  ) {
    const existing = await this.prisma.currentAccountMovement.findFirst({
      where: { id: movementId, mainCompanySlug },
    });
    if (!existing) throw new NotFoundException("Cari hareket bulunamadÄ±.");
    if (existing.documentId) {
      throw new BadRequestException("Belgeden gelen hareket pasife alÄ±namaz.");
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.currentAccountMovement.update({
        where: { id: movementId },
        data: {
          raw: {
            ...this.rawOf(existing),
            status: "PASIF",
            durum: "PASIF",
            active: false,
            passiveAt: new Date().toISOString(),
          },
        },
      });
      await this.recalculateCompanyBalance(
        tx,
        mainCompanySlug,
        existing.companyId,
      );
      await tx.activityLog.create({
        data: {
          mainCompanySlug,
          entityType: "current_account_movement",
          entityId: movementId,
          actionType: "PASSIVE",
          description: "Cari hareket pasife alÄ±ndÄ±",
          oldValue: this.mapMovementDetail(existing),
          newValue: this.mapMovementDetail(updated),
        },
      });
    });
    return this.getCurrentAccountMovement(mainCompanySlug, movementId);
  }

  private async log(
    mainCompanySlug: string,
    entityType: string,
    entityId: string,
    actionType: string,
    detail: Record<string, any>,
  ) {
    await this.prisma.activityLog.create({
      data: {
        mainCompanySlug,
        entityType,
        entityId,
        actionType,
        description: `${entityType} ${actionType}`,
        ...detail,
      },
    });
  }
}
