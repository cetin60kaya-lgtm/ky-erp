// @ts-nocheck
import { compare, hash } from "bcryptjs";

const SESSION_SECONDS = 8 * 60 * 60;
const CHALLENGE_SECONDS = 10 * 60;
const APPROVAL_SECONDS = 15 * 60;
const DEFAULT_COMPANY_SLUG = "mecit-hakan";
const ISSUER = "KY ERP";
const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV",
  "CEK_ODEME", "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET",
  "ASISTAN", "ADMIN", "RAPORLAR",
];

type AnyRow = Record<string, any>;
let authSchemaReady = false;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toLocaleUpperCase("tr-TR");
}
function nowIso() {
  return new Date().toISOString();
}
function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
function boolValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0", "FALSE", "NO", "OFF", "HAYIR"].includes(upper(value));
}
function jsonError(code: string, message: string, details?: unknown) {
  return { ok: false as const, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function clientIp(c: any) {
  return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]);
}
function userAgent(c: any) {
  return text(c.req.header("User-Agent")).slice(0, 300);
}
function deviceLabel(c: any, body: AnyRow = {}) {
  return text(body.deviceLabel || c.req.header("X-KYERP-Device") || userAgent(c)).slice(0, 180);
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBytes(value: string) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeJson(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}
function decodeJson(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}
function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string) {
  const clean = upper(input).replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}
function newTotpSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}
async function totpCode(secret: string, timestampMs = Date.now()) {
  let counter = BigInt(Math.floor(timestampMs / 1000 / 30));
  const counterBytes = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = Number(counter & 255n);
    counter >>= 8n;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = signature[signature.length - 1] & 15;
  const binary =
    ((signature[offset] & 127) << 24) |
    ((signature[offset + 1] & 255) << 16) |
    ((signature[offset + 2] & 255) << 8) |
    (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
async function verifyTotp(secret: string, code: unknown) {
  const candidate = text(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  for (const offset of [-1, 0, 1]) {
    if (safeEqual(await totpCode(secret, Date.now() + offset * 30_000), candidate)) return true;
  }
  return false;
}
function otpauthUri(secret: string, account: string) {
  const label = `${ISSUER}:${account || "Kullanici"}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
}

async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return Boolean(row?.name);
}
async function ensureAuthSchema(c: any) {
  if (authSchemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS auth_user_security (user_id TEXT PRIMARY KEY,email TEXT,main_company_slug TEXT,role_override TEXT,mfa_secret TEXT,mfa_enabled INTEGER NOT NULL DEFAULT 0,email_verified INTEGER NOT NULL DEFAULT 0,approval_required INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_security_email ON auth_user_security (LOWER(email)) WHERE email IS NOT NULL AND TRIM(email) <> ''`,
    `CREATE TABLE IF NOT EXISTS auth_system_secrets (secret_key TEXT PRIMARY KEY,secret_value TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS auth_login_challenges (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge_type TEXT NOT NULL,challenge_token_hash TEXT NOT NULL,device_label TEXT,user_agent TEXT,ip_address TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_login_approvals (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,main_company_slug TEXT,approval_token_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',device_label TEXT,user_agent TEXT,ip_address TEXT,requested_at TEXT NOT NULL,expires_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT,consumed_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,main_company_slug TEXT,token_hash TEXT NOT NULL UNIQUE,role_at_login TEXT,device_label TEXT,user_agent TEXT,ip_address TEXT,created_at TEXT NOT NULL,approved_at TEXT NOT NULL,expires_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,revoked_at TEXT,revoked_by TEXT,approval_request_id TEXT)`,
    `CREATE TABLE IF NOT EXISTS auth_security_audit (id TEXT PRIMARY KEY,actor_user_id TEXT,target_user_id TEXT,main_company_slug TEXT,action TEXT NOT NULL,session_id TEXT,ip_address TEXT,detail TEXT,created_at TEXT NOT NULL)`,
  ];
  for (const statement of statements) await c.env.DB.prepare(statement).run();
  authSchemaReady = true;
}

function effectiveRole(user: AnyRow, security: AnyRow = {}) {
  const override = upper(security.role_override || user.roleOverride);
  if (override) return override;
  const legacy = upper(user.role);
  return legacy === "ADMIN" ? "SUPER_ADMIN" : legacy || "VIEWER";
}
function isSuper(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function isCompanyAdmin(role: unknown) {
  return upper(role) === "COMPANY_ADMIN";
}
function legacyRole(role: unknown) {
  const normalized = upper(role);
  if (normalized === "SUPER_ADMIN") return "ADMIN";
  if (normalized === "COMPANY_ADMIN") return "VIEWER";
  return MODULE_KEYS.includes(normalized) ? "VIEWER" : normalized || "VIEWER";
}
function roleOverride(role: unknown) {
  const normalized = upper(role);
  return ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(normalized) ? normalized : null;
}

async function securityFor(c: any, user: AnyRow) {
  await ensureAuthSchema(c);
  let security = await c.env.DB.prepare("SELECT * FROM auth_user_security WHERE user_id=? LIMIT 1").bind(user.id).first<AnyRow>();
  if (!security) {
    const timestamp = nowIso();
    const approvalRequired = effectiveRole(user) === "SUPER_ADMIN" ? 0 : 1;
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO auth_user_security
       (user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,created_at,updated_at)
       VALUES (?,NULL,?,NULL,0,0,?,?,?)`,
    ).bind(user.id, DEFAULT_COMPANY_SLUG, approvalRequired, timestamp, timestamp).run();
    security = await c.env.DB.prepare("SELECT * FROM auth_user_security WHERE user_id=? LIMIT 1").bind(user.id).first<AnyRow>();
  }
  return security || {};
}
async function permissionRows(c: any, userId: string, role: string) {
  if (isSuper(role)) {
    return MODULE_KEYS.map((moduleKey) => ({ moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true }));
  }
  const rows = (await tableExists(c, "auth_user_module_permissions"))
    ? (await c.env.DB.prepare(
        `SELECT module_key,can_view,can_create,can_update,can_delete,can_approve
           FROM auth_user_module_permissions WHERE user_id=? ORDER BY module_key`,
      ).bind(userId).all()).results || []
    : [];
  const mapped = rows.map((row: AnyRow) => ({
    moduleKey: upper(row.module_key),
    canView: Boolean(row.can_view),
    canCreate: Boolean(row.can_create),
    canUpdate: Boolean(row.can_update),
    canDelete: Boolean(row.can_delete),
    canApprove: Boolean(row.can_approve),
  }));
  if (isCompanyAdmin(role) && !mapped.some((row: AnyRow) => row.moduleKey === "ADMIN")) {
    mapped.push({ moduleKey: "ADMIN", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true });
  }
  return mapped;
}
async function userPayload(c: any, user: AnyRow) {
  const security = await securityFor(c, user);
  const role = effectiveRole(user, security);
  return {
    id: text(user.id),
    username: text(user.username),
    email: text(security.email),
    fullName: text(user.full_name || user.fullName || user.username || "Kullanıcı"),
    role,
    mainCompanySlug: text(security.main_company_slug) || DEFAULT_COMPANY_SLUG,
    mustChangePassword: Boolean(user.must_change_password),
    mfaEnabled: Boolean(security.mfa_enabled),
    emailVerified: Boolean(security.email_verified),
    approvalRequired: Boolean(security.approval_required),
    permissions: await permissionRows(c, text(user.id), role),
  };
}
async function findUserByIdentity(c: any, identity: string) {
  if (!(await tableExists(c, "auth_users"))) return null;
  await ensureAuthSchema(c);
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.password_hash,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,
            s.email,s.main_company_slug,s.role_override,s.mfa_secret,s.mfa_enabled,s.email_verified,s.approval_required
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE LOWER(u.username)=LOWER(?) OR LOWER(COALESCE(s.email,''))=LOWER(?)
      LIMIT 1`,
  ).bind(identity, identity).first<AnyRow>();
}
async function findUserById(c: any, id: string) {
  if (!(await tableExists(c, "auth_users"))) return null;
  return c.env.DB.prepare(
    `SELECT id,username,password_hash,full_name,role,is_active,must_change_password,last_login_at
       FROM auth_users WHERE id=? LIMIT 1`,
  ).bind(id).first<AnyRow>();
}
async function audit(c: any, action: string, actorUserId = "", targetUserId = "", companySlug = "", sessionId = "", detail: AnyRow = {}) {
  await ensureAuthSchema(c);
  await c.env.DB.prepare(
    `INSERT INTO auth_security_audit
     (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), actorUserId || null, targetUserId || null, companySlug || null, action, sessionId || null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso()).run();
}

async function sessionSecret(c: any) {
  await ensureAuthSchema(c);
  let row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key='SESSION_HMAC' LIMIT 1").first<AnyRow>();
  if (!row?.secret_value) {
    const candidate = randomToken(32);
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at)
       VALUES ('SESSION_HMAC',?,?,?)`,
    ).bind(candidate, timestamp, timestamp).run();
    row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key='SESSION_HMAC' LIMIT 1").first<AnyRow>();
  }
  return base64UrlToBytes(text(row?.secret_value));
}
async function signToken(c: any, signingInput: string) {
  const key = await crypto.subtle.importKey("raw", await sessionSecret(c), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput))));
}
async function createSignedToken(c: any, payload: AnyRow) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const input = `${header}.${body}`;
  return `${input}.${await signToken(c, input)}`;
}
async function parseSignedToken(c: any, token: string) {
  const parts = text(token).split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = await signToken(c, `${parts[0]}.${parts[1]}`);
    if (!safeEqual(expected, parts[2])) return null;
    const payload = decodeJson(parts[1]);
    if (!payload?.sub || !payload?.sid || Number(payload?.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
function bearerToken(c: any) {
  const match = text(c.req.header("Authorization")).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
async function issueSession(c: any, user: AnyRow, source: AnyRow = {}) {
  const security = await securityFor(c, user);
  const role = effectiveRole(user, security);
  const sid = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + SESSION_SECONDS) * 1000).toISOString();
  const token = await createSignedToken(c, {
    sid,
    sub: text(user.id),
    username: text(user.username),
    role,
    company: text(security.main_company_slug) || DEFAULT_COMPANY_SLUG,
    iat: now,
    exp: now + SESSION_SECONDS,
  });
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,main_company_slug,token_hash,role_at_login,device_label,user_agent,ip_address,created_at,approved_at,expires_at,last_seen_at,approval_request_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    sid, user.id, text(security.main_company_slug) || DEFAULT_COMPANY_SLUG, await sha256(token), role,
    text(source.deviceLabel || deviceLabel(c, source)), text(source.userAgent || userAgent(c)), text(source.ipAddress || clientIp(c)),
    timestamp, timestamp, expiresAt, timestamp, text(source.approvalRequestId) || null,
  ).run();
  await c.env.DB.prepare("UPDATE auth_users SET last_login_at=?,updated_at=? WHERE id=?").bind(timestamp, timestamp, user.id).run();
  await audit(c, "SESSION_CREATED", user.id, user.id, text(security.main_company_slug), sid, { role, expiresAt });
  return {
    ok: true,
    stage: "AUTHENTICATED",
    token,
    expiresIn: SESSION_SECONDS,
    expiresAt,
    user: await userPayload(c, user),
  };
}

export async function getAuthenticatedUser(c: any) {
  await ensureAuthSchema(c);
  const token = bearerToken(c);
  if (!token) return null;
  const payload = await parseSignedToken(c, token);
  if (!payload) return null;
  const session = await c.env.DB.prepare(
    `SELECT * FROM auth_sessions
      WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>? LIMIT 1`,
  ).bind(payload.sid, payload.sub, await sha256(token), nowIso()).first<AnyRow>();
  if (!session) return null;
  const user = await findUserById(c, text(payload.sub));
  if (!user || !Boolean(user.is_active)) return null;
  const security = await securityFor(c, user);
  const responseUser = await userPayload(c, user);
  const lastSeen = Date.parse(text(session.last_seen_at) || "0");
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60_000) {
    c.executionCtx?.waitUntil?.(
      c.env.DB.prepare("UPDATE auth_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL").bind(nowIso(), session.id).run(),
    );
  }
  return { ...responseUser, security, session };
}

async function createLoginChallenge(c: any, user: AnyRow, type: string, body: AnyRow) {
  const id = crypto.randomUUID();
  const challengeToken = randomToken(24);
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO auth_login_challenges
     (id,user_id,challenge_type,challenge_token_hash,device_label,user_agent,ip_address,created_at,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(id, user.id, type, await sha256(challengeToken), deviceLabel(c, body), userAgent(c), clientIp(c), timestamp, addSeconds(CHALLENGE_SECONDS)).run();
  return { id, challengeToken };
}
async function afterMfa(c: any, user: AnyRow, challenge: AnyRow) {
  const security = await securityFor(c, user);
  const role = effectiveRole(user, security);
  const approvalRequired = Boolean(security.approval_required) && !isSuper(role) && !isCompanyAdmin(role);
  const source = {
    deviceLabel: text(challenge.device_label),
    userAgent: text(challenge.user_agent),
    ipAddress: text(challenge.ip_address),
  };
  if (!approvalRequired) return issueSession(c, user, source);

  const id = crypto.randomUUID();
  const approvalToken = randomToken(24);
  const timestamp = nowIso();
  const companySlug = text(security.main_company_slug) || DEFAULT_COMPANY_SLUG;
  await c.env.DB.prepare(
    `INSERT INTO auth_login_approvals
     (id,user_id,main_company_slug,approval_token_hash,status,device_label,user_agent,ip_address,requested_at,expires_at)
     VALUES (?,?,?,?, 'PENDING',?,?,?,?,?)`,
  ).bind(id, user.id, companySlug, await sha256(approvalToken), source.deviceLabel, source.userAgent, source.ipAddress, timestamp, addSeconds(APPROVAL_SECONDS)).run();
  await audit(c, "LOGIN_APPROVAL_REQUESTED", user.id, user.id, companySlug, "", { approvalId: id, deviceLabel: source.deviceLabel });
  return {
    ok: true,
    stage: "APPROVAL_PENDING",
    approvalId: id,
    approvalToken,
    approvalExpiresAt: addSeconds(APPROVAL_SECONDS),
    message: "Authenticator doğrulandı. Firma yöneticisi veya uygulama yöneticisi girişinizi onaylamalıdır.",
  };
}

function adminCanManage(current: AnyRow, target: AnyRow) {
  if (isSuper(current.role)) return true;
  if (!isCompanyAdmin(current.role)) return false;
  const sameCompany = text(current.mainCompanySlug) === text(target.mainCompanySlug || target.main_company_slug || DEFAULT_COMPANY_SLUG);
  const targetRole = upper(target.effectiveRole || target.role_override || target.role);
  return sameCompany && !["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(targetRole);
}
async function adminCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current || (!isSuper(current.role) && !isCompanyAdmin(current.role))) return null;
  return current;
}
async function targetUserWithSecurity(c: any, id: string) {
  const user = await findUserById(c, id);
  if (!user) return null;
  const security = await securityFor(c, user);
  return { ...user, ...security, effectiveRole: effectiveRole(user, security), mainCompanySlug: text(security.main_company_slug) || DEFAULT_COMPANY_SLUG };
}
async function revokeUserSessions(c: any, userId: string, actorId: string) {
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `UPDATE auth_sessions SET revoked_at=?,revoked_by=?
      WHERE user_id=? AND revoked_at IS NULL AND expires_at>?`,
  ).bind(timestamp, actorId || userId, userId, timestamp).run();
}

export function registerAuthCloudRoutes(app: any) {
  app.post("/api/auth/login", async (c: any) => {
    await ensureAuthSchema(c);
    const body = await bodyOf(c);
    const identity = text(body.username || body.email || body.identity).toLocaleLowerCase("tr-TR");
    const password = String(body.password || "");
    if (!identity || !password) return c.json(jsonError("AUTH_REQUIRED", "E-posta/kullanıcı adı ve şifre zorunludur."), 400);

    const user = await findUserByIdentity(c, identity);
    if (!user || !Boolean(user.is_active) || !text(user.password_hash)) {
      return c.json(jsonError("INVALID_CREDENTIALS", "E-posta/kullanıcı adı veya şifre hatalı."), 401);
    }
    if (!(await compare(password, text(user.password_hash)))) {
      await audit(c, "PASSWORD_REJECTED", "", text(user.id), text(user.main_company_slug), "", { identity });
      return c.json(jsonError("INVALID_CREDENTIALS", "E-posta/kullanıcı adı veya şifre hatalı."), 401);
    }

    const security = await securityFor(c, user);
    let secret = text(security.mfa_secret);
    const setupRequired = !Boolean(security.mfa_enabled);
    if (!secret) {
      secret = newTotpSecret();
      await c.env.DB.prepare("UPDATE auth_user_security SET mfa_secret=?,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, nowIso(), user.id).run();
    }
    const challenge = await createLoginChallenge(c, user, setupRequired ? "MFA_SETUP" : "MFA_LOGIN", body);
    await audit(c, setupRequired ? "MFA_SETUP_STARTED" : "MFA_CHALLENGE_CREATED", user.id, user.id, text(security.main_company_slug), "", { deviceLabel: deviceLabel(c, body) });
    const account = text(security.email || user.username);
    return c.json({
      ok: true,
      stage: setupRequired ? "MFA_SETUP" : "MFA_REQUIRED",
      challengeId: challenge.id,
      challengeToken: challenge.challengeToken,
      challengeExpiresAt: addSeconds(CHALLENGE_SECONDS),
      ...(setupRequired ? { secret, otpauthUri: otpauthUri(secret, account) } : {}),
      message: setupRequired
        ? "Google Authenticator veya Microsoft Authenticator'a KY ERP hesabını ekleyin ve 6 haneli kodu girin."
        : "Authenticator uygulamasındaki 6 haneli kodu girin.",
    });
  });

  app.post("/api/auth/mfa/verify", async (c: any) => {
    await ensureAuthSchema(c);
    const body = await bodyOf(c);
    const challenge = await c.env.DB.prepare(
      `SELECT * FROM auth_login_challenges
        WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`,
    ).bind(text(body.challengeId), nowIso()).first<AnyRow>();
    if (!challenge || !safeEqual(text(challenge.challenge_token_hash), await sha256(text(body.challengeToken)))) {
      return c.json(jsonError("MFA_CHALLENGE_INVALID", "Doğrulama isteği geçersiz veya süresi dolmuş."), 401);
    }
    const user = await findUserById(c, text(challenge.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("UNAUTHORIZED", "Kullanıcı pasif veya bulunamadı."), 401);
    const security = await securityFor(c, user);
    if (!text(security.mfa_secret) || !(await verifyTotp(text(security.mfa_secret), body.code))) {
      await audit(c, "MFA_REJECTED", user.id, user.id, text(security.main_company_slug), "", { challengeId: challenge.id });
      return c.json(jsonError("MFA_CODE_INVALID", "Authenticator kodu hatalı. Yeni kodu girip tekrar deneyin."), 401);
    }
    const timestamp = nowIso();
    await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(timestamp, challenge.id).run();
    if (text(challenge.challenge_type) === "MFA_SETUP") {
      await c.env.DB.prepare("UPDATE auth_user_security SET mfa_enabled=1,updated_at=? WHERE user_id=?").bind(timestamp, user.id).run();
      await audit(c, "MFA_ENABLED", user.id, user.id, text(security.main_company_slug));
    }
    return c.json(await afterMfa(c, user, challenge));
  });

  app.post("/api/auth/approval/:id/status", async (c: any) => {
    await ensureAuthSchema(c);
    const body = await bodyOf(c);
    const approval = await c.env.DB.prepare("SELECT * FROM auth_login_approvals WHERE id=? LIMIT 1").bind(c.req.param("id")).first<AnyRow>();
    if (!approval || !safeEqual(text(approval.approval_token_hash), await sha256(text(body.approvalToken)))) {
      return c.json(jsonError("APPROVAL_NOT_FOUND", "Giriş onay isteği bulunamadı."), 404);
    }
    if (text(approval.expires_at) <= nowIso() && text(approval.status) === "PENDING") {
      await c.env.DB.prepare("UPDATE auth_login_approvals SET status='EXPIRED' WHERE id=? AND status='PENDING'").bind(approval.id).run();
      return c.json({ ok: true, stage: "APPROVAL_EXPIRED", status: "EXPIRED", message: "Giriş onay süresi doldu. Yeniden giriş yapın." });
    }
    if (text(approval.status) === "DENIED") {
      return c.json({ ok: true, stage: "APPROVAL_DENIED", status: "DENIED", message: "Giriş isteği yönetici tarafından reddedildi." });
    }
    if (text(approval.status) !== "APPROVED" || approval.consumed_at) {
      return c.json({ ok: true, stage: "APPROVAL_PENDING", status: text(approval.status || "PENDING") });
    }
    const user = await findUserById(c, text(approval.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("UNAUTHORIZED", "Kullanıcı pasif veya bulunamadı."), 401);
    const response = await issueSession(c, user, {
      deviceLabel: approval.device_label,
      userAgent: approval.user_agent,
      ipAddress: approval.ip_address,
      approvalRequestId: approval.id,
    });
    await c.env.DB.prepare("UPDATE auth_login_approvals SET status='CONSUMED',consumed_at=? WHERE id=? AND status='APPROVED'").bind(nowIso(), approval.id).run();
    return c.json(response);
  });

  app.get("/api/auth/me", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum geçersiz, iptal edilmiş veya 8 saatlik süresi dolmuş."), 401);
    const { security, session, ...user } = current;
    return c.json({ ok: true, user, session: { id: session.id, expiresAt: session.expires_at, lastSeenAt: session.last_seen_at } });
  });

  app.post("/api/auth/logout", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (current?.session?.id) {
      await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL").bind(nowIso(), current.id, current.session.id).run();
      await audit(c, "SESSION_LOGOUT", current.id, current.id, current.mainCompanySlug, current.session.id);
    }
    return c.json({ ok: true });
  });

  app.get("/api/admin/users", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    if (!(await tableExists(c, "auth_users"))) return c.json({ ok: true, data: [] });
    const result = await c.env.DB.prepare(
      `SELECT u.id,u.username,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,u.created_at,u.updated_at,
              s.email,s.main_company_slug,s.role_override,s.mfa_enabled,s.email_verified,s.approval_required
         FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        ORDER BY u.full_name COLLATE NOCASE,u.username COLLATE NOCASE`,
    ).all<AnyRow>();
    const data = [];
    for (const row of result.results || []) {
      const security = row.user_id ? row : await securityFor(c, row);
      const effective = effectiveRole(row, row);
      const item = {
        id: text(row.id), username: text(row.username), fullName: text(row.full_name), email: text(row.email),
        role: effective, mainCompanySlug: text(row.main_company_slug) || DEFAULT_COMPANY_SLUG,
        isActive: Boolean(row.is_active), mustChangePassword: Boolean(row.must_change_password),
        mfaEnabled: Boolean(row.mfa_enabled), emailVerified: Boolean(row.email_verified),
        approvalRequired: Boolean(row.approval_required), lastLoginAt: row.last_login_at,
        createdAt: row.created_at, updatedAt: row.updated_at,
      };
      if (isSuper(current.role) || adminCanManage(current, { ...item, effectiveRole: effective })) data.push(item);
    }
    return c.json({ ok: true, data });
  });

  app.post("/api/admin/users", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const body = await bodyOf(c);
    const username = text(body.username).toLocaleLowerCase("tr-TR");
    const password = String(body.password || "");
    const fullName = text(body.fullName || body.full_name || username);
    const email = text(body.email).toLocaleLowerCase("tr-TR");
    const requestedRole = upper(body.role || "VIEWER");
    const companySlug = isSuper(current.role)
      ? text(body.mainCompanySlug || DEFAULT_COMPANY_SLUG)
      : text(current.mainCompanySlug);
    if (!username || password.length < 6 || !fullName) {
      return c.json(jsonError("USER_FIELDS_REQUIRED", "Kullanıcı adı, ad soyad ve en az 6 karakter parola zorunludur."), 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_INVALID", "Geçerli bir e-posta adresi girin."), 400);
    if (!isSuper(current.role) && ["SUPER_ADMIN", "COMPANY_ADMIN", "ADMIN"].includes(requestedRole)) {
      return c.json(jsonError("FORBIDDEN", "Firma yöneticisi yeni yönetici atayamaz."), 403);
    }
    const duplicate = await c.env.DB.prepare(
      `SELECT u.id FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE LOWER(u.username)=LOWER(?) OR (?<>'' AND LOWER(COALESCE(s.email,''))=LOWER(?)) LIMIT 1`,
    ).bind(username, email, email).first<AnyRow>();
    if (duplicate) return c.json(jsonError("USER_EXISTS", "Kullanıcı adı veya e-posta zaten kullanılıyor."), 409);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const override = roleOverride(requestedRole);
    const storedRole = requestedRole === "SUPER_ADMIN" ? "ADMIN" : requestedRole === "COMPANY_ADMIN" ? "VIEWER" : requestedRole;
    await c.env.DB.prepare(
      `INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(id, username, await hash(password, 10), fullName, storedRole, boolValue(body.isActive, true) ? 1 : 0, boolValue(body.mustChangePassword, false) ? 1 : 0, timestamp, timestamp).run();
    await c.env.DB.prepare(
      `INSERT INTO auth_user_security(user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,created_at,updated_at)
       VALUES (?,?,?,?,0,?,?,?,?)`,
    ).bind(id, email || null, companySlug || DEFAULT_COMPANY_SLUG, override, boolValue(body.emailVerified, false) ? 1 : 0,
      ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(requestedRole) ? 0 : (boolValue(body.approvalRequired, true) ? 1 : 0), timestamp, timestamp).run();
    await audit(c, "USER_CREATED", current.id, id, companySlug, "", { role: requestedRole, username, email });
    const created = await targetUserWithSecurity(c, id);
    return c.json({ ok: true, data: { id, username, fullName, email, role: created.effectiveRole, mainCompanySlug: created.mainCompanySlug, isActive: Boolean(created.is_active), mfaEnabled: false, approvalRequired: Boolean(created.approval_required) } }, 201);
  });

  app.patch("/api/admin/users/:id", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const target = await targetUserWithSecurity(c, c.req.param("id"));
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    if (!isSuper(current.role) && !adminCanManage(current, target)) return c.json(jsonError("FORBIDDEN", "Bu kullanıcıyı yönetemezsiniz."), 403);
    const body = await bodyOf(c);
    const requestedRole = upper(body.role || target.effectiveRole);
    if (!isSuper(current.role) && ["SUPER_ADMIN", "COMPANY_ADMIN", "ADMIN"].includes(requestedRole)) return c.json(jsonError("FORBIDDEN", "Yönetici rolü yalnız uygulama yöneticisi tarafından atanabilir."), 403);
    const companySlug = isSuper(current.role) ? text(body.mainCompanySlug || target.mainCompanySlug) : text(current.mainCompanySlug);
    const email = body.email === undefined ? text(target.email) : text(body.email).toLocaleLowerCase("tr-TR");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_INVALID", "Geçerli bir e-posta adresi girin."), 400);
    const timestamp = nowIso();
    const storedRole = requestedRole === "SUPER_ADMIN" ? "ADMIN" : requestedRole === "COMPANY_ADMIN" ? "VIEWER" : requestedRole;
    await c.env.DB.prepare(
      `UPDATE auth_users SET username=?,full_name=?,role=?,is_active=?,must_change_password=?,updated_at=? WHERE id=?`,
    ).bind(text(body.username || target.username).toLocaleLowerCase("tr-TR"), text(body.fullName || target.full_name), storedRole,
      boolValue(body.isActive, Boolean(target.is_active)) ? 1 : 0, boolValue(body.mustChangePassword, Boolean(target.must_change_password)) ? 1 : 0, timestamp, target.id).run();
    await c.env.DB.prepare(
      `UPDATE auth_user_security SET email=?,main_company_slug=?,role_override=?,email_verified=?,approval_required=?,updated_at=? WHERE user_id=?`,
    ).bind(email || null, companySlug || DEFAULT_COMPANY_SLUG, roleOverride(requestedRole), boolValue(body.emailVerified, Boolean(target.email_verified)) ? 1 : 0,
      ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(requestedRole) ? 0 : (boolValue(body.approvalRequired, Boolean(target.approval_required)) ? 1 : 0), timestamp, target.id).run();
    if (!boolValue(body.isActive, Boolean(target.is_active))) await revokeUserSessions(c, target.id, current.id);
    await audit(c, "USER_UPDATED", current.id, target.id, companySlug, "", { role: requestedRole, email });
    const updated = await targetUserWithSecurity(c, target.id);
    return c.json({ ok: true, data: { id: updated.id, username: updated.username, fullName: updated.full_name, email: updated.email, role: updated.effectiveRole, mainCompanySlug: updated.mainCompanySlug, isActive: Boolean(updated.is_active), mfaEnabled: Boolean(updated.mfa_enabled), emailVerified: Boolean(updated.email_verified), approvalRequired: Boolean(updated.approval_required) } });
  });

  app.post("/api/admin/users/:id/reset-password", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor."), 403);
    const body = await bodyOf(c);
    const password = String(body.password || "");
    if (password.length < 6) return c.json(jsonError("PASSWORD_TOO_SHORT", "Parola en az 6 karakter olmalıdır."), 400);
    await c.env.DB.prepare("UPDATE auth_users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?").bind(await hash(password, 10), nowIso(), target.id).run();
    await revokeUserSessions(c, target.id, current.id);
    await audit(c, "PASSWORD_RESET", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true });
  });

  app.post("/api/admin/users/:id/activate", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor."), 403);
    await c.env.DB.prepare("UPDATE auth_users SET is_active=1,updated_at=? WHERE id=?").bind(nowIso(), target.id).run();
    await audit(c, "USER_ACTIVATED", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true });
  });

  app.post("/api/admin/users/:id/deactivate", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor."), 403);
    await c.env.DB.prepare("UPDATE auth_users SET is_active=0,updated_at=? WHERE id=?").bind(nowIso(), target.id).run();
    await revokeUserSessions(c, target.id, current.id);
    await audit(c, "USER_DEACTIVATED", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true });
  });

  app.get("/api/admin/users/:id/permissions", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu kullanıcıyı görüntüleyemezsiniz."), 403);
    return c.json({ ok: true, data: await permissionRows(c, target.id, target.effectiveRole) });
  });

  app.put("/api/admin/users/:id/permissions", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu kullanıcıyı yönetemezsiniz."), 403);
    const body = await bodyOf(c);
    const rows = Array.isArray(body.permissions) ? body.permissions : [];
    await c.env.DB.prepare("DELETE FROM auth_user_module_permissions WHERE user_id=?").bind(target.id).run();
    const timestamp = nowIso();
    for (const row of rows) {
      const moduleKey = upper(row.moduleKey || row.module_key);
      if (!MODULE_KEYS.includes(moduleKey)) continue;
      await c.env.DB.prepare(
        `INSERT INTO auth_user_module_permissions(id,user_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), target.id, moduleKey, boolValue(row.canView) ? 1 : 0, boolValue(row.canCreate) ? 1 : 0, boolValue(row.canUpdate) ? 1 : 0, boolValue(row.canDelete) ? 1 : 0, boolValue(row.canApprove) ? 1 : 0, timestamp, timestamp).run();
    }
    await revokeUserSessions(c, target.id, current.id);
    await audit(c, "PERMISSIONS_UPDATED", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true, data: await permissionRows(c, target.id, target.effectiveRole) });
  });

  app.get("/api/admin/security/sessions", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const timestamp = nowIso();
    const result = await c.env.DB.prepare(
      `SELECT s.*,u.username,u.full_name,us.email,us.role_override
         FROM auth_sessions s
         JOIN auth_users u ON u.id=s.user_id
         LEFT JOIN auth_user_security us ON us.user_id=u.id
        WHERE s.revoked_at IS NULL AND s.expires_at>?
        ORDER BY s.created_at DESC`,
    ).bind(timestamp).all<AnyRow>();
    const data = (result.results || []).filter((row: AnyRow) => isSuper(current.role) || (text(row.main_company_slug) === text(current.mainCompanySlug) && !["SUPER_ADMIN", "ADMIN"].includes(effectiveRole(row, row)))).map((row: AnyRow) => ({
      id: row.id, userId: row.user_id, username: row.username, fullName: row.full_name, email: row.email,
      role: effectiveRole(row, row), mainCompanySlug: row.main_company_slug, deviceLabel: row.device_label,
      ipAddress: row.ip_address, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at,
      remainingSeconds: Math.max(0, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000)),
    }));
    return c.json({ ok: true, data });
  });

  app.post("/api/admin/security/sessions/:id/revoke", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const session = await c.env.DB.prepare("SELECT * FROM auth_sessions WHERE id=? LIMIT 1").bind(c.req.param("id")).first<AnyRow>();
    if (!session) return c.json(jsonError("SESSION_NOT_FOUND", "Oturum bulunamadı."), 404);
    const target = await targetUserWithSecurity(c, text(session.user_id));
    if (!target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu oturumu kapatamazsınız."), 403);
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL").bind(nowIso(), current.id, session.id).run();
    await audit(c, "SESSION_REVOKED", current.id, target.id, target.mainCompanySlug, session.id);
    return c.json({ ok: true });
  });

  app.post("/api/admin/security/users/:id/revoke-all", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu kullanıcının oturumlarını kapatamazsınız."), 403);
    await revokeUserSessions(c, target.id, current.id);
    await audit(c, "ALL_SESSIONS_REVOKED", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true });
  });

  app.get("/api/admin/security/approvals", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    await c.env.DB.prepare("UPDATE auth_login_approvals SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=?").bind(nowIso()).run();
    const result = await c.env.DB.prepare(
      `SELECT a.*,u.username,u.full_name,s.email,s.role_override
         FROM auth_login_approvals a
         JOIN auth_users u ON u.id=a.user_id
         LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE a.status='PENDING' AND a.expires_at>?
        ORDER BY a.requested_at ASC`,
    ).bind(nowIso()).all<AnyRow>();
    const data = (result.results || []).filter((row: AnyRow) => isSuper(current.role) || (text(row.main_company_slug) === text(current.mainCompanySlug) && !["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(effectiveRole(row, row)))).map((row: AnyRow) => ({
      id: row.id, userId: row.user_id, username: row.username, fullName: row.full_name, email: row.email,
      mainCompanySlug: row.main_company_slug, deviceLabel: row.device_label, ipAddress: row.ip_address,
      requestedAt: row.requested_at, expiresAt: row.expires_at,
    }));
    return c.json({ ok: true, data });
  });

  app.post("/api/admin/security/approvals/:id/approve", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const approval = await c.env.DB.prepare("SELECT * FROM auth_login_approvals WHERE id=? AND status='PENDING' AND expires_at>? LIMIT 1").bind(c.req.param("id"), nowIso()).first<AnyRow>();
    if (!approval) return c.json(jsonError("APPROVAL_NOT_FOUND", "Bekleyen giriş isteği bulunamadı veya süresi doldu."), 404);
    const target = await targetUserWithSecurity(c, text(approval.user_id));
    if (!target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu girişi onaylayamazsınız."), 403);
    await c.env.DB.prepare("UPDATE auth_login_approvals SET status='APPROVED',decided_at=?,decided_by=? WHERE id=? AND status='PENDING'").bind(nowIso(), current.id, approval.id).run();
    await audit(c, "LOGIN_APPROVED", current.id, target.id, target.mainCompanySlug, "", { approvalId: approval.id });
    return c.json({ ok: true });
  });

  app.post("/api/admin/security/approvals/:id/deny", async (c: any) => {
    const current = await adminCurrent(c);
    if (!current) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    const approval = await c.env.DB.prepare("SELECT * FROM auth_login_approvals WHERE id=? AND status='PENDING' LIMIT 1").bind(c.req.param("id")).first<AnyRow>();
    if (!approval) return c.json(jsonError("APPROVAL_NOT_FOUND", "Bekleyen giriş isteği bulunamadı."), 404);
    const target = await targetUserWithSecurity(c, text(approval.user_id));
    if (!target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu girişi reddedemezsiniz."), 403);
    await c.env.DB.prepare("UPDATE auth_login_approvals SET status='DENIED',decided_at=?,decided_by=? WHERE id=? AND status='PENDING'").bind(nowIso(), current.id, approval.id).run();
    await audit(c, "LOGIN_DENIED", current.id, target.id, target.mainCompanySlug, "", { approvalId: approval.id });
    return c.json({ ok: true });
  });

  app.post("/api/admin/security/users/:id/reset-mfa", async (c: any) => {
    const current = await adminCurrent(c);
    const target = current ? await targetUserWithSecurity(c, c.req.param("id")) : null;
    if (!current || !target || (!isSuper(current.role) && !adminCanManage(current, target))) return c.json(jsonError("FORBIDDEN", "Bu kullanıcının Authenticator kaydını sıfırlayamazsınız."), 403);
    await c.env.DB.prepare("UPDATE auth_user_security SET mfa_secret=NULL,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(nowIso(), target.id).run();
    await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL").bind(nowIso(), target.id).run();
    await revokeUserSessions(c, target.id, current.id);
    await audit(c, "MFA_RESET", current.id, target.id, target.mainCompanySlug);
    return c.json({ ok: true });
  });
}
