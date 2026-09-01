import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getPdksProfile() {
  return unwrap(await apiGet("/ik/personnel-control/profile"));
}

export async function getPdksPeople() {
  return unwrap(await apiGet("/ik/personnel-control/people"));
}

export async function getPdksAttendance(employeeId, year, month) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, { year, month }));
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

export async function getPdksAdvancedMonth(params = {}) {
  return unwrap(await apiGet("/ik/advanced/month", params));
}

export async function getPdksPayroll(params = {}) {
  return unwrap(await apiGet("/ik/advanced/payroll", params));
}

export async function getPdksLeaveCenter(params = {}) {
  return unwrap(await apiGet("/ik/advanced/leave-center", params));
}

export async function getPdksAuditLogs(params = {}) {
  return unwrap(await apiGet("/ik/advanced/audit-logs", params));
}

export async function savePdksLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave", payload));
}

export async function savePdksFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement", payload));
}

export async function closePdksPeriod(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/close-check", payload));
}

export async function getPdksHolidays(params = {}) {
  return unwrap(await apiGet("/ik/official-holidays", params));
}

export async function savePdksHoliday(payload = {}) {
  return unwrap(await apiPost("/ik/official-holidays", payload));
}