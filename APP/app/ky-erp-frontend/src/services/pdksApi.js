import { apiFetch, apiGet, apiPost, apiUpload } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

const OPS = "/ik/personnel-control/operations";

export async function getPdksProfile() {
  return unwrap(await apiGet("/ik/personnel-control/profile"));
}

export async function getPdksPeople(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/people", params));
}

// Modern attendance motoru: vardiya, Cumartesi/Pazar, yarÄ±m gÃ¼n tatil, izin gÃ¼nÃ¼,
// duplicate punch, tolerans ve mesai hesabÄ±nÄ± tek server cevabÄ±nda dÃ¶ndÃ¼rÃ¼r.
export async function getPdksAttendance(employeeId, year, month, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance-v2`, { ...params, year, month }));
}

export async function getPdksLegacyAttendance(employeeId, year, month) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, { year, month }));
}

export async function getPdksLiveDashboard(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/dashboard-live", params));
}

export async function getPdksModernConfig(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/modern/config", params));
}

export async function savePdksModernConfig(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/modern/config", payload));
}

export async function savePdksWorkGroupRules(groupId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/work-groups/${encodeURIComponent(groupId)}/rules`, payload));
}

export async function previewPdksLeaveV2(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/leaves/preview-v2", payload));
}

export async function savePdksLeaveV2(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/leaves/save-v2", payload));
}

export async function getPdksLeaveEntitlement(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params));
}

export async function savePdksCorrection(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/correction`, payload));
}

export async function getPdksCorrections(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/corrections`, params));
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
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/time-event`, payload));
}

export async function savePdksDayOverride(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/day-override`, payload));
}

export async function importPdksTimeEvents(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/time-events/import", payload));
}

export async function getPdksMasters(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/pdks-masters", params));
}

export async function savePdksWorkGroup(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/work-groups", payload));
}

export async function savePdksPersonnelGroup(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/personnel-groups", payload));
}

export async function assignPdksPersonnelGroup(employeeId, personnelGroupId, params = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/personnel-group`, { ...params, personnelGroupId }));
}
export async function assignPdksWorkGroup(employeeId, groupId, params = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/work-group`, { ...params, groupId }));
}

export async function savePdksService(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/services", payload));
}

export async function assignPdksService(employeeId, serviceId, params = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/service`, { ...params, serviceId }));
}

// PDKS kritik iÅŸ verileri personnel-control altÄ±nda aÃ§Ä±k D1 operasyon endpointlerinden Ã§alÄ±ÅŸÄ±r.
export async function getPdksAdvancedMonth(params = {}) {
  return unwrap(await apiGet(`${OPS}/month`, params));
}

export async function getPdksPayroll(params = {}) {
  return unwrap(await apiGet(`${OPS}/payroll`, params));
}

export async function getPdksLeaveCenter(params = {}) {
  return unwrap(await apiGet(`${OPS}/leaves`, params));
}

export async function getPdksAuditLogs(params = {}) {
  return unwrap(await apiGet(`${OPS}/audit-logs`, params));
}

export async function savePdksLeave(payload = {}) {
  return unwrap(await apiPost(`${OPS}/leave`, payload));
}

export async function savePdksFinanceMovement(payload = {}) {
  return unwrap(await apiPost(`${OPS}/advance`, payload));
}

export async function savePdksAdjustment(payload = {}) {
  return unwrap(await apiPost(`${OPS}/adjustment`, payload));
}

export async function closePdksPeriod(payload = {}) {
  return unwrap(await apiPost(`${OPS}/period-close`, payload));
}

export async function getPdksHolidays(params = {}) {
  return unwrap(await apiGet(`${OPS}/holidays`, params));
}

export async function savePdksHoliday(payload = {}) {
  return unwrap(await apiPost(`${OPS}/holidays`, payload));
}
