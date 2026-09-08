import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerAdminManagementRoutes } from "./admin-management-cloud";
import { registerOwnerSecurityRoutes } from "./owner-security-cloud";
import { registerAdminCoreRoutes } from "./admin-core-cloud";
import { registerAdminMappingRoutes } from "./admin-mappings-cloud";
import { registerAdminStorageRoutes } from "./admin-storage-cloud";
import { registerAdminBackupRoutes } from "./admin-backup-cloud";
import { registerAdminBackupSqlRoutes } from "./admin-backup-sql";
import { registerAdminBuildCenterRoutes } from "./admin-build-center-cloud";
import { registerAuthAdminHistoryRoutes } from "./auth-admin-history";
import { registerAuthRecoveryCodeFallbackRoutes } from "./auth-policy-recovery-code";
import { registerAuthOwnerGuardRoutes } from "./auth-policy-owner-guard";
import { registerAuthPolicyRoutes } from "./auth-policy-cloud";
import { registerAuthSessionRefreshRoutes } from "./auth-session-refresh";
import { registerAuthPushRoutes } from "./auth-push-cloud";
import { registerAccountingCompanyDirectoryRoutes } from "./accounting-company-directory";
import { registerAccountingCompanyProfileRoutes } from "./accounting-company-profile";
import { registerAccountingDocumentArchiveRoutes } from "./accounting-document-archive";
import { registerCanonicalDispatchControlRoutes } from "./accounting-dispatch-control-canonical";
import { registerEBelgeCenterRoutes } from "./e-belge-center-cloud";
import { registerEBelgeLineToolRoutes } from "./e-belge-line-tools";
import { enforceAccountingTenant } from "./accounting-tenant-guard";
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
import { registerIkPdksGuardRoutes } from "./ik-pdks-guard";
import { registerIkPersonnelControlRoutes } from "./ik-personnel-control";
import { registerIkPdksMasterRoutes } from "./ik-pdks-master";
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
import { enforceIsnetTenant } from "./isnet-tenant-guard";
import { registerProductionCenterRoutes } from "./production-center";
import { registerProductionRuntimeV2Routes } from "./production-runtime-v2";
import { registerNotificationRoutes } from "./notifications-cloud";
import { registerMailCommunicationRoutes } from "./mail-communication-core";
import { registerMicrosoftMailRoutes } from "./mail-microsoft-graph";
import { ensureMailCommunicationCore0050 } from "./runtime-migration-0050";

type ShellEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

type AnyRow = Record<string, any>;

const AUTH_VERSION = "canonical-v3";
const PASSWORD_SESSION_SECONDS = 0;
const MFA_SESSION_SECONDS = 36_000;
const OWNER_ROLLING_SESSION_SECONDS = 0;

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
  const value = String(role || "").trim().toUpperCase().replace(/İ/g, "I");
  return value === "SUPER_ADMIN" || value === "ADMIN";
}

function auditRole(role: unknown) {
  return String(role || "").trim().toUpperCase().replace(/İ/g, "I") === "DENETIM";
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
  return rows.filter((row: AnyRow) => String(row?.moduleKey || row?.module_key || "").trim().toUpperCase().replace(/İ/g, "I") !== "ADMIN");
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
registerAccountingDocumentArchiveRoutes(app);
registerEBelgeCenterRoutes(app);
registerEBelgeLineToolRoutes(app);
registerAiCloudRoutes(app);
registerProductionRuntimeV2Routes(app);
registerProductionCenterRoutes(app);
registerNotificationRoutes(app);
registerMailCommunicationRoutes(app);
registerMicrosoftMailRoutes(app);
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
registerIkPdksGuardRoutes(app);
registerIkPersonnelControlRoutes(app);
registerIkPdksMasterRoutes(app);
registerIkRelationalCloudRoutes(app);
registerAuthAdminHistoryRoutes(app);
registerAdminManagementRoutes(app);
registerOwnerSecurityRoutes(app);
registerAdminCoreRoutes(app);
registerAdminMappingRoutes(app);
registerAdminStorageRoutes(app);
registerAdminBackupRoutes(app);
registerAdminBackupSqlRoutes(app);
registerAdminBuildCenterRoutes(app);
// ik-admin-cloud contains the legacy /api/admin/* fallback. Hono resolves
// matching handlers in registration order, so this fallback must stay after
// every canonical admin route or it will shadow them with JSON-store records.
registerIkAdminCloudRoutes(app);

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
    allowHeaders: ["Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device", "X-KYERP-Push-Device", "X-KYERP-Push-Token", "X-KYERP-Build-Agent-Token", "X-KYERP-Build-Agent-Id", "X-KYERP-Build-Agent"],
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
  const isPublic = path === "/api/health" || path === "/api/system/status" || path.startsWith("/api/auth/") || path.startsWith("/api/build-agent/");
  if (isLocal || isPublic) return next();

  const authenticated = await getAuthenticatedUser(c);
  if (!authenticated) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum geçersiz, iptal edilmiş veya güvenlik politikasındaki süresi dolmuş. Yeniden giriş yapın." } }, 401);
  }

  if (auditRole(authenticated.role)) {
    const method = String(c.req.method || "GET").toUpperCase();
    const pdksRead = path.startsWith("/api/ik/personnel-control/") && ["GET", "HEAD"].includes(method);
    if (!path.startsWith("/api/ik/audit/") && !pdksRead) {
      return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint bulunamadı." } }, 404);
    }
    if (!["GET", "HEAD"].includes(method)) {
      return c.json({ ok: false, error: { code: "READ_ONLY", message: "Denetim hesabı yalnız SGK'lı kart personelinin PDKS görünümünü okuyabilir." } }, 403);
    }
  }

  await next();
});

// Mail Core şeması request sırasında yazılmaz. 0050/0051 yalnız yedekli ve hedefli
// production migration kapısından uygulanır; eksik şema burada fail-closed 503 döner.
shell.use("/api/mail/*", async (c, next) => {
  try {
    await ensureMailCommunicationCore0050(c.env.DB);
  } catch (error) {
    return c.json({ ok:false, error:{ code:"MAIL_SCHEMA_NOT_READY", message:"Mail veritabanı şeması hazır değil. 0050/0051 migrationları yedekli ve hedefli olarak uygulanmalıdır.", details:error instanceof Error ? error.message : String(error) } }, 503);
  }
  await next();
});

// İşNet tek bir sağlayıcı modülü olabilir ancak tenant verisi global değildir.
// Her İşNet isteği açık ana firma bağlamı taşır; non-owner kullanıcı başka tenant'a geçemez.
shell.use("/api/isnet/*", enforceIsnetTenant);

// e-Belge Merkezi, Muhasebe yetkisi ve oturumun tenant bağlamı dışında erişilemez.
shell.use("/api/e-belge/*", enforceAccountingTenant);

// Müşteri irsaliye/fatura kontrolü canonical Muhasebe verisini kullanır ve aynı tenant/yetki kilidine tabidir.
shell.use("/api/muhasebe/customer-dispatches*", enforceAccountingTenant);
registerCanonicalDispatchControlRoutes(shell);

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

// Legacy direct MFA reset is intentionally disabled. A valid application session
// is not sufficient to replace an Authenticator secret. The secure flow requires
// password or verified-email step-up, then a new QR and a valid TOTP confirmation.
shell.use("/api/admin/security/users/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const legacyReset = c.req.method.toUpperCase() === "POST" && /^\/api\/admin\/security\/users\/[^/]+\/reset-mfa(?:\/[^/]+)?$/i.test(path);
  if (legacyReset) {
    return c.json({ ok: false, error: { code: "MFA_REAUTH_REQUIRED", message: "Authenticator yenileme için önce şifre veya doğrulanmış e-posta ile yeniden kimlik doğrulaması gerekir." } }, 409);
  }
  await next();
});

shell.get("/api/auth/status", (c) => c.json({
  ok: true,
  authVersion: AUTH_VERSION,
  transport: "canonical",
  endpoints: {
    login: "/api/auth/login",
    mfaVerify: "/api/auth/mfa/verify",
    phoneApprovalStatus: "/api/auth/phone-approval/:id/status",
    phoneApprovalFallback: "/api/auth/phone-approval/:id/fallback",
    pushConfig: "/api/auth/push/config",
    me: "/api/auth/me",
    refresh: "/api/auth/refresh",
    logout: "/api/auth/logout",
  },
  sessionPolicy: {
    passwordOnlyEnabled: false,
    passwordOnlySeconds: PASSWORD_SESSION_SECONDS,
    mfaSeconds: MFA_SESSION_SECONDS,
    ownerRollingSeconds: OWNER_ROLLING_SESSION_SECONDS,
    ownerPersistentBrowserSession: false,
    ownerAutomaticRefresh: false,
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
registerAuthPushRoutes(shell);
registerAuthPolicyRoutes(shell);
shell.route("/", app);

shell.onError((error, c) => {
  const requestId = c.get("requestId") || crypto.randomUUID();
  console.error(JSON.stringify({ level: "error", requestId, method: c.req.method, path: c.req.path, message: error instanceof Error ? error.message : String(error) }));
  return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Beklenmeyen bir sunucu hatası oluştu.", requestId } }, 500);
});

export default shell;
