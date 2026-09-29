import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

const ROOT = "/gunluk-operasyon";

export async function getDailyEmployees(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/employees`, params, options));
}

export async function createDailyEmployee(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/employees`, payload));
}

export async function updateDailyEmployee(id, payload = {}) {
  return unwrap(await apiPatch(`${ROOT}/employees/${encodeURIComponent(id)}`, payload));
}

export async function deleteDailyEmployee(id, payload = {}) {
  return unwrap(await apiDelete(`${ROOT}/employees/${encodeURIComponent(id)}`, payload));
}

export async function getDailyAttendance(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/attendance`, params, options));
}

export async function saveDailyAttendanceRange(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/save-range`, payload));
}

export async function getDailyWeeklySummary(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/attendance/weekly-summary`, params, options));
}

export async function getDailyPaymentSlips(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/attendance/payment-slips`, params, options));
}

export async function markDailyPaid(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/mark-paid`, payload));
}

export async function getDailyFocusedRecords(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/records`, params, options));
}

export async function saveDailyFocusedRecords(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/records`, payload));
}

export async function getDailyRoster(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/roster`, params, options));
}

export async function saveDailyRoster(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/roster`, payload));
}

export async function getDailyAudit(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/audit`, params, options));
}

export async function getDailyRevisions(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/revisions`, params, options));
}

export async function getDailyPeriodLock(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/period-lock`, params, options));
}

export async function setDailyPeriodLock(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/period-lock`, payload));
}
