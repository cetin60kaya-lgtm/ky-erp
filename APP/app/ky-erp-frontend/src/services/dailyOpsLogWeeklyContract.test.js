import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontend = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../../../cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts", import.meta.url), "utf8");

test("all log sources apply the requested work-date range and never display stale rows", () => {
  assert.match(frontend, /getDailyRevisions\(\{ mainCompanyId: companyId, startDate: safe\.start, endDate: safe\.end/);
  assert.match(frontend, /getDailyAudit\(\{ mainCompanyId: companyId, startDate: safe\.start, endDate: safe\.end/);
  assert.match(frontend, /getDailyAttendance\(\{ mainCompanyId: companyId, startDate: safe\.start, endDate: safe\.end/);
  assert.match(frontend, /dailyWorkDateInRange\(row, logRange\.start, logRange\.end\)/);
  assert.match(frontend, /logLoadedScope === dailyRangeScope\(companyId, logRange\.start, logRange\.end\)/);
  assert.match(frontend, /500 kayıt sınırına ulaşıldı/);
});
test("revisions endpoint also enforces range on D1 SQL, not just the UI", () => {
  const block = worker.split("async function revisions(c: Context<AppEnv>) {")[1]?.split("async function", 1)[0] || worker.slice(worker.indexOf("async function revisions(c: Context<AppEnv>) {"), worker.indexOf("async function", worker.indexOf("async function revisions(c: Context<AppEnv>) {") + 14));
  assert.match(block, /c\.req\.query\("startDate"\)/);
  assert.match(block, /c\.req\.query\("endDate"\)/);
  assert.match(block, /work_date>=\?/);
  assert.match(block, /work_date<=\?/);
});
test("weekly matrix, totals, PDF and Excel all use D1 verified net money", () => {
  assert.match(frontend, /getDailyWeeklySummary\(\{ mainCompanyId: companyId, startDate: range\.start, endDate: range\.end \}\)/);
  assert.match(frontend, /reconcileDailyWeeklyReport\(matrixRows, summaryRows\)/);
  assert.match(frontend, /const weeklyFinancialReady = weeklySummaryInScope/);
  assert.match(frontend, /row\["Ek Ödeme \(\+\)"\]/);
  assert.match(frontend, /row\["Kesinti \(-\)"\]/);
  assert.match(frontend, /<th>Ek \(\+\)<\/th><th>Kesinti \(-\)<\/th><th>Net Toplam<\/th>/);
  assert.match(frontend, /<th class="extra-money">Ek \(\+\)<\/th>/);
  assert.match(frontend, /disabled=\{!weeklyFinancialReady\}/);
  assert.match(worker, /hr_daily_payment_adjustments a/);
  assert.match(worker, /a\.period_start=\? AND a\.period_end=\?/);
  assert.match(worker, /baseAmount,additions:additionsAmount,deductions:deductionsAmount/);
});
