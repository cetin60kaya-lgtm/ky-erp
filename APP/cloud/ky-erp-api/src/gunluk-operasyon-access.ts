import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { dailyTenant, dailyAuthorized, isOwner } from "./gunluk-operasyon-access-policy";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const str = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => str(value).toUpperCase().replace(/İ/g,"I");
async function tenantCandidates(c: Context<AppEnv>) {
  const candidates = new Set<string>();
  const add = (raw: unknown) => { const value = dailyTenant(raw); if(value) candidates.add(value); };
  add(c.req.header("X-KYERP-Tenant-Slug"));
  add(c.req.query("mainCompanyId"));
  add(c.req.query("mainCompanySlug"));
  add(c.req.query("main_company_id"));
  add(c.req.query("main_company_slug"));
  if (!["GET","HEAD","OPTIONS"].includes(upper(c.req.method))) {
    const ct = str(c.req.header("Content-Type")).toLowerCase();
    try {
      if (ct.includes("json")) {
        const b = await c.req.raw.clone().json() as Row;
        add(b?.mainCompanyId); add(b?.mainCompanySlug); add(b?.main_company_id); add(b?.main_company_slug);
      } else if (ct.includes("multipart/form-data")) {
        const b = await c.req.raw.clone().formData();
        add(b.get("mainCompanyId")); add(b.get("mainCompanySlug"));
      }
    } catch { /* The actual endpoint will reject malformed input. */ }
  }
  return candidates;
}
export async function enforceDailyOperationsTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Günlük Operasyon için oturum zorunludur."}},401);
  if (!dailyAuthorized(user,c.req.method,c.req.path))
    return c.json({ok:false,error:{code:"GUNLUK_PERMISSION_DENIED",message:"Bu Günlük Operasyon işlemi için yetkiniz yok."}},403);
  const candidates = await tenantCandidates(c);
  if (candidates.size !== 1)
    return c.json({ok:false,error:{code:"GUNLUK_TENANT_REQUIRED",message:"Tek ve tutarlı ana firma seçimi zorunludur."}},400);
  const target = [...candidates][0];
  if (!isOwner(user.role)) {
    const own = dailyTenant(user.mainCompanySlug || user.main_company_slug || user.mainCompanyId);
    if (!own || own !== target)
      return c.json({ok:false,error:{code:"GUNLUK_TENANT_FORBIDDEN",message:"Bu firmanın Günlük Operasyon kayıtlarına erişim yetkiniz yok."}},403);
  }
  await next();
}
