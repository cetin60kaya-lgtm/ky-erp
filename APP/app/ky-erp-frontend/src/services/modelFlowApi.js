import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function companyPayload(activeMainCompany, extra = {}) {
  return {
    mainCompanyId: activeMainCompany?.id || "",
    mainCompanySlug: activeMainCompany?.slug || "",
    ...extra,
  };
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
