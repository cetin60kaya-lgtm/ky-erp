import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantCandidates,accountingTenantReadAllowed} from "./accounting-access-policy";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const SCOPE="EBELGE_ACCOUNTING_PRINT_V1";
const clean=(v:unknown)=>String(v??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
const idValid=(id:string)=>/^[A-Za-z0-9_-]{8,72}$/.test(id);
const asObject=(v:unknown):Row=>{try{const p=JSON.parse(clean(v));return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
function defaultState(v:Row={}){
 const printed=v.status==="PRINTED"&&Boolean(v.printedAt);
 return {status:printed?"PRINTED":"PENDING",
  printedAt:printed?clean(v.printedAt):null,
  printedBy:printed?clean(v.printedBy):null,
  resetAt:v.resetAt?clean(v.resetAt):null,
  updatedAt:v.updatedAt?clean(v.updatedAt):null};
}
async function authorized(c:Context<Env>,method:"GET"|"PATCH",body:Row={}):Promise<{error?:Response;slug?:string;user?:Row}>{
 const slugs=accountingTenantCandidates(
  clean(c.req.query("mainCompanySlug")),clean(c.req.header("X-KYERP-Tenant-Slug")),body);
 const slug=slugs.length===1?slugs[0]:"";
 const user=await getAuthenticatedUser(c) as Row|null;
 if(!user?.id)return {error:c.json(fail("UNAUTHORIZED","Muhasebe oturumu gerekli."),401)};
 if(!slug||!accountingTenantReadAllowed(user,slug)||
  !accountingAccess(user,method,c.req.path))
  return {error:c.json(fail("FORBIDDEN","Seçili firmada muhasebe çıktı yetkisi bulunamadı."),403)};
 return {slug,user};
}
export function registerEBelgeAccountingPrintRoutes(app:Hono<Env>){
 // Bulk state read is limited to the same tenant's incoming invoice documents.
 app.get("/api/e-belge/accounting-print-status",async c=>{
  const auth=await authorized(c,"GET");
  if(auth.error)return auth.error;
  const slug=auth.slug as string;
  const ids=[...new Set(clean(c.req.query("ids")).split(",").filter(Boolean))];
  if(ids.length>100||ids.some(id=>!idValid(id)))
   return c.json(fail("INVALID_IDS","Geçerli en fazla 100 belge numarası seçilmelidir."),400);
  if(!ids.length)return c.json({ok:true,data:{statuses:{}}});
  const placeholders=ids.map(()=>"?").join(",");
  const rows=(await c.env.DB.prepare(`SELECT d.id,j.data
    FROM accounting_documents d
    LEFT JOIN json_store j ON j.id=?
       || d.main_company_slug || ':' || d.id
       AND j.scope=? AND j.main_company_slug=d.main_company_slug
    WHERE d.main_company_slug=? AND d.deleted_at IS NULL
    AND d.direction='INCOMING' AND d.document_type LIKE '%FATURA%'
    AND d.id IN (${placeholders})`)
   .bind(SCOPE+":",SCOPE,slug,...ids).all<Row>()).results||[];
  const statuses:Row={};
  for(const row of rows)statuses[clean(row.id)]=defaultState(asObject(row.data));
  return c.json({ok:true,data:{statuses}});
 });
 // Opening a PDF/print dialog never changes this flag; only explicit manual confirmation does.
 app.patch("/api/e-belge/documents/:id/accounting-print",async c=>{
  const body=await c.req.json<Row>().catch(():Row=>({}));
  const auth=await authorized(c,"PATCH",body);
  if(auth.error)return auth.error;
  const slug=auth.slug as string,user=auth.user as Row,id=clean(c.req.param("id"));
  if(!idValid(id))return c.json(fail("INVALID_ID","Geçersiz belge kimliği."),400);
  if(body.confirmed!==true||!["MARK_PRINTED","RESET_PENDING"].includes(clean(body.action)))
   return c.json(fail("CONFIRM_REQUIRED","Gerçek baskı sonrası açık onay gerekir."),400);
  const doc=await c.env.DB.prepare(`SELECT id,document_no,direction,document_type
   FROM accounting_documents WHERE id=? AND main_company_slug=?
   AND deleted_at IS NULL LIMIT 1`).bind(id,slug).first<Row>();
  if(!doc)return c.json(fail("NOT_FOUND","Belge bulunamadı."),404);
  if(clean(doc.direction)!=="INCOMING"||!/FATURA|ARSIV|INVOICE|IADE/i.test(clean(doc.document_type)))
   return c.json(fail("INCOMING_INVOICE_ONLY","Muhasebe tek çıktı takibi sadece gelen faturalarda tutulur."),409);
  const key=SCOPE+":"+slug+":"+id;
  const existing=await c.env.DB.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=? LIMIT 1")
    .bind(key,SCOPE,slug).first<Row>();
  const old=asObject(existing?.data),already=old.status==="PRINTED"&&Boolean(old.printedAt);
  const action=clean(body.action);
  if(action==="MARK_PRINTED"&&already)
   return c.json({ok:true,data:{...defaultState(old),alreadyMarked:true}});
  if(action==="RESET_PENDING"&&!already)
   return c.json({ok:true,data:{...defaultState(old),alreadyPending:true}});
  const reason=clean(body.reason);
  if(action==="RESET_PENDING"&&(reason.length<6||reason.length>300))
   return c.json(fail("RESET_REASON_REQUIRED","Çıktı işaretini geri almak için en az 6 karakterlik gerekçe yazın."),400);
  const at=new Date().toISOString(),who=clean(user.id);
  const history=Array.isArray(old.history)?old.history:[];
  const next:Row={status:action==="MARK_PRINTED"?"PRINTED":"PENDING",
   printedAt:action==="MARK_PRINTED"?at:null,printedBy:action==="MARK_PRINTED"?who:null,
   resetAt:action==="RESET_PENDING"?at:old.resetAt||null,
   updatedAt:at,documentId:id,documentNo:clean(doc.document_no),
   history:[...history,{action,at,by:who,...(reason?{reason}:{})}]};
  await c.env.DB.prepare(`INSERT INTO json_store
    (id,scope,main_company_slug,file_name,data,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
   .bind(key,SCOPE,slug,id,JSON.stringify(next),at,at).run();
  return c.json({ok:true,data:{...defaultState(next),documentId:id,
    message:action==="MARK_PRINTED"
     ?"Muhasebe çıktısı kullanıcının onayıyla alındı olarak işaretlendi."
     :"Çıktı işareti gerekçeyle bekliyor durumuna döndürüldü."}});
 });
}
