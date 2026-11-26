// TEST transport primitives; no public route, no live endpoint, no caller-supplied binding.
// Exact QNames, action and SOAP version MUST come from reviewed WSDL, not the PDF or UI.
// @ts-nocheck
import { requireApprovedSend, classifySendResult } from "./isnet-official-acceptance.ts";
import {parseVerifiedTestSendResponse} from "./isnet-soap-response.ts";
import {requireVerifiedTestUblIdentity} from "./isnet-test-ubl-identity.ts";

// Exact SOAP 1.1 HTTPS binding from user-supplied InvoiceService singleWsdl,
// SHA-256 d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e.
// Verified contract structure only, NOT provider write authorization.
export const ISNET_SEND_WSDL_SHA256="d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e";
const SERVICE_NS="http://tempuri.org/";
const MODEL_NS="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
export function verifiedTestSendBinding(kind){
 const invoice=kind==="E_FATURA";
 if(!invoice&&kind!=="E_IRSALIYE")throw Error("SOAP_KIND_UNSUPPORTED");
 const operation=invoice?"SendInvoiceXml":"SendDespatchAdviceXml";
 const q=(local,ns=MODEL_NS)=>Object.freeze({local,ns});
 return Object.freeze({environment:"TEST",verified:true,contractHash:ISNET_SEND_WSDL_SHA256,endpoint:"https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc",operation,soapVersion:"1.1",action:SERVICE_NS+"IInvoiceService/"+operation,operationElement:q(operation,SERVICE_NS),requestElement:q("request",SERVICE_NS),listElement:q(invoice?"Invoices":"DespatchAdvices"),itemElement:q(invoice?"InvoiceXml":"DespatchAdviceXml"),contentElement:q(invoice?"InvoiceContent":"DespatchAdviceContent"),receiverElement:q("ReceiverTag")});
}

export function buildEnvelope(binding,xmlBase64,receiverTag,kind){
 const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
 const expected=kind==="E_FATURA"?{op:"SendInvoiceXml",list:"Invoices",item:"InvoiceXml",content:"InvoiceContent"}:kind==="E_IRSALIYE"?{op:"SendDespatchAdviceXml",list:"DespatchAdvices",item:"DespatchAdviceXml",content:"DespatchAdviceContent"}:null;
 if(!expected||binding.environment!=="TEST"||binding.verified!==true||!binding.contractHash||!/^([0-9a-f]{64})$/i.test(binding.contractHash))throw Error("SOAP_BINDING_UNVERIFIED");
 if(binding.endpoint!=="https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc"||binding.operation!==expected.op)throw Error("SOAP_ENDPOINT_OR_OPERATION_INVALID");
 if(!["1.1","1.2"].includes(binding.soapVersion)||!/^https?:\/\/[^\s"<>]+$/.test(binding.action))throw Error("SOAP_ACTION_INVALID");
 if(!receiverTag||String(receiverTag).length>500||!/^[A-Za-z0-9+/]+={0,2}$/.test(xmlBase64)||xmlBase64.length%4!==0||xmlBase64.length>14000000)throw Error("SOAP_PAYLOAD_INVALID");
 const spec=[binding.operationElement,binding.requestElement,binding.listElement,binding.itemElement,binding.receiverElement,binding.contentElement];
 const names=[binding.operation,null,expected.list,null,"ReceiverTag",expected.content];
 for(let i=0;i<spec.length;i++){const q=spec[i];if(!q||!/^[A-Za-z_][\w.-]*$/.test(q.local)||typeof q.ns!=="string"||q.ns.length>500||(!q.ns&&i===0))throw Error("SOAP_QNAME_INVALID");if(names[i]&&q.local!==names[i])throw Error("SOAP_QNAME_MISMATCH");}
 if(spec[3].local!==expected.item)throw Error("SOAP_ITEM_INVALID");
 const tag=(q,inside)=>q.ns?`<${q.local} xmlns="${esc(q.ns)}">${inside}</${q.local}>`:`<${q.local} xmlns="">${inside}</${q.local}>`;
 const ns=binding.soapVersion==="1.1"?"http://schemas.xmlsoap.org/soap/envelope/":"http://www.w3.org/2003/05/soap-envelope";
 const payload=tag(spec[0],tag(spec[1],tag(spec[2],tag(spec[3],tag(spec[5],xmlBase64)+tag(spec[4],esc(receiverTag))))));
 return {endpoint:binding.endpoint,headers:binding.soapVersion==="1.1"?{"Content-Type":"text/xml; charset=utf-8","SOAPAction":`"${binding.action}"`}:{"Content-Type":`application/soap+xml; charset=utf-8; action="${binding.action}"`},body:`<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="${ns}"><s:Body>${payload}</s:Body></s:Envelope>`};
}

/** Server-owned dependencies only. Claim must be an atomic persistent CAS, not an in-memory lock. */
export async function submitVerifiedSoapTest({profile,draft,approval,binding,validatedXml,claim,settle,parseResult,fetcher=fetch}){
 if(draft.environment!=="TEST"||profile.environment!=="TEST")throw Error("TEST_ONLY");
 requireApprovedSend(profile,draft,approval,Date.now());
 if(profile.endpoint!==binding.endpoint||validatedXml?.verified!==true||validatedXml?.schemaVerified!==true||validatedXml?.schematronVerified!==true||validatedXml?.ettn!==draft.ettn||validatedXml?.sha256!==draft.contentSha256||binding.contractHash!==validatedXml.contractHash)throw Error("UBL_OR_BINDING_UNVERIFIED");
 const binary=atob(validatedXml.base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const actualHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
 if(actualHash!==draft.contentSha256.toLowerCase())throw Error("UBL_HASH_MISMATCH");
 const exact=verifiedTestSendBinding(draft.kind);
 if(fetcher===fetch){
  if(binding.contractHash!==ISNET_SEND_WSDL_SHA256||parseResult)throw Error("SOAP_REAL_SEND_REQUIRES_PINNED_PARSER");
  await requireVerifiedTestUblIdentity({bytes,kind:draft.kind,tenant:draft.tenant,ettn:draft.ettn,senderHash:profile.testCompanyTaxSha256,receiverTag:validatedXml.receiverTag,evidence:validatedXml.providerTagEvidence,now:Date.now()});
 }
 if(binding.contractHash===ISNET_SEND_WSDL_SHA256&&JSON.stringify(Object.keys(exact).map(k=>[k,typeof exact[k]==="object"?[exact[k].local,exact[k].ns]:exact[k]]))!==JSON.stringify(Object.keys(exact).map(k=>[k,typeof exact[k]==="object"?[binding[k]?.local,binding[k]?.ns]:binding[k]])))throw Error("SOAP_PINNED_BINDING_MISMATCH");
 const req=buildEnvelope(binding,validatedXml.base64,validatedXml.receiverTag,draft.kind);
 // Persistent claim precedes network IO. UNKNOWN or a failed settlement is never retried automatically.
 const claimId=await claim({tenant:draft.tenant,environment:"TEST",draftId:draft.id,version:draft.version,ettn:draft.ettn,contentSha256:draft.contentSha256,expectedStatus:"APPROVED"});
 if(!claimId)throw Error("SEND_CLAIM_CONFLICT");
 let status="UNKNOWN_REVIEW_REQUIRED";let providerResult=null;
 try{
  const response=await fetcher(req.endpoint,{method:"POST",headers:req.headers,body:req.body,redirect:"manual",signal:AbortSignal.timeout(30000)});
  // Never follow redirects with document contents. An unexpected response stays UNKNOWN.
  if(response.status>=200&&response.status<300&&response.ok){const xml=await response.text();if(xml.length<=4000000&&!/<!DOCTYPE|<!ENTITY/i.test(xml)){providerResult=parseResult?await parseResult(xml,binding):await parseVerifiedTestSendResponse(xml,draft.kind,draft.ettn);status=classifySendResult({...draft,status:"SUBMITTING"},providerResult);}}
 }catch{status="UNKNOWN_REVIEW_REQUIRED";}
 await settle({claimId,tenant:draft.tenant,draftId:draft.id,version:draft.version,ettn:draft.ettn,status,providerResult});
 return {status};
}
