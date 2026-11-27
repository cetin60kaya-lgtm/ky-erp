// Fixed production WSDL metadata GET only, from authorized office egress.
import {createHash} from "node:crypto";
export const LIVE_ENDPOINTS=Object.freeze({
 InvoiceService:"https://einvoiceservice.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc",
 AddressBookService:"https://einvoiceservice.isnet.net.tr/AddressBookService/ServiceContract/AddressBookService.svc"
});
export const LIVE_NOT_BEFORE=Date.parse("2026-11-27T17:00:00Z");
const result=(service,status,httpStatus=null,sha256=null,operationCount=0)=>({service,status,httpStatus,sha256,operationCount});
export async function probeLiveWsdl(fetcher=fetch,clock=Date.now){
 if(clock()<LIVE_NOT_BEFORE)return null;
 const services=await Promise.all(Object.entries(LIVE_ENDPOINTS).map(async([service,endpoint])=>{
  try{
   const response=await fetcher(endpoint+"?singleWsdl",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(15000),headers:{Accept:"application/xml,text/xml"}});
   if(response.status>=300&&response.status<400)return result(service,"REDIRECT_REJECTED",response.status);
   if(response.status!==200)return result(service,"HTTP_ERROR",response.status);
   const reader=response.body?.getReader();if(!reader)return result(service,"INVALID_WSDL",200);
   const chunks=[];let size=0;
   try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>4000000){await reader.cancel();return result(service,"SIZE_LIMIT",200)}chunks.push(Buffer.from(x.value))}}finally{reader.releaseLock()}
   const bytes=Buffer.concat(chunks),xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
   if(/<!DOCTYPE|<!ENTITY/i.test(xml))return result(service,"INVALID_WSDL",200);
   const root=xml.replace(/^\uFEFF?\s*(?:<\?xml[^?]*\?>\s*)?/,"").match(/^<((?:[\w.-]+:)?definitions)\b([^>]*)>/);
   if(!root)return result(service,"INVALID_WSDL",200);
   const prefix=root[1].includes(":")?root[1].split(":")[0]:"",attr=prefix?"xmlns:"+prefix:"xmlns";
   // Attribute name checked literally, not interpreted as a regex supplied by XML.
   const namespaces=[...root[2].matchAll(/(?:^|\s)(xmlns(?::[\w.-]+)?)\s*=\s*(['"])(.*?)\2/g)];
   if(!namespaces.some(m=>m[1]===attr&&m[3]==="http://schemas.xmlsoap.org/wsdl/"))return result(service,"INVALID_WSDL",200);
   const types=Array.from(xml.matchAll(/<(?:[\w.-]+:)?portType\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?portType\s*>/g),m=>m[1]).join("\n");
   const operations=new Set(Array.from(types.matchAll(/<(?:[\w.-]+:)?operation\b[^>]*\bname\s*=\s*(['"])([A-Za-z_][\w.-]*)\1/g),m=>m[2]));
   if(!operations.size||operations.size>10000)return result(service,"INVALID_WSDL",200);
   return result(service,"WSDL_DISCOVERED",200,createHash("sha256").update(bytes).digest("hex"),operations.size);
  }catch{return result(service,"NETWORK_UNAVAILABLE")}
 }));
 return {checkedAt:clock(),services};
}
