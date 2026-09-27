// @ts-nocheck
import type { Context } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR");
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const json=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
const normalize=(v:unknown)=>upper(v).replace(/İ/g,"I").replace(/ı/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();

function legacyKind(row:Row){
  const type=upper(row.document_type),direction=upper(row.direction);
  if(/IRSALIYE|DISPATCH|DESPATCH/.test(type))return"DISPATCH";
  if(direction==="OUTGOING"||/GIDEN|CUSTOMER|SALES/.test(type))return"CUSTOMER_INVOICE";
  return"SUPPLIER_INVOICE";
}
function legacyStatus(value:unknown){
  const status=upper(value);
  if(status==="POSTED")return"PROCESSED";
  if(status==="APPROVED")return"APPROVED";
  if(status==="READY_FOR_APPROVAL")return"READY";
  if(status==="INGESTED"||status==="REVIEW_REQUIRED")return"CONTROL_WAITING";
  return status||"CONTROL_WAITING";
}
function lineView(row:Row){
  const raw=json(row.raw_metadata);
  return{
    id:text(row.id),
    lineNo:Number(row.line_no||0),
    rawName:text(row.description||row.product_code||row.supplier_product_code)||"Kalem",
    description:text(row.description),
    quantity:num(row.quantity),
    unit:text(row.unit_code),
    unitPrice:num(row.unit_price),
    subtotal:num(row.line_total),
    vatRate:num(row.tax_rate),
    vatAmount:num(row.tax_amount),
    lineTotal:num(row.line_total)+num(row.tax_amount),
    productId:text(row.product_id)||null,
    productName:text(raw.productName||row.description),
    lotNo:text(raw.lotNo),
    routingType:text(raw.routingType),
    expenseCategoryName:text(raw.expenseCategoryName),
    raw,
  };
}
function documentView(row:Row,lines:Row[]=[]){
  const raw=json(row.raw_metadata),kind=legacyKind(row),companyId=text(row.party_company_id),lineViews=lines.map(lineView),quantity=lineViews.reduce((sum,line)=>sum+num(line.quantity),0);
  return{
    id:text(row.id),
    sourceSystem:"CANONICAL",
    documentKind:kind,
    documentNo:text(row.document_no),
    invoiceNo:text(row.document_no),
    issueDate:text(row.issue_date||row.created_at),
    companyId:companyId||null,
    firmId:companyId||null,
    supplierName:text(row.party_name)||"Firma eşleşmesi bekliyor",
    companyName:text(row.party_name),
    partyTaxNo:text(row.party_tax_no),
    subtotal:num(row.subtotal),
    vatTotal:num(row.tax_total),
    grandTotal:num(row.payable_total)||num(row.subtotal)+num(row.tax_total),
    sourceType:text(row.source_type)||text(row.provider_type)||"CANONICAL",
    providerType:text(row.provider_type),
    status:legacyStatus(row.status),
    canonicalStatus:text(row.status),
    processedAt:text(row.posted_at)||null,
    firmMatchStatus:companyId?"MATCHED":"PENDING",
    modelName:text(raw.modelName||raw.modelAdi),
    orderNo:text(raw.orderNo||raw.siparisNo),
    quantity:quantity||num(raw.quantity||raw.adet),
    lines:lineViews,
    files:Array.isArray(row.files)?row.files:[],
    raw:{...raw,canonical:true,providerType:row.provider_type,recordScope:row.record_scope},
    createdAt:text(row.created_at),
    updatedAt:text(row.updated_at),
  };
}
function optionMatch(row:Row,options:{kind?:string;search?:string;status?:string}={}){
  if(options.kind&&row.documentKind!==options.kind)return false;
  const status=normalize(options.status);
  if(status&&status!=="ALL"&&normalize(row.status)!==status&&normalize(row.canonicalStatus)!==status)return false;
  const q=normalize(options.search);
  if(q&&!normalize(`${row.documentNo||""} ${row.companyName||""} ${row.supplierName||""} ${row.modelName||""} ${row.partyTaxNo||""}`).includes(q))return false;
  return true;
}

export async function listCanonicalAccountingDocuments(c:Context<AppEnv>,slug:string,options:{kind?:string;search?:string;status?:string}={}){
  try{
    const rows=await c.env.DB.prepare(`SELECT d.*,
      (SELECT COALESCE(SUM(l.quantity),0) FROM accounting_document_lines l WHERE l.main_company_slug=d.main_company_slug AND l.document_id=d.id) quantity_total
      FROM accounting_documents d WHERE d.main_company_slug=? AND d.deleted_at IS NULL
      ORDER BY COALESCE(d.issue_date,d.created_at) DESC,d.created_at DESC LIMIT 20000`).bind(slug).all<Row>();
    return(rows.results||[]).map(row=>{const view=documentView(row);if(!view.quantity)view.quantity=num(row.quantity_total);return view}).filter(row=>optionMatch(row,options));
  }catch{return[]}
}

export async function canonicalAccountingDocumentDetail(c:Context<AppEnv>,slug:string,id:string){
  try{
    const row=await c.env.DB.prepare(`SELECT * FROM accounting_documents WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(id,slug).first<Row>();
    if(!row)return null;
    const [lines,files]=await Promise.all([
      c.env.DB.prepare(`SELECT * FROM accounting_document_lines WHERE main_company_slug=? AND document_id=? ORDER BY line_no,id`).bind(slug,id).all<Row>(),
      c.env.DB.prepare(`SELECT a.id,a.file_name,a.extension,a.mime_type,a.size_bytes,a.source_type,a.preview_status FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id AND a.main_company_slug=r.main_company_slug WHERE r.main_company_slug=? AND r.entity_type='DOCUMENT' AND r.entity_id=? ORDER BY a.created_at`).bind(slug,id).all<Row>().catch(()=>({results:[]})),
    ]);
    return documentView({...row,files:files.results||[]},lines.results||[]);
  }catch{return null}
}

export function accountingReadDedupeKey(row:Row){
  const no=normalize(row.documentNo||row.document_no),kind=upper(row.documentKind||row.document_kind),party=text(row.companyId||row.firmId)||normalize(row.partyTaxNo||row.companyName||row.supplierName),date=text(row.issueDate||row.date||row.createdAt).slice(0,10);
  if(!no)return"";
  return`${kind}|${no}|${party}|${date}`;
}

export function mergeCanonicalLegacyAccounting(canonical:Row[],legacy:Row[]){
  const keys=new Set(canonical.map(accountingReadDedupeKey).filter(Boolean)),ids=new Set(canonical.map(row=>text(row.id)).filter(Boolean));
  const rest=legacy.filter(row=>{if(ids.has(text(row.id)))return false;const key=accountingReadDedupeKey(row);return!key||!keys.has(key)});
  return[...canonical,...rest].sort((a,b)=>text(b.issueDate||b.createdAt).localeCompare(text(a.issueDate||a.createdAt)));
}
