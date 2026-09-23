// @ts-nocheck
import { compare } from "bcryptjs";

const SECURITY_ENROLL_SCOPE = "AUTH_PUSH_SECURITY_ENROLLMENT";
const LIVE_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
  "https://security.kyerp.net",
]);
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}
function objectOf(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function normalizeBackupCode(value: unknown) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
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
function corsHeaders(request: Request) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
  });
  const origin = text(request.headers.get("Origin"));
  if (origin && (LIVE_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin) || PREVIEW_ORIGIN.test(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return headers;
}
function deny(request: Request, code: string, message: string, status = 401) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: corsHeaders(request),
  });
}

async function enrollmentById(env: any, enrollmentId: string) {
  if (!enrollmentId) return null;
  const row = await env.DB.prepare(
    `SELECT data FROM json_store
      WHERE scope=? AND file_name=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(SECURITY_ENROLL_SCOPE, enrollmentId).first();
  return row ? objectOf(row.data) : null;
}
async function enrollmentByCodeHash(env: any, codeHash: string) {
  const row = await env.DB.prepare(
    `SELECT data FROM json_store
      WHERE scope=? AND json_extract(data,'$.codeHash')=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(SECURITY_ENROLL_SCOPE, codeHash).first();
  return row ? objectOf(row.data) : null;
}

export async function guardSecurityDeviceEnrollment(request: Request, env: any) {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;

  if (path === "/api/auth/push/security-relink/by-subscription") {
    return deny(
      request,
      "SECURITY_RELINK_PAIR_REQUIRED",
      "Cihaz yeniden bağlama için Yedek Kod ve Admin Şifresi birlikte gereklidir.",
      410,
    );
  }
  if (path !== "/api/auth/push/security-enrollment/complete") return null;

  let body: Record<string, any> = {};
  try {
    body = objectOf(await request.clone().json());
  } catch {
    return deny(request, "SECURITY_ENROLLMENT_BODY_INVALID", "Cihaz kayıt isteği geçersiz.", 400);
  }

  const backupCode = normalizeBackupCode(body.enrollmentCode);
  const adminPassword = String(body.password || "");
  if (!backupCode) {
    return deny(request, "SECURITY_BACKUP_CODE_REQUIRED", "Yedek Kod zorunludur.", 401);
  }
  if (!adminPassword) {
    return deny(request, "SECURITY_ADMIN_PASSWORD_REQUIRED", "Admin Şifresi zorunludur.", 401);
  }

  const codeHash = await sha256(backupCode);
  const enrollmentId = text(body.enrollmentId);
  const enrollment = enrollmentId
    ? await enrollmentById(env, enrollmentId)
    : await enrollmentByCodeHash(env, codeHash);

  const validEnrollment = Boolean(
    enrollment &&
    upper(enrollment.status) === "PENDING" &&
    !text(enrollment.consumedAt) &&
    Date.parse(text(enrollment.expiresAt)) > Date.now() &&
    safeEqual(text(enrollment.codeHash), codeHash) &&
    text(enrollment.userId)
  );
  if (!validEnrollment) {
    return deny(
      request,
      "SECURITY_ENROLLMENT_PAIR_INVALID",
      "Yedek Kod veya Admin Şifresi eşleşmedi.",
      401,
    );
  }

  const user = await env.DB.prepare(
    `SELECT u.id,u.password_hash,u.is_active
       FROM auth_users u
      WHERE u.id=? LIMIT 1`,
  ).bind(text(enrollment.userId)).first();
  if (!user || !Boolean(user.is_active) || !text(user.password_hash) || !(await compare(adminPassword, text(user.password_hash)))) {
    return deny(
      request,
      "SECURITY_ENROLLMENT_PAIR_INVALID",
      "Yedek Kod veya Admin Şifresi eşleşmedi.",
      401,
    );
  }

  return null;
}
