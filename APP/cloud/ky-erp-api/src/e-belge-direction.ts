export type EBelgeDirection = "INCOMING" | "OUTGOING" | "AUTO";

type Identity = { names?: unknown[]; taxNos?: unknown[] };
type Party = { name?: unknown; taxNo?: unknown };

type ResolveInput = {
  requestedDirection?: unknown;
  owner?: Identity;
  supplier?: Party;
  customer?: Party;
  documentNo?: unknown;
};

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
export const cleanEBelgeTaxNo = (value: unknown) => text(value).replace(/\D/g, "");
export const normalizeEBelgeIdentity = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function explicitEBelgeDirection(value: unknown): EBelgeDirection {
  const normalized = upper(value);
  if (/OUT|GIDEN/.test(normalized)) return "OUTGOING";
  if (/IN|GELEN/.test(normalized)) return "INCOMING";
  return "AUTO";
}
function partyMatchesOwner(owner: Identity = {}, party: Party = {}) {
  const partyTax = cleanEBelgeTaxNo(party.taxNo);
  const ownerTaxes = (owner.taxNos || []).map(cleanEBelgeTaxNo).filter(Boolean);
  if (partyTax && ownerTaxes.includes(partyTax)) return { matched: true, basis: "TAX_NO", confidence: 1 };

  const partyName = normalizeEBelgeIdentity(party.name);
  const ownerNames = (owner.names || []).map(normalizeEBelgeIdentity).filter(Boolean);
  if (!partyName) return { matched: false, basis: "", confidence: 0 };
  for (const ownerName of ownerNames) {
    if (partyName === ownerName) return { matched: true, basis: "NAME_EXACT", confidence: 0.99 };
    if (Math.min(partyName.length, ownerName.length) >= 8 && (partyName.includes(ownerName) || ownerName.includes(partyName))) {
      return { matched: true, basis: "NAME_CONTAINS", confidence: 0.95 };
    }
  }
  return { matched: false, basis: "", confidence: 0 };
}
export function resolveManualEBelgeDirection(input: ResolveInput) {
  const explicit = explicitEBelgeDirection(input.requestedDirection);
  const supplier = { name: text(input.supplier?.name), taxNo: cleanEBelgeTaxNo(input.supplier?.taxNo) };
  const customer = { name: text(input.customer?.name), taxNo: cleanEBelgeTaxNo(input.customer?.taxNo) };
  const supplierOwn = partyMatchesOwner(input.owner, supplier);
  const customerOwn = partyMatchesOwner(input.owner, customer);

  let direction: EBelgeDirection = explicit;
  let basis = explicit === "AUTO" ? "" : "USER_EXPLICIT";
  let confidence = explicit === "AUTO" ? 0 : 1;
  if (explicit === "AUTO") {
    if (supplierOwn.matched && !customerOwn.matched) {
      direction = "OUTGOING";
      basis = `SUPPLIER_${supplierOwn.basis}`;
      confidence = supplierOwn.confidence;
    } else if (customerOwn.matched && !supplierOwn.matched) {
      direction = "INCOMING";
      basis = `CUSTOMER_${customerOwn.basis}`;
      confidence = customerOwn.confidence;
    } else {
      const documentNo = normalizeEBelgeIdentity(input.documentNo).replace(/\s+/g, "");
      if (/^(HKN|DDM)/.test(documentNo)) {
        direction = "OUTGOING";
        basis = "DOCUMENT_PREFIX_OUTGOING";
        confidence = 0.9;
      } else if (/^(TIA|TKF|SLV|CNS)/.test(documentNo)) {
        direction = "INCOMING";
        basis = "DOCUMENT_PREFIX_INCOMING";
        confidence = 0.9;
      } else if (supplier.name || supplier.taxNo) {
        direction = "INCOMING";
        basis = "NON_OWNER_SUPPLIER";
        confidence = 0.8;
      } else if (customer.name || customer.taxNo) {
        direction = "OUTGOING";
        basis = "NON_OWNER_CUSTOMER";
        confidence = 0.8;
      } else {
        direction = "INCOMING";
        basis = "SINGLE_COMPANY_SAFE_DEFAULT";
        confidence = 0.55;
      }
    }
  }

  const counterparty = direction === "OUTGOING" ? customer : supplier;
  return {
    direction,
    resolved: true,
    basis,
    confidence,
    counterpartyName: counterparty.name,
    counterpartyTaxNo: counterparty.taxNo,
    supplierOwn: supplierOwn.matched,
    customerOwn: customerOwn.matched,
  };
}
