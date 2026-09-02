import { apiGet, apiPost, apiPut } from "../utils/api";

const unwrap = (payload) => payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;

export async function listBillingCompanies() {
  return unwrap(await apiGet("/admin/billing/companies", { _ts: Date.now() }));
}

export async function getCompanyBilling(companyId) {
  return unwrap(await apiGet(`/admin/billing/companies/${encodeURIComponent(companyId)}`, { _ts: Date.now() }));
}

export async function saveCompanyBillingAccount(companyId, payload) {
  return unwrap(await apiPut(`/admin/billing/companies/${encodeURIComponent(companyId)}/account`, payload));
}

export async function addCompanyBillingMovement(companyId, payload) {
  return unwrap(await apiPost(`/admin/billing/companies/${encodeURIComponent(companyId)}/credits`, payload));
}
