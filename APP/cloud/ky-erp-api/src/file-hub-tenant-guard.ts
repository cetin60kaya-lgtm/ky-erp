import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const canonical = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const ownerRole = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const writeMethod = (method: unknown) => !["GET", "HEAD", "OPTIONS"].includes(upper(method));

async function requestedTenant(c: Context<AppEnv>) {
  const candidates = new Set<string>();
  const add = (value: unknown) => {
    const slug = canonical(value);
    if (slug) candidates.add(slug);
  };

  add(c.req.query("mainCompanySlug"));
  add(c.req.header("X-KYERP-Tenant-Slug"));

  if (writeMethod(c.req.method)) {
    const contentType = text(c.req.header("Content-Type")).toLowerCase();
    try {
      if (contentType.includes("application/json") || contentType.includes("text/plain")) {
        const body = await c.req.raw.clone().json() as Row;
        add(body?.mainCompanySlug || body?.main_company_slug);
      } else if (contentType.includes("multipart/form-data")) {
        const form = await c.req.raw.clone().formData();
        add(form.get("mainCompanySlug") || form.get("main_company_slug"));
      }
    } catch {
      // Route-level validation handles malformed request bodies.
    }
  }

  return candidates.size === 1 ? [...candidates][0] : "";
}

export async function enforceFileHubTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();

  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) {
    return c.json({ ok:false, error:{ code:"UNAUTHORIZED", message:"File Hub işlemi için geçerli oturum zorunludur." } }, 401);
  }

  const requested = await requestedTenant(c);
  if (!requested) {
    return c.json({ ok:false, error:{ code:"MAIN_COMPANY_REQUIRED", message:"File Hub işlemi için ana firma seçimi zorunludur." } }, 400);
  }

  if (!ownerRole(user.role)) {
    const own = canonical(user.mainCompanySlug || user.main_company_slug);
    if (!own) {
      return c.json({ ok:false, error:{ code:"MAIN_COMPANY_CONTEXT_MISSING", message:"Kullanıcının ana firma bağlamı tanımlı değil; File Hub erişimi kapatıldı." } }, 403);
    }
    if (own !== requested) {
      return c.json({ ok:false, error:{ code:"MAIN_COMPANY_FORBIDDEN", message:"Bu ana firmanın File Hub verilerine erişim yetkiniz yok." } }, 403);
    }
  }

  await next();
}
