import { apiGet, apiPatch, apiPost, apiPut } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getMainCompanies(params = {}) {
  return unwrap(await apiGet("/admin/main-companies", params));
}

export async function createMainCompany(payload = {}) {
  return unwrap(await apiPost("/admin/main-companies", payload));
}

export async function getSettings(params = {}) {
  return unwrap(await apiGet("/admin/settings", params));
}

export async function saveSetting(payload = {}) {
  return unwrap(await apiPost("/admin/settings", payload));
}

export async function getLogs(params = {}) {
  return unwrap(await apiGet("/admin/logs", params));
}

export async function createBackup(payload = {}) {
  return unwrap(await apiPost("/admin/backup", payload));
}

export async function listUsers() {
  return unwrap(await apiGet("/admin/users"));
}

export async function createUser(payload = {}) {
  const created = unwrap(await apiPost("/admin/users", payload));
  if (created?.id && Array.isArray(payload?.permissions)) {
    await updateUserPermissions(created.id, payload.permissions);
  }
  return created;
}

export async function updateUser(id, payload = {}) {
  return unwrap(await apiPatch(`/admin/users/${encodeURIComponent(id)}`, payload));
}

export async function resetUserPassword(id, password) {
  return unwrap(
    await apiPost(`/admin/users/${encodeURIComponent(id)}/reset-password`, { password }),
  );
}

export async function activateUser(id) {
  return unwrap(await apiPost(`/admin/users/${encodeURIComponent(id)}/activate`, {}));
}

export async function deactivateUser(id) {
  return unwrap(await apiPost(`/admin/users/${encodeURIComponent(id)}/deactivate`, {}));
}

export async function getUserPermissions(id) {
  return unwrap(await apiGet(`/admin/users/${encodeURIComponent(id)}/permissions`));
}

export async function updateUserPermissions(id, permissions) {
  return unwrap(
    await apiPut(`/admin/users/${encodeURIComponent(id)}/permissions`, { permissions }),
  );
}

export async function listActiveSessions() {
  return unwrap(await apiGet("/admin/security/sessions", { _ts: Date.now() }));
}

export async function revokeSession(id) {
  return unwrap(
    await apiPost(`/admin/security/sessions/${encodeURIComponent(id)}/revoke`, {}),
  );
}

export async function revokeAllUserSessions(id) {
  return unwrap(
    await apiPost(`/admin/security/users/${encodeURIComponent(id)}/revoke-all`, {}),
  );
}

export async function listLoginApprovals() {
  return unwrap(await apiGet("/admin/security/approvals", { _ts: Date.now() }));
}

export async function approveLogin(id) {
  return unwrap(
    await apiPost(`/admin/security/approvals/${encodeURIComponent(id)}/approve`, {}),
  );
}

export async function denyLogin(id) {
  return unwrap(
    await apiPost(`/admin/security/approvals/${encodeURIComponent(id)}/deny`, {}),
  );
}

export async function resetUserMfa(id) {
  return unwrap(
    await apiPost(`/admin/security/users/${encodeURIComponent(id)}/reset-mfa`, {}),
  );
}
