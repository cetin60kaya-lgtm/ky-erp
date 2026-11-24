export function selectProfile(profiles,companyId){
  return profiles.find(p=>p.companyId===companyId&&companyId&&p.isDefault)||profiles.find(p=>!p.companyId&&p.isDefault)||null;
}
export function localSevkTime(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:parts.year+"-"+parts.month+"-"+parts.day,time:parts.hour+":"+parts.minute};
}
export const sampleReason="Test numuneleri bedelsiz olarak elden teslim edilmiştir.";
export const blankProfile=()=>({id:"",name:"",companyId:"",isDefault:true,driver:"",driverId:"",carrierTaxNo:"",plate:"",carrierName:"",trailerPlate:"",deliveryMethod:"ELDEN_TESLIM",deliveryAddress:"",dispatchNote:"",invoiceNote:"",vat:20,scenario:"TICARI",sampleProductId:"",sampleReason,sampleCode:"",sampleQuantity:""});
