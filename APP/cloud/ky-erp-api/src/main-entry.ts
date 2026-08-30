// @ts-nocheck
import shell from "./main";

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
    // Browser origin güvenliği main.ts içindeki explicit LIVE_ORIGINS + CORS allowlist
    // tarafından uygulanır. main-entry ikinci ve çelişkili bir domain blacklist tutmaz.
    const canonicalRequest = await canonicalizeAdminWrite(request);
    return shell.fetch(canonicalRequest, env, executionCtx);
  },
};
