// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const PHONE_APPROVAL_SECONDS = 10 * 60;
const VAPID_SECRET_KEY = "VAPID_P256_KEYPAIR_V1";
const VAPID_SUBJECT = "mailto:admin@kyerp.net";

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
function jsonError(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function clientIp(c: any) {
  return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]);
}
function userAgent(c: any) {
  return text(c.req.header("User-Agent")).slice(0, 300);
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
}
function isSuper(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function isCompanyAdmin(role: unknown) {
  return upper(role) === "COMPANY_ADMIN";
}
function roleOf(row: AnyRow) {
  const role = upper(row?.role_override || row?.role || "VIEWER");
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}
function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
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
async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return Boolean(row?.name);
}
async function schemaReady(c: any) {
  return (await tableExists(c, "auth_push_devices")) &&
    (await tableExists(c, "auth_phone_login_challenges")) &&
    (await tableExists(c, "auth_company_login_approval_settings"));
}
async function audit(c: any, action: string, actorId = "", targetId = "", companySlug = "", detail: AnyRow = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(), actorId || null, targetId || null, companySlug || null,
      action, null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso(),
    ).run();
  } catch {}
}

async function ensureVapidKeyPair(c: any) {
  let row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1")
    .bind(VAPID_SECRET_KEY).first<AnyRow>();
  if (row?.secret_value) {
    try {
      const parsed = JSON.parse(text(row.secret_value));
      if (parsed?.privateJwk && parsed?.publicKey) return parsed;
    } catch {}
  }

  const generated = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", generated.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", generated.publicKey));
  const pair = { privateJwk, publicKey: base64Url(publicRaw), createdAt: nowIso() };
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at)
     VALUES (?,?,?,?)`,
  ).bind(VAPID_SECRET_KEY, JSON.stringify(pair), timestamp, timestamp).run();

  row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1")
    .bind(VAPID_SECRET_KEY).first<AnyRow>();
  const stored = JSON.parse(text(row?.secret_value) || "{}");
  if (!stored?.privateJwk || !stored?.publicKey) throw new Error("VAPID anahtarı hazırlanamadı.");
  return stored;
}

async function vapidAuthorization(c: any, endpoint: string) {
  const pair = await ensureVapidKeyPair(c);
  const audience = new URL(endpoint).origin;
  const header = encodeJson({ typ: "JWT", alg: "ES256" });
  const payload = encodeJson({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  });
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    pair.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  ));
  return {
    value: `vapid t=${input}.${base64Url(signature)}, k=${pair.publicKey}`,
    publicKey: pair.publicKey,
  };
}

async function sendWake(c: any, device: AnyRow) {
  const endpoint = text(device.push_endpoint);
  if (!endpoint) return false;
  try {
    const auth = await vapidAuthorization(c, endpoint);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        TTL: "60",
        Urgency: "high",
        Authorization: auth.value,
      },
    });
    if (!response.ok) {
      const gone = response.status === 404 || response.status === 410;
      await c.env.DB.prepare(
        `UPDATE auth_push_devices
            SET is_active=CASE WHEN ? THEN 0 ELSE is_active END,last_error=?,updated_at=?
          WHERE id=?`,
      ).bind(gone ? 1 : 0, `HTTP ${response.status}`, nowIso(), device.id).run();
      return false;
    }
    await c.env.DB.prepare(
      "UPDATE auth_push_devices SET last_push_at=?,last_error=NULL,updated_at=? WHERE id=?",
    ).bind(nowIso(), nowIso(), device.id).run();
    return true;
  } catch (error) {
    await c.env.DB.prepare(
      "UPDATE auth_push_devices SET last_error=?,updated_at=? WHERE id=?",
    ).bind(error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300), nowIso(), device.id).run();
    return false;
  }
}

async function sendWakeMany(c: any, devices: AnyRow[]) {
  const unique = new Map<string, AnyRow>();
  for (const row of devices || []) {
    const endpoint = text(row?.push_endpoint);
    if (endpoint && !unique.has(endpoint)) unique.set(endpoint, row);
  }
  let success = 0;
  for (const row of unique.values()) {
    if (await sendWake(c, row)) success += 1;
  }
  return success;
}

async function activeDevicesForUser(c: any, userId: string, purpose: "SELF" | "MANAGER") {
  if (!(await schemaReady(c))) return [];
  const flag = purpose === "MANAGER" ? "manager_approval_enabled" : "self_login_enabled";
  const result = await c.env.DB.prepare(
    `SELECT * FROM auth_push_devices
      WHERE user_id=? AND is_active=1 AND ${flag}=1
      ORDER BY COALESCE(last_seen_at,updated_at,created_at) DESC`,
  ).bind(userId).all<AnyRow>();
  return result.results || [];
}

async function userRow(c: any, userId: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.password_hash,u.role,u.is_active,
            s.email,s.main_company_slug,s.role_override
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(userId).first<AnyRow>();
}

async function companyApprovalSettings(c: any, companySlug: string) {
  const slug = text(companySlug);
  const row = await c.env.DB.prepare(
    "SELECT * FROM auth_company_login_approval_settings WHERE main_company_slug=? LIMIT 1",
  ).bind(slug).first<AnyRow>();
  return {
    mainCompanySlug: slug,
    notifyCompanyOwner: row ? Boolean(row.notify_company_owner) : true,
    notifyApplicationOwner: row ? Boolean(row.notify_application_owner) : false,
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null,
  };
}

async function actorFromDevice(c: any) {
  if (!(await schemaReady(c))) return null;
  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const deviceToken = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !deviceToken) return null;
  const device = await c.env.DB.prepare(
    `SELECT d.*,u.username,u.full_name,u.role,u.is_active AS user_is_active,
            s.role_override,s.main_company_slug AS user_company_slug
       FROM auth_push_devices d
       JOIN auth_users u ON u.id=d.user_id
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE d.id=? AND d.is_active=1 LIMIT 1`,
  ).bind(deviceId).first<AnyRow>();
  if (!device || !Boolean(device.user_is_active)) return null;
  if (!safeEqual(text(device.device_token_hash), await sha256(deviceToken))) return null;
  const companySlug = text(device.user_company_slug || device.main_company_slug);
  c.executionCtx?.waitUntil?.(
    c.env.DB.prepare(
      "UPDATE auth_push_devices SET last_seen_at=?,updated_at=? WHERE id=? AND is_active=1",
    ).bind(nowIso(), nowIso(), device.id).run(),
  );
  return {
    device,
    userId: text(device.user_id),
    role: roleOf(device),
    companySlug,
    fullName: text(device.full_name || device.username),
  };
}

function canApproveTarget(actor: AnyRow, approval: AnyRow, settings: AnyRow) {
  const targetRole = roleOf({ role: approval.target_role, role_override: approval.target_role_override });
  if (isCompanyAdmin(actor.role)) {
    return actor.companySlug === text(approval.main_company_slug) &&
      !["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(targetRole);
  }
  if (isSuper(actor.role)) return Boolean(settings.notifyApplicationOwner);
  return false;
}

export async function startPhoneApprovalChallenge(c: any, user: AnyRow, source: AnyRow = {}) {
  if (!(await schemaReady(c))) return null;
  const devices = await activeDevicesForUser(c, text(user.id), "SELF");
  if (!devices.length) return null;

  const id = crypto.randomUUID();
  const token = randomToken(32);
  const companySlug = text(user.main_company_slug || user.mainCompanySlug || "mecit-hakan");
  const requestedAt = nowIso();
  const expiresAt = addSeconds(PHONE_APPROVAL_SECONDS);
  await c.env.DB.prepare(
    `INSERT INTO auth_phone_login_challenges
     (id,user_id,main_company_slug,challenge_token_hash,status,device_label,user_agent,ip_address,requested_at,expires_at)
     VALUES (?,?,?,?, 'PENDING',?,?,?,?,?)`,
  ).bind(
    id, user.id, companySlug, await sha256(token),
    text(source.deviceLabel || source.device_label), text(source.userAgent || source.user_agent || userAgent(c)),
    text(source.ipAddress || source.ip_address || clientIp(c)), requestedAt, expiresAt,
  ).run();

  const sent = await sendWakeMany(c, devices);
  if (!sent) {
    await c.env.DB.prepare(
      "UPDATE auth_phone_login_challenges SET status='FALLBACK',consumed_at=? WHERE id=? AND status='PENDING'",
    ).bind(nowIso(), id).run();
    return null;
  }

  await audit(c, "PHONE_LOGIN_APPROVAL_REQUESTED", user.id, user.id, companySlug, { challengeId: id, notifiedDevices: sent });
  return {
    ok: true,
    stage: "PHONE_APPROVAL_PENDING",
    phoneApprovalId: id,
    phoneApprovalToken: token,
    phoneApprovalExpiresAt: expiresAt,
    notifiedDevices: sent,
    message: "Telefonunuza KY ERP giriş onayı gönderildi. Bildirimden Onayla veya Reddet seçin.",
  };
}

export async function phoneApprovalFromRequest(c: any, idValue: unknown, tokenValue: unknown) {
  if (!(await schemaReady(c))) return null;
  const id = text(idValue);
  const token = text(tokenValue);
  if (!id || !token) return null;
  const row = await c.env.DB.prepare(
    "SELECT * FROM auth_phone_login_challenges WHERE id=? LIMIT 1",
  ).bind(id).first<AnyRow>();
  if (!row || !safeEqual(text(row.challenge_token_hash), await sha256(token))) return null;
  if (row.status === "PENDING" && Date.parse(text(row.expires_at)) <= Date.now()) {
    await c.env.DB.prepare(
      "UPDATE auth_phone_login_challenges SET status='EXPIRED',consumed_at=? WHERE id=? AND status='PENDING'",
    ).bind(nowIso(), id).run();
    return { ...row, status: "EXPIRED", consumed_at: nowIso() };
  }
  return row;
}

export async function consumePhoneApproval(c: any, idValue: unknown) {
  const id = text(idValue);
  const result = await c.env.DB.prepare(
    `UPDATE auth_phone_login_challenges SET consumed_at=?
      WHERE id=? AND status='APPROVED' AND consumed_at IS NULL`,
  ).bind(nowIso(), id).run();
  return Number(result?.meta?.changes || 0) > 0;
}

export async function cancelPhoneApproval(c: any, idValue: unknown) {
  const id = text(idValue);
  if (!id || !(await schemaReady(c))) return;
  await c.env.DB.prepare(
    `UPDATE auth_phone_login_challenges
        SET status='FALLBACK',consumed_at=COALESCE(consumed_at,?)
      WHERE id=? AND status='PENDING'`,
  ).bind(nowIso(), id).run();
}

export async function notifyManagerApproval(c: any, approvalId: string, companySlug: string) {
  if (!(await schemaReady(c))) return { sent: 0 };
  const settings = await companyApprovalSettings(c, companySlug);
  const userIds = new Set<string>();

  if (settings.notifyCompanyOwner) {
    const owners = await c.env.DB.prepare(
      `SELECT u.id,u.role,s.role_override
         FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE u.is_active=1 AND COALESCE(s.main_company_slug,'')=?`,
    ).bind(companySlug).all<AnyRow>();
    for (const row of owners.results || []) if (isCompanyAdmin(roleOf(row))) userIds.add(text(row.id));
  }

  if (settings.notifyApplicationOwner) {
    const owners = await c.env.DB.prepare(
      `SELECT u.id,u.role,s.role_override
         FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE u.is_active=1`,
    ).all<AnyRow>();
    for (const row of owners.results || []) if (isSuper(roleOf(row))) userIds.add(text(row.id));
  }

  const devices: AnyRow[] = [];
  for (const userId of userIds) devices.push(...await activeDevicesForUser(c, userId, "MANAGER"));
  const sent = await sendWakeMany(c, devices);
  await audit(c, "LOGIN_MANAGER_PUSH_DISPATCHED", "", "", companySlug, { approvalId, recipients: userIds.size, notifiedDevices: sent });
  return { sent };
}

async function pendingItems(c: any, actor: AnyRow) {
  const timestamp = nowIso();
  await c.env.DB.prepare(
    "UPDATE auth_phone_login_challenges SET status='EXPIRED',consumed_at=? WHERE status='PENDING' AND expires_at<=?",
  ).bind(timestamp, timestamp).run();
  await c.env.DB.prepare(
    "UPDATE auth_login_approvals SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=?",
  ).bind(timestamp).run();

  const items: AnyRow[] = [];
  const selfRows = await c.env.DB.prepare(
    `SELECT id,device_label,requested_at,expires_at
       FROM auth_phone_login_challenges
      WHERE user_id=? AND status='PENDING' AND consumed_at IS NULL AND expires_at>?
      ORDER BY requested_at ASC`,
  ).bind(actor.userId, timestamp).all<AnyRow>();
  for (const row of selfRows.results || []) {
    items.push({
      kind: "SELF_LOGIN",
      id: row.id,
      title: "KY ERP giriş isteği",
      body: `${text(row.device_label) || "Yeni cihaz"} için giriş onayı bekleniyor.`,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
      mainCompanySlug: actor.companySlug,
    });
  }

  if (isCompanyAdmin(actor.role)) {
    const rows = await c.env.DB.prepare(
      `SELECT a.id,a.main_company_slug,a.device_label,a.requested_at,a.expires_at,
              u.full_name,u.username,u.role AS target_role,s.role_override AS target_role_override
         FROM auth_login_approvals a
         JOIN auth_users u ON u.id=a.user_id
         LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE a.status='PENDING' AND a.consumed_at IS NULL AND a.expires_at>? AND a.main_company_slug=?
        ORDER BY a.requested_at ASC`,
    ).bind(timestamp, actor.companySlug).all<AnyRow>();
    for (const row of rows.results || []) {
      const settings = await companyApprovalSettings(c, text(row.main_company_slug));
      if (!settings.notifyCompanyOwner || !canApproveTarget(actor, row, settings)) continue;
      items.push({
        kind: "MANAGER_APPROVAL",
        id: row.id,
        title: "KY ERP firma giriş onayı",
        body: `${text(row.full_name || row.username)} · ${text(row.device_label) || "yeni cihaz"}`,
        requestedAt: row.requested_at,
        expiresAt: row.expires_at,
        mainCompanySlug: row.main_company_slug,
      });
    }
  } else if (isSuper(actor.role)) {
    const rows = await c.env.DB.prepare(
      `SELECT a.id,a.main_company_slug,a.device_label,a.requested_at,a.expires_at,
              u.full_name,u.username,u.role AS target_role,s.role_override AS target_role_override
         FROM auth_login_approvals a
         JOIN auth_users u ON u.id=a.user_id
         LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE a.status='PENDING' AND a.consumed_at IS NULL AND a.expires_at>?
        ORDER BY a.requested_at ASC`,
    ).bind(timestamp).all<AnyRow>();
    for (const row of rows.results || []) {
      const settings = await companyApprovalSettings(c, text(row.main_company_slug));
      if (!canApproveTarget(actor, row, settings)) continue;
      items.push({
        kind: "MANAGER_APPROVAL",
        id: row.id,
        title: "KY ERP firma giriş onayı",
        body: `${text(row.full_name || row.username)} · ${text(row.main_company_slug)} · ${text(row.device_label) || "yeni cihaz"}`,
        requestedAt: row.requested_at,
        expiresAt: row.expires_at,
        mainCompanySlug: row.main_company_slug,
      });
    }
  }

  return items;
}

export function registerAuthPushRoutes(app: any) {
  app.get("/api/auth/push/config", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon onayı ayarları için oturum gereklidir."), 401);
    if (!(await schemaReady(c))) return c.json(jsonError("PUSH_SCHEMA_NOT_READY", "Telefon onayı veritabanı şeması henüz hazır değil."), 503);
    const pair = await ensureVapidKeyPair(c);
    const devices = await c.env.DB.prepare(
      `SELECT id,device_label,self_login_enabled,manager_approval_enabled,is_active,created_at,updated_at,last_seen_at,last_push_at,last_error
         FROM auth_push_devices
        WHERE user_id=? ORDER BY is_active DESC,COALESCE(last_seen_at,updated_at,created_at) DESC`,
    ).bind(current.id).all<AnyRow>();
    return c.json({
      ok: true,
      data: {
        supported: true,
        applicationServerKey: pair.publicKey,
        devices: (devices.results || []).map((row: AnyRow) => ({
          id: row.id,
          deviceLabel: text(row.device_label),
          selfLoginEnabled: Boolean(row.self_login_enabled),
          managerApprovalEnabled: Boolean(row.manager_approval_enabled),
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastSeenAt: row.last_seen_at,
          lastPushAt: row.last_push_at,
          lastError: text(row.last_error),
        })),
      },
    });
  });

  app.post("/api/auth/push/devices/register", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon onayı kaydı için oturum gereklidir."), 401);
    if (!(await schemaReady(c))) return c.json(jsonError("PUSH_SCHEMA_NOT_READY", "Telefon onayı veritabanı şeması henüz hazır değil."), 503);
    const body = await bodyOf(c);
    const password = String(body.password || "");
    const user = await userRow(c, current.id);
    if (!user || !Boolean(user.is_active) || !password || !(await compare(password, text(user.password_hash)))) {
      return c.json(jsonError("STEP_UP_FAILED", "Bu cihazı güvenilir telefon onayı cihazı yapmak için mevcut şifrenizi doğrulayın."), 401);
    }
    const subscription = body.subscription && typeof body.subscription === "object" ? body.subscription : {};
    const endpoint = text(subscription.endpoint);
    const p256dh = text(subscription.keys?.p256dh);
    const authKey = text(subscription.keys?.auth);
    if (!/^https:\/\//i.test(endpoint)) return c.json(jsonError("PUSH_SUBSCRIPTION_INVALID", "Tarayıcı bildirim aboneliği geçersiz."), 400);

    const existing = await c.env.DB.prepare("SELECT * FROM auth_push_devices WHERE push_endpoint=? LIMIT 1").bind(endpoint).first<AnyRow>();
    if (existing && text(existing.user_id) !== text(current.id)) {
      return c.json(jsonError("PUSH_ENDPOINT_ALREADY_BOUND", "Bu bildirim aboneliği başka bir KY ERP hesabına bağlı."), 409);
    }

    const deviceId = text(existing?.id) || crypto.randomUUID();
    const deviceToken = randomToken(36);
    const timestamp = nowIso();
    const companySlug = text(current.mainCompanySlug || current.security?.main_company_slug || "mecit-hakan");
    const label = text(body.deviceLabel || current.session?.device_label || userAgent(c)).slice(0, 180);
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE auth_push_devices
            SET user_id=?,main_company_slug=?,p256dh_key=?,auth_key=?,device_token_hash=?,device_label=?,user_agent=?,
                self_login_enabled=?,manager_approval_enabled=?,is_active=1,updated_at=?,last_seen_at=?,last_error=NULL
          WHERE id=?`,
      ).bind(
        current.id, companySlug, p256dh || null, authKey || null, await sha256(deviceToken), label, userAgent(c),
        body.selfLoginEnabled === false ? 0 : 1, body.managerApprovalEnabled === false ? 0 : 1,
        timestamp, timestamp, deviceId,
      ).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO auth_push_devices
         (id,user_id,main_company_slug,push_endpoint,p256dh_key,auth_key,device_token_hash,device_label,user_agent,
          self_login_enabled,manager_approval_enabled,is_active,created_at,updated_at,last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        deviceId, current.id, companySlug, endpoint, p256dh || null, authKey || null, await sha256(deviceToken),
        label, userAgent(c), body.selfLoginEnabled === false ? 0 : 1, body.managerApprovalEnabled === false ? 0 : 1,
        1, timestamp, timestamp, timestamp,
      ).run();
    }
    await audit(c, "PUSH_DEVICE_REGISTERED", current.id, current.id, companySlug, { deviceId, deviceLabel: label });
    return c.json({
      ok: true,
      data: {
        deviceId,
        deviceToken,
        deviceLabel: label,
        selfLoginEnabled: body.selfLoginEnabled !== false,
        managerApprovalEnabled: body.managerApprovalEnabled !== false,
        note: "Cihaz anahtarı yalnız bu kayıt cevabında verilir ve sunucuda hash olarak saklanır.",
      },
    });
  });

  app.delete("/api/auth/push/devices/:id", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gereklidir."), 401);
    if (!(await schemaReady(c))) return c.json(jsonError("PUSH_SCHEMA_NOT_READY", "Telefon onayı veritabanı şeması henüz hazır değil."), 503);
    const device = await c.env.DB.prepare("SELECT * FROM auth_push_devices WHERE id=? LIMIT 1").bind(c.req.param("id")).first<AnyRow>();
    if (!device || text(device.user_id) !== text(current.id)) return c.json(jsonError("PUSH_DEVICE_NOT_FOUND", "Telefon onayı cihazı bulunamadı."), 404);
    await c.env.DB.prepare("UPDATE auth_push_devices SET is_active=0,updated_at=? WHERE id=?").bind(nowIso(), device.id).run();
    await audit(c, "PUSH_DEVICE_DISABLED", current.id, current.id, text(device.main_company_slug), { deviceId: device.id });
    return c.json({ ok: true });
  });

  app.get("/api/admin/security/company-approval-settings/:slug", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || (!isSuper(current.role) && !isCompanyAdmin(current.role))) {
      return c.json(jsonError("FORBIDDEN", "Firma giriş onayı ayarları için yönetici yetkisi gereklidir."), 403);
    }
    if (!(await schemaReady(c))) return c.json(jsonError("PUSH_SCHEMA_NOT_READY", "Telefon onayı veritabanı şeması henüz hazır değil."), 503);
    const slug = text(c.req.param("slug"));
    if (!isSuper(current.role) && slug !== text(current.mainCompanySlug)) return c.json(jsonError("FORBIDDEN", "Başka firmanın giriş onayı ayarını görüntüleyemezsiniz."), 403);
    return c.json({ ok: true, data: await companyApprovalSettings(c, slug) });
  });

  app.patch("/api/admin/security/company-approval-settings/:slug", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Uygulama sahibine bildirim tercihini yalnız Uygulama Sahibi değiştirebilir."), current ? 403 : 401);
    if (!(await schemaReady(c))) return c.json(jsonError("PUSH_SCHEMA_NOT_READY", "Telefon onayı veritabanı şeması henüz hazır değil."), 503);
    const slug = text(c.req.param("slug"));
    const body = await bodyOf(c);
    const previous = await companyApprovalSettings(c, slug);
    const notifyCompanyOwner = body.notifyCompanyOwner === undefined ? previous.notifyCompanyOwner : Boolean(body.notifyCompanyOwner);
    const notifyApplicationOwner = body.notifyApplicationOwner === undefined ? previous.notifyApplicationOwner : Boolean(body.notifyApplicationOwner);
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO auth_company_login_approval_settings
       (main_company_slug,notify_company_owner,notify_application_owner,created_at,updated_at,updated_by)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(main_company_slug) DO UPDATE SET
         notify_company_owner=excluded.notify_company_owner,
         notify_application_owner=excluded.notify_application_owner,
         updated_at=excluded.updated_at,
         updated_by=excluded.updated_by`,
    ).bind(slug, notifyCompanyOwner ? 1 : 0, notifyApplicationOwner ? 1 : 0, timestamp, timestamp, current.id).run();
    await audit(c, "COMPANY_LOGIN_APPROVAL_SETTINGS_UPDATED", current.id, "", slug, { notifyCompanyOwner, notifyApplicationOwner });
    return c.json({ ok: true, data: await companyApprovalSettings(c, slug) });
  });

  app.get("/api/auth/push/device/pending", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "Telefon onayı cihazı doğrulanamadı."), 401);
    return c.json({ ok: true, data: { items: await pendingItems(c, actor), checkedAt: nowIso() } });
  });

  app.post("/api/auth/push/device/decision", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "Telefon onayı cihazı doğrulanamadı."), 401);
    const body = await bodyOf(c);
    const kind = upper(body.kind);
    const id = text(body.id);
    const decision = upper(body.decision);
    if (!["APPROVE", "DENY"].includes(decision) || !id) return c.json(jsonError("PUSH_DECISION_INVALID", "Onay veya ret seçilmelidir."), 400);

    if (kind === "SELF_LOGIN") {
      const row = await c.env.DB.prepare(
        "SELECT * FROM auth_phone_login_challenges WHERE id=? AND user_id=? LIMIT 1",
      ).bind(id, actor.userId).first<AnyRow>();
      if (!row || row.status !== "PENDING" || Date.parse(text(row.expires_at)) <= Date.now()) {
        return c.json(jsonError("PHONE_APPROVAL_NOT_FOUND", "Giriş onayı bulunamadı veya süresi doldu."), 404);
      }
      const status = decision === "APPROVE" ? "APPROVED" : "DENIED";
      await c.env.DB.prepare(
        `UPDATE auth_phone_login_challenges SET status=?,decided_at=?,decided_by_device_id=?
          WHERE id=? AND status='PENDING'`,
      ).bind(status, nowIso(), actor.device.id, id).run();
      await audit(c, decision === "APPROVE" ? "PHONE_LOGIN_APPROVED" : "PHONE_LOGIN_DENIED", actor.userId, actor.userId, actor.companySlug, { challengeId: id, deviceId: actor.device.id });
      return c.json({ ok: true, data: { kind, id, status } });
    }

    if (kind === "MANAGER_APPROVAL") {
      const approval = await c.env.DB.prepare(
        `SELECT a.*,u.role AS target_role,s.role_override AS target_role_override
           FROM auth_login_approvals a
           JOIN auth_users u ON u.id=a.user_id
           LEFT JOIN auth_user_security s ON s.user_id=u.id
          WHERE a.id=? LIMIT 1`,
      ).bind(id).first<AnyRow>();
      if (!approval || approval.status !== "PENDING" || Date.parse(text(approval.expires_at)) <= Date.now()) {
        return c.json(jsonError("APPROVAL_NOT_FOUND", "Bekleyen firma giriş onayı bulunamadı veya süresi doldu."), 404);
      }
      const settings = await companyApprovalSettings(c, text(approval.main_company_slug));
      if (!canApproveTarget(actor, approval, settings)) return c.json(jsonError("FORBIDDEN", "Bu firma girişini telefonunuzdan onaylayamazsınız."), 403);
      const status = decision === "APPROVE" ? "APPROVED" : "DENIED";
      await c.env.DB.prepare(
        "UPDATE auth_login_approvals SET status=?,decided_at=?,decided_by=? WHERE id=? AND status='PENDING'",
      ).bind(status, nowIso(), actor.userId, id).run();
      await audit(c, decision === "APPROVE" ? "LOGIN_APPROVED_PUSH" : "LOGIN_DENIED_PUSH", actor.userId, text(approval.user_id), text(approval.main_company_slug), { approvalId: id, deviceId: actor.device.id });
      return c.json({ ok: true, data: { kind, id, status } });
    }

    return c.json(jsonError("PUSH_KIND_INVALID", "Telefon onayı türü geçersiz."), 400);
  });
}
