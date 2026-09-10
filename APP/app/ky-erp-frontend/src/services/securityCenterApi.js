import { apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function getSecurityCenterOverview() { return unwrap(await apiGet("/security-center/overview", { _ts: Date.now() })); }
export async function listSecurityCenterSessions() { return unwrap(await apiGet("/security-center/sessions", { _ts: Date.now() })); }
export async function listSecurityCenterAudit(limit = 250) { return unwrap(await apiGet("/security-center/audit", { limit, _ts: Date.now() })); }
export async function listSecurityCenterLoginApprovals() { return unwrap(await apiGet("/security-center/login-approvals", { _ts: Date.now() })); }
export async function decideSecurityCenterLoginApproval(id, decision) {
  const normalized = String(decision || "").trim().toUpperCase();
  if (!['APPROVE', 'DENY'].includes(normalized)) throw new Error("Geçersiz giriş onayı kararı.");
  return unwrap(await apiPost(`/security-center/login-approvals/${encodeURIComponent(id)}/${normalized === "DENY" ? "deny" : "approve"}`, {}));
}
export async function getSecurityNotificationPreferences() { return unwrap(await apiGet("/security-center/notifications", { _ts: Date.now() })); }
export async function saveSecurityNotificationPreferences(payload = {}) { return unwrap(await apiPut("/security-center/notifications", payload)); }
export async function listSecurityGrantUsers() { return unwrap(await apiGet("/security-center/users", { _ts: Date.now() })); }
export async function listSecurityCapabilityGrants() { return unwrap(await apiGet("/security-center/grants", { _ts: Date.now() })); }
export async function startSecurityCenterAction(payload = {}) { return unwrap(await apiPost("/security-center/actions/start", payload)); }
export async function getSecurityCenterActionStatus(id, actionToken) { return unwrap(await apiPost(`/security-center/actions/${encodeURIComponent(id)}/status`, { actionToken })); }
export async function executeSecurityCenterAction(id, actionToken) { return unwrap(await apiPost(`/security-center/actions/${encodeURIComponent(id)}/execute`, { actionToken })); }

export async function runPhoneApprovedSecurityAction(payload = {}, options = {}) {
  const started = await startSecurityCenterAction(payload);
  const actionId = started?.actionId;
  const actionToken = started?.actionToken;
  if (!actionId || !actionToken) throw new Error("KY Güvenlik onayı başlatılamadı.");
  const timeoutMs = Math.max(30_000, Number(options.timeoutMs || 10 * 60_000));
  const intervalMs = Math.max(1_000, Number(options.intervalMs || 2_000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const status = await getSecurityCenterActionStatus(actionId, actionToken);
    const value = String(status?.status || "").toUpperCase();
    if (value === "APPROVED") return executeSecurityCenterAction(actionId, actionToken);
    if (["DENIED", "REJECTED"].includes(value)) throw new Error("KY Güvenlik telefonunda işlem reddedildi.");
    if (value === "EXPIRED") throw new Error("KY Güvenlik onayının süresi doldu.");
    if (["FAILED", "FAILED_REVIEW_REQUIRED"].includes(value)) throw new Error("KY Güvenlik işlemi güvenli inceleme gerektiriyor.");
  }
  throw new Error("KY Güvenlik telefon onayı tamamlanmadı.");
}
