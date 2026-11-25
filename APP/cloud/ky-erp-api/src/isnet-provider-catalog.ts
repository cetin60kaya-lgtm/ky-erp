// Read-only capability discovery. Never invoke an operation advertised by metadata.
// @ts-nocheck
import {parseSoapXml} from "./isnet-soap-read.ts";
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
const W="http://schemas.xmlsoap.org/wsdl/",X="http://www.w3.org/2001/XMLSchema",S="http://schemas.xmlsoap.org/wsdl/soap/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
const kids=(n,uri,local)=>n?.children?.filter(c=>c.uri===uri&&c.local===local)||[];
const one=a=>{if(a.length!==1)throw Error("WSDL_CONTRACT_AMBIGUOUS");return a[0];};
const name=v=>typeof v==="string"&&/^[A-Za-z_][\p{L}\p{N}_.-]{0,127}$/u.test(v);
const localRef=(n,q,ns)=>{const a=String(q||"").split(":");if(a.length>2||!name(a.at(-1))||n.ns[a.length===2?a[0]:""]!==ns)throw Error("WSDL_CONTRACT_REF");return a.at(-1);};
export function parseProviderCatalog(xml,service){
 const endpoint=SOAP_TEST_ENDPOINTS[service];if(!endpoint||typeof xml!=="string"||xml.length>4000000)throw Error("WSDL_LIMIT");
 const root=parseSoapXml(xml);if(root.uri!==W||root.local!=="definitions"||!root.attrs.targetNamespace)throw Error("WSDL_INVALID");
 const ns=root.attrs.targetNamespace;
 const ports=kids(root,W,"service").flatMap(n=>kids(n,W,"port")).filter(p=>kids(p,S,"address").some(a=>a.attrs.location===endpoint));
 const port=one(ports),binding=one(kids(root,W,"binding").filter(b=>b.attrs.name===localRef(port,port.attrs.binding,ns)));
 const portType=one(kids(root,W,"portType").filter(p=>p.attrs.name===localRef(binding,binding.attrs.type,ns)));
 const operations=kids(portType,W,"operation").map(n=>n.attrs.name);
 const bound=new Set(kids(binding,W,"operation").map(n=>n.attrs.name));
 if(!operations.length||operations.length>256||new Set(operations).size!==operations.length||operations.some(n=>!name(n)||!bound.has(n)))throw Error("WSDL_OPERATIONS_INVALID");
 const schemas=kids(root,W,"types").flatMap(t=>kids(t,X,"schema")),enums=[];
 for(const schema of schemas){
  const namespace=schema.attrs.targetNamespace;
  if(!namespace||!namespace.startsWith(M))continue;
  for(const type of kids(schema,X,"simpleType")){
   const values=kids(type,X,"restriction").flatMap(r=>kids(r,X,"enumeration")).map(n=>n.attrs.value);
   if(!values.length)continue;
   if(!name(type.attrs.name)||values.length>256||values.some(v=>!name(v))||new Set(values).size!==values.length)throw Error("WSDL_ENUM_INVALID");
   enums.push({namespace,name:type.attrs.name,values});
  }
 }
 if(enums.length>200||new Set(enums.map(e=>e.namespace+"#"+e.name)).size!==enums.length)throw Error("WSDL_ENUM_LIMIT");
 if(service==="InvoiceService"){
  for(const k of ["ScenarioType","InvoiceType","DespatchAdviceScenarioType","DespatchAdviceType"]){
   if(!enums.some(e=>e.namespace===M&&e.name===k))throw Error("WSDL_ENUM_MISSING");
  }
  if(!["SearchInvoice","SearchDespatchAdvice"].every(n=>operations.includes(n)))throw Error("WSDL_OPERATIONS_MISSING");
 }
 return {service,status:"WSDL_DISCOVERED",operations:operations.sort(),enums};
}
export async function readProviderCatalog(fetcher=fetch){
 const services=await Promise.all(Object.entries(SOAP_TEST_ENDPOINTS).map(async([service,endpoint])=>{
  try{
   const response=await fetcher(endpoint+"?singleWsdl",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(20000),headers:{Accept:"application/xml,text/xml"}});
   if(!response.ok)return{service,status:response.status>=300&&response.status<400?"REDIRECT_REJECTED":"HTTP_ERROR",httpStatus:response.status,operations:[],enums:[]};
   const reader=response.body?.getReader();if(!reader)throw Error("WSDL_EMPTY");
   let size=0,xml="";const decoder=new TextDecoder();
   try{while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>4000000){await reader.cancel();throw Error("WSDL_LIMIT");}xml+=decoder.decode(c.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
   try{return parseProviderCatalog(xml,service);}catch{return {service,status:"WSDL_CONTRACT_INVALID",operations:[],enums:[]};}
  }catch(e){return {service,status:e?.message==="WSDL_LIMIT"?"WSDL_LIMIT":e?.name==="TimeoutError"||e?.name==="AbortError"?"TIMEOUT":"NETWORK_UNAVAILABLE",operations:[],enums:[]};}
 }));
 return {environment:"TEST",source:"ISNET_LIVE_WSDL",checkedAt:new Date().toISOString(),sendEnabled:false,services};
}
