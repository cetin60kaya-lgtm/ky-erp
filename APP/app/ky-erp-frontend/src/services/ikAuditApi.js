import { apiGet } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getAuditPeople() {
  return unwrap(await apiGet("/ik/audit/people", { _ts: Date.now() }));
}

export async function getAuditPerson(employeeId) {
  return unwrap(await apiGet(`/ik/audit/people/${encodeURIComponent(employeeId)}`, { _ts: Date.now() }));
}

export async function getAuditPdksMonth(params = {}) {
  return unwrap(await apiGet("/ik/audit/pdks/month", { ...params, _ts: Date.now() }));
}
