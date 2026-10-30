import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload.data;
  }
  return payload;
}

function companyPayload(activeMainCompany, extra = {}) {
  const mainCompanyId =
    activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  const mainCompanySlug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  if (!mainCompanyId && !mainCompanySlug) {
    throw new Error("Ana firma hazır olmadan üretim merkezi açılamaz.");
  }
  return {
    mainCompanyId,
    mainCompanySlug,
    ...extra,
  };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I");
}

// İmalat, Muhasebe > Firmalar & Cari'nin etkin firma kartlarını kullanır.
// Eski filtre yalnız CUSTOMER türünü kabul ediyor ve Tedarikçi olarak
// kayıtlı TAHA firmalarını boş listeye düşürüyordu. Rol değiştirilmez.
// Model için firma ID seçimi her zaman kullanıcıya aittir.
export function selectableProductionCompanies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && row?.isActive !== false && row?.is_active !== 0)
    .filter((row) => !row?.deletedAt && !row?.deleted_at)
    .sort((a, b) => String(a?.name || a?.firmaAdi || "").localeCompare(
      String(b?.name || b?.firmaAdi || ""), "tr",
    ));
}

function withCustomerDictionary(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  return {
    ...data,
    companies: selectableProductionCompanies(data.companies),
    // Müşteri/tedarikçi unvanından ilk firmayı otomatik seçme.
    defaultCompany: null,
  };
}

export async function getProductionCenter(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/production-center",
      companyPayload(activeMainCompany, params),
    ),
  );
}

export async function getProductionCenterReconciliation(activeMainCompany) {
  return unwrap(await apiGet("/model-flow/reconciliation", companyPayload(activeMainCompany)));
}

export async function getProductionCenterModel(activeMainCompany, modelId) {
  if (!modelId) throw new Error("Model seçilmedi.");
  return unwrap(
    await apiGet(
      `/production-center/models/${encodeURIComponent(modelId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}

export async function getProductionCenterDictionaries(activeMainCompany) {
  return withCustomerDictionary(
    unwrap(
      await apiGet(
        "/production-center/dictionaries",
        companyPayload(activeMainCompany),
      ),
    ),
  );
}

export async function getProductionCenterRecent(
  activeMainCompany,
  params = {},
) {
  return unwrap(
    await apiGet(
      "/production-center/recent",
      companyPayload(activeMainCompany, params),
    ),
  );
}

export async function importProductionHistory(activeMainCompany, payload = {}) {
  return unwrap(await apiPost(
    "/production-center/history-import",
    companyPayload(activeMainCompany, payload),
  ));
}

export async function createProductionCenterEntries(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/production-center/entries/bulk",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function createProductionCenterEntry(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/production-center/entries",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function updateProductionCenterEntry(
  activeMainCompany,
  entryId,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/production-center/entries/${encodeURIComponent(entryId)}`,
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function deleteProductionCenterEntry(activeMainCompany, entryId) {
  return unwrap(
    await apiDelete(
      `/production-center/entries/${encodeURIComponent(entryId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}

export async function createProductionCenterModel(
  activeMainCompany,
  payload = {},
) {
  // Müşteri bilinmiyorsa listedeki ilk firmaya sessizce atama yapma.
  const nextPayload = { ...payload };
  return unwrap(
    await apiPost(
      "/production-center/models",
      companyPayload(activeMainCompany, nextPayload),
    ),
  );
}

export async function updateProductionCenterModel(
  activeMainCompany,
  modelId,
  payload = {},
) {
  return unwrap(
    await apiPut(
      `/production-center/models/${encodeURIComponent(modelId)}`,
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function deleteProductionCenterModel(activeMainCompany, modelId) {
  return unwrap(
    await apiDelete(
      `/production-center/models/${encodeURIComponent(modelId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}

export async function getProductionCenterMachines(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/production-center/machines",
      companyPayload(activeMainCompany),
    ),
  );
}

export async function saveProductionCenterMachine(
  activeMainCompany,
  payload = {},
) {
  const id = payload?.id || payload?.machineNo || payload?.makineNo;
  if (id) {
    return unwrap(
      await apiPut(
        `/production-center/machines/${encodeURIComponent(id)}`,
        companyPayload(activeMainCompany, payload),
      ),
    );
  }
  return unwrap(
    await apiPost(
      "/production-center/machines",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function deleteProductionCenterMachine(activeMainCompany, machineId) {
  return unwrap(
    await apiDelete(
      `/production-center/machines/${encodeURIComponent(machineId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}
