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
const norm=(v:unknown)=>upper(v).replace(/ı/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
const slugOf=(c:Context<AppEnv>)=>text(c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||c.req.header("X-KYERP-Tenant-Slug"));
const owner=(role:unknown)=>["SUPER_ADMIN","ADMIN"].includes(upper(role));
const isDispatch=(v:unknown)=>/IRSALIYE|DISPATCH|DESPATCH/.test(upper(v));
const isInvoice=(v:unknown)=>/FATURA|INVOICE|ARSIV/.test(upper(v));
const EPS=0.0001;

async function assertAccountingScope(c:Context<AppEnv>){
  const user=await getAuthenticatedUser(c) as Row|null;if(!user)throw Object.assign(new Error("Muhasebe kontrolü için geçerli oturum zorunludur."),{code:"UNAUTHORIZED",status:401});
  const permissions=Array.isArray(user.permissions)?user.permissions:[],permission=permissions.find((row:Row)=>upper(row.moduleKey||row.module_key)==="MUHASEBE");
  if(!owner(user.role)&&!Boolean(permission?.canView??permission?.can_view))throw Object.assign(new Error("Muhasebe görüntüleme yetkiniz yok."),{code:"ACCOUNTING_FORBIDDEN",status:403});
  const slug=canonical(slugOf(c));if(!slug)throw Object.assign(new Error("Ana firma seçimi zorunludur."),{code:"MAIN_COMPANY_REQUIRED",status:400});
  if(!owner(user.role)){const own=canonical(user.mainCompanySlug||user.main_company_slug);if(!own||own!==slug)throw Object.assign(new Error("Bu ana firmanın Muhasebe verilerine erişim yetkiniz yok."),{code:"MAIN_COMPANY_FORBIDDEN",status:403});}
  return slug;
}

function metaValue(row:Row,...keys:string[]){const raw=json(row.raw_metadata);for(const key of keys){const value=text(raw[key]);if(value)return value}return""}
function documentView(row:Row){return{id:text(row.id),companyId:text(row.party_company_id),companyName:text(row.party_name)||"Firma eşleşmesi bekliyor",documentNo:text(row.document_no),modelName:metaValue(row,"modelName","modelAdi","model_name"),orderNo:metaValue(row,"orderNo","siparisNo","order_no"),issueDate:text(row.issue_date||row.created_at),documentType:text(row.document_type)}}
export function canonicalUnit(v:unknown){const u=upper(v).replace(/[^A-Z0-9]/g,"");if(["KGM","KG","KILOGRAM"].includes(u))return"KG";if(["C62","ADET","AD","PCS","PCE"].includes(u))return"AD";if(["LTR","LT","L","LITRE"].includes(u))return"LT";if(["MTR","M","METRE"].includes(u))return"M";return u;}
export function canonicalLineKey(line:Row){if(text(line.product_id))return`P:${text(line.product_id)}`;if(text(line.supplier_product_code))return`S:${norm(line.supplier_product_code)}`;if(text(line.product_code))return`C:${norm(line.product_code)}`;const d=norm(line.description);return d.length>=4?`D:${d}`:"";}
function strictContextMatch(dispatch:Row,invoice:Row){if(text(dispatch.companyId)!==text(invoice.companyId)||!dispatch.companyId)return false;const dm=norm(dispatch.modelName),im=norm(invoice.modelName),doo=norm(dispatch.orderNo),io=norm(invoice.orderNo);return Boolean((doo&&io&&doo===io)||(dm&&im&&dm===im));}
function lineOverlap(dispatchLines:Row[],invoiceLines:Row[]){const keys=new Set(dispatchLines.map(canonicalLineKey).filter(Boolean));return invoiceLines.some(line=>{const key=canonicalLineKey(line);return key&&keys.has(key)&&canonicalUnit(line.unit_code)===canonicalUnit(dispatchLines.find(d=>canonicalLineKey(d)===key)?.unit_code)});}

async function build(c:Context<AppEnv>){
  const slug=await assertAccountingScope(c);
  const rows=(await c.env.DB.prepare(`SELECT d.* FROM accounting_documents d WHERE d.main_company_slug=? AND d.deleted_at IS NULL AND d.direction='OUTGOING' AND (d.document_type LIKE '%IRSALIYE%' OR d.document_type LIKE '%FATURA%' OR d.document_type LIKE '%ARSIV%' OR d.document_type LIKE '%INVOICE%' OR d.document_type LIKE '%DISPATCH%') ORDER BY COALESCE(d.issue_date,d.created_at) ASC,d.created_at ASC LIMIT 5000`).bind(slug).all<Row>()).results||[];
  const ids=rows.map(r=>text(r.id)).filter(Boolean),lines:Row[]=[],relations:Row[]=[];
  if(ids.length){for(let i=0;i<ids.length;i+=200){const part=ids.slice(i,i+200),ph=part.map(()=>"?").join(",");const lr=await c.env.DB.prepare(`SELECT * FROM accounting_document_lines WHERE main_company_slug=? AND document_id IN (${ph}) ORDER BY document_id,line_no`).bind(slug,...part).all<Row>();lines.push(...(lr.results||[]));}}
  try{const rr=await c.env.DB.prepare(`SELECT document_id,related_document_id,relation_type FROM accounting_document_relations WHERE main_company_slug=? AND relation_type IN ('INVOICE_OF','DESPATCH_OF','DISPATCH_OF')`).bind(slug).all<Row>();relations.push(...(rr.results||[]));}catch{}
  const linesByDoc=new Map<string,Row[]>();for(const line of lines){const id=text(line.document_id);if(!linesByDoc.has(id))linesByDoc.set(id,[]);linesByDoc.get(id)!.push(line);}
  const documents=rows.map(documentView),dispatches=documents.filter(row=>isDispatch(row.documentType)),invoices=documents.filter(row=>isInvoice(row.documentType)),docById=new Map(documents.map(d=>[d.id,d]));
  const explicit=new Map<string,Set<string>>();
  for(const rel of relations){const a=docById.get(text(rel.document_id)),b=docById.get(text(rel.related_document_id));if(!a||!b)continue;const dispatch=isDispatch(a.documentType)?a:isDispatch(b.documentType)?b:null,invoice=isInvoice(a.documentType)?a:isInvoice(b.documentType)?b:null;if(!dispatch||!invoice)continue;if(!explicit.has(dispatch.id))explicit.set(dispatch.id,new Set());explicit.get(dispatch.id)!.add(invoice.id);}
  const invoiceRemaining=new Map<string,number>();for(const line of lines.filter(l=>invoices.some(i=>i.id===text(l.document_id))))invoiceRemaining.set(text(line.id),Math.max(0,num(line.quantity)));
  const usedInvoiceIds=new Set<string>(),resultRows:Row[]=[];
  for(const dispatch of dispatches){
    const dLines=linesByDoc.get(dispatch.id)||[],explicitIds=explicit.get(dispatch.id),candidateInvoices=(explicitIds?.size?invoices.filter(i=>explicitIds.has(i.id)):invoices.filter(i=>strictContextMatch(dispatch,i)&&lineOverlap(dLines,linesByDoc.get(i.id)||[]))).sort((a,b)=>text(a.issueDate).localeCompare(text(b.issueDate)));
    let allocated=0,lineIssueCount=0;const matchedIds=new Set<string>(),lineResults:Row[]=[];
    for(const dl of dLines){const key=canonicalLineKey(dl),unit=canonicalUnit(dl.unit_code),qty=Math.max(0,num(dl.quantity));let need=qty;if(!key||qty<=EPS){lineIssueCount++;lineResults.push({lineId:dl.id,key,unit,quantity:qty,allocated:0,remaining:qty,status:"REVIEW_REQUIRED"});continue;}
      const candidates:Row[]=[];for(const inv of candidateInvoices){for(const il of linesByDoc.get(inv.id)||[]){if(canonicalLineKey(il)===key&&canonicalUnit(il.unit_code)===unit&&num(invoiceRemaining.get(text(il.id)))>EPS)candidates.push({...il,__invoiceId:inv.id});}}
      for(const il of candidates){if(need<=EPS)break;const available=num(invoiceRemaining.get(text(il.id))),take=Math.min(need,available);if(take<=EPS)continue;invoiceRemaining.set(text(il.id),available-take);need-=take;allocated+=take;matchedIds.add(text(il.__invoiceId));usedInvoiceIds.add(text(il.__invoiceId));}
      const rem=Math.max(0,need);if(rem>EPS)lineIssueCount++;lineResults.push({lineId:dl.id,key,unit,quantity:qty,allocated:qty-rem,remaining:rem,status:rem>EPS?"PARTIAL":"COMPLETED"});
    }
    const dispatchQuantity=dLines.reduce((s,l)=>s+Math.max(0,num(l.quantity)),0),remaining=Math.max(0,dispatchQuantity-allocated),matched=[...matchedIds].map(id=>invoices.find(i=>i.id===id)).filter(Boolean) as Row[];
    const status=!candidateInvoices.length||allocated<=EPS?"INVOICE_WAITING":lineIssueCount>0||remaining>EPS?(allocated>EPS?"PARTIAL":"REVIEW_REQUIRED"):"COMPLETED";
    resultRows.push({id:dispatch.id,companyId:dispatch.companyId,companyName:dispatch.companyName,modelName:dispatch.modelName,orderNo:dispatch.orderNo,dispatchNo:dispatch.documentNo,dispatchQuantity,invoiceId:matched[0]?.id||null,invoiceIds:matched.map(i=>i.id),invoiceNo:matched.map(i=>i.documentNo).filter(Boolean).join(", "),invoiceNos:matched.map(i=>i.documentNo).filter(Boolean),invoiceQuantity:allocated,remaining,status,matchBasis:explicitIds?.size?"DOCUMENT_RELATION+LINE_IDENTITY":"STRICT_CONTEXT+LINE_IDENTITY",lineIssueCount,lineResults,sourceSystem:"CANONICAL",issueDate:dispatch.issueDate});
  }
  resultRows.sort((a,b)=>text(b.issueDate).localeCompare(text(a.issueDate)));
  return{rows:resultRows,total:resultRows.length,summary:{dispatchWithoutInvoice:resultRows.filter(row=>row.status==="INVOICE_WAITING").length,invoiceWithoutDispatch:invoices.filter(invoice=>!usedInvoiceIds.has(invoice.id)).length,quantityDifference:resultRows.filter(row=>["PARTIAL","REVIEW_REQUIRED"].includes(row.status)).length,modelPending:resultRows.filter(row=>!row.modelName).length,completed:resultRows.filter(row=>row.status==="COMPLETED").length},readModel:"CANONICAL_LINE_ALLOCATED_DOCUMENTS",matchingPolicy:"EXPLICIT_RELATION_OR_STRICT_CONTEXT_PLUS_EXACT_LINE_IDENTITY"};
}

function errorResponse(c:Context<AppEnv>,error:any){return c.json({ok:false,error:{code:text(error?.code)||"DISPATCH_CONTROL_FAILED",message:text(error?.message)||"İrsaliye/fatura kontrolü hazırlanamadı."}},Number(error?.status||500))}
export function registerCanonicalDispatchControlRoutes(app:Hono<AppEnv>){app.get("/api/muhasebe/customer-dispatches/summary",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data:data.summary,readModel:data.readModel,matchingPolicy:data.matchingPolicy})}catch(error:any){return errorResponse(c,error)}});app.get("/api/muhasebe/customer-dispatches",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data})}catch(error:any){return errorResponse(c,error)}});}
