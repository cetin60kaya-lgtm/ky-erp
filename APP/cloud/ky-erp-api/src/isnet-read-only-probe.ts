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

