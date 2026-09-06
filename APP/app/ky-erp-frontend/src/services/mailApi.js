import { apiFetch, apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getMailProviders = () =>
  apiGet("/mail/providers", { _ts: Date.now() }).then(unwrap);

export const getMailOverview = () =>
  apiGet("/mail/overview", { _ts: Date.now() }).then(unwrap);

export const listMailAccounts = () =>
  apiGet("/mail/accounts", { _ts: Date.now() }).then(unwrap);

export const requestMailAccount = (payload = {}) =>
  apiPost("/mail/accounts/request", payload).then(unwrap);

export const listMailApprovals = () =>
  apiGet("/mail/approvals", { _ts: Date.now() }).then(unwrap);

export const decideMailApproval = (id, decision, note = "") =>
  apiPost(`/mail/approvals/${encodeURIComponent(id)}/decision`, { decision, note }).then(unwrap);

export const listMailMessages = (accountId, params = {}) =>
  apiGet("/mail/messages", { accountId, ...params }).then(unwrap);

export const listMailFolders = (accountId) =>
  apiGet("/mail/folders", { accountId, _ts: Date.now() }).then(unwrap);

export const syncMailFolder = (accountId, folderId) =>
  apiPost(`/mail/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/sync`, {}, { timeoutMs: 120_000 }).then(unwrap);

export const pinMailMessage = (messageId, pinned) =>
  apiPut(`/mail/messages/${encodeURIComponent(messageId)}/pin`, { pinned }).then(unwrap);

export const runMailMessageAction = (messageId, action, values = {}) =>
  apiPost(`/mail/messages/${encodeURIComponent(messageId)}/action`, { action, ...values }, { timeoutMs: 60_000 }).then(unwrap);

export const listMailAttachments = (messageId) =>
  apiGet(`/mail/messages/${encodeURIComponent(messageId)}/attachments`, { _ts: Date.now() }).then(unwrap);

export const getMailAttachmentBlob = (messageId, attachmentId) =>
  apiFetch(`/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/download`, {
    method: "GET",
    responseType: "blob",
    timeoutMs: 60_000,
  });

export const downloadMailAttachment = async (messageId, attachmentId, fileName = "ek") => {
  const blob = await getMailAttachmentBlob(messageId, attachmentId);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "ek";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

export const listMailDrafts = () =>
  apiGet("/mail/drafts", { _ts: Date.now() }).then(unwrap);

export const createMailDraft = (payload = {}) =>
  apiPost("/mail/drafts", payload).then(unwrap);

export const listCommunicationFiles = (params = {}) =>
  apiGet("/mail/files", { take: 150, ...params }).then(unwrap);

export const searchCommunicationFiles = (q = "") =>
  q.trim()
    ? apiGet("/mail/files", { q: q.trim(), take: 150 }).then(unwrap)
    : listCommunicationFiles();

export const startMicrosoftMailOAuth = (accountId) =>
  apiPost(`/mail/accounts/${encodeURIComponent(accountId)}/oauth/microsoft/start`, {}).then(unwrap);

export const startGoogleMailOAuth = (accountId) =>
  apiPost(`/mail/accounts/${encodeURIComponent(accountId)}/oauth/google/start`, {}).then(unwrap);

export const getMailConnection = (accountId) =>
  apiGet(`/mail/accounts/${encodeURIComponent(accountId)}/connection`, { _ts: Date.now() }).then(unwrap);

export const setMailAccountDefaults = (accountId, values = {}) =>
  apiPut(`/mail/accounts/${encodeURIComponent(accountId)}/defaults`, values).then(unwrap);

export const syncMailAccount = (accountId) =>
  apiPost(`/mail/accounts/${encodeURIComponent(accountId)}/sync`, {}, { timeoutMs: 120_000 }).then(unwrap);

export const sendMailDraft = (draftId, logicalEventId = "") =>
  apiPost(`/mail/drafts/${encodeURIComponent(draftId)}/send`, { logicalEventId }, { timeoutMs: 60_000 }).then(unwrap);
