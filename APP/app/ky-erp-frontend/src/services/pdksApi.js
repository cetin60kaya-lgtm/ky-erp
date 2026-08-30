import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getPdksProfile() {
  return unwrap(await apiGet("/ik/personnel-control/profile"));
}

export async function getPdksPeople(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/people", params));
}

export async function getPdksAttendance(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, params));
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

export async function buildPdksCardExport(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/card-export", payload));
}
