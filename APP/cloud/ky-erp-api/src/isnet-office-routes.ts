// Narrow heartbeat route, separate from user sessions and existing File Hub keys.
// No production send, arbitrary command, provider URL, document data or remote shell.
import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {selections} from "./e-belge-adapter-company-routes";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {authorizeOfficeDevice,heartbeatOfficeDevice,officeRegistry,officeStatus} from "./isnet-office-coordinator.ts";
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
   const result=await heartbeatOfficeDevice(c.env.DB,d);
   // A heartbeat or lease is never proof that the live provider is authorized.
   return c.json({ok:true,data:{...result,providerAuthorized:false,sendEnabled:false,pollAfterMs:30000}});
  }catch{return c.json(error("OFFICE_DEVICE_OR_STORAGE_DENIED"),403)}
 });
 app.get("/api/isnet/office/status",async c=>{
  c.header("Cache-Control","no-store");
  const candidates=accountingTenantCandidates(c.req.query("mainCompanySlug")||"",c.req.header("X-KYERP-Tenant-Slug")||"",{});
  const user=await getAuthenticatedUser(c);
  if(candidates.length!==1||!user||!accountingTenantReadAllowed(user,candidates[0]!)||!accountingAccess(user,"GET",c.req.path))return c.json(error("FORBIDDEN"),403);
  // Intentionally no IP restriction for users: mobile internet and external networks work.
  try{return c.json({ok:true,data:await officeStatus(c.env.DB,candidates[0]!,officeRegistry(c.env.ISNET_OFFICE_REGISTRY_JSON))})}catch{return c.json(error("OFFICE_STATUS_UNAVAILABLE"),503)}
 });
}
