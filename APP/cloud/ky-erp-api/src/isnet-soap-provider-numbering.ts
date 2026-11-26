// Exact TEST provider-numbering contract, confirmed against supplied InvoiceService
// singleWsdl and real Windows TEST acknowledgements. No public route or PROD fallback.
import {parseSoapXml} from "./isnet-soap-read.ts";
import {requireApprovedSend,type Profile,type Draft,type Approval,type ProviderResult} from "./isnet-official-acceptance.ts";
import {requireVerifiedTestUblIdentity} from "./isnet-test-ubl-identity.ts";
import {ISNET_SEND_WSDL_SHA256} from "./isnet-soap-send-engine.ts";
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
export type TestKind="E_FATURA"|"E_IRSALIYE";
export const PROVIDER_NUMBERING="PROVIDER_NUMBERED" as const;
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
const U="urn:oasis:names:specification:ubl:schema:xsd:",B=U+"CommonBasicComponents-2",A=U+"CommonAggregateComponents-2",E=U+"CommonExtensionComponents-2";
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,number=/^[A-Z0-9]{3}[0-9]{13}$/,hash=/^[a-f0-9]{64}$/;
type Node={uri:string;local:string;text:string;attrs:Record<string,string>;children:Node[]};
const info=(k:TestKind)=>{
 if(k==="E_FATURA")return {op:"SendInvoiceXmlWithoutInvoiceNumber",list:"Invoices",item:"InvoiceXml",content:"InvoiceContent",returned:"InvoiceReturn",number:"InvoiceNumber",root:"Invoice"};
 if(k==="E_IRSALIYE")return {op:"SendDespatchAdviceXmlWithoutDespatchAdviceNumber",list:"DespatchAdvices",item:"DespatchAdviceXml",content:"DespatchAdviceContent",returned:"DespatchAdviceReturn",number:"DespatchAdviceNumber",root:"DespatchAdvice"};
 throw Error("SOAP_KIND_UNSUPPORTED");
};
const one=(n:Node,ns:string,k:string)=>{const a=n.children.filter(x=>x.uri===ns&&x.local===k);if(a.length!==1)throw Error("ISNET_NUMBERED_FIELD");return a[0];};
const scalar=(n:Node,ns:string,k:string)=>{const x=one(n,ns,k);if(x.children.length)throw Error("ISNET_NUMBERED_SCALAR");return x.text.trim();};
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const digest=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(b))),n=>n.toString(16).padStart(2,"0")).join("");
export function buildProviderNumberedTestEnvelope(kind:TestKind,base64:string,receiverTag:string){
 const i=info(kind);
 if(!base64||base64.length>14000000||base64.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||!/^urn:mail:[^\s<>]{1,490}$/i.test(receiverTag))throw Error("SOAP_PAYLOAD_INVALID");
 // CompanyVendorNumber is optional in both WSDL requests; omit for direct TEST company.
 const inner="<m:"+i.list+"><m:"+i.item+"><m:"+i.content+">"+base64+"</m:"+i.content+"><m:ReceiverTag>"+esc(receiverTag)+"</m:ReceiverTag></m:"+i.item+"></m:"+i.list+">";
 return {endpoint:SOAP_TEST_ENDPOINTS.InvoiceService,headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+T+"IInvoiceService/"+i.op+'"'},body:'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="'+S+'" xmlns:m="'+M+'"><s:Body><'+i.op+' xmlns="'+T+'"><request>'+inner+'</request></'+i.op+'></s:Body></s:Envelope>'};
}
/** The provider signs this specific input. A GIB final XSD pass is NOT claimed here. */
export function requireProviderUnsignedStructure(bytes:Uint8Array,kind:TestKind){
 const xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes),i=info(kind);
 const n:Node=parseSoapXml(xml);
 if(n.uri!==U+i.root+"-2"||n.local!==i.root)throw Error("UBL_KIND_MISMATCH");
 const ext=one(one(one(n,E,"UBLExtensions"),E,"UBLExtension"),E,"ExtensionContent");
 if(ext.children.length||ext.text.trim())throw Error("PROVIDER_UNSIGNED_EXTENSION_REQUIRED");
 const sig=one(n,A,"Signature");
 if(!scalar(sig,B,"ID")||scalar(one(one(sig,A,"DigitalSignatureAttachment"),A,"ExternalReference"),B,"URI")!=="#Signature")throw Error("PROVIDER_SIGNATURE_STRUCTURE_REQUIRED");
 if(kind==="E_IRSALIYE"){
  const sh=one(n,A,"Shipment");
  if(!scalar(one(one(sh,A,"Delivery"),A,"Despatch"),B,"ActualDespatchDate"))throw Error("PROVIDER_SHIPMENT_DATE_REQUIRED");
  const values=sh.children.filter(c=>c.uri===A&&c.local==="GoodsItem").flatMap(g=>g.children.filter(c=>c.uri===B&&c.local==="ValueAmount"));
  if(values.length!==1||values[0].children.length||!/^\d{1,15}(?:\.\d{1,2})?$/.test(values[0].text.trim())||!/^[A-Z]{3}$/.test(values[0].attrs.currencyID||""))throw Error("PROVIDER_SHIPMENT_VALUE_REQUIRED");
 }
}
export async function parseProviderNumberedTestResponse(xml:string,kind:TestKind):Promise<ProviderResult>{
 const unknown:ProviderResult={transport:"RESPONSE"};
 if(xml.length>4000000)return unknown;
 try{
  const i=info(kind),root:Node=parseSoapXml(xml);
  if(root.uri!==S||root.local!=="Envelope")return unknown;
  const body=one(root,S,"Body");if(body.children.length!==1)return unknown;
  const result=one(one(body,T,i.op+"Response"),T,i.op+"Result");
  if(scalar(result,M,"Result")!=="Success")return unknown;
  const list=one(result,M,i.list);
  if(list.children.length!==1)return unknown;
  const item=one(list,M,i.returned);
  const ettn=scalar(item,M,"Ettn"),documentNo=scalar(item,M,i.number);
  if(!uuid.test(ettn)||!number.test(documentNo))return unknown;
  return {transport:"RESPONSE",explicitAcceptance:true,ettn,documentNo,responseEvidenceSha256:await digest(new TextEncoder().encode(xml))};
 }catch{return unknown;}
}
export function classifyProviderNumberedTestResult(d:Draft,r:ProviderResult|null):"UNKNOWN_REVIEW_REQUIRED"|"PROVIDER_ACCEPTED"{
 if(d.environment!=="TEST"||d.status!=="SUBMITTING"||!["E_FATURA","E_IRSALIYE"].includes(d.kind)||!r||r.transport!=="RESPONSE"||r.explicitAcceptance!==true||r.explicitRejection===true||!uuid.test(r.ettn||"")||!number.test(r.documentNo||"")||!hash.test(r.responseEvidenceSha256||""))return "UNKNOWN_REVIEW_REQUIRED";
 return "PROVIDER_ACCEPTED"; // provider-assigned identity is distinct from immutable local ETTN
}
type TagEvidence=Parameters<typeof requireVerifiedTestUblIdentity>[0]["evidence"];
type UnsignedEvidence={verified:true;contractHash:string;sha256:string;localEttn:string;providerUnsignedInputVerified:true;expectedUnsignedExtensionError:true;validationCopySchemaVerified:true;validationCopySchematronVerified:true;schemaVerified:false;receiverTag:string;providerTagEvidence:TagEvidence;base64:string};
type ClaimInput={tenant:string;environment:"TEST";draftId:string;version:string;ettn:string;contentSha256:string;expectedStatus:"APPROVED";numberingMode:typeof PROVIDER_NUMBERING};
type SettleInput={claimId:string;tenant:string;draftId:string;version:string;ettn:string;status:"PROVIDER_ACCEPTED"|"UNKNOWN_REVIEW_REQUIRED";providerResult:ProviderResult|null;numberingMode:typeof PROVIDER_NUMBERING};
export async function submitProviderNumberedTest(args:{profile:Profile&{testCompanyTaxSha256:string};draft:Draft&{kind:TestKind};approval:Approval;validatedXml:UnsignedEvidence;claim:(v:ClaimInput)=>Promise<string|null>;settle:(v:SettleInput)=>Promise<void>;fetcher?:typeof fetch}){
 const {profile,draft,approval,validatedXml:v,claim,settle,fetcher=fetch}=args;
 if(profile.environment!=="TEST"||draft.environment!=="TEST"||profile.endpoint!==SOAP_TEST_ENDPOINTS.InvoiceService)throw Error("TEST_ONLY");
 requireApprovedSend(profile,draft,approval,Date.now());
 if(!v||v.verified!==true||v.contractHash!==ISNET_SEND_WSDL_SHA256||v.localEttn!==draft.ettn||v.sha256!==draft.contentSha256||v.providerUnsignedInputVerified!==true||v.expectedUnsignedExtensionError!==true||v.validationCopySchemaVerified!==true||v.validationCopySchematronVerified!==true||v.schemaVerified!==false)throw Error("PROVIDER_UNSIGNED_VALIDATION_REQUIRED");
 const req=buildProviderNumberedTestEnvelope(draft.kind,v.base64,v.receiverTag);
 const bytes=Uint8Array.from(atob(v.base64),c=>c.charCodeAt(0));
 if(await digest(bytes)!==draft.contentSha256.toLowerCase())throw Error("UBL_HASH_MISMATCH");
 await requireVerifiedTestUblIdentity({bytes,kind:draft.kind,tenant:draft.tenant,ettn:draft.ettn,senderHash:profile.testCompanyTaxSha256,receiverTag:v.receiverTag,evidence:v.providerTagEvidence,now:Date.now()});
 requireProviderUnsignedStructure(bytes,draft.kind);
 const claimId=await claim({tenant:draft.tenant,environment:"TEST",draftId:draft.id,version:draft.version,ettn:draft.ettn,contentSha256:draft.contentSha256,expectedStatus:"APPROVED",numberingMode:PROVIDER_NUMBERING});
 if(!claimId)throw Error("SEND_CLAIM_CONFLICT");
 let providerResult:ProviderResult|null=null;
 try{
  const response=await fetcher(req.endpoint,{method:"POST",headers:req.headers,body:req.body,redirect:"manual",signal:AbortSignal.timeout(35000)});
  if(response.ok&&response.body){
   const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,xml="";
   try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>4000000){await reader.cancel();throw Error("SOAP_RESPONSE_LIMIT");}xml+=decoder.decode(x.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
   providerResult=await parseProviderNumberedTestResponse(xml,draft.kind);
  }
 }catch{/* Persist ambiguous outcome, never resend. */}
 const status=classifyProviderNumberedTestResult({...draft,status:"SUBMITTING"},providerResult);
 await settle({claimId,tenant:draft.tenant,draftId:draft.id,version:draft.version,ettn:draft.ettn,status,providerResult,numberingMode:PROVIDER_NUMBERING});
 return {status,providerEttn:status==="PROVIDER_ACCEPTED"?providerResult?.ettn:undefined,documentNo:status==="PROVIDER_ACCEPTED"?providerResult?.documentNo:undefined};
}
