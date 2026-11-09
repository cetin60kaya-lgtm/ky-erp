// @ts-nocheck
// Central model-card drop target for DESEN, IMALAT and MUHASEBE.
// Existing File Hub cloud connection and explicit writable bindings only.
// A file drop NEVER finalizes financial records or sends official documents.
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { archiveFileToCloudConnection, readFileHubAssetForMail } from "./file-hub-cloud-oauth";
import { syncFileHubDesignModel } from "./file-hub-design-sync";
import { archiveDocumentIdentity } from "./e-belge-document-automation.ts";
import { ingestIndexedFileHubEBelge } from "./e-belge-center-cloud.ts";

type AppEnv={ Bindings:Cloudflare.Env; Variables:{requestId:string} };
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR");
const stamp=()=>new Date().toISOString();
const err=(code:string,message:string)=>({ok:false,error:{code,message}});
const LIMIT=24*1024*1024;
const ROLE_TO_BINDING:Record<string,[string,string]>={
  INVOICE:["MUHASEBE","INVOICE"],
  DELIVERY_NOTE:["MUHASEBE","DELIVERY_NOTE"],
  MODEL_SOURCE:["DESEN","MODEL_SOURCE"],
  MODEL_IMAGE:["DESEN","MODEL_IMAGE"],
  PLACEMENT:["DESEN","PLACEMENT"],
};
function safeName(value:unknown){
  return text(value).replace(/[\\/:*?"<>|\x00-\x1f]+/g," ").replace(/\s+/g," ").replace(/^\.+/,"").trim().slice(0,120);
}
function chooseFile(fileName:string){
  const ext=upper(fileName.split(".").pop()),document=archiveDocumentIdentity(fileName);
  if(["PDF","XML"].includes(ext)&&document?.series==="HKN")return{role:"INVOICE",ext,document};
  if(["PDF","XML"].includes(ext)&&document?.series==="DDM")return{role:"DELIVERY_NOTE",ext,document};
  if(["PSD","PSB","AI","SVG","EPS","ZIP"].includes(ext))return{role:"MODEL_SOURCE",ext,document:null};
  if(["JPG","JPEG","PNG","WEBP"].includes(ext))return{role:"MODEL_IMAGE",ext,document:null};
  if(ext==="PDF")return{role:"PLACEMENT",ext,document:null};
  throw Object.assign(new Error("Bu dosya formatı model kartına otomatik ayrılamıyor."),{code:"FILE_TYPE_UNSUPPORTED",status:422});
}
function mime(ext:string) {
  return ({PDF:"application/pdf",XML:"application/xml",PSD:"image/vnd.adobe.photoshop",
    PSB:"application/octet-stream",AI:"application/postscript",SVG:"image/svg+xml",
    EPS:"application/postscript",ZIP:"application/zip",JPG:"image/jpeg",JPEG:"image/jpeg",
    PNG:"image/png",WEBP:"image/webp"} as Record<string,string>)[ext]||"application/octet-stream";
}
async function scope(c:Context<AppEnv>,moduleKey:string,write=false) {
  const user=await getAuthenticatedUser(c) as Row|null,slug=text(c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug"));
  if(!user||!slug)throw Object.assign(new Error("Model kartı için oturum ve ana firma gereklidir."),{code:"UNAUTHORIZED",status:401});
  const admin=["OWNER","COMPANY_OWNER","SUPER_ADMIN","ADMIN"].includes(upper(user.role));
  const own=text(user.mainCompanySlug||user.main_company_slug);
  if(!admin&&(!own||own!==slug))throw Object.assign(new Error("Başka firmanın model kartına erişilemez."),{code:"TENANT_FORBIDDEN",status:403});
  const permission=(Array.isArray(user.permissions)?user.permissions:[]).find((x:Row)=>upper(x.moduleKey||x.module_key)===moduleKey);
  if(!admin&&!(write?Boolean(permission?.canEdit??permission?.can_edit??permission?.canCreate??permission?.can_create):
    Boolean(permission?.canView??permission?.can_view)))throw Object.assign(new Error("Bu bölümde dosya yetkiniz yok."),{code:"MODULE_FORBIDDEN",status:403});
  return{slug,user};
}
async function model(c:Context<AppEnv>,slug:string,id:string){
  const row=await c.env.DB.prepare("SELECT id,model_name,model_code,company_id,customer_id,status,deleted_at FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(id,slug).first<Row>();
  if(!row)throw Object.assign(new Error("Kayıtlı model kartı bulunamadı."),{code:"MODEL_NOT_FOUND",status:404});
  return row;
}
async function binding(c:Context<AppEnv>,slug:string,role:string){
  const [module,purpose]=ROLE_TO_BINDING[role]||[];
  const rows=(await c.env.DB.prepare(
    "SELECT b.storage_connection_id,b.root_path,c.provider_type,c.sync_mode FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id AND c.main_company_slug=b.main_company_slug WHERE b.main_company_slug=? AND b.module_code=? AND b.purpose_code=? AND b.write_enabled=1 AND b.sync_enabled=1 AND c.is_active=1 AND c.sync_mode='CLOUD_API'"
  ).bind(slug,module,purpose).all<Row>()).results||[];
  if(rows.length!==1||!text(rows[0].root_path))
    throw Object.assign(new Error("Bu belge türü için tam bir yazılabilir Drive klasörü atanmalı. Orijinal dosya başka klasöre gönderilmedi."),{code:"ARCHIVE_BINDING_REQUIRED",status:409});
  if(upper(rows[0].provider_type)!=="GOOGLE_DRIVE")
    throw Object.assign(new Error("Üzerine yazmama güvencesi için bu otomatik yol şu anda Google Drive bağlantısında kullanılabilir."),{code:"GOOGLE_DRIVE_REQUIRED",status:409});
  return rows[0];
}
async function digest(buffer:ArrayBuffer){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",buffer));
  return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function upload(c:Context<AppEnv>,id:string){
  const {slug,user}=await scope(c,"DESEN",true);
  const m=await model(c,slug,id);
  if(upper(m.status)==="ARCHIVE")throw Object.assign(new Error("Arşiv modeline yeni dosya eklemek için önce kartı etkinleştirin."),{code:"ARCHIVED_MODEL",status:409});
  const form=await c.req.formData(),file=form.get("file");
  if(!(file instanceof File)||file.size<1||file.size>LIMIT)
    throw Object.assign(new Error("Boş dosya veya 24 MB üzeri dosya bu doğrudan yükleme yöntemiyle alınmaz."),{code:"FILE_SIZE_INVALID",status:413});
  const picked=chooseFile(file.name),role=picked.role,originalName=safeName(file.name);
  const target=await binding(c,slug,role);
  const modelName=safeName(m.model_name);
  if(!modelName)throw Object.assign(new Error("Model adı boş."),{code:"MODEL_NAME_REQUIRED",status:422});
  const buffer=await file.arrayBuffer(),sha=await digest(buffer);
  const duplicate=await c.env.DB.prepare(
    "SELECT a.id,a.file_name FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id AND a.main_company_slug=r.main_company_slug WHERE r.main_company_slug=? AND r.entity_type='MODEL' AND r.entity_id=? AND r.relation_type=? AND json_extract(a.metadata,'$.sha256')=? AND a.status='AVAILABLE' LIMIT 1"
  ).bind(slug,id,role,sha).first<Row>();
  if(duplicate)return{assetId:text(duplicate.id),fileName:text(duplicate.file_name),role,duplicate:true,archived:true};
  const stem=picked.document?picked.document.documentNo:
    safeName(file.name.replace(/\.[^.]+$/,""));
  const name=safeName(stem)+" "+modelName+"."+picked.ext.toLowerCase();
  const root=text(target.root_path).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
  const relativePath=root+"/"+name;
  // CREATE_ONLY. Existing Drive PDF is never changed, including if the archive has not been indexed.
  const stored=await archiveFileToCloudConnection(c,slug,text(target.storage_connection_id),{
    relativePath,fileName:name,mimeType:mime(picked.ext),bytes:buffer,noOverwrite:true,
  });
  const ts=stamp(),assetId=crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO file_hub_assets (id,main_company_slug,logical_key,file_name,extension,mime_type,size_bytes,status,source_type,preview_status,metadata,first_seen_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'AVAILABLE','CLOUD_API','NONE',?,?,?,?,?)")
    .bind(assetId,slug,"GOOGLE_DRIVE:"+text(target.storage_connection_id)+":"+text(stored.id),name,picked.ext,mime(picked.ext),file.size,
      JSON.stringify({provider:"GOOGLE_DRIVE",providerFileId:stored.id,sha256:sha,originalName:file.name,
        modelId:id,modelName:text(m.model_name),modelSelectedBy:text(user.id),createdFrom:"MODEL_CARD_DROP",webUrl:text(stored.webUrl)}),
      ts,ts,ts,ts).run();
  await c.env.DB.prepare("INSERT INTO file_hub_locations (id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'PRIMARY',1,?,?,?,?)")
    .bind(crypto.randomUUID(),slug,assetId,text(target.storage_connection_id),text(stored.id),relativePath,ts,ts,ts,ts).run();
  await c.env.DB.prepare("INSERT OR IGNORE INTO file_hub_relations (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,'MODEL_CARD_DROP',?,?,?)")
    .bind(crypto.randomUUID(),slug,assetId,"MODEL",id,role,JSON.stringify({originalName:file.name,sha256:sha}),ts,ts).run();
  let documentStatus="NOT_APPLICABLE",documentId="";
  if(role==="INVOICE"||role==="DELIVERY_NOTE"){
    try{
      const result=await ingestIndexedFileHubEBelge(c.env,slug,assetId);
      documentId=text(result.documentId);
      documentStatus="REVIEW_REQUIRED";
    }catch(error:any){documentStatus="NEEDS_REVIEW:"+text(error?.code||"PARSER_UNAVAILABLE");}
    await c.env.DB.prepare("UPDATE file_hub_assets SET metadata=json_set(metadata,'$.accountingImportState',?,'$.accountingImportUpdatedAt',?) WHERE id=? AND main_company_slug=?")
      .bind(documentId?"STAGED":"NEEDS_REVIEW",stamp(),assetId,slug).run();
  }else{
    await syncFileHubDesignModel(c,{slug,modelName:text(m.model_name),fileAssetId:assetId,
      purposeCode:role,extension:picked.ext,fileName:name,mimeType:mime(picked.ext),sizeBytes:file.size,
      sha256:sha,providerType:"GOOGLE_DRIVE",storageConnectionId:text(target.storage_connection_id),relativePath});
  }
  return{assetId,fileName:name,role,relativePath,documentId,documentStatus,archived:true,duplicate:false};
}
async function list(c:Context<AppEnv>,id:string){
  const {slug}=await scope(c,"DESEN",false);await model(c,slug,id);
  const rows=await c.env.DB.prepare(
    "SELECT a.id,a.file_name,a.extension,a.size_bytes,a.created_at,a.status,r.relation_type,l.relative_path, d.id document_id,d.document_no,d.status document_status FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id AND a.main_company_slug=r.main_company_slug LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.is_available=1 LEFT JOIN file_hub_relations dr ON dr.file_asset_id=a.id AND dr.main_company_slug=a.main_company_slug AND dr.entity_type='DOCUMENT' LEFT JOIN accounting_documents d ON d.id=dr.entity_id AND d.main_company_slug=dr.main_company_slug AND d.deleted_at IS NULL WHERE r.main_company_slug=? AND r.entity_type='MODEL' AND r.entity_id=? AND a.status='AVAILABLE' ORDER BY a.created_at DESC LIMIT 250"
  ).bind(slug,id).all<Row>();
  return (rows.results||[]).map((a:Row)=>({id:a.id,fileName:a.file_name,role:a.relation_type,
    relativePath:a.relative_path||"",size:Number(a.size_bytes||0),documentId:a.document_id||null,
    documentNo:a.document_no||null,documentStatus:a.document_status||null,createdAt:a.created_at}));
}
export function registerModelFileTransferRoutes(app:Hono<AppEnv>){
  app.get("/api/model-files/:modelId",async c=>{
    try{return c.json({ok:true,data:await list(c,c.req.param("modelId"))});}
    catch(e:any){return c.json(err(text(e.code)||"MODEL_FILES_FAILED",text(e.message)),Number(e.status)||409);}
  });
  app.post("/api/model-files/:modelId/upload",async c=>{
    try{return c.json({ok:true,data:await upload(c,c.req.param("modelId"))});}
    catch(e:any){return c.json(err(text(e.code)||"MODEL_UPLOAD_FAILED",text(e.message)||"Dosya yüklenemedi."),Number(e.status)||409);}
  });
  app.get("/api/model-files/:modelId/file/:fileId",async c=>{
    try{
      const {slug}=await scope(c,"DESEN",false),id=c.req.param("modelId"),assetId=c.req.param("fileId");
      await model(c,slug,id);
      const linked=await c.env.DB.prepare("SELECT id FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' AND entity_id=? LIMIT 1")
        .bind(slug,assetId,id).first<Row>();
      if(!linked)throw Object.assign(new Error("Dosya bu modele bağlı değil."),{code:"FILE_FORBIDDEN",status:404});
      const item=await readFileHubAssetForMail(c,slug,assetId,25*1024*1024);
      return new Response(item.bytes,{headers:{"Content-Type":item.mimeType,"Content-Disposition":"inline; filename*=UTF-8''"+encodeURIComponent(item.fileName),"Cache-Control":"private,no-store"}});
    }catch(e:any){return c.json(err(text(e.code)||"FILE_DOWNLOAD_FAILED",text(e.message)),Number(e.status)||409);}
  });
}
