import { apiFetch, apiGet, apiPatch, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetSourceIntakes = (params = {}) => {
  const search = new URLSearchParams();
  if (params.sourceType) search.set("sourceType", params.sourceType);
  if (params.status) search.set("status", params.status);
  if (params.companyId) search.set("companyId", params.companyId);
  if (params.modelId) search.set("modelId", params.modelId);
  if (params.search) search.set("search", params.search);
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || 50));
  return apiGet(`/isnet/source-intakes?${search.toString()}`).then(unwrap);
};

export const createIsnetPortalSourceIntake = (payload) =>
  apiPost("/isnet/source-intakes/portal", payload).then(unwrap);

export const createIsnetNoDispatchSourceIntake = (payload) =>
  apiPost("/isnet/source-intakes/no-dispatch", payload).then(unwrap);

export const createIsnetManualPdfSourceIntake = (payload) => {
  const body = new FormData();
  body.append("pdf", payload.pdfFile);
  body.append("mainCompanySlug", payload.mainCompanySlug || "");
  body.append("companyId", payload.companyId || "");
  body.append("companyName", payload.companyName || "");
  body.append("companyRole", payload.companyRole || "CUSTOMER");
  body.append("modelId", payload.modelId || "");
  body.append("modelName", payload.modelName || "");
  body.append("orderNo", payload.orderNo || "");
  body.append("customerDispatchNo", payload.customerDispatchNo || "");
  body.append("issueDate", payload.issueDate || "");
  body.append("quantity", String(payload.quantity || ""));
  body.append("unit", payload.unit || "ADET");
  body.append("note", payload.note || "");

  return apiFetch("/isnet/source-intakes/manual-pdf", {
    method: "POST",
    body,
    timeoutMs: 120_000,
  }).then(unwrap);
};

export const assignIsnetSourceIntakeModel = (intakeId, payload) =>
  apiPatch(`/isnet/source-intakes/${encodeURIComponent(intakeId)}/model`, payload).then(unwrap);

export const linkCustomerDispatchToSourceIntake = (intakeId, payload) =>
  apiPatch(`/isnet/source-intakes/${encodeURIComponent(intakeId)}/customer-dispatch`, payload).then(unwrap);

export const updateIsnetSourceIntakeQuantities = (intakeId, payload) =>
  apiPatch(`/isnet/source-intakes/${encodeURIComponent(intakeId)}/quantities`, payload).then(unwrap);

export const getIsnetSourceIntakeDetail = (intakeId) =>
  apiGet(`/isnet/source-intakes/${encodeURIComponent(intakeId)}`).then(unwrap);

export const createOutgoingDispatchFromSourceIntake = (intakeId, payload) =>
  apiPost(`/isnet/source-workflow/${encodeURIComponent(intakeId)}/outgoing-dispatch`, {
    ...payload,
    confirmed: true,
  }).then(unwrap);

export const prepareInvoiceFromSourceIntake = (intakeId, payload = {}) =>
  apiPost(`/isnet/source-workflow/${encodeURIComponent(intakeId)}/invoice`, payload, {
    timeoutMs: 900_000,
  }).then(unwrap);

export const completeOutgoingDispatchFromSourceIntake = (intakeId, draftId, payload) =>
  apiFetch(
    `/isnet/source-intakes/${encodeURIComponent(intakeId)}/outgoing-dispatch/${encodeURIComponent(draftId)}/complete`,
    {
      method: "PATCH",
      body: {
        ...payload,
        confirmed: true,
      },
    },
  ).then(unwrap);
