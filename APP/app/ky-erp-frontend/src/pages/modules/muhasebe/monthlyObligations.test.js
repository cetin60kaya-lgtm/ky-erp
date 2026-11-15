import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyPeriods, nextMonth, totalMinor, validateMonthlyPlan } from "./monthlyObligations.js";
test("74.000 TL kira on iki ayrı ay; toplama bir kez girer", () => {
  const rows = monthlyPeriods({ id: "kira-1", startMonth: "2026-11", endMonth: "2027-10", amount: 74000 });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].period, "2026-11");
  assert.equal(rows.at(-1).period, "2027-10");
  assert.equal(totalMinor(rows), 88800000);
  assert.equal(new Set(rows.map(row => row.key)).size, 12);
  assert.deepEqual(rows, monthlyPeriods({ id: "kira-1", startMonth: "2026-11", endMonth: "2027-10", amount: 74000 }));
});
test("yıl geçişinde gün seçimi ve saat dilimi farkı yok", () => {
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.deepEqual(monthlyPeriods({startMonth:"2027-01",endMonth:"2027-02",amount:12.5}).map(x=>x.amountMinor),[1250,1250]);
});
test("bozuk aralık ve tutar reddedilir", () => {
  assert.ok(validateMonthlyPlan({startMonth:"2026-12",endMonth:"2026-11",amount:1}));
  assert.ok(validateMonthlyPlan({startMonth:"2026-11-01",endMonth:"2026-12",amount:1}));
  assert.ok(validateMonthlyPlan({startMonth:"2026-11",endMonth:"2026-12",amount:-1}));
  assert.ok(validateMonthlyPlan({startMonth:"2026-11",endMonth:"2026-12",amount:1.234}));
  assert.equal(monthlyPeriods({startMonth:"2026-12",endMonth:"2026-11",amount:1}).length,0);
});
