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

export async function assignIsnetAutoFlowModel(flowId, payload) {
  const body = typeof payload === "string"
    ? { candidateId: payload, modelId: payload, source: "shared-model" }
    : payload || {};

  const assigned = unwrap(
    await apiPost(`/isnet/auto-flows/${encodeURIComponent(flowId)}/model`, body, {
      timeoutMs: 300_000,
    }),
  );

  const flow = assigned?.flow || assigned;
  const mainCompanySlug =
    flow?.mainCompanySlug || body.mainCompanySlug || body.mainCompanyId || "";
  const modelId =
    flow?.modelId || assigned?.model?.id || body.modelId || body.candidateId || "";

  if (mainCompanySlug && modelId) {
    const productionLink = unwrap(
      await apiPost("/model-flow/link-isnet-flow", {
        mainCompanySlug,
        mainCompanyId: body.mainCompanyId || undefined,
        flowId,
        modelId,
      }),
    );
    return { ...assigned, productionLink };
  }

  return assigned;
}

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
