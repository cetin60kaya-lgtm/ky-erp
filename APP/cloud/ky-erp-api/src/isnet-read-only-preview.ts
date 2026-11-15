import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
const safeDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
function validRange(from:string,to:string){
 if(!safeDate(from)||!safeDate(to)||from>to)return false;
 return (Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000<=31;
}
import {probeIsnetReadOnlyLists} from "./isnet-read-only-probe";
/** Only read-only provider list counts are returned. No invoice fields, tokens,
 * passwords, PDFs, tax IDs or provider response bodies enter the API reply/log.
 */
export function registerIsnetReadOnlyPreviewRoutes(app:Hono<Env>){
 app.get("/api/isnet/api-read-only-preview",async c=>{
  const values=accountingTenantCandidates(
   clean(c.req.query("mainCompanySlug")),
   clean(c.req.header("X-KYERP-Tenant-Slug")),{}
  );
  const tenant=values.length===1?values[0]:"",user=await getAuthenticatedUser(c);
  if(!tenant||!user||!accountingTenantReadAllowed(user,tenant)||!accountingAccess(user,"GET",c.req.path))
   return c.json(fail("FORBIDDEN","Bu firmanın İşNet kontrolüne erişim izniniz yok."),403);
  const iso=new Date().toISOString().slice(0,10);
  const week=new Date(Date.parse(iso+"T00:00:00Z")-7*86400000).toISOString().slice(0,10);
  const from=clean(c.req.query("from"))||week,to=clean(c.req.query("to"))||iso;
  if(!validRange(from,to))return c.json(fail("INVALID_PERIOD","İşNet sorgusu en fazla 31 günlük geçerli bir tarih aralığı gerektirir."),400);
  const state=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='EBELGE_TENANT_ADAPTER_SELECTION_V1' AND main_company_slug=? AND file_name='ISNET' "+
   "ORDER BY CASE WHEN id LIKE 'EBELGE_ADAPTER_SELECTION_V1:%' THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  if(state){
   try{
    const choice=JSON.parse(clean(state.data));
    if(choice.selected!==true||choice.enabled===false)
     return c.json(fail("ISNET_ADAPTER_INACTIVE","İşNet adaptörü bu firma için pasif veya kaldırılmış."),409);
   }catch{
    return c.json(fail("ISNET_ADAPTER_STATE_INVALID","İşNet adaptör kaydı doğrulanamadı."),409);
   }
  }
  const connection=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='ISNET_SETTINGS' AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  let settings:Row={};
  try{settings=JSON.parse(clean(connection?.data))||{}}catch{/* Not configured. */}
  const companyId=clean(settings.companyId),token=clean(settings.accessToken);
  if(!/^\d+$/.test(companyId)||!token||settings.connectionMode==="portal")
   return c.json(fail("ISNET_SESSION_REQUIRED","İşNet resmî API oturumu ve yetkili firma doğrulanmadı."),409);
  if(settings.tokenExpiresOn&&!Number.isNaN(Date.parse(clean(settings.tokenExpiresOn)))&&Date.parse(clean(settings.tokenExpiresOn))<=Date.now())
   return c.json(fail("ISNET_SESSION_EXPIRED","İşNet API oturumunun süresi doldu. Bağlantıyı tekrar doğrulayın."),409);
  const result=await probeIsnetReadOnlyLists(fetch,token,Number(companyId),from,to);
  return c.json({ok:true,data:{...result,from,to,pageSize:25,readOnly:true,checkedAt:new Date().toISOString(),
   message:result.verified?"İşNet gelen belge listeleri gerçek yetkili API oturumuyla salt okunur doğrulandı.":"İşNet belge listelerinden en az biri doğrulanamadı; belge senkronizasyonu başarılı sayılmaz."}});
 });
}
