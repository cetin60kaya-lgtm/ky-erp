import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env & { FILE_HUB_AGENT_KEY?: string };
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const now = () => new Date().toISOString();
const json = (v: unknown): Row => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  try { const parsed = JSON.parse(text(v) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
};
async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try { const b = await c.req.json(); return b && typeof b === "object" && !Array.isArray(b) ? b as Row : {}; }
  catch { return {}; }
}
function slugOf(c: Context<AppEnv>, b: Row = {}) {
  return text(b.mainCompanySlug || b.main_company_slug || c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan");
}
function err(code: string, message: string) { return { ok:false, success:false, error:{ code, message } }; }
function allowed(c: Context<AppEnv>) {
  const expected = text(c.env.FILE_HUB_AGENT_KEY);
  const actual = text(c.req.header("X-KYERP-Agent-Key"));
  return Boolean(expected && actual && expected === actual);
}
async function findAsset(c: Context<AppEnv>, slug: string, connectionId: string, relativePath: string) {
  return c.env.DB.prepare(`SELECT a.*,l.id location_id,l.provider_file_id,l.relative_path,l.location_role,l.is_available,l.provider_modified_at FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.relative_path=? LIMIT 1`).bind(slug,connectionId,relativePath).first<Row>();
}
async function logEvent(c: Context<AppEnv>, slug: string, type: string, data: Row) {
  await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,device_name,details,created_at) VALUES(?,?,?,?,?,'AGENT',?,?,?)`).bind(crypto.randomUUID(),slug,text(data.storageConnectionId)||null,text(data.fileAssetId)||null,type,text(data.deviceName)||null,JSON.stringify(data.details||{}),now()).run();
}

async function heartbeat(c: Context<AppEnv>) {
  if (!allowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
  const b=await bodyOf(c),slug=slugOf(c,b),device=text(b.deviceName)||"windows",ts=now();
  const old=await c.env.DB.prepare(`SELECT id FROM file_hub_agent_status WHERE main_company_slug=? AND device_name=?`).bind(slug,device).first<Row>();
  if(old) await c.env.DB.prepare(`UPDATE file_hub_agent_status SET version=?,status='ONLINE',watched_connections=?,last_seen_at=?,last_error=?,metadata=?,updated_at=? WHERE id=?`).bind(text(b.version),JSON.stringify(b.watchedConnections||[]),ts,text(b.lastError)||null,JSON.stringify(b.metadata||{}),ts,old.id).run();
  else await c.env.DB.prepare(`INSERT INTO file_hub_agent_status(id,main_company_slug,device_name,version,status,watched_connections,last_seen_at,last_error,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,device,text(b.version),"ONLINE",JSON.stringify(b.watchedConnections||[]),ts,text(b.lastError)||null,JSON.stringify(b.metadata||{}),ts,ts).run();
  return c.json({ok:true,data:{lastSeenAt:ts}});
}

async function ingest(c: Context<AppEnv>) {
  if (!allowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
  const b=await bodyOf(c),slug=slugOf(c,b),connectionId=text(b.storageConnectionId),relativePath=text(b.relativePath).replace(/\\/g,"/"),fileName=text(b.fileName)||relativePath.split("/").pop()||"",ts=now();
  if(!connectionId||!relativePath||!fileName) return c.json(err("REQUIRED","storageConnectionId, relativePath ve fileName zorunludur."),422);
  const conn=await c.env.DB.prepare(`SELECT * FROM file_hub_connections WHERE id=? AND main_company_slug=? AND is_active=1`).bind(connectionId,slug).first<Row>();
  if(!conn) return c.json(err("INVALID_CONNECTION","Depolama bağlantısı bulunamadı."),422);
  const existing=await findAsset(c,slug,connectionId,relativePath);
  let assetId=text(existing?.id),revisionChanged=false;
  if(!assetId){
    assetId=crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO file_hub_assets(id,main_company_slug,logical_key,file_name,extension,mime_type,sha256,size_bytes,status,source_type,metadata,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(assetId,slug,text(b.logicalKey)||null,fileName,upper(b.extension||fileName.split(".").pop()),text(b.mimeType)||null,text(b.sha256)||null,Number(b.sizeBytes||0),"AVAILABLE",upper(conn.provider_type),JSON.stringify(b.metadata||{}),ts,ts,ts,ts).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,connectionId,text(b.providerFileId)||null,relativePath,upper(b.locationRole)||"PRIMARY",1,text(b.modifiedAt)||null,ts,ts,ts).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_revisions(id,main_company_slug,file_asset_id,revision_no,sha256,size_bytes,provider_modified_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,1,text(b.sha256)||null,Number(b.sizeBytes||0),text(b.modifiedAt)||null,JSON.stringify({initial:true}),ts).run();
    await logEvent(c,slug,"DISCOVERED",{deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:assetId,details:{relativePath}});
  } else {
    const oldHash=text(existing.sha256),newHash=text(b.sha256);
    revisionChanged=Boolean(newHash&&oldHash&&newHash!==oldHash);
    if(revisionChanged){
      const rr=await c.env.DB.prepare(`SELECT COALESCE(MAX(revision_no),0)+1 n FROM file_hub_revisions WHERE main_company_slug=? AND file_asset_id=?`).bind(slug,assetId).first<Row>();
      await c.env.DB.prepare(`INSERT INTO file_hub_revisions(id,main_company_slug,file_asset_id,revision_no,sha256,size_bytes,provider_modified_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,Number(rr?.n||1),newHash,Number(b.sizeBytes||0),text(b.modifiedAt)||null,JSON.stringify({agent:true}),ts).run();
    }
    await c.env.DB.prepare(`UPDATE file_hub_assets SET file_name=?,extension=?,mime_type=?,sha256=?,size_bytes=?,status='AVAILABLE',source_type=?,metadata=?,last_seen_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(fileName,upper(b.extension||fileName.split(".").pop()),text(b.mimeType)||existing.mime_type,newHash||existing.sha256,Number(b.sizeBytes??existing.size_bytes),upper(conn.provider_type),JSON.stringify({...json(existing.metadata),...(b.metadata||{})}),ts,ts,assetId,slug).run();
    await c.env.DB.prepare(`UPDATE file_hub_locations SET provider_file_id=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?`).bind(text(b.providerFileId)||existing.provider_file_id,text(b.modifiedAt)||existing.provider_modified_at,ts,ts,existing.location_id).run();
    await logEvent(c,slug,revisionChanged?"UPDATED":"SEEN",{deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:assetId,details:{relativePath,revisionChanged}});
  }
  await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts,ts,connectionId,slug).run();
  return c.json({ok:true,data:{fileAssetId:assetId,revisionChanged}});
}

async function missing(c: Context<AppEnv>) {
  if (!allowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401);
  const b=await bodyOf(c),slug=slugOf(c,b),connectionId=text(b.storageConnectionId),relativePath=text(b.relativePath).replace(/\\/g,"/"),ts=now();
  const x=await findAsset(c,slug,connectionId,relativePath);
  if(!x) return c.json({ok:true,data:{ignored:true}});
  await c.env.DB.prepare(`UPDATE file_hub_locations SET is_available=0,updated_at=? WHERE id=?`).bind(ts,x.location_id).run();
  const any=await c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1`).bind(slug,x.id).first<Row>();
  if(Number(any?.n||0)===0) await c.env.DB.prepare(`UPDATE file_hub_assets SET status='MISSING',updated_at=? WHERE id=?`).bind(ts,x.id).run();
  await logEvent(c,slug,"MISSING",{deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:x.id,details:{relativePath}});
  return c.json({ok:true});
}

export function registerPublicFileHubAgentRoutes(app: Hono<AppEnv>) {
  // /api/auth/* shell tarafında session zorunluluğundan muaftır; güvenlik agent key ile sağlanır.
  app.post("/api/auth/file-hub-agent/heartbeat", heartbeat);
  app.post("/api/auth/file-hub-agent/ingest", ingest);
  app.post("/api/auth/file-hub-agent/missing", missing);
}
