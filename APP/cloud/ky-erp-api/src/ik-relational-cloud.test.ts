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
  resolveReferencePay,
  resolveMonthlyExtra,
  validatePayrollBatchTransition,
} from "./ik-relational-cloud.ts";

test("fixed EK is monthly recurring, additional without reference and included once with reference", () => {
  // Referans + sabit EK: karttaki ücret dağılımı nete ikinci kez eklenmez.
  assert.deepEqual(resolveReferencePay(48100, 45500, 2600, true), {
    actualSalary: 48100, salary: 45500, extra: 2600, legacyFallback: false,
  });
  // Eski hatalı EK=0 kartı yeni aya geçerken eski maaş farkını geri kazanır.
  assert.deepEqual(resolveReferencePay(48000, 45500, 0, true), {
    actualSalary: 48000, salary: 45500, extra: 2500, legacyFallback: true,
  });
  assert.deepEqual(resolveReferencePay(45500, 45500, 0, true), {
    actualSalary: 45500, salary: 45500, extra: 0, legacyFallback: false,
  });
  assert.deepEqual(resolveReferencePay(48100, undefined, 2600, true), {
    actualSalary: 48100, salary: 45500, extra: 2600, missingReference: true,
  });
  // Kullanıcının sabit EK girişi referans farkından FARKLI ise kaybolmaz.
  assert.deepEqual(resolveReferencePay(48100, 50000, 2600, true), {
    actualSalary: 52600, salary: 50000, extra: 2600, legacyFallback: false,
  });
  // Referanssız maaşta EK bağımsız hakediştir: maaş + sabit EK.
  assert.deepEqual(resolveReferencePay(45500, undefined, 2500, false), {
    actualSalary: 45500, salary: 45500, extra: 2500,
  });
  const expected = calculatePayrollAmounts({ salary: 45500, extra: 2500, road: 1680, overtime: 600, deduction: 800 });
  assert.equal(expected.net, 49480);
  const linked = resolveReferencePay(48100, 45500, 2600, true);
  assert.equal(calculatePayrollAmounts({ salary: linked.salary, extra: linked.extra, road: 1680 }).net, 49780);
  // Referans maaşı değişse bile EK tutarı sonraki ay da aynıdır.
  assert.equal(resolveReferencePay(48100, 47000, 2600, true).extra, 2600);
});

test("monthly EK includes permanent amount despite old zero row; explicit selected-month zero stays zero", () => {
  assert.equal(resolveMonthlyExtra(2500, 0, false), 2500);
  assert.equal(resolveMonthlyExtra(2500, 0, true), 2500);
  assert.equal(resolveMonthlyExtra(2500, 0, true, true), 0);
  assert.equal(resolveMonthlyExtra(2500, 1900, true), 1900);
  assert.equal(resolveMonthlyExtra(2500, 1900, false), 2500);
  assert.equal(resolveMonthlyExtra(0, 0, true), 0);
  assert.equal(resolveMonthlyExtra(2500.25, 0, true), 2500.25);
});

test("paid payroll never reverts to CALCULATED or gets paid again", () => {
  const { row, projection } = payrollBatchFixture();
  const paid = { ...row, status: "PAID" };
  assert.equal(validatePayrollBatchTransition([paid], ["test-employee"], [projection], "CALCULATED")?.code, "PAYROLL_PAID_LOCKED");
  assert.equal(validatePayrollBatchTransition([paid], ["test-employee"], [projection], "PAID")?.code, "PAYROLL_PAID_LOCKED");
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [projection], "REOPEN")?.code, "PAYROLL_STATUS_INVALID");
});

function payrollBatchFixture() {
  const row = {
    employee_id: "test-employee", status: "OVERRIDE",
    salary: 40000, road_allowance: 2000, premium_amount: 2500,
    overtime_amount: 0, advance_amount: 1000, deduction_amount: 0,
    garnishment_amount: 0, bank_amount: 25000, cash_amount: 18500,
    total_amount: 43500,
  };
  const projection = {
    employeeId: "test-employee", frozen: false, sourceChangedSinceSave: false,
    final: {
      salaryPay: 40000, roadPay: 2000, premiumAmount: 2500,
      overtimeAmount: 0, advanceAmount: 1000, deductionAmount: 0,
      garnishmentAmount: 0, bank: 25000, cash: 18500, total: 43500,
    },
  };
  return { row, projection };
}

test("payroll batch refuses any stale, missing or unbalanced record before status writes", () => {
  const { row, projection } = payrollBatchFixture();
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [projection], "CALCULATED"), null);
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [projection], "PAID"), null);
  assert.equal(validatePayrollBatchTransition([], ["test-employee"], [projection], "PAID")?.code, "PAYROLL_NOT_FROZEN");
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [], "PAID")?.code, "PAYROLL_PROJECTION_MISSING");
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [{ ...projection, frozen: true }], "PAID")?.code, "PAYROLL_PROJECTION_MISSING");
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [{ ...projection, sourceChangedSinceSave: true }], "PAID")?.code, "PAYROLL_SOURCE_CHANGED");
  const unbalanced = { ...projection, final: { ...projection.final, cash: 18501 } };
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [unbalanced], "PAID")?.code, "PAYROLL_TOTAL_MISMATCH");
  const invalidNet = { ...projection, final: { ...projection.final, total: 44000 } };
  assert.equal(validatePayrollBatchTransition([row], ["test-employee"], [invalidNet], "PAID")?.code, "PAYROLL_TOTAL_MISMATCH");
  assert.equal(validatePayrollBatchTransition([{ ...row, premium_amount: 0 }], ["test-employee"], [projection], "PAID")?.code, "PAYROLL_SNAPSHOT_STALE");
});

test("ten-up batch checks all rows: one paid or mismatched row prevents the whole status transition", () => {
  const { row, projection } = payrollBatchFixture();
  const ids = Array.from({ length: 10 }, (_, index) => "employee-" + index);
  const savedRows = ids.map((id) => ({ ...row, employee_id: id }));
  const projections = ids.map((id) => ({ ...projection, employeeId: id }));
  assert.equal(validatePayrollBatchTransition(savedRows, ids, projections, "CALCULATED"), null);
  assert.equal(validatePayrollBatchTransition(savedRows, ids, projections, "PAID"), null);
  savedRows[9] = { ...savedRows[9], status: "PAID" };
  assert.equal(validatePayrollBatchTransition(savedRows, ids, projections, "CALCULATED")?.code, "PAYROLL_PAID_LOCKED");
  savedRows[9] = { ...savedRows[9], status: "OVERRIDE" };
  projections[9] = { ...projections[9], sourceChangedSinceSave: true };
  assert.equal(validatePayrollBatchTransition(savedRows, ids, projections, "PAID")?.code, "PAYROLL_SOURCE_CHANGED");
});

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

test("missing lifecycle dates stay visible for payroll but block clean close", () => {
  assert.equal(employmentStateAtPeriod({ status: "Aktif" }, {}, "2026-10"), "MISSING_HIRE_DATE");
  assert.equal(advancedEmployeeVisible({ status: "Aktif" }, {}, "2026-10"), true);
  assert.equal(
    employmentStateAtPeriod({ status: "Pasif", hireDate: "2025-01-01" }, { active_passive: "Pasif" }, "2026-10"),
    "MISSING_EXIT_DATE",
  );
  assert.equal(
    advancedEmployeeVisible({ status: "Pasif", hireDate: "2025-01-01" }, { active_passive: "Pasif" }, "2026-10"),
    true,
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


test("fixed EK and base reference have effective-date history independent of current payroll", () => {
  const current = { id: "a", salary: 42000, extraPaymentAmount: 3500, baseEmployeeId: "ref-new" };
  const changes = [
    { employee_id: "a", field_name: "extraPaymentAmount", old_value: "1800", new_value: "3500", effective_date: "2026-11-01", created_at: "2026-11-03T10:00:00Z" },
    { employee_id: "a", field_name: "baseEmployeeId", old_value: "ref-old", new_value: "ref-new", effective_date: "2026-11-01", created_at: "2026-11-03T10:00:01Z" },
  ];
  const october = applyHistoricalEmployeeValues(current, changes, "2026-10-31");
  assert.equal(october.extraPaymentAmount, 1800);
  assert.equal(october.baseEmployeeId, "ref-old");
  const november = applyHistoricalEmployeeValues(current, changes, "2026-11-30");
  assert.equal(november.extraPaymentAmount, 3500);
  assert.equal(november.baseEmployeeId, "ref-new");
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
