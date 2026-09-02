import { apiGet, apiPatch, apiPost, apiPut, downloadFile } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function canonicalRole(value) {
  return String(value || "").trim().toUpperCase().replace(/İ/g, "I");
}

function withoutApplicationOwner(value) {
  const keep = (row) => !["SUPER_ADMIN", "ADMIN"].includes(canonicalRole(row?.role || row?.roleOverride || row?.role_override));
  if (Array.isArray(value)) return value.filter(keep);
  if (Array.isArray(value?.items)) return { ...value, items: value.items.filter(keep) };
  return value;
}

export async function getMainCompanies(params = {}) { return unwrap(await apiGet("/admin/main-companies", params)); }
export async function createMainCompany(payload = {}) { return unwrap(await apiPost("/admin/main-companies", payload)); }
export async function getSettings(params = {}) { return unwrap(await apiGet("/admin/settings", params)); }
export async function saveSetting(payload = {}) { return unwrap(await apiPost("/admin/settings", payload)); }
export async function getLogs(params = {}) { return unwrap(await apiGet("/admin/logs", params)); }
export async function createBackup(payload = {}) { return unwrap(await apiPost("/admin/backup", payload)); }
export async function listBackups(params = {}) { return unwrap(await apiGet("/admin/backups", params)); }
export async function getBackup(id) { return unwrap(await apiGet(`/admin/backups/${encodeURIComponent(id)}`, { _ts: Date.now() })); }
export async function restoreBackup(id, payload = {}) { return unwrap(await apiPost(`/admin/backups/${encodeURIComponent(id)}/restore`, payload)); }
export async function generateBackupSql(id, payload = {}) { return unwrap(await apiPost(`/admin/backups/${encodeURIComponent(id)}/sql`, payload, { timeoutMs: 120000 })); }
export async function downloadBackupSql(id, fileName = "KYERP-firma-yedek.sql") { return downloadFile(`/admin/backups/${encodeURIComponent(id)}/sql/download`, undefined, fileName); }

// Normal Kullanıcılar ekranı uygulama sahibini bilinçli olarak içermez.
export async function listUsers() { return withoutApplicationOwner(unwrap(await apiGet("/admin/managed-users", { _ts: Date.now() }))); }
export async function getApplicationOwner() { return unwrap(await apiGet("/admin/security/application-owner", { _ts: Date.now() })); }

export async function createUser(payload = {}) {
  const created = unwrap(await apiPost("/admin/users", payload));
  if (created?.id && Array.isArray(payload?.permissions)) await updateUserPermissions(created.id, payload.permissions);
  return created;
}
export async function createUserComplete(payload = {}) { return unwrap(await apiPost("/admin/users/create-complete", payload)); }
export async function updateUser(id, payload = {}) { return unwrap(await apiPatch(`/admin/users/${encodeURIComponent(id)}`, payload)); }
export async function resetUserPassword(id, password) { return unwrap(await apiPost(`/admin/users/${encodeURIComponent(id)}/reset-password`, { password })); }
export async function activateUser(id) { return unwrap(await apiPost(`/admin/users/${encodeURIComponent(id)}/activate`, {})); }
export async function deactivateUser(id) { return unwrap(await apiPost(`/admin/users/${encodeURIComponent(id)}/deactivate`, {})); }
export async function getUserPermissions(id) { return unwrap(await apiGet(`/admin/users/${encodeURIComponent(id)}/permissions`)); }
export async function updateUserPermissions(id, permissions) { return unwrap(await apiPut(`/admin/users/${encodeURIComponent(id)}/permissions`, { permissions })); }

export async function listActiveSessions() { return unwrap(await apiGet("/admin/security/sessions", { _ts: Date.now() })); }
export async function listSessionHistory(limit = 250) { return unwrap(await apiGet("/admin/security/session-history", { limit, _ts: Date.now() })); }
export async function listSecurityAuditLog(limit = 250) { return unwrap(await apiGet("/admin/security/audit-log", { limit, _ts: Date.now() })); }
export async function revokeSession(id) { return unwrap(await apiPost(`/admin/security/sessions/${encodeURIComponent(id)}/revoke`, {})); }
export async function revokeAllUserSessions(id) { return unwrap(await apiPost(`/admin/security/users/${encodeURIComponent(id)}/revoke-all`, {})); }
export async function listLoginApprovals() { return unwrap(await apiGet("/admin/security/approvals", { _ts: Date.now() })); }
export async function approveLogin(id) { return unwrap(await apiPost(`/admin/security/approvals/${encodeURIComponent(id)}/approve`, {})); }
export async function denyLogin(id) { return unwrap(await apiPost(`/admin/security/approvals/${encodeURIComponent(id)}/deny`, {})); }

// Legacy direct reset is intentionally unavailable. The backend also rejects it.
export async function resetUserMfa() {
  throw new Error("Doğrudan Authenticator sıfırlama kapalıdır. Yenileme için Uygulama Sahibi güvenlik ekranındaki şifre/e-posta doğrulama akışını kullanın.");
}

export async function reauthOwnerWithPassword(payload = {}) { return unwrap(await apiPost("/admin/security/reauth/password", payload)); }
export async function startOwnerEmailReauth(payload = {}) { return unwrap(await apiPost("/admin/security/reauth/email/start", payload)); }
export async function verifyOwnerEmailReauth(payload = {}) { return unwrap(await apiPost("/admin/security/reauth/email/verify", payload)); }
export async function startSecureMfaRenewal(id, provider, payload = {}) {
  return unwrap(await apiPost(`/admin/security/users/${encodeURIComponent(id)}/mfa-renew/${encodeURIComponent(String(provider || "").toLowerCase())}/start`, payload));
}
export async function confirmSecureMfaRenewal(id, provider, payload = {}) {
  return unwrap(await apiPost(`/admin/security/users/${encodeURIComponent(id)}/mfa-renew/${encodeURIComponent(String(provider || "").toLowerCase())}/confirm`, payload));
}

export async function listLoginSecurityPolicies() { return unwrap(await apiGet("/admin/security/policies", { _ts: Date.now() })); }
export async function updateLoginSecurityPolicy(id, payload = {}) { return unwrap(await apiPatch(`/admin/security/users/${encodeURIComponent(id)}/policy`, payload)); }
export async function getOwnerRecoveryConfig() { return unwrap(await apiGet("/admin/security/owner-recovery", { _ts: Date.now() })); }
export async function saveOwnerRecoveryQuestions(payload = {}) { return unwrap(await apiPut("/admin/security/owner-recovery/questions", payload)); }
export async function startOwnerRecoveryContactVerification(payload = {}) { return unwrap(await apiPost("/admin/security/owner-recovery/contact/start", payload)); }
export async function verifyOwnerRecoveryContact(payload = {}) { return unwrap(await apiPost("/admin/security/owner-recovery/contact/verify", payload)); }

export async function getDeliveryCapabilities() { return unwrap(await apiGet("/admin/security/delivery-capabilities", { _ts: Date.now() })); }
export async function startUserEmailVerification(id) { return unwrap(await apiPost(`/admin/security/users/${encodeURIComponent(id)}/email-verification/start`, {})); }
export async function verifyUserEmail(id, payload = {}) { return unwrap(await apiPost(`/admin/security/users/${encodeURIComponent(id)}/email-verification/verify`, payload)); }
export async function getUserEmailDeliveryStatus(id, messageId) {
  return unwrap(await apiGet(`/admin/security/users/${encodeURIComponent(id)}/email-verification/delivery/${encodeURIComponent(messageId)}`, { _ts: Date.now() }));
}
