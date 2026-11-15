import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed,accountingTenantCandidates} from "./accounting-access-policy";
import {readFileHubAssetForMail} from "./file-hub-cloud-oauth";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
const SCOPE="EBELGE_MODEL_DOCUMENT_LINK_V1";
const idOk=(v:unknown)=>/^[a-zA-Z0-9_-]{8,72}$/.test(clean(v));
const isDocType=(v:unknown)=>/FATURA|INVOICE|ARSIV|IRSALIYE|DISPATCH|DESPATCH/i.test(clean(v));
const parse=(v:unknown):Row=>{try{const p=JSON.parse(clean(v));return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
function tenant(c:Context<Env>,body:Row={}){
 const x=accountingTenantCandidates(clean(c.req.query("mainCompanySlug")),clean(c.req.header("X-KYERP-Tenant-Slug")),body);
 return x.length===1?x[0]:"";
}
async function authorized(c:Context<Env>,method:"GET"|"POST",body:Row={}){
 const slug=tenant(c,body),user=await getAuthenticatedUser(c) as Row|null;
 const read=["GET"].includes(method);
 if(!slug||!user||!accountingTenantReadAllowed(user,slug)||
    !accountingAccess(user,method,c.req.path))
  throw Object.assign(new Error("Belge ve model eşleştirme yetkiniz yok."),{code:"FORBIDDEN",status:403});
 const admin=["SUPER_ADMIN","ADMIN","OWNER","COMPANY_ADMIN","COMPANY_OWNER"].includes(clean(user.role).toUpperCase());
 const modelAccess=admin||(Array.isArray(user.permissions)&&user.permissions.some((x:Row)=>
   ["DESEN","IMALAT","BOYAHANE"].includes(clean(x.moduleKey||x.module_key).toUpperCase())&&
   (x.canView===true||x.can_view===true||x.canView===1)));
 if(!modelAccess)throw Object.assign(new Error("Model kartına erişim yetkiniz yok."),{code:"MODEL_FORBIDDEN",status:403});
 return{slug,user,read};
}
async function getModel(c:Context<Env>,slug:string,id:string){
 if(!idOk(id))throw Object.assign(new Error("Model kimliği geçersiz."),{code:"INVALID_MODEL",status:400});
 const row=await c.env.DB.prepare(
  "SELECT id,model_name,model_code,company_id,customer_id,status FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1"
 ).bind(id,slug).first<Row>();
 if(!row)throw Object.assign(new Error("Model bulunamadı."),{code:"MODEL_NOT_FOUND",status:404});
 return row;
}
async function getDoc(c:Context<Env>,slug:string,id:string){
 if(!idOk(id))throw Object.assign(new Error("Belge kimliği geçersiz."),{code:"INVALID_DOCUMENT",status:400});
 const row=await c.env.DB.prepare(
  "SELECT id,document_no,direction,document_type,party_name,party_company_id,issue_date,status,uuid,xml_file_asset_id,pdf_file_asset_id,file_asset_id,raw_metadata FROM accounting_documents WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1"
 ).bind(slug,id).first<Row>();
 if(!row||!isDocType(row.document_type))throw Object.assign(new Error("Geçerli fatura/irsaliye bulunamadı."),{code:"DOCUMENT_NOT_FOUND",status:404});
 return row;
}
function sameCompany(model:Row,doc:Row){
 const modelCompany=clean(model.company_id||model.customer_id),docCompany=clean(doc.party_company_id);
 return !modelCompany||!docCompany||modelCompany===docCompany;
}
const readSql=`SELECT d.id,d.document_no,d.document_type,d.direction,d.party_name,d.party_company_id,
 d.issue_date,d.status,d.uuid,d.xml_file_asset_id,d.pdf_file_asset_id,d.file_asset_id,d.raw_metadata
 FROM accounting_documents d
 WHERE d.main_company_slug=? AND d.deleted_at IS NULL
 AND (
  EXISTS (SELECT 1 FROM json_store j WHERE j.scope='EBELGE_MODEL_DOCUMENT_LINK_V1'
   AND j.main_company_slug=d.main_company_slug AND j.file_name=?
   AND json_extract(CASE WHEN json_valid(j.data) THEN j.data ELSE '{}' END,'$.documentId')=d.id)
  OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(d.raw_metadata) THEN d.raw_metadata ELSE '{}' END,'$.modelIds') m
   WHERE CAST(m.value AS TEXT)=?)
  OR EXISTS(SELECT 1 FROM file_hub_relations dr
   JOIN file_hub_relations mr ON mr.file_asset_id=dr.file_asset_id AND mr.main_company_slug=dr.main_company_slug
   WHERE dr.main_company_slug=d.main_company_slug AND dr.entity_type='DOCUMENT' AND dr.entity_id=d.id
    AND mr.entity_type='MODEL' AND mr.entity_id=? AND mr.relation_type IN ('INVOICE','DELIVERY_NOTE'))
 ) ORDER BY COALESCE(d.issue_date,d.created_at) DESC LIMIT 200`;
function summarize(row:Row,model:Row,related=false){
 const raw=parse(row.raw_metadata);
 const models=Array.isArray(raw.modelIds)?raw.modelIds.map(clean):[];
 const modelId=clean(model.id),kind=/IRSALIYE|DISPATCH|DESPATCH/i.test(clean(row.document_type))?"IRSALIYE":"FATURA";
 const linkedIds=[...new Set([clean(row.xml_file_asset_id),clean(row.pdf_file_asset_id),clean(row.file_asset_id)].filter(Boolean))];
 return{
  id:clean(row.id),number:clean(row.document_no),kind,
  direction:clean(row.direction),company:clean(row.party_name),
  date:clean(row.issue_date),status:clean(row.status),uuid:clean(row.uuid),
  linkedBy:related?"RELATED_DOCUMENT":models.includes(modelId)?"MODEL_LINE_OR_DOCUMENT":"EXPLICIT_OR_FILE",
  files:linkedIds.map(id=>({assetId:id,role:id===clean(row.xml_file_asset_id)?"XML":id===clean(row.pdf_file_asset_id)?"PDF":"EK"})),
  relatedDocuments:[] as Row[]
 };
}
async function loadRows(c:Context<Env>,slug:string,model:Row){
 const first=(await c.env.DB.prepare(readSql).bind(slug,model.id,model.id,model.id).all<Row>()).results||[];
 const primary=first.filter(d=>sameCompany(model,d)&&isDocType(d.document_type));
 if(!primary.length)return[];
 const seen=new Set(primary.map(x=>clean(x.id)));
 const sourceIds=[...seen].slice(0,150),ph=sourceIds.map(()=>"?").join(",");
 const related=(await c.env.DB.prepare(`SELECT r.document_id,r.related_document_id
 FROM accounting_document_relations r WHERE r.main_company_slug=?
 AND (r.document_id IN (${ph}) OR r.related_document_id IN (${ph}))
 LIMIT 400`).bind(slug,...sourceIds,...sourceIds).all<Row>()).results||[];
 const crossIds=[...new Set(related.flatMap(r=>[clean(r.document_id),clean(r.related_document_id)]))].filter(id=>!seen.has(id)).slice(0,130);
 const counterpart=crossIds.length?(await c.env.DB.prepare(`SELECT id,document_no,document_type,direction,party_name,party_company_id,
 issue_date,status,uuid,xml_file_asset_id,pdf_file_asset_id,file_asset_id,raw_metadata
 FROM accounting_documents WHERE main_company_slug=? AND deleted_at IS NULL AND id IN (${crossIds.map(()=>"?").join(",")})`)
 .bind(slug,...crossIds).all<Row>()).results||[]:[];
 const allRows=[...primary,...counterpart.filter(d=>sameCompany(model,d)&&isDocType(d.document_type))];
 const assetIds=[...new Set(allRows.flatMap(d=>[
  clean(d.xml_file_asset_id),clean(d.pdf_file_asset_id),clean(d.file_asset_id)
 ]).filter(Boolean))].slice(0,900);
 const locations=assetIds.length?(await c.env.DB.prepare(`SELECT file_asset_id,relative_path,
 storage_connection_id FROM file_hub_locations WHERE main_company_slug=? AND is_available=1
 AND file_asset_id IN (${assetIds.map(()=>"?").join(",")}) ORDER BY CASE WHEN location_role='PRIMARY' THEN 0 ELSE 1 END`)
 .bind(slug,...assetIds).all<Row>()).results||[]:[];
 const pathByAsset=new Map<string,string>();
 for(const loc of locations)if(!pathByAsset.has(clean(loc.file_asset_id)))pathByAsset.set(clean(loc.file_asset_id),clean(loc.relative_path));
 const result=allRows.map(d=>{
  const link=summarize(d,model,!seen.has(clean(d.id)));
  link.files=link.files.map(f=>({...f,relativePath:pathByAsset.get(f.assetId)||"",locationStatus:pathByAsset.has(f.assetId)?"FILE_HUB":"ARCHIVE_PENDING"}));
  link.relatedDocuments=related.filter(r=>clean(r.document_id)===link.id||clean(r.related_document_id)===link.id)
  .map(r=>({id:clean(r.document_id)===link.id?clean(r.related_document_id):clean(r.document_id)}));
  return link;
 });
 return result;
}
export function registerModelDocumentCenterRoutes(app:Hono<Env>){
 app.get("/api/model-files/:modelId/document-center",async c=>{
  try{
   const{slug}=await authorized(c,"GET"),model=await getModel(c,slug,c.req.param("modelId"));
   const rows=await loadRows(c,slug,model);
   return c.json({ok:true,data:{
    modelId:model.id,modelName:model.model_name,items:rows,
    stats:{incomingInvoices:rows.filter(r=>r.direction==="INCOMING"&&r.kind==="FATURA").length,
      outgoingInvoices:rows.filter(r=>r.direction==="OUTGOING"&&r.kind==="FATURA").length,
      incomingDispatches:rows.filter(r=>r.direction==="INCOMING"&&r.kind==="IRSALIYE").length,
      outgoingDispatches:rows.filter(r=>r.direction==="OUTGOING"&&r.kind==="IRSALIYE").length},
    source:"D1_ACCOUNTING_DOCUMENTS_AND_FILE_HUB",copied:0
   }});
  }catch(e:any){return c.json(fail(clean(e.code)||"DOCUMENT_CENTER_FAILED",clean(e.message)),Number(e.status)||409)}
 });
 app.get("/api/model-files/:modelId/document-candidates",async c=>{
  try{
   const{slug}=await authorized(c,"GET"),model=await getModel(c,slug,c.req.param("modelId"));
   const q=clean(c.req.query("q"));
   if(q.length<2||q.length>80)return c.json(fail("SEARCH_TOO_SHORT","Belge numarasından en az iki karakter girin."),400);
   const rows=(await c.env.DB.prepare(`SELECT id,document_no,document_type,direction,party_name,party_company_id,issue_date,status
    FROM accounting_documents WHERE main_company_slug=? AND deleted_at IS NULL AND
    document_no LIKE ? AND (party_company_id IS NULL OR ?='' OR party_company_id=?)
    ORDER BY COALESCE(issue_date,created_at) DESC LIMIT 30`)
    .bind(slug,"%"+q.replace(/[%_]/g,"") +"%",clean(model.company_id||model.customer_id),clean(model.company_id||model.customer_id)).all<Row>()).results||[];
   return c.json({ok:true,data:rows.filter(r=>isDocType(r.document_type)&&sameCompany(model,r)).map(r=>({
    id:r.id,number:r.document_no,type:r.document_type,direction:r.direction,party:r.party_name,date:r.issue_date,status:r.status
   }))});
  }catch(e:any){return c.json(fail(clean(e.code)||"SEARCH_FAILED",clean(e.message)),Number(e.status)||409)}
 });
 app.post("/api/model-files/:modelId/documents/:documentId/link",async c=>{
  const body:Row=await c.req.json<Row>().catch(():Row=>({}));
  try{
   const{slug}=await authorized(c,"POST",body);
   const id=clean(c.req.param("documentId")),base=clean(c.req.param("modelId"));
   const doc=await getDoc(c,slug,id);
   const ids=[...new Set([base,...(Array.isArray(body.modelIds)?body.modelIds:[])].map(clean))];
   if(ids.length<1||ids.length>20||ids.some(x=>!idOk(x)))
    return c.json(fail("MODEL_LIMIT","Bir belge en fazla 20 doğrulanmış modele bağlanabilir."),400);
   const models=await Promise.all(ids.map(mid=>getModel(c,slug,mid)));
   if(models.some(model=>!sameCompany(model,doc)))
    return c.json(fail("MODEL_COMPANY_CONFLICT","Belgenin karşı firması ile seçilen modelin firması uyuşmuyor; yanlış eşleşme engellendi."),409);
   const at=new Date().toISOString();
   const stmts=models.map(m=>c.env.DB.prepare(
    "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at"
   ).bind("EBELGE_MODEL_DOCUMENT_LINK_V1:"+slug+":"+clean(m.id)+":"+id,SCOPE,slug,clean(m.id),
    JSON.stringify({modelId:clean(m.id),documentId:id,source:"USER_CONFIRMED",at}),at,at));
   await c.env.DB.batch(stmts);
   return c.json({ok:true,data:{documentId:id,modelIds:models.map(m=>clean(m.id)),copied:0,
    message:"Belge tek kayıt olarak seçilen modellere bağlandı. PDF/XML taşınmadı ve muhasebe kaydı değiştirilmedi."}});
  }catch(e:any){return c.json(fail(clean(e.code)||"LINK_FAILED",clean(e.message)),Number(e.status)||409)}
 });
 app.get("/api/model-files/:modelId/documents/:documentId/file/:kind",async c=>{
  try{
   const{slug}=await authorized(c,"GET"),model=await getModel(c,slug,c.req.param("modelId"));
   const documentId=clean(c.req.param("documentId")),kind=clean(c.req.param("kind")).toUpperCase();
   if(!["XML","PDF"].includes(kind))return c.json(fail("FILE_KIND_INVALID","Yalnız XML veya PDF açılabilir."),400);
   const docs=await loadRows(c,slug,model);
   if(!docs.some(d=>d.id===documentId))return c.json(fail("FILE_NOT_LINKED","Belge bu modele bağlı değil."),404);
   const doc=await getDoc(c,slug,documentId);
   const assetId=clean(kind==="XML"?doc.xml_file_asset_id:doc.pdf_file_asset_id);
   if(!assetId)return c.json(fail("FILE_PENDING","Bu belge için "+kind+" dosyası henüz arşivde bulunmuyor."),404);
   const file=await readFileHubAssetForMail(c,slug,assetId,25*1024*1024);
   const type=kind==="XML"?"application/xml":"application/pdf";
   if(kind==="PDF"&&!/pdf/i.test(clean(file.mimeType)))return c.json(fail("FILE_MIME_MISMATCH","PDF kaynak türü doğrulanamadı."),409);
   if(kind==="XML"&&!/xml/i.test(clean(file.mimeType)))return c.json(fail("FILE_MIME_MISMATCH","XML kaynak türü doğrulanamadı."),409);
   return new Response(file.bytes,{headers:{"Content-Type":type,
    "Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(clean(doc.document_no)||"BELGE")+"."+kind.toLowerCase(),
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(e:any){return c.json(fail(clean(e.code)||"FILE_READ_FAILED",clean(e.message)),Number(e.status)||409)}
 });
}
