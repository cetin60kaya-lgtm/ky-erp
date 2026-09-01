// @ts-nocheck
import type { Context } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR");
const now=()=>new Date().toISOString();

async function columns(c:Context<AppEnv>,table:string){try{const r=await c.env.DB.prepare(`PRAGMA table_info("${table}")`).all<Row>();return new Set((r.results||[]).map(x=>text(x.name)))}catch{return new Set<string>()}}
async function insertDynamic(c:Context<AppEnv>,table:string,data:Row){const cols=await columns(c,table);const entries=Object.entries(data).filter(([k])=>cols.has(k));if(!entries.length)return null;const sql=`INSERT INTO ${table} (${entries.map(([k])=>k).join(",")}) VALUES (${entries.map(()=>"?").join(",")})`;return c.env.DB.prepare(sql).bind(...entries.map(([,v])=>typeof v==="object"&&v!==null?JSON.stringify(v):v)).run()}
async function updateDynamic(c:Context<AppEnv>,table:string,id:string,slug:string,data:Row){const cols=await columns(c,table);const entries=Object.entries(data).filter(([k])=>cols.has(k));if(!entries.length)return null;const hasSlug=cols.has("main_company_slug");return c.env.DB.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`${k}=?`).join(",")} WHERE id=?${hasSlug?" AND main_company_slug=?":""}`).bind(...entries.map(([,v])=>typeof v==="object"&&v!==null?JSON.stringify(v):v),id,...(hasSlug?[slug]:[])).run()}

export async function postAccountingDocument(c:Context<AppEnv>,slug:string,documentId:string,actor="SYSTEM"){
  const doc=await c.env.DB.prepare(`SELECT * FROM accounting_documents WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(documentId,slug).first<Row>();
  if(!doc)throw Object.assign(new Error("Belge bulunamadı."),{code:"NOT_FOUND"});
  if(text(doc.posted_at))return{documentId,status:"POSTED",postedAt:doc.posted_at,idempotent:true};
  if(!["APPROVED","READY_FOR_APPROVAL"].includes(upper(doc.status)))throw Object.assign(new Error("Belge son onaydan geçmeden muhasebeleştirilemez."),{code:"DOCUMENT_NOT_APPROVED"});
  const type=upper(doc.document_type),direction=upper(doc.direction)==="OUTGOING"?"OUTGOING":"INCOMING";
  const financial=/FATURA|INVOICE|E_ARSIV|IADE/.test(type);
  if(!financial){const ts=now();await c.env.DB.prepare(`UPDATE accounting_documents SET status='POSTED',posted_at=?,updated_at=? WHERE id=? AND main_company_slug=? AND posted_at IS NULL`).bind(ts,ts,documentId,slug).run();return{documentId,status:"POSTED",postedAt:ts,financial:false}}
  if(!text(doc.party_company_id))throw Object.assign(new Error("Belge firma/cari ile eşleşmeden muhasebeleştirilemez."),{code:"COMPANY_REQUIRED"});
  const company=await c.env.DB.prepare(`SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(doc.party_company_id,slug).first<Row>();
  if(!company)throw Object.assign(new Error("Firma/cari kaydı bulunamadı."),{code:"COMPANY_NOT_FOUND"});
  const total=num(doc.payable_total),vat=num(doc.tax_total),subtotal=num(doc.subtotal),recordScope=upper(doc.record_scope)==="INTERNAL"?"INTERNAL":"OFFICIAL",ts=now();
  const trackCurrent=direction==="INCOMING"?Number(company.supplier_debt_tracking??1)!==0:Number(company.customer_receivable_tracking??1)!==0;
  let movementId="",balanceAfter=num(company.current_balance);
  const movementCols=await columns(c,"current_account_movements");
  if(trackCurrent&&movementCols.size){const existing=movementCols.has("document_id")?await c.env.DB.prepare(`SELECT id FROM current_account_movements WHERE main_company_slug=? AND document_id=? LIMIT 1`).bind(slug,documentId).first<Row>():null;if(!existing?.id){const effect=direction==="INCOMING"?-total:total;balanceAfter+=effect;movementId=crypto.randomUUID();await insertDynamic(c,"current_account_movements",{id:movementId,main_company_slug:slug,company_id:doc.party_company_id,movement_date:doc.issue_date||ts,movement_type:"FATURA",source_type:"CANONICAL_DOCUMENT",document_no:doc.document_no,document_id:documentId,description:`${doc.document_no||"Belge"} cari kaydı`,debit:direction==="OUTGOING"?total:0,credit:direction==="INCOMING"?total:0,amount:total,effect,balance_after:balanceAfter,raw:{recordScope,providerType:doc.provider_type,processedBy:actor},created_at:ts,updated_at:ts});await updateDynamic(c,"companies",text(company.id),slug,{current_balance:balanceAfter,updated_at:ts})}else movementId=text(existing?.id)}}
  const ledgerId=crypto.randomUUID();await c.env.DB.prepare(`INSERT INTO accounting_ledger_entries(id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,description,debit,credit,currency,payment_method,source_document_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ledgerId,slug,text(doc.issue_date)||ts.slice(0,10),direction==="INCOMING"?"BORC":"ALACAK",recordScope,doc.party_company_id,text(doc.party_name)||text(company.name),`${text(doc.document_no)||"Belge"} ${direction==="INCOMING"?"alış":"satış"} kaydı`,direction==="INCOMING"?total:0,direction==="OUTGOING"?total:0,text(doc.currency)||"TRY",null,documentId,text(doc.note)||null,actor,ts,ts).run();
  let vatId="";
  if(recordScope==="OFFICIAL"&&vat>=0){const vatCols=await columns(c,"vat_records");if(vatCols.size){const existing=vatCols.has("document_id")?await c.env.DB.prepare(`SELECT id FROM vat_records WHERE main_company_slug=? AND document_id=? LIMIT 1`).bind(slug,documentId).first<Row>():null;if(!existing?.id){vatId=crypto.randomUUID();const date=text(doc.issue_date)||ts.slice(0,10);await insertDynamic(c,"vat_records",{id:vatId,main_company_slug:slug,company_id:doc.party_company_id,firm_id:doc.party_company_id,document_id:documentId,date,period_year:Number(date.slice(0,4))||new Date().getFullYear(),period_month:Number(date.slice(5,7))||new Date().getMonth()+1,incoming_vat:direction==="INCOMING"?vat:0,outgoing_vat:direction==="OUTGOING"?vat:0,carry_vat:0,raw:{documentNo:doc.document_no,incomingBase:direction==="INCOMING"?subtotal:0,outgoingBase:direction==="OUTGOING"?subtotal:0,source:"CANONICAL_DOCUMENT"},created_at:ts,updated_at:ts})}else vatId=text(existing?.id)}}}
  await c.env.DB.prepare(`UPDATE accounting_documents SET status='POSTED',posted_at=?,updated_at=?,raw_metadata=json_set(COALESCE(raw_metadata,'{}'),'$.posting.ledgerEntryId',?,'$.posting.currentMovementId',?,'$.posting.vatRecordId',?,'$.posting.postedBy',?) WHERE id=? AND main_company_slug=? AND posted_at IS NULL`).bind(ts,ts,ledgerId,movementId,vatId,actor,documentId,slug).run();
  return{documentId,status:"POSTED",postedAt:ts,financial:true,ledgerEntryId:ledgerId,currentMovementId:movementId||null,vatRecordId:vatId||null,balanceAfter,trackCurrent,recordScope};
}
