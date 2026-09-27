import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const canonicalSlug = (value: unknown) => text(value).toLowerCase();

function ownerRole(role: unknown) {
  const value = text(role).toUpperCase();
  return value === "SUPER_ADMIN" || value === "ADMIN";
}

async function bodyTenant(c: Context<AppEnv>) {
  const method = String(c.req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return "";
  const contentType = text(c.req.header("Content-Type")).toLowerCase();
  if (!contentType.includes("application/json")) return "";
  try {
    const payload = await c.req.raw.clone().json() as Row;
    return canonicalSlug(payload?.mainCompanySlug || payload?.main_company_slug);
  } catch {
    return "";
  }
}

async function requestedTenant(c: Context<AppEnv>) {
  const querySlug = canonicalSlug(c.req.query("mainCompanySlug"));
  if (querySlug) return querySlug;
  const headerSlug = canonicalSlug(c.req.header("X-KYERP-Tenant-Slug"));
  if (headerSlug) return headerSlug;
  return bodyTenant(c);
}

export async function enforceIsnetTenant(c: Context<AppEnv>, next: Next) {
  if (String(c.req.method || "GET").toUpperCase() === "OPTIONS") {
    return next();
  }

  const current = await getAuthenticatedUser(c);
  if (!current) {
    return c.json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "İşNet işlemi için geçerli oturum zorunludur." },
    }, 401);
  }

  const requestedSlug = await requestedTenant(c);
  if (!requestedSlug) {
    return c.json({
      ok: false,
      error: { code: "MAIN_COMPANY_REQUIRED", message: "İşNet işlemi için ana firma seçimi zorunludur." },
    }, 400);
  }

  if (!ownerRole(current.role)) {
    const ownSlug = canonicalSlug((current as Row).mainCompanySlug || (current as Row).main_company_slug);
    if (!ownSlug) {
      return c.json({
        ok: false,
        error: { code: "MAIN_COMPANY_CONTEXT_MISSING", message: "Kullanıcının ana firma bağlamı tanımlı değil; İşNet erişimi kapatıldı." },
      }, 403);
    }
    if (requestedSlug !== ownSlug) {
      return c.json({
        ok: false,
        error: { code: "MAIN_COMPANY_FORBIDDEN", message: "Bu ana firmanın İşNet verilerine erişim yetkiniz yok." },
      }, 403);
    }
  }

  await next();
}
