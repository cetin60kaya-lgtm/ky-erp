import { apiFetch, apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetSettings = () => apiGet("/isnet/settings", {}, {forceFresh:true}).then(unwrap);

export const getIsnetPortalHealth = () =>
  apiGet("/isnet/provider-login-health", { timeoutMs: 14_000 }).then(unwrap);

// Network diagnostics, not supplier credentials or authenticated API access.
export const getIsnetEgressHealth = () =>
  apiGet("/health/isnet-egress", { timeoutMs: 14_000 }).then(unwrap);

export const testIsnetSettings = (payload) =>
  apiPost("/isnet/settings/test", payload, {
    suppressUnauthorized: true,
    timeoutMs: 90_000,
  }).then(unwrap);

export const saveIsnetSettings = (payload) =>
  apiPut("/isnet/settings", payload, { timeoutMs: 90_000 }).then(unwrap);

// Actual authenticated provider list probe; returns only first-page counts, never document content.
export const getIsnetReadOnlyPreview = (from="",to="") =>
  apiGet("/isnet/api-read-only-preview", {from,to}, {timeoutMs:20000,forceFresh:true}).then(unwrap);
// A deliberate user click downloads only ONE validated XML to their browser.
// No R2/D1 write, no accounting write and no official document submission.
export const downloadIsnetReadOnlyXmlSample = (kind,from="",to="",direction="incoming",ettn="") =>
  apiFetch("/isnet/api-read-only-xml-sample",{
    method:"GET",params:{kind,from,to,direction,ettn},responseType:"blob",timeoutMs:35000,
  });

export const queryIsnetDocumentTest = (type,from,to) =>
 apiGet("/isnet/document-test",{type,from,to},{forceFresh:true,timeoutMs:25000}).then(unwrap);
