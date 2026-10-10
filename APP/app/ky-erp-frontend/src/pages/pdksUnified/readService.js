/**
 * KY PDKS Unified authenticated read service (single runtime import).
 *
 * No writes here. The production Firebird/TNF correction engine and terminal
 * ingestion are separate protected services. D1 views have NO FDB/TNF ACK.
 */
import {
  getPdksAttendance,getPdksPeople,getPdksProfile,
  getPdksPayroll,getPdksAuditLogs,getPdksModernConfig,getPdksCorrections,
} from "../../services/pdksApi";
import {apiGet} from "../../utils/api";
import {signatureRowsFromDays} from "./payrollEvidence.js";
import {dailyReportRows} from "./reportProjection.js";
const fresh=(path,params)=>apiGet(path,params,{forceFresh:true,cache:false})
  .then((response)=>response?.ok===true && Object.hasOwn(response,"data")?response.data:response);

export const readLiveDashboard=(params)=>fresh("/ik/personnel-control/dashboard-live",params);
export const readCardEvents=(params)=>fresh("/ik/personnel-control/card-events",params);
export const readCloudSyncStatus=(params)=>fresh("/ik/personnel-control/unified/commands/sync/status",params);
export const readPeople=(params)=>getPdksPeople(params);
export const readProfile=(params)=>getPdksProfile(params);
export const readDays=(personId,year,month,params)=>
  getPdksAttendance(personId,year,month,params);

const period=(year,month)=>String(year)+"-"+String(month).padStart(2,"0");
const safeNumber=(value)=>
  value===null || value===undefined || value==="" ? null :
    Number.isFinite(Number(value)) ? Number(value) : null;

/**
 * True monthly card activity, never from /operations/month (that endpoint
 * contains adjustments+period lock, NOT worked day summaries).
 *
 * Each employee's authenticated attendance-v2 response is accepted in full.
 * One failed response aborts the report. Never present a partial report as a
 * complete month; no artificial card punches or arithmetic estimates.
 */
export async function readCompleteMonth({mainCompanyId,year,month},options={}){
  const people=await readPeople({mainCompanyId,year,month});
  if(!Array.isArray(people))throw new Error("PDKS_AYLIK_PERSONEL_BICIMI_GECERSIZ");
  if(people.length>500)throw new Error("PDKS_AYLIK_PERSONEL_KAPSAMI_COK_GENIS");
  const batches=[];
  for(let i=0;i<people.length;i+=4)batches.push(people.slice(i,i+4));
  const rows=[];
  const signatureRows=[];
  const dailyRows=[];
  for(const batch of batches){
    if(options.isCancelled?.())throw new Error("PDKS_AYLIK_ISTEK_IPTAL");
    const results=await Promise.all(batch.map((person)=>
      readDays(person.id,year,month,{mainCompanyId}).then((response)=>({person,response}))));
    for(const {person,response} of results) {
      if(!response?.summary||!Array.isArray(response?.days))
        throw new Error("PDKS_AYLIK_EKSIK_OZET_VEYA_GUN");
      const summary=response.summary;
      if(options.includeSignatures)signatureRows.push(...signatureRowsFromDays(person,response.days,{year,month}));
      if(options.includeDaily)dailyRows.push(...dailyReportRows(person,response.days,{year,month}));
      rows.push({
        _id:String(person.id),cardNo:person.cardNo||null,
        fullName:person.fullName||null,
        workedDays:safeNumber(summary.workedDays),
        annualLeaveDays:safeNumber(summary.annualLeaveDays),
        overtimeMinutes:safeNumber(summary.overtimeMinutes),
        missingPunchDays:safeNumber(summary.missingPunchDays),
        period:period(year,month),report:"D1 ön puantaj taslağı",
        sourceStatus:"Vardiya/FDB/TNF mutabakatı yapılmadı",
      });
    }
  }
  return {complete:true,rows,signatureRows:options.includeSignatures?signatureRows:undefined,
    dailyRows:options.includeDaily?dailyRows:undefined,
    scannedPeople:people.length,period:period(year,month),
    localReconciled:false,approvedForPayroll:false,
    source:"D1_ATTENDANCE_V2_UNRECONCILED"};
}

/**
 * Explicitly read only the source supported by the existing API.
 * Privileged payroll requires BOTH the profile's non-audit status and the
 * server's FULL permission check. UI alone never grants access.
 */
export async function readTabSource(source,{mainCompanyId,year,month,personId}={},options={}){
  if(!mainCompanyId)throw new Error("PDKS_FIRMA_SECILMEDI");
  const p={mainCompanyId,year,month};
  switch(source){
    case "masters":return fresh("/ik/personnel-control/pdks-masters",p);
    case "holidays":return fresh("/ik/personnel-control/operations/holidays",{mainCompanyId,year});
    case "leaves":return fresh("/ik/personnel-control/operations/leaves",{
      mainCompanyId,from:`${year}-01-01`,to:`${year}-12-31`});
    case "month":case "month-adjustments":
      return fresh("/ik/personnel-control/operations/month",p);
    case "monthly-attendance":return readCompleteMonth(p,options);
    case "signature-month":return readCompleteMonth(p,{...options,includeSignatures:true});
    case "daily-report":return readCompleteMonth(p,{...options,includeDaily:true});
    case "audit":return getPdksAuditLogs({mainCompanyId,
      period:period(year,month),limit:200});
    case "config":return getPdksModernConfig({mainCompanyId});
    case "corrections":
      if(!personId)throw new Error("PDKS_DUZELTME_PERSONEL_SECIN");
      return getPdksCorrections(personId,p);
    case "payroll":
      if(options.audit)throw new Error("PDKS_BORDRO_YETKISI_YOK");
      return getPdksPayroll(p);
    default:throw new Error("PDKS_READ_ENDPOINT_NOT_AVAILABLE");
  }
}
