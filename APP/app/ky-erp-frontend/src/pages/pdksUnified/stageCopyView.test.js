import test from "node:test";
import assert from "node:assert/strict";
import {parseStageCopySnapshot} from "./stageCopyView.mjs";
const example=()=>({
 schemaVersion:1,kind:"KY_PDKS_FIREBIRD_STAGE_ONLY",
 source:"GBAK_RESTORED_COPY_KIMLIK_GIRCIK",
 database:"KY_PDKS_STAGE.FDB",start:"2026-09-01",end:"2026-09-30",
 directionsFromGircikColumns:true,liveRealTime:false,productionWritten:false,
 physicalTerminalVerified:false,annualTnfVerified:false,cloudVerified:false,
 invalidSourcePunchCount:0,personnel:[
 {cardNo:"00003",fullName:"Test Person",groupCode:"A",employmentStart:"2026-01-01",employmentEnd:null,legacyStatus:""},
 ],punches:[
 {eventId:"p1:IN",cardNo:"00003",workDate:"2026-09-01",time:"08:31:00",direction:"IN",legacyType:"",source:"GIRCIK_STAGE"},
 {eventId:"p1:OUT",cardNo:"00003",workDate:"2026-09-01",time:"19:01:00",direction:"OUT",legacyType:"E",source:"GIRCIK_STAGE"},
 ]});
test("copy snapshot projects only explicit entry and exit and never invents late",()=>{
 const v=parseStageCopySnapshot(example());
 assert.equal(v.people.length,1);assert.equal(v.events.length,2);
 assert.deepEqual(v.days[0].entry,["08:31:00"]);
 assert.deepEqual(v.days[0].exit,["19:01:00"]);
 assert.equal(v.days[0].legacyE,1);
 assert.equal(v.days[0].lateVerified,false);
 assert.equal(v.physicalTerminalVerified,false);
 assert.equal(v.source,"LOCAL_FIREBIRD_COPY_ONLY");
});
test("reject production FDB and fake current-device certification",()=>{
 for(const change of [
 {database:"DATABASE.GDB"},{productionWritten:true},
 {physicalTerminalVerified:true},{liveRealTime:true},
 {annualTnfVerified:true},{directionsFromGircikColumns:false},
 {start:"2026-08-01",end:"2026-09-30"},
 ])assert.throws(()=>parseStageCopySnapshot({...example(),...change}),/UNVERIFIED/);
});
test("reject duplicate events, fabricated directions and out of range data",()=>{
 for(const punch of [
 {...example().punches[0],direction:"AUTO"},
 {...example().punches[0],workDate:"2026-10-01"},
 {...example().punches[0],cardNo:"ABC"},
 ]){
  assert.throws(()=>parseStageCopySnapshot({...example(),punches:[punch]}),/PUNCH_INVALID/);
 }
 const x=example();
 assert.throws(()=>parseStageCopySnapshot({...x,punches:[x.punches[0],x.punches[0]]}),/PUNCH_INVALID/);
});
test("unknown card must be explicit instead of creating a made-up person",()=>{
 const x=example();x.punches[0].cardNo="00099";
 const out=parseStageCopySnapshot(x);
 assert.equal(out.unknownCards,1);
 assert.equal(out.events[0].person,"Kart eşleşmedi");
});

test("multiple entry sides without matching exit sides remain unresolved",()=>{
 const x=example();
 x.punches.push({
  eventId:"p2:IN",cardNo:"00003",workDate:"2026-09-01",
  time:"13:00:00",direction:"IN",legacyType:"",source:"GIRCIK_STAGE",
 });
 const result=parseStageCopySnapshot(x);
 assert.equal(result.days.length,1);
 assert.equal(result.days[0].sideCountMatched,false);
 assert.equal(result.days[0].missingSideCount,1);
 assert.equal(result.unmatchedDayCount,1);
 assert.equal(result.missingSideCount,1);
 assert.equal(result.days[0].lateVerified,false);
});
test("matching double-shift source sides are retained without claiming payroll approval",()=>{
 const x=example();
 x.punches.push({
  eventId:"p2:IN",cardNo:"00003",workDate:"2026-09-01",
  time:"20:00:00",direction:"IN",legacyType:"E",source:"GIRCIK_STAGE",
 },{
  eventId:"p2:OUT",cardNo:"00003",workDate:"2026-09-01",
  time:"22:00:00",direction:"OUT",legacyType:"E",source:"GIRCIK_STAGE",
 });
 const result=parseStageCopySnapshot(x);
 assert.equal(result.days[0].sideCountMatched,true);
 assert.equal(result.days[0].entry.length,2);
 assert.equal(result.days[0].exit.length,2);
 assert.equal(result.unmatchedDayCount,0);
 assert.equal(result.productionWritten,false);
});
