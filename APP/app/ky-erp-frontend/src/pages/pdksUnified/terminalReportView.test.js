import test from "node:test";
import assert from "node:assert/strict";
import {parseTerminalDiagnosticReport} from "./terminalReportView.mjs";
const example=()=>({
  schemaVersion:1,mode:"READ_ONLY_TNF_REFERENCE_PREVIEW",
  status:"REQUIRES_APPROVED_SOURCE_RECONCILIATION",
  terminalId:"term-001",inspected:3,acceptedPending:2,signedQrPending:1,
  unsignedUsbPending:1,matchedReference:1,notInReference:1,
  ambiguousDuplicateMinute:0,rejectedFacts:1,
  referenceRows:3,rejectedReferenceRows:0,
  physicalAttendanceConfirmed:false,safeToApply:false,
  terminalRawCertified:false,firebirdVerified:false,tnfApplied:false,
  cloudApplied:false,annualTnfWritten:false,
});
test("offline diagnostic summary renders only whitelisted nonpersonal counts",()=>{
  const data=parseTerminalDiagnosticReport({...example(),
    cardNo:"00003",secret:"never output me"},"term-001");
  assert.deepEqual(Object.keys(data),[
    "terminalId","inspected","matched","unmatched","ambiguous","invalid",
    "unsigned","rejectedReference","referenceRows","dailyBatches",
    "terminalRawCertified","source",
  ]);
  assert.equal(JSON.stringify(data).includes("00003"),false);
  assert.equal(data.terminalRawCertified,false);
});
test("an arbitrary JSON file cannot certify hardware or claim completed apply",()=>{
  for(const data of [
    {...example(),terminalId:"other"},
    {...example(),safeToApply:true},
    {...example(),physicalAttendanceConfirmed:true},
    {...example(),matchedReference:3},
    {...example(),unsignedUsbPending:2},
    {...example(),rejectedFacts:-1},
    {...example(),mode:"PHYSICAL_DEVICE_CERTIFIED"},
    {},
  ])assert.throws(()=>parseTerminalDiagnosticReport(data,"term-001"),/NOT_VERIFIABLE/);
});

test("daily transfer rows display only verified anonymous totals",()=>{
  const batches=[
    {date:"2026-10-09",inspected:2,matched:1,unmatched:1,
      ambiguous:0,rejected:0,signedQr:1,unsignedUsb:1,cardNo:"00003"},
    {date:"BILINMIYOR",inspected:1,matched:0,unmatched:0,
      ambiguous:0,rejected:1,signedQr:0,unsignedUsb:0},
  ];
  const data=parseTerminalDiagnosticReport({...example(),dailyBatches:batches,
    batchState:"REVIEW_ONLY_NO_APPROVED_TRANSFER"},"term-001");
  assert.equal(data.dailyBatches.length,2);
  assert.deepEqual(Object.keys(data.dailyBatches[0]),[
    "date","inspected","matched","unmatched","ambiguous",
    "rejected","signedQr","unsignedUsb",
  ]);
  assert.equal(JSON.stringify(data).includes("00003"),false);
});
test("daily transfer totals or dates cannot be fabricated by imported JSON",()=>{
  const correct={date:"2026-10-09",inspected:3,matched:1,unmatched:1,
    ambiguous:0,rejected:1,signedQr:1,unsignedUsb:1};
  for(const dailyBatches of [
    [{...correct,matched:2}],
    [{...correct,date:"2026-02-30"}],
    [correct,correct],
    [{...correct,signedQr:3}],
    [{...correct,inspected:4}],
  ]){
    assert.throws(()=>parseTerminalDiagnosticReport({...example(),dailyBatches,
      batchState:"REVIEW_ONLY_NO_APPROVED_TRANSFER"},"term-001"),/BATCH/);
  }
});
