import { apiGet, apiPost, apiUpload, buildApiUrl } from "../utils/api";

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  if (
    payload &&
    typeof payload === "object" &&
    payload.success === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  return payload;
}

const pendingTransactionIds = new Map();

function transactionTypeOf(payload = {}) {
  const explicit = String(payload.transactionType || "").trim().toUpperCase();
  if (["DEBIT", "CREDIT", "PAYMENT", "COLLECTION"].includes(explicit)) return explicit;

  const direction = String(payload.transactionDirection || "").trim().toUpperCase();
  if (["PAYMENT", "PAYMENT_OUT", "OUT", "OUTGOING"].includes(direction)) return "PAYMENT";
  if (["COLLECTION", "COLLECTION_IN", "PAYMENT_IN", "IN", "INCOMING"].includes(direction)) return "COLLECTION";
  return explicit || direction;
}

function transactionFingerprint(payload = {}) {
  const tenant = payload.mainCompanySlug || payload.mainCompanyId || "";
  const company = payload.companyId || payload.firmId || "";
  const type = transactionTypeOf(payload);
  const raw = [
    tenant,
    company,
    type,
    payload.paymentDate || payload.date || "",
    Number(payload.amount || 0).toFixed(2),
    payload.paymentMethod || "",
    payload.bankName || "",
    payload.workType || payload.recordType || "",
    payload.description || "",
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function pendingStorageKey(fingerprint) {
  return `kyerp:muhasebe:pending:${fingerprint}`;
}

function getPendingRequestId(payload) {
  const explicit = String(payload.requestId || payload.id || "").trim();
  if (explicit) return explicit;
  const fingerprint = transactionFingerprint(payload);
  const memoryId = pendingTransactionIds.get(fingerprint);
  if (memoryId) return memoryId;

  let stored = "";
  try {
    stored = globalThis?.sessionStorage?.getItem(pendingStorageKey(fingerprint)) || "";
  } catch {
    // sessionStorage may be unavailable in tests/private contexts; in-memory id still protects retries.
  }
  const requestId = stored || crypto.randomUUID();
  pendingTransactionIds.set(fingerprint, requestId);
  try {
    globalThis?.sessionStorage?.setItem(pendingStorageKey(fingerprint), requestId);
  } catch {
    // Best effort only; backend idempotency remains authoritative.
  }
  return requestId;
}

function clearPendingRequestId(payload, requestId) {
  const fingerprint = transactionFingerprint(payload);
  if (pendingTransactionIds.get(fingerprint) === requestId) pendingTransactionIds.delete(fingerprint);
  try {
    if (globalThis?.sessionStorage?.getItem(pendingStorageKey(fingerprint)) === requestId) {
      globalThis.sessionStorage.removeItem(pendingStorageKey(fingerprint));
    }
  } catch {
    // Best effort only.
  }
}

export async function getOdemeFirmalar(params = {}) {
  return unwrap(await apiGet("/api/muhasebe/odeme/firmalar", params));
}

export async function getOdemeFirmaOzet(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/ozet`,
      params,
    ),
  );
}

export async function getOdemeFirmaCekler(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/cekler`,
      params,
    ),
  );
}

export async function getOdemeCekOzeti(params = {}) {
  return unwrap(await apiGet("/api/muhasebe/odeme/cekler", params));
}

export async function getOdemeFirmaKartlar(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/kartlar`,
      params,
    ),
  );
}

export async function getOdemeFirmaNakitHavale(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/nakit-havale`,
      params,
    ),
  );
}

export async function getOdemeFirmaHareketler(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/hareketler`,
      params,
    ),
  );
}

export async function getOdemeFirmaAcikBorclar(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/acik-kalemler`,
      params,
    ),
  );
}

export async function createOdemeFirma(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/firma", payload));
}

export async function createOdemeCek(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/cek-v3", payload));
}

export async function uploadOdemeCekDosyalari(
  checkId,
  activeMainCompany,
  files = {},
) {
  const formData = new FormData();
  const slug =
    activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  if (slug) formData.set("mainCompanySlug", slug);
  if (id) formData.set("mainCompanyId", id);
  if (files.front) formData.set("front", files.front);
  if (files.back) formData.set("back", files.back);
  if (files.receipt) formData.set("receipt", files.receipt);
  return unwrap(
    await apiUpload(
      `/api/muhasebe/odeme/cek/${encodeURIComponent(checkId)}/dosyalar`,
      formData,
    ),
  );
}

export function odemeCekDosyaUrl(checkId, side, activeMainCompany = {}) {
  const slug =
    activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  const query = new URLSearchParams();
  if (slug) query.set("mainCompanySlug", slug);
  if (id) query.set("mainCompanyId", id);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return buildApiUrl(
    `/api/muhasebe/odeme/cek/${encodeURIComponent(checkId)}/dosya/${encodeURIComponent(side)}${suffix}`,
  );
}

export async function createOdemeKart(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/kart", payload));
}

export async function saveOdemeIslem(payload = {}) {
  const transactionType = transactionTypeOf(payload);
  const canonicalPayload = {
    ...payload,
    transactionType,
    transactionDirection: transactionType === "COLLECTION" ? "COLLECTION_IN" : "PAYMENT_OUT",
  };
  const requestId = getPendingRequestId(canonicalPayload);
  const result = unwrap(
    await apiPost("/api/muhasebe/odeme/islem", {
      ...canonicalPayload,
      requestId,
    }),
  );
  clearPendingRequestId(canonicalPayload, requestId);
  return result;
}
