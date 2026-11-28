// Narrow heartbeat route, separate from user sessions and existing File Hub keys.
// No production send, arbitrary command, provider URL, document data or remote shell.
import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {selections} from "./e-belge-adapter-company-routes";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {authorizeOfficeDevice,heartbeatOfficeDevice,officeRegistry,officeStatus} from "./isnet-office-coordinator.ts";
import {getOfficeReadJob,queueOfficeReadJob,officeReadTick} from "./isnet-office-read-jobs.ts";
import {LIVE_ENDPOINTS,LIVE_NOT_BEFORE,normalizeLiveProbe} from "./isnet-live-contract.ts";
type Env={Bindings:Cloudflare.Env & {ISNET_OFFICE_REGISTRY_JSON?:string};Variables:{requestId:string}};
export const OFFICE_HEARTBEAT_PATH="/api/isnet/office/heartbeat";
export function isOfficeHeartbeatRequest(path:string,method:string){return path===OFFICE_HEARTBEAT_PATH&&method==="POST";}
const error=(code:string)=>({ok:false,error:{code,message:"İşNet ofis bağlantısı doğrulanamadı."}});
export function registerIsnetOfficeRoutes(app:Hono<Env>){
 app.post(OFFICE_HEARTBEAT_PATH,async c=>{
  c.header("Cache-Control","no-store");
  // This path is called by a native agent over HTTPS, never by the browser.
  // CF-Connecting-IP comes from Cloudflare on the canonical API ingress.
  const url=new URL(c.req.url);
  if(url.hostname!=="api.kyerp.net"||url.protocol!=="https:"||!c.req.raw.cf||c.req.header("Origin"))return c.json(error("OFFICE_DEVICE_DENIED"),403);
  if(!c.env.ISNET_OFFICE_REGISTRY_JSON)return c.json(error("OFFICE_NOT_CONFIGURED"),503);
  try{
   const d=await authorizeOfficeDevice(officeRegistry(c.env.ISNET_OFFICE_REGISTRY_JSON),{
    tenant:c.req.header("X-KYERP-Tenant-Slug")||"",deviceId:c.req.header("X-KYERP-Agent-Id")||"",
    instanceId:c.req.header("X-KYERP-Office-Instance")||"",presentedSecret:c.req.header("X-KYERP-Agent-Token")||"",
    trustedEdgeIp:c.req.header("CF-Connecting-IP")||"",
   });
   const enabled=await selections(c,d.tenant);
   if(enabled.selected.ISNET!==true||enabled.enabled.ISNET!==true)return c.json(error("ISNET_ADAPTER_INACTIVE"),409);
   // Optional bounded metadata only; old heartbeat agents without body remain compatible.
   let probe=null,readReport:unknown=null;
   if(c.req.raw.body){
    const reader=c.req.raw.body.getReader();let size=0,raw="";const decoder=new TextDecoder();
    try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>4096){await reader.cancel();return c.json(error("OFFICE_PROBE_TOO_LARGE"),400)}raw+=decoder.decode(x.value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}
    if(raw){try{const value=JSON.parse(raw);readReport=value.readReport??null;if(value.liveProbe!=null){probe=normalizeLiveProbe(value.liveProbe,Date.now());if(!probe)return c.json(error("OFFICE_PROBE_INVALID"),400)}}catch{return c.json(error("OFFICE_PROBE_INVALID"),400)}}
   }
   const result=await heartbeatOfficeDevice(c.env.DB,d,Date.now(),probe);
   let readTask=null;if(result.lease){try{readTask=await officeReadTick(c.env.DB,result.lease,readReport)}catch{/* Heartbeat remains independent of read job storage. */}}
   // A heartbeat or lease is never proof that the live provider is authorized.
   return c.json({ok:true,data:{...result,readTask,providerAuthorized:false,sendEnabled:false,pollAfterMs:readTask?1000:30000}});
  }catch{return c.json(error("OFFICE_DEVICE_OR_STORAGE_DENIED"),403)}
 });
 app.get("/api/isnet/office/read-job",async c=>{
  c.header("Cache-Control","no-store");
  const user=await getAuthenticatedUser(c),candidates=accountingTenantCandidates(c.req.query("mainCompanySlug")||"",c.req.header("X-KYERP-Tenant-Slug")||"",{});
  if(candidates.length!==1||!user||!accountingTenantReadAllowed(user,candidates[0]!)||!accountingAccess(user,"GET",c.req.path))return c.json(error("FORBIDDEN"),403);
  try{return c.json({ok:true,data:{mainCompanySlug:candidates[0],job:await getOfficeReadJob(c.env.DB,candidates[0]!)}})}catch{return c.json(error("OFFICE_READ_UNAVAILABLE"),503)}
 });
 app.post("/api/isnet/office/read-job",async c=>{
  c.header("Cache-Control","no-store");
  const user=await getAuthenticatedUser(c);let body:any;try{body=await c.req.json()}catch{return c.json(error("BODY_INVALID"),400)}
  const candidates=accountingTenantCandidates(c.req.query("mainCompanySlug")||"",c.req.header("X-KYERP-Tenant-Slug")||"",body||{});
  if(candidates.length!==1||!user||!accountingTenantReadAllowed(user,candidates[0]!)||!accountingAccess(user,"POST",c.req.path))return c.json(error("FORBIDDEN"),403);
  const tenant=candidates[0]!;
  try{
   const enabled=await selections(c,tenant);if(enabled.selected.ISNET!==true||enabled.enabled.ISNET!==true)return c.json(error("ISNET_ADAPTER_INACTIVE"),409);
   const status=await officeStatus(c.env.DB,tenant,officeRegistry(c.env.ISNET_OFFICE_REGISTRY_JSON));
   if(!status.configured||!status.online)return c.json({ok:false,error:{code:"OFFICE_NOT_READY",message:"Yetkili ofis cihazı bağlı değil; sorgu başlatılmadı."}},409);
   const job=await queueOfficeReadJob(c.env.DB,tenant,{from:body?.from,to:body?.to,sources:body?.sources});return c.json({ok:true,data:{mainCompanySlug:tenant,job}},202);
  }catch(e){const code=(e as Error).message;const messages:Record<string,string>={DATE_INVALID:"Tarih geçersiz.",DATE_RANGE_MAX_31_DAYS:"En fazla 31 gün seçin.",SOURCE_INVALID:"Belge türü geçersiz.",COMPANY_TAX_REQUIRED:"Ana firma vergi kimliği eksik.",READ_JOB_ALREADY_RUNNING:"Bu firma için devam eden bir sorgu var."};return c.json({ok:false,error:{code:messages[code]?code:"OFFICE_READ_UNAVAILABLE",message:messages[code]||"Sorgu başlatılamadı."}},messages[code]?409:503)}
 });
 app.get("/api/isnet/office/status",async c=>{
  c.header("Cache-Control","no-store");
  const candidates=accountingTenantCandidates(c.req.query("mainCompanySlug")||"",c.req.header("X-KYERP-Tenant-Slug")||"",{});
  const user=await getAuthenticatedUser(c);
  if(candidates.length!==1||!user||!accountingTenantReadAllowed(user,candidates[0]!)||!accountingAccess(user,"GET",c.req.path))return c.json(error("FORBIDDEN"),403);
  // Intentionally no IP restriction for users: mobile internet and external networks work.
  try{return c.json({ok:true,data:{...await officeStatus(c.env.DB,candidates[0]!,officeRegistry(c.env.ISNET_OFFICE_REGISTRY_JSON)),mainCompanySlug:candidates[0],liveEndpoints:LIVE_ENDPOINTS,liveNotBefore:new Date(LIVE_NOT_BEFORE).toISOString()}})}catch{return c.json(error("OFFICE_STATUS_UNAVAILABLE"),503)}
 });
}
