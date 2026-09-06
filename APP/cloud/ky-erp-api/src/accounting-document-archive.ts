// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { archiveFileToCloudConnection } from "./file-hub-cloud-oauth";

type Bindings = Cloudflare.Env & { FILE_HUB_AGENT_KEY?: string; AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?: string; AZURE_DOCUMENT_INTELLIGENCE_KEY?: string; KYERP_DOCINTEL_ENDPOINT?: string; KYERP_DOCINTEL_KEY?: string; KYERP_DOCINTEL_INVOICE_MODEL?: string; KYERP_DOCINTEL_DISPATCH_MODEL?: string; KYERP_DOCINTEL_API_VERSION?: string };
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const IMAGE_PREVIEW_MAX=12_000_000;
const PDF_PREVIEW_MAX=25_000_000;
const CLAIM_LEASE_MS=15*60_000;
const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const now = () => new Date().toISOString();
const slugOf = (c: Context<AppEnv>, b: Row = {}) => text(b.mainCompanySlug || b.main_company_slug || c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
const err = (code: string, message: string, details?: unknown) => ({ ok:false, success:false, error:{ code, message, ...(details === undefined ? {} : { details }) } });
async function bodyOf(c: Context<AppEnv>): Promise<Row> { try { const b=await c.req.json(); return b&&typeof b==="object"&&!Array.isArray(b)?b as Row:{}; } catch { return {}; } }
function agentAllowed(c: Context<AppEnv>) { const expected=text(c.env.FILE_HUB_AGENT_KEY), actual=text(c.req.header("X-KYERP-Agent-Key")); return Boolean(expected && actual && expected===actual); }
function safePart(v: unknown, fallback="BELGE") { return text(v).replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,90) || fallback; }
function joinRel(...parts: string[]) { return parts.map(x=>text(x).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"")).filter(Boolean).join("/"); }
function previewRetainable(mime:unknown,size:unknown){const type=text(mime).toLowerCase(),bytes=Number(size||0);if(type==="application/pdf")return bytes<=PDF_PREVIEW_MAX;if(["image/jpeg","image/png","image/webp"].includes(type))return bytes<=IMAGE_PREVIEW_MAX;return false;}

async function chooseTarget(c: Context<AppEnv>, slug: string, purposeCode: string) {
  let row = await c.env.DB.prepare(`SELECT b.storage_connection_id,b.root_path,c.name,c.provider_type,c.local_root_path,c.sync_mode
      FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id
     WHERE b.main_company_slug=? AND b.module_code='MUHASEBE' AND b.purpose_code=?
       AND b.write_enabled=1 AND b.sync_enabled=1 AND c.is_active=1 AND upper(c.sync_mode)='AGENT'
       AND trim(coalesce(c.local_root_path,''))<>'' LIMIT 1`).bind(slug, upper(purposeCode)).first<Row>();
  if (row) return row;
  row = await c.env.DB.prepare(`SELECT c.id storage_connection_id,'' root_path,c.name,c.provider_type,c.local_root_path,c.sync_mode
      FROM file_hub_connections c
     WHERE c.main_company_slug=? AND c.is_active=1 AND c.is_primary=1 AND upper(c.sync_mode)='AGENT'
       AND trim(coalesce(c.local_root_path,''))<>'' LIMIT 1`).bind(slug).first<Row>();
  return row || null;
}


async function chooseCloudTarget(c:Context<AppEnv>,slug:string,purposeCode:string){
  let row=await c.env.DB.prepare(`SELECT b.storage_connection_id,b.root_path,c.name,c.provider_type,c.remote_root_id,c.remote_root_name,c.sync_mode
      FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id
     WHERE b.main_company_slug=? AND b.module_code='MUHASEBE' AND b.purpose_code=?
       AND b.write_enabled=1 AND b.sync_enabled=1 AND c.is_active=1 AND upper(c.sync_mode)='CLOUD_API'
     LIMIT 1`).bind(slug,upper(purposeCode)).first<Row>();
  if(row)return row;
  row=await c.env.DB.prepare(`SELECT c.id storage_connection_id,'' root_path,c.name,c.provider_type,c.remote_root_id,c.remote_root_name,c.sync_mode
      FROM file_hub_connections c
     WHERE c.main_company_slug=? AND c.is_active=1 AND c.is_primary=1 AND upper(c.sync_mode)='CLOUD_API'
     LIMIT 1`).bind(slug).first<Row>();
  return row||null;
}
function archiveRelative(job:Row,target:Row,ts:string){
  const date=text(job.issue_date)||text(job.document_created_at).slice(0,10)||ts.slice(0,10);
  const ym=/^\d{4}-\d{2}/.test(date)?date.slice(0,7):ts.slice(0,7);
  const party=safePart(job.party_name,"ESLESMEYEN-FIRMA"),docNo=safePart(job.document_no,text(job.document_id).slice(0,8)),fileName=safePart(job.file_name,"belge");
  return joinRel(text(target.root_path),ym,party,`${docNo} - ${fileName}`);
}
async function completeCloudLocation(c:Context<AppEnv>,slug:string,job:Row,target:Row,result:Row,relative:string,ts:string){
  const connectionId=text(target.storage_connection_id),providerFileId=text(result.id);
  const existing=await c.env.DB.prepare(`SELECT id FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND storage_connection_id=? AND relative_path=? LIMIT 1`).bind(slug,job.file_asset_id,connectionId,relative).first<Row>();
  if(existing?.id){
    await c.env.DB.prepare(`UPDATE file_hub_locations SET provider_file_id=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?`).bind(providerFileId||null,ts,ts,ts,existing.id).run();
  }else{
    const primary=await c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1 AND location_role='PRIMARY'`).bind(slug,job.file_asset_id).first<Row>();
    await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?,?)`).bind(crypto.randomUUID(),slug,job.file_asset_id,connectionId,providerFileId||null,relative,Number(primary?.n||0)?"MIRROR":"PRIMARY",ts,ts,ts,ts).run();
  }
  let meta:Row={};try{meta=JSON.parse(text(job.metadata)||"{}")}catch{}
  const keepPreview=previewRetainable(job.mime_type,job.size_bytes),stagingKey=text(job.preview_storage_key),provider=upper(target.provider_type);
  if(!keepPreview&&stagingKey)await c.env.FILES.delete(stagingKey).catch(()=>{});
  await c.env.DB.prepare(`UPDATE file_hub_assets SET source_type=?,status='AVAILABLE',preview_status=?,preview_storage_key=?,metadata=?,last_seen_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(provider,keepPreview&&stagingKey?"READY":"NONE",keepPreview&&stagingKey?stagingKey:null,JSON.stringify({...meta,temporary:false,requiresCanonicalArchive:false,archivedAt:ts,r2Role:keepPreview&&stagingKey?"PREVIEW_CACHE":"NONE",cloudDirect:true,providerFileId:providerFileId||null,webUrl:text(result.webUrl)||null}),ts,ts,job.file_asset_id,slug).run();
  await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status='COMPLETED',storage_connection_id=?,relative_path=?,completed_at=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(connectionId,relative,ts,ts,job.id,slug).run();
  await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_by='FILE_HUB_CLOUD',resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='CANONICAL_ARCHIVE_PENDING' AND is_resolved=0`).bind(ts,slug,job.document_id).run().catch(()=>{});
  await event(c,slug,"CANONICAL_CLOUD_ARCHIVED",{storageConnectionId:connectionId,fileAssetId:job.file_asset_id,details:{documentId:job.document_id,relativePath:relative,providerType:provider,providerFileId:providerFileId||null,r2PreviewRetained:keepPreview&&Boolean(stagingKey)}});
  return{jobId:job.id,status:"COMPLETED",providerType:provider,providerFileId:providerFileId||null,relativePath:relative};
}

export async function processCloudArchiveJobs(c:Context<AppEnv>,slug:string,options:{documentId?:string;limit?:number}={}){
  const limit=Math.min(20,Math.max(1,Number(options.limit||5))),documentId=text(options.documentId),where=["j.main_company_slug=?","(j.status IN ('PENDING','RETRY') OR (j.status='CLAIMED' AND j.claimed_at<?))","j.attempts<8"],args:any[]=[slug,new Date(Date.now()-CLAIM_LEASE_MS).toISOString()];
  if(documentId){where.push("j.document_id=?");args.push(documentId)}
  const rows=await c.env.DB.prepare(`SELECT j.*,d.document_no,d.document_type,d.party_name,d.issue_date,d.created_at document_created_at,a.file_name,a.mime_type,a.size_bytes,a.preview_storage_key,a.metadata
      FROM accounting_document_archive_jobs j
      JOIN accounting_documents d ON d.id=j.document_id AND d.main_company_slug=j.main_company_slug
      JOIN file_hub_assets a ON a.id=j.file_asset_id AND a.main_company_slug=j.main_company_slug
     WHERE ${where.join(" AND ")}
     ORDER BY j.created_at ASC LIMIT ?`).bind(...args,limit).all<Row>();
  const results:Row[]=[];
  for(const job of rows.results||[]){
    const target=await chooseCloudTarget(c,slug,text(job.purpose_code));
    if(!target){results.push({jobId:job.id,status:"NO_CLOUD_TARGET"});continue}
    const ts=now(),relative=archiveRelative(job,target,ts);
    const changed=await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status='CLAIMED',storage_connection_id=?,relative_path=?,claimed_by='CLOUD_API',claimed_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND main_company_slug=? AND (status IN ('PENDING','RETRY') OR (status='CLAIMED' AND claimed_at<?))`).bind(target.storage_connection_id,relative,ts,ts,job.id,slug,new Date(Date.now()-CLAIM_LEASE_MS).toISOString()).run();
    if(Number(changed.meta?.changes||0)===0){results.push({jobId:job.id,status:"SKIPPED_ALREADY_CLAIMED"});continue}
    try{
      const key=text(job.preview_storage_key);if(!key)throw Object.assign(new Error("Geçici belge R2 anahtarı bulunamadı."),{code:"STAGING_MISSING"});
      const object=await c.env.FILES.get(key);if(!object)throw Object.assign(new Error("Geçici belge R2 kaydı bulunamadı."),{code:"STAGING_MISSING"});
      const bytes=await object.arrayBuffer();
      const uploaded=await archiveFileToCloudConnection(c,slug,text(target.storage_connection_id),{relativePath:relative,fileName:text(job.file_name)||"belge",mimeType:text(job.mime_type)||object.httpMetadata?.contentType||"application/octet-stream",bytes});
      results.push(await completeCloudLocation(c,slug,job,target,uploaded,relative,now()));
    }catch(error:any){
      const attempts=Number(job.attempts||0)+1,status=attempts>=8?"FAILED":"RETRY",message=text(error?.message)||"Bulut arşivleme başarısız.";
      await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status=?,last_error=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(status,message.slice(0,1200),now(),job.id,slug).run();
      results.push({jobId:job.id,status,errorCode:text(error?.code)||"CLOUD_ARCHIVE_FAILED",message});
    }
  }
  return{processed:results.filter(row=>row.status==="COMPLETED").length,total:results.length,results};
}

async function ownerOnly(c:Context<AppEnv>){
  const user=await getAuthenticatedUser(c) as Row|null;
  return Boolean(user&&["ADMIN","SUPER_ADMIN"].includes(upper(user.role)));
}

async function event(c: Context<AppEnv>, slug: string, type: string, row: Row) {
  await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,device_name,details,created_at)
    VALUES(?,?,?,?,?,'AGENT',?,?,?)`).bind(crypto.randomUUID(),slug,text(row.storageConnectionId)||null,text(row.fileAssetId)||null,type,text(row.deviceName)||null,JSON.stringify(row.details||{}),now()).run();
}

export function registerAccountingDocumentArchiveRoutes(app: Hono<AppEnv>) {
  app.get("/api/muhasebe/belge-zeka/status", async c => {
    const endpoint = text(c.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || c.env.KYERP_DOCINTEL_ENDPOINT);
    const key = text(c.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || c.env.KYERP_DOCINTEL_KEY);
    const slug = slugOf(c);
    const profiles = await c.env.DB.prepare(`SELECT COUNT(*) n FROM accounting_extraction_profiles WHERE main_company_slug=? AND is_active=1`).bind(slug).first<Row>().catch(()=>({n:0}));
    return c.json({ ok:true, data:{ provider:"AZURE_DOCUMENT_INTELLIGENCE",configured:Boolean(endpoint&&key),invoiceModel:text(c.env.KYERP_DOCINTEL_INVOICE_MODEL)||"prebuilt-invoice",dispatchModel:text(c.env.KYERP_DOCINTEL_DISPATCH_MODEL)||"prebuilt-layout",apiVersion:text(c.env.KYERP_DOCINTEL_API_VERSION)||"2024-11-30",activeSupplierProfiles:Number(profiles?.n||0),mode:"STRUCTURED_DOCUMENT_INTELLIGENCE" }});
  });

  app.post("/api/muhasebe/belge-arsiv-jobs/process-cloud",async c=>{
    if(!(await ownerOnly(c)))return c.json(err("OWNER_ONLY","Doğrudan bulut arşiv kuyruğunu yalnız uygulama sahibi çalıştırabilir."),403);
    const b=await bodyOf(c),slug=slugOf(c,b);if(!slug)return c.json(err("TENANT_REQUIRED","Aktif firma seçimi gerekli."),422);
    const data=await processCloudArchiveJobs(c,slug,{documentId:text(b.documentId),limit:Number(b.limit||10)});
    return c.json({ok:true,data});
  });

  app.get("/api/muhasebe/belge-arsiv-jobs", async c => {
    const slug=slugOf(c), take=Math.min(200,Math.max(1,Number(c.req.query("take")||100)));
    const rows=await c.env.DB.prepare(`SELECT j.*,d.document_no,d.document_type,d.party_name,d.issue_date,a.file_name,a.size_bytes FROM accounting_document_archive_jobs j JOIN accounting_documents d ON d.id=j.document_id AND d.main_company_slug=j.main_company_slug JOIN file_hub_assets a ON a.id=j.file_asset_id AND a.main_company_slug=j.main_company_slug WHERE j.main_company_slug=? ORDER BY j.created_at DESC LIMIT ?`).bind(slug,take).all<Row>();
    return c.json({ok:true,data:rows.results||[]});
  });

  app.post("/api/auth/file-hub-agent/accounting-archive/claim", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
    const b=await bodyOf(c), slug=slugOf(c,b), device=text(b.deviceName)||"windows", ts=now(), leaseCutoff=new Date(Date.now()-CLAIM_LEASE_MS).toISOString();
    const candidates=await c.env.DB.prepare(`SELECT j.*,d.document_no,d.document_type,d.party_name,d.issue_date,d.created_at document_created_at,a.file_name,a.mime_type,a.size_bytes,a.preview_storage_key FROM accounting_document_archive_jobs j JOIN accounting_documents d ON d.id=j.document_id AND d.main_company_slug=j.main_company_slug JOIN file_hub_assets a ON a.id=j.file_asset_id AND a.main_company_slug=j.main_company_slug WHERE j.main_company_slug=? AND (j.status IN ('PENDING','RETRY') OR (j.status='CLAIMED' AND j.claimed_at<?)) AND j.attempts<8 ORDER BY j.created_at ASC LIMIT 20`).bind(slug,leaseCutoff).all<Row>();
    for(const job of candidates.results||[]){
      const target=await chooseTarget(c,slug,text(job.purpose_code));
      if(!target) continue;
      const date=text(job.issue_date)||text(job.document_created_at).slice(0,10)||ts.slice(0,10), ym=/^\d{4}-\d{2}/.test(date)?date.slice(0,7):ts.slice(0,7), party=safePart(job.party_name,"ESLESMEYEN-FIRMA"), docNo=safePart(job.document_no,text(job.document_id).slice(0,8)), fileName=safePart(job.file_name,"belge.pdf"), relative=joinRel(text(target.root_path),ym,party,`${docNo} - ${fileName}`);
      const changed=await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status='CLAIMED',storage_connection_id=?,relative_path=?,claimed_by=?,claimed_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND main_company_slug=? AND (status IN ('PENDING','RETRY') OR (status='CLAIMED' AND claimed_at<?))`).bind(target.storage_connection_id,relative,device,ts,ts,job.id,slug,leaseCutoff).run();
      if(Number(changed.meta?.changes||0)===0) continue;
      return c.json({ok:true,data:{jobId:job.id,documentId:job.document_id,fileAssetId:job.file_asset_id,fileName:job.file_name,mimeType:job.mime_type,sizeBytes:Number(job.size_bytes||0),storageConnectionId:target.storage_connection_id,providerType:target.provider_type,relativePath:relative,downloadUrl:`/api/auth/file-hub-agent/accounting-archive/${encodeURIComponent(job.id)}/download`}});
    }
    return c.json({ok:true,data:null});
  });

  app.get("/api/auth/file-hub-agent/accounting-archive/:id/download", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
    const slug=slugOf(c), id=c.req.param("id");
    const row=await c.env.DB.prepare(`SELECT j.id,j.status,a.preview_storage_key,a.mime_type,a.file_name FROM accounting_document_archive_jobs j JOIN file_hub_assets a ON a.id=j.file_asset_id AND a.main_company_slug=j.main_company_slug WHERE j.id=? AND j.main_company_slug=? LIMIT 1`).bind(id,slug).first<Row>();
    if(!row) return c.json(err("NOT_FOUND","Arşiv işi bulunamadı."),404);
    const key=text(row.preview_storage_key); if(!key) return c.json(err("STAGING_MISSING","Geçici belge dosyası bulunamadı."),404);
    const object=await c.env.FILES.get(key); if(!object) return c.json(err("STAGING_MISSING","Geçici belge R2 kaydı bulunamadı."),404);
    const headers=new Headers(); headers.set("Content-Type",text(row.mime_type)||object.httpMetadata?.contentType||"application/octet-stream"); headers.set("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(text(row.file_name)||"belge")}`); headers.set("Cache-Control","no-store");
    return new Response(object.body,{status:200,headers});
  });

  app.post("/api/auth/file-hub-agent/accounting-archive/:id/complete", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
    const b=await bodyOf(c), slug=slugOf(c,b), id=c.req.param("id"), device=text(b.deviceName)||"windows", ts=now();
    const job=await c.env.DB.prepare(`SELECT j.*,a.preview_storage_key,a.size_bytes,a.mime_type,a.metadata FROM accounting_document_archive_jobs j JOIN file_hub_assets a ON a.id=j.file_asset_id AND a.main_company_slug=j.main_company_slug WHERE j.id=? AND j.main_company_slug=? LIMIT 1`).bind(id,slug).first<Row>();
    if(!job) return c.json(err("NOT_FOUND","Arşiv işi bulunamadı."),404);
    const connectionId=text(b.storageConnectionId||job.storage_connection_id), relative=text(b.relativePath||job.relative_path).replace(/\\/g,"/");
    if(!connectionId||!relative) return c.json(err("REQUIRED","storageConnectionId ve relativePath zorunludur."),422);
    const conn=await c.env.DB.prepare(`SELECT provider_type FROM file_hub_connections WHERE id=? AND main_company_slug=? AND is_active=1`).bind(connectionId,slug).first<Row>();
    if(!conn) return c.json(err("INVALID_CONNECTION","Depolama bağlantısı bulunamadı."),422);
    const existing=await c.env.DB.prepare(`SELECT id FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND storage_connection_id=? AND relative_path=? LIMIT 1`).bind(slug,job.file_asset_id,connectionId,relative).first<Row>();
    if(!existing){
      const primary=await c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1 AND location_role='PRIMARY'`).bind(slug,job.file_asset_id).first<Row>();
      await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?,?)`).bind(crypto.randomUUID(),slug,job.file_asset_id,connectionId,text(b.providerFileId)||null,relative,Number(primary?.n||0)?"MIRROR":"PRIMARY",text(b.modifiedAt)||ts,ts,ts,ts).run();
    }
    let meta:Row={}; try{meta=JSON.parse(text(job.metadata)||"{}")}catch{}
    const keepPreview=previewRetainable(job.mime_type,job.size_bytes), stagingKey=text(job.preview_storage_key);
    if(!keepPreview&&stagingKey) await c.env.FILES.delete(stagingKey).catch(()=>{});
    await c.env.DB.prepare(`UPDATE file_hub_assets SET source_type=?,status='AVAILABLE',preview_status=?,preview_storage_key=?,metadata=?,last_seen_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(upper(conn.provider_type),keepPreview&&stagingKey?"READY":"NONE",keepPreview&&stagingKey?stagingKey:null,JSON.stringify({...meta,temporary:false,requiresCanonicalArchive:false,archivedAt:ts,r2Role:keepPreview&&stagingKey?"PREVIEW_CACHE":"NONE"}),ts,ts,job.file_asset_id,slug).run();
    await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status='COMPLETED',storage_connection_id=?,relative_path=?,completed_at=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(connectionId,relative,ts,ts,id,slug).run();
    await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_by='FILE_HUB_AGENT',resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='CANONICAL_ARCHIVE_PENDING' AND is_resolved=0`).bind(ts,slug,job.document_id).run().catch(()=>{});
    await event(c,slug,"CANONICAL_ARCHIVED",{deviceName:device,storageConnectionId:connectionId,fileAssetId:job.file_asset_id,details:{documentId:job.document_id,relativePath:relative,sha256:text(b.sha256),r2PreviewRetained:keepPreview&&Boolean(stagingKey)}});
    return c.json({ok:true,data:{jobId:id,status:"COMPLETED",relativePath:relative,r2PreviewRetained:keepPreview&&Boolean(stagingKey)}});
  });

  app.post("/api/auth/file-hub-agent/accounting-archive/:id/fail", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
    const b=await bodyOf(c), slug=slugOf(c,b), id=c.req.param("id"), message=text(b.error)||"Arşivleme başarısız.", ts=now();
    const row=await c.env.DB.prepare(`SELECT attempts FROM accounting_document_archive_jobs WHERE id=? AND main_company_slug=? LIMIT 1`).bind(id,slug).first<Row>();
    if(!row) return c.json(err("NOT_FOUND","Arşiv işi bulunamadı."),404);
    const status=Number(row.attempts||0)>=8?"FAILED":"RETRY";
    await c.env.DB.prepare(`UPDATE accounting_document_archive_jobs SET status=?,last_error=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(status,message.slice(0,1200),ts,id,slug).run();
    return c.json({ok:true,data:{jobId:id,status}});
  });
}
