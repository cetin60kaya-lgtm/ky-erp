// Customer-specific commercial history; exact persisted identities, never description similarity.
import type {Context} from "hono";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const customer="COALESCE(NULLIF(m.company_id,''),NULLIF(m.customer_id,''),'')";
const invoice=`d.direction='OUTGOING' AND d.deleted_at IS NULL AND COALESCE(d.record_scope,'OFFICIAL')='OFFICIAL'
 AND (d.document_type LIKE '%FATURA%' OR d.document_type LIKE '%INVOICE%' OR d.document_type LIKE '%ARSIV%')
 AND d.xml_file_asset_id IS NOT NULL AND CASE WHEN json_valid(d.raw_metadata) THEN json_extract(d.raw_metadata,'$.ublVerified') ELSE 0 END=1
 AND UPPER(COALESCE(d.status,'')) NOT IN ('CANCELLED','CANCELED','REJECTED','IPTAL','REDDEDILDI')
 AND COALESCE(d.document_no,'')<>'' AND date(d.issue_date) IS NOT NULL`;
export const priceBase=`SELECT d.id AS documentId,d.document_no AS documentNo,substr(d.issue_date,1,10) AS issueDate,d.currency,l.id AS lineId,l.description,l.quantity,l.unit_code AS unit,l.unit_price AS unitPrice,l.discount_total AS discountTotal,l.tax_rate AS taxRate,l.line_total AS lineTotal
 FROM accounting_documents d JOIN accounting_document_lines l ON l.main_company_slug=d.main_company_slug AND l.document_id=d.id
 WHERE d.main_company_slug=? AND d.party_company_id=? AND ${invoice}
 AND date(d.issue_date)<=date(?) AND l.unit_price>0 AND l.unit_price<=9999999.9999 AND l.quantity>0 AND COALESCE(l.unit_code,'')<>'' AND COALESCE(d.currency,'')<>''`;
const rawModel=`COALESCE(json_extract(CASE WHEN json_valid(l.raw_metadata) THEN l.raw_metadata ELSE '{}' END,'$.modelId'),json_extract(CASE WHEN json_valid(l.raw_metadata) THEN l.raw_metadata ELSE '{}' END,'$.model_id'),json_extract(CASE WHEN json_valid(l.raw_metadata) THEN l.raw_metadata ELSE '{}' END,'$.modelRecordId'))`;
export function modelPricePredicate(hasLinks:boolean){
 if(!hasLinks)return rawModel+"=?";
 return `((EXISTS(SELECT 1 FROM accounting_document_model_links x WHERE x.main_company_slug=l.main_company_slug AND x.document_id=l.document_id AND x.document_line_id=l.id AND x.model_id=?)
 AND (SELECT COUNT(DISTINCT x.model_id) FROM accounting_document_model_links x WHERE x.main_company_slug=l.main_company_slug AND x.document_id=l.document_id AND x.document_line_id=l.id)=1)
 OR (NOT EXISTS(SELECT 1 FROM accounting_document_model_links x WHERE x.main_company_slug=l.main_company_slug AND x.document_id=l.document_id AND x.document_line_id=l.id) AND ${rawModel}=?))`;
}
export const priceOrder=" ORDER BY date(d.issue_date) DESC,d.document_no DESC,l.line_no DESC,l.id LIMIT 101";
export async function searchOperatorItems(c:Context<Env>,tenant:string,partyId:string,q:string){
 q=clean(q).slice(0,100);if(q.length<2)return [];
 const [m,p,h]=await Promise.all([
 c.env.DB.prepare(`SELECT m.id,m.model_name AS description,m.model_code AS modelCode,${customer} AS companyId,m.status,'ADET' AS unit FROM model_records m WHERE m.main_company_slug=? AND m.deleted_at IS NULL AND (${customer}='' OR ${customer}=?) AND (instr(upper(COALESCE(m.model_name,'')),upper(?))>0 OR instr(upper(COALESCE(m.model_code,'')),upper(?))>0) ORDER BY m.model_name,m.model_code,m.id LIMIT 30`).bind(tenant,partyId,q,q).all<Row>(),
 c.env.DB.prepare("SELECT id,name AS description,unit FROM products WHERE main_company_slug=? AND instr(upper(name),upper(?))>0 ORDER BY name,id LIMIT 20").bind(tenant,q).all<Row>(),
 partyId?c.env.DB.prepare(`SELECT l.id,l.description,l.unit_code AS unit,d.document_no AS documentNo FROM accounting_document_lines l JOIN accounting_documents d ON d.id=l.document_id AND d.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND d.party_company_id=? AND ${invoice} AND instr(upper(COALESCE(l.description,'')||' '||COALESCE(l.product_code,'')),upper(?))>0 ORDER BY d.issue_date DESC,l.id LIMIT 20`).bind(tenant,partyId,q).all<Row>():Promise.resolve({results:[]})
 ]);
 return ([["MODEL",m.results||[]],["PRODUCT",p.results||[]],["HISTORY",h.results||[]]] as [string,Row[]][]).flatMap(([origin,rows])=>rows.filter(row=>clean(row.description)).map(row=>({...row,id:origin+":"+row.id,origin,unit:clean(row.unit)||"ADET"})));
}
export async function getCommercialHistory(c:Context<Env>,tenant:string,partyId:string,catalogId:string,asOf:string,referenceModelId:string){
 const colon=catalogId.indexOf(":"),origin=catalogId.slice(0,colon),id=catalogId.slice(colon+1);
 if(!["MODEL","PRODUCT","HISTORY"].includes(origin)||!id||id.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+"T00:00:00Z"))||new Date(asOf+"T00:00:00Z").toISOString().slice(0,10)!==asOf||referenceModelId.length>100)throw Error("Geçersiz model/ürün geçmişi isteği.");
 let item:Row|null=null,repeats:Row[]=[],referenceId=id,predicate="",params:string[]=[];
 if(origin==="MODEL"){
  item=await c.env.DB.prepare(`SELECT m.id,m.model_name AS description,m.model_code AS modelCode,${customer} AS companyId,m.status FROM model_records m WHERE m.main_company_slug=? AND m.id=? AND m.deleted_at IS NULL`).bind(tenant,id).first<Row>();
  if(!item||item.companyId!==partyId)throw Error("Modelin kayıtlı müşteri kimliği seçili cari ile doğrulanamadı.");
  if(clean(item.modelCode)){
   repeats=(await c.env.DB.prepare(`SELECT m.id,m.model_name AS description,m.model_code AS modelCode,m.status FROM model_records m WHERE m.main_company_slug=? AND m.deleted_at IS NULL AND ${customer}=? AND m.id<>? AND m.model_code=? COLLATE NOCASE ORDER BY m.id LIMIT 50`).bind(tenant,partyId,id,item.modelCode).all<Row>()).results||[];
  }
  if(referenceModelId){if(!repeats.some(x=>x.id===referenceModelId))throw Error("Repet adayı aynı cari ve model koduyla doğrulanamadı.");referenceId=referenceModelId;}
  const schema=(await c.env.DB.prepare("PRAGMA table_info('accounting_document_model_links')").all<Row>()).results||[];
  const hasLinks=["main_company_slug","document_id","document_line_id","model_id"].every(n=>schema.some(x=>x.name===n));
  predicate=modelPricePredicate(hasLinks);params=hasLinks?[referenceId,referenceId]:[referenceId];
 }else if(origin==="PRODUCT"){
  if(referenceModelId)throw Error("Ürün için model referansı kullanılamaz.");
  item=await c.env.DB.prepare("SELECT id,name AS description,unit FROM products WHERE main_company_slug=? AND id=?").bind(tenant,id).first<Row>();
  predicate="l.product_id=? AND l.match_status='MANUAL'";params=[id];
 }else{
  if(referenceModelId)throw Error("Geçmiş kalem için model referansı kullanılamaz.");
  item=await c.env.DB.prepare(`SELECT l.id,l.description FROM accounting_document_lines l JOIN accounting_documents d ON d.main_company_slug=l.main_company_slug AND d.id=l.document_id WHERE l.main_company_slug=? AND d.party_company_id=? AND l.id=? AND ${invoice}`).bind(tenant,partyId,id).first<Row>();
  predicate="l.id=?";params=[id];
 }
 if(!item)throw Error("Kayıtlı model/ürün/kalem bulunamadı.");
 const rows=(await c.env.DB.prepare(priceBase+" AND "+predicate+priceOrder).bind(tenant,partyId,asOf,...params).all<Row>()).results||[];
 return {catalogId,partyId,asOf,referenceModelId:referenceId,item,repeats,items:rows.slice(0,100),truncated:rows.length>100,source:origin==="MODEL"?"EXACT_MODEL_LINE":origin==="PRODUCT"?"MANUAL_PRODUCT_MATCH":"EXACT_HISTORICAL_LINE",providerAcceptanceVerified:false};
}
