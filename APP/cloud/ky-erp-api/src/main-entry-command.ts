// @ts-nocheck
import { Hono } from "hono";
import { cors } from "hono/cors";
import base from "./main-entry-security";
import { registerErpCommandGatewayRoutes } from "./erp-command-gateway";

type Env = { Bindings: Cloudflare.Env; Variables: { requestId: string } };

const LIVE_ORIGINS = new Set(["https://kyerp.net", "https://www.kyerp.net", "https://app.kyerp.net"]);
const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PREVIEW = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;
const allowedOrigin = (origin: string) => LIVE_ORIGINS.has(origin) || LOCAL.test(origin) || PREVIEW.test(origin) ? origin : undefined;

const command = new Hono<Env>();
command.use("/api/ai/command/*", async (c, next) => {
  if (!c.get("requestId")) c.set("requestId", crypto.randomUUID());
  await next();
});
command.use("/api/ai/command/*", cors({
  origin: allowedOrigin,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  allowHeaders: ["Accept", "Authorization", "Content-Type"],
  exposeHeaders: ["Content-Length", "Content-Type", "ETag", "X-Request-Id"],
  maxAge: 86400,
  credentials: true,
}));
registerErpCommandGatewayRoutes(command);
command.onError((error, c) => {
  const requestId = String(c.get("requestId") || crypto.randomUUID());
  console.error(JSON.stringify({ code: "ERP_COMMAND_GATEWAY_FAILED", requestId, message: error instanceof Error ? error.message : String(error) }));
  return c.json({ ok: false, error: { code: "ERP_COMMAND_GATEWAY_FAILED", message: "KY ERP Komut Merkezi isteği tamamlanamadı.", requestId } }, 500);
});

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === "/api/ai/command" || path.startsWith("/api/ai/command/")) {
      return command.fetch(request, env, ctx);
    }
    return base.fetch(request, env, ctx);
  },
};
