import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getIkControlProfile() {
  return unwrap(await apiGet("/ik/personnel-control/profile"));
}

export async function getIkControlPeople(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/people", params));
}

export async function getIkControlPerson(employeeId) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}`));
}

export async function getIkControlLeaveEntitlement(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params));
}

export async function createIkControlPerson(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/people", payload));
}

export async function saveIkControlChanges(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/change`, payload));
}

export async function removeIkControlPerson(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/remove`, payload));
}

export async function getIkAttendanceMonth(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, params));
}

export async function addIkTimeEvent(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/time-event`, payload));
}

export async function saveIkDayOverride(employeeId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/day-override`, payload));
}

export async function importIkTimeEvents(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/time-events/import", payload));
}

export async function buildIkCardExport(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/card-export", payload));
}

export async function saveIkUserScope(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/user-scope", payload));
}
