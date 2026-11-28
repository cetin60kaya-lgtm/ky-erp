// One bounded read-only job per tenant; same existing json_store, no new migration.
// Agent outcomes are device reports, never an official-send approval.
import {officeFenceCondition,type OfficeFence} from "./isnet-office-coordinator.ts";
const SCOPE="ISNET_OFFICE_READ_V1", PAGE=20, MAX=5000, TTL=30*60*1000;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const READ_SOURCES=["INVOICE_IN","INVOICE_OUT","ARCHIVE_OUT","DISPATCH_IN","DISPATCH_OUT"] as const;
export type Source=typeof READ_SOURCES[number];
type DB=Cloudflare.Env["DB"];
type Counts={source:Source;total:number|null;seen:string[];missingIds?:string[];matched:number;withXml:number;withPdf:number;posted:number;complete:boolean;error?:string};
type Job={id:string;from:string;to:string;expiresAt:number;state:"QUEUED"|"RUNNING"|"COMPLETE"|"REVIEW_REQUIRED";taxHash:string;companyVerified:boolean;index:number;page:number;counts:Counts[];updatedAt:number;error?:string};
type Task={jobId:string;source:Source|"COMPANY";page:number;from:string;to:string;taxCode:string;fence:string};
const key=(tenant:string)=>SCOPE+":"+tenant;
const date=(v:unknown)=>{if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error("DATE_INVALID");const n=Date.parse(v+"T00:00:00Z");if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)throw Error("DATE_INVALID");return n};
export function validateOfficeReadRange(from:unknown,to:unknown){const n=date(to)-date(from);if(n<0||n>30*86400000)throw Error("DATE_RANGE_MAX_31_DAYS");return{from:from as string,to:to as string}}
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,"0")).join("");
async function taxOf(db:DB,tenant:string){const r=await db.prepare("SELECT tax_number FROM main_companies WHERE slug=? AND is_active=1 LIMIT 2").bind(tenant).all<{tax_number:string}>();if(r.results.length!==1||!/^\d{10,11}$/.test(r.results[0]!.tax_number||""))throw Error("COMPANY_TAX_REQUIRED");return r.results[0]!.tax_number}
async function current(db:DB,tenant:string){const row=await db.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=?").bind(key(tenant),SCOPE,tenant).first<{data:string}>();if(!row)return null;return {raw:row.data,job:JSON.parse(row.data) as Job}}
const active=(job:Job,now:number)=>["QUEUED","RUNNING"].includes(job.state)&&job.expiresAt>now;
export function publicOfficeReadJob(job:Job|null,now=Date.now()){if(!job)return null;return {id:job.id,from:job.from,to:job.to,companyVerified:job.companyVerified,state:["QUEUED","RUNNING"].includes(job.state)&&job.expiresAt<=now?"EXPIRED":job.state,updatedAt:job.updatedAt,error:job.error||null,counts:job.counts.map(({seen,missingIds:_missingIds,...c})=>({...c,read:seen.length,missing:seen.length-c.matched}))}}
export async function getOfficeReadJob(db:DB,tenant:string,now=Date.now()){return publicOfficeReadJob((await current(db,tenant))?.job||null,now)}
export async function queueOfficeReadJob(db:DB,tenant:string,input:{from:unknown;to:unknown;sources?:unknown},now=Date.now()){
 const range=validateOfficeReadRange(input.from,input.to),sources=input.sources??READ_SOURCES;
 if(!Array.isArray(sources)||!sources.length||sources.length>READ_SOURCES.length||new Set(sources).size!==sources.length||sources.some(s=>!READ_SOURCES.includes(s)))throw Error("SOURCE_INVALID");
 const taxHash=await sha(await taxOf(db,tenant)),id=key(tenant),ts=new Date(now).toISOString();
 const job:Job={id:crypto.randomUUID(),...range,expiresAt:now+TTL,state:"QUEUED",taxHash,companyVerified:false,index:0,page:1,updatedAt:now,counts:sources.map(source=>({source,total:null,seen:[],missingIds:[],matched:0,withXml:0,withPdf:0,posted:0,complete:false}))};
 const result=await db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE scope=excluded.scope AND main_company_slug=excluded.main_company_slug AND (json_extract(data,'$.state') NOT IN ('QUEUED','RUNNING') OR json_extract(data,'$.expiresAt')<=?)").bind(id,SCOPE,tenant,id,JSON.stringify(job),ts,ts,now).run();
 if(Number(result.meta.changes)!==1)throw Error("READ_JOB_ALREADY_RUNNING");return publicOfficeReadJob(job,now);
}
const expected=(job:Job)=>job.companyVerified?job.counts[job.index]?.source:"COMPANY";
const cleanError=(v:unknown)=>typeof v==="string"&&/^(?:PROVIDER|SOAP|WSDL|PAGING|XML|DATE|COMPANY|DOCUMENT|NETWORK|SIZE|SOURCE|IDENTITY|RESPONSE)_[A-Z0-9_]{1,60}$/.test(v)?v:"PROVIDER_READ_FAILED";
type Report={jobId:string;source:Source|"COMPANY";page:number;fence:string;ok:boolean;error?:string;companyVerified?:boolean;total?:number;ids?:string[]};
export function validateOfficeReport(raw:unknown,job:Job,lease:OfficeFence):Report|null{
 if(!raw||typeof raw!=="object")return null;const r=raw as Report;
 if(r.jobId!==job.id||r.source!==expected(job)||r.page!==job.page||r.fence!==lease.fence||typeof r.ok!=="boolean")return null;
 if(!r.ok)return {...r,error:cleanError(r.error)};
 if(r.source==="COMPANY"){if(r.companyVerified!==true)throw Error("COMPANY_IDENTITY_UNVERIFIED");return r}
 if(typeof r.total!=="number"||!Number.isSafeInteger(r.total)||r.total<0||r.total>MAX||!Array.isArray(r.ids)||r.ids.length>PAGE||r.ids.some(id=>typeof id!=="string"||!UUID.test(id)))throw Error("PAGING_INVALID");
 const ids=r.ids.map(id=>id.toLowerCase()),c=job.counts[job.index]!;
 if((c.total!==null&&r.total!==c.total)||new Set(ids).size!==ids.length||ids.some(id=>c.seen.includes(id))||ids.length!==Math.min(PAGE,Math.max(0,r.total-(r.page-1)*PAGE)))throw Error("PAGING_INCONSISTENT");
 return {...r,ids};
}
async function matchedPage(db:DB,tenant:string,source:Source,ids:string[]){
 if(!ids.length)return{matched:0,withXml:0,withPdf:0,posted:0,matchedIds:[] as string[]};
 const direction=source.endsWith("_IN")?"INCOMING":"OUTGOING",kind=source.startsWith("DISPATCH")?"IRSALIYE":"FATURA";
 const placeholders=ids.map(()=>"?").join(",");
 const rows=(await db.prepare("SELECT LOWER(uuid) uuid,MAX(CASE WHEN COALESCE(xml_file_asset_id,'')<>'' THEN 1 ELSE 0 END) xml,MAX(CASE WHEN COALESCE(pdf_file_asset_id,'')<>'' THEN 1 ELSE 0 END) pdf,MAX(CASE WHEN COALESCE(posted_at,'')<>'' THEN 1 ELSE 0 END) posted FROM accounting_documents WHERE main_company_slug=? AND deleted_at IS NULL AND direction=? AND document_type LIKE ? AND LOWER(uuid) IN ("+placeholders+") GROUP BY LOWER(uuid)").bind(tenant,direction,"%"+kind+"%",...ids).all<{uuid:string;xml:number;pdf:number;posted:number}>()).results;
 return {matchedIds:rows.map(x=>x.uuid),matched:rows.length,withXml:rows.filter(x=>x.xml).length,withPdf:rows.filter(x=>x.pdf).length,posted:rows.filter(x=>x.posted).length};
}
/** All writes are conditional on the same current job row and live leader fence.
 * A lost response repeats a read, never a financial write. Standby cannot settle.
 */
export async function officeReadTick(db:DB,lease:OfficeFence,report:unknown,now=Date.now()):Promise<Task|null>{
 const tenant=lease.tenant,stored=await current(db,tenant);if(!stored||!active(stored.job,now))return null;
 const job=stored.job,tax=await taxOf(db,tenant),guard=officeFenceCondition(lease,tenant,now);
 if(await sha(tax)!==job.taxHash){job.state="REVIEW_REQUIRED";job.error="COMPANY_IDENTITY_CHANGED";}
 else {
  let r:Report|null=null;try{r=validateOfficeReport(report,job,lease)}catch(e){job.state="REVIEW_REQUIRED";job.error=cleanError((e as Error).message)}
  if(r){
   if(!r.ok){if(r.source==="COMPANY"){job.state="REVIEW_REQUIRED";job.error=r.error;}else{job.counts[job.index]!.error=r.error;job.index++;job.page=1;}}
   else if(r.source==="COMPANY"){job.companyVerified=true;job.state="RUNNING";}
   else {const c=job.counts[job.index]!,ids=r.ids!;const m=await matchedPage(db,tenant,c.source,ids);c.total=r.total!;c.seen.push(...ids);(c.missingIds??=[]).push(...ids.filter(id=>!m.matchedIds.includes(id)));c.matched+=m.matched;c.withXml+=m.withXml;c.withPdf+=m.withPdf;c.posted+=m.posted;
    if(job.counts.reduce((n,x)=>n+x.seen.length,0)>MAX){job.state="REVIEW_REQUIRED";job.error="PAGING_JOB_LIMIT";}
    else if(c.seen.length===c.total){c.complete=true;job.index++;job.page=1;}else job.page++;}
  }
  if(job.index>=job.counts.length&&job.state!=="REVIEW_REQUIRED")job.state=job.counts.every(c=>c.complete)?"COMPLETE":"REVIEW_REQUIRED";
  if(job.state==="QUEUED")job.state="RUNNING";
 }
 job.updatedAt=now;
 const changed=await db.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND main_company_slug=? AND data=?"+guard.sql).bind(JSON.stringify(job),new Date(now).toISOString(),key(tenant),SCOPE,tenant,stored.raw,...guard.args).run();
 if(Number(changed.meta.changes)!==1||!active(job,now))return null;
 const source=expected(job);if(!source)return null;
 return{jobId:job.id,source,page:job.page,from:job.from,to:job.to,taxCode:tax,fence:lease.fence};
}

export async function completedOfficeReadManifest(db:DB,tenant:string,jobId:string,now=Date.now()){
 const saved=await current(db,tenant),job=saved?.job;if(!job||job.id!==jobId||job.state!=="COMPLETE"||!job.companyVerified||now-job.updatedAt>30*60*1000||now<job.updatedAt)throw Error("READ_MANIFEST_REQUIRED");
 if(await sha(await taxOf(db,tenant))!==job.taxHash)throw Error("COMPANY_IDENTITY_CHANGED");
 if(job.counts.some(c=>!c.complete||!Array.isArray(c.missingIds)||c.missingIds.length!==c.seen.length-c.matched))throw Error("READ_MANIFEST_REQUIRED");
 const entries=job.counts.flatMap(c=>(c.missingIds||[]).map(ettn=>({source:c.source,ettn})));
 if(new Set(entries.map(x=>x.ettn)).size!==entries.length)throw Error("SOURCE_IDENTITY_CONFLICT");
 return {from:job.from,to:job.to,taxHash:job.taxHash,entries};
}
export async function officeReadCompanyTax(db:DB,tenant:string,expectedHash:string){const tax=await taxOf(db,tenant);if(await sha(tax)!==expectedHash)throw Error("COMPANY_IDENTITY_CHANGED");return tax}
