import { apiFetch, apiGet, apiPost, apiUpload } from "../utils/api";
import { installPdksOfflineRuntime, pdksCachedGet, pdksQueuedPost } from "./pdksOfflineStore";

installPdksOfflineRuntime();

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function validEmployeeId(value) {
  const id = String(value ?? "").trim();
  return id && id !== "0" ? id : "";
}

function isSgkPdksPerson(person) {
  return String(person?.sgkStatus ?? "VAR").trim().toLocaleUpperCase("tr-TR") !== "YOK";
}

const OPS = "/ik/personnel-control/operations";
const cacheKey = (name, params = {}) => `${name}:${JSON.stringify(params, Object.keys(params).sort())}`;

export async function getPdksProfile() {
  return unwrap(await pdksCachedGet("profile", "/ik/personnel-control/profile"));
}

export async function getPdksPeople(params = {}) {
  const payload = unwrap(await pdksCachedGet(cacheKey("people", params), "/ik/personnel-control/pdks-people", params));
  return Array.isArray(payload) ? payload.filter(isSgkPdksPerson) : payload;
}

// Modern attendance motoru: vardiya, hafta sonu, yarım gün tatil, izin günü,
// duplicate punch, tolerans ve mesai hesabını tek server cevabında döndürür.
export async function getPdksAttendance(employeeId, year, month, params = {}) {
  const request = { ...params, year, month };
  return unwrap(await pdksCachedGet(cacheKey(`attendance:${employeeId}`, request), `/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance-v2`, request));
}

export async function getPdksLegacyAttendance(employeeId, year, month) {
  const request = { year, month };
  return unwrap(await pdksCachedGet(cacheKey(`legacy-attendance:${employeeId}`, request), `/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, request));
}

export async function getPdksLiveDashboard(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("dashboard", params), "/ik/personnel-control/dashboard-live", params));
}

export async function getPdksModernConfig(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("modern-config", params), "/ik/personnel-control/modern/config", params));
}

export async function savePdksModernConfig(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/modern/config", payload));
}

export async function savePdksWorkGroupRules(groupId, payload = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/work-groups/${encodeURIComponent(groupId)}/rules`, payload));
}

export async function previewPdksLeaveV2(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/leaves/preview-v2", payload));
}

export async function savePdksLeaveV2(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/leaves/save-v2", payload));
}

export async function getPdksLeaveEntitlement(employeeId, params = {}) {
  const id = validEmployeeId(employeeId);
  if (!id) return null;
  return unwrap(await pdksCachedGet(cacheKey(`leave-entitlement:${employeeId}`, params), `/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params));
}

export async function savePdksCorrection(employeeId, payload = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/correction`, payload));
}

export async function getPdksCorrections(employeeId, params = {}) {
  return unwrap(await pdksCachedGet(cacheKey(`corrections:${employeeId}`, params), `/ik/personnel-control/people/${encodeURIComponent(employeeId)}/corrections`, params));
}

export async function getPdksPersonPhotoBlob(employeeId) {
  return apiFetch(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/photo`, { responseType: "blob" });
}

export async function getPdksPersonPhotoMeta(employeeId) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/photo-meta`));
}

export async function uploadPdksPersonPhoto(employeeId, file) {
  const form = new FormData();
  form.append("file", file);
  return unwrap(await apiUpload(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/photo`, form));
}

export async function addPdksTimeEvent(employeeId, payload = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/time-event`, payload));
}

export async function savePdksDayOverride(employeeId, payload = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/day-override`, payload));
}

export async function importPdksTimeEvents(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/time-events/import", payload));
}

export async function getPdksMasters(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("masters", params), "/ik/personnel-control/pdks-masters", params));
}

export async function savePdksWorkGroup(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/work-groups", payload));
}

export async function savePdksPersonnelGroup(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/personnel-groups", payload));
}

export async function assignPdksPersonnelGroup(employeeId, personnelGroupId, params = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/personnel-group`, { ...params, personnelGroupId }));
}
export async function assignPdksWorkGroup(employeeId, groupId, params = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/work-group`, { ...params, groupId }));
}

export async function savePdksService(payload = {}) {
  return unwrap(await pdksQueuedPost("/ik/personnel-control/services", payload));
}

export async function assignPdksService(employeeId, serviceId, params = {}) {
  return unwrap(await pdksQueuedPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/service`, { ...params, serviceId }));
}

// PDKS kritik iş verileri personnel-control altındaki D1 operasyon endpointlerinden çalışır.
export async function getPdksAdvancedMonth(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("advanced-month", params), `${OPS}/month`, params));
}

export async function getPdksPayroll(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("payroll", params), `${OPS}/payroll`, params));
}

export async function getPdksLeaveCenter(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("leave-center", params), `${OPS}/leaves`, params));
}

export async function getPdksAuditLogs(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("audit-logs", params), `${OPS}/audit-logs`, params));
}

export async function savePdksLeave(payload = {}) {
  return unwrap(await pdksQueuedPost(`${OPS}/leave`, payload));
}

export async function savePdksFinanceMovement(payload = {}) {
  return unwrap(await pdksQueuedPost(`${OPS}/advance`, payload));
}

export async function savePdksAdjustment(payload = {}) {
  return unwrap(await pdksQueuedPost(`${OPS}/adjustment`, payload));
}

export async function closePdksPeriod(payload = {}) {
  return unwrap(await pdksQueuedPost(`${OPS}/period-close`, payload));
}

export async function getPdksHolidays(params = {}) {
  return unwrap(await pdksCachedGet(cacheKey("holidays", params), `${OPS}/holidays`, params));
}

export async function savePdksHoliday(payload = {}) {
  return unwrap(await pdksQueuedPost(`${OPS}/holidays`, payload));
}
