import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingTenantCandidates,accountingTenantReadAllowed} from "./accounting-access-policy";
import {model360CanReadIdentity,model360PublicIdentity} from "./model-360-identity-core";
import {model360CanonicalLineAudit} from "./model-360-document-lines-core";

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
 // Exact canonical model-line links only. Header-level associations and a line
 // shared by multiple models remain review-only; no quantity is guessed.
 app.get("/api/model-360/:modelId/document-lines",async(c:Context<Env>)=>{
   const user=await getAuthenticatedUser(c) as Row|null;
   if(!user||!model360CanReadIdentity(user))
     return c.json({ok:false,error:{code:"MODEL_360_FORBIDDEN",message:"Model kartı yetkiniz yok."}},403);
   const candidates=accountingTenantCandidates(str(c.req.query("mainCompanySlug")),str(c.req.header("X-KYERP-Tenant-Slug")),{});
   if(candidates.length!==1||!accountingTenantReadAllowed(user,candidates[0]))
     return c.json({ok:false,error:{code:"MODEL_360_TENANT_FORBIDDEN",message:"Ana firma erişimi reddedildi."}},403);
   const slug=candidates[0],id=str(c.req.param("modelId"));
   if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))
     return c.json({ok:false,error:{code:"MODEL_ID_INVALID",message:"Model kimliği geçersiz."}},400);
   const model=await c.env.DB.prepare("SELECT id,company_id,customer_id FROM model_records WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1").bind(slug,id).first<Row>();
   if(!model)return c.json({ok:false,error:{code:"MODEL_NOT_FOUND",message:"Kalıcı model kartı bulunamadı."}},404);
   const schema=(await c.env.DB.prepare('PRAGMA table_info("accounting_document_model_links")').all<Row>()).results||[];
   if(!schema.length){
     c.header("Cache-Control","private, no-store");
     return c.json({ok:true,data:{status:"SOURCE_UNAVAILABLE",totals:{received:null,shipped:null,invoiced:null},items:[],verifiedLineCount:0,reviewLineCount:0,linkedDocumentCount:0}});
   }
   const rows=(await c.env.DB.prepare(`
     SELECT d.id AS document_id,d.document_no,d.document_type,d.direction,d.party_company_id,
       l.id AS line_id,l.description,l.quantity,l.unit_code,x.model_id,
       (SELECT COUNT(DISTINCT x2.model_id) FROM accounting_document_model_links x2
        WHERE x2.main_company_slug=x.main_company_slug AND x2.document_id=x.document_id AND x2.document_line_id=x.document_line_id) AS link_count
     FROM accounting_document_model_links x
     JOIN accounting_documents d ON d.main_company_slug=x.main_company_slug AND d.id=x.document_id AND d.deleted_at IS NULL
     LEFT JOIN accounting_document_lines l ON l.main_company_slug=x.main_company_slug AND l.document_id=d.id AND l.id=x.document_line_id
     WHERE x.main_company_slug=? AND x.model_id=?
     ORDER BY d.issue_date DESC,d.document_no,l.line_no
     LIMIT 1501
   `).bind(slug,id).all<Row>()).results||[];
   const audit=model360CanonicalLineAudit(rows.slice(0,1500),str(model.company_id||model.customer_id),rows.length>1500);
   c.header("Cache-Control","private, no-store");
   return c.json({ok:true,data:audit});
 });
}
