// @ts-nocheck
import { Hono } from "hono";
import { cors } from "hono/cors";
import base from "./main-entry-mail";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerSecurityCenterRoutes } from "./security-center-cloud";
import { registerSecurityCenterLoginRoutes } from "./security-center-login-cloud";
import { requireOwnerSecurityApp } from "./owner-security-device-guard";

type Env = { Bindings: Cloudflare.Env };

const LIVE_ORIGINS = new Set(["https://kyerp.net", "https://www.kyerp.net", "https://app.kyerp.net"]);
const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PREVIEW = /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;
const allowedOrigin = (origin: string) => LIVE_ORIGINS.has(origin) || LOCAL.test(origin) || PREVIEW.test(origin) ? origin : undefined;
const roleCode = (value: unknown) => String(value || "").trim().toUpperCase().replace(/İ/g, "I");

const security = new Hono<Env>();
security.use("/api/security-center/*", cors({
  origin: allowedOrigin,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  allowHeaders: [
    "Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device",
    "X-KYERP-Owner-App", "X-KYERP-Push-Device", "X-KYERP-Push-Token",
    "X-KYERP-Security-Timestamp", "X-KYERP-Security-Signature",
  ],
  exposeHeaders: ["Content-Length", "Content-Type", "ETag", "X-Request-Id"],
  maxAge: 86400,
  credentials: true,
}));

// Owner Security PWA, normal Security Center'dan farklı olarak iki bağımsız kanıt ister:
// 1) asıl Süper Yönetici bearer oturumu, 2) aynı hesaba bağlı KY Güvenlik cihazının P-256 imzası.
security.use("/api/security-center/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  if (String(c.req.header("X-KYERP-Owner-App") || "") !== "1") return next();
  const gate = await requireOwnerSecurityApp(c);
  if (!gate.ok) return gate.response;
  return next();
});

// main.ts içindeki DENETIM fail-closed sınırı security wrapper tarafından bypass edilmemeli.
// DENETIM yalnız İK audit/PDKS read-only rotalarını görebilir; Güvenlik Merkezi görünmez.
security.use("/api/security-center/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const current = await getAuthenticatedUser(c);
  if (current && roleCode(current.role) === "DENETIM") {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint bulunamadı." } }, 404);
  }
  return next();
});

registerSecurityCenterRoutes(security);
registerSecurityCenterLoginRoutes(security);
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
