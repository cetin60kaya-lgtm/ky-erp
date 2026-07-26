import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { createActivityLog } from "../database/db-activity";
import {
  ensureMainCompany,
  requireMainCompanySlug,
} from "../database/db-company-scope";
import {
  decimalToNumber,
  normalizeSearchText,
  normalizeText,
  safeDecimal,
} from "../database/db-normalize";
import {
  makePaginatedResponse,
  parsePageLimit,
} from "../database/db-pagination";
import { dbSuccess } from "../database/db-response";
import { PrismaService } from "../prisma/prisma.service";
import { PdfExtractionService } from "./pdf-extraction.service";
import { ModelService } from "../modules/models/model.service";
import { classifyDocument as classifyDocumentFlow } from "../common/helpers/document-flow.helper";
import { SqlStoreService } from "../kyerp-core/sql-store.service";

type Query = Record<string, any>;

@Injectable()
export class MuhasebeDbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfExtraction: PdfExtractionService,
    private readonly modelService: ModelService,
    private readonly sqlStore: SqlStoreService,
  ) {}

  private asObject(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private normalizeInventoryName(value: unknown) {
    const raw = normalizeText(value);
    const normalized = normalizeSearchText(raw);
    return {
      raw,
      normalized,
      compact: normalized.replace(/\s+/g, ""),
    };
  }

  private similarityScore(a: string, b: string) {
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 88;
    const aSet = new Set(a.split(" ").filter(Boolean));
    const bSet = new Set(b.split(" ").filter(Boolean));
    const overlap = [...aSet].filter((item) => bSet.has(item)).length;
    return Math.round((overlap / Math.max(aSet.size, bSet.size, 1)) * 100);
  }

  private productMeta(row: any) {
    const raw = this.asObject(row?.raw);
    return {
      shortCode:
        normalizeText(raw.shortCode || raw.kisaKod || raw.stokKodu) || "",
      groupType:
        normalizeText(raw.groupType || raw.productGroup || raw.kategori) ||
        "GENEL",
      paintType: normalizeText(raw.paintType || raw.boyaTipi || raw.tip) || "",
      defaultSupplierId:
        normalizeText(raw.defaultSupplierId || raw.varsayilanTedarikciId) || "",
      note: normalizeText(raw.note || raw.not) || "",
    };
  }

  private aliasMeta(row: any) {
    const raw = this.asObject(row?.raw);
    return {
      supplierFirmId:
        normalizeText(
          raw.supplierFirmId || raw.firmaId || raw.tedarikciFirmaId,
        ) || "",
      note: normalizeText(raw.note || raw.not) || "",
    };
  }

  private invoiceItemMeta(row: any) {
    const raw = this.asObject(row?.raw);
    return {
      rawProductName:
        normalizeText(
          raw.rawProductName || raw.rawName || raw.originalProductName,
        ) || "",
      matchStatus:
        normalizeText(raw.matchStatus || raw.productMatchStatus) || "",
      matchedProductName: normalizeText(raw.matchedProductName) || "",
      suggestedProductId: normalizeText(raw.suggestedProductId) || "",
      suggestedProductName: normalizeText(raw.suggestedProductName) || "",
    };
  }

  private buildProductRaw(existingRaw: unknown, payload: Query) {
    const current = this.asObject(existingRaw);
    const merged = {
      ...current,
      shortCode:
        normalizeText(
          payload.shortCode || payload.kisaKod || payload.stokKodu,
        ) ||
        current.shortCode ||
        current.kisaKod ||
        current.stokKodu ||
        null,
      groupType:
        normalizeText(
          payload.groupType || payload.productGroup || payload.kategori,
        ) ||
        current.groupType ||
        current.productGroup ||
        current.kategori ||
        "GENEL",
      paintType:
        normalizeText(payload.paintType || payload.boyaTipi || payload.tip) ||
        current.paintType ||
        current.boyaTipi ||
        current.tip ||
        null,
      defaultSupplierId:
        normalizeText(
          payload.defaultSupplierId || payload.varsayilanTedarikciId,
        ) ||
        current.defaultSupplierId ||
        current.varsayilanTedarikciId ||
        null,
      note:
        normalizeText(payload.note || payload.not) ||
        current.note ||
        current.not ||
        null,
    };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined),
    );
  }

  private buildAliasRaw(existingRaw: unknown, payload: Query) {
    const current = this.asObject(existingRaw);
    const merged = {
      ...current,
      supplierFirmId:
        normalizeText(
          payload.supplierFirmId || payload.firmaId || payload.tedarikciFirmaId,
        ) ||
        current.supplierFirmId ||
        current.firmaId ||
        null,
      note:
        normalizeText(payload.note || payload.not) ||
        current.note ||
        current.not ||
        null,
    };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined),
    );
  }

  private isIncomingInventoryDocument(row: any) {
    const raw = this.asObject(row?.raw);
    const type = normalizeSearchText(
      row?.documentType || raw.belgeTipi || raw.documentType || raw.type,
    );
    return ["tedarik", "gelen", "alis", "alış", "purchase", "supplier"].some(
      (key) => type.includes(key),
    );
  }

  private async scope(mainCompanySlug: string) {
    const slug = requireMainCompanySlug(mainCompanySlug);
    await ensureMainCompany(this.prisma, slug);
    return slug;
  }

  private mapProduct(row: any) {
    const meta = this.productMeta(row);
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      legacyId: row.legacyId || row.raw?.id || row.raw?.legacyId || "",
      name: row.name,
      normalizedName: row.normalizedName,
      shortCode: meta.shortCode,
      groupType: meta.groupType,
      paintType: meta.paintType,
      defaultSupplierId: meta.defaultSupplierId,
      note: meta.note,
      unit: row.unit || "",
      defaultVatRate: decimalToNumber(row.defaultVatRate),
      isActive: row.isActive,
      raw: row.raw || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      aliases: (row.aliases || []).map((alias: any) => ({
        id: alias.id,
        matchedProductId: row.legacyId || row.raw?.id || row.id,
        matchedProductName: row.name,
        rawName: alias.rawName,
        normalizedName: alias.normalizedName,
        packageInfo: alias.packageInfo || "",
        packaging: alias.packageInfo || "",
        supplierFirmId: this.aliasMeta(alias).supplierFirmId,
        note: this.aliasMeta(alias).note,
        isActive: alias.isActive,
        raw: alias.raw || null,
      })),
      urunAdi: row.name,
      ticariAdi: row.raw?.ticariAdi || row.raw?.urunAdi || row.name,
      kategori:
        meta.groupType || row.raw?.kategori || row.raw?.category || "Genel",
      birim: row.unit || "",
      kdvOrani: decimalToNumber(row.defaultVatRate),
      aktif: row.isActive,
      varsayilanAmbalaj:
        row.raw?.varsayilanAmbalaj ||
        row.raw?.ambalaj ||
        row.raw?.packageInfo ||
        "",
      ambalaj: row.raw?.ambalaj || row.raw?.varsayilanAmbalaj || "",
      ambalajVaryantlari: Array.isArray(row.raw?.ambalajVaryantlari)
        ? row.raw.ambalajVaryantlari
        : [],
      not: meta.note || row.raw?.not || row.raw?.note || "",
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      company: row.company
        ? {
            id: row.company.id,
            name: row.company.name,
            currentBalance: decimalToNumber(row.company.currentBalance),
          }
        : undefined,
    };
  }

  private dateOrToday(value: unknown) {
    const text = normalizeText(value);
    const date = text
      ? new Date(`${text.slice(0, 10)}T00:00:00.000Z`)
      : new Date();
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException("Tarih gecersiz.");
    return date;
  }

  private optionalDate(value: unknown) {
    const text = normalizeText(value);
    if (!text) return null;
    return this.dateOrToday(text);
  }

  private documentStatus(row: any) {
    const status = normalizeText(
      row?.status ||
        row?.raw?.durum ||
        row?.raw?.status ||
        row?.metadata?.durum ||
        row?.metadata?.status ||
        "kontrol_bekliyor",
    ).toLocaleLowerCase("tr-TR");
    if (
      ["processed", "islenen", "işlenen", "done", "completed"].includes(status)
    )
      return "islendi";
    if (["rejected", "red"].includes(status)) return "reddedildi";
    if (["error", "failed"].includes(status)) return "hatali";
    if (["processing"].includes(status)) return "islemde";
    if (["pending", "waiting"].includes(status)) return "bekleyen";
    if (["draft"].includes(status)) return "taslak";
    if (["control_pending"].includes(status)) return "kontrol_bekliyor";
    return status;
  }

  private normalizeDocumentType(value: unknown) {
    const type = normalizeText(value).toLocaleLowerCase("tr-TR");
    if (
      [
        "tedarikci_gelen_fatura",
        "supplier_invoice",
        "supplier-invoice",
        "gelen_fatura",
        "gelen-fatura",
        "alis_faturasi",
        "alış_faturası",
        "tedarikci_fatura",
        "incoming_invoice",
        "purchase_invoice",
        "gelen_fatura_tedarikci",
      ].includes(type)
    ) {
      return "tedarikci_gelen_fatura";
    }
    if (
      [
        "musteriden_gelen_irsaliye",
        "müşteriden_gelen_irsaliye",
        "incoming_delivery",
        "customer_dispatch",
        "customer-dispatch",
        "musteri_irsaliye",
        "müşteri_irsaliye",
        "incoming_dispatch",
        "gelen_irsaliye",
        "gelen-irsaliye",
      ].includes(type)
    ) {
      return "musteriden_gelen_irsaliye";
    }
    if (
      [
        "bizim_kestigimiz_fatura",
        "bizim_kestiğimiz_fatura",
        "outgoing_invoice",
        "sales_invoice",
        "bizim_fatura",
        "giden_fatura",
        "giden-fatura",
      ].includes(type)
    ) {
      return "bizim_kestigimiz_fatura";
    }
    if (
      [
        "bizim_kestigimiz_irsaliye",
        "bizim_kestiğimiz_irsaliye",
        "outgoing_dispatch",
        "bizim_irsaliye",
        "giden_irsaliye",
        "giden-irsaliye",
      ].includes(type)
    ) {
      return "bizim_kestigimiz_irsaliye";
    }
    return type;
  }

  private canonicalDocumentKind(value: unknown) {
    const explicit = classifyDocumentFlow({ belgeTuru: String(value || "") });
    if (explicit !== "UNKNOWN") return explicit;
    const type = this.normalizeDocumentType(value);
    if (type === "bizim_kestigimiz_fatura") return "OUR_INVOICE";
    if (type === "bizim_kestigimiz_irsaliye") return "OUR_DISPATCH";
    if (type === "musteriden_gelen_irsaliye") return "CUSTOMER_DISPATCH";
    if (type === "tedarikci_gelen_fatura") return "SUPPLIER_INVOICE";
    return "UNKNOWN";
  }

  private legacyTypeFromCanonicalKind(kind: unknown) {
    const normalized = normalizeText(kind).toLocaleUpperCase("tr-TR");
    const map: Record<string, string> = {
      OUR_INVOICE: "bizim_kestigimiz_fatura",
      OUR_DISPATCH: "bizim_kestigimiz_irsaliye",
      CUSTOMER_DISPATCH: "musteriden_gelen_irsaliye",
      SUPPLIER_INVOICE: "tedarikci_gelen_fatura",
    };
    return map[normalized] || "";
  }

  private targetTypeToDocumentType(value: unknown) {
    const raw = normalizeText(value).toLocaleUpperCase("tr-TR");
    const map: Record<string, string> = {
      TEDARIKCI_GELEN_FATURA: "tedarikci_gelen_fatura",
      BIZIM_GIDEN_FATURA: "bizim_kestigimiz_fatura",
      BIZIM_GIDEN_IRSALIYE: "bizim_kestigimiz_irsaliye",
      MUSTERIDEN_GELEN_IRSALIYE: "musteriden_gelen_irsaliye",
      EKSTRE_DOSYASI: "kayit_odeme_cari_hareket",
      TASNIF_RAPORU_TEMPLATE: "tasnif_raporu_template",
      UNKNOWN: "bilinmeyen",
    };
    return map[raw] || this.normalizeDocumentType(value);
  }

  private documentTypeToTargetType(value: unknown) {
    const canonicalLegacy = this.legacyTypeFromCanonicalKind(value);
    if (canonicalLegacy) value = canonicalLegacy;
    const type = this.normalizeDocumentType(value);
    const map: Record<string, string> = {
      tedarikci_gelen_fatura: "TEDARIKCI_GELEN_FATURA",
      bizim_kestigimiz_fatura: "BIZIM_GIDEN_FATURA",
      bizim_kestigimiz_irsaliye: "BIZIM_GIDEN_IRSALIYE",
      musteriden_gelen_irsaliye: "MUSTERIDEN_GELEN_IRSALIYE",
      kayit_odeme_cari_hareket: "EKSTRE_DOSYASI",
      tasnif_raporu_template: "TASNIF_RAPORU_TEMPLATE",
    };
    return map[type] || "UNKNOWN";
  }

  private targetModuleForTargetType(targetType: string) {
    const map: Record<string, string> = {
      TEDARIKCI_GELEN_FATURA: "TEDARIKCI_FATURA",
      BIZIM_GIDEN_FATURA: "BIZIM_BELGELER",
      BIZIM_GIDEN_IRSALIYE: "BIZIM_BELGELER",
      MUSTERIDEN_GELEN_IRSALIYE: "MUSTERI_IRSALIYE",
      EKSTRE_DOSYASI: "ODEMELER",
      TASNIF_RAPORU_TEMPLATE: "EPOSTA",
    };
    return map[targetType] || "TASNIF_BEKLEYEN";
  }

  private detectedKindForTargetType(targetType: string) {
    const type = normalizeText(targetType).toLocaleUpperCase("tr-TR");
    if (["BIZIM_GIDEN_FATURA", "TEDARIKCI_GELEN_FATURA"].includes(type))
      return "FATURA";
    if (["BIZIM_GIDEN_IRSALIYE", "MUSTERIDEN_GELEN_IRSALIYE"].includes(type))
      return "IRSALIYE";
    if (type === "EKSTRE_DOSYASI") return "EKSTRE";
    if (type === "TASNIF_RAPORU_TEMPLATE") return "TASNIF_RAPORU";
    return "";
  }

  private directionForTargetType(targetType: string) {
    const type = normalizeText(targetType).toLocaleUpperCase("tr-TR");
    if (["BIZIM_GIDEN_FATURA", "BIZIM_GIDEN_IRSALIYE"].includes(type))
      return "GIDEN";
    if (
      [
        "TEDARIKCI_GELEN_FATURA",
        "MUSTERIDEN_GELEN_IRSALIYE",
        "EKSTRE_DOSYASI",
        "TASNIF_RAPORU_TEMPLATE",
      ].includes(type)
    ) {
      return "GELEN";
    }
    return "UNKNOWN";
  }

  private targetTypeFromDocumentNo(documentNo: unknown) {
    const no = normalizeText(documentNo).toLocaleUpperCase("tr-TR");
    if (/^HKN\d+/.test(no)) return "BIZIM_GIDEN_FATURA";
    if (/^DDM\d+/.test(no)) return "BIZIM_GIDEN_IRSALIYE";
    if (/^TIA\d+/.test(no)) return "MUSTERIDEN_GELEN_IRSALIYE";
    if (/^(SLV|DPI|ORU|TKF|CNS)\d+/.test(no)) return "TEDARIKCI_GELEN_FATURA";
    return "";
  }

  private isRoutableTargetType(targetType: string) {
    return [
      "TEDARIKCI_GELEN_FATURA",
      "BIZIM_GIDEN_FATURA",
      "BIZIM_GIDEN_IRSALIYE",
      "MUSTERIDEN_GELEN_IRSALIYE",
      "EKSTRE_DOSYASI",
      "TASNIF_RAPORU_TEMPLATE",
    ].includes(normalizeText(targetType).toLocaleUpperCase("tr-TR"));
  }

  private normalizeFirmName(value: unknown) {
    const key = normalizeSearchText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(
        /\b(ANONIM|ANONIM SIRKETI|AS|A S|LTD|LIMITED|STI|S TI|SIRKETI|SAN|SANAYI|TIC|TICARET|VE|TURIZM|OTOMOTIV|HIZMETLERI|TEKNOLOJI|ALI[SŞ]VERI[SŞ])\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
    const known: Array<[RegExp, string]> = [
      [/SELVI KIMYA/, "SELVI KIMYA"],
      [/TAHA GIYIM/, "TAHA GIYIM"],
      [/TURAN KIMYA/, "TURAN KIMYA"],
      [/CAN YEMEK/, "CAN YEMEK"],
      [/DIGITAL PLATFORM|DIGITURK/, "DIGITAL PLATFORM"],
      [/METRO GROSMARKET/, "METRO GROSMARKET"],
      [/MECIT HAKAN|HAKAN GURSU|HAKAN EMP|HAKAN EMPRIME/, "MECIT HAKAN GURSU"],
    ];
    return known.find(([pattern]) => pattern.test(key))?.[1] || key;
  }

  private displayFirmName(value: unknown) {
    const key = this.normalizeFirmName(value);
    const map: Record<string, string> = {
      "SELVI KIMYA": "SELVİ KİMYA",
      "TAHA GIYIM": "TAHA GİYİM",
      "TURAN KIMYA": "TURAN KİMYA",
      "CAN YEMEK": "CAN YEMEK",
      "DIGITAL PLATFORM": "DIGITAL PLATFORM",
      "METRO GROSMARKET": "METRO GROSMARKET",
      "MECIT HAKAN GURSU": "MECİT HAKAN GÜRSU",
    };
    return map[key] || normalizeText(value);
  }

  private isMainCompanyName(value: unknown, mainCompanyName?: unknown) {
    const key = this.normalizeFirmName(value);
    const mainKey = this.normalizeFirmName(mainCompanyName);
    return Boolean(
      key &&
      (key === mainKey ||
        key.includes("MECIT HAKAN") ||
        key.includes("HAKAN GURSU") ||
        key.includes("HAKAN EMP") ||
        key.includes("HAKAN EMPRIME")),
    );
  }

  private parseQuantity(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = normalizeText(value).replace(/[^\d,.-]/g, "");
    if (!raw) return 0;
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/\./g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private documentTypeAliases(type: string) {
    const normalized = this.normalizeDocumentType(type);
    const aliases: Record<string, string[]> = {
      tedarikci_gelen_fatura: [
        "tedarikci_gelen_fatura",
        "supplier_invoice",
        "supplier-invoice",
        "gelen_fatura",
        "gelen-fatura",
        "alis_faturasi",
        "alış_faturası",
        "tedarikci_fatura",
        "incoming_invoice",
        "purchase_invoice",
        "gelen_fatura_tedarikci",
      ],
      bizim_kestigimiz_fatura: [
        "bizim_kestigimiz_fatura",
        "bizim_kestiğimiz_fatura",
        "bizim_fatura",
        "giden_fatura",
        "giden-fatura",
        "sales_invoice",
        "outgoing_invoice",
      ],
      bizim_kestigimiz_irsaliye: [
        "bizim_kestigimiz_irsaliye",
        "bizim_kestiğimiz_irsaliye",
        "bizim_irsaliye",
        "giden_irsaliye",
        "giden-irsaliye",
        "outgoing_dispatch",
      ],
      musteriden_gelen_irsaliye: [
        "musteriden_gelen_irsaliye",
        "müşteriden_gelen_irsaliye",
        "musteri_irsaliye",
        "müşteri_irsaliye",
        "gelen_irsaliye",
        "gelen-irsaliye",
        "incoming_delivery",
        "incoming_dispatch",
        "customer_dispatch",
        "customer-dispatch",
      ],
    };
    return aliases[normalized] || [normalized].filter(Boolean);
  }

  private documentStatusAliases(status: string) {
    const normalized = this.documentStatus({ status });
    const aliases: Record<string, string[]> = {
      islendi: [
        "islendi",
        "processed",
        "islenen",
        "işlenen",
        "done",
        "completed",
      ],
      reddedildi: ["reddedildi", "rejected", "red"],
      hatali: ["hatali", "hatalı", "error", "failed"],
      islemde: ["islemde", "işlemde", "processing"],
      bekleyen: ["bekleyen", "pending", "waiting"],
      taslak: ["taslak", "draft"],
      kontrol_bekliyor: ["kontrol_bekliyor", "control_pending"],
    };
    return aliases[normalized] || [normalized].filter(Boolean);
  }

  private documentRaw(row: any) {
    return (
      (row?.raw && typeof row.raw === "object"
        ? row.raw
        : row?.metadata && typeof row.metadata === "object"
          ? row.metadata
          : {}) || {}
    );
  }

  private draftFromDocument(row: any, payload: Query = {}) {
    const raw = this.documentRaw(row);
    const draft = raw.taslakAlanlar || raw.draft || {};
    return {
      documentNo: normalizeText(
        payload.documentNo ||
          payload.faturaNo ||
          draft.belgeNo ||
          draft.faturaNo ||
          row.documentNo,
      ),
      documentDate:
        this.optionalDate(
          payload.documentDate || payload.tarih || draft.tarih || row.date,
        ) || new Date(),
      companyId: normalizeText(payload.companyId || row.companyId),
      companyName: normalizeText(
        payload.companyName ||
          payload.firma ||
          draft.saticiUnvan ||
          draft.supplierName ||
          row.company?.name,
      ),
      subtotal:
        Number(
          payload.subtotal ??
            payload.araToplam ??
            draft.araToplam ??
            row.subtotal ??
            0,
        ) || 0,
      vatTotal:
        Number(
          payload.vatTotal ??
            payload.kdvToplam ??
            payload.kdv ??
            draft.kdvToplam ??
            row.vatTotal ??
            0,
        ) || 0,
      grandTotal:
        Number(
          payload.grandTotal ??
            payload.genelToplam ??
            draft.genelToplam ??
            row.grandTotal ??
            0,
        ) || 0,
      note: normalizeText(payload.note || payload.aciklama || draft.aciklama),
    };
  }

  private rawDocumentLines(row: any, payload: Query = {}) {
    const raw = this.documentRaw(row);
    return Array.isArray(payload.lines)
      ? payload.lines
      : Array.isArray(payload.lineOverrides)
        ? payload.lineOverrides
        : Array.isArray(raw.kalemler)
          ? raw.kalemler
          : Array.isArray(raw.lines)
            ? raw.lines
            : [];
  }

  private normalizeApprovalLine(line: any, index: number) {
    const productName = normalizeText(
      line.productName ||
        line.matchedProductName ||
        line.rawDescription ||
        line.description ||
        line.urunAdi ||
        line.name,
    );
    const quantity =
      Number(line.quantity ?? line.miktar ?? line.adet ?? 0) || 0;
    const unitPrice = Number(line.unitPrice ?? line.birimFiyat ?? 0) || 0;
    const vatRate =
      Number(line.vatRate ?? line.kdvRate ?? line.kdvOrani ?? 0) || 0;
    const lineTotal =
      Number(line.lineTotal ?? line.toplam ?? quantity * unitPrice) || 0;
    const vatAmount =
      Number(
        line.vatAmount ??
          line.kdvAmount ??
          line.kdv ??
          (lineTotal * vatRate) / 100,
      ) || 0;
    return {
      lineNo: Number(line.lineNo || line.sourceLineNo || index + 1),
      productId: normalizeText(line.productId || line.matchedProductId) || null,
      productName,
      normalizedProductName: normalizeSearchText(
        line.normalizedProductName || productName,
      ),
      quantity,
      unit: normalizeText(line.unit || line.birim) || null,
      unitPrice,
      vatRate,
      vatAmount,
      lineTotal,
      lotNo: normalizeText(line.lotNo || line.lot) || null,
      packageInfo:
        normalizeText(line.packageInfo || line.packaging || line.ambalaj) ||
        null,
      raw: line,
    };
  }

  private mapInvoiceItem(item: any) {
    const meta = this.invoiceItemMeta(item);
    return {
      id: item.id,
      documentId: item.documentId,
      productId: item.productId,
      lineNo: item.lineNo,
      productName: item.productName || item.description || "",
      rawProductName:
        meta.rawProductName || item.productName || item.description || "",
      normalizedProductName: item.normalizedProductName || "",
      description: item.description || item.productName || "",
      quantity: decimalToNumber(item.quantity),
      unit: item.unit || "",
      unitPrice: decimalToNumber(item.unitPrice),
      vatRate: decimalToNumber(item.vatRate),
      vatAmount: decimalToNumber(item.vatAmount),
      lineTotal: decimalToNumber(item.lineTotal),
      lotNo: item.lotNo || "",
      packaging:
        item.raw?.packaging || item.raw?.packageInfo || item.raw?.ambalaj || "",
      packageInfo:
        item.raw?.packageInfo || item.raw?.packaging || item.raw?.ambalaj || "",
      matchStatus: meta.matchStatus || (item.productId ? "MATCHED" : "PENDING"),
      matchedProductName: meta.matchedProductName || "",
      suggestedProductId: meta.suggestedProductId,
      suggestedProductName: meta.suggestedProductName,
      raw: item.raw || null,
    };
  }

  private mapDocument(
    row: any,
    invoiceItems: any[] = [],
    customerDispatchLines: any[] = [],
  ) {
    const raw = this.documentRaw(row);
    const status = this.documentStatus(row);
    const normalizedType = this.normalizeDocumentType(
      row.documentType ||
        raw.belgeTipi ||
        raw.documentType ||
        raw.type ||
        row.metadata?.belgeTipi ||
        row.metadata?.documentType,
    );
    const normalizedItems = invoiceItems.map((item) =>
      this.mapInvoiceItem(item),
    );
    const rawItems =
      raw.kalemler ||
      raw.lines ||
      raw.items ||
      raw.parsedItems ||
      raw.xmlItems ||
      raw.faturaKalemleri ||
      [];
    const normalizedDispatchLines = customerDispatchLines.map((item) => ({
      id: item.id,
      sourceLineId: item.id,
      documentId: item.documentId,
      aciklama: item.aciklama || item.modelAdi || "",
      description: item.aciklama || item.modelAdi || "",
      productName: item.modelAdi || item.aciklama || "",
      rawDescription: item.aciklama || item.modelAdi || "",
      adet: decimalToNumber(item.adet),
      quantity: decimalToNumber(item.adet),
      birim: item.birim || "ADET",
      unit: item.birim || "ADET",
      modelId: item.modelId || "",
      modelAdi: item.modelAdi || "",
      modelAdiOnerisi: item.modelAdiOnerisi || "",
      durum: item.durum || "",
    }));
    let kalemler = normalizedItems.length
      ? normalizedItems
      : normalizedDispatchLines.length
        ? normalizedDispatchLines
        : rawItems;
    const dispatchNo = normalizeText(
      row.documentNo ||
        raw.taslakAlanlar?.irsaliyeNo ||
        raw.taslakAlanlar?.belgeNo,
    );
    const firstLineText = normalizeText(
      kalemler?.[0]?.rawDescription ||
        kalemler?.[0]?.description ||
        kalemler?.[0]?.aciklama ||
        kalemler?.[0]?.productName,
    );
    const shouldReparseIncomingDispatch =
      normalizedType === "musteriden_gelen_irsaliye" &&
      /^TIA\d+/i.test(dispatchNo) &&
      (!kalemler.length || (kalemler.length === 1 && firstLineText.length < 5));
    if (shouldReparseIncomingDispatch) {
      const reparsed = this.extractCustomerDispatchLines(
        String(raw.extractedText || ""),
      );
      if (reparsed.length) kalemler = reparsed;
    }
    const fileMetaById =
      raw?.filesMeta && typeof raw.filesMeta === "object" ? raw.filesMeta : {};
    const files = Array.isArray(row?.files)
      ? row.files.map((file: any) => {
          const meta = fileMetaById[file.id] || {};
          const storedPath = String(file.filePath || "");
          const storedName = String(
            meta.storedName ||
              path.basename(storedPath || "") ||
              file.fileName ||
              "",
          );
          return {
            id: file.id,
            mainCompanySlug: file.mainCompanySlug,
            documentId: file.documentId,
            originalName: String(
              meta.originalName || file.fileName || storedName,
            ),
            storedName,
            storedPath,
            fileType: String(
              meta.fileType ||
                path
                  .extname(storedName || "")
                  .replace(/^\./, "")
                  .toUpperCase() ||
                "",
            ),
            mimeType: String(meta.mimeType || file.mimeType || ""),
            sizeBytes: Number(meta.sizeBytes ?? file.fileSize ?? 0) || 0,
            checksum: String(meta.checksum || ""),
            isPrimary: Boolean(meta.isPrimary),
            uploadedAt: file.createdAt,
            filePath: storedPath,
            fileName: file.fileName,
            fileSize: file.fileSize,
            role: String(meta.role || "archive"),
          };
        })
      : [];
    return {
      ...row,
      raw,
      metadata: row.metadata || null,
      status,
      type: normalizedType,
      normalizedType,
      normalizedStatus: status,
      durum: status,
      belgeTipi: normalizedType,
      documentKind:
        raw.documentKind || this.canonicalDocumentKind(normalizedType),
      storageStatus: raw.storageStatus || "",
      guessedModelName:
        raw.guessedModelName ||
        raw.taslakAlanlar?.modelAdiOnerisi ||
        raw.modelAdiOnerisi ||
        "",
      modelId: raw.modelId || raw.modelKaydiId || "",
      modelKaydiId: raw.modelId || raw.modelKaydiId || "",
      modelIds: Array.isArray(raw.modelIds) ? raw.modelIds : [],
      modelAllocations: Array.isArray(raw.modelAllocations)
        ? raw.modelAllocations
        : [],
      modelAdi:
        raw.modelName || raw.modelAdi || raw.taslakAlanlar?.modelAdi || "",
      modelPath: raw.modelPath || "",
      detectedType:
        row.detectedType || raw.detectedType || raw.detectedKind || "",
      targetType:
        row.targetType ||
        raw.targetType ||
        this.documentTypeToTargetType(normalizedType),
      targetModule:
        row.targetModule ||
        raw.targetModule ||
        this.targetModuleForTargetType(
          row.targetType ||
            raw.targetType ||
            this.documentTypeToTargetType(normalizedType),
        ),
      targetRecordId: row.targetRecordId || raw.targetRecordId || row.id,
      routeStatus: row.routeStatus || raw.routeStatus || "",
      routeMessage: row.routeMessage || raw.routeMessage || "",
      firmMatchStatus:
        row.firmMatchStatus || raw.firmMatchStatus || raw.firmaDurumu || "",
      matchedFirmaId:
        row.companyId || raw.matchedFirmaId || raw.companyId || "",
      confidence:
        decimalToNumber(row.confidence) || Number(raw.confidence || 0),
      deletedAt: row.deletedAt || raw.deletedAt || null,
      belgeNo: row.documentNo || raw.taslakAlanlar?.belgeNo || "",
      faturaNo: raw.taslakAlanlar?.faturaNo || row.documentNo || "",
      irsaliyeNo:
        raw.taslakAlanlar?.irsaliyeNo || raw.taslakAlanlar?.dispatchNo || "",
      bagliIrsaliyeNo: raw.taslakAlanlar?.bagliIrsaliyeNo || "",
      bagliIrsaliyeId: raw.taslakAlanlar?.bagliIrsaliyeId || "",
      bagliFaturaNo: raw.taslakAlanlar?.bagliFaturaNo || "",
      bagliFaturaId: raw.taslakAlanlar?.bagliFaturaId || "",
      firma:
        row.company?.name ||
        raw.taslakAlanlar?.firmaAdi ||
        raw.taslakAlanlar?.saticiUnvan ||
        raw.taslakAlanlar?.aliciUnvan ||
        "",
      firmaAdi: row.company?.name || raw.taslakAlanlar?.firmaAdi || "",
      tedarikciAdi:
        row.company?.name ||
        raw.taslakAlanlar?.firmaAdi ||
        raw.taslakAlanlar?.saticiUnvan ||
        "",
      tarih:
        row.date?.toISOString?.().slice(0, 10) ||
        raw.taslakAlanlar?.tarih ||
        "",
      date:
        row.date?.toISOString?.().slice(0, 10) ||
        raw.taslakAlanlar?.tarih ||
        "",
      adet: Number(
        raw.taslakAlanlar?.adet || raw.taslakAlanlar?.gelenAdet || 0,
      ),
      gelenAdet: Number(
        raw.taslakAlanlar?.gelenAdet || raw.taslakAlanlar?.adet || 0,
      ),
      birimFiyat: Number(
        raw.taslakAlanlar?.birimFiyat ??
          raw.birimFiyat ??
          normalizedItems?.[0]?.unitPrice ??
          0,
      ),
      unitPrice: Number(
        raw.taslakAlanlar?.birimFiyat ??
          raw.birimFiyat ??
          normalizedItems?.[0]?.unitPrice ??
          0,
      ),
      araToplam: decimalToNumber(row.subtotal),
      kdv: decimalToNumber(row.vatTotal),
      genelToplam: decimalToNumber(row.grandTotal),
      toplamTutar: decimalToNumber(row.grandTotal),
      belgeDosyaYolu:
        raw.belgeDosyaYolu ||
        files.find((file: any) => file.role === "pdf")?.storedPath ||
        "",
      taslakAlanlar: raw.taslakAlanlar || {
        belgeNo: row.documentNo || "",
        faturaNo: row.documentNo || "",
        tarih: row.date?.toISOString?.().slice(0, 10) || "",
        saticiUnvan: row.company?.name || "",
        araToplam: decimalToNumber(row.subtotal),
        kdvToplam: decimalToNumber(row.vatTotal),
        genelToplam: decimalToNumber(row.grandTotal),
      },
      invoiceItems: normalizedItems,
      customerDispatchLines: normalizedDispatchLines,
      items: kalemler,
      kalemler,
      processedResult: raw.processedResult || null,
      reconciliation: raw.reconciliation || null,
      reconciliationStatus:
        raw.reconciliationStatus || raw.reconciliation?.status || "",
      uyarilar: raw.uyarilar || raw.warnings || [],
      dosyalar: files,
      files,
      needsReview: Boolean(raw.needsReview),
      parseConfidence: Number(raw.parseConfidence || 0),
    };
  }

  private cleanText(value: unknown) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private sanitizeFilePart(value: unknown) {
    return this.cleanText(value).replace(/[<>:"/\\|?*]+/g, "_");
  }

  private xmlTag(xmlText: string, tagName: string) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `<(?:[^>\\s:]+:)?${escaped}[^>]*>([\\s\\S]*?)</(?:[^>\\s:]+:)?${escaped}>`,
      "i",
    );
    const match = xmlText.match(pattern);
    return this.cleanText(match?.[1] || "");
  }

  private parseAmount(value: unknown) {
    const raw = this.cleanText(value).replace(/[^\d,.-]/g, "");
    if (!raw) return 0;
    const hasComma = raw.includes(",");
    const hasDot = raw.includes(".");
    let normalized = raw;
    if (hasComma && hasDot) {
      const comma = raw.lastIndexOf(",");
      const dot = raw.lastIndexOf(".");
      normalized =
        comma > dot
          ? raw.replace(/\./g, "").replace(",", ".")
          : raw.replace(/,/g, "");
    } else if (hasComma) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private detectFileRole(file: any) {
    const ext = String(
      path.extname(file?.originalname || file?.filename || ""),
    ).toLowerCase();
    const mime = String(file?.mimetype || "").toLowerCase();
    if (ext === ".xml" || mime.includes("xml")) return "xml";
    if (ext === ".pdf" || mime === "application/pdf") return "pdf";
    if ([".jpg", ".jpeg", ".png"].includes(ext) || mime.startsWith("image/"))
      return "image";
    return "archive";
  }

  private detectDocumentType(
    fileRole: string,
    optionsType: unknown,
    xmlText: string,
  ) {
    const explicit = this.normalizeDocumentType(optionsType);
    if (explicit) return explicit;
    if (fileRole !== "xml") return "bilinmeyen";
    const text = xmlText.toUpperCase();
    if (text.includes("<DESPATCHADVICE") || text.includes(":DESPATCHADVICE"))
      return "musteriden_gelen_irsaliye";
    if (text.includes("<INVOICE") || text.includes(":INVOICE"))
      return "tedarikci_gelen_fatura";
    return "bilinmeyen";
  }

  private folderKeyForDocumentType(documentType: string, role: string) {
    if (role === "xml") return "XML";
    if (documentType === "tedarikci_gelen_fatura") return "GELEN-FATURA";
    if (documentType === "musteriden_gelen_irsaliye") return "GELEN-IRSALIYE";
    if (documentType === "bizim_kestigimiz_fatura") return "BIZIM-FATURA";
    if (documentType === "bizim_kestigimiz_irsaliye") return "BIZIM-IRSALIYE";
    return "TASNIF-BEKLEYEN";
  }

  private moveUploadedFile(
    mainCompanySlug: string,
    file: any,
    folderKey: string,
    dateText?: string,
  ) {
    const date = this.cleanText(dateText);
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);
    const [year, month] = safeDate.split("-");
    const targetDir = path.join(
      process.cwd(),
      "storage",
      "documents",
      mainCompanySlug,
      "MUHASEBE",
      folderKey,
      year,
      month,
    );
    fs.mkdirSync(targetDir, { recursive: true });
    const originalName = this.cleanText(
      file?.originalname || file?.filename || "belge",
    );
    const ext = path.extname(originalName).toLowerCase();
    const baseName =
      this.sanitizeFilePart(path.parse(originalName).name) || "belge";
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${ext}`;
    const targetPath = path.join(targetDir, storedName);
    if (file?.preserveSource) {
      fs.copyFileSync(file.path, targetPath);
    } else {
      try {
        fs.renameSync(file.path, targetPath);
      } catch {
        fs.copyFileSync(file.path, targetPath);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }
    return {
      originalName,
      storedName,
      storedPath: path.relative(process.cwd(), targetPath).replace(/\\/g, "/"),
      mimeType: String(file?.mimetype || ""),
      sizeBytes: Number(file?.size || 0) || 0,
      fileType: ext.replace(/^\./, "").toUpperCase(),
      role: this.detectFileRole(file),
    };
  }

  private computeChecksum(filePath: string) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  }

  private xmlBlock(xmlText: string, tagName: string) {
    const match = String(xmlText || "").match(
      new RegExp(
        `<(?:[^>\\s:]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[^>\\s:]+:)?${tagName}>`,
        "i",
      ),
    );
    return match?.[1] || "";
  }

  private xmlParty(xmlText: string) {
    const supplier =
      this.xmlBlock(xmlText, "AccountingSupplierParty") ||
      this.xmlBlock(xmlText, "DespatchSupplierParty") ||
      this.xmlBlock(xmlText, "SellerSupplierParty");
    const customer =
      this.xmlBlock(xmlText, "AccountingCustomerParty") ||
      this.xmlBlock(xmlText, "DeliveryCustomerParty") ||
      this.xmlBlock(xmlText, "BuyerCustomerParty");
    const pick = (block: string) => ({
      name:
        this.xmlTag(block, "RegistrationName") ||
        this.xmlTag(this.xmlBlock(block, "PartyName"), "Name") ||
        this.xmlTag(block, "Name"),
      taxNo: this.xmlTag(block, "CompanyID") || this.xmlTag(block, "ID"),
      taxOffice: this.xmlTag(block, "TaxScheme") || "",
    });
    return { supplier: pick(supplier), customer: pick(customer) };
  }

  private pdfLabelValue(text: string, labels: string[]) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || "";
      for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = line.match(new RegExp(`${escaped}\\s*:?\\s*(.*)$`, "i"));
        if (!match) continue;
        const inline = normalizeText(match[1] || "");
        if (inline) return inline;
        const next = lines.slice(index + 1, index + 4).find((candidate) => {
          const value = normalizeText(candidate);
          return Boolean(
            value && !/^(No|Tarih|Saat|Senaryo|Fatura Tipi)\s*:?$/i.test(value),
          );
        });
        if (next) return next;
      }
    }
    return "";
  }

  private firstAmountOnLine(
    text: string,
    lineMatcher: (line: string) => boolean,
  ) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean);
    for (const line of lines) {
      if (!lineMatcher(line)) continue;
      const matches = Array.from(
        line.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*TL/gi),
      );
      const amount = this.parseAmount(matches.at(-1)?.[1] || "");
      if (amount) return amount;
    }
    return 0;
  }

  private parseDateText(value: unknown) {
    const text = normalizeText(value).replace(/[\u00ad\u2010-\u2015]/g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!match) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  private extractPdfDate(
    text: string,
    kind: "invoice" | "dispatch" = "invoice",
  ) {
    const raw = normalizeText(text).replace(/[\u00ad\u2010-\u2015]/g, "-");
    const patterns =
      kind === "invoice"
        ? [
            /Fatura\s*Tarihi\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
            /Tarih\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
          ]
        : [
            /[İI]rsaliye\s*Tarihi\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
            /Tarih\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
          ];
    for (const pattern of patterns) {
      const parsed = this.parseDateText(raw.match(pattern)?.[1]);
      if (parsed) return parsed;
    }
    return "";
  }

  private extractPartyFromPdf(text: string, labels: string[]) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean);
    const labelKeys = labels.map((label) => this.normalizeFirmName(label));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const key = this.normalizeFirmName(line);
      if (!labelKeys.some((label) => key.includes(label))) continue;
      const inline = normalizeText(line.split(":").slice(1).join(":"));
      if (inline) return inline;
      return (
        lines.slice(index + 1, index + 4).find((next) => {
          const nextKey = this.normalizeFirmName(next);
          return (
            nextKey &&
            !nextKey.includes("VERGI") &&
            !nextKey.includes("VKN") &&
            !nextKey.includes("TCKN") &&
            !nextKey.includes("ADRES")
          );
        }) || ""
      );
    }
    return "";
  }

  private extractPdfParties(text: string) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean);
    const normalizedLines = lines.map((line) => this.normalizeFirmName(line));
    const sayinIndex = normalizedLines.findIndex((line) => line === "SAYIN");
    const sellerSearchEnd =
      sayinIndex >= 0 ? sayinIndex : Math.min(lines.length, 30);
    const companyLike = (line: string) => {
      const key = this.normalizeFirmName(line);
      if (!key || key.includes("MAL HIZMET") || key.includes("KDV"))
        return false;
      return (
        /SELVI KIMYA|TAHA GIYIM|DIGITAL PLATFORM|METRO GROSMARKET/.test(key) ||
        /\b(AS|A S|LTD|STI|SAN|TIC|SIRKETI)\b/.test(key)
      );
    };
    const sellerName =
      lines.slice(0, sellerSearchEnd).find(companyLike) ||
      this.extractPartyFromPdf(text, [
        "Gönderen/Satıcı",
        "Gönderici",
        "Satıcı",
        "Asıl Satıcı",
      ]);
    const buyerName =
      sayinIndex >= 0
        ? lines
            .slice(sayinIndex + 1, sayinIndex + 5)
            .filter((line) => {
              const key = this.normalizeFirmName(line);
              return (
                key &&
                !key.includes("ADRES") &&
                !key.includes("TEL") &&
                !key.includes("WEB") &&
                !key.includes("E POSTA") &&
                !key.includes("VERGI") &&
                !key.includes("TCKN") &&
                !key.includes("VKN")
              );
            })
            .slice(0, 2)
            .join(" ")
        : this.extractPartyFromPdf(text, ["Alıcı", "Alıcı Ünvan", "Sayın"]);
    const sellerTaxNo =
      this.firstPartyTaxNo(text, sellerName) ||
      normalizeText(
        lines
          .slice(0, sellerSearchEnd + 12)
          .join(" ")
          .match(/\b(?:VKN|TCKN)\s*:\s*(\d{10,11})/i)?.[1],
      );
    const buyerTaxNo =
      this.firstPartyTaxNo(text, buyerName) ||
      normalizeText(
        lines
          .slice(Math.max(0, sayinIndex), sayinIndex + 20)
          .join(" ")
          .match(/\b(?:VKN|TCKN)\s*:\s*(\d{10,11})/i)?.[1],
      );
    return {
      sellerName: normalizeText(sellerName),
      sellerTaxNo,
      buyerName: normalizeText(buyerName),
      buyerTaxNo,
    };
  }

  private sourceFileAbsolutePath(file: any) {
    const filePath = normalizeText(file?.filePath);
    if (!filePath) return "";
    return path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
  }

  private uniqueModelDocumentPath(folderPath: string, fileName: string) {
    const parsed = path.parse(this.sanitizeFilePart(fileName) || "belge.pdf");
    const ext = parsed.ext || ".pdf";
    const base = parsed.name || "belge";
    let target = path.join(folderPath, `${base}${ext}`);
    let index = 2;
    while (fs.existsSync(target)) {
      target = path.join(folderPath, `${base}-${index}${ext}`);
      index += 1;
    }
    return target;
  }

  private knownSupplierFromText(text: string) {
    const raw = String(text || "");
    if (/SELV[İI]\s+K[İI]MYA/i.test(raw)) return "SELVİ KİMYA";
    if (/TAHA\s+G[İI]Y[İI]M/i.test(raw)) return "TAHA GİYİM";
    if (/TURAN\s+K[İI]MYA/i.test(raw)) return "TURAN KİMYA";
    if (/CAN\s+YEMEK/i.test(raw)) return "CAN YEMEK";
    if (/DIGITAL\s+PLATFORM|DIGITURK/i.test(raw)) return "DIGITAL PLATFORM";
    if (/METRO\s+GROSMARKET/i.test(raw)) return "METRO GROSMARKET";
    const normalized = this.normalizeFirmName(raw);
    if (normalized.includes("SELVI KIMYA")) return "SELVİ KİMYA";
    if (normalized.includes("TAHA GIYIM")) return "TAHA GİYİM";
    if (normalized.includes("TURAN KIMYA")) return "TURAN KİMYA";
    if (normalized.includes("CAN YEMEK")) return "CAN YEMEK";
    if (
      normalized.includes("DIGITAL PLATFORM") ||
      normalized.includes("DIGITURK")
    )
      return "DIGITAL PLATFORM";
    if (normalized.includes("METRO GROSMARKET")) return "METRO GROSMARKET";
    return "";
  }

  private firstPartyTaxNo(text: string, partyName: string) {
    if (!partyName) return "";
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean);
    const partyKey = this.normalizeFirmName(partyName);
    const index = lines.findIndex((line) =>
      this.normalizeFirmName(line).includes(partyKey),
    );
    if (index < 0) return "";
    return (
      lines
        .slice(index, index + 12)
        .join(" ")
        .match(/\b(?:VKN|TCKN)\s*:\s*(\d{10,11})/i)?.[1] || ""
    );
  }

  private cleanInvoiceProductName(description: string) {
    return normalizeText(description)
      .replace(/^.*\bMal\s*Hizmet\s*Tutar[ıi]?\s+\d+\s+/i, " ")
      .replace(/^.*\bDiğer\s*Vergiler\s+\d+\s+/i, " ")
      .replace(
        /\b(?:Mal\s*Hizmet|Miktar|Birim\s*Fiyat|KDV\s*Oran[ıi]|KDV\s*Tutar[ıi]|Diğer\s*Vergiler|Tutar[ıi])\b/gi,
        " ",
      )
      .replace(/\(\s*[\d.,]+\s*(?:KG|ADET|AD|LT|L|GR|G)\s*\)/gi, " ")
      .replace(/\bZDHC\b.*$/i, " ")
      .replace(/\bLOT\s*[-:]?\s*[A-Z0-9./_-]+.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private invoiceTableText(text: string) {
    return (
      String(text || "")
        .split(
          /(?:Sıra\s*No\s*Mal\s*Hizmet|No\s*Kod1\s*Kod2\s*Kod3\s*Mal\s*Hizmet)/i,
        )[1]
        ?.split(
          /Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]|\n\*|İLAVE DÖKÜMANLAR|ÖDEME ŞEKLİ/i,
        )[0] || ""
    );
  }

  private amountPattern() {
    return String.raw`(?:\d{1,3}(?:\.\d{3})*,\d{2,6}|\d+,\d{2,6}|\d+(?:\.\d{1,6})?)`;
  }

  private cleanParsedInvoiceProduct(value: string) {
    return this.cleanInvoiceProductName(value)
      .replace(/^\d+\s+/, "")
      .replace(/\b\d{5,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildParsedInvoiceRow(raw: any, index: number) {
    const productName = this.cleanParsedInvoiceProduct(
      raw.productName || raw.rawDescription || "",
    );
    if (!productName) return null;
    const lineTotal = this.parseAmount(raw.lineTotal);
    const vatAmount = this.parseAmount(raw.vatAmount);
    const quantity = this.parseQuantity(raw.quantity);
    let unitPrice =
      this.parseAmount(raw.unitPrice) ||
      (quantity ? Number((lineTotal / quantity).toFixed(6)) : 0);
    if (
      lineTotal &&
      quantity &&
      Math.abs(unitPrice * quantity - lineTotal) > 0.05
    ) {
      unitPrice = Number((lineTotal / quantity).toFixed(6));
    }
    return {
      lineNo: Number(raw.lineNo || index + 1),
      productName,
      rawDescription: productName,
      packageInfo: normalizeText(raw.packaging || ""),
      packaging: normalizeText(raw.packaging || ""),
      quantity,
      unit: normalizeText(raw.unit || "ADET")
        .replace(/\.$/, "")
        .toLocaleUpperCase("tr-TR"),
      unitPrice,
      vatRate: this.parseAmount(raw.vatRate || 0),
      vatAmount,
      lineTotal,
      lotNo: normalizeText(raw.lotNo || ""),
    };
  }

  private extractStructuredInvoiceRows(text: string) {
    const body = normalizeText(this.invoiceTableText(text) || text);
    const rows: any[] = [];
    if (!body) return rows;
    const amount = this.amountPattern();

    const metroRegex = new RegExp(
      String.raw`\b(\d{1,3})\s+\d{5,}\s+(\d{8,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(Adet|ADET|Kg\.?|KG|LT|L)\s+(${amount})\s*TL\s+(${amount})\s*TL\s+%?\s*(\d+(?:[.,]\d+)?)\s+(${amount})\s*TL`,
      "gi",
    );
    for (const match of body.matchAll(metroRegex)) {
      const row = this.buildParsedInvoiceRow(
        {
          lineNo: match[1],
          productName: match[3],
          quantity: match[4],
          unit: match[5],
          unitPrice: match[6],
          lineTotal: match[7],
          vatRate: match[8],
          vatAmount: match[9],
        },
        rows.length,
      );
      if (row) rows.push(row);
    }
    if (rows.length) return rows;

    const commonRegex = new RegExp(
      String.raw`(?:^|\s)(\d{1,3})\s*([A-ZÇĞİÖŞÜ0-9 ./'()+-]+?)\s*(\d+(?:[.,]\d+)?)\s*(Adet|ADET|Kg\.?|KG|kg|LT|L)\s*(${amount})\s*TL\s*%?\s*(\d+(?:[.,]\d+)?)\s*(${amount})\s*TL\s*(${amount})\s*TL`,
      "gi",
    );
    for (const match of body.matchAll(commonRegex)) {
      const productName = match[2];
      if (/Mal\s*Hizmet|Toplam|Vergiler|Ödenecek/i.test(productName)) continue;
      const row = this.buildParsedInvoiceRow(
        {
          lineNo: match[1],
          productName,
          quantity: match[3],
          unit: match[4],
          unitPrice: match[5],
          vatRate: match[6],
          vatAmount: match[7],
          lineTotal: match[8],
        },
        rows.length,
      );
      if (row) rows.push(row);
    }
    return rows;
  }

  private extractItemsFromText(text: string) {
    const structuredRows = this.extractStructuredInvoiceRows(text);
    if (structuredRows.length) return structuredRows;
    const tableText = this.invoiceTableText(text);
    const blockRows: any[] = [];
    if (tableText) {
      const blocks = Array.from(
        tableText.matchAll(
          /(?:^|\n)\s*(\d{1,3})\s*\n([\s\S]*?)(?=\n\s*\d{1,3}\s*\n|\n\*|$)/g,
        ),
      );
      for (const blockMatch of blocks) {
        const block = normalizeText(blockMatch[2] || "");
        const quantityMatch = block.match(/(\d+(?:[.,]\d+)?)\s*Adet/i);
        const tlAmounts = Array.from(
          block.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2,6}|\d+,\d{2,6})\s*TL/gi),
        ).map((match) => this.parseAmount(match[1]));
        const beforeQuantity = normalizeText(
          quantityMatch ? block.slice(0, quantityMatch.index) : block,
        );
        const lotNo =
          block.match(/\bLOT\s*[-:]?\s*([A-Z0-9./_-]+)/i)?.[1] ||
          block.match(/\bPART[İI]\s*[-:]?\s*([A-Z0-9./_-]+)/i)?.[1] ||
          "";
        const packaging =
          beforeQuantity.match(
            /\(\s*([\d.,]+\s*(?:KG|ADET|AD|LT|L|GR|G))\s*\)/i,
          )?.[1] || "";
        const productName = this.cleanInvoiceProductName(beforeQuantity);
        if (!productName && !quantityMatch && !tlAmounts.length) continue;
        const lineTotal =
          tlAmounts.length >= 2
            ? tlAmounts[tlAmounts.length - 2]
            : tlAmounts[0] || 0;
        const vatAmount =
          tlAmounts.length >= 2 ? tlAmounts[tlAmounts.length - 1] : 0;
        blockRows.push({
          lineNo: Number(blockMatch[1] || blockRows.length + 1),
          productName: productName || beforeQuantity,
          rawDescription: productName || beforeQuantity,
          packageInfo: normalizeText(packaging),
          packaging: normalizeText(packaging),
          quantity: this.parseQuantity(quantityMatch?.[1] || 0),
          unit: "ADET",
          unitPrice: tlAmounts.length >= 3 ? tlAmounts[0] : 0,
          vatRate: this.parseAmount(
            block.match(/%(\d+(?:[.,]\d+)?)/)?.[1] || 20,
          ),
          vatAmount,
          lineTotal,
          lotNo: normalizeText(lotNo),
        });
      }
      if (blockRows.length) return blockRows;
    }
    const compact = String(text || "").replace(/\s+/g, " ");
    const rows: any[] = [];
    const itemRegex =
      /\b([1-9]\d{0,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*(ADET|Adet|KG|Kg|LT|L)\b(?:.*?(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL)?(?:.*?(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL)?/gi;
    for (const match of compact.matchAll(itemRegex)) {
      const description = normalizeText(match[2])
        .replace(/^.*?\bTutar[ıi]?\s+/i, "")
        .trim();
      if (
        !description ||
        this.normalizeFirmName(description).includes("MAL HIZMET")
      )
        continue;
      rows.push({
        lineNo: rows.length + 1,
        productName: this.cleanInvoiceProductName(description),
        rawDescription: this.cleanInvoiceProductName(description),
        quantity: this.parseQuantity(match[3]),
        unit: normalizeText(match[4]).toLocaleUpperCase("tr-TR"),
        unitPrice:
          this.parseAmount(match[6] || match[5] || 0) &&
          this.parseQuantity(match[3])
            ? Number(
                (
                  this.parseAmount(match[6] || match[5] || 0) /
                  this.parseQuantity(match[3])
                ).toFixed(6),
              )
            : this.parseAmount(match[5] || 0),
        lineTotal: this.parseAmount(match[6] || match[5] || 0),
        vatRate: 20,
        vatAmount: 0,
        lotNo: "",
      });
    }
    return rows;
  }

  private async readSpreadsheetHeaders(filePath: string, role: string) {
    if (role !== "archive") return [] as string[];
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".csv") {
      const firstLine =
        fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0] || "";
      return firstLine.split(/[;,]/).map((cell) => normalizeText(cell));
    }
    if (ext !== ".xlsx") return [];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    const headers: string[] = [];
    sheet
      ?.getRow(1)
      .eachCell((cell) => headers.push(normalizeText(cell.text || cell.value)));
    return headers;
  }

  private async parseUploadedFile(file: any) {
    const role = this.detectFileRole(file);
    const fileName = normalizeText(file?.originalname || file?.filename || "");
    const ext = path.extname(fileName).toLowerCase();
    let extractedText = "";
    let xmlText = "";
    let headers: string[] = [];
    let parseWarnings: string[] = [];
    if (role === "xml") {
      xmlText = fs.readFileSync(file.path, "utf8");
      extractedText = xmlText;
    } else if (role === "pdf") {
      try {
        const pdf = await this.pdfExtraction.extractTextFromPdf(file.path);
        extractedText = pdf.text || "";
      } catch (error: any) {
        parseWarnings.push(
          `PDF metni okunamadı: ${normalizeText(error?.message)}`,
        );
      }
    } else if ([".xlsx", ".csv"].includes(ext)) {
      headers = await this.readSpreadsheetHeaders(file.path, "archive");
      extractedText = headers.join(" ");
    }
    return {
      role,
      fileName,
      ext,
      extractedText,
      xmlText,
      headers,
      parseWarnings,
    };
  }

  private detectDocumentKindFromParsed(parsed: any) {
    const key = normalizeSearchText(
      `${parsed.fileName} ${parsed.extractedText}`,
    ).toLocaleUpperCase("tr-TR");
    const xml = String(parsed.xmlText || "");
    const isXmlInvoice = /<(?:[^>\s:]+:)?Invoice[\s>]/i.test(xml);
    const isXmlDespatch = /<(?:[^>\s:]+:)?DespatchAdvice[\s>]/i.test(xml);
    const fileHints = this.fileNameDocumentHints(parsed.fileName || "");
    const prefixTarget = this.targetTypeFromDocumentNo(fileHints.documentNo);
    const headers = (parsed.headers || []).map((h: string) =>
      normalizeSearchText(h).toLocaleUpperCase("tr-TR"),
    );
    const hasHeaders = (needles: string[]) =>
      needles.filter((needle) =>
        headers.some((header: string) =>
          header.includes(
            normalizeSearchText(needle).toLocaleUpperCase("tr-TR"),
          ),
        ),
      ).length;
    if (
      hasHeaders([
        "MODEL ISMI",
        "SIPARIS NO",
        "BOLUMU",
        "IRSALIYE ADEDI",
        "TESLIM EDILEN ADET",
        "TESLIM ALAN FIRMA",
        "IMZA",
      ]) >= 4
    )
      return {
        detectedKind: "TASNIF_RAPORU",
        confidence: 92,
        reasons: ["Tasnif raporu başlıkları bulundu"],
      };
    if (
      hasHeaders([
        "TARIH",
        "BELGE NO",
        "FATURA NO",
        "BORC",
        "ALACAK",
        "BAKIYE",
        "TUTAR",
        "ACIKLAMA",
      ]) >= 4
    )
      return {
        detectedKind: "EKSTRE",
        confidence: 88,
        reasons: ["Ekstre başlıkları bulundu"],
      };
    if (prefixTarget) {
      return {
        detectedKind: this.detectedKindForTargetType(prefixTarget),
        confidence: 88,
        reasons: [`Dosya numara prefixi bulundu: ${fileHints.documentNo}`],
      };
    }
    if (
      isXmlInvoice ||
      key.includes("INVOICE") ||
      key.includes("E FATURA") ||
      key.includes("E ARSIV") ||
      key.includes("FATURA NO") ||
      key.includes("FATURA TARIHI") ||
      key.includes("TICARIFATURA") ||
      key.includes("TEMELFATURA") ||
      key.includes("SATIS")
    )
      return {
        detectedKind: "FATURA",
        confidence: isXmlInvoice ? 96 : 92,
        reasons: [
          isXmlInvoice ? "XML Invoice kökü bulundu" : "Fatura sinyali bulundu",
        ],
      };
    if (
      isXmlDespatch ||
      key.includes("DESPATCHADVICE") ||
      key.includes("E IRSALIYE") ||
      key.includes("IRSALIYE NO") ||
      key.includes("TEMELIRSALIYE") ||
      key.includes("SEVK")
    )
      return {
        detectedKind: "IRSALIYE",
        confidence: 92,
        reasons: ["İrsaliye sinyali bulundu"],
      };
    return {
      detectedKind: "UNKNOWN",
      confidence: 20,
      reasons: ["Belge tipi sinyali bulunamadı"],
    };
  }

  private extractDocumentFields(parsed: any) {
    const text = parsed.extractedText || "";
    const xml = parsed.xmlText || "";
    const fileHints = this.fileNameDocumentHints(parsed.fileName || "");
    const parties = xml ? this.xmlParty(xml) : null;
    const pdfParties = !xml ? this.extractPdfParties(text) : null;
    const isXmlInvoice = /<(?:[^>\s:]+:)?Invoice[\s>]/i.test(xml);
    const prefixTarget = this.targetTypeFromDocumentNo(fileHints.documentNo);
    const prefixKind = this.detectedKindForTargetType(prefixTarget);
    const isInvoiceDocument =
      isXmlInvoice || /fatura/i.test(text) || prefixKind === "FATURA";
    const documentNo =
      (xml ? this.xmlTag(xml, "ID") : "") ||
      this.pdfLabelValue(text, [
        "Fatura No",
        "Fatura Numarası",
        "İrsaliye No",
        "Irsaliye No",
      ]) ||
      fileHints.documentNo ||
      "";
    const invoiceNo = isInvoiceDocument
      ? documentNo
      : this.pdfLabelValue(text, ["Fatura No", "Fatura Numarası"]);
    const dispatchNo = isInvoiceDocument
      ? this.pdfLabelValue(text, ["İrsaliye No", "Irsaliye No"]) ||
        this.xmlTag(xml, "DespatchDocumentReference")
      : documentNo || fileHints.documentNo;
    let sellerName =
      parties?.supplier.name ||
      pdfParties?.sellerName ||
      this.knownSupplierFromText(text) ||
      this.extractPartyFromPdf(text, [
        "Gönderen/Satıcı",
        "Gönderici",
        "Satıcı",
        "Asıl Satıcı",
      ]);
    let buyerName =
      parties?.customer.name ||
      pdfParties?.buyerName ||
      this.extractPartyFromPdf(text, ["Alıcı", "Alıcı Ünvan", "Sayın"]);
    if (["BIZIM_GIDEN_FATURA", "BIZIM_GIDEN_IRSALIYE"].includes(prefixTarget)) {
      if (this.isMainCompanyName(text, "MECİT HAKAN GÜRSU"))
        sellerName = "MECİT HAKAN GÜRSU";
      if (
        !buyerName ||
        this.isMainCompanyName(buyerName, "MECİT HAKAN GÜRSU")
      ) {
        buyerName =
          pdfParties?.buyerName ||
          this.extractPartyFromPdf(text, ["Sayın", "Alıcı"]);
      }
    } else if (
      prefixTarget === "TEDARIKCI_GELEN_FATURA" &&
      this.isMainCompanyName(text, "MECİT HAKAN GÜRSU")
    ) {
      buyerName = buyerName || "MECİT HAKAN GÜRSU";
    }
    const date =
      (xml ? this.xmlTag(xml, "IssueDate") : "") ||
      this.extractPdfDate(text, isInvoiceDocument ? "invoice" : "dispatch") ||
      this.parseDateText(
        this.pdfLabelValue(text, [
          "Fatura Tarihi",
          "İrsaliye Tarihi",
          "Irsaliye Tarihi",
          "Tarih",
        ]),
      );
    const items = xml
      ? this.extractXmlLinesForDb(xml)
      : this.extractItemsFromText(text);
    const quantity =
      items.reduce(
        (sum: number, item: any) => sum + Number(item.quantity || 0),
        0,
      ) ||
      this.parseQuantity(
        Array.from(
          String(text).matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)\s*Adet/gi),
        ).at(-1)?.[1],
      );
    const subtotal =
      this.parseAmount(this.xmlTag(xml, "LineExtensionAmount")) ||
      this.amountAfterText(text, [
        "Mal Hizmet Toplam Tutarı",
        "Mal Hizmet Toplam Tutari",
      ]);
    const vatTotal =
      this.parseAmount(this.xmlTag(xml, "TaxAmount")) ||
      this.firstAmountOnLine(
        text,
        (line) => /Hesaplanan/i.test(line) && /KATMA|KDV|VERG/i.test(line),
      ) ||
      this.amountAfterText(text, ["Hesaplanan KDV"]);
    const grandTotal =
      this.parseAmount(this.xmlTag(xml, "PayableAmount")) ||
      this.amountAfterText(text, [
        "Ödenecek Tutar",
        "Odenecek Tutar",
        "Vergiler Dahil Toplam Tutar",
      ]);
    return {
      documentNo: normalizeText(documentNo),
      invoiceNo: normalizeText(invoiceNo),
      dispatchNo: normalizeText(dispatchNo),
      date,
      sellerName: normalizeText(sellerName),
      sellerTaxNo:
        parties?.supplier.taxNo ||
        this.firstPartyTaxNo(text, sellerName) ||
        pdfParties?.sellerTaxNo ||
        (sellerName ? String(text).match(/\bVKN\s*:\s*(\d{10})/i)?.[1] : "") ||
        "",
      buyerName: normalizeText(buyerName),
      buyerTaxNo: parties?.customer.taxNo || pdfParties?.buyerTaxNo || "",
      subtotal,
      vatTotal,
      grandTotal,
      quantity,
      items,
      modelSuggestion:
        (/^(HKN|DDM)\d+/i.test(documentNo) && fileHints.modelSuggestion
          ? fileHints.modelSuggestion
          : this.modelSuggestionFromFields(
              items,
              parsed.fileName,
              documentNo,
            )) || fileHints.modelSuggestion,
      rawText: text,
    };
  }

  private templateJsonArray(value: any) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value
          .split(/[,\n;]/)
          .map((item) => normalizeText(item))
          .filter(Boolean);
      }
    }
    return [];
  }

  private templateJsonObject(value: any) {
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  private async findReadTemplate(
    slug: string,
    parsed: any,
    fields: any,
    options: Query = {},
  ) {
    const explicitId = normalizeText(options.templateId);
    const rows = await this.prisma.documentReadTemplate.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        active: true,
        ...(explicitId ? { id: explicitId } : {}),
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    });
    const haystack = normalizeSearchText(
      [
        parsed?.fileName,
        fields?.sellerName,
        fields?.buyerName,
        options.templateCompanyName,
        fields?.rawText,
      ].join(" "),
    ).toLocaleUpperCase("tr-TR");
    const targetByDocumentType = options.documentType
      ? this.documentTypeToTargetType(options.documentType)
      : "";
    for (const template of rows) {
      if (
        targetByDocumentType &&
        template.targetType &&
        normalizeText(template.targetType).toLocaleUpperCase("tr-TR") !==
          targetByDocumentType
      ) {
        continue;
      }
      const companyName = normalizeSearchText(
        normalizeText(options.templateCompanyName) ||
          template.companyName ||
          "",
      ).toLocaleUpperCase("tr-TR");
      if (companyName && !haystack.includes(companyName)) continue;
      const keywords = this.templateJsonArray(template.matchKeywordsJson)
        .map((item) => normalizeSearchText(item).toLocaleUpperCase("tr-TR"))
        .filter(Boolean);
      if (
        keywords.length &&
        !keywords.some((keyword) => haystack.includes(keyword))
      ) {
        continue;
      }
      return template;
    }
    return null;
  }

  private regexValue(text: string, rule: any) {
    const rules = Array.isArray(rule) ? rule : [rule];
    for (const item of rules) {
      if (!item) continue;
      const pattern =
        typeof item === "string" ? item : item.pattern || item.regex;
      if (!pattern) continue;
      try {
        const flags =
          typeof item === "object" && item.flags ? String(item.flags) : "i";
        const match = String(text || "").match(new RegExp(pattern, flags));
        const group = Number((typeof item === "object" ? item.group : 1) || 1);
        const value = normalizeText(match?.[group] || "");
        if (value) return value;
      } catch {
        continue;
      }
    }
    return "";
  }

  private applyReadTemplateToFields(template: any, parsed: any, fields: any) {
    if (!template) return fields;
    const rawText = String(fields.rawText || parsed?.extractedText || "");
    const fieldRules = this.templateJsonObject(template.fieldRulesJson);
    const lineRules = this.templateJsonObject(template.lineRulesJson);
    const next = { ...fields };
    const textFields: Record<string, string[]> = {
      documentNo: ["documentNo", "belgeNo"],
      invoiceNo: ["invoiceNo", "faturaNo"],
      dispatchNo: ["dispatchNo", "irsaliyeNo"],
      date: ["date", "tarih"],
      sellerName: ["sellerName", "saticiUnvan", "firmaAdi"],
      buyerName: ["buyerName", "aliciUnvan", "firmaAdi"],
      modelSuggestion: ["modelSuggestion", "modelAdiOnerisi"],
    };
    for (const [target, aliases] of Object.entries(textFields)) {
      for (const key of aliases) {
        const value = this.regexValue(rawText, fieldRules[key]);
        if (value) {
          next[target] =
            target === "date" ? this.parseDateText(value) || value : value;
          break;
        }
      }
    }
    const amountFields: Record<string, string[]> = {
      subtotal: ["subtotal", "araToplam"],
      vatTotal: ["vatTotal", "kdvToplam", "kdv"],
      grandTotal: ["grandTotal", "genelToplam", "toplamTutar"],
      quantity: ["quantity", "adet", "gelenAdet"],
    };
    for (const [target, aliases] of Object.entries(amountFields)) {
      for (const key of aliases) {
        const value = this.regexValue(rawText, fieldRules[key]);
        if (value) {
          next[target] =
            target === "quantity"
              ? this.parseQuantity(value)
              : this.parseAmount(value);
          break;
        }
      }
    }

    if (lineRules.pattern || lineRules.linePattern) {
      try {
        const linePattern = new RegExp(
          String(lineRules.pattern || lineRules.linePattern),
          String(lineRules.flags || "gim"),
        );
        const rows: any[] = [];
        for (const match of rawText.matchAll(linePattern)) {
          const pick = (name: string, fallback = 0) => {
            const index = Number(lineRules[`${name}Group`] || fallback || 0);
            return normalizeText(index ? match[index] : "");
          };
          const description = pick("description", 1) || pick("productName", 1);
          if (!description) continue;
          rows.push({
            lineNo: rows.length + 1,
            productName: description,
            rawDescription: description,
            quantity: this.parseQuantity(pick("quantity", 2)),
            unit: pick("unit", 3) || "ADET",
            unitPrice: this.parseAmount(pick("unitPrice", 4)),
            vatRate: this.parseAmount(pick("vatRate", 5)),
            vatAmount: this.parseAmount(pick("vatAmount", 6)),
            lineTotal: this.parseAmount(
              pick("lineTotal", 7) || pick("total", 7),
            ),
            lotNo: pick("lot", 8),
          });
        }
        if (rows.length) {
          next.items = rows;
          next.quantity =
            rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ||
            next.quantity;
          next.modelSuggestion =
            next.modelSuggestion ||
            this.modelSuggestionFromFields(
              rows,
              parsed.fileName,
              next.documentNo,
            );
        }
      } catch {
        // Kullanıcı şablonu hatalı regex içerirse belge yükleme düşmesin; normal parser devam eder.
      }
    }
    return {
      ...next,
      appliedTemplateId: template.id,
      appliedTemplateName: template.templateName,
      appliedTemplateCompanyName: template.companyName || "",
      appliedTemplateTargetType: template.targetType || "",
    };
  }

  private amountAfterText(text: string, labels: string[]) {
    const normalizedText = normalizeText(text)
      .replace(/[\u00a0\u2007\u202f]/g, " ")
      .replace(/[\u00ad\u2010-\u2015]/g, "-")
      .replace(/\s+/g, " ");
    for (const label of labels) {
      const escaped = normalizeText(label)
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*");
      const match = normalizedText.match(
        new RegExp(
          `${escaped}\\s*[^0-9]{0,40}(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})`,
          "i",
        ),
      );
      const amount = this.parseAmount(match?.[1] || "");
      if (amount) return amount;
    }
    return 0;
  }

  private extractXmlLinesForDb(xml: string) {
    const blocks = Array.from(
      String(xml || "").matchAll(
        /<(?:[^>\s:]+:)?(?:InvoiceLine|DespatchLine)[^>]*>([\s\S]*?)<\/(?:[^>\s:]+:)?(?:InvoiceLine|DespatchLine)>/gi,
      ),
    );
    return blocks.map((match, index) => {
      const block = match[1] || "";
      const item = this.xmlBlock(block, "Item");
      const quantity =
        this.xmlTag(block, "InvoicedQuantity") ||
        this.xmlTag(block, "DeliveredQuantity");
      return {
        lineNo: index + 1,
        productName:
          this.xmlTag(item, "Name") ||
          this.xmlTag(item, "Description") ||
          `Kalem ${index + 1}`,
        rawDescription:
          this.xmlTag(item, "Name") ||
          this.xmlTag(item, "Description") ||
          `Kalem ${index + 1}`,
        quantity: this.parseQuantity(quantity),
        unit: "ADET",
        unitPrice: this.parseAmount(this.xmlTag(block, "PriceAmount")),
        vatRate: this.parseAmount(this.xmlTag(block, "Percent")),
        vatAmount: this.parseAmount(this.xmlTag(block, "TaxAmount")),
        lineTotal: this.parseAmount(this.xmlTag(block, "LineExtensionAmount")),
        lotNo:
          normalizeText(this.xmlTag(block, "Note")).match(
            /\b(?:LOT|Parti)\s*[:#-]?\s*([A-Z0-9./_-]+)/i,
          )?.[1] || "",
      };
    });
  }

  private modelSuggestionFromFields(
    items: any[],
    fileName: string,
    documentNo: string,
  ) {
    const fromItem = normalizeText(
      items?.[0]?.productName || items?.[0]?.rawDescription,
    );
    if (fromItem) return fromItem.replace(/[,/]+/g, " ").replace(/\s+/g, " ");
    return normalizeText(
      path
        .parse(fileName || "")
        .name.replace(documentNo || "", "")
        .replace(/^[A-Z]{2,4}\d{8,}/i, "")
        .replace(/^[-_\s]+/, ""),
    );
  }

  private fileNameDocumentHints(fileName: string) {
    const base = normalizeText(path.parse(fileName || "").name);
    // Dosya adlarinda belge numarasini genellikle alt cizgi takip ediyor.
    // `\b` alt cizgiyi kelime karakteri saydigi icin
    // TIA2026000147227_816... bicimindeki gercek e-Irsaliye adlarini kaciriyordu.
    const documentNo =
      base.match(/(?:^|[^A-Z0-9])([A-Z]{2,4}\d{8,16})(?=$|[^A-Z0-9])/i)?.[1] ||
      "";
    const modelSuggestion =
      documentNo && /^(HKN|DDM)/i.test(documentNo)
        ? normalizeText(base.replace(documentNo, "").replace(/^[-_\s]+/, ""))
        : "";
    return { documentNo, modelSuggestion };
  }

  private modelSuggestionFromDescription(value: unknown) {
    return normalizeText(value)
      .replace(/[,/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractCustomerDispatchLines(text: string) {
    const raw = String(text || "");
    const sectionMatch = raw.match(
      /S[ıi]ra\s*No[\s\S]*?Malzeme\s*No\s*A[cç]ıklama\s*Miktar([\s\S]*?)Toplam/iu,
    );
    const section = sectionMatch?.[1] || "";
    const compactSection = section
      .replace(/[\t\r]+/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lineMatches = Array.from(
      compactSection.matchAll(
        /(\d+)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*Adet/gi,
      ),
    );
    const rows = lineMatches
      .map((match, index) => {
        const rowText = normalizeText(match[2] || "");
        const quantity = this.parseQuantity(match[3] || "");
        if (!rowText && !quantity) return null;
        const parts = rowText
          .split(/\s{2,}|\s+-\s+|\s+\/\s+/)
          .map((part) => normalizeText(part))
          .filter(Boolean);
        const materialNo =
          normalizeText(
            rowText.match(
              /^([A-Z0-9./_-]{4,}(?:\s*[\/.-]\s*[A-Z0-9./_-]+){0,3})/i,
            )?.[1] ||
              parts[0] ||
              "",
          ) || "";
        const description = normalizeText(
          materialNo && rowText.startsWith(materialNo)
            ? rowText.slice(materialNo.length)
            : parts.slice(1).join(" ") || rowText,
        );
        return {
          lineNo: Number(match[1] || index + 1),
          malzemeNo: materialNo,
          materialNo,
          aciklama: description || rowText,
          rawDescription: rowText,
          productName: description || rowText,
          quantity,
          adet: quantity,
          unit: "ADET",
          birim: "ADET",
          modelAdiOnerisi: this.modelSuggestionFromDescription(
            description || rowText,
          ),
          durum: "MODEL_BAGLANTISI_BEKLIYOR",
        };
      })
      .filter(Boolean);
    if (rows.length) return rows;

    const aciklama =
      this.pdfLabelValue(raw, ["Açıklama", "Aciklama"]) ||
      normalizeText(raw.match(/Açıklama\s*:?\s*([^\n]+)/i)?.[1] || "");
    const adet =
      this.parseQuantity(
        raw.match(
          /(?:Miktar|Adet)\s*:?\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*Adet/i,
        )?.[1] ||
          Array.from(
            raw.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*Adet/gi),
          ).at(-1)?.[1],
      ) || 0;
    if (!aciklama && !adet) return [];
    return [
      {
        lineNo: 1,
        aciklama,
        rawDescription: aciklama,
        productName: aciklama,
        quantity: adet,
        adet,
        unit: "ADET",
        birim: "ADET",
        modelAdiOnerisi: this.modelSuggestionFromDescription(aciklama),
        durum: "MODEL_BAGLANTISI_BEKLIYOR",
      },
    ];
  }

  private async findCompany(
    mainCompanySlug: string,
    payload: Query,
    tx: any = this.prisma,
  ) {
    const companyId = normalizeText(payload.companyId);
    if (companyId) {
      const row = await tx.company.findFirst({
        where: { id: companyId, mainCompanySlug },
      });
      if (row) return row;
    }
    const companyName = normalizeText(payload.companyName || payload.firma);
    if (companyName) {
      const normalizedName = normalizeSearchText(companyName);
      const row = await tx.company.findFirst({
        where: {
          mainCompanySlug,
          OR: [
            { normalizedName },
            { name: { equals: companyName } },
          ],
        },
      });
      if (row) return row;
    }
    throw new BadRequestException("Firma zorunludur.");
  }

  private detectDocumentDirection(
    kind: { detectedKind: string; confidence: number; reasons: string[] },
    fields: any,
    mainCompany: any,
  ) {
    if (kind.detectedKind === "TASNIF_RAPORU") {
      return {
        detectedKind: kind.detectedKind,
        direction: "GELEN",
        targetType: "TASNIF_RAPORU_TEMPLATE",
        targetModule: "EPOSTA",
        confidence: Math.max(kind.confidence, 90),
        reasons: [...kind.reasons, "Tasnif raporu şablonu"],
        warnings: [],
      };
    }
    if (kind.detectedKind === "EKSTRE") {
      return {
        detectedKind: kind.detectedKind,
        direction: "GELEN",
        targetType: "EKSTRE_DOSYASI",
        targetModule: "ODEMELER",
        confidence: kind.confidence,
        reasons: [...kind.reasons, "Ekstre dosyası"],
        warnings: [],
      };
    }
    const sellerIsMain = this.isMainCompanyName(
      fields.sellerName,
      mainCompany?.name,
    );
    const buyerIsMain = this.isMainCompanyName(
      fields.buyerName,
      mainCompany?.name,
    );
    const prefixTarget = this.targetTypeFromDocumentNo(
      fields.documentNo || fields.invoiceNo || fields.dispatchNo,
    );
    if (kind.detectedKind === "IRSALIYE" && buyerIsMain) {
      return {
        detectedKind: "IRSALIYE",
        direction: "GELEN",
        targetType: "MUSTERIDEN_GELEN_IRSALIYE",
        targetModule: "MUSTERI_IRSALIYE",
        confidence: Math.min(100, kind.confidence + 5),
        reasons: [...kind.reasons, "Ana firma alıcı"],
        warnings: [],
      };
    }
    if (kind.detectedKind === "IRSALIYE" && sellerIsMain) {
      return {
        detectedKind: "IRSALIYE",
        direction: "GIDEN",
        targetType: "BIZIM_GIDEN_IRSALIYE",
        targetModule: "BIZIM_BELGELER",
        confidence: Math.min(100, kind.confidence + 5),
        reasons: [...kind.reasons, "Ana firma satıcı"],
        warnings: [],
      };
    }
    if (kind.detectedKind === "FATURA" && sellerIsMain) {
      return {
        detectedKind: "FATURA",
        direction: "GIDEN",
        targetType: "BIZIM_GIDEN_FATURA",
        targetModule: "BIZIM_BELGELER",
        confidence: Math.min(100, kind.confidence + 5),
        reasons: [...kind.reasons, "Ana firma satıcı"],
        warnings: [],
      };
    }
    if (prefixTarget) {
      return {
        detectedKind:
          this.detectedKindForTargetType(prefixTarget) || kind.detectedKind,
        direction: this.directionForTargetType(prefixTarget),
        targetType: prefixTarget,
        targetModule: this.targetModuleForTargetType(prefixTarget),
        confidence: Math.max(kind.confidence, 88),
        reasons: [
          ...kind.reasons,
          `Belge numarası prefix yönü: ${fields.documentNo || fields.invoiceNo || fields.dispatchNo}`,
        ],
        warnings:
          sellerIsMain || buyerIsMain
            ? []
            : [
                "Ana firma alanı PDF'den net okunamadı; prefix kuralı uygulandı",
              ],
      };
    }
    if (kind.detectedKind === "FATURA" && (buyerIsMain || !sellerIsMain)) {
      return {
        detectedKind: "FATURA",
        direction: "GELEN",
        targetType: "TEDARIKCI_GELEN_FATURA",
        targetModule: "TEDARIKCI_FATURA",
        confidence: buyerIsMain
          ? Math.min(100, kind.confidence + 5)
          : Math.max(70, kind.confidence - 10),
        reasons: [
          ...kind.reasons,
          buyerIsMain
            ? "Ana firma alıcı"
            : "Fatura, yön belirsiz; tedarikçi havuzuna kontrolle alındı",
        ],
        warnings: buyerIsMain ? [] : ["Ana firma tarafı net okunamadı"],
      };
    }
    return {
      detectedKind: kind.detectedKind,
      direction: "UNKNOWN",
      targetType: "UNKNOWN",
      targetModule: "TASNIF_BEKLEYEN",
      confidence: kind.confidence,
      reasons: kind.reasons,
      warnings: ["Yön veya belge tipi çözülemedi"],
    };
  }

  async findFirmMatchCandidates(
    mainCompanySlug: string,
    name: unknown,
    vkn?: unknown,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const taxNo = normalizeText(vkn);
    const normalized = this.normalizeFirmName(name);
    const companies = await this.prisma.company.findMany({
      where: {
        mainCompanySlug: slug,
        isActive: true,
        deletedAt: null,
      },
      include: { aliases: true },
      take: 5000,
    });
    const scored = companies
      .map((company) => {
        if (taxNo && company.taxNo === taxNo)
          return { company, score: 1, reason: "VKN/TCKN eşleşti" };
        const keys = [
          company.normalizedName,
          company.name,
          ...company.aliases
            .filter((alias) => alias.isActive && !alias.deletedAt)
            .map((alias) => alias.normalizedName || alias.rawName),
        ].map((value) => this.normalizeFirmName(value));
        const best = keys.reduce((max, key) => {
          if (!key || !normalized) return max;
          if (key === normalized) return Math.max(max, 1);
          if (key.includes(normalized) || normalized.includes(key))
            return Math.max(max, 0.93);
          const a = new Set(key.split(" ").filter(Boolean));
          const b = normalized.split(" ").filter(Boolean);
          const common = b.filter((token) => a.has(token)).length;
          return Math.max(max, common / Math.max(b.length, 1));
        }, 0);
        return {
          company,
          score: best,
          reason: best >= 1 ? "İsim eşleşti" : "Yakın isim",
        };
      })
      .filter((item) => item.score >= 0.75)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map((item) => ({
      id: item.company.id,
      firmaAdi: item.company.name,
      normalizedName: item.company.normalizedName,
      vknTckn: item.company.taxNo || "",
      score: Number(item.score.toFixed(2)),
      reason: item.reason,
    }));
  }

  private async resolveOrCreateFirm(
    mainCompanySlug: string,
    fields: any,
    classification: any,
  ) {
    const counterparty =
      classification.targetType === "TEDARIKCI_GELEN_FATURA" ||
      classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE"
        ? fields.sellerName
        : fields.buyerName;
    const taxNo =
      classification.targetType === "TEDARIKCI_GELEN_FATURA" ||
      classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE"
        ? fields.sellerTaxNo
        : fields.buyerTaxNo;
    const name = this.displayFirmName(counterparty);
    if (!name) {
      return {
        company: null,
        status: "FIRMA_ESLESMESI_BEKLIYOR",
        candidates: [],
      };
    }
    const candidates = await this.findFirmMatchCandidates(
      mainCompanySlug,
      name,
      taxNo,
    );
    const auto = candidates.find((item) => item.score >= 0.92);
    if (auto) {
      const company = await this.prisma.company.findFirst({
        where: { id: auto.id, mainCompanySlug },
      });
      if (company) {
        const normalizedTaxNo = normalizeText(taxNo);
        const expectedType =
          classification.targetType === "TEDARIKCI_GELEN_FATURA"
            ? "SATICI"
            : "MUSTERI";
        const existingType = normalizeText(company.type).toLocaleUpperCase(
          "tr-TR",
        );
        const nextType =
          !existingType || existingType === expectedType
            ? expectedType
            : (["SATICI", "SUPPLIER"].includes(existingType) &&
                  ["MUSTERI", "CUSTOMER"].includes(expectedType)) ||
                (["MUSTERI", "CUSTOMER"].includes(existingType) &&
                  ["SATICI", "SUPPLIER"].includes(expectedType))
              ? "BOTH"
              : existingType;
        const resolvedCompany =
          (normalizedTaxNo && company.taxNo !== normalizedTaxNo) ||
          company.type !== nextType
            ? await this.prisma.company.update({
                where: { id: company.id },
                data: {
                  taxNo:
                    normalizedTaxNo && company.taxNo !== normalizedTaxNo
                      ? normalizedTaxNo
                      : undefined,
                  type: nextType,
                  source: "BELGE_UPLOAD",
                },
              })
            : company;
        await this.learnCompanyAlias(
          mainCompanySlug,
          company.id,
          counterparty,
          taxNo,
        );
        return { company: resolvedCompany, status: "ESLESTI", candidates };
      }
    }
    if (candidates.length && candidates[0].score >= 0.75 && !taxNo) {
      return { company: null, status: "YAKIN_FIRMA_BULUNDU", candidates };
    }
    const normalizedName = this.normalizeFirmName(name);
    const type =
      classification.targetType === "TEDARIKCI_GELEN_FATURA"
        ? "SATICI"
        : "MUSTERI";
    const mergeCompanyType = (current: unknown) => {
      const existing = normalizeText(current).toLocaleUpperCase("tr-TR");
      if (!existing || existing === type) return type;
      if (
        ["SATICI", "SUPPLIER"].includes(existing) &&
        ["MUSTERI", "CUSTOMER"].includes(type)
      )
        return "BOTH";
      if (
        ["MUSTERI", "CUSTOMER"].includes(existing) &&
        ["SATICI", "SUPPLIER"].includes(type)
      )
        return "BOTH";
      return existing;
    };
    const existingForUpsert = await this.prisma.company.findUnique({
      where: {
        mainCompanySlug_normalizedName: {
          mainCompanySlug,
          normalizedName,
        },
      },
      select: { type: true },
    });
    const company = await this.prisma.company.upsert({
      where: {
        mainCompanySlug_normalizedName: {
          mainCompanySlug,
          normalizedName,
        },
      },
      update: {
        isActive: true,
        deletedAt: null,
        taxNo: taxNo || undefined,
        type: mergeCompanyType(existingForUpsert?.type),
        source: "BELGE_UPLOAD",
      },
      create: {
        mainCompanySlug,
        name,
        normalizedName,
        type,
        taxNo: taxNo || null,
        isActive: true,
        source: "BELGE_UPLOAD",
        raw: {
          resmiUnvan: counterparty,
          kisaAd: name,
          source: "BELGE_UPLOAD",
        },
      },
    });
    await this.learnCompanyAlias(
      mainCompanySlug,
      company.id,
      counterparty,
      taxNo,
    );
    return { company, status: "YENI_FIRMA_ACILDI", candidates };
  }

  private async learnCompanyAlias(
    mainCompanySlug: string,
    companyId: string,
    rawName: unknown,
    taxNo?: unknown,
  ) {
    const aliasName = normalizeText(rawName);
    const normalizedName = this.normalizeFirmName(aliasName);
    if (!aliasName || !normalizedName) return null;
    const existing = await this.prisma.companyAlias.findFirst({
      where: { mainCompanySlug, normalizedName },
    });
    if (existing) return existing;
    return this.prisma.companyAlias.create({
      data: {
        mainCompanySlug,
        companyId,
        rawName: aliasName,
        normalizedName,
        taxNo: normalizeText(taxNo) || null,
        source: "BELGE_UPLOAD",
        isActive: true,
      },
    });
  }

  private async createLinkedMovement(
    tx: any,
    args: {
      mainCompanySlug: string;
      companyId: string;
      date: Date;
      movementType: string;
      sourceType: string;
      documentNo?: string | null;
      documentId?: string | null;
      description?: string | null;
      effect: number;
      legacyId?: string | null;
      raw?: any;
    },
  ) {
    const company = await tx.company.findFirst({
      where: { id: args.companyId, mainCompanySlug: args.mainCompanySlug },
    });
    if (!company) throw new NotFoundException("Firma bulunamadi.");
    const balanceAfter = decimalToNumber(company.currentBalance) + args.effect;
    const movement = await tx.currentAccountMovement.create({
      data: {
        mainCompanySlug: args.mainCompanySlug,
        companyId: args.companyId,
        movementDate: args.date,
        movementType: args.movementType,
        sourceType: args.sourceType,
        documentNo: args.documentNo || null,
        documentId: args.documentId || null,
        description: args.description || null,
        debit: safeDecimal(args.effect > 0 ? args.effect : 0),
        credit: safeDecimal(args.effect < 0 ? Math.abs(args.effect) : 0),
        amount: safeDecimal(Math.abs(args.effect)),
        effect: safeDecimal(args.effect),
        balanceAfter: safeDecimal(balanceAfter),
        legacyId: args.legacyId || null,
        raw: args.raw ?? undefined,
      },
    });
    await tx.company.update({
      where: { id: args.companyId },
      data: { currentBalance: safeDecimal(balanceAfter) },
    });
    return movement;
  }

  private async reverseLinkedMovement(
    tx: any,
    mainCompanySlug: string,
    movementId?: string | null,
  ) {
    if (!movementId) return null;
    const old = await tx.currentAccountMovement.findFirst({
      where: { id: movementId, mainCompanySlug },
    });
    if (!old) return null;
    const company = await tx.company.findFirst({
      where: { id: old.companyId, mainCompanySlug },
    });
    if (company) {
      const balanceAfter =
        decimalToNumber(company.currentBalance) - decimalToNumber(old.effect);
      await tx.company.update({
        where: { id: old.companyId },
        data: { currentBalance: safeDecimal(balanceAfter) },
      });
    }
    await tx.currentAccountMovement.delete({ where: { id: old.id } });
    return old;
  }

  private paymentEffect(payload: Query) {
    const amount = Number(payload.amount ?? payload.tutar ?? 0);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException("Tutar gecersiz.");
    const direction = normalizeText(
      payload.direction || payload.yon || "OUT",
    ).toUpperCase();
    return direction === "IN" ||
      direction === "TAHSILAT" ||
      direction === "ALINDI"
      ? amount
      : -amount;
  }

  private mapPayment(row: any) {
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      companyId: row.companyId,
      paymentDate: row.paymentDate,
      paymentType: row.paymentType,
      direction: row.direction,
      amount: decimalToNumber(row.amount),
      currency: row.currency,
      bankName: row.bankName || "",
      accountName: row.accountName || "",
      description: row.description || "",
      documentNo: row.documentNo || "",
      sourceType: row.sourceType,
      currentAccountMovementId: row.currentAccountMovementId || "",
      legacyId: row.legacyId || "",
      raw: row.raw || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      firma: row.company?.name || row.raw?.firma || "",
      tarih: row.paymentDate?.toISOString?.().slice(0, 10) || row.paymentDate,
      odemeTuru: row.paymentType,
      tutar: decimalToNumber(row.amount),
      aciklama: row.description || "",
      resmiDurum: row.raw?.resmiDurum || "RESMI",
      cariOnce: row.raw?.cariOnce || 0,
      cariSonra: row.raw?.cariSonra || row.movement?.balanceAfter || 0,
      kalanTutar: row.raw?.kalanTutar || 0,
      odemeSozuTarihi: row.raw?.odemeSozuTarihi || "",
      hatirlatmaTarihi: row.raw?.hatirlatmaTarihi || "",
      relatedCardId: row.raw?.relatedCardId || "",
      relatedCheckId: row.raw?.relatedCheckId || "",
      relatedCardName: row.raw?.relatedCardName || "",
      relatedCheckNo: row.raw?.relatedCheckNo || "",
    };
  }

  private mapCheck(row: any) {
    const effectiveDueDate =
      row.raw?.vadeTarihi || row.raw?.dueDate || row.raw?.vade || row.dueDate;
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      companyId: row.companyId || "",
      checkNo: row.checkNo,
      bankName: row.bankName || "",
      branchName: row.branchName || "",
      dueDate: effectiveDueDate,
      amount: decimalToNumber(row.amount),
      status: row.status,
      direction: row.direction,
      description: row.description || "",
      reminderDate: row.reminderDate,
      currentAccountMovementId: row.currentAccountMovementId || "",
      legacyId: row.legacyId || "",
      raw: row.raw || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      firma: row.company?.name || row.raw?.firma || "",
      cekNo: row.checkNo,
      banka: row.bankName || "",
      sube: row.branchName || "",
      vadeTarihi:
        effectiveDueDate?.toISOString?.().slice(0, 10) || effectiveDueDate,
      tutar: decimalToNumber(row.amount),
      durum: row.raw?.durum || row.status,
      yon: row.raw?.yon || row.direction,
      aciklama: row.description || "",
      hatirlatmaTarihi: row.reminderDate?.toISOString?.().slice(0, 10) || "",
      kesideTarihi: row.raw?.kesideTarihi || "",
      hesapNo: row.raw?.hesapNo || "",
      karsilikDurumu: row.raw?.karsilikDurumu || "",
      karsilikTutar: row.raw?.karsilikTutar || 0,
      odemeBaglantisi: row.raw?.odemeBaglantisi || "",
      relatedPaymentId: row.raw?.relatedPaymentId || "",
      applyCari:
        row.raw?.applyCari ??
        row.raw?.cariyeIsle ??
        !!row.currentAccountMovementId,
      firmaBakiyesi: decimalToNumber(row.company?.currentBalance),
      cariEtkisi:
        row.raw?.cariEtkisi ||
        (row.direction === "OUT" ? "BORC" : "ALACAK") ||
        "",
    };
  }

  private mapCreditCard(row: any) {
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      bankName: row.bankName || "",
      cardName: row.cardName,
      lastFourDigits: row.lastFourDigits || "",
      period: row.period || "",
      totalDebt: decimalToNumber(row.totalDebt),
      minimumPayment: decimalToNumber(row.minimumPayment),
      dueDate: row.dueDate,
      isActive: row.isActive,
      note: row.note || "",
      raw: row.raw || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      firma: row.raw?.firma || "",
      banka: row.bankName || "",
      kartAdi: row.cardName,
      kartSahibi: row.raw?.kartSahibi || "",
      son4Hane: row.lastFourDigits || "",
      hesapNo: row.raw?.hesapNo || "",
      aciklama: row.raw?.aciklama || "",
      not: row.note || "",
      sonOdemeTarihi: row.dueDate?.toISOString?.().slice(0, 10) || "",
      toplamBorc: decimalToNumber(row.totalDebt),
      asgariOdeme: decimalToNumber(row.minimumPayment),
      kullanimAmaci: row.raw?.kullanimAmaci || "",
      donem: row.period || "",
      aktif: row.isActive,
      limitAmount: decimalToNumber(
        row.raw?.limitAmount || row.raw?.limit || row.raw?.limitTutari,
      ),
      statementDay: Number(
        row.raw?.statementDay || row.raw?.hesapKesimGunu || 0,
      ),
      dueDay: Number(row.raw?.dueDay || row.raw?.sonOdemeGunu || 0),
    };
  }

  private mapCreditCardMovement(row: any) {
    return {
      id: row.id,
      mainCompanySlug: row.mainCompanySlug,
      creditCardId: row.creditCardId,
      cardName: row.card?.cardName || row.raw?.cardName || "",
      bankName: row.card?.bankName || row.raw?.bankName || "",
      lastFourDigits: row.card?.lastFourDigits || row.raw?.lastFourDigits || "",
      companyId: row.companyId || "",
      firmId: row.companyId || "",
      firmName: row.company?.name || row.raw?.firmName || "",
      cariMovementId: row.currentAccountMovementId || "",
      movementType: row.raw?.movementType || "PAYMENT_TO_FIRM",
      amount: decimalToNumber(row.amount),
      date: row.movementDate,
      installmentCount: Number(row.raw?.installmentCount || 0),
      description: row.description || row.raw?.description || "",
      documentNo: row.raw?.documentNo || "",
      officialType: row.raw?.officialType || row.raw?.resmiGayri || "",
      slipImageUrl: row.raw?.slipImageUrl || "",
      active: row.raw?.active ?? true,
      raw: row.raw || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private normalizeCheckDirection(payload: Query) {
    const raw = normalizeText(
      payload.checkType || payload.cekTuru || payload.direction || payload.yon,
    ).toLocaleUpperCase("tr-TR");
    if (
      raw.includes("MUSTERI") ||
      raw.includes("MÜŞTERI") ||
      raw.includes("ALINAN") ||
      raw === "IN"
    ) {
      return "IN";
    }
    if (
      raw.includes("TEDARIK") ||
      raw.includes("TEDARİK") ||
      raw.includes("VERILEN") ||
      raw.includes("VERİLEN") ||
      raw === "OUT"
    ) {
      return "OUT";
    }
    return "IN";
  }

  private checkEffect(direction: string, amount: number) {
    return direction === "OUT" ? amount : -amount;
  }

  private isCheckReverseStatus(value: unknown) {
    const status = normalizeText(value).toLocaleUpperCase("tr-TR");
    return ["IADE", "KARSILIKSIZ", "IPTAL", "İPTAL"].includes(status);
  }

  private normalizeCardLastFour(payload: Query) {
    const raw = String(
      payload.lastFourDigits ||
        payload.lastFour ||
        payload.son4Hane ||
        payload.cardNumber ||
        payload.kartNo ||
        "",
    ).replace(/\D/g, "");
    return raw ? raw.slice(-4) : "";
  }

  private buildCreditCardRaw(existingRaw: unknown, payload: Query) {
    const current = this.asObject(existingRaw);
    const merged = {
      ...current,
      limitAmount:
        Number(
          payload.limitAmount ??
            payload.limit ??
            payload.limitTutari ??
            current.limitAmount,
        ) || 0,
      statementDay:
        Number(
          payload.statementDay ??
            payload.hesapKesimGunu ??
            current.statementDay,
        ) || null,
      dueDay:
        Number(payload.dueDay ?? payload.sonOdemeGunu ?? current.dueDay) ||
        null,
      cardHolder:
        normalizeText(payload.cardHolder || payload.kartSahibi) ||
        current.cardHolder ||
        null,
      active: payload.isActive ?? payload.aktif ?? current.active ?? true,
      lastFourDigits:
        this.normalizeCardLastFour(payload) || current.lastFourDigits || "",
    };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined),
    );
  }

  async listProducts(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const where: Prisma.ProductWhereInput = { mainCompanySlug };
    if (q) {
      const normalized = normalizeSearchText(q);
      where.OR = [
        { name: { contains: q } },
        { normalizedName: { contains: normalized } },
        {
          aliases: {
            some: {
              normalizedName: { contains: normalized },
            },
          },
        },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(
      rows.map((row) => this.mapProduct(row)),
      page,
      limit,
      total,
    );
  }

  async getProduct(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.product.findFirst({
      where: { id, mainCompanySlug: slug },
      include: { aliases: { orderBy: { rawName: "asc" } } },
    });
    if (!row) throw new NotFoundException("Urun bulunamadi.");
    return dbSuccess(this.mapProduct(row));
  }

  async saveProduct(mainCompanySlug: string, payload: Query, id?: string) {
    const slug = await this.scope(mainCompanySlug);
    const name = normalizeText(payload.name || payload.urunAdi);
    if (!name) throw new BadRequestException("Urun adi zorunludur.");
    const existing = id
      ? await this.prisma.product.findFirst({
          where: { id, mainCompanySlug: slug },
        })
      : null;
    const data = {
      name,
      normalizedName: normalizeSearchText(payload.normalizedName || name),
      unit: normalizeText(payload.unit || payload.birim) || null,
      defaultVatRate: safeDecimal(
        payload.defaultVatRate ?? payload.kdvOrani ?? 0,
      ),
      isActive: payload.isActive ?? payload.aktif ?? true,
      raw: this.buildProductRaw(payload.raw ?? existing?.raw, payload),
    };
    const saved = id
      ? await this.prisma.product.update({ where: { id }, data })
      : await this.prisma.product.create({
          data: {
            ...data,
            mainCompanySlug: slug,
            legacyId: normalizeText(payload.legacyId) || null,
          },
        });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "product",
      entityId: saved.id,
      actionType: id ? "UPDATED" : "CREATED",
      newValue: this.mapProduct(saved),
    });
    return dbSuccess(this.mapProduct(saved));
  }

  async saveProductAlias(
    mainCompanySlug: string,
    productId: string,
    payload: Query,
    aliasId?: string,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, mainCompanySlug: slug },
    });
    if (!product) throw new NotFoundException("Urun bulunamadi.");
    const rawName = normalizeText(
      payload.rawName || payload.name || payload.alias || payload.urunAdi,
    );
    if (!rawName) throw new BadRequestException("Alias adi zorunludur.");
    const existing = aliasId
      ? await this.prisma.productAlias.findFirst({
          where: { id: aliasId, mainCompanySlug: slug, productId },
        })
      : null;
    const data = {
      rawName,
      normalizedName: normalizeSearchText(payload.normalizedName || rawName),
      packageInfo:
        normalizeText(
          payload.packageInfo || payload.packaging || payload.ambalaj,
        ) || null,
      isActive: payload.isActive ?? payload.aktif ?? true,
      raw: this.buildAliasRaw(payload.raw ?? existing?.raw, payload),
    };
    const saved = aliasId
      ? await this.prisma.productAlias.update({ where: { id: aliasId }, data })
      : await this.prisma.productAlias.create({
          data: { ...data, mainCompanySlug: slug, productId },
        });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "product_alias",
      entityId: saved.id,
      actionType: aliasId ? "UPDATED" : "CREATED",
      newValue: this.mapProduct(saved),
    });
    return dbSuccess({
      id: saved.id,
      productId: saved.productId,
      rawName: saved.rawName,
      normalizedName: saved.normalizedName,
      packageInfo: saved.packageInfo || "",
      supplierFirmId: this.aliasMeta(saved).supplierFirmId,
      isActive: saved.isActive,
      raw: saved.raw || null,
    });
  }

  async listInventoryProducts(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const groupType = normalizeText(query.groupType || query.kategori);
    const paintType = normalizeText(query.paintType || query.boyaTipi);
    const supplierFirmId = normalizeText(
      query.supplierFirmId || query.varsayilanTedarikciId,
    );
    const activeFilter =
      query.isActive === undefined && query.aktif === undefined
        ? null
        : String(query.isActive ?? query.aktif).toLocaleLowerCase("tr-TR") !==
          "false";
    const where: Prisma.ProductWhereInput = { mainCompanySlug };
    if (q) {
      const normalized = normalizeSearchText(q);
      where.OR = [
        { name: { contains: q } },
        { normalizedName: { contains: normalized } },
        {
          aliases: {
            some: {
              normalizedName: { contains: normalized },
            },
          },
        },
      ];
    }
    const rows = await this.prisma.product.findMany({
      where,
      include: { aliases: { orderBy: { rawName: "asc" } } },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 1000,
    });
    const filtered = rows.filter((row) => {
      const meta = this.productMeta(row);
      if (activeFilter != null && row.isActive !== activeFilter) return false;
      if (
        groupType &&
        normalizeSearchText(meta.groupType) !== normalizeSearchText(groupType)
      ) {
        return false;
      }
      if (
        paintType &&
        normalizeSearchText(meta.paintType) !== normalizeSearchText(paintType)
      ) {
        return false;
      }
      if (supplierFirmId) {
        const hasAlias = (row.aliases || []).some(
          (alias: any) =>
            this.aliasMeta(alias).supplierFirmId === supplierFirmId,
        );
        if (meta.defaultSupplierId !== supplierFirmId && !hasAlias)
          return false;
      }
      return true;
    });
    const total = filtered.length;
    const start = (page - 1) * limit;
    return makePaginatedResponse(
      filtered.slice(start, start + limit).map((row) => this.mapProduct(row)),
      page,
      limit,
      total,
    );
  }

  async passiveProduct(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const existing = await this.prisma.product.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!existing) throw new NotFoundException("Urun bulunamadi.");
    const saved = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "product",
      entityId: saved.id,
      actionType: "UPDATED",
      oldValue: this.mapProduct(existing),
      newValue: this.mapProduct(saved),
    });
    return dbSuccess(this.mapProduct(saved));
  }

  private supplierAccountingRule(company: any) {
    const raw = this.asObject(company?.raw);
    const profile = normalizeText(
      raw.companyTransactionProfile || raw.calismaProfili,
    ).toUpperCase();
    const expenseMode = normalizeText(
      raw.expenseCalculationMode || raw.giderHesaplamaTipi,
    ).toUpperCase();
    const configuredMode = normalizeText(
      raw.currentAccountPostingMode || raw.cariKayitModu,
    ).toUpperCase();
    const vatOnly =
      profile === "VAT_ONLY_EXPENSE" ||
      expenseMode === "VAT_ONLY" ||
      normalizeText(raw.defaultSupplierPostingType).toUpperCase() ===
        "VAT_ONLY_EXPENSE";
    const trackFullCari =
      raw.trackReceivablePayable !== false &&
      raw.cariTakipEdilsin !== false &&
      !vatOnly;
    const currentAccountPostingMode =
      configuredMode === "VAT_PERCENTAGE" || vatOnly
        ? "VAT_PERCENTAGE"
        : configuredMode === "NONE" || !trackFullCari
          ? "NONE"
          : "FULL_DOCUMENT";
    const percentage = Number(
      raw.vatPayablePercentage ?? raw.kdvCariBorcYuzdesi ?? 0,
    );
    return {
      currentAccountPostingMode,
      vatPayablePercentage: Number.isFinite(percentage)
        ? Math.min(100, Math.max(0, percentage))
        : 0,
      vatOnly,
    };
  }

  async listProductAliases(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const productId = normalizeText(query.productId);
    const supplierFirmId = normalizeText(
      query.supplierFirmId || query.firmaId || query.tedarikciFirmaId,
    );
    const activeFilter =
      query.isActive === undefined && query.aktif === undefined
        ? null
        : String(query.isActive ?? query.aktif).toLocaleLowerCase("tr-TR") !==
          "false";
    const where: Prisma.ProductAliasWhereInput = { mainCompanySlug };
    if (productId) where.productId = productId;
    if (q) {
      const normalized = normalizeSearchText(q);
      where.OR = [
        { rawName: { contains: q } },
        { normalizedName: { contains: normalized } },
      ];
    }
    if (activeFilter != null) where.isActive = activeFilter;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productAlias.count({ where }),
      this.prisma.productAlias.findMany({
        where,
        include: { product: true },
        orderBy: [{ updatedAt: "desc" }, { rawName: "asc" }],
        skip,
        take: limit,
      }),
    ]);
    const filtered = rows.filter((row) => {
      if (!supplierFirmId) return true;
      return this.aliasMeta(row).supplierFirmId === supplierFirmId;
    });
    return makePaginatedResponse(
      filtered.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.product?.name || "",
        rawName: row.rawName,
        normalizedName: row.normalizedName,
        packageInfo: row.packageInfo || "",
        supplierFirmId: this.aliasMeta(row).supplierFirmId,
        isActive: row.isActive,
        raw: row.raw || null,
      })),
      page,
      limit,
      supplierFirmId ? filtered.length : total,
    );
  }

  async listProductMatchQueue(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit } = parsePageLimit(query);
    const q = normalizeText(query.q || query.search);
    const statusFilter = normalizeText(query.status || "OPEN").toUpperCase();
    const documentNo = normalizeText(query.documentNo || query.belgeNo);
    const companyId = normalizeText(query.companyId || query.firmaId);
    const supplierDocumentAliases = this.documentTypeAliases(
      "tedarikci_gelen_fatura",
    );
    const supplierDocuments = await this.prisma.document.findMany({
      where: {
        mainCompanySlug,
        ...(companyId ? { companyId } : {}),
        ...(documentNo
          ? { documentNo: { contains: documentNo } }
          : {}),
        OR: [
          { documentType: { in: supplierDocumentAliases } },
          ...supplierDocumentAliases.map((alias) => ({
            raw: { path: "$.documentType", equals: alias },
          })),
          ...supplierDocumentAliases.map((alias) => ({
            metadata: { path: "$.documentType", equals: alias },
          })),
          ...supplierDocumentAliases.map((alias) => ({
            raw: {
              path: "$.documentKind",
              equals: this.canonicalDocumentKind(alias),
            },
          })),
          ...supplierDocumentAliases.map((alias) => ({
            metadata: {
              path: "$.documentKind",
              equals: this.canonicalDocumentKind(alias),
            },
          })),
        ],
      },
      select: { id: true },
      take: 10000,
    });
    const supplierDocumentIds = supplierDocuments.map((doc) => doc.id);
    if (!supplierDocumentIds.length) {
      return makePaginatedResponse([], page, limit, 0);
    }
    const where: Prisma.InvoiceItemWhereInput = { mainCompanySlug };
    where.documentId = { in: supplierDocumentIds };
    if (q) {
      where.OR = [
        { productName: { contains: q } },
        { description: { contains: q } },
        {
          normalizedProductName: {
            contains: normalizeSearchText(q),
          },
        },
      ];
    }
    const rows = await this.prisma.invoiceItem.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    const documentIds = [...new Set(rows.map((row) => row.documentId))];
    const productIds = [
      ...new Set(
        rows
          .flatMap((row) => {
            const meta = this.invoiceItemMeta(row);
            return [row.productId, meta.suggestedProductId].filter(Boolean);
          })
          .filter(Boolean),
      ),
    ] as string[];
    const [documents, products] = await Promise.all([
      documentIds.length
        ? this.prisma.document.findMany({
            where: { mainCompanySlug, id: { in: documentIds } },
            include: { company: true },
          })
        : [],
      productIds.length
        ? this.prisma.product.findMany({
            where: { mainCompanySlug, id: { in: productIds } },
          })
        : [],
    ]);
    const documentMap = new Map<string, any>(
      documents.map((doc: any) => [doc.id, doc] as [string, any]),
    );
    const productMap = new Map<string, any>(
      products.map((product: any) => [product.id, product] as [string, any]),
    );
    const mapped = rows
      .map((row) => {
        const item = this.mapInvoiceItem(row);
        const doc: any = documentMap.get(row.documentId);
        const product = row.productId ? productMap.get(row.productId) : null;
        const suggested = item.suggestedProductId
          ? productMap.get(item.suggestedProductId)
          : null;
        const status =
          item.matchStatus || (row.productId ? "MATCHED" : "PENDING");
        return {
          ...item,
          matchStatus: status,
          matchedProductName: product?.name || item.matchedProductName || "",
          suggestedProductName:
            suggested?.name || item.suggestedProductName || "",
          documentNo: doc?.documentNo || "",
          documentDate: doc?.date?.toISOString?.().slice(0, 10) || "",
          documentType: doc?.documentType || "",
          companyId: doc?.companyId || "",
          companyName: doc?.company?.name || "",
          supplierFirmId: doc?.companyId || "",
        };
      })
      .filter((row) => {
        const status = normalizeText(row.matchStatus).toUpperCase();
        if (statusFilter === "ALL" || statusFilter === "TUMU") return true;
        if (statusFilter === "MATCHED") {
          return ["MATCHED", "MANUAL_MATCHED", "ESLESTI"].includes(status);
        }
        if (statusFilter === "OPEN") {
          return !["MATCHED", "MANUAL_MATCHED", "IGNORED", "ESLESTI"].includes(
            status,
          );
        }
        return status === statusFilter;
      });
    const start = (page - 1) * limit;
    return makePaginatedResponse(
      mapped.slice(start, start + limit),
      page,
      limit,
      mapped.length,
    );
  }

  async createProductFromDocumentLine(
    mainCompanySlug: string,
    lineId: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Belge kalemi bulunamadi.");
    const document = await this.prisma.document.findFirst({
      where: { id: line.documentId, mainCompanySlug: slug },
    });
    const meta = this.invoiceItemMeta(line);
    const rawProductName =
      normalizeText(
        payload.rawProductName ||
          meta.rawProductName ||
          line.productName ||
          line.description,
      ) || "";
    const productName = normalizeText(
      payload.name || payload.urunAdi || rawProductName,
    );
    if (!productName) throw new BadRequestException("Urun adi zorunludur.");
    const normalizedName = normalizeSearchText(productName);
    let product = await this.prisma.product.findFirst({
      where: { mainCompanySlug: slug, normalizedName },
    });
    if (!product) {
      product = await this.prisma.product.create({
        data: {
          mainCompanySlug: slug,
          name: productName,
          normalizedName,
          unit:
            normalizeText(payload.unit || payload.birim || line.unit) || null,
          defaultVatRate: safeDecimal(
            payload.defaultVatRate ?? payload.kdvOrani ?? line.vatRate ?? 0,
          ),
          raw: this.buildProductRaw(
            {},
            {
              ...payload,
              groupType:
                payload.groupType ||
                payload.kategori ||
                this.suggestInventoryGroup(productName),
              defaultSupplierId:
                payload.defaultSupplierId ||
                payload.supplierFirmId ||
                document?.companyId ||
                "",
            },
          ),
        },
      });
      await createActivityLog(this.prisma, {
        mainCompanySlug: slug,
        entityType: "product",
        entityId: product.id,
        actionType: "CREATED_FROM_INVOICE_LINE",
        newValue: this.mapProduct(product),
      });
    }
    return this.bindDocumentLineToProduct(slug, line.id, {
      ...payload,
      productId: product.id,
      rawProductName,
      supplierFirmId: payload.supplierFirmId || document?.companyId || "",
      createAlias: true,
    });
  }

  async processPendingProductLines(
    mainCompanySlug: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const mode = normalizeText(payload.mode || "CREATE_MISSING").toUpperCase();
    const limit = Math.min(
      1000,
      Math.max(1, Number(payload.limit || 1000) || 1000),
    );
    const queue = (await this.listProductMatchQueue({
      mainCompanySlug: slug,
      status: mode === "REMATCH_ONLY" ? "ALL" : "OPEN",
      limit,
    })) as any;
    const lines = Array.isArray(queue?.data) ? queue.data : [];
    let matchedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    const touchedDocuments = new Set<string>();
    for (const line of lines) {
      if (!line?.id) continue;
      if (line.suggestedProductId && mode !== "CREATE_ONLY") {
        await this.bindDocumentLineToProduct(slug, line.id, {
          productId: line.suggestedProductId,
          rawProductName: line.rawProductName,
          supplierFirmId: line.supplierFirmId,
          createAlias: true,
        });
        matchedCount += 1;
        touchedDocuments.add(line.documentId);
        continue;
      }
      if (mode !== "REMATCH_ONLY") {
        await this.createProductFromDocumentLine(slug, line.id, {
          name: line.rawProductName,
          rawProductName: line.rawProductName,
          unit: line.unit,
          defaultVatRate: line.vatRate,
          supplierFirmId: line.supplierFirmId,
        });
        createdCount += 1;
        touchedDocuments.add(line.documentId);
        continue;
      }
      skippedCount += 1;
    }
    for (const documentId of touchedDocuments) {
      if (documentId) await this.syncDocumentStockMovements(slug, documentId);
    }
    return dbSuccess({
      matchedCount,
      createdCount,
      skippedCount,
      processedCount: matchedCount + createdCount,
      documentCount: touchedDocuments.size,
    });
  }

  private suggestInventoryGroup(value: string) {
    const text = normalizeSearchText(value);
    if (/yemek|yoğurt|yogurt|gida|gıda|seker|şeker|cay|çay|sut|süt/.test(text))
      return "GIDA";
    if (/boya|zd?hc|retarder|gel|white|clear|black|blue/.test(text))
      return "KIMYASAL";
    if (/elektrik|internet|tarife|paket|hizmet|bedel/.test(text))
      return "HIZMET";
    return "GENEL";
  }

  private async matchInvoiceLineProduct(
    mainCompanySlug: string,
    line: any,
    supplierFirmId?: string,
  ) {
    const lineMeta = this.invoiceItemMeta(line);
    const normalized = this.normalizeInventoryName(
      lineMeta.rawProductName || line.productName || line.description,
    );
    if (!normalized.normalized) {
      return {
        productId: null,
        matchStatus: "MISSING",
        normalizedProductName: null,
        suggestedProductId: "",
        suggestedProductName: "",
        matchedProductName: "",
      };
    }
    const products = await this.prisma.product.findMany({
      where: { mainCompanySlug, isActive: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });
    const aliases = await this.prisma.productAlias.findMany({
      where: { mainCompanySlug, isActive: true },
      include: { product: true },
      take: 1000,
    });
    const productExact = products.find((row) => {
      const key = this.normalizeInventoryName(row.name);
      return (
        row.normalizedName === normalized.normalized ||
        key.compact === normalized.compact
      );
    });
    if (productExact) {
      return {
        productId: productExact.id,
        matchStatus: "MATCHED",
        normalizedProductName: normalized.normalized,
        suggestedProductId: "",
        suggestedProductName: "",
        matchedProductName: productExact.name,
      };
    }
    const aliasMatches = aliases.filter((alias) => {
      const key = this.normalizeInventoryName(alias.rawName);
      return (
        alias.normalizedName === normalized.normalized ||
        key.compact === normalized.compact
      );
    });
    const aliasExact =
      aliasMatches.find(
        (alias) =>
          supplierFirmId &&
          this.aliasMeta(alias).supplierFirmId === supplierFirmId,
      ) || aliasMatches[0];
    if (aliasExact) {
      return {
        productId: aliasExact.productId,
        matchStatus: "MATCHED",
        normalizedProductName: normalized.normalized,
        suggestedProductId: "",
        suggestedProductName: "",
        matchedProductName: aliasExact.product?.name || "",
      };
    }
    const suggested = products
      .map((row) => ({
        row,
        score: this.similarityScore(
          normalized.normalized,
          this.normalizeInventoryName(row.name).normalized,
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (suggested && suggested.score >= 78) {
      return {
        productId: null,
        matchStatus: "SUGGESTED",
        normalizedProductName: normalized.normalized,
        suggestedProductId: suggested.row.id,
        suggestedProductName: suggested.row.name,
        matchedProductName: "",
      };
    }
    return {
      productId: null,
      matchStatus: "NEW_DRAFT",
      normalizedProductName: normalized.normalized,
      suggestedProductId: "",
      suggestedProductName: "",
      matchedProductName: "",
    };
  }

  async listDocumentProductLines(mainCompanySlug: string, documentId: string) {
    const slug = await this.scope(mainCompanySlug);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, mainCompanySlug: slug },
      include: { company: true },
    });
    if (!document) throw new NotFoundException("Belge bulunamadi.");
    const rows = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
    });
    const productIds = [
      ...new Set(rows.map((row) => row.productId).filter(Boolean)),
    ] as string[];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { mainCompanySlug: slug, id: { in: productIds } },
        })
      : [];
    const productMap = new Map(products.map((row) => [row.id, row]));
    const lines = rows.map((row) => {
      const item = this.mapInvoiceItem(row);
      const product = row.productId ? productMap.get(row.productId) : null;
      const meta = product ? this.productMeta(product) : null;
      return {
        ...item,
        matchedProductName:
          product?.name || item.matchedProductName || item.productName || "",
        shortCode: meta?.shortCode || "",
        groupType: meta?.groupType || "",
        paintType: meta?.paintType || "",
      };
    });
    return dbSuccess({
      documentId: document.id,
      documentNo: document.documentNo || "",
      documentType: document.documentType || "",
      status: document.status || "",
      companyId: document.companyId || "",
      companyName: document.company?.name || "",
      lines,
    });
  }

  async bindDocumentLineToProduct(
    mainCompanySlug: string,
    lineId: string,
    payload: Query,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Belge kalemi bulunamadi.");
    const ignore = Boolean(payload.ignore || payload.yokSay);
    const productId = normalizeText(payload.productId || payload.urunId);
    let product: any = null;
    if (!ignore) {
      if (!productId) throw new BadRequestException("productId zorunludur.");
      product = await this.prisma.product.findFirst({
        where: { id: productId, mainCompanySlug: slug },
      });
      if (!product) throw new NotFoundException("Urun bulunamadi.");
    }
    const currentRaw = this.asObject(line.raw);
    const rawProductName =
      normalizeText(
        payload.rawProductName ||
          currentRaw.rawProductName ||
          currentRaw.rawName ||
          line.productName ||
          line.description,
      ) || "";
    const nextStatus = ignore
      ? "IGNORED"
      : normalizeText(payload.matchStatus) || "MANUAL_MATCHED";
    const saved = await this.prisma.invoiceItem.update({
      where: { id: line.id },
      data: {
        productId: ignore ? null : product.id,
        normalizedProductName: ignore
          ? line.normalizedProductName
          : normalizeSearchText(rawProductName || product.name),
        raw: {
          ...currentRaw,
          rawProductName,
          matchedProductName: ignore ? "" : product.name,
          matchStatus: nextStatus,
          productMatchStatus: nextStatus,
          suggestedProductId: "",
          suggestedProductName: "",
        },
      },
    });
    const shouldCreateAlias =
      !ignore && Boolean(payload.createAlias ?? payload.aliasOlustur ?? true);
    if (shouldCreateAlias && rawProductName) {
      const normalizedAlias = normalizeSearchText(rawProductName);
      const existingAlias = await this.prisma.productAlias.findFirst({
        where: { mainCompanySlug: slug, normalizedName: normalizedAlias },
      });
      if (existingAlias) {
        await this.prisma.productAlias.update({
          where: { id: existingAlias.id },
          data: {
            productId: product.id,
            packageInfo:
              normalizeText(payload.packageInfo || payload.packaging) ||
              existingAlias.packageInfo,
            raw: this.buildAliasRaw(existingAlias.raw, payload),
          },
        });
      } else {
        await this.prisma.productAlias.create({
          data: {
            mainCompanySlug: slug,
            productId: product.id,
            rawName: rawProductName,
            normalizedName: normalizedAlias,
            packageInfo:
              normalizeText(payload.packageInfo || payload.packaging) || null,
            raw: this.buildAliasRaw({}, payload),
          },
        });
      }
    }
    const stockSummary = await this.syncDocumentStockMovements(
      slug,
      line.documentId,
    );
    const detail = await this.listDocumentProductLines(slug, line.documentId);
    return dbSuccess({
      line:
        (detail as any).data?.lines?.find(
          (item: any) => item.id === saved.id,
        ) || this.mapInvoiceItem(saved),
      stockSummary,
    });
  }

  async autoMatchDocumentLines(
    mainCompanySlug: string,
    documentId: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, mainCompanySlug: slug },
      include: { company: true },
    });
    if (!document) throw new NotFoundException("Belge bulunamadi.");
    const lines = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
    });
    const supplierFirmId = normalizeText(
      payload.supplierFirmId || document.companyId,
    );
    let matchedCount = 0;
    let pendingCount = 0;
    let ignoredCount = 0;
    for (const line of lines) {
      const match = await this.matchInvoiceLineProduct(
        slug,
        line,
        supplierFirmId,
      );
      const currentRaw = this.asObject(line.raw);
      const nextStatus =
        match.matchStatus || (match.productId ? "MATCHED" : "PENDING");
      if (nextStatus === "IGNORED") ignoredCount += 1;
      else if (match.productId) matchedCount += 1;
      else pendingCount += 1;
      await this.prisma.invoiceItem.update({
        where: { id: line.id },
        data: {
          productId: match.productId,
          normalizedProductName:
            match.normalizedProductName || line.normalizedProductName,
          raw: {
            ...currentRaw,
            rawProductName:
              this.invoiceItemMeta(line).rawProductName ||
              line.productName ||
              line.description ||
              "",
            matchedProductName: match.matchedProductName || "",
            matchStatus: nextStatus,
            productMatchStatus: nextStatus,
            suggestedProductId: match.suggestedProductId || "",
            suggestedProductName: match.suggestedProductName || "",
          },
        },
      });
    }
    const stockSummary = await this.syncDocumentStockMovements(
      slug,
      documentId,
    );
    const detail = await this.listDocumentProductLines(slug, documentId);
    return dbSuccess({
      documentId,
      matchedCount,
      pendingCount,
      ignoredCount,
      stockSummary,
      lines: (detail as any).data?.lines || [],
    });
  }

  async syncDocumentStockMovements(
    mainCompanySlug: string,
    documentId: string,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, mainCompanySlug: slug },
    });
    if (!document) throw new NotFoundException("Belge bulunamadi.");
    const items = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
    });
    await this.prisma.stockMovement.deleteMany({
      where: {
        mainCompanySlug: slug,
        documentId,
        sourceType: "DOCUMENT_APPROVAL",
      },
    });
    if (!this.isIncomingInventoryDocument(document)) {
      return dbSuccess({
        documentId,
        createdCount: 0,
        skippedCount: items.length,
        reason: "not_inventory_incoming_document",
      });
    }
    let createdCount = 0;
    let skippedCount = 0;
    for (const item of items) {
      const meta = this.invoiceItemMeta(item);
      if (!item.productId || meta.matchStatus === "IGNORED") {
        skippedCount += 1;
        continue;
      }
      const quantity = decimalToNumber(item.quantity);
      if (!quantity || quantity <= 0) {
        skippedCount += 1;
        continue;
      }
      await this.prisma.stockMovement.create({
        data: {
          mainCompanySlug: slug,
          productId: item.productId,
          firmId: document.companyId,
          documentId: document.id,
          documentLineId: item.id,
          movementType: "IN",
          sourceType: "DOCUMENT_APPROVAL",
          date: document.date || new Date(),
          quantity: safeDecimal(quantity),
          unit: item.unit || null,
          unitPrice:
            item.unitPrice != null ? safeDecimal(item.unitPrice) : null,
          totalAmount:
            item.lineTotal != null ? safeDecimal(item.lineTotal) : null,
          lotNo: item.lotNo || null,
          note: document.documentNo || null,
          raw: {
            documentType: document.documentType || "",
            rawProductName: meta.rawProductName || item.productName || "",
            matchStatus:
              meta.matchStatus || (item.productId ? "MATCHED" : "PENDING"),
            lineNo: item.lineNo,
          },
        },
      });
      createdCount += 1;
    }
    const currentRaw = this.asObject(document.raw);
    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        raw: {
          ...currentRaw,
          urunEslesmeDurumu: skippedCount ? "BEKLIYOR" : "ESLESTI",
          stockSync: {
            createdCount,
            skippedCount,
            syncedAt: new Date().toISOString(),
          },
        },
      },
    });
    return dbSuccess({ documentId, createdCount, skippedCount });
  }

  async listStockMovements(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const productId = normalizeText(query.productId);
    const firmId = normalizeText(query.firmId || query.companyId);
    const documentId = normalizeText(query.documentId);
    const movementType = normalizeText(query.movementType);
    const sourceType = normalizeText(query.sourceType);
    const where: Prisma.StockMovementWhereInput = { mainCompanySlug };
    if (productId) where.productId = productId;
    if (firmId) where.firmId = firmId;
    if (documentId) where.documentId = documentId;
    if (movementType) where.movementType = movementType;
    if (sourceType) where.sourceType = sourceType;
    const [total, rows, products, firms] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.product.findMany({ where: { mainCompanySlug }, take: 1000 }),
      this.prisma.company.findMany({ where: { mainCompanySlug }, take: 1000 }),
    ]);
    const productMap = new Map(products.map((row) => [row.id, row]));
    const firmMap = new Map(firms.map((row) => [row.id, row]));
    return makePaginatedResponse(
      rows.map((row) => ({
        id: row.id,
        mainCompanySlug: row.mainCompanySlug,
        productId: row.productId,
        productName: productMap.get(row.productId)?.name || "",
        firmId: row.firmId || "",
        firmName: row.firmId ? firmMap.get(row.firmId)?.name || "" : "",
        documentId: row.documentId || "",
        documentLineId: row.documentLineId || "",
        movementType: row.movementType,
        sourceType: row.sourceType,
        date: row.date,
        quantity: decimalToNumber(row.quantity),
        unit: row.unit || "",
        unitPrice: decimalToNumber(row.unitPrice),
        totalAmount: decimalToNumber(row.totalAmount),
        lotNo: row.lotNo || "",
        note: row.note || "",
        active: row.active,
        raw: row.raw || null,
      })),
      page,
      limit,
      total,
    );
  }

  async listProductMonthlyUsage(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit } = parsePageLimit(query);
    const q = normalizeText(query.q || query.search);
    const productId = normalizeText(query.productId || query.urunId);
    const firmId = normalizeText(query.firmId || query.companyId);
    const documentNo = normalizeText(query.documentNo || query.belgeNo);
    const groupType = normalizeText(query.groupType || query.kategori);
    const dateFrom = normalizeText(query.dateFrom || query.baslangicTarihi);
    const dateTo = normalizeText(query.dateTo || query.bitisTarihi);
    const documentWhere: Prisma.DocumentWhereInput = { mainCompanySlug };
    if (firmId) documentWhere.companyId = firmId;
    if (documentNo)
      documentWhere.documentNo = { contains: documentNo };
    if (dateFrom || dateTo) {
      documentWhere.date = {};
      if (dateFrom) {
        documentWhere.date.gte = new Date(
          `${dateFrom.slice(0, 10)}T00:00:00.000Z`,
        );
      }
      if (dateTo) {
        documentWhere.date.lte = new Date(
          `${dateTo.slice(0, 10)}T23:59:59.999Z`,
        );
      }
    }
    const documents = await this.prisma.document.findMany({
      where: documentWhere,
      include: { company: true },
      take: 10000,
    });
    const documentMap = new Map<string, any>(
      documents.map((doc: any) => [doc.id, doc] as [string, any]),
    );
    const documentIds = documents.map((doc) => doc.id);
    if (!documentIds.length) return makePaginatedResponse([], page, limit, 0);
    const itemWhere: Prisma.InvoiceItemWhereInput = {
      mainCompanySlug,
      documentId: { in: documentIds },
      productId: { not: null },
    };
    if (productId) itemWhere.productId = productId;
    const items = await this.prisma.invoiceItem.findMany({
      where: itemWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 20000,
    });
    const productIds = [
      ...new Set(items.map((item) => item.productId).filter(Boolean)),
    ] as string[];
    const [products, aliases, stockMovements] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { mainCompanySlug, id: { in: productIds } },
            include: { aliases: true },
          })
        : [],
      productIds.length
        ? this.prisma.productAlias.findMany({
            where: { mainCompanySlug, productId: { in: productIds } },
          })
        : [],
      productIds.length
        ? this.prisma.stockMovement.findMany({
            where: {
              mainCompanySlug,
              productId: { in: productIds },
              ...(dateFrom || dateTo
                ? {
                    date: {
                      ...(dateFrom
                        ? {
                            gte: new Date(
                              `${dateFrom.slice(0, 10)}T00:00:00.000Z`,
                            ),
                          }
                        : {}),
                      ...(dateTo
                        ? {
                            lte: new Date(
                              `${dateTo.slice(0, 10)}T23:59:59.999Z`,
                            ),
                          }
                        : {}),
                    },
                  }
                : {}),
            },
            select: { documentLineId: true },
            take: 20000,
          })
        : [],
    ]);
    const productMap = new Map<string, any>(
      products.map((product: any) => [product.id, product] as [string, any]),
    );
    const aliasCountMap = new Map<string, number>();
    aliases.forEach((alias: any) => {
      aliasCountMap.set(
        alias.productId,
        (aliasCountMap.get(alias.productId) || 0) + 1,
      );
    });
    const stockLineIds = new Set(
      stockMovements.map((row) => row.documentLineId).filter(Boolean),
    );
    const grouped = new Map<string, any>();
    for (const item of items) {
      if (!item.productId) continue;
      const product = productMap.get(item.productId);
      if (!product) continue;
      const meta = this.productMeta(product);
      const itemMeta = this.invoiceItemMeta(item);
      const doc = documentMap.get(item.documentId);
      const status = normalizeText(itemMeta.matchStatus).toUpperCase();
      if (status === "IGNORED") continue;
      if (
        groupType &&
        normalizeSearchText(meta.groupType) !== normalizeSearchText(groupType)
      )
        continue;
      const haystack = normalizeSearchText(
        `${product.name} ${item.productName || ""} ${item.description || ""} ${doc?.documentNo || ""} ${doc?.company?.name || ""}`,
      );
      if (q && !haystack.includes(normalizeSearchText(q))) continue;
      const rawDate = doc?.date || item.createdAt;
      const period = rawDate ? new Date(rawDate).toISOString().slice(0, 7) : "";
      const key = `${item.productId}:${period}`;
      const current = grouped.get(key) || {
        productId: item.productId,
        productName: product.name,
        shortCode: meta.shortCode,
        groupType: meta.groupType,
        unit: product.unit || item.unit || "",
        defaultVatRate: decimalToNumber(product.defaultVatRate),
        aliasCount: aliasCountMap.get(item.productId) || 0,
        period,
        quantity: 0,
        amount: 0,
        vatAmount: 0,
        lineCount: 0,
        documentIds: new Set<string>(),
        firmIds: new Set<string>(),
        stockLineCount: 0,
        amountOnlyLineCount: 0,
        lastDocumentDate: "",
        lastDocumentNo: "",
        lastFirmName: "",
      };
      const quantity = decimalToNumber(item.quantity);
      const amount = decimalToNumber(item.lineTotal);
      current.quantity += quantity;
      current.amount += amount;
      current.vatAmount += decimalToNumber(item.vatAmount);
      current.lineCount += 1;
      if (!quantity && amount) current.amountOnlyLineCount += 1;
      if (stockLineIds.has(item.id)) current.stockLineCount += 1;
      if (doc?.id) current.documentIds.add(doc.id);
      if (doc?.companyId) current.firmIds.add(doc.companyId);
      const docDate = doc?.date
        ? new Date(doc.date).toISOString().slice(0, 10)
        : "";
      if (docDate >= (current.lastDocumentDate || "")) {
        current.lastDocumentDate = docDate;
        current.lastDocumentNo = doc?.documentNo || "";
        current.lastFirmName = doc?.company?.name || "";
      }
      grouped.set(key, current);
    }
    const rows = [...grouped.values()]
      .map((row) => ({
        ...row,
        documentCount: row.documentIds.size,
        firmCount: row.firmIds.size,
        documentIds: undefined,
        firmIds: undefined,
      }))
      .sort(
        (a, b) =>
          String(b.period).localeCompare(String(a.period)) ||
          Number(b.amount || 0) - Number(a.amount || 0),
      );
    const start = (page - 1) * limit;
    return makePaginatedResponse(
      rows.slice(start, start + limit),
      page,
      limit,
      rows.length,
    );
  }

  async listCariKasa(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const companyId = normalizeText(query.companyId);
    const where: Prisma.CurrentAccountMovementWhereInput = { mainCompanySlug };
    if (companyId) where.companyId = companyId;
    if (query.dateFrom || query.dateTo) {
      where.movementDate = {};
      if (query.dateFrom)
        where.movementDate.gte = new Date(
          `${String(query.dateFrom).slice(0, 10)}T00:00:00.000Z`,
        );
      if (query.dateTo)
        where.movementDate.lte = new Date(
          `${String(query.dateTo).slice(0, 10)}T23:59:59.999Z`,
        );
    }
    const q = normalizeText(query.q);
    if (q) {
      where.OR = [
        { documentNo: { contains: q } },
        { description: { contains: q } },
        { company: { name: { contains: q } } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.currentAccountMovement.count({ where }),
      this.prisma.currentAccountMovement.findMany({
        where,
        include: { company: true },
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(
      rows.map((row) => this.mapMovement(row)),
      page,
      limit,
      total,
    );
  }

  async saveManualMovement(mainCompanySlug: string, payload: Query) {
    const slug = await this.scope(mainCompanySlug);
    const companyId = normalizeText(payload.companyId);
    if (!companyId) throw new BadRequestException("companyId zorunludur.");
    const effect = Number(
      payload.effect ?? payload.amount ?? payload.tutar ?? 0,
    );
    if (!Number.isFinite(effect) || effect === 0)
      throw new BadRequestException("Tutar gecersiz.");
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadi.");
      const balanceAfter = decimalToNumber(company.currentBalance) + effect;
      const movement = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug: slug,
          companyId,
          movementDate: payload.date
            ? new Date(`${String(payload.date).slice(0, 10)}T00:00:00.000Z`)
            : new Date(),
          movementType: normalizeText(payload.movementType || "MANUEL"),
          sourceType: normalizeText(payload.sourceType || "MANUAL_MOVEMENT"),
          documentNo:
            normalizeText(payload.documentNo || payload.belge) || null,
          description:
            normalizeText(payload.description || payload.aciklama) || null,
          debit: safeDecimal(effect > 0 ? effect : 0),
          credit: safeDecimal(effect < 0 ? Math.abs(effect) : 0),
          amount: safeDecimal(Math.abs(effect)),
          effect: safeDecimal(effect),
          balanceAfter: safeDecimal(balanceAfter),
          raw: payload.raw ?? undefined,
        },
      });
      await tx.company.update({
        where: { id: company.id },
        data: { currentBalance: safeDecimal(balanceAfter) },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "current_account_movement",
          entityId: movement.id,
          actionType: "CREATED",
          description: "Manuel cari hareket olusturuldu",
          newValue: this.mapMovement(movement),
        },
      });
      return dbSuccess(this.mapMovement(movement));
    });
  }

  async updateMovement(mainCompanySlug: string, id: string, payload: Query) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.currentAccountMovement.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      if (!old) throw new NotFoundException("Cari hareket bulunamadi.");
      const oldEffect = decimalToNumber(old.effect);
      const newEffect = Number(payload.effect ?? payload.amount ?? oldEffect);
      const delta = newEffect - oldEffect;
      const company = await tx.company.findFirst({
        where: { id: old.companyId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadi.");
      const balanceAfter = decimalToNumber(company.currentBalance) + delta;
      const movement = await tx.currentAccountMovement.update({
        where: { id },
        data: {
          movementDate: payload.date
            ? new Date(`${String(payload.date).slice(0, 10)}T00:00:00.000Z`)
            : undefined,
          movementType: payload.movementType
            ? normalizeText(payload.movementType)
            : undefined,
          documentNo:
            payload.documentNo !== undefined
              ? normalizeText(payload.documentNo) || null
              : undefined,
          description:
            payload.description !== undefined
              ? normalizeText(payload.description) || null
              : undefined,
          debit: safeDecimal(newEffect > 0 ? newEffect : 0),
          credit: safeDecimal(newEffect < 0 ? Math.abs(newEffect) : 0),
          amount: safeDecimal(Math.abs(newEffect)),
          effect: safeDecimal(newEffect),
          balanceAfter: safeDecimal(balanceAfter),
        },
      });
      await tx.company.update({
        where: { id: old.companyId },
        data: { currentBalance: safeDecimal(balanceAfter) },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "current_account_movement",
          entityId: id,
          actionType: "UPDATED",
          oldValue: this.mapMovement(old),
          newValue: this.mapMovement(movement),
        },
      });
      return dbSuccess(this.mapMovement(movement));
    });
  }

  async deleteMovement(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.currentAccountMovement.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      if (!old) throw new NotFoundException("Cari hareket bulunamadi.");
      const company = await tx.company.findFirst({
        where: { id: old.companyId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadi.");
      const balanceAfter =
        decimalToNumber(company.currentBalance) - decimalToNumber(old.effect);
      await tx.currentAccountMovement.delete({ where: { id } });
      await tx.company.update({
        where: { id: old.companyId },
        data: { currentBalance: safeDecimal(balanceAfter) },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "current_account_movement",
          entityId: id,
          actionType: "DELETED",
          oldValue: this.mapMovement(old),
        },
      });
      return dbSuccess({ id, deleted: true });
    });
  }

  async listDocuments(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const andFilters: Prisma.DocumentWhereInput[] = [{ deletedAt: null }];
    const where: Prisma.DocumentWhereInput = {
      mainCompanySlug,
      AND: andFilters,
    };
    if (query.type) {
      const aliases = this.documentTypeAliases(String(query.type));
      andFilters.push({
        OR: [
          { documentType: { in: aliases } },
          ...aliases.flatMap((alias) => [
            { raw: { path: "$.belgeTipi", equals: alias } },
            { raw: { path: "$.documentType", equals: alias } },
            { raw: { path: "$.type", equals: alias } },
            { metadata: { path: "$.belgeTipi", equals: alias } },
            { metadata: { path: "$.documentType", equals: alias } },
            { metadata: { path: "$.type", equals: alias } },
          ]),
        ],
      });
    }
    if (query.status || query.durum) {
      const requestedStatus = normalizeText(query.status || query.durum);
      const aliases = this.documentStatusAliases(requestedStatus);
      andFilters.push({
        OR: [
          { status: { in: aliases } },
          ...aliases.flatMap((alias) => [
            { raw: { path: "$.durum", equals: alias } },
            { raw: { path: "$.status", equals: alias } },
            { metadata: { path: "$.durum", equals: alias } },
            { metadata: { path: "$.status", equals: alias } },
          ]),
        ],
      });
    }
    if (q) {
      where.OR = [
        { documentNo: { contains: q } },
        { company: { name: { contains: q } } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: { company: true, files: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    const invoiceItems = rows.length
      ? await this.prisma.invoiceItem.findMany({
          where: {
            mainCompanySlug,
            documentId: { in: rows.map((row) => row.id) },
          },
          orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
        })
      : [];
    const dispatchLines = rows.length
      ? await this.prisma.customerDispatchLine.findMany({
          where: {
            mainCompanySlug,
            documentId: { in: rows.map((row) => row.id) },
            deletedAt: null,
          },
          orderBy: [{ createdAt: "asc" }],
        })
      : [];
    const invoiceItemsByDocument = new Map<string, any[]>();
    for (const item of invoiceItems) {
      const list = invoiceItemsByDocument.get(item.documentId) || [];
      list.push(item);
      invoiceItemsByDocument.set(item.documentId, list);
    }
    const dispatchLinesByDocument = new Map<string, any[]>();
    for (const item of dispatchLines) {
      if (!item.documentId) continue;
      const list = dispatchLinesByDocument.get(item.documentId) || [];
      list.push(item);
      dispatchLinesByDocument.set(item.documentId, list);
    }
    return makePaginatedResponse(
      rows.map((row) =>
        this.mapDocument(
          row,
          invoiceItemsByDocument.get(row.id) || [],
          dispatchLinesByDocument.get(row.id) || [],
        ),
      ),
      page,
      limit,
      total,
    );
  }

  async uploadAndClassifyDocuments(
    files: any[],
    mainCompanySlug?: string,
    _mainCompanyId?: string,
    options: Query = {},
  ) {
    const slug = await this.scope(String(mainCompanySlug || ""));
    const company = await this.prisma.mainCompany.findUnique({
      where: { slug },
    });
    if (!company) throw new BadRequestException("Ana firma zorunludur.");
    // Aynı irsaliyenin PDF ve XML'i birlikte geldiğinde PDF önce arşivlenir,
    // XML en son işlenerek belge alanlarında ana/doğru kaynak olarak kalır.
    const roleRank: Record<string, number> = { archive: 0, pdf: 1, xml: 2 };
    const safeFiles = Array.isArray(files)
      ? files
          .filter(Boolean)
          .sort(
            (a, b) =>
              (roleRank[this.detectFileRole(a)] || 0) -
              (roleRank[this.detectFileRole(b)] || 0),
          )
      : [];
    if (!safeFiles.length)
      throw new BadRequestException("Yuklenecek dosya bulunamadi.");

    const records: any[] = [];
    const results: any[] = [];
    const now = new Date().toISOString();

    if (safeFiles.length > 8) {
      await this.prisma.job.create({
        data: {
          mainCompanySlug: slug,
          type: "document_upload_prepare",
          status: "READY",
          payload: {
            fileCount: safeFiles.length,
            note: "Future async upload pipeline hook",
          },
        },
      });
    }

    for (const file of safeFiles) {
      const checksum = this.computeChecksum(file.path);
      // Belgenin fileHash alani PDF+XML eslesmesinde son ana kaynagin hash'ine
      // donusebilir. Daha once eklenen diger eki de document_files uzerinden
      // denetleyerek ayni PDF/XML dosyasinin tekrar arsivlenmesini engelle.
      const duplicateFile = await this.prisma.documentFile.findFirst({
        where: {
          mainCompanySlug: slug,
          checksum,
          deletedAt: null,
          document: { deletedAt: null },
        },
        include: {
          document: { include: { files: true, company: true } },
        },
      });
      const duplicateByChecksum =
        duplicateFile?.document ||
        (await this.prisma.document.findFirst({
          where: { mainCompanySlug: slug, fileHash: checksum, deletedAt: null },
          include: { files: true, company: true },
        }));
      if (duplicateByChecksum) {
        const duplicate = await this.prisma.document.update({
          where: { id: duplicateByChecksum.id },
          data: {
            routeStatus: "DUPLICATE",
            routeMessage: "Bu belge daha önce yüklendi",
            raw: {
              ...this.documentRaw(duplicateByChecksum),
              routeStatus: "DUPLICATE",
              routeMessage: "Bu belge daha önce yüklendi",
            },
          },
          include: { files: true, company: true },
        });
        if (!file?.preserveSource && fs.existsSync(file.path))
          fs.unlinkSync(file.path);
        const mapped = this.mapDocument(duplicate);
        records.push(mapped);
        results.push({
          id: mapped.id,
          uploadedAt: now,
          uploadTime: now,
          fileName: file.originalname || file.filename || "",
          documentKind: mapped.belgeTipi,
          detectedDocumentType: mapped.belgeTipi,
          targetType: mapped.targetType,
          targetModule: mapped.targetModule,
          targetRecordId: mapped.targetRecordId,
          routedPool: mapped.targetModule || "Belge Havuzu",
          status: "DUPLICATE",
          routeStatus: "DUPLICATE",
          routeMessage: "Bu belge daha önce yüklendi",
          warnings: ["Duplicate dosya"],
        });
        continue;
      }

      const parsed = await this.parseUploadedFile(file);
      const kind = this.detectDocumentKindFromParsed(parsed);
      let fields: any = this.extractDocumentFields(parsed);
      const readTemplate = await this.findReadTemplate(
        slug,
        parsed,
        fields,
        options,
      );
      fields = this.applyReadTemplateToFields(readTemplate, parsed, fields);
      const requestedTarget = options.targetType
        ? normalizeText(options.targetType).toLocaleUpperCase("tr-TR")
        : options.documentType
          ? this.documentTypeToTargetType(options.documentType)
          : fields.appliedTemplateTargetType
            ? normalizeText(fields.appliedTemplateTargetType).toLocaleUpperCase(
                "tr-TR",
              )
            : "";
      if (
        requestedTarget === "MUSTERIDEN_GELEN_IRSALIYE" &&
        normalizeText(options.templateCompanyName)
      ) {
        fields.sellerName =
          fields.sellerName || normalizeText(options.templateCompanyName);
      }
      let classification = this.detectDocumentDirection(kind, fields, company);
      const explicitTarget = requestedTarget;
      if (
        explicitTarget &&
        explicitTarget !== "UNKNOWN" &&
        this.isRoutableTargetType(explicitTarget)
      ) {
        const forcedKind = this.detectedKindForTargetType(explicitTarget);
        classification = {
          ...classification,
          detectedKind: forcedKind || classification.detectedKind,
          direction: this.directionForTargetType(explicitTarget),
          targetType: explicitTarget,
          targetModule: this.targetModuleForTargetType(explicitTarget),
          confidence: Math.max(classification.confidence || 0, 96),
          reasons: [
            ...(classification.reasons || []),
            "Klasör/kullanıcı hedef seçimi kesin uygulandı",
          ],
          warnings: classification.warnings || [],
        };
      }
      if (classification.confidence < 50) {
        classification = {
          ...classification,
          targetType: "UNKNOWN",
          targetModule: "TASNIF_BEKLEYEN",
        };
      }
      const documentType = this.targetTypeToDocumentType(
        classification.targetType,
      );
      const isCustomerDispatch =
        classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE";
      if (isCustomerDispatch) {
        const parsedItems = Array.isArray(fields.items) ? fields.items : [];
        // UBL XML satirlari extractDocumentFields icinde zaten okunuyor.
        // Bunlari PDF goruntu metni icin yazilmis regex ile tekrar okuyup bos
        // listeyle ezmek, belgeyi kaydedip satirlarini kaybetmemize yol aciyordu.
        fields.items = parsed.role === "xml" && parsedItems.length
          ? parsedItems.map((item: any, index: number) => ({
              ...item,
              lineNo: Number(item.lineNo || index + 1),
              aciklama: item.aciklama || item.rawDescription || item.productName || `Satir ${index + 1}`,
              adet: Number(item.adet || item.quantity || 0),
              birim: item.birim || item.unit || "ADET",
              modelAdiOnerisi: item.modelAdiOnerisi || this.modelSuggestionFromDescription(
                item.aciklama || item.rawDescription || item.productName,
              ),
              durum: item.durum || "MODEL_BAGLANTISI_BEKLIYOR",
            }))
          : this.extractCustomerDispatchLines(
              fields.rawText || parsed.extractedText || "",
            );
        if (!fields.items.length && Number(fields.quantity || 0) > 0) {
          fields.items = [{
            lineNo: 1,
            aciklama:
              fields.description ||
              fields.rawDescription ||
              fields.modelSuggestion ||
              "Müşteri irsaliyesi ürün kalemi",
            adet: Number(fields.quantity || 0),
            birim: fields.unit || "ADET",
            durum: "MODEL_BAGLANTISI_BEKLIYOR",
          }];
        }
        fields.quantity =
          fields.items.reduce(
            (sum: number, item: any) =>
              sum + Number(item.adet || item.quantity || 0),
            0,
          ) || fields.quantity;
        fields.modelSuggestion = "";
      }
      const firmResult =
        classification.targetType === "UNKNOWN" ||
        classification.targetType === "TASNIF_RAPORU_TEMPLATE" ||
        classification.targetType === "EKSTRE_DOSYASI"
          ? { company: null, status: "", candidates: [] }
          : await this.resolveOrCreateFirm(slug, fields, classification);
      const modelSuggestion = isCustomerDispatch
        ? ""
        : fields.modelSuggestion || "";
      const needsModel =
        [
          "MUSTERIDEN_GELEN_IRSALIYE",
          "BIZIM_GIDEN_IRSALIYE",
          "BIZIM_GIDEN_FATURA",
        ].includes(classification.targetType) && !modelSuggestion;
      const routeStatus =
        classification.targetType === "UNKNOWN"
          ? "UNKNOWN"
          : firmResult.status === "YAKIN_FIRMA_BULUNDU"
            ? "ROUTED_NEEDS_FIRM_CONFIRM"
            : needsModel
              ? "ROUTED_NEEDS_MODEL"
              : "ROUTED";
      const status =
        classification.targetType === "UNKNOWN"
          ? "tasnif_bekliyor"
          : isCustomerDispatch
            ? "SATIR_MODEL_BAGLANTISI_BEKLIYOR"
            : routeStatus === "ROUTED_NEEDS_MODEL"
              ? "model_baglantisi_bekliyor"
              : routeStatus === "ROUTED_NEEDS_FIRM_CONFIRM"
                ? "firma_eslesmesi_bekliyor"
                : classification.confidence < 90
                  ? "kontrol_bekliyor"
                  : "bekleyen";
      const routeMessage =
        routeStatus === "UNKNOWN"
          ? "Belge tipi/yönü çözülemedi"
          : routeStatus === "ROUTED_NEEDS_FIRM_CONFIRM"
            ? "Yakın firma bulundu; kullanıcı onayı bekliyor"
            : routeStatus === "ROUTED_NEEDS_MODEL"
              ? "Belge doğru havuza yönlendirildi; model bağlantısı bekliyor"
              : "Belge doğru havuza yönlendirildi";
      const storageStatus = "RAW";
      const folderKey = "RAW";
      const moved = this.moveUploadedFile(slug, file, folderKey, fields.date);
      const canonicalKind = classifyDocumentFlow({
        fileName: moved.originalName,
        belgeNo: fields.documentNo || fields.invoiceNo || fields.dispatchNo,
        belgeTuru: documentType,
      });
      const duplicateByNo = fields.documentNo
        ? await this.prisma.document.findFirst({
            where: {
              mainCompanySlug: slug,
              documentNo: fields.documentNo,
              documentType,
              deletedAt: null,
            },
            include: { files: true, company: true },
          })
        : null;
      const document = await this.prisma.$transaction(async (tx) => {
        const baseRaw = duplicateByNo ? this.documentRaw(duplicateByNo) : {};
        const taslakAlanlar = {
          belgeNo: fields.documentNo,
          faturaNo:
            fields.invoiceNo ||
            (classification.detectedKind === "FATURA" ? fields.documentNo : ""),
          irsaliyeNo:
            fields.dispatchNo ||
            (classification.detectedKind === "IRSALIYE"
              ? fields.documentNo
              : ""),
          bagliIrsaliyeNo: fields.dispatchNo || "",
          tarih: fields.date,
          firmaAdi:
            firmResult.company?.name ||
            this.displayFirmName(
              classification.targetType === "TEDARIKCI_GELEN_FATURA" ||
                classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE"
                ? fields.sellerName
                : fields.buyerName,
            ),
          saticiUnvan: fields.sellerName,
          saticiVkn: fields.sellerTaxNo,
          aliciUnvan: fields.buyerName,
          aliciVkn: fields.buyerTaxNo,
          adet: fields.quantity,
          gelenAdet: fields.quantity,
          birim: "ADET",
          araToplam: fields.subtotal,
          kdvToplam: fields.vatTotal,
          kdv: fields.vatTotal,
          genelToplam: fields.grandTotal,
          modelAdiOnerisi: modelSuggestion,
          satirlar: isCustomerDispatch ? fields.items || [] : [],
          mailEkiOlarakKullan:
            classification.targetType === "BIZIM_GIDEN_IRSALIYE",
          resmiDurum: classification.detectedKind === "FATURA" ? "RESMI" : "",
          odemeDurumu:
            classification.detectedKind === "FATURA" ? "ODENMEDI" : "",
          urunEslestirmeDurumu:
            classification.targetType === "TEDARIKCI_GELEN_FATURA"
              ? "ESLESME_BEKLIYOR"
              : "",
        };
        const raw = {
          ...baseRaw,
          source: "BELGE_UPLOAD",
          detectedType: classification.detectedKind,
          targetType: classification.targetType,
          targetModule: classification.targetModule,
          routeStatus,
          routeMessage,
          confidence: classification.confidence,
          firmMatchStatus: firmResult.status,
          matchedFirmaId: firmResult.company?.id || "",
          firmaOnerileri: firmResult.candidates,
          durum: status,
          documentKind: canonicalKind,
          storageStatus,
          guessedModelName: modelSuggestion,
          modelId: "",
          modelPath: "",
          needsReview:
            classification.confidence < 90 || routeStatus !== "ROUTED",
          parseConfidence: classification.confidence / 100,
          parseWarnings: parsed.parseWarnings || [],
          reasons: classification.reasons || [],
          warnings: classification.warnings || [],
          primaryChecksum: checksum,
          fileHash: checksum,
          notes: this.cleanText(options.notes),
          appliedTemplateId: fields.appliedTemplateId || "",
          appliedTemplateName: fields.appliedTemplateName || "",
          appliedTemplateCompanyName: fields.appliedTemplateCompanyName || "",
          belgeDosyaYolu: moved.storedPath,
          extractedText: String(parsed.extractedText || "").slice(0, 20000),
          taslakAlanlar,
          kalemler: fields.items || [],
          filesMeta: {
            ...(baseRaw.filesMeta || {}),
          },
        };
        const saved = duplicateByNo
          ? await tx.document.update({
              where: { id: duplicateByNo.id },
              data: {
                companyId:
                  firmResult.company?.id || duplicateByNo.companyId || null,
                documentNo: fields.documentNo || duplicateByNo.documentNo,
                documentType,
                sourceType: parsed.role,
                date: this.optionalDate(fields.date) || duplicateByNo.date,
                subtotal: safeDecimal(fields.subtotal),
                vatTotal: safeDecimal(fields.vatTotal),
                grandTotal: safeDecimal(fields.grandTotal),
                status,
                fileHash: checksum,
                detectedType: classification.detectedKind,
                targetType: classification.targetType,
                targetModule: classification.targetModule,
                firmMatchStatus: firmResult.status || null,
                confidence: safeDecimal(classification.confidence),
                routeStatus,
                routeMessage,
                raw,
                metadata: raw,
              },
            })
          : await tx.document.create({
              data: {
                mainCompanySlug: slug,
                companyId: firmResult.company?.id || null,
                documentNo: fields.documentNo || null,
                documentType,
                sourceType: parsed.role,
                date: this.optionalDate(fields.date),
                subtotal: safeDecimal(fields.subtotal),
                vatTotal: safeDecimal(fields.vatTotal),
                grandTotal: safeDecimal(fields.grandTotal),
                status,
                fileHash: checksum,
                detectedType: classification.detectedKind,
                targetType: classification.targetType,
                targetModule: classification.targetModule,
                firmMatchStatus: firmResult.status || null,
                confidence: safeDecimal(classification.confidence),
                routeStatus,
                routeMessage,
                raw,
                metadata: raw,
              },
            });
        const fileRow = await tx.documentFile.create({
          data: {
            mainCompanySlug: slug,
            documentId: saved.id,
            filePath: moved.storedPath,
            fileName: moved.originalName,
            mimeType: moved.mimeType || null,
            fileSize: moved.sizeBytes,
            checksum,
            role: parsed.role,
          },
        });
        const nextRaw: any = {
          ...raw,
          targetRecordId: saved.id,
          filesMeta: {
            ...(raw.filesMeta || {}),
            [fileRow.id]: {
              originalName: moved.originalName,
              storedName: moved.storedName,
              storedPath: moved.storedPath,
              fileType: moved.fileType,
              mimeType: moved.mimeType,
              sizeBytes: moved.sizeBytes,
              checksum,
              isPrimary: true,
              role: parsed.role,
            },
          },
        };
        await tx.document.update({
          where: { id: saved.id },
          data: {
            targetRecordId: saved.id,
            raw: nextRaw,
            metadata: nextRaw,
          },
        });
        if (classification.targetType === "TEDARIKCI_GELEN_FATURA") {
          await tx.invoiceItem.deleteMany({
            where: { mainCompanySlug: slug, documentId: saved.id },
          });
          for (const [index, item] of (fields.items || []).entries()) {
            await tx.invoiceItem.create({
              data: {
                mainCompanySlug: slug,
                documentId: saved.id,
                lineNo: Number(item.lineNo || index + 1),
                productName: item.productName || item.rawDescription || null,
                normalizedProductName: normalizeSearchText(
                  item.productName || item.rawDescription || "",
                ),
                description: item.rawDescription || item.productName || null,
                quantity: safeDecimal(item.quantity || 0),
                unit: item.unit || "ADET",
                unitPrice: safeDecimal(item.unitPrice || 0),
                vatRate: safeDecimal(item.vatRate || 0),
                vatAmount: safeDecimal(item.vatAmount || 0),
                lineTotal: safeDecimal(item.lineTotal || 0),
                lotNo: item.lotNo || null,
                raw: item,
              },
            });
          }
        }
        if (
          classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE" &&
          isCustomerDispatch
        ) {
          await tx.customerDispatchLine.deleteMany({
            where: { mainCompanySlug: slug, documentId: saved.id },
          });
          for (const [index, item] of (fields.items || []).entries()) {
            await tx.customerDispatchLine.create({
              data: {
                mainCompanySlug: slug,
                musteriIrsaliyeId: saved.id,
                documentId: saved.id,
                aciklama:
                  item.aciklama ||
                  item.rawDescription ||
                  item.productName ||
                  null,
                adet: safeDecimal(item.adet || item.quantity || 0),
                birim: item.birim || item.unit || "ADET",
                modelAdiOnerisi:
                  item.modelAdiOnerisi ||
                  this.modelSuggestionFromDescription(
                    item.aciklama || item.rawDescription,
                  ),
                durum: item.durum || "MODEL_BAGLANTISI_BEKLIYOR",
              },
            });
          }
        }
        await tx.activityLog.create({
          data: {
            mainCompanySlug: slug,
            module: "muhasebe",
            entityType: "document",
            entityId: saved.id,
            actionType: duplicateByNo ? "UPDATED" : "CREATED",
            action: "document_upload_route",
            description: routeMessage,
            newValue: { classification, fields: taslakAlanlar, routeStatus },
          },
        });
        return tx.document.findFirst({
          where: { id: saved.id },
          include: { files: true, company: true },
        });
      });

      if (document) await this.linkInvoiceDispatch(slug, document.id);
      const refreshed = await this.prisma.document.findFirst({
        where: { id: document?.id || "" },
        include: { files: true, company: true },
      });
      const mapped = this.mapDocument(refreshed || document);
      records.push(mapped);
      results.push({
        id: mapped.id,
        uploadedAt: now,
        uploadTime: now,
        fileName: moved.originalName,
        storedFileName: moved.storedName,
        fileType: moved.fileType,
        tip: moved.fileType,
        documentKind: mapped.belgeTipi,
        detectedDocumentType: mapped.belgeTipi,
        detectedMainCompanyName: company.name,
        detectedCounterpartyName:
          mapped.firmaAdi || mapped.taslakAlanlar?.firmaAdi || "",
        mainCompanySlug: slug,
        mainCompanyName: company.name,
        routedPool: mapped.targetModule || "Belge Havuzu",
        targetType: mapped.targetType,
        targetModule: mapped.targetModule,
        targetRecordId: mapped.targetRecordId,
        savedFolder: folderKey,
        savedRelativePath: moved.storedPath,
        status: mapped.durum,
        routeStatus: mapped.routeStatus,
        routeMessage: mapped.routeMessage,
        size: moved.sizeBytes,
        detail: mapped.id,
        warnings: mapped.uyarilar || [],
      });
    }

    return {
      ok: true,
      count: results.length,
      data: {
        records,
        results,
        summary: await this.getUploadSummary(slug),
      },
      results,
      summary: await this.getUploadSummary(slug),
      message: `${results.length} dosya yuklendi`,
    };
  }

  async getUploadHistory(mainCompanySlug: string) {
    const slug = await this.scope(mainCompanySlug);
    const rows = await this.prisma.document.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      include: { files: true },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
    });
    return rows.flatMap((row) => {
      const mapped = this.mapDocument(row);
      const files =
        Array.isArray(mapped.dosyalar) && mapped.dosyalar.length
          ? mapped.dosyalar
          : [null];
      return files.map((file: any) => ({
        id: mapped.id,
        uploadedAt: row.createdAt,
        uploadTime: row.createdAt,
        fileName: file?.originalName || "",
        originalName: file?.originalName || "",
        storedFileName: file?.storedName || "",
        fileType: file?.fileType || "",
        tip: file?.fileType || "",
        documentKind: mapped.belgeTipi,
        detectedDocumentType: mapped.belgeTipi,
        mainCompanySlug: slug,
        routedPool: "Belge Havuzu",
        savedFolder: file?.storedPath
          ? path.dirname(file.storedPath).split("/").slice(-3).join("/")
          : "",
        savedRelativePath: file?.storedPath || "",
        status: mapped.durum,
        poolStatus: mapped.durum,
        size: Number(file?.sizeBytes || 0),
        detail: mapped.id,
        processedResult: mapped.processedResult || null,
      }));
    });
  }

  async getUploadSummary(mainCompanySlug: string) {
    const slug = await this.scope(mainCompanySlug);
    const rows = await this.prisma.document.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
    });
    const waitingStatuses = new Set([
      "taslak",
      "kontrol_bekliyor",
      "eksik_bilgi",
      "onay_bekliyor",
      "tasnif_bekliyor",
      "",
    ]);
    const waiting = rows.filter((row) =>
      waitingStatuses.has(this.documentStatus(row).toLocaleLowerCase("tr-TR")),
    );
    return {
      supplierInvoices: waiting.filter(
        (row) =>
          this.normalizeDocumentType(row.documentType) ===
          "tedarikci_gelen_fatura",
      ).length,
      incomingDeliveries: waiting.filter(
        (row) =>
          this.normalizeDocumentType(row.documentType) ===
          "musteriden_gelen_irsaliye",
      ).length,
      outgoingDocuments: waiting.filter((row) =>
        ["bizim_kestigimiz_fatura", "bizim_kestigimiz_irsaliye"].includes(
          this.normalizeDocumentType(row.documentType),
        ),
      ).length,
      pending: waiting.filter(
        (row) =>
          normalizeText(row.documentType) === "bilinmeyen" ||
          normalizeText(row.status) === "tasnif_bekliyor" ||
          normalizeText(row.routeStatus) === "UNKNOWN",
      ).length,
      folders: [
        "GELEN-FATURA",
        "GELEN-IRSALIYE",
        "BIZIM-FATURA",
        "BIZIM-IRSALIYE",
        "TASNIF-BEKLEYEN",
        "XML",
      ],
      recentResults: (await this.getUploadHistory(slug)).slice(0, 5),
    };
  }

  private async linkInvoiceDispatch(
    mainCompanySlug: string,
    documentId: string,
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, mainCompanySlug, deletedAt: null },
    });
    if (!document) return;
    const raw = this.documentRaw(document);
    const targetType = document.targetType || raw.targetType;
    const draft = raw.taslakAlanlar || {};
    if (targetType === "BIZIM_GIDEN_FATURA") {
      let dispatch = draft.bagliIrsaliyeNo
        ? await this.prisma.document.findFirst({
            where: {
              mainCompanySlug,
              documentNo: draft.bagliIrsaliyeNo,
              documentType: "bizim_kestigimiz_irsaliye",
              deletedAt: null,
            },
          })
        : null;
      if (!dispatch) {
        const invoiceModel = normalizeSearchText(
          raw.guessedModelName || draft.modelAdiOnerisi || "",
        );
        const invoiceTime = document.date
          ? new Date(document.date).getTime()
          : 0;
        const candidates = await this.prisma.document.findMany({
          where: {
            mainCompanySlug,
            documentType: "bizim_kestigimiz_irsaliye",
            companyId: document.companyId || undefined,
            deletedAt: null,
          },
          take: 20,
        });
        const scored = candidates
          .map((candidate: any) => {
            const candidateRaw = this.documentRaw(candidate);
            const candidateModel = normalizeSearchText(
              candidateRaw.guessedModelName ||
                candidateRaw.taslakAlanlar?.modelAdiOnerisi ||
                "",
            );
            const modelMatch =
              invoiceModel &&
              candidateModel &&
              (invoiceModel === candidateModel ||
                invoiceModel.includes(candidateModel) ||
                candidateModel.includes(invoiceModel));
            const dayDiff =
              invoiceTime && candidate.date
                ? Math.abs(invoiceTime - new Date(candidate.date).getTime()) /
                  86400000
                : 999;
            return { candidate, modelMatch, dayDiff };
          })
          .filter((item: any) => item.modelMatch && item.dayDiff <= 10)
          .sort((a: any, b: any) => a.dayDiff - b.dayDiff);
        if (scored.length === 1) dispatch = scored[0].candidate;
      }
      if (dispatch) {
        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            raw: {
              ...raw,
              taslakAlanlar: {
                ...draft,
                bagliIrsaliyeId: dispatch.id,
                bagliIrsaliyeNo: dispatch.documentNo,
              },
            },
          },
        });
        const dispatchRaw = this.documentRaw(dispatch);
        await this.prisma.document.update({
          where: { id: dispatch.id },
          data: {
            raw: {
              ...dispatchRaw,
              taslakAlanlar: {
                ...(dispatchRaw.taslakAlanlar || {}),
                bagliFaturaId: document.id,
                bagliFaturaNo: document.documentNo,
              },
            },
          },
        });
      }
    }
    if (targetType === "BIZIM_GIDEN_IRSALIYE" && document.documentNo) {
      const invoice = await this.prisma.document.findFirst({
        where: {
          mainCompanySlug,
          documentType: "bizim_kestigimiz_fatura",
          deletedAt: null,
          raw: {
            path: "$.taslakAlanlar.bagliIrsaliyeNo",
            equals: document.documentNo,
          },
        },
      });
      if (invoice) {
        await this.linkInvoiceDispatch(mainCompanySlug, invoice.id);
        return;
      }
      const dispatchModel = normalizeSearchText(
        raw.guessedModelName || draft.modelAdiOnerisi || "",
      );
      const dispatchTime = document.date
        ? new Date(document.date).getTime()
        : 0;
      const invoiceCandidates = await this.prisma.document.findMany({
        where: {
          mainCompanySlug,
          documentType: "bizim_kestigimiz_fatura",
          companyId: document.companyId || undefined,
          deletedAt: null,
        },
        take: 20,
      });
      const scored = invoiceCandidates
        .map((candidate: any) => {
          const candidateRaw = this.documentRaw(candidate);
          const candidateDraft = candidateRaw.taslakAlanlar || {};
          const candidateModel = normalizeSearchText(
            candidateRaw.guessedModelName ||
              candidateDraft.modelAdiOnerisi ||
              "",
          );
          const modelMatch =
            dispatchModel &&
            candidateModel &&
            (dispatchModel === candidateModel ||
              dispatchModel.includes(candidateModel) ||
              candidateModel.includes(dispatchModel));
          const dayDiff =
            dispatchTime && candidate.date
              ? Math.abs(dispatchTime - new Date(candidate.date).getTime()) /
                86400000
              : 999;
          return { candidate, modelMatch, dayDiff };
        })
        .filter((item: any) => item.modelMatch && item.dayDiff <= 10)
        .sort((a: any, b: any) => a.dayDiff - b.dayDiff);
      if (scored.length === 1) {
        await this.prisma.document.update({
          where: { id: scored[0].candidate.id },
          data: {
            raw: {
              ...this.documentRaw(scored[0].candidate),
              taslakAlanlar: {
                ...(this.documentRaw(scored[0].candidate).taslakAlanlar || {}),
                bagliIrsaliyeNo: document.documentNo,
              },
            },
          },
        });
        await this.linkInvoiceDispatch(mainCompanySlug, scored[0].candidate.id);
      }
    }
  }

  async softDeleteDocument(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const reason = normalizeText(
      payload.reason || payload.deleteReason || "Yanlış yükleme",
    );
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const raw = this.documentRaw(row);
    const deletedAt = new Date();
    const saved = await this.prisma.document.update({
      where: { id: row.id },
      data: {
        deletedAt,
        deletedBy: normalizeText(payload.deletedBy || payload.user || "system"),
        deleteReason: reason,
        status: "SOFT_DELETED",
        routeStatus: "SOFT_DELETED",
        routeMessage: reason,
        raw: {
          ...raw,
          deletedAt: deletedAt.toISOString(),
          deleteReason: reason,
          durum: "SOFT_DELETED",
          routeStatus: "SOFT_DELETED",
        },
      },
      include: { files: true, company: true },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "document",
      entityId: id,
      actionType: "SOFT_DELETED",
      description: reason,
      oldValue: row,
      newValue: saved,
    });
    return dbSuccess(this.mapDocument(saved));
  }

  async cleanupOldDocumentRecords(
    mainCompanySlug: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const rows = await this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        OR: [
          { routeStatus: "UNKNOWN", targetRecordId: null },
          { documentType: "bilinmeyen" },
          {
            sourceType: {
              in: [
                "INITIAL_IMPORT",
                "TEST",
                "LEGACY_JSON",
                "OLD_XML_IMPORT",
                "FILE_STORE",
              ],
            },
          },
          { raw: { path: "$.source", string_contains: "LEGACY" } },
          { raw: { path: "$.source", string_contains: "TEST" } },
          { raw: { path: "$.source", string_contains: "FILE_STORE" } },
        ],
      },
      include: { files: true },
      take: Number(payload.limit || 1000),
    });
    let count = 0;
    for (const row of rows) {
      await this.softDeleteDocument(slug, row.id, {
        deletedBy: normalizeText(payload.deletedBy || "system_cleanup"),
        reason: "Eski/test/import kayıt temizliği; fiziksel dosya silinmedi",
      });
      count += 1;
    }
    return dbSuccess({ count, message: `${count} kayıt pasife alındı` });
  }

  async reprocessDocument(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug },
      include: { files: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const file = row.files.find(
      (item) =>
        item.filePath &&
        fs.existsSync(path.resolve(process.cwd(), item.filePath)),
    );
    if (!file)
      throw new BadRequestException(
        "Yeniden işlenecek fiziksel dosya bulunamadı.",
      );
    const tempFile = {
      path: path.resolve(process.cwd(), file.filePath),
      originalname: file.fileName,
      filename: path.basename(file.filePath),
      mimetype: file.mimeType || "",
      size: file.fileSize || 0,
    };
    const parsed = await this.parseUploadedFile(tempFile);
    const kind = this.detectDocumentKindFromParsed(parsed);
    const fields = this.extractDocumentFields(parsed);
    const mainCompany = await this.prisma.mainCompany.findUnique({
      where: { slug },
    });
    const classification = this.detectDocumentDirection(
      kind,
      fields,
      mainCompany,
    );
    const isCustomerDispatch =
      classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE";
    if (isCustomerDispatch) {
      const parsedItems = Array.isArray(fields.items) ? fields.items : [];
      fields.items = parsed.role === "xml" && parsedItems.length
        ? parsedItems.map((item: any, index: number) => ({
            ...item,
            lineNo: Number(item.lineNo || index + 1),
            aciklama: item.aciklama || item.rawDescription || item.productName || `Satir ${index + 1}`,
            adet: Number(item.adet || item.quantity || 0),
            birim: item.birim || item.unit || "ADET",
            modelAdiOnerisi: item.modelAdiOnerisi || this.modelSuggestionFromDescription(
              item.aciklama || item.rawDescription || item.productName,
            ),
            durum: item.durum || "MODEL_BAGLANTISI_BEKLIYOR",
          }))
        : this.extractCustomerDispatchLines(
            fields.rawText || parsed.extractedText || "",
          );
      if (!fields.items.length && Number(fields.quantity || 0) > 0) {
        fields.items = [{
          lineNo: 1,
          aciklama:
            (fields as any).description ||
            (fields as any).rawDescription ||
            fields.modelSuggestion ||
            "Müşteri irsaliyesi ürün kalemi",
          adet: Number(fields.quantity || 0),
          birim: (fields as any).unit || "ADET",
          durum: "MODEL_BAGLANTISI_BEKLIYOR",
        }];
      }
      fields.quantity =
        fields.items.reduce(
          (sum: number, item: any) =>
            sum + Number(item.adet || item.quantity || 0),
          0,
        ) || fields.quantity;
      fields.modelSuggestion = "";
    }
    const firmResult =
      classification.targetType === "UNKNOWN" ||
      classification.targetType === "TASNIF_RAPORU_TEMPLATE" ||
      classification.targetType === "EKSTRE_DOSYASI"
        ? { company: null, status: "", candidates: [] }
        : await this.resolveOrCreateFirm(slug, fields, classification);
    const documentType = this.targetTypeToDocumentType(
      classification.targetType,
    );
    const routeStatus =
      classification.targetType === "UNKNOWN" ? "UNKNOWN" : "ROUTED";
    const status =
      routeStatus === "UNKNOWN" ? "tasnif_bekliyor" : "kontrol_bekliyor";
    const raw = {
      ...this.documentRaw(row),
      source: "BELGE_UPLOAD",
      detectedType: classification.detectedKind,
      targetType: classification.targetType,
      targetModule: classification.targetModule,
      routeStatus,
      routeMessage:
        routeStatus === "UNKNOWN"
          ? "Belge yeniden tasnifte çözülemedi"
          : "Belge yeniden tasnif edildi",
      confidence: classification.confidence,
      firmMatchStatus: firmResult.status,
      firmaOnerileri: firmResult.candidates,
      durum: status,
      parseWarnings: parsed.parseWarnings || [],
      taslakAlanlar: {
        ...(this.documentRaw(row).taslakAlanlar || {}),
        belgeNo: fields.documentNo,
        faturaNo: fields.invoiceNo || "",
        irsaliyeNo: fields.dispatchNo || "",
        tarih: fields.date,
        firmaAdi: firmResult.company?.name || "",
        saticiUnvan: fields.sellerName,
        saticiVkn: fields.sellerTaxNo,
        aliciUnvan: fields.buyerName,
        aliciVkn: fields.buyerTaxNo,
        adet: fields.quantity,
        gelenAdet: fields.quantity,
        birim: "ADET",
        araToplam: fields.subtotal,
        kdvToplam: fields.vatTotal,
        kdv: fields.vatTotal,
        genelToplam: fields.grandTotal,
        modelAdiOnerisi: fields.modelSuggestion || "",
        satirlar: isCustomerDispatch ? fields.items || [] : [],
        urunEslestirmeDurumu:
          classification.targetType === "TEDARIKCI_GELEN_FATURA"
            ? "ESLESME_BEKLIYOR"
            : "",
      },
      kalemler: fields.items || [],
      extractedText: String(parsed.extractedText || "").slice(0, 20000),
    };
    const saved = await this.prisma.document.update({
      where: { id: row.id },
      data: {
        companyId: firmResult.company?.id || row.companyId,
        documentNo: fields.documentNo || row.documentNo,
        documentType,
        date: this.optionalDate(fields.date) || row.date,
        subtotal: safeDecimal(fields.subtotal),
        vatTotal: safeDecimal(fields.vatTotal),
        grandTotal: safeDecimal(fields.grandTotal),
        status,
        detectedType: classification.detectedKind,
        targetType: classification.targetType,
        targetModule: classification.targetModule,
        targetRecordId: row.id,
        firmMatchStatus: firmResult.status || null,
        confidence: safeDecimal(classification.confidence),
        routeStatus,
        routeMessage: raw.routeMessage,
        raw,
        metadata: raw,
      },
      include: { files: true, company: true },
    });
    if (classification.targetType === "TEDARIKCI_GELEN_FATURA") {
      await this.prisma.invoiceItem.deleteMany({
        where: { mainCompanySlug: slug, documentId: saved.id },
      });
      for (const [index, item] of (fields.items || []).entries()) {
        await this.prisma.invoiceItem.create({
          data: {
            mainCompanySlug: slug,
            documentId: saved.id,
            lineNo: Number(item.lineNo || index + 1),
            productName: item.productName || item.rawDescription || null,
            normalizedProductName: normalizeSearchText(
              item.productName || item.rawDescription || "",
            ),
            description: item.rawDescription || item.productName || null,
            quantity: safeDecimal(item.quantity || 0),
            unit: item.unit || "ADET",
            unitPrice: safeDecimal(item.unitPrice || 0),
            vatRate: safeDecimal(item.vatRate || 0),
            vatAmount: safeDecimal(item.vatAmount || 0),
            lineTotal: safeDecimal(item.lineTotal || 0),
            lotNo: item.lotNo || null,
            raw: item,
          },
        });
      }
    }
    if (
      classification.targetType === "MUSTERIDEN_GELEN_IRSALIYE" &&
      isCustomerDispatch
    ) {
      await this.prisma.customerDispatchLine.deleteMany({
        where: { mainCompanySlug: slug, documentId: saved.id },
      });
      for (const item of fields.items || []) {
        await this.prisma.customerDispatchLine.create({
          data: {
            mainCompanySlug: slug,
            musteriIrsaliyeId: saved.id,
            documentId: saved.id,
            aciklama:
              item.aciklama || item.rawDescription || item.productName || null,
            adet: safeDecimal(item.adet || item.quantity || 0),
            birim: item.birim || item.unit || "ADET",
            modelAdiOnerisi:
              item.modelAdiOnerisi ||
              this.modelSuggestionFromDescription(
                item.aciklama || item.rawDescription,
              ),
            durum: item.durum || "MODEL_BAGLANTISI_BEKLIYOR",
          },
        });
      }
    }
    await this.linkInvoiceDispatch(slug, saved.id);
    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId: saved.id },
      orderBy: [{ lineNo: "asc" }],
    });
    return dbSuccess(this.mapDocument(saved, invoiceItems));
  }

  async reprocessPendingDocuments(mainCompanySlug: string) {
    const slug = await this.scope(mainCompanySlug);
    const rows = await this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        OR: [
          { routeStatus: "UNKNOWN" },
          { status: "tasnif_bekliyor" },
          { documentType: "bilinmeyen" },
        ],
      },
      take: 250,
    });
    const results = [];
    for (const row of rows) {
      try {
        results.push(await this.reprocessDocument(slug, row.id));
      } catch (error: any) {
        results.push({
          ok: false,
          id: row.id,
          message: normalizeText(error?.message),
        });
      }
    }
    return dbSuccess({ count: results.length, results });
  }

  listModelReconciliations(mainCompanySlug: string) {
    const slug = requireMainCompanySlug(mainCompanySlug);
    return dbSuccess(
      this.sqlStore.readMainCompanyStore<any[]>(
        slug,
        "model-reconciliations",
        [],
      ),
    );
  }

  async completeModelReconciliation(
    mainCompanySlug: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(
      requireMainCompanySlug(payload.mainCompanySlug || mainCompanySlug),
    );
    if (payload.confirm !== true) {
      throw new BadRequestException("Mutabakat onayı için confirm=true zorunludur.");
    }

    const modelId = normalizeText(payload.modelId || payload.modelKaydiId);
    const modelName = normalizeText(payload.modelName || payload.modelAdi);
    const dispatchIds = [...new Set(
      (Array.isArray(payload.dispatchIds) ? payload.dispatchIds : [])
        .map((value: any) => normalizeText(value))
        .filter(Boolean),
    )];
    const invoiceIds = [...new Set(
      (Array.isArray(payload.invoiceIds) ? payload.invoiceIds : [])
        .map((value: any) => normalizeText(value))
        .filter(Boolean),
    )];
    const tolerance = Math.max(0, Number(payload.tolerance || 0) || 0);
    if (!modelId || !modelName) {
      throw new BadRequestException("Mutabakat için model seçimi zorunludur.");
    }
    if (!dispatchIds.length || !invoiceIds.length) {
      throw new BadRequestException(
        "En az bir müşteri irsaliyesi ve bir kesilen fatura seçilmelidir.",
      );
    }

    const model = await this.prisma.modelRecord.findFirst({
      where: { id: modelId, mainCompanySlug: slug },
    });
    if (!model) throw new NotFoundException("Mutabakat modeli bulunamadı.");

    const documentIds = [...dispatchIds, ...invoiceIds];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, mainCompanySlug: slug, deletedAt: null },
    });
    if (documents.length !== documentIds.length) {
      throw new NotFoundException("Seçilen irsaliye veya faturanın bir kısmı bulunamadı.");
    }

    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId: { in: documentIds } },
    });
    const itemsByDocument = new Map<string, any[]>();
    invoiceItems.forEach((item) => {
      itemsByDocument.set(item.documentId, [
        ...(itemsByDocument.get(item.documentId) || []),
        item,
      ]);
    });
    const quantityOf = (document: any) => {
      const raw = this.documentRaw(document);
      const draft = this.asObject(raw.taslakAlanlar);
      const direct = Number(
        draft.gelenAdet ??
          draft.adet ??
          raw.gelenAdet ??
          raw.adet ??
          raw.quantity ??
          0,
      );
      if (Number.isFinite(direct) && direct > 0) return direct;
      const itemTotal = (itemsByDocument.get(document.id) || []).reduce(
        (sum: number, item: any) => sum + decimalToNumber(item.quantity),
        0,
      );
      if (itemTotal > 0) return itemTotal;
      const rawLines = Array.isArray(raw.kalemler)
        ? raw.kalemler
        : Array.isArray(raw.lines)
          ? raw.lines
          : [];
      return rawLines.reduce(
        (sum: number, item: any) =>
          sum + Number(item.adet ?? item.quantity ?? item.miktar ?? 0),
        0,
      );
    };
    const requireModelLink = (document: any) => {
      const raw = this.documentRaw(document);
      if (normalizeText(raw.modelId || raw.modelKaydiId) !== modelId) {
        throw new BadRequestException(
          `${document.documentNo || document.id} önce seçili modele eşleştirilmelidir.`,
        );
      }
    };
    documents.forEach(requireModelLink);

    const dispatchSet = new Set(dispatchIds);
    const invoiceSet = new Set(invoiceIds);
    const dispatchQty = documents
      .filter((row) => dispatchSet.has(row.id))
      .reduce((sum, row) => sum + quantityOf(row), 0);
    const invoiceQty = documents
      .filter((row) => invoiceSet.has(row.id))
      .reduce((sum, row) => sum + quantityOf(row), 0);
    const productionQty = this.sqlStore
      .readMainCompanyStore<any[]>(slug, "uretim.kayitlar", [])
      .filter(
        (row) =>
          normalizeText(row.modelId || row.modelKaydiId) === modelId,
      )
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row.netAdet ??
              row.uretimAdedi ??
              row.adet ??
              row.quantity ??
              0,
          ),
        0,
      );
    if (dispatchQty <= 0 || invoiceQty <= 0 || productionQty <= 0) {
      throw new BadRequestException(
        "İrsaliye, imalat ve fatura adetleri sıfırdan büyük olmadan mutabakat tamamlanamaz.",
      );
    }

    const differences = {
      irsaliyeFatura: dispatchQty - invoiceQty,
      imalatFatura: productionQty - invoiceQty,
      irsaliyeImalat: dispatchQty - productionQty,
    };
    const maxDifference = Math.max(
      ...Object.values(differences).map((value) => Math.abs(value)),
    );
    if (maxDifference > tolerance) {
      throw new BadRequestException(
        `En yüksek adet farkı ${maxDifference}. Onay toleransı ${tolerance} olduğu için işlem beklemede bırakıldı.`,
      );
    }

    const now = new Date();
    const reconciliation = {
      id: normalizeText(payload.id) || crypto.randomUUID(),
      mainCompanySlug: slug,
      modelId,
      modelName,
      dispatchIds,
      invoiceIds,
      dispatchQty,
      productionQty,
      invoiceQty,
      differences,
      tolerance,
      toleranceUsed: maxDifference > 0,
      note: normalizeText(payload.note || payload.aciklama),
      status: "TAMAMLANDI",
      approvedBy: normalizeText(payload.actor) || "system",
      approvedAt: now.toISOString(),
    };

    await this.prisma.$transaction(async (tx) => {
      for (const document of documents) {
        const raw = this.documentRaw(document);
        const isDispatch = dispatchSet.has(document.id);
        await tx.document.update({
          where: { id: document.id },
          data: {
            status: isDispatch ? "irsaliye_tamamlandi" : document.status,
            raw: {
              ...raw,
              durum: isDispatch ? "irsaliye_tamamlandi" : raw.durum,
              reconciliation,
              reconciliationStatus: "TAMAMLANDI",
            },
          },
        });
      }
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "muhasebe",
          action: "model_mutabakat_tamamla",
          entityType: "model_reconciliation",
          entityId: reconciliation.id,
          actionType: "model_mutabakat_tamamla",
          description: `${modelName} için irsaliye, imalat ve fatura mutabakatı tamamlandı`,
          newValue: reconciliation,
          actor: reconciliation.approvedBy,
        },
      });
    });

    const rows = this.sqlStore.readMainCompanyStore<any[]>(
      slug,
      "model-reconciliations",
      [],
    );
    const next = [
      reconciliation,
      ...rows.filter((row) => normalizeText(row.modelId) !== modelId),
    ];
    this.sqlStore.writeMainCompanyStore(slug, "model-reconciliations", next);
    return dbSuccess(reconciliation);
  }

  async getDocument(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { company: true, files: true, movements: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId: row.id },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
    });
    const dispatchLines = await this.prisma.customerDispatchLine.findMany({
      where: {
        mainCompanySlug: slug,
        documentId: row.id,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }],
    });
    return dbSuccess(this.mapDocument(row, invoiceItems, dispatchLines));
  }

  private async resolveModelForDocument(slug: string, modelId: string) {
    if (!modelId) return null;
    const persisted = await this.prisma.modelRecord.findFirst({
      where: { id: modelId, mainCompanySlug: slug },
    });
    if (persisted) return persisted;
    const shared = await this.modelService.list({
      mainCompanySlug: slug,
      page: 1,
      pageSize: 5000,
    });
    return (shared?.rows || []).find(
      (row: any) => String(row?.id || row?.modelId) === String(modelId),
    ) || null;
  }

  async saveManualModelDocument(
    mainCompanySlug: string,
    id: string | undefined,
    payload: Query = {},
    requestedTarget = "MUSTERIDEN_GELEN_IRSALIYE",
  ) {
    const slug = await this.scope(
      requireMainCompanySlug(payload.mainCompanySlug || mainCompanySlug),
    );
    const isInvoice = requestedTarget === "BIZIM_GIDEN_FATURA";
    const documentType = isInvoice
      ? "bizim_kestigimiz_fatura"
      : "musteriden_gelen_irsaliye";
    const detectedType = isInvoice ? "FATURA" : "IRSALIYE";
    const quantity = Number(
      payload.quantity ?? payload.adet ?? payload.gelenAdet ?? 0,
    );
    const unitPrice = Number(
      payload.unitPrice ?? payload.birimFiyat ?? payload.fiyat ?? 0,
    );
    const vatRate = isInvoice
      ? Number(payload.vatRate ?? payload.kdvOrani ?? payload.kdv ?? 0)
      : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException("Adet 0'dan büyük olmalıdır.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new BadRequestException("Birim fiyat 0 veya daha büyük olmalıdır.");
    }

    const existing = id
      ? await this.prisma.document.findFirst({
          where: { id, mainCompanySlug: slug, deletedAt: null },
          include: { company: true, files: true },
        })
      : null;
    if (id && !existing) throw new NotFoundException("Belge bulunamadı.");

    const modelId = normalizeText(payload.modelId || payload.modelKaydiId);
    const model = modelId
      ? await this.resolveModelForDocument(slug, modelId)
      : null;
    if (modelId && !model) {
      throw new NotFoundException("Bağlanacak model bulunamadı.");
    }
    const modelName = normalizeText(
      model?.modelName || payload.modelName || payload.modelAdi,
    );
    const companyName = normalizeText(
      payload.companyName || payload.firmaAdi || payload.firma,
    );
    if (!companyName) throw new BadRequestException("Firma zorunludur.");
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");

    const dateText =
      normalizeText(payload.date || payload.tarih) ||
      new Date().toISOString().slice(0, 10);
    const generatedPrefix = isInvoice ? "MANUEL-FAT" : "MANUEL-IRS";
    const generatedNo = `${generatedPrefix}-${new Date()
      .toISOString()
      .replace(/\D/g, "")
      .slice(0, 14)}`;
    const documentNo =
      normalizeText(
        payload.documentNo ||
          payload.belgeNo ||
          (isInvoice ? payload.faturaNo : payload.irsaliyeNo),
      ) || existing?.documentNo || generatedNo;
    const duplicate = await this.prisma.document.findFirst({
      where: {
        mainCompanySlug: slug,
        documentType,
        documentNo,
        deletedAt: null,
        ...(existing?.id ? { id: { not: existing.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException("Bu belge numarası daha önce kaydedildi.");
    }

    const subtotal = Number((quantity * unitPrice).toFixed(2));
    const vatTotal = Number(((subtotal * vatRate) / 100).toFixed(2));
    const grandTotal = Number((subtotal + vatTotal).toFixed(2));
    const oldRaw = existing ? this.documentRaw(existing) : {};
    const note = normalizeText(payload.notes || payload.not || payload.aciklama);
    const line = {
      lineNo: 1,
      aciklama: modelName,
      productName: modelName,
      rawDescription: modelName,
      adet: quantity,
      quantity,
      birim: "ADET",
      unit: "ADET",
      birimFiyat: unitPrice,
      unitPrice,
      lineTotal: subtotal,
      modelId: model?.id || modelId,
      modelAdi: modelName,
      durum: modelId ? "MODELE_BAGLI" : "MODEL_BAGLANTISI_BEKLIYOR",
    };
    const taslakAlanlar = {
      ...(oldRaw.taslakAlanlar || {}),
      belgeNo: documentNo,
      faturaNo: isInvoice ? documentNo : "",
      irsaliyeNo: isInvoice
        ? normalizeText(payload.bagliIrsaliyeNo || payload.irsaliyeNo)
        : documentNo,
      bagliIrsaliyeNo: isInvoice
        ? normalizeText(payload.bagliIrsaliyeNo || payload.irsaliyeNo)
        : "",
      tarih: dateText,
      firmaAdi: companyName,
      saticiUnvan: isInvoice ? "" : companyName,
      aliciUnvan: isInvoice ? companyName : "",
      adet: quantity,
      gelenAdet: quantity,
      birimFiyat: unitPrice,
      fiyat: unitPrice,
      araToplam: subtotal,
      kdvOrani: vatRate,
      kdvToplam: vatTotal,
      genelToplam: grandTotal,
      modelId: model?.id || modelId,
      modelAdi: modelName,
      aciklama: note,
    };
    const status = modelId ? "islem_bekliyor" : "model_baglantisi_bekliyor";
    const raw = {
      ...oldRaw,
      source: "MODEL_TAKIP_SERI_GIRIS",
      manualEntry: true,
      targetType: requestedTarget,
      targetModule: "MUHASEBE_MODEL_TAKIP",
      routeStatus: modelId ? "ROUTED" : "ROUTED_NEEDS_MODEL",
      routeMessage: modelId
        ? "Seri girişten modele bağlı kaydedildi"
        : "Seri giriş kaydı model bağlantısı bekliyor",
      durum: status,
      modelId: model?.id || modelId,
      modelKaydiId: model?.id || modelId,
      modelName,
      modelAdi: modelName,
      unitPrice,
      birimFiyat: unitPrice,
      quantity,
      notes: note,
      taslakAlanlar,
      kalemler: [line],
      needsReview: !modelId,
      parseConfidence: 1,
    };

    const saved = await this.prisma.$transaction(async (tx) => {
      const document = existing
        ? await tx.document.update({
            where: { id: existing.id },
            data: {
              documentNo,
              documentType,
              sourceType: "MANUAL",
              date: this.optionalDate(dateText),
              subtotal: safeDecimal(subtotal),
              vatTotal: safeDecimal(vatTotal),
              grandTotal: safeDecimal(grandTotal),
              status,
              detectedType,
              targetType: requestedTarget,
              targetModule: "MUHASEBE_MODEL_TAKIP",
              confidence: safeDecimal(100),
              routeStatus: modelId ? "ROUTED" : "ROUTED_NEEDS_MODEL",
              routeMessage: raw.routeMessage,
              raw,
              metadata: raw,
            },
          })
        : await tx.document.create({
            data: {
              mainCompanySlug: slug,
              documentNo,
              documentType,
              sourceType: "MANUAL",
              date: this.optionalDate(dateText),
              subtotal: safeDecimal(subtotal),
              vatTotal: safeDecimal(vatTotal),
              grandTotal: safeDecimal(grandTotal),
              status,
              detectedType,
              targetType: requestedTarget,
              targetModule: "MUHASEBE_MODEL_TAKIP",
              confidence: safeDecimal(100),
              routeStatus: modelId ? "ROUTED" : "ROUTED_NEEDS_MODEL",
              routeMessage: raw.routeMessage,
              raw,
              metadata: raw,
            },
          });
      const finalRaw = { ...raw, targetRecordId: document.id };
      await tx.document.update({
        where: { id: document.id },
        data: { targetRecordId: document.id, raw: finalRaw, metadata: finalRaw },
      });

      if (isInvoice) {
        await tx.invoiceItem.deleteMany({
          where: { mainCompanySlug: slug, documentId: document.id },
        });
        await tx.invoiceItem.create({
          data: {
            mainCompanySlug: slug,
            documentId: document.id,
            lineNo: 1,
            productName: modelName,
            normalizedProductName: normalizeSearchText(modelName),
            description: modelName,
            quantity: safeDecimal(quantity),
            unit: "ADET",
            unitPrice: safeDecimal(unitPrice),
            vatRate: safeDecimal(vatRate),
            vatAmount: safeDecimal(vatTotal),
            lineTotal: safeDecimal(subtotal),
            raw: line,
          },
        });
      } else {
        await tx.customerDispatchLine.deleteMany({
          where: { mainCompanySlug: slug, documentId: document.id },
        });
        await tx.customerDispatchLine.create({
          data: {
            mainCompanySlug: slug,
            musteriIrsaliyeId: document.id,
            documentId: document.id,
            aciklama: modelName,
            adet: safeDecimal(quantity),
            birim: "ADET",
            modelId: model?.id || modelId || null,
            modelAdi: modelName,
            modelAdiOnerisi: modelName,
            durum: modelId ? "MODELE_BAGLI" : "MODEL_BAGLANTISI_BEKLIYOR",
          },
        });
      }
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "muhasebe",
          entityType: "document",
          entityId: document.id,
          actionType: existing ? "UPDATED" : "CREATED",
          action: "model_takip_seri_giris",
          description: `${documentNo} seri işlem ekranından ${existing ? "güncellendi" : "kaydedildi"}`,
          oldValue: existing || undefined,
          newValue: finalRaw,
        },
      });
      return tx.document.findFirst({
        where: { id: document.id },
        include: { company: true, files: true },
      });
    });
    if (!saved) throw new NotFoundException("Belge kaydedilemedi.");
    const invoiceItems = isInvoice
      ? await this.prisma.invoiceItem.findMany({
          where: { mainCompanySlug: slug, documentId: saved.id },
          orderBy: { lineNo: "asc" },
        })
      : [];
    return dbSuccess(this.mapDocument(saved, invoiceItems));
  }

  async updateDocument(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug },
      include: { company: true, files: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const oldRaw = this.documentRaw(row);
    const nextRaw = {
      ...oldRaw,
      ...(payload.raw && typeof payload.raw === "object" ? payload.raw : {}),
      taslakAlanlar: {
        ...(oldRaw.taslakAlanlar || {}),
        ...(payload.taslakAlanlar && typeof payload.taslakAlanlar === "object"
          ? payload.taslakAlanlar
          : {}),
      },
      kalemler: Array.isArray(payload.kalemler)
        ? payload.kalemler
        : Array.isArray(payload.lines)
          ? payload.lines
          : oldRaw.kalemler || [],
      needsReview:
        payload.needsReview !== undefined
          ? Boolean(payload.needsReview)
          : Boolean(oldRaw.needsReview),
      parseConfidence:
        payload.parseConfidence !== undefined
          ? Number(payload.parseConfidence || 0)
          : Number(oldRaw.parseConfidence || 0),
      durum: normalizeText(
        payload.durum ||
          payload.status ||
          row.status ||
          oldRaw.durum ||
          "kontrol_bekliyor",
      ),
    };

    const saved = await this.prisma.document.update({
      where: { id: row.id },
      data: {
        targetRecordId:
          payload.targetRecordId !== undefined
            ? normalizeText(payload.targetRecordId) || null
            : undefined,
        documentType:
          payload.belgeTipi !== undefined || payload.documentType !== undefined
            ? normalizeText(payload.belgeTipi || payload.documentType) || null
            : undefined,
        documentNo:
          payload.documentNo !== undefined || payload.faturaNo !== undefined
            ? normalizeText(
                payload.documentNo ||
                  payload.faturaNo ||
                  nextRaw?.taslakAlanlar?.belgeNo,
              ) || null
            : undefined,
        date:
          payload.tarih !== undefined || payload.documentDate !== undefined
            ? this.optionalDate(
                payload.tarih ||
                  payload.documentDate ||
                  nextRaw?.taslakAlanlar?.tarih,
              )
            : undefined,
        subtotal:
          payload.araToplam !== undefined
            ? safeDecimal(payload.araToplam)
            : nextRaw?.taslakAlanlar?.araToplam !== undefined
              ? safeDecimal(nextRaw.taslakAlanlar.araToplam)
              : undefined,
        vatTotal:
          payload.kdvToplam !== undefined || payload.kdv !== undefined
            ? safeDecimal(payload.kdvToplam ?? payload.kdv)
            : nextRaw?.taslakAlanlar?.kdvToplam !== undefined
              ? safeDecimal(nextRaw.taslakAlanlar.kdvToplam)
              : undefined,
        grandTotal:
          payload.genelToplam !== undefined
            ? safeDecimal(payload.genelToplam)
            : nextRaw?.taslakAlanlar?.genelToplam !== undefined
              ? safeDecimal(nextRaw.taslakAlanlar.genelToplam)
              : undefined,
        status: nextRaw.durum || "kontrol_bekliyor",
        raw: nextRaw,
        metadata: row.metadata ?? nextRaw,
      },
      include: { company: true, files: true },
    });

    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "document",
      entityId: id,
      actionType: "UPDATED",
      oldValue: row,
      newValue: saved,
    });

    return dbSuccess(this.mapDocument(saved));
  }

  async rejectDocument(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(mainCompanySlug);
    const reason = normalizeText(
      payload.rejectReason || payload.reason || "Reddedildi",
    );
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.document.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      if (!old) throw new NotFoundException("Belge bulunamadi.");
      const status = this.documentStatus(old).toLocaleLowerCase("tr-TR");
      if (["islendi", "processed"].includes(status))
        throw new BadRequestException("İşlenmiş belge reddedilemez.");
      if (["reddedildi", "rejected"].includes(status))
        throw new BadRequestException("Belge zaten reddedilmiş.");
      const oldRaw = this.documentRaw(old);
      const raw = {
        ...oldRaw,
        durum: "reddedildi",
        rejectReason: reason,
        rejectedAt: new Date().toISOString(),
      };
      const saved = await tx.document.update({
        where: { id: old.id },
        data: {
          status: "reddedildi",
          rejectReason: reason,
          raw,
          metadata: old.metadata ?? raw,
        },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "muhasebe",
          action: "belge_reddet",
          entityType: "document",
          entityId: id,
          actionType: "belge_reddet",
          description: "Belge reddedildi",
          oldValue: old,
          newValue: saved,
          afterData: { rejectReason: reason },
          actor: normalizeText(payload.actor) || "system",
        },
      });
      return dbSuccess(this.mapDocument(saved));
    });
  }

  async approveDocument(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const requestedSlug = requireMainCompanySlug(
      payload.mainCompanySlug || mainCompanySlug,
    );
    const slug = await this.scope(requestedSlug);
    if (payload.confirm !== true)
      throw new BadRequestException("Onay için confirm=true gönderilmelidir.");
    if (
      normalizeText(payload.mainCompanySlug) &&
      normalizeText(payload.mainCompanySlug) !== slug
    ) {
      throw new BadRequestException(
        "mainCompanySlug belge ana firması ile eşleşmiyor.",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const document = await tx.document.findFirst({
          where: { id, mainCompanySlug: slug },
          include: { company: true, files: true },
        });
        if (!document) throw new NotFoundException("Belge bulunamadi.");
        const status = this.documentStatus(document).toLocaleLowerCase("tr-TR");
        if (["islendi", "processed"].includes(status))
          throw new BadRequestException("Bu belge daha önce işlenmiş.");
        if (["reddedildi", "rejected"].includes(status))
          throw new BadRequestException("Reddedilmiş belge onaylanamaz.");

        const documentType = this.normalizeDocumentType(
          document.documentType || this.documentRaw(document).belgeTipi,
        );
        if (!documentType || documentType === "bilinmeyen")
          throw new BadRequestException(
            "Belge tipi netleşmeden onay yapılamaz.",
          );

        if (
          [
            "bizim_kestigimiz_fatura",
            "bizim_kestigimiz_irsaliye",
            "musteriden_gelen_irsaliye",
          ].includes(documentType)
        ) {
          return dbSuccess(
            await this.approveModelLinkedDocument(tx, slug, document, payload),
          );
        }
        if (documentType !== "tedarikci_gelen_fatura") {
          throw new BadRequestException("Bilinmeyen belge tipi onaylanamaz.");
        }
        return dbSuccess(
          await this.approveSupplierInvoiceDocument(
            tx,
            slug,
            document,
            payload,
          ),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async linkDocumentToModel(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(
      requireMainCompanySlug(payload.mainCompanySlug || mainCompanySlug),
    );
    const modelId = normalizeText(payload.modelId || payload.modelKaydiId);
    const modelName = normalizeText(payload.modelName || payload.modelAdi);
    if (!modelId || !modelName) {
      throw new BadRequestException("Belge bağlantısı için model zorunludur.");
    }
    const model = await this.resolveModelForDocument(slug, modelId);
    if (!model) throw new NotFoundException("Bağlanacak model bulunamadı.");

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, mainCompanySlug: slug, deletedAt: null },
        include: { company: true, files: true },
      });
      if (!document) throw new NotFoundException("Belge bulunamadı.");
      const documentType = this.normalizeDocumentType(
        document.documentType || this.documentRaw(document).belgeTipi,
      );
      if (
        ![
          "bizim_kestigimiz_fatura",
          "bizim_kestigimiz_irsaliye",
          "musteriden_gelen_irsaliye",
        ].includes(documentType)
      ) {
        throw new BadRequestException(
          "Yalnızca müşteri irsaliyesi veya bizim kestiğimiz belge modele bağlanabilir.",
        );
      }
      return dbSuccess(
        await this.approveModelLinkedDocument(tx, slug, document, {
          ...payload,
          modelId,
          modelName,
        }),
      );
    });
  }

  async linkIncomingDeliveryLinesToModels(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = await this.scope(
      requireMainCompanySlug(payload.mainCompanySlug || mainCompanySlug),
    );
    const requested = Array.isArray(payload.allocations)
      ? payload.allocations
      : [];
    if (!requested.length) {
      throw new BadRequestException("En az bir model dağıtım satırı zorunludur.");
    }

    const allocations: any[] = [];
    for (let index = 0; index < requested.length; index += 1) {
      const item = requested[index] || {};
      const modelId = normalizeText(item.modelId || item.modelKaydiId);
      const quantity = Number(item.quantity ?? item.adet ?? 0);
      const unitPrice = Number(item.unitPrice ?? item.birimFiyat ?? 0);
      if (!modelId || !Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `${index + 1}. dağıtım satırında model ve 0'dan büyük adet zorunludur.`,
        );
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          `${index + 1}. dağıtım satırında birim fiyat geçersizdir.`,
        );
      }
      const model = await this.resolveModelForDocument(slug, modelId);
      if (!model) {
        throw new NotFoundException(
          `${index + 1}. satır için bağlanacak model bulunamadı.`,
        );
      }
      const modelName = normalizeText(
        item.modelName ||
          item.modelAdi ||
          model.modelName ||
          model.modelAdi ||
          model.name,
      );
      allocations.push({
        id: normalizeText(item.id) || `allocation-${index + 1}`,
        sourceLineId: normalizeText(item.sourceLineId),
        description: normalizeText(
          item.description || item.aciklama || item.rawDescription || modelName,
        ),
        quantity,
        unitPrice,
        modelId,
        modelName,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, mainCompanySlug: slug, deletedAt: null },
        include: { company: true, files: true },
      });
      if (!document) throw new NotFoundException("İrsaliye bulunamadı.");
      const documentType = this.normalizeDocumentType(
        document.documentType || this.documentRaw(document).belgeTipi,
      );
      if (documentType !== "musteriden_gelen_irsaliye") {
        throw new BadRequestException(
          "Çoklu model dağıtımı yalnızca müşteriden gelen irsaliyelerde yapılabilir.",
        );
      }

      const previousRaw = this.documentRaw(document);
      const uniqueModels = Array.from(
        new Map(
          allocations.map((item) => [
            item.modelId,
            { modelId: item.modelId, modelName: item.modelName },
          ]),
        ).values(),
      );
      const totalQuantity = allocations.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const subtotal = allocations.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const singleModel = uniqueModels.length === 1 ? uniqueModels[0] : null;
      const nextDocumentNo =
        normalizeText(payload.documentNo || payload.irsaliyeNo) ||
        document.documentNo;
      const nextCompanyName = normalizeText(
        payload.companyName || payload.firma || payload.firmaAdi,
      );
      const nextDate = normalizeText(payload.date || payload.tarih);
      const nextRaw = {
        ...previousRaw,
        durum: "islem_bekliyor",
        routeStatus: "ROUTED",
        routeMessage:
          uniqueModels.length > 1
            ? `${uniqueModels.length} modele satır bazında bağlandı`
            : "İrsaliye modele bağlandı",
        modelId: singleModel?.modelId || "",
        modelKaydiId: singleModel?.modelId || "",
        modelName: singleModel?.modelName || "",
        modelAdi: singleModel?.modelName || "",
        modelIds: uniqueModels.map((item) => item.modelId),
        modelNames: uniqueModels.map((item) => item.modelName),
        modelAllocations: allocations,
        quantity: totalQuantity,
        unitPrice:
          allocations.length === 1 ? allocations[0].unitPrice : 0,
        birimFiyat:
          allocations.length === 1 ? allocations[0].unitPrice : 0,
        needsReview: false,
        taslakAlanlar: {
          ...(previousRaw.taslakAlanlar || {}),
          belgeNo: nextDocumentNo,
          irsaliyeNo: nextDocumentNo,
          tarih:
            nextDate ||
            document.date?.toISOString?.().slice(0, 10) ||
            "",
          firmaAdi:
            nextCompanyName ||
            previousRaw.taslakAlanlar?.firmaAdi ||
            "",
          adet: totalQuantity,
          gelenAdet: totalQuantity,
          modelId: singleModel?.modelId || "",
          modelAdi:
            singleModel?.modelName || `${uniqueModels.length} model bağlı`,
          araToplam: Number(subtotal.toFixed(2)),
          genelToplam: Number(subtotal.toFixed(2)),
        },
      };

      await tx.customerDispatchLine.deleteMany({
        where: { mainCompanySlug: slug, documentId: document.id },
      });
      for (const item of allocations) {
        await tx.customerDispatchLine.create({
          data: {
            mainCompanySlug: slug,
            musteriIrsaliyeId: document.id,
            documentId: document.id,
            aciklama: item.description || item.modelName,
            adet: safeDecimal(item.quantity),
            birim: "ADET",
            modelId: item.modelId,
            modelAdi: item.modelName,
            modelAdiOnerisi: item.description || item.modelName,
            durum: "MODELE_BAGLI",
          },
        });
      }

      await tx.modelDocumentLink.deleteMany({
        where: { mainCompanySlug: slug, documentId: document.id },
      });
      for (const item of uniqueModels) {
        await tx.modelDocumentLink.create({
          data: {
            mainCompanySlug: slug,
            modelId: item.modelId,
            documentId: document.id,
            raw: {
              source: "incoming_dispatch_allocation",
              documentType,
              modelName: item.modelName,
            },
          },
        });
      }

      const saved = await tx.document.update({
        where: { id: document.id },
        data: {
          documentNo: nextDocumentNo,
          ...(nextDate ? { date: this.optionalDate(nextDate) } : {}),
          status: "islem_bekliyor",
          routeStatus: "ROUTED",
          routeMessage: nextRaw.routeMessage,
          subtotal: safeDecimal(subtotal),
          grandTotal: safeDecimal(subtotal),
          raw: nextRaw,
          metadata: nextRaw,
        },
        include: { company: true, files: true },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "muhasebe",
          entityType: "document",
          entityId: document.id,
          actionType: "UPDATED",
          action: "irsaliye_coklu_model_dagitimi",
          description: `${document.documentNo || document.id} ${uniqueModels.length} modele dağıtıldı`,
          oldValue: previousRaw,
          newValue: nextRaw,
        },
      });
      const savedLines = await tx.customerDispatchLine.findMany({
        where: {
          mainCompanySlug: slug,
          documentId: document.id,
          deletedAt: null,
        },
        orderBy: [{ createdAt: "asc" }],
      });
      return dbSuccess(this.mapDocument(saved, [], savedLines));
    });
  }

  private async resolveApprovalCompany(
    tx: any,
    slug: string,
    document: any,
    draft: any,
  ) {
    if (draft.companyId) {
      const row = await tx.company.findFirst({
        where: { id: draft.companyId, mainCompanySlug: slug },
      });
      if (row) return row;
    }
    if (draft.companyName) {
      const normalizedName = normalizeSearchText(draft.companyName);
      const row = await tx.company.findFirst({
        where: {
          mainCompanySlug: slug,
          OR: [
            { normalizedName },
            { name: { equals: draft.companyName } },
          ],
        },
      });
      if (row) return row;
    }
    throw new BadRequestException(
      "Onay için companyId veya eşleşen firma zorunludur.",
    );
  }

  private async approveSupplierInvoiceDocument(
    tx: any,
    slug: string,
    document: any,
    payload: Query,
  ) {
    const draft = this.draftFromDocument(document, payload);
    const company = await this.resolveApprovalCompany(
      tx,
      slug,
      document,
      draft,
    );
    const lines = this.rawDocumentLines(document, payload).map(
      (line: any, index: number) => this.normalizeApprovalLine(line, index),
    );
    if (!lines.length)
      throw new BadRequestException("Tedarikçi fatura kalemleri zorunludur.");
    const subtotal =
      draft.subtotal || lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const vatTotal =
      draft.vatTotal || lines.reduce((sum, line) => sum + line.vatAmount, 0);
    const grandTotal = draft.grandTotal || subtotal + vatTotal;
    const accountingRule = this.supplierAccountingRule(company);
    const vatPercentagePayable = Number(
      ((vatTotal * accountingRule.vatPayablePercentage) / 100).toFixed(2),
    );
    const cariAmount =
      accountingRule.currentAccountPostingMode === "FULL_DOCUMENT"
        ? grandTotal
        : accountingRule.currentAccountPostingMode === "VAT_PERCENTAGE"
          ? vatPercentagePayable
          : 0;
    const now = new Date();

    await tx.invoiceItem.deleteMany({
      where: { mainCompanySlug: slug, documentId: document.id },
    });
    const createdInvoiceItems: string[] = [];
    const aliasUpdates: any[] = [];
    const lotWarnings: string[] = [];
    const rawMaterialLotIds: string[] = [];
    const vatGroups = new Map<
      number,
      { baseAmount: number; vatAmount: number }
    >();

    for (const line of lines) {
      const item = await tx.invoiceItem.create({
        data: {
          mainCompanySlug: slug,
          documentId: document.id,
          productId: line.productId,
          lineNo: line.lineNo,
          productName: line.productName || null,
          normalizedProductName: line.normalizedProductName || null,
          description: line.productName || null,
          quantity: safeDecimal(line.quantity),
          unit: line.unit,
          unitPrice: safeDecimal(line.unitPrice),
          vatRate: safeDecimal(line.vatRate),
          vatAmount: safeDecimal(line.vatAmount),
          lineTotal: safeDecimal(line.lineTotal),
          lotNo: line.lotNo,
          raw: line.raw,
        },
      });
      createdInvoiceItems.push(item.id);

      const vat = vatGroups.get(line.vatRate) || {
        baseAmount: 0,
        vatAmount: 0,
      };
      vat.baseAmount += line.lineTotal;
      vat.vatAmount += line.vatAmount;
      vatGroups.set(line.vatRate, vat);

      if (line.productId && line.normalizedProductName) {
        const existingAlias = await tx.productAlias.findFirst({
          where: {
            mainCompanySlug: slug,
            normalizedName: line.normalizedProductName,
          },
        });
        if (!existingAlias) {
          const alias = await tx.productAlias.create({
            data: {
              mainCompanySlug: slug,
              productId: line.productId,
              rawName: line.productName || line.normalizedProductName,
              normalizedName: line.normalizedProductName,
              packageInfo: line.packageInfo,
              raw: {
                source: "document_approval",
                documentId: document.id,
                packageInfo: line.packageInfo,
              },
            },
          });
          aliasUpdates.push({
            id: alias.id,
            normalizedName: alias.normalizedName,
            packageInfo: alias.packageInfo,
          });
        } else if (line.packageInfo && !existingAlias.packageInfo) {
          const alias = await tx.productAlias.update({
            where: { id: existingAlias.id },
            data: {
              packageInfo: line.packageInfo,
              raw: {
                ...(existingAlias.raw || {}),
                packageInfo: line.packageInfo,
              },
            },
          });
          aliasUpdates.push({
            id: alias.id,
            normalizedName: alias.normalizedName,
            packageInfo: alias.packageInfo,
          });
        }
      }

      if (!line.lotNo) {
        lotWarnings.push(
          `${line.productName || `Kalem ${line.lineNo}`}: lotNo yok`,
        );
      } else {
        const existingLot = await tx.rawMaterialLot.findFirst({
          where: { mainCompanySlug: slug, lotNo: line.lotNo },
        });
        if (!existingLot) {
          const lot = await tx.rawMaterialLot.create({
            data: {
              mainCompanySlug: slug,
              productId: line.productId,
              lotNo: line.lotNo,
              quantity: safeDecimal(line.quantity),
              raw: {
                source: "document_approval",
                documentId: document.id,
                documentNo: draft.documentNo,
                productName: line.productName,
                unit: line.unit,
              },
            },
          });
          rawMaterialLotIds.push(lot.id);
        }
      }
    }

    const movement = cariAmount > 0 ? await this.createLinkedMovement(tx, {
      mainCompanySlug: slug,
      companyId: company.id,
      date: draft.documentDate,
      movementType:
        accountingRule.currentAccountPostingMode === "VAT_PERCENTAGE"
          ? "KDV_PAYI_BORCU"
          : "fatura",
      sourceType: "tedarikci_gelen_fatura",
      documentNo: draft.documentNo,
      documentId: document.id,
      description: draft.note || `Tedarikçi gelen fatura ${draft.documentNo}`,
      effect: -cariAmount,
      raw: {
        source: "document_approval",
        documentId: document.id,
        documentType: "tedarikci_gelen_fatura",
        currentAccountPostingMode: accountingRule.currentAccountPostingMode,
        vatPayablePercentage: accountingRule.vatPayablePercentage,
        sourceVatAmount: vatTotal,
      },
    }) : null;

    await tx.vatRecord.deleteMany({
      where: {
        mainCompanySlug: slug,
        raw: { path: "$.sourceDocumentId", equals: document.id },
      },
    });
    const createdVatRecords: string[] = [];
    const periodYear = draft.documentDate.getUTCFullYear();
    const periodMonth = draft.documentDate.getUTCMonth() + 1;
    for (const [vatRate, totals] of vatGroups) {
      if (vatRate <= 0 && totals.vatAmount <= 0) continue;
      const row = await tx.vatRecord.create({
        data: {
          mainCompanySlug: slug,
          companyId: company.id,
          periodYear,
          periodMonth,
          vatDirection: "gelen",
          vatRate: safeDecimal(vatRate),
          baseAmount: safeDecimal(totals.baseAmount),
          vatAmount: safeDecimal(totals.vatAmount),
          documentNo: draft.documentNo || null,
          documentDate: draft.documentDate,
          incomingVat: safeDecimal(totals.vatAmount),
          raw: {
            sourceType: "tedarikci_gelen_fatura",
            sourceDocumentId: document.id,
            periodMonth: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
          },
        },
      });
      createdVatRecords.push(row.id);
    }

    const processedResult = {
      supplierInvoiceId: document.id,
      supplierInvoiceLineIds: createdInvoiceItems,
      createdInvoiceItems,
      createdVatRecords,
      createdMovementId: movement?.id || "",
      cariMovementId: movement?.id || "",
      currentAccountPostingMode: accountingRule.currentAccountPostingMode,
      vatPayablePercentage: accountingRule.vatPayablePercentage,
      vatPercentagePayable,
      kdvRecordIds: createdVatRecords,
      rawMaterialLotIds,
      lotWarnings,
      aliasUpdates,
      processedAt: now.toISOString(),
    };
    const previousRaw = this.documentRaw(document);
    const raw = {
      ...previousRaw,
      durum: "islendi",
      taslakAlanlar: {
        ...(previousRaw.taslakAlanlar || {}),
        belgeNo: draft.documentNo,
        faturaNo: draft.documentNo,
        tarih: draft.documentDate.toISOString().slice(0, 10),
        saticiUnvan: company.name,
        araToplam: subtotal,
        kdvToplam: vatTotal,
        genelToplam: grandTotal,
      },
      kalemler: lines.map((line) => line.raw),
      approvalSnapshot: {
        payload,
        documentType: "tedarikci_gelen_fatura",
        approvedAt: now.toISOString(),
      },
      processedResult,
      uyarilar: lotWarnings,
    };
    const saved = await tx.document.update({
      where: { id: document.id },
      data: {
        companyId: company.id,
        documentNo: draft.documentNo || null,
        date: draft.documentDate,
        subtotal: safeDecimal(subtotal),
        vatTotal: safeDecimal(vatTotal),
        grandTotal: safeDecimal(grandTotal),
        status: "islendi",
        processedAt: now,
        raw,
        metadata: document.metadata ?? raw,
      },
    });
    await tx.activityLog.create({
      data: {
        mainCompanySlug: slug,
        module: "muhasebe",
        action: "belge_onayla",
        entityType: "document",
        entityId: document.id,
        actionType: "belge_onayla",
        description: "Tedarikçi gelen fatura onaylandı",
        oldValue: document,
        newValue: saved,
        afterData: processedResult,
        actor: normalizeText(payload.actor) || "system",
      },
    });
    return this.mapDocument({
      ...saved,
      company,
      files: document.files || [],
      movements: movement ? [movement] : [],
    });
  }

  private async approveModelLinkedDocument(
    tx: any,
    slug: string,
    document: any,
    payload: Query,
  ) {
    const documentType = normalizeText(
      document.documentType || this.documentRaw(document).belgeTipi,
    );
    const modelId = normalizeText(payload.modelId || payload.modelKaydiId);
    const modelName = normalizeText(payload.modelName || payload.modelAdi);
    if (!modelId || !modelName)
      throw new BadRequestException(
        "Bu belge model bağlantısı olmadan onaylanamaz.",
      );
    const now = new Date();
    const modelRecord = await tx.modelRecord.findFirst({
      where: { id: modelId, mainCompanySlug: slug },
    });
    const modelRaw =
      modelRecord?.raw && typeof modelRecord.raw === "object"
        ? modelRecord.raw
        : {};
    const modelFolderPath = normalizeText(
      modelRaw.modelFolderPath || modelRaw.folderPath || modelRaw.modelPath,
    );
    let modelPath = "";
    if (modelFolderPath) {
      const primaryFile =
        (Array.isArray(document.files) ? document.files : []).find(
          (file: any) =>
            normalizeText(file.role).toLocaleLowerCase("tr-TR") === "pdf",
        ) || (Array.isArray(document.files) ? document.files[0] : null);
      const sourcePath = this.sourceFileAbsolutePath(primaryFile);
      if (sourcePath && fs.existsSync(sourcePath)) {
        fs.mkdirSync(modelFolderPath, { recursive: true });
        const originalName =
          normalizeText(primaryFile.fileName) ||
          path.basename(sourcePath || "") ||
          `${document.documentNo || document.id}.pdf`;
        const targetPath = path.join(
          modelFolderPath,
          this.sanitizeFilePart(originalName),
        );
        const finalPath = fs.existsSync(targetPath)
          ? targetPath
          : this.uniqueModelDocumentPath(modelFolderPath, originalName);
        if (!fs.existsSync(finalPath)) {
          fs.copyFileSync(sourcePath, finalPath);
        }
        modelPath = finalPath;
      }
    }
    await tx.modelDocumentLink.upsert({
      where: {
        mainCompanySlug_modelId_documentId: {
          mainCompanySlug: slug,
          modelId,
          documentId: document.id,
        },
      },
      update: { raw: { source: "document_approval", documentType, modelName } },
      create: {
        mainCompanySlug: slug,
        modelId,
        documentId: document.id,
        raw: { source: "document_approval", documentType, modelName },
      },
    });
    const previousRaw = this.documentRaw(document);
    const processedResult = {
      modelLink: { modelId, modelName, documentId: document.id, modelPath },
      processedAt: now.toISOString(),
    };
    const saved = await tx.document.update({
      where: { id: document.id },
      data: {
        status: "islendi",
        processedAt: now,
        raw: {
          ...previousRaw,
          durum: "islendi",
          storageStatus: "MODEL_LINKED",
          modelId,
          modelName,
          modelAdi: modelName,
          modelPath,
          processedResult,
          approvalSnapshot: {
            payload,
            documentType,
            approvedAt: now.toISOString(),
          },
        },
        metadata: document.metadata ?? { ...previousRaw, processedResult },
      },
    });
    await tx.activityLog.create({
      data: {
        mainCompanySlug: slug,
        module: "muhasebe",
        action: "belge_onayla",
        entityType: "document",
        entityId: document.id,
        actionType: "belge_onayla",
        description: "Model bağlantılı belge onaylandı",
        oldValue: document,
        newValue: saved,
        afterData: processedResult,
        actor: normalizeText(payload.actor) || "system",
      },
    });
    return this.mapDocument(saved);
  }

  async getDocumentFiles(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug },
      include: { files: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const mapped = this.mapDocument(row);
    return dbSuccess(Array.isArray(mapped.dosyalar) ? mapped.dosyalar : []);
  }

  async getDocumentPreviewPath(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { files: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadi.");
    const file =
      row.files.find(
        (item) => normalizeText(item.role).toLowerCase() === "pdf",
      ) || row.files[0];
    const fullPath = this.sourceFileAbsolutePath(file);
    if (!fullPath || !fs.existsSync(fullPath)) {
      throw new NotFoundException("Belge önizleme dosyası bulunamadı.");
    }
    return fullPath;
  }

  async listVat(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const where: Prisma.VatRecordWhereInput = { mainCompanySlug };
    if (query.periodMonth) {
      const [year, month] = String(query.periodMonth).split("-").map(Number);
      if (year && month)
        Object.assign(where, { periodYear: year, periodMonth: month });
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vatRecord.count({ where }),
      this.prisma.vatRecord.findMany({
        where,
        include: { company: true },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(rows, page, limit, total);
  }

  async vatSummary(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const where: Prisma.VatRecordWhereInput = { mainCompanySlug };
    if (query.periodMonth) {
      const [year, month] = String(query.periodMonth).split("-").map(Number);
      if (year && month)
        Object.assign(where, { periodYear: year, periodMonth: month });
    }
    const totals = await this.prisma.vatRecord.aggregate({
      where,
      _sum: { incomingVat: true, outgoingVat: true, carryVat: true },
    });
    return dbSuccess({
      incomingVat: decimalToNumber(totals._sum.incomingVat),
      outgoingVat: decimalToNumber(totals._sum.outgoingVat),
      carryVat: decimalToNumber(totals._sum.carryVat),
      netVat:
        decimalToNumber(totals._sum.outgoingVat) -
        decimalToNumber(totals._sum.incomingVat) -
        decimalToNumber(totals._sum.carryVat),
    });
  }

  async saveCarryVat(mainCompanySlug: string, payload: Query) {
    const slug = await this.scope(mainCompanySlug);
    const [year, month] = String(payload.periodMonth || "")
      .split("-")
      .map(Number);
    if (!year || !month)
      throw new BadRequestException(
        "periodMonth YYYY-MM formatinda zorunludur.",
      );
    const row = await this.prisma.vatRecord.create({
      data: {
        mainCompanySlug: slug,
        periodYear: year,
        periodMonth: month,
        carryVat: safeDecimal(payload.amount ?? payload.carryVat ?? 0),
        raw: { source: "manual_carry_vat", note: normalizeText(payload.note) },
      },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "vat_record",
      entityId: row.id,
      actionType: "CREATED",
      newValue: row,
    });
    return dbSuccess(row);
  }

  async updateVat(mainCompanySlug: string, id: string, payload: Query) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.vatRecord.update({
      where: { id },
      data: {
        incomingVat:
          payload.incomingVat !== undefined
            ? safeDecimal(payload.incomingVat)
            : undefined,
        outgoingVat:
          payload.outgoingVat !== undefined
            ? safeDecimal(payload.outgoingVat)
            : undefined,
        carryVat:
          payload.carryVat !== undefined
            ? safeDecimal(payload.carryVat)
            : undefined,
        raw: payload.raw ?? undefined,
      },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "vat_record",
      entityId: row.id,
      actionType: "UPDATED",
      newValue: row,
    });
    return dbSuccess(row);
  }

  async listPayments(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const where: Prisma.PaymentWhereInput = { mainCompanySlug };
    if (query.companyId) where.companyId = normalizeText(query.companyId);
    if (query.dateFrom || query.dateTo) {
      where.paymentDate = {};
      if (query.dateFrom)
        where.paymentDate.gte = this.dateOrToday(query.dateFrom);
      if (query.dateTo)
        where.paymentDate.lte = new Date(
          `${String(query.dateTo).slice(0, 10)}T23:59:59.999Z`,
        );
    }
    const q = normalizeText(query.q);
    if (q) {
      where.OR = [
        { paymentType: { contains: q } },
        { description: { contains: q } },
        { documentNo: { contains: q } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    const companyIds = [
      ...new Set(rows.map((row: any) => row.companyId).filter(Boolean)),
    ];
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds }, mainCompanySlug },
        })
      : [];
    const byId = new Map(companies.map((company) => [company.id, company]));
    return makePaginatedResponse(
      rows.map((row: any) =>
        this.mapPayment({ ...row, company: byId.get(row.companyId) }),
      ),
      page,
      limit,
      total,
    );
  }

  async getPayment(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.payment.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!row) throw new NotFoundException("Odeme bulunamadi.");
    const company = await this.prisma.company.findFirst({
      where: { id: row.companyId, mainCompanySlug: slug },
    });
    return dbSuccess(this.mapPayment({ ...row, company }));
  }

  async savePayment(mainCompanySlug: string, payload: Query, id?: string) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = id
        ? await tx.payment.findFirst({ where: { id, mainCompanySlug: slug } })
        : null;
      if (old)
        await this.reverseLinkedMovement(
          tx,
          slug,
          old.currentAccountMovementId,
        );
      const company = await this.findCompany(slug, payload, tx);
      const effect = this.paymentEffect(payload);
      const movement = await this.createLinkedMovement(tx, {
        mainCompanySlug: slug,
        companyId: company.id,
        date: this.dateOrToday(payload.paymentDate || payload.tarih),
        movementType: "ODEME",
        sourceType: normalizeText(payload.sourceType || "PAYMENT"),
        documentNo: normalizeText(payload.documentNo || payload.belge) || null,
        description:
          normalizeText(
            payload.description || payload.aciklama || payload.odemeTuru,
          ) || null,
        effect,
        legacyId: normalizeText(payload.legacyId) || null,
        raw: payload,
      });
      const data = {
        mainCompanySlug: slug,
        companyId: company.id,
        paymentDate: this.dateOrToday(payload.paymentDate || payload.tarih),
        paymentType: normalizeText(
          payload.paymentType || payload.odemeTuru || "Odeme",
        ),
        direction: normalizeText(
          payload.direction || payload.yon || "OUT",
        ).toUpperCase(),
        amount: safeDecimal(Math.abs(effect)),
        currency: normalizeText(payload.currency || "TRY"),
        bankName: normalizeText(payload.bankName || payload.banka) || null,
        accountName:
          normalizeText(payload.accountName || payload.hesapAdi) || null,
        description:
          normalizeText(payload.description || payload.aciklama) || null,
        documentNo: normalizeText(payload.documentNo || payload.belge) || null,
        sourceType: normalizeText(payload.sourceType || "PAYMENT"),
        currentAccountMovementId: movement.id,
        legacyId: normalizeText(payload.legacyId) || null,
        raw: payload,
      };
      const saved = old
        ? await tx.payment.update({ where: { id: old.id }, data })
        : await tx.payment.create({ data });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "payment",
          entityId: saved.id,
          actionType: old ? "UPDATED" : "CREATED",
          oldValue: old ?? undefined,
          newValue: saved,
        },
      });
      return dbSuccess(this.mapPayment({ ...saved, company }));
    });
  }

  async deletePayment(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.payment.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      if (!old) throw new NotFoundException("Odeme bulunamadi.");
      await this.reverseLinkedMovement(tx, slug, old.currentAccountMovementId);
      await tx.payment.delete({ where: { id } });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "payment",
          entityId: id,
          actionType: "DELETED",
          oldValue: old,
        },
      });
      return dbSuccess({ id, deleted: true });
    });
  }

  async listChecks(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const where: Prisma.CheckWhereInput = { mainCompanySlug };
    if (query.status) where.status = normalizeText(query.status);
    if (query.dateFrom || query.dateTo) {
      where.dueDate = {};
      if (query.dateFrom) where.dueDate.gte = this.dateOrToday(query.dateFrom);
      if (query.dateTo)
        where.dueDate.lte = new Date(
          `${String(query.dateTo).slice(0, 10)}T23:59:59.999Z`,
        );
    }
    const q = normalizeText(query.q);
    if (q) {
      where.OR = [
        { checkNo: { contains: q } },
        { bankName: { contains: q } },
        { description: { contains: q } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.check.count({ where }),
      this.prisma.check.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    const companyIds = [
      ...new Set(rows.map((row: any) => row.companyId).filter(Boolean)),
    ];
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds }, mainCompanySlug },
        })
      : [];
    const byId = new Map(companies.map((company) => [company.id, company]));
    return makePaginatedResponse(
      rows.map((row: any) =>
        this.mapCheck({ ...row, company: byId.get(row.companyId) }),
      ),
      page,
      limit,
      total,
    );
  }

  async getCheck(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.check.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!row) throw new NotFoundException("Cek bulunamadi.");
    return dbSuccess(this.mapCheck(row));
  }

  async saveCheck(mainCompanySlug: string, payload: Query, id?: string) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = id
        ? await tx.check.findFirst({ where: { id, mainCompanySlug: slug } })
        : null;
      if (old?.currentAccountMovementId)
        await this.reverseLinkedMovement(
          tx,
          slug,
          old.currentAccountMovementId,
        );
      let company: any = null;
      try {
        company = await this.findCompany(slug, payload, tx);
      } catch {
        company = null;
      }
      const status = normalizeText(
        payload.status || payload.durum || "PORTFOYDE",
      );
      const amount = Number(payload.amount ?? payload.tutar ?? 0) || 0;
      const effectiveDueDate =
        payload.dueDate || payload.vadeTarihi || payload.vade;
      const direction = this.normalizeCheckDirection(payload);
      const reverseStatus = this.isCheckReverseStatus(status);
      const rawApplyCari =
        payload.applyCari ?? payload.cariyeIsle ?? payload.cariyeIsleme;
      const shouldApplyCari =
        rawApplyCari === undefined ||
        rawApplyCari === null ||
        rawApplyCari === ""
          ? Boolean(old?.currentAccountMovementId)
          : ![
              false,
              "false",
              "0",
              0,
              "hayir",
              "hayır",
              "isleme",
              "işleme",
            ].includes(
              String(rawApplyCari).toLocaleLowerCase("tr-TR") as never,
            );
      let movementId: string | null = null;
      if (company && amount > 0 && !reverseStatus && shouldApplyCari) {
        const effect = this.checkEffect(direction, amount);
        const movement = await this.createLinkedMovement(tx, {
          mainCompanySlug: slug,
          companyId: company.id,
          date: this.dateOrToday(effectiveDueDate),
          movementType: "CEK",
          sourceType: "CHECK",
          documentNo: normalizeText(payload.checkNo || payload.cekNo),
          description:
            normalizeText(payload.description || payload.aciklama) ||
            (direction === "OUT"
              ? `Tedarikçiye verilen çek - Çek No: ${normalizeText(payload.checkNo || payload.cekNo)}`
              : `Müşteriden alınan çek - Çek No: ${normalizeText(payload.checkNo || payload.cekNo)}`),
          effect,
          legacyId: normalizeText(payload.legacyId) || null,
          raw: {
            ...payload,
            relatedCheckNo: normalizeText(payload.checkNo || payload.cekNo),
            cariEtkisi: effect > 0 ? "BORC" : "ALACAK",
          },
        });
        movementId = movement.id;
      }
      const raw = {
        ...this.asObject(old?.raw),
        ...this.asObject(payload.raw),
        ...payload,
        direction,
        yon: direction,
        durum: status,
        applyCari: shouldApplyCari,
        cariyeIsle: shouldApplyCari,
        cariEtkisi: direction === "OUT" ? "BORC" : "ALACAK",
        active: !reverseStatus,
        reversedAt: reverseStatus ? new Date().toISOString() : null,
      };
      const data = {
        mainCompanySlug: slug,
        companyId: company?.id || null,
        checkNo: normalizeText(payload.checkNo || payload.cekNo),
        bankName: normalizeText(payload.bankName || payload.banka) || null,
        branchName: normalizeText(payload.branchName || payload.sube) || null,
        dueDate: this.dateOrToday(effectiveDueDate),
        amount: safeDecimal(amount),
        status,
        direction,
        description:
          normalizeText(payload.description || payload.aciklama) || null,
        reminderDate:
          payload.reminderDate || payload.hatirlatmaTarihi
            ? this.dateOrToday(payload.reminderDate || payload.hatirlatmaTarihi)
            : null,
        currentAccountMovementId: movementId,
        legacyId: normalizeText(payload.legacyId) || null,
        raw,
      };
      if (!data.checkNo) throw new BadRequestException("Cek no zorunludur.");
      const saved = old
        ? await tx.check.update({ where: { id: old.id }, data })
        : await tx.check.create({ data });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "check",
          entityId: saved.id,
          actionType: old ? "UPDATED" : "CREATED",
          oldValue: old ?? undefined,
          newValue: saved,
        },
      });
      return dbSuccess(this.mapCheck({ ...saved, company }));
    });
  }

  async deleteCheck(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.check.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      if (!old) throw new NotFoundException("Cek bulunamadi.");
      await this.reverseLinkedMovement(tx, slug, old.currentAccountMovementId);
      const saved = await tx.check.update({
        where: { id },
        data: {
          status: "IPTAL",
          currentAccountMovementId: null,
          raw: {
            ...this.asObject(old.raw),
            active: false,
            durum: "IPTAL",
            reversedAt: new Date().toISOString(),
          },
        },
      });
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          entityType: "check",
          entityId: id,
          actionType: "PASSIVATED",
          oldValue: old,
          newValue: saved,
        },
      });
      return dbSuccess({ id, passive: true, status: "IPTAL" });
    });
  }

  async listCreditCards(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const where: Prisma.CreditCardWhereInput = { mainCompanySlug };
    if (q) {
      where.OR = [
        { cardName: { contains: q } },
        { bankName: { contains: q } },
        { lastFourDigits: { contains: q } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.creditCard.count({ where }),
      this.prisma.creditCard.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(
      rows.map((row) => this.mapCreditCard(row)),
      page,
      limit,
      total,
    );
  }

  async getCreditCard(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const row = await this.prisma.creditCard.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!row) throw new NotFoundException("Kredi karti bulunamadi.");
    return dbSuccess(this.mapCreditCard(row));
  }

  async saveCreditCard(mainCompanySlug: string, payload: Query, id?: string) {
    const slug = await this.scope(mainCompanySlug);
    const existing = id
      ? await this.prisma.creditCard.findFirst({
          where: { id, mainCompanySlug: slug },
        })
      : null;
    const data = {
      mainCompanySlug: slug,
      bankName: normalizeText(payload.bankName || payload.banka) || null,
      cardName: normalizeText(payload.cardName || payload.kartAdi),
      lastFourDigits: this.normalizeCardLastFour(payload) || null,
      period: normalizeText(payload.period || payload.donem) || null,
      totalDebt: safeDecimal(payload.totalDebt ?? payload.toplamBorc ?? 0),
      minimumPayment: safeDecimal(
        payload.minimumPayment ?? payload.asgariOdeme ?? 0,
      ),
      dueDate:
        payload.dueDate || payload.sonOdemeTarihi
          ? this.dateOrToday(payload.dueDate || payload.sonOdemeTarihi)
          : null,
      isActive: payload.isActive ?? payload.aktif ?? true,
      note: normalizeText(payload.note || payload.not) || null,
      legacyId: normalizeText(payload.legacyId) || null,
      raw: this.buildCreditCardRaw(existing?.raw, payload),
    };
    if (!data.cardName) throw new BadRequestException("Kart adi zorunludur.");
    const saved = id
      ? await this.prisma.creditCard.update({ where: { id }, data })
      : await this.prisma.creditCard.create({ data });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "credit_card",
      entityId: saved.id,
      actionType: id ? "UPDATED" : "CREATED",
      newValue: saved,
    });
    return dbSuccess(this.mapCreditCard(saved));
  }

  async deleteCreditCard(mainCompanySlug: string, id: string) {
    const slug = await this.scope(mainCompanySlug);
    const old = await this.prisma.creditCard.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!old) throw new NotFoundException("Kredi karti bulunamadi.");
    const saved = await this.prisma.creditCard.update({
      where: { id },
      data: {
        isActive: false,
        raw: {
          ...this.asObject(old.raw),
          active: false,
        },
      },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "credit_card",
      entityId: id,
      actionType: "PASSIVATED",
      oldValue: old,
      newValue: saved,
    });
    return dbSuccess({ id, passive: true });
  }

  async listAllCreditCardMovements(query: Query) {
    const mainCompanySlug = await this.scope(query.mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const q = normalizeText(query.q);
    const where: Prisma.CreditCardMovementWhereInput = { mainCompanySlug };
    if (normalizeText(query.creditCardId))
      where.creditCardId = normalizeText(query.creditCardId);
    if (normalizeText(query.companyId || query.firmId)) {
      where.companyId = normalizeText(query.companyId || query.firmId);
    }
    if (q) {
      where.OR = [
        { description: { contains: q } },
        { raw: { path: "$.documentNo", string_contains: q } as any },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.creditCardMovement.count({ where }),
      this.prisma.creditCardMovement.findMany({
        where,
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    const cardIds = [
      ...new Set(rows.map((row) => row.creditCardId).filter(Boolean)),
    ];
    const companyIds = [
      ...new Set(rows.map((row) => row.companyId).filter(Boolean)),
    ];
    const [cards, companies] = await Promise.all([
      cardIds.length
        ? this.prisma.creditCard.findMany({
            where: { mainCompanySlug, id: { in: cardIds } },
          })
        : [],
      companyIds.length
        ? this.prisma.company.findMany({
            where: { mainCompanySlug, id: { in: companyIds } },
          })
        : [],
    ]);
    const cardMap = new Map<string, any>(
      cards.map((row: any) => [row.id, row] as [string, any]),
    );
    const companyMap = new Map<string, any>(
      companies.map((row: any) => [row.id, row] as [string, any]),
    );
    return makePaginatedResponse(
      rows.map((row) =>
        this.mapCreditCardMovement({
          ...row,
          card: cardMap.get(row.creditCardId),
          company: row.companyId ? companyMap.get(row.companyId) : null,
        }),
      ),
      page,
      limit,
      total,
    );
  }

  async createCreditCardFirmPayment(mainCompanySlug: string, payload: Query) {
    const slug = await this.scope(mainCompanySlug);
    const creditCardId = normalizeText(payload.creditCardId);
    const amount = Number(payload.amount ?? payload.tutar ?? 0) || 0;
    if (!creditCardId)
      throw new BadRequestException("creditCardId zorunludur.");
    if (amount <= 0) throw new BadRequestException("Tutar gecersiz.");
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({
        where: { id: creditCardId, mainCompanySlug: slug, isActive: true },
      });
      if (!card) throw new NotFoundException("Kredi karti bulunamadi.");
      const company = await this.findCompany(slug, payload, tx);
      const direction = normalizeText(
        payload.direction || payload.yon || "OUT",
      ).toUpperCase();
      const effect = direction === "IN" ? -amount : amount;
      const movement = await this.createLinkedMovement(tx, {
        mainCompanySlug: slug,
        companyId: company.id,
        date: this.dateOrToday(payload.date || payload.tarih),
        movementType: "KREDI_KARTI",
        sourceType: "CREDIT_CARD",
        documentNo: normalizeText(payload.documentNo || payload.belgeNo),
        description:
          normalizeText(payload.description || payload.aciklama) ||
          `${direction === "IN" ? "Kredi kartı tahsilatı" : "Kredi kartı ile ödeme"} - Kart: ${card.bankName || "Kart"} ****${card.lastFourDigits || ""}`,
        effect,
        raw: {
          creditCardId: card.id,
          relatedCardId: card.id,
          relatedCardName: `${card.bankName || "Kart"} ****${card.lastFourDigits || ""}`,
          officialType:
            normalizeText(payload.officialType || payload.resmiGayri) ||
            "RESMI",
        },
      });
      const saved = await tx.creditCardMovement.create({
        data: {
          mainCompanySlug: slug,
          creditCardId: card.id,
          movementDate: this.dateOrToday(payload.date || payload.tarih),
          amount: safeDecimal(amount),
          description:
            normalizeText(payload.description || payload.aciklama) || null,
          usagePurpose:
            normalizeText(payload.usagePurpose || payload.kullanimAmaci) ||
            null,
          companyId: company.id,
          documentId: normalizeText(payload.documentId) || null,
          currentAccountMovementId: movement.id,
          raw: {
            movementType: "PAYMENT_TO_FIRM",
            installmentCount:
              Number(payload.installmentCount || payload.taksitSayisi || 0) ||
              null,
            documentNo:
              normalizeText(payload.documentNo || payload.belgeNo) || null,
            officialType:
              normalizeText(payload.officialType || payload.resmiGayri) ||
              "RESMI",
            slipImageUrl: normalizeText(payload.slipImageUrl) || "",
            direction,
            cardName: card.cardName,
            bankName: card.bankName || "",
            lastFourDigits: card.lastFourDigits || "",
            firmName: company.name,
            active: true,
          },
        },
      });
      const sum = await tx.creditCardMovement.aggregate({
        where: { mainCompanySlug: slug, creditCardId: card.id },
        _sum: { amount: true },
      });
      await tx.creditCard.update({
        where: { id: card.id },
        data: { totalDebt: safeDecimal(sum._sum.amount || 0) },
      });
      await tx.currentAccountMovement.update({
        where: { id: movement.id },
        data: {
          raw: {
            ...this.asObject(movement.raw),
            creditCardMovementId: saved.id,
          },
        },
      });
      return dbSuccess({
        creditCardMovement: this.mapCreditCardMovement({
          ...saved,
          card,
          company,
        }),
        cariMovementId: movement.id,
      });
    });
  }

  async createCreditCardStatementPayment(
    mainCompanySlug: string,
    payload: Query,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const creditCardId = normalizeText(payload.creditCardId);
    const amount = Number(payload.amount ?? payload.tutar ?? 0) || 0;
    if (!creditCardId)
      throw new BadRequestException("creditCardId zorunludur.");
    if (amount <= 0) throw new BadRequestException("Tutar gecersiz.");
    const card = await this.prisma.creditCard.findFirst({
      where: { id: creditCardId, mainCompanySlug: slug },
    });
    if (!card) throw new NotFoundException("Kredi karti bulunamadi.");
    const saved = await this.prisma.creditCardMovement.create({
      data: {
        mainCompanySlug: slug,
        creditCardId: card.id,
        movementDate: this.dateOrToday(payload.date || payload.tarih),
        amount: safeDecimal(-amount),
        description:
          normalizeText(payload.description || payload.aciklama) ||
          "Kredi kartı ekstre ödemesi",
        raw: {
          movementType: "CARD_STATEMENT_PAYMENT",
          documentNo:
            normalizeText(payload.documentNo || payload.belgeNo) || null,
          paymentSource:
            normalizeText(payload.paymentSource || payload.odemeKaynagi) ||
            "BANKA",
          slipImageUrl: normalizeText(payload.slipImageUrl) || "",
          cardName: card.cardName,
          bankName: card.bankName || "",
          lastFourDigits: card.lastFourDigits || "",
          active: true,
        },
      },
    });
    const sum = await this.prisma.creditCardMovement.aggregate({
      where: { mainCompanySlug: slug, creditCardId: card.id },
      _sum: { amount: true },
    });
    await this.prisma.creditCard.update({
      where: { id: card.id },
      data: { totalDebt: safeDecimal(sum._sum.amount || 0) },
    });
    return dbSuccess(
      this.mapCreditCardMovement({
        ...saved,
        card,
      }),
    );
  }

  async uploadCreditCardMovementSlip(
    mainCompanySlug: string,
    movementId: string,
    file: any,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const movement = await this.prisma.creditCardMovement.findFirst({
      where: { id: movementId, mainCompanySlug: slug },
    });
    if (!movement) throw new NotFoundException("Kart hareketi bulunamadi.");
    const saved = await this.prisma.creditCardMovement.update({
      where: { id: movement.id },
      data: {
        raw: {
          ...this.asObject(movement.raw),
          slipImageUrl: normalizeText(file?.path || file?.filename) || "",
        },
      },
    });
    const card = await this.prisma.creditCard.findFirst({
      where: { id: saved.creditCardId, mainCompanySlug: slug },
    });
    return dbSuccess(this.mapCreditCardMovement({ ...saved, card }));
  }

  async listCreditCardMovements(
    mainCompanySlug: string,
    creditCardId: string,
    query: Query,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const where = { mainCompanySlug: slug, creditCardId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.creditCardMovement.count({ where }),
      this.prisma.creditCardMovement.findMany({
        where,
        orderBy: [{ movementDate: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(rows, page, limit, total);
  }

  async saveCreditCardMovement(
    mainCompanySlug: string,
    creditCardId: string,
    payload: Query,
    movementId?: string,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const old = movementId
      ? await this.prisma.creditCardMovement.findFirst({
          where: { id: movementId, mainCompanySlug: slug, creditCardId },
        })
      : null;
    const amount = Number(payload.amount ?? payload.tutar ?? 0) || 0;
    const saved = old
      ? await this.prisma.creditCardMovement.update({
          where: { id: old.id },
          data: {
            movementDate: this.dateOrToday(
              payload.movementDate || payload.tarih,
            ),
            amount: safeDecimal(amount),
            description:
              normalizeText(payload.description || payload.aciklama) || null,
            usagePurpose:
              normalizeText(payload.usagePurpose || payload.kullanimAmaci) ||
              null,
            raw: payload,
          },
        })
      : await this.prisma.creditCardMovement.create({
          data: {
            mainCompanySlug: slug,
            creditCardId,
            movementDate: this.dateOrToday(
              payload.movementDate || payload.tarih,
            ),
            amount: safeDecimal(amount),
            description:
              normalizeText(payload.description || payload.aciklama) || null,
            usagePurpose:
              normalizeText(payload.usagePurpose || payload.kullanimAmaci) ||
              null,
            companyId: normalizeText(payload.companyId) || null,
            documentId: normalizeText(payload.documentId) || null,
            legacyId: normalizeText(payload.legacyId) || null,
            raw: payload,
          },
        });
    const sum = await this.prisma.creditCardMovement.aggregate({
      where: { mainCompanySlug: slug, creditCardId },
      _sum: { amount: true },
    });
    await this.prisma.creditCard.update({
      where: { id: creditCardId },
      data: { totalDebt: safeDecimal(sum._sum.amount || 0) },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "credit_card_movement",
      entityId: saved.id,
      actionType: old ? "UPDATED" : "CREATED",
      newValue: saved,
    });
    return dbSuccess(saved);
  }

  async deleteCreditCardMovement(
    mainCompanySlug: string,
    creditCardId: string,
    movementId: string,
  ) {
    const slug = await this.scope(mainCompanySlug);
    const old = await this.prisma.creditCardMovement.delete({
      where: { id: movementId },
    });
    const sum = await this.prisma.creditCardMovement.aggregate({
      where: { mainCompanySlug: slug, creditCardId },
      _sum: { amount: true },
    });
    await this.prisma.creditCard.update({
      where: { id: creditCardId },
      data: { totalDebt: safeDecimal(sum._sum.amount || 0) },
    });
    await createActivityLog(this.prisma, {
      mainCompanySlug: slug,
      entityType: "credit_card_movement",
      entityId: movementId,
      actionType: "DELETED",
      oldValue: old,
    });
    return dbSuccess({ id: movementId, deleted: true });
  }
}
