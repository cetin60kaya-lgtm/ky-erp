/** Validated, conservative projections of KY ERP admin and Windows source data. */
export const isManager=(role)=>["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"]
  .includes(String(role||"").trim().toUpperCase().replace(/İ/g,"I"));
export const isOwner=(role)=>["SUPER_ADMIN","ADMIN"]
  .includes(String(role||"").trim().toUpperCase().replace(/İ/g,"I"));
export function rowsOf(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.items))return payload.items;
  if(Array.isArray(payload?.rows))return payload.rows;
  throw Error("PDKS_YONETIM_KAYNAK_SEMASI_BELIRSIZ");
}
export const companyKey=(row)=>String(row?.slug||row?.kod||row?.mainCompanySlug||row?.id||"").trim();
export function scopeCompanies(payload,activeCompany,role){
  const rows=rowsOf(payload);
  if(!activeCompany)throw Error("PDKS_FIRMA_KAPSAMI_GEREKLI");
  return rows.filter(row=>isOwner(role) ||
    [row?.slug,row?.kod,row?.id,row?.mainCompanySlug].some(x=>String(x||"")===activeCompany));
}
export function scopeUsers(payload,activeCompany,role){
  const rows=rowsOf(payload);
  if(!activeCompany||!isManager(role))throw Error("PDKS_KULLANICI_YETKISI_GEREKLI");
  return rows.filter(row=>{
    if(["SUPER_ADMIN","ADMIN"].includes(String(row?.role||"").toUpperCase()))return false;
    return isOwner(role) || String(row?.mainCompanySlug||"")===activeCompany;
  });
}
export function normalizePermissions(payload){
  const rows=rowsOf(payload);
  return rows.filter(row=>typeof row?.moduleKey==="string").map(row=>({
    moduleKey:row.moduleKey,
    canView:row.canView===true,canCreate:row.canCreate===true,
    canUpdate:row.canUpdate===true,canDelete:row.canDelete===true,
    canApprove:row.canApprove===true,
  }));
}
export function backupHealth(row){
  const status=String(row?.status||"").trim().toUpperCase();
  if(["FAILED","ERROR","CORRUPT"].includes(status))return "Hata";
  if(!["COMPLETED","READY","SUCCESS"].includes(status))return "Tamamlanma doğrulanmadı";
  const integrity=row?.integrityVerified===true || row?.verified===true;
  return integrity?"Sağlama doğrulandı":"Tamamlandı · bütünlük kanıtı yok";
}
export function projectCloudEvents(payload){
  if(payload?.complete!==true||payload?.source!=="D1_UNIFIED_OUTBOX_ONLY"||
    !Array.isArray(payload?.recent)||payload?.productionApproved!==false)
    throw Error("PDKS_CLOUD_YANIT_DOGRULANAMADI");
  const safeCode=(value)=>/^[A-Z][A-Z0-9_:-]{0,79}$/.test(String(value||""))?String(value):"REDACTED";
  return payload.recent.map(row=>({
    at:row.acknowledgedAt||row.nextAttemptAt||row.createdAt||"",
    source:"Cloud D1",state:["FAILED","PENDING","CLAIMED","ACKED"].includes(row.state)?row.state:"UNKNOWN",
    code:row.errorCode?safeCode(row.errorCode):row.state==="ACKED"?"ACK_CONFIRMED":"OUTBOX",
    attempts:Number.isSafeInteger(row.attempts)&&row.attempts>=0?row.attempts:null,
  }));
}
export function projectLocalHealth(payload){
  if(payload?.schema!=="KY_PDKS_LOCAL_DIAGNOSTICS_V1"||
     payload?.scope!=="LOCAL_ONLY"||payload?.liveWritesEnabled!==false)
    throw Error("PDKS_YEREL_TANI_YANIT_DOGRULANAMADI");
  const valid=(n)=>Number.isSafeInteger(n)&&n>=0;
  if(!valid(payload.received)||!valid(payload.applied)||
     !valid(payload.pendingAcks)||!valid(payload.localErrors))
    throw Error("PDKS_YEREL_TANI_SAYAC_GECERSIZ");
  return {
    heartbeat:payload.heartbeat==="RECENT"?"Son heartbeat mevcut":
      payload.heartbeat==="STALE"?"Heartbeat eski":"Agent durumu doğrulanmadı",
    lastCompletedAt:typeof payload.lastCompletedAt==="string"?payload.lastCompletedAt:null,
    lastResult:typeof payload.lastResult==="string" &&
      /^[A-Z0-9_]{3,70}$/.test(payload.lastResult)?payload.lastResult:"REDACTED",
    received:payload.received,applied:payload.applied,
    pendingAcks:payload.pendingAcks,localErrors:payload.localErrors,
    source:"LOCAL_ONLY",
  };
}
