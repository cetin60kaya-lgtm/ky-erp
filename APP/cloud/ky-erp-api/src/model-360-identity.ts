import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingTenantCandidates,accountingTenantReadAllowed} from "./accounting-access-policy";
import {model360CanReadIdentity,model360PublicIdentity} from "./model-360-identity-core";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const str=(v:unknown)=>v==null?"":String(v).trim();
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
