import { apiFetch, apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getEBelgePool = (params = {}) =>
  apiGet("/e-belge/pool", params, { timeoutMs: 60_000 }).then(unwrap);

export const getEBelgeDetail = (id) =>
  apiGet(`/e-belge/documents/${encodeURIComponent(id)}`, undefined, { timeoutMs: 60_000 }).then(unwrap);

export async function uploadEBelge(files, { direction = "INCOMING", documentKind = "AUTO" } = {}) {
  const form = new FormData();
  Array.from(files || []).forEach((file) => form.append("files", file));
  form.set("direction", direction);
  form.set("documentKind", documentKind);
  return unwrap(await apiUpload("/e-belge/upload", form));
}

export const reconcileEBelge = (id) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/reconcile`, {}).then(unwrap);

export const reconcileAllEBelge = () =>
  apiPost("/e-belge/reconcile-all", {}, { timeoutMs: 180_000 }).then(unwrap);

export const updateEBelge = (id, payload) =>
  apiPatch(`/e-belge/documents/${encodeURIComponent(id)}`, payload).then(unwrap);

export const finalizeEBelge = (id, payload = {}) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/finalize`, payload, { timeoutMs: 120_000 }).then(unwrap);

export const resolveEBelgeIssue = (id, issueId) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}/resolve`, {}).then(unwrap);

export const getEBelgeCompanySuggestions = (q = "") =>
  apiGet("/e-belge/company-suggestions", { q }, { timeoutMs: 30_000 }).then(unwrap);

export const getEBelgeIntegrations = () =>
  apiGet("/e-belge/integrations", undefined, { timeoutMs: 30_000 }).then(unwrap);

export const getEBelgeFilePreview = (fileId) =>
  apiFetch(`/file-hub/files/${encodeURIComponent(fileId)}/preview`, {
    responseType: "blob",
    timeoutMs: 60_000,
  });

export function openEBelgeBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
