import { apiGet, apiPatch, apiPost } from "../utils/api";

const unwrap = (payload) => payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;

export async function listPdksDevices(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/devices", { ...params, _ts: Date.now() }));
}

export async function listPdksDeviceSyncLogs(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/device-sync-logs", { ...params, _ts: Date.now() }));
}

export async function enrollPdksDevice(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/device/enroll", payload));
}

export async function setPdksDeviceActive(id, active) {
  return unwrap(await apiPatch(`/ik/personnel-control/devices/${encodeURIComponent(id)}`, { active }));
}

export async function listPdksCardMappings(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/card-mappings", { ...params, _ts: Date.now() }));
}

export async function savePdksCardMapping(employeeId, cardNo, params = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/card-mappings/${encodeURIComponent(employeeId)}`, { ...params, cardNo }));
}

export async function applyInitialPdksCardMappings(params = {}) {
  return unwrap(await apiPost("/ik/personnel-control/card-mappings/apply-initial", params));
}
