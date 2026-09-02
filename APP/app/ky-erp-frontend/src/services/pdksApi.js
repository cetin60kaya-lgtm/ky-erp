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

export async function getPdksPeople() {
  return unwrap(await apiGet("/ik/personnel-control/people"));
}

export async function getPdksAttendance(employeeId, year, month) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, { year, month }));
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

export async function assignPdksWorkGroup(employeeId, groupId) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/work-group`, { groupId }));
}

export async function savePdksService(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/services", payload));
}

export async function assignPdksService(employeeId, serviceId) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/service`, { serviceId }));
}

// PDKS kritik iş verileri personnel-control altında açık D1 operasyon endpointlerinden çalışır.
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
