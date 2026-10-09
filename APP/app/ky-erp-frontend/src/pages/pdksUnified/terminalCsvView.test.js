import test from "node:test";
import assert from "node:assert/strict";
import {projectTerminalCsv} from "./terminalCsvView.mjs";
const head="eventId,cardNo,date,time,direction\n";
test("desktop reads explicit terminal CSV events without disclosing card numbers",()=>{
 const r=projectTerminalCsv(head+"a,00003,2026-10-09,08:30:00,IN\nb,00003,2026-10-09,19:00:00,OUT\n");
 assert.equal(r.accepted,2);
 assert.equal(r.dailyBatches[0].entries,1);assert.equal(r.dailyBatches[0].exits,1);
 assert.equal(r.safeToApply,false);assert.equal(r.sourceAuthenticated,false);
 assert.equal(JSON.stringify(r).includes("00003"),false);
});
test("desktop rejects ambiguous direction duplicate and invalid card",()=>{
 const r=projectTerminalCsv(head+"a,00003,2026-10-09,08:30:00,IN\na,00003,2026-10-09,08:30:00,IN\nb,00003,2026-10-09,19:00:00,UNKNOWN\nc,abcde,2026-10-09,12:00:00,OUT\n");
 assert.equal(r.accepted,1);assert.equal(r.rejected,3);assert.equal(r.duplicates,1);
});
test("desktop refuses unsupported CSV shapes",()=>{
 assert.throws(()=>projectTerminalCsv("card,date,time\na,2026-10-09,08:30"),/COLUMNS_INVALID/);
 assert.throws(()=>projectTerminalCsv(head),/ROW_LIMIT/);
});
