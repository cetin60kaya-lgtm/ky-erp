import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
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
import { registerDesenOperationRoutes } from "./desen-operations";
import { registerDesenStorageRoutes } from "./desen-storage";
import { registerDesenWorkflowRoutes } from "./desen-workflow";
import { registerIkAdminCloudRoutes } from "./ik-admin-cloud";
import { registerIsnetCloudRoutes } from "./isnet-cloud";
import { registerIsnetIntakeCompatRoutes } from "./isnet-intake-compat";
import { registerProductionCenterRoutes } from "./production-center";

type ShellEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

const LIVE_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

function allowedOrigin(origin: string) {
  if (LIVE_ORIGINS.has(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i.test(origin)) {
    return origin;
  }
  return undefined;
}

registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneExcelImportRoutes(app);
registerBoyahaneManualJobV2Routes(app);
registerBoyahaneManualJobRoutes(app);
registerBoyahaneSampleRoutes(app);
registerBoyahaneColorResolveRoutes(app);
registerBoyahaneColorIdentityRoutes(app);
registerBoyahaneColorJobRoutes(app);
// Reçetesi olmayan renk tamamlandı sayılmaz; genel workflow GET rotalarından önce çalışır.
registerBoyahaneJobIntegrityRoutes(app);
registerBoyahaneWorkflowRoutes(app);
registerDesenStorageRoutes(app);
registerDesenWorkflowRoutes(app);
registerDesenOperationRoutes(app);

registerIsnetIntakeCompatRoutes(app);
registerIsnetCloudRoutes(app);
registerIkAdminCloudRoutes(app);

const shell = new Hono<ShellEnv>();

shell.use(
  "/api/*",
  cors({
    origin: allowedOrigin,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allowHeaders: ["Accept", "Authorization", "Content-Type"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

shell.route("/", app);

export default shell;
