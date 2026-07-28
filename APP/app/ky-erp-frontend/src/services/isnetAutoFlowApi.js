import { apiFetch, apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetAutoFlows = () =>
  apiGet("/isnet/auto-flows").then(unwrap);

export const prepareIsnetIncomingAutoFlow = (sourceId, payload = {}) =>
  apiPost(
    `/isnet/auto-flows/incoming/${encodeURIComponent(sourceId)}/prepare`,
    payload,
    { timeoutMs: 300_000 },
  ).then(unwrap);

export const assignIsnetAutoFlowModel = (flowId, payload) =>
  apiPost(`/isnet/auto-flows/${encodeURIComponent(flowId)}/model`, payload, {
    timeoutMs: 300_000,
  }).then(unwrap);

export const createIsnetAutoFlowOutgoingDraft = (flowId, payload) =>
  apiPost(
    `/isnet/auto-flows/${encodeURIComponent(flowId)}/outgoing-draft`,
    payload,
    { timeoutMs: 300_000 },
  ).then(unwrap);

export const setIsnetAutoFlowOutgoingNo = (flowId, documentNo) =>
  apiFetch(`/isnet/auto-flows/${encodeURIComponent(flowId)}/outgoing-document-no`, {
    method: "PATCH",
    body: { documentNo },
  }).then(unwrap);

export const refreshIsnetAutoFlow = (flowId, payload = {}) =>
  apiPost(`/isnet/auto-flows/${encodeURIComponent(flowId)}/refresh`, payload, {
    timeoutMs: 900_000,
  }).then(unwrap);

export const updateIsnetAutoFlowInvoiceState = (flowId, payload) =>
  apiFetch(`/isnet/auto-flows/${encodeURIComponent(flowId)}/invoice-state`, {
    method: "PATCH",
    body: payload,
  }).then(unwrap);
