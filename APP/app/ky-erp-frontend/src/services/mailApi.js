import { apiGet, apiPost } from "../utils/api";

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

export const listMailDrafts = () =>
  apiGet("/mail/drafts", { _ts: Date.now() }).then(unwrap);

export const createMailDraft = (payload = {}) =>
  apiPost("/mail/drafts", payload).then(unwrap);

export const listCommunicationFiles = (params = {}) =>
  apiGet("/file-hub/files", { take: 150, ...params }).then(unwrap);

export const searchCommunicationFiles = (q = "") =>
  q.trim()
    ? apiGet("/file-hub/search", { q: q.trim() }).then(unwrap)
    : listCommunicationFiles();
