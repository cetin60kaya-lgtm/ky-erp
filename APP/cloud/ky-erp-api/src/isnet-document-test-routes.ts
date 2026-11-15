import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {isTestType,queryIsnetDocumentTest} from "./isnet-document-test-core";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const error=(code:string,message:string)=>({ok:false,error:{code,message}});
function validDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+"T00:00:00Z"))}
export function registerIsnetDocumentTestRoutes(app:Hono<Env>){
 app.get("/api/isnet/document-test",async(c:Context<Env>)=>{
  const tenants=accountingTenantCandidates(clean(c.req.query("mainCompanySlug")),clean(c.req.header("X-KYERP-Tenant-Slug")),{});
  const tenant=tenants.length===1?tenants[0]:"",user=await getAuthenticatedUser(c);
  if(!tenant||!user||!accountingTenantReadAllowed(user,tenant)||!accountingAccess(user,"GET",c.req.path))
   return c.json(error("FORBIDDEN","Firma belge test yetkisi bulunamadı."),403);
  const type=clean(c.req.query("type"));
  if(!isTestType(type))return c.json(error("INVALID_DOCUMENT_TYPE","Belge türü geçersiz."),400);
  const now=new Date().toISOString().slice(0,10),last=new Date(Date.parse(now+"T00:00:00Z")-7*86400000).toISOString().slice(0,10);
  const from=clean(c.req.query("from"))||last,to=clean(c.req.query("to"))||now;
  if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>31*86400000)
   return c.json(error("INVALID_PERIOD","En fazla 31 günlük geçerli tarih aralığı seçin."),400);
  const selection=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='EBELGE_TENANT_ADAPTER_SELECTION_V1' AND main_company_slug=? AND file_name='ISNET' "+
   "ORDER BY CASE WHEN id LIKE 'EBELGE_ADAPTER_SELECTION_V1:%' THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  if(selection){
   let x:Row={};try{x=JSON.parse(clean(selection.data))}catch{}
   if(x.selected!==true||x.enabled===false)
    return c.json(error("ADAPTER_INACTIVE","Bu firmada İşNet entegrasyonu pasif."),409);
  }
  const found=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='ISNET_SETTINGS' AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  let settings:Row={};try{settings=JSON.parse(clean(found?.data))||{}}catch{}
  const token=clean(settings.accessToken),companyId=clean(settings.companyId);
  if(settings.connectionMode!=="api"||!/^\d+$/.test(companyId)||!token)
   return c.json(error("ISNET_API_SESSION_REQUIRED","Resmî İşNet API oturumu doğrulanmadı; portal firma kaydı yeterli değil."),409);
  if(settings.tokenExpiresOn&&!Number.isNaN(Date.parse(clean(settings.tokenExpiresOn)))&&Date.parse(clean(settings.tokenExpiresOn))<=Date.now())
   return c.json(error("ISNET_API_SESSION_EXPIRED","İşNet API oturumunun süresi doldu."),409);
  const result=await queryIsnetDocumentTest(fetch,token,Number(companyId),type,from,to);
  return c.json({ok:true,data:{...result,type,from,to,pageSize:25,
   readOnly:true,checkedAt:new Date().toISOString(),
   countIsFirstPageOnly:true,
   message:result.status==="VERIFIED_READ_ONLY"?"İşNet belge listesi gerçek API oturumuyla okundu.":"İşNet belge listesi henüz doğrulanamadı."}});
 });
}
