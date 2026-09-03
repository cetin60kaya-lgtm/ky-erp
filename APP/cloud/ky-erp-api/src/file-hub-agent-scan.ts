// @ts-nocheck
import type { Context, Hono } from "hono";
import { verifyFileHubAgentCredential } from "./file-hub-agent-auth";

type Bindings = Cloudflare.Env & { FILE_HUB_AGENT_KEY?: string };
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const now=()=>new Date().toISOString();
const slugOf=(c:Context<AppEnv>,b:Row)=>text(b.mainCompanySlug||b.main_company_slug||c.req.header("X-KYERP-Tenant-Slug")||"mecit-hakan").toLocaleLowerCase("tr-TR");
async function bodyOf(c:Context<AppEnv>):Promise<Row>{try{const b=await c.req.json();return b&&typeof b==="object"&&!Array.isArray(b)?b as Row:{}}catch{return{}}}
const err=(code:string,message:string)=>({ok:false,error:{code,message}});

export function registerPublicFileHubScanRoutes(app:Hono<AppEnv>){
  app.post("/api/auth/file-hub-agent/config",async c=>{
    const b=await bodyOf(c),slug=slugOf(c,b);
    if(!(await verifyFileHubAgentCredential(c,slug)).ok)return c.json(err("AGENT_UNAUTHORIZED","Bu firma için File Agent anahtarı geçersiz."),401);
    const result=await c.env.DB.prepare(`SELECT id,name,provider_type,local_root_path,sync_mode,is_primary FROM file_hub_connections WHERE main_company_slug=? AND is_active=1 AND UPPER(sync_mode)='AGENT' AND TRIM(COALESCE(local_root_path,''))<>'' ORDER BY is_primary DESC,name COLLATE NOCASE`).bind(slug).all<Row>();
    return c.json({ok:true,data:{connections:(result.results||[]).map((row:Row)=>({storageConnectionId:row.id,name:row.name,providerType:row.provider_type,rootPath:row.local_root_path,isPrimary:Number(row.is_primary||0)!==0}))}});
  });

  app.post("/api/auth/file-hub-agent/scan-begin",async c=>{
    const b=await bodyOf(c),slug=slugOf(c,b);
    if(!(await verifyFileHubAgentCredential(c,slug)).ok)return c.json(err("AGENT_UNAUTHORIZED","Bu firma için File Agent anahtarı geçersiz."),401);
    const connectionId=text(b.storageConnectionId),startedAt=now();
    const connection=await c.env.DB.prepare(`SELECT id FROM file_hub_connections WHERE id=? AND main_company_slug=? AND is_active=1`).bind(connectionId,slug).first<Row>();
    if(!connection)return c.json(err("INVALID_CONNECTION","Depolama bağlantısı bulunamadı."),422);
    await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='SCANNING',last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(startedAt,connectionId,slug).run();
    return c.json({ok:true,data:{scanId:crypto.randomUUID(),startedAt}});
  });

  app.post("/api/auth/file-hub-agent/scan-complete",async c=>{
    const b=await bodyOf(c),slug=slugOf(c,b);
    if(!(await verifyFileHubAgentCredential(c,slug)).ok)return c.json(err("AGENT_UNAUTHORIZED","Bu firma için File Agent anahtarı geçersiz."),401);
    const connectionId=text(b.storageConnectionId),startedAt=text(b.startedAt),ts=now();
    if(!connectionId||!startedAt)return c.json(err("REQUIRED","storageConnectionId ve startedAt zorunludur."),422);
    const stale=await c.env.DB.prepare(`SELECT id,file_asset_id,location_role,relative_path FROM file_hub_locations WHERE main_company_slug=? AND storage_connection_id=? AND is_available=1 AND last_seen_at<?`).bind(slug,connectionId,startedAt).all<Row>();
    const rows=stale.results||[];
    for(const row of rows){
      await c.env.DB.prepare(`UPDATE file_hub_locations SET is_available=0,updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts,row.id,slug).run();
      if(String(row.location_role||"").toUpperCase()==="PRIMARY"){
        const replacement=await c.env.DB.prepare(`SELECT id FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1 ORDER BY CASE WHEN location_role='PRIMARY' THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 1`).bind(slug,row.file_asset_id).first<Row>();
        if(replacement?.id){
          await c.env.DB.prepare(`UPDATE file_hub_locations SET location_role='MIRROR',updated_at=? WHERE id=?`).bind(ts,row.id).run();
          await c.env.DB.prepare(`UPDATE file_hub_locations SET location_role='PRIMARY',updated_at=? WHERE id=?`).bind(ts,replacement.id).run();
        }
      }
      const available=await c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_locations WHERE main_company_slug=? AND file_asset_id=? AND is_available=1`).bind(slug,row.file_asset_id).first<Row>();
      if(Number(available?.n||0)===0)await c.env.DB.prepare(`UPDATE file_hub_assets SET status='MISSING',updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts,row.file_asset_id,slug).run();
      await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,device_name,details,created_at) VALUES(?,?,?,?,?,'AGENT',?,?,?)`).bind(crypto.randomUUID(),slug,connectionId,row.file_asset_id,"MISSING",text(b.deviceName)||null,JSON.stringify({relativePath:row.relative_path,scanId:text(b.scanId),authoritativeScan:true}),ts).run();
    }
    await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts,ts,connectionId,slug).run();
    return c.json({ok:true,data:{missingCount:rows.length,completedAt:ts}});
  });
}
