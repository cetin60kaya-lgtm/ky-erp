// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

const DEFAULT_COMPANY_SLUG = "mecit-hakan";
const CHALLENGE_SECONDS = 10 * 60;
const ISSUER = "KY ERP";
const OWNER_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const MFA_PROVIDERS = ["GOOGLE", "MICROSOFT"];
const SESSION_PRESETS = [1800, 3600, 7200, 14400, 28800, 43200, 86400];

type AnyRow = Record<string, any>;

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
function jsonError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
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
function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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
function roleOf(row: AnyRow) {
  const role = upper(row.role_override || row.role || "VIEWER");
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
function isOwner(rowOrRole: AnyRow | string) {
  const role = typeof rowOrRole === "string" ? upper(rowOrRole) : roleOf(rowOrRole);
  return OWNER_ROLES.has(role);
}
function normalizePolicy(value: unknown, role: string) {
  if (isOwner(role)) return "ANY_MFA";
  const policy = upper(value);
  return ["PASSWORD_ONLY", "GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"].includes(policy) ? policy : "ANY_MFA";
}
function sessionSeconds(row: AnyRow, role: string) {
  let value = Number(row.session_seconds || 28800);
  if (!SESSION_PRESETS.includes(value)) value = 28800;
  if (normalizePolicy(row.login_policy, role) === "PASSWORD_ONLY") value = Math.min(value, 1800);
  if (isOwner(role)) value = Math.min(value, 28800);
  return value;
}
function providerSecret(row: AnyRow, provider: string) {
  return provider === "MICROSOFT" ? text(row.microsoft_mfa_secret) : text(row.google_mfa_secret);
}
function providerEnabled(row: AnyRow, provider: string) {
  return provider === "MICROSOFT" ? Boolean(row.microsoft_mfa_enabled) : Boolean(row.google_mfa_enabled);
}
function normalizeProvider(value: unknown) {
  const provider = upper(value);
  return MFA_PROVIDERS.includes(provider) ? provider : "";
}
function providerLabel(provider: string) {
  return provider === "MICROSOFT" ? "Microsoft Authenticator" : "Google Authenticator";
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
  const candidate = text(code).replace(/\D/g, "");
  if (!secret || !/^\d{6}$/.test(candidate)) return false;
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

async function userByIdentity(c: any, identity: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.password_hash,u.full_name,u.role,u.is_active,u.must_change_password,
            s.email,s.main_company_slug,s.role_override,s.mfa_secret,s.mfa_enabled,
            s.google_mfa_secret,s.google_mfa_enabled,s.microsoft_mfa_secret,s.microsoft_mfa_enabled,
            s.email_verified,s.approval_required,s.login_policy,s.session_seconds
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE LOWER(u.username)=LOWER(?) OR LOWER(COALESCE(s.email,''))=LOWER(?) LIMIT 1`,
  ).bind(identity, identity).first<AnyRow>();
}
async function userById(c: any, id: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.password_hash,u.full_name,u.role,u.is_active,u.must_change_password,
            s.email,s.main_company_slug,s.role_override,s.mfa_secret,s.mfa_enabled,
            s.google_mfa_secret,s.google_mfa_enabled,s.microsoft_mfa_secret,s.microsoft_mfa_enabled,
            s.email_verified,s.approval_required,s.login_policy,s.session_seconds
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`,
  ).bind(id).first<AnyRow>();
}
async function challengeById(c: any, id: string) {
  return c.env.DB.prepare("SELECT * FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1").bind(id, nowIso()).first<AnyRow>();
}
async function validateChallengeToken(challenge: AnyRow, token: unknown) {
  return safeEqual(text(challenge.challenge_token_hash), await sha256(text(token)));
}
async function consumeChallenge(c: any, id: string) {
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(nowIso(), id).run();
}
async function createChallenge(c: any, user: AnyRow, type: string, source: AnyRow, challengeToken = randomToken(24)) {
  const role = roleOf(user);
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO auth_login_challenges
     (id,user_id,challenge_type,challenge_token_hash,device_label,user_agent,ip_address,created_at,expires_at,policy_snapshot,session_seconds_snapshot,google_verified_at,microsoft_verified_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, user.id, type, await sha256(challengeToken), text(source.deviceLabel || source.device_label || deviceLabel(c, source)),
    text(source.userAgent || source.user_agent || userAgent(c)), text(source.ipAddress || source.ip_address || clientIp(c)),
    timestamp, addSeconds(CHALLENGE_SECONDS), normalizePolicy(user.login_policy, role), sessionSeconds(user, role), null, null,
  ).run();
  return { id, challengeToken };
}
async function beginSetup(c: any, user: AnyRow, provider: string, source: AnyRow = {}) {
  const secret = newTotpSecret();
  const timestamp = nowIso();
  if (provider === "MICROSOFT") {
    await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_secret=?,microsoft_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  } else {
    await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_secret=?,google_mfa_enabled=0,updated_at=? WHERE user_id=?").bind(secret, timestamp, user.id).run();
  }
  const refreshed = await userById(c, user.id);
  const challenge = await createChallenge(c, refreshed || user, `POLICY_MFA_SETUP_${provider}`, source);
  return {
    ok: true,
    stage: "MFA_SETUP",
    provider,
    providerLabel: providerLabel(provider),
    challengeId: challenge.id,
    challengeToken: challenge.challengeToken,
    challengeExpiresAt: addSeconds(CHALLENGE_SECONDS),
    secret,
    otpauthUri: otpauthUri(secret, text(refreshed?.email || user.username), provider),
    policy: normalizePolicy(refreshed?.login_policy, roleOf(refreshed || user)),
    message: `${providerLabel(provider)} için QR kodunu okutun ve 6 haneli kodu doğrulayın.`,
  };
}
async function audit(c: any, action: string, actorUserId: string, targetUserId: string, detail: AnyRow = {}) {
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorUserId || null, targetUserId || null, null, action, clientIp(c) || null, JSON.stringify(detail), nowIso()).run();
  } catch { /* audit failure must not break auth */ }
}

async function interceptLegacyLogin(c: any, next: any) {
  const body = await bodyOf(c);
  const identity = text(body.username || body.email).toLocaleLowerCase("tr-TR");
  const password = String(body.password || "");
  if (!identity || !password) return next();
  const user = await userByIdentity(c, identity);
  if (!user || !Boolean(user.is_active) || !(await compare(password, text(user.password_hash)))) return next();
  const hasModern = Boolean(user.google_mfa_enabled || user.microsoft_mfa_enabled);
  if (hasModern || !Boolean(user.mfa_enabled) || !text(user.mfa_secret)) return next();
  const challenge = await createChallenge(c, user, "POLICY_MFA_LEGACY_REQUIRED", body);
  await audit(c, "MFA_LEGACY_CHALLENGE_CREATED_V2", user.id, user.id, {});
  return c.json({
    ok: true,
    stage: "MFA_LEGACY_REQUIRED",
    challengeId: challenge.id,
    challengeToken: challenge.challengeToken,
    challengeExpiresAt: addSeconds(CHALLENGE_SECONDS),
    message: "Mevcut Authenticator kodunuzu bir kez doğrulayın. Sonrasında yeni güvenlik profiline geçirileceksiniz.",
  });
}

async function interceptMfaVerify(c: any, next: any) {
  const body = await bodyOf(c);
  const challenge = await challengeById(c, text(body.challengeId));
  if (!challenge || !(await validateChallengeToken(challenge, body.challengeToken))) return next();
  const type = text(challenge.challenge_type);
  const user = await userById(c, text(challenge.user_id));
  if (!user || !Boolean(user.is_active)) return next();

  if (type === "POLICY_MFA_LEGACY_REQUIRED") {
    if (!(await verifyTotp(text(user.mfa_secret), body.code))) return c.json(jsonError("MFA_CODE_INVALID", "Mevcut Authenticator kodu hatalı."), 401);
    await consumeChallenge(c, challenge.id);
    await audit(c, "MFA_LEGACY_VERIFIED_V2", user.id, user.id, {});
    return c.json(await beginSetup(c, user, "GOOGLE", challenge));
  }

  const setupMatch = type.match(/^POLICY_MFA_SETUP_(GOOGLE|MICROSOFT)$/);
  if (setupMatch && isOwner(user)) {
    const provider = setupMatch[1];
    if (!(await verifyTotp(providerSecret(user, provider), body.code))) return c.json(jsonError("MFA_CODE_INVALID", `${providerLabel(provider)} kodu hatalı.`), 401);
    await consumeChallenge(c, challenge.id);
    if (provider === "MICROSOFT") await c.env.DB.prepare("UPDATE auth_user_security SET microsoft_mfa_enabled=1,updated_at=? WHERE user_id=?").bind(nowIso(), user.id).run();
    else await c.env.DB.prepare("UPDATE auth_user_security SET google_mfa_enabled=1,updated_at=? WHERE user_id=?").bind(nowIso(), user.id).run();
    const refreshed = await userById(c, user.id);
    const missing = MFA_PROVIDERS.find((item) => !providerEnabled(refreshed || user, item));
    if (missing) return c.json(await beginSetup(c, refreshed || user, missing, challenge));
    await c.env.DB.prepare("UPDATE auth_user_security SET mfa_secret=NULL,mfa_enabled=0,updated_at=? WHERE user_id=?").bind(nowIso(), user.id).run();
    await audit(c, "OWNER_DUAL_MFA_ENROLLMENT_COMPLETED", user.id, user.id, {});
    return c.json({ ok: true, stage: "RECOVERY_COMPLETE", message: "Google ve Microsoft Authenticator kurulumu tamamlandı. Güvenlik için kullanıcı adı ve şifrenizle yeniden giriş yapın." });
  }

  if (type === "POLICY_MFA_REQUIRED" && isOwner(user)) {
    const missing = MFA_PROVIDERS.find((item) => !providerEnabled(user, item));
    if (!missing) return next();
    const provider = normalizeProvider(body.provider);
    if (!provider || !providerEnabled(user, provider) || !(await verifyTotp(providerSecret(user, provider), body.code))) {
      return c.json(jsonError("MFA_CODE_INVALID", "Aktif Authenticator kodu doğrulanamadı."), 401);
    }
    await consumeChallenge(c, challenge.id);
    await audit(c, "OWNER_MISSING_MFA_PROVIDER_ENROLLMENT_REQUIRED", user.id, user.id, { verifiedProvider: provider, missingProvider: missing });
    return c.json(await beginSetup(c, user, missing, challenge));
  }

  return next();
}

async function interceptCompanyAdminUserUpdate(c: any, next: any) {
  const current = await getAuthenticatedUser(c);
  if (!current || isOwner(current.role)) return next();
  if (upper(current.role) !== "COMPANY_ADMIN") return next();

  const target = await userById(c, text(c.req.param("id")));
  if (!target) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
  const targetRole = roleOf(target);
  if (isOwner(targetRole) || targetRole === "COMPANY_ADMIN" || text(target.main_company_slug || DEFAULT_COMPANY_SLUG) !== text(current.mainCompanySlug || DEFAULT_COMPANY_SLUG)) {
    return c.json(jsonError("FORBIDDEN", "Bu kullanıcıyı yönetemezsiniz."), 403);
  }
  const body = await bodyOf(c);
  const requestedRole = upper(body.role || targetRole);
  if (["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(requestedRole)) return c.json(jsonError("FORBIDDEN", "Yönetici rolü yalnız uygulama sahibi tarafından atanabilir."), 403);
  const email = body.email === undefined ? text(target.email) : text(body.email).toLocaleLowerCase("tr-TR");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_INVALID", "Geçerli bir e-posta adresi girin."), 400);
  const timestamp = nowIso();
  await c.env.DB.prepare(
    "UPDATE auth_users SET username=?,full_name=?,role=?,is_active=?,must_change_password=?,updated_at=? WHERE id=?",
  ).bind(
    text(body.username || target.username).toLocaleLowerCase("tr-TR"),
    text(body.fullName || target.full_name), requestedRole,
    boolValue(body.isActive, Boolean(target.is_active)) ? 1 : 0,
    boolValue(body.mustChangePassword, Boolean(target.must_change_password)) ? 1 : 0,
    timestamp, target.id,
  ).run();
  // Company admin may update profile email, but cannot touch login_policy, session_seconds,
  // approval_required, MFA secrets or recovery settings even with a crafted API request.
  await c.env.DB.prepare(
    "UPDATE auth_user_security SET email=?,main_company_slug=?,role_override=NULL,updated_at=? WHERE user_id=?",
  ).bind(email || null, text(current.mainCompanySlug || DEFAULT_COMPANY_SLUG), timestamp, target.id).run();
  if (!boolValue(body.isActive, Boolean(target.is_active))) {
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE user_id=? AND revoked_at IS NULL").bind(timestamp, current.id, target.id).run();
  }
  await audit(c, "COMPANY_ADMIN_USER_PROFILE_UPDATED_SECURITY_LOCKED", current.id, target.id, { ignoredSecurityFields: ["approvalRequired", "loginPolicy", "sessionSeconds", "mfa"] });
  const updated = await userById(c, target.id);
  return c.json({ ok: true, data: {
    id: updated.id, username: updated.username, fullName: updated.full_name, email: updated.email,
    role: roleOf(updated), mainCompanySlug: updated.main_company_slug, isActive: Boolean(updated.is_active),
    googleMfaEnabled: Boolean(updated.google_mfa_enabled), microsoftMfaEnabled: Boolean(updated.microsoft_mfa_enabled),
    approvalRequired: Boolean(updated.approval_required), loginPolicy: normalizePolicy(updated.login_policy, roleOf(updated)),
    sessionSeconds: sessionSeconds(updated, roleOf(updated)),
  } });
}

async function ownerOnlySecurityAction(c: any, next: any) {
  const current = await getAuthenticatedUser(c);
  if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
  if (!isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "Authenticator ve giriş güvenliği işlemlerini yalnız uygulama sahibi yönetebilir."), 403);
  return next();
}

export function registerAuthPolicyCompatRoutes(app: any) {
  // Compatibility route must be registered before the v2 policy routes.
  app.post("/api/auth/v2/login", interceptLegacyLogin);
  app.post("/api/auth/v2/mfa/verify", interceptMfaVerify);

  // Company admins keep ordinary user/profile/module management, but authentication policy
  // is an application-owner boundary and cannot be weakened with a handcrafted API request.
  app.patch("/api/admin/users/:id", interceptCompanyAdminUserUpdate);
  app.post("/api/admin/security/users/:id/reset-mfa", ownerOnlySecurityAction);
  app.post("/api/admin/security/users/:id/reset-mfa/:provider", ownerOnlySecurityAction);
}
