// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const PHONE_APPROVAL_SECONDS = 10 * 60;
const VAPID_SECRET_KEY = "VAPID_P256_KEYPAIR_V1";
const VAPID_SUBJECT = "mailto:admin@kyerp.net";

const DEVICE_SCOPE = "AUTH_PUSH_DEVICE";
const PHONE_SCOPE = "AUTH_PHONE_LOGIN";
const COMPANY_SETTING_SCOPE = "AUTH_COMPANY_LOGIN_APPROVAL";

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
function friendlyDeviceLabel(labelValue: unknown, userAgentValue: unknown = "") {
  const label = text(labelValue);
  const ua = text(userAgentValue);
  if (label && !upper(label).startsWith("BROWSER:")) return label;
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android telefon" : "Android tablet";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows bilgisayar";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux cihaz";
  return "Yeni cihaz";
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
}
function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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

async function tableExists(c: any, tableName: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(tableName).first<AnyRow>();
  return Boolean(row?.name);
}

async function storeGet(c: any, scope: string, fileName: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(scope, fileName).first<AnyRow>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    storeScope: text(row.scope),
    storeCompanySlug: text(row.main_company_slug),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storeList(c: any, scope: string, companySlug = "") {
  if (!(await tableExists(c, "json_store"))) return [];
  const result = companySlug
    ? await c.env.DB.prepare(
        `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at
           FROM json_store
          WHERE scope=? AND main_company_slug=?
          ORDER BY updated_at DESC,id DESC`,
      ).bind(scope, companySlug).all<AnyRow>()
    : await c.env.DB.prepare(
        `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at
           FROM json_store
          WHERE scope=?
          ORDER BY updated_at DESC,id DESC`,
      ).bind(scope).all<AnyRow>();

  return (result.results || []).map((row: AnyRow) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    storeScope: text(row.scope),
    storeCompanySlug: text(row.main_company_slug),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function storePut(c: any, scope: string, fileName: string, companySlug: string, data: AnyRow) {
  if (!(await tableExists(c, "json_store"))) throw new Error("Telefon onayı depolama katmanı hazır değil.");
  const current = await storeGet(c, scope, fileName);
  const timestamp = nowIso();
  const payload = {
    ...data,
    id: text(data.id || fileName),
    mainCompanySlug: text(data.mainCompanySlug || companySlug),
    createdAt: text(data.createdAt || current?.createdAt || timestamp),
    updatedAt: timestamp,
  };
  if (current?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store
          SET main_company_slug=?,data=?,updated_at=?
        WHERE id=? AND scope=?`,
    ).bind(companySlug || null, JSON.stringify(payload), timestamp, current.storeId, scope).run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(storeId, scope, companySlug || null, fileName, JSON.stringify(payload), timestamp, timestamp).run();
  return { ...payload, storeId, fileName };
}

async function atomicPhoneUpdate(c: any, current: AnyRow, expectedStatus: string, patch: AnyRow) {
  if (!current?.storeId) return { changed: false, row: current || null };
  const timestamp = nowIso();
  const next = { ...current, ...patch, updatedAt: timestamp };
  delete next.storeId;
  delete next.storeScope;
  delete next.storeCompanySlug;
  delete next.fileName;
  const result = await c.env.DB.prepare(
    `UPDATE json_store
        SET data=?,updated_at=?
      WHERE id=? AND scope=?
        AND UPPER(COALESCE(json_extract(data,'$.status'),''))=?
        AND COALESCE(json_extract(data,'$.consumedAt'),'')=''`,
  ).bind(JSON.stringify(next), timestamp, current.storeId, PHONE_SCOPE, upper(expectedStatus)).run();
  const changed = Number(result?.meta?.changes || 0) > 0;
  return { changed, row: changed ? { ...next, storeId: current.storeId, fileName: current.id } : await storeGet(c, PHONE_SCOPE, text(current.id)) };
}

async function audit(c: any, action: string, actorId = "", targetId = "", companySlug = "", detail: AnyRow = {}) {
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

async function saveDevice(c: any, device: AnyRow) {
  return storePut(c, DEVICE_SCOPE, text(device.id), text(device.mainCompanySlug), device);
}

async function sendWake(c: any, device: AnyRow) {
  const endpoint = text(device.pushEndpoint);
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
      await saveDevice(c, {
        ...device,
        isActive: gone ? false : device.isActive !== false,
        lastError: `HTTP ${response.status}`,
      });
      return false;
    }
    await saveDevice(c, { ...device, lastPushAt: nowIso(), lastError: "" });
    return true;
  } catch (error) {
    await saveDevice(c, {
      ...device,
      lastError: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    });
    return false;
  }
}

async function sendWakeMany(c: any, devices: AnyRow[]) {
  const unique = new Map<string, AnyRow>();
  for (const row of devices || []) {
    const endpoint = text(row?.pushEndpoint);
    if (endpoint && !unique.has(endpoint)) unique.set(endpoint, row);
  }
  let success = 0;
  for (const row of unique.values()) if (await sendWake(c, row)) success += 1;
  return success;
}

async function activeDevicesForUser(c: any, userId: string, purpose: "SELF" | "MANAGER") {
  const rows = await storeList(c, DEVICE_SCOPE);
  return rows.filter((row: AnyRow) =>
    text(row.userId) === userId &&
    row.isActive !== false &&
    (purpose === "MANAGER" ? row.managerApprovalEnabled !== false : row.selfLoginEnabled !== false)
  );
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
  const row = await storeGet(c, COMPANY_SETTING_SCOPE, slug);
  return {
    mainCompanySlug: slug,
    notifyCompanyOwner: row ? row.notifyCompanyOwner !== false : true,
    notifyApplicationOwner: row ? Boolean(row.notifyApplicationOwner) : false,
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

async function actorFromDevice(c: any) {
  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const deviceToken = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !deviceToken) return null;

  const device = await storeGet(c, DEVICE_SCOPE, deviceId);
  if (!device || device.isActive === false) return null;
  if (!safeEqual(text(device.deviceTokenHash), await sha256(deviceToken))) return null;

  const user = await c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,
            s.role_override,s.main_company_slug
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(text(device.userId)).first<AnyRow>();
  if (!user || !Boolean(user.is_active)) return null;

  const companySlug = text(user.main_company_slug || device.mainCompanySlug);
  c.executionCtx?.waitUntil?.(saveDevice(c, { ...device, mainCompanySlug: companySlug, lastSeenAt: nowIso() }));

  return {
    device,
    userId: text(user.id),
    role: roleOf(user),
    companySlug,
    fullName: text(user.full_name || user.username),
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
  const devices = await activeDevicesForUser(c, text(user.id), "SELF");
  if (!devices.length) return null;

  const id = crypto.randomUUID();
  const token = randomToken(32);
  const companySlug = text(user.main_company_slug || user.mainCompanySlug || "mecit-hakan");
  const requestedAt = nowIso();
  const expiresAt = addSeconds(PHONE_APPROVAL_SECONDS);

  const challenge = await storePut(c, PHONE_SCOPE, id, companySlug, {
    id,
    userId: text(user.id),
    mainCompanySlug: companySlug,
    challengeTokenHash: await sha256(token),
    status: "PENDING",
    deviceLabel: text(source.deviceLabel || source.device_label),
    userAgent: text(source.userAgent || source.user_agent || userAgent(c)),
    ipAddress: text(source.ipAddress || source.ip_address || clientIp(c)),
    requestedAt,
    expiresAt,
    decidedAt: "",
    decidedByDeviceId: "",
    consumedAt: "",
  });

  const sent = await sendWakeMany(c, devices);
  if (!sent) {
    await atomicPhoneUpdate(c, challenge, "PENDING", { status: "FALLBACK", consumedAt: nowIso() });
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
    message: "Telefonunuza KY ERP giriş onayı gönderildi. Bildirimi açıp Onayla veya Reddet seçin.",
  };
}

export async function phoneApprovalFromRequest(c: any, idValue: unknown, tokenValue: unknown) {
  const id = text(idValue);
  const token = text(tokenValue);
  if (!id || !token) return null;
  let row = await storeGet(c, PHONE_SCOPE, id);
  if (!row || !safeEqual(text(row.challengeTokenHash), await sha256(token))) return null;
  if (upper(row.status) === "PENDING" && Date.parse(text(row.expiresAt)) <= Date.now()) {
    const update = await atomicPhoneUpdate(c, row, "PENDING", { status: "EXPIRED", consumedAt: nowIso() });
    row = update.row || row;
  }
  return row;
}

export async function consumePhoneApproval(c: any, idValue: unknown) {
  const row = await storeGet(c, PHONE_SCOPE, text(idValue));
  if (!row || upper(row.status) !== "APPROVED" || text(row.consumedAt)) return false;
  const update = await atomicPhoneUpdate(c, row, "APPROVED", { consumedAt: nowIso() });
  return update.changed;
}

export async function cancelPhoneApproval(c: any, idValue: unknown) {
  const row = await storeGet(c, PHONE_SCOPE, text(idValue));
  if (!row || upper(row.status) !== "PENDING" || text(row.consumedAt)) return;
  await atomicPhoneUpdate(c, row, "PENDING", { status: "FALLBACK", consumedAt: nowIso() });
}

export async function notifyManagerApproval(c: any, approvalId: string, companySlug: string) {
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
  const items: AnyRow[] = [];

  const selfRows = (await storeList(c, PHONE_SCOPE))
    .filter((row: AnyRow) => text(row.userId) === actor.userId && !text(row.consumedAt));
  for (const row of selfRows) {
    let current = row;
    if (upper(current.status) === "PENDING" && Date.parse(text(current.expiresAt)) <= Date.now()) {
      const update = await atomicPhoneUpdate(c, current, "PENDING", { status: "EXPIRED", consumedAt: timestamp });
      current = update.row || current;
    }
    if (upper(current.status) !== "PENDING" || text(current.consumedAt)) continue;
    items.push({
      kind: "SELF_LOGIN",
      id: current.id,
      title: "KY ERP · Giriş Onayı",
      body: `${friendlyDeviceLabel(current.deviceLabel, current.userAgent)} için giriş onayı bekleniyor.`,
      requestedAt: current.requestedAt,
      expiresAt: current.expiresAt,
      mainCompanySlug: actor.companySlug,
    });
  }

  await c.env.DB.prepare(
    "UPDATE auth_login_approvals SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=?",
  ).bind(timestamp).run();

  const managerRows = isCompanyAdmin(actor.role)
    ? await c.env.DB.prepare(
        `SELECT a.id,a.user_id,a.main_company_slug,a.device_label,a.user_agent,a.ip_address,a.requested_at,a.expires_at,
                u.full_name,u.username,u.role AS target_role,s.role_override AS target_role_override
           FROM auth_login_approvals a
           JOIN auth_users u ON u.id=a.user_id
           LEFT JOIN auth_user_security s ON s.user_id=u.id
          WHERE a.status='PENDING' AND a.consumed_at IS NULL AND a.expires_at>? AND a.main_company_slug=?
          ORDER BY a.requested_at ASC`,
      ).bind(timestamp, actor.companySlug).all<AnyRow>()
    : isSuper(actor.role)
      ? await c.env.DB.prepare(
          `SELECT a.id,a.user_id,a.main_company_slug,a.device_label,a.user_agent,a.ip_address,a.requested_at,a.expires_at,
                  u.full_name,u.username,u.role AS target_role,s.role_override AS target_role_override
             FROM auth_login_approvals a
             JOIN auth_users u ON u.id=a.user_id
             LEFT JOIN auth_user_security s ON s.user_id=u.id
            WHERE a.status='PENDING' AND a.consumed_at IS NULL AND a.expires_at>?
            ORDER BY a.requested_at ASC`,
        ).bind(timestamp).all<AnyRow>()
      : { results: [] };

  for (const row of managerRows.results || []) {
    const settings = await companyApprovalSettings(c, text(row.main_company_slug));
    if (!canApproveTarget(actor, row, settings)) continue;
    items.push({
      kind: "MANAGER_APPROVAL",
      id: row.id,
      title: "KY ERP · Firma Giriş Onayı",
      body: isSuper(actor.role)
        ? `${text(row.full_name || row.username)} · ${text(row.main_company_slug)} · ${friendlyDeviceLabel(row.device_label, row.user_agent)}`
        : `${text(row.full_name || row.username)} · ${friendlyDeviceLabel(row.device_label, row.user_agent)}`,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
      mainCompanySlug: row.main_company_slug,
    });
  }

  return items;
}

export async function invalidatePhoneLoginChallenges(c: any, userId: string) {
  const rows = (await storeList(c, PHONE_SCOPE))
    .filter((row: AnyRow) => text(row.userId) === text(userId) && !text(row.consumedAt) && ["PENDING", "APPROVED"].includes(upper(row.status)));
  for (const row of rows) {
    const expected = upper(row.status);
    await atomicPhoneUpdate(c, row, expected, { status: "DENIED", decidedAt: nowIso(), consumedAt: nowIso() });
  }
}

export function registerAuthPushRoutes(app: any) {
  app.get("/api/auth/push/config", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon onayı ayarları için oturum gereklidir."), 401);

    const pair = await ensureVapidKeyPair(c);
    const devices = (await storeList(c, DEVICE_SCOPE))
      .filter((row: AnyRow) => text(row.userId) === text(current.id))
      .sort((a: AnyRow, b: AnyRow) => String(b.lastSeenAt || b.updatedAt || "").localeCompare(String(a.lastSeenAt || a.updatedAt || "")));

    return c.json({
      ok: true,
      data: {
        supported: true,
        applicationServerKey: pair.publicKey,
        storage: "json_store",
        devices: devices.map((row: AnyRow) => ({
          id: row.id,
          deviceLabel: text(row.deviceLabel),
          selfLoginEnabled: row.selfLoginEnabled !== false,
          managerApprovalEnabled: row.managerApprovalEnabled !== false,
          isActive: row.isActive !== false,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastSeenAt: row.lastSeenAt || null,
          lastPushAt: row.lastPushAt || null,
          lastError: text(row.lastError),
        })),
      },
    });
  });

  app.post("/api/auth/push/devices/register", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon onayı kaydı için oturum gereklidir."), 401);

    const body = await bodyOf(c);
    const password = String(body.password || "");
    const user = await userRow(c, current.id);
    if (!user || !Boolean(user.is_active) || !password || !(await compare(password, text(user.password_hash)))) {
      return c.json(jsonError("STEP_UP_FAILED", "Bu cihazı güvenilir telefon onayı cihazı yapmak için mevcut şifrenizi doğrulayın."), 401);
    }

    const subscription = body.subscription && typeof body.subscription === "object" ? body.subscription : {};
    const endpoint = text(subscription.endpoint);
    if (!/^https:\/\//i.test(endpoint)) return c.json(jsonError("PUSH_SUBSCRIPTION_INVALID", "Tarayıcı bildirim aboneliği geçersiz."), 400);

    const allDevices = await storeList(c, DEVICE_SCOPE);
    const existing = allDevices.find((row: AnyRow) => text(row.pushEndpoint) === endpoint) || null;
    if (existing && text(existing.userId) !== text(current.id)) {
      return c.json(jsonError("PUSH_ENDPOINT_ALREADY_BOUND", "Bu bildirim aboneliği başka bir KY ERP hesabına bağlı."), 409);
    }

    const deviceId = text(existing?.id) || crypto.randomUUID();
    const deviceToken = randomToken(36);
    const companySlug = text(current.mainCompanySlug || user.main_company_slug || "mecit-hakan");
    const label = text(body.deviceLabel || current.session?.device_label || userAgent(c)).slice(0, 180);
    const saved = await saveDevice(c, {
      ...(existing || {}),
      id: deviceId,
      userId: current.id,
      mainCompanySlug: companySlug,
      pushEndpoint: endpoint,
      deviceTokenHash: await sha256(deviceToken),
      deviceLabel: label,
      userAgent: userAgent(c),
      selfLoginEnabled: body.selfLoginEnabled !== false,
      managerApprovalEnabled: body.managerApprovalEnabled !== false,
      isActive: true,
      createdAt: existing?.createdAt || nowIso(),
      lastSeenAt: nowIso(),
      lastError: "",
    });

    await audit(c, "PUSH_DEVICE_REGISTERED", current.id, current.id, companySlug, { deviceId, deviceLabel: label });
    return c.json({
      ok: true,
      data: {
        deviceId: saved.id,
        deviceToken,
        deviceLabel: label,
        selfLoginEnabled: saved.selfLoginEnabled,
        managerApprovalEnabled: saved.managerApprovalEnabled,
        note: "Cihaz anahtarı yalnız bu kayıt cevabında verilir ve sunucuda hash olarak saklanır.",
      },
    });
  });

  app.delete("/api/auth/push/devices/:id", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gereklidir."), 401);
    const device = await storeGet(c, DEVICE_SCOPE, c.req.param("id"));
    if (!device || text(device.userId) !== text(current.id)) return c.json(jsonError("PUSH_DEVICE_NOT_FOUND", "Telefon onayı cihazı bulunamadı."), 404);
    await saveDevice(c, { ...device, isActive: false });
    await audit(c, "PUSH_DEVICE_DISABLED", current.id, current.id, text(device.mainCompanySlug), { deviceId: device.id });
    return c.json({ ok: true });
  });

  app.get("/api/admin/security/company-approval-settings/:slug", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || (!isSuper(current.role) && !isCompanyAdmin(current.role))) {
      return c.json(jsonError("FORBIDDEN", "Firma giriş onayı ayarları için yönetici yetkisi gereklidir."), 403);
    }
    const slug = text(c.req.param("slug"));
    if (!isSuper(current.role) && slug !== text(current.mainCompanySlug)) return c.json(jsonError("FORBIDDEN", "Başka firmanın giriş onayı ayarını görüntüleyemezsiniz."), 403);
    return c.json({ ok: true, data: await companyApprovalSettings(c, slug) });
  });

  app.patch("/api/admin/security/company-approval-settings/:slug", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return c.json(jsonError("OWNER_ONLY", "Süper Yönetici bildirim tercihini yalnız Süper Yönetici değiştirebilir."), current ? 403 : 401);
    const slug = text(c.req.param("slug"));
    const body = await bodyOf(c);
    const previous = await companyApprovalSettings(c, slug);
    const saved = await storePut(c, COMPANY_SETTING_SCOPE, slug, slug, {
      ...previous,
      mainCompanySlug: slug,
      notifyCompanyOwner: body.notifyCompanyOwner === undefined ? previous.notifyCompanyOwner : Boolean(body.notifyCompanyOwner),
      notifyApplicationOwner: body.notifyApplicationOwner === undefined ? previous.notifyApplicationOwner : Boolean(body.notifyApplicationOwner),
      updatedBy: current.id,
      createdAt: previous.createdAt || nowIso(),
    });
    await audit(c, "COMPANY_LOGIN_APPROVAL_SETTINGS_UPDATED", current.id, "", slug, {
      notifyCompanyOwner: saved.notifyCompanyOwner,
      notifyApplicationOwner: saved.notifyApplicationOwner,
    });
    return c.json({ ok: true, data: saved });
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
      const row = await storeGet(c, PHONE_SCOPE, id);
      if (!row || text(row.userId) !== actor.userId || upper(row.status) !== "PENDING" || text(row.consumedAt) || Date.parse(text(row.expiresAt)) <= Date.now()) {
        return c.json(jsonError("PHONE_APPROVAL_NOT_FOUND", "Giriş onayı bulunamadı veya süresi doldu."), 404);
      }
      const status = decision === "APPROVE" ? "APPROVED" : "DENIED";
      const update = await atomicPhoneUpdate(c, row, "PENDING", {
        status,
        decidedAt: nowIso(),
        decidedByDeviceId: actor.device.id,
        ...(status === "DENIED" ? { consumedAt: nowIso() } : {}),
      });
      const finalStatus = upper(update.row?.status || status);
      await audit(c, decision === "APPROVE" ? "PHONE_LOGIN_APPROVED" : "PHONE_LOGIN_DENIED", actor.userId, actor.userId, actor.companySlug, { challengeId: id, deviceId: actor.device.id, applied: update.changed });
      return c.json({ ok: true, data: { kind, id, status: finalStatus, applied: update.changed } });
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
      const result = await c.env.DB.prepare(
        "UPDATE auth_login_approvals SET status=?,decided_at=?,decided_by=? WHERE id=? AND status='PENDING'",
      ).bind(status, nowIso(), actor.userId, id).run();
      const applied = Number(result?.meta?.changes || 0) > 0;
      const current = applied ? { status } : await c.env.DB.prepare("SELECT status FROM auth_login_approvals WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
      const finalStatus = upper(current?.status || status);
      await audit(c, decision === "APPROVE" ? "LOGIN_APPROVED_PUSH" : "LOGIN_DENIED_PUSH", actor.userId, text(approval.user_id), text(approval.main_company_slug), { approvalId: id, deviceId: actor.device.id, applied });
      return c.json({ ok: true, data: { kind, id, status: finalStatus, applied } });
    }

    return c.json(jsonError("PUSH_KIND_INVALID", "Telefon onayı türü geçersiz."), 400);
  });
}
