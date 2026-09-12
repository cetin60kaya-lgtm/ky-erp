// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const PLATFORM_SLUG = "__platform__";
const DEVICE_SCOPE = "system_sentinel_device";
const EVENT_SCOPE = "system_sentinel_event";
const GRANT_SCOPE_PREFIX = "system_sentinel_grant:";
const COMMAND_SCOPE_PREFIX = "system_sentinel_command:";
const ONLINE_WINDOW_MS = 150_000;
const COMMAND_TTL_SECONDS = 10 * 60;

const ACCESS_ACTIONS = [
  "VIEW_STATUS",
  "REMOTE_VIEW",
  "REMOTE_CONTROL",
  "WAKE",
  "LOCK",
  "RESTART",
  "SHUTDOWN",
  "SERVICE_RESTART",
  "COLLECT_LOGS",
] as const;

const AGENT_COMMANDS = new Set([
  "PING",
  "WAKE",
  "LOCK",
  "RESTART",
  "SHUTDOWN",
  "SERVICE_RESTART",
  "COLLECT_LOGS",
]);

const CRITICAL_ACTIONS = new Set(["RESTART", "SHUTDOWN"]);

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

function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}

function jsonError(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function bodyOf(c: any) {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function parseJson(value: unknown, fallback: AnyRow = {}) {
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function uniq(values: unknown[]) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))];
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
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function sanitizeMac(value: unknown) {
  const raw = upper(value).replace(/[^0-9A-F]/g, "");
  if (!/^[0-9A-F]{12}$/.test(raw)) return "";
  return raw.match(/.{2}/g)?.join(":") || "";
}

function safeHttpsUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeActions(values: unknown) {
  const rows = Array.isArray(values) ? values : [];
  const allowed = new Set(ACCESS_ACTIONS);
  return uniq(rows.map(upper)).filter((item) => allowed.has(item as any));
}

function normalizeCapabilities(values: unknown) {
  const rows = Array.isArray(values) ? values : [];
  return uniq(rows.map(upper)).filter((item) => /^[A-Z0-9_]{2,40}$/.test(item));
}

function normalizeAllowedServices(values: unknown) {
  const rows = Array.isArray(values) ? values : [];
  return uniq(rows).filter((item) => /^[A-Za-z0-9_.-]{1,80}$/.test(item)).slice(0, 30);
}

async function putStore(c: any, id: string, scope: string, fileName: string, data: AnyRow) {
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       scope=excluded.scope,
       main_company_slug=excluded.main_company_slug,
       file_name=excluded.file_name,
       data=excluded.data,
       updated_at=excluded.updated_at`,
  ).bind(id, scope, PLATFORM_SLUG, fileName, JSON.stringify(data), timestamp, timestamp).run();
}

async function storeRowById(c: any, id: string) {
  return c.env.DB.prepare(
    `SELECT id,scope,file_name,data,created_at,updated_at
       FROM json_store
      WHERE id=? AND main_company_slug=? LIMIT 1`,
  ).bind(id, PLATFORM_SLUG).first<AnyRow>();
}

async function storeRowsByScope(c: any, scope: string, limit = 200) {
  const result = await c.env.DB.prepare(
    `SELECT id,scope,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND main_company_slug=?
      ORDER BY updated_at DESC LIMIT ?`,
  ).bind(scope, PLATFORM_SLUG, Math.max(1, Math.min(500, Number(limit) || 200))).all<AnyRow>();
  return result.results || [];
}

async function grantRowsForUser(c: any, userId: string) {
  return storeRowsByScope(c, `${GRANT_SCOPE_PREFIX}${userId}`, 100);
}

function grantActive(grant: AnyRow) {
  if (!grant || grant.revokedAt) return false;
  if (grant.usedAt && upper(grant.mode) === "ONE_TIME") return false;
  if (grant.expiresAt && Date.parse(text(grant.expiresAt)) <= Date.now()) return false;
  return true;
}

async function accessFor(c: any, current: AnyRow) {
  if (isOwner(current?.role)) {
    return {
      hasAccess: true,
      owner: true,
      canManage: true,
      actions: [...ACCESS_ACTIONS],
      deviceIds: ["*"],
      grants: [],
    };
  }

  const rows = await grantRowsForUser(c, text(current?.id));
  const grants = rows.map((row: AnyRow) => ({ ...parseJson(row.data), id: text(parseJson(row.data).id || row.file_name) })).filter(grantActive);
  const actions = uniq(grants.flatMap((grant: AnyRow) => normalizeActions(grant.actions)));
  const deviceIds = uniq(grants.flatMap((grant: AnyRow) => Array.isArray(grant.deviceIds) ? grant.deviceIds : []));
  return {
    hasAccess: grants.length > 0,
    owner: false,
    canManage: false,
    actions,
    deviceIds,
    grants,
  };
}

function devicePermitted(access: AnyRow, deviceId: string) {
  return Boolean(access.owner || access.deviceIds?.includes("*") || access.deviceIds?.includes(deviceId));
}

function grantForAction(access: AnyRow, deviceId: string, action: string) {
  if (access.owner) return { owner: true };
  return access.grants?.find((grant: AnyRow) => {
    if (!grantActive(grant)) return false;
    const deviceIds = Array.isArray(grant.deviceIds) ? grant.deviceIds.map(text) : [];
    const actions = normalizeActions(grant.actions);
    return (deviceIds.includes("*") || deviceIds.includes(deviceId)) && actions.includes(action);
  }) || null;
}

async function currentAuthenticated(c: any) {
  return getAuthenticatedUser(c);
}

async function ownerOnly(c: any) {
  const current = await currentAuthenticated(c);
  if (!current || !isOwner(current.role)) return null;
  return current;
}

async function deviceById(c: any, deviceId: string) {
  const row = await storeRowById(c, `sentinel-device:${deviceId}`);
  if (!row) return null;
  return { ...parseJson(row.data), id: deviceId, createdAt: row.created_at, updatedAt: row.updated_at };
}

function publicDevice(device: AnyRow) {
  if (!device) return null;
  const { agentTokenHash, ...safe } = device;
  const lastSeenMs = Date.parse(text(safe.lastSeenAt));
  return {
    ...safe,
    online: Boolean(safe.active !== false && Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= ONLINE_WINDOW_MS),
  };
}

async function allDevices(c: any) {
  const rows = await storeRowsByScope(c, DEVICE_SCOPE, 300);
  return rows.map((row: AnyRow) => {
    const parsed = parseJson(row.data);
    return publicDevice({ ...parsed, id: text(parsed.id || row.file_name), createdAt: row.created_at, updatedAt: row.updated_at });
  }).filter(Boolean);
}

async function event(c: any, actorId: string, action: string, detail: AnyRow = {}, deviceId = "") {
  const id = crypto.randomUUID();
  const data = {
    id,
    actorUserId: actorId || null,
    action,
    deviceId: deviceId || null,
    detail,
    createdAt: nowIso(),
  };
  await putStore(c, `sentinel-event:${id}`, EVENT_SCOPE, id, data);
  return data;
}

async function consumeOneTimeGrant(c: any, grant: AnyRow | null) {
  if (!grant || grant.owner || upper(grant.mode) !== "ONE_TIME" || grant.usedAt) return;
  const row = await storeRowById(c, `sentinel-grant:${text(grant.id)}`);
  if (!row) return;
  const data = { ...parseJson(row.data), usedAt: nowIso() };
  await putStore(c, row.id, row.scope, row.file_name, data);
}

async function queueCommand(c: any, targetDeviceId: string, action: string, payload: AnyRow, actorUserId: string, requestedDeviceId = targetDeviceId) {
  const id = crypto.randomUUID();
  const command = {
    id,
    targetDeviceId,
    requestedDeviceId,
    action,
    payload,
    status: "PENDING",
    actorUserId,
    createdAt: nowIso(),
    expiresAt: addSeconds(COMMAND_TTL_SECONDS),
  };
  await putStore(c, `sentinel-command:${id}`, `${COMMAND_SCOPE_PREFIX}${targetDeviceId}`, id, command);
  await event(c, actorUserId, "COMMAND_QUEUED", { commandId: id, action, targetDeviceId, requestedDeviceId }, requestedDeviceId);
  return command;
}

async function authenticateAgent(c: any) {
  const agentId = text(c.req.header("X-KYERP-Agent-Id"));
  const token = text(c.req.header("X-KYERP-Agent-Token"));
  if (!agentId || !token) return null;
  const device = await deviceById(c, agentId);
  if (!device || device.active === false || !text(device.agentTokenHash)) return null;
  const incoming = await sha256(token);
  if (!safeEqual(incoming, text(device.agentTokenHash))) return null;
  return device;
}

function deviceRecommendations(devices: AnyRow[]) {
  const rows: AnyRow[] = [];
  for (const device of devices) {
    if (device.active !== false && !device.online) {
      rows.push({ severity: "warning", code: "DEVICE_OFFLINE", deviceId: device.id, message: `${device.name || device.id} çevrimdışı.` });
    }
    const diskFree = Number(device.metrics?.diskFreePercent);
    if (Number.isFinite(diskFree) && diskFree < 15) {
      rows.push({ severity: diskFree < 8 ? "critical" : "warning", code: "DISK_LOW", deviceId: device.id, message: `${device.name || device.id} disk boş alanı %${Math.round(diskFree)}.` });
    }
  }
  const bridges = devices.filter((device) => device.online && device.capabilities?.includes("WAKE_BRIDGE"));
  const wakeTargets = devices.filter((device) => text(device.macAddress));
  if (wakeTargets.length && !bridges.length) {
    rows.push({ severity: "warning", code: "NO_WAKE_BRIDGE", message: "Wake-on-LAN için çevrimiçi LAN Bridge bulunmuyor." });
  }
  return rows.slice(0, 30);
}

function actionPermission(action: string) {
  const normalized = upper(action);
  if (normalized === "PING") return "VIEW_STATUS";
  return ACCESS_ACTIONS.includes(normalized as any) ? normalized : "";
}

export function registerSystemSentinelRoutes(app: any) {
  app.get("/api/system-sentinel/access", async (c: any) => {
    const current = await currentAuthenticated(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    const access = await accessFor(c, current);
    return c.json({ ok: true, data: access });
  });

  app.get("/api/system-sentinel/overview", async (c: any) => {
    const current = await currentAuthenticated(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    const access = await accessFor(c, current);
    if (!access.hasAccess) return c.json(jsonError("SENTINEL_FORBIDDEN", "Sistem Merkezi erişim yetkiniz bulunmuyor."), 403);
    const devices = (await allDevices(c)).filter((device: AnyRow) => devicePermitted(access, text(device.id)));
    const events = (await storeRowsByScope(c, EVENT_SCOPE, 80))
      .map((row: AnyRow) => parseJson(row.data))
      .filter((item: AnyRow) => !item.deviceId || devicePermitted(access, text(item.deviceId)))
      .slice(0, 40);
    return c.json({
      ok: true,
      data: {
        access,
        devices,
        events,
        recommendations: deviceRecommendations(devices),
        summary: {
          total: devices.length,
          online: devices.filter((item: AnyRow) => item.online).length,
          offline: devices.filter((item: AnyRow) => !item.online).length,
          wakeBridges: devices.filter((item: AnyRow) => item.online && item.capabilities?.includes("WAKE_BRIDGE")).length,
        },
      },
    });
  });

  app.post("/api/system-sentinel/devices", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Cihaz kaydı yalnız Süper Yönetici tarafından yapılabilir."), 403);
    const body = await bodyOf(c);
    const name = text(body.name);
    if (!name) return c.json(jsonError("DEVICE_NAME_REQUIRED", "Cihaz adı zorunludur."), 400);
    const id = text(body.id) || `dev_${crypto.randomUUID()}`;
    if (!/^[A-Za-z0-9_.:-]{6,100}$/.test(id)) return c.json(jsonError("DEVICE_ID_INVALID", "Cihaz kimliği geçersiz."), 400);
    if (await deviceById(c, id)) return c.json(jsonError("DEVICE_EXISTS", "Bu cihaz kimliği zaten kayıtlı."), 409);
    const agentToken = randomToken(36);
    const device = {
      id,
      name: name.slice(0, 120),
      kind: upper(body.kind || "WINDOWS_PC"),
      siteKey: text(body.siteKey || "MAIN").slice(0, 80),
      active: true,
      macAddress: sanitizeMac(body.macAddress),
      bridgeDeviceId: text(body.bridgeDeviceId),
      capabilities: normalizeCapabilities(body.capabilities),
      allowedServices: normalizeAllowedServices(body.allowedServices),
      remoteAccess: {
        adapter: upper(body.remoteAccess?.adapter || "NONE"),
        launchUrl: safeHttpsUrl(body.remoteAccess?.launchUrl),
        fallbackAdapter: upper(body.remoteAccess?.fallbackAdapter || "ANYDESK"),
      },
      notes: text(body.notes).slice(0, 500),
      agentTokenHash: await sha256(agentToken),
      enrolledAt: nowIso(),
      lastSeenAt: null,
      status: "ENROLLED",
      metrics: {},
    };
    await putStore(c, `sentinel-device:${id}`, DEVICE_SCOPE, id, device);
    await event(c, text(current.id), "DEVICE_ENROLLED", { name: device.name, kind: device.kind, siteKey: device.siteKey }, id);
    return c.json({ ok: true, data: { device: publicDevice(device), enrollment: { agentId: id, agentToken } } }, 201);
  });

  app.patch("/api/system-sentinel/devices/:id", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Cihaz ayarı yalnız Süper Yönetici tarafından değiştirilebilir."), 403);
    const id = text(c.req.param("id"));
    const existing = await deviceById(c, id);
    if (!existing) return c.json(jsonError("DEVICE_NOT_FOUND", "Cihaz bulunamadı."), 404);
    const body = await bodyOf(c);
    const next = {
      ...existing,
      name: body.name === undefined ? existing.name : text(body.name).slice(0, 120),
      kind: body.kind === undefined ? existing.kind : upper(body.kind),
      siteKey: body.siteKey === undefined ? existing.siteKey : text(body.siteKey).slice(0, 80),
      active: body.active === undefined ? existing.active !== false : Boolean(body.active),
      macAddress: body.macAddress === undefined ? existing.macAddress : sanitizeMac(body.macAddress),
      bridgeDeviceId: body.bridgeDeviceId === undefined ? existing.bridgeDeviceId : text(body.bridgeDeviceId),
      capabilities: body.capabilities === undefined ? existing.capabilities : normalizeCapabilities(body.capabilities),
      allowedServices: body.allowedServices === undefined ? existing.allowedServices : normalizeAllowedServices(body.allowedServices),
      remoteAccess: body.remoteAccess === undefined ? existing.remoteAccess : {
        adapter: upper(body.remoteAccess?.adapter || "NONE"),
        launchUrl: safeHttpsUrl(body.remoteAccess?.launchUrl),
        fallbackAdapter: upper(body.remoteAccess?.fallbackAdapter || "ANYDESK"),
      },
      notes: body.notes === undefined ? existing.notes : text(body.notes).slice(0, 500),
    };
    await putStore(c, `sentinel-device:${id}`, DEVICE_SCOPE, id, next);
    await event(c, text(current.id), "DEVICE_UPDATED", { name: next.name }, id);
    return c.json({ ok: true, data: publicDevice(next) });
  });

  app.post("/api/system-sentinel/devices/:id/rotate-token", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Agent anahtarı yalnız Süper Yönetici tarafından yenilenebilir."), 403);
    const id = text(c.req.param("id"));
    const existing = await deviceById(c, id);
    if (!existing) return c.json(jsonError("DEVICE_NOT_FOUND", "Cihaz bulunamadı."), 404);
    const agentToken = randomToken(36);
    const next = { ...existing, agentTokenHash: await sha256(agentToken), tokenRotatedAt: nowIso() };
    await putStore(c, `sentinel-device:${id}`, DEVICE_SCOPE, id, next);
    await event(c, text(current.id), "DEVICE_TOKEN_ROTATED", {}, id);
    return c.json({ ok: true, data: { agentId: id, agentToken } });
  });

  app.get("/api/system-sentinel/grants", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Yetki listesi yalnız Süper Yöneticiye açıktır."), 403);
    const result = await c.env.DB.prepare(
      `SELECT id,scope,file_name,data,created_at,updated_at
         FROM json_store
        WHERE scope LIKE ? AND main_company_slug=?
        ORDER BY updated_at DESC LIMIT 300`,
    ).bind(`${GRANT_SCOPE_PREFIX}%`, PLATFORM_SLUG).all<AnyRow>();
    const data = (result.results || []).map((row: AnyRow) => parseJson(row.data));
    return c.json({ ok: true, data });
  });

  app.post("/api/system-sentinel/grants", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Uzak erişim yetkisini yalnız Süper Yönetici verebilir."), 403);
    const body = await bodyOf(c);
    const userId = text(body.userId);
    if (!userId || userId === text(current.id)) return c.json(jsonError("GRANTEE_INVALID", "Yetki verilecek farklı bir kullanıcı seçilmelidir."), 400);
    const user = await c.env.DB.prepare("SELECT id,username,full_name,is_active FROM auth_users WHERE id=? LIMIT 1").bind(userId).first<AnyRow>();
    if (!user || !user.is_active) return c.json(jsonError("USER_NOT_FOUND", "Aktif kullanıcı bulunamadı."), 404);
    const deviceIds = uniq(Array.isArray(body.deviceIds) ? body.deviceIds : []).slice(0, 100);
    const actions = normalizeActions(body.actions);
    if (!deviceIds.length || !actions.length) return c.json(jsonError("GRANT_SCOPE_REQUIRED", "En az bir cihaz ve işlem yetkisi seçilmelidir."), 400);
    const mode = ["PERMANENT", "TEMPORARY", "ONE_TIME"].includes(upper(body.mode)) ? upper(body.mode) : "TEMPORARY";
    let expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
    if (mode === "TEMPORARY" && !expiresAt) expiresAt = addSeconds(8 * 3600);
    if (mode === "PERMANENT") expiresAt = null;
    const id = crypto.randomUUID();
    const grant = {
      id,
      userId,
      userLabel: text(user.full_name || user.username),
      deviceIds,
      actions,
      mode,
      expiresAt,
      note: text(body.note).slice(0, 300),
      grantedBy: text(current.id),
      createdAt: nowIso(),
      revokedAt: null,
      usedAt: null,
    };
    await putStore(c, `sentinel-grant:${id}`, `${GRANT_SCOPE_PREFIX}${userId}`, id, grant);
    await event(c, text(current.id), "ACCESS_GRANTED", { grantId: id, userId, deviceIds, actions, mode, expiresAt });
    return c.json({ ok: true, data: grant }, 201);
  });

  app.delete("/api/system-sentinel/grants/:id", async (c: any) => {
    const current = await ownerOnly(c);
    if (!current) return c.json(jsonError("OWNER_ONLY", "Uzak erişim yetkisini yalnız Süper Yönetici kaldırabilir."), 403);
    const grantId = text(c.req.param("id"));
    const row = await storeRowById(c, `sentinel-grant:${grantId}`);
    if (!row) return c.json(jsonError("GRANT_NOT_FOUND", "Yetki kaydı bulunamadı."), 404);
    const grant = parseJson(row.data);
    const next = { ...grant, revokedAt: nowIso(), revokedBy: text(current.id) };
    await putStore(c, row.id, row.scope, row.file_name, next);
    await event(c, text(current.id), "ACCESS_REVOKED", { grantId, userId: grant.userId });
    return c.json({ ok: true, data: next });
  });

  app.post("/api/system-sentinel/devices/:id/actions", async (c: any) => {
    const current = await currentAuthenticated(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    const deviceId = text(c.req.param("id"));
    const device = await deviceById(c, deviceId);
    if (!device || device.active === false) return c.json(jsonError("DEVICE_NOT_FOUND", "Aktif cihaz bulunamadı."), 404);
    const body = await bodyOf(c);
    const action = upper(body.action);
    const required = actionPermission(action);
    if (!required) return c.json(jsonError("ACTION_INVALID", "Desteklenmeyen cihaz işlemi."), 400);
    const access = await accessFor(c, current);
    const matchingGrant = grantForAction(access, deviceId, required);
    if (!matchingGrant) return c.json(jsonError("ACTION_FORBIDDEN", "Bu cihaz işlemi için yetkiniz bulunmuyor."), 403);
    if (CRITICAL_ACTIONS.has(action) && text(body.confirmation) !== `${action}:${deviceId}`) {
      return c.json(jsonError("CONFIRMATION_REQUIRED", "Kritik işlem için cihaz onayı gereklidir.", { confirmation: `${action}:${deviceId}` }), 409);
    }

    if (["REMOTE_VIEW", "REMOTE_CONTROL"].includes(action)) {
      const launchUrl = safeHttpsUrl(device.remoteAccess?.launchUrl);
      if (!launchUrl) return c.json(jsonError("REMOTE_ADAPTER_NOT_READY", "Bu cihaz için güvenli uzak masaüstü adapteri henüz yapılandırılmamış."), 409);
      const sessionId = crypto.randomUUID();
      await event(c, text(current.id), "REMOTE_SESSION_STARTED", { sessionId, mode: action, adapter: upper(device.remoteAccess?.adapter || "WEB") }, deviceId);
      await consumeOneTimeGrant(c, matchingGrant);
      return c.json({ ok: true, data: { kind: "REMOTE_SESSION", sessionId, deviceId, mode: action, adapter: upper(device.remoteAccess?.adapter || "WEB"), launchUrl } });
    }

    if (action === "WAKE") {
      const targetMac = sanitizeMac(device.macAddress);
      if (!targetMac) return c.json(jsonError("WAKE_MAC_REQUIRED", "Wake-on-LAN için cihaz MAC adresi tanımlanmalıdır."), 409);
      const devices = await allDevices(c);
      const explicitBridge = text(body.bridgeDeviceId || device.bridgeDeviceId);
      const bridge = devices.find((item: AnyRow) => item.id === explicitBridge && item.online && item.capabilities?.includes("WAKE_BRIDGE"))
        || devices.find((item: AnyRow) => item.online && item.siteKey === device.siteKey && item.capabilities?.includes("WAKE_BRIDGE"));
      if (!bridge) return c.json(jsonError("WAKE_BRIDGE_OFFLINE", "Bu ağ için çevrimiçi Wake Bridge bulunamadı."), 409);
      const command = await queueCommand(c, text(bridge.id), "WAKE", { targetDeviceId: deviceId, macAddress: targetMac, broadcastAddress: text(body.broadcastAddress || "255.255.255.255") }, text(current.id), deviceId);
      await consumeOneTimeGrant(c, matchingGrant);
      return c.json({ ok: true, data: { kind: "QUEUED", command, bridgeDeviceId: bridge.id } }, 202);
    }

    if (!AGENT_COMMANDS.has(action)) return c.json(jsonError("ACTION_INVALID", "Bu işlem agent komut listesinde bulunmuyor."), 400);
    const payload: AnyRow = {};
    if (action === "SERVICE_RESTART") {
      const serviceName = text(body.serviceName);
      if (!device.allowedServices?.includes(serviceName)) return c.json(jsonError("SERVICE_NOT_ALLOWED", "Bu servis cihazın izinli servis listesinde değil."), 403);
      payload.serviceName = serviceName;
    }
    const command = await queueCommand(c, deviceId, action, payload, text(current.id));
    await consumeOneTimeGrant(c, matchingGrant);
    return c.json({ ok: true, data: { kind: "QUEUED", command } }, 202);
  });

  app.post("/api/system-sentinel/sessions/:id/close", async (c: any) => {
    const current = await currentAuthenticated(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401);
    const body = await bodyOf(c);
    const deviceId = text(body.deviceId);
    const access = await accessFor(c, current);
    if (!deviceId || !devicePermitted(access, deviceId)) return c.json(jsonError("SESSION_FORBIDDEN", "Uzak oturum kapsamı geçersiz."), 403);
    await event(c, text(current.id), "REMOTE_SESSION_CLOSED", { sessionId: text(c.req.param("id")) }, deviceId);
    return c.json({ ok: true });
  });

  app.post("/api/system-agent/heartbeat", async (c: any) => {
    const device = await authenticateAgent(c);
    if (!device) return c.json(jsonError("AGENT_UNAUTHORIZED", "Agent kimliği doğrulanamadı."), 401);
    const body = await bodyOf(c);
    const next = {
      ...device,
      lastSeenAt: nowIso(),
      status: upper(body.status || "ONLINE"),
      agentVersion: text(body.agentVersion || device.agentVersion),
      host: {
        ...(device.host || {}),
        hostname: text(body.hostname || device.host?.hostname),
        os: text(body.os || device.host?.os),
        osVersion: text(body.osVersion || device.host?.osVersion),
        ipAddresses: uniq(Array.isArray(body.ipAddresses) ? body.ipAddresses : device.host?.ipAddresses || []).slice(0, 20),
      },
      metrics: {
        ...(device.metrics || {}),
        ...(body.metrics && typeof body.metrics === "object" ? body.metrics : {}),
      },
      runtimeCapabilities: normalizeCapabilities(body.capabilities || device.runtimeCapabilities || []),
    };
    await putStore(c, `sentinel-device:${device.id}`, DEVICE_SCOPE, device.id, next);
    return c.json({ ok: true, data: { deviceId: device.id, serverTime: nowIso(), pollAfterSeconds: 30 } });
  });

  app.get("/api/system-agent/commands", async (c: any) => {
    const device = await authenticateAgent(c);
    if (!device) return c.json(jsonError("AGENT_UNAUTHORIZED", "Agent kimliği doğrulanamadı."), 401);
    const rows = await storeRowsByScope(c, `${COMMAND_SCOPE_PREFIX}${device.id}`, 20);
    const pending = rows
      .map((row: AnyRow) => ({ row, data: parseJson(row.data) }))
      .filter(({ data }: AnyRow) => data.status === "PENDING" && (!data.expiresAt || Date.parse(data.expiresAt) > Date.now()))
      .sort((a: AnyRow, b: AnyRow) => Date.parse(a.data.createdAt) - Date.parse(b.data.createdAt))
      .slice(0, 5);
    for (const item of pending) {
      const next = { ...item.data, status: "DELIVERED", deliveredAt: nowIso() };
      await putStore(c, item.row.id, item.row.scope, item.row.file_name, next);
      item.data = next;
    }
    return c.json({ ok: true, data: pending.map((item: AnyRow) => item.data) });
  });

  app.post("/api/system-agent/commands/:id/result", async (c: any) => {
    const device = await authenticateAgent(c);
    if (!device) return c.json(jsonError("AGENT_UNAUTHORIZED", "Agent kimliği doğrulanamadı."), 401);
    const commandId = text(c.req.param("id"));
    const row = await storeRowById(c, `sentinel-command:${commandId}`);
    if (!row || row.scope !== `${COMMAND_SCOPE_PREFIX}${device.id}`) return c.json(jsonError("COMMAND_NOT_FOUND", "Komut bulunamadı."), 404);
    const command = parseJson(row.data);
    const body = await bodyOf(c);
    const status = upper(body.status) === "COMPLETED" ? "COMPLETED" : "FAILED";
    const next = {
      ...command,
      status,
      completedAt: nowIso(),
      result: {
        message: text(body.message).slice(0, 1000),
        code: text(body.code).slice(0, 100),
      },
    };
    await putStore(c, row.id, row.scope, row.file_name, next);
    await event(c, "", status === "COMPLETED" ? "COMMAND_COMPLETED" : "COMMAND_FAILED", { commandId, action: command.action, result: next.result }, text(command.requestedDeviceId || device.id));
    return c.json({ ok: true });
  });
}
