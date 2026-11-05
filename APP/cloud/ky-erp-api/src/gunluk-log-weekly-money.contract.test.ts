import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./gunluk-operasyon-cloud.ts", import.meta.url), "utf8");
const revision = src.slice(src.indexOf("async function revisions("), src.indexOf("async function", src.indexOf("async function revisions(") + 15));
const weekly = src.slice(src.indexOf("async function weeklySummary("), src.indexOf("function paymentDateKey("));

test("revisions D1 query filters inclusive work date between provided start and end", () => {
  assert.match(revision, /DATE_RANGE_REQUIRED/);
  assert.match(revision, /AND \(\?='' OR work_date>=\?\)/);
  assert.match(revision, /AND \(\?='' OR work_date<=\?\)/);
  assert.match(revision, /start, start/);
  assert.match(revision, /end, end/);
});
test("weekly source uses attendance wages and ACTIVE period adjustments from D1", () => {
  assert.match(weekly, /await paymentSourceRows\(c,companyId,start,end\)/);
  assert.match(weekly, /JOIN hr_daily_employees e ON e\.id=a\.employee_id AND e\.main_company_id=a\.main_company_id/);
  assert.match(weekly, /a\.main_company_id=\? AND a\.period_start=\? AND a\.period_end=\? AND a\.status='ACTIVE'/);
  assert.match(weekly, /row\.totalAmount=money/);
  assert.match(weekly, /baseAmount\+additionsAmount-deductionsAmount/);
  assert.match(weekly, /totalAmount:netAmount,total:netAmount/);
});
test("existing payment and revision audit ownership remains in place", () => {
  assert.match(src, /async function paymentPool/);
  assert.match(src, /async function paymentCreate/);
  assert.match(src, /hr_daily_payment_adjustment_snapshots/);
  assert.match(src, /hr_daily_operation_audit/);
});
