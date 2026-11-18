// Read-only canonical model-line accounting: no guessed allocation of a shared document line.
type Row = Record<string, any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const number=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const normalize=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
export function model360Unit(v:unknown){
 const value=normalize(v).replace(/[^A-Z0-9]/g,"");
 return ["C62","AD","ADET","PCS","PCE"].includes(value)?"ADET":value;
}
export function model360Kind(type:unknown,direction:unknown){
 const t=normalize(type),d=normalize(direction);
 if(/IRSALIYE|DISPATCH|DESPATCH/.test(t))return d==="INCOMING"?"RECEIVED":d==="OUTGOING"?"SHIPPED":"OTHER";
 if(/FATURA|INVOICE|ARSIV/.test(t))return d==="OUTGOING"?"INVOICED":"OTHER";
 return "OTHER";
}
export function model360CanonicalLineAudit(rows:Row[],modelCompanyId="",truncated=false){
 const seen=new Set<string>(),items:Row[]=[];
 const totals={received:null as number|null,shipped:null as number|null,invoiced:null as number|null};
 const count={verified:0,review:0,documents:new Set<string>()};
 for(const row of rows){
  const docId=text(row.document_id),lineId=text(row.line_id);
  const key=docId+":"+lineId;
  if(!docId||seen.has(key))continue;
  seen.add(key);count.documents.add(docId);
  const kind=model360Kind(row.document_type,row.direction);
  const qty=number(row.quantity),unit=model360Unit(row.unit_code);
  const company=text(row.party_company_id),modelCompany=text(modelCompanyId);
  let status="VERIFIED_LINE";
  if(modelCompany&&!company)status="COMPANY_UNVERIFIED";
  else if(modelCompany&&company!==modelCompany)status="COMPANY_CONFLICT";
  else if(!lineId)status="DOCUMENT_ONLY_REVIEW";
  else if(Number(row.link_count||0)!==1)status="MULTI_MODEL_LINE_REVIEW";
  else if(kind==="OTHER")status="DOCUMENT_KIND_REVIEW";
  else if(qty===null||qty<0)status="QUANTITY_REVIEW";
  else if(unit!=="ADET")status="UNIT_REVIEW";
  const item={documentId:docId,documentNo:text(row.document_no),lineId,
    description:text(row.description),quantity:qty,unit,kind,status,modelId:text(row.model_id)};
  items.push(item);
  if(status==="VERIFIED_LINE"){
   count.verified+=1;
   const field=kind==="RECEIVED"?"received":kind==="SHIPPED"?"shipped":"invoiced";
   totals[field]=(totals[field]??0)+(qty??0);
  }else count.review+=1;
 }
 return{status:truncated?"TRUNCATED":count.review?"REVIEW_REQUIRED":count.verified?"VERIFIED":"NO_LINKED_LINES",
  totals:truncated?{received:null,shipped:null,invoiced:null}:totals,verifiedLineCount:count.verified,reviewLineCount:count.review,
  linkedDocumentCount:count.documents.size,items,truncated};
}
