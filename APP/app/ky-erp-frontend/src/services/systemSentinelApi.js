import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getSystemSentinelAccess() {
  return unwrap(await apiGet("/system-sentinel/access", { _ts: Date.now() }, { timeoutMs: 10000 }));
}

export async function getSystemSentinelOverview() {
  return unwrap(await apiGet("/system-sentinel/overview", { _ts: Date.now() }, { timeoutMs: 15000 }));
}

export async function enrollSystemSentinelDevice(payload) {
  return unwrap(await apiPost("/system-sentinel/devices", payload));
}

export async function updateSystemSentinelDevice(deviceId, payload) {
  return unwrap(await apiPatch(`/system-sentinel/devices/${encodeURIComponent(deviceId)}`, payload));
}

export async function rotateSystemSentinelDeviceToken(deviceId) {
  return unwrap(await apiPost(`/system-sentinel/devices/${encodeURIComponent(deviceId)}/rotate-token`, {}));
}

export async function runSystemSentinelAction(deviceId, action, extra = {}) {
  return unwrap(await apiPost(`/system-sentinel/devices/${encodeURIComponent(deviceId)}/actions`, { action, ...extra }));
}

export async function closeSystemSentinelSession(sessionId, deviceId) {
  return unwrap(await apiPost(`/system-sentinel/sessions/${encodeURIComponent(sessionId)}/close`, { deviceId }));
}

export async function listSystemSentinelGrants() {
  return unwrap(await apiGet("/system-sentinel/grants", { _ts: Date.now() }));
}

export async function createSystemSentinelGrant(payload) {
  return unwrap(await apiPost("/system-sentinel/grants", payload));
}

export async function revokeSystemSentinelGrant(grantId) {
  return unwrap(await apiDelete(`/system-sentinel/grants/${encodeURIComponent(grantId)}`));
}

export async function listSystemSentinelUsers() {
  return unwrap(await apiGet("/admin/managed-users", { _ts: Date.now() }));
}
