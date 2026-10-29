import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const canonical = (value: unknown) => text(value).toLocaleLowerCase("tr-TR");
const owner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));

function canAccessProduction(user: Row, method: string) {
  if (owner(user?.role)) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const row = permissions.find((r: Row) => upper(r?.moduleKey || r?.module_key) === "IMALAT");
  if (!row) return false;
  const yes = (camel: string, snake: string) =>
    row[camel] === true || Number(row[snake] || 0) === 1;
  const m = upper(method);
  if (m === "GET" || m === "HEAD") return yes("canView", "can_view");
  if (m === "DELETE") return yes("canDelete", "can_delete");
  if (m === "PUT" || m === "PATCH") return yes("canUpdate", "can_update");
  if (m === "POST") return yes("canCreate", "can_create") ||
    yes("canUpdate", "can_update") || yes("canApprove", "can_approve");
  return false;
}

async function requestTenant(c: Context<AppEnv>) {
  const candidates = new Set<string>();
  const add = (raw: unknown) => {
    const value = canonical(raw);
    if (value) candidates.add(value);
  };
  // mainCompanyId backward-compat: only use it when a slug has not been provided.
  const querySlug = c.req.query("mainCompanySlug") || c.req.query("main_company_slug");
  add(querySlug || c.req.query("mainCompanyId"));
  add(c.req.header("X-KYERP-Tenant-Slug"));
  if (!["GET", "HEAD", "OPTIONS"].includes(upper(c.req.method))) {
    const contentType = text(c.req.header("Content-Type")).toLowerCase();
    try {
      if (contentType.includes("json") || contentType.includes("text/plain")) {
        const body = await c.req.raw.clone().json() as Row;
        add(body?.mainCompanySlug || body?.main_company_slug ||
          (!querySlug ? body?.mainCompanyId : undefined));
      } else if (contentType.includes("multipart/form-data")) {
        const body = await c.req.raw.clone().formData();
        add(body.get("mainCompanySlug") || body.get("main_company_slug"));
      }
    } catch {
      // Malformed content is rejected by the route; do not infer a new tenant.
    }
  }
  return candidates.size === 1 ? [...candidates][0] : "";
}

export async function enforceProductionTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return c.json({ ok: false, error: {
    code: "UNAUTHORIZED", message: "İmalat işlemi için geçerli oturum zorunludur.",
  } }, 401);
  if (!canAccessProduction(user, c.req.method)) return c.json({ ok: false, error: {
    code: "IMALAT_FORBIDDEN", message: "Bu İmalat işlemi için yetkiniz yok.",
  } }, 403);
  const requested = await requestTenant(c);
  if (!requested) return c.json({ ok: false, error: {
    code: "MAIN_COMPANY_REQUIRED", message: "İmalat işlemi için tek ve geçerli ana firma seçimi zorunludur.",
  } }, 400);
  if (!owner(user.role)) {
    const own = canonical(user.mainCompanySlug || user.main_company_slug);
    if (!own) return c.json({ ok: false, error: {
      code: "MAIN_COMPANY_CONTEXT_MISSING", message: "Kullanıcının firma erişimi tanımlanmamış.",
    } }, 403);
    if (own !== requested) return c.json({ ok: false, error: {
      code: "MAIN_COMPANY_FORBIDDEN", message: "Bu ana firmanın üretim kayıtlarına erişim yetkiniz yok.",
    } }, 403);
  }
  await next();
}
