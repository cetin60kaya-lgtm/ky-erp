/**
 * Provider-neutral deterministic audit of OCR output. Confidence is evidence
 * reported by the OCR adapter, never synthesized from populated JSON fields.
 * This module never sends documents or changes accounting balances.
 */
type Row = Record<string, any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
const val=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
const addUnique=(arr:string[],name:string)=>{if(!arr.includes(name))arr.push(name)};

export function reviewAccountingOcr(row:Row,kind="FATURA",limit=0.75):string[]{
  const issues:string[]=[];
  const dispatch=/IRSALIYE|DESPATCH|DISPATCH/i.test(kind);
  const no=txt(row?.documentNo);
  if(no.length<3||no.length>60||!/[0-9]/.test(no))addUnique(issues,"DOCUMENT_NO_REVIEW");
  const tax=txt(row?.partyTaxNo).replace(/\D/g,"");
  if(!/^(?:\d{10}|\d{11})$/.test(tax))addUnique(issues,"COUNTERPARTY_VKN_REVIEW");
  if(!txt(row?.partyName))addUnique(issues,"COUNTERPARTY_NAME_MISSING");
  const date=txt(row?.issueDate).slice(0,10);
  const parsed=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+"T00:00:00Z"):null;
  if(!parsed||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)
    addUnique(issues,"ISSUE_DATE_REVIEW");
  const lines=Array.isArray(row?.lines)?row.lines:[];
  if(!lines.length)addUnique(issues,"LINES_MISSING");
  if(lines.some((line:Row)=>!txt(line?.description)||!(val(line?.quantity)>0)))
    addUnique(issues,"LINE_QUANTITY_OR_DESCRIPTION_REVIEW");
  if(!dispatch){
    const total=val(row?.payableTotal);
    if(!(total>0))addUnique(issues,"INVOICE_PAYABLE_REVIEW");
    const subtotal=val(row?.subtotal),vat=val(row?.taxTotal),discount=val(row?.discountTotal??0);
    if(subtotal>0&&total>0&&Number.isFinite(vat)&&Number.isFinite(discount)){
      const expected=subtotal+vat-discount;
      const tolerance=Math.max(0.5,Math.abs(total)*0.015);
      // Withholding or other adjustment legitimately causes this discrepancy;
      // it requires a user review rather than a silent correction.
      if(Math.abs(expected-total)>tolerance)addUnique(issues,"INVOICE_ARITHMETIC_REVIEW");
    }
  }
  if(!(val(row?.extractionConfidence)>=(limit>0&&limit<=1?limit:.75)))
    addUnique(issues,"OCR_CONFIDENCE_LOW");
  return issues;
}
