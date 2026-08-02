import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { registerBoyahaneColorIdentityRoutes } from "./boyahane-color-identity";
import { registerBoyahaneExcelImportRoutes } from "./boyahane-excel-import-runtime";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneManualJobRoutes } from "./boyahane-manual-job";
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

// Önce ortak üretim ve stok kaynakları, ardından bu kaynakları kullanan iş akışları bağlanır.
registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneExcelImportRoutes(app);
registerBoyahaneManualJobRoutes(app);
registerBoyahaneSampleRoutes(app);
// Kayıtlı renk kimliği rotaları genel workflow rotalarından önce bağlanır.
registerBoyahaneColorIdentityRoutes(app);
registerBoyahaneWorkflowRoutes(app);
registerDesenStorageRoutes(app);
registerDesenWorkflowRoutes(app);
registerDesenOperationRoutes(app);

// İşNet intake uyumluluğu ana İşNet rotalarından önce bağlanır; aynı belgenin
// işlem kimliği tüm sonraki model ve fatura adımlarında değişmeden korunur.
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
