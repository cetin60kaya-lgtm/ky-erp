// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

const CHALLENGE_SECONDS = 10 * 60;
const PASSWORD_SESSION_SECONDS = 28_800;
const MFA_SESSION_SECONDS = 36_000;
const ISSUER = "KY ERP";
const MFA_PROVIDERS = ["GOOGLE", "MICROSOFT"];

type AnyRow = Record<string, any>;

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function jsonError(code: string, message: string) { return { ok: false, error: { code, message } }; }
async function bodyOf(c: any) { try { return (await c.req.json()) || {}; } catch { return {}; } }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
function roleOf(row: AnyRow) { const role = upper(row.role_override || row.role || "VIEWER"); return role === "ADMIN" ? "SUPER_ADMIN" : role; }
function isOwner(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function normalizePolicy(value: unknown, role: string) {
  if (isOwner(role)) return "ANY_MFA";
  const policy = upper(value);
  return ["PASSWORD_ONLY", "GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"].includes(policy) ? policy : "ANY_MFA";
}
function sessionSecondsForPolicy(policy: string) {
  return policy === "PASSWORD_ONLY" ? PASSWORD_SESSION_SECONDS : MFA_SESSION_SECONDS;
}
function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes); crypto.getRandomValues(data);
  let binary = ""; for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0; for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
function normalizeRecoveryCode(value: unknown) { return upper(value).replace(/\s+/g, ""); }

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes: Uint8Array) {
  let bits = 0; let value = 0; let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
function newTotpSecret() { const bytes = new Uint8Array(20); crypto.getRandomValues(bytes); return base32Encode(bytes); }
function providerLabel(provider: string) { return provider === "MICROSOFT" ? "Microsoft Authenticator" : "Google Authenticator"; }
function otpauthUri(secret: string, account: string, provider: string) {
  const providerIssuer = `${ISSUER} ${provider === "MICROSOFT" ? "Microsoft" : "Google"}`;
  const label = `${providerIssuer}:${account || "Kullanici"}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(providerIssuer)}&algorithm=SHA1&digits=6&period=30`;
}
async function userById(c: any, id: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,s.email,s.main_company_slug,s.role_override,
            s.login_policy,s.session_seconds,s.owner_recovery_enabled
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`,
  ).bind(id).first<AnyRow>();
}
async function challengeById(c: any, id: string) {
  return c.env.DB.prepare("SELECT * FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1").bind(id, nowIso()).first<AnyRow>();
}
async function challengeValid(challenge: AnyRow, token: unknown) {
  return Boolean(challenge) && safeEqual(text(challenge.challenge_token_hash), await sha256(text(token)));
}
async function hasUnusedCodes(c: any, userId: string) {
  const row = await c.env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE user_id=? AND used_at IS NULL LIMIT 1").bind(userId).first<AnyRow>();
  return Boolean(row?.id);
}
async function revokeSecurityState(c: any, userId: string) {
  const timestamp = nowIso();
  await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL").bind(timestamp, userId, userId).run();
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL").bind(timestamp, userId).run();
  await c.env.DB.prepare("UPDATE auth_login_approvals SET status='DENIED',decided_at=COALESCE(decided_at,?),decided_by=COALESCE(decided_by,?),consumed_at=COALESCE(consumed_at,?) WHERE user_id=? AND status IN ('PENDING','APPROVED')").bind(timestamp, userId, timestamp, userId).run();
}
async function audit(c: any, action: string, userId: string, detail: AnyRow = {}) {
  try {
    const user = await userById(c, userId);
    await c.env.DB.prepare("INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), userId, userId, text(user?.main_company_slug), action, clientIp(c) || null, JSON.stringify(detail), nowIso()).run();
  } catch { /* audit must not block recovery */ }
}
async function beginSetup(c: any, user: AnyRow, provider: string, recoveryMode: boolean) {
  const secret = newTotpSecret();
  const timestamp = nowIso();
  if (provider === "MICROSOFT") await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_secret=?,microsoft_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  else await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=?,google_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  const challengeId = crypto.randomUUID();
  const challengeToken = randomToken(24);
  const type = `${recoveryMode ? "OWNER_RECOVERY" : "POLICY"}_MFA_SETUP_${provider}`;
  const policy = normalizePolicy(user.login_policy, roleOf(user));
  const sessionSeconds = sessionSecondsForPolicy(policy);
  await c.env.DB.prepare(
    `INSERT INTO auth_login_challenges(id,user_id,challenge_type,challenge_token_hash,created_at,expires_at,policy_snapshot,session_seconds_snapshot)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(challengeId, user.id, type, await sha256(challengeToken), timestamp, addSeconds(CHALLENGE_SECONDS), policy, sessionSeconds).run();
  return {
    ok: true, stage: "MFA_SETUP", provider, providerLabel: providerLabel(provider),
    challengeId, challengeToken, challengeExpiresAt: addSeconds(CHALLENGE_SECONDS), secret,
    otpauthUri: otpauthUri(secret, text(user.email || user.username), provider),
    recoveryReenroll: recoveryMode,
    message: recoveryMode
      ? "Acil kurtarma kodu doğrulandı. Uygulama sahibi Google ve Microsoft Authenticator'ı yeniden kurmalıdır."
      : `${providerLabel(provider)} yeniden kuruluyor.`,
  };
}

export function registerAuthRecoveryCodeFallbackRoutes(app: any) {
  // Enrich the canonical login challenge with emergency-code availability without exposing account data.
  app.use("/api/auth/login", async (c: any, next: any) => {
    await next();
    try {
      const clone = c.res.clone();
      const payload = await clone.json();
      const stage = upper(payload?.stage);
      if (!["MFA_REQUIRED", "MFA_LEGACY_REQUIRED"].includes(stage) || !payload?.challengeId) return;
      const challenge = await challengeById(c, text(payload.challengeId));
      if (!challenge) return;
      const user = await userById(c, text(challenge.user_id));
      const recoveryCodeAvailable = Boolean(user && !isOwner(roleOf(user)) && await hasUnusedCodes(c, text(challenge.user_id)));
      c.res = c.json({ ...payload, recoveryCodeAvailable });
    } catch { /* leave original response */ }
  });

  app.post("/api/auth/recovery-code", async (c: any) => {
    const body = await bodyOf(c);
    const challenge = await challengeById(c, text(body.challengeId));
    if (!challenge || !(await challengeValid(challenge, body.challengeToken))) return c.json(jsonError("RECOVERY_CHALLENGE_INVALID", "Kurtarma isteği geçersiz veya süresi dolmuş."), 401);
    if (!["POLICY_MFA_REQUIRED", "POLICY_MFA_LEGACY_REQUIRED"].includes(text(challenge.challenge_type))) return c.json(jsonError("RECOVERY_CHALLENGE_TYPE", "Bu giriş isteğinde kurtarma kodu kullanılamaz."), 400);
    const user = await userById(c, text(challenge.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    if (isOwner(roleOf(user))) {
      await audit(c, "OWNER_RECOVERY_CODE_BLOCKED", user.id, { ownerQuestionAnswerRequired: true });
      return c.json(jsonError("OWNER_RECOVERY_QUESTIONS_REQUIRED", "Uygulama sahibi için tek kullanımlık kurtarma kodu devre dışıdır. Özel soru-cevap ve doğrulanmış iletişim kanalı ile güvenli kurtarma kullanın."), 403);
    }
    const candidateHash = await sha256(normalizeRecoveryCode(body.recoveryCode));
    const row = await c.env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL LIMIT 1").bind(user.id, candidateHash).first<AnyRow>();
    if (!row?.id) {
      await audit(c, "RECOVERY_CODE_REJECTED", user.id, {});
      return c.json(jsonError("RECOVERY_CODE_INVALID", "Kurtarma kodu geçersiz veya daha önce kullanılmış."), 401);
    }

    const timestamp = nowIso();
    await c.env.DB.prepare("UPDATE auth_recovery_codes SET used_at=COALESCE(used_at,?) WHERE user_id=? AND used_at IS NULL").bind(timestamp, user.id).run();
    await revokeSecurityState(c, user.id);
    await c.env.DB.prepare("UPDATE auth_user_security SET mfa_secret=NULL,mfa_enabled=0,google_mfa_secret=NULL,google_mfa_enabled=0,microsoft_mfa_secret=NULL,microsoft_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(timestamp, user.id).run();
    await audit(c, "RECOVERY_CODE_USED", user.id, { recoveryCodeId: row.id, emergencyFallback: true });

    const role = roleOf(user);
    const policy = normalizePolicy(user.login_policy, role);
    const provider = policy === "MICROSOFT" ? "MICROSOFT" : "GOOGLE";
    return c.json(await beginSetup(c, user, provider, false));
  });

  // Uygulama sahibi için legacy acil kod bilinçli olarak devre dışıdır.
  // Endpoint yalnız durum bilgisidir ve hiçbir kodu açığa çıkarmaz.
  app.get("/api/admin/security/recovery-code-fallback/status", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu alan yalnız uygulama sahibine açıktır."), current ? 403 : 401);
    return c.json({ ok: true, data: { available: false, note: "Uygulama sahibi için tek kullanımlık acil kurtarma kodu devre dışıdır; özel soru-cevap + doğrulanmış iletişim kanalı kullanılır." } });
  });
}
