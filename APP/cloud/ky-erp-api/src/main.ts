import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneWorkflowRoutes } from "./boyahane-workflow";
import { registerDesenOperationRoutes } from "./desen-operations";
import { registerDesenStorageRoutes } from "./desen-storage";
import { registerDesenWorkflowRoutes } from "./desen-workflow";
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
registerBoyahaneWorkflowRoutes(app);
registerDesenStorageRoutes(app);
registerDesenWorkflowRoutes(app);
registerDesenOperationRoutes(app);

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
