import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingTenantCandidates,accountingTenantReadAllowed} from "./accounting-access-policy";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const str=(v:unknown)=>v==null?"":String(v).trim();
const code=(v:unknown)=>str(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const permittedModules=new Set(["DESEN","URETIM","IMALAT","BOYAHANE","MUHASEBE","E-BELGE","ILETISIM"]);
const privileged=new Set(["SUPER_ADMIN","ADMIN","OWNER","COMPANY_OWNER","COMPANY_ADMIN"]);
const granted=(v:unknown)=>v===true||v===1||v==="1";

// A model identity is needed by any participating department, but this endpoint
// NEVER grants access to another department's operational records or edits.
export function model360CanReadIdentity(user:Row|null|undefined){
 if(!user)return false;
 if(privileged.has(code(user.role)))return true;
 if(permittedModules.has(code(user.role)))return true;
 return (Array.isArray(user.permissions)?user.permissions:[]).some((p:Row)=>
   permittedModules.has(code(p.moduleKey||p.module_key))&&
   (granted(p.canView)||granted(p.can_view)||granted(p.canCreate)||granted(p.can_create)||granted(p.canUpdate)||granted(p.can_update)));
}
export function model360PublicIdentity(row:Row){
 let meta:Row={};
 try{const parsed=JSON.parse(str(row.raw)||"{}");if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))meta=parsed;}
 catch{}
 const img=str(row.image_url||meta.imageUrl||meta.modelImageUrl||meta.mainImage?.previewUrl||meta.mainImage?.thumbnailUrl);
 return {
   id:str(row.id),modelName:str(row.model_name),modelCode:str(row.model_code),
   companyId:str(row.company_id||row.customer_id),companyName:str(row.customer_name||meta.companyName),
   orderNo:str(row.order_no||meta.orderNo),status:str(row.status),imageUrl:img,
   source:"CANONICAL_MODEL_RECORDS",
 };
}
export function registerModel360IdentityRoutes(app:Hono<Env>){
 app.get("/api/model-360/:modelId/identity",async(c:Context<Env>)=>{
   const user=await getAuthenticatedUser(c) as Row|null;
   if(!user)return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
   if(!model360CanReadIdentity(user))
     return c.json({ok:false,error:{code:"MODEL_360_FORBIDDEN",message:"Model kartını görüntüleme yetkiniz yok."}},403);
   const candidates=accountingTenantCandidates(str(c.req.query("mainCompanySlug")),str(c.req.header("X-KYERP-Tenant-Slug")),{});
   if(candidates.length!==1||!accountingTenantReadAllowed(user,candidates[0]))
     return c.json({ok:false,error:{code:"MODEL_360_TENANT_FORBIDDEN",message:"Bu ana firmada model kartı görüntüleme yetkiniz yok."}},403);
   const id=str(c.req.param("modelId"));
   if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))
     return c.json({ok:false,error:{code:"MODEL_ID_INVALID",message:"Model kimliği geçersiz."}},400);
   const row=await c.env.DB.prepare(
     "SELECT * FROM model_records WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1"
   ).bind(candidates[0],id).first<Row>();
   if(!row)return c.json({ok:false,error:{code:"MODEL_NOT_FOUND",message:"Model kartı bulunamadı."}},404);
   c.header("Cache-Control","private, no-store");
   return c.json({ok:true,data:model360PublicIdentity(row)});
 });
}
