import {getEBELGEAdapter} from "./e-belge-adapter-registry";

export type AdapterProfile={
 key:string;displayName:string;serviceUrl:string;defaultDays:number;
 workflow:"READ_ONLY"|"MANUAL_REVIEW"|"DISABLED";
 output:"XML"|"PDF";fileNamePattern:string;description:string;
};
const defaults:Record<string,string>={
 ISNET:"https://einvoiceapi.isnet.net.tr",MANUAL:"",LOGO:"",MIKRO:"",PARASUT:""
};
const safePattern=/^[a-zA-Z0-9_{}.-]{1,95}$/;
const allowedMarkers=new Set(["{type}","{number}","{date}","{direction}"]);
const value=(v:unknown)=>String(v??"").trim();
export function defaultAdapterProfile(key:unknown):AdapterProfile|null{
 const adapter=getEBELGEAdapter(key);
 if(!adapter)return null;
 return {key:adapter.key,displayName:adapter.label,serviceUrl:defaults[adapter.key]||"",
  defaultDays:7,workflow:"READ_ONLY",output:"XML",
  fileNamePattern:"{direction}-{type}-{number}",description:""};
}
export function normalizeAdapterProfile(key:unknown,input:unknown):AdapterProfile{
 const initial=defaultAdapterProfile(key);
 if(!initial)throw new Error("UNKNOWN_ADAPTER");
 const raw=(input&&typeof input==="object"&&!Array.isArray(input))?input as Record<string,unknown>:{};
 const displayName=value(raw.displayName??initial.displayName);
 const description=value(raw.description??"");
 const serviceUrl=value(raw.serviceUrl??initial.serviceUrl);
 const defaultDays=Number(raw.defaultDays??initial.defaultDays);
 const workflow=value(raw.workflow||initial.workflow);
 const output=value(raw.output||initial.output);
 const fileNamePattern=value(raw.fileNamePattern||initial.fileNamePattern);
 if(displayName.length<2||displayName.length>90||description.length>350)
  throw new Error("INVALID_LABEL");
 if(!Number.isInteger(defaultDays)||defaultDays<1||defaultDays>31)
  throw new Error("INVALID_DEFAULT_DAYS");
 if(!["READ_ONLY","MANUAL_REVIEW","DISABLED"].includes(workflow))
  throw new Error("INVALID_WORKFLOW");
 if(!["XML","PDF"].includes(output))throw new Error("INVALID_OUTPUT");
 if(!safePattern.test(fileNamePattern)||[...fileNamePattern.matchAll(/\{[^}]*\}/g)].some(m=>!allowedMarkers.has(m[0]))||
    fileNamePattern.replace(/\{(?:type|number|date|direction)\}/g,"").includes("{"))
  throw new Error("INVALID_FILENAME_PATTERN");
 if(serviceUrl){
  let url:URL;
  try{url=new URL(serviceUrl)}catch{throw new Error("INVALID_SERVICE_URL")}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.pathname!=="/"||url.search||url.hash||
     !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)||
     /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.|0\.|224\.)/.test(host))
   throw new Error("INVALID_SERVICE_URL");
  if(initial.key==="ISNET"&&host!=="einvoiceapi.isnet.net.tr")
   throw new Error("ISNET_SERVICE_HOST_RESTRICTED");
  if(initial.key==="MANUAL")throw new Error("MANUAL_NO_SERVICE_URL");
 }
 return {key:initial.key,displayName,serviceUrl,defaultDays,
  workflow:workflow as AdapterProfile["workflow"],output:output as AdapterProfile["output"],
  fileNamePattern,description};
}
