import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerAuthRecoveryCodeFallbackRoutes } from "./auth-policy-recovery-code";
import { registerAuthOwnerGuardRoutes } from "./auth-policy-owner-guard";
import { registerAuthPolicyRoutes } from "./auth-policy-cloud";
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

const LIVE_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const LOCAL_DEV_ORIGIN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PAGES_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;

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
registerIkPersonnelControlRoutes(app);
// Günlük personel roster'ı açık seçimdir. Boş tarih aralığı tüm aktif havuza dönüşmez;
// yalnız kaydedilmiş roster + gerçekten çalışılmış personel korunur.
registerIkRelationalCloudRoutes(app);
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
    allowMethods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ],
    allowHeaders: ["Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

shell.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();

  const url = new URL(c.req.url);
  const path = url.pathname;
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isPublic =
    path === "/api/health" ||
    path === "/api/system/status" ||
    path.startsWith("/api/auth/");

  if (isLocal || isPublic) return next();

  const authenticated = await getAuthenticatedUser(c);
  if (!authenticated) {
    if (c.req.method === "GET" && path === "/api/boyahane/registered-colors") {
      return c.json({ ok: true, success: true, data: [], protected: true, authRequired: true });
    }
    return c.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Oturum geçersiz, iptal edilmiş veya güvenlik politikasındaki süresi dolmuş. Yeniden giriş yapın.",
        },
      },
      401,
    );
  }

  await next();
});

registerAuthRecoveryCodeFallbackRoutes(shell);
registerAuthOwnerGuardRoutes(shell);
registerAuthPolicyRoutes(shell);
shell.route("/", app);

shell.onError((error, c) => {
  const requestId = c.get("requestId") || crypto.randomUUID();
  console.error(JSON.stringify({
    level: "error",
    requestId,
    method: c.req.method,
    path: c.req.path,
    message: error instanceof Error ? error.message : String(error),
  }));
  return c.json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Beklenmeyen bir sunucu hatası oluştu.",
      requestId,
    },
  }, 500);
});

export default shell;
