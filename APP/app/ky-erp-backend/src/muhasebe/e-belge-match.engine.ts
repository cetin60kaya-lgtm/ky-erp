export type EBelgeLine = {
  id?: string | null;
  productId?: string | null;
  productCode?: string | null;
  rawName?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
};

export type EBelgeDocument = {
  id: string;
  documentNo?: string | null;
  invoiceNo?: string | null;
  dispatchNo?: string | null;
  firmId?: string | null;
  issuerTaxNo?: string | null;
  receiverTaxNo?: string | null;
  issueDate?: string | Date | null;
  lines?: EBelgeLine[] | null;
};

export type EBelgeLineAllocation = {
  dispatchId: string;
  dispatchNo: string;
  dispatchLineId: string;
  quantity: number;
  productScore: number;
  productMatchSource: string;
};

export type EBelgeLineResult = {
  invoiceLineId: string;
  invoiceProduct: string;
  invoicedQuantity: number;
  dispatchedQuantity: number;
  difference: number;
  unit: string;
  status: "MATCHED" | "PARTIAL" | "UNMATCHED" | "OVER_INVOICED";
  allocations: EBelgeLineAllocation[];
};

export type EBelgeReconciliation = {
  status: "MATCHED" | "PARTIAL" | "MISMATCH" | "SUGGESTED" | "UNMATCHED";
  confidence: number;
  explicitReferences: string[];
  linkedDispatches: Array<{
    id: string;
    documentNo: string;
    explicitReference: boolean;
    usedLineCount: number;
    allocatedQuantity: number;
  }>;
  lines: EBelgeLineResult[];
  matchedLineCount: number;
  totalLineCount: number;
  exactQuantityLineCount: number;
  unmatchedLineCount: number;
  partialLineCount: number;
  overInvoicedLineCount: number;
  notes: string[];
};

const qty = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export function normalizeEBelgeText(value: unknown) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEBelgeUnit(value: unknown) {
  const unit = normalizeEBelgeText(value).replace(/\s+/g, "");
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMME"].includes(unit)) return "KG";
  if (["ADET", "AD", "PCS", "PCE", "C62"].includes(unit)) return "ADET";
  if (["GR", "G", "GRAM"].includes(unit)) return "GR";
  if (["LT", "L", "LITRE", "LITRE"].includes(unit)) return "LT";
  if (["M", "METRE", "MTR"].includes(unit)) return "M";
  return unit || "ADET";
}

function tokens(value: unknown) {
  return new Set(normalizeEBelgeText(value).split(" ").filter(Boolean));
}

function tokenSimilarity(left: unknown, right: unknown) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Math.round((intersection / union) * 100) : 0;
}

function productIdentity(line: EBelgeLine) {
  return normalizeEBelgeText(line.rawName || line.description || line.productCode || line.productId || "");
}

export function compareEBelgeProducts(invoiceLine: EBelgeLine, dispatchLine: EBelgeLine) {
  const invoiceProductId = String(invoiceLine.productId || "").trim();
  const dispatchProductId = String(dispatchLine.productId || "").trim();
  if (invoiceProductId && dispatchProductId && invoiceProductId === dispatchProductId) {
    return { score: 100, source: "PRODUCT_ID" };
  }

  const invoiceCode = normalizeEBelgeText(invoiceLine.productCode);
  const dispatchCode = normalizeEBelgeText(dispatchLine.productCode);
  if (invoiceCode && dispatchCode && invoiceCode === dispatchCode) {
    return { score: 98, source: "PRODUCT_CODE" };
  }

  const invoiceName = productIdentity(invoiceLine);
  const dispatchName = productIdentity(dispatchLine);
  if (invoiceName && dispatchName && invoiceName === dispatchName) {
    return { score: 96, source: "PRODUCT_NAME" };
  }

  if (invoiceName && dispatchName && (invoiceName.includes(dispatchName) || dispatchName.includes(invoiceName))) {
    return { score: 90, source: "PRODUCT_NAME_CONTAINS" };
  }

  const similarity = tokenSimilarity(invoiceName, dispatchName);
  return similarity >= 72
    ? { score: Math.min(89, similarity), source: "PRODUCT_NAME_SIMILARITY" }
    : { score: similarity, source: "NO_MATCH" };
}

function documentNo(row: EBelgeDocument) {
  return String(row.dispatchNo || row.documentNo || row.invoiceNo || "").trim();
}

function identityTaxNo(row: EBelgeDocument) {
  return String(row.issuerTaxNo || row.receiverTaxNo || "").replace(/\D/g, "");
}

function sameParty(invoice: EBelgeDocument, dispatch: EBelgeDocument) {
  if (invoice.firmId && dispatch.firmId && invoice.firmId === dispatch.firmId) return true;
  const invoiceTax = identityTaxNo(invoice);
  const dispatchTax = identityTaxNo(dispatch);
  return Boolean(invoiceTax && dispatchTax && invoiceTax === dispatchTax);
}

function dayDistance(left: unknown, right: unknown) {
  const a = left ? new Date(left as any).getTime() : NaN;
  const b = right ? new Date(right as any).getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 9999;
  return Math.abs(a - b) / 86_400_000;
}

export function reconcileEBelgeInvoice(
  invoice: EBelgeDocument,
  allDispatches: EBelgeDocument[],
  explicitReferences: string[] = [],
): EBelgeReconciliation {
  const refs = [...new Set(explicitReferences.map((item) => normalizeEBelgeText(item)).filter(Boolean))];
  const invoiceLines = Array.isArray(invoice.lines) ? invoice.lines : [];

  const ranked = allDispatches
    .filter((row) => row?.id && row.id !== invoice.id)
    .map((row) => {
      const normalizedNo = normalizeEBelgeText(documentNo(row));
      const explicit = Boolean(normalizedNo && refs.includes(normalizedNo));
      const party = sameParty(invoice, row);
      const days = dayDistance(invoice.issueDate, row.issueDate);
      let score = 0;
      if (explicit) score += 60;
      if (party) score += 25;
      if (days <= 7) score += 10;
      else if (days <= 45) score += 6;
      else if (days <= 90) score += 2;
      return { row, explicit, party, days, score };
    })
    .filter((candidate) => {
      if (refs.length) return candidate.explicit || (candidate.party && candidate.days <= 90);
      return candidate.party && candidate.days <= 60;
    })
    .sort((a, b) => b.score - a.score || a.days - b.days);

  const candidates = refs.length
    ? ranked.filter((row) => row.explicit).concat(ranked.filter((row) => !row.explicit))
    : ranked;

  const availability = new Map<string, number>();
  for (const candidate of candidates) {
    for (const line of candidate.row.lines || []) {
      const key = `${candidate.row.id}:${line.id || "line"}`;
      availability.set(key, Math.max(0, qty(line.quantity)));
    }
  }

  const lineResults: EBelgeLineResult[] = invoiceLines.map((invoiceLine, index) => {
    const targetQty = Math.max(0, qty(invoiceLine.quantity));
    const unit = normalizeEBelgeUnit(invoiceLine.unit);
    let remaining = targetQty;
    const allocations: EBelgeLineAllocation[] = [];

    const lineCandidates = candidates
      .flatMap((candidate) =>
        (candidate.row.lines || []).map((dispatchLine) => {
          const product = compareEBelgeProducts(invoiceLine, dispatchLine);
          const unitCompatible = normalizeEBelgeUnit(dispatchLine.unit) === unit;
          return { candidate, dispatchLine, product, unitCompatible };
        }),
      )
      .filter((item) => item.product.score >= 72 && item.unitCompatible)
      .sort((a, b) => {
        if (a.candidate.explicit !== b.candidate.explicit) return a.candidate.explicit ? -1 : 1;
        if (a.product.score !== b.product.score) return b.product.score - a.product.score;
        return a.candidate.days - b.candidate.days;
      });

    for (const item of lineCandidates) {
      if (remaining <= 0.0005) break;
      const key = `${item.candidate.row.id}:${item.dispatchLine.id || "line"}`;
      const available = availability.get(key) || 0;
      if (available <= 0.0005) continue;
      const take = Math.min(remaining, available);
      availability.set(key, Math.max(0, available - take));
      remaining = Math.max(0, remaining - take);
      allocations.push({
        dispatchId: item.candidate.row.id,
        dispatchNo: documentNo(item.candidate.row),
        dispatchLineId: String(item.dispatchLine.id || ""),
        quantity: Number(take.toFixed(6)),
        productScore: item.product.score,
        productMatchSource: item.product.source,
      });
    }

    const dispatchedQuantity = allocations.reduce((sum, row) => sum + row.quantity, 0);
    const difference = Number((targetQty - dispatchedQuantity).toFixed(6));
    let status: EBelgeLineResult["status"] = "MATCHED";
    if (!allocations.length) status = "UNMATCHED";
    else if (difference > 0.0005) status = "OVER_INVOICED";
    else if (Math.abs(difference) > 0.0005) status = "PARTIAL";

    return {
      invoiceLineId: String(invoiceLine.id || `invoice-line-${index + 1}`),
      invoiceProduct: String(invoiceLine.rawName || invoiceLine.description || invoiceLine.productCode || "Kalem"),
      invoicedQuantity: Number(targetQty.toFixed(6)),
      dispatchedQuantity: Number(dispatchedQuantity.toFixed(6)),
      difference,
      unit,
      status,
      allocations,
    };
  });

  const usedDispatchIds = new Set(lineResults.flatMap((line) => line.allocations.map((row) => row.dispatchId)));
  const linkedDispatches = candidates
    .filter((candidate) => usedDispatchIds.has(candidate.row.id) || candidate.explicit)
    .map((candidate) => {
      const allocations = lineResults.flatMap((line) => line.allocations).filter((row) => row.dispatchId === candidate.row.id);
      return {
        id: candidate.row.id,
        documentNo: documentNo(candidate.row),
        explicitReference: candidate.explicit,
        usedLineCount: new Set(allocations.map((row) => row.dispatchLineId)).size,
        allocatedQuantity: Number(allocations.reduce((sum, row) => sum + row.quantity, 0).toFixed(6)),
      };
    });

  const matchedLineCount = lineResults.filter((row) => row.status !== "UNMATCHED").length;
  const exactQuantityLineCount = lineResults.filter((row) => row.status === "MATCHED").length;
  const unmatchedLineCount = lineResults.filter((row) => row.status === "UNMATCHED").length;
  const partialLineCount = lineResults.filter((row) => row.status === "PARTIAL").length;
  const overInvoicedLineCount = lineResults.filter((row) => row.status === "OVER_INVOICED").length;

  const allExact = invoiceLines.length > 0 && exactQuantityLineCount === invoiceLines.length;
  const allMatched = invoiceLines.length > 0 && matchedLineCount === invoiceLines.length;
  const explicitMissing = refs.length > 0 && !linkedDispatches.some((row) => row.explicitReference);
  const fuzzyUsed = lineResults.some((line) => line.allocations.some((row) => row.productScore < 90));

  let status: EBelgeReconciliation["status"] = "UNMATCHED";
  if (explicitMissing || (refs.length > 0 && unmatchedLineCount > 0)) status = "MISMATCH";
  else if (allExact && linkedDispatches.length) status = refs.length || !fuzzyUsed ? "MATCHED" : "SUGGESTED";
  else if (allMatched || matchedLineCount > 0) status = "PARTIAL";

  let confidence = 0;
  if (invoiceLines.length) confidence += Math.round((matchedLineCount / invoiceLines.length) * 45);
  if (invoiceLines.length) confidence += Math.round((exactQuantityLineCount / invoiceLines.length) * 20);
  if (linkedDispatches.some((row) => row.explicitReference)) confidence += 25;
  if (linkedDispatches.length && candidates.some((candidate) => candidate.party && usedDispatchIds.has(candidate.row.id))) confidence += 10;
  confidence = Math.min(100, confidence);

  const notes: string[] = [];
  if (explicitMissing) notes.push("Faturadaki irsaliye referansı havuzda bulunamadı.");
  if (unmatchedLineCount) notes.push(`${unmatchedLineCount} fatura kalemi bağlı irsaliyelerde bulunamadı.`);
  if (overInvoicedLineCount) notes.push(`${overInvoicedLineCount} kalemde fatura miktarı irsaliye miktarını aşıyor.`);
  if (partialLineCount) notes.push(`${partialLineCount} kalemde miktar farkı var.`);
  if (fuzzyUsed) notes.push("En az bir kalem ürün adı benzerliği ile eşleştirildi; ürün kartı/alias kontrolü önerilir.");
  if (status === "MATCHED") notes.push("Firma, ürün kalemleri ve miktarlar eşleşti.");

  return {
    status,
    confidence,
    explicitReferences: refs,
    linkedDispatches,
    lines: lineResults,
    matchedLineCount,
    totalLineCount: invoiceLines.length,
    exactQuantityLineCount,
    unmatchedLineCount,
    partialLineCount,
    overInvoicedLineCount,
    notes,
  };
}
