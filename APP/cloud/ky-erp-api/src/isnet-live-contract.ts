// Provider-supplied production service addresses (27.11.2026). No TEST fallback.
// WSDL reachability is not authenticated company or document acceptance.
export const LIVE_ENDPOINTS=Object.freeze({
 InvoiceService:"https://einvoiceservice.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc",
 AddressBookService:"https://einvoiceservice.isnet.net.tr/AddressBookService/ServiceContract/AddressBookService.svc"
});
export const LIVE_NOT_BEFORE=Date.parse("2026-11-27T17:00:00Z");
export const PROBE_TTL=15*60*1000;
const names=Object.keys(LIVE_ENDPOINTS);
type ServiceName=keyof typeof LIVE_ENDPOINTS;
type ServiceStatus="WSDL_DISCOVERED"|"HTTP_ERROR"|"NETWORK_UNAVAILABLE"|"REDIRECT_REJECTED"|"INVALID_WSDL"|"SIZE_LIMIT";
export type LiveProbe={checkedAt:number;services:{service:ServiceName;status:ServiceStatus;httpStatus:number|null;sha256:string|null;operationCount:number}[]};
const allowed=new Set(["WSDL_DISCOVERED","HTTP_ERROR","NETWORK_UNAVAILABLE","REDIRECT_REJECTED","INVALID_WSDL","SIZE_LIMIT"]);
export function normalizeLiveProbe(value:unknown,now:number):LiveProbe|null{
 if(!value||typeof value!=="object"||now<LIVE_NOT_BEFORE)return null;
 const v=value as Record<string,any>;
 if(!Number.isSafeInteger(v.checkedAt)||v.checkedAt<LIVE_NOT_BEFORE||v.checkedAt>now||now-v.checkedAt>PROBE_TTL||!Array.isArray(v.services)||v.services.length!==2)return null;
 const services:LiveProbe["services"]=[];
 for(const x of v.services){
  if(!x||!names.includes(x.service)||services.some(s=>s.service===x.service)||!allowed.has(x.status))return null;
  if(x.httpStatus!==null&&(!Number.isInteger(x.httpStatus)||x.httpStatus<100||x.httpStatus>599))return null;
  if(!Number.isSafeInteger(x.operationCount)||x.operationCount<0||x.operationCount>10000)return null;
  const good=x.status==="WSDL_DISCOVERED";
  if(good?(x.httpStatus!==200||typeof x.sha256!=="string"||!/^[a-f0-9]{64}$/.test(x.sha256)||x.operationCount<1):(x.sha256!==null||x.operationCount!==0))return null;
  services.push({service:x.service,status:x.status,httpStatus:x.httpStatus,sha256:x.sha256,operationCount:x.operationCount});
 }
 return {checkedAt:v.checkedAt,services};
}
