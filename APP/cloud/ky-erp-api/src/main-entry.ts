// @ts-nocheck
import shell from "./main";

const CANONICAL_PUBLIC_ORIGIN = "https://kyerp.net";
const BLOCKED_LEGACY_ORIGINS = new Set([
  "https://app.kyerp.net",
  "https://www.kyerp.net",
]);

function jsonError(code: string, message: string) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status: 403,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-KYERP-Public-Origin": CANONICAL_PUBLIC_ORIGIN,
    },
  });
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, executionCtx: ExecutionContext) {
    const origin = String(request.headers.get("Origin") || "").trim().toLowerCase();
    if (BLOCKED_LEGACY_ORIGINS.has(origin)) {
      return jsonError(
        "LEGACY_FRONTEND_ORIGIN_BLOCKED",
        "KY ERP kullanıcı uygulamasının tek canlı adresi https://kyerp.net/ adresidir.",
      );
    }
    return shell.fetch(request, env, executionCtx);
  },
};
