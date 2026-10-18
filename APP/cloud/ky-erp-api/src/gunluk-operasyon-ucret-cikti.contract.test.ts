import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("./gunluk-operasyon-cloud.ts", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../../../app/ky-erp-frontend/src/services/dailyOpsApi.js", import.meta.url), "utf8");

test("period payment states read actual shift ledger instead of assuming paid when pool is empty", () => {
  assert.match(worker, /async function paymentPeriodStatus/);
  assert.match(worker, /day_paid_item/);
  assert.match(worker, /night_paid_item/);
  assert.match(worker, /status: row\.openCount === 0 \? "PAID"/);
  assert.match(worker, /app\.get\("\/api\/gunluk-operasyon\/payments\/period-status", protect\(paymentPeriodStatus\)\)/);
  assert.match(client, /getDailyPeriodPaymentStatus/);
  assert.match(frontend, /paymentStatusByEmployee\.get\(key\)/);
  assert.match(frontend, /DOĞRULANAMADI/);
  assert.doesNotMatch(frontend, /paymentPeriodIsHistorical/);
});

test("printing earnings slips never creates a payment; explicit user payment still does", () => {
  const scope = frontend.split("const printPeriodRows = useCallback")[1]?.split("const activePaymentRange =")[0];
  assert.ok(scope, "Read-only printing handler not found.");
  assert.match(scope, /printDailyPaymentSlips\(paymentPoolRange, rowsToPrint\)/);
  assert.doesNotMatch(scope, /createDailyPayment/);
  assert.match(frontend, /const payRow = async/);
  assert.match(frontend, /await createDailyPayment/);
  assert.match(frontend, /HAKEDİŞ BELGESİ/);
});

test("historical wages are visible in card, weekly print, and exported spreadsheet", () => {
  assert.match(worker, /wageHistory: history\.get/);
  assert.match(frontend, /gop-wage-history-row/);
  assert.match(frontend, /change\.beforeDayWage/);
  assert.match(frontend, /change\.nightWage/);
  assert.match(frontend, /wageRangeLabel\(row, "day", safeDays\)/);
  assert.match(frontend, /Gündüz Birim Ücret/);
  assert.match(frontend, /Gece Birim Ücret/);
  assert.match(frontend, /bulkEffectiveDate/);
});
