import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {fetchOneIsnetXmlReadOnly} from "./isnet-read-only-probe";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>String(v??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
export function registerIsnetReadOnlyXmlDownloadRoutes(app:Hono<Env>){
 app.get("/api/isnet/api-read-only-xml-sample",async(c:Context<Env>)=>{
  const candidates=accountingTenantCandidates(
   text(c.req.query("mainCompanySlug")),text(c.req.header("X-KYERP-Tenant-Slug")),{});
  const tenant=candidates.length===1?candidates[0]:"";
  const user=await getAuthenticatedUser(c);
  if(!tenant||!user||!accountingTenantReadAllowed(user,tenant)||!accountingAccess(user,"GET",c.req.path))
   return c.json(fail("FORBIDDEN","Bu firma için İşNet XML okuma yetkiniz yok."),403);
  const kind=c.req.query("kind")==="invoice"?"invoice":c.req.query("kind")==="despatch"?"despatch":null;
  if(!kind)return c.json(fail("INVALID_KIND","Fatura veya irsaliye türü seçin."),400);
  const direction=c.req.query("direction")==="outgoing"?"outgoing":c.req.query("direction")==="incoming"||!c.req.query("direction")?"incoming":null;
  if(!direction)return c.json(fail("INVALID_DIRECTION","Gelen veya giden belge yönü seçin."),400);
  const ettn=text(c.req.query("ettn"));
  if(ettn&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(ettn))
   return c.json(fail("INVALID_ETTN","Belge kimliği geçersiz."),400);
  const today=new Date().toISOString().slice(0,10);
  const week=new Date(Date.parse(today+"T00:00:00Z")-7*86400000).toISOString().slice(0,10);
  const from=text(c.req.query("from"))||week,to=text(c.req.query("to"))||today;
  if(!dateOk(from)||!dateOk(to)||from>to||(Date.parse(to)-Date.parse(from))>31*86400000)
   return c.json(fail("INVALID_PERIOD","Gelen XML aralığı en fazla 31 gün olabilir."),400);
  const selected=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='EBELGE_TENANT_ADAPTER_SELECTION_V1' AND main_company_slug=? AND file_name='ISNET' "+
   "ORDER BY CASE WHEN id LIKE 'EBELGE_ADAPTER_SELECTION_V1:%' THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  if(selected){
   let setting:Row={};try{setting=JSON.parse(text(selected.data))}catch{/* Fail closed. */}
   if(setting.selected!==true||setting.enabled===false)
    return c.json(fail("ISNET_ADAPTER_INACTIVE","İşNet bu firma için pasif veya listeden kaldırılmış."),409);
  }
  const found=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='ISNET_SETTINGS' AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(tenant).first<Row>();
  let settings:Row={};try{settings=JSON.parse(text(found?.data))||{}}catch{/* Invalid -> fail. */}
  const companyId=text(settings.companyId),token=text(settings.accessToken);
  if(settings.connectionMode!=="api"||!/^\d+$/.test(companyId)||!token)
   return c.json(fail("ISNET_API_SESSION_REQUIRED","XML için resmî İşNet API oturumu gerekir. Portal firma kaydı tek başına yeterli değildir."),409);
  if(settings.tokenExpiresOn&&!Number.isNaN(Date.parse(text(settings.tokenExpiresOn)))&&Date.parse(text(settings.tokenExpiresOn))<=Date.now())
   return c.json(fail("ISNET_API_SESSION_EXPIRED","API tokenının süresi dolmuş; bağlantıyı yeniden doğrulayın."),409);
  try{
   const file=await fetchOneIsnetXmlReadOnly(fetch,token,Number(companyId),kind,from,to,direction,ettn);
   return new Response(file.bytes,{headers:{
    "Content-Type":"application/xml; charset=utf-8",
    "Content-Disposition":'attachment; filename="isnet-'+(direction==="outgoing"?"giden":"gelen")+'-'+(kind==="invoice"?"fatura":"irsaliye")+'-ornek.xml"',
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
   }});
  }catch(err:any){
   const code=text(err?.message);
   const safeCodes=new Set(["ISNET_NO_XML_SAMPLE","ISNET_XML_URL_NOT_ALLOWLISTED","ISNET_XML_NOT_UBL","ISNET_XML_WRONG_DOCUMENT_TYPE","ISNET_XML_INVALID_SIZE","ISNET_XML_NON_XML_RESPONSE","ISNET_XML_TOO_LARGE","ISNET_XML_URL_INVALID","ISNET_PROVIDER_REJECTED","ISNET_PROVIDER_NON_JSON","ISNET_PROVIDER_HTTP_ERROR","ISNET_LIST_NOT_VERIFIED","ISNET_XML_DOWNLOAD_HTTP_ERROR"]);
   const reason=safeCodes.has(code)?code:"ISNET_XML_UNVERIFIED";
   const status=code==="ISNET_NO_XML_SAMPLE"?404:502;
   return c.json(fail(reason,code==="ISNET_NO_XML_SAMPLE"
    ?"Seçilen tarihlerde örnek XML'i indirilebilen belge bulunamadı."
    :"İşNet gerçek UBL-TR XML belgesini doğrulayamadı. İndirme başarılı sayılmadı; eski kayıtlar değiştirilmedi."),status);
  }
 });
}
