// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const DEFAULT_COMPANY_SLUG = "mecit-hakan";
const OWNER_ROLLING_SECONDS = 86_400;
const PASSWORD_SECONDS = 28_800;
const MFA_SECONDS = 36_000;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase();
}
function nowIso() {
  return new Date().toISOString();
}
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function bearerToken(c: any) {
  const match = text(c.req.header("Authorization")).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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
function decodePayload(token: string) {
  try {
    const part = text(token).split(".")[1] || "";
    if (!part) return {};
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch {
    return {};
  }
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sessionSecret(c: any) {
  const row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key='SESSION_HMAC' LIMIT 1").first<AnyRow>();
  if (!row?.secret_value) throw new Error("SESSION_HMAC bulunamadı.");
  return base64UrlToBytes(text(row.secret_value));
}
async function signToken(c: any, payload: AnyRow) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", await sessionSecret(c), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input))));
  return `${input}.${signature}`;
}
function ttlFor(current: AnyRow, oldPayload: AnyRow) {
  if (isOwner(current?.role)) return OWNER_ROLLING_SECONDS;
  const policy = upper(oldPayload?.policy || current?.loginPolicy || current?.security?.login_policy || "ANY_MFA");
  return policy === "PASSWORD_ONLY" ? PASSWORD_SECONDS : MFA_SECONDS;
}

export function registerAuthSessionRefreshRoutes(app: any) {
  app.post("/api/auth/refresh", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current?.session?.id) {
      return c.json({ ok: false, error: { code: "SESSION_INVALID", message: "Oturum yenilenemedi. Yeniden giriş yapın." } }, 401);
    }

    const oldToken = bearerToken(c);
    if (!oldToken) {
      return c.json({ ok: false, error: { code: "TOKEN_INVALID", message: "Oturum anahtarı bulunamadı." } }, 401);
    }

    const oldPayload = decodePayload(oldToken);
    const now = Math.floor(Date.now() / 1000);
    const ttl = ttlFor(current, oldPayload);
    const expiresAt = new Date((now + ttl) * 1000).toISOString();
    const role = text(current.role || oldPayload.role || "VIEWER");
    const company = text(current.mainCompanySlug || oldPayload.company || DEFAULT_COMPANY_SLUG) || DEFAULT_COMPANY_SLUG;
    const policy = isOwner(role) ? "ANY_MFA" : text(oldPayload.policy || current.loginPolicy || "ANY_MFA");
    const newToken = await signToken(c, {
      sid: current.session.id,
      sub: current.id,
      username: current.username,
      role,
      company,
      policy,
      iat: now,
      exp: now + ttl,
    });

    const oldHash = await sha256(oldToken);
    const result = await c.env.DB.prepare(
      `UPDATE auth_sessions
          SET token_hash=?,role_at_login=?,main_company_slug=?,expires_at=?,last_seen_at=?
        WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?`,
    ).bind(
      await sha256(newToken), role, company, expiresAt, nowIso(),
      current.session.id, current.id, oldHash, nowIso(),
    ).run();

    if (Number(result?.meta?.changes || 0) !== 1) {
      return c.json({ ok: false, error: { code: "SESSION_ROTATED", message: "Oturum başka bir sekmede yenilendi. Uygulamayı yeniden deneyin." } }, 409);
    }

    const { security, session, ...user } = current;
    void security;
    return c.json({
      ok: true,
      stage: "AUTHENTICATED",
      token: newToken,
      expiresIn: ttl,
      expiresAt,
      rolling: true,
      user,
      session: { id: session.id, expiresAt, lastSeenAt: nowIso() },
    });
  });
}
