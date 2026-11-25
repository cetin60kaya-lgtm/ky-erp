// Read-only diagnostic from the actual Worker network. Does not authenticate or grant send capability.
// @ts-nocheck
import {parseSoapXml} from "./isnet-soap-read.ts";
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
export function wsdlSummary(xml){
 if(typeof xml!=="string"||xml.length>4000000||/<!DOCTYPE|<!ENTITY/i.test(xml))return {status:"INVALID_WSDL",operations:[]};
 const root=xml.replace(/^\uFEFF?\s*(?:<\?xml[^?]*\?>\s*)?/,"").match(/^<((?:[\w.-]+:)?definitions)\b([^>]*)>/);
 if(!root)return {status:"NOT_WSDL",operations:[]};
 const prefix=root[1].includes(":")?root[1].split(":")[0]:"",attr=prefix?"xmlns:"+prefix:"xmlns";
 const escaped=attr.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 if(!new RegExp("\\b"+escaped+"\\s*=\\s*(['\"])http://schemas\\.xmlsoap\\.org/wsdl/\\1").test(root[2]))return {status:"NOT_WSDL",operations:[]};
 const portTypes=Array.from(xml.matchAll(/<(?:[\w.-]+:)?portType\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?portType\s*>/g),m=>m[1]).join("\n");
 const operations=[...new Set(Array.from(portTypes.matchAll(/<(?:[\w.-]+:)?operation\b[^>]*\bname\s*=\s*(['"])([A-Za-z_][\w.-]*)\1/g),m=>m[2]))].sort();
 return{status:operations.length?"WSDL_DISCOVERED":"WSDL_NO_OPERATIONS",operations};
}
export function safeNetworkStatus(error){
 if(error?.name==="TimeoutError"||error?.name==="AbortError")return "TIMEOUT";
 const message=String(error?.message||"");
 if(/dns|resolve|ENOTFOUND|EAI_AGAIN/i.test(message))return "DNS_ERROR";
 if(/certificate|TLS|SSL/i.test(message))return "TLS_ERROR";
 if(/redirect/i.test(message))return "REDIRECT_REJECTED";
 return "NETWORK_UNAVAILABLE";
}
export async function probeInvoiceHealth(fetcher=fetch){
 const service="InvoiceService",check="SOAP_HEALTHCHECK";
 try{
  const env="http://schemas.xmlsoap.org/soap/envelope/",ns="http://tempuri.org/";
  const res=await fetcher(SOAP_TEST_ENDPOINTS.InvoiceService,{method:"POST",redirect:"error",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"http://tempuri.org/IInvoiceService/HealthCheck"'},body:'<s:Envelope xmlns:s="'+env+'"><s:Body><HealthCheck xmlns="'+ns+'"/></s:Body></s:Envelope>'});
  if(!res.ok)return {service,check,status:"HTTP_ERROR",httpStatus:res.status,operations:[]};
  const reader=res.body?.getReader();if(!reader)return {service,check,status:"EMPTY",operations:[]};
  let size=0,xml="",decoder=new TextDecoder();
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel();return {service,check,status:"SIZE_LIMIT",operations:[]};}xml+=decoder.decode(chunk.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
  try{
   const root=parseSoapXml(xml),body=root.children.filter(n=>n.uri===env&&n.local==="Body");
   const result=body.length===1&&body[0].children.length===1?body[0].children[0]:null;
   if(root.uri!==env||root.local!=="Envelope"||result?.uri!==ns||result?.local!=="HealthCheckResponse"||result.children.length!==1||result.children[0].uri!==ns||result.children[0].local!=="HealthCheckResult")return {service,check,status:"SOAP_RESPONSE_INVALID",httpStatus:res.status,operations:[]};
   return {service,check,status:"SOAP_RESPONSE_VERIFIED",httpStatus:res.status,operations:["HealthCheck"]};
  }catch{return {service,check,status:"SOAP_RESPONSE_INVALID",httpStatus:res.status,operations:[]};}
 }catch(e){return {service,check,status:safeNetworkStatus(e),operations:[]};}
}
export async function probeSoapTestEndpoints(fetcher=fetch){
 return Promise.all(Object.entries(SOAP_TEST_ENDPOINTS).map(async ([service,endpoint])=>{
  if(service==="InvoiceService")return probeInvoiceHealth(fetcher);
  try{
   const res=await fetcher(endpoint+"?singleWsdl",{method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),headers:{Accept:"application/xml,text/xml"}});
   if(!res.ok)return{service,status:"HTTP_ERROR",httpStatus:res.status,operations:[]};
   const reader=res.body?.getReader();if(!reader)return{service,status:"EMPTY",operations:[]};
   let count=0,xml="";const decoder=new TextDecoder();try{while(true){const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>4000000){await reader.cancel();return{service,status:"SIZE_LIMIT",operations:[]};}xml+=decoder.decode(item.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
   return{service,httpStatus:res.status,...wsdlSummary(xml)};
  }catch(e){return{service,check:"WSDL",status:safeNetworkStatus(e),operations:[]};}
 }));
}
