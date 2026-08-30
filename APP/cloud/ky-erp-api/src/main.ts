import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerAdminManagementRoutes } from "./admin-management-cloud";
import { registerAdminCoreRoutes } from "./admin-core-cloud";
import { registerAdminMappingRoutes } from "./admin-mappings-cloud";
import { registerAdminStorageRoutes } from "./admin-storage-cloud";
import { registerAdminBackupRoutes } from "./admin-backup-cloud";
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
import { registerIsnetRuntimeV2Routes } from "./isnet-runtime-v2";
import { registerIsnetCloudRoutes } from "./isnet-cloud";
import { registerIsnetIntakeCompatRoutes } from "./isnet-intake-compat";
import { registerProductionCenterRoutes } from "./production-center";
import { registerProductionRuntimeV2Routes } from "./production-runtime-v2";

type ShellEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

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

  const auditRole = String(authenticated.role || "").toUpperCase() === "DENETIM";
  if (auditRole) {
    const method = String(c.req.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      return c.json({ ok: false, error: { code: "READ_ONLY", message: "Bu hesap yalnız görüntüleme yetkisine sahiptir." } }, 403);
    }
    if (path.startsWith("/api/ik/") && !path.startsWith("/api/ik/audit/")) {
      return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint bulunamadı." } }, 404);
    }
  }

  await next();
});

shell.use("/api/auth/*", async (c, next) => {
  c.header("X-KYERP-Auth-Version", AUTH_VERSION);
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  await next();
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
  return c.json({ ok: true, authVersion: AUTH_VERSION, user, session: { id: session.id, expiresAt: session.expires_at, lastSeenAt: session.last_seen_at } });
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
