type Row=Record<string,any>;
const API_BASE="https://einvoiceapi.isnet.net.tr";
export async function probeIsnetReadOnlyLists(fetcher:typeof fetch,token:string,companyId:number,from:string,to:string){
 const defs=[
  {kind:"incomingInvoices",endpoint:"/api/Invoice/GetIncomingEInvoiceList",list:"Invoices",
   payload:{CompanyId:companyId,FirstInvoiceDate:from,LastInvoiceDate:to,PageIndex:0,PageSize:25,IsArchiveIncluded:true}},
  {kind:"incomingDespatches",endpoint:"/api/Invoice/GetIncomingDespatchList",list:"Despatches",
   payload:{CompanyId:companyId,FirstDespatchDate:from,LastDespatchDate:to,PageIndex:0,PageSize:25}}
 ];
 const results:Record<string,{status:string;firstPageCount:number|null}>={};
 for(const def of defs){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  try{
   const response=await fetcher(API_BASE+def.endpoint,{
    method:"POST",signal:controller.signal,
    headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+token,Token:token},
    body:JSON.stringify(def.payload),
   });
   if(response.status===401||response.status===403){
    results[def.kind]={status:"SESSION_INVALID",firstPageCount:null};continue;
   }
   if(!response.ok){results[def.kind]={status:"HTTP_ERROR",firstPageCount:null};continue}
   const payload:Row=await response.json();
   const status=payload?.Result??payload?.result;
   const rows=payload?.[def.list]??payload?.[def.list.toLowerCase()];
   const accepted=[0,"0","Success","success",true].includes(status);
   results[def.kind]=accepted&&Array.isArray(rows)
    ?{status:"VERIFIED_READ_ONLY",firstPageCount:rows.length}
    :{status:"UNVERIFIED_RESPONSE",firstPageCount:null};
  }catch(e:any){
   results[def.kind]={status:e?.name==="AbortError"?"TIMEOUT":"NETWORK_ERROR",firstPageCount:null};
  }finally{clearTimeout(timeout)}
 }
 return {results,verified:Object.values(results).every(x=>x.status==="VERIFIED_READ_ONLY")};
}


/** Explicit user-initiated one-file XML acceptance. No R2/D1 write, no outbound invoice.
 * Only provider-documented IsNet list + external XML URL APIs are used.
 * The external URL must remain on an IsNet HTTPS host (SSRF fail closed).
 */
export async function fetchOneIsnetXmlReadOnly(
 fetcher:typeof fetch, token:string, companyId:number,
 kind:"invoice"|"despatch", from:string, to:string
):Promise<{bytes:ArrayBuffer;kind:"invoice"|"despatch"}> {
 const isInvoice=kind==="invoice";
 const listPath=isInvoice?"/api/Invoice/GetIncomingEInvoiceList":"/api/Invoice/GetIncomingDespatchList";
 const listBody=isInvoice
  ?{CompanyId:companyId,FirstInvoiceDate:from,LastInvoiceDate:to,PageIndex:0,PageSize:25,IsArchiveIncluded:true}
  :{CompanyId:companyId,FirstDespatchDate:from,LastDespatchDate:to,PageIndex:0,PageSize:25};
 const headers={Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+token,Token:token};
 const providerPost=async (path:string,body:Record<string,unknown>)=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
  try{
   const res=await fetcher(API_BASE+path,{method:"POST",headers,body:JSON.stringify(body),signal:ctrl.signal,redirect:"manual"});
   if(!res.ok)throw new Error("ISNET_PROVIDER_HTTP_ERROR");
   if(!(res.headers.get("content-type")||"").toLowerCase().includes("json"))
    throw new Error("ISNET_PROVIDER_NON_JSON");
   const payload:Row=await res.json();
   if(![0,"0","Success","success",true].includes(payload?.Result??payload?.result))
    throw new Error("ISNET_PROVIDER_REJECTED");
   return payload;
  }finally{clearTimeout(timer)}
 };
 const listed=await providerPost(listPath,listBody);
 const rows=listed[isInvoice?"Invoices":"Despatches"];
 if(!Array.isArray(rows))throw new Error("ISNET_LIST_NOT_VERIFIED");
 const selected=rows.find(row=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(row?.Ettn||"")));
 if(!selected)throw new Error("ISNET_NO_XML_SAMPLE");
 // Official IsNet values: InvoiceDirection.GelenFatura=1;
 // InvoiceDocumentType.EInvoice=1 / Despatch=4.
 const meta=await providerPost("/api/Invoice/GetInvoiceExternalXmlUrl",{
  Ettn:String(selected.Ettn),InvoiceDirection:1,InvoiceDocumentType:isInvoice?1:4,
 });
 const raw=String(meta.ExternalLink||"");
 let target:URL;
 try{target=new URL(raw)}catch{throw new Error("ISNET_XML_URL_INVALID")}
 const host=target.hostname.toLowerCase();
 if(target.protocol!=="https:"||target.port||target.username||target.password||
    !(host==="isnet.net.tr"||host.endsWith(".isnet.net.tr")))
  throw new Error("ISNET_XML_URL_NOT_ALLOWLISTED");
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),13000);
 try{
  const res=await fetcher(target.toString(),{method:"GET",signal:ctrl.signal,redirect:"manual",headers:{Accept:"application/xml,text/xml,application/octet-stream"}});
  if(!res.ok)throw new Error("ISNET_XML_DOWNLOAD_HTTP_ERROR");
  const length=Number(res.headers.get("content-length")||0);
  if(length>20*1024*1024)throw new Error("ISNET_XML_TOO_LARGE");
  const type=(res.headers.get("content-type")||"").toLowerCase();
  if(/text\/html|application\/json|javascript/.test(type))throw new Error("ISNET_XML_NON_XML_RESPONSE");
  const bytes=await res.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw new Error("ISNET_XML_INVALID_SIZE");
  const head=new TextDecoder("utf-8").decode(new Uint8Array(bytes).subarray(0,4096));
  const normalized=head.replace(/^\uFEFF/,"").trimStart();
  if(/<!DOCTYPE\b|<!ENTITY\b/i.test(head)||
   !/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z0-9_.-]+:)?(?:Invoice|DespatchAdvice)\b/i.test(normalized))
   throw new Error("ISNET_XML_NOT_UBL");
  const root=/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z0-9_.-]+:)?(Invoice|DespatchAdvice)\b/i.exec(normalized)?.[1];
  if(root!==(isInvoice?"Invoice":"DespatchAdvice"))throw new Error("ISNET_XML_WRONG_DOCUMENT_TYPE");
  return {bytes,kind};
 }finally{clearTimeout(timer)}
}
