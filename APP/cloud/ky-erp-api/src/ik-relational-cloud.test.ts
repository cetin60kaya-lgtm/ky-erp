import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHrCompanyId,
  hrDateOnly,
  hrTodayIstanbul,
  hrListResponse,
  mergeDailyRosterIds,
  calculateAnnualLeaveRange,
  advancedEmployeeVisible,
  calculateOvertimeAmount,
  calculatePayrollAmounts,
} from "./ik-relational-cloud.ts";

test("mecit-hakan tenant aliases normalize to one canonical id", () => {
  for (const alias of [
    "mecit-hakan",
    "main-mecit-hakan",
    "mecit-hakan-gursu",
    "hakan-baski",
    "main-hakan",
    "main-hakan-baski",
    "hkn-baski",
    "MAIN_MECIT_HAKAN",
  ]) {
    assert.equal(canonicalHrCompanyId(alias), "mecit-hakan");
  }
  assert.equal(canonicalHrCompanyId(undefined), "mecit-hakan");
});

test("SQLite millisecond and ISO dates map to frontend date-only values", () => {
  assert.equal(hrDateOnly(1781827200000), "2026-06-19");
  assert.equal(hrDateOnly("2026-08-05T09:30:00.000Z"), "2026-08-05");
  assert.equal(hrDateOnly(null), "");
});

test("list responses expose both frontend-compatible list keys", () => {
  const rows = [{ id: "one" }];
  const response = hrListResponse(rows);
  assert.deepEqual(response, {
    ok: true,
    success: true,
    data: rows,
    items: rows,
  });
  assert.equal(response.data, response.items);
});

test("empty roster never falls back to every active daily employee", () => {
  assert.deepEqual(mergeDailyRosterIds([], [], ["one", "two", "three"]), []);
});

test("daily roster keeps explicit and actually worked employees only", () => {
  assert.deepEqual(
    mergeDailyRosterIds(["selected", "missing"], ["worked", "selected"], ["selected", "worked", "pool-only"]),
    ["selected", "worked"],
  );
});


test("10 Aug 2026 leave start and 31 Aug return counts exactly 18 days", () => {
  const result = calculateAnnualLeaveRange(
    "2026-08-10",
    "2026-08-31",
    [1, 2, 3, 4, 5, 6],
    true,
    ["2026-08-30"],
  );
  assert.equal(result.lastLeaveDate, "2026-08-30");
  assert.equal(result.returnDate, "2026-08-31");
  assert.equal(result.calendarDays, 21);
  assert.equal(result.countedDays, 18);
  assert.deepEqual(result.excludedDates.map((row) => row.date), ["2026-08-16", "2026-08-23", "2026-08-30"]);
});


test("passive employee remains in final payroll month when exit date is in that period", () => {
  assert.equal(
    advancedEmployeeVisible(
      { status: "Pasif" },
      { payroll_included: 1, active_passive: "Pasif", exit_date: "2026-09-06" },
      "2026-09",
    ),
    true,
  );
  assert.equal(
    advancedEmployeeVisible(
      { status: "Pasif" },
      { payroll_included: 1, active_passive: "Pasif", exit_date: "2026-09-06" },
      "2026-10",
    ),
    false,
  );
});

test("overtime is recalculated with salary / 225 x hours x multiplier", () => {
  assert.equal(calculateOvertimeAmount(45000, 2, 1.5), 600);
  assert.equal(calculateOvertimeAmount(45000, 2, 2), 800);
  assert.equal(calculateOvertimeAmount(45000, 0, 2), 0);
});


test("canonical payroll equation includes earnings and all deductions", () => {
  const result = calculatePayrollAmounts({
    salary: 40000,
    road: 2000,
    extra: 3000,
    overtime: 600,
    advance: 1000,
    deduction: 500,
    garnishment: 100,
  });
  assert.deepEqual(result, { earnings: 45600, net: 44000 });
});


test("Istanbul business date does not fall back to the previous UTC day", () => {
  assert.equal(hrTodayIstanbul(new Date("2026-09-30T21:30:00.000Z")), "2026-10-01");
});
