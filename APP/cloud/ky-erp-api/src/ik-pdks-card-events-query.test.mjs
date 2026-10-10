import test from "node:test";
import assert from "node:assert/strict";
import {parseCardEventQuery,cardEventCursorSql,cardEventParams}
  from "./ik-pdks-card-events-query.mjs";
const today="2026-10-09";
const q=(o={})=>parseCardEventQuery(o,today);
test("default is only Istanbul-local current day; no guessed records",()=>{
  const value=q();
  assert.equal(value.from,today);assert.equal(value.to,today);
  assert.equal(value.limit,100);assert.equal(value.hasCursor,false);
  assert.deepEqual(cardEventParams("firm-a",value),["firm-a",today,today,101]);
  assert.equal(cardEventCursorSql(value),"");
});
test("31 inclusive days are allowed, 32 days and reversed dates rejected",()=>{
  assert.equal(q({from:"2026-10-01",to:"2026-10-31"}).from,"2026-10-01");
  for(const range of [
    {from:"2026-09-30",to:"2026-10-31"},
    {from:"2026-10-12",to:"2026-10-09"},
    {from:"2026-02-30",to:"2026-03-01"},
    {from:"2026-13-01",to:"2026-13-03"},
  ])assert.throws(()=>q(range),/DATE_RANGE_INVALID/);
});
test("limit rejects zero, negatives, non-digits and values above 250",()=>{
  for(const limit of ["0","251","-1","2.5","1x","1000"]){
    assert.throws(()=>q({limit}),/LIMIT_INVALID/);
  }
  assert.equal(q({limit:"250"}).limit,250);
});
test("partial keyset cursor is invalid",()=>{
  for(const part of [{cursorDate:today},{cursorTime:"08:20"},{cursorId:"id-1"}])
    assert.throws(()=>q(part),/CURSOR_INVALID/);
});
test("cursor must belong to requested dates and use safe time, identity",()=>{
  for(const part of [
    {cursorDate:"2026-09-01",cursorTime:"08:20",cursorId:"a-1"},
    {cursorDate:today,cursorTime:"25:20",cursorId:"a-1"},
    {cursorDate:today,cursorTime:"08:20",cursorId:"bad' OR 1=1 --"},
  ])assert.throws(()=>q({...part,from:"2026-10-01",to:today}),/CURSOR_INVALID/);
});
test("keyset SQL is a fixed parameterized expression with stable tie-breaker",()=>{
  const page=q({from:"2026-10-01",to:today,limit:"150",
    cursorDate:"2026-10-05",cursorTime:"08:25:00",cursorId:"uuid-1"});
  assert.equal(page.hasCursor,true);
  assert.equal(cardEventCursorSql(page).includes("t.id<?"),true);
  assert.deepEqual(cardEventParams("firm-b",page),[
    "firm-b","2026-10-01",today,"2026-10-05","2026-10-05",
    "08:25:00","2026-10-05","08:25:00","uuid-1",151,
  ]);
});
test("legacy one-digit entry hour is still a valid original time cursor",()=>{
  assert.equal(q({cursorDate:today,cursorTime:"8:25",cursorId:"a"}).cursorTime,"8:25");
});
