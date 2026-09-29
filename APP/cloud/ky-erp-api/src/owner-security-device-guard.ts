// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const DEVICE_SCOPE = "AUTH_PUSH_DEVICE";

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function jsonError(code: string, message: string) { return { ok: false, error: { code, message } }; }
function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function base64UrlToBytes(value: unknown) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
async function tableExists(c: any, name: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first<AnyRow>();
  return Boolean(row?.name);
}
async function storeGet(c: any, scope: string, fileName: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id,main_company_slug,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(scope, fileName).first<AnyRow>();
  if (!row) return null;
  return { ...objectOf(row.data), storeId: text(row.id), fileName: text(row.file_name) };
}
async function canonicalOwner(c: any) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.platform_role,u.is_active,u.created_at,s.role_override,s.main_company_slug
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.is_active=1
        AND (UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,'')) IN ('SUPER_ADMIN','ADMIN'))
      ORDER BY u.created_at ASC,u.id ASC LIMIT 1`,
  ).first<AnyRow>();
}
async function verifyDeviceSignature(c: any, device: AnyRow) {
  if (device?.securityApp !== true) return false;
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const timestamp = text(c.req.header("X-KYERP-Security-Timestamp"));
  const signature = text(c.req.header("X-KYERP-Security-Signature"));
  const timestampMs = Number(timestamp);
  if (!jwk?.kty || !jwk?.crv || !jwk?.x || !jwk?.y || !timestamp || !signature || !Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > 120_000) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const method = upper(c.req.method || "GET");
    const pathname = new URL(c.req.url).pathname;
    const message = new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${text(device.id)}|${method}|${pathname}|${timestamp}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch { return false; }
}

export async function requireOwnerSecurityApp(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current) return { ok: false, response: c.json(jsonError("OWNER_APP_AUTH_REQUIRED", "Owner Security için aktif Süper Yönetici oturumu gereklidir."), 401) };

  const owner = await canonicalOwner(c);
  if (!owner || text(owner.id) !== text(current.id)) {
    return { ok: false, response: c.json(jsonError("CANONICAL_OWNER_ONLY", "KY Owner Security yalnız asıl Süper Yönetici hesabına açıktır."), 403) };
  }

  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const deviceToken = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !deviceToken) {
    return { ok: false, response: c.json(jsonError("OWNER_DEVICE_REQUIRED", "Kayıtlı KY Güvenlik cihazı gereklidir."), 401) };
  }

  const device = await storeGet(c, DEVICE_SCOPE, deviceId);
  if (!device || device.securityApp !== true || device.isActive === false || text(device.retiredAt) || text(device.retiredReason)) {
    return { ok: false, response: c.json(jsonError("OWNER_DEVICE_INVALID", "Bu KY Güvenlik cihazı aktif değil."), 401) };
  }
  if (text(device.userId) !== text(current.id)) {
    return { ok: false, response: c.json(jsonError("OWNER_DEVICE_MISMATCH", "Bu güvenlik cihazı asıl Süper Yönetici hesabına ait değil."), 403) };
  }

  const tokenMatches = safeEqual(text(device.deviceTokenHash), await sha256(deviceToken));
  if (!tokenMatches) {
    return { ok: false, response: c.json(jsonError("OWNER_DEVICE_TOKEN_INVALID", "Güvenlik cihazı anahtarı doğrulanamadı. KY Güvenlik uygulamasından erişimi yenileyin."), 401) };
  }
  if (!(await verifyDeviceSignature(c, device))) {
    return { ok: false, response: c.json(jsonError("OWNER_DEVICE_SIGNATURE_INVALID", "Owner Security cihaz imzası doğrulanamadı."), 401) };
  }

  return { ok: true, current, owner, device };
}
