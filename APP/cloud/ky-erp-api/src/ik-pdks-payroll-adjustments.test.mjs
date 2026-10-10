import test from "node:test";
import assert from "node:assert/strict";
import {normalizePayrollAdjustmentType,summarizePayrollAdjustments}
  from "./ik-pdks-payroll-adjustments.mjs";

test("Turkish dot and dotless I never drop mesai, kesinti, icra/haciz",()=>{
  assert.equal(normalizePayrollAdjustmentType("Hafta İçi Mesai"),"HAFTA ICI MESAI");
  assert.equal(normalizePayrollAdjustmentType("Kesinti"),"KESINTI");
  assert.equal(normalizePayrollAdjustmentType("İcra"),"ICRA");
  assert.equal(normalizePayrollAdjustmentType("Haciz"),"HACIZ");
});
test("separate real source components without adding advances to wage",()=>{
  const items=[
    {adjustmentType:"Hafta İçi Mesai",amount:500},
    {adjustmentType:"Pazar mesaisi",amount:1000},
    {adjustmentType:"Avans",amount:400},
    {adjustmentType:"Kesinti",amount:120},
    {adjustmentType:"İcra",amount:80},
    {adjustmentType:"BES",amount:35},
    {adjustmentType:"Yol",amount:300},
    {adjustmentType:"Yemek",amount:200},
  ];
  const summary=summarizePayrollAdjustments(items);
  assert.equal(summary.overtimeAmount,1500);
  assert.equal(summary.advanceAmount,400);
  assert.equal(summary.deductionAmount,120);
  assert.equal(summary.garnishmentAmount,80);
  assert.equal(summary.besAmount,35);
  assert.equal(summary.roadAdjustmentAmount,300);
  assert.equal(summary.mealAmount,200);
});
test("invalid source type rejects, malformed money is not invented",()=>{
  assert.throws(()=>summarizePayrollAdjustments({adjustmentType:"Mesai"}),/PDKS_BORDRO_ADJUSTMENTS_INVALID/);
  assert.equal(summarizePayrollAdjustments([{adjustmentType:"Mesai",amount:"N/A"}]).overtimeAmount,0);
  assert.deepEqual(summarizePayrollAdjustments([]).mealAmount,0);
});
