import test from "node:test";
import assert from "node:assert/strict";
import {validateUnifiedCommand} from "./ik-pdks-unified-contract.mjs";
const note="Yönetici tarafından inceleme sonrasında onaylandı";
const forms={
  "work-group":{code:"SABAH",name:"Sabah Vardiyası",entryTime:"08:30",exitTime:"19:00",lateTolerance:5,earlyTolerance:10,reason:note},
  "personnel-group":{code:"URETIM",name:"Üretim",personnelClass:"BLUE_COLLAR",requirePunch:true,reason:note},
  "service":{code:"S1",name:"Fabrika servisi",routeNote:"Ana yol",reason:note},
  "assign-work-group":{employeeId:"e1",groupId:"g1",reason:note},
  "assign-personnel-group":{employeeId:"e1",personnelGroupId:"p1",reason:note},
  "assign-service":{employeeId:"e1",serviceId:"s1",reason:note},
  "holiday":{date:"2026-10-29",name:"Resmî tatil",halfDay:false,note},
  "leave":{employeeId:"e1",startDate:"2026-10-12",endDate:"2026-10-15",recordType:"YILLIK",note},
  "advance":{employeeId:"e1",date:"2026-10-12",amount:500.25,note},
  "deduction":{employeeId:"e1",date:"2026-10-12",amount:15.75,note},
  "overtime":{employeeId:"e1",date:"2026-10-12",hourOrDay:2,amount:225.3,
    adjustmentType:"Hafta İçi Mesai",paymentMethod:"Bordro",note:"Mesai oranı: %50 | "+note},
};
test("one canonical command contract validates all 11 real PDKS operations",()=>{
  assert.equal(Object.keys(forms).length,11);
  for(const [action,raw] of Object.entries(forms)){
    const p=validateUnifiedCommand(action,raw);
    assert.ok(Object.isFrozen(p),action);
    assert.ok(Object.keys(p).length>=3,action);
    assert.equal(p.requestId,undefined,action);
    assert.equal(p.terminalRaw,undefined,action);
  }
});
test("all amounts retain exact approved decimal without guessing hourly wage",()=>{
  const advance=validateUnifiedCommand("advance",forms.advance);
  assert.equal(advance.amount,500.25);
  assert.equal(validateUnifiedCommand("deduction",forms.deduction).amount,15.75);
  assert.equal(validateUnifiedCommand("overtime",forms.overtime).amount,225.3);
  assert.equal(validateUnifiedCommand("overtime",forms.overtime).hourOrDay,2);
  assert.throws(()=>validateUnifiedCommand("advance",{...forms.advance,amount:-10}),/AMOUNT/);
  assert.throws(()=>validateUnifiedCommand("advance",{...forms.advance,amount:1.234}),/AMOUNT/);
});
test("invalid dates and unauthorized implicit holiday policies are rejected",()=>{
  assert.throws(()=>validateUnifiedCommand("leave",{...forms.leave,startDate:"2026-02-30"}),/INVALID_DATE/);
  assert.throws(()=>validateUnifiedCommand("leave",{...forms.leave,startDate:"2026-11-16"}),/LEAVE_RANGE/);
  assert.throws(()=>validateUnifiedCommand("holiday",{...forms.holiday,halfDay:true,note:"Kısa"}),/PDKS_REASON|HALF_DAY/);
});
test("overtime %50/%100 requires explicit supported rate + approval reason",()=>{
  const a=validateUnifiedCommand("overtime",forms.overtime);
  assert.match(a.note,/^Mesai oranı: %50/);
  assert.throws(()=>validateUnifiedCommand("overtime",{
    ...forms.overtime,note:"Mesai oranı: %75 | "+note}),/RATE/);
  assert.throws(()=>validateUnifiedCommand("overtime",{
    ...forms.overtime,paymentMethod:"Bilinmeyen"}),/PAYMENT/);
});
test("unknown operation, injection-prone codes, undefined employee are blocked",()=>{
  assert.throws(()=>validateUnifiedCommand("delete-raw",{employeeId:"e1"}),/ACTION_NOT_SUPPORTED/);
  assert.throws(()=>validateUnifiedCommand("work-group",{
    ...forms["work-group"],code:"../x"}),/CODE_INVALID/);
  assert.throws(()=>validateUnifiedCommand("assign-service",{
    ...forms["assign-service"],employeeId:""}),/PERSON_REQUIRED/);
  assert.throws(()=>validateUnifiedCommand("holiday",null),/PAYLOAD_INVALID/);
});
test("input objects are not modified and extraneous client status is discarded",()=>{
  const raw={...forms.advance,status:"APPROVED",salary:25000,cardNo:"00003"};
  const output=validateUnifiedCommand("advance",raw);
  assert.equal(output.salary,undefined);
  assert.equal(output.status,undefined);
  assert.equal(output.cardNo,undefined);
  assert.equal(raw.salary,25000);
});
