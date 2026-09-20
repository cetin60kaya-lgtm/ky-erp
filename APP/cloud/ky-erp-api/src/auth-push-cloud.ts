// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerSecurityMobileControlRoutes } from "./auth-security-mobile-control";
import {
  AUTH_SECURITY_SCOPES, SECURITY_APPROVAL_KINDS,
  atomicSecurityStatusUpdate, securityStoreGet as storeGet, securityStoreList as storeList, securityStorePut as storePut,
  saveSecurityDevice as saveDevice, securityDevicesForUser, securityPushPublicKey, sendSecurityWakeMany as sendWakeMany,
  pushEndpointOf, trustedDeviceIsRetired,
} from "./auth-security-core";

type AnyRow = Record<string, any>;

const PHONE_APPROVAL_SECONDS = 10 * 60;
const DEVICE_SCOPE = AUTH_SECURITY_SCOPES.DEVICE;
const SECURITY_GRANT_SCOPE = AUTH_SECURITY_SCOPES.SECURITY_GRANT;
const SECURITY_CAPABILITIES = ["LOGIN_APPROVE", "SESSION_VIEW", "SESSION_APPROVE", "SESSION_CLOSE", "AUDIT_VIEW"];
const PHONE_SCOPE = AUTH_SECURITY_SCOPES.PHONE_LOGIN;
const COMPANY_SETTING_SCOPE = AUTH_SECURITY_SCOPES.COMPANY_LOGIN;
const SECURITY_ENROLL_SCOPE = AUTH_SECURITY_SCOPES.SECURITY_ENROLLMENT;
const ACTION_SCOPE = AUTH_SECURITY_SCOPES.SECURITY_ACTION;
const SESSION_TRUST_SCOPE = AUTH_SECURITY_SCOPES.SESSION_TRUST;
const TRUSTED_LOGIN_DEVICE_SCOPE = AUTH_SECURITY_SCOPES.TRUSTED_LOGIN_DEVICE;
const SECURITY_ENROLL_SECONDS = 10 * 60;
const SECURITY_APP_VERSION = "security-v2.6";
// Güvenilir cihaz kimliği ile push teslim kanalı ayrı yaşam döngüleridir; push hatası cihazı iptal etmez.
// Telefon onayı birincil faktör olarak beklemede tutulur.
const SECURITY_LOGIN_CODE_SECONDS = 60;
const SECURITY_LOGIN_CODE_MAX_ATTEMPTS = 5;

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
  const role = upper(row?.role_override || row?.platform_role || row?.role || "VIEWER");
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
async function securityAppAccess(c: any, row: AnyRow) {
  const userId = text(row?.id || row?.userId);
  const role = roleOf({ role: row?.role, role_override: row?.role_override || row?.roleOverride });
  const companySlug = text(row?.main_company_slug || row?.mainCompanySlug || row?.companySlug);
  if (isSuper(role) || isCompanyAdmin(role)) return { eligible: true, capabilities: [...SECURITY_CAPABILITIES], source: "ROLE" };
  if (!userId || !companySlug) return { eligible: false, capabilities: [], source: "NONE" };
  const grant = await storeGet(c, SECURITY_GRANT_SCOPE, `${companySlug}:${userId}`);
  const capabilities = grant?.isActive === false || !Array.isArray(grant?.capabilities)
    ? []
    : [...new Set(grant.capabilities.map(upper).filter((value: string) => SECURITY_CAPABILITIES.includes(value)))];
  return { eligible: capabilities.length > 0, capabilities, source: capabilities.length ? "GRANT" : "NONE" };
}
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBytes(value: unknown) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomEnrollmentCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function randomSixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}
function randomMatchNumber() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(10 + (bytes[0] % 90));
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

async function atomicPhoneUpdate(c: any, current: AnyRow, expectedStatus: string, patch: AnyRow) {
  return atomicSecurityStatusUpdate(c, PHONE_SCOPE, current, expectedStatus, patch);
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

async function activeDevicesForUser(c: any, userId: string, purpose: "SELF" | "MANAGER") {
  return securityDevicesForUser(c, userId, purpose);
}

async function supersedeOlderSelfChallenges(c: any, userId: string, replacementId: string) {
  const timestamp = nowIso();
  const rows = (await storeList(c, PHONE_SCOPE))
    .filter((row: AnyRow) =>
      text(row.userId) === text(userId) &&
      text(row.id) !== text(replacementId) &&
      upper(row.status) === "PENDING" &&
      !text(row.consumedAt)
    );

  for (const row of rows) {
    await atomicPhoneUpdate(c, row, "PENDING", {
      status: "SUPERSEDED",
      decidedAt: timestamp,
      consumedAt: timestamp,
      supersededBy: replacementId,
    });
  }
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
    // Firma giriş ve oturum onayları güvenlik politikası gereği iki yönetim katmanına da gider.
    notifyCompanyOwner: true,
    notifyApplicationOwner: true,
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

function browserDeviceId(label: unknown) { const value=text(label); return value.startsWith("BROWSER:") ? value.slice(8) : ""; }
function trustedLoginDeviceKey(userId: unknown, deviceId: unknown) { return `${text(userId)}:${text(deviceId)}`; }
async function managerApproverUserIds(c: any, companySlug: string) {
  const result=await c.env.DB.prepare(`SELECT u.id,u.role,u.platform_role,s.role_override,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.is_active=1`).all<AnyRow>();
  const ids=new Set<string>();
  for(const row of result.results || []) { const role=roleOf(row); if(isSuper(role) || (isCompanyAdmin(role) && text(row.main_company_slug)===text(companySlug))) ids.add(text(row.id)); }
  return ids;
}
function canApproveSessionTarget(actor: AnyRow, session: AnyRow) { const targetRole=roleOf({ role:session.target_role, platform_role:session.target_platform_role, role_override:session.target_role_override }); if(["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(targetRole)) return false; if(isSuper(actor.role)) return true; return isCompanyAdmin(actor.role) && text(actor.companySlug)===text(session.main_company_slug); }
async function sessionNeedsManagerReview(c: any, session: AnyRow) {
  let trust=await storeGet(c, SESSION_TRUST_SCOPE, text(session.id));
  if (!trust && text(session.id)) trust=await storePut(c, SESSION_TRUST_SCOPE, text(session.id), text(session.mainCompanySlug || session.main_company_slug), { sessionId:text(session.id), userId:text(session.userId || session.user_id), status:"PENDING", requestedAt:text(session.createdAt || session.created_at || nowIso()), source:"MANAGER_REVIEW" });
  if (["TRUSTED","VERIFIED","REJECTED","SUSPICIOUS"].includes(upper(trust?.status))) return false;
  const deviceId=browserDeviceId(session.deviceLabel || session.device_label);
  if(deviceId){ const trusted=await storeGet(c,TRUSTED_LOGIN_DEVICE_SCOPE,trustedLoginDeviceKey(session.userId || session.user_id,deviceId)); if(trusted && trusted.isTrusted!==false && !text(trusted.revokedAt)) return false; }
  return true;
}
function securityAppVersionCode(value: unknown) { const match=/security-v(\d+)\.(\d+)/i.exec(text(value)); return match ? Number(match[1])*100+Number(match[2]) : 0; }
function requiresLoginNumberMatch(device: AnyRow) { return securityAppVersionCode(device?.securityAppVersion) >= 206; }
async function verifySecurityAppDecision(device: AnyRow, kind: string, id: string, decision: string, signatureValue: unknown, matchNumberValue: unknown = "") {
  if (device?.securityApp !== true) return true;
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const signature = text(signatureValue);
  if (!jwk?.kty || !jwk?.crv || !jwk?.x || !jwk?.y || !signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const matchNumber=text(matchNumberValue);
    const version=kind === "SELF_LOGIN" && decision === "APPROVE" && matchNumber ? "KYERP-DECISION-V2" : "KYERP-DECISION-V1";
    const message = new TextEncoder().encode(
      matchNumber ? `${version}|${text(device.id)}|${kind}|${id}|${decision}|${matchNumber}` : `${version}|${text(device.id)}|${kind}|${id}|${decision}`,
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(signature),
      message,
    );
  } catch {
    return false;
  }
}

async function verifySecurityDeviceAuth(c: any, device: AnyRow) {
  if (device?.securityApp !== true) return false;
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const timestamp = text(c.req.header("X-KYERP-Security-Timestamp"));
  const signature = text(c.req.header("X-KYERP-Security-Signature"));
  const timestampMs = Number(timestamp);
  if (
    !jwk?.kty || !jwk?.crv || !jwk?.x || !jwk?.y ||
    !timestamp || !signature || !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 120_000
  ) return false;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const method = upper(c.req.method || "GET");
    const pathname = new URL(c.req.url).pathname;
    const message = new TextEncoder().encode(
      `KYERP-DEVICE-AUTH-V1|${text(device.id)}|${method}|${pathname}|${timestamp}`,
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(signature),
      message,
    );
  } catch {
    return false;
  }
}

async function signedSecurityActorForRecovery(c: any) {
  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const deviceToken = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !deviceToken) return null;

  const device = await storeGet(c, DEVICE_SCOPE, deviceId);
  if (!device || device.securityApp !== true) return null;
  if (!(await verifySecurityDeviceAuth(c, device))) return null;

  const user = await c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,
            s.email,s.role_override,s.main_company_slug
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(text(device.userId)).first<AnyRow>();
  if (!user || !Boolean(user.is_active)) return null;
  const appAccess = await securityAppAccess(c, user);
  if (!appAccess.eligible) return null;

  return {
    device,
    userId: text(user.id),
    role: roleOf(user),
    companySlug: text(user.main_company_slug || device.mainCompanySlug),
    username: text(user.username),
    email: text(user.email),
    fullName: text(user.full_name || user.username),
  };
}

async function actorFromDevice(c: any) {
  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const deviceToken = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !deviceToken) return null;

  let device = await storeGet(c, DEVICE_SCOPE, deviceId);
  if (!device) return null;

  const suppliedHash = await sha256(deviceToken);
  const tokenMatches = safeEqual(text(device.deviceTokenHash), suppliedHash);

  if (device.isActive === false) {
    const oldPushExpiryDisable =
      device.securityApp === true &&
      !text(device.retiredAt) &&
      !text(device.retiredReason) &&
      /^HTTP (404|410)$/i.test(text(device.lastError));
    if (!oldPushExpiryDisable) return null;

    const signedRecovery = tokenMatches || await verifySecurityDeviceAuth(c, device);
    if (!signedRecovery) return null;

    device = await saveDevice(c, {
      ...device,
      isActive: true,
      pushReachable: false,
      reactivatedFromPushExpiryAt: nowIso(),
    });
    await audit(c, "SECURITY_DEVICE_REACTIVATED_AFTER_PUSH_EXPIRY", text(device.userId), text(device.userId), text(device.mainCompanySlug), {
      deviceId: device.id,
      previousError: text(device.lastError),
    });
  }

  if (!tokenMatches) {
    const signedRecovery = await verifySecurityDeviceAuth(c, device);
    if (!signedRecovery) return null;

    device = await saveDevice(c, {
      ...device,
      deviceTokenHash: suppliedHash,
      tokenRepairedAt: nowIso(),
      lastError: "",
    });
    await audit(c, "SECURITY_DEVICE_TOKEN_REPAIRED", text(device.userId), text(device.userId), text(device.mainCompanySlug), {
      deviceId: device.id,
    });
  }

  const user = await c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,
            s.email,s.role_override,s.main_company_slug
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(text(device.userId)).first<AnyRow>();
  if (!user || !Boolean(user.is_active)) return null;
  const appAccess = await securityAppAccess(c, user);
  if (!appAccess.eligible) return null;

  const companySlug = text(user.main_company_slug || device.mainCompanySlug);
  const reportedAppVersion = text(c.req.header("X-KYERP-Security-App-Version"));
  const acceptedAppVersion = /^security-v\d+\.\d+$/i.test(reportedAppVersion) ? reportedAppVersion : text(device.securityAppVersion);
  c.executionCtx?.waitUntil?.(saveDevice(c, { ...device, mainCompanySlug: companySlug, securityAppVersion: acceptedAppVersion || SECURITY_APP_VERSION, lastSeenAt: nowIso(), trustedAt: device.trustedAt || device.createdAt || nowIso(), identityVersion: text(device.identityVersion || "TRUSTED_DEVICE_V1") }));

  return {
    device,
    userId: text(user.id),
    role: roleOf(user),
    companySlug,
    username: text(user.username),
    email: text(user.email),
    fullName: text(user.full_name || user.username),
    securityCapabilities: appAccess.capabilities || [],
  };
}

async function securityAccountProfile(c: any, actor: AnyRow) {
  const role = upper(actor.role);
  const companySlug = text(actor.companySlug);
  let companyName = companySlug;
  if (companySlug && await tableExists(c, "main_companies")) {
    try {
      const company = await c.env.DB.prepare(
        "SELECT name FROM main_companies WHERE slug=? LIMIT 1",
      ).bind(companySlug).first<AnyRow>();
      companyName = text(company?.name || companySlug);
    } catch {
      companyName = companySlug;
    }
  }

  let moduleKeys: string[] = [];
  if (isSuper(role)) {
    moduleKeys = ["ALL"];
  } else if (await tableExists(c, "auth_user_module_permissions")) {
    try {
      const result = await c.env.DB.prepare(
        "SELECT module_key FROM auth_user_module_permissions WHERE user_id=? AND can_view=1 ORDER BY module_key",
      ).bind(actor.userId).all<AnyRow>();
      moduleKeys = [...new Set((result.results || []).map((row: AnyRow) => upper(row.module_key)).filter(Boolean))];
    } catch {
      moduleKeys = [];
    }
  }
  if (isCompanyAdmin(role)) {
    if (!moduleKeys.includes("ADMIN")) moduleKeys.push("ADMIN");
    if (!moduleKeys.includes("STORAGE_ADMIN")) moduleKeys.push("STORAGE_ADMIN");
  }

  let securityCapabilities: string[] = [];
  if (isSuper(role) || isCompanyAdmin(role)) {
    securityCapabilities = [...SECURITY_CAPABILITIES];
  } else if (companySlug) {
    const grant = await storeGet(c, SECURITY_GRANT_SCOPE, `${companySlug}:${actor.userId}`);
    if (grant?.isActive !== false && Array.isArray(grant?.capabilities)) {
      securityCapabilities = [...new Set(
        grant.capabilities.map(upper).filter((value: string) => SECURITY_CAPABILITIES.includes(value)),
      )];
    }
  }

  return {
    userId: text(actor.userId),
    fullName: text(actor.fullName || actor.username || "Kullanıcı"),
    username: text(actor.username),
    email: text(actor.email),
    role,
    companySlug,
    companyName,
    scopeType: isSuper(role) ? "SYSTEM" : (isCompanyAdmin(role) ? "COMPANY" : "USER"),
    moduleKeys,
    securityCapabilities,
  };
}

function canApproveTarget(actor: AnyRow, approval: AnyRow, settings: AnyRow) {
  const targetRole = roleOf({ role: approval.target_role, platform_role: approval.target_platform_role, role_override: approval.target_role_override });
  if (isCompanyAdmin(actor.role)) return actor.companySlug === text(approval.main_company_slug) && !["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(targetRole);
  if (isSuper(actor.role)) return true;
  return false;
}

export async function startPhoneApprovalChallenge(c: any, user: AnyRow, source: AnyRow = {}) {
  const devices = await activeDevicesForUser(c, text(user.id), "SELF");
  if (!devices.length) return null;

  const id = crypto.randomUUID();
  const token = randomToken(32);
  const matchNumber = randomMatchNumber();
  const companySlug = text(user.main_company_slug || user.mainCompanySlug || "mecit-hakan");

  // Aynı kullanıcı yeniden girişe basarsa eski bekleyen telefon isteğini "reddedildi"
  // yapmayız. Sessizce SUPERSEDED kapatılır; telefonda yalnız en yeni istek yaşar.
  await supersedeOlderSelfChallenges(c, text(user.id), id);

  const requestedAt = nowIso();
  const expiresAt = addSeconds(PHONE_APPROVAL_SECONDS);

  const challenge = await storePut(c, PHONE_SCOPE, id, companySlug, {
    id,
    userId: text(user.id),
    mainCompanySlug: companySlug,
    challengeTokenHash: await sha256(token),
    status: "PENDING",
    matchNumber,
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
  await audit(
    c,
    sent ? "PHONE_LOGIN_APPROVAL_REQUESTED" : "PHONE_LOGIN_APPROVAL_PUSH_DEFERRED",
    user.id,
    user.id,
    companySlug,
    { challengeId: id, notifiedDevices: sent },
  );
  return {
    ok: true,
    stage: "PHONE_APPROVAL_PENDING",
    phoneApprovalId: id,
    phoneApprovalToken: token,
    phoneApprovalExpiresAt: expiresAt,
    matchNumber,
    notifiedDevices: sent,
    pushDelivered: sent > 0,
    message: sent
      ? "Telefonunuza KY ERP giriş onayı gönderildi. KY ERP Güvenlik uygulamasından Onayla veya Reddet seçin."
      : "Telefon onayı hazır. Bildirim kanalı geçici olarak yanıt vermedi; KY ERP Güvenlik uygulamasını açın, istek Onaylar bölümünde görünecektir.",
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

export async function resendPhoneApprovalChallenge(c: any, idValue: unknown, tokenValue: unknown) {
  const approval = await phoneApprovalFromRequest(c, idValue, tokenValue);
  if (!approval) return { ok: false, code: "PHONE_APPROVAL_INVALID", approval: null, sent: 0 };
  if (upper(approval.status) !== "PENDING" || text(approval.consumedAt)) {
    return { ok: false, code: "PHONE_APPROVAL_NOT_PENDING", approval, sent: 0 };
  }
  const devices = await activeDevicesForUser(c, text(approval.userId), "SELF");
  const sent = await sendWakeMany(c, devices);
  await audit(c, "PHONE_LOGIN_APPROVAL_RESENT", approval.userId, approval.userId, text(approval.mainCompanySlug), {
    challengeId: approval.id,
    notifiedDevices: sent,
  });
  return {
    ok: devices.length > 0,
    code: sent > 0 ? "" : "PHONE_APPROVAL_PUSH_DEFERRED",
    approval,
    sent,
  };
}

export async function verifySecurityLoginCode(c: any, idValue: unknown, tokenValue: unknown, codeValue: unknown) {
  const row = await phoneApprovalFromRequest(c, idValue, tokenValue);
  if (!row) return { ok: false, code: "PHONE_APPROVAL_INVALID", row: null };
  if (upper(row.status) !== "PENDING" || text(row.consumedAt)) return { ok: false, code: "PHONE_APPROVAL_NOT_PENDING", row };

  const candidate = text(codeValue).replace(/\D/g, "");
  const attempts = Number(row.securityCodeAttempts || 0);
  if (!/^\d{6}$/.test(candidate)) return { ok: false, code: "SECURITY_LOGIN_CODE_INVALID", row };
  if (!row.securityCodeHash || !row.securityCodeSalt || Date.parse(text(row.securityCodeExpiresAt)) <= Date.now()) {
    return { ok: false, code: "SECURITY_LOGIN_CODE_EXPIRED", row };
  }
  if (attempts >= SECURITY_LOGIN_CODE_MAX_ATTEMPTS) return { ok: false, code: "SECURITY_LOGIN_CODE_LOCKED", row };

  const valid = safeEqual(
    text(row.securityCodeHash),
    await sha256(`${text(row.securityCodeSalt)}:${candidate}`),
  );
  if (!valid) {
    await storePut(c, PHONE_SCOPE, text(row.id), text(row.mainCompanySlug), {
      ...row,
      securityCodeAttempts: attempts + 1,
    });
    return {
      ok: false,
      code: attempts + 1 >= SECURITY_LOGIN_CODE_MAX_ATTEMPTS ? "SECURITY_LOGIN_CODE_LOCKED" : "SECURITY_LOGIN_CODE_INVALID",
      row,
      attempts: attempts + 1,
    };
  }

  const update = await atomicPhoneUpdate(c, row, "PENDING", {
    status: "APPROVED",
    decidedAt: nowIso(),
    decidedByDeviceId: text(row.securityCodeDeviceId),
    securityCodeUsedAt: nowIso(),
  });
  if (!update.changed) return { ok: false, code: "PHONE_APPROVAL_NOT_PENDING", row: update.row || row };

  await audit(c, "SECURITY_APP_LOGIN_CODE_VERIFIED", text(row.userId), text(row.userId), text(row.mainCompanySlug), {
    challengeId: row.id,
    deviceId: text(row.securityCodeDeviceId),
  });
  return { ok: true, code: "", row: update.row };
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
  const userIds = await managerApproverUserIds(c, companySlug);
  const devices: AnyRow[] = [];
  for (const userId of userIds) devices.push(...await activeDevicesForUser(c, userId, "MANAGER"));
  const sent = await sendWakeMany(c, devices);
  await audit(c, "LOGIN_MANAGER_PUSH_DISPATCHED", "", "", companySlug, { approvalId, recipients: userIds.size, notifiedDevices: sent });
  return { sent, recipients: userIds.size };
}

export async function notifySessionApproval(c: any, session: AnyRow) {
  const companySlug=text(session.mainCompanySlug || session.main_company_slug); const targetRole=roleOf({ role:session.role, platform_role:session.platform_role, role_override:session.role_override });
  if (["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(targetRole) || !(await sessionNeedsManagerReview(c, session))) return { sent:0, recipients:0 };
  const userIds=await managerApproverUserIds(c, companySlug); const devices: AnyRow[]=[]; for(const userId of userIds) devices.push(...await activeDevicesForUser(c,userId,"MANAGER"));
  const sent=await sendWakeMany(c,devices); await audit(c,"SESSION_MANAGER_PUSH_DISPATCHED","",text(session.userId || session.user_id),companySlug,{ sessionId:text(session.id), recipients:userIds.size, notifiedDevices:sent });
  return { sent, recipients:userIds.size };
}

async function pendingItems(c: any, actor: AnyRow) {
  const timestamp = nowIso();
  const items: AnyRow[] = [];

  const selfRows = (await storeList(c, PHONE_SCOPE))
    .filter((row: AnyRow) => text(row.userId) === actor.userId)
    .sort((a: AnyRow, b: AnyRow) =>
      String(b.requestedAt || b.createdAt || "").localeCompare(String(a.requestedAt || a.createdAt || "")));

  let latestSelfPending = "";
  for (const row of selfRows) {
    let current = row;
    if (upper(current.status) === "PENDING" && !text(current.consumedAt) && Date.parse(text(current.expiresAt)) <= Date.now()) {
      const update = await atomicPhoneUpdate(c, current, "PENDING", { status: "EXPIRED", consumedAt: timestamp });
      current = update.row || current;
    }
    if (upper(current.status) !== "PENDING" || text(current.consumedAt)) continue;

    if (latestSelfPending) {
      const update = await atomicPhoneUpdate(c, current, "PENDING", {
        status: "SUPERSEDED",
        decidedAt: timestamp,
        consumedAt: timestamp,
        supersededBy: latestSelfPending,
      });
      current = update.row || current;
      continue;
    }

    latestSelfPending = text(current.id);
    items.push({
      kind: "SELF_LOGIN",
      id: current.id,
      dedupeKey: `self:${actor.userId}`,
      title: "KY ERP · Giriş Onayı",
      body: `${friendlyDeviceLabel(current.deviceLabel, current.userAgent)} için giriş onayı bekleniyor.`,
      matchNumber: text(current.matchNumber),
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
      dedupeKey: `manager:${text(row.user_id)}`,
      title: "KY ERP · Firma Giriş Onayı",
      body: isSuper(actor.role)
        ? `${text(row.full_name || row.username)} · ${text(row.main_company_slug)} · ${friendlyDeviceLabel(row.device_label, row.user_agent)}`
        : `${text(row.full_name || row.username)} · ${friendlyDeviceLabel(row.device_label, row.user_agent)}`,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
      mainCompanySlug: row.main_company_slug,
    });
  }

  if (isSuper(actor.role) || isCompanyAdmin(actor.role)) {
    const sessionResult = isCompanyAdmin(actor.role)
      ? await c.env.DB.prepare(`SELECT s.id,s.user_id,s.main_company_slug,s.device_label,s.user_agent,s.ip_address,s.created_at,s.expires_at,u.full_name,u.username,u.role AS target_role,u.platform_role AS target_platform_role,us.role_override AS target_role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.revoked_at IS NULL AND s.expires_at>? AND s.main_company_slug=? ORDER BY s.created_at DESC LIMIT 150`).bind(timestamp,actor.companySlug).all<AnyRow>()
      : await c.env.DB.prepare(`SELECT s.id,s.user_id,s.main_company_slug,s.device_label,s.user_agent,s.ip_address,s.created_at,s.expires_at,u.full_name,u.username,u.role AS target_role,u.platform_role AS target_platform_role,us.role_override AS target_role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.revoked_at IS NULL AND s.expires_at>? ORDER BY s.created_at DESC LIMIT 250`).bind(timestamp).all<AnyRow>();
    for (const row of sessionResult.results || []) {
      if (!canApproveSessionTarget(actor,row) || !(await sessionNeedsManagerReview(c,row))) continue;
      items.push({ kind: SECURITY_APPROVAL_KINDS.SESSION, id: row.id, dedupeKey: `session:${text(row.id)}`, title: "KY ERP · Oturum Onayı", body: `${text(row.full_name || row.username)} · ${friendlyDeviceLabel(row.device_label,row.user_agent)} için oturum onayı bekleniyor.`, requestedAt: row.created_at, expiresAt: row.expires_at, mainCompanySlug: row.main_company_slug });
    }
  }

  return items;
}

async function fallbackSelfPendingItems(c: any, actor: AnyRow) {
  const rows=(await storeList(c, PHONE_SCOPE)).filter((row: AnyRow)=>text(row.userId)===actor.userId&&upper(row.status)==="PENDING"&&!text(row.consumedAt)&&Date.parse(text(row.expiresAt))>Date.now()).sort((a: AnyRow,b: AnyRow)=>String(b.requestedAt||b.createdAt||"").localeCompare(String(a.requestedAt||a.createdAt||"")));
  const row=rows[0];
  return row?[{kind:"SELF_LOGIN",id:row.id,dedupeKey:`self:${actor.userId}`,title:"KY ERP · Giriş Onayı",body:`${friendlyDeviceLabel(row.deviceLabel,row.userAgent)} için giriş onayı bekleniyor.`,matchNumber:text(row.matchNumber),requestedAt:row.requestedAt,expiresAt:row.expiresAt,mainCompanySlug:actor.companySlug}]:[];
}
async function safePendingItems(c: any, actor: AnyRow) {
  try { return await pendingItems(c, actor); } catch (error) { console.error(JSON.stringify({level:"error",area:"KY_SECURITY_PENDING",message:error instanceof Error?error.message:String(error)})); return fallbackSelfPendingItems(c, actor); }
}
async function safeSecurityAccountProfile(c: any, actor: AnyRow) {
  try { return await securityAccountProfile(c, actor); } catch (error) { console.error(JSON.stringify({level:"error",area:"KY_SECURITY_ACCOUNT",message:error instanceof Error?error.message:String(error)})); const role=upper(actor.role); return {userId:text(actor.userId),fullName:text(actor.fullName||actor.username||"Kullanıcı"),username:text(actor.username),email:text(actor.email),role,companySlug:text(actor.companySlug),companyName:text(actor.companySlug),scopeType:isSuper(role)?"SYSTEM":(isCompanyAdmin(role)?"COMPANY":"USER"),moduleKeys:isSuper(role)?["ALL"]:[],securityCapabilities:(isSuper(role)||isCompanyAdmin(role))?[...SECURITY_CAPABILITIES]:[]}; }
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
  registerSecurityMobileControlRoutes(app, actorFromDevice, SECURITY_APP_VERSION);
  app.get("/api/auth/push/security-config", async (c: any) => {
    const applicationServerKey = await securityPushPublicKey(c);
    return c.json({
      ok: true,
      data: {
        app: "KY ERP Güvenlik",
        version: SECURITY_APP_VERSION,
        applicationServerKey,
        approvalUrl: "https://kyerp.net/ky-guvenlik/",
      },
    });
  });

  app.post("/api/auth/push/security-enrollment/start", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Güvenlik uygulaması kurulumu için KY ERP oturumu gereklidir."), 401);
    const appAccess = await securityAppAccess(c, current);
    if (!appAccess.eligible) return c.json(jsonError("SECURITY_APP_NOT_ALLOWED", "Bu hesaba KY Güvenlik uygulaması yetkisi verilmemiş."), 403);

    const body = await bodyOf(c);
    const requestedTargetDeviceId = text(body.targetDeviceId);
    const existingSecurityDevices = await securityDevicesForUser(c, text(current.id), "CONTROL");
    let targetDevice = requestedTargetDeviceId
      ? existingSecurityDevices.find((row: AnyRow) => text(row.id) === requestedTargetDeviceId) || null
      : null;
    if (requestedTargetDeviceId && !targetDevice) {
      return c.json(jsonError("SECURITY_DEVICE_RELINK_INVALID", "Yenilenecek güvenilir cihaz bu hesaba ait değil veya emekliye ayrılmış."), 409);
    }
    // Eski istemciler hedef cihaz göndermese bile hesapta tek güvenilir telefon varsa
    // yeni cihaz üretmek yerine aynı kalıcı kimliğe bağlanır.
    if (!targetDevice && !requestedTargetDeviceId && existingSecurityDevices.length === 1) {
      targetDevice = existingSecurityDevices[0];
    }

    const applicationServerKey = await securityPushPublicKey(c);
    const enrollmentId = crypto.randomUUID();
    const enrollmentToken = randomToken(32);
    const enrollmentCode = randomEnrollmentCode(8);
    const companySlug = text(current.mainCompanySlug || "mecit-hakan");
    const expiresAt = addSeconds(SECURITY_ENROLL_SECONDS);
    const reservedDeviceId = text(targetDevice?.id) || crypto.randomUUID();
    const enrollmentMode = targetDevice ? "RELINK" : "NEW";

    await storePut(c, SECURITY_ENROLL_SCOPE, enrollmentId, companySlug, {
      id: enrollmentId,
      userId: text(current.id),
      mainCompanySlug: companySlug,
      tokenHash: await sha256(enrollmentToken),
      codeHash: await sha256(enrollmentCode),
      status: "PENDING",
      expiresAt,
      consumedAt: "",
      enrollmentMode,
      targetDeviceId: text(targetDevice?.id),
      reservedDeviceId,
      createdFromIp: clientIp(c),
      createdFromUserAgent: userAgent(c),
    });

    await audit(c, "SECURITY_APP_ENROLLMENT_STARTED", current.id, current.id, companySlug, {
      enrollmentId, enrollmentMode, targetDeviceId: text(targetDevice?.id), reservedDeviceId,
    });
    return c.json({
      ok: true,
      data: {
        enrollmentId,
        enrollmentToken,
        enrollmentCode,
        expiresAt,
        applicationServerKey,
        enrollmentMode,
        targetDeviceId: text(targetDevice?.id),
        deviceIdHint: reservedDeviceId,
        appUrl: `https://kyerp.net/ky-guvenlik/?enrollmentId=${encodeURIComponent(enrollmentId)}&enrollmentToken=${encodeURIComponent(enrollmentToken)}`,
      },
    });
  });

  app.post("/api/auth/push/security-enrollment/complete", async (c: any) => {
    const body = await bodyOf(c);
    const enrollmentId = text(body.enrollmentId);
    const enrollmentToken = text(body.enrollmentToken);
    const enrollmentCode = upper(body.enrollmentCode).replace(/[^A-Z0-9]/g, "");
    let enrollment = enrollmentId ? await storeGet(c, SECURITY_ENROLL_SCOPE, enrollmentId) : null;

    if (enrollment) {
      if (!enrollmentToken || !safeEqual(text(enrollment.tokenHash), await sha256(enrollmentToken))) enrollment = null;
    } else if (enrollmentCode) {
      const codeHash = await sha256(enrollmentCode);
      const candidates = (await storeList(c, SECURITY_ENROLL_SCOPE))
        .filter((row: AnyRow) =>
          upper(row.status) === "PENDING" &&
          !text(row.consumedAt) &&
          Date.parse(text(row.expiresAt)) > Date.now() &&
          safeEqual(text(row.codeHash), codeHash)
        );
      enrollment = candidates[0] || null;
    }

    if (!enrollment || upper(enrollment.status) !== "PENDING" || text(enrollment.consumedAt)) {
      return c.json(jsonError("SECURITY_ENROLLMENT_INVALID", "Kurulum kodu geçersiz veya daha önce kullanılmış."), 401);
    }
    if (Date.parse(text(enrollment.expiresAt)) <= Date.now()) {
      await storePut(c, SECURITY_ENROLL_SCOPE, text(enrollment.id), text(enrollment.mainCompanySlug), {
        ...enrollment,
        status: "EXPIRED",
        consumedAt: nowIso(),
      });
      return c.json(jsonError("SECURITY_ENROLLMENT_EXPIRED", "Kurulum kodunun süresi doldu. KY ERP'den yeni kod oluşturun."), 410);
    }

    const user = await userRow(c, text(enrollment.userId));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("SECURITY_APP_NOT_ALLOWED", "Bu hesap artık KY Güvenlik uygulamasını kullanamaz."), 403);
    const appAccess = await securityAppAccess(c, user);
    if (!appAccess.eligible) return c.json(jsonError("SECURITY_APP_NOT_ALLOWED", "Bu hesaba KY Güvenlik uygulaması yetkisi verilmemiş."), 403);
    const password = String(body.password || "");
    if (!user || !Boolean(user.is_active) || !password || !(await compare(password, text(user.password_hash)))) {
      return c.json(jsonError("STEP_UP_FAILED", "Mevcut KY ERP şifresi doğrulanamadı."), 401);
    }

    const subscription = objectOf(body.subscription);
    const endpoint = text(subscription.endpoint);
    if (!/^https:\/\//i.test(endpoint)) {
      return c.json(jsonError("PUSH_SUBSCRIPTION_INVALID", "Güvenlik uygulaması bildirim aboneliği geçersiz."), 400);
    }

    const decisionPublicKeyJwk = objectOf(body.decisionPublicKeyJwk);
    if (
      upper(decisionPublicKeyJwk.kty) !== "EC" ||
      upper(decisionPublicKeyJwk.crv) !== "P-256" ||
      !text(decisionPublicKeyJwk.x) ||
      !text(decisionPublicKeyJwk.y)
    ) {
      return c.json(jsonError("SECURITY_DEVICE_KEY_INVALID", "Güvenlik uygulaması cihaz anahtarı geçersiz."), 400);
    }

    const allDevices = await storeList(c, DEVICE_SCOPE);
    const serverBoundDeviceId = text(enrollment.targetDeviceId || enrollment.reservedDeviceId);
    const serverBoundCandidate = serverBoundDeviceId
      ? allDevices.find((row: AnyRow) => text(row.id) === serverBoundDeviceId) || null
      : null;
    if (text(enrollment.targetDeviceId) && (!serverBoundCandidate || text(serverBoundCandidate.userId) !== text(user.id) || serverBoundCandidate.securityApp !== true || trustedDeviceIsRetired(serverBoundCandidate))) {
      return c.json(jsonError("SECURITY_DEVICE_RELINK_INVALID", "Sunucuya bağlı güvenilir cihaz artık bu hesaba ait değil."), 409);
    }

    // replaceDeviceId yalnız eski PWA sürümleri için geriye dönük ipucudur. Yeni akışta
    // cihaz kimliği enrollment başlatılırken sunucu tarafından sabitlenir.
    const legacyReplaceDeviceId = text(body.replaceDeviceId);
    const legacyReplaceCandidate = !serverBoundDeviceId && legacyReplaceDeviceId
      ? allDevices.find((row: AnyRow) => text(row.id) === legacyReplaceDeviceId) || null
      : null;
    if (legacyReplaceCandidate && (text(legacyReplaceCandidate.userId) !== text(user.id) || legacyReplaceCandidate.securityApp !== true)) {
      return c.json(jsonError("SECURITY_DEVICE_RELINK_INVALID", "Erişim yenileme cihazı bu hesaba ait değil."), 409);
    }

    const endpointCandidate = allDevices.find((row: AnyRow) => pushEndpointOf(row) === endpoint) || null;
    if (endpointCandidate && text(endpointCandidate.userId) !== text(user.id)) {
      return c.json(jsonError("PUSH_ENDPOINT_ALREADY_BOUND", "Bu telefon başka bir KY ERP hesabına bağlı."), 409);
    }

    const existing = serverBoundCandidate || legacyReplaceCandidate || (!serverBoundDeviceId ? endpointCandidate : null);
    const deviceId = serverBoundDeviceId || text(existing?.id) || crypto.randomUUID();
    const deviceToken = randomToken(36);
    const companySlug = text(user.main_company_slug || enrollment.mainCompanySlug || "mecit-hakan");
    const role = roleOf(user);
    const label = text(body.deviceLabel || friendlyDeviceLabel("", userAgent(c))).slice(0, 180);

    const saved = await saveDevice(c, {
      ...(existing || {}),
      id: deviceId,
      userId: text(user.id),
      mainCompanySlug: companySlug,
      pushEndpoint: endpoint,
      pushChannel: {
        type: "WEB_PUSH", endpoint, reachable: true, lastRefreshAt: nowIso(), invalidAt: "", lastError: "",
      },
      deviceTokenHash: await sha256(deviceToken),
      decisionPublicKeyJwk,
      deviceLabel: label,
      userAgent: userAgent(c),
      securityApp: true,
      securityAppVersion: SECURITY_APP_VERSION,
      selfLoginEnabled: true,
      managerApprovalEnabled: isSuper(role) || isCompanyAdmin(role),
      isActive: true,
      createdAt: existing?.createdAt || nowIso(),
      trustedAt: existing?.trustedAt || existing?.createdAt || nowIso(),
      identityVersion: "TRUSTED_DEVICE_V1",
      lastSeenAt: nowIso(),
      lastError: "",
      retiredAt: "",
      retiredReason: "",
    });

    // Aynı push kanalını daha önce kullanan başka bir güvenlik cihazı satırı varsa
    // güvenilir kimlik olarak çoğaltmayız; sunucunun sabitlediği cihaz kimliği kalır.
    for (const row of allDevices) {
      if (
        text(row.userId) === text(user.id) &&
        text(row.id) !== text(saved.id) &&
        row.securityApp === true &&
        pushEndpointOf(row) === endpoint &&
        !trustedDeviceIsRetired(row)
      ) {
        await saveDevice(c, { ...row, isActive: false, retiredAt: nowIso(), retiredReason: "Aynı telefon kanalı kalıcı cihaz kimliğine birleştirildi" });
      }
    }

    // Yeni güvenlik uygulaması aktif olduğunda aynı hesaptaki eski web-onay cihazlarını kapat.
    for (const row of allDevices) {
      if (
        text(row.userId) === text(user.id) &&
        text(row.id) !== text(saved.id) &&
        row.isActive !== false &&
        row.securityApp !== true
      ) {
        await saveDevice(c, {
          ...row,
          isActive: false,
          retiredAt: nowIso(),
          retiredReason: "KY ERP Güvenlik uygulamasına taşındı",
        });
      }
    }

    await storePut(c, SECURITY_ENROLL_SCOPE, text(enrollment.id), companySlug, {
      ...enrollment,
      status: "COMPLETED",
      consumedAt: nowIso(),
      completedByDeviceId: saved.id,
    });

    await audit(c, "SECURITY_APP_DEVICE_REGISTERED", user.id, user.id, companySlug, {
      deviceId: saved.id,
      deviceLabel: label,
      relinkedDevice: Boolean(serverBoundCandidate || legacyReplaceCandidate),
      serverBoundDevice: Boolean(serverBoundDeviceId),
      enrollmentMode: text(enrollment.enrollmentMode || (serverBoundCandidate ? "RELINK" : "NEW")),
      legacyDevicesRetired: true,
    });

    return c.json({
      ok: true,
      data: {
        deviceId: saved.id,
        deviceToken,
        deviceLabel: label,
        securityApp: true,
        securityAppVersion: SECURITY_APP_VERSION,
      },
    });
  });

  app.get("/api/auth/push/config", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon onayı ayarları için oturum gereklidir."), 401);

    const applicationServerKey = await securityPushPublicKey(c);
    const appAccess = await securityAppAccess(c, current);
    const devices = (await storeList(c, DEVICE_SCOPE))
      .filter((row: AnyRow) => text(row.userId) === text(current.id))
      .sort((a: AnyRow, b: AnyRow) => String(b.lastSeenAt || b.updatedAt || "").localeCompare(String(a.lastSeenAt || a.updatedAt || "")));

    return c.json({
      ok: true,
      data: {
        supported: true,
        securityAppEligible: appAccess.eligible,
        securityCapabilities: appAccess.capabilities,
        applicationServerKey,
        storage: "json_store",
        devices: devices.map((row: AnyRow) => ({
          id: row.id,
          deviceLabel: text(row.deviceLabel),
          selfLoginEnabled: row.selfLoginEnabled !== false,
          managerApprovalEnabled: row.managerApprovalEnabled !== false,
          securityApp: row.securityApp === true,
          securityAppVersion: text(row.securityAppVersion),
          retiredReason: text(row.retiredReason),
          isActive: row.isActive !== false,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastSeenAt: row.lastSeenAt || null,
          lastPushAt: row.lastPushAt || null,
          lastRefreshAt: row.lastRefreshAt || null,
          tokenRepairedAt: row.tokenRepairedAt || null,
          lastError: text(row.lastError),
        })),
      },
    });
  });

  app.post("/api/auth/push/devices/register", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gereklidir."), 401);
    return c.json(jsonError(
      "LEGACY_PHONE_APPROVAL_RETIRED",
      "Eski tarayıcı telefon onayı kapatıldı. Profil > Telefon Onayı bölümünden KY ERP Güvenlik uygulamasını kurun.",
      { securityAppUrl: "https://kyerp.net/ky-guvenlik/" },
    ), 410);
  });

  app.delete("/api/auth/push/devices/:id", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Oturum gereklidir."), 401);
    const device = await storeGet(c, DEVICE_SCOPE, c.req.param("id"));
    if (!device || text(device.userId) !== text(current.id)) return c.json(jsonError("PUSH_DEVICE_NOT_FOUND", "Telefon onayı cihazı bulunamadı."), 404);
    await saveDevice(c, {
      ...device,
      isActive: false,
      retiredAt: nowIso(),
      retiredReason: "Kullanıcı tarafından devre dışı bırakıldı",
    });
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

  app.post("/api/auth/push/security-refresh", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json(jsonError("UNAUTHORIZED", "Telefon bağlantısını yenilemek için oturum gereklidir."), 401);
    const devices = await activeDevicesForUser(c, text(current.id), "SELF");
    if (!devices.length) return c.json(jsonError("SECURITY_APP_NOT_ENROLLED", "Aktif KY ERP Güvenlik cihazı bulunamadı."), 404);

    const sent = await sendWakeMany(c, devices);
    const currentDevices = (await storeList(c, DEVICE_SCOPE))
      .filter((row: AnyRow) => text(row.userId) === text(current.id) && row.securityApp === true && row.isActive !== false)
      .sort((a: AnyRow, b: AnyRow) => String(b.lastSeenAt || b.updatedAt || "").localeCompare(String(a.lastSeenAt || a.updatedAt || "")));

    await audit(c, "SECURITY_APP_CONNECTION_PROBE", current.id, current.id, text(current.mainCompanySlug), {
      devices: currentDevices.length,
      delivered: sent,
    });
    return c.json({
      ok: true,
      data: {
        connected: sent > 0,
        delivered: sent,
        checkedAt: nowIso(),
        devices: currentDevices.map((row: AnyRow) => ({
          id: row.id,
          deviceLabel: friendlyDeviceLabel(row.deviceLabel, row.userAgent),
          lastSeenAt: row.lastSeenAt || null,
          lastPushAt: row.lastPushAt || null,
          lastError: text(row.lastError),
        })),
      },
    });
  });

  app.get("/api/auth/push/device/health", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "KY ERP Güvenlik cihaz bağlantısı doğrulanamadı. Bağlantıyı Yenile işlemini kullanın."), 401);
    const items = await safePendingItems(c, actor);
    const account = await safeSecurityAccountProfile(c, actor);
    return c.json({ ok: true, data: {
      ready: true,
      account,
      checkedAt: nowIso(),
      serverVersion: SECURITY_APP_VERSION,
      pendingCount: items.length,
      items,
      device: {
        id: actor.device.id,
        deviceLabel: text(actor.device.deviceLabel),
        securityAppVersion: text(actor.device.securityAppVersion),
        isActive: actor.device.isActive !== false,
        pushReachable: actor.device.pushReachable !== false,
        lastSeenAt: actor.device.lastSeenAt || null,
        lastPushAt: actor.device.lastPushAt || null,
        lastRefreshAt: actor.device.lastRefreshAt || null,
        tokenRepairedAt: actor.device.tokenRepairedAt || null,
        trustedAt: actor.device.trustedAt || actor.device.createdAt || null,
        identityVersion: text(actor.device.identityVersion || "TRUSTED_DEVICE_V1"),
        lastError: text(actor.device.lastError),
      },
    }});
  });

  app.post("/api/auth/push/device/refresh", async (c: any) => {
    const actor = await signedSecurityActorForRecovery(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_RECOVERY_UNAUTHORIZED", "Güvenlik cihazı yenileme imzası doğrulanamadı. KY ERP'den yeni Erişim Yenileme Kodu oluşturun."), 401);
    const body = await bodyOf(c);
    const subscription = objectOf(body.subscription);
    const endpoint = text(subscription.endpoint);
    if (!/^https:\/\//i.test(endpoint)) return c.json(jsonError("PUSH_SUBSCRIPTION_INVALID", "Telefon bildirim aboneliği yenilenemedi."), 400);

    const timestamp = nowIso();
    const deviceToken = randomToken(36);
    const saved = await saveDevice(c, {
      ...actor.device,
      mainCompanySlug: actor.companySlug,
      pushEndpoint: endpoint,
      deviceTokenHash: await sha256(deviceToken),
      deviceLabel: text(body.deviceLabel || actor.device.deviceLabel || friendlyDeviceLabel("", userAgent(c))).slice(0, 180),
      userAgent: userAgent(c),
      securityApp: true,
      securityAppVersion: SECURITY_APP_VERSION,
      trustedAt: actor.device.trustedAt || actor.device.createdAt || timestamp,
      identityVersion: text(actor.device.identityVersion || "TRUSTED_DEVICE_V1"),
      selfLoginEnabled: true,
      managerApprovalEnabled: isSuper(actor.role) || isCompanyAdmin(actor.role),
      isActive: true,
      lastSeenAt: timestamp,
      lastRefreshAt: timestamp,
      lastError: "",
      retiredAt: "",
      retiredReason: "",
    });
    await audit(c, "SECURITY_APP_CONNECTION_REFRESHED", actor.userId, actor.userId, actor.companySlug, {
      deviceId: saved.id,
      reactivated: actor.device.isActive === false,
      pushEndpointChanged: text(actor.device.pushEndpoint) !== endpoint,
    });
    return c.json({ ok: true, data: {
      ready: true,
      deviceId: saved.id,
      deviceToken,
      deviceLabel: text(saved.deviceLabel),
      securityAppVersion: SECURITY_APP_VERSION,
      refreshedAt: timestamp,
    }});
  });

  app.post("/api/auth/push/device/login-code", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "KY ERP Güvenlik cihazı doğrulanamadı."), 401);

    const rows = (await storeList(c, PHONE_SCOPE))
      .filter((row: AnyRow) =>
        text(row.userId) === actor.userId &&
        upper(row.status) === "PENDING" &&
        !text(row.consumedAt) &&
        Date.parse(text(row.expiresAt)) > Date.now()
      )
      .sort((a: AnyRow, b: AnyRow) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));

    const row = rows[0] || null;
    if (!row) return c.json(jsonError("SECURITY_LOGIN_CODE_NO_REQUEST", "Kod üretmek için önce bilgisayarda KY ERP girişini başlatın."), 404);

    const code = randomSixDigitCode();
    const salt = randomToken(12);
    const expiresAt = addSeconds(SECURITY_LOGIN_CODE_SECONDS);
    await storePut(c, PHONE_SCOPE, text(row.id), text(row.mainCompanySlug), {
      ...row,
      securityCodeHash: await sha256(`${salt}:${code}`),
      securityCodeSalt: salt,
      securityCodeExpiresAt: expiresAt,
      securityCodeAttempts: 0,
      securityCodeDeviceId: actor.device.id,
      securityCodeCreatedAt: nowIso(),
    });
    await audit(c, "SECURITY_APP_LOGIN_CODE_CREATED", actor.userId, actor.userId, actor.companySlug, {
      challengeId: row.id,
      deviceId: actor.device.id,
      expiresAt,
    });
    return c.json({
      ok: true,
      data: {
        challengeId: row.id,
        code,
        expiresAt,
        validSeconds: SECURITY_LOGIN_CODE_SECONDS,
        deviceLabel: friendlyDeviceLabel(row.deviceLabel, row.userAgent),
      },
    });
  });

  app.get("/api/auth/push/device/pending", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "Telefon onayı cihazı doğrulanamadı."), 401);
    return c.json({ ok: true, data: { items: await safePendingItems(c, actor), checkedAt: nowIso() } });
  });

  app.post("/api/auth/push/device/decision", async (c: any) => {
    const actor = await actorFromDevice(c);
    if (!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED", "Telefon onayı cihazı doğrulanamadı."), 401);

    const body = await bodyOf(c);
    const kind = upper(body.kind);
    const id = text(body.id);
    const decision = upper(body.decision);
    const matchNumber = text(body.matchNumber);
    if (!["APPROVE", "DENY"].includes(decision) || !id) return c.json(jsonError("PUSH_DECISION_INVALID", "Onay veya ret seçilmelidir."), 400);

    if (actor.device?.securityApp === true) {
      const verified = await verifySecurityAppDecision(actor.device, kind, id, decision, body.signature, matchNumber);
      if (!verified) {
        await audit(c, "SECURITY_APP_DECISION_SIGNATURE_FAILED", actor.userId, actor.userId, actor.companySlug, {
          deviceId: actor.device.id,
          kind,
          id,
          decision,
        });
        return c.json(jsonError("SECURITY_DEVICE_SIGNATURE_INVALID", "Güvenlik uygulaması cihaz imzası doğrulanamadı."), 401);
      }
    }

    if (kind === "SELF_LOGIN") {
      const row = await storeGet(c, PHONE_SCOPE, id);
      if (!row || text(row.userId) !== actor.userId) {
        return c.json(jsonError("PHONE_APPROVAL_NOT_FOUND", "Giriş onayı bulunamadı."), 404);
      }

      if (decision === "APPROVE" && requiresLoginNumberMatch(actor.device)) {
        if (!matchNumber || matchNumber !== text(row.matchNumber)) {
          await audit(c, "PHONE_LOGIN_MATCH_NUMBER_FAILED", actor.userId, actor.userId, actor.companySlug, { challengeId: id, deviceId: actor.device.id });
          return c.json(jsonError("PHONE_MATCH_NUMBER_INVALID", "Bilgisayardaki eşleştirme numarası doğrulanamadı."), 400);
        }
      }

      const currentStatus = upper(row.status);
      if (
        (decision === "APPROVE" && currentStatus === "APPROVED") ||
        (decision === "DENY" && currentStatus === "DENIED")
      ) {
        return c.json({ ok: true, data: { kind, id, status: currentStatus, applied: false, idempotent: true } });
      }

      if (currentStatus !== "PENDING" || text(row.consumedAt) || Date.parse(text(row.expiresAt)) <= Date.now()) {
        return c.json(jsonError(
          currentStatus === "SUPERSEDED" ? "PHONE_APPROVAL_SUPERSEDED" : "PHONE_APPROVAL_NOT_FOUND",
          currentStatus === "SUPERSEDED"
            ? "Bu giriş isteğinin yerine daha yeni bir giriş isteği açıldı."
            : "Giriş onayı bulunamadı veya süresi doldu.",
        ), currentStatus === "SUPERSEDED" ? 409 : 404);
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

    if (kind === SECURITY_APPROVAL_KINDS.SESSION) {
      const session=await c.env.DB.prepare(`SELECT s.*,u.role AS target_role,u.platform_role AS target_platform_role,us.role_override AS target_role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.id=? LIMIT 1`).bind(id).first<AnyRow>();
      if(!session || !canApproveSessionTarget(actor,session)) return c.json(jsonError("SESSION_APPROVAL_NOT_FOUND","Bu oturum onayı bulunamadı veya yetkiniz dışında."),404);
      let trust=await storeGet(c,SESSION_TRUST_SCOPE,id); if(!trust) await sessionNeedsManagerReview(c,session), trust=await storeGet(c,SESSION_TRUST_SCOPE,id);
      const currentStatus=upper(trust?.status); const wanted=decision==="APPROVE"?"TRUSTED":"REJECTED";
      if((decision==="APPROVE"&&["TRUSTED","VERIFIED"].includes(currentStatus))||(decision==="DENY"&&["REJECTED","SUSPICIOUS"].includes(currentStatus))) return c.json({ok:true,data:{kind,id,status:currentStatus,applied:false,idempotent:true}});
      if(session.revoked_at || Date.parse(text(session.expires_at))<=Date.now() || currentStatus!=="PENDING") return c.json(jsonError("SESSION_APPROVAL_NOT_PENDING","Oturum artık onay beklemiyor."),409);
      const update=await atomicSecurityStatusUpdate(c,SESSION_TRUST_SCOPE,trust,"PENDING",{status:wanted,decidedAt:nowIso(),decidedByUserId:actor.userId,decidedByDeviceId:actor.device.id,source:"MANAGER_PHONE"});
      if(!update.changed) return c.json({ok:true,data:{kind,id,status:upper(update.row?.status||wanted),applied:false,idempotent:true}});
      if(wanted==="REJECTED") await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),revoked_by=COALESCE(revoked_by,?) WHERE id=?").bind(nowIso(),actor.userId,id).run();
      await audit(c,decision==="APPROVE"?"SESSION_TRUSTED_PUSH":"SESSION_TRUST_REJECTED_PUSH",actor.userId,text(session.user_id),text(session.main_company_slug),{sessionId:id,deviceId:actor.device.id});
      return c.json({ok:true,data:{kind,id,status:wanted,applied:true}});
    }

    if (kind === SECURITY_APPROVAL_KINDS.CRITICAL_ACTION) {
      const action = await storeGet(c, ACTION_SCOPE, id);
      if (!action || text(action.userId) !== actor.userId) {
        return c.json(jsonError("SECURITY_ACTION_NOT_FOUND", "Kritik güvenlik onayı bulunamadı."), 404);
      }
      const currentStatus = upper(action.status);
      if (currentStatus !== "PENDING" || text(action.consumedAt) || Date.parse(text(action.expiresAt)) <= Date.now()) {
        return c.json(jsonError("SECURITY_ACTION_NOT_PENDING", "Kritik güvenlik onayı artık beklemede değil veya süresi doldu."), 409);
      }
      const status = decision === "APPROVE" ? "APPROVED" : "DENIED";
      const update = await atomicSecurityStatusUpdate(c, ACTION_SCOPE, action, "PENDING", {
        status,
        decidedAt: nowIso(),
        decidedByDeviceId: actor.device.id,
        ...(status === "DENIED" ? { consumedAt: nowIso() } : {}),
      });
      if (!update.changed) return c.json(jsonError("SECURITY_ACTION_ALREADY_DECIDED", "Kritik güvenlik onayı aynı anda başka bir karar ile sonuçlandırıldı."), 409);
      await audit(c, decision === "APPROVE" ? "SECURITY_ACTION_APPROVED" : "SECURITY_ACTION_DENIED", actor.userId, actor.userId, actor.companySlug, { actionId: id, actionType: action.actionType, deviceId: actor.device.id });
      return c.json({ ok: true, data: { kind, id, status, applied: true } });
    }

    return c.json(jsonError("PUSH_KIND_INVALID", "Telefon onayı türü geçersiz."), 400);
  });
}
