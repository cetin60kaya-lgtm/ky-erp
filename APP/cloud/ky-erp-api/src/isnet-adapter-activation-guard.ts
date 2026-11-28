import type {Context,Next} from "hono";
import {isOfficeNativeRequest} from "./isnet-office-routes";
import {accountingTenantCandidates} from "./accounting-access-policy";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const configuredPath=(path:string)=>/^\/api\/isnet\/(?:settings|connection|business-settings)(?:\/|$)/.test(path);

/** Provider-affecting mutations stop when the company turns off or removes ISNET.
 * Configuration/login tests remain available to reactivate a paused connection.
 * Legacy tenants with no explicit adapter selection retain their existing behavior.
 */
export async function enforceIsnetAdapterActivation(c:Context<Env>,next:Next){
 const method=c.req.method.toUpperCase(),path=c.req.path;
 if(isOfficeNativeRequest(path,method)||["GET","HEAD","OPTIONS"].includes(method)||configuredPath(path))return next();
 let body:Row={};
 if((c.req.header("Content-Type")||"").includes("json")){
  try{body=(await c.req.raw.clone().json()) as Row}catch{/* Called route handles its bad body. */}
 }
 const candidates=accountingTenantCandidates(
  clean(c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")),
  clean(c.req.header("X-KYERP-Tenant-Slug")),body
 );
 if(candidates.length!==1)return c.json({ok:false,error:{code:"TENANT_CONFLICT",message:"İşNet işleminde firma kapsamı belirsiz veya çelişkili."}},403);
 try{
  const row=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope='EBELGE_TENANT_ADAPTER_SELECTION_V1' AND main_company_slug=? AND file_name='ISNET' "+
   "ORDER BY CASE WHEN id LIKE 'EBELGE_ADAPTER_SELECTION_V1:%' THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 1"
  ).bind(candidates[0]).first<Row>();
  if(row){
   let state:Row={};
   try{state=JSON.parse(clean(row.data))}catch{/* Fail closed. */}
   if(state.selected!==true||state.enabled===false)return c.json({ok:false,error:{
    code:"ISNET_ADAPTER_INACTIVE",message:"İşNet bu firma için pasif veya kaldırılmış. İşlem öncesi Entegrasyon Merkezi'nden etkinleştirin."
   }},409);
  }
 }catch{return c.json({ok:false,error:{code:"ISNET_ADAPTER_STATE_UNAVAILABLE",message:"Firma İşNet kullanım durumu doğrulanamadı."}},503)}
 return next();
}
