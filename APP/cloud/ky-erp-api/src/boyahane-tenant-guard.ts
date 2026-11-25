import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const canonical = (value: unknown) => text(value).toLocaleLowerCase("tr-TR");
const owner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));

function canAccessBoyahane(user: Row, method: string) {
  if (owner(user?.role)) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const row = permissions.find((r: Row) => upper(r?.moduleKey || r?.module_key) === "BOYAHANE");
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
  const candidates=new Set<string>();
  const add=(raw:unknown)=>{const v=canonical(raw);if(v)candidates.add(v);};
  const querySlug=c.req.query("mainCompanySlug") || c.req.query("mainCompanyId");
  // Only values that existing handlers actually consume can select a tenant.
  let selected=canonical(querySlug);
  add(querySlug);
  add(c.req.query("main_company_slug"));
  add(c.req.header("X-KYERP-Tenant-Slug"));
  if(!["GET","HEAD","OPTIONS"].includes(upper(c.req.method))){
    const contentType=text(c.req.header("Content-Type")).toLowerCase();
    try{
      if(contentType.includes("json")||contentType.includes("text/plain")){
        const body=await c.req.raw.clone().json() as Row;
        add(body?.mainCompanySlug);add(body?.main_company_slug);
        selected=selected || canonical(body?.mainCompanySlug || body?.main_company_slug);
        // mainCompanyId in body is not honored by all older routes.
        if(!selected && body?.mainCompanyId)return "";
      }else if(contentType.includes("multipart/form-data")){
        const body=await c.req.raw.clone().formData();
        add(body.get("mainCompanySlug"));add(body.get("main_company_slug"));
        selected=selected || canonical(body.get("mainCompanySlug") || body.get("main_company_slug"));
      }
    }catch{return "";}
  }
  return selected && candidates.size === 1 ? selected : "";
}

export async function enforceBoyahaneTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return c.json({ ok: false, error: {
    code: "UNAUTHORIZED", message: "Boyahane işlemi için geçerli oturum zorunludur.",
  } }, 401);
  if (!canAccessBoyahane(user, c.req.method)) return c.json({ ok: false, error: {
    code: "BOYAHANE_FORBIDDEN", message: "Bu Boyahane işlemi için yetkiniz yok.",
  } }, 403);
  const requested = await requestTenant(c);
  if (!requested) return c.json({ ok: false, error: {
    code: "MAIN_COMPANY_REQUIRED", message: "Boyahane işlemi için tek ve geçerli ana firma seçimi zorunludur.",
  } }, 400);
  if (!owner(user.role)) {
    const own = canonical(user.mainCompanySlug || user.main_company_slug);
    if (!own) return c.json({ ok: false, error: {
      code: "MAIN_COMPANY_CONTEXT_MISSING", message: "Kullanıcının firma erişimi tanımlanmamış.",
    } }, 403);
    if (own !== requested) return c.json({ ok: false, error: {
      code: "MAIN_COMPANY_FORBIDDEN", message: "Bu ana firmanın Boyahane kayıtlarına erişim yetkiniz yok.",
    } }, 403);
  }
  await next();
}
