// WSDL-pinned read-only final status verification. No automatic resend.
import {buildVerifiedTestReadRequest,parseSoapXml} from "./isnet-soap-read.ts";
type Kind="E_FATURA"|"E_IRSALIYE";
type Query={kind:Kind;companyTaxCode:string;from:string;to:string;ettn:string;documentNo:string};
type Node={uri:string;local:string;text:string;children:Node[]};
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,number=/^[A-Z0-9]{3}[0-9]{13}$/;
const one=(n:Node,uri:string,local:string):Node=>{const a=n.children.filter(c=>c.uri===uri&&c.local===local);if(a.length!==1)throw Error("STATUS_RESPONSE_FIELD");return a[0];};
const scalar=(n:Node,k:string)=>{const x=one(n,M,k);if(x.children.length)throw Error("STATUS_RESPONSE_SCALAR");return x.text.trim();};
export type StatusEvidence={state:"FINAL"|"VALIDATION_ERROR"|"PENDING_OR_REVIEW"|"UNKNOWN_REVIEW_REQUIRED";detailStatus?:string;providerStatus?:string;code?:number;responseEvidenceSha256?:string};
export async function parseVerifiedTestFinalStatus(xml:string,q:Query):Promise<StatusEvidence>{
 const unknown:StatusEvidence={state:"UNKNOWN_REVIEW_REQUIRED"};
 if(!uuid.test(q.ettn)||!number.test(q.documentNo)||!["E_FATURA","E_IRSALIYE"].includes(q.kind)||xml.length>4000000)return unknown;
 try{
  const inv=q.kind==="E_FATURA",op=inv?"SearchInvoice":"SearchDespatchAdvice",root:Node=parseSoapXml(xml);
  if(root.uri!==S||root.local!=="Envelope")return unknown;
  const body=one(root,S,"Body");if(body.children.length!==1)return unknown;
  const result=one(one(body,T,op+"Response"),T,op+"Result");
  if(scalar(result,"Result")!=="Success")return unknown;
  const list=one(result,M,inv?"Invoices":"DespatchAdvices"),paging=one(result,M,"PagingResponse");
  if(list.children.length!==1||["PageNumber","RecordsPerPage","TotalNumberOfPages","TotalNumberOfRecords"].some(k=>scalar(paging,k)!=="1"))return unknown;
  const row=one(list,M,inv?"Invoice":"DespatchAdvice");
  if(scalar(row,"ETTN").toLowerCase()!==q.ettn.toLowerCase()||scalar(row,inv?"InvoiceNumber":"DespatchAdviceNumber")!==q.documentNo)return unknown;
  const detailStatus=scalar(row,"DetailStatus"),providerStatus=scalar(row,"Status");
  // DetailStatus is the WSDL InvoiceDetailStatus enum, not InvoiceStatus.
  const code=({Basariyla_Tamamlandi:1300,Schematron_Kontrol_Sonucu_Hatali:1150,Xml_Sema_Kontrolundan_Gecemedi:1160} as Record<string,number>)[detailStatus];
  const responseEvidenceSha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(xml))),v=>v.toString(16).padStart(2,"0")).join("");
  // Contradictory technical result is held for review; business acceptance/rejection is separate.
  const contradictory=["Gib_Tarafinda_Hata_Olustu","Sistem_Hatasi","Onay_Bekliyor","Imza_Bekliyor","Reddedildi"].includes(providerStatus);
  const state=code===1300&&!contradictory?"FINAL":code===1150||code===1160?"VALIDATION_ERROR":"PENDING_OR_REVIEW";
  return {state,detailStatus,providerStatus,code,responseEvidenceSha256};
 }catch{return unknown;}
}
/** Server must supply the already accepted TEST draft identity and verified company. No route or user-supplied endpoint. */
export async function queryVerifiedTestFinalStatus(q:Query,fetcher:typeof fetch=fetch):Promise<StatusEvidence>{
 const unknown:StatusEvidence={state:"UNKNOWN_REVIEW_REQUIRED"};
 try{
  if(!uuid.test(q.ettn)||!number.test(q.documentNo)||!["E_FATURA","E_IRSALIYE"].includes(q.kind))return unknown;
  const req=buildVerifiedTestReadRequest({kind:q.kind==="E_FATURA"?"INVOICE":"DISPATCH",direction:"OUTGOING",companyTaxCode:q.companyTaxCode,from:q.from,to:q.to,ettn:q.ettn,page:1,file:""});
  const response=await fetcher(req.endpoint,{method:"POST",headers:req.headers,body:req.body,redirect:"manual",signal:AbortSignal.timeout(25000)});
  if(!response.ok||!response.body)return unknown;
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,xml="";
  try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>4000000){await reader.cancel();return unknown;}xml+=decoder.decode(r.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
  return await parseVerifiedTestFinalStatus(xml,q);
 }catch{return unknown;}
}
