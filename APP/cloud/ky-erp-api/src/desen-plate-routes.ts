// @ts-nocheck
import type { Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { readFileHubAssetForMail } from "./file-hub-cloud-oauth";
import { interpretPlacementText } from "./desen-placement-measurement";
import { describeSharedPlate, rankPrintVariants, suggestPlateMembership, validatePlateEntries } from "./desen-plate-logic";

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

const knownModelCache = new WeakMap<object, Map<string, Promise<Row[]>>>();
async function existingModels(c:any, slug:string):Promise<Row[]> {
  let scope = knownModelCache.get(c);
  if (!scope) { scope = new Map(); knownModelCache.set(c, scope); }
  if (!scope.has(slug)) scope.set(slug, c.env.DB.prepare("SELECT id modelId,model_name modelName FROM model_records WHERE main_company_slug=? LIMIT 10000").bind(slug).all<Row>().then((data:Row) => data.results || []));
  return scope.get(slug)!;
}

async function plateView(c:any,slug:string,asset:Row) {
  const stored=objectOf((await readMap(c,slug,t(asset.id)))?.data);
  const relations=await modelsOnPlate(c,slug,t(asset.id));
  // Filename hint generation only from known canonical models; never invent a model.
  const known=await existingModels(c,slug);
  const all=suggestPlateMembership(t(asset.file_name),known.map((r:Row)=>({
    modelId:t(r.modelId),modelName:t(r.modelName)
  })));
  const byId=new Map(known.map((r:Row)=>[t(r.modelId),t(r.modelName)]));
  const hinted=new Set(all.map((r:Row)=>t(r.modelId)));
  for (const row of relations) if(!hinted.has(t(row.modelId))) {
    all.push({modelId:t(row.modelId),sizeCode:"UNSPECIFIED",sizeLabel:"Boy bilinmiyor",printArea:"",evidence:"EXISTING_MODEL_RELATION"});
  }
  const confirmed=Array.isArray(stored.entries)?stored.entries:[];
  const sizeRanking=rankPrintVariants(confirmed);
  const revised=Boolean(stored.sourceFingerprint && stored.sourceFingerprint!==sourceKey(asset));
  return {
    assetId:t(asset.id),fileName:t(asset.file_name),relativePath:t(asset.relative_path),
    sourceType:t(asset.source_type),previewStatus:t(asset.preview_status),
    previewUrl:"/api/file-hub/files/"+encodeURIComponent(t(asset.id))+"/preview",
    sourceRevised:revised,revision:Number(stored.revision||0),
    shelfLabel:t(stored.shelfLabel),plateCode:t(stored.plateCode),
    entries:confirmed.map((row:Row,index:number)=>({...row,printedSizeRank:sizeRanking[index],modelName:byId.get(t(row.modelId))||t(row.modelName)||"Model bulunamadı"})),
    suggestions:stored.revision>0 ? [] : all.map((row:Row)=>({...row,modelName:byId.get(t(row.modelId))||"Model bulunamadı"})),
    status:stored.revision>0?(revised?"REVISION_REVIEW":confirmed.some((row:Row)=>!(Number(row.widthCm)>0 && Number(row.heightCm)>0))?"MEASUREMENT_PENDING":confirmed.some((row:Row)=>!row.allGarmentSizes&&!(Array.isArray(row.garmentSizes)&&row.garmentSizes.length))?"GARMENT_SIZES_PENDING":"CONFIRMED"):"REVIEW_REQUIRED",
    uniqueModels:new Set(confirmed.map((row:Row)=>t(row.modelId))).size,
    measuredVariants:confirmed.filter((row:Row)=>Number(row.widthCm)>0&&Number(row.heightCm)>0).length,
    measurementPending:confirmed.filter((row:Row)=>!(Number(row.widthCm)>0&&Number(row.heightCm)>0)).length,
    garmentSizePending:confirmed.filter((row:Row)=>!row.allGarmentSizes&&!(Array.isArray(row.garmentSizes)&&row.garmentSizes.length)).length,
  };
}

export function registerDesenPlateRoutes(app:Hono<AppEnv>) {
  // /api/desen/* is protected by enforceDesenTenant: auth + tenant + module rights.
  // Lightweight, tenant-guarded operational readiness. Never disclose credentials.
  // A File Hub heartbeat proves only that an agent is online, not that the
  // PSD consumer is running or that Cloudflare has OCR'd a real PDF.
  app.get("/api/desen/plates/status", async c=>{
    const slug=slugOf(c);
    const recent=new Date(Date.now()-3*60*1000).toISOString();
    const agent=await c.env.DB.prepare(
      "SELECT device_name,last_seen_at,status FROM file_hub_agent_status " +
      "WHERE main_company_slug=? ORDER BY last_seen_at DESC LIMIT 1"
    ).bind(slug).first<Row>().catch(()=>null);
    const agentHeartbeatFresh=Boolean(agent && t(agent.last_seen_at)>=recent &&
      t(agent.status).toUpperCase()==="ONLINE");
    const counts=await c.env.DB.prepare(
      "SELECT COUNT(*) total, "+
      "SUM(CASE WHEN preview_status='READY' AND preview_storage_key IS NOT NULL "+
      "AND preview_storage_key NOT LIKE 'file-hub/previews/cloud/%' THEN 1 ELSE 0 END) ready, "+
      "SUM(CASE WHEN preview_status IN ('PENDING','PROCESSING') THEN 1 ELSE 0 END) pending, "+
      "SUM(CASE WHEN preview_status='FAILED' THEN 1 ELSE 0 END) failed "+
      "FROM file_hub_assets WHERE main_company_slug=? AND status='AVAILABLE' "+
      "AND UPPER(extension) IN ('PSD','PSB')"
    ).bind(slug).first<Row>();
    return c.json({ok:true,data:{
      indexedPsd:Number(counts?.total||0),fullPreviewReady:Number(counts?.ready||0),
      previewPending:Number(counts?.pending||0),previewFailed:Number(counts?.failed||0),
      agentHeartbeatFresh,
      previewConsumerVerified:false,
      pdfTextExtractionConfigured:typeof (c.env as any).AI?.toMarkdown==="function",
      livePdfOcrVerified:false,
    }});
  });

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
         || (view.revision===0 && view.suggestions.some((entry:Row)=>t(entry.modelId)===modelId)))) continue;
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


  // Related placement PDFs are only CANDIDATES; not proof that a PDF covers the same plate.
  async function placementCandidates(c:any,slug:string,asset:Row) {
    const view=await plateView(c,slug,asset);
    const ids=[...new Set([...view.entries,...view.suggestions].map((row:Row)=>t(row.modelId)).filter(Boolean))];
    if(!ids.length)return [];
    const sql="SELECT DISTINCT a.id,a.file_name,a.size_bytes FROM file_hub_assets a " +
      "JOIN file_hub_relations r ON r.file_asset_id=a.id AND r.main_company_slug=a.main_company_slug " +
      "WHERE a.main_company_slug=? AND a.status='AVAILABLE' AND UPPER(a.extension)='PDF' " +
      "AND a.source_type='CLOUD_API' AND r.entity_type='MODEL' AND r.entity_id IN ("+
      ids.map(()=>"?").join(",")+") ORDER BY a.file_name LIMIT 40";
    return (await c.env.DB.prepare(sql).bind(slug,...ids).all<Row>()).results||[];
  }
  app.get("/api/desen/plates/:assetId/placement-pdfs",async c=>{
    const slug=slugOf(c),asset=await plateAsset(c,slug,t(c.req.param("assetId")));
    if(!asset)return c.json(error("PLATE_NOT_FOUND","PSD kaynağı bulunamadı."),404);
    const items=await placementCandidates(c,slug,asset);
    return c.json({ok:true,data:{items:items.map((row:Row)=>({
      assetId:t(row.id),fileName:t(row.file_name),sizeBytes:Number(row.size_bytes||0),
      status:"CANDIDATE"
    }))}});
  });
  app.post("/api/desen/plates/:assetId/interpret-placement",async c=>{
    const slug=slugOf(c),asset=await plateAsset(c,slug,t(c.req.param("assetId")));
    if(!asset)return c.json(error("PLATE_NOT_FOUND","PSD kaynağı bulunamadı."),404);
    let body:Row={};
    try {body=await c.req.json<Row>()}catch{return c.json(error("INVALID_JSON","Yerleşim kaynağı seçilmedi."),400)}
    const id=t(body.placementAssetId);
    if(!id)return c.json(error("PDF_REQUIRED","Yerleşim PDF'si seçilmelidir."),422);
    const permitted=await placementCandidates(c,slug,asset);
    if(!permitted.some((row:Row)=>t(row.id)===id))
      return c.json(error("PLACEMENT_NOT_LINKED","Bu PDF, kalıpla ilişkili bir modelin yerleşim kaynağı olarak bulunamadı."),403);
    const ai=(c.env as any).AI;
    if(!ai?.toMarkdown)return c.json(error("OCR_UNAVAILABLE","Yerleşim görsel okuma servisi şu anda hazır değil."),503);
    try {
      // Provider OAuth stays in Worker; original PDF never goes to GitHub or R2.
      const source=await readFileHubAssetForMail(c,slug,id,5*1024*1024);
      const result=await ai.toMarkdown({
        name:source.fileName,
        blob:new Blob([source.bytes],{type:"application/pdf"}),
      },{
        conversionOptions:{pdf:{metadata:false},output:{format:"text"}},
      });
      const document=Array.isArray(result)?result[0]:result;
      if(!document || document.format==="error")return c.json(error("OCR_FAILED","Yerleşim yazıları okunamadı."),422);
      const lines=t(document.data).slice(0,30000);
      const observations=interpretPlacementText(lines);
      return c.json({ok:true,data:{
        placementAssetId:id,fileName:source.fileName,
        status:"OCR_UNVERIFIED",measurements:observations,
        message:"Ölçüler otomatik adaydır; model, baskı yeri, ürün bedeni ve gerçek en–boy kontrol edilmeden kaydetmeyin."
      }});
    }catch(e:any){
      // External provider errors and OCR response contents are not forwarded.
      const code=t(e?.code);
      return c.json(error(code==="MAIL_ATTACHMENT_TOO_LARGE"?"PDF_TOO_LARGE":"PLACEMENT_SCAN_FAILED",
        "Yerleşim PDF'si okunamadı. Dosyayı ve bağlantıyı kontrol edin."),502);
    }
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
      // Deterministic primary ID makes simultaneous first saves fail closed instead of
      // creating two independently editable copies of the same physical PSD plate.
      const first=await c.env.DB.prepare(
        "INSERT OR IGNORE INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
      ).bind("desen-plate-"+t(asset.id),SCOPE,slug,t(asset.id),JSON.stringify(payload),stamp,stamp).run();
      if(!first.meta?.changes)return c.json(error("REVISION_CONFLICT","Kalıp başka bir kullanıcı tarafından eş zamanlı kaydedildi; yeniden açın."),409);
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
