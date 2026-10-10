import test from "node:test";
import assert from "node:assert/strict";
import {parseTnfReferenceLine,parseTnfReferenceFile} from "./tnf-reference-import.mjs";
test("approved TNF format keeps real card/date/time without inventing evidence",()=>{
 const row=parseTnfReferenceLine("00003,08:28,051026,1,001",2026);
 assert.equal(row.cardNo,"00003");
 assert.equal(row.time,"08:28");
 assert.equal(row.workDate,"2026-10-05");
 assert.equal(row.source,"TNF_REFERENCE_ONLY");
 assert.equal(row.isPhysicalRaw,false);
});
test("invalid holidays/calendar and unverified duplicates do not silently enter",()=>{
 assert.throws(()=>parseTnfReferenceLine("00003,08:30,310226,1,001"),/INVALID_CALENDAR/);
 assert.throws(()=>parseTnfReferenceLine("00003,08:30,051026,1,001",2027),/YEAR_MISMATCH/);
 const batch=parseTnfReferenceFile([
 "00003,08:28,051026,1,001",
 "00003,08:28,051026,1,001",
 "00004,19:03,051026,1,001",
 "nonsense",
 ].join("\r\n"),2026);
 assert.equal(batch.accepted.length,2);
 assert.equal(batch.rejected.length,2);
 assert.equal(batch.requiresAuthorizedReview,true);
 assert.equal(batch.isSafeToApply,false);
});
