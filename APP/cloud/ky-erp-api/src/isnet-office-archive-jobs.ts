// Native office archive jobs: explicit user start, original Drive only, no accounting posting.
// Existing JSON store and File Hub document intake are the canonical records.
import type {Context} from "hono";
import {officeFenceCondition,type OfficeFence} from "./isnet-office-coordinator.ts";
import {completedOfficeReadManifest,officeReadCompanyTax,type Source} from "./isnet-office-read-jobs.ts";
import {archiveVerifiedIsnetGoogleOriginal} from "./file-hub-cloud-oauth.ts";
import {ingestIndexedFileHubEBelge} from "./e-belge-center-cloud.ts";
import {parseSoapXml} from "./isnet-soap-read.ts";
import {verifyIsnetDownloadedFile} from "./isnet-file-validation.ts";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type DB=Cloudflare.Env["DB"];
const SCOPE="ISNET_OFFICE_ARCHIVE_V1",MAX_DOCS=500,TTL=3*60*60*1000,CLAIM_TIMEOUT=5*60*1000;
export const OFFICE_ARCHIVE_MAX_BYTES=8*1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const U="urn:oasis:names:specification:ubl:schema:xsd:",B=U+"CommonBasicComponents-2",A=U+"CommonAggregateComponents-2";
const folders:Record<Source,string>={INVOICE_IN:"GELEN-FATURA",INVOICE_OUT:"GIDEN-FATURA",ARCHIVE_OUT:"GIDEN-EARSIV",DISPATCH_IN:"GELEN-IRSALIYE",DISPATCH_OUT:"GIDEN-IRSALIYE"};
type Entry={source:Source;ettn:string};
type Binding={connectionId:string;root:string;companyFolder:string};
type Job={id:string;queryId:string;from:string;to:string;taxHash:string;binding:Binding;entries:Entry[];cursor:number;state:"QUEUED"|"RUNNING"|"COMPLETE"|"REVIEW_REQUIRED";xml:number;pdf:number;pdfPending:number;existing:number;failed:number;claim?:{id:string;fence:string;at:number};expiresAt:number;updatedAt:number;error?:string};
type Stored={raw:string;job:Job};
const key=(tenant:string)=>SCOPE+":"+tenant;
const active=(j:Job,now:number)=>["QUEUED","RUNNING"].includes(j.state)&&j.expiresAt>now;
const txt=(v:unknown)=>String(v??"").trim();
const rootParts=(s:string)=>s.replace(/\\/g,"/").replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
const safePart=(s:string)=>s.length>0&&s.length<=250&&!/[\x00-\x1f/\\]/.test(s)&&s!=="."&&s!=="..";
async function stored(db:DB,tenant:string):Promise<Stored|null>{const r=await db.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=?").bind(key(tenant),SCOPE,tenant).first<{data:string}>();return r?{raw:r.data,job:JSON.parse(r.data) as Job}:null}
function view(j:Job|null,now=Date.now()){return j?{id:j.id,queryId:j.queryId,from:j.from,to:j.to,state:["QUEUED","RUNNING"].includes(j.state)&&j.expiresAt<=now?"EXPIRED":j.state,total:j.entries.length,processed:j.cursor,xml:j.xml,pdf:j.pdf,pdfPending:j.pdfPending,existing:j.existing,failed:j.failed,error:j.error||null,updatedAt:j.updatedAt}:null}
export async function getOfficeArchiveJob(db:DB,tenant:string){return view((await stored(db,tenant))?.job||null)}
async function bindingOf(db:DB,tenant:string,requireIndex:boolean):Promise<Binding>{
 const rows=(await db.prepare("SELECT b.storage_connection_id,b.root_path,b.read_enabled,b.write_enabled,b.sync_enabled,c.last_sync_at,c.connection_status,c.metadata FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id AND c.main_company_slug=b.main_company_slug WHERE b.main_company_slug=? AND b.module_code IN ('E_BELGE','EBELGE') AND b.purpose_code='E_DOCUMENT' AND c.is_active=1 AND c.provider_type='GOOGLE_DRIVE' AND c.sync_mode='CLOUD_API' LIMIT 2").bind(tenant).all<Record<string,any>>()).results;
 if(rows.length!==1)throw Error("DRIVE_BINDING_REQUIRED");const row=rows[0]!;
 if(Number(row.read_enabled)!==1||Number(row.sync_enabled)!==1||Number(row.write_enabled)!==1)throw Error("DRIVE_WRITE_REQUIRED");
 const parts=rootParts(txt(row.root_path));if(parts.some(p=>!safePart(p)))throw Error("DRIVE_ROOT_INVALID");
 const root=parts.join("/"),prefix=root?root+"/":"",connectionId=txt(row.storage_connection_id);
 if(!connectionId)throw Error("DRIVE_BINDING_REQUIRED");
 // Existing structure: one company folder under each direction. No parallel archive root.
 const paths=(await db.prepare("SELECT DISTINCT relative_path FROM file_hub_locations WHERE main_company_slug=? AND storage_connection_id=? AND is_available=1 AND substr(relative_path,1,?)=? AND LOWER(relative_path) LIKE '%.xml' LIMIT 5001").bind(tenant,connectionId,prefix.length,prefix).all<{relative_path:string}>()).results;
 if(paths.length>5000)throw Error("DRIVE_INDEX_LIMIT");
 const names=new Set<string>();
 for(const p of paths){const rel=txt(p.relative_path).slice(prefix.length).split("/");if(Object.values(folders).includes(rel[0]!)&&rel.length>=6&&/^\d{4}$/.test(rel[2]||"")&&/^\d{2}$/.test(rel[3]||"")&&safePart(rel[1]||""))names.add(rel[1]!)}
 if(names.size>1)throw Error("DRIVE_COMPANY_FOLDER_AMBIGUOUS");
 const companyFolder=names.values().next().value||tenant;
 if(!safePart(companyFolder))throw Error("DRIVE_ROOT_INVALID");
 if(requireIndex){
  let meta:Record<string,any>={};try{meta=JSON.parse(txt(row.metadata)||"{}")}catch{throw Error("DRIVE_INDEX_NOT_READY")}
  if(!row.last_sync_at||meta.cloudSyncCursor||txt(row.connection_status)!=="CONNECTED")throw Error("DRIVE_INDEX_NOT_READY");
  // Any unlinked official-looking original under this archive must be reconciled first.
  const pending=await db.prepare("SELECT COUNT(*) n FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1 AND a.status='AVAILABLE' AND UPPER(a.extension)='XML' AND substr(l.relative_path,1,?)=? AND (substr(l.relative_path,?,12)='GELEN-FATURA' OR substr(l.relative_path,?,12)='GIDEN-FATURA' OR substr(l.relative_path,?,14)='GELEN-IRSALIYE' OR substr(l.relative_path,?,14)='GIDEN-IRSALIYE' OR substr(l.relative_path,?,12)='GIDEN-EARSIV') AND instr(lower(l.relative_path),'/_inceleme/')=0 AND instr(lower(l.relative_path),'/_durum/')=0 AND instr(lower(l.relative_path),'/_uygulama/')=0 AND NOT EXISTS(SELECT 1 FROM file_hub_relations x JOIN accounting_documents d ON d.id=x.entity_id AND d.main_company_slug=x.main_company_slug AND d.deleted_at IS NULL WHERE x.main_company_slug=l.main_company_slug AND x.file_asset_id=l.file_asset_id AND x.entity_type='DOCUMENT' AND x.relation_type='XML')").bind(tenant,connectionId,prefix.length,prefix,prefix.length+1,prefix.length+1,prefix.length+1,prefix.length+1,prefix.length+1).first<{n:number}>();
  if(Number(pending?.n||0)>0)throw Error("DRIVE_INDEX_NOT_READY");
 }
 return {connectionId,root,companyFolder};
}
export async function queueOfficeArchiveJob(db:DB,tenant:string,queryId:string,now=Date.now()){
 if(!UUID.test(queryId))throw Error("READ_MANIFEST_REQUIRED");
 const manifest=await completedOfficeReadManifest(db,tenant,queryId,now);if(!manifest.entries.length)throw Error("NO_MISSING_DOCUMENTS");if(manifest.entries.length>MAX_DOCS)throw Error("ARCHIVE_JOB_LIMIT");
 const binding=await bindingOf(db,tenant,true),ts=new Date(now).toISOString(),id=key(tenant);
 const j:Job={id:crypto.randomUUID(),queryId,...manifest,binding,cursor:0,state:"QUEUED",xml:0,pdf:0,pdfPending:0,existing:0,failed:0,expiresAt:now+TTL,updatedAt:now};
 const result=await db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE scope=excluded.scope AND main_company_slug=excluded.main_company_slug AND json_extract(data,'$.claim.id') IS NULL AND (json_extract(data,'$.state') NOT IN ('QUEUED','RUNNING') OR json_extract(data,'$.expiresAt')<=?)").bind(id,SCOPE,tenant,id,JSON.stringify(j),ts,ts,now).run();
 if(Number(result.meta.changes)!==1)throw Error("ARCHIVE_JOB_ALREADY_RUNNING");return view(j,now);
}
async function save(db:DB,lease:OfficeFence,s:Stored,now:number){
 const g=officeFenceCondition(lease,lease.tenant,now);
 s.job.updatedAt=now;
 const result=await db.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND main_company_slug=? AND data=?"+g.sql).bind(JSON.stringify(s.job),new Date(now).toISOString(),key(lease.tenant),SCOPE,lease.tenant,s.raw,...g.args).run();
 return Number(result.meta.changes)===1;
}
export async function officeArchiveTick(db:DB,lease:OfficeFence,now=Date.now()){
 const s=await stored(db,lease.tenant);if(!s)return {busy:false,task:null};
 const j=s.job;
 if(j.claim){if(now-j.claim.at>CLAIM_TIMEOUT){j.state="REVIEW_REQUIRED";j.error="ARCHIVE_RESULT_UNCERTAIN";delete j.claim;await save(db,lease,s,now)}return{busy:true,task:null}}
 if(!active(j,now))return {busy:false,task:null};
 try{
  const tax=await officeReadCompanyTax(db,lease.tenant,j.taxHash);
  const binding=await bindingOf(db,lease.tenant,false);if(JSON.stringify(binding)!==JSON.stringify(j.binding))throw Error("DRIVE_BINDING_CHANGED");
  const entry=j.entries[j.cursor];if(!entry)throw Error("ARCHIVE_CURSOR_INVALID");
  if(j.state==="QUEUED"){j.state="RUNNING";if(!(await save(db,lease,s,now)))return{busy:true,task:null}}
  return {busy:true,task:{jobId:j.id,...entry,from:j.from,to:j.to,taxCode:tax,fence:lease.fence}};
 }catch{j.state="REVIEW_REQUIRED";j.error="ARCHIVE_CONFIGURATION_CHANGED";await save(db,lease,s,now);return{busy:true,task:null}}
}
type N={local:string;uri:string;text:string;attrs:Record<string,string>;children:N[]};
const one=(n:N,uri:string,local:string)=>{const a=n.children.filter(x=>x.uri===uri&&x.local===local);if(a.length!==1)throw Error("UBL_IDENTITY_INVALID");return a[0]!};
const scalar=(n:N)=>{if(n.children.length)throw Error("UBL_IDENTITY_INVALID");return n.text.trim()};
export function validateOfficeArchiveXml(bytes:ArrayBuffer,entry:Entry,tax:string,from:string,to:string){
 if(bytes.byteLength<20||bytes.byteLength>OFFICE_ARCHIVE_MAX_BYTES||!UUID.test(entry.ettn)||!/^\d{10,11}$/.test(tax))throw Error("UBL_IDENTITY_INVALID");
 verifyIsnetDownloadedFile("xml",bytes,"application/xml");
 const root:N=parseSoapXml(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),dispatch=entry.source.startsWith("DISPATCH"),name=dispatch?"DespatchAdvice":"Invoice";
 if(root.local!==name||root.uri!==U+name+"-2")throw Error("UBL_KIND_MISMATCH");
 const ettn=scalar(one(root,B,"UUID")).toLowerCase(),no=scalar(one(root,B,"ID")),date=scalar(one(root,B,"IssueDate"));
 if(ettn!==entry.ettn||!/^[A-Z0-9]{3}[0-9]{13}$/.test(no)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<from||date>to||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw Error("UBL_IDENTITY_INVALID");
 const incoming=entry.source.endsWith("_IN"),partyName=dispatch?(incoming?"DeliveryCustomerParty":"DespatchSupplierParty"):(incoming?"AccountingCustomerParty":"AccountingSupplierParty");
 const p=one(one(root,A,partyName),A,"Party");
 const ids=p.children.filter(x=>x.uri===A&&x.local==="PartyIdentification").flatMap(x=>x.children.filter(y=>y.uri===B&&y.local==="ID"&&["VKN","TCKN"].includes(y.attrs.schemeID)));
 if(ids.length!==1||scalar(ids[0]!)!==tax)throw Error("UBL_TENANT_MISMATCH");
 return {no,date,ettn,direction:incoming?"INCOMING":"OUTGOING"};
}
function advance(j:Job){j.cursor++;delete j.claim;if(j.cursor>=j.entries.length)j.state=j.failed||j.pdfPending?"REVIEW_REQUIRED":"COMPLETE";else j.state="RUNNING"}
export async function acceptOfficeArchiveDocument(c:Context<Env>,lease:OfficeFence,form:FormData){
 const db=c.env.DB,tenant=lease.tenant,s=await stored(db,tenant),now=Date.now();if(!s||!active(s.job,now)||s.job.claim)throw Error("ARCHIVE_CLAIM_UNAVAILABLE");
 const j=s.job,entry=j.entries[j.cursor];if(!entry||form.get("jobId")!==j.id||form.get("source")!==entry.source||form.get("ettn")!==entry.ettn||form.get("fence")!==lease.fence)throw Error("ARCHIVE_TASK_MISMATCH");
 const tax=await officeReadCompanyTax(db,tenant,j.taxHash),binding=await bindingOf(db,tenant,false);if(JSON.stringify(binding)!==JSON.stringify(j.binding))throw Error("DRIVE_BINDING_CHANGED");
 // First check again for an already imported identity, including duplicate/conflict.
 const existing=(await db.prepare("SELECT id,uuid,direction,document_type,xml_file_asset_id,pdf_file_asset_id FROM accounting_documents WHERE main_company_slug=? AND LOWER(uuid)=? AND deleted_at IS NULL LIMIT 2").bind(tenant,entry.ettn).all<Record<string,any>>()).results;
 const expectedDirection=entry.source.endsWith("_IN")?"INCOMING":"OUTGOING",kind=entry.source.startsWith("DISPATCH")?"IRSALIYE":"FATURA";
 if(existing.length){if(existing.length!==1||existing[0]!.direction!==expectedDirection||!txt(existing[0]!.document_type).includes(kind)||!existing[0]!.xml_file_asset_id){j.state="REVIEW_REQUIRED";j.error="ARCHIVE_EXISTING_CONFLICT"}else{j.existing++;if(!existing[0]!.pdf_file_asset_id)j.pdfPending++;advance(j)}if(!await save(db,lease,s,now))throw Error("ARCHIVE_CLAIM_UNAVAILABLE");return view(j)}
 if(form.get("result")==="FAILED"){j.failed++;advance(j);if(!await save(db,lease,s,now))throw Error("ARCHIVE_CLAIM_UNAVAILABLE");return view(j)}
 const xml=form.get("xml"),pdf=form.get("pdf");let xb:ArrayBuffer,pb:ArrayBuffer|null=null,identity:ReturnType<typeof validateOfficeArchiveXml>;
 try{
  if(!(xml instanceof File)||xml.size>OFFICE_ARCHIVE_MAX_BYTES||form.get("result")!=="OK")throw Error("UBL_FILE_REQUIRED");
  if(pdf!==null&&(!(pdf instanceof File)||xml.size+pdf.size>OFFICE_ARCHIVE_MAX_BYTES))throw Error("FILE_SIZE_INVALID");
  xb=await xml.arrayBuffer();identity=validateOfficeArchiveXml(xb,entry,tax,j.from,j.to);
  if(pdf instanceof File&&pdf.size){pb=await pdf.arrayBuffer();verifyIsnetDownloadedFile("pdf",pb,"application/pdf")}
 }catch{j.failed++;advance(j);if(!await save(db,lease,s,now))throw Error("ARCHIVE_CLAIM_UNAVAILABLE");return view(j)}
 // Claim before any external side effect. No automatic replay after uncertain response.
 j.claim={id:crypto.randomUUID(),fence:lease.fence,at:now};if(!await save(db,lease,s,now))throw Error("ARCHIVE_CLAIM_UNAVAILABLE");
 const claimRaw=JSON.stringify(j),base=[binding.root,folders[entry.source],binding.companyFolder,identity.date.slice(0,4),identity.date.slice(5,7),identity.no+"_"+entry.ettn].filter(Boolean).join("/");
 try{
  const xa=await archiveVerifiedIsnetGoogleOriginal(c,tenant,binding.connectionId,base+"/"+identity.no+".xml","application/xml",xb);
  const record=await ingestIndexedFileHubEBelge(c.env,tenant,xa);
  if(record.sourceConflict||!record.documentId)throw Error("ARCHIVE_CANONICAL_CONFLICT");
  j.xml++;
  if(pb){
   const pa=await archiveVerifiedIsnetGoogleOriginal(c,tenant,binding.connectionId,base+"/"+identity.no+".pdf","application/pdf",pb);
   await ingestIndexedFileHubEBelge(c.env,tenant,pa);
  }
  const actual=await db.prepare("SELECT uuid,direction,xml_file_asset_id,pdf_file_asset_id FROM accounting_documents WHERE main_company_slug=? AND id=? AND deleted_at IS NULL").bind(tenant,record.documentId).first<Record<string,any>>();
  if(!actual||txt(actual.uuid).toLowerCase()!==entry.ettn||actual.direction!==identity.direction||!actual.xml_file_asset_id)throw Error("ARCHIVE_CANONICAL_UNVERIFIED");
  if(actual.pdf_file_asset_id)j.pdf++;else j.pdfPending++;
  advance(j);
 }catch{j.state="REVIEW_REQUIRED";j.error="ARCHIVE_RESULT_UNCERTAIN";delete j.claim}
 // If the leader expired, do not report success or retry; next leader exposes review.
 if(!await save(db,lease,{raw:claimRaw,job:j},Date.now()))throw Error("ARCHIVE_RESULT_UNCERTAIN");
 return view(j);
}
