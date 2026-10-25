import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const index=fs.readFileSync(path.join(root,"src/index.ts"),"utf8");
const operations=fs.readFileSync(path.join(root,"src/accounting-operations.ts"),"utf8");
const firms=fs.readFileSync(path.join(root,"src/accounting-company-directory.ts"),"utf8");
const profile=fs.readFileSync(path.join(root,"src/accounting-company-profile.ts"),"utf8");

test("yönetim özeti seçili ay ve gerçek tenant filtrelerini uygular",()=>{
  const source=index.slice(index.indexOf("async function accountingSummary("),index.indexOf("async function buildVatSummary(",index.indexOf("async function accountingSummary(")));
  assert.match(source,/const slug = slugOf\(c\)/);
  assert.match(source,/PERIOD_INVALID/);
  assert.match(source,/requestedPeriod \|\| new Date\(\)\.toLocaleDateString/);
  assert.match(source,/timeZone: "Europe\/Istanbul"/);
  assert.match(source,/invoicePeriod: monthKey/);
  assert.match(source,/balanceScope: "CURRENT_TOTAL"/);
  assert.match(source,/companyCount: companies\.length/);
  assert.match(source,/vatPeriod:/);
});

test("plan ödemesinde kümülatif para geri yazılamaz; NaN ve küsurat reddedilir",()=>{
  assert.match(operations,/PAID_AMOUNT_ROLLBACK_FORBIDDEN/);
  assert.match(operations,/Number\.isFinite\(paid\)/);
  assert.match(operations,/Math\.round\(paid\*100\)/);
  assert.match(operations,/source_payment_plan_id=\?/);
  assert.match(operations,/INSERT OR IGNORE INTO accounting_ledger_entries/);
});

test("firma VKN normalize edilir, tarihçeli cari fiziksel DELETE yapmaz",()=>{
  assert.match(firms,/REPLACE\(REPLACE\(REPLACE\(COALESCE\(tax_no/);
  const deletion=firms.slice(firms.indexOf('app.delete("/api/muhasebe/firmalar/:id"'));
  assert.match(deletion,/COMPANY_PERMANENT_DELETE_DISABLED/);
  assert.doesNotMatch(deletion,/DELETE FROM companies/);
  assert.doesNotMatch(deletion,/DELETE FROM company_aliases/);
  assert.match(firms,/app.patch\("\/api\/muhasebe\/firmalar\/:id\/status"/);
});

test("alias başka firmaya sessiz aktarılmaz",()=>{
  assert.match(profile,/ALIAS_ALREADY_ASSIGNED/);
  assert.match(profile,/company_aliases\.company_id = excluded\.company_id/);
  assert.doesNotMatch(profile,/DO UPDATE SET company_id = excluded\.company_id/);
});
