// Read-only diagnostic from the actual Worker network. Does not authenticate or grant send capability.
// @ts-nocheck
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract";
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
export async function probeSoapTestEndpoints(fetcher=fetch){
 return Promise.all(Object.entries(SOAP_TEST_ENDPOINTS).map(async ([service,endpoint])=>{
  try{
   const res=await fetcher(endpoint+"?singleWsdl",{method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),headers:{Accept:"application/xml,text/xml"}});
   if(!res.ok)return{service,status:"HTTP_ERROR",httpStatus:res.status,operations:[]};
   const reader=res.body?.getReader();if(!reader)return{service,status:"EMPTY",operations:[]};
   let count=0,xml="";const decoder=new TextDecoder();try{while(true){const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>4000000){await reader.cancel();return{service,status:"SIZE_LIMIT",operations:[]};}xml+=decoder.decode(item.value,{stream:true});}xml+=decoder.decode();}finally{reader.releaseLock();}
   return{service,httpStatus:res.status,...wsdlSummary(xml)};
  }catch{return{service,status:"NETWORK_UNAVAILABLE",operations:[]};}
 }));
}
