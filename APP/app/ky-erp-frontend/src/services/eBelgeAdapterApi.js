import {apiGet,apiPut} from "../utils/api";
const tenantParams=(company)=>{
 const mainCompanySlug=company?.slug||company?.mainCompanySlug||company?.id||company?.mainCompanyId||"";
 if(!mainCompanySlug)throw new Error("Firma seçilmeden adaptör yönetilemez.");
 return {mainCompanySlug};
};
const unwrap=(payload)=>payload?.ok===true&&Object.prototype.hasOwnProperty.call(payload,"data")?payload.data:payload;
export const getCompanyEBelgeAdapters=(company)=>
 apiGet("/e-belge/adapters",tenantParams(company),{timeoutMs:30000,forceFresh:true}).then(unwrap);
export const setCompanyEBelgeAdapter=(company,key,selected)=>
 apiPut("/e-belge/adapters/"+encodeURIComponent(key),{...tenantParams(company),selected},{timeoutMs:30000}).then(unwrap);
