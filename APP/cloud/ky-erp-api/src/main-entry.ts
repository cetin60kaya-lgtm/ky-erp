// @ts-nocheck
import shell from "./main";

const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";
const COMPAT_PATHS = new Set([
  "/api/admin/main-companies",
  "/api/admin/security/audit-log",
  "/api/admin/security/delivery-capabilities",
]);
const MFA_LOGIN_POLICIES = new Set(["GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"]);

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

async function enforceMfaBaselineForLogin(request: Request, env: Cloudflare.Env) {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "POST" || url.pathname !== "/api/auth/login") return;

  let body: any = null;
  try {
    body = await request.clone().json();
  } catch {
    return;
  }
  const identity = text(body?.username || body?.email);
  if (!identity) return;

  try {
    const row = await env.DB.prepare(
      `SELECT u.id
         FROM auth_users u
         LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE LOWER(u.username)=LOWER(?) OR LOWER(COALESCE(s.email,''))=LOWER(?)
        LIMIT 1`,
    ).bind(identity, identity).first<any>();
    if (!row?.id) return;

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
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      phase: "GLOBAL_MFA_LOGIN_BASELINE",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function canonicalizeAdminWrite(request: Request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isCompleteCreate = method === "POST" && url.pathname === "/api/admin/users/create-complete";
  const isPermissionWrite = method === "PUT" && /^\/api\/admin\/users\/[^/]+\/permissions$/.test(url.pathname);
  const isPolicyWrite = method === "PATCH" && /^\/api\/admin\/security\/users\/[^/]+\/policy$/.test(url.pathname);
  if (!isCompleteCreate && !isPermissionWrite && !isPolicyWrite) return request;

  let body: any;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return request;

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
    // Yönetim (ADMIN) modülü yalnız uygulama sahibinin rol tabanlı hakkıdır.
    // Normal kullanıcı/firma yöneticisi permission matrisi ile ADMIN kazanamaz.
    body.permissions = body.permissions.filter((row: any) => upper(row?.moduleKey ?? row?.module_key) !== "ADMIN");
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.delete("Content-Length");
  return new Request(request, { headers, body: JSON.stringify(body) });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, executionCtx: ExecutionContext) {
    // Eski PASSWORD_ONLY kullanıcıları login anında MFA tabanına yükseltilir.
    // Bu işlem parola doğrulamasını geçmez; yalnız güvenlik politikasını kuvvetlendirir.
    await enforceMfaBaselineForLogin(request, env);

    // Browser origin güvenliği main.ts içindeki explicit LIVE_ORIGINS + CORS allowlist
    // tarafından uygulanır. main-entry ikinci ve çelişkili bir domain blacklist tutmaz.
    const canonicalRequest = await canonicalizeAdminWrite(request);
    const response = await shell.fetch(canonicalRequest, env, executionCtx);
    return adminReadCompat(canonicalRequest, env, executionCtx, response);
  },
};