// @ts-nocheck
// KY ERP canonical security infrastructure.
// Trusted device identity, mutable push transport and typed approval storage are
// deliberately separated at the service boundary even though production keeps
// using the existing json_store table for an additive/no-migration rollout.

type AnyRow = Record<string, any>;

export const AUTH_SECURITY_SCOPES = Object.freeze({
  DEVICE: "AUTH_PUSH_DEVICE",
  PHONE_LOGIN: "AUTH_PHONE_LOGIN",
  COMPANY_LOGIN: "AUTH_COMPANY_LOGIN_APPROVAL",
  SECURITY_ENROLLMENT: "AUTH_PUSH_SECURITY_ENROLLMENT",
  SECURITY_ACTION: "AUTH_SECURITY_ACTION",
  SECURITY_GRANT: "AUTH_SECURITY_CAPABILITY_GRANT",
  SECURITY_NOTIFICATION_PREF: "AUTH_SECURITY_NOTIFICATION_PREF",
  SESSION_TRUST: "AUTH_SESSION_TRUST",
  TRUSTED_LOGIN_DEVICE: "AUTH_TRUSTED_LOGIN_DEVICE",
});

export const SECURITY_APPROVAL_KINDS = Object.freeze({
  LOGIN_SELF: "SELF_LOGIN",
  LOGIN_MANAGER: "MANAGER_APPROVAL",
  SESSION: "SESSION_APPROVAL",
  DEVICE: "DEVICE_APPROVAL",
  CRITICAL_ACTION: "SECURITY_ACTION",
});

const VAPID_SECRET_KEY = "VAPID_P256_KEYPAIR_V1";
const VAPID_SUBJECT = "mailto:admin@kyerp.net";

export function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
export function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}
export function nowIso() {
  return new Date().toISOString();
}
export function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
export function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export function base64UrlToBytes(value: unknown) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}
export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}
export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function tableExists(c: any, tableName: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(tableName).first<AnyRow>();
  return Boolean(row?.name);
}

export async function securityStoreGet(c: any, scope: string, fileName: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(scope, fileName).first<AnyRow>();
  if (!row) return null;
  const data = objectOf(row.data);
  return {
    ...data,
    storeId: text(row.id),
    storeScope: text(row.scope),
    storeCompanySlug: text(row.main_company_slug),
    fileName: text(row.file_name),
    createdAt: text(data.createdAt || row.created_at),
    updatedAt: text(data.updatedAt || row.updated_at),
  };
}

export async function securityStoreList(c: any, scope: string, companySlug = "") {
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

  return (result.results || []).map((row: AnyRow) => {
    const data = objectOf(row.data);
    return {
      ...data,
      storeId: text(row.id),
      storeScope: text(row.scope),
      storeCompanySlug: text(row.main_company_slug),
      fileName: text(row.file_name),
      createdAt: text(data.createdAt || row.created_at),
      updatedAt: text(data.updatedAt || row.updated_at),
    };
  });
}

export async function securityStorePut(c: any, scope: string, fileName: string, companySlug: string, data: AnyRow) {
  if (!(await tableExists(c, "json_store"))) throw new Error("AUTH_SECURITY_STORAGE_UNAVAILABLE");
  const current = await securityStoreGet(c, scope, fileName);
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

export async function atomicSecurityStatusUpdate(c: any, scope: string, current: AnyRow, expectedStatus: string, patch: AnyRow) {
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
  ).bind(JSON.stringify(next), timestamp, current.storeId, scope, upper(expectedStatus)).run();
  const changed = Number(result?.meta?.changes || 0) > 0;
  return {
    changed,
    row: changed
      ? { ...next, storeId: current.storeId, fileName: text(current.id || current.fileName) }
      : await securityStoreGet(c, scope, text(current.id || current.fileName)),
  };
}

export function pushEndpointOf(device: AnyRow) {
  return text(device?.pushChannel?.endpoint || device?.pushEndpoint);
}

export function trustedDeviceIsRetired(device: AnyRow) {
  return device?.isActive === false && Boolean(text(device?.retiredAt) || text(device?.retiredReason));
}

export function normalizeSecurityDevice(device: AnyRow) {
  const endpoint = pushEndpointOf(device);
  const channel = objectOf(device?.pushChannel);
  return {
    ...device,
    pushEndpoint: endpoint,
    pushChannel: {
      type: "WEB_PUSH",
      ...channel,
      endpoint,
      reachable: channel.reachable ?? device?.pushReachable ?? null,
      lastPushAt: text(channel.lastPushAt || device?.lastPushAt),
      lastRefreshAt: text(channel.lastRefreshAt || device?.lastRefreshAt),
      invalidAt: text(channel.invalidAt || device?.pushInvalidAt),
      lastError: text(channel.lastError || device?.lastError),
    },
  };
}

export async function saveSecurityDevice(c: any, device: AnyRow) {
  const normalized = normalizeSecurityDevice(device);
  return securityStorePut(
    c,
    AUTH_SECURITY_SCOPES.DEVICE,
    text(normalized.id),
    text(normalized.mainCompanySlug),
    normalized,
  );
}

export async function securityDeviceById(c: any, deviceId: string) {
  const row = await securityStoreGet(c, AUTH_SECURITY_SCOPES.DEVICE, text(deviceId));
  return row ? normalizeSecurityDevice(row) : null;
}

export async function securityDevicesForUser(c: any, userId: string, purpose: "SELF" | "MANAGER" | "CRITICAL" | "CONTROL" = "CONTROL") {
  const rows = await securityStoreList(c, AUTH_SECURITY_SCOPES.DEVICE);
  return rows.map(normalizeSecurityDevice).filter((row: AnyRow) => {
    if (text(row.userId) !== text(userId) || row.securityApp !== true || trustedDeviceIsRetired(row)) return false;
    if (purpose === "MANAGER" && row.managerApprovalEnabled === false) return false;
    if (purpose === "SELF" && row.selfLoginEnabled === false) return false;
    return true;
  });
}

export async function verifySecurityDeviceAuth(c: any, device: AnyRow, maxAgeMs = 120_000) {
  if (device?.securityApp !== true) return false;
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const timestamp = text(c.req.header("X-KYERP-Security-Timestamp"));
  const signature = text(c.req.header("X-KYERP-Security-Signature"));
  const timestampMs = Number(timestamp);
  if (
    upper(jwk.kty) !== "EC" || upper(jwk.crv) !== "P-256" || !text(jwk.x) || !text(jwk.y) ||
    !timestamp || !signature || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxAgeMs
  ) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const method = upper(c.req.method || "GET");
    const pathname = new URL(c.req.url).pathname;
    const message = new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${text(device.id)}|${method}|${pathname}|${timestamp}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch {
    return false;
  }
}

export async function verifySecurityDeviceDecision(device: AnyRow, kindValue: unknown, idValue: unknown, decisionValue: unknown, signatureValue: unknown) {
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const kind = upper(kindValue);
  const id = text(idValue);
  const decision = upper(decisionValue);
  const signature = text(signatureValue);
  if (device?.securityApp !== true || upper(jwk.kty) !== "EC" || upper(jwk.crv) !== "P-256" || !text(jwk.x) || !text(jwk.y) || !kind || !id || !decision || !signature) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const message = new TextEncoder().encode(`KYERP-DECISION-V1|${text(device.id)}|${kind}|${id}|${decision}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch {
    return false;
  }
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
  if (!stored?.privateJwk || !stored?.publicKey) throw new Error("VAPID_KEYPAIR_UNAVAILABLE");
  return stored;
}

export async function securityPushPublicKey(c: any) {
  return text((await ensureVapidKeyPair(c)).publicKey);
}

export async function sendSecurityWake(c: any, deviceValue: AnyRow) {
  const device = normalizeSecurityDevice(deviceValue);
  const endpoint = pushEndpointOf(device);
  if (!endpoint) return false;
  try {
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
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        TTL: "60",
        Urgency: "high",
        Authorization: `vapid t=${input}.${base64Url(signature)}, k=${pair.publicKey}`,
      },
    });
    const timestamp = nowIso();
    if (!response.ok) {
      const gone = response.status === 404 || response.status === 410;
      await saveSecurityDevice(c, {
        ...device,
        // Transport can expire without revoking the trusted device identity.
        isActive: device.securityApp === true ? true : (gone ? false : device.isActive !== false),
        pushReachable: false,
        pushInvalidAt: gone ? timestamp : text(device.pushInvalidAt),
        lastError: `HTTP ${response.status}`,
        pushChannel: {
          ...device.pushChannel,
          endpoint,
          reachable: false,
          invalidAt: gone ? timestamp : text(device.pushChannel?.invalidAt),
          lastError: `HTTP ${response.status}`,
        },
      });
      return false;
    }
    await saveSecurityDevice(c, {
      ...device,
      pushReachable: true,
      pushInvalidAt: "",
      lastPushAt: timestamp,
      lastError: "",
      pushChannel: {
        ...device.pushChannel,
        endpoint,
        reachable: true,
        invalidAt: "",
        lastPushAt: timestamp,
        lastError: "",
      },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    await saveSecurityDevice(c, {
      ...device,
      lastError: message,
      pushChannel: { ...device.pushChannel, endpoint, reachable: false, lastError: message },
    });
    return false;
  }
}

export async function sendSecurityWakeMany(c: any, devices: AnyRow[]) {
  const unique = new Map<string, AnyRow>();
  for (const row of devices || []) {
    const endpoint = pushEndpointOf(row);
    if (endpoint && !unique.has(endpoint)) unique.set(endpoint, row);
  }
  let success = 0;
  for (const row of unique.values()) if (await sendSecurityWake(c, row)) success += 1;
  return success;
}
