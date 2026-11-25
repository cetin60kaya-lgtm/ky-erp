// Tenant-scoped read-only model, product and outgoing invoice line search.
// No provider calls or creation of production records.
import type {Context} from "hono";
import {classifyFree} from "./isnet-provider-source.ts";
type Row=Record<string,any>;
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
const clean=(v:unknown)=>String(v??"").trim();
const specs=[
 {prefix:"MODEL:",unit:"'ADET'",from:"model_records m",scope:"m.main_company_slug=? AND m.deleted_at IS NULL",expr:"m.model_name"},
 {prefix:"PRODUCT:",unit:"m.unit",from:"products m",scope:"m.main_company_slug=?",expr:"m.name"},
 {prefix:"HISTORY:",unit:"m.unit_code",from:"accounting_document_lines m JOIN accounting_documents d ON d.id=m.document_id AND d.main_company_slug=m.main_company_slug",scope:"m.main_company_slug=? AND d.deleted_at IS NULL AND d.direction='OUTGOING' AND (d.document_type LIKE '%FATURA%' OR d.document_type LIKE '%INVOICE%' OR d.document_type LIKE '%ARSIV%')",expr:"m.description"}
] as const;
const view=(prefix:string,row:Row)=>({id:prefix+clean(row.id),description:clean(row.description),unit:clean(row.unit)||"ADET",freeKind:classifyFree(clean(row.description)),origin:prefix.slice(0,-1)});
export function uniqueRegisteredItems(rows:Row[]){
 const seen=new Set<string>();return rows.filter(v=>{const key=v.description.toLocaleUpperCase("tr-TR").normalize("NFC")+"|"+(["C62","AD","ADET"].includes(v.unit)?"ADET":v.unit);if(!v.description||seen.has(key))return false;seen.add(key);return true;}).slice(0,50);
}
export async function searchRegisteredItems(c:Context<Env>,slug:string,query:string){
 const q=clean(query).slice(0,100);if(q.length<2)return [];
 const rows=await Promise.all(specs.map(async s=>{
 const rs=await c.env.DB.prepare("SELECT m.id AS id,"+s.expr+" AS description,"+s.unit+" AS unit FROM "+s.from+" WHERE "+s.scope+" AND instr(upper("+s.expr+"),upper(?))>0 ORDER BY CASE WHEN instr(upper("+s.expr+"),upper(?))=1 THEN 0 ELSE 1 END,"+s.expr+",m.id LIMIT 25").bind(slug,q,q).all<Row>();return (rs.results||[]).map(row=>view(s.prefix,row));
 }));
 return uniqueRegisteredItems(rows.flat());
}
export async function resolveRegisteredItems(c:Context<Env>,slug:string,state:Row,a:Row){
 if(!["SAVE_DISPATCH","SAVE_INVOICE"].includes(a.kind))return [];
 const old=state.drafts.find((d:Row)=>d.id===a.id);
 if(old?.providerSource||old?.dispatchId||(!old&&(a.sourceRef||a.dispatchId))||((old?.source||a.source)==="DEMO_INCOMING"&&a.kind==="SAVE_DISPATCH"))return [];
 const ids=[...new Set<string>((Array.isArray(a.lines)?a.lines:[]).map((l:Row)=>clean(l.productId)).filter((id:string)=>specs.some(s=>id.startsWith(s.prefix))))];
 if(ids.length>50)throw Error("Ürün kalemi sınırı.");
 return Promise.all(ids.map(async id=>{const s=specs.find(s=>id.startsWith(s.prefix))!;const row=await c.env.DB.prepare("SELECT m.id AS id,"+s.expr+" AS description,"+s.unit+" AS unit FROM "+s.from+" WHERE "+s.scope+" AND m.id=? LIMIT 1").bind(slug,id.slice(s.prefix.length)).first<Row>();if(!row||!clean(row.description))throw Error("Model veya ürün mevcut firmada bulunamadı.");return view(s.prefix,row);}));
}
