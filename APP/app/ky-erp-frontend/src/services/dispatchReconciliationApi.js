import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";

function data(payload, fallback) {
  return payload?.data ?? payload?.result ?? payload ?? fallback;
}

export async function getCustomerDispatches(params = {}) {
  return data(await apiGet("/muhasebe/customer-dispatches", params), { rows: [], total: 0 });
}

export async function getCustomerDispatchSummary(params = {}) {
  return data(await apiGet("/muhasebe/customer-dispatches/summary", params), {});
}

export async function getCustomerDispatchDetail(id) {
  return data(await apiGet(`/muhasebe/customer-dispatches/${encodeURIComponent(id)}`), null);
}

export async function updateCustomerDispatchLine(id, body) {
  return data(await apiPatch(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}`, body), null);
}

export async function linkCustomerDispatchModel(id, body) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/link-model`, body), null);
}

export async function createCustomerDispatchModel(id, body) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/create-model`, body), null);
}

export async function unlinkCustomerDispatchModel(id) {
  return data(await apiDelete(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/link-model`), null);
}

export async function addCustomerDispatchProduction(id, body) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/production`, body), null);
}

export async function addDispatchNonBillable(id, body) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/non-billable`, body), null);
}

export async function approveDispatchPartial(id, body = {}) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/approve-partial`, body), null);
}

export async function approveDispatchPartials(dispatchLineIds) {
  return data(await apiPost("/muhasebe/customer-dispatch-lines/approve-partials", { dispatchLineIds }), {});
}

export async function resolveDispatchReview(id, body = {}) {
  return data(await apiPost(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/resolve-review`, body), null);
}

export async function resolveDispatchReviews(dispatchLineIds) {
  return data(await apiPost("/muhasebe/customer-dispatch-lines/resolve-reviews", { dispatchLineIds }), {});
}

export async function updateDispatchNonBillable(id, allocationId, body) {
  return data(await apiPatch(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/non-billable/${encodeURIComponent(allocationId)}`, body), null);
}

export async function removeDispatchNonBillable(id, allocationId) {
  return data(await apiDelete(`/muhasebe/customer-dispatch-lines/${encodeURIComponent(id)}/non-billable/${encodeURIComponent(allocationId)}`), null);
}

export async function recalculateDispatchInvoices() {
  return data(await apiPost("/muhasebe/dispatch-invoice-control/recalculate", {}), {});
}

export async function getInvoiceCandidates(id) {
  return data(await apiGet(`/muhasebe/dispatch-invoice-control/${encodeURIComponent(id)}/candidates`), []);
}

export async function matchDispatchInvoice(id, body) {
  return data(await apiPost(`/muhasebe/dispatch-invoice-control/${encodeURIComponent(id)}/match`, body), null);
}

export async function approveDispatchInvoiceMatch(id, body = {}) {
  return data(await apiPost(`/muhasebe/dispatch-invoice-control/matches/${encodeURIComponent(id)}/approve`, body), null);
}

export async function rejectDispatchInvoiceMatch(id, body = {}) {
  return data(await apiPost(`/muhasebe/dispatch-invoice-control/matches/${encodeURIComponent(id)}/reject`, body), null);
}

export async function removeDispatchInvoiceMatch(id) {
  return data(await apiDelete(`/muhasebe/dispatch-invoice-control/matches/${encodeURIComponent(id)}`), null);
}

export async function uploadCustomerDispatches(files) {
  const form = new FormData();
  Array.from(files || []).forEach((file) => form.append("files", file));
  form.append("documentType", "musteriden_gelen_irsaliye");
  form.append("targetType", "MUSTERIDEN_GELEN_IRSALIYE");
  form.append("notes", "Müşteri İrsaliyeleri çalışma alanından yüklendi");
  return data(await apiUpload("/muhasebe/document-upload", form), {});
}
