import test from "node:test";
import assert from "node:assert/strict";
import {buildLiveSnapshot} from "./ik-pdks-unified-live.mjs";

const date="2026-10-09",asOf="2026-10-09T19:40:00+03:00";
const p=(id,cardNo,h={})=>({id,cardNo,fullName:"Person "+id,...h});
const e=(employeeId,eventTime,direction,source="TERMINAL_IMPORT")=>({
  employeeId,eventTime,direction,source,workDate:date,
});
const s=(employeeId,entryTime="08:30",extra={})=>({
  employeeId,entryTime,exitTime:"19:00",lateTolerance:5,earlyTolerance:10,active:true,...extra,
});
const snapshot=(people,events=[],shifts=[],leaves=[],when=asOf)=>
  buildLiveSnapshot({date,asOf:when,people,events,shifts,leaves});

test("no terminal events means no D1 card record, not a confirmed employee absence",()=>{
  const result=snapshot([p("a","00001")]);
  assert.equal(result.roster[0].status,"KART_KAYDI_YOK");
  assert.equal(result.metrics.noRecord,1);
  assert.equal(result.metrics.arrived,0);
  assert.equal(result.terminalVerified,false);
  assert.equal(result.fdbVerified,false);
  assert.equal(result.tnfVerified,false);
});
test("explicit IN is counted; AUTO direction never guesses entry or inside",()=>{
  const row=snapshot([p("a","00001"),p("b","00002")],
    [e("a","08:24","IN"),e("b","08:26","AUTO")],[s("a"),s("b")]);
  assert.equal(row.metrics.arrived,1);
  assert.equal(row.metrics.inside,1);
  assert.equal(row.metrics.unknownDirection,1);
  assert.equal(row.roster[1].entry,"");
  assert.equal(row.roster[1].status,"YON_BELIRSIZ");
});
test("late is derived only from assigned active shift and its explicit tolerance",()=>{
  const row=snapshot([p("a","00001"),p("b","00002"),p("c","00003")],
    [e("a","08:36","IN"),e("b","08:36","IN"),e("c","08:36","IN")],
    [s("a"),s("b","08:30",{active:false})]);
  assert.equal(row.metrics.late,1);
  assert.equal(row.roster[0].lateMinutes,1);
  assert.equal(row.roster[1].lateMinutes,null);
  assert.equal(row.roster[2].lateMinutes,null);
});
test("a legitimate exit does not assume the person remains inside",()=>{
  const row=snapshot([p("a","00001")],[e("a","08:27","IN"),e("a","19:05","OUT")],[s("a")]);
  assert.equal(row.metrics.arrived,1);assert.equal(row.metrics.exited,1);
  assert.equal(row.metrics.inside,0);
  assert.equal(row.roster[0].exit,"19:05");
  assert.equal(row.roster[0].status,"CIKIS_KAYDI");
});
test("do not mark missing exit before verified shift end; flag after",()=>{
  const people=[p("a","00001")],events=[e("a","08:25","IN")],shift=[s("a")];
  const early=snapshot(people,events,shift,[],"2026-10-09T12:00:00+03:00");
  assert.equal(early.metrics.missingExit,0);
  const late=snapshot(people,events,shift);
  assert.equal(late.metrics.missingExit,1);
  assert.equal(late.roster[0].status,"CIKIS_KAYDI_YOK");
});
test("leave and employment dates never turn into invented absence",()=>{
  const result=snapshot([
    p("a","00001"),p("b","00002",{hireDate:"2026-10-10"}),
    p("c","00003",{exitDate:"2026-10-08"}),p("d","")],
    [],[],[{employeeId:"a",leaveFraction:1,leaveTypeCode:"YILLIK"}]);
  assert.equal(result.metrics.total,1);
  assert.equal(result.metrics.leave,1);
  assert.equal(result.metrics.noRecord,0);
});
test("invalid date or non-array roster fails closed",()=>{
  assert.equal(snapshot([],[e("a","08:20","IN")]).roster.length,0);
  assert.throws(()=>buildLiveSnapshot({date:"2026-02-30",people:[],events:[]}),/DATE_INVALID/);
  assert.throws(()=>buildLiveSnapshot({date,people:null,events:[]}),/ROSTER_NOT_ARRAY/);
});
