// No invoices, dispatches, XML uploads, token echoes, or recipient-data responses.
// GetRecipientList is a read-only query even though the provider accepts POST.
export async function probeIsnetSessionHealth(
  fetcher:typeof fetch,endpoint:string,token:string,companyId:string,timeoutMs=6000,
) {
  const base={status:"UNVERIFIED",connected:false,lastVerifiedAt:null as string|null,sourceError:null as string|null};
  if(!token||!companyId)return base;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher(endpoint,{
      method:"POST",signal:controller.signal,
      headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+token,Token:token},
      body:JSON.stringify({CompanyId:Number(companyId)}),
    });
    if(response.status===401||response.status===403)
      return {...base,status:"SESSION_INVALID",sourceError:"HTTP "+response.status};
    if(!response.ok)return {...base,status:"ERROR",sourceError:"HTTP "+response.status};
    let payload:any;
    try{payload=await response.json()}catch{return {...base,status:"ERROR",sourceError:"INVALID_RESPONSE"}}
    const result=payload?.Result??payload?.result;
    if(result!==undefined&&result!==null&&![0,"0","success","Success",true].includes(result))
      return {...base,status:"ERROR",sourceError:"PROVIDER_REJECTED"};
    return {...base,status:"CONNECTED",connected:true,lastVerifiedAt:new Date().toISOString()};
  }catch(e:any){
    return {...base,status:e?.name==="AbortError"?"TIMEOUT":"ERROR",
      sourceError:e?.name==="AbortError"?"TIMEOUT":"NETWORK_ERROR"};
  }finally{clearTimeout(timeout)}
}
