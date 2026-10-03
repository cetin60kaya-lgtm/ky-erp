import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHrCompanyId,
  hrDateOnly,
  hrTodayIstanbul,
  hrListResponse,
  calculateAnnualLeaveRange,
  employmentStateAtPeriod,
  advancedEmployeeVisible,
  applyHistoricalEmployeeValues,
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


test("historical employment state is driven by hire/exit dates, not today's passive flag", () => {
  const employee = { status: "Pasif", hireDate: "2025-11-15" };
  const card = { payroll_included: 1, active_passive: "Pasif", exit_date: "2026-09-06" };

  assert.equal(employmentStateAtPeriod(employee, card, "2025-10"), "NOT_STARTED");
  assert.equal(employmentStateAtPeriod(employee, card, "2025-11"), "NEW_HIRE");
  assert.equal(employmentStateAtPeriod(employee, card, "2026-07"), "ACTIVE");
  assert.equal(employmentStateAtPeriod(employee, card, "2026-09"), "EXIT_MONTH");
  assert.equal(employmentStateAtPeriod(employee, card, "2026-10"), "EXITED");

  assert.equal(advancedEmployeeVisible(employee, card, "2026-07"), true);
  assert.equal(advancedEmployeeVisible(employee, card, "2026-09"), true);
  assert.equal(advancedEmployeeVisible(employee, card, "2026-10"), false);
});

test("missing hire or passive-without-exit lifecycle is never silently accepted into payroll", () => {
  assert.equal(employmentStateAtPeriod({ status: "Aktif" }, {}, "2026-10"), "MISSING_HIRE_DATE");
  assert.equal(
    employmentStateAtPeriod({ status: "Pasif", hireDate: "2025-01-01" }, { active_passive: "Pasif" }, "2026-10"),
    "MISSING_EXIT_DATE",
  );
  assert.equal(
    advancedEmployeeVisible({ status: "Pasif", hireDate: "2025-01-01" }, { active_passive: "Pasif" }, "2026-10"),
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


test("historical payroll rewinds salary and payment plan changes after the selected period", () => {
  const current = {
    id: "emp-1",
    salary: 55000,
    roadAllowance: 2000,
    paymentChannel: "Banka + Elden",
    bankPaymentType: "Banka + Elden",
    bankAmount: 28075,
    cashAmount: 28925,
  };
  const changes = [
    { employee_id: "emp-1", field_name: "salary", old_value: "45000", new_value: "55000", effective_date: "2026-09-01", created_at: "2026-09-01T08:00:00Z" },
    { employee_id: "emp-1", field_name: "bankAmount", old_value: "25000", new_value: "28075", effective_date: "2026-09-01", created_at: "2026-09-01T08:00:01Z" },
    { employee_id: "emp-1", field_name: "cashAmount", old_value: "22000", new_value: "28925", effective_date: "2026-09-01", created_at: "2026-09-01T08:00:02Z" },
  ];
  const august = applyHistoricalEmployeeValues(current, changes, "2026-08-31");
  assert.equal(august.salary, 45000);
  assert.equal(august.bankAmount, 25000);
  assert.equal(august.cashAmount, 22000);

  const september = applyHistoricalEmployeeValues(current, changes, "2026-09-30");
  assert.equal(september.salary, 55000);
  assert.equal(september.bankAmount, 28075);
  assert.equal(september.cashAmount, 28925);
});


test("KY annual leave policy can exclude Saturday Sunday and full public holidays day by day", () => {
  const result = calculateAnnualLeaveRange(
    "2026-08-28",
    "2026-09-02",
    [1, 2, 3, 4, 5],
    true,
    [{ date: "2026-08-30", name: "Zafer Bayramı", fraction: 1 }],
  );
  assert.equal(result.calendarDays, 5);
  assert.equal(result.countedDays, 3);
  assert.deepEqual(result.dayDetails.map((row) => [row.date, row.weekdayName, row.counted]), [
    ["2026-08-28", "Cuma", 1],
    ["2026-08-29", "Cumartesi", 0],
    ["2026-08-30", "Pazar", 0],
    ["2026-08-31", "Pazartesi", 1],
    ["2026-09-01", "Salı", 1],
  ]);
  assert.match(result.dayDetails.find((row) => row.date === "2026-08-30")?.reason || "", /Haftalık|Zafer/);
});

test("half-day public holiday deducts only half a leave day when the weekday is counted", () => {
  const result = calculateAnnualLeaveRange(
    "2026-10-28",
    "2026-10-30",
    [1, 2, 3, 4, 5],
    true,
    [
      { date: "2026-10-28", name: "Cumhuriyet Bayramı Arifesi", fraction: 0.5 },
      { date: "2026-10-29", name: "Cumhuriyet Bayramı", fraction: 1 },
    ],
  );
  assert.equal(result.countedDays, 0.5);
  assert.equal(result.dayDetails[0]?.counted, 0.5);
  assert.equal(result.dayDetails[0]?.status, "PARTIAL");
  assert.equal(result.dayDetails[1]?.counted, 0);
  assert.equal(result.dayDetails[1]?.status, "EXCLUDED");
});
