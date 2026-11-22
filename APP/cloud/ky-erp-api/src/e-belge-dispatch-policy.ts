/** Do not force a goods-receipt/dispatch pairing onto an expense-only bill.
 * Existing dispatch references and any stock/LOT implication always win.
 * Ambiguous/missing routing remains reviewable, never silently waived.
 */
type Line={raw_metadata?:unknown};
const rawOf=(v:unknown):Record<string,unknown>=>{
  if(v&&typeof v==="object"&&!Array.isArray(v))return v as Record<string,unknown>;
  if(typeof v==="string"){try{const x=JSON.parse(v);if(x&&typeof x==="object"&&!Array.isArray(x))return x}catch{}}
  return {};
};
export function dispatchRequirement(references:unknown,lines:Line[]){
  if(Array.isArray(references)&&references.some(x=>String(x||"").trim()))
    return{required:true,reason:"EXPLICIT_REFERENCE"};
  if(!lines.length)return{required:true,reason:"MISSING_LINES"};
  let expenseOnly=true;
  for(const line of lines){
    const raw=rawOf(line.raw_metadata),route=String(raw.routingType||"").trim().toUpperCase();
    if(route!=="EXPENSE")expenseOnly=false;
    if(raw.lotRequired===true || raw.lotCanPostStock===true ||
       ["STOCK","BOYAHANE","CONSUMABLE"].includes(route))
      return{required:true,reason:"PHYSICAL_GOODS"};
  }
  return expenseOnly?{required:false,reason:"EXPENSE_ONLY"}:{required:true,reason:"ROUTING_REVIEW"};
}
