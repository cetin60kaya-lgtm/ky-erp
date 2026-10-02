import { apiDelete, apiGet, apiPatch, apiPost, apiUpload, downloadFile } from "../utils/api";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

const ROOT = "/gunluk-operasyon";
const DAILY_MUTATION_CHANNEL = "kyerp.dailyOperations.live.v1";
function publishDailyMutation(type = "mutation") {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return;
  try {
    const channel = new window.BroadcastChannel(DAILY_MUTATION_CHANNEL);
    channel.postMessage({ type, at: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel is an acceleration layer; D1 sync-state remains authoritative.
  }
}
const freshOptions = (options = {}) => ({ ...options, forceFresh: options.forceFresh !== false });

export async function getDailySyncState(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/sync-state`, params, freshOptions(options)));
}

export async function getDailyEmployees(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/employees`, params, freshOptions(options)));
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
  return unwrap(await apiGet(`${ROOT}/attendance`, params, freshOptions(options)));
}

export async function saveDailyAttendanceRange(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/save-range`, payload));
}

export async function getDailyWeeklySummary(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/attendance/weekly-summary`, params, freshOptions(options)));
}

export async function getDailyPaymentSlips(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/attendance/payment-slips`, params, freshOptions(options)));
}

export async function markDailyPaid(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/attendance/mark-paid`, payload));
}

export async function getDailyPaymentPool(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/payments/pool`, params, freshOptions(options)));
}

export async function getDailyPaymentHistory(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/payments/history`, params, freshOptions(options)));
}

export async function createDailyPayment(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/payments`, payload));
}

export async function cancelDailyPayment(paymentId, payload = {}) {
  return unwrap(await apiPost(`${ROOT}/payments/${encodeURIComponent(paymentId)}/cancel`, payload));
}

export async function getDailyFocusedRecords(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/records`, params, freshOptions(options)));
}

export async function saveDailyFocusedRecords(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/records`, payload));
}

export async function getDailyRoster(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/roster`, params, freshOptions(options)));
}

export async function saveDailyRoster(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/roster`, payload));
}

export async function getDailyAudit(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/audit`, params, freshOptions(options)));
}

export async function getDailyRevisions(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/revisions`, params, freshOptions(options)));
}

export async function getDailyPeriodLock(params = {}, options = {}) {
  return unwrap(await apiGet(`${ROOT}/period-lock`, params, freshOptions(options)));
}

export async function setDailyPeriodLock(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/period-lock`, payload));
}

export function downloadDailyExcel(params = {}) {
  const start = String(params.startDate || params.start || "").replace(/-/g, "");
  const end = String(params.endDate || params.end || start).replace(/-/g, "");
  return downloadFile(`${ROOT}/excel`, params, `KYERP_Gunluk_Personel_${start}_${end}.xlsx`);
}

export async function previewDailyExcel(file, payload = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
  });
  return unwrap(await apiUpload(`${ROOT}/excel-upload`, form));
}

export async function applyDailyExcel(payload = {}) {
  return unwrap(await apiPost(`${ROOT}/excel-apply`, payload));
}
