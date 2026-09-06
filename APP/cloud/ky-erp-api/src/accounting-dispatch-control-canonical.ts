// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const num=(v:unknown)=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const canonical=(v:unknown)=>text(v).toLowerCase();
const json=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
const slugOf=(c:Context<AppEnv>)=>text(c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||c.req.header("X-KYERP-Tenant-Slug"));
const owner=(role:unknown)=>["SUPER_ADMIN","ADMIN"].includes(upper(role));

async function assertAccountingScope(c:Context<AppEnv>){
  const user=await getAuthenticatedUser(c) as Row|null;
  if(!user)throw Object.assign(new Error("Muhasebe kontrolü için geçerli oturum zorunludur."),{code:"UNAUTHORIZED",status:401});
  const permissions=Array.isArray(user.permissions)?user.permissions:[],permission=permissions.find((row:Row)=>upper(row.moduleKey||row.module_key)==="MUHASEBE");
  if(!owner(user.role)&&!Boolean(permission?.canView??permission?.can_view))throw Object.assign(new Error("Muhasebe görüntüleme yetkiniz yok."),{code:"ACCOUNTING_FORBIDDEN",status:403});
  const slug=canonical(slugOf(c));if(!slug)throw Object.assign(new Error("Ana firma seçimi zorunludur."),{code:"MAIN_COMPANY_REQUIRED",status:400});
  if(!owner(user.role)){
    const own=canonical(user.mainCompanySlug||user.main_company_slug);
    if(!own||own!==slug)throw Object.assign(new Error("Bu ana firmanın Muhasebe verilerine erişim yetkiniz yok."),{code:"MAIN_COMPANY_FORBIDDEN",status:403});
  }
  return slug;
}

function metaValue(row:Row,...keys:string[]){const raw=json(row.raw_metadata);for(const key of keys){const value=text(raw[key]);if(value)return value}return""}
function documentView(row:Row){return{
  id:text(row.id),
  companyId:text(row.party_company_id),
  companyName:text(row.party_name)||"Firma eşleşmesi bekliyor",
  documentNo:text(row.document_no),
  modelName:metaValue(row,"modelName","modelAdi","model_name"),
  orderNo:metaValue(row,"orderNo","siparisNo","order_no"),
  quantity:num(row.quantity_total),
  issueDate:text(row.issue_date||row.created_at),
  documentType:text(row.document_type),
}}
function fallbackMatch(dispatch:Row,invoice:Row){
  if(text(dispatch.companyId)!==text(invoice.companyId))return false;
  const dm=upper(dispatch.modelName),im=upper(invoice.modelName),doNo=upper(dispatch.orderNo),ioNo=upper(invoice.orderNo);
  if(dm&&im&&dm===im)return true;
  if(doNo&&ioNo&&doNo===ioNo)return true;
  return false;
}

async function build(c:Context<AppEnv>){
  const slug=await assertAccountingScope(c);
  const rows=(await c.env.DB.prepare(`SELECT d.*,
      (SELECT COALESCE(SUM(l.quantity),0) FROM accounting_document_lines l WHERE l.main_company_slug=d.main_company_slug AND l.document_id=d.id) quantity_total
    FROM accounting_documents d
    WHERE d.main_company_slug=? AND d.deleted_at IS NULL AND d.direction='OUTGOING'
      AND (d.document_type LIKE '%IRSALIYE%' OR d.document_type LIKE '%FATURA%' OR d.document_type LIKE '%ARSIV%')
    ORDER BY COALESCE(d.issue_date,d.created_at) DESC,d.created_at DESC
    LIMIT 5000`).bind(slug).all<Row>()).results||[];
  const relations=(await c.env.DB.prepare(`SELECT document_id,related_document_id,relation_type FROM accounting_document_relations
    WHERE main_company_slug=? AND relation_type='INVOICE_OF'`).bind(slug).all<Row>().catch(()=>({results:[]}))).results||[];
  const documents=rows.map(documentView),dispatches=documents.filter(row=>/IRSALIYE|DISPATCH|DESPATCH/.test(upper(row.documentType))),invoices=documents.filter(row=>/FATURA|INVOICE|ARSIV/.test(upper(row.documentType)));
  const relationByDispatch=new Map<string,string>();for(const rel of relations){if(text(rel.related_document_id)&&text(rel.document_id))relationByDispatch.set(text(rel.related_document_id),text(rel.document_id))}
  const matchedInvoiceIds=new Set<string>();
  const resultRows=dispatches.map(dispatch=>{
    const linkedId=relationByDispatch.get(dispatch.id),match=(linkedId?invoices.find(invoice=>invoice.id===linkedId):null)||invoices.find(invoice=>fallbackMatch(dispatch,invoice))||null;
    if(match)matchedInvoiceIds.add(match.id);
    const dispatchQuantity=num(dispatch.quantity),invoiceQuantity=num(match?.quantity),remaining=Math.max(0,dispatchQuantity-invoiceQuantity);
    return{id:dispatch.id,companyId:dispatch.companyId,companyName:dispatch.companyName,modelName:dispatch.modelName,orderNo:dispatch.orderNo,dispatchNo:dispatch.documentNo,dispatchQuantity,invoiceId:match?.id||null,invoiceNo:match?.documentNo||"",invoiceQuantity,remaining,status:!match?"INVOICE_WAITING":remaining>0?"PARTIAL":invoiceQuantity>dispatchQuantity?"OVER_INVOICED":"COMPLETED",sourceSystem:"CANONICAL",issueDate:dispatch.issueDate};
  });
  return{rows:resultRows,total:resultRows.length,summary:{dispatchWithoutInvoice:resultRows.filter(row=>row.status==="INVOICE_WAITING").length,invoiceWithoutDispatch:invoices.filter(invoice=>!matchedInvoiceIds.has(invoice.id)).length,quantityDifference:resultRows.filter(row=>["PARTIAL","OVER_INVOICED"].includes(row.status)).length,modelPending:resultRows.filter(row=>!row.modelName).length,completed:resultRows.filter(row=>row.status==="COMPLETED").length},readModel:"CANONICAL_OUTGOING_DOCUMENTS"};
}

function errorResponse(c:Context<AppEnv>,error:any){return c.json({ok:false,error:{code:text(error?.code)||"DISPATCH_CONTROL_FAILED",message:text(error?.message)||"İrsaliye/fatura kontrolü hazırlanamadı."}},Number(error?.status||500))}

export function registerCanonicalDispatchControlRoutes(app:Hono<AppEnv>){
  app.get("/api/muhasebe/customer-dispatches/summary",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data:data.summary,readModel:data.readModel})}catch(error:any){return errorResponse(c,error)}});
  app.get("/api/muhasebe/customer-dispatches",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data})}catch(error:any){return errorResponse(c,error)}});
}
