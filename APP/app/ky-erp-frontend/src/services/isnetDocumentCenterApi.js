import { apiGet } from "../utils/api";

const ACCOUNTING_CLEAN_START = "2026-08-01";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function cleanStart(value) {
  const requested = String(value || "").trim();
  if (!requested || requested < ACCOUNTING_CLEAN_START) return ACCOUNTING_CLEAN_START;
  return requested;
}

export const getIsnetDocumentCenter = (params = {}) => {
  const search = new URLSearchParams();
  const normalized = {
    ...params,
    startDate: cleanStart(params.startDate),
  };
  Object.entries(normalized).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  return apiGet(`/isnet/document-center?${search.toString()}`).then(unwrap);
};
