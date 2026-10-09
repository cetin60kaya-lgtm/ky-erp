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
    "unsigned","rejectedReference","terminalRawCertified","source",
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
