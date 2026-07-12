import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDollarSign,
  Factory,
  FileText,
  ImageOff,
  Inbox,
  Layers,
  PackageOpen,
  ReceiptText,
  UploadCloud,
} from "lucide-react";
import { ErpIcon } from "../../components/erp/IconMap";
import {
  fetchIncomingDeliveryPool,
  fetchMuhasebeModels,
  fetchOutgoingDocumentsPool,
  saveIncomingDelivery,
  saveOutgoingDocument,
} from "../../services/muhasebeService";
import { updateModel } from "../../services/modelTrackingService";
import {
  activePrintRegions,
  normalizePrintRegions,
  saveModelPrintRegions,
} from "../../services/modelPrintRegionService";
import { apiUrl } from "../../utils/api";
import {
  approveBelgeImport,
  convertBelgeImportToPaidExpense,
  createDocumentIntakeFirm,
  createDocumentIntakeProduct,
  fetchBelgeImport,
  fetchBelgeImportDetail,
  fixDocumentIntake,
  purgeDocumentIntake,
  purgeRejectedDocumentIntake,
  rejectBelgeImport,
  retryBelgeImport,
  uploadBelgeImport,
} from "../../services/muhasebeDocumentService";
import "./BelgeIslemMerkezi.css";

const SUPPLIER_STATUS_TABS = [
  ["ALL", "Tum"],
  ["ISSUE", "Sorunlu"],
  ["READY", "Hazir"],
  ["QUARANTINE", "Karantina"],
  ["APPROVED", "Islenen"],
];

const PROCESSED_STATUSES = new Set([
  "APPROVED",
  "PROCESSED",
  "AUTO_PROCESSED",
  "POSTED",
  "ISLENEN",
]);

const QUARANTINE_REASONS = {
  READY: "Kontrol tamam.",
  VAT_REVIEW: "KDV/vergi kırılımı manuel kontrol bekliyor.",
  LINE_PRICE_MISSING: "Kalem fiyatı XML/PDF içinden güvenli okunamadı.",
  LINE_TOTAL_MISMATCH: "Satır matrah toplamı belge matrahıyla uyuşmuyor.",
  LINE_SUBTOTAL_MISMATCH: "Satir toplamlari belge matrahiyla uyusmuyor.",
  GRAND_TOTAL_MISMATCH: "Genel toplam kontrolu tutmuyor.",
  MISSING_REQUIRED_DATA: "Zorunlu belge alanları eksik.",
  DUPLICATE_DOCUMENT: "Aynı belge daha önce işlenmiş.",
  PARSE_ERROR: "Belge okunamadı.",
  MISSING_INFO: "Eksik bilgi var.",
  PRODUCT_MISSING: "Urun eslesmesi eksik.",
  PRODUCT: "Urun eslesmesi eksik.",
  TAX_MISMATCH: "KDV kontrolu tutmuyor.",
  VAT_TOTAL_MISMATCH: "KDV toplam kontrolu tutmuyor.",
  PARSER_CONFIDENCE_LOW: "Belge okuma guveni dusuk.",
  DOCUMENT_NO: "Belge no okunamadi.",
  FIRM: "Firma eslesmesi eksik.",
  SUBTOTAL_ZERO: "Matrah sifir veya okunamadi.",
  TOTAL_ZERO: "Toplam sifir veya okunamadi.",
  LINE_QUANTITY_ZERO: "Kalem miktari sifir veya okunamadi.",
  LINE_PRICE_ZERO: "Kalem fiyati sifir veya okunamadi.",
  LINE_TOTAL_ZERO: "Kalem toplami sifir veya okunamadi.",
};

const MANUAL_WARNING_FIELDS = new Set([
  "VAT_REVIEW",
  "VAT_TOTAL_MISMATCH",
  "PRODUCT",
  "PRODUCT_MISSING",
  "LINE_PRICE_ZERO",
  "LINE_PRICE_MISSING",
  "LINE_TOTAL_ZERO",
  "LINE_TOTAL_MISMATCH",
  "LINE_SUBTOTAL_MISMATCH",
  "GRAND_TOTAL_MISMATCH",
  "LINE_QUANTITY_ZERO",
  "SUBTOTAL_ZERO",
  "PARSER_CONFIDENCE_LOW",
  "MISSING_REQUIRED_DATA",
]);
const BLOCKING_FIELDS = new Set([
  "DOCUMENT_NO",
  "FIRM",
  "TOTAL_ZERO",
  "VAT_INVALID",
  "PARSE_ERROR",
  "DUPLICATE_DOCUMENT",
]);

const POSTING_TYPE_LABELS = {
  OPEN_PAYABLE: "Acik Cari Borc",
  PAID_EXPENSE: "Pesin Odenmis Gider",
  CREDIT_CARD_EXPENSE: "Kredi Karti Gideri",
  CASH_EXPENSE: "Nakit/Kasa Gideri",
  BANK_PAID_EXPENSE: "Banka Odemeli Gider",
};

const LOT_RELEVANT_KEYWORDS = [
  "BOYA",
  "KIMYA",
  "KİMYA",
  "PIGMENT",
  "RETARDER",
  "FIXATOR",
  "FIKSATOR",
  "PASTE",
  "SOLVENT",
  "HAMMADDE",
  "KGC",
];

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function numberText(value) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString("tr-TR");
}

function statusChipClass(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  if (isProcessedStatus(value)) return "green";
  if (
    text.includes("approve") ||
    text.includes("onay") ||
    text.includes("ready") ||
    text.includes("hazir")
  ) {
    return "green";
  }
  if (
    text.includes("error") ||
    text.includes("reject") ||
    text.includes("hata")
  ) {
    return "red";
  }
  if (
    text.includes("missing") ||
    text.includes("bek") ||
    text.includes("kontrol") ||
    text.includes("eksik")
  ) {
    return "amber";
  }
  return "blue";
}

function shortMissing(fields = []) {
  return Array.isArray(fields) && fields.length ? fields.join(", ") : "-";
}

function isProcessedStatus(value) {
  return PROCESSED_STATUSES.has(String(value || "").toUpperCase());
}

function statusLabel(value, row) {
  if (isProcessedStatus(value)) return "Islendi";
  if (missingFieldsOf(row).includes("VAT_REVIEW")) return "KDV Inceleme";
  if (missingFieldsOf(row).length && !approvalBlockersOf(row).length) return "Kontrol Onayi";
  if (isQuarantined(row || { status: value })) return "Karantina";
  if (value === "READY") return "Hazir";
  if (value === "MISSING_INFO") return "Eksik Bilgi";
  if (value === "CONTROL_WAITING") return "Kontrolde";
  if (value === "REJECTED") return "Reddedildi";
  return value || "Kontrol";
}

function translatedReasons(row) {
  const fields = missingFieldsOf(row);
  return fields.length
     ? fields.map((field) => QUARANTINE_REASONS[field] || field)
    : [];
}

function supplierName(row) {
  return row?.issuerName || row?.companyName || row?.receiverName || "-";
}

function missingFieldsOf(row) {
  return Array.isArray(row?.missingFields) ? row?.missingFields : [];
}

function isQuarantined(row) {
  return row.status === "MISSING_INFO" && approvalBlockersOf(row).length > 0;
}

function approvalBlockersOf(row) {
  const fields = missingFieldsOf(row);
  return fields.filter((field) => BLOCKING_FIELDS.has(field));
}

function warningFieldsOf(row) {
  const fields = missingFieldsOf(row);
  return fields.filter((field) => MANUAL_WARNING_FIELDS.has(field));
}

function canApproveRow(row) {
  const lines = Array.isArray(row?.lines) ? row?.lines : [];
  if (!lines.length || isProcessedStatus(row?.status)) return false;
  if (!row?.firmId) return false;
  if (Number(row?.grandTotal || 0) <= 0) return false;
  if (Number(row?.vatTotal || 0) < 0) return false;
  if (approvalBlockersOf(row).length) return false;
  return lines.every(
    (line) =>
      String(line?.rawName || line?.description || "").trim() &&
      (Number(line?.quantity || 0) > 0 ||
        Number(line?.subtotal || line?.total || 0) > 0),
  );
}

function controlSummaryOf(row) {
  const existing = row?.controlSummary || {};
  const lines = Array.isArray(row?.lines) ? row?.lines : [];
  const lineSubtotal =
    Number(existing.lineSubtotal || 0) ||
    lines.reduce((sum, line) => sum + Number(line?.subtotal || 0), 0);
  const lineVat =
    Number(existing.lineVat || 0) ||
    lines.reduce((sum, line) => sum + Number(line?.vatAmount || 0), 0);
  const documentSubtotal = Number(existing.documentSubtotal ?? row?.subtotal ?? 0);
  const documentTaxTotal = Number(existing.documentTaxTotal ?? row?.vatTotal ?? 0);
  const grandTotal = Number(existing.grandTotal ?? row?.grandTotal ?? 0);
  const tolerance = Number(existing.tolerance || Math.max(0.05, Math.abs(grandTotal) * 0.01));
  const subtotalDiff = Number(existing.subtotalDiff ?? lineSubtotal - documentSubtotal);
  const grandExpected = Number(existing.grandExpected ?? documentSubtotal + documentTaxTotal);
  const grandDiff = Number(existing.grandDiff ?? grandExpected - grandTotal);
  return {
    ...existing,
    quarantineCode:
      existing.quarantineCode ||
      (missingFieldsOf(row).includes("VAT_REVIEW") ? "VAT_REVIEW" : row?.status || "CONTROL"),
    lineSubtotal,
    documentSubtotal,
    subtotalDiff,
    lineVat,
    expectedVatByLineRate: Number(existing.expectedVatByLineRate ?? lineVat),
    vatControlBase: Number(existing.vatControlBase ?? existing.expectedVatByLineRate ?? lineVat),
    documentTaxTotal,
    normalVat: Number(existing.normalVat ?? lineVat),
    withholdingVat: Number(existing.withholdingVat || 0),
    otherTax: Number(existing.otherTax || 0),
    discountTotal: Number(existing.discountTotal || 0),
    chargeTotal: Number(existing.chargeTotal || 0),
    grandExpected,
    grandTotal,
    grandDiff,
    subtotalOk: existing.subtotalOk ?? Math.abs(subtotalDiff) <= tolerance,
    grandTotalOk: existing.grandTotalOk ?? Math.abs(grandDiff) <= tolerance,
    vatReview: existing.vatReview ?? missingFieldsOf(row).includes("VAT_REVIEW"),
    zeroPriceLineCount:
      Number(existing.zeroPriceLineCount || 0) ||
      lines.filter((line) => Number(line?.unitPrice || 0) <= 0).length,
    explanation:
      existing.explanation ||
      translatedReasons(row).join(" ") ||
      "Kontrol ozeti olusturuldu.",
  };
}

function hasIssueStatus(row) {
  if (isQuarantined(row)) return true;
  return ["ERROR", "REJECTED", "ARCHIVED"].includes(row?.status);
}

function lineProductLabel(line) {
  if (line?.productId) {
    return line?.productCreated ? "Yeni urun olusturuldu" : "Bagli";
  }
  return "Yeni urun";
}

function normalizeLotText(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I");
}

function isLotRelevantLine(line) {
  const group = normalizeLotText(line?.productDraftJson?.productGroup || "");
  if (group.includes("BOYAHANE") || group.includes("HAMMADDE")) return true;
  const text = normalizeLotText(
    `${line?.rawName || ""} ${line?.description || ""}`,
  );
  return LOT_RELEVANT_KEYWORDS.some((keyword) =>
    text.includes(normalizeLotText(keyword)),
  );
}

export default function BelgeIslemMerkezi({ activeMainCompany }) {
  const [supplierRefreshKey, setSupplierRefreshKey] = useState(0);

  return (
    <div className="bim-root">
      <SupplierBelgeMerkezi
        activeMainCompany={activeMainCompany}
        refreshKey={supplierRefreshKey}
        onRefresh={() => setSupplierRefreshKey((value) => value + 1)}
      />
    </div>
  );
}

const CUSTOMER_STATUS_FILTERS = [
  ["ALL", "Tümü"],
  ["PLANNED", "Planlı / İrsaliye Bekliyor"],
  ["DISPATCHED", "İrsaliyesi Geldi"],
  ["PRODUCTION", "İmalat Devam Ediyor"],
  ["INVOICE_WAITING", "Fatura Bekliyor"],
  ["PARTIAL", "Kısmi Fatura"],
  ["DONE", "Tamamlandı"],
  ["PRICE_WAITING", "Fiyat Bekliyor"],
];

function textOf(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return fallback;
}

function numericOf(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return fallback;
}

function normalizeMatchKey(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function firstModelName(model) {
  return textOf(model, [
    "modelAdi",
    "modelName",
    "name",
    "urunAdi",
    "desenAdi",
  ]);
}

function firstModelPrice(model) {
  return numericOf(model, [
    "musteriOzelFiyat",
    "customerPrice",
    "rptOncekiFiyat",
    "previousRptPrice",
    "guncelFiyat",
    "birimFiyat",
    "unitPrice",
    "price",
    "satisFiyati",
  ]);
}

function priceInfoFor(row, model) {
  const customerPrice = numericOf(model, ["musteriOzelFiyat", "customerPrice"]);
  if (customerPrice) return { amount: customerPrice, source: "Müşteri Özel Fiyatı" };
  const rptPrice = numericOf(model, ["rptOncekiFiyat", "previousRptPrice", "lastRptPrice"]);
  if (rptPrice) return { amount: rptPrice, source: "RPT Önceki Fiyatı" };
  const activePrice = numericOf(model, ["guncelFiyat", "activePrice", "satisFiyati", "price"]);
  if (activePrice) return { amount: activePrice, source: "Güncel Model Fiyatı" };
  const manualPrice = numericOf(row, ["birimFiyat", "unitPrice", "fiyat"]);
  if (manualPrice) return { amount: manualPrice, source: textOf(row, ["fiyatKaynagi", "priceSource"], "Manuel Fiyat") };
  return { amount: 0, source: "" };
}

function findRelatedModel(models, row) {
  const modelId = textOf(row, ["modelId", "modelKaydiId", "model_id"]);
  const modelName = normalizeMatchKey(
    textOf(row, ["modelAdi", "modelName", "modelAdiOnerisi", "urunAdi"]),
  );
  return (
    models.find((model) => String(model?.id || "") === modelId) ||
    models.find((model) => normalizeMatchKey(firstModelName(model)) === modelName) ||
    null
  );
}

function invoiceMatchesJob(invoice, job) {
  const firmOk =
    !job.firmKey ||
    normalizeMatchKey(textOf(invoice, ["firma", "companyName", "customerName"])) ===
      job.firmKey;
  const dispatchNo = normalizeMatchKey(
    textOf(invoice, ["irsaliyeNo", "dispatchNo", "bagliIrsaliyeNo"]),
  );
  const orderNo = normalizeMatchKey(textOf(invoice, ["siparisNo", "orderNo"]));
  const modelName = normalizeMatchKey(
    textOf(invoice, ["modelAdi", "modelName", "modelAdiOnerisi"]),
  );
  const hasStrongMatch =
    (job.dispatchKey && dispatchNo && dispatchNo === job.dispatchKey) ||
    (job.orderKey && orderNo && orderNo === job.orderKey);
  const hasModelMatch = job.modelKey && modelName && modelName === job.modelKey;
  return firmOk && (hasStrongMatch || (!job.dispatchKey && hasModelMatch));
}

function customerStatusOf(job) {
  if (!job.unitPrice) return "Fiyat Bekliyor";
  if (!job.dispatchQty) return "Planlı / İrsaliye Bekliyor";
  if (job.invoiceQty >= job.baseQty && job.baseQty > 0) return "Tamamlandı";
  if (job.invoiceQty > 0) return "Kısmi Fatura";
  if (job.productionQty > 0 && job.productionQty < job.baseQty)
    return "İmalat Devam Ediyor";
  if (job.dispatchQty > 0) return "Fatura Bekliyor";
  return "İrsaliyesi Geldi";
}

function statusFilterKey(status) {
  if (status === "Planlı / İrsaliye Bekliyor") return "PLANNED";
  if (status === "İrsaliyesi Geldi") return "DISPATCHED";
  if (status === "İmalat Devam Ediyor") return "PRODUCTION";
  if (status === "Fatura Bekliyor") return "INVOICE_WAITING";
  if (status === "Kısmi Fatura") return "PARTIAL";
  if (status === "Tamamlandı") return "DONE";
  if (status === "Fiyat Bekliyor") return "PRICE_WAITING";
  return "ALL";
}

function buildCustomerJobs(incomingRows, outgoingRows, models) {
  const jobs = [];
  const usedInvoiceIds = new Set();
  for (const row of incomingRows) {
    const model = findRelatedModel(models, row);
    const firm = textOf(row, ["firma", "companyName", "customerName"], "-");
    const orderNo = textOf(row, ["siparisNo", "orderNo", "piyonNo"]);
    const dispatchNo = textOf(row, ["irsaliyeNo", "dispatchNo", "belgeNo"]);
    const rawDescription = textOf(row, [
      "hamAciklama",
      "rawDescription",
      "aciklama",
      "description",
      "modelAdiOnerisi",
      "urunAdi",
    ]);
    const hasRealModel = Boolean(textOf(row, ["modelId", "modelKaydiId"]) || model?.id);
    const modelName =
      firstModelName(model) ||
      (hasRealModel ? textOf(row, ["modelAdi", "modelName"], "Model bekliyor") : "Model bekliyor");
    const plannedQty = numericOf(row, ["planlananAdet", "plannedQuantity", "plannedQty"]);
    const dispatchQty =
      textOf(row, ["belgeTipi"]) === "PLANLI_MUSTERI_IS"
         ? 0
        : numericOf(row, ["gelenAdet", "quantity", "adet"]);
    const price = priceInfoFor(row, model);
    const unitPrice = price.amount;
    const productionQty = numericOf(row, [
      "imalatAdedi",
      "productionQty",
      "uretimAdedi",
      "basilanAdet",
    ]);
    const base = dispatchQty || plannedQty;
    const firmKey = normalizeMatchKey(firm);
    const orderKey = normalizeMatchKey(orderNo);
    const dispatchKey = normalizeMatchKey(dispatchNo);
    const modelKey = normalizeMatchKey(modelName);
    const invoices = outgoingRows.filter((invoice) => {
      const matched = invoiceMatchesJob(invoice, {
        firmKey,
        orderKey,
        dispatchKey,
        modelKey,
      });
      if (matched && invoice?.id) usedInvoiceIds.add(String(invoice?.id));
      return matched;
    });
    const invoiceQty = invoices.reduce(
      (sum, invoice) =>
        sum + numericOf(invoice, ["adet", "quantity", "gelenAdet", "invoiceQty"]),
      0,
    );
    const invoiceAmount = invoices.reduce(
      (sum, invoice) =>
        sum +
        (numericOf(invoice, ["toplamTutar", "genelToplam", "grandTotal"]) ||
          numericOf(invoice, ["adet", "quantity"]) *
            numericOf(invoice, ["birimFiyat", "unitPrice"])),
      0,
    );
    const job = {
      id: row?.id || `incoming-${jobs.length}`,
      source: row,
      firm,
      firmKey,
      orderNo,
      orderKey,
      dispatchNo,
      dispatchKey,
      model,
      modelId: textOf(row, ["modelId", "modelKaydiId"]) || model?.id || "",
      modelName,
      rawDescription,
      modelKey,
      planDate: textOf(row, ["planTarihi", "plannedDate", "tarih", "date"]),
      dueDate: textOf(row, ["beklenenTeslimTarihi", "dueDate"]),
      plannedQty,
      dispatchQty,
      productionQty,
      invoiceQty,
      baseQty: base,
      unitPrice,
      priceSource: price.source,
      sourceKind:
        textOf(row, ["belgeTipi"]) === "PLANLI_MUSTERI_IS"
           ? "PLANLI_IS"
          : "MUSTERI_IRSALIYESI",
      invoices,
      invoiceAmount,
      note: textOf(row, ["not", "notes", "aciklama"]),
      productionRows: Array.isArray(row?.productionRows) ? row?.productionRows : [],
    };
    job.status = customerStatusOf(job);
    job.invoiceRemaining = Math.max(0, base - invoiceQty);
    job.productionRemaining = Math.max(0, base - productionQty);
    job.remainingAmount = job.unitPrice ? job.invoiceRemaining * job.unitPrice : 0;
    jobs.push(job);
  }

  for (const invoice of outgoingRows) {
    if (invoice?.id && usedInvoiceIds.has(String(invoice?.id))) continue;
    const model = findRelatedModel(models, invoice);
    const quantity = numericOf(invoice, ["adet", "quantity", "gelenAdet"]);
    const price = priceInfoFor(invoice, model);
    const unitPrice = price.amount;
    const job = {
      id: `invoice-${invoice?.id || jobs.length}`,
      source: invoice,
      firm: textOf(invoice, ["firma", "companyName", "customerName"], "-"),
      firmKey: normalizeMatchKey(textOf(invoice, ["firma", "companyName", "customerName"])),
      orderNo: textOf(invoice, ["siparisNo", "orderNo"]),
      orderKey: normalizeMatchKey(textOf(invoice, ["siparisNo", "orderNo"])),
      dispatchNo: textOf(invoice, ["irsaliyeNo", "dispatchNo", "bagliIrsaliyeNo"]),
      dispatchKey: normalizeMatchKey(
        textOf(invoice, ["irsaliyeNo", "dispatchNo", "bagliIrsaliyeNo"]),
      ),
      model,
      modelId: textOf(invoice, ["modelId", "modelKaydiId"]) || model?.id || "",
      modelName:
        firstModelName(model) ||
        (model?.id ? textOf(invoice, ["modelAdi", "modelName"], "Model bekliyor") : "Model bekliyor"),
      rawDescription: textOf(invoice, ["hamAciklama", "rawDescription", "aciklama", "description", "modelAdiOnerisi"]),
      modelKey: normalizeMatchKey(
        firstModelName(model) ||
          textOf(invoice, ["modelAdi", "modelName", "modelAdiOnerisi"]),
      ),
      planDate: textOf(invoice, ["tarih", "date"]),
      dueDate: "",
      plannedQty: quantity,
      dispatchQty: 0,
      productionQty: 0,
      invoiceQty: quantity,
      baseQty: quantity,
      unitPrice,
      priceSource: price.source,
      sourceKind: "FATURA_ILE_OLUSAN",
      invoices: [invoice],
      invoiceAmount:
        numericOf(invoice, ["toplamTutar", "genelToplam", "grandTotal"]) ||
        quantity * unitPrice,
      note: "Sadece bizim fatura kaydı bulundu; irsaliye/plan eşlemesi bekliyor.",
      productionRows: [],
    };
    job.status = customerStatusOf(job);
    job.invoiceRemaining = 0;
    job.productionRemaining = 0;
    job.remainingAmount = 0;
    jobs.push(job);
  }

  return jobs.sort((a, b) => String(b.planDate || "").localeCompare(String(a.planDate || "")));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const MODEL_TRACK_FILTERS = [
  ["ALL", "Tüm Modeller"],
  ["NO_DISPATCH", "İrsaliye Yok"],
  ["INVOICE_WAITING", "Fatura Bekliyor"],
  ["PARTIAL", "Kısmi Fatura"],
  ["CLOSED", "Adet ile Kapandı"],
  ["PRODUCTION_MISSING", "İmalat Eksik"],
  ["PRICE_WAITING", "Fiyat Bekliyor"],
];

function parseFlexibleNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return 0;
  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/-/g, "");
  const comma = unsigned.lastIndexOf(",");
  const dot = unsigned.lastIndexOf(".");
  let normalized = unsigned;
  if (comma >= 0 && dot >= 0) {
    normalized =
      comma > dot
         ? unsigned.replace(/\./g, "").replace(",", ".")
        : unsigned.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = unsigned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = unsigned.replace(/,/g, "");
  }
  const parsed = Number(`${negative ? "-" : ""}${normalized}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberFrom(row, keys, fallback = 0) {
  for (const key of keys) {
    const parsed = parseFlexibleNumber(row?.[key]);
    if (parsed) return parsed;
  }
  return fallback;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row, index) => {
    const key = String(row?.id || row?.belgeNo || row?.faturaNo || row?.irsaliyeNo || index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function modelTrackId(model) {
  return String(model?.id || model?.modelId || model?.modelKaydiId || firstModelName(model) || "");
}

function modelRecordId(model) {
  return String(model?.id || model?.modelId || model?.modelKaydiId || "");
}

function modelTrackName(model) {
  return firstModelName(model) || textOf(model, ["model", "modelKodu"], "Model");
}

function modelTrackFirm(model) {
  return textOf(model, [
    "musteriFirma",
    "musteri",
    "firma",
    "firmaAdi",
    "companyName",
    "customer",
  ], "-");
}

function modelTrackAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(raw)) return raw;
  if (/^(uploads|model-previews|model-files)\//i.test(raw)) {
    return apiUrl(`/storage/${raw}`);
  }
  if (/^storage\//i.test(raw)) return apiUrl(`/${raw}`);
  return apiUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

function modelTrackImage(model) {
  const candidates = [];
  if (Array.isArray(model?.images)) {
    model.images.forEach((image) => {
      if (typeof image === "string") {
        candidates.push(image);
      } else if (image) {
        candidates.push(
          image?.url,
          image?.path,
          image?.filePath,
          image?.thumbnailPath,
          image?.previewUrl,
          image?.desenGorseli,
        );
      }
    });
  }
  candidates.push(
    textOf(model, ["imageUrl"]),
    textOf(model, ["thumbnail"]),
    textOf(model, ["thumbnailPath"]),
    textOf(model, ["desenImageThumb"]),
    textOf(model, ["previewPath"]),
    textOf(model, ["desenGorseli"]),
  );
  for (const candidate of candidates) {
    const resolved = modelTrackAssetUrl(candidate);
    if (resolved) return resolved;
  }
  return "";
}

function ModelTrackImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="bim-image-empty">
        <ImageOff size={24} />
        Model gorseli yok
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function modelTrackPrice(model, relatedRows = []) {
  const customer = numberFrom(model, ["musteriOzelFiyat", "customerPrice"]);
  if (customer) return { amount: customer, source: "Müşteri özel fiyatı" };
  const active = numberFrom(model, [
    "guncelFiyat",
    "activePrice",
    "satisFiyati",
    "price",
    "birimFiyat",
    "unitPrice",
  ]);
  if (active) return { amount: active, source: "Model güncel fiyatı" };
  const manualRow = relatedRows.find((row) =>
    numberFrom(row, ["isFiyati", "jobPrice", "birimFiyat", "unitPrice", "fiyat"]),
  );
  const manual = numberFrom(manualRow, ["isFiyati", "jobPrice", "birimFiyat", "unitPrice", "fiyat"]);
  if (manual) return { amount: manual, source: "İş kartı fiyatı" };
  return { amount: 0, source: "Fiyat Bekliyor" };
}

function rowBelongsToModel(row, model) {
  const id = modelTrackId(model);
  const rowId = textOf(row, ["modelId", "modelKaydiId", "model_id", "modelRecordId"]);
  if (id && rowId && String(rowId) === String(id)) return true;
  const rowName = normalizeMatchKey(textOf(row, ["modelAdi", "modelName", "model", "urunAdi"]));
  const modelName = normalizeMatchKey(modelTrackName(model));
  return Boolean(rowName && modelName && rowName === modelName);
}

function isCustomerDispatch(row) {
  const kind = normalizeMatchKey(
    textOf(row, ["belgeTipi", "documentType", "belgeTuru", "type", "sourceKind"]),
  );
  if (kind.includes("DDM")) return false;
  if (kind.includes("BIZIM") || kind.includes("GIDEN") || kind.includes("OUTGOING")) return false;
  if (kind.includes("FATURA") || kind.includes("INVOICE")) return false;
  if (kind.includes("PLANLI_MUSTERI_IS")) return false;
  return true;
}

function isOurInvoice(row) {
  const kind = normalizeMatchKey(
    textOf(row, ["belgeTipi", "documentType", "belgeTuru", "type", "sourceKind"]),
  );
  if (kind.includes("DDM")) return false;
  if (kind.includes("IRSALIYE") || kind.includes("DISPATCH")) return false;
  return Boolean(kind.includes("FATURA") || kind.includes("INVOICE") || textOf(row, ["faturaNo"]));
}

function buildModelTrackRows(models, incomingRows, outgoingRows) {
  return models
    .filter((model) => modelTrackId(model))
    .map((model) => {
      const dispatches = uniqueRows([
        ...arrayOf(model?.customerDispatches),
        ...arrayOf(model?.musteriIrsaliyeleri),
        ...incomingRows.filter((row) => rowBelongsToModel(row, model) && isCustomerDispatch(row)),
      ]);
      const invoices = uniqueRows([
        ...arrayOf(model?.invoices),
        ...arrayOf(model?.gidenFaturalar),
        ...outgoingRows.filter((row) => rowBelongsToModel(row, model) && isOurInvoice(row)),
      ]);
      const relatedRows = [...dispatches, ...invoices];
      const price = modelTrackPrice(model, relatedRows);
      const dispatchQty = dispatches.reduce(
        (sum, row) =>
          sum + numberFrom(row, ["gelenAdet", "quantity", "adet", "miktar", "dispatchQty", "plannedQuantity"]),
        0,
      );
      const invoiceQty = invoices.reduce(
        (sum, row) => sum + numberFrom(row, ["adet", "quantity", "gelenAdet", "miktar", "invoiceQty"]),
        0,
      );
      const productionQty = numberFrom(model, [
        "imalatAdedi",
        "productionQty",
        "uretimAdedi",
        "basilanAdet",
        "toplamUretim",
        "toplamUretimAdedi",
        "printedQty",
      ]);
      const invoiceRemaining = dispatchQty - invoiceQty;
      const productionRemaining = dispatchQty - productionQty;
      let status = "İrsaliye Yok";
      if (!price.amount) status = "Fiyat Bekliyor";
      else if (dispatchQty <= 0) status = "İrsaliye Yok";
      else if (invoiceQty > dispatchQty) status = "Fatura Fazla";
      else if (invoiceQty > productionQty) status = "İmalat Eksik";
      else if (invoiceQty === dispatchQty && dispatchQty > 0) status = "Adet ile Kapandı";
      else if (invoiceQty > 0) status = "Kısmi Fatura";
      else if (productionQty > 0 && productionQty < dispatchQty) status = "İmalat Devam Ediyor";
      else status = "Fatura Bekliyor";
      return {
        id: modelTrackId(model),
        model,
        modelName: modelTrackName(model),
        firm: modelTrackFirm(model),
        image: modelTrackImage(model),
        price,
        dispatches,
        invoices,
        dispatchQty,
        productionQty,
        invoiceQty,
        invoiceRemaining,
        productionRemaining,
        remainingAmount: Math.max(0, invoiceRemaining) * price.amount,
        status,
      };
    })
    .sort((a, b) => String(a.modelName).localeCompare(String(b.modelName), "tr"));
}

function modelTrackFilterKey(row) {
  if (row.status === "İrsaliye Yok") return "NO_DISPATCH";
  if (row.status === "Fatura Bekliyor" || row.status === "İmalat Devam Ediyor") return "INVOICE_WAITING";
  if (row.status === "Kısmi Fatura") return "PARTIAL";
  if (row.status === "Adet ile Kapandı") return "CLOSED";
  if (row.status === "İmalat Eksik" || row.status === "Fatura Fazla") return "PRODUCTION_MISSING";
  if (row.status === "Fiyat Bekliyor") return "PRICE_WAITING";
  return "ALL";
}

function modelTrackStatusClass(status) {
  if (status === "Fatura Fazla") return "red";
  if (status === "İmalat Eksik") return "amber";
  if (status === "Adet ile Kapandı") return "green";
  if (status === "Fiyat Bekliyor") return "amber";
  return statusChipClass(status);
}

function emptyDispatchDraft(row) {
  return {
    firma: row?.firm || "",
    irsaliyeNo: "",
    tarih: todayIso(),
    adet: "",
    siparisNo: "",
    not: "",
    fileName: "",
  };
}

function emptyInvoiceDraft(row) {
  return {
    faturaNo: "",
    tarih: todayIso(),
    adet: "",
    birimFiyat: row?.price.amount || "",
    kdv: "20",
    irsaliyeNo: "",
    not: "",
    fileName: "",
  };
}

function emptyPriceDraft(row) {
  return {
    fiyat: row?.price.amount || "",
    fiyatTipi: "GENERAL",
    tarih: todayIso(),
    firma: row?.firm || "",
    not: "",
  };
}

export function ModelMerkezliMusteriTakip({ activeMainCompany }) {
  const [incomingRows, setIncomingRows] = useState([]);
  const [outgoingRows, setOutgoingRows] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState("");
  const [detailRow, setDetailRow] = useState(null);
  const [dispatchDraft, setDispatchDraft] = useState(emptyDispatchDraft());
  const [invoiceDraft, setInvoiceDraft] = useState(emptyInvoiceDraft());
  const [priceDraft, setPriceDraft] = useState(emptyPriceDraft());
  const [regionDraft, setRegionDraft] = useState([]);
  const [newRegionName, setNewRegionName] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [incoming, outgoing, modelList] = await Promise.all([
        fetchIncomingDeliveryPool(activeMainCompany),
        fetchOutgoingDocumentsPool(activeMainCompany),
        fetchMuhasebeModels(activeMainCompany),
      ]);
      setIncomingRows(Array.isArray(incoming) ? incoming : []);
      setOutgoingRows(Array.isArray(outgoing) ? outgoing : []);
      setModels(Array.isArray(modelList) ? modelList : []);
    } catch (error) {
      setMessage(error?.message || "Müşteri model takip verisi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const rows = useMemo(
    () => buildModelTrackRows(models, incomingRows, outgoingRows),
    [models, incomingRows, outgoingRows],
  );

  useEffect(() => {
    if (!rows.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  const filteredRows = useMemo(() => {
    const q = normalizeMatchKey(search);
    return rows.filter((row) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "NO_DISPATCH" && row?.dispatchQty <= 0) ||
        (filter === "PRICE_WAITING" && !row?.price.amount) ||
        (filter === "INVOICE_WAITING" && row?.dispatchQty > 0 && row.invoiceQty === 0) ||
        (filter === "PARTIAL" && row?.invoiceQty > 0 && row?.invoiceQty < row?.dispatchQty) ||
        (filter === "CLOSED" && row?.dispatchQty > 0 && row.invoiceQty === row?.dispatchQty) ||
        (filter === "PRODUCTION_MISSING" && row?.invoiceQty > row?.productionQty) ||
        modelTrackFilterKey(row) === filter;
      const haystack = normalizeMatchKey(`${row?.modelName} ${row?.firm}`);
      return matchesFilter && (!q || haystack.includes(q));
    });
  }, [rows, filter, search]);

  const selected = rows.find((row) => row.id === selectedId) || filteredRows[0] || rows[0] || null;
  const selectedRegions = useMemo(
    () => activePrintRegions(selected?.model),
    [selected?.model],
  );

  const openDispatch = () => {
    if (!selected) return;
    setDispatchDraft(emptyDispatchDraft(selected));
    setModal("dispatch");
  };

  const openInvoice = () => {
    if (!selected) return;
    setInvoiceDraft(emptyInvoiceDraft(selected));
    setModal("invoice");
  };

  const openPrice = () => {
    if (!selected) return;
    setPriceDraft(emptyPriceDraft(selected));
    setModal("price");
  };

  const saveDispatch = async () => {
    if (!selected || !dispatchDraft.irsaliyeNo || !parseFlexibleNumber(dispatchDraft.adet)) {
      setMessage("Müşteri irsaliye no ve adet zorunludur.");
      return;
    }
    setBusy(true);
    try {
      await saveIncomingDelivery(activeMainCompany, {
        firma: dispatchDraft.firma || selected.firm,
        companyName: dispatchDraft.firma || selected.firm,
        modelId: selected.id,
        modelKaydiId: selected.id,
        modelAdi: selected.modelName,
        modelName: selected.modelName,
        irsaliyeNo: dispatchDraft.irsaliyeNo,
        dispatchNo: dispatchDraft.irsaliyeNo,
        belgeNo: dispatchDraft.irsaliyeNo,
        tarih: dispatchDraft.tarih,
        date: dispatchDraft.tarih,
        gelenAdet: parseFlexibleNumber(dispatchDraft.adet),
        quantity: parseFlexibleNumber(dispatchDraft.adet),
        siparisNo: dispatchDraft.siparisNo,
        orderNo: dispatchDraft.siparisNo,
        belgeTipi: "MUSTERIDEN_GELEN_IRSALIYE",
        documentType: "CUSTOMER_DISPATCH",
        status: "İrsaliye Geldi",
        fileName: dispatchDraft.fileName,
        aciklama: dispatchDraft.not,
        notes: dispatchDraft.not,
      });
      setModal("");
      setMessage("Müşteri irsaliyesi seçili modele kaydedildi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Müşteri irsaliyesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveInvoice = async () => {
    if (!selected || !invoiceDraft.faturaNo || !parseFlexibleNumber(invoiceDraft.adet)) {
      setMessage("Fatura no ve adet zorunludur.");
      return;
    }
    setBusy(true);
    try {
      const qty = parseFlexibleNumber(invoiceDraft.adet);
      const unitPrice = parseFlexibleNumber(invoiceDraft.birimFiyat);
      await saveOutgoingDocument(activeMainCompany, {
        firma: selected.firm,
        companyName: selected.firm,
        modelId: selected.id,
        modelKaydiId: selected.id,
        modelAdi: selected.modelName,
        modelName: selected.modelName,
        faturaNo: invoiceDraft.faturaNo,
        belgeNo: invoiceDraft.faturaNo,
        tarih: invoiceDraft.tarih,
        date: invoiceDraft.tarih,
        adet: qty,
        quantity: qty,
        birimFiyat: unitPrice,
        unitPrice,
        toplamTutar: qty * unitPrice,
        genelToplam: qty * unitPrice * (1 + parseFlexibleNumber(invoiceDraft.kdv) / 100),
        kdv: parseFlexibleNumber(invoiceDraft.kdv),
        vatRate: parseFlexibleNumber(invoiceDraft.kdv),
        irsaliyeNo: invoiceDraft.irsaliyeNo,
        bagliIrsaliyeNo: invoiceDraft.irsaliyeNo,
        belgeTipi: "BIZIM_GIDEN_FATURA",
        documentType: "FATURA",
        belgeTuru: "Fatura",
        status: "Fatura Kesildi",
        fileName: invoiceDraft.fileName,
        aciklama: invoiceDraft.not,
        notes: invoiceDraft.not,
      });
      setModal("");
      setMessage("Bizim faturamız seçili modele kaydedildi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Fatura kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const savePrice = async () => {
    if (!selected || !parseFlexibleNumber(priceDraft.fiyat)) {
      setMessage("Fiyat alanı zorunludur.");
      return;
    }
    setBusy(true);
    try {
      const amount = parseFlexibleNumber(priceDraft.fiyat);
      const priceFields =
        priceDraft.fiyatTipi === "CUSTOMER"
           ? { musteriOzelFiyat: amount, customerPrice: amount }
          : { guncelFiyat: amount, activePrice: amount, satisFiyati: amount, price: amount };
      await updateModel(activeMainCompany, selected.id, {
        ...priceFields,
        modelAdi: selected.modelName,
        modelName: selected.modelName,
        musteriFirma: selected.firm,
        muhasebeModelTakipPrice: {
          amount,
          source: priceDraft.fiyatTipi === "CUSTOMER" ? "CUSTOMER" : "GENERAL",
          validFrom: priceDraft.tarih,
          customer: priceDraft.firma,
          note: priceDraft.not,
        },
      });
      setModal("");
      setMessage("Model fiyatı güncellendi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Model fiyatı güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const openModelPool = () => {
    if (!selected) return;
    setModal("modelDetail");
  };

  const openRegionEditor = () => {
    if (!selected) return;
    setRegionDraft(activePrintRegions(selected?.model));
    setNewRegionName("");
    setModal("regions");
  };

  const addRegionDraft = () => {
    const name = newRegionName.trim();
    if (!name) return;
    setRegionDraft((prev) => normalizePrintRegions([...prev, name]));
    setNewRegionName("");
  };

  const toggleRegionDraft = (id) => {
    setRegionDraft((prev) =>
      prev.map((region) =>
        String(region.id) === String(id)
           ? { ...region, isActive: region.isActive === false }
          : region,
      ),
    );
  };

  const saveRegions = async () => {
    if (!selected.id) return;
    setBusy(true);
    try {
      const nextRegions = normalizePrintRegions(regionDraft);
      const targetId = modelRecordId(selected?.model) || selected.id;
      await saveModelPrintRegions(activeMainCompany, targetId, nextRegions);
      setModels((prev) =>
        prev.map((model) =>
          String(modelRecordId(model) || modelTrackId(model)) === String(targetId)
            ? {
                ...model,
                printRegions: nextRegions,
                baskiBolgeleri: nextRegions,
                baskiBolgesi: nextRegions
                  .filter((region) => region.isActive !== false)
                  .map((region) => region.regionName)
                  .join(" + "),
              }
            : model,
        ),
      );
      setModal("");
      setMessage("Baski bolgeleri guncellendi.");
    } catch (error) {
      setMessage(error?.message || "Baski bolgeleri kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const renderDocumentRows = (items, kind) => {
    if (!items.length) {
      return (
        <tr>
          <td colSpan="6" className="muted">Kayıt yok.</td>
        </tr>
      );
    }
    return items.map((item, index) => {
      const no = textOf(item, kind === "dispatch" ? ["irsaliyeNo", "dispatchNo", "belgeNo"] : ["faturaNo", "belgeNo"]);
      const qty = numberFrom(item, ["gelenAdet", "quantity", "adet", "miktar", "invoiceQty"]);
      const unitPrice = numberFrom(item, ["birimFiyat", "unitPrice", "fiyat"]);
      return (
        <tr key={`${kind}-${item?.id || no || index}`} onClick={() => setDetailRow({ kind, item })}>
          <td>{dateText(textOf(item, ["tarih", "date", "createdAt"]))}</td>
          <td>{no || "-"}</td>
          <td>{textOf(item, ["siparisNo", "orderNo", "bagliIrsaliyeNo"], "-")}</td>
          <td className="num">{numberText(qty)}</td>
          <td className="num">{unitPrice ? money(unitPrice) : "-"}</td>
          <td>{textOf(item, ["notes", "not", "aciklama"], "-")}</td>
        </tr>
      );
    });
  };

  return (
    <>
      <div className="bim-model-track">
        <section className="bim-card bim-model-list-panel">
          <div className="bim-card-head">
            <h3>Model Listesi</h3>
            <span className="bim-pill blue">{rows.length} model</span>
          </div>
          <div className="bim-card-body bim-stack">
            <input
              value={search}
              onChange={(event) => setSearch(event?.target.value)}
              placeholder="Model veya firma ara"
            />
            <div className="bim-filter-grid model-track">
              {MODEL_TRACK_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  type="button"
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="bim-model-track-list">
              {loading ? <div className="bim-empty">Yükleniyor...</div> : null}
              {!loading && !filteredRows.length ? <div className="bim-empty">Model bulunamadı.</div> : null}
              {filteredRows.map((row) => (
                <button
                  key={row?.id}
                  className={`bim-model-track-card ${selected.id === row?.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedId(row?.id)}
                >
                  <div className="bim-model-thumb">
                    <ModelTrackImage src={row?.image} alt={row?.modelName} />
                  </div>
                  <div className="bim-model-track-card-main">
                    <strong>{row?.modelName}</strong>
                    <span>{row?.firm}</span>
                    <div className="bim-mini-kpis">
                      <small>İrs. {numberText(row?.dispatchQty)}</small>
                      <small>İml. {numberText(row?.productionQty)}</small>
                      <small>Fat. {numberText(row?.invoiceQty)}</small>
                    </div>
                    <div className="bim-model-card-foot">
                      <span>{row?.price.amount ? money(row?.price.amount) : "Fiyat Bekliyor"}</span>
                      <span className={`bim-pill ${modelTrackStatusClass(row?.status)}`}>{row?.status}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <main className="bim-model-workspace">
          {message ? <div className="bim-message">{message}</div> : null}
          {!selected ? (
            <div className="bim-empty">Desen Havuzu model kaydı bulunamadı.</div>
          ) : (
            <>
              <section className="bim-card bim-model-summary">
                <div className="bim-model-hero">
                  <div className="bim-model-preview compact">
                    <ModelTrackImage src={selected.image} alt={selected.modelName} />
                  </div>
                  <div>
                    <span className={`bim-pill ${modelTrackStatusClass(selected.status)}`}>{selected.status}</span>
                    <h2>{selected.modelName}</h2>
                    <p>{selected.firm}</p>
                    <b>{selected.price.amount ? money(selected.price.amount) : "Fiyat Bekliyor"}</b>
                    <small>{selected.price.source}</small>
                    <div className="bim-region-chips">
                      {selectedRegions.length ? (
                        selectedRegions.map((region) => (
                          <span className="bim-region-chip" key={region.id || region.regionCode}>
                            {region.regionName}
                          </span>
                        ))
                      ) : (
                        <button className="bim-region-chip muted action" type="button" onClick={openRegionEditor}>
                          Varsayilan Ön Baskı
                        </button>
                      )}
                      <button className="bim-region-chip action" type="button" onClick={openRegionEditor}>
                        Bolgeleri Duzenle
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bim-model-kpis">
                  <div><Inbox size={18} /><span>Müşteri İrsaliyesi</span><b>{numberText(selected.dispatchQty)}</b></div>
                  <div><Factory size={18} /><span>İmalat</span><b>{numberText(selected.productionQty)}</b></div>
                  <div><ReceiptText size={18} /><span>Kesilen Fatura</span><b>{numberText(selected.invoiceQty)}</b></div>
                  <div><FileText size={18} /><span>Fatura Kalan</span><b>{numberText(selected.invoiceRemaining)}</b></div>
                  <div><Layers size={18} /><span>İmalat Kalan</span><b>{numberText(selected.productionRemaining)}</b></div>
                  <div><CircleDollarSign size={18} /><span>Tahmini Kalan</span><b>{selected.price.amount ? money(selected.remainingAmount) : "Fiyat Bekliyor"}</b></div>
                </div>
              </section>

              <section className="bim-model-dropgrid">
                <button className="bim-model-drop" type="button" onClick={openDispatch}>
                  <UploadCloud className="bim-drop-icon" size={28} />
                  <b>Müşteri İrsaliyesi Bırak</b>
                  <span>PDF / XML / JPG / PNG kabul edilir. XML varsa ana kaynak kabul edilir.</span>
                </button>
                <button className="bim-model-drop invoice" type="button" onClick={openInvoice}>
                  <ReceiptText className="bim-drop-icon" size={28} />
                  <b>Bizim Faturayı Bırak</b>
                  <span>Fatura seçili modele doğrudan bağlanır; bizim irsaliyemiz burada listelenmez.</span>
                </button>
              </section>

              <section className="bim-card">
                <div className="bim-card-head">
                  <h3>Bu Modele Bırakılan Müşteri İrsaliyeleri</h3>
                  <button className="bim-btn small" type="button" onClick={openDispatch}>Müşteri İrsaliyesi Bırak</button>
                </div>
                <div className="bim-card-body bim-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>İrsaliye No</th>
                        <th>Sipariş</th>
                        <th>Adet</th>
                        <th>Fiyat</th>
                        <th>Not</th>
                      </tr>
                    </thead>
                    <tbody>{renderDocumentRows(selected.dispatches, "dispatch")}</tbody>
                  </table>
                </div>
              </section>

              <section className="bim-card">
                <div className="bim-card-head">
                  <h3>Bu Modele Bırakılan Bizim Faturalar</h3>
                  <button className="bim-btn small" type="button" onClick={openInvoice}>Bizim Faturayı Bırak</button>
                </div>
                <div className="bim-card-body bim-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>Fatura No</th>
                        <th>Bağlı İrsaliye</th>
                        <th>Adet</th>
                        <th>Birim Fiyat</th>
                        <th>Not</th>
                      </tr>
                    </thead>
                    <tbody>{renderDocumentRows(selected.invoices, "invoice")}</tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>

        <aside className="bim-card bim-model-actions-panel">
          <div className="bim-card-head">
            <h3>Hızlı İşlem</h3>
          </div>
          <div className="bim-card-body bim-stack">
            <button className="bim-btn primary full" type="button" onClick={openDispatch} disabled={!selected}>
              <Inbox size={16} />
              Müşteri İrsaliyesi Bırak
            </button>
            <button className="bim-btn full" type="button" onClick={openInvoice} disabled={!selected}>
              <ReceiptText size={16} />
              Bizim Faturayı Bırak
            </button>
            <button className="bim-btn full" type="button" onClick={openPrice} disabled={!selected}>
              <CircleDollarSign size={16} />
              Fiyat Gir / Güncelle
            </button>
            <button className="bim-btn full" type="button" onClick={() => setModal("production")} disabled={!selected}>
              <Factory size={16} />
              İmalat Kayıtlarını Gör
            </button>
            <button className="bim-btn full" type="button" onClick={openModelPool} disabled={!selected}>
              <PackageOpen size={16} />
              Model Kartini Ac
            </button>
          </div>
        </aside>
      </div>

      {modal ? (
        <div className="bim-modal-bg" role="presentation" onMouseDown={(event) => event.target === event?.currentTarget && setModal("")}>
          <div className="bim-modal-panel">
            <div className="bim-drawer-head">
              <h3>
                {modal === "dispatch" && "Müşteri İrsaliyesi Bırak"}
                {modal === "invoice" && "Bizim Faturayı Bırak"}
                {modal === "price" && "Fiyat Gir / Güncelle"}
                {modal === "production" && "İmalat Kayıtları"}
                {modal === "regions" && "Baski Bolgeleri"}
                {modal === "modelDetail" && "Model Karti"}
              </h3>
              <button className="bim-btn small" type="button" onClick={() => setModal("")}>Kapat</button>
            </div>
            <div className="bim-drawer-body">
              {selected ? (
                <div className="bim-selected-line">
                  <b>{selected.modelName}</b>
                  <span>{selected.firm}</span>
                </div>
              ) : null}

              {modal === "dispatch" ? (
                <>
                  <div className="bim-two">
                    <label className="bim-field"><span>Müşteri / Firma</span><input value={dispatchDraft.firma} onChange={(e) => setDispatchDraft({ ...dispatchDraft, firma: e.target.value })} /></label>
                    <label className="bim-field"><span>Model</span><input value={selected.modelName || ""} readOnly /></label>
                    <label className="bim-field"><span>Müşteri İrsaliye No</span><input value={dispatchDraft.irsaliyeNo} onChange={(e) => setDispatchDraft({ ...dispatchDraft, irsaliyeNo: e.target.value })} /></label>
                    <label className="bim-field"><span>Tarih</span><input type="date" value={dispatchDraft.tarih} onChange={(e) => setDispatchDraft({ ...dispatchDraft, tarih: e.target.value })} /></label>
                    <label className="bim-field"><span>İrsaliye Adedi</span><input value={dispatchDraft.adet} onChange={(e) => setDispatchDraft({ ...dispatchDraft, adet: e.target.value })} /></label>
                    <label className="bim-field"><span>Sipariş No</span><input value={dispatchDraft.siparisNo} onChange={(e) => setDispatchDraft({ ...dispatchDraft, siparisNo: e.target.value })} /></label>
                  </div>
                  <label className="bim-field"><span>XML / PDF / JPG / PNG</span><input type="file" accept=".xml,.pdf,.jpg,.jpeg,.png" onChange={(e) => setDispatchDraft({ ...dispatchDraft, fileName: e.target.files?.[0].name || "" })} /></label>
                  <label className="bim-field"><span>Not</span><textarea value={dispatchDraft.not} onChange={(e) => setDispatchDraft({ ...dispatchDraft, not: e.target.value })} /></label>
                  <button className="bim-btn primary full" type="button" onClick={saveDispatch} disabled={busy}>Kaydet</button>
                </>
              ) : null}

              {modal === "invoice" ? (
                <>
                  <div className="bim-two">
                    <label className="bim-field"><span>Model</span><input value={selected.modelName || ""} readOnly /></label>
                    <label className="bim-field"><span>Fatura No</span><input value={invoiceDraft.faturaNo} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, faturaNo: e.target.value })} /></label>
                    <label className="bim-field"><span>Fatura Tarihi</span><input type="date" value={invoiceDraft.tarih} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, tarih: e.target.value })} /></label>
                    <label className="bim-field"><span>Fatura Adedi</span><input value={invoiceDraft.adet} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, adet: e.target.value })} /></label>
                    <label className="bim-field"><span>Birim Fiyat</span><input value={invoiceDraft.birimFiyat} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, birimFiyat: e.target.value })} /></label>
                    <label className="bim-field"><span>KDV</span><input value={invoiceDraft.kdv} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, kdv: e.target.value })} /></label>
                    <label className="bim-field"><span>Faturadaki Müşteri İrsaliye No</span><input value={invoiceDraft.irsaliyeNo} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, irsaliyeNo: e.target.value })} /></label>
                  </div>
                  <label className="bim-field"><span>XML / PDF / JPG / PNG</span><input type="file" accept=".xml,.pdf,.jpg,.jpeg,.png" onChange={(e) => setInvoiceDraft({ ...invoiceDraft, fileName: e.target.files?.[0].name || "" })} /></label>
                  <label className="bim-field"><span>Not</span><textarea value={invoiceDraft.not} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, not: e.target.value })} /></label>
                  <button className="bim-btn primary full" type="button" onClick={saveInvoice} disabled={busy}>Kaydet</button>
                </>
              ) : null}

              {modal === "price" ? (
                <>
                  <div className="bim-two">
                    <label className="bim-field"><span>Model</span><input value={selected.modelName || ""} readOnly /></label>
                    <label className="bim-field"><span>Firma</span><input value={priceDraft.firma} onChange={(e) => setPriceDraft({ ...priceDraft, firma: e.target.value })} /></label>
                    <label className="bim-field"><span>Fiyat</span><input value={priceDraft.fiyat} onChange={(e) => setPriceDraft({ ...priceDraft, fiyat: e.target.value })} /></label>
                    <label className="bim-field"><span>Geçerlilik Tarihi</span><input type="date" value={priceDraft.tarih} onChange={(e) => setPriceDraft({ ...priceDraft, tarih: e.target.value })} /></label>
                    <label className="bim-field"><span>Fiyat Tipi</span><select value={priceDraft.fiyatTipi} onChange={(e) => setPriceDraft({ ...priceDraft, fiyatTipi: e.target.value })}><option value="GENERAL">Genel fiyat</option><option value="CUSTOMER">Müşteri özel fiyatı</option></select></label>
                  </div>
                  <label className="bim-field"><span>Not</span><textarea value={priceDraft.not} onChange={(e) => setPriceDraft({ ...priceDraft, not: e.target.value })} /></label>
                  <button className="bim-btn primary full" type="button" onClick={savePrice} disabled={busy}>Fiyatı Kaydet</button>
                </>
              ) : null}

              {modal === "production" ? (
                <div className="bim-table">
                  <table>
                    <tbody>
                      <tr><td>Model</td><td>{selected.modelName}</td></tr>
                      <tr><td>Desen / model kaydındaki imalat toplamı</td><td className="num">{numberText(selected.productionQty)}</td></tr>
                      <tr><td>Müşteri irsaliyesi</td><td className="num">{numberText(selected.dispatchQty)}</td></tr>
                      <tr><td>İmalat kalan</td><td className="num">{numberText(selected.productionRemaining)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : null}

              {modal === "regions" ? (
                <div className="bim-stack">
                  <div className="bim-notice">
                    Baskı bölgeleri Desen Havuzu model kartının ortak bilgisidir. İmalat bu listeyi kullanır.
                  </div>
                  <div className="bim-region-editor">
                    {regionDraft.length ? (
                      regionDraft.map((region, index) => (
                        <div className="bim-region-row" key={region.id || region.regionCode || index}>
                          <input
                            value={region.regionName}
                            onChange={(event) =>
                              setRegionDraft((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                     ? { ...item, regionName: event?.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            value={region.sortOrder || index + 1}
                            onChange={(event) =>
                              setRegionDraft((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                     ? { ...item, sortOrder: event?.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <button className="bim-btn small" type="button" onClick={() => toggleRegionDraft(region.id)}>
                            {region.isActive === false ? "Aktif Yap" : "Pasife Al"}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="bim-empty">Varsayilan Ön Baskı kullanilir.</div>
                    )}
                  </div>
                  <div className="bim-two compact">
                    <label className="bim-field">
                      <span>Yeni bolge</span>
                      <input
                        value={newRegionName}
                        onChange={(event) => setNewRegionName(event?.target.value)}
                        placeholder="On, Arka, Sol Kol..."
                      />
                    </label>
                    <button className="bim-btn" type="button" onClick={addRegionDraft}>
                      Bolge Ekle
                    </button>
                  </div>
                  <button className="bim-btn primary full" type="button" onClick={saveRegions} disabled={busy}>
                    Baski Bolgelerini Kaydet
                  </button>
                </div>
              ) : null}

              {modal === "modelDetail" ? (
                <div className="bim-table">
                  <table>
                    <tbody>
                      <tr><td>Model</td><td>{selected.modelName}</td></tr>
                      <tr><td>Firma</td><td>{selected.firm}</td></tr>
                      <tr><td>Durum</td><td>{selected.status}</td></tr>
                      <tr><td>Fiyat</td><td>{selected.price.amount ? money(selected.price.amount) : "-"}</td></tr>
                      <tr><td>Baski bolgeleri</td><td>{selectedRegions.map((region) => region.regionName).join(", ") || "Tanimli degil"}</td></tr>
                    </tbody>
                  </table>
                  <button className="bim-btn primary full" type="button" onClick={openRegionEditor}>
                    Baski Bolgelerini Duzenle
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {detailRow ? (
        <div className="bim-modal-bg" role="presentation" onMouseDown={(event) => event.target === event?.currentTarget && setDetailRow(null)}>
          <div className="bim-modal-panel compact">
            <div className="bim-drawer-head">
              <h3>{detailRow.kind === "dispatch" ? "İrsaliye Detayı" : "Fatura Detayı"}</h3>
              <button className="bim-btn small" type="button" onClick={() => setDetailRow(null)}>Kapat</button>
            </div>
            <div className="bim-drawer-body">
              {Object.entries(detailRow.item || {}).slice(0, 20).map(([key, value]) => (
                <div className="bim-check" key={key}>
                  <b>{key}</b>
                  <span>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "-")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MusteriIsHavuzu({ activeMainCompany }) {
  const [incomingRows, setIncomingRows] = useState([]);
  const [outgoingRows, setOutgoingRows] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("summary");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [planDraft, setPlanDraft] = useState({
    firma: "",
    siparisNo: "",
    modelAdi: "",
    planTarihi: todayIso(),
    beklenenTeslimTarihi: "",
    planlananAdet: "",
    birimFiyat: "",
    fiyatKaynagi: "Manuel Fiyat",
    not: "",
  });
  const [invoiceDraft, setInvoiceDraft] = useState({
    faturaNo: "",
    tarih: todayIso(),
    adet: "",
    birimFiyat: "",
    kdv: "20",
    toplamTutar: "",
  });

  const loadCustomerData = async (preferredId = "") => {
    if (!activeMainCompany?.slug) {
      setIncomingRows([]);
      setOutgoingRows([]);
      setModels([]);
      setSelectedId("");
      setMessage("Ana firma seçmeden müşteri iş havuzu açılmaz.");
      return;
    }
    setLoading(true);
    try {
      const [incoming, outgoing, modelRows] = await Promise.all([
        fetchIncomingDeliveryPool(activeMainCompany),
        fetchOutgoingDocumentsPool(activeMainCompany),
        fetchMuhasebeModels(activeMainCompany),
      ]);
      setIncomingRows(Array.isArray(incoming) ? incoming : []);
      setOutgoingRows(Array.isArray(outgoing) ? outgoing : []);
      setModels(Array.isArray(modelRows) ? modelRows : []);
      const nextJobs = buildCustomerJobs(
        Array.isArray(incoming) ? incoming : [],
        Array.isArray(outgoing) ? outgoing : [],
        Array.isArray(modelRows) ? modelRows : [],
      );
      setSelectedId((current) => {
        const desired = String(preferredId || current || "");
        return nextJobs.some((job) => String(job.id) === desired)
           ? desired
          : String(nextJobs[0].id || "");
      });
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Müşteri iş havuzu alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const jobs = useMemo(
    () => buildCustomerJobs(incomingRows, outgoingRows, models),
    [incomingRows, models, outgoingRows],
  );

  const visibleJobs = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return jobs
      .filter((job) => filter === "ALL" || statusFilterKey(job.status) === filter)
      .filter((job) => {
        if (!q) return true;
        return `${job.firm} ${job.orderNo} ${job.dispatchNo} ${job.modelName}`
          .toLocaleLowerCase("tr-TR")
          .includes(q);
      });
  }, [filter, jobs, search]);

  useEffect(() => {
    if (!visibleJobs.length) return;
    if (!visibleJobs.some((job) => String(job.id) === String(selectedId))) {
      setSelectedId(String(visibleJobs[0].id));
    }
  }, [selectedId, visibleJobs]);

  const selectedJob =
    jobs.find((job) => String(job.id) === String(selectedId)) ||
    visibleJobs[0] ||
    null;

  useEffect(() => {
    if (!selectedJob) return;
    setPlanDraft((prev) => ({
      ...prev,
      firma: prev?.firma || selectedJob.firm,
      siparisNo: prev?.siparisNo || selectedJob.orderNo,
      modelAdi: prev?.modelAdi || selectedJob.modelName,
      birimFiyat: prev?.birimFiyat || selectedJob.unitPrice || "",
    }));
    setInvoiceDraft((prev) => ({
      ...prev,
      adet: prev?.adet || selectedJob.invoiceRemaining || "",
      birimFiyat: prev?.birimFiyat || selectedJob.unitPrice || "",
      toplamTutar:
        prev?.toplamTutar ||
        (selectedJob.invoiceRemaining && selectedJob.unitPrice
           ? selectedJob.invoiceRemaining * selectedJob.unitPrice
          : ""),
    }));
  }, [selectedJob?.id]);

  const metrics = useMemo(() => {
    return jobs.reduce(
      (acc, job) => ({
        planned: acc.planned + Number(job.plannedQty || 0),
        dispatch: acc.dispatch + Number(job.dispatchQty || 0),
        production: acc.production + Number(job.productionQty || 0),
        invoice: acc.invoice + Number(job.invoiceQty || 0),
        remaining: acc.remaining + Number(job.invoiceRemaining || 0),
      }),
      { planned: 0, dispatch: 0, production: 0, invoice: 0, remaining: 0 },
    );
  }, [jobs]);

  const savePlan = async () => {
    setBusy(true);
    try {
      const saved = await saveIncomingDelivery(activeMainCompany, {
        ...planDraft,
        companyName: planDraft.firma,
        firma: planDraft.firma,
        tarih: planDraft.planTarihi || todayIso(),
        planTarihi: planDraft.planTarihi || todayIso(),
        belgeTipi: "PLANLI_MUSTERI_IS",
        status: "Planlı / İrsaliye Bekliyor",
        durum: "Planlı / İrsaliye Bekliyor",
        aciklama: planDraft.not,
        notes: planDraft.not,
        gelenAdet: 0,
        quantity: 0,
        irsaliyeNo: "",
        dispatchNo: "",
      });
      setDrawer("");
      await loadCustomerData(saved?.id);
      setMessage("Planlı iş kaydı açıldı ve müşteri iş havuzuna alındı.");
    } catch (error) {
      setMessage(error?.message || "Planlı iş kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveInvoice = async () => {
    if (!selectedJob) return;
    setBusy(true);
    try {
      const qty = Number(invoiceDraft.adet || 0);
      const unitPrice = Number(invoiceDraft.birimFiyat || selectedJob.unitPrice || 0);
      await saveOutgoingDocument(activeMainCompany, {
        ...invoiceDraft,
        firma: selectedJob.firm,
        companyName: selectedJob.firm,
        tarih: invoiceDraft.tarih || todayIso(),
        documentType: "Fatura",
        belgeTuru: "Fatura",
        belgeNo: invoiceDraft.faturaNo,
        faturaNo: invoiceDraft.faturaNo,
        irsaliyeNo: selectedJob.dispatchNo,
        bagliIrsaliyeNo: selectedJob.dispatchNo,
        siparisNo: selectedJob.orderNo,
        modelId: selectedJob.modelId,
        modelAdi: selectedJob.modelName,
        adet: qty,
        quantity: qty,
        birimFiyat: unitPrice,
        unitPrice,
        araToplam: qty * unitPrice,
        toplamTutar:
          Number(invoiceDraft.toplamTutar || 0) ||
          qty * unitPrice * (1 + Number(invoiceDraft.kdv || 0) / 100),
      });
      setDrawer("");
      await loadCustomerData(selectedJob.id);
      setMessage("Bizim fatura kaydı seçili iş kartına eşleşecek şekilde kaydedildi.");
    } catch (error) {
      setMessage(error?.message || "Bizim fatura kaydı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const overInvoice =
    selectedJob &&
    Number(invoiceDraft.adet || 0) > 0 &&
    Number(invoiceDraft.adet || 0) > Number(selectedJob.invoiceRemaining || 0);

  const modelCandidates = useMemo(() => {
    const q = modelSearch.trim().toLocaleLowerCase("tr-TR");
    return models
      .filter((model) => {
        if (!q) return true;
        return `${firstModelName(model)} ${textOf(model, ["musteriFirma", "firma", "companyName"])} ${textOf(model, ["etiket", "tag", "zemin"])}`
          .toLocaleLowerCase("tr-TR")
          .includes(q);
      })
      .slice(0, 80);
  }, [modelSearch, models]);

  const selectedModel =
    modelCandidates.find((model) => String(model?.id) === String(selectedModelId)) ||
    models.find((model) => String(model?.id) === String(selectedModelId)) ||
    null;

  const openModelDrawer = (job = selectedJob) => {
    if (!job) return;
    setSelectedId(String(job.id));
    setModelSearch(job.rawDescription || job.modelName || "");
    setSelectedModelId(job.modelId || "");
    setDrawer("model");
  };

  const bindSelectedModel = async () => {
    if (!selectedJob || !selectedModel) return;
    setBusy(true);
    try {
      const price = priceInfoFor(selectedJob.source, selectedModel);
      await saveIncomingDelivery(activeMainCompany, {
        ...selectedJob.source,
        id: selectedJob.source?.id || selectedJob.id,
        modelId: selectedModel?.id,
        modelKaydiId: selectedModel?.id,
        modelAdi: firstModelName(selectedModel),
        hamAciklama: selectedJob.rawDescription || selectedJob.source.hamAciklama || selectedJob.source.aciklama,
        birimFiyat: price.amount || selectedJob.unitPrice || "",
        unitPrice: price.amount || selectedJob.unitPrice || "",
        fiyatKaynagi: price.source || selectedJob.priceSource || "",
        priceSource: price.source || selectedJob.priceSource || "",
        status: selectedJob.dispatchQty ? "Model Bağlı / Fatura Bekliyor" : selectedJob.status,
        durum: selectedJob.dispatchQty ? "Model Bağlı / Fatura Bekliyor" : selectedJob.status,
        mappingRuleDraft: {
          rawDescriptionNormalized: normalizeMatchKey(selectedJob.rawDescription),
          orderNoPattern: selectedJob.orderNo || "",
          dispatchPattern: selectedJob.dispatchNo || "",
          modelId: selectedModel?.id,
          confidence: 1,
          isActive: true,
        },
      });
      setDrawer("");
      await loadCustomerData(selectedJob.id);
      setMessage("Model bağlandı; ham açıklama korundu ve fiyat/kalan tutar yeniden hesaplandı.");
    } catch (error) {
      setMessage(error?.message || "Model bağlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const openPlanFromJob = () => {
    if (!selectedJob) return;
    setPlanDraft({
      firma: selectedJob.firm || "",
      siparisNo: selectedJob.orderNo || "",
      modelAdi: selectedJob.modelName === "Model bekliyor" ? "" : selectedJob.modelName,
      planTarihi: todayIso(),
      beklenenTeslimTarihi: "",
      planlananAdet: selectedJob.dispatchQty || selectedJob.baseQty || "",
      birimFiyat: selectedJob.unitPrice || "",
      fiyatKaynagi: selectedJob.priceSource || "Manuel Fiyat",
      not: selectedJob.rawDescription ? `İrsaliyeden plan: ${selectedJob.rawDescription}` : "",
    });
    setDrawer("plan");
  };

  return (
    <div className="bim-stack">
      <div className="bim-top bim-top-embedded">
        <div className="bim-embedded-title">
          <h3>Müşteri İş Havuzu</h3>
          <p>Planlı iş, müşteri irsaliyesi, imalat ve bizim fatura tek kartta takip edilir.</p>
        </div>
        <div className="bim-actions">
          <button className="bim-btn primary" type="button" onClick={() => setDrawer("plan")}>
            Planlı İş Aç
          </button>
          <button className="bim-btn" type="button" onClick={() => setDrawer("invoice")} disabled={!selectedJob}>
            Bizim Fatura Bağla
          </button>
          <button className="bim-btn" type="button" onClick={() => loadCustomerData(selectedId)} disabled={loading || busy}>
            <ErpIcon name="yenile" size={15} /> Güncelle
          </button>
        </div>
      </div>

      {message ? <div className="bim-notice blue">{message}</div> : null}

      <section className="bim-layout">
        <aside className="bim-card">
          <div className="bim-card-head">
            <h3>Müşteri İş Havuzu</h3>
            <span className="bim-pill blue">{numberText(visibleJobs.length)} kayıt</span>
          </div>
          <div className="bim-card-body bim-stack">
            <input
              value={search}
              onChange={(event) => setSearch(event?.target.value)}
              placeholder="Firma, sipariş, irsaliye veya model ara"
            />
            <div className="bim-filter-grid bim-filter-grid-wide customer">
              {CUSTOMER_STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  type="button"
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="bim-list customer">
              {visibleJobs.map((job) => (
                <button
                  key={job.id}
                  className={`bim-doc ${String(job.id) === String(selectedId) ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedId(String(job.id))}
                >
                  <div className="topline">
                    <b>{job.modelName}</b>
                    <span className={`bim-pill ${statusChipClass(job.status)}`}>{job.status}</span>
                  </div>
                  <div className="firm">{job.firm}</div>
                  {job.rawDescription && job.modelName === "Model bekliyor" ? (
                    <div className="meta">Ham: {job.rawDescription}</div>
                  ) : null}
                  <div className="meta">
                    Sipariş: {job.orderNo || "-"} • {job.dispatchNo || "İrsaliye bekliyor"}
                  </div>
                  <div className="bim-card-mini-grid">
                    <small>Plan {numberText(job.plannedQty)}</small>
                    <small>Kalan {numberText(job.invoiceRemaining)}</small>
                    <small>{job.unitPrice ? money(job.remainingAmount) : "Fiyat tanımlanınca hesaplanır"}</small>
                  </div>
                  {job.modelName === "Model bekliyor" ? (
                    <span
                      className="bim-mini-action"
                      onClick={(event) => {
                        event?.stopPropagation();
                        openModelDrawer(job);
                      }}
                    >
                      Desen Havuzundan Model Bağla
                    </span>
                  ) : null}
                </button>
              ))}
              {!visibleJobs.length ? (
                <div className="bim-empty">Bu filtrede müşteri iş kartı yok.</div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="bim-stack">
          <div className="bim-stats customer">
            <StatCard label="Planlanan Adet" value={numberText(metrics.planned)} />
            <StatCard label="Gelen İrsaliye" value={numberText(metrics.dispatch)} />
            <StatCard label="İmalat Adedi" value={numberText(metrics.production)} />
            <StatCard label="Kesilen Fatura" value={numberText(metrics.invoice)} />
            <StatCard label="Fatura Kalanı" value={numberText(metrics.remaining)} />
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <div>
                <h3>{selectedJob.modelName || "Müşteri iş kartı"}</h3>
                <small>
                  {selectedJob
                     ? `${selectedJob.firm} • Sipariş ${selectedJob.orderNo || "-"} • ${selectedJob.dispatchNo || "İrsaliye bekliyor"}`
                    : "Soldan bir iş seçin."}
                </small>
              </div>
              <span className={`bim-pill ${statusChipClass(selectedJob.status)}`}>
                {selectedJob.status || "Seçim yok"}
              </span>
            </div>
            <div className="bim-card-body bim-stack">
              {selectedJob ? (
                <>
                  <div className="bim-work-tabs">
                    {[
                      ["summary", "İş Özeti"],
                      ["invoices", "Kesilen Faturalar"],
                      ["production", "İmalat Takibi"],
                      ["source", "Belge Okuma"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={tab === key ? "active" : ""}
                        onClick={() => setTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {tab === "summary" ? (
                    <>
                      <div className="bim-grid-4">
                        <ReadField label="Müşteri" value={selectedJob.firm} />
                        <ReadField label="Sipariş No" value={selectedJob.orderNo || "-"} />
                        <ReadField label="Müşteri İrsaliye No" value={selectedJob.dispatchNo || "İrsaliye bekliyor"} />
                        <ReadField label="Plan Tarihi" value={dateText(selectedJob.planDate)} />
                        <ReadField label="Bağlı Model" value={selectedJob.modelName} />
                        <ReadField label="Güncel Birim Fiyat" value={selectedJob.unitPrice ? money(selectedJob.unitPrice) : "Fiyat Bekliyor"} />
                        <ReadField label="Fiyat Kaynağı" value={selectedJob.priceSource || "-"} />
                        <ReadField label="Durum" value={selectedJob.status} />
                      </div>
                      <div className="bim-table big">
                        <table>
                          <thead>
                            <tr>
                              <th>Model</th>
                              <th className="num">Planlanan</th>
                              <th className="num">İrsaliye</th>
                              <th className="num">İmalat</th>
                              <th className="num">Fatura</th>
                              <th className="num">Fatura Kalan</th>
                              <th className="num">İmalat Kalan</th>
                              <th className="num">Kesilen Tutar</th>
                              <th className="num">Tahmini Kalan</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td><b>{selectedJob.modelName}</b></td>
                              <td className="num">{numberText(selectedJob.plannedQty)}</td>
                              <td className="num">{numberText(selectedJob.dispatchQty)}</td>
                              <td className="num">{numberText(selectedJob.productionQty)}</td>
                              <td className="num">{numberText(selectedJob.invoiceQty)}</td>
                              <td className="num">{numberText(selectedJob.invoiceRemaining)}</td>
                              <td className="num">{numberText(selectedJob.productionRemaining)}</td>
                              <td className="num">{money(selectedJob.invoiceAmount)}</td>
                              <td className="num">{selectedJob.unitPrice ? money(selectedJob.remainingAmount) : "Fiyat Bekliyor"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className={`bim-notice ${selectedJob.dispatchQty ? "blue" : "amber"}`}>
                        {selectedJob.dispatchQty
                           ? "İrsaliye, imalat ve fatura adetleri aynı iş kartında izleniyor."
                          : "Bu planlı işte irsaliye henüz gelmedi; fiyat varsa tahmini tutar hesaplanır."}
                      </div>
                    </>
                  ) : null}

                  {tab === "invoices" ? (
                    <div className="bim-table big">
                      <table>
                        <thead>
                          <tr>
                            <th>Fatura No</th>
                            <th>Tarih</th>
                            <th>İrsaliye No</th>
                            <th>Model</th>
                            <th className="num">Adet</th>
                            <th className="num">Birim Fiyat</th>
                            <th className="num">KDV</th>
                            <th className="num">Toplam</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedJob.invoices.map((invoice) => (
                            <tr key={invoice?.id || invoice?.faturaNo}>
                              <td><b>{textOf(invoice, ["faturaNo", "invoiceNo", "belgeNo"], "-")}</b></td>
                              <td>{dateText(textOf(invoice, ["tarih", "date"]))}</td>
                              <td>{textOf(invoice, ["irsaliyeNo", "dispatchNo", "bagliIrsaliyeNo"], "-")}</td>
                              <td>{textOf(invoice, ["modelAdi", "modelName"], selectedJob.modelName)}</td>
                              <td className="num">{numberText(numericOf(invoice, ["adet", "quantity"]))}</td>
                              <td className="num">{money(numericOf(invoice, ["birimFiyat", "unitPrice"]))}</td>
                              <td className="num">%{numberText(numericOf(invoice, ["kdv", "vatRate"]))}</td>
                              <td className="num">{money(numericOf(invoice, ["toplamTutar", "genelToplam", "grandTotal"]))}</td>
                            </tr>
                          ))}
                          {!selectedJob.invoices.length ? (
                            <tr><td colSpan="8">Bu iş kartına bağlı bizim fatura yok.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {tab === "production" ? (
                    <>
                      <div className="bim-notice green">
                        Muhasebe ekranı imalat girişi oluşturmaz; bağlı işin imalat bilgisini gösterir.
                      </div>
                      <div className="bim-table big">
                        <table>
                          <thead>
                            <tr>
                              <th>Tarih</th>
                              <th>Makine</th>
                              <th>Vardiya</th>
                              <th>Makinacı</th>
                              <th className="num">Üretim Adedi</th>
                              <th>Not</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedJob.productionRows.map((row, index) => (
                              <tr key={row?.id || index}>
                                <td>{dateText(row?.date || row?.tarih)}</td>
                                <td>{row?.machine || row?.makine || "-"}</td>
                                <td>{row?.shift || row?.vardiya || "-"}</td>
                                <td>{row?.operator || row?.makinaci || "-"}</td>
                                <td className="num">{numberText(row?.qty || row?.adet || row?.quantity)}</td>
                                <td>{row?.note || row?.not || "-"}</td>
                              </tr>
                            ))}
                            {!selectedJob.productionRows.length ? (
                              <tr><td colSpan="6">Bu iş kartı için detaylı imalat satırı yok; toplam alanda izleniyor.</td></tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}

                  {tab === "source" ? (
                    <div className="bim-grid-4">
                      <ReadField label="Kaynak Tipi" value={selectedJob.source.sourceType || selectedJob.source.belgeTipi || "-"} />
                      <ReadField label="Belge No" value={selectedJob.source.belgeNo || selectedJob.dispatchNo || "-"} />
                      <ReadField label="Dosya" value={selectedJob.source.fileName || selectedJob.source.belgeDosyaYolu || "-"} />
                      <ReadField label="Son Güncelleme" value={dateText(selectedJob.source.updatedAt || selectedJob.source.createdAt)} />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="bim-empty">Müşteri iş kartı bulunamadı. Planlı İş Aç ile yeni kayıt başlatabilirsiniz.</div>
              )}
            </div>
          </div>
        </main>

        <aside className="bim-stack bim-supplier-side">
          <div className="bim-card compact">
            <div className="bim-card-head">
              <h3>Model, Fiyat ve Kontrol</h3>
              <span className={`bim-pill ${selectedJob.modelId ? "green" : "amber"}`}>
                {selectedJob.modelId ? "Model Bağlı" : "Model Bekliyor"}
              </span>
            </div>
            <div className="bim-card-body bim-stack">
              <div className="bim-model-preview">
                {selectedJob.model?.imageUrl || selectedJob.model?.gorselUrl ? (
                  <img src={selectedJob.model?.imageUrl || selectedJob.model?.gorselUrl} alt={selectedJob.modelName} />
                ) : (
                  "Model görseli yok"
                )}
              </div>
              <SummaryLine label="Model" value={selectedJob.modelName || "-"} />
              <SummaryLine label="Ham İrsaliye Açıklaması" value={selectedJob.rawDescription || "-"} />
              <SummaryLine label="Firma" value={selectedJob.firm || "-"} />
              <SummaryLine label="Sipariş" value={selectedJob.orderNo || "-"} />
              <SummaryLine label="İş Kartı Fiyatı" value={selectedJob.unitPrice ? money(selectedJob.unitPrice) : "Fiyat Bekliyor"} />
              <SummaryLine label="Fiyat Kaynağı" value={selectedJob.priceSource || "-"} />
              <SummaryLine label="Fatura Kalan" value={numberText(selectedJob.invoiceRemaining)} />
              <SummaryLine label="Kalan Tutar" value={selectedJob.unitPrice ? money(selectedJob.remainingAmount) : "Fiyat Bekliyor"} />
              <div className="bim-inline-actions">
                <button className="bim-btn small primary" type="button" onClick={() => openModelDrawer()} disabled={!selectedJob}>
                  Desen Havuzundan Model Bağla
                </button>
                <button className="bim-btn small" type="button" onClick={openPlanFromJob} disabled={!selectedJob || selectedJob.sourceKind === "PLANLI_IS"}>
                  Plan Oluştur
                </button>
                <button className="bim-btn small" type="button" onClick={() => setDrawer("price")} disabled={!selectedJob}>
                  Fiyat Geçmişi / Güncelle
                </button>
                <button className="bim-btn small" type="button" onClick={() => setDrawer("invoice")} disabled={!selectedJob}>
                  Bizim Fatura Bağla
                </button>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {drawer ? (
        <>
          <button className="bim-drawer-bg" type="button" aria-label="Paneli kapat" onClick={() => setDrawer("")} />
          <aside className="bim-drawer show" aria-label="Müşteri iş paneli">
            <div className="bim-drawer-head">
              <div>
                <h3>
                  {drawer === "plan"
                     ? "Planlı İş Aç"
                    : drawer === "invoice"
                       ? "Bizim Fatura Bağla"
                      : drawer === "model"
                         ? "Desen Havuzundan Model Bağla"
                        : "Fiyat Geçmişi"}
                </h3>
                <small>{selectedJob.modelName || "Müşteri iş havuzu"}</small>
              </div>
              <button className="bim-btn small" type="button" onClick={() => setDrawer("")}>Kapat</button>
            </div>
            <div className="bim-drawer-body">
              {drawer === "plan" ? (
                <div className="bim-card compact">
                  <div className="bim-card-body bim-stack">
                    <div className="bim-two">
                      <EditField label="Müşteri/Firma" value={planDraft.firma} onChange={(value) => setPlanDraft((prev) => ({ ...prev, firma: value }))} />
                      <EditField label="Sipariş No" value={planDraft.siparisNo} onChange={(value) => setPlanDraft((prev) => ({ ...prev, siparisNo: value }))} />
                      <EditField label="Model" value={planDraft.modelAdi} onChange={(value) => setPlanDraft((prev) => ({ ...prev, modelAdi: value }))} />
                      <EditField label="Plan Tarihi" type="date" value={planDraft.planTarihi} onChange={(value) => setPlanDraft((prev) => ({ ...prev, planTarihi: value }))} />
                      <EditField label="Beklenen Teslim Tarihi" type="date" value={planDraft.beklenenTeslimTarihi} onChange={(value) => setPlanDraft((prev) => ({ ...prev, beklenenTeslimTarihi: value }))} />
                      <EditField label="Planlanan Adet" type="number" value={planDraft.planlananAdet} onChange={(value) => setPlanDraft((prev) => ({ ...prev, planlananAdet: value }))} />
                      <EditField label="Birim Fiyat" type="number" value={planDraft.birimFiyat} onChange={(value) => setPlanDraft((prev) => ({ ...prev, birimFiyat: value }))} />
                      <EditField label="Fiyat Kaynağı" value={planDraft.fiyatKaynagi} onChange={(value) => setPlanDraft((prev) => ({ ...prev, fiyatKaynagi: value }))} />
                    </div>
                    <EditField label="Not" value={planDraft.not} onChange={(value) => setPlanDraft((prev) => ({ ...prev, not: value }))} multiline />
                    <div className="bim-notice blue">
                      Fiyat girildiyse tahmini toplam: {money(Number(planDraft.planlananAdet || 0) * Number(planDraft.birimFiyat || 0))}
                    </div>
                    <button className="bim-btn primary full" type="button" onClick={savePlan} disabled={busy || !planDraft.firma || !planDraft.modelAdi}>
                      Planlı İşi Kaydet
                    </button>
                  </div>
                </div>
              ) : null}

              {drawer === "invoice" ? (
                <div className="bim-card compact">
                  <div className="bim-card-body bim-stack">
                    <div className="bim-notice blue">
                      Bu form bizim fatura kaydını mevcut outgoing-documents havuzuna yazar. XML/PDF parser çıktısı geldiğinde aynı alanlar otomatik dolabilir.
                    </div>
                    <div className="bim-two">
                      <EditField label="Fatura No" value={invoiceDraft.faturaNo} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, faturaNo: value }))} />
                      <EditField label="Tarih" type="date" value={invoiceDraft.tarih} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, tarih: value }))} />
                      <EditField label="Adet" type="number" value={invoiceDraft.adet} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, adet: value }))} />
                      <EditField label="Birim Fiyat" type="number" value={invoiceDraft.birimFiyat} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, birimFiyat: value }))} />
                      <EditField label="KDV Oranı" type="number" value={invoiceDraft.kdv} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, kdv: value }))} />
                      <EditField label="Toplam" type="number" value={invoiceDraft.toplamTutar} onChange={(value) => setInvoiceDraft((prev) => ({ ...prev, toplamTutar: value }))} />
                    </div>
                    {overInvoice ? (
                      <div className="bim-notice amber">
                        Fatura adedi kalan adedi aşıyor. Açıklamalı fazla fatura onayı backend audit akışı gerektirir; bu kayıt normal onaya kapalı tutuldu.
                      </div>
                    ) : null}
                    <button className="bim-btn primary full" type="button" onClick={saveInvoice} disabled={busy || overInvoice || !invoiceDraft.faturaNo || !selectedJob}>
                      Faturayı İş Kartına Bağla
                    </button>
                  </div>
                </div>
              ) : null}

              {drawer === "model" ? (
                <div className="bim-card compact">
                  <div className="bim-card-body bim-stack">
                    <div className="bim-model-bind">
                      <section className="bim-stack">
                        <h4>İrsaliyeden Gelen Ham Bilgi</h4>
                        <SummaryLine label="Ham Açıklama" value={selectedJob.rawDescription || "-"} />
                        <SummaryLine label="Firma" value={selectedJob.firm || "-"} />
                        <SummaryLine label="Sipariş No" value={selectedJob.orderNo || "-"} />
                        <SummaryLine label="İrsaliye No" value={selectedJob.dispatchNo || "-"} />
                        <SummaryLine label="Tarih" value={dateText(selectedJob.planDate)} />
                        <SummaryLine label="İrsaliye Adedi" value={numberText(selectedJob.dispatchQty)} />
                        <div className="bim-notice blue">
                          Aynı firma + ham açıklama + sipariş yapısı tekrar gelirse bu model öneri olarak kullanılabilir; kesin kayıt kullanıcı onayıyla yapılır.
                        </div>
                      </section>
                      <section className="bim-stack">
                        <input
                          value={modelSearch}
                          onChange={(event) => setModelSearch(event?.target.value)}
                          placeholder="Model adı, firma veya etiket ara"
                        />
                        <div className="bim-model-grid">
                          {modelCandidates.map((model) => (
                            <button
                              key={model?.id}
                              type="button"
                              className={String(selectedModelId) === String(model?.id) ? "active" : ""}
                              onClick={() => setSelectedModelId(String(model?.id))}
                            >
                              <div className="bim-model-thumb">
                                {model?.imageUrl || model?.gorselUrl ? (
                                  <img src={model?.imageUrl || model?.gorselUrl} alt={firstModelName(model)} />
                                ) : (
                                  <span>Görsel yok</span>
                                )}
                              </div>
                              <b>{firstModelName(model) || "Model"}</b>
                              <small>{textOf(model, ["musteriFirma", "firma", "companyName"], "-")}</small>
                              <small>{firstModelPrice(model) ? money(firstModelPrice(model)) : "Fiyat bekliyor"}</small>
                            </button>
                          ))}
                          {!modelCandidates.length ? <div className="bim-empty">Desen havuzunda uygun model bulunamadı.</div> : null}
                        </div>
                      </section>
                      <section className="bim-stack">
                        <h4>Seçilen Model Etkisi</h4>
                        <div className="bim-model-preview">
                          {selectedModel?.imageUrl || selectedModel?.gorselUrl ? (
                            <img src={selectedModel?.imageUrl || selectedModel?.gorselUrl} alt={firstModelName(selectedModel)} />
                          ) : (
                            "Model seçin"
                          )}
                        </div>
                        <SummaryLine label="Model" value={firstModelName(selectedModel) || "-"} />
                        <SummaryLine label="Firma" value={textOf(selectedModel, ["musteriFirma", "firma", "companyName"], "-")} />
                        <SummaryLine label="Fiyat Kaynağı" value={priceInfoFor(selectedJob.source || {}, selectedModel).source || "-"} />
                        <SummaryLine label="Birim Fiyat" value={priceInfoFor(selectedJob.source || {}, selectedModel).amount ? money(priceInfoFor(selectedJob.source || {}, selectedModel).amount) : "Fiyat Bekliyor"} />
                        <SummaryLine
                          label="Tahmini Kalan"
                          value={
                            priceInfoFor(selectedJob.source || {}, selectedModel).amount
                               ? money((selectedJob.invoiceRemaining || selectedJob.dispatchQty || 0) * priceInfoFor(selectedJob.source || {}, selectedModel).amount)
                              : "Fiyat tanımlanınca hesaplanır"
                          }
                        />
                        <button className="bim-btn primary full" type="button" onClick={bindSelectedModel} disabled={busy || !selectedModel || !selectedJob.source?.id}>
                          Onayla ve Bağla
                        </button>
                      </section>
                    </div>
                  </div>
                </div>
              ) : null}

              {drawer === "price" ? (
                <div className="bim-card compact">
                  <div className="bim-card-body bim-stack">
                    <div className="bim-notice amber">
                      Eski iş kartlarının fiyatı otomatik değişmez; bu panel mevcut fiyat kaynaklarını görünür kılar.
                    </div>
                    <SummaryLine label="İş Kartı Fiyatı" value={selectedJob.unitPrice ? money(selectedJob.unitPrice) : "Fiyat Bekliyor"} />
                    <SummaryLine label="Fiyat Kaynağı" value={selectedJob.priceSource || "-"} />
                    <SummaryLine label="Model Güncel Fiyatı" value={firstModelPrice(selectedJob.model) ? money(firstModelPrice(selectedJob.model)) : "Fiyat Bekliyor"} />
                    <div className="bim-table big">
                      <table>
                        <thead>
                          <tr><th>Tarih</th><th>Model</th><th>Fiyat Türü</th><th className="num">Birim Fiyat</th><th>Kullanım</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{dateText(selectedJob.source.updatedAt || selectedJob.planDate)}</td>
                            <td>{selectedJob.modelName || "-"}</td>
                            <td>{selectedJob.priceSource || "İş kartı fiyatı"}</td>
                            <td className="num">{selectedJob.unitPrice ? money(selectedJob.unitPrice) : "Fiyat Bekliyor"}</td>
                            <td>Bu iş kartında kullan</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function SupplierBelgeMerkezi({ activeMainCompany, refreshKey, onRefresh }) {
  const uploadRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [statusTab, setStatusTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [lotDrafts, setLotDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [controlDrawerOpen, setControlDrawerOpen] = useState(false);
  const [supplierTab, setSupplierTab] = useState("preview");
  const [supplierFirmFilter, setSupplierFirmFilter] = useState("");

  const loadRows = async (preferredId = "") => {
    if (!activeMainCompany?.slug) {
      setRows([]);
      setSelectedId("");
      setSelectedDetail(null);
      setMessage("Ana firma secmeden tedarikci belge merkezi acilmaz.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetchBelgeImport(activeMainCompany, { _ts: Date.now() });
      const supplierRows = (Array.isArray(response) ? response : []).filter(
        (row) => row.documentKind === "SUPPLIER_INVOICE",
      );
      setRows(supplierRows);
      setSelectedId((current) => {
        const desired = String(preferredId || current || "");
        return supplierRows.some((row) => String(row?.id) === desired)
           ? desired
          : String(supplierRows[0].id || "");
      });
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Tedarikci belge listesi alinamadi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [activeMainCompany?.slug, activeMainCompany?.id, refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    let alive = true;
    fetchBelgeImportDetail(activeMainCompany, selectedId)
      .then((detail) => {
        if (!alive) return;
        setSelectedDetail(detail || null);
        const nextDrafts = {};
        (detail.lines || []).forEach((line) => {
          if (line.id) nextDrafts[line.id] = line?.lotNo || "";
        });
        setLotDrafts(nextDrafts);
      })
      .catch((error) => {
        if (!alive) return;
        setSelectedDetail(null);
        setMessage(error?.message || "Belge detayi alinamadi.");
      });
    return () => {
      alive = false;
    };
  }, [activeMainCompany, selectedId]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((row) => {
        if (statusTab === "ALL") return true;
        if (statusTab === "ISSUE") return hasIssueStatus(row);
        if (statusTab === "QUARANTINE") return isQuarantined(row);
        if (statusTab === "APPROVED") return isProcessedStatus(row?.status);
        return row.status === statusTab;
      })
      .filter((row) => {
        if (!query) return true;
        return `${row?.documentNo || ""} ${supplierName(row)} ${row?.issueDate || ""} ${row?.modelGuess || ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(query);
      });
  }, [rows, search, statusTab]);

  const supplierFirmRows = useMemo(
    () =>
      Array.from(
        filteredRows
          .reduce((map, row) => {
            const name = supplierName(row);
            const key = String(row?.firmId || row?.issuerTaxNo || name || "-");
            const current =
              map.get(key) || {
                id: key,
                name,
                count: 0,
                total: 0,
                latestDate: "",
              };
            current.count += 1;
            current.total += Number(row?.grandTotal || 0);
            current.latestDate =
              String(row?.issueDate || "") > String(current.latestDate || "")
                ? row?.issueDate
                : current.latestDate;
            map.set(key, current);
            return map;
          }, new Map())
          .values(),
      ).sort((left, right) => right.total - left.total),
    [filteredRows],
  );

  const visibleRows = useMemo(() => {
    if (!supplierFirmFilter) return filteredRows;
    return filteredRows.filter((row) => {
      const key = String(
        row?.firmId || row?.issuerTaxNo || supplierName(row) || "-",
      );
      return key === supplierFirmFilter;
    });
  }, [filteredRows, supplierFirmFilter]);

  useEffect(() => {
    if (!visibleRows.length) return;
    if (!visibleRows.some((row) => String(row?.id) === String(selectedId))) {
      setSelectedId(String(visibleRows[0].id));
    }
  }, [selectedId, visibleRows]);

  useEffect(() => {
    if (
      supplierFirmFilter &&
      !supplierFirmRows.some((firm) => firm.id === supplierFirmFilter)
    ) {
      setSupplierFirmFilter("");
    }
  }, [supplierFirmFilter, supplierFirmRows]);

  const selectedRow = useMemo(() => {
    const base =
      rows.find((row) => String(row?.id) === String(selectedId)) || null;
    return selectedDetail ? { ...(base || {}), ...selectedDetail } : base || {};
  }, [rows, selectedDetail, selectedId]);

  const metrics = useMemo(() => {
    const source = Array.isArray(rows) ? rows : [];
    return {
      total: source.length,
      ready: source.filter((row) => row.status === "READY").length,
      missing: source.filter((row) => hasIssueStatus(row)).length,
      approved: source.filter((row) => isProcessedStatus(row?.status)).length,
      amount: source.reduce(
        (sum, row) => sum + Number(row?.grandTotal || 0),
        0,
      ),
    };
  }, [rows]);

  const allReady = useMemo(() => {
    return canApproveRow(selectedRow);
  }, [selectedRow]);

  const hasLines =
    Array.isArray(selectedRow?.lines) && selectedRow?.lines.length > 0;
  const hasAllProducts =
    hasLines && selectedRow?.lines?.every((line) => !!line?.productId);
  const lotRelevantLines = hasLines
     ? selectedRow?.lines?.filter((line) => isLotRelevantLine(line))
    : [];
  const hasAllRelevantLots =
    hasLines &&
    lotRelevantLines.every((line) =>
      String(line?.lotNo || lotDrafts[line?.id] || "").trim(),
    );
  const selectedProcessed = isProcessedStatus(selectedRow.status);
  const selectedWarnings = warningFieldsOf(selectedRow);
  const selectedBlockers = approvalBlockersOf(selectedRow);
  const controlSummary = controlSummaryOf(selectedRow);
  const accountingEffects = selectedRow.accountingEffects || {};
  const postingType = accountingEffects.supplierPostingType || "OPEN_PAYABLE";
  const isOpenPayable = postingType === "OPEN_PAYABLE";

  const retrySelected = async () => {
    if (!selectedRow.id) return;
    setBusy(true);
    try {
      await retryBelgeImport(activeMainCompany, selectedRow.id);
      await loadRows(selectedRow.id);
      setMessage("Belge tekrar kontrol edildi.");
    } catch (error) {
      setMessage(error?.message || "Belge tekrar kontrol edilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const rejectSelected = async () => {
    if (!selectedRow.id) return;
    if (!window.confirm("Secili belge reddedilsin mi")) return;
    setBusy(true);
    try {
      await rejectBelgeImport(activeMainCompany, selectedRow.id);
      await loadRows(selectedRow.id);
      setMessage("Belge reddedildi.");
    } catch (error) {
      setMessage(error?.message || "Belge reddedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const convertSelectedToPaidExpense = async () => {
    if (!selectedRow.id) return;
    if (!window.confirm("Bu belge peşin ödenmiş gidere çevrilsin mi")) return;
    setBusy(true);
    try {
      await convertBelgeImportToPaidExpense(activeMainCompany, selectedRow.id);
      await loadRows(selectedRow.id);
      setMessage(
        "Belge peşin gidere çevrildi; açık cari etkisi düzeltme hareketiyle sıfırlandı.",
      );
    } catch (error) {
      setMessage(error?.message || "Belge peşin gidere çevrilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const result = await uploadBelgeImport(activeMainCompany, files, {
        autoProcess: true,
      });
      await loadRows(result?.items?.[0].id || "");
      const createdCount = Array.isArray(result?.items)
         ? result?.items.length
        : 0;
      const skippedCount = Array.isArray(result?.skipped)
         ? result?.skipped.length
        : 0;
      const approvedCount = Array.isArray(result?.autoApproved)
        ? result.autoApproved.filter((item) => item?.ok && !item?.skipped)
            .length
        : 0;
      const quarantinedCount = Array.isArray(result?.autoApproved)
         ? result.autoApproved.filter((item) => item?.quarantine).length
        : 0;
      const waitingCount = Math.max(createdCount - approvedCount, 0);
      setMessage(
        `${createdCount} belge kaydedildi, ${approvedCount} belge direkt islendi, ${quarantinedCount} belge karantinada, ${waitingCount} belge kontrolde kaldi${skippedCount ? `, ${skippedCount} duplicate atlandi` : ""}.`,
      );
      if (uploadRef.current) uploadRef.current.value = "";
    } catch (error) {
      setMessage(error?.message || "Belge yukleme tamamlanamadi.");
    } finally {
      setBusy(false);
    }
  };

  const archiveSelected = async () => {
    if (!selectedRow.id) return;
    if (
      !window.confirm(
        "Secili tedarikci belgesi havuzdan kalici silinsin mi SQL'e islenmis belgeler silinmez.",
      )
    )
      return;
    setBusy(true);
    try {
      await purgeDocumentIntake(
        activeMainCompany,
        selectedRow.id,
        "Belge Islem Merkezi Sil butonu ile kalici temizlendi.",
      );
      await loadRows();
      setMessage(
        "Secili belge havuzdan ve duplicate kontrolunden temizlendi. Ayni XML/PDF tekrar yuklenebilir.",
      );
    } catch (error) {
      setMessage(error?.message || "Belge kaldirilamadi.");
    } finally {
      setBusy(false);
    }
  };

  const purgeProblematic = async (mode = "errors") => {
    const label =
      mode === "duplicates"
         ? "Duplicate temizligi / yeniden yuklemeye hazirlama"
        : "Hatali belge temizligi";
    if (
      !window.confirm(
        `${label} yapilsin mi REJECTED, ERROR, MISSING_INFO ve CONTROL_WAITING tedarikci belgeleri temizlenir; SQL'e islenmis belgeler korunur.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await purgeRejectedDocumentIntake(activeMainCompany, {
        documentKind: "SUPPLIER_INVOICE",
        reason: "Sorunlu/duplicate belge temizligi.",
      });
      await loadRows();
      setMessage(
        `${result?.purged || 0} belge temizlendi, ${result?.skipped || 0} belge korundu/atlanadi. Ayni XML/PDF dosyalari tekrar yuklenebilir.`,
      );
    } catch (error) {
      setMessage(error?.message || "Toplu temizlik tamamlanamadi.");
    } finally {
      setBusy(false);
    }
  };

  const saveLot = async (lineId) => {
    const lotNo = String(lotDrafts[lineId] || "").trim();
    if (!selectedRow.id) return;
    setBusy(true);
    try {
      await fixDocumentIntake(activeMainCompany, selectedRow.id, {
        lines: [{ lineId, lotNo }],
      });
      await loadRows(selectedRow.id);
      setMessage("Lot bilgisi guncellendi.");
    } catch (error) {
      setMessage(error?.message || "Lot bilgisi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const createFirm = async () => {
    if (!selectedRow.id) return;
    setBusy(true);
    try {
      await createDocumentIntakeFirm(activeMainCompany, selectedRow.id, {
        confirm: true,
        firmType: "SUPPLIER",
      });
      await loadRows(selectedRow.id);
      setMessage(
        "Tedarikci firma taslagi SQL tarafinda acildi ve belgeye baglandi.",
      );
    } catch (error) {
      setMessage(error?.message || "Firma acilamadi.");
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async (line) => {
    if (!selectedRow.id || !line?.id) return;
    setBusy(true);
    try {
      await createDocumentIntakeProduct(
        activeMainCompany,
        selectedRow.id,
        line?.id,
        {
          confirm: true,
          productGroup: line?.productDraftJson?.productGroup || "BOYAHANE",
          unit: line?.unit || "KG",
        },
      );
      await loadRows(selectedRow.id);
      setMessage("Urun taslagi SQL tarafinda acildi ve kaleme baglandi.");
    } catch (error) {
      setMessage(error?.message || "Urun acilamadi.");
    } finally {
      setBusy(false);
    }
  };

  const approveSelected = async () => {
    if (!selectedRow.id) return;
    setBusy(true);
    try {
      const warnings = warningFieldsOf(selectedRow);
      const missing = missingFieldsOf(selectedRow);
      const payload = missing.length
        ? {
            manualApproval: true,
            manualApprovalReason: `Kullanici kontrol uyarilarini kabul etti: ${(warnings.length ? warnings : missing).join(", ")}`,
            approvedBy: "UI",
          }
        : {};
      const result = await approveBelgeImport(
        activeMainCompany,
        selectedRow.id,
        payload,
      );
      await loadRows(selectedRow.id);
      setMessage(
        result?.skipped
           ? result?.reason || "Belge eksik oldugu icin atlandi."
          : "Belge onaylandi; cari, KDV, urun ve lot etkileri SQL tarafina islendi.",
      );
      onRefresh?.();
    } catch (error) {
      setMessage(error?.message || "Belge onaylanamadi.");
    } finally {
      setBusy(false);
    }
  };

  const approveManualSelected = async () => {
    if (!selectedRow.id) return;
    setBusy(true);
    try {
      const result = await approveBelgeImport(activeMainCompany, selectedRow.id, {
        manualApproval: true,
        manualApprovalReason:
          "Kullanici Belge Islem Merkezi uzerinden kucuk uyarilari manuel kabul etti.",
        approvedBy: "UI",
      });
      await loadRows(selectedRow.id);
      setMessage(
        result?.skipped
           ? result?.reason || "Belge manuel onaylanamadi."
          : "Belge manuel onayla islendi; uyarilar islem loguna yazildi.",
      );
      onRefresh?.();
    } catch (error) {
      setMessage(error?.message || "Belge manuel onaylanamadi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bim-top bim-top-embedded">
        <div className="bim-actions">
          <button
            className="bim-btn"
            type="button"
            onClick={() => uploadRef.current.click()}
            disabled={busy}
          >
            <ErpIcon name="yukle" size={15} /> Yükle
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={() => uploadRef.current.click()}
            disabled={busy}
          >
            <ErpIcon name="duzenle" size={15} /> Ekle
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={archiveSelected}
            disabled={busy || !selectedRow.id}
          >
            <ErpIcon name="sil" size={15} /> Sil
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={() => loadRows(selectedId)}
            disabled={loading || busy}
          >
            <ErpIcon name="yenile" size={15} /> Güncelle
          </button>
          <button
            className="bim-btn primary bim-mobile-panel-btn"
            type="button"
            onClick={() => setControlDrawerOpen(true)}
            disabled={!selectedRow.id}
          >
            Kontrol Paneli
          </button>
        </div>
      </div>

      <section className="bim-layout">
      <aside className="bim-card">
        <div className="bim-card-head">
          <h3>Tedarikci Firma Listesi</h3>
          <span className="bim-pill blue">{supplierFirmRows.length} firma</span>
        </div>
        <div className="bim-card-body bim-stack">
          <label
            className={`bim-upload supplier bim-drop-upload ${dragActive ? "active" : ""}`}
            onDragEnter={(event) => {
              event?.preventDefault();
              event?.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event?.preventDefault();
              event?.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event?.preventDefault();
              event?.stopPropagation();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event?.preventDefault();
              event?.stopPropagation();
              setDragActive(false);
              uploadFiles(event?.dataTransfer.files);
            }}
          >
            <div>
              <b>Tedarikci fatura yukle</b>
              <small>
                XML, PDF veya ZIP dosyasini buraya surukle-birak ya da dosya sec.
              </small>
            </div>
            <input
              ref={uploadRef}
              className="bim-hidden-input"
              type="file"
              multiple
              accept=".pdf,.xml,.zip,.jpg,.jpeg,.png,application/pdf,application/xml,text/xml,application/zip,image/jpeg,image/png"
              onChange={(event) => uploadFiles(event?.target.files)}
            />
            <span className="bim-btn small primary">Dosya Sec</span>
          </label>

          <div className="bim-filter-grid bim-filter-grid-wide">
            {SUPPLIER_STATUS_TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={statusTab === key ? "active" : ""}
                onClick={() => setStatusTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event?.target.value)}
            placeholder="Belge no, tedarikci veya tarih ara"
          />

          <button
            className="bim-clean-link"
            type="button"
            onClick={() => purgeProblematic("duplicates")}
            disabled={busy}
          >
            Sorunlu/duplicate havuz kayitlarini temizle
          </button>

          <div className="bim-list">
            <button
              className={`bim-doc ${!supplierFirmFilter ? "active" : ""}`}
              type="button"
              onClick={() => setSupplierFirmFilter("")}
            >
              <div className="topline">
                <b>Tum firmalar</b>
                <span className="bim-pill blue">{filteredRows.length}</span>
              </div>
              <div className="meta">
                Tedarikci belge toplami:{" "}
                {money(filteredRows.reduce((sum, row) => sum + Number(row?.grandTotal || 0), 0))}
              </div>
            </button>
            {supplierFirmRows.map((firm) => (
              <button
                key={firm.id}
                className={`bim-doc ${supplierFirmFilter === firm.id ? "active" : ""}`}
                type="button"
                onClick={() => setSupplierFirmFilter(firm.id)}
              >
                <div className="topline">
                  <b>{firm.name}</b>
                  <span className="bim-pill blue">
                    {firm.count}
                  </span>
                </div>
                
                <div className="meta">
                  Son belge {dateText(firm.latestDate)} - {money(firm.total)}
                </div>
              </button>
            ))}
            {!supplierFirmRows.length ? (
              <div className="bim-empty">
                Bu filtrede tedarikci belgesi yok.
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="bim-stack">
        <div className="bim-stats">
          <StatCard label="Belge" value={numberText(metrics.total)} />
          <StatCard label="Hazir" value={numberText(metrics.ready)} />
          <StatCard label="Eksik" value={numberText(metrics.missing)} />
          <StatCard label="Toplam Borc" value={money(metrics.amount)} dark />
        </div>

        {message ? <div className="bim-notice blue">{message}</div> : null}

        <div className="bim-card">
          <div className="bim-card-head">
            <div>
              <h3>Tedarikci Faturalari</h3>
              <small>
                {supplierFirmFilter
                  ? supplierFirmRows.find((firm) => firm.id === supplierFirmFilter)?.name
                  : "Tum firmalar"}
              </small>
            </div>
            <span className="bim-pill blue">{visibleRows.length} belge</span>
          </div>
          <div className="bim-table bim-supplier-invoice-table">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Belge No</th>
                  <th>Tedarikci</th>
                  <th className="num">Matrah</th>
                  <th className="num">KDV</th>
                  <th className="num">Toplam</th>
                  <th>Cari</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row?.id}
                    className={String(row?.id) === String(selectedId) ? "selected" : ""}
                    onClick={() => setSelectedId(String(row?.id))}
                  >
                    <td>{dateText(row?.issueDate)}</td>
                    <td><b>{row?.documentNo || row?.invoiceNo || "Belge"}</b></td>
                    <td>{supplierName(row)}</td>
                    <td className="num">{money(row?.subtotal)}</td>
                    <td className="num">{money(row?.vatTotal)}</td>
                    <td className="num"><b>{money(row?.grandTotal)}</b></td>
                    <td>
                      <span className={`bim-pill ${row?.firmId ? "green" : "amber"}`}>
                        {row?.firmId ? "Firma bagli" : "Firma bekliyor"}
                      </span>
                    </td>
                    <td>
                      <span className={`bim-pill ${statusChipClass(row?.status)}`}>
                        {statusLabel(row?.status, row)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!visibleRows.length ? (
                  <tr>
                    <td colSpan="8">Secili firma ve filtrede tedarikci faturasi yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bim-card">
          <div className="bim-card-head">
            <div>
              <h3>Tedarikci Belge Detayi</h3>
            </div>
            <span
              className={`bim-pill ${statusChipClass(selectedRow.status)}`}
            >
              {selectedRow.status || "Secim yok"}
            </span>
          </div>
          <div className="bim-card-body bim-stack">
            <div className="bim-work-tabs">
              {[
                ["preview", "Belge Önizleme"],
                ["lines", "Kalem Kontrolü"],
                ["tax", "KDV / Vergi Detayı"],
                ["source", "XML / OCR Kaynağı"],
                ["profile", "Öğrenen Firma Profili"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={supplierTab === key ? "active" : ""}
                  onClick={() => setSupplierTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {["preview", "lines"].includes(supplierTab) ? (
              <>
            <div className="bim-grid-4">
              <ReadField
                label="Belge No"
                value={selectedRow.documentNo || selectedRow.invoiceNo}
              />
              <ReadField
                label="Tarih"
                value={dateText(selectedRow.issueDate)}
              />
              <ReadField label="Tedarikci" value={supplierName(selectedRow)} />
              <ReadField
                label="Belge Turu"
                value={selectedRow.documentKind || "SUPPLIER_INVOICE"}
              />
              <ReadField
                label="Muhasebe Islem Tipi"
                value={POSTING_TYPE_LABELS[postingType] || postingType}
              />
            </div>
            <div className="bim-grid-3">
              <ReadField label="Matrah" value={money(selectedRow.subtotal)} />
              <ReadField label="KDV" value={money(selectedRow.vatTotal)} />
              <ReadField
                label="Toplam"
                value={money(selectedRow.grandTotal)}
              />
            </div>

            <div className="bim-notice amber">
              {missingFieldsOf(selectedRow).length
                 ? `Karantina/kontrol nedeni: ${translatedReasons(selectedRow).join(" ")}`
                : "Bu akis satis fatura hazirlama alanina girmez. Tedarikci belgesi ayri okunur, urun-lot-cari-KDV kontrolleri bitince dogrudan SQL tarafina onaylanir."}
            </div>

            {supplierTab === "lines" ? (
              <div className="bim-notice blue">
                Satır kontrolünde ham açıklama, miktar, XML fiyatı, net satır tutarı, KDV ve ürün/lot eşleşmesi aynı satırda doğrulanır.
              </div>
            ) : null}

            <div className="bim-table big">
              <table>
                <thead>
                  <tr>
                    <th>Kalem</th>
                    <th className="num">Miktar</th>
                    <th>Birim</th>
                    <th className="num">Fiyat</th>
                    <th className="num">KDV</th>
                    <th>Urun</th>
                    <th>Lot</th>
                    <th>Durum</th>
                    <th>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedRow?.lines || []).map((line, lineIndex) => (
                    <tr key={line?.id || line?.rawName || line?.description || lineIndex}>
                      <td>
                        <b>{line?.rawName || line?.description || "Kalem"}</b>
                        <small>
                          {line?.productId
                             ? `Urun ID: ${line?.productId}`
                            : "Urun eslestirme bekliyor"}
                        </small>
                      </td>
                      <td className="num">{numberText(line?.quantity)}</td>
                      <td>{line?.unit || "-"}</td>
                      <td className="num">
                        {money(line?.unitPrice).replace("₺", "").trim()}
                      </td>
                      <td className="num">%{numberText(line?.vatRate)}</td>
                      <td>
                        <span
                          className={`bim-pill ${line?.productId ? "green" : "amber"}`}
                        >
                          {lineProductLabel(line)}
                        </span>
                      </td>
                      <td>
                        {isLotRelevantLine(line) ? (
                          <div className="bim-inline-actions bim-line-actions">
                            <input
                              value={lotDrafts[line?.id] || ""}
                              placeholder="Lot varsa gir"
                              onChange={(event) =>
                                setLotDrafts((prev) => ({
                                  ...prev,
                                  [line?.id]: event?.target.value,
                                }))
                              }
                            />
                            <button
                              className="bim-btn small"
                              type="button"
                              onClick={() => saveLot(line?.id)}
                              disabled={busy}
                            >
                              Lot Kaydet
                            </button>
                          </div>
                        ) : (
                          <span className="bim-pill gray">
                            {String(line?.lotNo || "").trim() || "Lot yok"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`bim-pill ${line?.productId ? "green" : "amber"}`}
                        >
                          {line?.productId ? "Hazir" : "Eksik"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="bim-btn small primary"
                          type="button"
                          onClick={() => createProduct(line)}
                          disabled={busy || !!line?.productId}
                        >
                          {line?.productId ? "Bagli" : "Urun Ac"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!selectedRow?.lines?.length ? (
                    <tr>
                      <td colSpan="9">Kalem bulunamadi.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
              </>
            ) : null}

            {supplierTab === "tax" ? (
              <div className="bim-grid-3">
                <ReadField label="Satır Matrah Toplamı" value={money(controlSummary.lineSubtotal)} />
                <ReadField label="Belge Matrahı" value={money(controlSummary.documentSubtotal)} />
                <ReadField label="Matrah Farkı" value={money(controlSummary.subtotalDiff)} />
                <ReadField label="Satır KDV Toplamı" value={money(controlSummary.lineVat)} />
                <ReadField label="Normal KDV" value={money(controlSummary.normalVat)} />
                <ReadField label="Tevkifat" value={money(controlSummary.withholdingVat)} />
                <ReadField label="ÖTV / Diğer Vergi" value={money(controlSummary.otherTax)} />
                <ReadField label="İskonto" value={money(controlSummary.discountTotal)} />
                <ReadField label="Belge Vergi Toplamı" value={money(controlSummary.documentTaxTotal)} />
                <ReadField label="Beklenen Genel Toplam" value={money(controlSummary.grandExpected)} />
                <ReadField label="Belge Genel Toplamı" value={money(controlSummary.grandTotal)} />
                <ReadField label="Genel Toplam Farkı" value={money(controlSummary.grandDiff)} />
              </div>
            ) : null}

            {supplierTab === "source" ? (
              <div className="bim-grid-4">
                <ReadField label="Ana Kaynak" value={selectedRow.sourceType || "-"} />
                <ReadField label="Dosya" value={selectedRow.fileName || selectedRow.originalFileName || "-"} />
                <ReadField label="XML Namespace" value={selectedRow.xmlNamespace || "-"} />
                <ReadField label="OCR Durumu" value={selectedRow.sourceType === "IMAGE_OCR" ? "Görsel OCR" : "Gerekirse OCR"} />
                <ReadField label="Mükerrer Kontrol" value={missingFieldsOf(selectedRow).includes("DUPLICATE_DOCUMENT") ? "Mükerrer" : "Uygun"} />
                <ReadField label="Zorunlu Alanlar" value={shortMissing(missingFieldsOf(selectedRow))} />
                <ReadField label="Parse Durumu" value={selectedRow.parseStatus || selectedRow.status || "-"} />
                <ReadField label="Son Güncelleme" value={dateText(selectedRow.updatedAt || selectedRow.createdAt)} />
              </div>
            ) : null}

            {supplierTab === "profile" ? (
              <div className="bim-grid-3">
                <ReadField label="Tedarikçi VKN" value={selectedRow.issuerTaxNo || selectedRow.taxNo || "-"} />
                <ReadField label="Normalize Firma Adı" value={supplierName(selectedRow)} />
                <ReadField label="Belge Türü" value={selectedRow.documentKind || "SUPPLIER_INVOICE"} />
                <ReadField label="Belge No İpucu" value={selectedRow.documentNo ? "documentNo/invoiceNo" : "Bekliyor"} />
                <ReadField label="Tarih İpucu" value={selectedRow.issueDate ? "issueDate" : "Bekliyor"} />
                <ReadField label="Toplam İpucu" value={Number(selectedRow.grandTotal || 0) > 0 ? "grandTotal" : "Bekliyor"} />
                <ReadField label="KDV İpucu" value={Number(selectedRow.vatTotal || 0) >= 0 ? "vatTotal/TaxTotal" : "Bekliyor"} />
                <ReadField label="Doğrulanmış Örnek" value={selectedProcessed ? "1+" : "Onay sonrası öğrenir"} />
                <ReadField label="Kural Durumu" value="Kullanıcı onayı olmadan kesin kayıt oluşturmaz" />
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <aside className="bim-stack bim-supplier-side">
        <div className="bim-card compact">
          <div className="bim-card-head">
            <h3>Tedarikci Islem Yardimcisi</h3>
            <span className={`bim-pill ${allReady ? "green" : selectedBlockers.length ? "amber" : "blue"}`}>
              {allReady ? "Onaya Hazir" : selectedBlockers.length ? "Eksik Var" : "Kontrol"}
            </span>
          </div>
          <div className="bim-card-body bim-stack">
            <CheckLine label="Firma bagli mi" ok={!!selectedRow.firmId} />
            <CheckLine label="Tum urunler bagli mi" ok={hasAllProducts} />
            <CheckLine
              label="Lot gerekenler tamam mi"
              ok={!lotRelevantLines.length || hasAllRelevantLots}
            />
            <CheckLine
              label="Cari ve KDV hazir mi"
              ok={Number(selectedRow.grandTotal || 0) > 0}
            />
            <div className="bim-notice blue">
              Eksik alanlar: {translatedReasons(selectedRow).join(" ") || "-"}
            </div>
            {selectedWarnings.length ? (
              <div className="bim-notice amber">
                Manuel onaylanabilir uyarı: {selectedWarnings.map((field) => QUARANTINE_REASONS[field] || field).join(" ")}
              </div>
            ) : null}
            {selectedBlockers.length ? (
              <div className="bim-notice amber">
                Bloklayan alanlar: {selectedBlockers.map((field) => QUARANTINE_REASONS[field] || field).join(" ")}
              </div>
            ) : null}
            <div className="bim-inline-actions">
              <button
                className="bim-btn small"
                type="button"
                onClick={() => {
                  setSupplierTab("source");
                  setMessage(
                    selectedRow.pdfPath || selectedRow.filePath
                       ? "PDF/dosya kaynağı XML/OCR Kaynağı sekmesinde gösterildi."
                      : "Bu belgede açılacak PDF yolu bulunamadı; XML/OCR kaynak bilgisi gösterildi.",
                  );
                }}
                disabled={!selectedRow.id}
              >
                PDF Aç
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={() => setSupplierTab("tax")}
                disabled={!selectedRow.id}
              >
                XML Vergi Detayı
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={retrySelected}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                Tekrar Kontrol Et
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={retrySelected}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                Tekrar Parse Et
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={retrySelected}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                Fiyatlari XML'den Oku
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={() => setSupplierTab("lines")}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                Ürünleri Eşle
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={() => {
                  setMessage(
                    selectedWarnings.length
                       ? "Belge KDV kontrol uyarisi ile manuel onaya hazir."
                      : "KDV kontrolu icin once belgeyi tekrar kontrol edin.",
                  );
                }}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                KDV Kontrolune Gonder
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={createFirm}
                disabled={busy || !selectedRow.id || !!selectedRow.firmId || selectedProcessed}
              >
                Eksik Alani Duzelt
              </button>
              <button
                className="bim-btn small"
                type="button"
                onClick={rejectSelected}
                disabled={busy || !selectedRow.id || selectedProcessed}
              >
                Reddet
              </button>
            </div>
            <button
              className="bim-btn green full"
              type="button"
              onClick={approveSelected}
              disabled={busy || !allReady || selectedProcessed}
            >
              {selectedProcessed ? "SQL'e Islendi" : "Onayla ve SQL'e Isle"}
            </button>
            <button
              className="bim-btn full"
              type="button"
              onClick={approveManualSelected}
              disabled={busy || !selectedRow.id || selectedProcessed}
            >
              Bu faturayi onayla
            </button>
            <button
              className="bim-btn full"
              type="button"
              onClick={convertSelectedToPaidExpense}
              disabled={busy || !selectedProcessed || !isOpenPayable}
            >
              Bu belgeyi Pesin Gidere Cevir
            </button>
          </div>
        </div>

        <div className="bim-card compact">
          <div className="bim-card-head">
            <h3>Kontrol Ozeti</h3>
            <span className={`bim-pill ${controlSummary.vatReview ? "amber" : controlSummary.subtotalOk && controlSummary.grandTotalOk ? "green" : "red"}`}>
              {QUARANTINE_REASONS[controlSummary.quarantineCode] ? controlSummary.quarantineCode : statusLabel(selectedRow.status, selectedRow)}
            </span>
          </div>
          <div className="bim-card-body bim-stack">
            <SummaryLine label="Satir Matrah Toplami" value={money(controlSummary.lineSubtotal)} />
            <SummaryLine label="Belge Matrahi" value={money(controlSummary.documentSubtotal)} />
            <SummaryLine
              label="Matrah Farki"
              value={money(controlSummary.subtotalDiff)}
              pill={!controlSummary.subtotalOk}
            />
            <SummaryLine label="Satir KDV Toplami" value={money(controlSummary.lineVat)} />
            <SummaryLine label="Orana Gore Beklenen KDV" value={money(controlSummary.expectedVatByLineRate)} />
            <SummaryLine label="Normal KDV" value={money(controlSummary.normalVat)} />
            <SummaryLine label="Tevkifat" value={money(controlSummary.withholdingVat)} />
            <SummaryLine label="OTV / Diger Vergi" value={money(controlSummary.otherTax)} />
            <SummaryLine label="Iskonto" value={money(controlSummary.discountTotal)} />
            <SummaryLine label="Belge Vergi Toplami" value={money(controlSummary.documentTaxTotal)} />
            <SummaryLine label="Beklenen Genel Toplam" value={money(controlSummary.grandExpected)} />
            <SummaryLine label="Genel Toplam Farki" value={money(controlSummary.grandDiff)} pill={!controlSummary.grandTotalOk} />
            <SummaryLine label="Sifir Fiyatli Satir" value={numberText(controlSummary.zeroPriceLineCount)} />
            <div className="bim-notice blue">{controlSummary.explanation}</div>
          </div>
        </div>

        <div className="bim-card compact">
          <div className="bim-card-head">
            <h3>Muhasebe Ozeti</h3>
            <span className="bim-pill blue">Tedarikci</span>
          </div>
          <div className="bim-card-body bim-stack">
            <SummaryLine
              label="Cari Borc"
              value={isOpenPayable ? money(selectedRow.grandTotal) : "Yok"}
            />
            <SummaryLine
              label="Cari Borc Etkisi"
              value={isOpenPayable ? "Var" : "Yok"}
            />
            <SummaryLine
              label="Gider Etkisi"
              value={isOpenPayable ? "Yok" : "Var"}
            />
            <SummaryLine
              label="Indirilecek KDV"
              value={money(selectedRow.vatTotal)}
            />
            <SummaryLine
              label="Odeme Durumu"
              value={accountingEffects.paymentStatus || (isOpenPayable ? "UNPAID" : "PAID")}
            />
            <SummaryLine label="Matrah" value={money(selectedRow.subtotal)} />
            <SummaryLine
              label="Belge Durumu"
              value={statusLabel(selectedRow.status, selectedRow)}
              pill
            />
            <SummaryLine
              label="Cari Hareket ID"
              value={
                accountingEffects.currentAccountMovementId ||
                accountingEffects.cariMovementId ||
                "-"
              }
            />
            <SummaryLine
              label="KDV Hareket ID"
              value={accountingEffects.vatRecordId || "-"}
            />
          </div>
          </div>
        </aside>
      </section>
      <SupplierControlDrawer
        open={controlDrawerOpen}
        onClose={() => setControlDrawerOpen(false)}
        selectedRow={selectedRow}
        allReady={allReady}
        hasAllProducts={hasAllProducts}
        lotRelevantLines={lotRelevantLines}
        hasAllRelevantLots={hasAllRelevantLots}
        selectedProcessed={selectedProcessed}
        selectedWarnings={selectedWarnings}
        selectedBlockers={selectedBlockers}
        controlSummary={controlSummary}
        accountingEffects={accountingEffects}
        isOpenPayable={isOpenPayable}
        busy={busy}
        retrySelected={retrySelected}
        createFirm={createFirm}
        rejectSelected={rejectSelected}
        approveSelected={approveSelected}
        approveManualSelected={approveManualSelected}
        convertSelectedToPaidExpense={convertSelectedToPaidExpense}
      />
    </>
  );
}

function SupplierControlDrawer({
  open,
  onClose,
  selectedRow,
  allReady,
  hasAllProducts,
  lotRelevantLines,
  hasAllRelevantLots,
  selectedProcessed,
  selectedWarnings,
  selectedBlockers,
  controlSummary,
  accountingEffects,
  isOpenPayable,
  busy,
  retrySelected,
  createFirm,
  rejectSelected,
  approveSelected,
  approveManualSelected,
  convertSelectedToPaidExpense,
}) {
  if (!open) return null;
  return (
    <>
      <button
        className="bim-drawer-bg"
        type="button"
        aria-label="Kontrol panelini kapat"
        onClick={onClose}
      />
      <aside className="bim-drawer show" aria-label="Tedarikci kontrol paneli">
        <div className="bim-drawer-head">
          <div>
            <h3>Tedarikci Kontrol Paneli</h3>
            <small>{selectedRow.documentNo || selectedRow.invoiceNo || "Belge secilmedi"}</small>
          </div>
          <button className="bim-btn small" type="button" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="bim-drawer-body">
          <div className="bim-card compact">
            <div className="bim-card-head">
              <h3>Islem Yardimcisi</h3>
              <span className={`bim-pill ${allReady ? "green" : selectedBlockers.length ? "amber" : "blue"}`}>
                {allReady ? "Onaya Hazir" : selectedBlockers.length ? "Eksik Var" : "Kontrol"}
              </span>
            </div>
            <div className="bim-card-body bim-stack">
              <CheckLine label="Firma bagli mi" ok={!!selectedRow.firmId} />
              <CheckLine label="Tum urunler bagli mi" ok={hasAllProducts} />
              <CheckLine
                label="Lot gerekenler tamam mi"
                ok={!lotRelevantLines.length || hasAllRelevantLots}
              />
              <CheckLine
                label="Cari ve KDV hazir mi"
                ok={Number(selectedRow.grandTotal || 0) > 0}
              />
              <div className="bim-notice blue">
                Eksik alanlar: {translatedReasons(selectedRow).join(" ") || "-"}
              </div>
              {selectedWarnings.length ? (
                <div className="bim-notice amber">
                  Manuel onaylanabilir uyari: {selectedWarnings.map((field) => QUARANTINE_REASONS[field] || field).join(" ")}
                </div>
              ) : null}
              {selectedBlockers.length ? (
                <div className="bim-notice amber">
                  Bloklayan alanlar: {selectedBlockers.map((field) => QUARANTINE_REASONS[field] || field).join(" ")}
                </div>
              ) : null}
              <div className="bim-inline-actions">
                <button className="bim-btn small" type="button" onClick={retrySelected} disabled={busy || !selectedRow.id || selectedProcessed}>
                  Tekrar Kontrol Et
                </button>
                <button className="bim-btn small" type="button" onClick={retrySelected} disabled={busy || !selectedRow.id || selectedProcessed}>
                  Fiyatlari XML'den Oku
                </button>
                <button className="bim-btn small" type="button" onClick={createFirm} disabled={busy || !selectedRow.id || !!selectedRow.firmId || selectedProcessed}>
                  Eksik Alani Duzelt
                </button>
                <button className="bim-btn small" type="button" onClick={rejectSelected} disabled={busy || !selectedRow.id || selectedProcessed}>
                  Reddet
                </button>
              </div>
              <button className="bim-btn green full" type="button" onClick={approveSelected} disabled={busy || !allReady || selectedProcessed}>
                {selectedProcessed ? "SQL'e Islendi" : "Onayla ve SQL'e Isle"}
              </button>
              <button className="bim-btn full" type="button" onClick={approveManualSelected} disabled={busy || !selectedRow.id || selectedProcessed}>
                Bu faturayi onayla
              </button>
              <button className="bim-btn full" type="button" onClick={convertSelectedToPaidExpense} disabled={busy || !selectedProcessed || !isOpenPayable}>
                Bu belgeyi Pesin Gidere Cevir
              </button>
            </div>
          </div>

          <div className="bim-card compact">
            <div className="bim-card-head">
              <h3>Kontrol Ozeti</h3>
              <span className={`bim-pill ${controlSummary.vatReview ? "amber" : controlSummary.subtotalOk && controlSummary.grandTotalOk ? "green" : "red"}`}>
                {controlSummary.quarantineCode || statusLabel(selectedRow.status, selectedRow)}
              </span>
            </div>
            <div className="bim-card-body bim-stack">
              <SummaryLine label="Satir Matrah Toplami" value={money(controlSummary.lineSubtotal)} />
              <SummaryLine label="Belge Matrahi" value={money(controlSummary.documentSubtotal)} />
              <SummaryLine label="Satir KDV Toplami" value={money(controlSummary.lineVat)} />
              <SummaryLine label="Belge Vergi Toplami" value={money(controlSummary.documentTaxTotal)} />
              <SummaryLine label="Beklenen Genel Toplam" value={money(controlSummary.grandExpected)} />
              <SummaryLine label="Genel Toplam Farki" value={money(controlSummary.grandDiff)} pill={!controlSummary.grandTotalOk} />
              <SummaryLine label="Cari Hareket ID" value={accountingEffects.currentAccountMovementId || accountingEffects.cariMovementId || "-"} />
              <SummaryLine label="KDV Hareket ID" value={accountingEffects.vatRecordId || "-"} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function StatCard({ label, value, dark }) {
  return (
    <div className={`bim-stat ${dark ? "dark" : ""}`}>
      <span>{label}</span>
      <b>{value || "-"}</b>
    </div>
  );
}

function ReadField({ label, value }) {
  return (
    <div className="bim-field">
      <label>{label}</label>
      <input value={value || "-"} readOnly />
    </div>
  );
}

function EditField({ label, value, onChange, type = "text", multiline }) {
  return (
    <div className="bim-field">
      <label>{label}</label>
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event?.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(event) => onChange(event?.target.value)}
        />
      )}
    </div>
  );
}

function CheckLine({ label, ok }) {
  return (
    <div className="bim-check">
      <b>{label}</b>
      <span className={`bim-pill ${ok ? "green" : "amber"}`}>
        {ok ? "Evet" : "Kontrol"}
      </span>
    </div>
  );
}

function SummaryLine({ label, value, pill }) {
  return (
    <div className="bim-summary-line">
      <b>{label}</b>
      {pill ? (
        <span className={`bim-pill ${statusChipClass(value)}`}>
          {value || "-"}
        </span>
      ) : (
        <span>{value || "-"}</span>
      )}
    </div>
  );
}
