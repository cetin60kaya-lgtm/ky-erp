import { compare } from "bcryptjs";

const SESSION_SECONDS = 60 * 60 * 12;

type AnyRow = Record<string, any>;

function jsonError(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

function base64UrlEncode(value: unknown) {
  const raw = JSON.stringify(value);
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function createSessionToken(user: AnyRow) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode({ alg: "none", typ: "JWT" });
  const payload = base64UrlEncode({
    sub: String(user.id || ""),
    username: String(user.username || ""),
    role: String(user.role || "VIEWER"),
    iat: now,
    exp: now + SESSION_SECONDS,
  });
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return `${header}.${payload}.${nonce}`;
}

function parseSessionToken(token: string): AnyRow | null {
  const parts = String(token || "").trim().split(".");
  if (parts.length < 2) return null;
  try {
    const payload = base64UrlDecode(parts[1]);
    const exp = Number(payload?.exp || 0);
    if (!payload?.sub || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(c: any) {
  const header = String(c.req.header("Authorization") || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  )
    .bind(table)
    .first();
  return Boolean(row?.name);
}

async function permissionRows(c: any, userId: string) {
  if (!(await tableExists(c, "auth_user_module_permissions"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT module_key, can_view, can_create, can_update, can_delete, can_approve
       FROM auth_user_module_permissions
      WHERE user_id = ?
      ORDER BY module_key`,
  )
    .bind(userId)
    .all();
  return (result.results || []).map((row: AnyRow) => ({
    moduleKey: String(row.module_key || ""),
    canView: Boolean(row.can_view),
    canCreate: Boolean(row.can_create),
    canUpdate: Boolean(row.can_update),
    canDelete: Boolean(row.can_delete),
    canApprove: Boolean(row.can_approve),
  }));
}

async function userPayload(c: any, user: AnyRow) {
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    fullName: String(user.full_name || user.fullName || user.username || "Kullanıcı"),
    role: String(user.role || "VIEWER").toUpperCase(),
    mustChangePassword: Boolean(user.must_change_password),
    permissions: await permissionRows(c, String(user.id || "")),
  };
}

async function findUserByUsername(c: any, username: string) {
  if (!(await tableExists(c, "auth_users"))) return null;
  return c.env.DB.prepare(
    `SELECT id, username, password_hash, full_name, role, is_active, must_change_password
       FROM auth_users
      WHERE LOWER(username) = ?
      LIMIT 1`,
  )
    .bind(username.toLowerCase())
    .first();
}

async function findUserById(c: any, id: string) {
  if (!(await tableExists(c, "auth_users"))) return null;
  return c.env.DB.prepare(
    `SELECT id, username, full_name, role, is_active, must_change_password
       FROM auth_users
      WHERE id = ?
      LIMIT 1`,
  )
    .bind(id)
    .first();
}

export async function getAuthenticatedUser(c: any) {
  const payload = parseSessionToken(bearerToken(c));
  if (!payload) return null;
  const user = await findUserById(c, String(payload.sub));
  if (!user || !Boolean(user.is_active)) return null;
  return userPayload(c, user);
}

export function registerAuthCloudRoutes(app: any) {
  app.post("/api/auth/login", async (c: any) => {
    let body: AnyRow = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) {
      return c.json(jsonError("AUTH_REQUIRED", "Kullanıcı adı ve şifre zorunludur."), 400);
    }

    const user = await findUserByUsername(c, username);
    if (!user || !Boolean(user.is_active)) {
      return c.json(jsonError("INVALID_CREDENTIALS", "Kullanıcı adı veya şifre hatalı."), 401);
    }

    const matches = await compare(password, String(user.password_hash || ""));
    if (!matches) {
      return c.json(jsonError("INVALID_CREDENTIALS", "Kullanıcı adı veya şifre hatalı."), 401);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare("UPDATE auth_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, user.id)
      .run();
    const responseUser = await userPayload(c, user);
    return c.json({
      ok: true,
      token: createSessionToken(user),
      user: responseUser,
    });
  });

  app.get("/api/auth/me", async (c: any) => {
    const payload = parseSessionToken(bearerToken(c));
    if (!payload) {
      return c.json(jsonError("UNAUTHORIZED", "Oturum geçersiz veya süresi dolmuş."), 401);
    }

    const user = await findUserById(c, String(payload.sub));
    if (!user || !Boolean(user.is_active)) {
      return c.json(jsonError("UNAUTHORIZED", "Kullanıcı bulunamadı veya pasif."), 401);
    }

    return c.json({ ok: true, user: await userPayload(c, user) });
  });

  app.post("/api/auth/logout", async (c: any) => c.json({ ok: true }));
}
