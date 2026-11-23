// @ts-nocheck
/**
 * Denetim Merkezi — firma File Hub fiziksel atama denetimi ve mevcut orijinal dosya bağlantısı.
 * Mevcut Drive dosyasını taşımaz/kopyalamaz; yetkili kişinin açık seçimiyle kanıt kaydına iliştirir.
 */
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { streamComplianceFileHubAsset } from "./file-hub-cloud-oauth";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>txt(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const lower=(v:unknown)=>txt(v).toLocaleLowerCase("tr-TR");
const parse=(v:unknown)=>{if(v&&typeof v==="object")return v;try{return JSON.parse(txt(v)||"{}")}catch{return {}}};
const fail=(code:string,message:string)=>({ok:false,success:false,error:{code,message}});
const purposes=[
 ["AUDIT_EVIDENCE","Denetim Evrakları"],
 ["AUDIT_REPORT","Denetim Raporları ve CAPA"],
 ["MSDS","MSDS"],
 ["TDS","TDS"],
 ["PERIODIC_MAINTENANCE","Periyodik Bakımlar"],
 ["OHS_DOCUMENT","İSG / Acil Durum"],
 ["QUALITY","Kalite / Testler"]
] as const;
const validExt=new Set(["PDF","JPG","JPEG","PNG","WEBP","DOC","DOCX","XLS","XLSX","CSV"]);
function permission(u:Row){return(Array.isArray(u?.permissions)?u.permissions:[]).find((p:Row)=>upper(p.moduleKey||p.module_key)==="COMPLIANCE")||null}
function owner(u:Row){return ["SUPER_ADMIN","ADMIN"].includes(upper(u?.role))}
function admin(u:Row){return owner(u)||upper(u?.role)==="COMPANY_ADMIN"}
function ownSlug(u:Row){return lower(u?.mainCompanySlug||u?.main_company_slug||u?.security?.main_company_slug)}
async function scope(c:Context<AppEnv>,write=false,ownerOnly=false){
 const u=await getAuthenticatedUser(c) as Row|null;
 if(!u)return{error:c.json(fail("UNAUTHORIZED","Oturum gerekli."),401)};
 const p=permission(u),hasView=admin(u)||Boolean(p?.canView??p?.can_view),hasWrite=admin(u)||Boolean(p?.canCreate??p?.can_create??p?.canUpdate??p?.can_update);
 if(!hasView||(write&&!hasWrite)||(ownerOnly&&!admin(u)))return{error:c.json(fail("DENETIM_FORBIDDEN","Denetim işlem yetkisi yok."),403)};
 const requested=lower(c.req.query("mainCompanySlug")||c.req.header("X-KYERP-Tenant-Slug")),own=ownSlug(u);
 if(!owner(u)&&(!own||(requested&&requested!==own)))return{error:c.json(fail("TENANT_FORBIDDEN","Firma erişim izni yok."),403)};
 const slug=owner(u)?(requested||own):own;
 if(!slug)return{error:c.json(fail("TENANT_REQUIRED","Firma bağlamı eksik."),400)};
 return{slug,user:u};
}
async function existingFile(c:Context<AppEnv>,slug:string,assetId:string){
 return c.env.DB.prepare(`SELECT a.id,a.file_name,a.mime_type,a.extension,a.size_bytes,a.status,a.sha256,
  l.provider_file_id,l.relative_path,l.is_available,
  sc.provider_type,sc.sync_mode,sc.is_active,
  x.oauth_account_id
  FROM file_hub_assets a
  LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY'
  LEFT JOIN file_hub_connections sc ON sc.id=l.storage_connection_id AND sc.main_company_slug=a.main_company_slug
  LEFT JOIN file_hub_cloud_connection_accounts x ON x.connection_id=sc.id AND x.main_company_slug=sc.main_company_slug
  WHERE a.id=? AND a.main_company_slug=? LIMIT 1`).bind(assetId,slug).first<Row>();
}
function ready(row:Row){
 return row&&upper(row.status)==="AVAILABLE"&&Number(row.is_available)===1&&Number(row.is_active)===1
  &&upper(row.sync_mode)==="CLOUD_API"&&txt(row.oauth_account_id)&&txt(row.provider_file_id);
}
function allowed(row:Row){
 const ext=upper(row?.extension||txt(row?.file_name).split(".").pop());
 return validExt.has(ext)&&!/(PERSONNEL|PAYROLL|BORDRO|MAAS|MAAŞ|ÖZLÜK|OZLUK)/i.test(txt(row?.file_name));
}
function validateIsoDate(value:unknown){return /^\d{4}-\d{2}-\d{2}$/.test(txt(value))}
export function registerComplianceFileHubBridgeRoutes(app:Hono<AppEnv>){
 app.get("/api/compliance/file-hub/readiness",async c=>{
  const s=await scope(c,false,true);if(s.error)return s.error;
  try{
   const r=await c.env.DB.prepare(`SELECT b.module_code,b.purpose_code,b.root_path,b.read_enabled,b.write_enabled,b.sync_enabled,
     sc.name connection_name,sc.provider_type,sc.sync_mode,sc.connection_status,sc.is_active,
     x.oauth_account_id
     FROM file_hub_bindings b JOIN file_hub_connections sc ON sc.id=b.storage_connection_id
       AND sc.main_company_slug=b.main_company_slug
     LEFT JOIN file_hub_cloud_connection_accounts x ON x.connection_id=sc.id AND x.main_company_slug=b.main_company_slug
     WHERE b.main_company_slug=? AND b.module_code='DENETIM' ORDER BY b.is_default DESC,b.purpose_code`)
     .bind(s.slug).all<Row>();
   const rows=r.results||[];
   const required=purposes.map(([purposeCode,suggestedFolder])=>{
    const item=rows.find((x:Row)=>upper(x.purpose_code)===purposeCode);
    const cloud=Boolean(item&&Number(item.is_active)===1&&Number(item.write_enabled)===1&&upper(item.sync_mode)==="CLOUD_API"&&txt(item.oauth_account_id)&&txt(item.root_path));
    const state=!item?"ATAMA_YOK":Number(item.is_active)!==1?"BAGLANTI_PASIF":Number(item.write_enabled)!==1?"YAZMA_KAPALI":
      upper(item.sync_mode)!=="CLOUD_API"?"YEREL_AJAN":!txt(item.oauth_account_id)?"BULUT_OTURUMU_EKSIK":!txt(item.root_path)?"KLASOR_YOLU_EKSIK":"AYARLI_TEST_BEKLIYOR";
    return{purposeCode,suggestedFolder,rootPath:txt(item?.root_path),providerType:txt(item?.provider_type),
       connectionName:txt(item?.connection_name),syncMode:txt(item?.sync_mode),connectionStatus:txt(item?.connection_status),
       state,canAttemptCloudWrite:cloud};
   });
   return c.json({ok:true,data:{moduleCode:"DENETIM",providerConfigurationVerified:false,
    note:"Dosya ataması görmek fiziksel dosya yazma/okuma kabulü değildir. Dosya denemesi ve File Hub konumu ayrıca doğrulanmalıdır.",
    purposes:required}});
  }catch(e:any){return c.json(fail("FILE_HUB_SCHEMA_UNAVAILABLE","File Hub bağlantı durumu okunamadı."),503)}
 });
 app.get("/api/compliance/file-hub/candidates",async c=>{
  const s=await scope(c,false,true);if(s.error)return s.error;
  const q=txt(c.req.query("q")).slice(0,100);
  if(q.length<2)return c.json({ok:true,data:[],note:"Arama için en az 2 karakter girin."});
  const term="%"+q+"%";
  try{
   const r=await c.env.DB.prepare(`SELECT a.id,a.file_name,a.extension,a.mime_type,a.size_bytes,a.status,l.relative_path,
      l.provider_file_id,l.is_available,sc.provider_type,sc.is_active,sc.sync_mode,x.oauth_account_id
     FROM file_hub_assets a
     LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug
       AND l.location_role='PRIMARY'
     LEFT JOIN file_hub_connections sc ON sc.id=l.storage_connection_id AND sc.main_company_slug=l.main_company_slug
     LEFT JOIN file_hub_cloud_connection_accounts x ON x.connection_id=sc.id AND x.main_company_slug=a.main_company_slug
     WHERE a.main_company_slug=? AND (a.file_name LIKE ? OR l.relative_path LIKE ?)
       AND NOT EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.main_company_slug=a.main_company_slug
         AND r.file_asset_id=a.id AND upper(r.entity_type) IN ('PERSONNEL','EMPLOYEE','PAYROLL','HR'))
     ORDER BY a.last_seen_at DESC LIMIT 80`).bind(s.slug,term,term).all<Row>();
   return c.json({ok:true,data:(r.results||[]).filter(allowed).slice(0,40).map((x:Row)=>({
    id:x.id,fileName:x.file_name,relativePath:x.relative_path||"",mimeType:x.mime_type,sizeBytes:Number(x.size_bytes||0),
    providerType:txt(x.provider_type),readable:Boolean(ready(x))
   }))});
  }catch(e:any){return c.json(fail("FILE_HUB_SEARCH_UNAVAILABLE","File Hub dosyaları sorgulanamadı."),503)}
 });
 app.post("/api/compliance/documents/:id/attach-file-hub",async c=>{
  const s=await scope(c,true,true);if(s.error)return s.error;
  const b=await c.req.json().catch(()=>({})) as Row,assetId=txt(b.fileAssetId),docId=c.req.param("id");
  if(!assetId)return c.json(fail("FILE_REQUIRED","Seçili File Hub dosya kimliği gerekli."),422);
  const doc=await c.env.DB.prepare("SELECT * FROM compliance_documents WHERE id=? AND main_company_slug=? AND archived_at IS NULL")
   .bind(docId,s.slug).first<Row>();
  if(!doc)return c.json(fail("DOCUMENT_NOT_FOUND","Aktif evrak kaydı bulunamadı."),404);
  const file=await existingFile(c,s.slug,assetId);
  if(!file||!allowed(file))return c.json(fail("FILE_NOT_FOUND","Geçerli firma dosyası bulunamadı."),404);
  const forbidden=await c.env.DB.prepare(`SELECT 1 yes FROM file_hub_relations
     WHERE main_company_slug=? AND file_asset_id=? AND upper(entity_type) IN ('PERSONNEL','EMPLOYEE','PAYROLL','HR') LIMIT 1`)
    .bind(s.slug,assetId).first<Row>();
  if(forbidden)return c.json(fail("PRIVATE_DOCUMENT","Özlük veya bordro evrakı bu alana bağlanamaz."),403);
  if(!ready(file))return c.json(fail("PROVIDER_NOT_READABLE","Orijinal dosya önce File Hub üzerinde erişilebilir bulut kaynağı olarak indekslenmelidir."),409);
  if(txt(doc.file_asset_id)===assetId)return c.json({ok:true,data:{documentId:docId,fileAssetId:assetId,unchanged:true}});
  // 200 HTTP sağlayıcı kabulünü kontrol et. İçeriği kopyalama/kaydetme; akışı durdur.
  try{const probe=await streamComplianceFileHubAsset(c,s.slug,assetId);await probe.body?.cancel();}
  catch(e:any){return c.json(fail(e?.code||"ORIGINAL_NOT_READABLE","Orijinal dosya sağlayıcıdan okunamadı."),e?.status||502)}
  const ts=new Date().toISOString(),version=doc.file_asset_id?Math.max(1,Number(doc.version_no||1))+1:Math.max(1,Number(doc.version_no||1));
  const old=parse(doc.custom_fields),next={...old,archiveStatus:"PROVIDER_VERIFIED",
    originalFileHubAsset:true,approvalStatus:"PENDING",signedOriginal:false,auditorShareApproved:false,
    fileHubLinkedBy:txt(s.user.id),fileHubLinkedAt:ts};
  const snapshot={title:doc.title,category:doc.category,documentNo:doc.document_no,validFrom:doc.valid_from,
    expiresAt:doc.expires_at,fileHubAssetId:assetId,source:"EXISTING_FILE_HUB",archiveStatus:"PROVIDER_VERIFIED",
    changeNote:txt(b.note).slice(0,250)};
  const statements=[
   c.env.DB.prepare(`INSERT INTO compliance_document_versions
     (id,main_company_slug,document_id,version_no,file_asset_id,file_name,storage_key,mime_type,file_size,metadata_snapshot,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),s.slug,docId,version,assetId,file.file_name,"filehub:"+assetId,file.mime_type||null,Number(file.size_bytes||0),
     JSON.stringify(snapshot),txt(s.user.id)||null,ts),
   c.env.DB.prepare(`UPDATE compliance_documents SET file_asset_id=?,file_name=?,storage_key=?,mime_type=?,file_size=?,version_no=?,
      custom_fields=?,ai_status='PENDING',updated_at=? WHERE id=? AND main_company_slug=? AND archived_at IS NULL`)
    .bind(assetId,file.file_name,"filehub:"+assetId,file.mime_type||null,Number(file.size_bytes||0),version,JSON.stringify(next),ts,docId,s.slug),
   c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations
     (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
     VALUES(?,?,?,'COMPLIANCE_DOCUMENT',?,'AUDIT_EVIDENCE',1,1,'MANUAL','{}',?,?)`)
    .bind(crypto.randomUUID(),s.slug,assetId,docId,ts,ts),
   c.env.DB.prepare(`INSERT INTO compliance_events
      (id,main_company_slug,event_type,entity_type,entity_id,actor_user_id,detail,created_at)
      VALUES(?,?,'FILE_HUB_ORIGINAL_LINKED','DOCUMENT',?,?,?,?)`)
     .bind(crypto.randomUUID(),s.slug,docId,txt(s.user.id)||null,JSON.stringify({version,fileAssetId:assetId,physicalMove:false,physicalCopy:false}),ts)
  ];
  try{await c.env.DB.batch(statements);}
  catch(e:any){return c.json(fail("FILE_LINK_FAILED","Dosya ilişkisi kaydedilemedi; mevcut nüsha korunur."),409)}
  return c.json({ok:true,data:{documentId:docId,fileAssetId:assetId,versionNo:version,
   archiveStatus:"PROVIDER_VERIFIED",approvalStatus:"PENDING",originalUnchanged:true,copyCreated:false}});
 });
}
