import { apiGet, apiPost, apiPut } from "../utils/api";

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
  return unwrap(
    await apiGet(
      "/production-center/dictionaries",
      companyPayload(activeMainCompany),
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

export async function createProductionCenterModel(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/production-center/models",
      companyPayload(activeMainCompany, payload),
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
