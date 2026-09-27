// @ts-nocheck
import { AUTH_SECURITY_SCOPES, securityStoreGet as storeGet } from "./auth-security-core";
import { cancelPhoneApproval, phoneApprovalFromRequest } from "./auth-push-cloud";

type AnyRow = Record<string, any>;
type Provider = "google" | "microsoft";

const PHONE_SCOPE = AUTH_SECURITY_SCOPES.PHONE_LOGIN;
const STATE_SECONDS = 10 * 60;
const MAX_STARTS_HOUR = 5;
const ALLOWED_APP_ORIGINS = new Set([
  "https://app.kyerp.net",
  "https://security.kyerp.net", "https://kyerp.net", "https://www.kyerp.net",
  "http://localhost:5173", "http://127.0.0.1:5173",
]);

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function jsonError(code: string, message: string) { return { ok: false, error: { code, message } }; }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
async function bodyOf(c: any) { try { const body = await c.req.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : {}; } catch { return {}; } }
function bytesToBase64Url(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function base64UrlToBytes(value: string) { const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4); const binary = atob(padded); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function randomToken(bytes = 32) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return bytesToBase64Url(data); }
async function sha256Bytes(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return new Uint8Array(digest); }
async function sha256(value: string) { return Array.from(await sha256Bytes(value)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function safeEqual(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index); return diff === 0; }
function validEmail(value: unknown) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)); }
function providerOf(value: unknown): Provider | "" { const normalized = text(value).toLowerCase(); return normalized === "google" || normalized === "microsoft" ? normalized : ""; }
function allowedOrigin(value: unknown) { const origin = text(value); return ALLOWED_APP_ORIGINS.has(origin) ? origin : "https://app.kyerp.net"; }
function callbackBase(c: any) { return text(c.env?.AUTH_EXTERNAL_CALLBACK_BASE || "https://api.kyerp.net").replace(/\/+$/, ""); }
function callbackUrl(c: any, provider: Provider) { return `${callbackBase(c)}/api/auth/external/${provider}/callback`; }

function providerConfig(c: any, provider: Provider) {
  const env = c.env as AnyRow;
  if (provider === "google") {
    const clientId = text(env.GOOGLE_OAUTH_CLIENT_ID); const clientSecret = text(env.GOOGLE_OAUTH_CLIENT_SECRET);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = text(env.MICROSOFT_OAUTH_CLIENT_ID); const clientSecret = text(env.MICROSOFT_OAUTH_CLIENT_SECRET);
  const tenant = text(env.MICROSOFT_OAUTH_TENANT_ID || env.MICROSOFT_OAUTH_TENANT);
  if (!clientId || !clientSecret || !tenant || ["common", "organizations", "consumers"].includes(tenant.toLowerCase())) return null;
  return { clientId, clientSecret, tenant };
}

async function ensureSchema(c: any) {
  await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_external_recovery_challenges (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,provider TEXT NOT NULL,state_hash TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL,
    pkce_verifier TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,device_label TEXT,user_agent TEXT,ip_address TEXT,
    origin TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT
  )`).run();
  await c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_external_recovery_user_created ON auth_external_recovery_challenges(user_id,provider,created_at)").run();
}

async function userById(c: any, userId: string) {
  return c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.role,u.is_active,s.email,s.email_verified,s.main_company_slug,s.role_override
    FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`).bind(userId).first<AnyRow>();
}
async function audit(c: any, action: string, user: AnyRow, detail: AnyRow = {}) {
  try { await c.env.DB.prepare(`INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), user.id, user.id, text(user.main_company_slug), action, clientIp(c) || null, JSON.stringify(detail), nowIso()).run(); } catch {}
}

async function challengeProof(c: any, body: AnyRow) {
  const phoneId = text(body.phoneApprovalId), phoneToken = text(body.phoneApprovalToken);
  if (phoneId && phoneToken) {
    const approval = await phoneApprovalFromRequest(c, phoneId, phoneToken);
    if (!approval || upper(approval.status) !== "PENDING" || text(approval.consumedAt)) return null;
    return { userId: text(approval.userId), sourceType: "PHONE", sourceId: phoneId, deviceLabel: text(approval.deviceLabel), userAgent: text(approval.userAgent), ipAddress: text(approval.ipAddress) };
  }
  const challengeId = text(body.challengeId), challengeToken = text(body.challengeToken);
  if (!challengeId || !challengeToken) return null;
  const challenge = await c.env.DB.prepare("SELECT * FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1").bind(challengeId, nowIso()).first<AnyRow>();
  if (!challenge || !safeEqual(text(challenge.challenge_token_hash), await sha256(challengeToken))) return null;
  const type = upper(challenge.challenge_type);
  if (!["POLICY_MFA_REQUIRED", "POLICY_MFA_LEGACY_REQUIRED", "POLICY_MFA_SETUP_GOOGLE", "POLICY_MFA_SETUP_MICROSOFT"].includes(type)) return null;
  return { userId: text(challenge.user_id), sourceType: "CHALLENGE", sourceId: challengeId, deviceLabel: text(challenge.device_label), userAgent: text(challenge.user_agent), ipAddress: text(challenge.ip_address) };
}
async function sourceStillPending(c: any, row: AnyRow) {
  if (upper(row.source_type) === "PHONE") { const approval = await storeGet(c, PHONE_SCOPE, text(row.source_id)); return Boolean(approval && upper(approval.status) === "PENDING" && !text(approval.consumedAt)); }
  const challenge = await c.env.DB.prepare("SELECT id FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1").bind(text(row.source_id), nowIso()).first<AnyRow>();
  return Boolean(challenge?.id);
}
async function markSourceConsumed(c: any, row: AnyRow) {
  if (upper(row.source_type) === "PHONE") { await cancelPhoneApproval(c, text(row.source_id)); return; }
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(nowIso(), text(row.source_id)).run();
}

function decodeJwtPart(value: string) { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))); }
async function fetchJson(url: string, init?: RequestInit) { const response = await fetch(url, init); const payload = await response.json().catch(() => null); if (!response.ok || !payload) throw new Error(`Kimlik sağlayıcı yanıtı geçersiz (${response.status}).`); return payload as AnyRow; }
async function verifyJwtSignature(idToken: string, jwksUrl: string) {
  const parts = text(idToken).split("."); if (parts.length !== 3) throw new Error("Kimlik belirteci geçersiz.");
  const header = decodeJwtPart(parts[0]), payload = decodeJwtPart(parts[1]);
  if (header?.alg !== "RS256" || !text(header?.kid)) throw new Error("Kimlik belirteci imza algoritması geçersiz.");
  const jwks = await fetchJson(jwksUrl); const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((key: AnyRow) => text(key.kid) === text(header.kid)) : null;
  if (!jwk) throw new Error("Kimlik sağlayıcı imza anahtarı bulunamadı.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("Kimlik sağlayıcı imzası doğrulanamadı.");
  if (!Number(payload?.exp) || Number(payload.exp) * 1000 <= Date.now()) throw new Error("Kimlik doğrulama süresi dolmuş.");
  return payload as AnyRow;
}
function audienceMatches(aud: unknown, clientId: string) { return Array.isArray(aud) ? aud.map(text).includes(clientId) : text(aud) === clientId; }

async function providerIdentity(c: any, provider: Provider, code: string, row: AnyRow) {
  const config = providerConfig(c, provider); if (!config) throw new Error("Kimlik sağlayıcı bu ortamda etkin değil.");
  const redirectUri = callbackUrl(c, provider); let tokenPayload: AnyRow;
  if (provider === "google") {
    tokenPayload = await fetchJson("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, code_verifier: text(row.pkce_verifier) }) });
    const idToken = text(tokenPayload.id_token); if (!idToken) throw new Error("Google kimlik belirteci alınamadı.");
    const claims = await verifyJwtSignature(idToken, "https://www.googleapis.com/oauth2/v3/certs");
    if (!audienceMatches(claims.aud, config.clientId)) throw new Error("Google hedef uygulama doğrulaması başarısız.");
    if (!["accounts.google.com", "https://accounts.google.com"].includes(text(claims.iss))) throw new Error("Google yayıncı doğrulaması başarısız.");
    if (!safeEqual(text(claims.nonce), text(row.nonce))) throw new Error("Google oturum nonce doğrulaması başarısız.");
    if (claims.email_verified !== true) throw new Error("Google e-posta adresi doğrulanmış değil.");
    return { email: text(claims.email).toLowerCase(), subject: text(claims.sub) };
  }
  const tenant = text((config as AnyRow).tenant);
  tokenPayload = await fetchJson(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, code_verifier: text(row.pkce_verifier), scope: "openid email profile" }) });
  const idToken = text(tokenPayload.id_token); if (!idToken) throw new Error("Microsoft kimlik belirteci alınamadı.");
  const openid = await fetchJson(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`);
  const claims = await verifyJwtSignature(idToken, text(openid.jwks_uri));
  if (!audienceMatches(claims.aud, config.clientId)) throw new Error("Microsoft hedef uygulama doğrulaması başarısız.");
  if (!safeEqual(text(claims.nonce), text(row.nonce))) throw new Error("Microsoft oturum nonce doğrulaması başarısız.");
  if (text(claims.tid).toLowerCase() !== tenant.toLowerCase()) throw new Error("Microsoft tenant doğrulaması başarısız.");
  if (text(claims.iss) !== `https://login.microsoftonline.com/${tenant}/v2.0`) throw new Error("Microsoft yayıncı doğrulaması başarısız.");
  return { email: text(claims.email || claims.preferred_username || claims.upn).toLowerCase(), subject: text(claims.sub) };
}

function popupHtml(origin: string, payload: AnyRow) {
  const safeOrigin = allowedOrigin(origin); const safePayload = JSON.stringify({ type: "KYERP_EXTERNAL_RECOVERY", ...payload }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>KY ERP Doğrulama</title></head><body><p>KY ERP doğrulaması tamamlanıyor...</p><script>try{if(window.opener){window.opener.postMessage(${safePayload},${JSON.stringify(safeOrigin)});}setTimeout(function(){window.close();},250);}catch(e){document.body.textContent="Doğrulama penceresini kapatıp tekrar deneyin.";}</script></body></html>`;
}
async function createApprovedLogin(c: any, row: AnyRow, user: AnyRow, provider: Provider) {
  await markSourceConsumed(c, row);
  const approvalId = crypto.randomUUID(), approvalToken = randomToken(24), timestamp = nowIso();
  const companySlug = text(user.main_company_slug) || "mecit-hakan";
  await c.env.DB.prepare(`INSERT INTO auth_login_approvals(id,user_id,main_company_slug,approval_token_hash,status,device_label,user_agent,ip_address,requested_at,expires_at,decided_at,decided_by) VALUES (?,?,?,?, 'APPROVED',?,?,?,?,?,?,?)`)
    .bind(approvalId, user.id, companySlug, await sha256(approvalToken), `${provider === "google" ? "Google" : "Microsoft"} hesap doğrulaması`, text(row.user_agent), text(row.ip_address || clientIp(c)), timestamp, addSeconds(10 * 60), timestamp, user.id).run();
  return { approvalId, approvalToken, approvalExpiresAt: addSeconds(10 * 60) };
}

export function registerAuthExternalRecoveryRoutes(app: any) {
  app.get("/api/auth/external/providers", async (c: any) => c.json({ ok: true, providers: { google: Boolean(providerConfig(c, "google")), microsoft: Boolean(providerConfig(c, "microsoft")) } }));

  app.post("/api/auth/external/:provider/start", async (c: any) => {
    const provider = providerOf(c.req.param("provider")); if (!provider) return c.json(jsonError("EXTERNAL_PROVIDER_INVALID", "Desteklenmeyen kimlik sağlayıcı."), 404);
    const config = providerConfig(c, provider); if (!config) return c.json(jsonError("EXTERNAL_PROVIDER_UNAVAILABLE", "Bu kimlik sağlayıcı henüz etkin değil."), 503);
    const body = await bodyOf(c), proof = await challengeProof(c, body); if (!proof) return c.json(jsonError("EXTERNAL_RECOVERY_PROOF_INVALID", "Önce kullanıcı adı, şifre ve normal güvenlik adımını başlatın."), 401);
    const user = await userById(c, proof.userId); if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    if (!Boolean(user.email_verified) || !validEmail(user.email)) return c.json(jsonError("EXTERNAL_RECOVERY_EMAIL_NOT_VERIFIED", "Google/Microsoft doğrulaması için hesap e-posta adresi önceden doğrulanmış olmalıdır."), 409);
    await ensureSchema(c);
    const recent = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_external_recovery_challenges WHERE user_id=? AND provider=? AND created_at>?").bind(user.id, provider, addSeconds(-3600)).first<AnyRow>();
    if (Number(recent?.total || 0) >= MAX_STARTS_HOUR) { await audit(c, "EXTERNAL_RECOVERY_RATE_LIMITED", user, { provider }); return c.json(jsonError("EXTERNAL_RECOVERY_RATE_LIMITED", "Bir saatlik hesap doğrulama deneme sınırına ulaşıldı."), 429); }
    const state = randomToken(32), nonce = randomToken(24), verifier = randomToken(48), pkceChallenge = bytesToBase64Url(await sha256Bytes(verifier));
    const id = crypto.randomUUID(), origin = allowedOrigin(c.req.header("Origin")), timestamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO auth_external_recovery_challenges(id,user_id,provider,state_hash,nonce,pkce_verifier,source_type,source_id,device_label,user_agent,ip_address,origin,created_at,expires_at,used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(id, user.id, provider, await sha256(state), nonce, verifier, proof.sourceType, proof.sourceId, proof.deviceLabel, proof.userAgent, proof.ipAddress || clientIp(c), origin, timestamp, addSeconds(STATE_SECONDS)).run();
    const redirectUri = callbackUrl(c, provider); let authorizationUrl = "";
    if (provider === "google") {
      const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: pkceChallenge, code_challenge_method: "S256", prompt: "select_account" }); authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else {
      const tenant = text((config as AnyRow).tenant); const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "openid email profile", state, nonce, code_challenge: pkceChallenge, code_challenge_method: "S256", prompt: "select_account" }); authorizationUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params}`;
    }
    await audit(c, "EXTERNAL_RECOVERY_STARTED", user, { provider }); return c.json({ ok: true, provider, authorizationUrl, expiresAt: addSeconds(STATE_SECONDS) });
  });

  app.get("/api/auth/external/:provider/callback", async (c: any) => {
    const provider = providerOf(c.req.param("provider")), state = text(c.req.query("state")), code = text(c.req.query("code")), providerError = text(c.req.query("error"));
    let origin = "https://app.kyerp.net"; let user: AnyRow = {};
    try {
      if (!provider || !state) throw new Error("Kimlik doğrulama isteği geçersiz."); await ensureSchema(c);
      const row = await c.env.DB.prepare("SELECT * FROM auth_external_recovery_challenges WHERE provider=? AND state_hash=? AND used_at IS NULL LIMIT 1").bind(provider, await sha256(state)).first<AnyRow>();
      if (!row) throw new Error("Kimlik doğrulama isteği bulunamadı veya daha önce kullanıldı."); origin = allowedOrigin(row.origin); user = await userById(c, text(row.user_id));
      if (!user || !Boolean(user.is_active)) throw new Error("Kullanıcı hesabı kullanılamıyor.");
      if (Date.parse(text(row.expires_at)) <= Date.now()) { await c.env.DB.prepare("UPDATE auth_external_recovery_challenges SET used_at=? WHERE id=? AND used_at IS NULL").bind(nowIso(), row.id).run(); throw new Error("Kimlik doğrulama isteğinin süresi doldu."); }
      if (providerError) throw new Error("Kimlik sağlayıcı doğrulaması iptal edildi."); if (!code) throw new Error("Kimlik sağlayıcı doğrulama kodu alınamadı."); if (!(await sourceStillPending(c, row))) throw new Error("İlk giriş güvenlik isteği artık geçerli değil.");
      const claim = await c.env.DB.prepare("UPDATE auth_external_recovery_challenges SET used_at=? WHERE id=? AND used_at IS NULL").bind(nowIso(), row.id).run(); if (!Number(claim?.meta?.changes || 0)) throw new Error("Kimlik doğrulama isteği daha önce kullanıldı.");
      const identity = await providerIdentity(c, provider, code, row), accountEmail = text(user.email).toLowerCase();
      if (!identity.email || identity.email !== accountEmail) { await audit(c, "EXTERNAL_RECOVERY_EMAIL_MISMATCH", user, { provider }); throw new Error("Seçilen Google/Microsoft hesabı KY ERP hesabınızdaki doğrulanmış e-posta ile eşleşmiyor."); }
      const approval = await createApprovedLogin(c, row, user, provider); await audit(c, "EXTERNAL_RECOVERY_VERIFIED", user, { provider, subject: identity.subject });
      return new Response(popupHtml(origin, { ok: true, provider, ...approval, recovery: { method: `EXTERNAL_${provider.toUpperCase()}`, securityCenterRequired: false, phoneTrustPreserved: true } }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    } catch (error) {
      if (user?.id) await audit(c, "EXTERNAL_RECOVERY_FAILED", user, { provider, message: error instanceof Error ? error.message : "unknown" });
      return new Response(popupHtml(origin, { ok: false, provider: provider || "", error: error instanceof Error ? error.message : "Hesap doğrulaması tamamlanamadı." }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
  });
}
