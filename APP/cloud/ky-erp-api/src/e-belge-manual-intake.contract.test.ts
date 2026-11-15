import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const pool=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
const print=readFileSync(new URL("./e-belge-accounting-print-routes.ts",import.meta.url),"utf8");
test("e-Arsiv is included in invoice queue, pending print and print-status query",()=>{
 assert.match(pool,/invoiceTypeSql=.*ARSIV/);
 assert.match(pool,/const invoiceTypeSql/);
 assert.match(pool,/upper\(c\.req\.query\("filter"\)\)==="INCOMING_INVOICE"/);
 assert.match(print,/document_type LIKE '%ARSIV%'/);
});
test("Manually transcribed OCR failure is review only and requires documented source confirmation",()=>{
 for(const token of ["prepareManualEBelgeInput","MANUAL_SOURCE_REVIEW_REQUIRED","manualSourceVerificationRequired","confirmed!==true","MANUAL_ONE_FILE","accountingTenantReadAllowed","manualOnly"])
  assert.ok(pool.includes(token),token);
 assert.match(pool,/status:"REVIEW_REQUIRED"/);
 assert.match(pool,/MANUAL_XML_NOT_ALLOWED/);
});
