// @ts-nocheck
import { Hono } from "hono";
import { cors } from "hono/cors";
import base from "./main-entry-mail";
import { registerSecurityCenterRoutes } from "./security-center-cloud";

type Env = { Bindings: Cloudflare.Env };

const LIVE_ORIGINS = new Set(["https://kyerp.net", "https://www.kyerp.net", "https://app.kyerp.net"]);
const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PREVIEW = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;
const allowedOrigin = (origin: string) => LIVE_ORIGINS.has(origin) || LOCAL.test(origin) || PREVIEW.test(origin) ? origin : undefined;

const security = new Hono<Env>();
security.use("/api/security-center/*", cors({
  origin: allowedOrigin,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  allowHeaders: ["Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device"],
  exposeHeaders: ["Content-Length", "Content-Type", "ETag", "X-Request-Id"],
  maxAge: 86400,
  credentials: true,
}));
registerSecurityCenterRoutes(security);
security.onError((error, c) => {
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ code: "SECURITY_CENTER_REQUEST_FAILED", requestId, message: error instanceof Error ? error.message : String(error) }));
  return c.json({ ok: false, error: { code: "SECURITY_CENTER_REQUEST_FAILED", message: "Güvenlik Merkezi işlemi tamamlanamadı.", requestId } }, 500);
});

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === "/api/security-center" || path.startsWith("/api/security-center/")) {
      return security.fetch(request, env, ctx);
    }
    return base.fetch(request, env, ctx);
  },
};
