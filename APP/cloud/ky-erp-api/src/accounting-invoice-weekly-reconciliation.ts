import type { Context,Hono } from "hono";
import * as XLSX from "xlsx";
import {getAuthenticatedUser} from "./auth-cloud";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const SCOPE="MUHASEBE_WEEKLY_INVOICE_REVIEW_V1";
const str=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>str(v).toUpperCase().replace(/İ/g,"I");
const fail=(c:Context<AppEnv>,code:string,message:string,status=400)=>c.json({ok:false,error:{code,message}},status as any);
const isInvoice=(v:unknown)=>/FATURA|INVOICE|ARSIV/.test(upper(v));
// Every canonical invoice number must match the complete value.
// Descriptions in an Excel cell may include a whole HKN token but not a suffix.
const idNumber=(v:unknown)=>{const raw=upper(v).replace(/\s+/g,"");return /^HKN[0-9]{8,18}$/.test(raw)?raw:"";};
const extractCellHkn=(v:unknown)=>{
 const matches=[...upper(v).matchAll(/(?:^|[^A-Z0-9])HKN[\s-]*([0-9]{8,18})(?![A-Z0-9])/g)];
 return [...new Set(matches.map(m=>idNumber("HKN"+m[1])).filter(Boolean))];
};
const safeDate=(value:unknown)=>{const v=str(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};

async function scope(c:Context<AppEnv>,companyId:string,write=false){
 const user=await getAuthenticatedUser(c) as Row|null;
 if(!user)throw Object.assign(new Error("Geçerli oturum gerekli."),{status:401});
 const admin=["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(upper(user.role));
 const permission=(Array.isArray(user.permissions)?user.permissions:[]).find((p:Row)=>upper(p.moduleKey||p.module_key)==="MUHASEBE");
 if(!admin&&!Boolean(write?(permission?.canUpdate??permission?.can_update??permission?.canCreate??permission?.can_create):(permission?.canView??permission?.can_view)))
  throw Object.assign(new Error("Muhasebe yetkiniz yok."),{status:403});
 const tenant=str(c.req.query("mainCompanySlug")||c.req.header("X-KYERP-Tenant-Slug")||user.mainCompanySlug).toLowerCase();
 const own=str(user.mainCompanySlug||user.security?.main_company_slug).toLowerCase();
 if(!tenant||(!["SUPER_ADMIN","ADMIN"].includes(upper(user.role))&&tenant!==own))
  throw Object.assign(new Error("Başka ana firmanın kayıtlarına erişemezsiniz."),{status:403});
 if(!companyId)throw Object.assign(new Error("Önce müşteri firma kartını seçin."),{status:400});
 const company=await c.env.DB.prepare("SELECT id,name,company_type FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1")
  .bind(companyId,tenant).first<Row>();
 if(!company)throw Object.assign(new Error("Seçili firmanın kayıtları bulunamadı."),{status:404});
 return {tenant,user,company};
}
async function invoiceRows(c:Context<AppEnv>,tenant:string,companyId:string){
 const result=await c.env.DB.prepare(`SELECT id,document_no,issue_date,party_name,payable_total,currency,status FROM accounting_documents
 WHERE main_company_slug=? AND party_company_id=? AND direction='OUTGOING' AND deleted_at IS NULL
 AND (document_type LIKE '%FATURA%' OR document_type LIKE '%ARSIV%' OR document_type LIKE '%INVOICE%')
 ORDER BY issue_date ASC,document_no ASC LIMIT 5000`).bind(tenant,companyId).all<Row>();
 return (result.results||[]).map(row=>({
  id:str(row.id),documentNo:idNumber(row.document_no),date:str(row.issue_date),
  customer:str(row.party_name),total:Number(row.payable_total||0),currency:str(row.currency)||"TRY",
  accountingStatus:str(row.status),
 })).filter(row=>Boolean(row.documentNo));
}
async function snapshot(c:Context<AppEnv>,tenant:string,companyId:string,id=""){
 const result=id
 ?await c.env.DB.prepare("SELECT id,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1").bind(SCOPE,tenant,id).first<Row>()
 :await c.env.DB.prepare("SELECT id,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? AND json_extract(data,'$.companyId')=? ORDER BY created_at DESC LIMIT 1").bind(SCOPE,tenant,companyId).first<Row>();
 const candidates=[result];
 for(const row of candidates){if(!row)continue;try{const value=JSON.parse(str(row.data));if(value.companyId!==companyId)continue;
  return {...value,id:row.file_name,updatedAt:row.updated_at};
 }catch{/* Ignore malformed historic snapshot without touching it. */}}
 return null;
}
function compare(invoices:Row[],record:Row|null){
 const listed=new Set((Array.isArray(record?.numbers)?record.numbers:[]).map(idNumber).filter(Boolean));
 const overrides=(record?.overrides&&typeof record.overrides==="object")?record.overrides:{};
 const own=new Set(invoices.map(row=>row.documentNo));
  const duplicates=new Set((Array.isArray(record?.duplicates)?record.duplicates:[]).map(idNumber).filter(Boolean));
 const rows=invoices.map(row=>{
  const manual=overrides[row.documentNo];
  const outcome=manual==="MANUAL_INCLUDED"||manual==="MANUAL_EXCLUDED"||manual==="REVIEW_REQUIRED"
    ?manual:!record?"AWAITING_EXCEL":duplicates.has(row.documentNo)?"REVIEW_REQUIRED":listed.has(row.documentNo)?"CUSTOMER_LISTED":"NOT_LISTED";
  return {...row,outcome,listed:listed.has(row.documentNo),manual:Boolean(manual),sourceFile:record?.sourceFile||""};
 });
 const extras=[...listed].filter(no=>!own.has(no)).sort().map(documentNo=>({documentNo,outcome:"EXTRA_IN_CUSTOMER_LIST"}));
 return {rows,extras,counts:{
  all:rows.length,listed:rows.filter(x=>x.outcome==="CUSTOMER_LISTED"||x.outcome==="MANUAL_INCLUDED").length,
  notListed:rows.filter(x=>x.outcome==="NOT_LISTED"||x.outcome==="MANUAL_EXCLUDED").length,
  review:rows.filter(x=>x.outcome==="REVIEW_REQUIRED").length,extras:extras.length,
 }};
}
async function readWorkbook(file:File){
 if(file.size<1||file.size>5*1024*1024)throw Object.assign(new Error("Excel/CSV 5 MB sınırını aşamaz ve boş olamaz."),{status:413});
 if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw Object.assign(new Error("Yalnız XLSX, XLS veya CSV dosyası yükleyin."),{status:422});
 const bytes=new Uint8Array(await file.arrayBuffer());
 const book=XLSX.read(bytes,{type:"array",dense:true,cellDates:false});
 const numbers=new Set<string>(),duplicates=new Set<string>();
 let rowCount=0;
 for(const name of book.SheetNames.slice(0,25)){
  const sheet=book.Sheets[name];if(!sheet)continue;
  const rows=XLSX.utils.sheet_to_json<(string|number)[]>(sheet,{header:1,defval:"",blankrows:false,raw:false});
  for(const row of rows){
   rowCount++;if(rowCount>15000)throw Object.assign(new Error("Excel çok büyük. En fazla 15.000 satır kabul edilir."),{status:413});
   for(const raw of Array.isArray(row)?row:[]){
    const matches=extractCellHkn(raw);
    for(const found of matches){
      if(numbers.has(found))duplicates.add(found);
      numbers.add(found);
    }
   }
  }
 }
 if(!numbers.size)throw Object.assign(new Error("Excel'de HKN fatura numarası bulunamadı. Başlıkları ve dosyayı kontrol edin."),{status:422});
 if(numbers.size>5000)throw Object.assign(new Error("Bir dosyada en fazla 5.000 farklı HKN faturası bulunabilir."),{status:413});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
 return {numbers:[...numbers].sort(),duplicates:[...duplicates].sort(),rowCount,hash};
}
function responseError(c:Context<AppEnv>,err:unknown){
 const e=err as any;return fail(c,str(e?.code)||"WEEKLY_REVIEW_FAILED",str(e?.message)||"Haftalık liste okunamadı.",Number(e?.status)||500);
}
export function registerInvoiceWeeklyReconciliationRoutes(app:Hono<AppEnv>){
 app.get("/api/muhasebe/invoice-weekly-reconciliations",async c=>{
  try{
   const companyId=str(c.req.query("companyId"));const a=await scope(c,companyId);
   const [docs,record]=await Promise.all([invoiceRows(c,a.tenant,companyId),snapshot(c,a.tenant,companyId)]);
   return c.json({ok:true,data:{company:{id:companyId,name:a.company.name},snapshot:record?{
    id:record.id,weekDate:record.weekDate,sourceFile:record.sourceFile,hash:record.hash,
    duplicateInvoiceNos:record.duplicates,importedAt:record.importedAt,rowCount:record.rowCount,manualAudit:record.manualAudit||[]
   }:null,...compare(docs,record)}});
  }catch(err){return responseError(c,err)}
 });
 app.post("/api/muhasebe/invoice-weekly-reconciliations/import",async c=>{
  try{
   const form=await c.req.formData();
   const companyId=str(form.get("companyId")),weekDate=str(form.get("weekDate"));
   const a=await scope(c,companyId,true);
   if(!safeDate(weekDate))return fail(c,"WEEK_DATE_REQUIRED","Geçerli haftalık Excel tarihi seçin.");
   const file=form.get("file");
   if(!(file instanceof File))return fail(c,"FILE_REQUIRED","Müşteriden gelen Excel/CSV dosyasını seçin.");
   const data=await readWorkbook(file);
   const old=await snapshot(c,a.tenant,companyId);
   if(old?.hash===data.hash&&old?.weekDate===weekDate)
    return c.json({ok:true,data:{id:old.id,idempotent:true,...compare(await invoiceRows(c,a.tenant,companyId),old)}});
   const created=new Date().toISOString(),id=crypto.randomUUID();
   const record={companyId,weekDate,sourceFile:file.name.slice(0,160),hash:data.hash,
    numbers:data.numbers,duplicates:data.duplicates,rowCount:data.rowCount,overrides:{},importedAt:created,actorId:str(a.user.id)};
   await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),SCOPE,a.tenant,id,JSON.stringify(record),created,created).run();
   return c.json({ok:true,data:{id,sourceFile:record.sourceFile,rowCount:data.rowCount,duplicateInvoiceNos:data.duplicates,
    ...compare(await invoiceRows(c,a.tenant,companyId),record)}},201);
  }catch(err){return responseError(c,err)}
 });
 app.post("/api/muhasebe/invoice-weekly-reconciliations/:id/manual",async c=>{
  try{
   const body:Row=await c.req.json<Row>().catch(()=>({} as Row));
   const companyId=str(body.companyId),a=await scope(c,companyId,true),id=str(c.req.param("id"));
   const number=idNumber(body.documentNo),choice=upper(body.choice);
   if(!number||!["AUTO","MANUAL_INCLUDED","MANUAL_EXCLUDED","REVIEW_REQUIRED"].includes(choice))
    return fail(c,"INVALID_MANUAL_REVIEW","Geçerli HKN numarası ve manuel durum seçin.");
   const docs=await invoiceRows(c,a.tenant,companyId);
   if(!docs.some(row=>row.documentNo===number))return fail(c,"DOCUMENT_NOT_IN_CUSTOMER","HKN faturası seçili firma kartında bulunmuyor.",404);
   const row=await c.env.DB.prepare("SELECT id,data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
    .bind(SCOPE,a.tenant,id).first<Row>();
   if(!row)return fail(c,"SNAPSHOT_NOT_FOUND","Excel karşılaştırması bulunamadı.",404);
   const record=JSON.parse(str(row.data));
   if(record.companyId!==companyId)return fail(c,"CUSTOMER_MISMATCH","Bu rapor başka firmaya ait.",403);
   const overrides={...(record.overrides||{})};
   if(choice==="AUTO")delete overrides[number];else overrides[number]=choice;
   const updated={...record,overrides,
    manualAudit:[...(Array.isArray(record.manualAudit)?record.manualAudit:[]).slice(-499),{
     documentNo:number,previous:str(record.overrides?.[number]||"AUTO"),selected:choice,
     changedAt:new Date().toISOString(),actorId:str(a.user.id),
    }]};
   const timestamp=new Date().toISOString();
   const update=await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND main_company_slug=? AND data=?")
    .bind(JSON.stringify(updated),timestamp,row.id,SCOPE,a.tenant,row.data).run();
   if(!Number(update.meta?.changes||0))return fail(c,"REVIEW_CONFLICT","Kayıt başka bir oturumda değişti, yenileyin.",409);
   return c.json({ok:true,data:{...compare(docs,updated),updatedAt:timestamp}});
  }catch(err){return responseError(c,err)}
 });
}
