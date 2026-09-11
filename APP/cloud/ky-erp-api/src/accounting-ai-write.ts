// @ts-nocheck
import type { Context } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;

export const ACCOUNTING_AI_ACTION_SCOPE="KYERP_AI_ACTION";
const ACTION_TTL_MS=30*60*1000;
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const now=()=>new Date().toISOString();
const json=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
const normalize=(v:unknown)=>upper(v).replace(/ı/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();

export function canWriteAccounting(user:Row){
  if(["ADMIN","SUPER_ADMIN"].includes(upper(user?.role)))return true;
  return Array.isArray(user?.permissions)&&user.permissions.some((p:Row)=>upper(p.moduleKey||p.module_key)==="MUHASEBE"&&Boolean(p.canCreate??p.can_create??p.canUpdate??p.can_update));
}

export function parseAccountingAmount(message:string){
  const raw=text(message).replace(/\u00a0/g," ");
  const bin=raw.match(/(\d+(?:[.,]\d+)?)\s*bin\b/i);
  if(bin){const n=Number(bin[1].replace(",","."));return Number.isFinite(n)?n*1000:0;}
  const money=raw.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:₺|tl|lira)/i);
  if(money){const n=Number(money[1].replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:0;}
  const plain=raw.match(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{2,}(?:,\d{1,2})?)\b/);
  if(!plain)return 0;const n=Number(plain[1].replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:0;
}

export function parseAccountingDate(message:string,referenceDate=new Date()){
  const iso=text(message).match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);if(iso)return`${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const tr=text(message).match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);if(tr)return`${tr[3]}-${tr[2].padStart(2,"0")}-${tr[1].padStart(2,"0")}`;
  return referenceDate.toISOString().slice(0,10);
}

export function detectAccountingActionKind(message:string){
  const m=normalize(message);
  if(/\bACILIS\s+BAKIYE/.test(m))return"OPENING_BALANCE";
  if(/\b(TAHSIL|TAHSILAT)\b|ODEME\s+AL/.test(m))return"COLLECTION";
  if(/\b(GIDER|MASRAF)\b/.test(m)&&!/\b(ODEME|ODE)\b/.test(m))return"MANUAL_EXPENSE";
  if(/\b(ODEME|ODE)\b/.test(m))return"PAYMENT";
  if(/\bBORC\b/.test(m))return"DEBIT";
  if(/\bALACAK\b/.test(m))return"CREDIT";
  return"";
}

export function detectAccountingRecordScope(message:string){const m=normalize(message);return/IC KAYIT|GAYRI RESMI|GAYRIRESMI|DAHILI/.test(m)?"INTERNAL":/\bRESMI\b/.test(m)?"OFFICIAL":"INTERNAL";}
export function detectAccountingPaymentMethod(message:string){const m=normalize(message);if(/NAKIT/.test(m))return"NAKIT";if(/HAVALE|EFT|BANKA/.test(m))return"BANKA";if(/KART/.test(m))return"KART";if(/CEK/.test(m))return"CEK";return"";}

async function resolveCompany(c:Context<AppEnv>,slug:string,message:string){
  const companies=(await c.env.DB.prepare(`SELECT id,name,normalized_name,current_balance FROM companies WHERE main_company_slug=? AND COALESCE(is_active,1)=1 AND deleted_at IS NULL ORDER BY LENGTH(name) DESC`).bind(slug).all<Row>().catch(()=>({results:[]}))).results||[];
  const aliases=(await c.env.DB.prepare(`SELECT a.company_id,a.raw_name,a.normalized_name FROM company_aliases a JOIN companies c ON c.id=a.company_id AND c.main_company_slug=a.main_company_slug WHERE a.main_company_slug=? AND COALESCE(a.is_active,1)=1 AND a.deleted_at IS NULL AND c.deleted_at IS NULL`).bind(slug).all<Row>().catch(()=>({results:[]}))).results||[];
  const msg=normalize(message),candidates:Row[]=[];
  for(const company of companies){const names=[company.name,company.normalized_name,...aliases.filter(a=>text(a.company_id)===text(company.id)).flatMap(a=>[a.raw_name,a.normalized_name])].map(normalize).filter(x=>x.length>=3);const best=names.filter(n=>msg.includes(n)).sort((a,b)=>b.length-a.length)[0];if(best)candidates.push({company,score:best.length,matched:best});}
  candidates.sort((a,b)=>b.score-a.score);if(!candidates.length)return{company:null,ambiguous:false};
  if(candidates[1]&&candidates[1].score===candidates[0].score&&text(candidates[1].company.id)!==text(candidates[0].company.id))return{company:null,ambiguous:true};
  return{company:candidates[0].company,ambiguous:false};
}

async function putAction(c:Context<AppEnv>,slug:string,action:Row){
  const ts=now(),payload={...action,updatedAt:ts};const existing=await c.env.DB.prepare(`SELECT id FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? LIMIT 1`).bind(ACCOUNTING_AI_ACTION_SCOPE,action.id,slug).first<Row>();
  if(existing?.id)await c.env.DB.prepare(`UPDATE json_store SET data=?,updated_at=? WHERE id=?`).bind(JSON.stringify(payload),ts,existing.id).run();
  else await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),ACCOUNTING_AI_ACTION_SCOPE,slug,action.id,JSON.stringify(payload),ts,ts).run();
  return payload;
}

export async function proposeAccountingAction(c:Context<AppEnv>,slug:string,user:Row,message:string){
  const kind=detectAccountingActionKind(message);if(!kind)return null;
  const amount=parseAccountingAmount(message);if(!(amount>0))return{blocked:true,code:"AMOUNT_REQUIRED",message:"Muhasebe işlemi algılandı ancak tutar net değil."};
  const resolved=await resolveCompany(c,slug,message);if(kind!=="MANUAL_EXPENSE"&&!resolved.company)return{blocked:true,code:resolved.ambiguous?"COMPANY_AMBIGUOUS":"COMPANY_REQUIRED",message:resolved.ambiguous?"Firma adı birden fazla cariyle eşleşiyor; işlem oluşturulmadı.":"Muhasebe işlemi algılandı ancak firma kesin eşleşmedi."};
  const normalizedMessage=normalize(message);let transactionType=kind;
  if(kind==="OPENING_BALANCE"){
    if(/\bALACAK\b/.test(normalizedMessage))transactionType="CREDIT";else if(/\bBORC\b/.test(normalizedMessage))transactionType="DEBIT";else return{blocked:true,code:"OPENING_DIRECTION_REQUIRED",message:"Açılış bakiyesinde borç veya alacak yönü belirtilmelidir."};
  }
  const id=crypto.randomUUID(),scope=detectAccountingRecordScope(message),company=resolved.company||null,method=detectAccountingPaymentMethod(message),date=parseAccountingDate(message);
  const action={id,type:kind,status:"PENDING",mainCompanySlug:slug,actorUserId:text(user?.id),actorName:text(user?.name||user?.email),companyId:text(company?.id)||null,companyName:text(company?.name)||"Genel gider",amount,date,recordScope:scope,recordType:scope==="OFFICIAL"?"RESMI":"GAYRI_RESMI",paymentMethod:method,transactionType,description:text(message).slice(0,500),source:"KY_ERP_AI",createdAt:now(),expiresAt:new Date(Date.now()+ACTION_TTL_MS).toISOString()};
  await putAction(c,slug,action);
  return{...action,label:`${company?.name||"Genel gider"} · ${amount.toLocaleString("tr-TR")} TL · ${kind==="PAYMENT"?"Ödeme":kind==="COLLECTION"?"Tahsilat":kind==="MANUAL_EXPENSE"?"Gider":kind==="OPENING_BALANCE"?"Açılış Bakiyesi":kind}`};
}

async function tableColumns(c:Context<AppEnv>,table:string){const rows=(await c.env.DB.prepare(`PRAGMA table_info(${table})`).all<Row>()).results||[];return new Set(rows.map(r=>text(r.name)));}
async function insertSupported(c:Context<AppEnv>,table:string,data:Row){const cols=await tableColumns(c,table),entries=Object.entries(data).filter(([k,v])=>cols.has(k)&&v!==undefined);if(!entries.length)throw new Error(`No supported columns for ${table}`);const sql=`INSERT INTO ${table} (${entries.map(([k])=>`"${k}"`).join(",")}) VALUES (${entries.map(()=>"?").join(",")})`;return c.env.DB.prepare(sql).bind(...entries.map(([,v])=>v&&typeof v==="object"?JSON.stringify(v):v??null)).run();}
async function updateSupported(c:Context<AppEnv>,table:string,id:string,slug:string,data:Row){const cols=await tableColumns(c,table),entries=Object.entries(data).filter(([k,v])=>cols.has(k)&&v!==undefined);if(!entries.length)return;await c.env.DB.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`"${k}"=?`).join(",")} WHERE id=? AND main_company_slug=?`).bind(...entries.map(([,v])=>v&&typeof v==="object"?JSON.stringify(v):v??null),id,slug).run();}

export async function confirmAccountingAction(c:Context<AppEnv>,slug:string,user:Row,actionId:string){
  const store=await c.env.DB.prepare(`SELECT id,data FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1`).bind(ACCOUNTING_AI_ACTION_SCOPE,actionId,slug).first<Row>();
  if(!store)return{ok:false,status:404,code:"ACTION_NOT_FOUND",message:"Onaylanacak muhasebe işlemi bulunamadı."};
  const action=json(store.data);if(text(action.actorUserId)&&text(action.actorUserId)!==text(user?.id)&&!["ADMIN","SUPER_ADMIN"].includes(upper(user?.role)))return{ok:false,status:403,code:"ACTION_OWNER_MISMATCH",message:"Bu işlem başka bir kullanıcı tarafından oluşturuldu."};
  if(action.status==="COMPLETED")return{ok:true,idempotent:true,action,result:action.result||null};
  if(action.status!=="PENDING")return{ok:false,status:409,code:"ACTION_NOT_PENDING",message:"İşlem artık onay beklemiyor."};
  if(action.expiresAt&&Date.parse(action.expiresAt)<Date.now())return{ok:false,status:409,code:"ACTION_EXPIRED",message:"İşlem onay süresi doldu; yeniden oluşturun."};
  if(!canWriteAccounting(user))return{ok:false,status:403,code:"ACCOUNTING_WRITE_FORBIDDEN",message:"Muhasebe işlem yetkiniz yok."};
  if(action.type==="MANUAL_EXPENSE"){
    const prior=await c.env.DB.prepare(`SELECT id FROM json_store WHERE scope='MUHASEBE_MANUAL_EXPENSE' AND file_name=? AND main_company_slug=? LIMIT 1`).bind(actionId,slug).first<Row>();
    if(!prior){const payload={id:actionId,date:action.date,companyId:action.companyId||null,companyName:action.companyName||"Genel gider",category:"Diğer",amount:num(action.amount),vatAmount:0,recordType:action.recordType||"GAYRI_RESMI",description:action.description,type:"EXPENSE",reportIncluded:true,addToCurrentAccount:false,paymentType:action.paymentMethod||"",note:"KY ERP AI onaylı iç kayıt",createdAt:now()},ts=now();await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),"MUHASEBE_MANUAL_EXPENSE",slug,actionId,JSON.stringify(payload),ts,ts).run();}
    const completed=await putAction(c,slug,{...action,status:"COMPLETED",completedAt:now(),result:{manualExpenseId:actionId,idempotent:Boolean(prior)}});return{ok:true,idempotent:Boolean(prior),action:completed,result:completed.result};
  }
  const existing=await c.env.DB.prepare(`SELECT * FROM current_account_movements WHERE id=? AND main_company_slug=? LIMIT 1`).bind(actionId,slug).first<Row>().catch(()=>null);
  if(existing){const balanceAfter=num(existing.balance_after);if(action.companyId)await updateSupported(c,"companies",action.companyId,slug,{current_balance:balanceAfter,updated_at:now()});const completed=await putAction(c,slug,{...action,status:"COMPLETED",completedAt:now(),result:{movementId:actionId,balanceAfter,idempotent:true,recovered:true}});return{ok:true,idempotent:true,action:completed,result:completed.result};}
  const company=await c.env.DB.prepare(`SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(action.companyId,slug).first<Row>();if(!company)return{ok:false,status:404,code:"COMPANY_NOT_FOUND",message:"Cari firma artık bulunamadı."};
  const amount=num(action.amount),tx=upper(action.transactionType),effect=(tx==="DEBIT"||tx==="PAYMENT")?amount:-amount,before=num(company.current_balance),after=before+effect,movementType=tx==="DEBIT"?"BORC":tx==="CREDIT"?"ALACAK":tx==="COLLECTION"?"TAHSILAT":"ODEME",ts=now();
  await insertSupported(c,"current_account_movements",{id:actionId,main_company_slug:slug,company_id:action.companyId,movement_date:action.date,movement_type:movementType,source_type:"AI_CURRENT_ACCOUNT",document_no:actionId,description:action.description||movementType,debit:(tx==="DEBIT"||tx==="PAYMENT")?amount:0,credit:(tx==="CREDIT"||tx==="COLLECTION")?amount:0,amount,effect,balance_before:before,balance_after:after,record_type:action.recordType||"GAYRI_RESMI",raw:{transactionType:tx,recordType:action.recordType||"GAYRI_RESMI",recordScope:action.recordScope||"INTERNAL",paymentMethod:action.paymentMethod||"",actor:"KY_ERP_AI",actorUserId:text(user?.id),actionId},created_at:ts,updated_at:ts});
  await updateSupported(c,"companies",action.companyId,slug,{current_balance:after,updated_at:ts});
  const completed=await putAction(c,slug,{...action,status:"COMPLETED",completedAt:ts,result:{movementId:actionId,balanceBefore:before,balanceAfter:after}});return{ok:true,action:completed,result:completed.result};
}

export async function cancelAccountingAction(c:Context<AppEnv>,slug:string,user:Row,actionId:string){const row=await c.env.DB.prepare(`SELECT data FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? LIMIT 1`).bind(ACCOUNTING_AI_ACTION_SCOPE,actionId,slug).first<Row>();if(!row)return{ok:true};const action=json(row.data);if(text(action.actorUserId)&&text(action.actorUserId)!==text(user?.id)&&!["ADMIN","SUPER_ADMIN"].includes(upper(user?.role)))return{ok:false,status:403,code:"ACTION_OWNER_MISMATCH",message:"Bu işlem başka bir kullanıcı tarafından oluşturuldu."};if(action.status==="COMPLETED")return{ok:false,status:409,code:"ACTION_ALREADY_COMPLETED",message:"Tamamlanmış muhasebe işlemi iptal edilemez; ters kayıt gerekir."};await putAction(c,slug,{...action,status:"CANCELLED",cancelledAt:now()});return{ok:true};}
