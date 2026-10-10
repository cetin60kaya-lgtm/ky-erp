/**
 * Pure D1 amount classification; source numbers are displayed as D1
 * preliminary figures, NOT evidence of approved payroll or a paid wage.
 */
export const normalizePayrollAdjustmentType=(value)=>String(value??"")
  .trim().toLocaleUpperCase("tr-TR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/İ/g,"I");
const sourceAmount=(value)=>{
  const number=Number(value);
  return Number.isFinite(number)?number:0;
};
export function summarizePayrollAdjustments(rows){
  if(!Array.isArray(rows))throw Error("PDKS_BORDRO_ADJUSTMENTS_INVALID");
  const entries=rows.map(row=>({
    type:normalizePayrollAdjustmentType(row?.adjustmentType),
    amount:sourceAmount(row?.amount),
  }));
  const sum=(predicate)=>entries.reduce((total,row)=>
    total+(predicate(row.type)?row.amount:0),0);
  return Object.freeze({
    overtimeAmount:sum(kind=>kind.includes("MESAI")),
    advanceAmount:sum(kind=>kind.includes("AVANS")),
    deductionAmount:sum(kind=>kind.includes("KESINTI")),
    garnishmentAmount:sum(kind=>/ICRA|HACIZ/.test(kind)),
    besAmount:sum(kind=>kind.includes("BES")),
    roadAdjustmentAmount:sum(kind=>kind.includes("YOL")),
    mealAmount:sum(kind=>kind.includes("YEMEK")),
  });
}
