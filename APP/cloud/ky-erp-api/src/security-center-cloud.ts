// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const GRANT_SCOPE = "AUTH_SECURITY_CAPABILITY_GRANT";
const PREF_SCOPE = "AUTH_SECURITY_NOTIFICATION_PREF";
const TRUST_SCOPE = "AUTH_SESSION_TRUST";
const ACTION_SCOPE = "AUTH_SECURITY_ACTION";
const DEVICE_SCOPE = "AUTH_PUSH_DEVICE";
const ACTION_SECONDS = 10 * 60;
const VAPID_SECRET_KEY = "VAPID_P256_KEYPAIR_V1";
const VAPID_SUBJECT = "mailto:admin@kyerp.net";
const CAPABILITIES = new Set(["LOGIN_APPROVE", "SESSION_VIEW", "SESSION_APPROVE", "SESSION_CLOSE", "AUDIT_VIEW"]);
const CRITICAL_OPERATIONS = new Set([
  "SESSION_TRUST_APPROVE",
  "SESSION_TRUST_REJECT",
  "SESSION_CLOSE",
  "SESSION_SUSPICIOUS",
  "SECURITY_CAPABILITY_SET",
  "SUPER_ADMIN_GRANT",
  "SUPER_ADMIN_REVOKE",
  "ONLY_ME",
]);

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
function userAgent(c: any) { return text(c.req.header("User-Agent")).slice(0, 300); }
function jsonError(code: string, message: string, details?: unknown) { return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }; }
function isSuper(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function isCompanyAdmin(role: unknown) { return upper(role) === "COMPANY_ADMIN"; }
function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
async function bodyOf(c: any) { try { const body = await c.req.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {}; } catch { return {}; } }
function base64Url(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function encodeJson(value: unknown) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function randomToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return base64Url(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function safeEqual(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }

async function tableExists(c: any, tableName: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(tableName).first<AnyRow>();
  return Boolean(row?.name);
}
async function requireStorage(c: any) {
  for (const tableName of ["json_store", "auth_users", "auth_user_security", "auth_sessions", "auth_security_audit"]) if (!(await tableExists(c, tableName))) return false;
  return true;
}
async function storeGet(c: any, scope: string, fileName: string) {
  const row = await c.env.DB.prepare(`SELECT id,main_company_slug,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC,id DESC LIMIT 1`).bind(scope, fileName).first<AnyRow>();
  if (!row) return null;
  const data = objectOf(row.data);
  return { ...data, storeId: text(row.id), fileName: text(row.file_name), mainCompanySlug: text(data.mainCompanySlug || row.main_company_slug), createdAt: text(data.createdAt || row.created_at), updatedAt: text(data.updatedAt || row.updated_at) };
}
async function storeList(c: any, scope: string, companySlug = "") {
  const result = companySlug
    ? await c.env.DB.prepare(`SELECT id,main_company_slug,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC,id DESC`).bind(scope, companySlug).all<AnyRow>()
    : await c.env.DB.prepare(`SELECT id,main_company_slug,file_name,data,created_at,updated_at FROM json_store WHERE scope=? ORDER BY updated_at DESC,id DESC`).bind(scope).all<AnyRow>();
  return (result.results || []).map((row: AnyRow) => { const data = objectOf(row.data); return { ...data, storeId: text(row.id), fileName: text(row.file_name), mainCompanySlug: text(data.mainCompanySlug || row.main_company_slug), createdAt: text(data.createdAt || row.created_at), updatedAt: text(data.updatedAt || row.updated_at) }; });
}
async function storePut(c: any, scope: string, fileName: string, companySlug: string, data: AnyRow) {
  const current = await storeGet(c, scope, fileName);
  const timestamp = nowIso();
  const payload = { ...data, id: text(data.id || fileName), mainCompanySlug: text(data.mainCompanySlug || companySlug), createdAt: text(data.createdAt || current?.createdAt || timestamp), updatedAt: timestamp };
  if (current?.storeId) {
    await c.env.DB.prepare("UPDATE json_store SET main_company_slug=?,data=?,updated_at=? WHERE id=? AND scope=?").bind(companySlug || null, JSON.stringify(payload), timestamp, current.storeId, scope).run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id, scope, companySlug || null, fileName, JSON.stringify(payload), timestamp, timestamp).run();
  return { ...payload, storeId: id, fileName };
}
async function audit(c: any, action: string, current: AnyRow, targetUserId = "", companySlug = "", sessionId = "", detail: AnyRow = {}) {
  try {
    await c.env.DB.prepare(`INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), text(current?.id) || null, targetUserId || null, companySlug || text(current?.mainCompanySlug) || null, action, sessionId || null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso(),
    ).run();
  } catch {}
}
async function currentAuth(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current) return { error: c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401) };
  return { current };
}
async function userById(c: any, id: string) {
  return c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.role,u.platform_role,u.is_active,u.created_at,s.role_override,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`).bind(id).first<AnyRow>();
}
function effectiveRole(row: AnyRow) { const role = upper(row?.role_override || row?.role || "VIEWER"); return role === "ADMIN" ? "SUPER_ADMIN" : role; }
async function canonicalOwner(c: any) {
  return c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.role,u.platform_role,u.created_at,s.role_override,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.is_active=1 AND (UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN') ORDER BY u.created_at ASC,u.id ASC LIMIT 1`).first<AnyRow>();
}
function sanitizeCapabilities(value: unknown) { return [...new Set((Array.isArray(value) ? value : []).map(upper).filter((item) => CAPABILITIES.has(item)))]; }
async function grantFor(c: any, userId: string, companySlug: string) { const row = await storeGet(c, GRANT_SCOPE, `${companySlug}:${userId}`); if (!row || row.isActive === false) return null; return row; }
async function scopeFor(c: any, current: AnyRow) {
  const companySlug = text(current.mainCompanySlug || current.main_company_slug);
  if (isSuper(current.role)) return { type: "SYSTEM", companySlug, capabilities: [...CAPABILITIES], delegated: false };
  if (isCompanyAdmin(current.role)) return { type: "COMPANY", companySlug, capabilities: [...CAPABILITIES], delegated: false };
  const grant = companySlug ? await grantFor(c, text(current.id), companySlug) : null;
  const capabilities = sanitizeCapabilities(grant?.capabilities);
  return { type: capabilities.length ? "COMPANY" : "SELF", companySlug, capabilities, delegated: capabilities.length > 0 };
}
function hasCap(scope: AnyRow, capability: string) { return scope.type === "SYSTEM" || scope.capabilities?.includes(capability); }
async function scopedSession(c: any, current: AnyRow, scope: AnyRow, sessionId: string) {
  const row = await c.env.DB.prepare(`SELECT s.*,u.username,u.full_name,u.role,us.role_override,us.main_company_slug AS user_company_slug FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.id=? LIMIT 1`).bind(sessionId).first<AnyRow>();
  if (!row) return null;
  if (scope.type === "SYSTEM") return row;
  if (scope.type === "COMPANY" && text(row.main_company_slug) === text(scope.companySlug)) return row;
  return text(row.user_id) === text(current.id) ? row : null;
}

async function activeSecurityDevices(c: any, userId: string) {
  const rows = await storeList(c, DEVICE_SCOPE);
  return rows.filter((row: AnyRow) => text(row.userId) === userId && row.securityApp === true && !(row.isActive === false && Boolean(text(row.retiredAt) || text(row.retiredReason))));
}
async function ensureVapidKeyPair(c: any) {
  let row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1").bind(VAPID_SECRET_KEY).first<AnyRow>();
  if (row?.secret_value) { try { const parsed = JSON.parse(text(row.secret_value)); if (parsed?.privateJwk && parsed?.publicKey) return parsed; } catch {} }
  const generated = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", generated.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", generated.publicKey));
  const pair = { privateJwk, publicKey: base64Url(publicRaw), createdAt: nowIso() };
  const timestamp = nowIso();
  await c.env.DB.prepare("INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at) VALUES (?,?,?,?)").bind(VAPID_SECRET_KEY, JSON.stringify(pair), timestamp, timestamp).run();
  row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1").bind(VAPID_SECRET_KEY).first<AnyRow>();
  return JSON.parse(text(row?.secret_value) || "{}");
}
async function sendWake(c: any, device: AnyRow) {
  const endpoint = text(device.pushEndpoint); if (!endpoint) return false;
  try {
    const pair = await ensureVapidKeyPair(c); if (!pair?.privateJwk || !pair?.publicKey) return false;
    const audience = new URL(endpoint).origin;
    const header = encodeJson({ typ: "JWT", alg: "ES256" });
    const payload = encodeJson({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: VAPID_SUBJECT });
    const input = `${header}.${payload}`;
    const key = await crypto.subtle.importKey("jwk", pair.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
    const response = await fetch(endpoint, { method: "POST", headers: { TTL: "60", Urgency: "high", Authorization: `vapid t=${input}.${base64Url(signature)}, k=${pair.publicKey}` } });
    return response.ok;
  } catch { return false; }
}
async function notifyDevices(c: any, userId: string) { let sent = 0; for (const device of await activeSecurityDevices(c, userId)) if (await sendWake(c, device)) sent += 1; return sent; }

async function actionFromToken(c: any, id: string, token: string) {
  const row = await storeGet(c, ACTION_SCOPE, id);
  if (!row || !token || !safeEqual(text(row.actionTokenHash), await sha256(token))) return null;
  return row;
}
async function claimAction(c: any, action: AnyRow) {
  if (!action?.storeId) return false;
  const timestamp = nowIso();
  const next = { ...action, status: "PROCESSING", claimedAt: timestamp, updatedAt: timestamp }; delete next.storeId; delete next.fileName;
  const result = await c.env.DB.prepare(`UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND UPPER(COALESCE(json_extract(data,'$.status'),''))='APPROVED' AND COALESCE(json_extract(data,'$.consumedAt'),'')=''`).bind(JSON.stringify(next), timestamp, action.storeId, ACTION_SCOPE).run();
  return Number(result?.meta?.changes || 0) > 0;
}
async function finishAction(c: any, action: AnyRow, status = "APPROVED") {
  const current = await storeGet(c, ACTION_SCOPE, text(action.id)); if (!current?.storeId) return;
  const timestamp = nowIso(); const next = { ...current, status, claimedAt: "", consumedAt: timestamp, updatedAt: timestamp }; delete next.storeId; delete next.fileName;
  await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=?").bind(JSON.stringify(next), timestamp, current.storeId, ACTION_SCOPE).run();
}
async function restoreAction(c: any, action: AnyRow) {
  const current = await storeGet(c, ACTION_SCOPE, text(action.id)); if (!current?.storeId) return;
  const timestamp = nowIso(); const next = { ...current, status: "APPROVED", claimedAt: "", updatedAt: timestamp }; delete next.storeId; delete next.fileName;
  await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=?").bind(JSON.stringify(next), timestamp, current.storeId, ACTION_SCOPE).run();
}

function actionTitle(operation: string) {
  return ({ SESSION_TRUST_APPROVE: "Yeni oturumu güvenilir yap", SESSION_TRUST_REJECT: "Yeni oturumu reddet", SESSION_CLOSE: "Oturumu kapat", SESSION_SUSPICIOUS: "Şüpheli oturumu kapat", SECURITY_CAPABILITY_SET: "Güvenlik yetkilerini değiştir", SUPER_ADMIN_GRANT: "Süper Yönetici ekle", SUPER_ADMIN_REVOKE: "Süper Yönetici yetkisini kaldır", ONLY_ME: "Sadece Ben Kalayım" } as AnyRow)[operation] || "Kritik güvenlik işlemi";
}

async function authorizeOperation(c: any, current: AnyRow, scope: AnyRow, operation: string, payload: AnyRow) {
  if (!CRITICAL_OPERATIONS.has(operation)) return { error: jsonError("SECURITY_OPERATION_UNSUPPORTED", "Bu güvenlik işlemi desteklenmiyor."), status: 400 };
  const owner = await canonicalOwner(c);
  if (["SUPER_ADMIN_GRANT", "SUPER_ADMIN_REVOKE", "ONLY_ME"].includes(operation)) {
    if (!owner || text(owner.id) !== text(current.id) || !isSuper(current.role)) return { error: jsonError("OWNER_ONLY", "Bu işlem yalnız asıl Süper Yönetici tarafından başlatılabilir."), status: 403 };
  }
  if (operation === "SECURITY_CAPABILITY_SET") {
    const companySlug = text(payload.companySlug || scope.companySlug); const target = await userById(c, text(payload.targetUserId));
    if (!target || !target.is_active) return { error: jsonError("TARGET_USER_NOT_FOUND", "Yetki verilecek aktif kullanıcı bulunamadı."), status: 404 };
    if (scope.type !== "SYSTEM" && !(isCompanyAdmin(current.role) && companySlug === text(scope.companySlug))) return { error: jsonError("FORBIDDEN", "Bu firmanın güvenlik yetkilerini değiştiremezsiniz."), status: 403 };
    if (scope.type !== "SYSTEM" && text(target.main_company_slug) !== companySlug) return { error: jsonError("CROSS_TENANT_FORBIDDEN", "Başka firmadaki kullanıcıya güvenlik yetkisi verilemez."), status: 403 };
    if (isSuper(effectiveRole(target))) return { error: jsonError("OWNER_GRANT_NOT_ALLOWED", "Süper Yönetici hesabına delege güvenlik yetkisi yazılmaz."), status: 409 };
    return { payload: { companySlug, targetUserId: text(target.id), capabilities: sanitizeCapabilities(payload.capabilities) } };
  }
  if (["SUPER_ADMIN_GRANT", "SUPER_ADMIN_REVOKE"].includes(operation)) {
    const target = await userById(c, text(payload.targetUserId)); if (!target || !target.is_active) return { error: jsonError("TARGET_USER_NOT_FOUND", "Hedef kullanıcı bulunamadı."), status: 404 };
    if (operation === "SUPER_ADMIN_GRANT" && isSuper(effectiveRole(target))) return { error: jsonError("ALREADY_SUPER_ADMIN", "Kullanıcı zaten Süper Yönetici."), status: 409 };
    if (operation === "SUPER_ADMIN_REVOKE" && text(target.id) === text(owner?.id)) return { error: jsonError("OWNER_LOCKED", "Asıl Süper Yönetici yetkisi kaldırılamaz."), status: 409 };
    if (operation === "SUPER_ADMIN_REVOKE" && !isSuper(effectiveRole(target))) return { error: jsonError("NOT_SUPER_ADMIN", "Hedef kullanıcı Süper Yönetici değil."), status: 409 };
    return { payload: { targetUserId: text(target.id), companySlug: text(target.main_company_slug) } };
  }
  if (operation === "ONLY_ME") {
    if (!text(current.session?.id)) return { error: jsonError("CURRENT_SESSION_REQUIRED", "Mevcut güvenli oturum bulunamadı."), status: 409 };
    return { payload: { keepSessionId: text(current.session.id) } };
  }
  const session = await scopedSession(c, current, scope, text(payload.sessionId));
  if (!session) return { error: jsonError("SESSION_NOT_FOUND", "Oturum bulunamadı veya kapsam dışı."), status: 404 };
  if (operation === "SESSION_CLOSE") {
    const own = text(session.user_id) === text(current.id);
    if (!own && !hasCap(scope, "SESSION_CLOSE")) return { error: jsonError("FORBIDDEN", "Bu oturumu kapatma yetkiniz yok."), status: 403 };
  } else if (!hasCap(scope, "SESSION_APPROVE")) return { error: jsonError("FORBIDDEN", "Oturum güven kararı yetkiniz yok."), status: 403 };
  return { payload: { sessionId: text(session.id), targetUserId: text(session.user_id), companySlug: text(session.main_company_slug), deviceLabel: text(session.device_label), ipAddress: text(session.ip_address) } };
}

async function executeOperation(c: any, current: AnyRow, operation: string, payload: AnyRow) {
  const timestamp = nowIso();
  if (operation === "SECURITY_CAPABILITY_SET") {
    const capabilities = sanitizeCapabilities(payload.capabilities);
    await storePut(c, GRANT_SCOPE, `${payload.companySlug}:${payload.targetUserId}`, payload.companySlug, { userId: payload.targetUserId, capabilities, isActive: capabilities.length > 0, grantedByUserId: current.id, grantedAt: timestamp });
    await audit(c, capabilities.length ? "SECURITY_CAPABILITY_GRANTED" : "SECURITY_CAPABILITY_REVOKED", current, payload.targetUserId, payload.companySlug, "", { capabilities });
    return { capabilities };
  }
  if (operation === "SUPER_ADMIN_GRANT") {
    const target = await userById(c, payload.targetUserId); const oldRole = effectiveRole(target || {});
    await c.env.DB.prepare("UPDATE auth_user_security SET role_override='SUPER_ADMIN',approval_required=0,updated_at=? WHERE user_id=?").bind(timestamp, payload.targetUserId).run();
    await audit(c, "SUPER_ADMIN_GRANTED", current, payload.targetUserId, payload.companySlug, "", { oldRole, newRole: "SUPER_ADMIN" });
    return { targetUserId: payload.targetUserId, role: "SUPER_ADMIN" };
  }
  if (operation === "SUPER_ADMIN_REVOKE") {
    const target = await userById(c, payload.targetUserId); const oldRole = effectiveRole(target || {});
    if (["SUPER_ADMIN", "ADMIN"].includes(upper(target?.platform_role)) || upper(target?.role) === "ADMIN") throw new Error("OWNER_LOCKED");
    await c.env.DB.prepare("UPDATE auth_user_security SET role_override=NULL,updated_at=? WHERE user_id=?").bind(timestamp, payload.targetUserId).run();
    const updated = await userById(c, payload.targetUserId);
    await audit(c, "SUPER_ADMIN_REVOKED", current, payload.targetUserId, payload.companySlug, "", { oldRole, newRole: effectiveRole(updated || {}) });
    return { targetUserId: payload.targetUserId, role: effectiveRole(updated || {}) };
  }
  if (operation === "ONLY_ME") {
    const result = await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE revoked_at IS NULL AND expires_at>? AND id<>?").bind(timestamp, current.id, timestamp, payload.keepSessionId).run();
    const count = Number(result?.meta?.changes || 0);
    await audit(c, "SUPER_ADMIN_ONLY_ME_EXECUTED", current, current.id, text(current.mainCompanySlug), payload.keepSessionId, { revokedSessions: count });
    return { revokedSessions: count, keptSessionId: payload.keepSessionId };
  }
  const session = await c.env.DB.prepare("SELECT * FROM auth_sessions WHERE id=? LIMIT 1").bind(payload.sessionId).first<AnyRow>();
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (operation === "SESSION_TRUST_APPROVE") {
    await storePut(c, TRUST_SCOPE, payload.sessionId, payload.companySlug, { sessionId: payload.sessionId, userId: payload.targetUserId, status: "TRUSTED", decidedByUserId: current.id, decidedAt: timestamp });
    await audit(c, "SESSION_TRUSTED", current, payload.targetUserId, payload.companySlug, payload.sessionId, { deviceLabel: payload.deviceLabel });
    return { sessionId: payload.sessionId, trustStatus: "TRUSTED" };
  }
  if (operation === "SESSION_TRUST_REJECT" || operation === "SESSION_SUSPICIOUS") {
    const status = operation === "SESSION_SUSPICIOUS" ? "SUSPICIOUS" : "REJECTED";
    await storePut(c, TRUST_SCOPE, payload.sessionId, payload.companySlug, { sessionId: payload.sessionId, userId: payload.targetUserId, status, decidedByUserId: current.id, decidedAt: timestamp });
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),revoked_by=COALESCE(revoked_by,?) WHERE id=?").bind(timestamp, current.id, payload.sessionId).run();
    await audit(c, operation === "SESSION_SUSPICIOUS" ? "SESSION_MARKED_SUSPICIOUS" : "SESSION_TRUST_REJECTED", current, payload.targetUserId, payload.companySlug, payload.sessionId, { deviceLabel: payload.deviceLabel });
    return { sessionId: payload.sessionId, trustStatus: status, revoked: true };
  }
  if (operation === "SESSION_CLOSE") {
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),revoked_by=COALESCE(revoked_by,?) WHERE id=?").bind(timestamp, current.id, payload.sessionId).run();
    await audit(c, "SESSION_REVOKED_SECURITY_CENTER", current, payload.targetUserId, payload.companySlug, payload.sessionId, { deviceLabel: payload.deviceLabel });
    return { sessionId: payload.sessionId, revoked: true };
  }
  throw new Error("UNSUPPORTED_OPERATION");
}

function friendlyEvent(action: string) {
  const map: AnyRow = {
    LOGIN_SUCCESS: ["🟢", "Giriş yapıldı"], PHONE_APPROVAL_APPROVED: ["📲", "Telefon onayladı"], SESSION_CREATED_POLICY: ["💻", "Oturum açıldı"],
    SESSION_TRUSTED: ["🔐", "Güvenilir oturum onaylandı"], SESSION_TRUST_REJECTED: ["🚫", "Oturum reddedildi"], SESSION_MARKED_SUSPICIOUS: ["🚫", "Şüpheli oturum kapatıldı"],
    SESSION_REVOKED_SECURITY_CENTER: ["🔴", "Oturum kapatıldı"], SECURITY_CAPABILITY_GRANTED: ["🛡️", "Güvenlik yetkisi verildi"], SECURITY_CAPABILITY_REVOKED: ["🛡️", "Güvenlik yetkisi kaldırıldı"],
    SUPER_ADMIN_GRANTED: ["⚠️", "Süper Yönetici eklendi"], SUPER_ADMIN_REVOKED: ["⚠️", "Süper Yönetici yetkisi kaldırıldı"], SUPER_ADMIN_ONLY_ME_EXECUTED: ["⚠️", "Sadece Ben Kalayım çalıştırıldı"],
    SECURITY_ACTION_APPROVED: ["📲", "Kritik işlem telefondan onaylandı"], SECURITY_ACTION_DENIED: ["🚫", "Kritik işlem telefondan reddedildi"], OWNER_RECOVERY_QUESTIONS_UPDATED: ["🛡️", "Güvenlik soruları güncellendi"],
  };
  const value = map[upper(action)] || ["•", text(action) || "Güvenlik olayı"];
  return { icon: value[0], label: value[1] };
}

export function registerSecurityCenterRoutes(app: any) {
  app.get("/api/security-center/overview", async (c: any) => {
    if (!(await requireStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veri katmanı hazır değil."), 503);
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current);
    const ownDevices = (await activeSecurityDevices(c, text(current.id))).map((row: AnyRow) => ({ id: row.id, label: row.deviceLabel || row.label || "KY Güvenlik", platform: row.platform || "", lastSeenAt: row.lastSeenAt || row.updatedAt, pushReady: Boolean(row.pushEndpoint), securityApp: true }));
    const sessionCountRow = scope.type === "SYSTEM"
      ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_sessions WHERE revoked_at IS NULL AND expires_at>?").bind(nowIso()).first<AnyRow>()
      : scope.type === "COMPANY"
        ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_sessions WHERE main_company_slug=? AND revoked_at IS NULL AND expires_at>?").bind(scope.companySlug, nowIso()).first<AnyRow>()
        : await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?").bind(current.id, nowIso()).first<AnyRow>();
    return c.json({ ok: true, data: { scopeType: scope.type, companySlug: scope.companySlug, delegated: scope.delegated, capabilities: scope.capabilities, role: current.role, ownDevices, activeSessionCount: Number(sessionCountRow?.total || 0), trustEnforcement: false, trustMode: "REVIEW_ONLY" } });
  });

  app.get("/api/security-center/sessions", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current);
    if (scope.type === "COMPANY" && !hasCap(scope, "SESSION_VIEW") && !isCompanyAdmin(current.role)) return c.json(jsonError("FORBIDDEN", "Oturum görüntüleme yetkiniz yok."), 403);
    let result;
    if (scope.type === "SYSTEM") result = await c.env.DB.prepare(`SELECT s.*,u.username,u.full_name,u.role,us.role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id ORDER BY s.created_at DESC LIMIT 500`).all<AnyRow>();
    else if (scope.type === "COMPANY") result = await c.env.DB.prepare(`SELECT s.*,u.username,u.full_name,u.role,us.role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.main_company_slug=? ORDER BY s.created_at DESC LIMIT 300`).bind(scope.companySlug).all<AnyRow>();
    else result = await c.env.DB.prepare(`SELECT s.*,u.username,u.full_name,u.role,us.role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100`).bind(current.id).all<AnyRow>();
    const trusts = new Map((await storeList(c, TRUST_SCOPE)).map((row: AnyRow) => [text(row.sessionId || row.fileName), row]));
    const data = (result.results || []).map((row: AnyRow) => { const trust = trusts.get(text(row.id)); return { id: row.id, userId: row.user_id, username: row.username, fullName: row.full_name, role: effectiveRole(row), mainCompanySlug: row.main_company_slug, deviceLabel: row.device_label, userAgent: row.user_agent, ipAddress: row.ip_address, createdAt: row.created_at, approvedAt: row.approved_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, revokedBy: row.revoked_by, active: !row.revoked_at && Date.parse(text(row.expires_at)) > Date.now(), trustStatus: upper(trust?.status || "UNREVIEWED"), trustDecidedAt: trust?.decidedAt || null, trustDecidedByUserId: trust?.decidedByUserId || null, own: text(row.user_id) === text(current.id) }; });
    return c.json({ ok: true, data });
  });

  app.get("/api/security-center/audit", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current); const limit = Math.max(25, Math.min(500, Number(c.req.query("limit") || 250)));
    if (scope.type === "COMPANY" && !hasCap(scope, "AUDIT_VIEW") && !isCompanyAdmin(current.role)) return c.json(jsonError("FORBIDDEN", "Güvenlik akışını görüntüleme yetkiniz yok."), 403);
    let result;
    if (scope.type === "SYSTEM") result = await c.env.DB.prepare(`SELECT a.*,au.full_name AS actor_name,tu.full_name AS target_name FROM auth_security_audit a LEFT JOIN auth_users au ON au.id=a.actor_user_id LEFT JOIN auth_users tu ON tu.id=a.target_user_id ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all<AnyRow>();
    else if (scope.type === "COMPANY") result = await c.env.DB.prepare(`SELECT a.*,au.full_name AS actor_name,tu.full_name AS target_name FROM auth_security_audit a LEFT JOIN auth_users au ON au.id=a.actor_user_id LEFT JOIN auth_users tu ON tu.id=a.target_user_id WHERE a.main_company_slug=? ORDER BY a.created_at DESC LIMIT ?`).bind(scope.companySlug, limit).all<AnyRow>();
    else result = await c.env.DB.prepare(`SELECT a.*,au.full_name AS actor_name,tu.full_name AS target_name FROM auth_security_audit a LEFT JOIN auth_users au ON au.id=a.actor_user_id LEFT JOIN auth_users tu ON tu.id=a.target_user_id WHERE a.actor_user_id=? OR a.target_user_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(current.id, current.id, limit).all<AnyRow>();
    const data = (result.results || []).map((row: AnyRow) => { const detail = objectOf(row.detail); const friendly = friendlyEvent(row.action); return { id: row.id, createdAt: row.created_at, action: row.action, icon: friendly.icon, label: friendly.label, actorUserId: row.actor_user_id, actorName: row.actor_name || "", targetUserId: row.target_user_id, targetName: row.target_name || "", mainCompanySlug: row.main_company_slug, sessionId: row.session_id, ipAddress: row.ip_address, deviceId: detail.deviceId || "", deviceLabel: detail.deviceLabel || "", decision: detail.decision || "", oldValue: detail.oldValue, newValue: detail.newValue, result: detail.result || "", detail }; });
    return c.json({ ok: true, data });
  });

  app.get("/api/security-center/notifications", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current); const row = await storeGet(c, PREF_SCOPE, text(current.id));
    const defaults = { ownLogins: true, companyLoginRequests: hasCap(scope, "LOGIN_APPROVE") || isCompanyAdmin(current.role), newSession: true, suspiciousLogin: true, newDevice: true, sessionClosed: true, permissionChange: scope.type !== "SELF", securityProblem: true };
    return c.json({ ok: true, data: { ...defaults, ...objectOf(row?.preferences) } });
  });
  app.put("/api/security-center/notifications", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const body = await bodyOf(c); const scope = await scopeFor(c, current);
    const keys = ["ownLogins", "companyLoginRequests", "newSession", "suspiciousLogin", "newDevice", "sessionClosed", "permissionChange", "securityProblem"]; const preferences: AnyRow = {};
    for (const key of keys) if (body[key] !== undefined) preferences[key] = Boolean(body[key]);
    await storePut(c, PREF_SCOPE, text(current.id), text(scope.companySlug), { userId: current.id, preferences });
    await audit(c, "SECURITY_NOTIFICATION_PREFERENCES_UPDATED", current, current.id, scope.companySlug, "", { preferences });
    return c.json({ ok: true, data: preferences });
  });

  app.get("/api/security-center/users", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current);
    if (scope.type === "SELF") return c.json(jsonError("FORBIDDEN", "Kullanıcı listesi güvenlik yöneticilerine açıktır."), 403);
    const result = scope.type === "SYSTEM"
      ? await c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.is_active,u.role,s.role_override,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.is_active=1 ORDER BY u.full_name,u.username LIMIT 500`).all<AnyRow>()
      : await c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.is_active,u.role,s.role_override,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.is_active=1 AND s.main_company_slug=? ORDER BY u.full_name,u.username LIMIT 300`).bind(scope.companySlug).all<AnyRow>();
    return c.json({ ok: true, data: (result.results || []).map((row: AnyRow) => ({ id: row.id, username: row.username, fullName: row.full_name, role: effectiveRole(row), mainCompanySlug: row.main_company_slug })) });
  });

  app.get("/api/security-center/grants", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current);
    if (scope.type === "SELF") return c.json(jsonError("FORBIDDEN", "Yetki listesi güvenlik yöneticilerine açıktır."), 403);
    const rows = await storeList(c, GRANT_SCOPE, scope.type === "SYSTEM" ? "" : scope.companySlug);
    const data = [];
    for (const row of rows) { if (row.isActive === false) continue; const user = await userById(c, text(row.userId)); if (!user) continue; data.push({ id: row.id, userId: row.userId, fullName: user.full_name, username: user.username, role: effectiveRole(user), mainCompanySlug: row.mainCompanySlug, capabilities: sanitizeCapabilities(row.capabilities), grantedByUserId: row.grantedByUserId, grantedAt: row.grantedAt, updatedAt: row.updatedAt }); }
    return c.json({ ok: true, data });
  });

  app.post("/api/security-center/actions/start", async (c: any) => {
    if (!(await requireStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veri katmanı hazır değil."), 503);
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const scope = await scopeFor(c, current); const body = await bodyOf(c); const operation = upper(body.operation);
    const authorization = await authorizeOperation(c, current, scope, operation, body);
    if (authorization.error) return c.json(authorization.error, authorization.status);
    const devices = await activeSecurityDevices(c, text(current.id)); if (!devices.length) return c.json(jsonError("SECURITY_DEVICE_REQUIRED", "Bu kritik işlem için aktif KY Güvenlik telefonu gereklidir."), 409);
    const id = crypto.randomUUID(); const token = randomToken(); const requestedAt = nowIso(); const expiresAt = addSeconds(ACTION_SECONDS); const payload = authorization.payload || {};
    await storePut(c, ACTION_SCOPE, id, text(payload.companySlug || scope.companySlug), { id, userId: current.id, mainCompanySlug: text(payload.companySlug || scope.companySlug), actionType: operation, actionTokenHash: await sha256(token), status: "PENDING", requestedAt, expiresAt, decidedAt: "", decidedByDeviceId: "", claimedAt: "", consumedAt: "", sourceIp: clientIp(c), sourceUserAgent: userAgent(c), operationPayload: payload, title: actionTitle(operation) });
    const notifiedDevices = await notifyDevices(c, text(current.id));
    await audit(c, "SECURITY_CENTER_ACTION_REQUESTED", current, text(payload.targetUserId || current.id), text(payload.companySlug || scope.companySlug), text(payload.sessionId), { actionId: id, operation, notifiedDevices });
    return c.json({ ok: true, data: { actionId: id, actionToken: token, operation, title: actionTitle(operation), status: "PENDING", expiresAt, notifiedDevices, pushDelivered: notifiedDevices > 0 } });
  });

  app.post("/api/security-center/actions/:id/status", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const body = await bodyOf(c); const action = await actionFromToken(c, text(c.req.param("id")), text(body.actionToken));
    if (!action || text(action.userId) !== text(auth.current.id)) return c.json(jsonError("SECURITY_ACTION_INVALID", "Güvenlik onayı bulunamadı."), 401);
    return c.json({ ok: true, data: { actionId: action.id, operation: action.actionType, status: upper(action.status), expiresAt: action.expiresAt, decidedAt: action.decidedAt || null, consumedAt: action.consumedAt || null } });
  });

  app.post("/api/security-center/actions/:id/execute", async (c: any) => {
    const auth = await currentAuth(c); if (auth.error) return auth.error; const current = auth.current; const body = await bodyOf(c); const action = await actionFromToken(c, text(c.req.param("id")), text(body.actionToken));
    if (!action || text(action.userId) !== text(current.id)) return c.json(jsonError("SECURITY_ACTION_INVALID", "Güvenlik onayı bu hesaba ait değil."), 401);
    if (upper(action.status) !== "APPROVED" || text(action.consumedAt)) return c.json(jsonError("SECURITY_ACTION_NOT_APPROVED", "KY Güvenlik telefon onayı tamamlanmadı veya kullanıldı."), 409);
    if (Date.parse(text(action.expiresAt)) <= Date.now()) return c.json(jsonError("SECURITY_ACTION_EXPIRED", "Güvenlik onayının süresi doldu."), 409);
    const scope = await scopeFor(c, current); const authorization = await authorizeOperation(c, current, scope, upper(action.actionType), objectOf(action.operationPayload));
    if (authorization.error) return c.json(authorization.error, authorization.status);
    if (!(await claimAction(c, action))) return c.json(jsonError("SECURITY_ACTION_CONSUMED", "Bu güvenlik onayı başka bir işlem tarafından kullanılıyor."), 409);
    try {
      const result = await executeOperation(c, current, upper(action.actionType), authorization.payload || objectOf(action.operationPayload));
      await finishAction(c, action, "APPROVED");
      return c.json({ ok: true, data: { executed: true, operation: action.actionType, result } });
    } catch (error) {
      await restoreAction(c, action);
      return c.json(jsonError("SECURITY_OPERATION_FAILED", "Kritik güvenlik işlemi uygulanamadı; telefon onayı tüketilmedi.", error instanceof Error ? error.message : String(error)), 500);
    }
  });
}
