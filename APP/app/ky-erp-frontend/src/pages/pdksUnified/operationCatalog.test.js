import test from "node:test";
import assert from "node:assert/strict";
import {OPERATION_CATALOG,operationsForTab,operationById,makeOperationPreview}
  from "./operationCatalog.js";

const ctx={company:"hakan-emp",year:2026,month:10,
  people:[{id:"p1",cardNo:"00003",fullName:"Gerçek Personel"}],
  masters:{
    groups:[{id:"g1",code:"A",name:"Gündüz",active:1}],
    personnelGroups:[{id:"pg1",code:"P",name:"Üretim",active:1}],
    services:[{id:"s1",code:"S",name:"Servis",active:1}],
  }};
const reason="Yönetici tarafından onaylanan yeni işlem";
const form=(id)=>({
  "work-group":{code:"VARDIYA_1",name:"Gündüz",entryTime:"08:30",exitTime:"19:00",
    lateTolerance:"5",earlyTolerance:"10",reason},
  "personnel-group":{code:"URETIM",name:"Üretim Personeli",personnelClass:"BLUE_COLLAR",
    requirePunch:"true",reason},
  "assign-work-group":{employeeId:"p1",groupId:"g1",reason},
  "assign-personnel-group":{employeeId:"p1",personnelGroupId:"pg1",reason},
  service:{code:"SERVIS_1",name:"Servis 1",routeNote:"Onaylı güzergâh",reason},
  "assign-service":{employeeId:"p1",serviceId:"s1",reason},
  holiday:{date:"2026-10-29",name:"Resmî Tatil",halfDay:"false",note:reason},
  leave:{employeeId:"p1",recordType:"YILLIK",startDate:"2026-10-05",
    endDate:"2026-10-07",note:reason},
  advance:{employeeId:"p1",date:"2026-10-05",amount:"500.50",note:reason},
  overtime:{employeeId:"p1",date:"2026-10-05",
    adjustmentType:"Hafta İçi Mesai",hourOrDay:"2",overtimeRate:"50",amount:"500",
    paymentMethod:"Bordro",note:reason},
  deduction:{employeeId:"p1",date:"2026-10-05",amount:"150",note:reason},
})[id];

test("one operation catalog covers eleven distinct verified Cloud D1 workflows",()=>{
  assert.equal(OPERATION_CATALOG.length,11);
  assert.equal(new Set(OPERATION_CATALOG.map(x=>x.id)).size,11);
  assert.ok(OPERATION_CATALOG.every(x=>x.scope==="CLOUD_D1_ONLY"));
  assert.equal(operationsForTab("departments").length,4);
  assert.equal(operationsForTab("routes").length,2);
  assert.equal(operationsForTab("leave").length,1);
  assert.equal(operationsForTab("holidays").length,1);
  assert.equal(operationsForTab("advances").length,1);
  assert.equal(operationsForTab("overtime").length,1);
  assert.equal(operationsForTab("deductions").length,1);
  assert.equal(operationsForTab("punches").length,0);
  assert.equal(operationsForTab("closing").length,0);
});
test("each operation compiles immutable preview and preserves source-only semantics",()=>{
  for(const operation of OPERATION_CATALOG){
    const preview=makeOperationPreview(operation.id,form(operation.id),ctx);
    assert.equal(preview.id,operation.id);
    assert.equal(preview.company,"hakan-emp");
    assert.equal(preview.source,"CLOUD_D1_ONLY");
    assert.ok(Object.isFrozen(preview));
    assert.ok(Object.isFrozen(preview.payload));
    assert.equal(preview.payload.mainCompanyId,"hakan-emp");
    assert.equal(preview.payload.punches,undefined);
    assert.equal(preview.payload.FDB,undefined);
    assert.equal(preview.payload.TNF,undefined);
  }
});
test("physical punches and guessed times never become operation types",()=>{
  assert.equal(operationById("physical-punch"),null);
  assert.equal(operationById("manual-punch"),null);
  assert.equal(operationById("payroll-close"),null);
  assert.throws(()=>makeOperationPreview("manual-punch",{},ctx),/bulunamadı/);
});
test("unknown person or shift is rejected before any API transport",()=>{
  assert.throws(()=>makeOperationPreview("assign-work-group",{
    ...form("assign-work-group"),employeeId:"other-tenant"},ctx),/Personel seçili firma/);
  assert.throws(()=>makeOperationPreview("assign-work-group",{
    ...form("assign-work-group"),groupId:"other-tenant-group"},ctx),/mevcut değil/);
  assert.throws(()=>makeOperationPreview("assign-service",form("assign-service"),{
    ...ctx,masters:{} }),/yüklenmedi/);
});
test("validation rejects dates, unsafe code, negative advance and missing approval",()=>{
  assert.throws(()=>makeOperationPreview("leave",{
    ...form("leave"),startDate:"2026-02-30"},ctx),/geçersiz tarih/);
  assert.throws(()=>makeOperationPreview("advance",{
    ...form("advance"),date:"2026-09-03"},ctx),/seçili ay/);
  assert.throws(()=>makeOperationPreview("advance",{
    ...form("advance"),amount:"-2"},ctx),/Pozitif avans/);
  assert.throws(()=>makeOperationPreview("work-group",{
    ...form("work-group"),entryTime:"25:00"},ctx),/giriş saati/);
  assert.throws(()=>makeOperationPreview("work-group",{
    ...form("work-group"),code:"/../"},ctx),/Kod/);
  assert.throws(()=>makeOperationPreview("service",{
    ...form("service"),reason:"kısa"},ctx),/en az 8/);
});
test("half-day holiday requires explicit workplace working decision",()=>{
  const input={...form("holiday"),halfDay:"true",note:"Kısa"};
  assert.throws(()=>makeOperationPreview("holiday",input,ctx),/en az 8|en az 20/);
  const p=makeOperationPreview("holiday",{
    ...input,note:"İşyerinde yarım gün çalışılacak, çıkış 13:00"},ctx);
  assert.equal(p.payload.halfDay,true);
});
test("personnel group is not SGK classification",()=>{
  const p=makeOperationPreview("personnel-group",form("personnel-group"),ctx);
  assert.equal(p.payload.requirePunch,true);
  assert.equal(p.payload.sgkStatus,undefined);
});


test("creating a matching master code cannot silently overwrite existing data",()=>{
  const context={...ctx,masters:{
    ...ctx.masters,
    groups:[...ctx.masters.groups,{id:"old",code:"VARDIYA_1",name:"Eski Vardiya"}],
  }};
  assert.throws(()=>makeOperationPreview("work-group",form("work-group"),context),/zaten kayıtlı/);
  assert.throws(()=>makeOperationPreview("service",form("service"),{
    ...ctx,masters:{...ctx.masters,services:[{id:"old",code:"SERVIS_1"}]},
  }),/zaten kayıtlı/);
  assert.throws(()=>makeOperationPreview("personnel-group",form("personnel-group"),{
    ...ctx,masters:{...ctx.masters,personnelGroups:[{id:"old",code:"URETIM"}]},
  }),/zaten kayıtlı/);
});

test("overtime must have explicit approved hours and amount, never invented rates",()=>{
  const entry=makeOperationPreview("overtime",form("overtime"),ctx);
  assert.equal(entry.payload.hourOrDay,2);
  assert.equal(entry.payload.amount,500);
  assert.equal(entry.payload.adjustmentType,"Hafta İçi Mesai");
  assert.equal(entry.payload.approvedRate,undefined);
  assert.equal(entry.payload.overtimeRate,undefined);
  assert.match(entry.payload.note,/Mesai oranı: %50/);
  assert.throws(()=>makeOperationPreview("overtime",{
    ...form("overtime"),hourOrDay:"25"},ctx),/en fazla 24/);
  assert.throws(()=>makeOperationPreview("overtime",{
    ...form("overtime"),amount:"-1"},ctx),/Pozitif/);
});
test("deduction amount is positive and type fixed to Kesinti, not arbitrary data",()=>{
  const p=makeOperationPreview("deduction",form("deduction"),ctx);
  assert.equal(p.payload.adjustmentType,"Kesinti");
  assert.equal(p.payload.amount,150);
  assert.equal(p.payload.payrollEffect,undefined);
});
