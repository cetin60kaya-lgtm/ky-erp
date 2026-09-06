// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";

type AnyRow = Record<string, any>;

const DEFAULT_COMPANY_SLUG = "mecit-hakan";
const REFRESH_SCOPE = "AUTH_SESSION_REFRESH";
const REFRESH_PREPARE_SECONDS = 120;
export const OWNER_REFRESH_SECONDS = 0;
export const PASSWORD_SESSION_SECONDS = 28_800;
export const MFA_SESSION_SECONDS = 36_000;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase();
}
function nowIso() {
  return new Date().toISOString();
}
function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
export function sessionRefreshSeconds(role: unknown, policy: unknown) {
  if (isOwner(role)) return OWNER_REFRESH_SECONDS;
  return upper(policy) === "PASSWORD_ONLY" ? PASSWORD_SESSION_SECONDS : MFA_SESSION_SECONDS;
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
function randomToken(bytes = 24) {
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
async function bodyOf(c: any) {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
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
  const policy = oldPayload?.policy || current?.loginPolicy || current?.security?.login_policy || "ANY_MFA";
  return sessionRefreshSeconds(current?.role, policy);
}
async function storePreparedRefresh(c: any, refreshId: string, company: string, data: AnyRow) {
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), REFRESH_SCOPE, company || null, refreshId, JSON.stringify(data), timestamp, timestamp).run();
  c.executionCtx?.waitUntil?.(
    c.env.DB.prepare("DELETE FROM json_store WHERE scope=? AND updated_at<?")
      .bind(REFRESH_SCOPE, new Date(Date.now() - 86_400_000).toISOString()).run(),
  );
}
async function preparedRefresh(c: any, refreshId: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,data,updated_at FROM json_store
      WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(REFRESH_SCOPE, refreshId).first<AnyRow>();
  if (!row?.id) return null;
  try {
    const data = JSON.parse(text(row.data) || "{}");
    return { rowId: row.id, ...data };
  } catch {
    return null;
  }
}
async function markPreparedRefresh(c: any, rowId: string, data: AnyRow) {
  await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
    .bind(JSON.stringify(data), nowIso(), rowId).run();
}

export function registerAuthSessionRefreshRoutes(app: any) {
  // Aşama 1: yeni token hazırlanır; canlı session henüz değiştirilmez.
  // Böylece cevap ağda kaybolursa mevcut token çalışmaya devam eder.
  app.post("/api/auth/refresh", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current?.session?.id) {
      return c.json({ ok: false, error: { code: "SESSION_INVALID", message: "Oturum yenilenemedi. Mevcut oturum doğrulanamadı." } }, 401);
    }
    if (isOwner(current.role)) {
      return c.json({
        ok: false,
        error: {
          code: "OWNER_SESSION_REFRESH_DISABLED",
          message: "Uygulama sahibi oturumu otomatik yenilenmez. Yeni tarayıcı oturumunda şifre ve MFA ile yeniden giriş yapın.",
        },
      }, 403);
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

    const refreshId = crypto.randomUUID();
    const refreshSecret = randomToken(24);
    const prepareExpiresAt = addSeconds(REFRESH_PREPARE_SECONDS);
    await storePreparedRefresh(c, refreshId, company, {
      refreshId,
      sessionId: current.session.id,
      userId: current.id,
      company,
      role,
      oldTokenHash: await sha256(oldToken),
      newTokenHash: await sha256(newToken),
      refreshSecretHash: await sha256(refreshSecret),
      expiresAt,
      prepareExpiresAt,
      committedAt: null,
    });

    const { security, session, ...user } = current;
    void security;
    return c.json({
      ok: true,
      stage: "REFRESH_PREPARED",
      refreshId,
      refreshSecret,
      token: newToken,
      expiresIn: ttl,
      expiresAt,
      prepareExpiresAt,
      rolling: false,
      user,
      session: { id: session.id, expiresAt: session.expires_at, lastSeenAt: session.last_seen_at },
    });
  });

  // Aşama 2: istemci hazırlanan tokenı aldığını kanıtlar; token ancak şimdi devreye girer.
  // Endpoint refreshSecret ile korunur ve idempotenttir. Commit cevabı kaybolursa aynı
  // refreshId/secret ile tekrar çağrılabilir.
  app.post("/api/auth/refresh/commit", async (c: any) => {
    const body = await bodyOf(c);
    const refreshId = text(body.refreshId);
    const refreshSecret = text(body.refreshSecret);
    if (!refreshId || !refreshSecret) {
      return c.json({ ok: false, error: { code: "REFRESH_COMMIT_REQUIRED", message: "Oturum yenileme onayı eksik." } }, 400);
    }

    const prepared = await preparedRefresh(c, refreshId);
    if (!prepared || Date.parse(text(prepared.prepareExpiresAt)) <= Date.now()) {
      return c.json({ ok: false, error: { code: "REFRESH_EXPIRED", message: "Oturum yenileme isteğinin süresi doldu." } }, 410);
    }
    if (!safeEqual(text(prepared.refreshSecretHash), await sha256(refreshSecret))) {
      return c.json({ ok: false, error: { code: "REFRESH_SECRET_INVALID", message: "Oturum yenileme onayı geçersiz." } }, 401);
    }

    const session = await c.env.DB.prepare(
      `SELECT id,user_id,token_hash,revoked_at,expires_at FROM auth_sessions
        WHERE id=? AND user_id=? LIMIT 1`,
    ).bind(prepared.sessionId, prepared.userId).first<AnyRow>();
    if (!session || session.revoked_at) {
      return c.json({ ok: false, error: { code: "SESSION_REVOKED", message: "Oturum kapatılmış." } }, 401);
    }

    const currentHash = text(session.token_hash);
    const oldHash = text(prepared.oldTokenHash);
    const newHash = text(prepared.newTokenHash);
    if (safeEqual(currentHash, newHash)) {
      if (!prepared.committedAt) {
        prepared.committedAt = nowIso();
        await markPreparedRefresh(c, prepared.rowId, prepared);
      }
      return c.json({ ok: true, stage: "REFRESH_COMMITTED", idempotent: true, expiresAt: prepared.expiresAt });
    }
    if (!safeEqual(currentHash, oldHash)) {
      return c.json({ ok: false, error: { code: "SESSION_ROTATED", message: "Oturum başka bir sekmede yenilendi." } }, 409);
    }

    const timestamp = nowIso();
    const result = await c.env.DB.prepare(
      `UPDATE auth_sessions
          SET token_hash=?,role_at_login=?,main_company_slug=?,expires_at=?,last_seen_at=?
        WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?`,
    ).bind(
      newHash, prepared.role, prepared.company, prepared.expiresAt, timestamp,
      prepared.sessionId, prepared.userId, oldHash, timestamp,
    ).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      const after = await c.env.DB.prepare("SELECT token_hash,revoked_at FROM auth_sessions WHERE id=? LIMIT 1")
        .bind(prepared.sessionId).first<AnyRow>();
      if (after && !after.revoked_at && safeEqual(text(after.token_hash), newHash)) {
        return c.json({ ok: true, stage: "REFRESH_COMMITTED", idempotent: true, expiresAt: prepared.expiresAt });
      }
      return c.json({ ok: false, error: { code: "SESSION_ROTATED", message: "Oturum aynı anda başka bir işlemle değişti." } }, 409);
    }

    prepared.committedAt = timestamp;
    await markPreparedRefresh(c, prepared.rowId, prepared);
    return c.json({ ok: true, stage: "REFRESH_COMMITTED", idempotent: false, expiresAt: prepared.expiresAt });
  });
}
