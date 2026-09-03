import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const canonical = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const owner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));

function accountingPermission(user: Row) {
  if (owner(user?.role)) return true;
  const rows = Array.isArray(user?.permissions) ? user.permissions : [];
  const row = rows.find((item: Row) => upper(item?.moduleKey || item?.module_key) === "MUHASEBE");
  return Boolean(row?.canView ?? row?.can_view);
}

async function requestedTenant(c: Context<AppEnv>) {
  const query = canonical(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId"));
  if (query) return query;
  const header = canonical(c.req.header("X-KYERP-Tenant-Slug"));
  if (header) return header;
  if (["GET", "HEAD", "OPTIONS"].includes(upper(c.req.method))) return "";
  const contentType = text(c.req.header("Content-Type")).toLowerCase();
  if (!contentType.includes("application/json")) return "";
  try {
    const body = await c.req.raw.clone().json() as Row;
    return canonical(body?.mainCompanySlug || body?.main_company_slug || body?.mainCompanyId);
  } catch {
    return "";
  }
}

export async function enforceAccountingTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "e-Belge Merkezi için geçerli oturum zorunludur." } }, 401);
  }
  if (!accountingPermission(user)) {
    return c.json({ ok: false, error: { code: "ACCOUNTING_FORBIDDEN", message: "Muhasebe / e-Belge Merkezi görüntüleme yetkiniz yok." } }, 403);
  }
  const requested = await requestedTenant(c);
  if (!requested) {
    return c.json({ ok: false, error: { code: "MAIN_COMPANY_REQUIRED", message: "e-Belge Merkezi için ana firma seçimi zorunludur." } }, 400);
  }
  if (!owner(user.role)) {
    const own = canonical(user.mainCompanySlug || user.main_company_slug);
    if (!own) {
      return c.json({ ok: false, error: { code: "MAIN_COMPANY_CONTEXT_MISSING", message: "Kullanıcının ana firma bağlamı tanımlı değil; erişim kapatıldı." } }, 403);
    }
    if (own !== requested) {
      return c.json({ ok: false, error: { code: "MAIN_COMPANY_FORBIDDEN", message: "Bu ana firmanın e-Belge verilerine erişim yetkiniz yok." } }, 403);
    }
  }
  return next();
}
