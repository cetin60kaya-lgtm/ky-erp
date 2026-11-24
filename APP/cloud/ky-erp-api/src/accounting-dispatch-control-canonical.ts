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
function documentView(row:Row){return{id:text(row.id),companyId:text(row.party_company_id),companyName:text(row.party_name)||"Firma eşleşmesi bekliyor",documentNo:text(row.document_no),modelName:metaValue(row,"modelName","modelAdi","model_name"),modelId:metaValue(row,"modelId","model_id","modelRecordId"),orderNo:metaValue(row,"orderNo","siparisNo","order_no"),issueDate:text(row.issue_date||row.created_at),documentType:text(row.document_type)}}
export function canonicalUnit(v:unknown){const u=upper(v).replace(/[^A-Z0-9]/g,"");if(["KGM","KG","KILOGRAM"].includes(u))return"KG";if(["C62","ADET","AD","PCS","PCE"].includes(u))return"AD";if(["LTR","LT","L","LITRE"].includes(u))return"LT";if(["MTR","M","METRE"].includes(u))return"M";return u;}
export function canonicalLineKey(line:Row){if(text(line.product_id))return`P:${text(line.product_id)}`;if(text(line.supplier_product_code))return`S:${norm(line.supplier_product_code)}`;if(text(line.product_code))return`C:${norm(line.product_code)}`;const d=norm(line.description);return d.length>=4?`D:${d}`:"";}
function strictContextMatch(dispatch:Row,invoice:Row){if(text(dispatch.companyId)!==text(invoice.companyId)||!dispatch.companyId)return false;if(dispatch.modelId&&invoice.modelId&&dispatch.modelId!==invoice.modelId)return false;const dm=norm(dispatch.modelName),im=norm(invoice.modelName),doo=norm(dispatch.orderNo),io=norm(invoice.orderNo);return Boolean((dispatch.modelId&&invoice.modelId&&dispatch.modelId===invoice.modelId)||(doo&&io&&doo===io)||(dm&&im&&dm===im));}
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
    resultRows.push({id:dispatch.id,companyId:dispatch.companyId,companyName:dispatch.companyName,modelName:dispatch.modelName,modelId:dispatch.modelId,orderNo:dispatch.orderNo,dispatchNo:dispatch.documentNo,dispatchQuantity,invoiceId:matched[0]?.id||null,invoiceIds:matched.map(i=>i.id),invoiceNo:matched.map(i=>i.documentNo).filter(Boolean).join(", "),invoiceNos:matched.map(i=>i.documentNo).filter(Boolean),invoiceQuantity:allocated,remaining,status,matchBasis:explicitIds?.size?"DOCUMENT_RELATION+LINE_IDENTITY":"STRICT_CONTEXT+LINE_IDENTITY",lineIssueCount,lineResults,sourceSystem:"CANONICAL",issueDate:dispatch.issueDate});
  }
  resultRows.sort((a,b)=>text(b.issueDate).localeCompare(text(a.issueDate)));
  return{rows:resultRows,total:resultRows.length,summary:{dispatchWithoutInvoice:resultRows.filter(row=>row.status==="INVOICE_WAITING").length,invoiceWithoutDispatch:invoices.filter(invoice=>!usedInvoiceIds.has(invoice.id)).length,quantityDifference:resultRows.filter(row=>["PARTIAL","REVIEW_REQUIRED"].includes(row.status)).length,modelPending:resultRows.filter(row=>!row.modelName).length,completed:resultRows.filter(row=>row.status==="COMPLETED").length},readModel:"CANONICAL_LINE_ALLOCATED_DOCUMENTS",matchingPolicy:"EXPLICIT_RELATION_OR_STRICT_CONTEXT_PLUS_EXACT_LINE_IDENTITY"};
}


/** Read-only incoming dispatch monitor.
 * Incoming customer processing goods must never be confused with a supplier
 * purchase dispatch. Only an explicit, tenant-scoped invoice relation verifies
 * invoicing; the absence of a relation is NOT proof of no official invoice.
 */
export async function buildIncomingDispatchBilling(c:Context<AppEnv>){
  const slug=await assertAccountingScope(c);
  const records=(await c.env.DB.prepare(`
    SELECT d.id,d.document_no,d.issue_date,d.party_name,d.party_tax_no,
      d.party_company_id,d.created_at,c.company_type,c.type AS company_legacy_type
    FROM accounting_documents d
    LEFT JOIN companies c ON c.id=d.party_company_id AND c.main_company_slug=d.main_company_slug
      AND c.deleted_at IS NULL
    WHERE d.main_company_slug=? AND d.deleted_at IS NULL AND d.direction='INCOMING'
      AND (d.document_type LIKE '%IRSALIYE%' OR d.document_type LIKE '%DISPATCH%'
        OR d.document_type LIKE '%DESPATCH%')
    ORDER BY COALESCE(d.issue_date,d.created_at) DESC,d.created_at DESC LIMIT 2001
  `).bind(slug).all<Row>()).results||[];
  const truncated=records.length>2000,selected=records.slice(0,2000),ids=selected.map(row=>text(row.id));
  const relations:Row[]=[];
  for(let offset=0;offset<ids.length;offset+=150){
    const part=ids.slice(offset,offset+150),placeholders=part.map(()=>"?").join(",");
    const result=await c.env.DB.prepare(`
      SELECT r.document_id,r.related_document_id,r.relation_type,
        a.id AS a_id,a.document_no AS a_no,a.document_type AS a_type,
        a.direction AS a_direction,a.party_company_id AS a_party,a.party_tax_no AS a_tax,
        b.id AS b_id,b.document_no AS b_no,b.document_type AS b_type,
        b.direction AS b_direction,b.party_company_id AS b_party,b.party_tax_no AS b_tax
      FROM accounting_document_relations r
      JOIN accounting_documents a ON a.id=r.document_id AND a.main_company_slug=r.main_company_slug
        AND a.deleted_at IS NULL
      JOIN accounting_documents b ON b.id=r.related_document_id AND b.main_company_slug=r.main_company_slug
        AND b.deleted_at IS NULL
      WHERE r.main_company_slug=? AND r.relation_type IN ('INVOICE_OF','DESPATCH_OF','DISPATCH_OF')
      AND (r.document_id IN (${placeholders}) OR r.related_document_id IN (${placeholders}))
    `).bind(slug,...part,...part).all<Row>();
    relations.push(...(result.results||[]));
  }
  const byDocument=new Map<string,Row[]>();
  for(const relation of relations){
    for(const id of [text(relation.a_id),text(relation.b_id)]){
      if(!ids.includes(id))continue;
      if(!byDocument.has(id))byDocument.set(id,[]);
      byDocument.get(id)!.push(relation);
    }
  }
  const result=selected.map(doc=>{
    const role=upper(doc.company_type||doc.company_legacy_type);
    const group=role==="CUSTOMER"?"CUSTOMER":role==="SUPPLIER"?"SUPPLIER":
      role==="BOTH"?"BOTH":"UNCLASSIFIED";
    const expectedDirection=group==="CUSTOMER"?"OUTGOING":group==="SUPPLIER"?"INCOMING":"";
    const matches=(byDocument.get(text(doc.id))||[]).flatMap(r=>{
      const candidate=text(r.a_id)===text(doc.id)?
        {id:text(r.b_id),no:text(r.b_no),type:r.b_type,direction:r.b_direction,
          party:text(r.b_party),tax:text(r.b_tax)}:
        {id:text(r.a_id),no:text(r.a_no),type:r.a_type,direction:r.a_direction,
          party:text(r.a_party),tax:text(r.a_tax)};
      if(!isInvoice(candidate.type)||upper(candidate.direction)!==expectedDirection)return[];
      const sameCompany=text(doc.party_company_id)&&candidate.party===text(doc.party_company_id);
      const sameTax=text(doc.party_tax_no)&&candidate.tax===text(doc.party_tax_no);
      return sameCompany||sameTax?[{id:candidate.id,documentNo:candidate.no}]:[];
    });
    const unique=[...new Map(matches.map(invoice=>[invoice.id,invoice])).values()];
    const status=group==="UNCLASSIFIED"||group==="BOTH"?"ROLE_REVIEW":
      unique.length?"INVOICE_LINKED":"INVOICE_LINK_MISSING";
    return{id:text(doc.id),dispatchNo:text(doc.document_no),issueDate:text(doc.issue_date),
      companyName:text(doc.party_name),companyId:text(doc.party_company_id),
      companyType:group,status,invoiceIds:unique.map(v=>v.id),
      invoiceNumbers:unique.map(v=>v.documentNo).filter(Boolean)};
  });
  const totals={customerLinkMissing:result.filter(x=>x.companyType==="CUSTOMER"&&x.status==="INVOICE_LINK_MISSING").length,
    customerLinked:result.filter(x=>x.companyType==="CUSTOMER"&&x.status==="INVOICE_LINKED").length,
    supplier:result.filter(x=>x.companyType==="SUPPLIER").length,
    roleReview:result.filter(x=>x.status==="ROLE_REVIEW").length};
  return {rows:result,summary:totals,total:result.length,truncated,
    readModel:"READ_ONLY_EXPLICIT_RELATIONS",note:"Fatura bağı bulunmaması resmî faturanın kesilmediğini kanıtlamaz."};
}

function errorResponse(c:Context<AppEnv>,error:any){return c.json({ok:false,error:{code:text(error?.code)||"DISPATCH_CONTROL_FAILED",message:text(error?.message)||"İrsaliye/fatura kontrolü hazırlanamadı."}},Number(error?.status||500))}

/** Read-only incoming customer -> explicitly linked outgoing dispatch preview.
 * Absence of a relation is never official reconciliation. No reservation/write. */
async function partialDispatchPreview(c:Context<AppEnv>){
  const slug=await assertAccountingScope(c),id=text(c.req.param("id"));
  const doc=await c.env.DB.prepare(`SELECT d.id,d.document_no,d.party_company_id,d.party_tax_no,d.direction,d.document_type,c.company_type,c.type AS company_legacy_type
    FROM accounting_documents d JOIN companies c ON c.id=d.party_company_id AND c.main_company_slug=d.main_company_slug AND c.deleted_at IS NULL
    WHERE d.id=? AND d.main_company_slug=? AND d.deleted_at IS NULL`).bind(id,slug).first<Row>();
  if(!doc||upper(doc.direction)!=="INCOMING"||!isDispatch(doc.document_type)||upper(doc.company_type||doc.company_legacy_type)!=="CUSTOMER")
    throw Object.assign(new Error("Doğrulanmış müşteri gelen irsaliyesi bulunamadı."),{status:404,code:"CUSTOMER_DISPATCH_REQUIRED"});
  const readLines=async (docId:string)=>(await c.env.DB.prepare(`SELECT * FROM accounting_document_lines WHERE main_company_slug=? AND document_id=? ORDER BY line_no`).bind(slug,docId).all<Row>()).results||[];
  const linked=async (docId:string)=>(await c.env.DB.prepare(`SELECT DISTINCT d.id,d.document_no,d.direction,d.document_type,d.party_company_id,d.party_tax_no
    FROM accounting_document_relations r JOIN accounting_documents d ON d.main_company_slug=r.main_company_slug AND d.deleted_at IS NULL AND d.id=CASE WHEN r.document_id=? THEN r.related_document_id ELSE r.document_id END
    WHERE r.main_company_slug=? AND (r.document_id=? OR r.related_document_id=?) AND r.relation_type IN ('INVOICE_OF','DESPATCH_OF','DISPATCH_OF')`).bind(docId,slug,docId,docId).all<Row>()).results||[];
  const original=await readLines(id),related=await linked(id),warnings:string[]=[];
  const key=(l:Row)=>{const k=canonicalLineKey(l),u=canonicalUnit(l.unit_code);return k&&u?k+"|"+u:"";};
  const used=new Map<string,number>(),keys=new Set<string>();let blocked=!original.length;
  for(const line of original){const k=key(line);if(!k||keys.has(k)||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0){blocked=true;}keys.add(k);}
  if(blocked)warnings.push("Kaynak kalem kimliği, birimi veya miktarı belirsiz; satır eşleştirmesi gerekli.");
  const dispatches=related.filter(d=>upper(d.direction)==="OUTGOING"&&isDispatch(d.document_type));
  if(related.some(d=>isInvoice(d.document_type))){blocked=true;warnings.push("Doğrudan fatura bağlantısı var; önce sevk/fatura ilişkileri mutabakatı gerekli.");}
  const sameParty=(d:Row)=>text(d.party_company_id)===text(doc.party_company_id)&&(!text(d.party_tax_no)||!text(doc.party_tax_no)||text(d.party_tax_no)===text(doc.party_tax_no));
  for(const d of dispatches){
    if(!sameParty(d)){blocked=true;warnings.push("Farklı cari bağlı sevk bulundu.");continue;}
    const peers=await linked(text(d.id));
    const sources=peers.filter(p=>upper(p.direction)==="INCOMING"&&isDispatch(p.document_type));
    if(sources.length!==1||text(sources[0].id)!==id){blocked=true;warnings.push("Birden fazla kaynak irsaliye bağlantısı; kalem tahsisi gerekli.");continue;}
    const child=await readLines(text(d.id));
    if(!child.length){blocked=true;warnings.push("Bağlı sevk kalemleri eksik.");}
    for(const l of child){const k=key(l),qty=Number(l.quantity);if(!k||!keys.has(k)||!Number.isFinite(qty)||qty<=0){blocked=true;warnings.push("Bağlı sevk kalem eşleşmesi eksik.");continue;}used.set(k,(used.get(k)||0)+qty);}
  }
  const lines=original.map(l=>{const quantity=num(l.quantity),linkedQuantity=used.get(key(l))||0;if(linkedQuantity>quantity){blocked=true;warnings.push("Bağlı sevk miktarı kaynak miktarı aşıyor.");}return{id:text(l.id),description:text(l.description)||text(l.product_code)||"Kalem",unit:canonicalUnit(l.unit_code),quantity,linked:linkedQuantity,remaining:Math.max(0,Number((quantity-linkedQuantity).toFixed(6)))};});
  return{sourceId:id,sourceNo:text(doc.document_no),lines,blocked,warnings:[...new Set(warnings)],officialReconciled:false,readOnly:true};
}

export function registerCanonicalDispatchControlRoutes(app:Hono<AppEnv>){
  app.get("/api/muhasebe/incoming-dispatches/:id/partial-preview",async c=>{
    try{const data=await partialDispatchPreview(c);return c.json({ok:true,success:true,data});}catch(error:any){return errorResponse(c,error);}
  });
  app.get("/api/muhasebe/incoming-dispatches/billing",async c=>{
    try{const data=await buildIncomingDispatchBilling(c);return c.json({ok:true,success:true,data});}
    catch(error:any){return errorResponse(c,error);}
  });
  app.get("/api/muhasebe/customer-dispatches/summary",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data:data.summary,readModel:data.readModel,matchingPolicy:data.matchingPolicy})}catch(error:any){return errorResponse(c,error)}});app.get("/api/muhasebe/customer-dispatches",async c=>{try{const data=await build(c);return c.json({ok:true,success:true,data})}catch(error:any){return errorResponse(c,error)}});}
