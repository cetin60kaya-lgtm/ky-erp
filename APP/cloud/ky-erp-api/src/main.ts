import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerAdminManagementRoutes } from "./admin-management-cloud";
import { registerAdminCoreRoutes } from "./admin-core-cloud";
import { registerAdminMappingRoutes } from "./admin-mappings-cloud";
import { registerAdminStorageRoutes } from "./admin-storage-cloud";
import { registerAdminBackupRoutes } from "./admin-backup-cloud";
import { registerAdminBackupSqlRoutes } from "./admin-backup-sql";
import { registerAuthAdminHistoryRoutes } from "./auth-admin-history";
import { registerAuthRecoveryCodeFallbackRoutes } from "./auth-policy-recovery-code";
import { registerAuthOwnerGuardRoutes } from "./auth-policy-owner-guard";
import { registerAuthPolicyRoutes } from "./auth-policy-cloud";
import { registerAuthSessionRefreshRoutes } from "./auth-session-refresh";
import { registerAccountingCompanyDirectoryRoutes } from "./accounting-company-directory";
import { registerAccountingCompanyProfileRoutes } from "./accounting-company-profile";
import { registerAiCloudRoutes } from "./ai-cloud";
import { registerBoyahaneColorAssistantRoutes } from "./boyahane-color-assistant";
import { registerBoyahaneColorIdentityRoutes } from "./boyahane-color-identity";
import { registerBoyahaneColorJobRoutes } from "./boyahane-color-job";
import { registerBoyahaneColorResolveRoutes } from "./boyahane-color-resolve";
import { registerBoyahaneExcelImportRoutes } from "./boyahane-excel-import-runtime";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneJobIntegrityRoutes } from "./boyahane-job-integrity";
import { registerBoyahaneManualJobRoutes } from "./boyahane-manual-job";
import { registerBoyahaneManualJobV2Routes } from "./boyahane-manual-job-v2";
import { registerBoyahaneSampleRoutes } from "./boyahane-sample";
import { registerBoyahaneWorkflowRoutes } from "./boyahane-workflow";
import { registerDesenBridgeRoutes } from "./desen-bridge";
import { registerDesenOperationRoutes } from "./desen-operations";
import { registerDesenStorageRoutes } from "./desen-storage";
import { registerDesenWorkflowRoutes } from "./desen-workflow";
import { registerDesenVisualSearchRoutes } from "./desen-visual-search";
import { registerIkAuditReadonlyRoutes } from "./ik-audit-readonly";
import { registerIkPersonnelControlRoutes } from "./ik-personnel-control";
import { registerIkRelationalCloudRoutes } from "./ik-relational-cloud";
import { registerIkAdminCloudRoutes } from "./ik-admin-cloud";
import { registerIsnetBusinessSettingsCloudRoutes } from "./isnet-business-settings-cloud";
import { registerIsnetFileRuntimeRoutes } from "./isnet-file-runtime";
import { registerIsnetInvoiceRuntimeRoutes } from "./isnet-invoice-runtime";
import { registerIsnetLiveSyncRoutes } from "./isnet-live-sync";
import { registerIsnetOutgoingRecoveryRoutes } from "./isnet-outgoing-recovery";
import { registerIsnetRuntimeV2Routes } from "./isnet-runtime-v2";
import { registerIsnetCloudRoutes } from "./isnet-cloud";
import { registerIsnetIntakeCompatRoutes } from "./isnet-intake-compat";
import { registerProductionCenterRoutes } from "./production-center";
import { registerProductionRuntimeV2Routes } from "./production-runtime-v2";

type ShellEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

type AnyRow = Record<string, any>;

const AUTH_VERSION = "canonical-v3";
const PASSWORD_SESSION_SECONDS = 28_800;
const MFA_SESSION_SECONDS = 36_000;
const OWNER_ROLLING_SESSION_SECONDS = 86_400;

const LIVE_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PAGES_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;

function allowedOrigin(origin: string) {
  if (LIVE_ORIGINS.has(origin)) return origin;
  if (LOCAL_DEV_ORIGIN.test(origin)) return origin;
  if (PAGES_PREVIEW_ORIGIN.test(origin)) return origin;
  return undefined;
}

function ownerRole(role: unknown) {
  const value = String(role || "").trim().toUpperCase();
  return value === "SUPER_ADMIN" || value === "ADMIN";
}

function auditRole(role: unknown) {
  return String(role || "").trim().toUpperCase() === "DENETIM";
}

function auditPermissionRows() {
  return [{
    moduleKey: "IK",
    canView: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
  }];
}

function stripSystemAdminPermission(rows: unknown) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter((row: AnyRow) => String(row?.moduleKey || row?.module_key || "").trim().toUpperCase() !== "ADMIN");
}

function sanitizeNonOwnerUser(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const user = value as AnyRow;
  if (ownerRole(user.role)) return user;
  if (auditRole(user.role)) return { ...user, permissions: auditPermissionRows() };
  return { ...user, permissions: stripSystemAdminPermission(user.permissions) };
}

function sanitizeAuthPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const result = { ...(payload as AnyRow) };
  if (result.user) result.user = sanitizeNonOwnerUser(result.user);
  const responseRole = result.user?.role || result.data?.user?.role;
  if (Array.isArray(result.permissions)) {
    result.permissions = auditRole(responseRole)
      ? auditPermissionRows()
      : ownerRole(responseRole)
        ? result.permissions
        : stripSystemAdminPermission(result.permissions);
  }
  if (result.data && typeof result.data === "object" && !Array.isArray(result.data) && result.data.user) {
    result.data = { ...result.data, user: sanitizeNonOwnerUser(result.data.user) };
  }
  return result;
}

async function rewriteJsonResponse(c: any, transform: (payload: unknown) => unknown) {
  const response = c.res;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return;
  let payload: unknown;
  try { payload = await response.clone().json(); }
  catch { return; }
  const nextPayload = transform(payload);
  if (nextPayload === payload) return;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  c.res = new Response(JSON.stringify(nextPayload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function targetRole(c: any, userId: string): Promise<AnyRow | null> {
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(NULLIF(TRIM(s.role_override),''),u.role,'VIEWER') AS role
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(userId).first();
  return (row as AnyRow | null) || null;
}

registerAccountingCompanyDirectoryRoutes(app);
registerAccountingCompanyProfileRoutes(app);
registerAiCloudRoutes(app);
registerProductionRuntimeV2Routes(app);
registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneExcelImportRoutes(app);
registerBoyahaneManualJobV2Routes(app);
registerBoyahaneManualJobRoutes(app);
registerBoyahaneSampleRoutes(app);
registerBoyahaneColorResolveRoutes(app);
registerBoyahaneColorIdentityRoutes(app);
registerBoyahaneColorAssistantRoutes(app);
registerBoyahaneColorJobRoutes(app);
registerBoyahaneJobIntegrityRoutes(app);
registerBoyahaneWorkflowRoutes(app);
registerDesenStorageRoutes(app);
registerDesenBridgeRoutes(app);
registerDesenVisualSearchRoutes(app);
registerDesenWorkflowRoutes(app);
registerDesenOperationRoutes(app);
registerIsnetBusinessSettingsCloudRoutes(app);
registerIsnetLiveSyncRoutes(app);
registerIsnetOutgoingRecoveryRoutes(app);
registerIsnetFileRuntimeRoutes(app);
registerIsnetInvoiceRuntimeRoutes(app);
registerIsnetRuntimeV2Routes(app);
registerIsnetIntakeCompatRoutes(app);
registerIsnetCloudRoutes(app);
registerIkAuditReadonlyRoutes(app);
registerIkPersonnelControlRoutes(app);
registerIkRelationalCloudRoutes(app);
registerIkAdminCloudRoutes(app);
registerAuthAdminHistoryRoutes(app);
registerAdminManagementRoutes(app);
registerAdminCoreRoutes(app);
registerAdminMappingRoutes(app);
registerAdminStorageRoutes(app);
registerAdminBackupRoutes(app);
registerAdminBackupSqlRoutes(app);

const shell = new Hono<ShellEnv>();

shell.use("/api/*", async (c, next) => {
  c.set("requestId", c.get("requestId") || crypto.randomUUID());
  c.header("X-Request-Id", c.get("requestId"));
  await next();
});

shell.use(
  "/api/*",
  cors({
    origin: allowedOrigin,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allowHeaders: ["Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag", "X-Request-Id", "X-KYERP-Auth-Version"],
    maxAge: 86400,
    credentials: true,
  }),
);

shell.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();

  const url = new URL(c.req.url);
  const path = url.pathname;
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isPublic = path === "/api/health" || path === "/api/system/status" || path.startsWith("/api/auth/");
  if (isLocal || isPublic) return next();

  const authenticated = await getAuthenticatedUser(c);
  if (!authenticated) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum geçersiz, iptal edilmiş veya güvenlik politikasındaki süresi dolmuş. Yeniden giriş yapın." } }, 401);
  }

  if (auditRole(authenticated.role)) {
    const method = String(c.req.method || "GET").toUpperCase();
    if (!path.startsWith("/api/ik/audit/")) {
      return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint bulunamadı." } }, 404);
    }
    if (!["GET", "HEAD"].includes(method)) {
      return c.json({ ok: false, error: { code: "READ_ONLY", message: "Denetim hesabı yalnız SGK'lı kart personelinin PDKS görünümünü okuyabilir." } }, 403);
    }
  }

  await next();
});

// Sistem Yönetimi yalnız uygulama sahibidir. Eski bir kullanıcı kaydında ADMIN
// izni kalmış olsa bile auth cevabından normal/firma yöneticisine taşınmaz.
// DENETIM ise daha da dardır: auth cevabında her zaman yalnız IK/Goruntuleme gelir.
shell.use("/api/auth/*", async (c, next) => {
  c.header("X-KYERP-Auth-Version", AUTH_VERSION);
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  await next();
  await rewriteJsonResponse(c, sanitizeAuthPayload);
});

// Kullanıcı yetki ekranında owner olmayan hesaba ADMIN izni kalıcılaştırılmaz.
// DENETIM hedefinde eski/geniş izinler de temizlenir; yalnız IK görüntüleme sabit kalır.
shell.use("/api/admin/users/*", async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  const match = path.match(/^\/api\/admin\/users\/([^/]+)\/permissions$/i);
  if (!match) return;
  const userId = decodeURIComponent(match[1]);
  const row = await targetRole(c, userId);
  if (!row || ownerRole(row.role)) return;

  const isAuditTarget = auditRole(row.role);
  if (c.req.method.toUpperCase() === "PUT" && c.res.status >= 200 && c.res.status < 300) {
    try {
      const timestamp = new Date().toISOString();
      if (isAuditTarget) {
        await c.env.DB.prepare(
          `DELETE FROM auth_user_module_permissions
            WHERE user_id=? AND UPPER(module_key)<>'IK'`,
        ).bind(userId).run();
        await c.env.DB.prepare(
          `UPDATE auth_user_module_permissions
              SET can_view=1,can_create=0,can_update=0,can_delete=0,can_approve=0,updated_at=?
            WHERE user_id=? AND UPPER(module_key)='IK'`,
        ).bind(timestamp, userId).run();
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO auth_user_module_permissions
           (id,user_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).bind(crypto.randomUUID(), userId, "IK", 1, 0, 0, 0, 0, timestamp, timestamp).run();
      } else {
        await c.env.DB.prepare(
          `UPDATE auth_user_module_permissions
              SET can_view=0,can_create=0,can_update=0,can_delete=0,can_approve=0,updated_at=?
            WHERE user_id=? AND UPPER(module_key)='ADMIN'`,
        ).bind(timestamp, userId).run();
      }
    } catch {
      // Auth cevabi yine rol bazli filtrelidir; cleanup hatasi ana islemi bozmaz.
    }
  }

  await rewriteJsonResponse(c, (payload) => {
    if (isAuditTarget) {
      const fixed = auditPermissionRows();
      if (Array.isArray(payload)) return fixed;
      if (!payload || typeof payload !== "object") return payload;
      const nextPayload = { ...(payload as AnyRow) };
      if (Array.isArray(nextPayload.data)) nextPayload.data = fixed;
      if (Array.isArray(nextPayload.permissions)) nextPayload.permissions = fixed;
      return nextPayload;
    }
    if (Array.isArray(payload)) return stripSystemAdminPermission(payload);
    if (!payload || typeof payload !== "object") return payload;
    const nextPayload = { ...(payload as AnyRow) };
    if (Array.isArray(nextPayload.data)) nextPayload.data = stripSystemAdminPermission(nextPayload.data);
    if (Array.isArray(nextPayload.permissions)) nextPayload.permissions = stripSystemAdminPermission(nextPayload.permissions);
    return nextPayload;
  });
});

shell.get("/api/auth/status", (c) => c.json({
  ok: true,
  authVersion: AUTH_VERSION,
  transport: "canonical",
  endpoints: {
    login: "/api/auth/login",
    mfaVerify: "/api/auth/mfa/verify",
    me: "/api/auth/me",
    refresh: "/api/auth/refresh",
    logout: "/api/auth/logout",
  },
  sessionPolicy: {
    passwordOnlySeconds: PASSWORD_SESSION_SECONDS,
    mfaSeconds: MFA_SESSION_SECONDS,
    ownerRollingSeconds: OWNER_ROLLING_SESSION_SECONDS,
  },
}));

shell.get("/api/auth/me", async (c) => {
  const current = await getAuthenticatedUser(c);
  if (!current) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum geçersiz, iptal edilmiş veya süresi dolmuş. Yeniden giriş yapın." } }, 401);
  }
  const { security, session, ...user } = current as any;
  void security;
  return c.json({ ok: true, authVersion: AUTH_VERSION, user: sanitizeNonOwnerUser(user), session: { id: session.id, expiresAt: session.expires_at, lastSeenAt: session.last_seen_at } });
});

registerAuthRecoveryCodeFallbackRoutes(shell);
registerAuthOwnerGuardRoutes(shell);
registerAuthSessionRefreshRoutes(shell);
registerAuthPolicyRoutes(shell);
shell.route("/", app);

shell.onError((error, c) => {
  const requestId = c.get("requestId") || crypto.randomUUID();
  console.error(JSON.stringify({ level: "error", requestId, method: c.req.method, path: c.req.path, message: error instanceof Error ? error.message : String(error) }));
  return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Beklenmeyen bir sunucu hatası oluştu.", requestId } }, 500);
});

export default shell;