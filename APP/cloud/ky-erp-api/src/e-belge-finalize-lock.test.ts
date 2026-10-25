import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source=readFileSync(resolve(process.cwd(),"src/e-belge-center-cloud.ts"),"utf8");

test("Dış eşleştirme FINALIZING / APPROVED / FINALIZE_RETRY durumlarını değiştiremez",()=>{
  const reconcile=source.slice(source.indexOf("async function reconcileOne("),source.indexOf("async function validateForFinal("));
  assert.match(reconcile,/internalFinalize=false/);
  assert.match(reconcile,/"FINALIZING","APPROVED","FINALIZE_RETRY"/);
  assert.match(reconcile,/DOCUMENT_FINALIZATION_LOCKED/);
  assert.match(source,/reconcileOne\(c,slug,id,true\)/);
});
test("PATCH finalization sırasında state guard + koşullu UPDATE ile yarıştan korunur",()=>{
  const code=source.slice(source.indexOf('app.patch("/api/e-belge/documents/:id"'),source.indexOf('app.post("/api/e-belge/documents/:id/reconcile"'));
  assert.match(code,/DOCUMENT_FINALIZATION_LOCKED/);
  assert.match(code,/status NOT IN \('POSTED','FINALIZING','FINALIZE_RETRY','APPROVED'\)/);
  assert.match(code,/updated\.meta\?\.changes/);
});
test("Toplu eşleştirme kilitli kesin kayıtları seçmez",()=>{
  assert.match(source,/status NOT IN \('POSTED','FINALIZING','FINALIZE_RETRY','APPROVED'\) ORDER BY/);
});
