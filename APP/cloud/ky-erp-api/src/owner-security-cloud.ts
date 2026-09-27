// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";
const STEP_UP_SECONDS = 5 * 60;
const RENEWAL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_HOUR = 5;
const RESEND_SECONDS = 60;
const MFA_PROVIDERS = ["GOOGLE", "MICROSOFT"];
const ISSUER = "KY ERP";

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function isOwner(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function isCompanyAdmin(role: unknown) { return upper(role) === "COMPANY_ADMIN"; }
function normalizeProvider(value: unknown) { const provider = upper(value); return MFA_PROVIDERS.includes(provider) ? provider : ""; }
function providerLabel(provider: string) { return provider === "MICROSOFT" ? "Microsoft Authenticator" : "Google Authenticator"; }
function jsonError(code: string, message: string, details?: unknown) { return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }; }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
async function bodyOf(c: any) { try { const value = await c.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
async function tableExists(c: any, table: string) { const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first(); return Boolean(row?.name); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function safeEqual(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }
function randomToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function sixDigitCode() { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return String(bytes[0] % 1_000_000).padStart(6, "0"); }
function maskEmail(value: string) { const [local, domain] = text(value).split("@"); if (!local || !domain) return ""; return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`; }
function metadataOf(row: AnyRow) { try { const value = JSON.parse(text(row?.question_ids) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }

async function ownerCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  return current && isOwner(current.role) ? current : null;
}

function ownerSelfTargetId(current: AnyRow, requested: unknown) {
  const currentId = text(current?.id);
  const targetId = text(requested || currentId);
  return currentId && targetId === currentId ? currentId : "";
}

async function targetUser(c: any, id: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,u.created_at,u.updated_at,
            s.email,s.main_company_slug,s.role_override,s.mfa_enabled,s.mfa_secret,
            s.google_mfa_enabled,s.microsoft_mfa_enabled,s.email_verified,s.approval_required,s.login_policy,s.session_seconds
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(id).first<AnyRow>();
}

function effectiveRole(row: AnyRow) {
  const role = upper(row?.role_override || row?.role || "VIEWER");
  return role === "ADMIN" ? "SUPER_ADMIN" : role || "VIEWER";
}

function userSummary(row: AnyRow) {
  const role = effectiveRole(row);
  return {
    id: text(row.id),
    username: text(row.username),
    fullName: text(row.full_name || row.fullName || row.username),
    email: text(row.email),
    role,
    mainCompanySlug: text(row.main_company_slug),
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    googleMfaEnabled: Boolean(row.google_mfa_enabled),
    microsoftMfaEnabled: Boolean(row.microsoft_mfa_enabled),
    mfaEnabled: Boolean(row.google_mfa_enabled) || Boolean(row.microsoft_mfa_enabled),
    emailVerified: Boolean(row.email_verified),
    approvalRequired: Boolean(row.approval_required),
    loginPolicy: upper(row.login_policy || "ANY_MFA"),
    sessionSeconds: Number(row.session_seconds || 36000),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function audit(c: any, action: string, actorId: string, targetId: string, detail: AnyRow = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    const target = targetId ? await targetUser(c, targetId) : null;
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorId || null, targetId || null, text(target?.main_company_slug) || null, action, null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso()).run();
  } catch {}
}

async function acceptedMessageId(response: Response) {
  const headerId = text(response.headers.get("x-request-id") || response.headers.get("x-message-id"));
  let payload: AnyRow = {};
  try { payload = await response.clone().json(); } catch {}
  return text(payload?.id || payload?.messageId || payload?.requestId || headerId);
}

async function sendSecurityEmail(c: any, destination: string, code: string, subject = "KY ERP güvenlik doğrulama kodu") {
  const key = text(c.env.RESEND_API_KEY);
  if (!key) throw new Error("Resend API anahtarı Worker'a bağlı değil.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ADMIN_EMAIL_FROM,
      to: [destination],
      subject,
      text: `KY ERP güvenlik doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız kodu paylaşmayın.`,
    }),
  });
  if (!response.ok) {
    let detail = "";
    try { detail = text((await response.json())?.message); } catch {}
    throw new Error(detail || `Resend isteği kabul etmedi (${response.status}).`);
  }
  const messageId = await acceptedMessageId(response);
  if (!messageId) throw new Error("Resend kabul kimliği dönmedi; gönderim doğrulanamadı.");
  return { provider: "RESEND", messageId, sender: ADMIN_EMAIL_FROM };
}

async function resendDelivery(c: any, messageId: string) {
  const key = text(c.env.RESEND_API_KEY);
  if (!key) throw new Error("Resend API anahtarı Worker'a bağlı değil.");
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  let payload: AnyRow = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(text(payload?.message) || `Resend teslimat sorgusu başarısız (${response.status}).`);
  return payload;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string) {
  const clean = upper(input).replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(output);
}
function newTotpSecret() { const bytes = new Uint8Array(20); crypto.getRandomValues(bytes); return base32Encode(bytes); }
async function totpCode(secret: string, timestampMs = Date.now()) {
  let counter = BigInt(Math.floor(timestampMs / 1000 / 30));
  const counterBytes = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) { counterBytes[index] = Number(counter & 255n); counter >>= 8n; }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = signature[signature.length - 1] & 15;
  const binary = ((signature[offset] & 127) << 24) | ((signature[offset + 1] & 255) << 16) | ((signature[offset + 2] & 255) << 8) | (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
async function verifyTotp(secret: string, code: unknown) {
  const candidate = text(code).replace(/\D/g, "");
  if (!/^\d{6}$/.test(candidate) || !secret) return false;
  for (const offset of [-1, 0, 1]) if (safeEqual(await totpCode(secret, Date.now() + offset * 30_000), candidate)) return true;
  return false;
}
function otpauthUri(secret: string, account: string, provider: string) {
  const providerIssuer = `${ISSUER} ${provider === "MICROSOFT" ? "Microsoft" : "Google"}`;
  const label = `${providerIssuer}:${account || "Kullanici"}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(providerIssuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function createChallenge(c: any, options: AnyRow) {
  if (!(await tableExists(c, "auth_owner_recovery_challenges"))) throw new Error("Güvenlik doğrulama tablosu hazır değil.");
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const salt = randomToken(12);
  const otp = options.otp || sixDigitCode();
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO auth_owner_recovery_challenges
     (id,user_id,purpose,channel,destination_masked,challenge_token_hash,otp_hash,otp_salt,question_ids,attempt_count,answer_attempt_count,send_count,created_at,expires_at,verified_at,ip_address)
     VALUES (?,?,?,?,?,?,?,?,?,0,0,1,?,?,?,?)`,
  ).bind(
    id, options.userId, options.purpose, options.channel, options.destinationMasked || null,
    await sha256(token), await sha256(`${salt}:${otp}`), salt, JSON.stringify(options.metadata || {}),
    timestamp, addSeconds(options.ttlSeconds || STEP_UP_SECONDS), options.verified ? timestamp : null, clientIp(c) || null,
  ).run();
  return { id, token, otp, expiresAt: addSeconds(options.ttlSeconds || STEP_UP_SECONDS) };
}

async function challengeByToken(c: any, id: string, token: string, purpose: string, userId: string) {
  const row = await c.env.DB.prepare(
    `SELECT * FROM auth_owner_recovery_challenges
      WHERE id=? AND user_id=? AND purpose=? AND consumed_at IS NULL AND expires_at>? LIMIT 1`,
  ).bind(id, userId, purpose, nowIso()).first<AnyRow>();
  if (!row || !safeEqual(text(row.challenge_token_hash), await sha256(token))) return null;
  return row;
}

async function markAttemptFailure(c: any, row: AnyRow) {
  const attempts = Number(row.attempt_count || 0) + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? addSeconds(30 * 60) : null;
  await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET attempt_count=?,locked_until=? WHERE id=?").bind(attempts, lockedUntil, row.id).run();
  return lockedUntil;
}

function revokeAfterMfaChangeStatements(c: any, current: AnyRow, targetId: string, timestamp: string) {
  const sessionStatement = String(targetId) === String(current.id) && current.session?.id
    ? c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE user_id=? AND id<>? AND revoked_at IS NULL").bind(timestamp, current.id, targetId, current.session.id)
    : c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL").bind(timestamp, current.id, targetId);
  return [
    c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL").bind(timestamp, targetId),
    c.env.DB.prepare(
      `UPDATE auth_login_approvals SET status='DENIED',decided_at=COALESCE(decided_at,?),decided_by=COALESCE(decided_by,?),consumed_at=COALESCE(consumed_at,?)
        WHERE user_id=? AND status IN ('PENDING','APPROVED')`,
    ).bind(timestamp, current.id, timestamp, targetId),
    sessionStatement,
  ];
}

export function registerOwnerSecurityRoutes(app: any) {
  app.get("/api/admin/managed-users", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    const currentRole = upper(current?.role);
    if (!current || (!isOwner(currentRole) && !isCompanyAdmin(currentRole))) return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), current ? 403 : 401);
    const result = await c.env.DB.prepare(
      `SELECT u.id,u.username,u.full_name,u.role,u.is_active,u.must_change_password,u.last_login_at,u.created_at,u.updated_at,
              s.email,s.main_company_slug,s.role_override,s.mfa_enabled,s.mfa_secret,s.google_mfa_enabled,s.microsoft_mfa_enabled,
              s.email_verified,s.approval_required,s.login_policy,s.session_seconds
         FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        ORDER BY u.full_name COLLATE NOCASE,u.username COLLATE NOCASE`,
    ).all<AnyRow>();
    const data = (result.results || []).filter((row: AnyRow) => {
      const role = effectiveRole(row);
      if (isOwner(role)) return false;
      if (isOwner(currentRole)) return true;
      return text(row.main_company_slug) === text(current.mainCompanySlug) && role !== "COMPANY_ADMIN";
    }).map(userSummary);
    return c.json({ ok: true, data });
  });

  app.get("/api/admin/security/application-owner", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız uygulama sahibine açıktır."), 403);
    const row = await targetUser(c, current.id);
    if (!row) return c.json(jsonError("OWNER_NOT_FOUND", "Uygulama sahibi hesabı bulunamadı."), 404);
    return c.json({ ok: true, data: { ...userSummary(row), currentSessionId: current.session?.id || "" } });
  });

  app.post("/api/admin/security/reauth/password", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const provider = normalizeProvider(body.provider);
    const targetId = ownerSelfTargetId(current, body.targetUserId);
    if (!targetId) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    if (!provider) return c.json(jsonError("MFA_PROVIDER_INVALID", "Google veya Microsoft Authenticator seçilmelidir."), 400);
    const target = await targetUser(c, targetId);
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const actor = await c.env.DB.prepare("SELECT password_hash FROM auth_users WHERE id=? LIMIT 1").bind(current.id).first<AnyRow>();
    const password = String(body.password ?? "");
    if (!password || !actor?.password_hash || !(await compare(password, text(actor.password_hash)))) {
      await audit(c, "SENSITIVE_REAUTH_PASSWORD_FAILED", current.id, targetId, { provider });
      return c.json(jsonError("REAUTH_PASSWORD_INVALID", "Şifre doğrulanamadı."), 401);
    }
    const challenge = await createChallenge(c, {
      userId: current.id, purpose: "SENSITIVE_MFA_REAUTH", channel: "PASSWORD", verified: true, ttlSeconds: STEP_UP_SECONDS,
      destinationMasked: "PASSWORD", metadata: { actorUserId: current.id, targetUserId: targetId, provider, method: "PASSWORD" }, otp: randomToken(12),
    });
    await audit(c, "SENSITIVE_REAUTH_PASSWORD_VERIFIED", current.id, targetId, { provider });
    return c.json({ ok: true, data: { reauthId: challenge.id, reauthToken: challenge.token, expiresAt: challenge.expiresAt, method: "PASSWORD" } });
  });

  app.post("/api/admin/security/reauth/email/start", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const provider = normalizeProvider(body.provider);
    const targetId = ownerSelfTargetId(current, body.targetUserId);
    if (!targetId) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    if (!provider) return c.json(jsonError("MFA_PROVIDER_INVALID", "Google veya Microsoft Authenticator seçilmelidir."), 400);
    if (!current.emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(current.email))) return c.json(jsonError("OWNER_EMAIL_NOT_VERIFIED", "E-posta ile güvenlik doğrulaması için uygulama sahibi e-postası önce doğrulanmalıdır."), 400);
    const target = await targetUser(c, targetId);
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const recent = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total,MAX(created_at) AS latest FROM auth_owner_recovery_challenges
        WHERE user_id=? AND purpose='SENSITIVE_MFA_REAUTH' AND channel='EMAIL' AND created_at>?`,
    ).bind(current.id, addSeconds(-3600)).first<AnyRow>();
    if (Number(recent?.total || 0) >= MAX_SENDS_HOUR) return c.json(jsonError("RATE_LIMITED", "Bir saatlik güvenlik kodu gönderim sınırına ulaşıldı."), 429);
    if (recent?.latest && Date.now() - Date.parse(text(recent.latest)) < RESEND_SECONDS * 1000) return c.json(jsonError("RESEND_TOO_SOON", "Yeni kod istemeden önce 60 saniye bekleyin."), 429);
    const challenge = await createChallenge(c, {
      userId: current.id, purpose: "SENSITIVE_MFA_REAUTH", channel: "EMAIL", ttlSeconds: STEP_UP_SECONDS,
      destinationMasked: maskEmail(current.email), metadata: { actorUserId: current.id, targetUserId: targetId, provider, method: "EMAIL" },
    });
    try {
      const accepted = await sendSecurityEmail(c, current.email, challenge.otp, "KY ERP MFA yenileme güvenlik kodu");
      await audit(c, "SENSITIVE_REAUTH_EMAIL_ACCEPTED", current.id, targetId, { provider, providerMessageId: accepted.messageId });
      return c.json({ ok: true, data: { reauthId: challenge.id, reauthToken: challenge.token, masked: maskEmail(current.email), expiresAt: challenge.expiresAt, deliveryStatus: "PROVIDER_ACCEPTED", provider: accepted.provider, providerMessageId: accepted.messageId } });
    } catch (error) {
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=? WHERE id=?").bind(nowIso(), challenge.id).run();
      return c.json(jsonError("DELIVERY_FAILED", error?.message || "Güvenlik kodu gönderilemedi."), 503);
    }
  });

  app.post("/api/admin/security/reauth/email/verify", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const row = await challengeByToken(c, text(body.reauthId), text(body.reauthToken), "SENSITIVE_MFA_REAUTH", current.id);
    if (!row || upper(row.channel) !== "EMAIL") return c.json(jsonError("REAUTH_INVALID", "Güvenlik doğrulama isteği geçersiz veya süresi dolmuş."), 401);
    const meta = metadataOf(row);
    if (text(meta.targetUserId) !== text(current.id)) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    if (row.locked_until && Date.parse(text(row.locked_until)) > Date.now()) return c.json(jsonError("REAUTH_LOCKED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra tekrar deneyin."), 429);
    const otp = text(body.otp).replace(/\D/g, "");
    const valid = /^\d{6}$/.test(otp) && safeEqual(await sha256(`${text(row.otp_salt)}:${otp}`), text(row.otp_hash));
    if (!valid) {
      const lockedUntil = await markAttemptFailure(c, row);
      return c.json(jsonError("OTP_INVALID", lockedUntil ? "Çok fazla hatalı kod girildi. 30 dakika kilitlendi." : "Doğrulama kodu hatalı."), lockedUntil ? 429 : 401);
    }
    const timestamp = nowIso();
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET verified_at=? WHERE id=? AND consumed_at IS NULL").bind(timestamp, row.id).run();
    await audit(c, "SENSITIVE_REAUTH_EMAIL_VERIFIED", current.id, text(meta.targetUserId), { provider: meta.provider });
    return c.json({ ok: true, data: { reauthId: row.id, reauthToken: text(body.reauthToken), expiresAt: row.expires_at, method: "EMAIL" } });
  });

  app.post("/api/admin/security/users/:id/mfa-renew/:provider/start", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const targetId = ownerSelfTargetId(current, c.req.param("id"));
    if (!targetId) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    const provider = normalizeProvider(c.req.param("provider"));
    if (!provider) return c.json(jsonError("MFA_PROVIDER_INVALID", "Google veya Microsoft Authenticator seçilmelidir."), 400);
    const target = await targetUser(c, targetId);
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const body = await bodyOf(c);
    const reauth = await challengeByToken(c, text(body.reauthId), text(body.reauthToken), "SENSITIVE_MFA_REAUTH", current.id);
    if (!reauth || !reauth.verified_at) return c.json(jsonError("REAUTH_REQUIRED", "QR yenilemeden önce şifre veya doğrulanmış e-posta ile yeniden doğrulama gerekir."), 401);
    const meta = metadataOf(reauth);
    if (text(meta.targetUserId) !== targetId || normalizeProvider(meta.provider) !== provider) return c.json(jsonError("REAUTH_SCOPE_INVALID", "Güvenlik doğrulaması bu kullanıcı/Authenticator işlemi için geçerli değil."), 403);
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(nowIso(), reauth.id).run();

    const pendingSecret = newTotpSecret();
    const renewal = await createChallenge(c, {
      userId: current.id, purpose: "MFA_RENEW_PENDING", channel: provider, ttlSeconds: RENEWAL_SECONDS,
      destinationMasked: text(target.username), metadata: { actorUserId: current.id, targetUserId: targetId, provider, pendingSecret }, otp: randomToken(12),
    });
    const account = text(target.email || target.username);
    await audit(c, "MFA_RENEW_QR_CREATED", current.id, targetId, { provider, method: meta.method });
    return c.json({ ok: true, data: { renewalId: renewal.id, renewalToken: renewal.token, expiresAt: renewal.expiresAt, provider, providerLabel: providerLabel(provider), secret: pendingSecret, otpauthUri: otpauthUri(pendingSecret, account, provider), message: `${providerLabel(provider)} için yeni QR hazır. Eski kayıt, yeni 6 haneli kod doğrulanana kadar değişmez.` } });
  });

  app.post("/api/admin/security/users/:id/mfa-renew/:provider/confirm", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const targetId = ownerSelfTargetId(current, c.req.param("id"));
    if (!targetId) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    const provider = normalizeProvider(c.req.param("provider"));
    if (!provider) return c.json(jsonError("MFA_PROVIDER_INVALID", "Google veya Microsoft Authenticator seçilmelidir."), 400);
    const body = await bodyOf(c);
    const row = await challengeByToken(c, text(body.renewalId), text(body.renewalToken), "MFA_RENEW_PENDING", current.id);
    if (!row || normalizeProvider(row.channel) !== provider) return c.json(jsonError("MFA_RENEWAL_INVALID", "QR yenileme isteği geçersiz veya süresi dolmuş."), 401);
    if (row.locked_until && Date.parse(text(row.locked_until)) > Date.now()) return c.json(jsonError("MFA_RENEWAL_LOCKED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra yeniden başlayın."), 429);
    const meta = metadataOf(row);
    if (text(meta.targetUserId) !== targetId || normalizeProvider(meta.provider) !== provider || !text(meta.pendingSecret)) return c.json(jsonError("MFA_RENEWAL_SCOPE_INVALID", "QR yenileme kapsamı geçersiz."), 403);
    if (!(await verifyTotp(text(meta.pendingSecret), body.code))) {
      const lockedUntil = await markAttemptFailure(c, row);
      return c.json(jsonError("MFA_CODE_INVALID", lockedUntil ? "Çok fazla hatalı kod girildi. Yenileme 30 dakika kilitlendi." : "Yeni Authenticator kodu doğrulanamadı; mevcut kayıt değiştirilmedi."), lockedUntil ? 429 : 401);
    }
    const timestamp = nowIso();
    const securityStatement = provider === "MICROSOFT"
      ? c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_secret=?,microsoft_mfa_enabled=1,mfa_secret=NULL,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(text(meta.pendingSecret), timestamp, targetId)
      : c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=?,google_mfa_enabled=1,mfa_secret=NULL,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(text(meta.pendingSecret), timestamp, targetId);
    await c.env.DB.batch([
      securityStatement,
      c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET verified_at=?,consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(timestamp, timestamp, row.id),
      ...revokeAfterMfaChangeStatements(c, current, targetId, timestamp),
    ]);
    await audit(c, "MFA_PROVIDER_RENEWED_SECURE", current.id, targetId, { provider, currentSessionPreserved: String(targetId) === String(current.id) });
    return c.json({ ok: true, data: { renewed: true, provider, providerLabel: providerLabel(provider), currentSessionPreserved: String(targetId) === String(current.id) } });
  });

  app.get("/api/admin/security/users/:id/email-verification/delivery/:messageId", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız uygulama sahibine açıktır."), 403);
    const targetId = ownerSelfTargetId(current, c.req.param("id"));
    if (!targetId) return c.json(jsonError("OWNER_SELF_ONLY", "Uygulama sahibi güvenlik işlemi yalnız kendi hesabı için yapılabilir."), 403);
    const target = await targetUser(c, targetId);
    if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    try {
      const payload = await resendDelivery(c, text(c.req.param("messageId")));
      const destinations = (Array.isArray(payload?.to) ? payload.to : [payload?.to]).map((value: unknown) => text(value).toLowerCase()).filter(Boolean);
      if (text(target.email) && !destinations.includes(text(target.email).toLowerCase())) return c.json(jsonError("DELIVERY_SCOPE_INVALID", "Bu Resend mesajı seçili kullanıcı e-postasına ait değil."), 403);
      const event = text(payload?.last_event || payload?.lastEvent || payload?.status || "unknown").toLowerCase();
      const delivered = ["delivered", "opened", "clicked"].includes(event);
      const failed = ["bounced", "complained", "canceled", "failed"].includes(event);
      return c.json({ ok: true, data: { provider: "RESEND", messageId: text(payload?.id || c.req.param("messageId")), event, delivered, failed, createdAt: payload?.created_at || payload?.createdAt || null, to: destinations, from: text(payload?.from) } });
    } catch (error) {
      return c.json(jsonError("DELIVERY_STATUS_FAILED", error?.message || "E-posta teslimat durumu alınamadı."), 503);
    }
  });
}
