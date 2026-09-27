// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;

const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR");
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const now=()=>new Date().toISOString();
const safeJson=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;if(typeof v!=="string"||!v.trim())return{};try{const p=JSON.parse(v);return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
const safeArray=(v:unknown)=>{if(Array.isArray(v))return v;if(typeof v!=="string"||!v.trim())return[];try{const p=JSON.parse(v);return Array.isArray(p)?p:[]}catch{return[]}};
const normalize=(v:unknown)=>upper(v).replace(/İ/g,"I").replace(/ı/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
const slugOf=(c:Context<AppEnv>,b:Row={})=>text(b.mainCompanySlug||b.main_company_slug||b.mainCompanyId||c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||c.req.header("X-KYERP-Tenant-Slug"));

export const DEFAULT_ACCOUNTING_REPORT_CATEGORIES=[
  {code:"BASKI_GELIRI",name:"Baskı Geliri",type:"INCOME",sort:10},
  {code:"MAL_HIZMET",name:"Mal ve Hizmet Alımı",type:"EXPENSE",sort:20},
  {code:"KIMYA_BOYA",name:"Kimya / Boya",type:"EXPENSE",sort:30},
  {code:"STOK_MALZEME",name:"Stok / Malzeme Alımı",type:"EXPENSE",sort:40},
  {code:"NAKLIYE",name:"Nakliye",type:"EXPENSE",sort:50},
  {code:"AMBALAJ",name:"Ambalaj",type:"EXPENSE",sort:60},
  {code:"BAKIM_ONARIM",name:"Bakım / Onarım",type:"EXPENSE",sort:70},
  {code:"YEMEK",name:"Yemek",type:"EXPENSE",sort:80},
  {code:"PERSONEL",name:"Personel",type:"EXPENSE",sort:90},
  {code:"KIRA",name:"Kira",type:"EXPENSE",sort:100},
  {code:"ELEKTRIK",name:"Elektrik",type:"EXPENSE",sort:110},
  {code:"SU",name:"Su",type:"EXPENSE",sort:120},
  {code:"INTERNET",name:"İnternet",type:"EXPENSE",sort:130},
  {code:"ARAC",name:"Araç",type:"EXPENSE",sort:140},
  {code:"MUHASEBE",name:"Muhasebe",type:"EXPENSE",sort:150},
  {code:"BANKA_MASRAFI",name:"Banka Masrafı",type:"EXPENSE",sort:160},
  {code:"DIS_HIZMET",name:"Dış Hizmet",type:"EXPENSE",sort:170},
  {code:"KUMAS_YARDIMCI",name:"Kumaş / Yardımcı Malzeme",type:"EXPENSE",sort:180},
  {code:"KARMA_GIDER",name:"Karma Gider",type:"EXPENSE",sort:900},
  {code:"DIGER",name:"Diğer",type:"BOTH",sort:990},
];

async function tableExists(c:Context<AppEnv>,name:string){
  const row=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first<Row>().catch(()=>null);
  return Boolean(row?.name);
}
async function jsonStoreRows(c:Context<AppEnv>,scope:string,slug:string){
  if(!(await tableExists(c,"json_store")))return[];
  const r=await c.env.DB.prepare(`SELECT id,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC,id DESC`).bind(scope,slug).all<Row>();
  return(r.results||[]).map(row=>({...safeJson(row.data),storeId:row.id,fileName:row.file_name,createdAt:text(safeJson(row.data).createdAt||row.created_at),updatedAt:text(safeJson(row.data).updatedAt||row.updated_at)}));
}
async function jsonStorePut(c:Context<AppEnv>,scope:string,fileName:string,data:Row,slug:string){
  const existing=await c.env.DB.prepare(`SELECT id FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 1`).bind(scope,fileName,slug).first<Row>();
  const ts=now(),payload={...data,updatedAt:ts};
  if(existing?.id){
    await c.env.DB.prepare(`UPDATE json_store SET main_company_slug=COALESCE(main_company_slug,?),data=?,updated_at=? WHERE id=?`).bind(slug,JSON.stringify(payload),ts,existing.id).run();
    return{...payload,fileName,storeId:existing.id};
  }
  const id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id,scope,slug,fileName,JSON.stringify({...payload,createdAt:payload.createdAt||ts}),ts,ts).run();
  return{...payload,fileName,storeId:id};
}
async function jsonStoreDelete(c:Context<AppEnv>,scope:string,fileName:string,slug:string){
  return c.env.DB.prepare(`DELETE FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)`).bind(scope,fileName,slug).run();
}

async function ensureCategories(c:Context<AppEnv>,slug:string){
  if(await tableExists(c,"accounting_report_categories")){
    const ts=now();
    for(const cat of DEFAULT_ACCOUNTING_REPORT_CATEGORIES){
      await c.env.DB.prepare(`INSERT OR IGNORE INTO accounting_report_categories(id,main_company_slug,code,name,category_type,is_active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)`).bind(crypto.randomUUID(),slug,cat.code,cat.name,cat.type,cat.sort,ts,ts).run();
    }
    const rows=await c.env.DB.prepare(`SELECT * FROM accounting_report_categories WHERE main_company_slug=? AND is_active=1 ORDER BY sort_order,name COLLATE NOCASE`).bind(slug).all<Row>();
    return(rows.results||[]).map(row=>({...row,ad:text(row.name),name:text(row.name),key:text(row.code),aktifMi:Number(row.is_active??1)!==0}));
  }
  return DEFAULT_ACCOUNTING_REPORT_CATEGORIES.map((cat,index)=>({id:`builtin:${cat.code}`,main_company_slug:slug,code:cat.code,key:cat.code,name:cat.name,ad:cat.name,category_type:cat.type,aktifMi:true,is_active:1,sort_order:cat.sort??index}));
}

function inferredMask(row:Row){
  const explicit=safeArray(row.override_mask||row.overrideMask);
  if(explicit.length)return explicit.map(String);
  const names=["reportIncluded","reportCategoryId","reportAmount","reportDescription","reportOfficialType","reportVatAmount","reportVatIncluded","reportExpenseStatus","reportNote"];
  const snake:Row={reportIncluded:row.report_included,reportCategoryId:row.report_category_id,reportAmount:row.report_amount,reportDescription:row.report_description,reportOfficialType:row.report_official_type,reportVatAmount:row.report_vat_amount,reportVatIncluded:row.report_vat_included,reportExpenseStatus:row.report_expense_status,reportNote:row.report_note};
  return names.filter(name=>snake[name]!==null&&snake[name]!==undefined&&snake[name]!=="");
}
async function loadOverrides(c:Context<AppEnv>,slug:string){
  if(await tableExists(c,"accounting_report_overrides")){
    const rows=await c.env.DB.prepare(`SELECT * FROM accounting_report_overrides WHERE main_company_slug=?`).bind(slug).all<Row>();
    return(rows.results||[]).map(row=>({...row,overrideMask:inferredMask(row)}));
  }
  return(await jsonStoreRows(c,"ACCOUNTING_REPORT_OVERRIDE",slug)).map(row=>({...row,overrideMask:safeArray(row.overrideMask)}));
}

export function deriveCanonicalExpenseCategory(line:Row){
  const raw=safeJson(line.raw_metadata||line.rawMetadata),routing=upper(raw.routingType||"EXPENSE");
  const named=text(raw.expenseCategoryName||raw.categoryName);
  if(named)return{name:named,routing};
  if(routing==="BOYAHANE")return{name:"Kimya / Boya",routing};
  if(routing==="STOCK")return{name:"Stok / Malzeme Alımı",routing};
  return{name:"Mal ve Hizmet Alımı",routing:"EXPENSE"};
}

export function applyCanonicalReportOverride(base:Row,override:Row|null,categoryById:Map<string,Row>){
  if(!override)return{...base,hasOverride:false,sourceOfDecision:"CANONICAL_POSTING"};
  const mask=new Set((override.overrideMask||inferredMask(override)).map(String));
  const value=(camel:string,snake:string)=>override[camel]!==undefined?override[camel]:override[snake];
  const out={...base};
  if(mask.has("reportIncluded")){const v=value("reportIncluded","report_included");out.reportIncluded=v==null?null:Boolean(Number(v)===1||v===true);}
  if(mask.has("reportCategoryId")){out.categoryId=text(value("reportCategoryId","report_category_id"));const cat=categoryById.get(out.categoryId);if(cat)out.category=text(cat.name||cat.ad);}
  if(mask.has("reportAmount"))out.reportAmount=num(value("reportAmount","report_amount"));
  if(mask.has("reportDescription"))out.reportDescription=text(value("reportDescription","report_description"));
  if(mask.has("reportOfficialType"))out.officialType=upper(value("reportOfficialType","report_official_type"))||out.officialType;
  if(mask.has("reportVatAmount"))out.reportVatAmount=num(value("reportVatAmount","report_vat_amount"));
  if(mask.has("reportVatIncluded")){const v=value("reportVatIncluded","report_vat_included");out.reportVatIncluded=v==null?false:Boolean(Number(v)===1||v===true);}
  if(mask.has("reportExpenseStatus"))out.expenseStatus=upper(value("reportExpenseStatus","report_expense_status"))||out.expenseStatus;
  if(mask.has("reportNote"))out.reportNote=text(value("reportNote","report_note"));
  out.reportStatus=out.reportIncluded==null?"KONTROL_BEKLIYOR":out.reportIncluded?"DAHIL":"HARIC";
  out.recordType=out.officialType;
  out.amount=out.reportAmount;
  out.vatAmount=out.reportVatAmount;
  out.hasOverride=mask.size>0;
  out.sourceOfDecision=mask.size?"RECORD_OVERRIDE":"CANONICAL_POSTING";
  return out;
}

function companyBehavior(company:Row|undefined,direction:string,officialType:string){
  const raw=safeJson(company?.raw),incoming=upper(direction)!=="OUTGOING";
  const track=incoming?Number(company?.supplier_debt_tracking??raw.trackReceivablePayable??1)!==0:Number(company?.customer_receivable_tracking??raw.trackReceivablePayable??1)!==0;
  if(officialType!=="RESMI")return{code:"UNOFFICIAL_EXPENSE",label:"Gayri / Rapor",trackCurrent:track};
  if(track)return{code:"OFFICIAL_CARI",label:"KDV + Cari",trackCurrent:true};
  return{code:"OFFICIAL_CASH_VAT",label:"Peşin Alış / KDV",trackCurrent:false};
}
function financialType(v:unknown){return/FATURA|INVOICE|ARSIV|IADE/.test(upper(v))}
function dateInRange(value:unknown,startDate:string,endDate:string){const d=text(value).slice(0,10);return Boolean(d&&(!startDate||d>=startDate)&&(!endDate||d<=endDate))}
function categoryLookup(categories:Row[]){const byName=new Map<string,Row>(),byId=new Map<string,Row>();for(const row of categories){byName.set(normalize(row.name||row.ad),row);byId.set(text(row.id),row)}return{byName,byId}}
function categoryRow(byName:Map<string,Row>,name:string){return byName.get(normalize(name))||null}

async function canonicalDocuments(c:Context<AppEnv>,slug:string,startDate:string,endDate:string,firmId:string){
  if(!(await tableExists(c,"accounting_documents")))return[];
  const rows=await c.env.DB.prepare(`SELECT * FROM accounting_documents WHERE main_company_slug=? AND deleted_at IS NULL AND status='POSTED' AND COALESCE(issue_date,posted_at,created_at)>=? AND COALESCE(issue_date,posted_at,created_at)<=? ORDER BY COALESCE(issue_date,posted_at,created_at) DESC LIMIT 20000`).bind(slug,startDate,`${endDate}T23:59:59`).all<Row>();
  return(rows.results||[]).filter(row=>financialType(row.document_type)).filter(row=>!firmId||text(row.party_company_id)===firmId);
}
async function canonicalLines(c:Context<AppEnv>,slug:string,startDate:string,endDate:string){
  if(!(await tableExists(c,"accounting_document_lines")))return[];
  const rows=await c.env.DB.prepare(`SELECT l.* FROM accounting_document_lines l JOIN accounting_documents d ON d.id=l.document_id AND d.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND d.deleted_at IS NULL AND d.status='POSTED' AND COALESCE(d.issue_date,d.posted_at,d.created_at)>=? AND COALESCE(d.issue_date,d.posted_at,d.created_at)<=? ORDER BY d.id,l.line_no`).bind(slug,startDate,`${endDate}T23:59:59`).all<Row>();
  return rows.results||[];
}
async function companies(c:Context<AppEnv>,slug:string){
  if(!(await tableExists(c,"companies")))return[];
  const rows=await c.env.DB.prepare(`SELECT * FROM companies WHERE main_company_slug=? AND deleted_at IS NULL`).bind(slug).all<Row>();
  return rows.results||[];
}
async function standaloneCurrent(c:Context<AppEnv>,slug:string,startDate:string,endDate:string,firmId:string){
  if(!(await tableExists(c,"current_account_movements")))return[];
  const rows=await c.env.DB.prepare(`SELECT * FROM current_account_movements WHERE main_company_slug=? AND document_id IS NULL AND movement_date>=? AND movement_date<=? ORDER BY movement_date DESC LIMIT 10000`).bind(slug,startDate,`${endDate}T23:59:59`).all<Row>();
  return(rows.results||[]).filter(row=>!firmId||text(row.company_id)===firmId);
}

export async function buildCanonicalAccountingReport(c:Context<AppEnv>){
  const slug=slugOf(c);
  const today=new Date(),startDate=text(c.req.query("startDate"))||`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`,endDate=text(c.req.query("endDate"))||today.toISOString().slice(0,10);
  const firmId=text(c.req.query("firmId")||c.req.query("firmaId")),officialFilter=upper(c.req.query("officialType")||c.req.query("resmiTip")),categoryFilter=text(c.req.query("categoryId")||c.req.query("kategoriId")),sourceFilter=upper(c.req.query("sourceType")||c.req.query("islemTuru")),statusFilter=upper(c.req.query("reportStatus")||c.req.query("raporDurumu")),behaviorFilter=upper(c.req.query("companyBehavior")||c.req.query("firmaDavranisi")),search=text(c.req.query("search")||c.req.query("q")).toLocaleLowerCase("tr-TR");
  const [cats,docs,lines,companyRows,manualRows,fixedTemplates,overrides,currentRows]=await Promise.all([
    ensureCategories(c,slug),canonicalDocuments(c,slug,startDate,endDate,firmId),canonicalLines(c,slug,startDate,endDate),companies(c,slug),jsonStoreRows(c,"MUHASEBE_MANUAL_EXPENSE",slug),jsonStoreRows(c,"MUHASEBE_FIXED_EXPENSE",slug),loadOverrides(c,slug),standaloneCurrent(c,slug,startDate,endDate,firmId)
  ]);
  const {byName,byId}=categoryLookup(cats),companyMap=new Map(companyRows.map(row=>[text(row.id),row])),linesByDoc=new Map<string,Row[]>();
  for(const line of lines){const id=text(line.document_id);if(!linesByDoc.has(id))linesByDoc.set(id,[]);linesByDoc.get(id)!.push(line)}
  const overrideMap=new Map(overrides.map(row=>[`${upper(row.source_type||row.sourceType)}:${text(row.source_id||row.sourceId||row.fileName)}`,row]));
  const records:Row[]=[];
  const expenseBreakdown:Row[]=[];
  for(const doc of docs){
    const direction=upper(doc.direction)==="OUTGOING"?"OUTGOING":"INCOMING",income=direction==="OUTGOING",docLines=linesByDoc.get(text(doc.id))||[],company=companyMap.get(text(doc.party_company_id)),officialType=upper(doc.record_scope)==="INTERNAL"?"GAYRI_RESMI":"RESMI",behavior=companyBehavior(company,direction,officialType);
    const lineCategories=docLines.map(line=>{const derived=deriveCanonicalExpenseCategory(line),raw=safeJson(line.raw_metadata),amount=num(line.line_total)+num(line.tax_amount);return{lineId:text(line.id),description:text(line.description),productId:text(line.product_id)||null,routingType:derived.routing,categoryName:derived.name,lotNo:text(raw.lotNo)||null,amount,baseAmount:num(line.line_total),vatAmount:num(line.tax_amount)}}).filter(Boolean);
    if(!income){for(const item of lineCategories)expenseBreakdown.push({...item,documentId:text(doc.id),documentNo:text(doc.document_no),companyId:text(doc.party_company_id),companyName:text(doc.party_name||company?.name),date:text(doc.issue_date||doc.posted_at||doc.created_at).slice(0,10)})}
    const names=[...new Set(lineCategories.map(x=>x.categoryName).filter(Boolean))],categoryName=income?"Baskı Geliri":names.length===1?names[0]:names.length>1?"Karma Gider":"Mal ve Hizmet Alımı",cat=categoryRow(byName,categoryName);
    const base:Row={id:text(doc.id),sourceType:"DOCUMENT",sourceId:text(doc.id),sourceLabel:income?"Kesilen Fatura":"Gelen Fatura",date:text(doc.issue_date||doc.posted_at||doc.created_at).slice(0,10),companyId:text(doc.party_company_id),companyName:text(doc.party_name||company?.name)||"Firma Bilgisi Yok",companyType:text(company?.company_type||company?.type)|| (income?"MUSTERI":"TEDARIKCI"),transactionType:income?"GELIR":"GIDER",type:income?"INCOME":"EXPENSE",officialType,recordType:officialType,companyBehaviorCode:behavior.code,companyBehavior:behavior.label,currentAccountIncluded:behavior.trackCurrent,cariIncluded:behavior.trackCurrent,categoryId:text(cat?.id),category:categoryName,sourceCategoryId:text(cat?.id),sourceCategoryName:categoryName,expenseStatus:income?"GENEL_GIDER_DEGIL":"GENEL_GIDER",reportIncluded:true,reportStatus:"DAHIL",reportVatIncluded:officialType==="RESMI",documentNo:text(doc.document_no),description:text(doc.note)||docLines.slice(0,3).map(x=>text(x.description)).filter(Boolean).join(" · "),baseAmount:num(doc.subtotal),vat:num(doc.tax_total),vatRate:num(doc.subtotal)?num(doc.tax_total)/num(doc.subtotal)*100:0,grandTotal:num(doc.payable_total)||num(doc.subtotal)+num(doc.tax_total),reportAmount:num(doc.payable_total)||num(doc.subtotal)+num(doc.tax_total),reportVatAmount:officialType==="RESMI"?num(doc.tax_total):0,amount:num(doc.payable_total)||num(doc.subtotal)+num(doc.tax_total),vatAmount:officialType==="RESMI"?num(doc.tax_total):0,reportDescription:text(doc.note)||docLines.slice(0,3).map(x=>text(x.description)).filter(Boolean).join(" · "),reportNote:"",originalRoute:income?"kesilen-faturalar":"tedarikci-faturalari",providerType:text(doc.provider_type),documentStatus:text(doc.status),lineCategories};
    records.push(applyCanonicalReportOverride(base,overrideMap.get(`DOCUMENT:${text(doc.id)}`)||null,byId));
  }
  for(const movement of currentRows){
    const company=companyMap.get(text(movement.company_id)),incoming=num(movement.credit)>num(movement.debit),amount=Math.abs(num(movement.amount)||num(movement.effect)),officialType="RESMI",behavior=companyBehavior(company,incoming?"OUTGOING":"INCOMING",officialType);
    const base:Row={id:text(movement.id),sourceType:"CURRENT_ACCOUNT",sourceId:text(movement.id),sourceLabel:"Cari Hareket",date:text(movement.movement_date).slice(0,10),companyId:text(movement.company_id),companyName:text(company?.name)||"Firma Bilgisi Yok",companyType:text(company?.company_type||company?.type)||"CARI",transactionType:incoming?"GELIR":"GIDER",type:incoming?"INCOME":"EXPENSE",officialType,recordType:officialType,companyBehaviorCode:behavior.code,companyBehavior:behavior.label,currentAccountIncluded:true,cariIncluded:true,categoryId:"",category:"Cari Hareket",expenseStatus:"GENEL_GIDER_DEGIL",reportIncluded:false,reportStatus:"HARIC",reportVatIncluded:false,documentNo:text(movement.document_no),description:text(movement.description),baseAmount:amount,vat:0,vatRate:0,grandTotal:amount,reportAmount:amount,reportVatAmount:0,amount,vatAmount:0,reportDescription:text(movement.description),reportNote:"",originalRoute:"cari-hareketler"};
    records.push(applyCanonicalReportOverride(base,overrideMap.get(`CURRENT_ACCOUNT:${text(movement.id)}`)||null,byId));
  }
  for(const manual of manualRows){
    const date=text(manual.date||manual.tarih||manual.createdAt).slice(0,10);if(!dateInRange(date,startDate,endDate))continue;if(firmId&&text(manual.companyId||manual.firmaId)!==firmId)continue;
    const income=upper(manual.type||manual.islemTuru)==="INCOME"||upper(manual.type||manual.islemTuru)==="GELIR",officialType=upper(manual.recordType||manual.resmiTip)==="GAYRI_RESMI"?"GAYRI_RESMI":"RESMI",categoryName=text(manual.category||manual.categoryName||manual.kategori)|| (income?"Baskı Geliri":"Diğer"),cat=categoryRow(byName,categoryName),company=companyMap.get(text(manual.companyId||manual.firmaId)),amount=num(manual.amount||manual.tutar),vat=num(manual.vatAmount||manual.kdv),grand=amount+vat;
    const base:Row={id:text(manual.id||manual.fileName),sourceType:"MANUEL_GENEL_GIDER",sourceId:text(manual.id||manual.fileName),sourceLabel:income?"Manuel Gelir":"Manuel Genel Gider",date,companyId:text(manual.companyId||manual.firmaId),companyName:text(manual.companyName||company?.name||manual.ad||manual.description)||"Genel Gider",companyType:text(company?.company_type||company?.type)||"MANUEL",transactionType:income?"GELIR":"GIDER",type:income?"INCOME":"EXPENSE",officialType,recordType:officialType,companyBehaviorCode:officialType==="RESMI"?"OFFICIAL_CASH_VAT":"UNOFFICIAL_EXPENSE",companyBehavior:officialType==="RESMI"?"Peşin / Manuel":"Gayri / Manuel",currentAccountIncluded:Boolean(manual.addToCurrentAccount||manual.cariyeEkle),cariIncluded:Boolean(manual.addToCurrentAccount||manual.cariyeEkle),categoryId:text(manual.categoryId||manual.kategoriId||cat?.id),category:categoryName,expenseStatus:income?"GENEL_GIDER_DEGIL":"GENEL_GIDER",reportIncluded:manual.reportIncluded!==false&&manual.raporaDahil!==false,reportStatus:manual.reportIncluded===false||manual.raporaDahil===false?"HARIC":"DAHIL",reportVatIncluded:officialType==="RESMI",documentNo:text(manual.documentNo||manual.belgeNo)||"MANUEL",description:text(manual.description||manual.aciklama),baseAmount:amount,vat:officialType==="RESMI"?vat:0,vatRate:amount?vat/amount*100:0,grandTotal:grand,reportAmount:grand,reportVatAmount:officialType==="RESMI"?vat:0,amount:grand,vatAmount:officialType==="RESMI"?vat:0,reportDescription:text(manual.description||manual.aciklama),reportNote:text(manual.note||manual.not),originalRoute:"muhasebe-raporlari",manual:true};
    records.push(applyCanonicalReportOverride(base,overrideMap.get(`MANUEL_GENEL_GIDER:${text(base.sourceId)}`)||null,byId));
  }
  const filtered=records.filter(row=>!officialFilter||officialFilter==="TUMU"||row.officialType===officialFilter).filter(row=>!behaviorFilter||behaviorFilter==="TUMU"||row.companyBehaviorCode===behaviorFilter).filter(row=>!categoryFilter||row.categoryId===categoryFilter).filter(row=>!sourceFilter||sourceFilter==="TUMU"||row.sourceType===sourceFilter||upper(row.sourceLabel)===sourceFilter).filter(row=>!statusFilter||statusFilter==="TUMU"||row.reportStatus===statusFilter).filter(row=>!search||[row.companyName,row.documentNo,row.description,row.reportDescription,row.category,row.baseAmount,row.grandTotal].join(" ").toLocaleLowerCase("tr-TR").includes(search)).sort((a,b)=>text(b.date).localeCompare(text(a.date)));
  const included=filtered.filter(row=>row.reportIncluded===true),expenses=included.filter(row=>row.transactionType==="GIDER"&&row.expenseStatus==="GENEL_GIDER"),incomes=included.filter(row=>row.transactionType==="GELIR"),vatIn=filtered.filter(row=>row.transactionType==="GIDER"&&row.officialType==="RESMI"&&row.reportVatIncluded),vatOut=filtered.filter(row=>row.transactionType==="GELIR"&&row.officialType==="RESMI"&&row.reportVatIncluded),sum=(rows:Row[],key:string)=>rows.reduce((s,row)=>s+num(row[key]),0);
  const companyGroups=new Map<string,Row>();
  for(const row of filtered){if(row.sourceType==="CURRENT_ACCOUNT")continue;const key=text(row.companyId||row.companyName||row.sourceId),g=companyGroups.get(key)||{companyId:row.companyId,companyName:row.companyName,companyType:row.companyType,companyBehaviorCode:row.companyBehaviorCode,companyBehavior:row.companyBehavior,officialType:row.officialType,currentAccountIncluded:row.currentAccountIncluded,firstDate:row.date,lastDate:row.date,invoiceCount:0,officialTotal:0,unofficialTotal:0,baseAmount:0,vat:0,grandTotal:0,currentAccountTotal:0,incomeTotal:0,includedCount:0,excludedCount:0,pendingCount:0,generalExpenseTotal:0,companyDefaultCategoryId:row.categoryId||"",companyDefaultCategoryName:row.category||"Kategorisiz",records:[]};g.firstDate=text(g.firstDate)<text(row.date)?g.firstDate:row.date;g.lastDate=text(g.lastDate)>text(row.date)?g.lastDate:row.date;if(row.officialType==="RESMI")g.officialTotal+=num(row.grandTotal);else g.unofficialTotal+=num(row.grandTotal);g.baseAmount+=num(row.baseAmount);g.vat+=num(row.vat);g.grandTotal+=num(row.grandTotal);if(row.sourceType==="DOCUMENT")g.invoiceCount++;if(row.currentAccountIncluded)g.currentAccountTotal+=num(row.grandTotal);if(row.reportIncluded===true)g.includedCount++;else if(row.reportIncluded===false)g.excludedCount++;else g.pendingCount++;if(row.reportIncluded===true&&row.expenseStatus==="GENEL_GIDER")g.generalExpenseTotal+=num(row.reportAmount);if(row.reportIncluded===true&&row.transactionType==="GELIR")g.incomeTotal+=num(row.reportAmount);g.records.push(row);companyGroups.set(key,g)}
  const companySummary=[...companyGroups.values()].map(g=>({...g,categoryId:g.companyDefaultCategoryId,category:g.companyDefaultCategoryName,reportStatus:g.pendingCount>0?"KONTROL_BEKLIYOR":g.includedCount>0?"DAHIL":"HARIC",expenseEffect:g.generalExpenseTotal>0?"GENEL_GIDER":g.pendingCount>0?"KONTROL_BEKLIYOR":"GENEL_GIDER_DEGIL",currentAccountEffect:g.currentAccountIncluded?"CARI_DAHIL":"CARI_DISI"})).sort((a,b)=>num(b.grandTotal)-num(a.grandTotal));
  const breakdownMap=new Map<string,Row>();for(const row of expenseBreakdown){const key=row.categoryName||"Diğer",g=breakdownMap.get(key)||{category:key,count:0,baseAmount:0,vatAmount:0,total:0};g.count++;g.baseAmount+=num(row.baseAmount);g.vatAmount+=num(row.vatAmount);g.total+=num(row.amount);breakdownMap.set(key,g)}
  const totalIncome=sum(incomes,"reportAmount"),totalExpense=sum(expenses,"reportAmount"),incomingVat=sum(vatIn,"reportVatAmount"),outgoingVat=sum(vatOut,"reportVatAmount");
  return{period:{startDate,endDate},filters:{startDate,endDate},records:filtered,companySummary,generalExpenses:expenses,vatIn,vatOut,fixedExpenseTemplates:fixedTemplates,expenseBreakdown:[...breakdownMap.values()].sort((a,b)=>num(b.total)-num(a.total)),summary:{totalIncome,totalExpense,grossProfit:totalIncome-totalExpense,netProfit:totalIncome-totalExpense,netResult:totalIncome-totalExpense,incomingVat,outgoingVat,carryVat:Math.max(0,incomingVat-outgoingVat),includedCount:included.length,excludedCount:filtered.filter(row=>row.reportIncluded===false).length,pendingCount:filtered.filter(row=>row.reportIncluded==null).length,includedExpenseCompanies:companySummary.filter(row=>num(row.generalExpenseTotal)>0).length,pendingCompanies:companySummary.filter(row=>num(row.pendingCount)>0).length},categories:cats,emptyState:filtered.length?"":"Bu dönem için işlenmiş gelir veya gider kaydı bulunamadı."};
}

async function saveOverride(c:Context<AppEnv>,slug:string,sourceType:string,sourceId:string,body:Row){
  const mapping:Row={reportIncluded:["report_included",v=>v==null?null:v?1:0],reportCategoryId:["report_category_id",text],reportAmount:["report_amount",num],reportDescription:["report_description",text],reportOfficialType:["report_official_type",upper],reportVatAmount:["report_vat_amount",num],reportVatIncluded:["report_vat_included",v=>v==null?null:v?1:0],reportExpenseStatus:["report_expense_status",upper],reportNote:["report_note",text]};
  const given=Object.keys(mapping).filter(key=>Object.prototype.hasOwnProperty.call(body,key));
  if(await tableExists(c,"accounting_report_overrides")){
    const existing=await c.env.DB.prepare(`SELECT * FROM accounting_report_overrides WHERE main_company_slug=? AND source_type=? AND source_id=? LIMIT 1`).bind(slug,sourceType,sourceId).first<Row>(),mask=new Set([...(existing?inferredMask(existing):[]),...given]),data:Row={};
    for(const key of given){const [column,convert]=mapping[key];data[column]=convert(body[key])}
    const ts=now();
    if(existing?.id){const sets=[...Object.keys(data).map(k=>`${k}=?`),"override_mask=?","updated_at=?"];await c.env.DB.prepare(`UPDATE accounting_report_overrides SET ${sets.join(",")} WHERE id=? AND main_company_slug=?`).bind(...Object.values(data),JSON.stringify([...mask]),ts,existing.id,slug).run();return{id:existing.id,sourceType,sourceId,overrideMask:[...mask],...body}}
    const id=crypto.randomUUID(),columns=["id","main_company_slug","source_type","source_id",...Object.keys(data),"override_mask","created_at","updated_at"],values=[id,slug,sourceType,sourceId,...Object.values(data),JSON.stringify([...mask]),ts,ts];await c.env.DB.prepare(`INSERT INTO accounting_report_overrides(${columns.join(",")}) VALUES(${columns.map(()=>"?").join(",")})`).bind(...values).run();return{id,sourceType,sourceId,overrideMask:[...mask],...body};
  }
  const key=`${sourceType}:${sourceId}`,existing=(await jsonStoreRows(c,"ACCOUNTING_REPORT_OVERRIDE",slug)).find(row=>text(row.fileName)===key)||{},mask=new Set([...(safeArray(existing.overrideMask)),...given]),saved={...existing,sourceType,sourceId,overrideMask:[...mask]};for(const name of given)saved[name]=body[name];return jsonStorePut(c,"ACCOUNTING_REPORT_OVERRIDE",key,saved,slug);
}

function manualPayload(body:Row,id:string,existing:Row={}){
  const date=text(body.tarih||body.date||existing.date||existing.tarih).slice(0,10),amount=num(body.tutar??body.amount??existing.amount??existing.tutar),vat=num(body.kdv??body.vatAmount??existing.vatAmount??existing.kdv),category=text(body.kategoriAdi||body.category||existing.category||existing.kategori||body.ad)||"Diğer",recordType=upper(body.resmiTip||body.recordType||existing.recordType||existing.resmiTip)==="GAYRI_RESMI"?"GAYRI_RESMI":"RESMI";
  return{...existing,id,date,companyId:text(body.firmaId||body.companyId||existing.companyId||existing.firmaId)||null,companyName:text(body.ad||body.companyName||existing.companyName||existing.ad||body.aciklama||body.description)||"Genel gider",categoryId:text(body.kategoriId||body.categoryId||existing.categoryId||existing.kategoriId)||null,category,amount,vatAmount:vat,recordType,description:text(body.aciklama||body.description||existing.description||existing.aciklama),type:upper(body.islemTuru||body.type||existing.type)==="GELIR"?"INCOME":"EXPENSE",reportIncluded:body.raporaDahil===undefined?(existing.reportIncluded!==false):Boolean(body.raporaDahil),addToCurrentAccount:Boolean(body.cariyeEkle??body.addToCurrentAccount??existing.addToCurrentAccount),paymentType:text(body.odemeSekli||body.paymentType||existing.paymentType),note:text(body.not||body.note||existing.note),createdAt:text(existing.createdAt)||now()};
}

function csvCell(v:unknown){const s=text(v).replace(/"/g,'""');return`"${s}"`}
function reportCsv(report:Row){const rows=report.records||[],head=["Tarih","Firma","Belge No","Kaynak","İşlem","Resmi/Gayri","Kategori","Matrah","KDV","Toplam","Rapora Giren","Durum","Açıklama"],lines=[head.map(csvCell).join(";")];for(const row of rows)lines.push([row.date,row.companyName,row.documentNo,row.sourceLabel,row.transactionType,row.officialType,row.category,row.baseAmount,row.reportVatAmount,row.grandTotal,row.reportAmount,row.reportStatus,row.reportDescription].map(csvCell).join(";"));return"\ufeff"+lines.join("\r\n")}

export function registerCanonicalAccountingReportRoutes(app:Hono<AppEnv>){
  app.put("/api/muhasebe/accounting/reports/record/:sourceType/:sourceId",async c=>{const body=await c.req.json<Row>().catch(()=>({})),slug=slugOf(c,body),sourceType=upper(c.req.param("sourceType")),sourceId=text(c.req.param("sourceId"));if(!slug||!sourceType||!sourceId)return c.json({ok:false,error:{code:"REQUIRED",message:"Firma ve kayıt kimliği zorunludur."}},422);const data=await saveOverride(c,slug,sourceType,sourceId,body);return c.json({ok:true,success:true,data})});
  app.post("/api/muhasebe/accounting/reports/manual-expense",async c=>{const body=await c.req.json<Row>().catch(()=>({})),slug=slugOf(c,body),id=text(body.id)||crypto.randomUUID(),data=manualPayload(body,id);if(!data.date||data.amount<=0)return c.json({ok:false,error:{code:"INVALID_EXPENSE",message:"Tarih ve sıfırdan büyük gider tutarı zorunludur."}},400);const saved=await jsonStorePut(c,"MUHASEBE_MANUAL_EXPENSE",id,data,slug);return c.json({ok:true,success:true,data:saved},201)});
  app.put("/api/muhasebe/accounting/reports/manual-expense/:id",async c=>{const body=await c.req.json<Row>().catch(()=>({})),slug=slugOf(c,body),id=text(c.req.param("id")),existing=(await jsonStoreRows(c,"MUHASEBE_MANUAL_EXPENSE",slug)).find(row=>text(row.id||row.fileName)===id);if(!existing)return c.json({ok:false,error:{code:"NOT_FOUND",message:"Manuel gider bulunamadı."}},404);const saved=await jsonStorePut(c,"MUHASEBE_MANUAL_EXPENSE",id,manualPayload(body,id,existing),slug);return c.json({ok:true,success:true,data:saved})});
  app.delete("/api/muhasebe/accounting/reports/manual-expense/:id",async c=>{const slug=slugOf(c),id=text(c.req.param("id"));await jsonStoreDelete(c,"MUHASEBE_MANUAL_EXPENSE",id,slug);return c.json({ok:true,success:true,data:{id,deleted:true}})});
  app.get("/api/muhasebe/accounting/reports/export",async c=>{const report=await buildCanonicalAccountingReport(c),body=reportCsv(report),month=text(c.req.query("startDate")).slice(0,7).replace("-","_")||new Date().toISOString().slice(0,7).replace("-","_");return new Response(body,{status:200,headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="KY_ERP_Muhasebe_Raporu_${month}.csv"`,"Cache-Control":"no-store"}})});
}
