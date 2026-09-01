// @ts-nocheck
import shell from "./main";

const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";
const COMPAT_PATHS = new Set([
  "/api/admin/main-companies",
  "/api/admin/security/audit-log",
  "/api/admin/security/delivery-capabilities",
]);
const MFA_LOGIN_POLICIES = new Set(["GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"]);
const LIVE_BROWSER_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);
const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PAGES_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;

function upper(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/İ/g, "I");
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeMfaPolicy(value: unknown) {
  const policy = upper(value);
  return MFA_LOGIN_POLICIES.has(policy) ? policy : "ANY_MFA";
}

function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}

function isAdmin(role: unknown) {
  return isOwner(role) || upper(role) === "COMPANY_ADMIN";
}

function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function allowedBrowserOrigin(value: unknown) {
  const origin = text(value);
  if (LIVE_BROWSER_ORIGINS.has(origin)) return origin;
  if (LOCAL_DEV_ORIGIN.test(origin)) return origin;
  if (PAGES_PREVIEW_ORIGIN.test(origin)) return origin;
  return "";
}

function securityErrorResponse(request: Request, code: string, message: string, status = 503) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  const origin = allowedBrowserOrigin(request.headers.get("Origin"));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers });
}

async function tableColumns(env: Cloudflare.Env, table: string) {
  const result = await env.DB.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all<any>();
  return new Set((result.results || []).map((row: any) => text(row.name)));
}

function preservedJson(original: Response, payload: unknown, status = 200) {
  const headers = new Headers(original.headers);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.delete("Content-Length");
  return new Response(JSON.stringify(payload), { status, headers });
}

async function authenticatedUserForCompat(
  request: Request,
  env: Cloudflare.Env,
  executionCtx: ExecutionContext,
) {
  const authorization = text(request.headers.get("Authorization"));
  if (!authorization) return null;

  const meUrl = new URL("/api/auth/me", request.url);
  const headers = new Headers();
  headers.set("Authorization", authorization);
  const origin = text(request.headers.get("Origin"));
  if (origin) headers.set("Origin", origin);
  const device = text(request.headers.get("X-KYERP-Device"));
  if (device) headers.set("X-KYERP-Device", device);

  const response = await shell.fetch(
    new Request(meUrl.toString(), { method: "GET", headers }),
    env,
    executionCtx,
  );
  if (!response.ok) return null;

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  return payload?.user || payload?.data?.user || payload?.data || null;
}

async function compatMainCompanies(env: Cloudflare.Env) {
  const columns = await tableColumns(env, "main_companies");
  if (!columns.size || !columns.has("slug")) return [];

  const field = (name: string, fallbackSql: string) =>
    columns.has(name) ? quoteIdentifier(name) : `${fallbackSql} AS ${quoteIdentifier(name)}`;
  const select = [
    field("id", "slug"),
    field("slug", "''"),
    field("name", "slug"),
    field("title", "NULL"),
    field("is_active", "1"),
    field("created_at", "NULL"),
    field("updated_at", "NULL"),
  ].join(",");
  const order = columns.has("name")
    ? `${columns.has("is_active") ? "is_active DESC," : ""} name COLLATE NOCASE ASC`
    : "slug COLLATE NOCASE ASC";
  const result = await env.DB.prepare(`SELECT ${select} FROM main_companies ORDER BY ${order}`).all<any>();
  return (result.results || []).map((row: any) => ({
    id: text(row.id || row.slug),
    name: text(row.name || row.slug),
    slug: text(row.slug),
    note: text(row.title),
    isActive: Number(row.is_active ?? 1) !== 0,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }));
}

async function compatAuditLog(request: Request, env: Cloudflare.Env, user: any) {
  const columns = await tableColumns(env, "auth_security_audit");
  if (!columns.size) return [];

  const isOwnerUser = isOwner(user?.role);
  const company = text(user?.mainCompanySlug || user?.main_company_slug);
  if (!isOwnerUser && (!company || !columns.has("main_company_slug"))) return [];

  const wanted = [
    "id",
    "action",
    "actor_user_id",
    "target_user_id",
    "main_company_slug",
    "session_id",
    "ip_address",
    "detail",
    "created_at",
  ];
  const select = wanted
    .map((name) => columns.has(name) ? quoteIdentifier(name) : `NULL AS ${quoteIdentifier(name)}`)
    .join(",");
  const parsedLimit = Number(new URL(request.url).searchParams.get("limit") || 250);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 250;
  const where = isOwnerUser ? "" : " WHERE main_company_slug=?";
  const order = columns.has("created_at") ? "created_at DESC" : "rowid DESC";
  const statement = env.DB.prepare(
    `SELECT ${select} FROM auth_security_audit${where} ORDER BY ${order} LIMIT ?`,
  );
  const result = isOwnerUser
    ? await statement.bind(limit).all<any>()
    : await statement.bind(company, limit).all<any>();

  return (result.results || []).map((row: any) => ({
    id: text(row.id),
    action: text(row.action),
    actorUserId: text(row.actor_user_id),
    actorName: "",
    targetUserId: text(row.target_user_id),
    targetName: "",
    mainCompanySlug: text(row.main_company_slug),
    sessionId: text(row.session_id),
    ipAddress: text(row.ip_address),
    detail: text(row.detail),
    createdAt: row.created_at ?? null,
  }));
}

async function adminReadCompat(
  request: Request,
  env: Cloudflare.Env,
  executionCtx: ExecutionContext,
  original: Response,
) {
  if (request.method.toUpperCase() !== "GET" || original.ok) return original;
  const path = new URL(request.url).pathname;
  if (!COMPAT_PATHS.has(path)) return original;

  try {
    const user = await authenticatedUserForCompat(request, env, executionCtx);
    if (!user) return original;

    if (path === "/api/admin/main-companies") {
      if (!isOwner(user.role)) return original;
      return preservedJson(original, { ok: true, data: await compatMainCompanies(env) });
    }

    if (path === "/api/admin/security/delivery-capabilities") {
      if (!isOwner(user.role)) return original;
      const resend = Boolean((env as any).RESEND_API_KEY);
      return preservedJson(original, {
        ok: true,
        data: {
          email: resend,
          emailProvider: resend ? "RESEND" : "NONE",
          emailConfirmation: "PROVIDER_ACCEPTED",
          emailSender: ADMIN_EMAIL_FROM,
          sms: false,
          smsProvider: "NONE",
        },
      });
    }

    if (path === "/api/admin/security/audit-log") {
      if (!isAdmin(user.role)) return original;
      return preservedJson(original, { ok: true, data: await compatAuditLog(request, env, user) });
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      phase: "ADMIN_READ_COMPAT",
      path,
      message: error instanceof Error ? error.message : String(error),
    }));
  }
  return original;
}

type MfaBaselineResult = {
  applicable: boolean;
  ok: boolean;
};

async function enforceMfaBaselineForLogin(request: Request, env: Cloudflare.Env): Promise<MfaBaselineResult> {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "POST" || url.pathname !== "/api/auth/login") {
    return { applicable: false, ok: true };
  }

  let body: any = null;
  try {
    body = await request.clone().json();
  } catch {
    return { applicable: false, ok: true };
  }
  const identity = text(body?.username || body?.email);
  if (!identity) return { applicable: false, ok: true };

  try {
    const row = await env.DB.prepare(
      `SELECT u.id,s.user_id AS security_user_id
         FROM auth_users u
         LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE LOWER(u.username)=LOWER(?) OR LOWER(COALESCE(s.email,''))=LOWER(?)
        LIMIT 1`,
    ).bind(identity, identity).first<any>();
    if (!row?.id) return { applicable: false, ok: true };
    if (!row?.security_user_id) throw new Error("AUTH_USER_SECURITY_ROW_MISSING");

    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE auth_user_security
          SET login_policy=CASE
                WHEN UPPER(COALESCE(login_policy,'')) IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
                  THEN UPPER(login_policy)
                ELSE 'ANY_MFA'
              END,
              session_seconds=36000,
              updated_at=?
        WHERE user_id=?`,
    ).bind(timestamp, row.id).run();

    const verified = await env.DB.prepare(
      `SELECT login_policy,session_seconds
         FROM auth_user_security
        WHERE user_id=?
        LIMIT 1`,
    ).bind(row.id).first<any>();
    const verifiedPolicy = upper(verified?.login_policy);
    if (!MFA_LOGIN_POLICIES.has(verifiedPolicy) || Number(verified?.session_seconds || 0) !== 36000) {
      throw new Error("AUTH_MFA_BASELINE_VERIFY_FAILED");
    }
    return { applicable: true, ok: true };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      phase: "GLOBAL_MFA_LOGIN_BASELINE",
      message: error instanceof Error ? error.message : String(error),
    }));
    return { applicable: true, ok: false };
  }
}

async function canonicalizeAdminWrite(request: Request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const isCompleteCreate = method === "POST" && path === "/api/admin/users/create-complete";
  const isPermissionWrite = method === "PUT" && /^\/api\/admin\/users\/[^/]+\/permissions$/.test(path);
  const isPolicyWrite = method === "PATCH" && /^\/api\/admin\/security\/users\/[^/]+\/policy$/.test(path);
  const isUserWrite = ["POST", "PATCH", "PUT"].includes(method) && (
    path === "/api/admin/users" ||
    path === "/api/admin/users/create-complete" ||
    /^\/api\/admin\/users\/[^/]+$/.test(path)
  );
  if (!isCompleteCreate && !isPermissionWrite && !isPolicyWrite && !isUserWrite) return request;

  let body: any;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return request;

  if (isUserWrite) {
    // Teknik rol kodları locale bağımsız ASCII canonical biçimde tutulur.
    if (body.role !== undefined && text(body.role)) body.role = upper(body.role);
    if (body.roleOverride !== undefined && text(body.roleOverride)) body.roleOverride = upper(body.roleOverride);
    if (body.role_override !== undefined && text(body.role_override)) body.role_override = upper(body.role_override);
  }

  if (isCompleteCreate) {
    // Forced-password-change akışı uygulamada yok. Çalışmayan bir bayrak üretmeyiz.
    body.mustChangePassword = false;
    // KY ERP'de parola tek başına giriş politikası değildir. Yeni kullanıcı MFA ile başlar.
    body.loginPolicy = normalizeMfaPolicy(body.loginPolicy);
    body.sessionSeconds = 36000;
  }

  if (isPolicyWrite) {
    // UI veya crafted API isteği PASSWORD_ONLY gönderse bile MFA aşağı çekilemez.
    body.loginPolicy = normalizeMfaPolicy(body.loginPolicy);
    body.sessionSeconds = 36000;
  }

  if (Array.isArray(body.permissions)) {
    // Modül anahtarları da locale bağımsız canonical biçime alınır.
    body.permissions = body.permissions
      .map((row: any) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return row;
        if (row.moduleKey !== undefined) return { ...row, moduleKey: upper(row.moduleKey) };
        if (row.module_key !== undefined) return { ...row, module_key: upper(row.module_key) };
        return row;
      })
      // Yönetim (ADMIN) modülü yalnız uygulama sahibinin rol tabanlı hakkıdır.
      // Normal kullanıcı/firma yöneticisi permission matrisi ile ADMIN kazanamaz.
      .filter((row: any) => upper(row?.moduleKey ?? row?.module_key) !== "ADMIN");
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.delete("Content-Length");
  return new Request(request, { headers, body: JSON.stringify(body) });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, executionCtx: ExecutionContext) {
    // Login güvenliği fail-closed: kayıtlı kullanıcı MFA tabanına güvenle yükseltilemez
    // veya yükseltme doğrulanamazsa parola doğrulama motoruna geçilmez.
    const mfaBaseline = await enforceMfaBaselineForLogin(request, env);
    if (mfaBaseline.applicable && !mfaBaseline.ok) {
      return securityErrorResponse(
        request,
        "AUTH_SECURITY_BASELINE_UNAVAILABLE",
        "Güvenli giriş politikası doğrulanamadı. Giriş kapatıldı; lütfen kısa süre sonra tekrar deneyin.",
        503,
      );
    }

    // Browser origin güvenliği main.ts içindeki explicit LIVE_ORIGINS + CORS allowlist
    // tarafından uygulanır. main-entry ikinci ve çelişkili bir domain blacklist tutmaz.
    const canonicalRequest = await canonicalizeAdminWrite(request);
    const response = await shell.fetch(canonicalRequest, env, executionCtx);
    return adminReadCompat(canonicalRequest, env, executionCtx, response);
  },
};