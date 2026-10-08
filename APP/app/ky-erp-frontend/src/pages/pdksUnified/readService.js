/**
 * Shared authenticated, read-only PDKS facade. This module is lazily imported
 * only in the protected KY ERP host. The /pdks-studio preview never imports it.
 */
import {
  getPdksAttendance, getPdksPeople, getPdksProfile,
  getPdksMasters, getPdksAdvancedMonth, getPdksPayroll,
  getPdksLeaveCenter, getPdksAuditLogs, getPdksHolidays,
  getPdksModernConfig,
} from "../../services/pdksApi";

export const readPeople=(params)=>getPdksPeople(params);
export const readProfile=(params)=>getPdksProfile(params);
export const readDays=(personId,year,month,params)=>
  getPdksAttendance(personId,year,month,params);

const fullYear=(year)=>({
  from:String(year)+"-01-01",to:String(year)+"-12-31",
});
export async function readTabSource(source, {mainCompanyId,year,month}={}, {audit=false}={}){
  if(!mainCompanyId)throw new Error("PDKS_FIRMA_SECILMEDI");
  const params={mainCompanyId,year,month};
  switch(source){
    case "masters": return getPdksMasters(params);
    case "holidays": return getPdksHolidays({mainCompanyId,year});
    case "leaves": return getPdksLeaveCenter({mainCompanyId,...fullYear(year)});
    case "month": return getPdksAdvancedMonth(params);
    case "audit": return getPdksAuditLogs({
      mainCompanyId,period:String(year)+"-"+String(month).padStart(2,"0"),limit:200,
    });
    case "config": return getPdksModernConfig({mainCompanyId});
    case "payroll":
      if(audit)throw new Error("PDKS_BORDRO_YETKISI_YOK");
      return getPdksPayroll(params);
    default:throw new Error("PDKS_READ_ENDPOINT_NOT_AVAILABLE");
  }
}
