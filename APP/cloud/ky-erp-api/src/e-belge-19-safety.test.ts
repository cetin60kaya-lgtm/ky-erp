import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const center=readFileSync(resolve(process.cwd(),"src/e-belge-center-cloud.ts"),"utf8");

test("havuz GET sayfa sayıları güvenli integer olarak sınırlanır",()=>{
  assert.match(center,/safePageInt\(c\.req\.query\("page"\),1,1000000\)/);
  assert.match(center,/safePageInt\(c\.req\.query\("pageSize"\),50,100\)/);
  assert.match(center,/Number\.isSafeInteger\(n\)/);
  assert.match(center,/INVALID_DATE_RANGE/);
  assert.match(center,/from&&to&&from>to/);
  assert.match(center,/d\.main_company_slug=\?/);
});
test("dashboard yerel gün hesaplar ve tarih uyumu doğrular",()=>{
  assert.match(center,/timeZone:"Europe\/Istanbul"/);
  assert.match(center,/date\(created_at,'\+3 hours'\)/);
  assert.match(center,/INVALID_DASHBOARD_PERIOD/);
  assert.match(center,/monthStart\.slice\(0,7\)!==todayValue\.slice\(0,7\)/);
});
test("muhasebeleşmiş e-Belge sonradan düzenlenemez veya tekrar eşleştirilemez",()=>{
  assert.match(center,/DOCUMENT_ALREADY_POSTED/);
  assert.match(center,/invoice\.posted_at\|\|upper\(invoice\.status\)==="POSTED"/);
  assert.match(center,/doc\.posted_at\|\|\["POSTED","FINALIZING","APPROVED","FINALIZE_RETRY"\]\.includes\(upper\(doc\.status\)\)/);
  assert.match(center,/main_company_slug=\? AND deleted_at IS NULL/);
  assert.match(center,/main_company_slug=\? AND document_id=\?/);
});
