// Pinned TEST InvoiceService GetCompany contract; no write call.
// Source: supplied InvoiceService singleWsdl SHA256 d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e.
import {parseSoapXml} from "./isnet-soap-read.ts";
import {isIsnetTestCompanyHash} from "./isnet-test-ubl-identity.ts";
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
type Node={uri:string;local:string;text:string;children:Node[]};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,"0")).join("");
const one=(n:Node,uri:string,local:string)=>{const a=n.children.filter(c=>c.uri===uri&&c.local===local);if(a.length!==1)throw Error("TEST_COMPANY_FIELD");return a[0];};
const field=(n:Node,k:string)=>{const x=one(n,M,k);if(x.children.length)throw Error("TEST_COMPANY_SCALAR");return x.text.trim();};
const boolean=(n:Node,k:string)=>{const v=field(n,k);if(!["true","false","1","0"].includes(v))throw Error("TEST_COMPANY_BOOLEAN");return v==="true"||v==="1";};
const series=(n:Node,k:string)=>{const v=field(n,k);return /^[A-Z0-9]{3}$/.test(v)?v:null;};
export function buildTestCompanyRequest(taxCode:string){
 if(!/^\d{10}$/.test(taxCode))throw Error("TEST_COMPANY_CODE");
 return {endpoint:SOAP_TEST_ENDPOINTS.InvoiceService,headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+T+'IInvoiceService/GetCompany"'},body:'<s:Envelope xmlns:s="'+S+'" xmlns:m="'+M+'"><s:Body><GetCompany xmlns="'+T+'"><request><m:CompanyTaxCode>'+taxCode+'</m:CompanyTaxCode></request></GetCompany></s:Body></s:Envelope>'};
}
export async function parseTestCompanyResponse(xml:string,expectedTaxHash:string){
 if(xml.length>500000||!/^[a-f0-9]{64}$/.test(expectedTaxHash))throw Error("TEST_COMPANY_RESPONSE");
 const root:Node=parseSoapXml(xml);
 if(root.uri!==S||root.local!=="Envelope")throw Error("TEST_COMPANY_ENVELOPE");
 const body=one(root,S,"Body");if(body.children.length!==1)throw Error("TEST_COMPANY_RESPONSE");
 const r=one(one(body,T,"GetCompanyResponse"),T,"GetCompanyResult");
 if(field(r,"Result")!=="Success")throw Error("TEST_COMPANY_NOT_VERIFIED");
 const taxCode=field(r,"VknTckn");if(!/^\d{10}$/.test(taxCode)||await hash(taxCode)!==expectedTaxHash)throw Error("TEST_COMPANY_IDENTITY_MISMATCH");
 const invoiceAllowed=boolean(r,"FaturaKesebilir"),dispatchAllowed=boolean(r,"EIrsaliyeEkleyebilir");
 return {environment:"TEST" as const,companyTaxSha256:expectedTaxHash,providerIdentityVerified:true,invoiceAllowed,dispatchAllowed,invoiceSeries:invoiceAllowed?series(r,"Seri"):null,dispatchSeries:dispatchAllowed?series(r,"IrsaliyeSeri"):null,responseEvidenceSha256:await hash(xml),verifiedAt:new Date().toISOString()};
}
/** This verifies provider company identity/flags only, not send capability, numbering or tags. */
export async function queryTestCompany(taxCode:string,fetcher:typeof fetch=fetch){
 if(!/^\d{10}$/.test(taxCode))throw Error("TEST_COMPANY_CODE");
 const expected=await hash(taxCode);if(!isIsnetTestCompanyHash(expected))throw Error("TEST_COMPANY_NOT_ALLOWED");
 const r=buildTestCompanyRequest(taxCode);
 const response=await fetcher(r.endpoint,{method:"POST",headers:r.headers,body:r.body,redirect:"manual",signal:AbortSignal.timeout(25000)});
 if(!response.ok||!response.body)throw Error("TEST_COMPANY_UNAVAILABLE");
 const reader=response.body.getReader(),decoder=new TextDecoder();let count=0,xml="";
 try{for(;;){const v=await reader.read();if(v.done)break;count+=v.value.byteLength;if(count>500000){await reader.cancel();throw Error("TEST_COMPANY_RESPONSE_LIMIT");}xml+=decoder.decode(v.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
 return parseTestCompanyResponse(xml,expected);
}
