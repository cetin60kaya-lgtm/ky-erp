import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAttendanceDay} from "./attendanceRules.mjs";

const day="2026-10-08";
const base=()=>({
  date:day,timezone:"Europe/Istanbul",workDays:[1,2,3,4,5],
  employment:{startDate:"2018-03-01",exitDate:null},
  requirePunch:true,holiday:{kind:"NONE"},
  shifts:[{id:"day",startAt:day+"T08:30",endAt:day+"T19:00",
    lateToleranceMinutes:5,earlyToleranceMinutes:10}],
  events:[],
});
const raw=(id,t,direction,shiftId="day")=>({
  eventId:id,source:"PHYSICAL_RAW",timestamp:t,direction,shiftId,
});
const e=(id,t,direction,approved=true,shiftId="day")=>({
  eventId:id,source:"ADMIN_E",timestamp:t,direction,shiftId,
  ...(approved?{approvalId:"a-"+id,approvedBy:"admin"}:{}),
});
test("real raw card pair carries exact original minutes, not synthesized entry/exit",()=>{
  const data=base();
  data.events=[raw("1",day+"T08:28","IN"),raw("2",day+"T19:03","OUT")];
  const value=evaluateAttendanceDay(data);
  assert.equal(value.status,"D1_EVIDENCE_PAIR_COMPLETE");
  assert.equal(value.shifts[0].entry,day+"T08:28");
  assert.equal(value.shifts[0].exit,day+"T19:03");
  assert.equal(value.workMinutes,635);
  assert.equal(value.shifts[0].lateMinutes,0);
  assert.equal(value.shifts[0].earlyMinutes,0);
  assert.equal(value.localReconciled,false);
  assert.equal(value.approvedForPayroll,false);
  assert.equal(data.events.length,2);
});
test("missing one punch stays missing and cannot generate expected 19:00",()=>{
  const value=evaluateAttendanceDay({...base(),
    events:[raw("a",day+"T08:26","IN")]});
  assert.equal(value.workMinutes,null);
  assert.equal(value.shifts[0].exit,null);
  assert.equal(value.status,"MISSING_OR_CONFLICTING_EVIDENCE");
  assert.ok(value.warnings.includes("MISSING_EXIT"));
});
test("late entry and early exit are based on explicit shift tolerance only",()=>{
  const value=evaluateAttendanceDay({...base(),events:[
    raw("a",day+"T08:40","IN"),raw("b",day+"T18:35","OUT"),
  ]});
  assert.equal(value.shifts[0].lateMinutes,5);
  assert.equal(value.shifts[0].earlyMinutes,15);
});
test("full holiday forbids routine attendance without explicit work approval",()=>{
  const value=evaluateAttendanceDay({...base(),holiday:{kind:"FULL"},events:[
    raw("a",day+"T08:30","IN"),
  ]});
  assert.equal(value.status,"OFFICIAL_HOLIDAY");
  assert.equal(value.rawCount,1);
  assert.equal(value.workMinutes,null);
  assert.ok(value.warnings.includes("HOLIDAY_EVENT_REQUIRES_REVIEW"));
});
test("half-day holiday needs explicit business closing decision",()=>{
  const setup=base();setup.holiday={kind:"HALF"};
  assert.equal(evaluateAttendanceDay(setup).status,"HALF_DAY_DECISION_REQUIRED");
  assert.equal(evaluateAttendanceDay({...setup,holiday:{kind:"HALF",workDecision:"OFF"}}).status,"HALF_DAY_OFF");
  assert.equal(evaluateAttendanceDay({...setup,holiday:{
    kind:"HALF",workDecision:"WORK",closingAt:day+"T13:00"
  }}).status,"HALF_DAY_SHIFT_CONFLICT");
});
test("Saturday and Sunday do not become a normal card working day",()=>{
  const saturday={...base(),date:"2026-10-10",
    shifts:[{id:"x",startAt:"2026-10-10T08:30",endAt:"2026-10-10T12:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5}],
    events:[raw("a","2026-10-10T08:30","IN","x")]};
  assert.equal(evaluateAttendanceDay(saturday).status,"WEEKLY_REST");
  assert.equal(evaluateAttendanceDay({...saturday,restDayWorkApproved:true}).status,
    "MISSING_OR_CONFLICTING_EVIDENCE");
});
test("hire and exit dates are enforced per day",()=>{
  assert.equal(evaluateAttendanceDay({...base(),
    employment:{startDate:"2026-10-09",exitDate:null}}).status,"OUTSIDE_EMPLOYMENT");
  assert.equal(evaluateAttendanceDay({...base(),
    employment:{startDate:"2024-01-01",exitDate:"2026-10-07"}}).status,"OUTSIDE_EMPLOYMENT");
});
test("no card requirement never fabricates a physical event",()=>{
  const value=evaluateAttendanceDay({...base(),requirePunch:false});
  assert.equal(value.status,"PUNCH_EXEMPT");
  assert.equal(value.rawCount,0);assert.equal(value.daysCredited,null);
});
test("real approved leave has no synthetic card pair",()=>{
  const value=evaluateAttendanceDay({...base(),leave:{approved:true}});
  assert.equal(value.status,"APPROVED_LEAVE");
  assert.equal(value.workMinutes,null);
});
test("one approved E side remains E and cannot be passed off as raw device log",()=>{
  const value=evaluateAttendanceDay({...base(),events:[
    e("e1",day+"T08:29","IN"),raw("r1",day+"T19:00","OUT"),
  ]});
  assert.equal(value.status,"D1_EVIDENCE_PAIR_COMPLETE");
  assert.equal(value.shifts[0].entrySource,"ADMIN_E");
  assert.equal(value.shifts[0].exitSource,"PHYSICAL_RAW");
  assert.equal(value.eCount,1);
  assert.equal(value.rawCount,1);
  assert.equal(value.approvedForPayroll,false);
});
test("unapproved E cannot silently complete missing physical entry",()=>{
  const value=evaluateAttendanceDay({...base(),events:[
    e("e1",day+"T08:29","IN",false),raw("r1",day+"T19:00","OUT"),
  ]});
  assert.equal(value.workMinutes,null);
  assert.ok(value.warnings.includes("UNAPPROVED_E_EVENT"));
});
test("same day double shift uses two explicit source-authorized pairs",()=>{
  const setup={...base(),shifts:[
    {id:"morning",startAt:day+"T06:00",endAt:day+"T14:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5},
    {id:"evening",startAt:day+"T15:00",endAt:day+"T22:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5},
  ],events:[
    raw("1",day+"T05:58","IN","morning"),
    raw("2",day+"T14:02","OUT","morning"),
    raw("3",day+"T14:59","IN","evening"),
    raw("4",day+"T22:03","OUT","evening"),
  ]};
  const value=evaluateAttendanceDay(setup);
  assert.equal(value.status,"D1_EVIDENCE_PAIR_COMPLETE");
  assert.equal(value.shifts.length,2);
  assert.equal(value.rawCount,4);
  assert.equal(value.workMinutes,908);
  assert.equal(value.approvedForPayroll,false);
});
test("double shift unassigned event cannot be silently attributed to any shift",()=>{
  const setup=base();
  setup.shifts=[
    {id:"a",startAt:day+"T06:00",endAt:day+"T14:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5},
    {id:"b",startAt:day+"T15:00",endAt:day+"T22:00",
      lateToleranceMinutes:5,earlyToleranceMinutes:5},
  ];
  setup.events=[{eventId:"a",source:"PHYSICAL_RAW",timestamp:day+"T06:05"}];
  assert.equal(evaluateAttendanceDay(setup).status,"SHIFT_ASSIGNMENT_UNCERTAIN");
});
test("night shift crossing midnight preserves actual timestamp and duration",()=>{
  const input={...base(),shifts:[{
    id:"night",startAt:day+"T20:00",endAt:"2026-10-09T06:00",
    lateToleranceMinutes:5,earlyToleranceMinutes:10,
  }],events:[
    raw("a",day+"T19:58","IN","night"),
    raw("b","2026-10-09T06:03","OUT","night"),
  ]};
  const value=evaluateAttendanceDay(input);
  assert.equal(value.workMinutes,605);
  assert.equal(value.status,"D1_EVIDENCE_PAIR_COMPLETE");
});
test("two directionless raw events are proposed only, never final approved punches",()=>{
  const input={...base(),allowPairByOrder:true,events:[
    {eventId:"a",source:"PHYSICAL_RAW",timestamp:day+"T08:29"},
    {eventId:"b",source:"PHYSICAL_RAW",timestamp:day+"T19:00"},
  ]};
  const value=evaluateAttendanceDay(input);
  assert.equal(value.status,"PUNCH_DIRECTION_REVIEW");
  assert.equal(value.workMinutes,null);
  assert.ok(value.warnings.includes("INFERRED_DIRECTION_NEEDS_APPROVAL"));
});
test("invalid evidence, duplicates and uncertified timezone fail closed",()=>{
  assert.throws(()=>evaluateAttendanceDay({...base(),timezone:"UTC"}),/UNVERIFIED_TIMEZONE/);
  assert.throws(()=>evaluateAttendanceDay({...base(),events:[
    raw("same",day+"T08:30","IN"),raw("same",day+"T08:30","IN"),
  ]}),/DUPLICATE_EVIDENCE/);
  assert.throws(()=>evaluateAttendanceDay({...base(),events:[
    raw("same",day+"T08:30","IN"),raw("same",day+"T19:00","OUT"),
  ]}),/DUPLICATE_EVIDENCE/);
  assert.throws(()=>evaluateAttendanceDay({...base(),events:[
    raw("bad","2026-02-30T08:30","IN"),
  ]}),/INVALID_ATTENDANCE_TIMESTAMP/);
});
test("overlapping or impossible shifts cannot invent positive work minutes",()=>{
  const item=base().shifts[0];
  assert.throws(()=>evaluateAttendanceDay({...base(),shifts:[
    item,{...item,id:"other",startAt:day+"T18:00",endAt:day+"T20:00"},
  ]}),/OVERLAPPING/);
  assert.throws(()=>evaluateAttendanceDay({...base(),shifts:[{
    ...item,endAt:"2026-10-10T09:00",
  }]}),/INVALID_SHIFT_SPAN/);
});
