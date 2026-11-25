// @ts-nocheck
import {parseSoapXml,searchSoapTest} from "./isnet-soap-read.ts";
const C="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",A="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",D="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2";
const kids=(n,ns,k)=>n?.children?.filter(x=>x.uri===ns&&x.local===k)||[];
const child=(n,ns,k)=>{const a=kids(n,ns,k);if(a.length>1)throw Error("SOURCE_AMBIGUOUS");return a[0];};
const val=(n,k)=>child(n,C,k)?.text.trim()||"";
const notes=n=>kids(n,C,"Note").map(x=>{if(x.children.length)throw Error("SOURCE_NOTE_COMPLEX");return x.text;});
export const acceptedSource=m=>["Alici_Kabul_Etti","Otomatik_Alici_Kabul_Etti"].includes(m.status)||(["Onaylandi","Otomatik_Onaylandi","Gonderildi","Gibe_Iletildi"].includes(m.status)&&m.detailStatus==="Basariyla_Tamamlandi");
export const freeReason="Ürünler elden bedelsiz teslim edilmiştir.";
export function classifyFree(description){
 const v=String(description||"").toLocaleUpperCase("tr-TR").replace(/İ/g,"I").replace(/Ş/g,"S").replace(/Ü/g,"U").replace(/Ğ/g,"G").replace(/Ç/g,"C").replace(/Ö/g,"O").trim();
 return /(^|[^A-Z0-9])KUMAS SAKAT(?:I|LARI)?($|[^A-Z0-9])/.test(v)?"KUMAS_SAKATI":/(^|[^A-Z0-9])BASKI SAKAT(?:I|LARI)?($|[^A-Z0-9])/.test(v)?"BASKI_SAKATI":/(^|[^A-Z0-9])TEST NUMUNE(?:SI|LERI)?($|[^A-Z0-9])/.test(v)||v==="TEST"?"TEST_NUMUNESI":"";
}
export function extractSource(xml,meta,q,hash){
 const root=parseSoapXml(xml);if(root.uri!==D||root.local!=="DespatchAdvice"||val(root,"UUID").toLowerCase()!==q.ettn.toLowerCase()||val(root,"ID")!==meta.number)throw Error("SOURCE_IDENTITY");
 if(!acceptedSource(meta))throw Error("SOURCE_STATUS_NOT_ACCEPTED");
 const supplier=child(child(root,A,"DespatchSupplierParty"),A,"Party"),customer=child(child(root,A,"DeliveryCustomerParty"),A,"Party"),own=q.direction==="INCOMING"?customer:supplier,other=q.direction==="INCOMING"?supplier:customer;
 if(!kids(own,A,"PartyIdentification").some(n=>{const id=child(n,C,"ID");return id?.text.trim()===q.companyTaxCode&&["VKN","TCKN"].includes(id.attrs.schemeID);}))throw Error("SOURCE_COMPANY_MISMATCH");
 const partyName=val(child(other,A,"PartyName"),"Name")||val(child(other,A,"PartyLegalEntity"),"RegistrationName");
 if(!partyName||partyName.length>500)throw Error("SOURCE_PARTY_MISSING");
 const lines=kids(root,A,"DespatchLine").map(n=>{const id=val(n,"ID"),qty=child(n,C,"DeliveredQuantity"),quantity=Number(qty?.text),unit=qty?.attrs.unitCode,item=child(n,A,"Item"),description=val(item,"Name")||val(item,"Description");if(!id||!description||description.length>250||!unit||unit.length>20||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Number(quantity.toFixed(6))!==quantity)throw Error("SOURCE_LINE_INVALID");return{id,description,quantity,unit,notes:notes(n),freeKind:classifyFree(description)};});
 if(!lines.length||lines.length>50||new Set(lines.map(l=>l.id)).size!==lines.length)throw Error("SOURCE_LINES_INVALID");
 const result={key:hash+":"+q.direction+":"+q.ettn.toLowerCase(),ettn:q.ettn,number:meta.number,direction:q.direction,status:meta.status,partyName,notes:notes(root),lines};
 if(new TextEncoder().encode(JSON.stringify(result)).length>40000)throw Error("SOURCE_LIMIT_NO_TRUNCATION");return result;
}
export async function fetchSource(q,hash,fetcher=fetch){
 if(!["INCOMING","OUTGOING"].includes(q.direction)||!q.ettn)throw Error("SOURCE_QUERY_INVALID");
 const r=await searchSoapTest({...q,kind:"DISPATCH",page:1,file:"XML"},fetcher);if(r.rows.length!==1||!r.file?.base64)throw Error("SOURCE_NOT_FOUND");
 return extractSource(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(r.file.base64),c=>c.charCodeAt(0))),r.rows[0],q,hash);
}
export function remainingLines(source,drafts,exclude=""){
 return source.lines.map(l=>({...l,remaining:Math.max(0,Number((l.quantity-drafts.filter(d=>d.id!==exclude&&d.status==="DRAFT"&&d.providerSource?.key===source.key&&d.type===(source.direction==="INCOMING"?"DISPATCH":"INVOICE")).flatMap(d=>d.lines||[]).filter(x=>x.sourceLineId===l.id).reduce((n,x)=>n+Number(x.quantity),0)).toFixed(6)))}));
}
