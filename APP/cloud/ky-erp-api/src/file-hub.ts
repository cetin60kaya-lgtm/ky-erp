// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env & { FILE_HUB_AGENT_KEY?: string };
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const now = () => new Date().toISOString();
const bool = (v: unknown, fallback = false) => v == null || v === "" ? fallback : typeof v === "boolean" ? v : Number(v) !== 0 && !["FALSE","HAYIR","NO","OFF"].includes(upper(v));
const json = (v: unknown): Row => { if (v && typeof v === "object" && !Array.isArray(v)) return v as Row; try { return JSON.parse(text(v) || "{}"); } catch { return {}; } };
const slugOf = (c: Context<AppEnv>, b: Row = {}) => text(b.mainCompanySlug || b.main_company_slug || c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
async function bodyOf(c: Context<AppEnv>): Promise<Row> { try { const b = await c.req.json(); return b && typeof b === "object" && !Array.isArray(b) ? b as Row : {}; } catch { return {}; } }
function err(code: string, message: string, details?: unknown) { return { ok:false, success:false, error:{ code, message, ...(details === undefined ? {} : { details }) } }; }
function rowView(r: Row) { return { ...r, metadata: json(r.metadata), isActive: r.is_active == null ? undefined : Number(r.is_active) !== 0, isPrimary: r.is_primary == null ? undefined : Number(r.is_primary) !== 0, readEnabled: r.read_enabled == null ? undefined : Number(r.read_enabled)!==0, writeEnabled: r.write_enabled == null ? undefined : Number(r.write_enabled)!==0, syncEnabled: r.sync_enabled == null ? undefined : Number(r.sync_enabled)!==0, isDefault: r.is_default == null ? undefined : Number(r.is_default)!==0, isAvailable: r.is_available == null ? undefined : Number(r.is_available)!==0 }; }
async function requireCompanyOwner(c: Context<AppEnv>, body: Row = {}) {
  const u = await getAuthenticatedUser(c) as Row | null;
  if (!u || upper(u.role) !== "COMPANY_ADMIN") return null;
  const own = text(u.mainCompanySlug || u.main_company_slug || u.security?.main_company_slug);
  const requested = slugOf(c, body);
  return own && requested && own === requested ? u : null;
}
async function requireUser(c: Context<AppEnv>) { return await getAuthenticatedUser(c) as Row | null; }
function agentAllowed(c: Context<AppEnv>) { const expected = text(c.env.FILE_HUB_AGENT_KEY); const actual = text(c.req.header("X-KYERP-Agent-Key")); return Boolean(expected && actual && expected === actual); }
async function event(c: Context<AppEnv>, slug: string, eventType: string, data: Row = {}) { await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,actor_id,device_name,details,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,text(data.storageConnectionId)||null,text(data.fileAssetId)||null,eventType,text(data.actorType||"SYSTEM"),text(data.actorId)||null,text(data.deviceName)||null,JSON.stringify(data.details||{}),now()).run(); }

async function findAssetByLocation(c: Context<AppEnv>, slug: string, connectionId: string, relativePath: string) {
  return await c.env.DB.prepare(`SELECT a.*,l.id location_id,l.provider_file_id,l.relative_path,l.location_role,l.is_available,l.provider_modified_at,l.last_seen_at location_last_seen_at FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.relative_path=? LIMIT 1`).bind(slug,connectionId,relativePath).first<Row>();
}

export function registerFileHubRoutes(app: Hono<AppEnv>) {
  app.get("/api/file-hub/overview", async c => {
    if (!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401);
    const slug = slugOf(c);
    const [connections,assets,unmatched,missing,events,agents] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_connections WHERE main_company_slug=? AND is_active=1`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_assets WHERE main_company_slug=?`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_assets a WHERE a.main_company_slug=? AND NOT EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.file_asset_id=a.id AND r.main_company_slug=a.main_company_slug)`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_assets WHERE main_company_slug=? AND status='MISSING'`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT * FROM file_hub_events WHERE main_company_slug=? ORDER BY created_at DESC LIMIT 20`).bind(slug).all<Row>(),
      c.env.DB.prepare(`SELECT * FROM file_hub_agent_status WHERE main_company_slug=? ORDER BY last_seen_at DESC`).bind(slug).all<Row>(),
    ]);
    return c.json({ok:true,data:{connectionCount:Number(connections?.n||0),fileCount:Number(assets?.n||0),unmatchedCount:Number(unmatched?.n||0),missingCount:Number(missing?.n||0),recentEvents:events.results||[],agents:agents.results||[]}});
  });

  app.get("/api/file-hub/connections", async c => {
    if (!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401);
    const slug=slugOf(c); const r=await c.env.DB.prepare(`SELECT * FROM file_hub_connections WHERE main_company_slug=? ORDER BY is_primary DESC,name COLLATE NOCASE`).bind(slug).all<Row>();
    return c.json({ok:true,data:(r.results||[]).map(rowView)});
  });

  app.post("/api/file-hub/connections", async c => {
    const b=await bodyOf(c), owner=await requireCompanyOwner(c,b); if(!owner) return c.json(err("COMPANY_OWNER_ONLY","Depolama bağlantısını yalnız bu firmanın sahibi / işvereni ekleyebilir."),403);
    const slug=slugOf(c,b), provider=upper(b.providerType);
    if(!["GOOGLE_DRIVE","ONEDRIVE","LOCAL_FOLDER","NAS","SHAREPOINT"].includes(provider)) return c.json(err("INVALID_PROVIDER","Geçersiz depolama sağlayıcısı."),422);
    const id=crypto.randomUUID(), ts=now();
    if(bool(b.isPrimary,false)) await c.env.DB.prepare(`UPDATE file_hub_connections SET is_primary=0,updated_at=? WHERE main_company_slug=?`).bind(ts,slug).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_connections(id,main_company_slug,provider_type,name,is_active,is_primary,local_root_path,remote_root_id,remote_root_name,sync_mode,connection_status,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,slug,provider,text(b.name)||provider,bool(b.isActive,true)?1:0,bool(b.isPrimary,false)?1:0,text(b.localRootPath)||null,text(b.remoteRootId)||null,text(b.remoteRootName)||null,upper(b.syncMode)||"AGENT",upper(b.connectionStatus)||"UNKNOWN",JSON.stringify(b.metadata||{}),ts,ts).run();
    await event(c,slug,"CONNECTION_CREATED",{actorType:"USER",actorId:owner.id,storageConnectionId:id,details:{provider}});
    return c.json({ok:true,data:{id}},201);
  });

  app.patch("/api/file-hub/connections/:id", async c => {
    const b=await bodyOf(c), owner=await requireCompanyOwner(c,b); if(!owner) return c.json(err("COMPANY_OWNER_ONLY","Depolama bağlantısını yalnız bu firmanın sahibi / işvereni değiştirebilir."),403);
    const slug=slugOf(c,b), id=c.req.param("id"), ts=now();
    const old=await c.env.DB.prepare(`SELECT * FROM file_hub_connections WHERE id=? AND main_company_slug=?`).bind(id,slug).first<Row>(); if(!old) return c.json(err("NOT_FOUND","Bağlantı bulunamadı."),404);
    const isPrimary=b.isPrimary===undefined?Number(old.is_primary):bool(b.isPrimary)?1:0; if(isPrimary) await c.env.DB.prepare(`UPDATE file_hub_connections SET is_primary=0,updated_at=? WHERE main_company_slug=? AND id<>?`).bind(ts,slug,id).run();
    await c.env.DB.prepare(`UPDATE file_hub_connections SET name=?,is_active=?,is_primary=?,local_root_path=?,remote_root_id=?,remote_root_name=?,sync_mode=?,metadata=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(text(b.name)||old.name,b.isActive===undefined?old.is_active:bool(b.isActive)?1:0,isPrimary,b.localRootPath===undefined?old.local_root_path:text(b.localRootPath)||null,b.remoteRootId===undefined?old.remote_root_id:text(b.remoteRootId)||null,b.remoteRootName===undefined?old.remote_root_name:text(b.remoteRootName)||null,upper(b.syncMode)||old.sync_mode,JSON.stringify(b.metadata===undefined?json(old.metadata):b.metadata||{}),ts,id,slug).run();
    await event(c,slug,"CONNECTION_UPDATED",{actorType:"USER",actorId:owner.id,storageConnectionId:id}); return c.json({ok:true});
  });

  app.get("/api/file-hub/bindings", async c => { if(!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const slug=slugOf(c); const r=await c.env.DB.prepare(`SELECT b.*,c.name connection_name,c.provider_type FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id WHERE b.main_company_slug=? ORDER BY b.module_code,b.purpose_code`).bind(slug).all<Row>(); return c.json({ok:true,data:(r.results||[]).map(rowView)}); });

  app.put("/api/file-hub/bindings", async c => {
    const b=await bodyOf(c),owner=await requireCompanyOwner(c,b); if(!owner) return c.json(err("COMPANY_OWNER_ONLY","Bölüm / dosya depolama yönlendirmesini yalnız bu firmanın sahibi / işvereni değiştirebilir."),403);
    const slug=slugOf(c,b),moduleCode=upper(b.moduleCode),purposeCode=upper(b.purposeCode),connectionId=text(b.storageConnectionId),ts=now();
    if(!moduleCode||!purposeCode||!connectionId) return c.json(err("REQUIRED","Modül, amaç ve depolama bağlantısı zorunludur."),422);
    const conn=await c.env.DB.prepare(`SELECT id FROM file_hub_connections WHERE id=? AND main_company_slug=? AND is_active=1`).bind(connectionId,slug).first<Row>(); if(!conn) return c.json(err("INVALID_CONNECTION","Aktif depolama bağlantısı bulunamadı."),422);
    const old=await c.env.DB.prepare(`SELECT id FROM file_hub_bindings WHERE main_company_slug=? AND module_code=? AND purpose_code=?`).bind(slug,moduleCode,purposeCode).first<Row>(); const id=text(old?.id)||crypto.randomUUID();
    if(old) await c.env.DB.prepare(`UPDATE file_hub_bindings SET storage_connection_id=?,root_path=?,read_enabled=?,write_enabled=?,sync_enabled=?,is_default=?,updated_at=? WHERE id=?`).bind(connectionId,text(b.rootPath),bool(b.readEnabled,true)?1:0,bool(b.writeEnabled,true)?1:0,bool(b.syncEnabled,true)?1:0,bool(b.isDefault,false)?1:0,ts,id).run();
    else await c.env.DB.prepare(`INSERT INTO file_hub_bindings(id,main_company_slug,module_code,purpose_code,storage_connection_id,root_path,read_enabled,write_enabled,sync_enabled,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,slug,moduleCode,purposeCode,connectionId,text(b.rootPath),bool(b.readEnabled,true)?1:0,bool(b.writeEnabled,true)?1:0,bool(b.syncEnabled,true)?1:0,bool(b.isDefault,false)?1:0,ts,ts).run();
    await event(c,slug,"BINDING_SAVED",{actorType:"USER",actorId:owner.id,storageConnectionId:connectionId,details:{moduleCode,purposeCode,rootPath:text(b.rootPath)}}); return c.json({ok:true,data:{id}});
  });

  app.get("/api/file-hub/resolve-storage", async c => {
    if(!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const slug=slugOf(c),moduleCode=upper(c.req.query("moduleCode")),purposeCode=upper(c.req.query("purposeCode"));
    let row=await c.env.DB.prepare(`SELECT b.*,c.provider_type,c.name connection_name,c.local_root_path,c.remote_root_id,c.remote_root_name FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id WHERE b.main_company_slug=? AND b.module_code=? AND b.purpose_code=? AND c.is_active=1 LIMIT 1`).bind(slug,moduleCode,purposeCode).first<Row>();
    if(!row) row=await c.env.DB.prepare(`SELECT NULL id,'' module_code,'' purpose_code,c.id storage_connection_id,'' root_path,1 read_enabled,1 write_enabled,1 sync_enabled,1 is_default,c.provider_type,c.name connection_name,c.local_root_path,c.remote_root_id,c.remote_root_name FROM file_hub_connections c WHERE c.main_company_slug=? AND c.is_active=1 AND c.is_primary=1 LIMIT 1`).bind(slug).first<Row>();
    if(!row) return c.json(err("NO_STORAGE","Bu firma/modül için depolama hedefi tanımlı değil."),404); return c.json({ok:true,data:rowView(row)});
  });

  app.get("/api/file-hub/files", async c => {
    if(!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const slug=slugOf(c),q=text(c.req.query("q")),status=upper(c.req.query("status")),take=Math.min(500,Math.max(1,Number(c.req.query("take")||100)));
    const where=["a.main_company_slug=?"],args:any[]=[slug]; if(q){where.push("(a.file_name LIKE ? OR a.logical_key LIKE ? OR l.relative_path LIKE ?)"); const like=`%${q}%`; args.push(like,like,like);} if(status){where.push("a.status=?");args.push(status);} args.push(take);
    const r=await c.env.DB.prepare(`SELECT a.*,l.id location_id,l.storage_connection_id,l.relative_path,l.location_role,l.is_available,c.provider_type,c.name connection_name,(SELECT COUNT(*) FROM file_hub_relations x WHERE x.file_asset_id=a.id AND x.main_company_slug=a.main_company_slug) relation_count FROM file_hub_assets a LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY' LEFT JOIN file_hub_connections c ON c.id=l.storage_connection_id WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC LIMIT ?`).bind(...args).all<Row>();
    return c.json({ok:true,data:(r.results||[]).map(rowView)});
  });

  app.get("/api/file-hub/entity-files", async c => {
    if(!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const slug=slugOf(c),entityType=upper(c.req.query("entityType")),entityId=text(c.req.query("entityId")); if(!entityType||!entityId) return c.json(err("REQUIRED","entityType ve entityId zorunludur."),422);
    const r=await c.env.DB.prepare(`SELECT a.*,r.relation_type,r.is_primary relation_primary,r.confidence,r.source,l.relative_path,l.storage_connection_id,c.provider_type,c.name connection_name FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.location_role='PRIMARY' LEFT JOIN file_hub_connections c ON c.id=l.storage_connection_id WHERE r.main_company_slug=? AND r.entity_type=? AND r.entity_id=? ORDER BY r.is_primary DESC,a.updated_at DESC`).bind(slug,entityType,entityId).all<Row>(); return c.json({ok:true,data:(r.results||[]).map(rowView)});
  });

  app.post("/api/file-hub/files/:id/relations", async c => {
    const u=await requireUser(c); if(!u) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const b=await bodyOf(c),slug=slugOf(c,b),fileId=c.req.param("id"),entityType=upper(b.entityType),entityId=text(b.entityId),relationType=upper(b.relationType)||"ATTACHMENT",ts=now(); if(!entityType||!entityId) return c.json(err("REQUIRED","entityType ve entityId zorunludur."),422);
    const a=await c.env.DB.prepare(`SELECT id FROM file_hub_assets WHERE id=? AND main_company_slug=?`).bind(fileId,slug).first<Row>(); if(!a) return c.json(err("NOT_FOUND","Dosya bulunamadı."),404);
    await c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations(id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,fileId,entityType,entityId,relationType,bool(b.isPrimary,false)?1:0,b.confidence==null?null:Number(b.confidence),upper(b.source)||"MANUAL",JSON.stringify(b.metadata||{}),ts,ts).run(); await event(c,slug,"LINKED",{actorType:"USER",actorId:u.id,fileAssetId:fileId,details:{entityType,entityId,relationType}}); return c.json({ok:true});
  });

  app.get("/api/file-hub/search", async c => {
    if(!await requireUser(c)) return c.json(err("UNAUTHORIZED","Oturum gerekli."),401); const slug=slugOf(c),q=text(c.req.query("q")); if(!q) return c.json({ok:true,data:[]}); const like=`%${q}%`;
    const r=await c.env.DB.prepare(`SELECT a.id,a.file_name,a.extension,a.status,a.logical_key,a.updated_at,l.relative_path,c.provider_type,r.entity_type,r.entity_id,r.relation_type FROM file_hub_assets a LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.location_role='PRIMARY' LEFT JOIN file_hub_connections c ON c.id=l.storage_connection_id LEFT JOIN file_hub_relations r ON r.file_asset_id=a.id WHERE a.main_company_slug=? AND (a.file_name LIKE ? OR a.logical_key LIKE ? OR l.relative_path LIKE ? OR r.entity_id LIKE ?) ORDER BY a.updated_at DESC LIMIT 100`).bind(slug,like,like,like,like).all<Row>(); return c.json({ok:true,data:r.results||[]});
  });

  app.post("/api/file-hub/agent/heartbeat", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401); const b=await bodyOf(c),slug=slugOf(c,b),device=text(b.deviceName)||"windows",ts=now(); const old=await c.env.DB.prepare(`SELECT id FROM file_hub_agent_status WHERE main_company_slug=? AND device_name=?`).bind(slug,device).first<Row>(); if(old) await c.env.DB.prepare(`UPDATE file_hub_agent_status SET version=?,status='ONLINE',watched_connections=?,last_seen_at=?,last_error=?,metadata=?,updated_at=? WHERE id=?`).bind(text(b.version),JSON.stringify(b.watchedConnections||[]),ts,text(b.lastError)||null,JSON.stringify(b.metadata||{}),ts,old.id).run(); else await c.env.DB.prepare(`INSERT INTO file_hub_agent_status(id,main_company_slug,device_name,version,status,watched_connections,last_seen_at,last_error,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,device,text(b.version),"ONLINE",JSON.stringify(b.watchedConnections||[]),ts,text(b.lastError)||null,JSON.stringify(b.metadata||{}),ts,ts).run(); return c.json({ok:true});
  });

  app.post("/api/file-hub/agent/ingest", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401); const b=await bodyOf(c),slug=slugOf(c,b),connectionId=text(b.storageConnectionId),relativePath=text(b.relativePath).replace(/\\/g,"/"),fileName=text(b.fileName)||relativePath.split("/").pop()||"",ts=now(); if(!connectionId||!relativePath||!fileName) return c.json(err("REQUIRED","storageConnectionId, relativePath ve fileName zorunludur."),422);
    const conn=await c.env.DB.prepare(`SELECT * FROM file_hub_connections WHERE id=? AND main_company_slug=? AND is_active=1`).bind(connectionId,slug).first<Row>(); if(!conn) return c.json(err("INVALID_CONNECTION","Depolama bağlantısı bulunamadı."),422);
    const existing=await findAssetByLocation(c,slug,connectionId,relativePath); let assetId=text(existing?.id), revisionChanged=false;
    if(!assetId){ assetId=crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO file_hub_assets(id,main_company_slug,logical_key,file_name,extension,mime_type,sha256,size_bytes,status,source_type,metadata,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(assetId,slug,text(b.logicalKey)||null,fileName,upper(b.extension||fileName.split(".").pop()),text(b.mimeType)||null,text(b.sha256)||null,Number(b.sizeBytes||0),upper(b.status)||"AVAILABLE",upper(conn.provider_type),JSON.stringify(b.metadata||{}),ts,ts,ts,ts).run(); await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,connectionId,text(b.providerFileId)||null,relativePath,upper(b.locationRole)||"PRIMARY",1,text(b.modifiedAt)||null,ts,ts,ts).run(); await c.env.DB.prepare(`INSERT INTO file_hub_revisions(id,main_company_slug,file_asset_id,revision_no,sha256,size_bytes,provider_modified_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,1,text(b.sha256)||null,Number(b.sizeBytes||0),text(b.modifiedAt)||null,JSON.stringify({initial:true}),ts).run(); await event(c,slug,"DISCOVERED",{actorType:"AGENT",deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:assetId,details:{relativePath}}); }
    else { const oldHash=text(existing.sha256),newHash=text(b.sha256); revisionChanged=Boolean(newHash&&oldHash&&newHash!==oldHash); if(revisionChanged){ const rr=await c.env.DB.prepare(`SELECT COALESCE(MAX(revision_no),0)+1 n FROM file_hub_revisions WHERE main_company_slug=? AND file_asset_id=?`).bind(slug,assetId).first<Row>(); await c.env.DB.prepare(`INSERT INTO file_hub_revisions(id,main_company_slug,file_asset_id,revision_no,sha256,size_bytes,provider_modified_at,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,Number(rr?.n||1),newHash,Number(b.sizeBytes||0),text(b.modifiedAt)||null,JSON.stringify({agent:true}),ts).run(); }
      await c.env.DB.prepare(`UPDATE file_hub_assets SET file_name=?,extension=?,mime_type=?,sha256=?,size_bytes=?,status=?,source_type=?,metadata=?,last_seen_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(fileName,upper(b.extension||fileName.split(".").pop()),text(b.mimeType)||existing.mime_type,newHash||existing.sha256,Number(b.sizeBytes??existing.size_bytes),upper(b.status)||"AVAILABLE",upper(conn.provider_type),JSON.stringify({...json(existing.metadata),...(b.metadata||{})}),ts,ts,assetId,slug).run(); await c.env.DB.prepare(`UPDATE file_hub_locations SET provider_file_id=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?`).bind(text(b.providerFileId)||existing.provider_file_id,text(b.modifiedAt)||existing.provider_modified_at,ts,ts,existing.location_id).run(); await event(c,slug,revisionChanged?"UPDATED":"SEEN",{actorType:"AGENT",deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:assetId,details:{relativePath,revisionChanged}}); }
    await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts,ts,connectionId,slug).run(); return c.json({ok:true,data:{fileAssetId:assetId,revisionChanged}});
  });

  app.post("/api/file-hub/agent/missing", async c => {
    if(!agentAllowed(c)) return c.json(err("AGENT_UNAUTHORIZED","Agent anahtarı geçersiz."),401); const b=await bodyOf(c),slug=slugOf(c,b),connectionId=text(b.storageConnectionId),relativePath=text(b.relativePath).replace(/\\/g,"/"),ts=now(); const x=await findAssetByLocation(c,slug,connectionId,relativePath); if(!x) return c.json({ok:true,data:{ignored:true}}); await c.env.DB.prepare(`UPDATE file_hub_locations SET is_available=0,updated_at=? WHERE id=?`).bind(ts,x.location_id).run(); const any=await c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1`).bind(slug,x.id).first<Row>(); if(Number(any?.n||0)===0) await c.env.DB.prepare(`UPDATE file_hub_assets SET status='MISSING',updated_at=? WHERE id=?`).bind(ts,x.id).run(); await event(c,slug,"MISSING",{actorType:"AGENT",deviceName:b.deviceName,storageConnectionId:connectionId,fileAssetId:x.id,details:{relativePath}}); return c.json({ok:true});
  });
}
