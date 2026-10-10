/**
 * Pure, evidence-gated PDKS payroll adjustment preview.
 * Never fabricates a %50/%100 rate, worked hours, wage or payment.
 * Only explicitly approved, positive source figures enter financial totals.
 */
export const normalizePayrollAdjustmentType=(value)=>String(value??"")
  .trim().toLocaleUpperCase("tr-TR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/İ/g,"I");
const amountOf=value=>
  value===null||value===undefined||value===""||!Number.isFinite(Number(value)) ?
    null:Number(value);
const statusOf=value=>normalizePayrollAdjustmentType(value);
const approved=value=>["APPROVED","ONAYLI","ONAYLANDI"].includes(statusOf(value));
const readRate=note=>{
  const match=String(note??"").match(/Mesai\s+oran[ıi]\s*:\s*%\s*(50|100)\b/i);
  return match?Number(match[1]):null;
};
const empty=()=>({overtimeAmount:0,advanceAmount:0,deductionAmount:0,
  garnishmentAmount:0,besAmount:0,roadAdjustmentAmount:0,mealAmount:0,
  overtimeHours50:0,overtimeHours100:0,overtimeAmount50:0,overtimeAmount100:0,
  overtimeEntries:[],pendingEntries:[],sourceComplete:true});
export function summarizePayrollAdjustments(rows){
  if(!Array.isArray(rows))throw Error("PDKS_BORDRO_ADJUSTMENTS_INVALID");
  const result=empty();
  for(const row of rows){
    const type=normalizePayrollAdjustmentType(row?.adjustmentType);
    const money=amountOf(row?.amount);
    const isOvertime=type.includes("MESAI");
    const rate=isOvertime?readRate(row?.note):null;
    const hours=isOvertime?amountOf(row?.hourOrDay):null;
    const ok=approved(row?.status) && money!==null && money>0 &&
      (!isOvertime || (rate!==null&&hours!==null&&hours>0&&hours<=24));
    if(!ok){
      result.pendingEntries.push(Object.freeze({
        id:String(row?.id??""),adjustmentType:String(row?.adjustmentType??""),
        date:String(row?.date??""),status:String(row?.status??""),
        reason:!approved(row?.status)?"ONAY_KANITI_YOK":
          isOvertime&&rate===null?"MESAI_ORANI_YOK":
          isOvertime&&!(hours>0&&hours<=24)?"ONAYLI_MESAI_SAATI_YOK":
          "TUTAR_KANITI_YOK",
      }));
      result.sourceComplete=false;
      continue;
    }
    if(isOvertime){
      result.overtimeAmount+=money;
      result["overtimeHours"+rate]+=hours;
      result["overtimeAmount"+rate]+=money;
      result.overtimeEntries.push(Object.freeze({
        id:String(row?.id??""),date:String(row?.date??""),rate,
        approvedHours:hours,approvedAmount:money,
        status:String(row.status),source:"D1_ONAYLI_DUZELTME",
      }));
    }else if(type.includes("AVANS"))result.advanceAmount+=money;
    else if(type.includes("KESINTI"))result.deductionAmount+=money;
    else if(/ICRA|HACIZ/.test(type))result.garnishmentAmount+=money;
    else if(type.includes("BES"))result.besAmount+=money;
    else if(type.includes("YOL"))result.roadAdjustmentAmount+=money;
    else if(type.includes("YEMEK"))result.mealAmount+=money;
  }
  return Object.freeze({
    ...result,
    overtimeEntries:Object.freeze(result.overtimeEntries),
    pendingEntries:Object.freeze(result.pendingEntries),
  });
}
