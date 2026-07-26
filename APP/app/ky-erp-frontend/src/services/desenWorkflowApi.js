import { API_BASE, apiDelete, apiGet, apiPost, apiPut, apiUpload, downloadFile } from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export function companyParams(activeMainCompany, extra = {}) {
  return {
    mainCompanyId: activeMainCompany?.id || "",
    mainCompanySlug: activeMainCompany?.slug || "",
    ...extra,
  };
}

export async function getDesignInbox(activeMainCompany) {
  return unwrap(await apiGet("/desen/workflow/inbox", companyParams(activeMainCompany)));
}

export async function scanDesignInbox(activeMainCompany) {
  return unwrap(await apiPost("/desen/workflow/inbox/scan", companyParams(activeMainCompany)));
}

export async function processDesignInbox(activeMainCompany, payload) {
  return unwrap(await apiPost("/desen/workflow/inbox/process", companyParams(activeMainCompany, payload)));
}

export async function processDesignInboxBulk(activeMainCompany, payload) {
  return unwrap(await apiPost("/desen/workflow/inbox/process-bulk", companyParams(activeMainCompany, payload), { timeoutMs: 600000 }));
}

export async function ignoreDesignInbox(activeMainCompany, ids) {
  return unwrap(await apiPost("/desen/workflow/inbox/ignore", companyParams(activeMainCompany, { ids })));
}

export async function moveDesignInboxToError(activeMainCompany, ids, reason = "") {
  return unwrap(await apiPost("/desen/workflow/inbox/move-to-error", companyParams(activeMainCompany, { ids, reason })));
}

export function inboxPreviewUrl(activeMainCompany, id) {
  const query = new URLSearchParams(companyParams(activeMainCompany));
  return `${API_BASE}/desen/workflow/inbox/${encodeURIComponent(id)}/preview?${query}`;
}

export async function getDesignModels(activeMainCompany, params = {}) {
  return unwrap(await apiGet("/desen/workflow/models", companyParams(activeMainCompany, { limit: 1000, ...params })));
}

export async function getDesignModel(activeMainCompany, id) {
  return unwrap(await apiGet(`/desen/workflow/models/${encodeURIComponent(id)}`, companyParams(activeMainCompany)));
}

export async function analyzeDesignModel(activeMainCompany, id, payload = {}) {
  return unwrap(await apiPost(`/desen/workflow/models/${encodeURIComponent(id)}/analyze`, companyParams(activeMainCompany, payload), { timeoutMs: 600000 }));
}

export async function analyzeDesignModels(activeMainCompany, ids = [], payload = {}) {
  return unwrap(await apiPost("/desen/workflow/analyze", companyParams(activeMainCompany, { ids, ...payload }), { timeoutMs: 600000 }));
}

export async function getDesignAnalysisStatus(activeMainCompany) {
  return unwrap(await apiGet("/desen/workflow/analysis/status", companyParams(activeMainCompany)));
}

export async function createDesignModel(activeMainCompany, payload) {
  return unwrap(await apiPost("/desen/workflow/models", companyParams(activeMainCompany, payload)));
}

export async function updateDesignModel(activeMainCompany, id, payload) {
  return unwrap(await apiPut(`/desen/workflow/models/${encodeURIComponent(id)}`, companyParams(activeMainCompany, payload)));
}

export async function archiveDesignModel(activeMainCompany, id) {
  return unwrap(await apiPost(`/desen/workflow/models/${encodeURIComponent(id)}/archive`, companyParams(activeMainCompany)));
}

export async function createDesignOperation(activeMainCompany, modelId, payload) {
  return unwrap(await apiPost(`/desen/workflow/models/${encodeURIComponent(modelId)}/operations`, companyParams(activeMainCompany, payload)));
}

export async function updateDesignOperation(activeMainCompany, operationId, payload) {
  return unwrap(await apiPut(`/desen/workflow/operations/${encodeURIComponent(operationId)}`, companyParams(activeMainCompany, payload)));
}

export async function uploadDesignWorkflowFile(activeMainCompany, modelId, operationId, file, fileRole) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(companyParams(activeMainCompany, { operationId, fileRole })).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
  });
  return unwrap(await apiUpload(`/desen/workflow/models/${encodeURIComponent(modelId)}/files`, form));
}

export async function deleteDesignOperation(activeMainCompany, operationId) {
  return unwrap(await apiDelete(`/desen/workflow/operations/${encodeURIComponent(operationId)}`, companyParams(activeMainCompany)));
}

export async function parseDesignChannels(activeMainCompany, operationId, text) {
  return unwrap(await apiPost(`/desen/workflow/operations/${encodeURIComponent(operationId)}/channels/parse`, companyParams(activeMainCompany, { text })));
}

export async function replaceDesignChannels(activeMainCompany, operationId, channels) {
  return unwrap(await apiPost(`/desen/workflow/operations/${encodeURIComponent(operationId)}/channels`, companyParams(activeMainCompany, { channels })));
}

export async function updateDesignChannel(activeMainCompany, channelId, payload) {
  return unwrap(await apiPut(`/desen/workflow/channels/${encodeURIComponent(channelId)}`, companyParams(activeMainCompany, payload)));
}

export async function saveDesignColorGroup(activeMainCompany, operationId, payload) {
  return unwrap(await apiPost(`/desen/workflow/operations/${encodeURIComponent(operationId)}/color-groups`, companyParams(activeMainCompany, payload)));
}

export async function linkDesignRegisteredColor(activeMainCompany, groupId, registeredColorId) {
  return unwrap(await apiPost(`/desen/workflow/color-groups/${encodeURIComponent(groupId)}/link-registered-color`, companyParams(activeMainCompany, { registeredColorId })));
}

export async function getRegisteredDesignColors(activeMainCompany, q = "") {
  return unwrap(await apiGet("/desen/workflow/registered-colors", companyParams(activeMainCompany, { q })));
}

export async function syncDesignDyehouse(activeMainCompany, modelId, force = false) {
  return unwrap(await apiPost(`/desen/workflow/models/${encodeURIComponent(modelId)}/sync-dyehouse`, companyParams(activeMainCompany, { force })));
}

export async function getDesignReports(activeMainCompany, params = {}) {
  return unwrap(await apiGet("/desen/workflow/reports", companyParams(activeMainCompany, params)));
}

export function designReportExportUrl(activeMainCompany, params = {}) {
  const query = new URLSearchParams(companyParams(activeMainCompany, params));
  return `${API_BASE}/desen/workflow/reports/export?${query}`;
}

export function downloadDesignReport(activeMainCompany, params = {}) {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile("/desen/workflow/reports/export", companyParams(activeMainCompany, params), `desen-raporu-${date}.xlsx`);
}

export async function getDesignCompanies(activeMainCompany) {
  const payload = unwrap(await apiGet("/muhasebe/firmalar", companyParams(activeMainCompany, { limit: 1000 })));
  if (Array.isArray(payload)) return payload;
  return payload?.rows || payload?.items || [];
}
