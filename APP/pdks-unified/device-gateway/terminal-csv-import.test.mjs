import test from "node:test";
import assert from "node:assert/strict";
import {inspectTerminalCsv} from "./terminal-csv-import.mjs";
const head="eventId,cardNo,date,time,direction\n";
const opts={terminalId:"terminal-01",companyId:"company-01"};
test("terminal CSV keeps only explicit direction and anonymous counts",()=>{
 const value=head+"a1,00003,2026-10-09,08:30:00,IN\na2,00003,2026-10-09,19:00:00,OUT\n";
 const r=inspectTerminalCsv(value,opts);
 assert.equal(r.accepted,2);assert.equal(r.rejected,0);
 assert.deepEqual(r.dailyBatches,[{date:"2026-10-09",inspected:2,entries:1,exits:1}]);
 assert.equal(r.safeToApply,false);assert.equal(r.hardwareCertified,false);
 assert.equal(JSON.stringify(r).includes("00003"),false);
});
test("terminal CSV rejects guessed direction, corrupt rows and duplicate IDs",()=>{
 const r=inspectTerminalCsv(head+
 "e1,00003,2026-10-09,08:31:00,IN\n"+
 "e1,00003,2026-10-09,08:35:00,IN\n"+
 "e3,00003,2026-10-09,19:01:00,UNKNOWN\n",opts);
 assert.equal(r.accepted,1);assert.equal(r.rejected,2);
 assert.equal(r.duplicates,1);
 assert.equal(r.rejectionReasons.INVALID_ROW,1);
});
test("terminal CSV refuses implicit headers and oversized or blank data",()=>{
 assert.throws(()=>inspectTerminalCsv("cardNo,date,time\n00003,2026-10-09,08:30",opts),/COLUMNS_REQUIRED/);
 assert.throws(()=>inspectTerminalCsv(head,opts),/ROW_LIMIT/);
 assert.throws(()=>inspectTerminalCsv(head+"e1,00003,2026-10-09,08:30:00,IN",{}),/SOURCE_INVALID/);
});
