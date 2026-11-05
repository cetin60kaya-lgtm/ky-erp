// @ts-nocheck
import type { Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { describeSharedPlate, suggestPlateMembership, validatePlateEntries } from "./desen-plate-logic";

/** A PSD/PSB file asset is the physical shared kalip identity; names are never renamed. */
type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const SCOPE = "DESEN_PLATE_MAP";
const t = (value: unknown) => value == null ? "" : String(value).trim();
const error = (code: string, message: string) => ({ok:false,error:{code,message}});
const slugOf = (c: any) => t(c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug")).toLowerCase();
const objectOf = (value: any): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { const o = JSON.parse(t(value) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
};
const sourceKey = (asset: Row) => JSON.stringify([
  t(asset.id),t(asset.file_name),Number(asset.size_bytes||0),
  t(objectOf(asset.metadata).checksum),t(asset.provider_modified_at),
]);

async function plateAsset(c:any, slug:string, id:string): Promise<Row | null> {
  // DESEN folder binding OR existing model relation. No cross-module PSD discovery.
  return c.env.DB.prepare(`
    SELECT a.*,l.relative_path,l.provider_modified_at
      FROM file_hub_assets a
      LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id
        AND l.main_company_slug=a.main_company_slug AND l.is_available=1
     WHERE a.id=? AND a.main_company_slug=?
       AND a.status='AVAILABLE' AND UPPER(a.extension) IN ('PSD','PSB')
       AND (
        EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.main_company_slug=a.main_company_slug
          AND r.file_asset_id=a.id AND r.entity_type='MODEL')
        OR EXISTS(SELECT 1 FROM file_hub_locations loc
          JOIN file_hub_bindings b ON b.main_company_slug=loc.main_company_slug
            AND b.storage_connection_id=loc.storage_connection_id AND b.module_code='DESEN'
            AND b.sync_enabled=1
          WHERE loc.file_asset_id=a.id AND loc.main_company_slug=a.main_company_slug
            AND (lower(loc.relative_path)=lower(b.root_path)
              OR substr(lower(loc.relative_path),1,length(b.root_path)+1)=lower(b.root_path)||'/'))
       ) ORDER BY l.location_role='PRIMARY' DESC LIMIT 1
  `).bind(id,slug).first<Row>();
}
async function readMap(c:any,slug:string,assetId:string) {
  return c.env.DB.prepare("SELECT id,data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? ORDER BY updated_at DESC LIMIT 1")
    .bind(SCOPE,slug,assetId).first<Row>();
}
async function modelsOnPlate(c:any,slug:string,assetId:string) {
  const r=await c.env.DB.prepare(`
    SELECT DISTINCT m.id modelId, m.model_name modelName
      FROM file_hub_relations f
      JOIN model_records m ON m.id=f.entity_id AND m.main_company_slug=f.main_company_slug
     WHERE f.main_company_slug=? AND f.file_asset_id=? AND f.entity_type='MODEL'
       AND COALESCE(f.source,'')<>'SUPERSEDED_MANUAL'
       AND COALESCE(TRIM(m.deleted_at),'')=''
     ORDER BY m.model_name LIMIT 70
  `).bind(slug,assetId).all<Row>();
  return r.results||[];
}
async function plateView(c:any,slug:string,asset:Row) {
  const stored=objectOf((await readMap(c,slug,t(asset.id)))?.data);
  const relations=await modelsOnPlate(c,slug,t(asset.id));
  // Filename hint generation only from known canonical models; never invent a model.
  const known=await c.env.DB.prepare(`
    SELECT id modelId,model_name modelName FROM model_records
    WHERE main_company_slug=? AND COALESCE(TRIM(deleted_at),'')='' LIMIT 4000
  `).bind(slug).all<Row>();
  const all=suggestPlateMembership(t(asset.file_name),(known.results||[]).map((r:Row)=>({
    modelId:t(r.modelId),modelName:t(r.modelName)
  })));
  const byId=new Map((known.results||[]).map((r:Row)=>[t(r.modelId),t(r.modelName)]));
  const hinted=new Set(all.map((r:Row)=>t(r.modelId)));
  for (const row of relations) if(!hinted.has(t(row.modelId))) {
    all.push({modelId:t(row.modelId),sizeCode:"UNSPECIFIED",sizeLabel:"Boy bilinmiyor",printArea:"",evidence:"EXISTING_MODEL_RELATION"});
  }
  const confirmed=Array.isArray(stored.entries)?stored.entries:[];
  const revised=Boolean(stored.sourceFingerprint && stored.sourceFingerprint!==sourceKey(asset));
  return {
    assetId:t(asset.id),fileName:t(asset.file_name),relativePath:t(asset.relative_path),
    sourceType:t(asset.source_type),previewStatus:t(asset.preview_status),
    previewUrl:"/api/file-hub/files/"+encodeURIComponent(t(asset.id))+"/preview",
    sourceRevised:revised,revision:Number(stored.revision||0),
    shelfLabel:t(stored.shelfLabel),plateCode:t(stored.plateCode),
    entries:confirmed.map((row:Row)=>({...row,modelName:byId.get(t(row.modelId))||t(row.modelName)||"Model bulunamadı"})),
    suggestions:all.map((row:Row)=>({...row,modelName:byId.get(t(row.modelId))||"Model bulunamadı"})),
    status:stored.revision>0?(revised?"REVISION_REVIEW":"CONFIRMED"):"REVIEW_REQUIRED",
    uniqueModels:new Set(confirmed.map((row:Row)=>t(row.modelId))).size,
  };
}

export function registerDesenPlateRoutes(app:Hono<AppEnv>) {
  // /api/desen/* is protected by enforceDesenTenant: auth + tenant + module rights.
  app.get("/api/desen/plates/models", async c=>{
    const slug=slugOf(c);
    const rows=await c.env.DB.prepare(
      "SELECT id modelId,model_name modelName FROM model_records WHERE main_company_slug=? AND COALESCE(TRIM(deleted_at),'')='' ORDER BY model_name LIMIT 4000"
    ).bind(slug).all<Row>();
    return c.json({ok:true,data:{models:rows.results||[]}});
  });

  app.get("/api/desen/plates/model/:modelId", async c=>{
    const slug=slugOf(c),modelId=t(c.req.param("modelId"));
    const model=await c.env.DB.prepare("SELECT id,model_name FROM model_records WHERE id=? AND main_company_slug=? AND COALESCE(TRIM(deleted_at),'')='' LIMIT 1")
      .bind(modelId,slug).first<Row>();
    if(!model)return c.json(error("MODEL_NOT_FOUND","Model bulunamadı."),404);
    const name=t(model.model_name);
    // Include unbound candidate PSD files with the exact known model token,
    // but keep these as suggestions until sizes and membership are confirmed.
    const r=await c.env.DB.prepare(`
      SELECT DISTINCT a.id FROM file_hub_assets a
      WHERE a.main_company_slug=? AND a.status='AVAILABLE' AND UPPER(a.extension) IN ('PSD','PSB')
        AND (
          EXISTS(SELECT 1 FROM file_hub_relations f WHERE f.file_asset_id=a.id
            AND f.main_company_slug=a.main_company_slug AND f.entity_type='MODEL' AND f.entity_id=?
            AND COALESCE(f.source,'')<>'SUPERSEDED_MANUAL')
          OR (length(?)>=4 AND upper(a.file_name) LIKE upper(?) ESCAPE '\\'
              AND EXISTS(SELECT 1 FROM file_hub_locations loc
                JOIN file_hub_bindings b ON b.main_company_slug=loc.main_company_slug
                  AND b.storage_connection_id=loc.storage_connection_id AND b.module_code='DESEN'
                  AND b.sync_enabled=1
                WHERE loc.file_asset_id=a.id AND loc.main_company_slug=a.main_company_slug
                  AND substr(lower(loc.relative_path),1,length(b.root_path)+1)=lower(b.root_path)||'/'))
        )
      ORDER BY a.id LIMIT 150
    `).bind(slug,modelId,name,"%"+name.replace(/[\\%_]/g,x=>"\\"+x)+"%").all<Row>();
    const plates:Row[]=[];
    for(const row of (r.results||[])){
      const asset=await plateAsset(c,slug,t(row.id));
      if(!asset)continue;
      const view=await plateView(c,slug,asset);
      if (!(view.entries.some((entry:Row)=>t(entry.modelId)===modelId)
         || view.suggestions.some((entry:Row)=>t(entry.modelId)===modelId))) continue;
      const stats=describeSharedPlate(view.entries,modelId);
      plates.push({...view,modelSizeCount:stats.modelSizeCount});
    }
    return c.json({ok:true,data:{modelId,modelName:t(model.model_name),plates}});
  });

  app.get("/api/desen/plates/search",async c=>{
    const slug=slugOf(c),term=t(c.req.query("q"));
    if(term.length<2 || term.length>100)return c.json(error("INVALID_SEARCH","En az iki karakter arayın."),422);
    const escaped=term.replace(/[\\%_]/g,x=>"\\"+x);
    const results=await c.env.DB.prepare(`
      SELECT DISTINCT a.id,a.file_name FROM file_hub_assets a
      WHERE a.main_company_slug=? AND a.status='AVAILABLE'
        AND UPPER(a.extension) IN ('PSD','PSB')
        AND a.file_name LIKE ? ESCAPE '\\'
        AND (
          EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.main_company_slug=a.main_company_slug AND r.file_asset_id=a.id AND r.entity_type='MODEL')
          OR EXISTS(SELECT 1 FROM file_hub_locations loc JOIN file_hub_bindings b ON b.main_company_slug=loc.main_company_slug
              AND b.storage_connection_id=loc.storage_connection_id AND b.module_code='DESEN' AND b.sync_enabled=1
            WHERE loc.file_asset_id=a.id AND loc.main_company_slug=a.main_company_slug
              AND substr(lower(loc.relative_path),1,length(b.root_path)+1)=lower(b.root_path)||'/')
        )
      ORDER BY a.file_name LIMIT 35
    `).bind(slug,"%"+escaped+"%").all<Row>();
    return c.json({ok:true,data:{files:results.results||[]}});
  });

  app.get("/api/desen/plates/:assetId",async c=>{
    const slug=slugOf(c),asset=await plateAsset(c,slug,t(c.req.param("assetId")));
    if(!asset)return c.json(error("PLATE_NOT_FOUND","Kalıp PSD bulunamadı."),404);
    return c.json({ok:true,data:await plateView(c,slug,asset)});
  });

  app.put("/api/desen/plates/:assetId",async c=>{
    const slug=slugOf(c),asset=await plateAsset(c,slug,t(c.req.param("assetId")));
    if(!asset)return c.json(error("PLATE_NOT_FOUND","Kalıp PSD bulunamadı."),404);
    let body:Row;
    try {body=await c.req.json<Row>();}catch{return c.json(error("INVALID_JSON","Geçerli JSON gönderin."),400);}
    const parsed=validatePlateEntries(body.entries);
    if(!parsed.ok)return c.json(error("INVALID_MEMBERS",parsed.error),422);
    const expected=Number(body.expectedRevision);
    if(!Number.isInteger(expected)||expected<0)return c.json(error("REVISION_REQUIRED","Kayıt sürümü zorunludur."),422);
    const shelfLabel=t(body.shelfLabel),plateCode=t(body.plateCode);
    if(shelfLabel.length>120||plateCode.length>100)return c.json(error("FIELD_TOO_LONG","Raf veya kalıp kodu çok uzun."),422);
    const ids=[...new Set(parsed.entries.map((r:Row)=>r.modelId))];
    let modelRows:Row[]=[];
    if(ids.length){
      const q="SELECT id,model_name FROM model_records WHERE main_company_slug=? AND COALESCE(TRIM(deleted_at),'')='' AND id IN ("+ids.map(()=>"?").join(",")+")";
      modelRows=(await c.env.DB.prepare(q).bind(slug,...ids).all<Row>()).results||[];
    }
    if(modelRows.length!==ids.length)return c.json(error("MODEL_SCOPE","Yalnız bu firmaya ait mevcut modeller bağlanabilir."),422);
    const names=new Map(modelRows.map(r=>[t(r.id),t(r.model_name)]));
    const prevRow=await readMap(c,slug,t(asset.id));
    const prev=objectOf(prevRow?.data);
    if(Number(prev.revision||0)!==expected)return c.json(error("REVISION_CONFLICT","Bu kalıp başka bir kullanıcı tarafından güncellendi; yeniden açın."),409);
    if(prev.sourceFingerprint && prev.sourceFingerprint!==sourceKey(asset) && body.acceptSourceRevision!==true)
      return c.json(error("SOURCE_REVISED","PSD değişmiş. Eski boy ilişkilerini gözden geçirip yeniden doğrulayın."),409);
    const stamp=new Date().toISOString();
    const normalized=parsed.entries.map((r:Row)=>({...r,modelName:names.get(r.modelId)||"",source:"MANUAL_CONFIRMED"}));
    const payload={
      version:1,sourceAssetId:t(asset.id),sourceFileName:t(asset.file_name),
      sourceFingerprint:sourceKey(asset),revision:expected+1,updatedAt:stamp,
      updatedBy:t((await getAuthenticatedUser(c))?.id),shelfLabel,plateCode,
      entries:normalized,
      previous:prev.revision?{revision:prev.revision,updatedAt:prev.updatedAt,entries:prev.entries}:null,
    };
    if(prevRow?.id){
      const written=await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND data=?")
        .bind(JSON.stringify(payload),stamp,prevRow.id,prevRow.data).run();
      if(!written.meta?.changes)return c.json(error("REVISION_CONFLICT","Eşleştirme eş zamanlı değişti."),409);
    }else{
      // Existing json_store scope; no migration or new canonical model record.
      await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),SCOPE,slug,t(asset.id),JSON.stringify(payload),stamp,stamp).run();
    }
    // Manual relation is only an index. The authoritative per-size mapping is the plate record.
    // Do not delete automatic CLOUD_RULE relationships or move any physical source file.
    const keep=new Set(ids);
    const manual=await c.env.DB.prepare("SELECT id,entity_id FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' AND relation_type='SHARED_PLATE'")
      .bind(slug,t(asset.id)).all<Row>();
    for(const old of manual.results||[]) if(!keep.has(t(old.entity_id))){
      await c.env.DB.prepare("UPDATE file_hub_relations SET source='SUPERSEDED_MANUAL',updated_at=? WHERE id=? AND main_company_slug=?")
        .bind(stamp,old.id,slug).run();
    }
    for(const id of ids){
      const previous=(manual.results||[]).find((row:Row)=>t(row.entity_id)===id);
      if(previous) await c.env.DB.prepare("UPDATE file_hub_relations SET source='MANUAL_CONFIRMED',updated_at=? WHERE id=? AND main_company_slug=?")
        .bind(stamp,previous.id,slug).run();
      else await c.env.DB.prepare(`
        INSERT OR IGNORE INTO file_hub_relations
        (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
        VALUES(?,?,?,'MODEL',?,'SHARED_PLATE',0,1,'MANUAL_CONFIRMED',?,?,?)
      `).bind(crypto.randomUUID(),slug,t(asset.id),id,JSON.stringify({evidence:"manual",sourceFileName:t(asset.file_name)}),stamp,stamp).run();
    }
    return c.json({ok:true,data:{assetId:t(asset.id),revision:payload.revision,confirmedEntries:normalized.length,originalFileName:t(asset.file_name)}});
  });
}
