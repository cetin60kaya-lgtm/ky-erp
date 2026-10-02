import { apiGet, apiPost } from "../../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

const IK_MUTATION_CHANNEL = "kyerp.ik.monthly.live.v1";
const freshOptions = (options = {}) => ({ ...options, forceFresh: options.forceFresh !== false });

function publishIkMutation(type = "mutation") {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return;
  try {
    const channel = new window.BroadcastChannel(IK_MUTATION_CHANNEL);
    channel.postMessage({ type, at: Date.now() });
    channel.close();
  } catch {
    // D1 sync-state is authoritative; this only accelerates local-tab refresh.
  }
}

async function postAndPublish(path, payload, type) {
  const result = unwrap(await apiPost(path, payload));
  publishIkMutation(type);
  return result;
}

function validEmployeeId(value) {
  const id = String(value ?? "").trim();
  return id && id !== "0" ? id : "";
}

export async function getIkControlProfile() {
  return unwrap(await apiGet("/ik/personnel-control/profile", {}, freshOptions()));
}

export async function getIkControlPeople(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/people", params, freshOptions()));
}

export async function getIkControlPerson(employeeId) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}`, {}, freshOptions()));
}

export async function getIkControlLeaveEntitlement(employeeId, params = {}) {
  const id = validEmployeeId(employeeId);
  if (!id) return null;
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params, freshOptions()));
}

export async function createIkControlPerson(payload = {}) {
  return postAndPublish("/ik/personnel-control/people", payload, "person-create");
}

export async function saveIkControlChanges(employeeId, payload = {}) {
  return postAndPublish(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/change`, payload, "person-change");
}

export async function removeIkControlPerson(employeeId, payload = {}) {
  return postAndPublish(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/remove`, payload, "person-remove");
}

export async function getIkAttendanceMonth(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/attendance`, params));
}

export async function addIkTimeEvent(employeeId, payload = {}) {
  return postAndPublish(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/time-event`, payload, "time-event");
}

export async function saveIkDayOverride(employeeId, payload = {}) {
  return postAndPublish(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/day-override`, payload, "day-override");
}

export async function importIkTimeEvents(payload = {}) {
  return postAndPublish("/ik/personnel-control/time-events/import", payload, "time-import");
}

export async function buildIkCardExport(payload = {}) {
  return postAndPublish("/ik/personnel-control/card-export", payload, "card-export");
}

export async function saveIkUserScope(payload = {}) {
  return postAndPublish("/ik/personnel-control/user-scope", payload, "scope-change");
}
