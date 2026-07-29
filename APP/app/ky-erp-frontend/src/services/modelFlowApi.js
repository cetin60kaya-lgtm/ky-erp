import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function companyPayload(activeMainCompany, extra = {}) {
  const mainCompanyId =
    activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  const mainCompanySlug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  if (!mainCompanyId && !mainCompanySlug) {
    throw new Error("Ana firma hazır olmadan tek model işlemi yapılamaz.");
  }
  return {
    mainCompanyId,
    mainCompanySlug,
    ...extra,
  };
}

export async function getCanonicalModels(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/model-flow/models",
      companyPayload(activeMainCompany, params),
    ),
  );
}

export async function quickCreateCanonicalModel(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/model-flow/quick-create",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function linkDispatchToCanonicalModel(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/model-flow/link-dispatch",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function linkIsnetFlowToProduction(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/model-flow/link-isnet-flow",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function syncCanonicalDispatchPlans(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/model-flow/sync-intakes",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function refreshCanonicalProductionPlan(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/model-flow/refresh-plan",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function getProductionReconciliation(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/model-flow/reconciliation",
      companyPayload(activeMainCompany, params),
    ),
  );
}

export async function getCanonicalModelTimeline(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/model-flow/timeline",
      companyPayload(activeMainCompany, params),
    ),
  );
}
