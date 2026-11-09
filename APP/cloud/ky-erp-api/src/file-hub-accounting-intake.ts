// File Hub's existing 5-minute scheduled cycle is the only trigger.
// Intake is strictly read-only for original Drive/OneDrive files.
// A signed, tenant-scoped E_BELGE or MUHASEBE binding is mandatory.
import { ingestIndexedFileHubEBelge } from "./e-belge-center-cloud.ts";

type Row=Record<string,any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
const SELECT=`
 SELECT DISTINCT a.id,a.main_company_slug,a.metadata
 FROM file_hub_assets a
 JOIN file_hub_locations l ON l.file_asset_id=a.id
   AND l.main_company_slug=a.main_company_slug AND l.is_available=1
 JOIN file_hub_connections c ON c.id=l.storage_connection_id
   AND c.main_company_slug=l.main_company_slug
 JOIN file_hub_bindings b ON b.storage_connection_id=c.id
   AND b.main_company_slug=a.main_company_slug
 WHERE a.status='AVAILABLE' AND c.is_active=1 AND c.sync_mode='CLOUD_API'
   AND c.provider_type IN ('GOOGLE_DRIVE','ONEDRIVE','SHAREPOINT')
   AND UPPER(a.extension) IN ('XML','PDF')
   AND COALESCE(a.size_bytes,0) BETWEEN 1 AND 20971520
   AND b.read_enabled=1 AND b.sync_enabled=1
   AND ((b.module_code='E_BELGE' AND b.purpose_code='E_DOCUMENT')
    OR (b.module_code='MUHASEBE' AND b.purpose_code IN ('INVOICE','DELIVERY_NOTE')))
   AND LENGTH(TRIM(COALESCE(b.root_path,''),'/'))>0
   AND (LOWER(REPLACE(l.relative_path,'\\','/')) = LOWER(TRIM(REPLACE(b.root_path,'\\','/'),'/'))
     OR LOWER(REPLACE(l.relative_path,'\\','/')) LIKE LOWER(TRIM(REPLACE(b.root_path,'\\','/'),'/')||'/%'))
   AND (
     json_extract(a.metadata,'$.accountingImportState') IS NULL
     OR (json_extract(a.metadata,'$.accountingImportState')='RETRY'
       AND COALESCE(json_extract(a.metadata,'$.accountingImportAttempts'),0)<3
       AND COALESCE(json_extract(a.metadata,'$.accountingImportRetryAt'),'')<=?)
     OR (json_extract(a.metadata,'$.accountingImportState')='PROCESSING'
       AND COALESCE(json_extract(a.metadata,'$.accountingImportClaimedAt'),'')<?)
   )
 ORDER BY a.last_seen_at DESC LIMIT 12`;

function stamp(){return new Date().toISOString();}
async function update(db:any,slug:string,id:string,state:string,attempts:number,extra:Row={}){
  const data=JSON.stringify({state,attempts,...extra});
  await db.prepare(`UPDATE file_hub_assets SET
    metadata=json_set(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
      '$.accountingImportState',?,
      '$.accountingImportAttempts',?,
      '$.accountingImportResult',json(?),
      '$.accountingImportUpdatedAt',?)
    WHERE id=? AND main_company_slug=?`).bind(state,attempts,data,stamp(),id,slug).run();
}

/** Periodic background indexing; never calls finalize/ledger/official submission. */
export async function runFileHubAccountingDocumentIntake(env:Cloudflare.Env){
  const now=stamp(),stale=new Date(Date.now()-25*60*1000).toISOString();
  const rows=(await env.DB.prepare(SELECT).bind(now,stale).all<Row>()).results||[];
  const result={scanned:rows.length,staged:0,review:0,retry:0};
  for(const row of rows){
    const slug=txt(row.main_company_slug),id=txt(row.id);
    if(!slug||!id)continue;
    let previous:Row={};try{previous=JSON.parse(txt(row.metadata)||"{}")}catch{}
    const attempts=Number(previous.accountingImportAttempts||0)+1,ts=stamp();
    const claim=await env.DB.prepare(`UPDATE file_hub_assets SET metadata=json_set(
      CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
      '$.accountingImportState','PROCESSING',
      '$.accountingImportClaimedAt',?,
      '$.accountingImportAttempts',?)
      WHERE id=? AND main_company_slug=? AND COALESCE(metadata,'')=?`)
      .bind(ts,attempts,id,slug,txt(row.metadata)).run();
    if(Number(claim.meta?.changes)!==1)continue;
    try{
      const ingested=await ingestIndexedFileHubEBelge(env,slug,id);
      await update(env.DB,slug,id,ingested.alreadyIndexed?"ATTACHED":"STAGED",attempts,
        {documentId:ingested.documentId,reviewRequired:true});
      result.staged++;
    }catch(err:any){
      const code=txt(err?.code)||"IMPORT_FAILED";
      const permanent=["PDF_EXTRACTION_NOT_READY","DOCUMENT_BINDING_MISSING",
        "DOCUMENT_FORMAT_UNSUPPORTED","UBL_TR_NOT_RECOGNIZED","DOCUMENT_QUANTITY_INVALID"].includes(code);
      const state=permanent||attempts>=3?"NEEDS_REVIEW":"RETRY";
      const retryAt=new Date(Date.now()+15*60*1000).toISOString();
      await update(env.DB,slug,id,state,attempts,{code});
      if(state==="RETRY"){
        await env.DB.prepare(`UPDATE file_hub_assets SET metadata=json_set(metadata,
          '$.accountingImportRetryAt',?) WHERE id=? AND main_company_slug=?`)
          .bind(retryAt,id,slug).run();
        result.retry++;
      }else result.review++;
    }
  }
  return result;
}
