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

function upper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

async function canonicalizeAdminWrite(request: Request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isCompleteCreate = method === "POST" && url.pathname === "/api/admin/users/create-complete";
  const isPermissionWrite = method === "PUT" && /^\/api\/admin\/users\/[^/]+\/permissions$/.test(url.pathname);
  if (!isCompleteCreate && !isPermissionWrite) return request;

  let body: any;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return request;

  if (isCompleteCreate) {
    // Forced-password-change akışı uygulamada yok. Çalışmayan bir bayrak üretmeyiz.
    body.mustChangePassword = false;
  }

  if (Array.isArray(body.permissions)) {
    // Yönetim (ADMIN) modülü yalnız uygulama sahibinin rol tabanlı hakkıdır.
    // Normal kullanıcı/firma yöneticisi permission matrisi ile ADMIN kazanamaz.
    body.permissions = body.permissions.filter((row: any) => upper(row?.moduleKey ?? row?.module_key) !== "ADMIN");
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.delete("Content-Length");
  return new Request(request, { headers, body: JSON.stringify(body) });
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
    const canonicalRequest = await canonicalizeAdminWrite(request);
    return shell.fetch(canonicalRequest, env, executionCtx);
  },
};
