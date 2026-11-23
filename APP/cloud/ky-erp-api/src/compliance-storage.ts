// @ts-nocheck
/**
 * Denetim kanıtının tek File Hub kayıt sözleşmesi.
 *
 * Exact DENETIM + purpose yazma ataması varsa orijinal seçili bulut sağlayıcıya
 * yazılır. Atama yok/yerel ajan bekleniyorsa yalnız STAGING kaydı oluşur:
 * dış arşiv başarılı gibi gösterilmez. Mevcut R2 dosyaları aynen okunabilir.
 * Eski sürüm/orijinal hiçbir zaman otomatik silinmez veya üzerine yazılmaz.
 */
import type { Context } from "hono";
import { archiveFileToCloudConnection, streamComplianceFileHubAsset } from "./file-hub-cloud-oauth";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>txt(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const now=()=>new Date().toISOString();
const clean=(v:unknown)=>txt(v).replace(/[^A-Za-z0-9._ÇĞİÖŞÜçğıöşü -]+/g,"_").slice(0,150)||"kanit";
const allowed=new Set(["JPG","JPEG","PNG","WEBP","PDF","DOC","DOCX","XLS","XLSX","CSV"]);

export function complianceStoragePurpose(kind:unknown,purpose:unknown="AUDIT_EVIDENCE"){
 const value=upper(kind).replace(/\s+/g,"_");
 if(["MSDS","SDS","GBF","GÜVENLİK_BİLGİ_FORMU"].includes(value))return"MSDS";
 if(value==="TDS")return"TDS";
 if(["PERIODIC_MAINTENANCE","PERIYODIK_KONTROL","PERIYODIK_BAKIM"].includes(value))return"PERIODIC_MAINTENANCE";
 if(["AUDIT_REPORT","DENETIM_RAPORU"].includes(value))return"AUDIT_REPORT";
 if(["OHS_DOCUMENT","ISG"].includes(value))return"OHS_DOCUMENT";
 if(["QUALITY","KALITE"].includes(value))return"QUALITY";
 return["AUDIT_EVIDENCE","AUDIT_REPORT","MSDS","TDS","PERIODIC_MAINTENANCE","OHS_DOCUMENT","QUALITY"].includes(upper(purpose))?upper(purpose):"AUDIT_EVIDENCE";
}

export async function storeComplianceEvidence(
 c:Context<AppEnv>,slug:string,file:File,
 options:{entityType:"COMPLIANCE_DOCUMENT"|"COMPLIANCE_FINDING";entityId:string;version?:number;purpose?:string}
){
 const ext=upper(file.name.split(".").pop()),bytesize=file.size;
 if(!allowed.has(ext)||bytesize<1||bytesize>40*1024*1024)throw Object.assign(new Error("Dosya türü veya boyutu geçersiz (PDF, görüntü, Office/CSV, en fazla 40 MB)."),{code:"FILE_NOT_ALLOWED",status:422});
 const assetId=crypto.randomUUID(),stamp=now(),version=Math.max(1,Number(options.version)||1);
 const purpose=complianceStoragePurpose(options.purpose);
 const row=await c.env.DB.prepare(`SELECT b.root_path,b.storage_connection_id,c.provider_type,c.sync_mode,c.connection_status
 FROM file_hub_bindings b JOIN file_hub_connections c
 ON c.id=b.storage_connection_id AND c.main_company_slug=b.main_company_slug AND c.is_active=1
 WHERE b.main_company_slug=? AND b.module_code='DENETIM' AND b.purpose_code=? AND b.write_enabled=1
 ORDER BY b.is_default DESC LIMIT 1`).bind(slug,purpose).first<Row>();
 const buffer=await file.arrayBuffer(),digest=await crypto.subtle.digest("SHA-256",buffer);
 const sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 const mime=file.type||({PDF:"application/pdf",JPG:"image/jpeg",JPEG:"image/jpeg",PNG:"image/png",WEBP:"image/webp",CSV:"text/csv"} as Row)[ext]||"application/octet-stream";
 const secureName=`${assetId.slice(0,8)}_v${version}_${clean(file.name)}`;
 let key="",relativePath="",archiveStatus="STAGED_ONLY",storageConnectionId="",providerFileId="",providerType="";
 if(row&&upper(row.sync_mode)==="CLOUD_API"){
   const root=txt(row.root_path).replace(/\\/g,"/").split("/").map(x=>x.trim()).filter(x=>x&&x!=="."&&x!=="..").join("/");
   if(!root)throw Object.assign(new Error("Denetim klasör ataması boş; orijinal saklama engellendi."),{code:"AUDIT_FOLDER_REQUIRED",status:422});
   relativePath=`${root}/${options.entityId}/${secureName}`;
   const archived=await archiveFileToCloudConnection(c,slug,txt(row.storage_connection_id),{relativePath,fileName:secureName,mimeType:mime,bytes:buffer,noOverwrite:upper(row.provider_type)==="GOOGLE_DRIVE"});
   providerFileId=txt(archived.id);
   if(!providerFileId)throw Object.assign(new Error("Dosya sağlayıcısı kalıcı dosya kimliği döndürmedi."),{code:"ARCHIVE_ID_MISSING",status:502});
   storageConnectionId=txt(row.storage_connection_id);
   providerType=upper(row.provider_type);
   key=`filehub:${assetId}`;
   archiveStatus="PROVIDER_VERIFIED";
 }else{
   // Ataması olmayan veya yalnız yerel ajanı bulunan kurulumda R2 geçici kaydı.
   // Kullanıcıya Drive'a kaydedildi denmez; File Hub konum doğrulanması bekler.
   key=`compliance-staging/${slug}/${options.entityType.toLowerCase()}/${options.entityId}/v${version}/${assetId}-${clean(file.name)}`;
   await c.env.FILES.put(key,buffer,{httpMetadata:{contentType:mime},
     customMetadata:{purpose:"COMPLIANCE_STAGING",entityId:options.entityId,version:String(version),mainCompanySlug:slug}});
   archiveStatus=row?"PENDING_FILE_AGENT":"BINDING_REQUIRED";
 }
 const metadata={storageKey:key,purpose,entityType:options.entityType,entityId:options.entityId,version,archiveStatus,providerType,sha256,relativePath};
 await c.env.DB.prepare(`INSERT INTO file_hub_assets
 (id,main_company_slug,logical_key,file_name,extension,mime_type,sha256,size_bytes,status,source_type,preview_status,preview_storage_key,metadata,first_seen_at,last_seen_at,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
 assetId,slug,`compliance:${options.entityId}:v${version}`,file.name,ext,mime,sha256,bytesize,"AVAILABLE","COMPLIANCE_UPLOAD","NOT_GENERATED",null,JSON.stringify(metadata),stamp,stamp,stamp,stamp).run();
 if(providerFileId){
   await c.env.DB.prepare(`INSERT INTO file_hub_locations
    (id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'PRIMARY',1,?,?,?,?)`).bind(
     crypto.randomUUID(),slug,assetId,storageConnectionId,providerFileId,relativePath,stamp,stamp,stamp,stamp).run();
 }
 await c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations
 (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
 VALUES(?,?,?,?,?,?,1,1,'COMPLIANCE_CENTER','{}',?,?)`).bind(
   crypto.randomUUID(),slug,assetId,options.entityType,options.entityId,purpose,stamp,stamp).run();
 return{id:assetId,assetId,key,fileName:file.name,mimeType:mime,size:bytesize,versionNo:version,
 archiveStatus,providerType,relativePath,sha256};
}

export async function readComplianceEvidence(c:Context<AppEnv>,slug:string,key:unknown,fileName:unknown,mimeType:unknown){
 const storageKey=txt(key);
 if(storageKey.startsWith("filehub:"))return streamComplianceFileHubAsset(c,slug,storageKey.slice(8));
 if(!storageKey)throw Object.assign(new Error("Evrak dosyası bulunamadı."),{code:"FILE_NOT_FOUND",status:404});
 const obj=await c.env.FILES.get(storageKey);
 if(!obj)throw Object.assign(new Error("Geçici veya eski R2 evrakı bulunamadı."),{code:"FILE_NOT_FOUND",status:404});
 const headers=new Headers();obj.writeHttpMetadata(headers);
 headers.set("Content-Type",txt(mimeType)||headers.get("Content-Type")||"application/octet-stream");
 headers.set("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(txt(fileName)||"evrak")}`);
 headers.set("Cache-Control","private, no-store");
 headers.set("X-Content-Type-Options","nosniff");
 return new Response(obj.body,{headers});
}


/**
 * İlk yükleme sırasında File Hub bağlantısı bulunamayan R2 staging kaydını,
 * bağlantı kurulunca orijinali koruyarak firma provider'ına taşır.
 * Aynı asset kimliği/sürüm korunur; R2 yedeği otomatik silinmez.
 */
export async function finalizeComplianceStagedArchive(c:Context<AppEnv>,slug:string,assetId:string){
 const asset=await c.env.DB.prepare("SELECT * FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1").bind(assetId,slug).first<Row>();
 if(!asset)throw Object.assign(new Error("Firma kanıt dosyası bulunamadı."),{code:"ASSET_NOT_FOUND",status:404});
 const meta=typeof asset.metadata==="string"?JSON.parse(asset.metadata||"{}"):asset.metadata||{};
 const existing=await c.env.DB.prepare("SELECT id,provider_file_id FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND location_role='PRIMARY' AND is_available=1").bind(slug,assetId).first<Row>();
 if(existing?.provider_file_id)return{assetId,archiveStatus:"PROVIDER_ACCEPTED",alreadyArchived:true};
 const source=txt(meta.storageKey);
 if(!source.startsWith("compliance-staging/"))throw Object.assign(new Error("Bu dosya kontrollü geçici arşivde bulunmuyor."),{code:"NOT_STAGED",status:409});
 const purpose=complianceStoragePurpose(meta.purpose),r=await c.env.DB.prepare(`SELECT b.root_path,b.storage_connection_id,c.provider_type,c.sync_mode
 FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id
 AND c.main_company_slug=b.main_company_slug AND c.is_active=1
 WHERE b.main_company_slug=? AND b.module_code='DENETIM' AND b.purpose_code=? AND b.write_enabled=1
 ORDER BY b.is_default DESC LIMIT 1`).bind(slug,purpose).first<Row>();
 if(!r||upper(r.sync_mode)!=="CLOUD_API")throw Object.assign(new Error("Denetim için yazılabilir doğrudan bulut File Hub ataması henüz hazır değil."),{code:"ARCHIVE_BINDING_REQUIRED",status:409});
 const root=txt(r.root_path).replace(/\\/g,"/").split("/").map((x:string)=>x.trim()).filter((x:string)=>x&&x!=="."&&x!=="..").join("/");
 if(!root)throw Object.assign(new Error("Denetim arşiv yolu boş."),{code:"ARCHIVE_PATH_REQUIRED",status:422});
 const backup=await c.env.FILES.get(source);
 if(!backup)throw Object.assign(new Error("Geçici arşivde orijinal dosya bulunamadı."),{code:"STAGED_ORIGINAL_MISSING",status:404});
 const bytes=await backup.arrayBuffer();
 const computed=await crypto.subtle.digest("SHA-256",bytes),checksum=[...new Uint8Array(computed)].map((x:number)=>x.toString(16).padStart(2,"0")).join("");
 if(txt(asset.sha256)&&txt(asset.sha256)!==checksum)throw Object.assign(new Error("Geçici dosya bütünlük kontrolü başarısız."),{code:"ARCHIVE_HASH_MISMATCH",status:409});
 const name=`${assetId.slice(0,8)}_v${Number(meta.version)||1}_${clean(asset.file_name)}`;
 const relativePath=`${root}/${txt(meta.entityId)||assetId}/${name}`,ts=now();
 const archived=await archiveFileToCloudConnection(c,slug,txt(r.storage_connection_id),
   {relativePath,fileName:name,mimeType:txt(asset.mime_type)||"application/octet-stream",bytes,noOverwrite:upper(r.provider_type)==="GOOGLE_DRIVE"});
 if(!txt(archived.id))throw Object.assign(new Error("Sağlayıcı dosya kimliği dönmedi."),{code:"ARCHIVE_ID_MISSING",status:502});
 await c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_locations
 (id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at)
 VALUES(?,?,?,?,?,?,'PRIMARY',1,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,txt(r.storage_connection_id),txt(archived.id),relativePath,ts,ts,ts,ts).run();
 await c.env.DB.prepare("UPDATE file_hub_assets SET metadata=?,updated_at=? WHERE id=? AND main_company_slug=?")
 .bind(JSON.stringify({...meta,archiveStatus:"PROVIDER_ACCEPTED",providerType:upper(r.provider_type),relativePath,providerFileId:txt(archived.id)}),ts,assetId,slug).run();
 const key=`filehub:${assetId}`;
 const doc=await c.env.DB.prepare("SELECT id,custom_fields FROM compliance_documents WHERE main_company_slug=? AND file_asset_id=? LIMIT 1").bind(slug,assetId).first<Row>();
 if(doc){
  let custom:Row={};try{custom=JSON.parse(txt(doc.custom_fields)||"{}")}catch{}
  await c.env.DB.prepare("UPDATE compliance_documents SET storage_key=?,custom_fields=?,updated_at=? WHERE id=? AND main_company_slug=?")
  .bind(key,JSON.stringify({...custom,archiveStatus:"PROVIDER_ACCEPTED"}),ts,doc.id,slug).run();
 }
 await c.env.DB.prepare("UPDATE compliance_document_versions SET storage_key=? WHERE file_asset_id=? AND main_company_slug=?").bind(key,assetId,slug).run();
 await c.env.DB.prepare("UPDATE compliance_finding_evidence SET storage_key=? WHERE file_asset_id=? AND main_company_slug=?").bind(key,assetId,slug).run();
 return{assetId,archiveStatus:"PROVIDER_ACCEPTED",relativePath,alreadyArchived:false};
}
