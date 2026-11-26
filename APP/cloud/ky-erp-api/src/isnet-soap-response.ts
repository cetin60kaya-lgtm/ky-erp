// Source: InvoiceService singleWsdl SHA256 d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e.
// Provider submission acknowledgement is NOT a GIB final status.
import {parseSoapXml} from "./isnet-soap-read.ts";
import type {ProviderResult} from "./isnet-official-acceptance.ts";
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const NUMBER=/^[A-Z0-9]{3}[0-9]{13}$/;
type Node={local:string;uri:string;text:string;children:Node[]};
const one=(n:Node,uri:string,local:string):Node=>{
 const matches=n.children.filter(c=>c.uri===uri&&c.local===local);
 if(matches.length!==1)throw Error("ISNET_RESPONSE_FIELD");
 return matches[0];
};
const scalar=(n:Node,uri:string,local:string)=>{
 const value=one(n,uri,local);
 if(value.children.length)throw Error("ISNET_RESPONSE_SCALAR");
 return value.text.trim();
};
export async function parseVerifiedTestSendResponse(xml:string,kind:"E_FATURA"|"E_IRSALIYE",expectedEttn:string):Promise<ProviderResult>{
 const unknown:ProviderResult={transport:"RESPONSE"};
 if(!UUID.test(expectedEttn)||!["E_FATURA","E_IRSALIYE"].includes(kind)||xml.length>4000000)return unknown;
 try{
  const invoice=kind==="E_FATURA",op=invoice?"SendInvoiceXml":"SendDespatchAdviceXml";
  const root:Node=parseSoapXml(xml);
  if(root.local!=="Envelope"||root.uri!==S)return unknown;
  const body=one(root,S,"Body");if(body.children.length!==1)return unknown;
  const result=one(one(body,T,op+"Response"),T,op+"Result");
  // Failed is not necessarily proof that nothing was created. Never retry based on this alone.
  if(scalar(result,M,"Result")!=="Success")return unknown;
  const list=one(result,M,invoice?"Invoices":"DespatchAdvices");
  if(list.children.length!==1)return unknown;
  const item=one(list,M,invoice?"InvoiceReturn":"DespatchAdviceReturn");
  const ettn=scalar(item,M,"Ettn"),documentNo=scalar(item,M,invoice?"InvoiceNumber":"DespatchAdviceNumber");
  if(!UUID.test(ettn)||ettn.toLowerCase()!==expectedEttn.toLowerCase()||!NUMBER.test(documentNo))return unknown;
  const responseEvidenceSha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(xml))),v=>v.toString(16).padStart(2,"0")).join("");
  // WSDL returns no receipt ID. This hash is internal evidence, not a provider receipt.
  return {transport:"RESPONSE",explicitAcceptance:true,ettn,documentNo,responseEvidenceSha256};
 }catch{return unknown;}
}
