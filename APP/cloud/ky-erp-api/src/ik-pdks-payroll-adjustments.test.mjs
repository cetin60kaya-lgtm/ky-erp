import test from "node:test";
import assert from "node:assert/strict";
import {normalizePayrollAdjustmentType,summarizePayrollAdjustments} from "./ik-pdks-payroll-adjustments.mjs";
test("Turkish dotted and dotless I preserves MESAI KESINTI and ICRA",()=>{
  assert.equal(normalizePayrollAdjustmentType("Hafta İçi Mesai"),"HAFTA ICI MESAI");
  assert.equal(normalizePayrollAdjustmentType("Kesinti"),"KESINTI");
  assert.equal(normalizePayrollAdjustmentType("İcra"),"ICRA");
});
test("only explicitly approved %50 and %100 source overtime hours and wage are summed",()=>{
 const base={status:"APPROVED"};
 const result=summarizePayrollAdjustments([
  {...base,id:"m1",adjustmentType:"Hafta İçi Mesai",amount:500,
    hourOrDay:2,note:"Mesai oranı: %50 | Onaylı"},
  {...base,id:"m2",adjustmentType:"Resmi Tatil Mesai",amount:1000,
    hourOrDay:3,note:"Mesai oranı: %100 | Onaylı"},
  {...base,id:"a1",adjustmentType:"Avans",amount:400},
  {...base,id:"k1",adjustmentType:"Kesinti",amount:120},
  {...base,id:"ic",adjustmentType:"İcra",amount:80},
  {...base,id:"bes",adjustmentType:"BES",amount:35},
  {...base,id:"yol",adjustmentType:"Yol",amount:300},
  {...base,id:"yemek",adjustmentType:"Yemek",amount:200},
 ]);
 assert.equal(result.overtimeAmount,1500);
 assert.equal(result.overtimeHours50,2);
 assert.equal(result.overtimeHours100,3);
 assert.equal(result.overtimeAmount50,500);
 assert.equal(result.overtimeAmount100,1000);
 assert.equal(result.advanceAmount,400);
 assert.equal(result.deductionAmount,120);
 assert.equal(result.garnishmentAmount,80);
 assert.equal(result.besAmount,35);
 assert.equal(result.roadAdjustmentAmount,300);
 assert.equal(result.mealAmount,200);
 assert.equal(result.pendingEntries.length,0);
});
test("missing rate/approved hours/approval is excluded and visibly pending",()=>{
 const result=summarizePayrollAdjustments([
   {id:"m1",adjustmentType:"Mesai",hourOrDay:2,amount:500,status:"PENDING",note:"Mesai oranı: %50"},
   {id:"m2",adjustmentType:"Mesai",hourOrDay:3,amount:600,status:"APPROVED",note:"Onaylı"},
   {id:"m3",adjustmentType:"Mesai",amount:600,status:"APPROVED",note:"Mesai oranı: %100"},
   {id:"m4",adjustmentType:"Mesai",amount:600,hourOrDay:3,status:"APPROVED",note:"Mesai oranı: %75"},
   {id:"k1",adjustmentType:"Kesinti",amount:200,status:""},
 ]);
 assert.equal(result.overtimeAmount,0);
 assert.equal(result.deductionAmount,0);
 assert.equal(result.sourceComplete,false);
 assert.deepEqual(result.pendingEntries.map(x=>x.reason),
 ["ONAY_KANITI_YOK","MESAI_ORANI_YOK","ONAYLI_MESAI_SAATI_YOK","MESAI_ORANI_YOK","ONAY_KANITI_YOK"]);
});
test("unknown values reject or are pending, never invent 0% wage",()=>{
 assert.throws(()=>summarizePayrollAdjustments({}),/PDKS_BORDRO_ADJUSTMENTS_INVALID/);
 const summary=summarizePayrollAdjustments([{adjustmentType:"Mesai",status:"APPROVED",
   hourOrDay:2,note:"Mesai oranı: %50",amount:"N/A"}]);
 assert.equal(summary.overtimeAmount,0);
 assert.equal(summary.pendingEntries[0].reason,"TUTAR_KANITI_YOK");
});
