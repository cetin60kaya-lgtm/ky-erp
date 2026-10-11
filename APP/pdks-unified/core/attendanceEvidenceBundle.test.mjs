import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAttendanceEvidenceBundle} from "./attendanceEvidenceBundle.mjs";

const date="2026-10-08";
const source=(source,eventId,timestamp,direction,extras={})=>({
  source,eventId,timestamp,...(direction?{direction}:{}),...extras
});
const entry=date+"T08:30:00",exit=date+"T19:00:00";
const sample=()=>({
  schemaVersion:1,kind:"KY_PDKS_ATTENDANCE_EVIDENCE_V1",
  companyId:"company-01",period:"2026-10",timezone:"Europe/Istanbul",
  personnel:[{cardNo:"00001",fullName:"Test Person",requirePunch:true,
    workDays:[1,2,3,4,5],employment:{startDate:"2025-01-01",exitDate:null}}],
  days:[{cardNo:"00001",date,
    shifts:[{id:"day",startAt:date+"T08:30",endAt:date+"T19:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5}],
    holiday:{kind:"NONE"},leave:null,
    raw:[source("DEVICE_RAW","raw-in",entry,"IN",{shiftId:"day"}),
      source("DEVICE_RAW","raw-out",exit,"OUT",{shiftId:"day"})],
    firebird:[source("FIREBIRD_GIRCIK_COPY","f-in",entry,"IN",{legacyType:""}),
      source("FIREBIRD_GIRCIK_COPY","f-out",exit,"OUT",{legacyType:""})],
    tnf:[source("ANNUAL_TNF","t-in",entry.slice(0,16)),
      source("ANNUAL_TNF","t-out",exit.slice(0,16))],
    adminE:[],
  }],
});
test("real-source shaped pairs cross-check; payroll approval is never claimed",()=>{
  const result=evaluateAttendanceEvidenceBundle(sample(),{companyId:"company-01",period:"2026-10"});
  assert.equal(result.days.length,1);
  assert.equal(result.days[0].status,"D1_EVIDENCE_PAIR_COMPLETE");
  assert.equal(result.days[0].reviewMinutes,630);
  assert.equal(result.days[0].matchedSources,true);
  assert.equal(result.monthly[0].pairedDays,1);
  assert.equal(result.monthly[0].missingCalendarDays,30);
  assert.equal(result.monthly[0].sourceComparisonComplete,false);
  assert.equal(result.approvedForPayroll,false);
  assert.equal(result.localReconciled,false);
  assert.equal(result.independentlyCertified,false);
});
test("RAW missing from copy or TNF missing stops all credit",()=>{
  for(const key of ["raw","firebird","tnf"]){
    const doc=sample(); doc.days[0][key].pop();
    const result=evaluateAttendanceEvidenceBundle(doc);
    assert.equal(result.days[0].status,"SOURCE_EVIDENCE_MISMATCH");
    assert.equal(result.days[0].reviewMinutes,null);
    assert.equal(result.monthly[0].pairedDays,0);
  }
});
test("same-minute-but-different-second RAW and Firebird is a mismatch",()=>{
  const doc=sample();
  doc.days[0].firebird[0].timestamp=date+"T08:30:59";
  const result=evaluateAttendanceEvidenceBundle(doc);
  assert.ok(result.days[0].warnings.includes("RAW_FIREBIRD_MISMATCH"));
  assert.equal(result.days[0].reviewMinutes,null);
});
test("E movement must be approved and identified in legacy Firebird and TNF",()=>{
  const doc=sample();
  doc.days[0].raw.shift();
  doc.days[0].firebird.shift();
  doc.days[0].firebird.unshift(source("FIREBIRD_GIRCIK_COPY","e-fdb",entry,"IN",{legacyType:"E"}));
  doc.days[0].adminE.push(source("ADMIN_E_APPROVAL","e1",entry,"IN",{
    shiftId:"day",approvalId:"approval-1",approvedBy:"supervisor"}));
  const result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days[0].eCount,1);
  assert.equal(result.days[0].paired,true);
  assert.equal(result.days[0].shifts[0].entrySource,"ADMIN_E");
  assert.equal(result.approvedForPayroll,false);
  doc.days[0].adminE[0].approvedBy="";
  assert.throws(()=>evaluateAttendanceEvidenceBundle(doc),/E_APPROVAL_REQUIRED/);
});
test("same-day double shift requires two matching pairs and authorized shift ID",()=>{
  const doc=sample();const day=doc.days[0];
  day.shifts=[{id:"am",startAt:date+"T06:00",endAt:date+"T13:00",
    lateToleranceMinutes:5,earlyToleranceMinutes:5},
    {id:"pm",startAt:date+"T14:00",endAt:date+"T21:00",
    lateToleranceMinutes:5,earlyToleranceMinutes:5}];
  day.raw=[];day.firebird=[];day.tnf=[];
  const punches=[["05:59:00","IN","am"],["13:01:00","OUT","am"],
    ["13:59:00","IN","pm"],["21:00:00","OUT","pm"]];
  punches.forEach(([clock,direction,shiftId],i)=>{
    const stamp=date+"T"+clock;
    day.raw.push(source("DEVICE_RAW","raw"+i,stamp,direction,{shiftId}));
    day.firebird.push(source("FIREBIRD_GIRCIK_COPY","fdb"+i,stamp,direction,{legacyType:""}));
    day.tnf.push(source("ANNUAL_TNF","tnf"+i,stamp.slice(0,16)));
  });
  const result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days[0].shifts.length,2);
  assert.equal(result.days[0].reviewMinutes,843);
  assert.equal(result.monthly[0].doubleShiftDays,1);
  delete day.raw[0].shiftId;
  assert.throws(()=>evaluateAttendanceEvidenceBundle(doc),/SHIFT_ASSIGNMENT_REQUIRED/);
});
test("approved leave and holidays stay non-payroll classification",()=>{
  const doc=sample();const row=doc.days[0];
  row.raw=[];row.firebird=[];row.tnf=[];
  row.leave={approved:true,approvalId:"leave-1",approvedBy:"manager"};
  let result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days[0].status,"APPROVED_LEAVE");
  assert.equal(result.days[0].reviewMinutes,null);
  assert.equal(result.monthly[0].approvedLeaveDays,1);
  row.leave=null;row.holiday={kind:"FULL"};
  result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days[0].status,"OFFICIAL_HOLIDAY");
  assert.equal(result.monthly[0].holidayDays,1);
});
test("invalid tenant, date, duplicate person-day and fabricated evidence all fail closed",()=>{
  const doc=sample();
  assert.throws(()=>evaluateAttendanceEvidenceBundle(doc,{companyId:"other"}),/BUNDLE_CONTRACT/);
  assert.throws(()=>evaluateAttendanceEvidenceBundle(doc,{period:"2026-09"}),/BUNDLE_CONTRACT/);
  assert.throws(()=>evaluateAttendanceEvidenceBundle({...doc,days:[doc.days[0],doc.days[0]]}),/DUPLICATE_PERSON_DAY/);
  const bad=sample();bad.days[0].tnf[0].source="DEVICE_RAW";
  assert.throws(()=>evaluateAttendanceEvidenceBundle(bad),/SOURCE_ID_INVALID/);
});


test("physical punches on approved leave require review even when sources match",()=>{
  const doc=sample();
  doc.days[0].leave={approved:true,approvalId:"leave-1",approvedBy:"manager"};
  const result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days[0].status,"APPROVED_LEAVE");
  assert.ok(result.days[0].warnings.includes("EVENT_DURING_APPROVED_LEAVE"));
  assert.equal(result.monthly[0].reviewDays,1);
  assert.equal(result.monthly[0].sourceComparisonComplete,false);
});
test("full clean source-file coverage can be complete without payroll certification",()=>{
  const doc=sample();doc.days=[];
  for(let n=1;n<=31;n++){
    const date="2026-10-"+String(n).padStart(2,"0");
    const weekday=new Date(date+"T12:00:00Z").getUTCDay();
    doc.days.push({cardNo:"00001",date,shifts:[],raw:[],firebird:[],tnf:[],adminE:[],
      holiday:{kind:"NONE"},leave:[0,6].includes(weekday)?null:
        {approved:true,approvalId:"leave-"+n,approvedBy:"manager"}});
  }
  const result=evaluateAttendanceEvidenceBundle(doc);
  assert.equal(result.days.length,31);
  assert.equal(result.monthly[0].missingCalendarDays,0);
  assert.equal(result.sourceComparisonComplete,true);
  assert.equal(result.approvedForPayroll,false);
  assert.equal(result.independentlyCertified,false);
});
