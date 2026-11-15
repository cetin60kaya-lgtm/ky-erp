/** Provider-documented, strictly read-only list calls: no official submission. */
type Row=Record<string,unknown>;
export const documentTypes={
 "incoming-invoice":{endpoint:"/api/Invoice/GetIncomingEInvoiceList",list:"Invoices",family:"invoice",direction:"incoming"},
 "outgoing-invoice":{endpoint:"/api/Invoice/GetSentStagingInvoiceList",list:"Invoices",family:"invoice",direction:"outgoing"},
 "incoming-despatch":{endpoint:"/api/Invoice/GetIncomingDespatchList",list:"Despatches",family:"despatch",direction:"incoming"},
 "outgoing-despatch":{endpoint:"/api/Invoice/GetSentStagingDespatchList",list:"Despatches",family:"despatch",direction:"outgoing"}
} as const;
export type TestType=keyof typeof documentTypes;
export const isTestType=(x:unknown):x is TestType=>typeof x==="string"&&Object.prototype.hasOwnProperty.call(documentTypes,x);
export async function queryIsnetDocumentTest(fetcher:typeof fetch,token:string,companyId:number,type:TestType,from:string,to:string){
 const def=documentTypes[type],isInvoice=def.family==="invoice";
 const payload:Row={CompanyId:companyId,PageIndex:0,PageSize:25,
  ...(isInvoice?{FirstInvoiceDate:from,LastInvoiceDate:to,IsArchiveIncluded:true}
    :{FirstDespatchDate:from,LastDespatchDate:to})};
 if(def.direction==="outgoing"&&isInvoice)payload.IsSended=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetcher("https://einvoiceapi.isnet.net.tr"+def.endpoint,{
   method:"POST",redirect:"manual",signal:controller.signal,
   headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+token,Token:token},
   body:JSON.stringify(payload),
  });
  if(response.status===401||response.status===403)return {status:"SESSION_INVALID",firstPageCount:null,items:[],hasMore:false};
  if(!response.ok)return {status:"HTTP_ERROR",firstPageCount:null,items:[],hasMore:false};
  if(!(response.headers.get("Content-Type")||"").toLowerCase().includes("json"))
   return {status:"UNVERIFIED_RESPONSE",firstPageCount:null,items:[],hasMore:false};
  const res=await response.json() as Row;
  const accepted=[0,"0","Success","success",true].includes(res?.Result??res?.result);
  const rows=res[def.list];
  if(!accepted||!Array.isArray(rows))return {status:"UNVERIFIED_RESPONSE",firstPageCount:null,items:[],hasMore:false};
  const items=(rows as Row[]).slice(0,25).map(x=>({
   number:String(x[isInvoice?"InvoiceNumber":"DespatchNumber"]??"").slice(0,80),
   date:String(x[isInvoice?"InvoiceDate":"DespatchDate"]??"").slice(0,35),
   status:String(x.Status??"").slice(0,80),
   ettn:/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(x.Ettn??""))?String(x.Ettn):"",
  }));
  return {status:"VERIFIED_READ_ONLY",firstPageCount:rows.length,items,hasMore:rows.length>=25,
   coverage:def.direction==="outgoing"?"SENT_STAGING_ONLY":"PROVIDER_INCOMING"};
 }catch(e:any){return {status:e?.name==="AbortError"?"TIMEOUT":"NETWORK_ERROR",firstPageCount:null,items:[],hasMore:false}}
 finally{clearTimeout(timeout)}
}
