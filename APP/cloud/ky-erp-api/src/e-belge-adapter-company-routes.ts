import type { Context,Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates } from "./accounting-access-policy";
import { EBELGE_ADAPTERS,getEBELGEAdapter,classifyAdapterInstallation,decodeEBelgeSelections } from "./e-belge-adapter-registry";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const SCOPE="EBELGE_TENANT_ADAPTER_SELECTION_V1";
const clean=(v:unknown)=>String(v??"").trim();
const error=(code:string,message:string)=>({ok:false,error:{code,message}});
function requestedTenant(c:Context<Env>,body:Row={}) {
 const candidates=accountingTenantCandidates(
  clean(c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")),
  clean(c.req.header("X-KYERP-Tenant-Slug")),body);
 return candidates.length===1?candidates[0]:null;
}
async function permit(c:Context<Env>,method:"GET"|"PUT",body:Row={}) {
 const tenant=requestedTenant(c,body),user=await getAuthenticatedUser(c);
 if(!user||!tenant||!accountingTenantReadAllowed(user,tenant)||!accountingAccess(user,method,c.req.path))return {ok:false,tenant:""};
 return {ok:true,tenant};
}
async function selections(c:Context<Env>,tenant:string):Promise<Record<string,boolean>> {
 const rows=await c.env.DB.prepare(
  "SELECT id,file_name,data FROM json_store WHERE scope=? AND main_company_slug=? "+
  "ORDER BY CASE WHEN id LIKE 'EBELGE_ADAPTER_SELECTION_V1:%' THEN 0 ELSE 1 END, updated_at DESC, id DESC"
 ).bind(SCOPE,tenant).all<Row>();
 return decodeEBelgeSelections(rows.results||[]);
}
/** Company enabled state changes ONLY selection; never deletes documents,
 * provider credentials, system adapter code, archives or saved settings.
 */
export function registerEBelgeAdapterCompanyRoutes(app:Hono<Env>) {
 app.get("/api/e-belge/adapters",async c=>{
  const access=await permit(c,"GET");
  if(!access.ok)return c.json(error("FORBIDDEN","Bu firma için entegrasyon kataloğuna erişim yetkiniz yok."),403);
  const selected=await selections(c,access.tenant);
  return c.json({ok:true,data:{
   mainCompanySlug:access.tenant,
   systemCatalog:EBELGE_ADAPTERS,
   companyAdapters:EBELGE_ADAPTERS.map(adapter=>({
    key:adapter.key,selected:selected[adapter.key]===true,
    ...classifyAdapterInstallation(adapter.key,selected[adapter.key]===true),
   })),
  }});
 });
 app.put("/api/e-belge/adapters/:adapterKey",async c=>{
  const body:Row=await c.req.json<Row>().catch(():Row=>({}));
  const access=await permit(c,"PUT",body);
  if(!access.ok)return c.json(error("FORBIDDEN","Bu firma için adaptör ekleme/kaldırma yetkiniz yok."),403);
  const adapter=getEBELGEAdapter(c.req.param("adapterKey"));
  if(!adapter)return c.json(error("UNKNOWN_ADAPTER","Adaptör sistem kataloğunda kayıtlı değil."),404);
  if(typeof body.selected!=="boolean")
   return c.json(error("INVALID_SELECTION","Adaptörü eklemek veya kaldırmak için açık seçim gerekir."),400);
  const ts=new Date().toISOString();
  // Stable primary key prevents concurrent first-time PUTs from creating duplicate rows.
  // Historical UUID rows remain untouched; reads prefer the new canonical row.
  const stableId=`EBELGE_ADAPTER_SELECTION_V1:${access.tenant}:${adapter.key}`;
  const state={key:adapter.key,selected:body.selected,updatedAt:ts,
    updatedBy:(await getAuthenticatedUser(c))?.id||null};
  await c.env.DB.prepare(
    "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) "+
    "VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at"
  ).bind(stableId,SCOPE,access.tenant,adapter.key,JSON.stringify(state),ts,ts).run();
  return c.json({ok:true,data:{...state,...classifyAdapterInstallation(adapter.key,body.selected),
   message:body.selected
    ? "Adaptör firma listesine eklendi. Gerçek bağlantı ve yetki ayrıca doğrulanır."
    : "Adaptör firma listesinden kaldırıldı. Belgeler, bağlantı ayarları ve sistem adaptörü korunur.",
  }});
 });
}
