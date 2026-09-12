// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";
import { turnstilePublicConfig, verifyTurnstileForLogin } from "./turnstile-cloud";
import {
  cancelPhoneApproval,
  consumePhoneApproval,
  notifyManagerApproval,
  phoneApprovalFromRequest,
  resendPhoneApprovalChallenge,
  startPhoneApprovalChallenge,
  verifySecurityLoginCode,
} from "./auth-push-cloud";

const DEFAULT_COMPANY_SLUG = "mecit-hakan";
const CHALLENGE_SECONDS = 10 * 60;
const APPROVAL_SECONDS = 15 * 60;
const OWNER_RECOVERY_SECONDS = 10 * 60;
const OWNER_RECOVERY_LOCK_SECONDS = 30 * 60;
const OWNER_RECOVERY_MAX_ATTEMPTS = 5;
const OWNER_RECOVERY_MAX_SENDS_HOUR = 5;
const OWNER_RECOVERY_RESEND_SECONDS = 60;
const QUESTION_ITERATIONS = 180000;
const MFA_PROVIDERS = ["GOOGLE", "MICROSOFT"];
const LOGIN_POLICIES = ["PASSWORD_ONLY", "GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"];
const SESSION_PRESETS = [1800, 3600, 7200, 14400, 28800, 36000, 43200, 86400];
const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "GUNLUK_OPERASYON", "ISNET", "MAIL", "STORAGE_ADMIN", "COMPLIANCE", "ASISTAN", "ADMIN", "RAPORLAR",
];
const ISSUER = "KY ERP";
const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
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
function clientIp(c: any) {
  return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]);
}
function userAgent(c: any) {
  return text(c.req.header("User-Agent")).slice(0, 300);
}
function deviceLabel(c: any, body: AnyRow = {}) {
  return text(body.deviceLabel || c.req.header("X-KYERP-Device") || userAgent(c)).slice(0, 180);
}
function requestId(c: any) {
  return text(c.get?.("requestId")) || "unknown";
}
function logAuthError(c: any, phase: string, error: unknown, detail: AnyRow = {}) {
  console.error(JSON.stringify({
    level: "error",
    requestId: requestId(c),
    phase,
    path: c.req.path,
    message: error instanceof Error ? error.message : String(error),
    ...detail,
  }));
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
}
function jsonError(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function isSuper(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function isCompanyAdmin(role: unknown) {
  return upper(role) === "COMPANY_ADMIN";
}
function normalizeProvider(value: unknown) {
  const provider = upper(value);
  return MFA_PROVIDERS.includes(provider) ? provider : "";
}
function providerLabel(provider: string) {
  return provider === "MICROSOFT" ? "Microsoft Authenticator" : "Google Authenticator";
}
function normalizePolicy(value: unknown, fallback = "ANY_MFA") {
  const policy = upper(value);
  return LOGIN_POLICIES.includes(policy) ? policy : fallback;
}
function policyLabel(policy: string) {
  return {
    PASSWORD_ONLY: "Sadece parola",
    GOOGLE: "Parola + Google Authenticator",
    MICROSOFT: "Parola + Microsoft Authenticator",
    ANY_MFA: "Parola + Google veya Microsoft",
    BOTH_MFA: "Parola + Google ve Microsoft",
  }[policy] || "Parola + Google veya Microsoft";
}
function normalizeSessionSeconds(value: unknown, fallback = 36000) {
  const parsed = Number(value);
  return SESSION_PRESETS.includes(parsed) ? parsed : fallback;
}
function effectiveSessionSeconds(security: AnyRow, role: string) {
  const policy = effectivePolicy(security, role);
  if (policy === "PASSWORD_ONLY") return 28800;
  return 36000;
}
function effectivePolicy(security: AnyRow, role: string) {
  if (isSuper(role)) return "ANY_MFA";
  return normalizePolicy(security.login_policy, "ANY_MFA");
}
function providerSecret(security: AnyRow, provider: string) {
  return provider === "MICROSOFT" ? text(security.microsoft_mfa_secret) : text(security.google_mfa_secret);
}
function providerEnabled(security: AnyRow, provider: string) {
  return provider === "MICROSOFT" ? Boolean(security.microsoft_mfa_enabled) : Boolean(security.google_mfa_enabled);
}
function enabledProviders(security: AnyRow) {
  return MFA_PROVIDERS.filter((provider) => providerEnabled(security, provider));
}
function normalizeAnswer(value: unknown) {
  return text(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");
}
function maskEmail(value: unknown) {
  const email = text(value);
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
function maskPhone(value: unknown) {
  const raw = text(value).replace(/\s+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return raw ? "***" : "";
  return `${raw.startsWith("+") ? "+" : ""}${digits.slice(0, 2)}** *** **${digits.slice(-2)}`;
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
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = signature[signature.length - 1] & 15;
  const binary = ((signature[offset] & 127) << 24) | ((signature[offset + 1] & 255) << 16) | ((signature[offset + 2] & 255) << 8) | (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
async function verifyTotp(secret: string, code: unknown) {
  const candidate = text(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate) || !secret) return false;
  for (const offset of [-1, 0, 1]) {
    if (safeEqual(await totpCode(secret, Date.now() + offset * 30_000), candidate)) return true;
  }
  return false;
}
function otpauthUri(secret: string, account: string, provider: string) {
  const providerIssuer = `${ISSUER} ${provider === "MICROSOFT" ? "Microsoft" : "Google"}`;
  const label = `${providerIssuer}:${account || "Kullanici"}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(providerIssuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function pbkdf2Hash(value: string, salt: string, iterations = QUESTION_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    material,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}
async function hashQuestionAnswer(answer: unknown, salt = randomToken(18), iterations = QUESTION_ITERATIONS) {
  const normalized = normalizeAnswer(answer);
  return { hash: await pbkdf2Hash(normalized, salt, iterations), salt, iterations };
}
async function verifyQuestionAnswer(answer: unknown, row: AnyRow) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  const expected = await pbkdf2Hash(normalized, text(row.answer_salt), Number(row.answer_iterations || QUESTION_ITERATIONS));
  return safeEqual(expected, text(row.answer_hash));
}

async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return Boolean(row?.name);
}

async function tableColumnNames(c: any, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const rows = (await c.env.DB.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all<AnyRow>()).results || [];
  return new Set(rows.map((row: AnyRow) => text(row.name)));
}
async function addColumnIfMissing(c: any, table: string, column: string, definition: string) {
  const columns = await tableColumnNames(c, table);
  if (columns.has(column)) return;
  try {
    await c.env.DB.prepare(`ALTER TABLE "${table.replace(/"/g, '""')}" ADD COLUMN ${definition}`).run();
  } catch (error) {
    const refreshed = await tableColumnNames(c, table);
    if (!refreshed.has(column)) throw error;
  }
}
async function ensureOwnerRecoverySchema(c: any) {
  if (!(await tableExists(c, "auth_user_security")) || !(await tableExists(c, "auth_login_challenges"))) {
    throw new Error("AUTH_SECURITY_BASELINE_TABLES_MISSING");
  }

  const securityColumns: Array<[string,string]> = [
    ["google_mfa_secret","google_mfa_secret TEXT"],
    ["google_mfa_enabled","google_mfa_enabled INTEGER NOT NULL DEFAULT 0"],
    ["microsoft_mfa_secret","microsoft_mfa_secret TEXT"],
    ["microsoft_mfa_enabled","microsoft_mfa_enabled INTEGER NOT NULL DEFAULT 0"],
    ["recovery_codes_acknowledged","recovery_codes_acknowledged INTEGER NOT NULL DEFAULT 0"],
    ["login_policy","login_policy TEXT NOT NULL DEFAULT 'ANY_MFA'"],
    ["session_seconds","session_seconds INTEGER NOT NULL DEFAULT 36000"],
    ["recovery_phone","recovery_phone TEXT"],
    ["recovery_phone_verified","recovery_phone_verified INTEGER NOT NULL DEFAULT 0"],
    ["owner_recovery_enabled","owner_recovery_enabled INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [column, definition] of securityColumns) await addColumnIfMissing(c, "auth_user_security", column, definition);

  const challengeColumns: Array<[string,string]> = [
    ["policy_snapshot","policy_snapshot TEXT"],
    ["session_seconds_snapshot","session_seconds_snapshot INTEGER"],
    ["google_verified_at","google_verified_at TEXT"],
    ["microsoft_verified_at","microsoft_verified_at TEXT"],
  ];
  for (const [column, definition] of challengeColumns) await addColumnIfMissing(c, "auth_login_challenges", column, definition);

  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_owner_recovery_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      answer_salt TEXT NOT NULL,
      answer_iterations INTEGER NOT NULL DEFAULT 180000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, position)
    )`),
    c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_questions_user ON auth_owner_recovery_questions(user_id, position)"),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_owner_recovery_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination_masked TEXT,
      challenge_token_hash TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      otp_salt TEXT NOT NULL,
      question_ids TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      answer_attempt_count INTEGER NOT NULL DEFAULT 0,
      send_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      locked_until TEXT,
      verified_at TEXT,
      consumed_at TEXT,
      ip_address TEXT
    )`),
    c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_challenges_user ON auth_owner_recovery_challenges(user_id, created_at DESC)"),
    c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_challenges_active ON auth_owner_recovery_challenges(user_id, consumed_at, expires_at)"),
  ]);
}
async function ensureOwnerRecoveryOrResponse(c: any) {
  try {
    await ensureOwnerRecoverySchema(c);
    return null;
  } catch (error) {
    logAuthError(c, "OWNER_RECOVERY_SCHEMA_READINESS", error);
    return c.json(
      jsonError(
        "OWNER_RECOVERY_SCHEMA_UNAVAILABLE",
        "Hesap kurtarma veritabanı hazırlanamadı. Güvenlik soruları korunarak işlem durduruldu; lütfen sayfayı yenileyip tekrar deneyin.",
      ),
      503,
    );
  }
}
async function retireLegacyRecoveryCodes(c: any, userId: string) {
  if (!(await tableExists(c, "auth_recovery_codes"))) return;
  const timestamp = nowIso();
  await c.env.DB.prepare("UPDATE auth_recovery_codes SET used_at=COALESCE(used_at,?) WHERE user_id=? AND used_at IS NULL").bind(timestamp, userId).run();
}
async function securityFor(c: any, userId: string) {
  return (await c.env.DB.prepare("SELECT * FROM auth_user_security WHERE user_id=? LIMIT 1").bind(userId).first<AnyRow>()) || {};
}
async function userByIdentity(c: any, identity: string) {
  if (!(await tableExists(c, "auth_users"))) return null;
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.password_hash,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,
            s.email,s.main_company_slug,s.role_override,s.mfa_secret,s.mfa_enabled,
            s.google_mfa_secret,s.google_mfa_enabled,s.microsoft_mfa_secret,s.microsoft_mfa_enabled,
            s.email_verified,s.approval_required,s.login_policy,s.session_seconds,s.recovery_phone,
            s.recovery_phone_verified,s.owner_recovery_enabled
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE LOWER(u.username)=LOWER(?) OR LOWER(COALESCE(s.email,''))=LOWER(?) LIMIT 1`,
  ).bind(identity, identity).first<AnyRow>();
}
async function userById(c: any, userId: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.password_hash,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,
            s.email,s.main_company_slug,s.role_override,s.mfa_secret,s.mfa_enabled,
            s.google_mfa_secret,s.google_mfa_enabled,s.microsoft_mfa_secret,s.microsoft_mfa_enabled,
            s.email_verified,s.approval_required,s.login_policy,s.session_seconds,s.recovery_phone,
            s.recovery_phone_verified,s.owner_recovery_enabled
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(userId).first<AnyRow>();
}
function roleOf(user: AnyRow) {
  const override = upper(user.role_override);
  const role = override || upper(user.role) || "VIEWER";
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
async function permissionRows(c: any, userId: string, role: string) {
  if (isSuper(role)) return MODULE_KEYS.map((moduleKey) => ({ moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true }));
  if (!(await tableExists(c, "auth_user_module_permissions"))) return isCompanyAdmin(role) ? [
    { moduleKey: "ADMIN", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true },
    { moduleKey: "STORAGE_ADMIN", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true },
  ] : [];
  const rows = (await c.env.DB.prepare(
    `SELECT module_key,can_view,can_create,can_update,can_delete,can_approve FROM auth_user_module_permissions WHERE user_id=? ORDER BY module_key`,
  ).bind(userId).all()).results || [];
  const mapped = rows.map((row: AnyRow) => ({
    moduleKey: upper(row.module_key), canView: Boolean(row.can_view), canCreate: Boolean(row.can_create),
    canUpdate: Boolean(row.can_update), canDelete: Boolean(row.can_delete), canApprove: Boolean(row.can_approve),
  }));
  if (isCompanyAdmin(role)) {
    if (!mapped.some((row: AnyRow) => row.moduleKey === "ADMIN")) mapped.push({ moduleKey: "ADMIN", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true });
    if (!mapped.some((row: AnyRow) => row.moduleKey === "STORAGE_ADMIN")) mapped.push({ moduleKey: "STORAGE_ADMIN", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true });
    if (!mapped.some((row: AnyRow) => row.moduleKey === "COMPLIANCE")) mapped.push({ moduleKey: "COMPLIANCE", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true });
  }
  return mapped;
}
async function publicUser(c: any, user: AnyRow) {
  const role = roleOf(user);
  const policy = effectivePolicy(user, role);
  return {
    id: text(user.id), username: text(user.username), email: text(user.email),
    fullName: text(user.full_name || user.username || "Kullanıcı"), role,
    mainCompanySlug: text(user.main_company_slug) || DEFAULT_COMPANY_SLUG,
    mustChangePassword: Boolean(user.must_change_password),
    mfaEnabled: Boolean(user.google_mfa_enabled || user.microsoft_mfa_enabled),
    googleMfaEnabled: Boolean(user.google_mfa_enabled),
    microsoftMfaEnabled: Boolean(user.microsoft_mfa_enabled),
    emailVerified: Boolean(user.email_verified), approvalRequired: isSuper(role) || isCompanyAdmin(role) ? false : Boolean(user.approval_required),
    loginPolicy: policy, loginPolicyLabel: policyLabel(policy),
    sessionSeconds: effectiveSessionSeconds(user, role),
    permissions: await permissionRows(c, text(user.id), role),
  };
}
async function audit(c: any, action: string, actorUserId = "", targetUserId = "", companySlug = "", sessionId = "", detail: AnyRow = {}) {
  try {
    if (!(await tableExists(c, "auth_security_audit"))) return;
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorUserId || null, targetUserId || null, companySlug || null, action, sessionId || null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso()).run();
  } catch (error) {
    logAuthError(c, "AUTH_AUDIT_WRITE", error, { action, targetUserId });
  }
}

async function sessionSecret(c: any) {
  let row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key='SESSION_HMAC' LIMIT 1").first<AnyRow>();
  if (!row?.secret_value) {
    const candidate = randomToken(32);
    const timestamp = nowIso();
    await c.env.DB.prepare(`INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at) VALUES ('SESSION_HMAC',?,?,?)`).bind(candidate, timestamp, timestamp).run();
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
async function issueSession(c: any, user: AnyRow, source: AnyRow = {}) {
  const refreshed = await userById(c, text(user.id));
  const security = refreshed || user;
  const role = roleOf(security);
  const policy = effectivePolicy(security, role);
  const ttl = effectiveSessionSeconds(security, role);
  const sid = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + ttl) * 1000).toISOString();
  const token = await createSignedToken(c, {
    sid, sub: text(user.id), username: text(user.username), role,
    company: text(security.main_company_slug) || DEFAULT_COMPANY_SLUG,
    policy, iat: now, exp: now + ttl,
  });
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO auth_sessions(id,user_id,main_company_slug,token_hash,role_at_login,device_label,user_agent,ip_address,created_at,approved_at,expires_at,last_seen_at,approval_request_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    sid, user.id, text(security.main_company_slug) || DEFAULT_COMPANY_SLUG, await sha256(token), role,
    text(source.deviceLabel || source.device_label || deviceLabel(c, source)), text(source.userAgent || source.user_agent || userAgent(c)),
    text(source.ipAddress || source.ip_address || clientIp(c)), timestamp, timestamp, expiresAt, timestamp,
    text(source.approvalRequestId || source.approval_request_id) || null,
  ).run();
  try {
    await c.env.DB.prepare("UPDATE auth_users SET last_login_at=?,updated_at=? WHERE id=?").bind(timestamp, timestamp, user.id).run();
  } catch (error) {
    logAuthError(c, "AUTH_LAST_LOGIN_WRITE", error, { userId: user.id, sessionId: sid });
  }
  await audit(c, "SESSION_CREATED_POLICY", user.id, user.id, text(security.main_company_slug), sid, { policy, ttl, expiresAt });
  return { ok: true, stage: "AUTHENTICATED", token, expiresIn: ttl, expiresAt, user: await publicUser(c, security) };
}

function challengeSource(c: any, source: AnyRow = {}) {
  return {
    deviceLabel: text(source.deviceLabel || source.device_label || deviceLabel(c, source)),
    userAgent: text(source.userAgent || source.user_agent || userAgent(c)),
    ipAddress: text(source.ipAddress || source.ip_address || clientIp(c)),
  };
}
async function createChallenge(c: any, user: AnyRow, type: string, source: AnyRow = {}, policy = "", ttl = 0) {
  const id = crypto.randomUUID();
  const challengeToken = randomToken(24);
  const timestamp = nowIso();
  const resolved = challengeSource(c, source);
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_login_challenges
       (id,user_id,challenge_type,challenge_token_hash,device_label,user_agent,ip_address,created_at,expires_at,policy_snapshot,session_seconds_snapshot,google_verified_at,microsoft_verified_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, user.id, type, await sha256(challengeToken), resolved.deviceLabel, resolved.userAgent, resolved.ipAddress,
      timestamp, addSeconds(CHALLENGE_SECONDS), policy || null, ttl || null, null, null).run();
  } catch (error) {
    logAuthError(c, "AUTH_CHALLENGE_INSERT", error, { userId: user.id, challengeType: type });
    throw error;
  }
  return { id, challengeToken, ...resolved };
}
async function challengeFromRequest(c: any, body: AnyRow) {
  const challenge = await c.env.DB.prepare(`SELECT * FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`).bind(text(body.challengeId), nowIso()).first<AnyRow>();
  if (!challenge) return null;
  return safeEqual(text(challenge.challenge_token_hash), await sha256(text(body.challengeToken))) ? challenge : null;
}
async function consumeChallenge(c: any, challenge: AnyRow) {
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(nowIso(), challenge.id).run();
}
async function revokeSecurityState(c: any, userId: string, actorUserId = "", reason = "SECURITY_POLICY_CHANGED") {
  const timestamp = nowIso();
  await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL").bind(timestamp, actorUserId || userId, userId).run();
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL").bind(timestamp, userId).run();
  await c.env.DB.prepare("UPDATE auth_login_approvals SET status='DENIED',decided_at=?,decided_by=?,consumed_at=COALESCE(consumed_at,?) WHERE user_id=? AND status IN ('PENDING','APPROVED')").bind(timestamp, actorUserId || userId, timestamp, userId).run();
  const user = await userById(c, userId);
  await audit(c, reason, actorUserId || userId, userId, text(user?.main_company_slug), "", {});
}

async function beginProviderSetup(c: any, user: AnyRow, providerValue: unknown, source: AnyRow = {}, specialPrefix = "POLICY") {
  const provider = normalizeProvider(providerValue);
  if (!provider) throw new Error("Geçersiz Authenticator sağlayıcısı.");
  const secret = newTotpSecret();
  const timestamp = nowIso();
  if (provider === "MICROSOFT") {
    await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_secret=?,microsoft_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  } else {
    await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=?,google_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  }
  const refreshed = await userById(c, user.id);
  const role = roleOf(refreshed || user);
  const policy = effectivePolicy(refreshed || user, role);
  const ttl = effectiveSessionSeconds(refreshed || user, role);
  const challenge = await createChallenge(c, user, `${specialPrefix}_MFA_SETUP_${provider}`, source, policy, ttl);
  const account = text(refreshed?.email || user.username);
  await audit(c, "MFA_PROVIDER_SETUP_STARTED_POLICY", user.id, user.id, text(refreshed?.main_company_slug), "", { provider, specialPrefix, policy });
  return {
    ok: true, stage: "MFA_SETUP", provider, providerLabel: providerLabel(provider),
    challengeId: challenge.id, challengeToken: challenge.challengeToken, challengeExpiresAt: addSeconds(CHALLENGE_SECONDS),
    secret, otpauthUri: otpauthUri(secret, account, provider), policy, policyLabel: policyLabel(policy),
    recoveryReenroll: specialPrefix === "OWNER_RECOVERY",
    message: `${providerLabel(provider)} için KY ERP QR kodunu okutun ve oluşan 6 haneli kodu doğrulayın.`,
  };
}
async function ownerRecoveryReadiness(c: any, user: AnyRow) {
  try {
    await ensureOwnerRecoverySchema(c);
    const questions = Number((await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_owner_recovery_questions WHERE user_id=?").bind(user.id).first<AnyRow>())?.total || 0);
    const caps = deliveryCapabilities(c);
    const emailReady = Boolean(user.email_verified && text(user.email) && caps.email);
    const smsReady = Boolean(user.recovery_phone_verified && text(user.recovery_phone) && caps.sms);
    return { ready: questions >= 3 && (emailReady || smsReady), schemaReady: true, questionsConfigured: questions >= 3, emailReady, smsReady, capabilities: caps };
  } catch (error) {
    logAuthError(c, "OWNER_RECOVERY_READINESS", error, { userId: text(user?.id) });
    const caps = deliveryCapabilities(c);
    return { ready: false, schemaReady: false, questionsConfigured: false, emailReady: false, smsReady: false, capabilities: caps };
  }
}
async function afterFactors(c: any, user: AnyRow, source: AnyRow) {
  const refreshed = await userById(c, user.id);
  const role = roleOf(refreshed || user);
  const approvalRequired = Boolean(refreshed?.approval_required) && !isSuper(role) && !isCompanyAdmin(role);
  if (!approvalRequired) return issueSession(c, refreshed || user, source);
  const id = crypto.randomUUID();
  const approvalToken = randomToken(24);
  const timestamp = nowIso();
  const companySlug = text(refreshed?.main_company_slug) || DEFAULT_COMPANY_SLUG;
  const resolved = challengeSource(c, source);
  await c.env.DB.prepare(
    `INSERT INTO auth_login_approvals(id,user_id,main_company_slug,approval_token_hash,status,device_label,user_agent,ip_address,requested_at,expires_at)
     VALUES (?,?,?,?, 'PENDING',?,?,?,?,?)`,
  ).bind(id, user.id, companySlug, await sha256(approvalToken), resolved.deviceLabel, resolved.userAgent, resolved.ipAddress, timestamp, addSeconds(APPROVAL_SECONDS)).run();
  await audit(c, "LOGIN_APPROVAL_REQUESTED_POLICY", user.id, user.id, companySlug, "", { approvalId: id });
  const pushDispatch = notifyManagerApproval(c, id, companySlug);
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(pushDispatch);
  else await pushDispatch;
  return { ok: true, stage: "APPROVAL_PENDING", approvalId: id, approvalToken, approvalExpiresAt: addSeconds(APPROVAL_SECONDS), message: "Giriş doğrulandı. Firma Sahibi onayı bekleniyor." };
}
async function beginPolicyLogin(c: any, user: AnyRow, source: AnyRow = {}, options: AnyRow = {}) {
  const refreshed = await userById(c, user.id);
  const role = roleOf(refreshed || user);
  const policy = effectivePolicy(refreshed || user, role);
  const ttl = effectiveSessionSeconds(refreshed || user, role);
  const available = enabledProviders(refreshed || user);
  const ownerRecovery = isSuper(role) ? await ownerRecoveryReadiness(c, refreshed || user) : { ready: false };

  // Telefon onayı kayıtlı güvenilir cihaz varsa her normal girişte ilk denenir.
  // Böylece eski/taşınmış MFA kolonları kullanıcıyı istemeden Google'a göndermez.
  // BOTH_MFA özel politikası iki ayrı Authenticator kanalı istediği için korunur.
  if (!options.skipPhone && policy !== "BOTH_MFA") {
    const phoneApproval = await startPhoneApprovalChallenge(c, refreshed || user, source);
    if (phoneApproval) return phoneApproval;
  }

  if (Boolean(refreshed?.mfa_enabled) && text(refreshed?.mfa_secret) && !available.length) {
    const challenge = await createChallenge(c, refreshed || user, "POLICY_MFA_LEGACY_REQUIRED", source, policy, ttl);
    return {
      ok: true,
      stage: "MFA_LEGACY_REQUIRED",
      challengeId: challenge.id,
      challengeToken: challenge.challengeToken,
      challengeExpiresAt: addSeconds(CHALLENGE_SECONDS),
      message: "Mevcut Authenticator kodunuzu doğrulayın. Ardından güvenli MFA kaydınız korunarak güncellenecektir.",
    };
  }

  if (policy === "PASSWORD_ONLY") {
    await audit(c, "PASSWORD_ONLY_LOGIN_ACCEPTED", user.id, user.id, text(refreshed?.main_company_slug), "", { ttl });
    return afterFactors(c, refreshed || user, source);
  }

  if (policy === "GOOGLE" && !available.includes("GOOGLE")) return beginProviderSetup(c, refreshed || user, "GOOGLE", source);
  if (policy === "MICROSOFT" && !available.includes("MICROSOFT")) return beginProviderSetup(c, refreshed || user, "MICROSOFT", source);
  if (policy === "BOTH_MFA") {
    if (!available.includes("GOOGLE")) return beginProviderSetup(c, refreshed || user, "GOOGLE", source);
    if (!available.includes("MICROSOFT")) return beginProviderSetup(c, refreshed || user, "MICROSOFT", source);
  }
  if (policy === "ANY_MFA" && !available.length) return beginProviderSetup(c, refreshed || user, "GOOGLE", source);

  const allowed = policy === "GOOGLE" ? ["GOOGLE"] : policy === "MICROSOFT" ? ["MICROSOFT"] : policy === "BOTH_MFA" ? ["GOOGLE", "MICROSOFT"] : available;
  const challenge = await createChallenge(c, refreshed || user, "POLICY_MFA_REQUIRED", source, policy, ttl);
  return {
    ok: true, stage: "MFA_REQUIRED", challengeId: challenge.id, challengeToken: challenge.challengeToken,
    challengeExpiresAt: addSeconds(CHALLENGE_SECONDS), policy, policyLabel: policyLabel(policy),
    availableProviders: allowed, requiredProviders: allowed, verifiedProviders: [],
    requireBoth: policy === "BOTH_MFA", ownerRecoveryAvailable: Boolean(ownerRecovery.ready),
    recoveryChannels: isSuper(role) ? { email: Boolean(ownerRecovery.emailReady), sms: Boolean(ownerRecovery.smsReady) } : undefined,
    message: policy === "BOTH_MFA" ? "Google ve Microsoft Authenticator kodlarının ikisi de gereklidir." : `${policyLabel(policy)} ile doğrulayın.`,
  };
}

function deliveryCapabilities(c: any) {
  const env = c.env as AnyRow;
  const email = Boolean(env.RESEND_API_KEY || env.RECOVERY_EMAIL_WEBHOOK_URL);
  const sms = Boolean((env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) || env.RECOVERY_SMS_WEBHOOK_URL);
  return { email, sms };
}
async function sendRecoveryEmail(c: any, destination: string, code: string) {
  const env = c.env as AnyRow;
  if (env.RECOVERY_EMAIL_WEBHOOK_URL) {
    const response = await fetch(text(env.RECOVERY_EMAIL_WEBHOOK_URL), {
      method: "POST", headers: { "Content-Type": "application/json", ...(env.RECOVERY_EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${text(env.RECOVERY_EMAIL_WEBHOOK_TOKEN)}` } : {}) },
      body: JSON.stringify({ channel: "email", to: destination, code, purpose: "KY ERP hesap kurtarma" }),
    });
    if (!response.ok) throw new Error("E-posta doğrulama servisi yanıt vermedi.");
    return;
  }
  if (!env.RESEND_API_KEY) throw new Error("E-posta doğrulama servisi bağlı değil.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${text(env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: ADMIN_EMAIL_FROM, to: [destination], subject: "KY ERP güvenlik doğrulama kodu", text: `KY ERP doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız kodu paylaşmayın.` }),
  });
  if (!response.ok) throw new Error("E-posta doğrulama kodu gönderilemedi.");
}
async function sendRecoverySms(c: any, destination: string, code: string) {
  const env = c.env as AnyRow;
  if (env.RECOVERY_SMS_WEBHOOK_URL) {
    const response = await fetch(text(env.RECOVERY_SMS_WEBHOOK_URL), {
      method: "POST", headers: { "Content-Type": "application/json", ...(env.RECOVERY_SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${text(env.RECOVERY_SMS_WEBHOOK_TOKEN)}` } : {}) },
      body: JSON.stringify({ channel: "sms", to: destination, code, purpose: "KY ERP hesap kurtarma" }),
    });
    if (!response.ok) throw new Error("SMS doğrulama servisi yanıt vermedi.");
    return;
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) throw new Error("SMS doğrulama servisi bağlı değil.");
  const form = new URLSearchParams({ To: destination, From: text(env.TWILIO_FROM_NUMBER), Body: `KY ERP doğrulama kodunuz: ${code}. Kod 10 dakika geçerlidir.` });
  const credentials = btoa(`${text(env.TWILIO_ACCOUNT_SID)}:${text(env.TWILIO_AUTH_TOKEN)}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(text(env.TWILIO_ACCOUNT_SID))}/Messages.json`, {
    method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
  });
  if (!response.ok) throw new Error("SMS doğrulama kodu gönderilemedi.");
}
function sixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}
async function createOwnerRecoveryChallenge(c: any, user: AnyRow, purpose: string, channel: string, destination: string, questions: AnyRow[] = []) {
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, MAX(created_at) AS latest FROM auth_owner_recovery_challenges WHERE user_id=? AND channel=? AND created_at>?`,
  ).bind(user.id, channel, addSeconds(-3600)).first<AnyRow>();
  if (Number(recent?.total || 0) >= OWNER_RECOVERY_MAX_SENDS_HOUR) throw new Error("Bir saatlik doğrulama kodu gönderim sınırına ulaşıldı.");
  if (recent?.latest && Date.now() - Date.parse(text(recent.latest)) < OWNER_RECOVERY_RESEND_SECONDS * 1000) throw new Error("Yeni kod istemeden önce 60 saniye bekleyin.");

  const id = crypto.randomUUID();
  const challengeToken = randomToken(24);
  const otp = sixDigitCode();
  const otpSalt = randomToken(12);
  const timestamp = nowIso();
  const masked = channel === "EMAIL" ? maskEmail(destination) : maskPhone(destination);
  await c.env.DB.prepare(
    `INSERT INTO auth_owner_recovery_challenges
     (id,user_id,purpose,channel,destination_masked,challenge_token_hash,otp_hash,otp_salt,question_ids,attempt_count,answer_attempt_count,send_count,created_at,expires_at,ip_address)
     VALUES (?,?,?,?,?,?,?,?,?,0,0,1,?,?,?)`,
  ).bind(id, user.id, purpose, channel, masked, await sha256(challengeToken), await sha256(`${otpSalt}:${otp}`), otpSalt,
    JSON.stringify(questions.map((row) => row.id)), timestamp, addSeconds(OWNER_RECOVERY_SECONDS), clientIp(c) || null).run();

  if (channel === "EMAIL") await sendRecoveryEmail(c, destination, otp);
  else await sendRecoverySms(c, destination, otp);
  await audit(c, "OWNER_RECOVERY_OTP_SENT", user.id, user.id, text(user.main_company_slug), "", { purpose, channel, masked });
  return { id, challengeToken, masked, expiresAt: addSeconds(OWNER_RECOVERY_SECONDS) };
}
async function verifyRecoveryOtp(c: any, recovery: AnyRow, otp: unknown) {
  const candidate = text(otp).replace(/\D/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  return safeEqual(await sha256(`${text(recovery.otp_salt)}:${candidate}`), text(recovery.otp_hash));
}
async function recoveryChallengeFromBody(c: any, body: AnyRow) {
  const row = await c.env.DB.prepare(
    `SELECT * FROM auth_owner_recovery_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`,
  ).bind(text(body.recoveryId), nowIso()).first<AnyRow>();
  if (!row) return null;
  if (!safeEqual(text(row.challenge_token_hash), await sha256(text(body.recoveryToken)))) return null;
  if (row.locked_until && Date.parse(text(row.locked_until)) > Date.now()) return { ...row, locked: true };
  return row;
}
async function markRecoveryFailure(c: any, row: AnyRow, answerFailure = false) {
  const attempts = Number(row.attempt_count || 0) + 1;
  const lock = attempts >= OWNER_RECOVERY_MAX_ATTEMPTS ? addSeconds(OWNER_RECOVERY_LOCK_SECONDS) : null;
  await c.env.DB.prepare(
    `UPDATE auth_owner_recovery_challenges SET attempt_count=?,answer_attempt_count=answer_attempt_count+?,locked_until=COALESCE(?,locked_until) WHERE id=?`,
  ).bind(attempts, answerFailure ? 1 : 0, lock, row.id).run();
  return { attempts, lockedUntil: lock };
}
async function stepUpOwner(c: any, current: AnyRow, providerValue: unknown, code: unknown) {
  const provider = normalizeProvider(providerValue);
  if (!provider) return false;
  const security = current.security || await securityFor(c, current.id);
  if (!providerEnabled(security, provider)) return false;
  return verifyTotp(providerSecret(security, provider), code);
}
async function updateOwnerRecoveryEnabled(c: any, userId: string) {
  const user = await userById(c, userId);
  if (!user) return false;
  const readiness = await ownerRecoveryReadiness(c, user);
  await c.env.DB.prepare("UPDATE auth_user_security SET owner_recovery_enabled=?,updated_at=? WHERE user_id=?").bind(readiness.ready ? 1 : 0, nowIso(), userId).run();
  return readiness.ready;
}

export function registerAuthPolicyRoutes(app: any) {
  app.get("/api/auth/turnstile-config", (c: any) => {
    return c.json({ ok: true, ...turnstilePublicConfig(c) });
  });

  app.post("/api/auth/login", async (c: any) => {
    const body = await bodyOf(c);
    const identity = text(body.username || body.email);
    const password = text(body.password);
    if (!identity || !password) return c.json(jsonError("CREDENTIALS_REQUIRED", "E-posta/kullanıcı adı ve şifre zorunludur."), 400);

    const turnstile = await verifyTurnstileForLogin(c, body.turnstileToken);
    if (!turnstile.ok) {
      await audit(c, "TURNSTILE_LOGIN_REJECTED", "", "", "", "", {
        identity: identity.slice(0, 80),
        code: turnstile.code,
      });
      const unavailable = Number(turnstile.status || 0) >= 500;
      return c.json(
        jsonError(
          turnstile.code,
          unavailable
            ? "Güvenlik doğrulama servisi geçici olarak kullanılamıyor. Kısa süre sonra tekrar deneyin."
            : "Güvenlik doğrulaması tamamlanamadı. Turnstile kontrolünü yenileyip tekrar deneyin.",
        ),
        unavailable ? 503 : 403,
      );
    }
    const user = await userByIdentity(c, identity);
    if (!user || !Boolean(user.is_active) || !(await compare(password, text(user.password_hash)))) {
      await audit(c, "LOGIN_FAILED_POLICY", "", text(user?.id), text(user?.main_company_slug), "", { identity: identity.slice(0, 80) });
      return c.json(jsonError("INVALID_CREDENTIALS", "Kullanıcı adı/e-posta veya şifre hatalı."), 401);
    }
    const role = roleOf(user);
    await audit(c, "PASSWORD_VERIFIED_POLICY", user.id, user.id, text(user.main_company_slug), "", { policy: effectivePolicy(user, role) });
    return c.json(await beginPolicyLogin(c, user, { deviceLabel: deviceLabel(c, body), userAgent: userAgent(c), ipAddress: clientIp(c) }));
  });

  app.post("/api/auth/phone-approval/:id/status", async (c: any) => {
    const body = await bodyOf(c);
    const approval = await phoneApprovalFromRequest(c, c.req.param("id"), body.phoneApprovalToken);
    if (!approval) return c.json(jsonError("PHONE_APPROVAL_INVALID", "Telefon giriş onayı bulunamadı."), 401);
    if (approval.status === "DENIED") {
      return c.json({ ok: true, stage: "PHONE_APPROVAL_DENIED", message: "Telefonunuzdan giriş isteği reddedildi." });
    }
    if (approval.status === "EXPIRED") {
      return c.json({ ok: true, stage: "PHONE_APPROVAL_EXPIRED", message: "Telefon giriş onayının süresi doldu." });
    }
    if (approval.status === "SUPERSEDED") {
      return c.json({
        ok: true,
        stage: "PHONE_APPROVAL_SUPERSEDED",
        message: "Bu bekleme penceresinin yerine daha yeni bir giriş isteği açıldı. Eski istek reddedilmiş sayılmaz.",
      });
    }
    if (approval.status !== "APPROVED") {
      return c.json({
        ok: true,
        stage: "PHONE_APPROVAL_PENDING",
        phoneApprovalId: approval.id,
        phoneApprovalToken: text(body.phoneApprovalToken),
        phoneApprovalExpiresAt: approval.expiresAt,
        message: "Telefonunuzdan onay bekleniyor.",
      });
    }
    if (approval.consumedAt) return c.json(jsonError("PHONE_APPROVAL_CONSUMED", "Bu telefon giriş onayı daha önce kullanıldı."), 409);
    const user = await userById(c, text(approval.userId));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    if (!(await consumePhoneApproval(c, approval.id))) return c.json(jsonError("PHONE_APPROVAL_CONSUMED", "Bu telefon giriş onayı daha önce kullanıldı."), 409);
    await audit(c, "PHONE_LOGIN_FACTOR_VERIFIED", user.id, user.id, text(user.main_company_slug), "", { phoneApprovalId: approval.id });
    return c.json(await afterFactors(c, user, {
      deviceLabel: approval.deviceLabel,
      userAgent: approval.userAgent,
      ipAddress: approval.ipAddress,
    }));
  });

  app.post("/api/auth/phone-approval/:id/code", async (c: any) => {
    const body = await bodyOf(c);
    const result = await verifySecurityLoginCode(c, c.req.param("id"), body.phoneApprovalToken, body.code);
    if (result.ok) {
      return c.json({
        ok: true,
        stage: "PHONE_APPROVAL_PENDING",
        phoneApprovalId: text(c.req.param("id")),
        phoneApprovalToken: text(body.phoneApprovalToken),
        message: "KY ERP Güvenlik kodu doğrulandı. Oturum tamamlanıyor.",
      });
    }
    const messages: Record<string,string> = {
      SECURITY_LOGIN_CODE_INVALID: "KY ERP Güvenlik kodu hatalı.",
      SECURITY_LOGIN_CODE_EXPIRED: "KY ERP Güvenlik kodunun süresi doldu. Telefonda yeni kod üretin.",
      SECURITY_LOGIN_CODE_LOCKED: "Çok fazla hatalı kod denendi. Telefonda yeni giriş kodu üretin.",
      PHONE_APPROVAL_NOT_PENDING: "Bu giriş isteği artık kod beklemiyor.",
    };
    const status = result.code === "PHONE_APPROVAL_INVALID" ? 401 : result.code === "PHONE_APPROVAL_NOT_PENDING" ? 409 : 400;
    return c.json(jsonError(result.code || "SECURITY_LOGIN_CODE_INVALID", messages[result.code] || "KY ERP Güvenlik kodu doğrulanamadı."), status);
  });

  app.post("/api/auth/phone-approval/:id/resend", async (c: any) => {
    const body = await bodyOf(c);
    const result = await resendPhoneApprovalChallenge(c, c.req.param("id"), body.phoneApprovalToken);
    if (!result.approval) return c.json(jsonError("PHONE_APPROVAL_INVALID", "Telefon giriş onayı bulunamadı."), 401);
    if (result.code === "PHONE_APPROVAL_NOT_PENDING") return c.json(jsonError("PHONE_APPROVAL_NOT_PENDING", "Bu giriş isteği artık bildirim beklemiyor. Durumu tekrar kontrol edin."), 409);
    if (!result.ok) return c.json(jsonError("PHONE_APPROVAL_DEVICE_OFFLINE", "Aktif KY ERP Güvenlik cihazı bulunamadı. Telefon Onayı merkezinden cihaz bağlantısını yenileyin."), 409);
    return c.json({
      ok: true,
      stage: "PHONE_APPROVAL_PENDING",
      phoneApprovalId: result.approval.id,
      phoneApprovalToken: text(body.phoneApprovalToken),
      phoneApprovalExpiresAt: result.approval.expiresAt,
      notifiedDevices: result.sent,
      pushDelivered: result.sent > 0,
      message: result.sent
        ? "Giriş bildirimi aynı onay isteği üzerinden yeniden gönderildi."
        : "Bildirim kanalı yanıt vermedi; istek açık kalıyor. KY ERP Güvenlik uygulamasını açıp Onaylar bölümünü yenileyin.",
    });
  });

  app.post("/api/auth/phone-approval/:id/fallback", async (c: any) => {
    const body = await bodyOf(c);
    const approval = await phoneApprovalFromRequest(c, c.req.param("id"), body.phoneApprovalToken);
    if (!approval || approval.status !== "PENDING") return c.json(jsonError("PHONE_APPROVAL_INVALID", "Telefon giriş onayı bulunamadı veya artık beklemiyor."), 401);
    const user = await userById(c, text(approval.userId));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    await cancelPhoneApproval(c, approval.id);
    await audit(c, "PHONE_LOGIN_FALLBACK_TO_TOTP", user.id, user.id, text(user.main_company_slug), "", { phoneApprovalId: approval.id });
    return c.json(await beginPolicyLogin(c, user, {
      deviceLabel: approval.deviceLabel,
      userAgent: approval.userAgent,
      ipAddress: approval.ipAddress,
    }, { skipPhone: true }));
  });

  app.post("/api/auth/mfa/verify", async (c: any) => {
    const body = await bodyOf(c);
    const challenge = await challengeFromRequest(c, body);
    if (!challenge) return c.json(jsonError("MFA_CHALLENGE_INVALID", "Doğrulama isteği geçersiz veya süresi dolmuş."), 401);
    const user = await userById(c, text(challenge.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    const type = text(challenge.challenge_type);
    if (type === "POLICY_MFA_LEGACY_REQUIRED") {
      if (!(await verifyTotp(text(user.mfa_secret), body.code))) {
        return c.json(jsonError("MFA_CODE_INVALID", "Mevcut Authenticator kodu doğrulanamadı."), 401);
      }
      await consumeChallenge(c, challenge);
      await audit(c, "MFA_LEGACY_VERIFIED_POLICY", user.id, user.id, text(user.main_company_slug));
      return c.json(await beginProviderSetup(c, user, "GOOGLE", challenge));
    }
    const setupMatch = type.match(/^(POLICY|OWNER_RECOVERY)_MFA_SETUP_(GOOGLE|MICROSOFT)$/);
    if (setupMatch) {
      const prefix = setupMatch[1];
      const provider = setupMatch[2];
      if (!(await verifyTotp(providerSecret(user, provider), body.code))) return c.json(jsonError("MFA_CODE_INVALID", "Authenticator kodu doğrulanamadı."), 401);
      const timestamp = nowIso();
      if (provider === "MICROSOFT") await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_enabled=1,updated_at=? WHERE user_id=?").bind(timestamp, user.id).run();
      else await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_enabled=1,updated_at=? WHERE user_id=?").bind(timestamp, user.id).run();
      await c.env.DB.prepare("UPDATE auth_user_security SET mfa_secret=NULL,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(timestamp, user.id).run();
      await consumeChallenge(c, challenge);
      await audit(c, "MFA_PROVIDER_ENABLED_POLICY", user.id, user.id, text(user.main_company_slug), "", { provider, prefix });
      const refreshed = await userById(c, user.id);
      if (prefix === "OWNER_RECOVERY") {
        if (provider === "GOOGLE") return c.json(await beginProviderSetup(c, refreshed || user, "MICROSOFT", challenge, "OWNER_RECOVERY"));
        return c.json({ ok: true, stage: "RECOVERY_COMPLETE", message: "Google ve Microsoft Authenticator yeniden kuruldu. Güvenlik için kullanıcı adı ve şifrenizle yeniden giriş yapın." });
      }
      const role = roleOf(refreshed || user);
      const policy = effectivePolicy(refreshed || user, role);
      if (policy === "BOTH_MFA") {
        const active = enabledProviders(refreshed || user);
        if (!active.includes("GOOGLE")) return c.json(await beginProviderSetup(c, refreshed || user, "GOOGLE", challenge));
        if (!active.includes("MICROSOFT")) return c.json(await beginProviderSetup(c, refreshed || user, "MICROSOFT", challenge));
        return c.json(await beginPolicyLogin(c, refreshed || user, challenge));
      }
      return c.json(await afterFactors(c, refreshed || user, challenge));
    }
    if (type !== "POLICY_MFA_REQUIRED") return c.json(jsonError("MFA_CHALLENGE_TYPE", "Bu doğrulama isteği bu işlem için kullanılamaz."), 400);

    const role = roleOf(user);
    const policy = effectivePolicy(user, role);
    const provider = normalizeProvider(body.provider);
    const allowed = policy === "GOOGLE" ? ["GOOGLE"] : policy === "MICROSOFT" ? ["MICROSOFT"] : ["GOOGLE", "MICROSOFT"];
    if (!provider || !allowed.includes(provider) || !providerEnabled(user, provider)) return c.json(jsonError("MFA_PROVIDER_INVALID", "Seçilen Authenticator bu kullanıcı için kullanılamaz."), 400);
    if (!(await verifyTotp(providerSecret(user, provider), body.code))) return c.json(jsonError("MFA_CODE_INVALID", "Authenticator kodu doğrulanamadı."), 401);

    const resetProvider = normalizeProvider(body.resetProvider);
    if (resetProvider && resetProvider !== provider && providerEnabled(user, provider)) {
      await consumeChallenge(c, challenge);
      if (resetProvider === "MICROSOFT") await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_secret=NULL,microsoft_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(nowIso(), user.id).run();
      else await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=NULL,google_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(nowIso(), user.id).run();
      await audit(c, "MFA_CROSS_PROVIDER_RESET_POLICY", user.id, user.id, text(user.main_company_slug), "", { verifiedProvider: provider, resetProvider });
      return c.json(await beginProviderSetup(c, user, resetProvider, challenge));
    }

    if (policy === "BOTH_MFA") {
      const column = provider === "GOOGLE" ? "google_verified_at" : "microsoft_verified_at";
      await c.env.DB.prepare(`UPDATE auth_login_challenges SET ${column}=? WHERE id=? AND consumed_at IS NULL`).bind(nowIso(), challenge.id).run();
      const updated = await c.env.DB.prepare("SELECT * FROM auth_login_challenges WHERE id=? LIMIT 1").bind(challenge.id).first<AnyRow>();
      const verified = [updated?.google_verified_at ? "GOOGLE" : "", updated?.microsoft_verified_at ? "MICROSOFT" : ""].filter(Boolean);
      if (verified.length < 2) {
        return c.json({ ok: true, stage: "MFA_REQUIRED", challengeId: challenge.id, challengeToken: text(body.challengeToken), challengeExpiresAt: challenge.expires_at,
          policy, policyLabel: policyLabel(policy), availableProviders: ["GOOGLE", "MICROSOFT"], requiredProviders: ["GOOGLE", "MICROSOFT"], verifiedProviders: verified,
          requireBoth: true, message: `${providerLabel(provider)} doğrulandı. Diğer Authenticator kodunu da girin.` });
      }
    }
    await consumeChallenge(c, challenge);
    await audit(c, "MFA_VERIFIED_POLICY", user.id, user.id, text(user.main_company_slug), "", { provider, policy });
    return c.json(await afterFactors(c, user, challenge));
  });

  app.post("/api/auth/approval/:id/status", async (c: any) => {
    const body = await bodyOf(c);
    const approval = await c.env.DB.prepare("SELECT * FROM auth_login_approvals WHERE id=? LIMIT 1").bind(text(c.req.param("id"))).first<AnyRow>();
    if (!approval || !safeEqual(text(approval.approval_token_hash), await sha256(text(body.approvalToken)))) return c.json(jsonError("APPROVAL_INVALID", "Giriş onayı bulunamadı."), 401);
    if (Date.parse(text(approval.expires_at)) <= Date.now() && approval.status === "PENDING") return c.json({ ok: true, stage: "APPROVAL_EXPIRED", message: "Giriş onayının süresi doldu." });
    if (approval.status === "DENIED") return c.json({ ok: true, stage: "APPROVAL_DENIED", message: "Giriş isteği reddedildi." });
    if (approval.status !== "APPROVED") return c.json({ ok: true, stage: "APPROVAL_PENDING", approvalId: approval.id, approvalToken: text(body.approvalToken), approvalExpiresAt: approval.expires_at });
    if (approval.consumed_at) return c.json(jsonError("APPROVAL_CONSUMED", "Bu giriş onayı daha önce kullanıldı."), 409);
    const user = await userById(c, text(approval.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    const claimedAt = nowIso();
    const claim = await c.env.DB.prepare(
      "UPDATE auth_login_approvals SET consumed_at=? WHERE id=? AND status='APPROVED' AND consumed_at IS NULL",
    ).bind(claimedAt, approval.id).run();
    if (!Number(claim?.meta?.changes)) return c.json(jsonError("APPROVAL_CONSUMED", "Bu giriş onayı daha önce kullanıldı."), 409);
    try {
      return c.json(await issueSession(c, user, { ...approval, approvalRequestId: approval.id }));
    } catch (error) {
      try {
        await c.env.DB.prepare("UPDATE auth_login_approvals SET consumed_at=NULL WHERE id=? AND consumed_at=?")
          .bind(approval.id, claimedAt).run();
      } catch (rollbackError) {
        logAuthError(c, "AUTH_APPROVAL_CLAIM_ROLLBACK", rollbackError, { approvalId: approval.id, userId: user.id });
      }
      logAuthError(c, "AUTH_APPROVAL_SESSION", error, { approvalId: approval.id, userId: user.id });
      throw error;
    }
  });

  app.get("/api/admin/security/policies", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    if (!isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Giriş güvenliği politikalarını yalnız uygulama sahibi görüntüleyebilir."), 403);
    const rows = (await c.env.DB.prepare(
      `SELECT u.id,u.username,u.full_name,u.role,u.is_active,s.role_override,s.login_policy,s.session_seconds,s.approval_required,
              s.google_mfa_enabled,s.microsoft_mfa_enabled,s.email_verified,s.recovery_phone_verified,s.owner_recovery_enabled
         FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id ORDER BY u.full_name,u.username`,
    ).all()).results || [];
    return c.json({ ok: true, data: rows.map((row: AnyRow) => {
      const role = roleOf(row); const policy = effectivePolicy(row, role); return {
        userId: text(row.id), role, loginPolicy: policy, loginPolicyLabel: policyLabel(policy),
        configuredSessionSeconds: normalizeSessionSeconds(row.session_seconds, 36000), effectiveSessionSeconds: effectiveSessionSeconds(row, role),
        approvalRequired: isSuper(role) || isCompanyAdmin(role) ? false : Boolean(row.approval_required), googleMfaEnabled: Boolean(row.google_mfa_enabled), microsoftMfaEnabled: Boolean(row.microsoft_mfa_enabled),
        ownerRecoveryEnabled: Boolean(row.owner_recovery_enabled),
      };
    }) });
  });

  app.patch("/api/admin/security/users/:id/policy", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    if (!isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Giriş güvenliğini yalnız uygulama sahibi değiştirebilir."), 403);
    const target = await userById(c, text(c.req.param("id")));
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const body = await bodyOf(c);
    const targetRole = roleOf(target);
    let policy = normalizePolicy(body.loginPolicy, effectivePolicy(target, targetRole));
    let sessionSeconds = policy === "PASSWORD_ONLY" ? 28800 : 36000;
    if (isSuper(targetRole)) {
      policy = "ANY_MFA";
      sessionSeconds = 36000;
    } else if (policy !== "PASSWORD_ONLY") {
      sessionSeconds = 36000;
    }
    const approvalRequired = isSuper(targetRole) || isCompanyAdmin(targetRole) ? 0 : (boolValue(body.approvalRequired, Boolean(target.approval_required)) ? 1 : 0);
    await c.env.DB.prepare(
      "UPDATE auth_user_security SET login_policy=?,session_seconds=?,approval_required=?,updated_at=? WHERE user_id=?",
    ).bind(policy, sessionSeconds, approvalRequired, nowIso(), target.id).run();
    await revokeSecurityState(c, target.id, current.id, "LOGIN_POLICY_CHANGED");
    await audit(c, "LOGIN_POLICY_UPDATED", current.id, target.id, text(target.main_company_slug), "", { policy, sessionSeconds, approvalRequired: Boolean(approvalRequired) });
    const refreshed = await userById(c, target.id);
    return c.json({ ok: true, data: { userId: target.id, loginPolicy: effectivePolicy(refreshed || target, targetRole), loginPolicyLabel: policyLabel(effectivePolicy(refreshed || target, targetRole)), configuredSessionSeconds: sessionSeconds, effectiveSessionSeconds: effectiveSessionSeconds(refreshed || target, targetRole), approvalRequired: Boolean(approvalRequired) } });
  });

  app.get("/api/admin/security/owner-recovery", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız Süper Yönetici hesabına açıktır."), current ? 403 : 401);
    const user = await userById(c, current.id);
    const questions = (await c.env.DB.prepare("SELECT id,position,question_text,created_at,updated_at FROM auth_owner_recovery_questions WHERE user_id=? ORDER BY position").bind(current.id).all()).results || [];
    const readiness = await ownerRecoveryReadiness(c, user || current);
    return c.json({ ok: true, data: {
      email: text(user?.email), emailMasked: maskEmail(user?.email), emailVerified: Boolean(user?.email_verified),
      phone: text(user?.recovery_phone), phoneMasked: maskPhone(user?.recovery_phone), phoneVerified: Boolean(user?.recovery_phone_verified),
      questions: questions.map((row: AnyRow) => ({ id: row.id, position: Number(row.position), question: text(row.question_text), configured: true })),
      recoveryEnabled: Boolean(user?.owner_recovery_enabled && readiness.ready), readiness,
      note: readiness.capabilities.email || readiness.capabilities.sms ? "Doğrulanmış iletişim kanalı ve üç özel soru ile kurtarma aktifleştirilebilir." : "E-posta/SMS gönderim servisi henüz Worker'a bağlı değil; güvenlik soruları kaydedilebilir ancak kanal doğrulaması etkinleşmeden owner kurtarma açılmaz.",
    } });
  });

  app.put("/api/admin/security/owner-recovery/questions", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız Süper Yönetici hesabına açıktır."), current ? 403 : 401);
    const body = await bodyOf(c);
    if (!(await stepUpOwner(c, current, body.provider, body.code))) return c.json(jsonError("STEP_UP_FAILED", "Mevcut Google veya Microsoft Authenticator kodu doğrulanamadı."), 401);
    const incoming = Array.isArray(body.questions) ? body.questions.slice(0, 3) : [];
    if (incoming.length !== 3) return c.json(jsonError("QUESTIONS_REQUIRED", "Tam olarak 3 özel güvenlik sorusu tanımlayın."), 400);
    const existing = (await c.env.DB.prepare("SELECT * FROM auth_owner_recovery_questions WHERE user_id=? ORDER BY position").bind(current.id).all()).results || [];
    for (let index = 0; index < 3; index += 1) {
      const position = index + 1;
      const question = text(incoming[index]?.question).slice(0, 220);
      const answer = normalizeAnswer(incoming[index]?.answer);
      const old = existing.find((row: AnyRow) => Number(row.position) === position);
      if (question.length < 6) return c.json(jsonError("QUESTION_TOO_SHORT", `${position}. soru en az 6 karakter olmalıdır.`), 400);
      if (!answer && (!old || text(old.question_text) !== question)) return c.json(jsonError("ANSWER_REQUIRED", `${position}. soru için yeni cevap girin.`), 400);
      if (old && !answer && text(old.question_text) === question) continue;
      const hashed = await hashQuestionAnswer(answer);
      const timestamp = nowIso();
      if (old) {
        await c.env.DB.prepare("UPDATE auth_owner_recovery_questions SET question_text=?,answer_hash=?,answer_salt=?,answer_iterations=?,updated_at=? WHERE id=?").bind(question, hashed.hash, hashed.salt, hashed.iterations, timestamp, old.id).run();
      } else {
        await c.env.DB.prepare("INSERT INTO auth_owner_recovery_questions(id,user_id,position,question_text,answer_hash,answer_salt,answer_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), current.id, position, question, hashed.hash, hashed.salt, hashed.iterations, timestamp, timestamp).run();
      }
    }
    const enabled = await updateOwnerRecoveryEnabled(c, current.id);
    await retireLegacyRecoveryCodes(c, current.id);
    await audit(c, "OWNER_RECOVERY_QUESTIONS_UPDATED", current.id, current.id, text(current.mainCompanySlug), "", { enabled, legacyRecoveryCodesRetired: true });
    return c.json({ ok: true, data: { saved: true, recoveryEnabled: enabled, legacyRecoveryCodesRetired: true } });
  });

  app.post("/api/admin/security/owner-recovery/contact/start", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız Süper Yönetici hesabına açıktır."), current ? 403 : 401);
    const body = await bodyOf(c);
    if (!(await stepUpOwner(c, current, body.provider, body.code))) return c.json(jsonError("STEP_UP_FAILED", "Mevcut Google veya Microsoft Authenticator kodu doğrulanamadı."), 401);
    const channel = upper(body.channel);
    if (!["EMAIL", "SMS"].includes(channel)) return c.json(jsonError("CHANNEL_INVALID", "Kanal EMAIL veya SMS olmalıdır."), 400);
    const caps = deliveryCapabilities(c);
    if ((channel === "EMAIL" && !caps.email) || (channel === "SMS" && !caps.sms)) return c.json(jsonError("DELIVERY_NOT_CONFIGURED", `${channel === "EMAIL" ? "E-posta" : "SMS"} doğrulama servisi Worker'a bağlı değil.`), 503);
    const value = text(body.value);
    if (channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return c.json(jsonError("EMAIL_INVALID", "Geçerli bir e-posta adresi girin."), 400);
    if (channel === "SMS" && value.replace(/\D/g, "").length < 10) return c.json(jsonError("PHONE_INVALID", "Geçerli bir telefon numarası girin."), 400);
    if (channel === "EMAIL") await c.env.DB.prepare("UPDATE auth_user_security SET email=?,email_verified=0,owner_recovery_enabled=0,updated_at=? WHERE user_id=?").bind(value, nowIso(), current.id).run();
    else await c.env.DB.prepare("UPDATE auth_user_security SET recovery_phone=?,recovery_phone_verified=0,owner_recovery_enabled=0,updated_at=? WHERE user_id=?").bind(value, nowIso(), current.id).run();
    try {
      const challenge = await createOwnerRecoveryChallenge(c, await userById(c, current.id), `CONFIG_${channel}`, channel, value, []);
      return c.json({ ok: true, data: { recoveryId: challenge.id, recoveryToken: challenge.challengeToken, masked: challenge.masked, expiresAt: challenge.expiresAt } });
    } catch (error) {
      return c.json(jsonError("DELIVERY_FAILED", error?.message || "Doğrulama kodu gönderilemedi."), 503);
    }
  });

  app.post("/api/admin/security/owner-recovery/contact/verify", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız Süper Yönetici hesabına açıktır."), current ? 403 : 401);
    const body = await bodyOf(c);
    const recovery = await recoveryChallengeFromBody(c, body);
    if (!recovery || recovery.user_id !== current.id || !text(recovery.purpose).startsWith("CONFIG_")) return c.json(jsonError("RECOVERY_CHALLENGE_INVALID", "Doğrulama isteği geçersiz veya süresi dolmuş."), 401);
    if (recovery.locked) return c.json(jsonError("RECOVERY_LOCKED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra tekrar deneyin."), 429);
    if (!(await verifyRecoveryOtp(c, recovery, body.otp))) {
      const failed = await markRecoveryFailure(c, recovery);
      return c.json(jsonError("OTP_INVALID", failed.lockedUntil ? "Çok fazla hatalı kod girildi. 30 dakika kilitlendi." : "Doğrulama kodu hatalı."), failed.lockedUntil ? 429 : 401);
    }
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET verified_at=?,consumed_at=? WHERE id=?").bind(nowIso(), nowIso(), recovery.id).run();
    if (recovery.channel === "EMAIL") await c.env.DB.prepare("UPDATE auth_user_security SET email_verified=1,updated_at=? WHERE user_id=?").bind(nowIso(), current.id).run();
    else await c.env.DB.prepare("UPDATE auth_user_security SET recovery_phone_verified=1,updated_at=? WHERE user_id=?").bind(nowIso(), current.id).run();
    const enabled = await updateOwnerRecoveryEnabled(c, current.id);
    await audit(c, "OWNER_RECOVERY_CONTACT_VERIFIED", current.id, current.id, text(current.mainCompanySlug), "", { channel: recovery.channel, enabled });
    return c.json({ ok: true, data: { verified: true, recoveryEnabled: enabled } });
  });

  app.post("/api/auth/owner-recovery/start", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const body = await bodyOf(c);
    const loginChallenge = await challengeFromRequest(c, body);
    if (!loginChallenge || text(loginChallenge.challenge_type) !== "POLICY_MFA_REQUIRED") return c.json(jsonError("LOGIN_CHALLENGE_INVALID", "Önce kullanıcı adı ve şifrenizi doğrulayın."), 401);
    const user = await userById(c, text(loginChallenge.user_id));
    if (!user || !isSuper(roleOf(user))) return c.json(jsonError("OWNER_ONLY", "Bu kurtarma akışı yalnız Süper Yönetici hesabına açıktır."), 403);
    const readiness = await ownerRecoveryReadiness(c, user);
    if (!readiness.ready || !Boolean(user.owner_recovery_enabled)) return c.json(jsonError("OWNER_RECOVERY_NOT_READY", "Süper Yönetici hesap kurtarma kanalları henüz tam doğrulanmamış."), 503);
    const channel = upper(body.channel);
    const destination = channel === "EMAIL" && readiness.emailReady ? text(user.email) : channel === "SMS" && readiness.smsReady ? text(user.recovery_phone) : "";
    if (!destination) return c.json(jsonError("CHANNEL_UNAVAILABLE", "Seçilen kurtarma kanalı kullanılamıyor."), 400);
    const allQuestions = (await c.env.DB.prepare("SELECT * FROM auth_owner_recovery_questions WHERE user_id=? ORDER BY position").bind(user.id).all()).results || [];
    if (allQuestions.length < 3) return c.json(jsonError("QUESTIONS_NOT_READY", "Güvenlik soruları eksik."), 503);
    const shuffled = [...allQuestions].sort(() => crypto.getRandomValues(new Uint32Array(1))[0] - 0x7fffffff);
    const selected = shuffled.slice(0, 2);
    try {
      const recovery = await createOwnerRecoveryChallenge(c, user, "OWNER_ACCOUNT_RECOVERY", channel, destination, selected);
      return c.json({ ok: true, stage: "OWNER_RECOVERY_VERIFY", recoveryId: recovery.id, recoveryToken: recovery.challengeToken, maskedDestination: recovery.masked, expiresAt: recovery.expiresAt,
        questions: selected.map((row: AnyRow) => ({ id: row.id, question: text(row.question_text) })), message: `${recovery.masked} adresine/numarasına doğrulama kodu gönderildi. Kod ile iki özel soruyu cevaplayın.` });
    } catch (error) {
      return c.json(jsonError("RECOVERY_DELIVERY_FAILED", error?.message || "Kurtarma doğrulaması başlatılamadı."), 503);
    }
  });

  app.post("/api/auth/owner-recovery/verify", async (c: any) => {
    const schemaError = await ensureOwnerRecoveryOrResponse(c);
    if (schemaError) return schemaError;
    const body = await bodyOf(c);
    const recovery = await recoveryChallengeFromBody(c, body);
    if (!recovery || recovery.purpose !== "OWNER_ACCOUNT_RECOVERY") return c.json(jsonError("RECOVERY_CHALLENGE_INVALID", "Kurtarma isteği geçersiz veya süresi dolmuş."), 401);
    if (recovery.locked) return c.json(jsonError("RECOVERY_LOCKED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra tekrar deneyin."), 429);
    const otpOk = await verifyRecoveryOtp(c, recovery, body.otp);
    const ids = (() => { try { return JSON.parse(text(recovery.question_ids) || "[]"); } catch { return []; } })();
    const answers = Array.isArray(body.answers) ? body.answers : [];
    let questionsOk = ids.length === 2 && answers.length === 2;
    for (let index = 0; questionsOk && index < ids.length; index += 1) {
      const row = await c.env.DB.prepare("SELECT * FROM auth_owner_recovery_questions WHERE id=? AND user_id=? LIMIT 1").bind(ids[index], recovery.user_id).first<AnyRow>();
      if (!row || !(await verifyQuestionAnswer(answers[index], row))) questionsOk = false;
    }
    if (!otpOk || !questionsOk) {
      const failed = await markRecoveryFailure(c, recovery, !questionsOk);
      return c.json(jsonError("RECOVERY_PROOF_INVALID", failed.lockedUntil ? "Çok fazla hatalı deneme yapıldı. Kurtarma 30 dakika kilitlendi." : "Doğrulama kodu veya güvenlik sorularından biri hatalı."), failed.lockedUntil ? 429 : 401);
    }
    const timestamp = nowIso();
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET verified_at=?,consumed_at=? WHERE id=?").bind(timestamp, timestamp, recovery.id).run();
    await revokeSecurityState(c, recovery.user_id, recovery.user_id, "OWNER_ACCOUNT_RECOVERED");
    await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=NULL,google_mfa_enabled=0,microsoft_mfa_secret=NULL,microsoft_mfa_enabled=0,login_policy='ANY_MFA',session_seconds=36000,updated_at=? WHERE user_id=?").bind(timestamp, recovery.user_id).run();
    await retireLegacyRecoveryCodes(c, recovery.user_id);
    const user = await userById(c, recovery.user_id);
    await audit(c, "OWNER_RECOVERY_VERIFIED_REENROLL_REQUIRED", recovery.user_id, recovery.user_id, text(user?.main_company_slug), "", { channel: recovery.channel });
    return c.json(await beginProviderSetup(c, user, "GOOGLE", {}, "OWNER_RECOVERY"));
  });
}
