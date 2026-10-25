// @ts-nocheck
// D1 transactional accounting posting for NON-PHYSICAL documents.
// Physical/LOT routing must be handled by a separate durable transaction/outbox before enabling it.
type Row=Record<string,any>;
const str=(v:unknown)=>v==null?"":String(v).trim();
const number=(v:unknown)=>Number(v);
const upper=(v:unknown)=>str(v).toLocaleUpperCase("tr-TR");
const bad=(code:string,msg:string)=>Object.assign(new Error(msg),{code});
const tables=new Set(["current_account_movements","accounting_ledger_entries","vat_records"]);
async function fields(db:any,table:string) {
  if(!tables.has(table))throw bad("TABLE_NOT_ALLOWED","Geçersiz muhasebe tablosu.");
  const result=await db.prepare('PRAGMA table_info("'+table+'")').all();
  return new Set((result.results||[]).map((x:Row)=>str(x.name)));
}
async function insert(db:any,table:string,values:Row,required:string[],balanceSource?:{id:string,slug:string}) {
  const cols=await fields(db,table);
  for(const key of required)if(!cols.has(key))throw bad("FINANCIAL_SCHEMA_NOT_READY",table+" için "+key+" alanı eksik; güvenli muhasebe kaydı bekletildi.");
  const chosen=Object.entries(values).filter(([k,v])=>cols.has(k)&&v!==undefined);
  const columns=chosen.map(([k])=>'"'+k+'"').join(",");
  const placeholders:string[]=[];
  const bindings:any[]=[];
  for(const [k,v] of chosen) {
    if(k==="balance_after"&&balanceSource) {
      placeholders.push("(SELECT COALESCE(current_balance,0) FROM companies WHERE id=? AND main_company_slug=?)");
      bindings.push(balanceSource.id,balanceSource.slug);
    }else{
      placeholders.push("?");
      bindings.push(v!==null&&typeof v==="object"?JSON.stringify(v):v);
    }
  }
  return db.prepare('INSERT INTO "'+table+'" ('+columns+') VALUES ('+placeholders.join(",")+')').bind(...bindings);
}
const required={
  ledger:["id","main_company_slug","source_document_id","debit","credit","created_at"],
  movement:["id","main_company_slug","company_id","document_id","effect","created_at"],
  vat:["id","main_company_slug","document_id","created_at"],
};

export async function postAccountingDocumentAtomic(db:any,tenant:string,documentId:string,actorId:string) {
  if(!tenant||!documentId||!actorId)throw bad("FINALIZE_CONTEXT_REQUIRED","Firma, belge ve oturum zorunludur.");
  const doc=await db.prepare("SELECT * FROM accounting_documents WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(documentId,tenant).first() as Row|null;
  if(!doc)throw bad("NOT_FOUND","Belge bulunamadı.");
  if(str(doc.posted_at))return {documentId,status:"POSTED",postedAt:doc.posted_at,idempotent:true};
  if(upper(doc.status)!=="APPROVED")throw bad("DOCUMENT_NOT_APPROVED","Belge kesin onay aşamasında değil.");
  const ts=new Date().toISOString(),type=upper(doc.document_type);
  const financial=/FATURA|INVOICE|E_ARSIV|IADE/.test(type);
  if(!financial) {
    const r=await db.prepare("UPDATE accounting_documents SET status='POSTED',posted_at=?,updated_at=? WHERE id=? AND main_company_slug=? AND status='APPROVED' AND posted_at IS NULL").bind(ts,ts,documentId,tenant).run();
    if(Number(r.meta?.changes)!==1)throw bad("DOCUMENT_CONCURRENT_UPDATE","Belge kesin kayıt durumu değişmiş.");
    return {documentId,status:"POSTED",postedAt:ts,financial:false};
  }
  const companyId=str(doc.party_company_id);
  if(!companyId)throw bad("COMPANY_REQUIRED","Belge cari kaydı olmadan deftere yazılamaz.");
  const company=await db.prepare("SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(companyId,tenant).first() as Row|null;
  if(!company)throw bad("COMPANY_NOT_FOUND","Cari bulunamadı.");
  const incoming=upper(doc.direction)!=="OUTGOING",total=number(doc.payable_total),vat=number(doc.tax_total),subtotal=number(doc.subtotal);
  if(!Number.isFinite(total)||!Number.isFinite(vat)||!Number.isFinite(subtotal)||total<0||vat<0||subtotal<0)
    throw bad("DOCUMENT_TOTALS_INVALID","Belge tutar/KDV alanları hatalı.");
  const currency=str(doc.currency||"TRY"),scope=upper(doc.record_scope)==="INTERNAL"?"INTERNAL":"OFFICIAL";
  const track=incoming?Number(company.supplier_debt_tracking??1)!==0:Number(company.customer_receivable_tracking??1)!==0;
  const needsVat=scope==="OFFICIAL";
  const tableChecks=[["accounting_ledger_entries",required.ledger],...(track?[["current_account_movements",required.movement]]:[]),...(needsVat?[["vat_records",required.vat]]:[])] as any[];
  for(const [table,keys] of tableChecks){const cols=await fields(db,table);for(const key of keys)if(!cols.has(key))throw bad("FINANCIAL_SCHEMA_NOT_READY",table+" alanları tamamlanmadan yazma kapalı: "+key);}
  // Legacy partial records must not silently be used as a successful financial posting.
  for(const table of ["accounting_ledger_entries",...(track?["current_account_movements"]:[]),...(needsVat?["vat_records"]:[])]) {
    const existing=await db.prepare('SELECT id FROM "'+table+'" WHERE main_company_slug=? AND '+(table==="accounting_ledger_entries"?"source_document_id":"document_id")+'=? LIMIT 1').bind(tenant,documentId).first();
    if(existing)throw bad("DOCUMENT_LEGACY_PARTIAL_REVIEW","Belge için geçmişte yazılmış cari/defter/KDV kaydı var; elle mutabakat gerekli.");
  }
  const idLedger="EDOC-LEDGER:"+documentId,idMove="EDOC-MOVEMENT:"+documentId,idVat="EDOC-VAT:"+documentId;
  const issue=str(doc.issue_date)||ts.slice(0,10),effect=incoming?-total:total;
  let meta:Row={};try{meta=JSON.parse(str(doc.raw_metadata)||"{}")}catch{}
  meta.posting={ledgerEntryId:idLedger,currentMovementId:track?idMove:null,vatRecordId:needsVat?idVat:null,postedBy:actorId};
  const statements:any[]=[];
  if(track) {
    // Atomic SQL delta, not an application-read balance: concurrent invoices do not lose updates.
    statements.push(db.prepare("UPDATE companies SET current_balance=ROUND(COALESCE(current_balance,0)+?,2),updated_at=? WHERE id=? AND main_company_slug=? AND deleted_at IS NULL").bind(effect,ts,companyId,tenant));
    statements.push(await insert(db,"current_account_movements",{
      id:idMove,main_company_slug:tenant,company_id:companyId,movement_date:issue,
      movement_type:"FATURA",source_type:"CANONICAL_DOCUMENT",document_no:doc.document_no,
      document_id:documentId,description:(str(doc.document_no)||"Belge")+" cari kaydı",
      debit:incoming?0:total,credit:incoming?total:0,amount:total,effect,
      balance_after:0,raw:{recordScope:scope,providerType:doc.provider_type,processedBy:actorId},
      created_at:ts,updated_at:ts,
    },required.movement,{id:companyId,slug:tenant}));
  }
  statements.push(await insert(db,"accounting_ledger_entries",{
    id:idLedger,main_company_slug:tenant,entry_date:issue,entry_type:incoming?"BORC":"ALACAK",
    record_scope:scope,company_id:companyId,company_name:str(doc.party_name)||str(company.name),
    description:(str(doc.document_no)||"Belge")+(incoming?" alış kaydı":" satış kaydı"),
    debit:incoming?total:0,credit:incoming?0:total,currency,payment_method:null,
    source_document_id:documentId,note:str(doc.note)||null,created_by:actorId,created_at:ts,updated_at:ts,
  },required.ledger));
  if(needsVat) {
    statements.push(await insert(db,"vat_records",{
      id:idVat,main_company_slug:tenant,company_id:companyId,firm_id:companyId,
      document_id:documentId,date:issue,period_year:Number(issue.slice(0,4)),period_month:Number(issue.slice(5,7)),
      incoming_vat:incoming?vat:0,outgoing_vat:incoming?0:vat,carry_vat:0,
      raw:{documentNo:doc.document_no,incomingBase:incoming?subtotal:0,outgoingBase:incoming?0:subtotal,source:"CANONICAL_DOCUMENT"},
      created_at:ts,updated_at:ts,
    },required.vat));
  }
  statements.push(db.prepare("UPDATE accounting_documents SET status='POSTED',posted_at=?,updated_at=?,raw_metadata=? WHERE id=? AND main_company_slug=? AND status='APPROVED' AND posted_at IS NULL").bind(ts,ts,JSON.stringify(meta),documentId,tenant));
  try{
    const results=await db.batch(statements); // D1 executes the entire batch atomically or rolls back.
    if(results.some((r:any)=>Number(r.meta?.changes)!==1)){
      // A concurrent modification during a transaction must never count as POSTED.
      throw bad("DOCUMENT_TRANSACTION_CONFLICT","Eşzamanlı belge değişikliği; mali kayıt kontrolü gerekiyor.");
    }
  }catch(e:any){throw bad("DOCUMENT_ATOMIC_POST_FAILED","Muhasebe defteri, cari ve KDV aynı işlemde yazılamadı. Belge inceleme bekliyor.");}
  return {documentId,status:"POSTED",postedAt:ts,financial:true,ledgerEntryId:idLedger,
    currentMovementId:track?idMove:null,vatRecordId:needsVat?idVat:null,trackCurrent:track,recordScope:scope};
}
