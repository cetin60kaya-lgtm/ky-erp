// @ts-nocheck
// Durable physical receipt in the existing canonical stock_movements / Boyahane json_store.
// One operation identity, one SQL transaction per physical effect. No R2/provider writes.
import { normalizeLotNo } from "./accounting-lot-reconciliation-core";
type Row=Record<string,any>;
const txt=(v:any)=>v==null?"":String(v).trim();
const num=(v:any)=>Number(v);
const err=(code:string,message:string)=>Object.assign(new Error(message),{code});
const now=()=>new Date().toISOString();
const stable=(o:Row)=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))));
export async function sha256(value:string){
  const a=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}
export function receiptFields(data:Row){
  const tenant=txt(data.tenant),physicalDocumentId=txt(data.physicalDocumentId),
    physicalLineId=txt(data.physicalLineId),productId=txt(data.productId),
    supplierCompanyId=txt(data.supplierCompanyId),route=txt(data.route).toUpperCase(),
    normalizedLot=normalizeLotNo(txt(data.lotNo)).toUpperCase();
  const quantity=num(data.quantity);
  if(!tenant||!physicalDocumentId||!physicalLineId||!productId||!["STOCK","BOYAHANE","CONSUMABLE"].includes(route))
    throw err("PHYSICAL_RECEIPT_INVALID","Fiziksel belge/satır, firma, ürün ve doğru stok rotası zorunlu.");
  if(!Number.isFinite(quantity)||quantity<=0||Math.abs(quantity)>1e10)
    throw err("PHYSICAL_QUANTITY_INVALID","Fiziksel miktar pozitif ve geçerli olmalı.");
  const policy=txt(data.lotPolicy).toUpperCase();
  if(policy==="REQUIRED"&&!normalizedLot)throw err("LOT_REQUIRED","Ürün kartındaki zorunlu LOT kanıtı eksik.");
  if(policy==="NONE"&&normalizedLot)throw err("LOT_POLICY_CONFLICT","LOT tutulmayan ürünün fiziksel LOT kaydı oluşturulamaz.");
  return {tenant,physicalDocumentId,physicalLineId,productId,supplierCompanyId,route,
    lotNo:txt(data.lotNo),normalizedLot,quantity,policy:policy||"OPTIONAL",provisional:data.provisional===true};
}
export async function physicalIdentity(data:Row) {
  const f=receiptFields(data);
  const key=[f.tenant,f.physicalDocumentId,f.physicalLineId,"RECEIPT",
    f.productId,f.normalizedLot,f.supplierCompanyId];
  const id="PHY:"+await sha256(JSON.stringify(key));
  const payloadHash=await sha256(stable({...f,unit:txt(data.unit),sourceType:txt(data.sourceType)}));
  return {id,payloadHash,...f};
}
async function requireSchema(db:any) {
  const rows=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounting_physical_operations','json_store','stock_movements')").all()).results||[];
  const names=new Set(rows.map((r:Row)=>r.name));
  for(const required of ["accounting_physical_operations","json_store"])
    if(!names.has(required))throw err("PHYSICAL_SCHEMA_APPROVAL_REQUIRED","Fiziksel journal 0062 üretim şeması henüz uygulanmadı.");
  return names;
}
const parsed=(s:any)=>{try{return JSON.parse(txt(s)||"{}")}catch{return{}}};
const getJournal=(db:any,id:string,tenant:string)=>db.prepare(
  "SELECT * FROM accounting_physical_operations WHERE id=? AND main_company_slug=? LIMIT 1").bind(id,tenant).first();
const jsonSetQuantity=(column="data")=>`json_set(COALESCE(${column},'{}'),
 '$.entryKg',COALESCE(CAST(json_extract(${column},'$.entryKg') AS REAL),0)+?,
 '$.quantity',COALESCE(CAST(json_extract(${column},'$.quantity') AS REAL),0)+?,
 '$.remainingKg',COALESCE(CAST(json_extract(${column},'$.remainingKg') AS REAL),0)+?,
 '$.remainingQuantity',COALESCE(CAST(json_extract(${column},'$.remainingQuantity') AS REAL),0)+?,
 '$.status','AVAILABLE','$.lastEntryAt',?)`;
async function lotMatch(db:any,f:Row){
  const result=await db.prepare(`SELECT id,file_name,data FROM json_store
   WHERE scope='BOYAHANE_LOT' AND main_company_slug=?
    AND COALESCE(json_extract(data,'$.productId'),json_extract(data,'$.inventoryId'),'')=?
    AND COALESCE(json_extract(data,'$.supplierCompanyId'),json_extract(data,'$.companyId'),'')=?
    AND UPPER(TRIM(COALESCE(json_extract(data,'$.lotNo'),'')))=? LIMIT 3`)
  .bind(f.tenant,f.productId,f.supplierCompanyId,f.normalizedLot).all();
  if((result.results||[]).length>1)throw err("LEGACY_LOT_AMBIGUOUS","Birden fazla eski LOT bulundu; yetkili inceleme gerekiyor.");
  return result.results?.[0]||null;
}
async function legacyConflict(db:any,f:Row){
  if(f.route==="BOYAHANE") {
    const row=await db.prepare(`SELECT id FROM json_store
      WHERE main_company_slug=? AND scope='BOYAHANE_STOCK_MOVEMENT'
       AND (json_extract(data,'$.physicalDocumentLineId')=?
        OR (json_extract(data,'$.physicalDocumentId')=? AND json_extract(data,'$.lotNo')=?))
      LIMIT 1`).bind(f.tenant,f.physicalLineId,f.physicalDocumentId,f.lotNo).first();
    return Boolean(row);
  }
  const row=await db.prepare(`SELECT id FROM stock_movements WHERE main_company_slug=?
      AND document_line_id=? AND product_id=? AND COALESCE(lot_no,'')=? LIMIT 1`)
    .bind(f.tenant,f.physicalLineId,f.productId,f.lotNo).first();
  return Boolean(row);
}
async function stockInsert(db:any,f:Row,id:string,ts:string){
  const cols=new Set(((await db.prepare("PRAGMA table_info(stock_movements)").all()).results||[]).map((r:Row)=>txt(r.name)));
  for(const k of ["id","main_company_slug","product_id","document_line_id","quantity"])
    if(!cols.has(k))throw err("PHYSICAL_SCHEMA_APPROVAL_REQUIRED","Mevcut stok şemasında zorunlu alan eksik: "+k);
  const record:Row={
    id:"SM:"+id,main_company_slug:f.tenant,product_id:f.productId,firm_id:f.supplierCompanyId||null,
    document_id:f.physicalDocumentId,document_line_id:f.physicalLineId,
    movement_type:"PURCHASE_IN",source_type:f.provisional?"CANONICAL_INVOICE_PROVISIONAL":"CANONICAL_DISPATCH",
    date:ts.slice(0,10),quantity:f.quantity,unit:txt(f.unit)||"KG",unit_price:0,total_amount:0,
    lot_no:f.lotNo||null,active:1,
    raw:JSON.stringify({eBelge:true,physicalReceipt:true,provisional:f.provisional,
      physicalIdentity:id,physicalDocumentId:f.physicalDocumentId,physicalDocumentLineId:f.physicalLineId,
      supplierCompanyId:f.supplierCompanyId,lotNo:f.lotNo,financialDocuments:[]}),
    created_at:ts,updated_at:ts,
  };
  const picked=Object.entries(record).filter(([k])=>cols.has(k));
  return db.prepare("INSERT INTO stock_movements ("+picked.map(([k])=>'"'+k+'"').join(",")+
    ") VALUES ("+picked.map(()=>"?").join(",")+")").bind(...picked.map(([,v])=>v));
}
async function boyahaneStatements(db:any,f:Row,id:string,ts:string){
  const old=await lotMatch(db,f);
  const lotId=old?txt(old.file_name||old.id):"BL:"+await sha256(
    JSON.stringify([f.tenant,f.productId,f.supplierCompanyId,f.normalizedLot]));
  const lotSql=old
    ?db.prepare("UPDATE json_store SET data="+jsonSetQuantity("data")+
      ",updated_at=? WHERE id=? AND main_company_slug=? AND scope='BOYAHANE_LOT'")
      .bind(f.quantity,f.quantity,f.quantity,f.quantity,ts,ts,old.id,f.tenant)
    :db.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
       VALUES(?,'BOYAHANE_LOT',?,?,?,?,?)`).bind(lotId,f.tenant,lotId,JSON.stringify({
      id:lotId,inventoryId:f.productId,productId:f.productId,supplierCompanyId:f.supplierCompanyId,
      lotNo:f.lotNo,entryKg:f.quantity,quantity:f.quantity,remainingKg:f.quantity,
      remainingQuantity:f.quantity,usedKg:0,status:"AVAILABLE",unit:"KG",warehouse:"BOYAHANE",
      source:f.provisional?"E_BELGE_INVOICE_PROVISIONAL":"E_BELGE_DISPATCH",
      firstPhysicalDocumentId:f.physicalDocumentId,lastPhysicalDocumentId:f.physicalDocumentId,
      financialDocuments:[],costedQuantity:0,totalCost:0,unitCost:0,lastEntryAt:ts,
    }),ts,ts);
  const moveName="ebelge-physical:"+f.physicalDocumentId+":"+f.physicalLineId+":"+id.slice(-14);
  const movement=db.prepare(`INSERT INTO json_store
    (id,scope,main_company_slug,file_name,data,created_at,updated_at)
    VALUES(?,'BOYAHANE_STOCK_MOVEMENT',?,?,?,?,?)`).bind(
    "BM:"+id,f.tenant,moveName,JSON.stringify({
      id:moveName,inventoryId:f.productId,productId:f.productId,lotId,lotNo:f.lotNo,
      type:"IN",movementType:"IN",quantity:f.quantity,amountKg:f.quantity,unit:"KG",
      warehouse:"BOYAHANE",physicalDocumentId:f.physicalDocumentId,physicalDocumentLineId:f.physicalLineId,
      documentId:f.physicalDocumentId,documentLineId:f.physicalLineId,
      supplierCompanyId:f.supplierCompanyId,sourceType:f.provisional?"E_BELGE_INVOICE_PROVISIONAL":"E_BELGE_DISPATCH",
      provisionalPhysicalReceipt:f.provisional,createdAt:ts,movementDate:ts,
      physicalIdentity:id,financialDocuments:[],
    }),ts,ts);
  return {lotId,statements:[lotSql,movement]};
}
export async function postPhysicalReceipt(db:any,data:Row) {
  const i=await physicalIdentity(data),f={...i,unit:data.unit,sourceType:data.sourceType};
  const tables=await requireSchema(db);
  if(f.route!=="BOYAHANE"&&!tables.has("stock_movements"))
    throw err("PHYSICAL_SCHEMA_APPROVAL_REQUIRED","Canonical stock_movements tablosu yok.");
  let old=await getJournal(db,i.id,f.tenant);
  if(old) {
    if(txt(old.payload_hash)!==i.payloadHash)
      throw err("PHYSICAL_PAYLOAD_CONFLICT","Aynı fiziksel satır farklı miktar/LOT ile gönderildi; düzeltme onayı gerekli.");
    if(old.state==="DONE")return {id:i.id,status:"DONE",idempotent:true};
    if(old.state==="NEEDS_REVIEW")throw err("PHYSICAL_NEEDS_REVIEW","Fiziksel kayıt incelemede, otomatik tekrar yasak.");
    if(old.state==="PROCESSING"&&old.lease_until&&old.lease_until>now())
      throw err("PHYSICAL_IN_PROGRESS","İşlem başka Worker tarafından yürütülüyor.");
  }
  if(!old && await legacyConflict(db,f))throw err("LEGACY_PHYSICAL_REVIEW",
    "Daha önce journal dışında işlenmiş fiziksel kayıt var, ikinci miktar oluşturulmayacak.");
  // A persisted reservation survives Worker shutdown; only one lease token can claim it.
  const ts=now(),lease=crypto.randomUUID(),leaseUntil=new Date(Date.now()+90_000).toISOString();
  if(!old) {
    await db.prepare(`INSERT OR IGNORE INTO accounting_physical_operations
       (id,main_company_slug,document_id,document_line_id,physical_document_id,physical_line_id,
        operation_type,product_id,supplier_company_id,lot_normalized,payload_hash,quantity,state,
        attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,'RECEIPT',?,?,?,?,?,'PENDING',0,?,?)`)
      .bind(i.id,f.tenant,txt(data.documentId||f.physicalDocumentId),txt(data.documentLineId||f.physicalLineId),
        f.physicalDocumentId,f.physicalLineId,f.productId,f.supplierCompanyId,f.normalizedLot,
        i.payloadHash,f.quantity,ts,ts).run();
    old=await getJournal(db,i.id,f.tenant);
    if(old?.payload_hash!==i.payloadHash)throw err("PHYSICAL_PAYLOAD_CONFLICT","Aynı fiziksel kayıt farklı yükle çakıştı.");
    if(old?.state==="DONE")return{id:i.id,status:"DONE",idempotent:true};
  }
  const claimed=await db.prepare(`UPDATE accounting_physical_operations
    SET state='PROCESSING',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=?
    WHERE id=? AND main_company_slug=? AND payload_hash=? AND attempts<6
      AND (state IN ('PENDING','RETRY')
        OR (state='PROCESSING' AND (lease_until IS NULL OR lease_until<?)))`)
    .bind(lease,leaseUntil,ts,i.id,f.tenant,i.payloadHash,ts).run();
  if(Number(claimed.meta?.changes)!==1)
    throw err("PHYSICAL_LEASE_CONFLICT","Fiziksel işlem başka oturumda/deneme limiti doldu.");
  try {
    // Re-check legacy under lease; a prior pre-journal write never becomes silently trusted.
    if(await legacyConflict(db,f))throw err("LEGACY_PHYSICAL_REVIEW","Eski hareket bulundu; stok artırılmadı.");
    const steps=f.route==="BOYAHANE"
      ?(await boyahaneStatements(db,f,i.id,ts)).statements
      :[await stockInsert(db,f,i.id,ts)];
    const finish=db.prepare(`UPDATE accounting_physical_operations SET state='DONE',
      lease_token=NULL,lease_until=NULL,completed_at=?,updated_at=?,last_error_code=NULL
      WHERE id=? AND main_company_slug=? AND state='PROCESSING' AND lease_token=?`)
      .bind(ts,ts,i.id,f.tenant,lease);
    const result=await db.batch([...steps,finish]);
    if(result.some((r:Row)=>Number(r.meta?.changes)!==1))
      throw err("PHYSICAL_TXN_CONFLICT","Fiziksel işlemde koşullu yazma çakıştı.");
    return {id:i.id,status:"DONE",idempotent:false,route:f.route,quantity:f.quantity};
  }catch(e:any){
    const code=txt(e?.code)||"PHYSICAL_DB_RETRY";
    const review=code==="LEGACY_PHYSICAL_REVIEW"||code==="LEGACY_LOT_AMBIGUOUS";
    const attempted=Number(old?.attempts||0)+1;
    await db.prepare(`UPDATE accounting_physical_operations
      SET state=?,lease_token=NULL,lease_until=NULL,last_error_code=?,last_error_at=?,
      next_attempt_at=?,updated_at=? WHERE id=? AND main_company_slug=? AND lease_token=?`)
      .bind(review||attempted>=6?"NEEDS_REVIEW":"RETRY",code,now(),
        new Date(Date.now()+Math.min(60,2**Math.min(attempted,6))*1000).toISOString(),now(),i.id,f.tenant,lease).run();
    throw err(code,review?"Eski hareket için inceleme gerekli.":"Fiziksel kayıt tamamlanmadı; güvenli tekrar kuyruğuna alındı.");
  }
}
export async function readPhysicalDocumentStatus(db:any,tenant:string,documentId:string) {
  await requireSchema(db);
  const result=await db.prepare(`SELECT id,operation_type,physical_document_id,physical_line_id,
    product_id,lot_normalized,quantity,state,attempts,next_attempt_at,last_error_code,updated_at
    FROM accounting_physical_operations WHERE main_company_slug=? AND document_id=?
    ORDER BY created_at ASC LIMIT 250`).bind(tenant,documentId).all();
  return result.results||[];
}

export async function postPhysicalCostLink(db:any,data:Row) {
  const f=receiptFields(data),tenant=f.tenant,
    invoiceId=txt(data.invoiceId),invoiceLineId=txt(data.invoiceLineId);
  const qty=num(data.allocatedQuantity),total=num(data.allocatedTotal);
  if(!invoiceId||!invoiceLineId||!Number.isFinite(qty)||qty<=0||qty>f.quantity+0.00001||
     !Number.isFinite(total)||total<0)
    throw err("COST_ALLOCATION_INVALID","Fatura–irsaliye miktarı ve maliyeti uyumsuz.");
  await requireSchema(db);
  const rows=await db.prepare(`SELECT id,state FROM accounting_physical_operations
   WHERE main_company_slug=? AND physical_document_id=? AND physical_line_id=?
    AND operation_type='RECEIPT' AND product_id=? AND supplier_company_id=?
    AND lot_normalized=? LIMIT 2`).bind(tenant,f.physicalDocumentId,f.physicalLineId,
    f.productId,f.supplierCompanyId,f.normalizedLot).all();
  if((rows.results||[]).length!==1||rows.results[0].state!=="DONE")
    throw err("PHYSICAL_RECEIPT_PENDING","Bağlı gerçek irsaliyenin fiziksel kaydı tamamlanmadı.");
  const receiptId=txt(rows.results[0].id);
  const costKey="COST:"+await sha256(JSON.stringify([tenant,f.physicalDocumentId,f.physicalLineId,
    f.productId,f.supplierCompanyId,f.normalizedLot,invoiceId,invoiceLineId]));
  const payloadHash=await sha256(stable({tenant,physicalReceiptId:receiptId,invoiceId,invoiceLineId,
    allocatedQuantity:qty,allocatedTotal:total,currency:txt(data.currency)}));
  const cached=await getJournal(db,costKey,tenant);
  if(cached){
    if(cached.payload_hash!==payloadHash)
      throw err("COST_PAYLOAD_CONFLICT","Aynı fatura–irsaliye maliyet tahsisi farklı tutarda; inceleme gerekli.");
    if(cached.state==="DONE")return{id:costKey,status:"DONE",idempotent:true};
    if(cached.state==="PROCESSING"&&txt(cached.lease_until)>now())
      throw err("COST_IN_PROGRESS","Maliyet tahsisi başka Worker tarafından işleniyor.");
    if(cached.state==="NEEDS_REVIEW")throw err("COST_NEEDS_REVIEW","Maliyet tahsisi elle inceleme gerektiriyor.");
  }
  let target:Row|null=null,sourceColumn="";
  if(f.route==="BOYAHANE"){
    target=await lotMatch(db,f);
    if(!target)throw err("PHYSICAL_LOT_NOT_FOUND","Mevcut Boyahane LOT'u bulunamadı.");
    sourceColumn="data";
  }else{
    target=await db.prepare("SELECT id,raw FROM stock_movements WHERE id=? AND main_company_slug=? LIMIT 1")
      .bind("SM:"+receiptId,tenant).first();
    if(!target)throw err("PHYSICAL_STOCK_NOT_FOUND","Mevcut stok hareketi bulunamadı.");
    sourceColumn="raw";
  }
  const key=invoiceId+":"+invoiceLineId+":"+f.physicalLineId+":"+f.normalizedLot;
  const existing=parsed(target[sourceColumn]);
  if(!cached && Array.isArray(existing.financialDocuments)&&
    existing.financialDocuments.some((x:Row)=>txt(x.key)===key))
    throw err("LEGACY_COST_REVIEW","Bu maliyet daha önce kayıtlı olabilir; ikinci kez eklenmeyecek.");
  const ts=now(),lease=crypto.randomUUID();
  if(!cached){
    await db.prepare(`INSERT OR IGNORE INTO accounting_physical_operations
      (id,main_company_slug,document_id,document_line_id,physical_document_id,physical_line_id,
       operation_type,product_id,supplier_company_id,lot_normalized,payload_hash,quantity,state,
       attempts,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'COST_LINK',?,?,?,?,?,'PENDING',0,?,?)`)
      .bind(costKey,tenant,invoiceId,invoiceLineId,f.physicalDocumentId,f.physicalLineId,
        f.productId,f.supplierCompanyId,f.normalizedLot,payloadHash,qty,ts,ts).run();
  }
  const current=await getJournal(db,costKey,tenant);
  if(current?.payload_hash!==payloadHash)throw err("COST_PAYLOAD_CONFLICT","Maliyet kimliği çakıştı.");
  if(current?.state==="DONE")return{id:costKey,status:"DONE",idempotent:true};
  const claim=await db.prepare(`UPDATE accounting_physical_operations
    SET state='PROCESSING',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=?
    WHERE id=? AND main_company_slug=? AND payload_hash=? AND attempts<6
      AND (state IN ('PENDING','RETRY') OR (state='PROCESSING' AND lease_until<?))`)
    .bind(lease,new Date(Date.now()+90000).toISOString(),ts,costKey,tenant,payloadHash,ts).run();
  if(Number(claim.meta?.changes)!==1)throw err("COST_LEASE_CONFLICT","Maliyet tahsisi başka işlemde.");
  const allocation={key,documentId:invoiceId,documentLineId:invoiceLineId,
    quantity:qty,totalAmount:total,unitPrice:total/qty,currency:txt(data.currency)||"TRY",
    physicalDocumentId:f.physicalDocumentId,physicalLineId:f.physicalLineId,lotNo:f.lotNo};
  try{
    // json_insert appends instead of replacing an array read before another invoice;
    // the physical operation journal prevents duplicate append for the same allocation.
    const src=f.route==="BOYAHANE"?"data":"raw",scope=f.route==="BOYAHANE"?"json_store":"stock_movements";
    const quantityExpr=`COALESCE(CAST(json_extract(${src},'$.costedQuantity') AS REAL),0)`;
    const totalExpr=`COALESCE(CAST(json_extract(${src},'$.totalCost') AS REAL),0)`;
    const updatedJson=`json_set(COALESCE(${src},'{}'),
      '$.financialDocuments',json_insert(COALESCE(json_extract(${src},'$.financialDocuments'),'[]'),'$[#]',json(?)),
      '$.costedQuantity',${quantityExpr}+?,
      '$.totalCost',${totalExpr}+?,
      '$.unitCost',(${totalExpr}+?)/NULLIF((${quantityExpr}+?),0),
      '$.invoiceNo',?)`;
    const step=f.route==="BOYAHANE"
      ?db.prepare(`UPDATE json_store SET data=${updatedJson},updated_at=? WHERE id=?
        AND main_company_slug=? AND scope='BOYAHANE_LOT'`)
        .bind(JSON.stringify(allocation),qty,total,total,qty,txt(data.invoiceNo),ts,target.id,tenant)
      :db.prepare(`UPDATE stock_movements SET raw=${updatedJson},
         total_amount=COALESCE(total_amount,0)+?,
         unit_price=(COALESCE(total_amount,0)+?)/NULLIF((COALESCE(quantity,0)),0),
         updated_at=? WHERE id=? AND main_company_slug=?`)
        .bind(JSON.stringify(allocation),qty,total,total,qty,txt(data.invoiceNo),total,total,ts,target.id,tenant);
    const done=db.prepare(`UPDATE accounting_physical_operations SET state='DONE',
      completed_at=?,updated_at=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL
      WHERE id=? AND main_company_slug=? AND state='PROCESSING' AND lease_token=?`)
      .bind(ts,ts,costKey,tenant,lease);
    const results=await db.batch([step,done]);
    if(results.some((x:Row)=>Number(x.meta?.changes)!==1))
      throw err("COST_TRANSACTION_CONFLICT","Maliyet kaydı çakıştı.");
    return{id:costKey,status:"DONE",idempotent:false,amount:total,quantity:qty};
  }catch(e:any){
    await db.prepare(`UPDATE accounting_physical_operations SET state='RETRY',
       last_error_code=?,last_error_at=?,lease_token=NULL,lease_until=NULL,
       next_attempt_at=?,updated_at=? WHERE id=? AND main_company_slug=? AND lease_token=?`)
      .bind(txt(e?.code)||"COST_DB_RETRY",now(),new Date(Date.now()+5000).toISOString(),now(),costKey,tenant,lease).run();
    throw err(txt(e?.code)||"COST_DB_RETRY","Maliyet bağlantısı tamamlanamadı; güvenli tekrar bekleniyor.");
  }
}
