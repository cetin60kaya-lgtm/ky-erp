// Read-only TEST taxpayer tag lookup. AddressBookService WSDL SHA256
// b585690378f5354dd6151cd5251d8460520eacf9de31840a600660a22e7c04cf (X verified).
import {parseSoapXml} from "./isnet-soap-read.ts";
import {isIsnetTestCompanyHash} from "./isnet-test-ubl-identity.ts";
import {queryTestCompany} from "./isnet-test-company.ts";
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
type Kind="E_FATURA"|"E_IRSALIYE";
type Node={uri:string;local:string;text:string;children:Node[]};
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model",AR="http://schemas.microsoft.com/2003/10/Serialization/Arrays";
const validTag=(s:string)=>/^urn:mail:[^\s<>]{1,490}$/i.test(s);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,"0")).join("");
const one=(n:Node,ns:string,k:string)=>{const x=n.children.filter(v=>v.uri===ns&&v.local===k);if(x.length!==1)throw Error("TEST_TAG_FIELD");return x[0];};
const scalar=(n:Node,ns:string,k:string)=>{const v=one(n,ns,k);if(v.children.length)throw Error("TEST_TAG_SCALAR");return v.text.trim();};
const operation=(kind:Kind)=>{if(kind==="E_FATURA")return "GetTaxPayer";if(kind==="E_IRSALIYE")return "GetDespatchTaxPayer";throw Error("TEST_TAG_KIND");};
export function buildTestTagRequest(kind:Kind,taxCode:string){
 if(!/^\d{10}$/.test(taxCode))throw Error("TEST_TAX_CODE");
 const op=operation(kind);
 return {endpoint:SOAP_TEST_ENDPOINTS.AddressBookService,headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+T+"IAddressBookService/"+op+'"'},body:'<s:Envelope xmlns:s="'+S+'" xmlns:m="'+M+'"><s:Body><'+op+' xmlns="'+T+'"><request><m:TaxPayerTaxCode>'+taxCode+'</m:TaxPayerTaxCode></request></'+op+'></s:Body></s:Envelope>'};
}
export async function parseTestTagResponse(xml:string,kind:Kind,expectedHash:string){
 if(xml.length>4000000||!/^[a-f0-9]{64}$/.test(expectedHash))throw Error("TEST_TAG_RESPONSE");
 const op=operation(kind),root:Node=parseSoapXml(xml);
 if(root.uri!==S||root.local!=="Envelope")throw Error("TEST_TAG_ENVELOPE");
 const body=one(root,S,"Body");if(body.children.length!==1)throw Error("TEST_TAG_RESPONSE");
 const result=one(one(body,T,op+"Response"),T,op+"Result");
 if(scalar(result,M,"Result")!=="Success")throw Error("TEST_TAG_LOOKUP_FAILED");
 const rows=one(result,M,"TaxPayers").children.filter(x=>x.uri===M&&x.local==="TaxPayer");
 const matches:Node[]=[];
 for(const row of rows){const code=scalar(row,M,"TaxPayerTaxCode");if(/^\d{10}$/.test(code)&&await hash(code)===expectedHash)matches.push(row);}
 if(matches.length!==1)throw Error("TEST_TAG_IDENTITY");
 const row=matches[0];
 function list(name:string){
  const n=one(row,M,name);const values=n.children.map(v=>{if(v.uri!==AR||v.local!=="string"||v.children.length||!validTag(v.text.trim()))throw Error("TEST_TAG_INVALID");return v.text.trim()});
  return [...new Set(values)].sort();
 }
 return {companyTaxSha256:expectedHash,inboxTags:list("InboxTagList"),outboxTags:list("OutboxTagList"),responseEvidenceSha256:await hash(xml)};
}
export async function queryTestTags(kind:Kind,code:string,fetcher:typeof fetch=fetch){
 if(!/^\d{10}$/.test(code)||!isIsnetTestCompanyHash(await hash(code)))throw Error("TEST_COMPANY_NOT_ALLOWED");
 const q=buildTestTagRequest(kind,code);
 const r=await fetcher(q.endpoint,{method:"POST",headers:q.headers,body:q.body,redirect:"manual",signal:AbortSignal.timeout(25000)});
 if(!r.ok||!r.body)throw Error("TEST_TAG_UNAVAILABLE");
 const reader=r.body.getReader(),decoder=new TextDecoder();let count=0,xml="";
 try{for(;;){const x=await reader.read();if(x.done)break;count+=x.value.byteLength;if(count>4000000){await reader.cancel();throw Error("TEST_TAG_LIMIT");}xml+=decoder.decode(x.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
 return parseTestTagResponse(xml,kind,await hash(code));
}
/** Server-only evidence. Never choose arbitrarily from many recipient inbox tags. */
export async function resolveVerifiedTestTags(input:{tenant:string;kind:Kind;senderCode:string;receiverCode:string;receiverTag:string;senderTag:string},fetcher:typeof fetch=fetch){
 if(!input.tenant.trim()||input.senderCode===input.receiverCode||!validTag(input.receiverTag)||!validTag(input.senderTag))throw Error("TEST_TAG_SELECTION_REQUIRED");
 const [senderCompany,receiverCompany,sender,receiver]=await Promise.all([queryTestCompany(input.senderCode,fetcher),queryTestCompany(input.receiverCode,fetcher),queryTestTags(input.kind,input.senderCode,fetcher),queryTestTags(input.kind,input.receiverCode,fetcher)]);
 if(input.kind==="E_FATURA"?!senderCompany.invoiceAllowed||!receiverCompany.invoiceAllowed:!senderCompany.dispatchAllowed||!receiverCompany.dispatchAllowed)throw Error("TEST_COMPANY_PERMISSION");
 if(sender.companyTaxSha256!==senderCompany.companyTaxSha256||receiver.companyTaxSha256!==receiverCompany.companyTaxSha256||!sender.outboxTags.includes(input.senderTag)||!receiver.inboxTags.includes(input.receiverTag))throw Error("TEST_TAG_NOT_VERIFIED");
 return {tenant:input.tenant,environment:"TEST" as const,kind:input.kind,senderHash:sender.companyTaxSha256,receiverHash:receiver.companyTaxSha256,receiverTag:input.receiverTag,senderTag:input.senderTag,verifiedAt:new Date().toISOString(),providerVerified:true as const,senderEvidenceSha256:sender.responseEvidenceSha256,receiverEvidenceSha256:receiver.responseEvidenceSha256};
}
