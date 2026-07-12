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

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function upper(value: unknown) {
  return cleanText(value).toUpperCase();
}

function officialTypeValue(value: unknown) {
  const raw = upper(value);
  if (["UNOFFICIAL", "GAYRI", "GAYRİ"].includes(raw)) return "GAYRI";
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
    const trackReceivablePayable =
      explicitTrack === undefined
        ? TRACKABLE_PROFILES.has(normalized)
        : explicitTrack !== false && explicitTrack !== "false";
    const defaultCashSettlement =
      explicitCash === undefined
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
      vatOnlyExpense: this.isVatOnlyExpense(raw),
      sadeceKdvKullan: this.isVatOnlyExpense(raw),
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
    const saved = await this.saveCompany(mainCompanySlug, {
      ...this.mapCompany(existing),
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
        where: { mainCompanySlug, deletedAt: null },
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
    const categories = await this.ensureReportCategories(mainCompanySlug);
    const companies = await this.prisma.company.findMany({
      where: { mainCompanySlug, deletedAt: null },
      take: 5000,
    });
    const companyMap = new Map(companies.map((row: any) => [row.id, row]));
    const documents = await this.prisma.document.findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        ...(firmId ? { companyId: firmId } : {}),
        OR: [
          { date: { gte: range.gte, lte: range.lte } },
          { processedAt: { gte: range.gte, lte: range.lte } },
          { createdAt: { gte: range.gte, lte: range.lte } },
        ],
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 20000,
    });
    const categorySummary = new Map<string, any>();
    const movements = [];
    for (const document of documents) {
      const company = companyMap.get(document.companyId || "");
      const type = this.documentReportType(document, company);
      const { category, source } = await this.resolveReportCategory(
        mainCompanySlug,
        document,
        company,
        categories,
        type,
      );
      const rawAmount = decimalToNumber(document.subtotal);
      const vat = type === "GAYRI_RESMI" ? 0 : decimalToNumber(document.vatTotal);
      const vatOnlyExpense =
        type !== "KESILEN" &&
        this.isVatOnlyExpense({
          raw: {
            ...(company?.raw && typeof company.raw === "object"
              ? company.raw
              : {}),
            ...(document?.raw && typeof document.raw === "object"
              ? document.raw
              : {}),
          },
        });
      const amount = vatOnlyExpense ? 0 : rawAmount;
      const total = vatOnlyExpense
        ? 0
        : amount + vat || decimalToNumber(document.grandTotal);
      const row = {
        id: document.id,
        tarih:
          document.date?.toISOString?.().slice(0, 10) ||
          document.processedAt?.toISOString?.().slice(0, 10) ||
          document.createdAt?.toISOString?.().slice(0, 10) ||
          "",
        tur: type,
        turEtiketi: this.reportTypeLabel(type),
        kategoriId: category?.id || "",
        kategori: category?.ad || "Diğer Giderler",
        kategoriKaynagi: document.kategoriKaynagi || source,
        firmaId: company?.id || "",
        firma: company?.name || "",
        belgeNo: document.documentNo || "",
        aciklama: asObject(document.raw).description || document.routeMessage || "",
        tutar: amount,
        kdv: vat,
        genelToplam: total,
        hamMatrah: rawAmount,
        hamGenelToplam: decimalToNumber(document.grandTotal),
        giderHesabinaDahil: !vatOnlyExpense,
        kdvHesabinaDahil: type !== "GAYRI_RESMI",
        giderHesaplamaTipi: vatOnlyExpense ? "VAT_ONLY" : "FULL",
        hesapNotu: vatOnlyExpense
          ? "Firma karti: sadece KDV kullanilir, matrah gider hesabina girmez."
          : "",
      };
      this.addSummaryRow(categorySummary, category, amount, vat, total);
      movements.push(row);
    }

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
    const categoryById = new Map<string, any>(
      categories.map((row: any) => [row.id, row]),
    );
    manualRows.forEach((manual: any) => {
      const category: any = categoryById.get(manual.kategoriId || "") || {
        id: manual.kategoriId || "manual",
        ad: manual.ad,
        kategoriTipi: "DIGER",
      };
      const amount = decimalToNumber(manual.tutar);
      const vat = decimalToNumber(manual.kdv);
      this.addSummaryRow(categorySummary, category, amount, vat);
      movements.push({
        id: manual.id,
        tarih:
          upper(manual.kartTipi) === "AYLIK_SABIT"
            ? range.dateFrom
            : manual.tarih?.toISOString?.().slice(0, 10) ||
          manual.baslangic?.toISOString?.().slice(0, 10) ||
          range.dateFrom,
        tur: "MANUEL",
        turEtiketi: manual.ad,
        kategoriId: category.id,
        kategori: category.ad,
        kategoriKaynagi: "MANUEL",
        firmaId: manual.firmaId || "",
        firma: companyMap.get(manual.firmaId || "")?.name || "",
        belgeNo: "",
        aciklama: manual.aciklama || "",
        tutar: amount,
        kdv: vat,
        genelToplam: amount + vat,
        kartTipi: manual.kartTipi || "",
      });
    });

    let hareketler = movements
      .filter((row) => (kategoriId ? row.kategoriId === kategoriId : true))
      .filter((row) => (turFilter && turFilter !== "ALL" ? row.tur === turFilter : true))
      .filter((row) => {
        if (!search) return true;
        return [row.firma, row.kategori, row.belgeNo, row.aciklama]
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(search);
      })
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
    const kategoriOzetleri = [...categorySummary.values()]
      .filter((row) => (kategoriId ? row.kategoriId === kategoriId : true))
      .sort((a, b) => b.genelToplam - a.genelToplam);
    const sum = (type: string, key: string) =>
      hareketler
        .filter((row) => row.tur === type)
        .reduce((total, row) => total + Number(row[key] || 0), 0);
    const kesilenToplam = sum("KESILEN", "tutar");
    const kesilenKdv = sum("KESILEN", "kdv");
    const resmiGelenToplam = sum("RESMI_GELEN", "genelToplam");
    const gayriResmiToplam = sum("GAYRI_RESMI", "genelToplam");
    const gelenKdv = sum("RESMI_GELEN", "kdv");
    const devreden = decimalToNumber(query.devredenKdv || 0);
    const kdvSonucu = kesilenKdv - gelenKdv - devreden;
    const personel = kategoriOzetleri
      .filter((row) => row.kategoriTipi === "PERSONEL")
      .reduce((total, row) => total + Number(row.genelToplam || 0), 0);
    const yemek = kategoriOzetleri
      .filter((row) => /yemek/i.test(row.kategori))
      .reduce((total, row) => total + Number(row.genelToplam || 0), 0);
    const haftalik = hareketler
      .filter((row) => /haftalik|haftalÄ±k/i.test(row.kategori))
      .reduce((total, row) => total + Number(row.genelToplam || 0), 0);
    const yevmiyeci = hareketler
      .filter((row) => /yevmiyeci/i.test(row.kategori))
      .reduce((total, row) => total + Number(row.genelToplam || 0), 0);
    return {
      ok: true,
      data: {
        anaOzet: {
          kesilenFatura: {
            toplam: kesilenToplam,
            kdv: kesilenKdv,
            belgeAdedi: hareketler.filter((row) => row.tur === "KESILEN").length,
          },
          gelenFaturalar: {
            resmiToplam: resmiGelenToplam,
            gayriResmiToplam,
            toplam: resmiGelenToplam + gayriResmiToplam,
          },
          kdvDurumu: {
            hesaplananKdv: kesilenKdv,
            gelenKdv,
            devredenKdv: devreden,
            sonuc: kdvSonucu,
            odenecekKdv: Math.max(0, kdvSonucu),
            devredecekKdv: Math.max(0, -kdvSonucu),
          },
          personelIsletme: {
            personel,
            yemek,
            haftalik,
            yevmiyeci,
            toplam: personel + yemek + haftalik + yevmiyeci,
          },
        },
        kategoriOzetleri,
        hareketler,
        kullaniciKalemleri: manualRows,
        filtreBilgisi: {
          baslangic: range.dateFrom,
          bitis: range.dateTo,
          firmaId: firmId,
          kategoriId,
          tur: turFilter || "ALL",
          search,
        },
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
    const ad = cleanText(payload.ad || payload.name);
    if (!ad) throw new BadRequestException("Kalem adi zorunludur.");
    const kartTipi = upper(payload.kartTipi || payload.cardType || "KUCUK") || "KUCUK";
    const aylikSabit = kartTipi === "AYLIK_SABIT" || upper(payload.tekrar || payload.repeat) === "AYLIK";
    const tarihValue = cleanText(payload.tarih || payload.date);
    const baslangicValue = cleanText(payload.baslangic || payload.dateFrom || (aylikSabit ? tarihValue : ""));
    const bitisValue = cleanText(payload.bitis || payload.dateTo || payload.endDate);
    const data = {
      ad,
      kartTipi: aylikSabit ? "AYLIK_SABIT" : kartTipi,
      kategoriId: cleanText(payload.kategoriId || payload.categoryId) || null,
      firmaId: cleanText(payload.firmaId || payload.companyId) || null,
      tarih: !aylikSabit && tarihValue
        ? this.parseDate(tarihValue)
        : null,
      baslangic: baslangicValue
        ? this.parseDate(baslangicValue)
        : null,
      bitis: bitisValue
        ? this.parseDate(bitisValue)
        : null,
      tutar: new Prisma.Decimal(Number(payload.tutar || payload.amount || 0) || 0),
      kdv: new Prisma.Decimal(Number(payload.kdv || payload.vat || 0) || 0),
      aciklama: cleanText(payload.aciklama || payload.description) || null,
      aktifMi: payload.aktifMi ?? payload.active ?? true,
    };
    const client = this.manuelKalemClient();
    const saved = id
      ? await client.update({ where: { id }, data })
      : await client.create({ data: { ...data, mainCompanySlug } });
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
    return { ok: true, data: saved };
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
    const movementType = upper(
      payload.islemTipi || payload.movementType || "BORC",
    );
    const amountRaw = Number(payload.tutar ?? payload.amount ?? 0);
    if (!Number.isFinite(amountRaw) || amountRaw === 0) {
      throw new BadRequestException("Tutar zorunludur.");
    }
    const absoluteAmount = Math.abs(amountRaw);
    let effect = absoluteAmount;
    if (["ALACAK", "TAHSILAT"].includes(movementType)) {
      effect = -absoluteAmount;
    } else if (["ODEME", "Ã–DEME"].includes(movementType)) {
      effect = absoluteAmount;
    } else if (
      ["VIRMAN", "VÄ°RMAN", "DUZELTME", "DÃœZELTME"].includes(movementType)
    ) {
      effect = amountRaw;
    }
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
          movementType,
          sourceType:
            cleanText(payload.source || payload.kaynak || "MANUAL") || "MANUAL",
          documentNo: cleanText(payload.documentNo || payload.belgeNo) || null,
          documentId: cleanText(payload.documentId) || null,
          description,
          debit: new Prisma.Decimal(effect > 0 ? effect : 0),
          credit: new Prisma.Decimal(effect < 0 ? Math.abs(effect) : 0),
          amount: new Prisma.Decimal(Math.abs(effect)),
          effect: new Prisma.Decimal(effect),
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
    const movementType = upper(
      payload.islemTipi ||
        payload.movementType ||
        existing.movementType ||
        "BORC",
    );
    const amountValue = payload.tutar ?? payload.amount;
    const hasAmount =
      amountValue !== undefined &&
      amountValue !== null &&
      String(amountValue).trim() !== "";
    const parsedAmount = hasAmount
      ? Number(amountValue)
      : decimalToNumber(existing.effect || existing.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      throw new BadRequestException("Tutar zorunludur.");
    }
    const absoluteAmount = Math.abs(parsedAmount);
    let effect = parsedAmount;
    if (["ALACAK", "TAHSILAT"].includes(movementType)) {
      effect = -absoluteAmount;
    } else if (["ODEME", "Ã–DEME", "BORC"].includes(movementType)) {
      effect = absoluteAmount;
    }
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
          movementType,
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
          debit: new Prisma.Decimal(effect > 0 ? effect : 0),
          credit: new Prisma.Decimal(effect < 0 ? Math.abs(effect) : 0),
          amount: new Prisma.Decimal(Math.abs(effect)),
          effect: new Prisma.Decimal(effect),
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

