import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {defaultAdapterProfile,normalizeAdapterProfile} from "./e-belge-adapter-profile-core";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const scope="EBELGE_ADAPTER_PROFILE_V1";
const txt=(v:unknown)=>String(v??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
function tenantOf(c:Context<Env>,body:Row={}){
 const candidates=accountingTenantCandidates(
  txt(c.req.query("mainCompanySlug")),txt(c.req.header("X-KYERP-Tenant-Slug")),body);
 return candidates.length===1?candidates[0]:"";
}
async function authorized(c:Context<Env>,method:"GET"|"PUT",body:Row={}){
 const tenant=tenantOf(c,body),user=await getAuthenticatedUser(c);
 return tenant&&user&&accountingTenantReadAllowed(user,tenant)&&accountingAccess(user,method,c.req.path)?tenant:"";
}
export function registerEBelgeAdapterProfileRoutes(app:Hono<Env>){
 app.get("/api/e-belge/adapters/profile/:key",async c=>{
  const tenant=await authorized(c,"GET");
  if(!tenant)return c.json(fail("FORBIDDEN","Bu firmanın entegrasyon ayarlarına erişim izniniz yok."),403);
  const key=txt(c.req.param("key")).toUpperCase(),defaults=defaultAdapterProfile(key);
  if(!defaults)return c.json(fail("UNKNOWN_ADAPTER","Bilinmeyen entegrasyon."),404);
  const row=await c.env.DB.prepare(
   "SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? ORDER BY updated_at DESC LIMIT 1"
  ).bind(scope,tenant,key).first<Row>();
  try{return c.json({ok:true,data:{
   ...normalizeAdapterProfile(key,row?.data?JSON.parse(txt(row.data)):{}),
   customized:Boolean(row),
  }})}catch{return c.json({ok:true,data:{...defaults,customized:false,
    warning:"Kaydedilmiş eski profil okunamadı; sistem varsayılanları gösteriliyor."}})}
 });
 app.put("/api/e-belge/adapters/profile/:key",async c=>{
  const body:Row=await c.req.json<Row>().catch(():Row=>({}));
  const tenant=await authorized(c,"PUT",body);
  if(!tenant)return c.json(fail("FORBIDDEN","Bu firmanın entegrasyon ayarlarını düzenleme yetkiniz yok."),403);
  const key=txt(c.req.param("key")).toUpperCase();
  if(!defaultAdapterProfile(key))return c.json(fail("UNKNOWN_ADAPTER","Bilinmeyen entegrasyon."),404);
  // Reject secrets, executable code, headers and arbitrary provider endpoint mappings.
  const allowed=new Set(["displayName","serviceUrl","defaultDays","workflow","output","fileNamePattern","description","mainCompanySlug"]);
  if(Object.keys(body).some(k=>!allowed.has(k)))
   return c.json(fail("UNSUPPORTED_FIELD","Yalnız tanımlı çalışma tercihleri kaydedilebilir; şifre/token veya program kodu bu alana yazılamaz."),400);
  let profile;
  try{profile=normalizeAdapterProfile(key,body)}catch(e:any){
   return c.json(fail(txt(e?.message)||"INVALID_PROFILE","Entegrasyon profili geçersiz. URL güvenli HTTPS sağlayıcı adresi olmalı; gün aralığı 1–31 olmalı."),400);
  }
  const ts=new Date().toISOString();
  await c.env.DB.prepare(
   "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) "+
   "ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at"
  ).bind("EBELGE_ADAPTER_PROFILE_V1:"+tenant+":"+key,scope,tenant,key,
   JSON.stringify({...profile,updatedAt:ts}),ts,ts).run();
  return c.json({ok:true,data:{...profile,customized:true,updatedAt:ts,
   message:"Entegrasyon çalışma tercihleri kaydedildi. Bu kayıt bağlantı motorunu veya yetkiyi otomatik olarak etkinleştirmez."}});
 });
}
