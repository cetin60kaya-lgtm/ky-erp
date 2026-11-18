type Row=Record<string,any>;
const str=(v:unknown)=>v==null?"":String(v).trim();
const code=(v:unknown)=>str(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const permittedModules=new Set(["DESEN","URETIM","IMALAT","BOYAHANE","MUHASEBE","E-BELGE","ILETISIM"]);
const privileged=new Set(["SUPER_ADMIN","ADMIN","OWNER","COMPANY_OWNER","COMPANY_ADMIN"]);
const granted=(v:unknown)=>v===true||v===1||v==="1";

// A model identity is needed by any participating department, but this endpoint
// NEVER grants access to another department's operational records or edits.
export function model360CanReadIdentity(user:Row|null|undefined){
 if(!user)return false;
 if(privileged.has(code(user.role)))return true;
 if(permittedModules.has(code(user.role)))return true;
 return (Array.isArray(user.permissions)?user.permissions:[]).some((p:Row)=>
   permittedModules.has(code(p.moduleKey||p.module_key))&&
   (granted(p.canView)||granted(p.can_view)||granted(p.canCreate)||granted(p.can_create)||granted(p.canUpdate)||granted(p.can_update)));
}
export function model360PublicIdentity(row:Row){
 let meta:Row={};
 try{const parsed=JSON.parse(str(row.raw)||"{}");if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))meta=parsed;}
 catch{}
 const img=str(row.image_url||meta.imageUrl||meta.modelImageUrl||meta.mainImage?.previewUrl||meta.mainImage?.thumbnailUrl);
 return {
   id:str(row.id),modelName:str(row.model_name),modelCode:str(row.model_code),
   companyId:str(row.company_id||row.customer_id),companyName:str(row.customer_name||meta.companyName),
   orderNo:str(row.order_no||meta.orderNo),status:str(row.status),imageUrl:img,
   source:"CANONICAL_MODEL_RECORDS",
 };
}
