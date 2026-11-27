import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { accountingAccess } from "./accounting-access-policy";
import {isOfficeHeartbeatRequest} from "./isnet-office-routes";
type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const canonicalSlug = (value: unknown) => text(value).toLowerCase();
const scope = new WeakMap<Request,string>();
function ownerRole(role: unknown) {
  const value = text(role).toUpperCase();
  return value === "SUPER_ADMIN" || value === "ADMIN";
}
export function exactIsnetTenant(values:unknown[]):string {
 const candidates=[...new Set(values.map(canonicalSlug).filter(Boolean))];
 return candidates.length===1&&/^[a-z0-9_-]{1,100}$/.test(candidates[0]!)?candidates[0]!:"";
}
export function scopedIsnetTenant(c:Context<AppEnv>):string {
 const tenant=scope.get(c.req.raw);
 if(!tenant)throw Error("ISNET_VALIDATED_TENANT_REQUIRED");
 return tenant;
}
async function requestedTenant(c: Context<AppEnv>) {
 const values:unknown[]=[...(c.req.queries("mainCompanySlug")||[]),...(c.req.queries("mainCompanyId")||[]),...(c.req.queries("main_company_slug")||[]),c.req.header("X-KYERP-Tenant-Slug")];
 if(!["GET","HEAD","OPTIONS"].includes(c.req.method.toUpperCase())){
  const ct=text(c.req.header("Content-Type")).toLowerCase();
  try{
   if(ct.includes("json")||ct.includes("text/plain")){
    const b=await c.req.raw.clone().json() as Row;
    if(b&&typeof b==="object")values.push(b.mainCompanySlug,b.main_company_slug,b.mainCompanyId);
   }else if(ct.includes("multipart/form-data")||ct.includes("application/x-www-form-urlencoded")){
    const form=await c.req.raw.clone().formData();
    values.push(...form.getAll("mainCompanySlug"),...form.getAll("main_company_slug"),...form.getAll("mainCompanyId"));
   }
  }catch{return ""}
 }
 return exactIsnetTenant(values);
}
export async function enforceIsnetTenant(c: Context<AppEnv>, next: Next) {
 if(c.req.method==="OPTIONS"||isOfficeHeartbeatRequest(c.req.path,c.req.method))return next();
 const current=await getAuthenticatedUser(c);
 if(!current)return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"İşNet işlemi için geçerli oturum zorunludur."}},401);
 if(!accountingAccess(current,c.req.method,c.req.path))return c.json({ok:false,error:{code:"ACCOUNTING_FORBIDDEN",message:"İşNet işlemi için muhasebe yetkisi gerekli."}},403);
 const requestedSlug=await requestedTenant(c);
 if(!requestedSlug)return c.json({ok:false,error:{code:"MAIN_COMPANY_REQUIRED",message:"İşNet işlemi için tek ve çelişkisiz ana firma seçimi zorunludur."}},400);
 if(!ownerRole(current.role)){
  const ownSlug=canonicalSlug((current as Row).mainCompanySlug||(current as Row).main_company_slug);
  if (!ownSlug)return c.json({ok:false,error:{code:"MAIN_COMPANY_CONTEXT_MISSING",message:"Kullanıcının ana firma bağlamı tanımlı değil."}},403);
  if (requestedSlug !== ownSlug)return c.json({ok:false,error:{code:"MAIN_COMPANY_FORBIDDEN",message:"Bu ana firmanın İşNet verilerine erişim yetkiniz yok."}},403);
 }
 scope.set(c.req.raw,requestedSlug);
 return next();
}
