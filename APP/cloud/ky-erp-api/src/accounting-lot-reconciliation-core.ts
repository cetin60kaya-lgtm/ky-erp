export type LotPolicy = "REQUIRED" | "OPTIONAL" | "NONE";

export type LotEvidenceStatus =
  | "VERIFIED"
  | "FROM_DISPATCH"
  | "FROM_INVOICE"
  | "CONFLICT"
  | "MISSING_REQUIRED"
  | "NO_LOT";

export type LotEvidenceResult = {
  policy: LotPolicy;
  status: LotEvidenceStatus;
  resolvedLotNo: string;
  dispatchLotNo: string;
  invoiceLotNo: string;
  canPostStock: boolean;
  requiresReview: boolean;
  message: string;
};

type AnyRow = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

export const normalizeLotNo = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9._/-]+/g, "")
    .trim();

const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");

const jsonObject = (value: unknown): AnyRow => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AnyRow)
      : {};
  } catch {
    return {};
  }
};

function explicitPolicy(value: unknown): LotPolicy | null {
  const normalized = upper(value).replace(/\s+/g, "_");
  if (["REQUIRED", "LOT_ZORUNLU", "ZORUNLU"].includes(normalized)) return "REQUIRED";
  if (["OPTIONAL", "LOT_OPSIYONEL", "OPSIYONEL"].includes(normalized)) return "OPTIONAL";
  if (["NONE", "LOT_KULLANILMAZ", "KULLANILMAZ", "NO_LOT"].includes(normalized)) return "NONE";
  return null;
}

/**
 * Canonical lot policy resolver.
 *
 * Priority:
 * 1) Explicit product-level lotPolicy / raw.lotPolicy.
 * 2) Legacy product-level boolean flags.
 * 3) Routing fallback for backward compatibility only.
 *
 * Supplier identity is deliberately NOT used here. A chemical supplier may
 * also invoice freight/service lines, and those lines must not become LOT-required.
 */
export function resolveProductLotPolicy(
  product: AnyRow | null | undefined,
  routingType?: unknown,
): LotPolicy {
  const raw = jsonObject(product?.raw);
  const direct =
    explicitPolicy(product?.lotPolicy ?? product?.lot_policy) ||
    explicitPolicy(raw.lotPolicy ?? raw.lot_policy);
  if (direct) return direct;

  const legacyFlag =
    product?.requiresLot ??
    product?.requireLot ??
    product?.lotRequired ??
    product?.lot_required ??
    product?.lotTakibi ??
    raw.requiresLot ??
    raw.requireLot ??
    raw.lotRequired ??
    raw.lot_required ??
    raw.lotTakibi;
  if (legacyFlag === true) return "REQUIRED";
  if (legacyFlag === false) return "NONE";

  const routing = upper(
    routingType || raw.routingType || raw.routing_type || raw.productGroup || raw.product_group,
  );
  if (routing === "EXPENSE" || routing === "SERVICE" || routing === "FIXED_ASSET") return "NONE";
  if (routing === "BOYAHANE") return "REQUIRED";
  if (routing === "STOCK" || routing === "CONSUMABLE") return "OPTIONAL";
  return "NONE";
}

export function reconcileLotEvidence(args: {
  policy: LotPolicy;
  dispatchLotNo?: unknown;
  invoiceLotNo?: unknown;
}): LotEvidenceResult {
  const dispatchRaw = text(args.dispatchLotNo);
  const invoiceRaw = text(args.invoiceLotNo);
  const dispatch = normalizeLotNo(dispatchRaw);
  const invoice = normalizeLotNo(invoiceRaw);

  if (dispatch && invoice) {
    if (dispatch === invoice) {
      return {
        policy: args.policy,
        status: "VERIFIED",
        resolvedLotNo: dispatchRaw || invoiceRaw,
        dispatchLotNo: dispatchRaw,
        invoiceLotNo: invoiceRaw,
        canPostStock: true,
        requiresReview: false,
        message: "İrsaliye ve fatura LOT bilgisi aynı; LOT doğrulandı.",
      };
    }
    return {
      policy: args.policy,
      status: "CONFLICT",
      resolvedLotNo: "",
      dispatchLotNo: dispatchRaw,
      invoiceLotNo: invoiceRaw,
      canPostStock: false,
      requiresReview: true,
      message: "İrsaliye ve fatura LOT bilgisi farklı; kullanıcı kontrolü gerekli.",
    };
  }

  if (dispatch) {
    return {
      policy: args.policy,
      status: "FROM_DISPATCH",
      resolvedLotNo: dispatchRaw,
      dispatchLotNo: dispatchRaw,
      invoiceLotNo: invoiceRaw,
      canPostStock: true,
      requiresReview: false,
      message: "LOT irsaliyeden alındı.",
    };
  }

  if (invoice) {
    return {
      policy: args.policy,
      status: "FROM_INVOICE",
      resolvedLotNo: invoiceRaw,
      dispatchLotNo: dispatchRaw,
      invoiceLotNo: invoiceRaw,
      canPostStock: true,
      requiresReview: false,
      message: "LOT faturadan alındı.",
    };
  }

  if (args.policy === "REQUIRED") {
    return {
      policy: args.policy,
      status: "MISSING_REQUIRED",
      resolvedLotNo: "",
      dispatchLotNo: "",
      invoiceLotNo: "",
      canPostStock: false,
      requiresReview: true,
      message: "Bu ürün LOT zorunlu; fatura ve irsaliyede LOT bulunamadı.",
    };
  }

  return {
    policy: args.policy,
    status: "NO_LOT",
    resolvedLotNo: "",
    dispatchLotNo: "",
    invoiceLotNo: "",
    canPostStock: true,
    requiresReview: false,
    message:
      args.policy === "OPTIONAL"
        ? "Üründe LOT opsiyonel; LOT olmadan devam edilebilir."
        : "Bu ürün LOT kullanmıyor.",
  };
}

const stableNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
};

/**
 * Stable key for a physical receipt. Dispatch line is preferred because it is
 * the physical movement document. Invoice line is only the fallback when a
 * dispatch has not arrived yet. When later reconciliation links a dispatch,
 * the existing receipt must be enriched/relinked rather than inserted again.
 */
export function physicalReceiptKey(args: {
  tenant: unknown;
  productId: unknown;
  supplierId?: unknown;
  dispatchLineId?: unknown;
  invoiceLineId?: unknown;
  lotNo?: unknown;
  quantity?: unknown;
  unit?: unknown;
}) {
  const sourceId = text(args.dispatchLineId)
    ? `D:${text(args.dispatchLineId)}`
    : `I:${text(args.invoiceLineId)}`;
  return [
    upper(args.tenant),
    text(args.productId),
    text(args.supplierId),
    sourceId,
    normalizeLotNo(args.lotNo),
    stableNumber(args.quantity),
    upper(args.unit),
  ].join("|");
}

export function samePhysicalReceipt(a: AnyRow, b: AnyRow) {
  const aDispatch = text(a.dispatchLineId || a.despatchLineId);
  const bDispatch = text(b.dispatchLineId || b.despatchLineId);
  if (aDispatch && bDispatch) return aDispatch === bDispatch;

  const aInvoice = text(a.invoiceLineId || a.invoiceItemId);
  const bInvoice = text(b.invoiceLineId || b.invoiceItemId);
  if (aInvoice && bInvoice) return aInvoice === bInvoice;

  return (
    text(a.productId || a.inventoryId) === text(b.productId || b.inventoryId) &&
    normalizeLotNo(a.lotNo) === normalizeLotNo(b.lotNo) &&
    stableNumber(a.quantity || a.entryKg) === stableNumber(b.quantity || b.entryKg) &&
    upper(a.unit) === upper(b.unit) &&
    text(a.companyId || a.supplierId) === text(b.companyId || b.supplierId)
  );
}
