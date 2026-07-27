import { apiFetch, apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetDashboard = () => apiGet("/isnet/dashboard").then(unwrap);

export const getIsnetConfiguration = () =>
  apiGet("/isnet/configuration").then(unwrap);

export const getIncomingDispatches = () =>
  apiGet("/isnet/dispatches/incoming").then(unwrap);

export const getIssuedDocuments = () =>
  apiGet("/isnet/documents/issued").then(unwrap);

export const getIssuedDocumentFile = (id, format = "pdf") =>
  apiFetch(
    `/isnet/documents/issued/${encodeURIComponent(id)}/file?format=${encodeURIComponent(format)}&preview=1`,
    { responseType: "blob", timeoutMs: 60_000 },
  );

export const getIsnetPortalDocuments = ({ startDate, endDate }) =>
  apiGet(
    `/isnet/documents/portal?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  ).then(unwrap);

export const getIsnetLocalDocuments = ({ startDate, endDate, page = 1, pageSize = 50 }) =>
  apiGet(
    `/isnet/documents/local?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
  ).then(unwrap);

export const backfillIsnetPortalDocument = (document) =>
  apiPost("/isnet/documents/backfill", {
    documentNo: document.documentNo,
    automationKey: document.automationKey,
  }).then(unwrap);

export const getIsnetPortalDocumentFile = (document, format) =>
  apiFetch(
    `/isnet/documents/${encodeURIComponent(document.direction)}/${encodeURIComponent(document.kind)}/${encodeURIComponent(document.sourceId)}/file?format=${encodeURIComponent(format)}`,
    { responseType: "blob", timeoutMs: 60_000 },
  );

export const importIsnetIncomingDispatch = (document) =>
  apiPost(
    `/isnet/documents/incoming/dispatch/${encodeURIComponent(document.sourceId)}/import`,
    { confirmed: true },
  ).then(unwrap);

export const createIsnetOutgoingDispatchDraft = (document) =>
  apiPost(
    `/isnet/documents/incoming/dispatch/${encodeURIComponent(document.sourceId)}/create-outgoing-draft`,
    { confirmed: true },
  ).then(unwrap);

export const getIsnetIncomingDispatchDraft = (document) =>
  apiGet(
    `/isnet/documents/incoming/dispatch/${encodeURIComponent(document.sourceId)}/outgoing-draft`,
  ).then(unwrap);

export const searchIsnetRecipients = (kind, search) =>
  apiGet(
    `/isnet/recipients?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(search)}`,
  ).then(unwrap);

export const getIsnetRecipientContext = (localCompanyId) =>
  apiGet(
    `/isnet/recipients/context?localCompanyId=${encodeURIComponent(localCompanyId || "")}`,
  ).then(unwrap);

export const getIsnetInvoiceAssistantTemplate = () =>
  apiGet("/isnet/invoice-assistant/template").then(unwrap);

export const saveIsnetInvoiceAssistantTemplate = (payload) =>
  apiPut("/isnet/invoice-assistant/template", payload).then(unwrap);

export const createIsnetManualInvoiceDraft = (payload) =>
  apiPost("/isnet/invoice-drafts", { ...payload, confirmed: true }).then(unwrap);

export const createIsnetManualDispatchDraft = (payload) =>
  apiPost("/isnet/dispatch-drafts", { ...payload, confirmed: true }).then(unwrap);

export const getIsnetDispatchInvoiceDraft = (sourceId) =>
  apiGet(`/isnet/dispatches/${encodeURIComponent(sourceId)}/invoice-draft`).then(unwrap);

export const createIsnetInvoiceFromDispatch = (sourceId, payload) =>
  apiPost(`/isnet/dispatches/${encodeURIComponent(sourceId)}/invoice-draft`, {
    ...payload,
    confirmed: true,
  }).then(unwrap);

export const getIsnetInvoiceDraftStatus = (draftId) =>
  apiGet(`/isnet/invoice-drafts/${encodeURIComponent(draftId)}`).then(unwrap);

export const verifyIsnetInvoiceDraft = (draftId) =>
  apiPost(`/isnet/invoice-drafts/${encodeURIComponent(draftId)}/verify`, {}).then(unwrap);

export const finalApproveIsnetInvoiceDraft = (draftId, payload) =>
  apiPost(`/isnet/invoice-drafts/${encodeURIComponent(draftId)}/final-approval`, payload).then(unwrap);

export const submitIsnetOfficialInvoice = (draftId) =>
  apiPost(`/isnet/invoice-drafts/${encodeURIComponent(draftId)}/submit`, {}, { timeoutMs: 300_000 }).then(unwrap);

export const retryIsnetInvoiceClosure = (draftId) =>
  apiPost(`/isnet/invoice-drafts/${encodeURIComponent(draftId)}/retry-closure`, {}, { timeoutMs: 300_000 }).then(unwrap);

export const getIsnetModelSuggestions = (intakeId, search = "") =>
  apiGet(
    `/isnet/intakes/${encodeURIComponent(intakeId)}/model-suggestions?search=${encodeURIComponent(search)}`,
  ).then(unwrap);

export const getIsnetIntakeDetail = (intakeId) =>
  apiGet(`/isnet/intakes/${encodeURIComponent(intakeId)}`).then(unwrap);

export const assignIsnetIntakeModel = (intakeId, payload) =>
  apiPut(`/isnet/intakes/${encodeURIComponent(intakeId)}/model`, payload).then(
    unwrap,
  );

export const createIsnetIntakeModel = (intakeId, payload) =>
  apiPost(`/isnet/intakes/${encodeURIComponent(intakeId)}/model`, {
    ...payload,
    confirmed: true,
  }).then(unwrap);

export const getMailQueue = () => apiGet("/isnet/mail/queue").then(unwrap);

export const getIsnetSettings = () => apiGet("/isnet/settings").then(unwrap);

export const testIsnetSettings = (payload) =>
  apiPost("/isnet/settings/test", payload, {
    suppressUnauthorized: true,
  }).then(unwrap);

export const saveIsnetSettings = (payload) =>
  apiPut("/isnet/settings", payload).then(unwrap);

export const startDailySync = (payload = {}) =>
  apiPost("/isnet/sync", payload, { timeoutMs: 300_000 }).then(unwrap);

export const markIsnetDocumentRead = (key, read = true) =>
  apiPost(`/isnet/documents/${encodeURIComponent(key)}/read`, { read }).then(unwrap);

export const markIsnetDocumentsRead = (documentIds, isRead) =>
  apiFetch("/isnet/documents/read-status", {
    method: "PATCH",
    body: { documentIds, isRead },
  }).then(unwrap);

export const getIsnetAutomationStatus = () =>
  apiGet("/isnet/automation/status").then(unwrap);

export const getIsnetPrintQueue = () => apiGet("/isnet/print-queue").then(unwrap);

export const getIsnetPrintPdf = (key) =>
  apiFetch(`/isnet/print-queue/${encodeURIComponent(key)}/pdf`, {
    responseType: "blob",
    timeoutMs: 60_000,
  });

export const getIsnetBulkPrintPdf = (keys = [], newOnly = false) =>
  apiFetch("/isnet/print-queue/bulk/pdf", {
    method: "POST",
    body: { keys, newOnly },
    responseType: "blob",
    timeoutMs: 120_000,
  });

export const markIsnetPrinted = (key, printed = true) =>
  apiPost(`/isnet/print-queue/${encodeURIComponent(key)}/printed`, { printed }).then(unwrap);

export const markIsnetBulkPrinted = (keys) =>
  apiPost("/isnet/print-queue/bulk/printed", { keys }).then(unwrap);

export const validateInvoiceDraft = (payload) =>
  apiPost("/isnet/invoices/validate", payload).then(unwrap);

export const prepareInvoiceDraft = (payload) =>
  apiPost("/isnet/invoices/prepare", payload).then(unwrap);

export const completeInvoiceArchive = (payload) =>
  apiPost("/isnet/invoices/archive", payload).then(unwrap);

export const createOutlookDraft = (mailId, payload = {}) =>
  apiPost(
    `/isnet/mail/${encodeURIComponent(mailId)}/outlook-draft`,
    payload,
  ).then(unwrap);

export const markMailSent = (mailId, payload = {}) =>
  apiPost(`/isnet/mail/${encodeURIComponent(mailId)}/sent`, payload).then(
    unwrap,
  );
