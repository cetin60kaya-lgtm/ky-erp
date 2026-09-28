import { apiGet, apiPatch, apiPost } from "../utils/api";

const unwrap = (payload) => payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;

export async function listPdksDevices(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/devices", { ...params, _ts: Date.now() }));
}

export async function listPdksDeviceSyncLogs(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/device-sync-logs", { ...params, _ts: Date.now() }));
}

export async function listPdksDeviceJobs(params = {}) {
  return unwrap(await apiGet("/ik/personnel-control/device-jobs", { ...params, _ts: Date.now() }));
}

export async function requestPdksTerminalSync(deviceId, payload = {}) {
  return unwrap(await apiPost(`/ik/personnel-control/devices/${encodeURIComponent(deviceId)}/jobs`, { command: "SYNC_TERMINAL", payload }));
}

export async function enrollPdksDevice(payload = {}) {
  return unwrap(await apiPost("/ik/personnel-control/device/enroll", payload));
}

export async function setPdksDeviceActive(id, active) {
  return unwrap(await apiPatch(`/ik/personnel-control/devices/${encodeURIComponent(id)}`, { active }));
}
