/**
 * KY ERP İmalat: her model kartı aynı anda bir üretim aşamasında ve
 * bağımsız irsaliye/fatura kontrol havuzlarında bulunabilir.
 * Bu fonksiyonlar yalnız okuma/filtreleme yapar; D1 durumunu değiştirmez.
 */
export const PRODUCTION_POOL_CONTRACT = "kyerp-production-pools-v3" as const;
export const HISTORICAL_PRODUCTION_CUTOVER = "2026-11-08" as const;

type DatedItem = { date?: unknown; createdAt?: unknown; raw?: { source?: unknown } };
type HistoryInput = {
  modelSource?: unknown;
  modelSourceYear?: unknown;
  productionEntries?: DatedItem[];
  dispatches?: DatedItem[];
  invoices?: DatedItem[];
};

function shortDate(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}
function imported(item: DatedItem): boolean {
  return String(item.raw?.source || "").toUpperCase() === "XLSM_IMPORT";
}

/** 03.11.2026 Excel geçmişi + geçmiş üretimler arşiv sayılır.
 *  08.11.2026 ve sonrası yeni gerçek üretim/belge varsa yeniden aktifleşir. */
export function isHistoricalProduction(input: HistoryInput): boolean {
  const entries = input.productionEntries || [];
  const dispatches = input.dispatches || [];
  const invoices = input.invoices || [];
  const hasNewProduction = entries.some((item) =>
    !imported(item) && shortDate(item.date || item.createdAt) >= HISTORICAL_PRODUCTION_CUTOVER);
  const hasNewDocuments = [...dispatches, ...invoices].some((item) =>
    shortDate(item.date || item.createdAt) >= HISTORICAL_PRODUCTION_CUTOVER);
  if (hasNewProduction || hasNewDocuments) return false;
  const importedModel = String(input.modelSource || "").toUpperCase() === "XLSM_IMPORT"
    && String(input.modelSourceYear || "") === "2026";
  if (importedModel) return true;
  return entries.length > 0 && entries.every((item) =>
    imported(item) || (shortDate(item.date || item.createdAt).length === 10 &&
      shortDate(item.date || item.createdAt) < HISTORICAL_PRODUCTION_CUTOVER));
}

export type ProductionPoolCard = {
  legacyApproved?: boolean;
  isVirtual?: boolean;
  status?: string;
  productionEntryCount?: number;
  dispatchCount?: number;
  invoiceCount?: number;
  expectedQty?: number;
  completedGrossQty?: number;
  incomingQty?: number;
  productionRemainingQty?: number;
  invoiceRemainingQty?: number;
  invoicedQty?: number;
};

export function isProductionComplete(card: ProductionPoolCard): boolean {
  if (card.legacyApproved) return true;
  // Fatura tamamen kesilse bile henüz üretilmemiş model TAMAMLANAN'a düşmez.
  // Üretim tamamlanması muhasebe etiketinden bağımsızdır.
  return Number(card.completedGrossQty || 0) > 0 &&
    Number(card.incomingQty || 0) > 0 &&
    Number(card.productionRemainingQty || 0) <= 0;
}

export function matchesProductionPool(card: ProductionPoolCard, requestedPool: string): boolean {
  const pool = String(requestedPool || "IMALATTA").toUpperCase();
  const legacy = Boolean(card.legacyApproved);
  const active = Number(card.productionEntryCount || 0) > 0 ||
    Number(card.expectedQty || 0) > 0 ||
    Number(card.dispatchCount || 0) > 0 ||
    Number(card.invoicedQty || 0) > 0;
  if (pool === "ARSIV") return legacy;
  if (pool === "TAMAMLANAN") return legacy || (!card.isVirtual && isProductionComplete(card));
  if (card.isVirtual || legacy || !active) return false;
  if (pool === "IMALATTA") return !isProductionComplete(card);
  // İrsaliye kontrolü bir üretim aşaması değildir; aktif imalatla kesişebilir.
  if (pool === "IRSALIYE") return Number(card.dispatchCount || 0) === 0;
  if (pool === "FATURA") return Number(card.invoiceRemainingQty || 0) > 0;
  return false; // Bilinmeyen havuz bütün modelleri açmaz.
}
