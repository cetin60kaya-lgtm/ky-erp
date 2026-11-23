import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {canReadOwnCompanyStorage} from "./file-hub-company-owner-access";
import {accountingAccess,accountingTenantCandidates} from "./accounting-access-policy";
import {fetchOneIsnetXmlReadOnly} from "./isnet-read-only-probe";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
export type Kind="invoice"|"despatch";
export type Direction="incoming"|"outgoing";
const text=(v:unknown)=>String(v??"").trim();
const safeError=(code:string,message:string)=>({ok:false,error:{code,message}});
const API="https://einvoiceapi.isnet.net.tr";
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const okResult=(v:unknown)=>[0,"0",true,"Success","success"].includes(v as any);
const isDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"));
const kindOf=(v:string):Kind|null=>v==="invoice"||v==="despatch"?v:null;
const directionOf=(v:string):Direction|null=>v==="incoming"||v==="outgoing"?v:null;

function safePeriod(from:string,to:string){
 return isDate(from)&&isDate(to)&&from<=to&&Date.parse(to)-Date.parse(from)<=31*86400*1000;
}
function listDef(kind:Kind,direction:Direction,companyId:number,from:string,to:string){
 if(kind==="invoice"){
  return {path:direction==="incoming"?"/api/Invoice/GetIncomingEInvoiceList":"/api/Invoice/GetSentStagingInvoiceList",
   key:"Invoices",body:{CompanyId:companyId,FirstInvoiceDate:from,LastInvoiceDate:to,PageIndex:0,PageSize:25,
    IsArchiveIncluded:true,...(direction==="outgoing"?{IsSended:true}:{})}};
 }
 return {path:direction==="incoming"?"/api/Invoice/GetIncomingDespatchList":"/api/Invoice/GetSentStagingDespatchList",
  key:"Despatches",body:{CompanyId:companyId,FirstDespatchDate:from,LastDespatchDate:to,PageIndex:0,PageSize:25}};
}
async function providerPost(fetcher:typeof fetch,token:string,path:string,body:Row){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetcher(API+path,{method:"POST",redirect:"manual",signal:controller.signal,
   headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "+token,Token:token},
   body:JSON.stringify(body)});
  if(response.status===401||response.status===403)throw Error("ISNET_API_SESSION_INVALID");
  if(!response.ok)throw Error("ISNET_PROVIDER_HTTP_ERROR");
  if(!(response.headers.get("content-type")||"").toLowerCase().includes("json"))throw Error("ISNET_PROVIDER_NON_JSON");
  const payload:Row=await response.json();
  if(!okResult(payload.Result??payload.result))throw Error("ISNET_PROVIDER_REJECTED");
  return payload;
 }finally{clearTimeout(timer);}
}

/** Firmaya yetkili oturumla, kullanıcı istemi üzerine gerçek API liste okuması.
 * Sadece gösterilecek alanlar döner. İşNet şifresi / token / VKN / ham veri dönmez.
 */
export async function listIsnetDocumentsReadOnly(
 fetcher:typeof fetch,token:string,companyId:number,kind:Kind,direction:Direction,from:string,to:string
){
 if(!safePeriod(from,to))throw Error("ISNET_INVALID_PERIOD");
 const def=listDef(kind,direction,companyId,from,to);
 const payload=await providerPost(fetcher,token,def.path,def.body);
 const source=payload[def.key]??payload[def.key.toLowerCase()];
 if(!Array.isArray(source))throw Error("ISNET_LIST_NOT_VERIFIED");
 const rows=source.slice(0,25).filter((row:Row)=>UUID.test(text(row.Ettn))).map((row:Row)=>({
  ettn:text(row.Ettn),
  documentNo:text(row[kind==="invoice"?"InvoiceNumber":"DespatchNumber"]).slice(0,100),
  issueDate:text(row[kind==="invoice"?"InvoiceDate":"DespatchDate"]).slice(0,40),
  companyName:text(row.RecipientCompanyName||row.SenderCompanyName||"").slice(0,180),
  status:text(row.Status).slice(0,80)
 }));
 return {kind,direction,from,to,rows,received:source.length,shown:rows.length,pageIndex:0,
  pageSize:25,readOnly:true};
}
function allowedFileUrl(value:string){
 let u:URL;
 try{u=new URL(value)}catch{throw Error("ISNET_DOCUMENT_URL_INVALID")}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=="https:"||u.username||u.password||u.port||
    !(host==="isnet.net.tr"||host.endsWith(".isnet.net.tr")))
    throw Error("ISNET_DOCUMENT_URL_NOT_ALLOWLISTED");
 return u.toString();
}
export async function downloadIsnetPdfReadOnly(
 fetcher:typeof fetch,token:string,companyId:number,kind:Kind,direction:Direction,
 from:string,to:string,ettn:string
):Promise<ArrayBuffer>{
 if(!UUID.test(ettn))throw Error("ISNET_INVALID_ETTN");
 const listed=await listIsnetDocumentsReadOnly(fetcher,token,companyId,kind,direction,from,to);
 if(!listed.rows.some(r=>r.ettn.toLowerCase()===ettn.toLowerCase()))
  throw Error("ISNET_DOCUMENT_NOT_ON_PAGE");
 const result=await providerPost(fetcher,token,"/api/Invoice/GetInvoiceExternalUrl",{
  Ettn:ettn,InvoiceDirection:direction==="incoming"?1:2,InvoiceDocumentType:kind==="invoice"?1:4});
 const url=allowedFileUrl(text(result.ExternalLink));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);
 try{
  const response=await fetcher(url,{method:"GET",redirect:"manual",signal:controller.signal,
   headers:{Accept:"application/pdf,application/octet-stream"}});
  if(!response.ok)throw Error("ISNET_PDF_DOWNLOAD_HTTP_ERROR");
  const length=Number(response.headers.get("content-length")||0);
  if(length>20*1024*1024)throw Error("ISNET_PDF_TOO_LARGE");
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw Error("ISNET_PDF_INVALID_SIZE");
  const first=new TextDecoder().decode(new Uint8Array(bytes).slice(0,5));
  if(first!=="%PDF-")throw Error("ISNET_PROVIDER_DID_NOT_RETURN_PDF");
  return bytes;
 }finally{clearTimeout(timer);}
}
async function authorized(c:Context<Env>){
 const tenants=accountingTenantCandidates(text(c.req.query("mainCompanySlug")),
  text(c.req.header("X-KYERP-Tenant-Slug")),{});
 const slug=tenants.length===1?tenants[0]:"",user=await getAuthenticatedUser(c);
 if(!slug||!user||!canReadOwnCompanyStorage(user,slug)||
    !accountingAccess(user,"GET",c.req.path))throw Error("ISNET_QA_FORBIDDEN");
 const selected=await c.env.DB.prepare(
  "SELECT data FROM json_store WHERE scope='EBELGE_TENANT_ADAPTER_SELECTION_V1' AND main_company_slug=? AND file_name='ISNET' ORDER BY updated_at DESC LIMIT 1"
 ).bind(slug).first<Row>();
 if(selected){
  let val:Row={};try{val=JSON.parse(text(selected.data))}catch{throw Error("ISNET_ADAPTER_INACTIVE")}
  if(val.selected!==true||val.enabled===false)throw Error("ISNET_ADAPTER_INACTIVE");
 }
 const record=await c.env.DB.prepare(
  "SELECT data FROM json_store WHERE scope='ISNET_SETTINGS' AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1"
 ).bind(slug).first<Row>();
 let config:Row={};try{config=JSON.parse(text(record?.data))||{}}catch{}
 const companyId=text(config.companyId),token=text(config.accessToken);
 if(config.connectionMode!=="api"||!/^\d+$/.test(companyId)||!token)
  throw Error("ISNET_API_SESSION_REQUIRED");
 if(config.tokenExpiresOn&&Number.isFinite(Date.parse(text(config.tokenExpiresOn)))&&
   Date.parse(text(config.tokenExpiresOn))<=Date.now())
  throw Error("ISNET_API_SESSION_EXPIRED");
 return {companyId:Number(companyId),token};
}
const errors:Record<string,string>={
 ISNET_QA_FORBIDDEN:"İşNet testine bu firmanın yetkili hesabıyla giriş gerekir.",
 ISNET_ADAPTER_INACTIVE:"İşNet adaptörü bu firma için aktif değil.",
 ISNET_API_SESSION_REQUIRED:"Önce API bağlantısı ekranında İşNet girişini ve firmayı doğrulayıp kaydedin.",
 ISNET_API_SESSION_EXPIRED:"İşNet API oturumu dolmuş. Yeniden bağlantı doğrulayın.",
 ISNET_PROVIDER_DID_NOT_RETURN_PDF:"İşNet görüntü bağlantısı gerçek PDF dönmedi; PDF testi başarısız.",
 ISNET_DOCUMENT_NOT_ON_PAGE:"Seçilen belge son liste yanıtında yok. Listeyi yenileyin.",
 ISNET_INVALID_PERIOD:"Başlangıç ve bitiş en fazla 31 gün olmalı.",
 ISNET_INVALID_ETTN:"Belge ETTN kimliği geçersiz.",
 ISNET_PDF_DOWNLOAD_HTTP_ERROR:"İşNet PDF bağlantısı indirilemedi.",
 ISNET_PDF_TOO_LARGE:"İşNet PDF 20 MB sınırını aşıyor.",
 ISNET_PDF_INVALID_SIZE:"Geçersiz PDF boyutu.",
 ISNET_DOCUMENT_URL_INVALID:"İşNet PDF bağlantısı geçersiz.",
 ISNET_DOCUMENT_URL_NOT_ALLOWLISTED:"İşNet dışındaki dosya adresine erişim engellendi.",
 ISNET_API_SESSION_INVALID:"İşNet API oturumu geçerli değil.",
 ISNET_PROVIDER_HTTP_ERROR:"İşNet servis hatası.",
 ISNET_PROVIDER_NON_JSON:"İşNet API beklenen yanıtı vermedi.",
 ISNET_PROVIDER_REJECTED:"İşNet API sorguyu reddetti.",
 ISNET_LIST_NOT_VERIFIED:"İşNet belge listesi doğrulanamadı."
};
function errorReply(c:Context<Env>,error:unknown){
 const code=text(error instanceof Error?error.message:"");
 const safe=code in errors?code:"ISNET_QA_UNVERIFIED";
 const status=safe==="ISNET_QA_FORBIDDEN"?403:
  safe==="ISNET_API_SESSION_REQUIRED"||safe==="ISNET_API_SESSION_EXPIRED"||safe==="ISNET_ADAPTER_INACTIVE"?409:
  safe==="ISNET_INVALID_PERIOD"||safe==="ISNET_INVALID_ETTN"?400:502;
 c.header("Cache-Control","private, no-store");
 return c.json(safeError(safe,errors[safe]||"İşNet gerçek belge testi doğrulanamadı."),status as any);
}
/** QA only, no D1/R2 write, no Google Drive write, no official issue/send. */
export function registerIsnetApiLiveAcceptanceRoutes(app:Hono<Env>){
 app.get("/api/isnet/qa/documents",async c=>{
  try{
   const {companyId,token}=await authorized(c);
   const kind=kindOf(text(c.req.query("kind"))),direction=directionOf(text(c.req.query("direction")));
   const from=text(c.req.query("from")),to=text(c.req.query("to"));
   if(!kind||!direction||!safePeriod(from,to))throw Error("ISNET_INVALID_PERIOD");
   const result=await listIsnetDocumentsReadOnly(fetch,token,companyId,kind,direction,from,to);
   c.header("Cache-Control","private, no-store");
   return c.json({ok:true,data:result});
  }catch(error){return errorReply(c,error)}
 });
 app.get("/api/isnet/qa/download",async c=>{
  try{
   const {companyId,token}=await authorized(c);
   const kind=kindOf(text(c.req.query("kind"))),direction=directionOf(text(c.req.query("direction")));
   const from=text(c.req.query("from")),to=text(c.req.query("to")),ettn=text(c.req.query("ettn"));
   const format=text(c.req.query("format"));
   if(!kind||!direction||!safePeriod(from,to)||!UUID.test(ettn)||!["xml","pdf"].includes(format))
    throw Error("ISNET_INVALID_PERIOD");
   const bytes=format==="xml"
    ?(await fetchOneIsnetXmlReadOnly(fetch,token,companyId,kind,from,to,direction,ettn)).bytes
    :await downloadIsnetPdfReadOnly(fetch,token,companyId,kind,direction,from,to,ettn);
   const name="isnet-"+direction+"-"+kind+"-"+ettn+"."+format;
   return new Response(bytes,{headers:{
    "Content-Type":format==="pdf"?"application/pdf":"application/xml; charset=utf-8",
    "Content-Disposition":'attachment; filename="'+name+'"',
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'",
   }});
  }catch(error){return errorReply(c,error)}
 });
}
