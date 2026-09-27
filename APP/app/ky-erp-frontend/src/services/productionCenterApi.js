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

function isCustomerCompany(row) {
  const role = normalize(
    `${row?.type || ""} ${row?.companyType || row?.company_type || ""}`,
  );
  return /MUSTERI|CUSTOMER|ALICI/.test(role) &&
    !/SUPPLIER|TEDARIK|SATICI|VENDOR/.test(role);
}

function customerCompanies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.isActive !== false && row?.is_active !== 0)
    .filter((row) => !row?.deletedAt && !row?.deleted_at)
    .filter(isCustomerCompany)
    .sort((a, b) => {
      const aTaha = /^TAHA\b/.test(normalize(a?.name || a?.firmaAdi));
      const bTaha = /^TAHA\b/.test(normalize(b?.name || b?.firmaAdi));
      if (aTaha !== bTaha) return aTaha ? -1 : 1;
      return String(a?.name || a?.firmaAdi || "").localeCompare(
        String(b?.name || b?.firmaAdi || ""),
        "tr",
      );
    });
}

function withCustomerDictionary(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const companies = customerCompanies(data.companies);
  const defaultCompany =
    companies.find((row) => /^TAHA\b/.test(normalize(row?.name || row?.firmaAdi))) ||
    companies[0] ||
    null;
  return { ...data, companies, defaultCompany };
}

export async function getProductionCenter(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/production-center",
      companyPayload(activeMainCompany, params),
    ),
  );
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
  let nextPayload = { ...payload };
  if (!nextPayload.companyId && !nextPayload.companyName) {
    try {
      const dictionaries = await getProductionCenterDictionaries(activeMainCompany);
      const company = dictionaries?.defaultCompany || dictionaries?.companies?.[0];
      if (company?.id) {
        nextPayload = {
          ...nextPayload,
          companyId: company.id,
          companyName: company.name || company.firmaAdi || "TAHA GİYİM",
        };
      }
    } catch {
      // Backend D1 varsayılan müşteri kuralı ikinci güvenlik katmanıdır.
    }
  }
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
