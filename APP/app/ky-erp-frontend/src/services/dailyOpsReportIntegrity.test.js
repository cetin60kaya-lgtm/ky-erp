import test from "node:test";
import assert from "node:assert/strict";
import { dailyWorkDateInRange, reconcileDailyWeeklyReport } from "./dailyOpsReportIntegrity.js";

test("log includes both boundaries, excludes all other work dates despite createdAt", () => {
  const start = "2026-11-02", end = "2026-11-08";
  assert.equal(dailyWorkDateInRange({ workDate: start, createdAt: "2026-11-12T09:00:00" }, start, end), true);
  assert.equal(dailyWorkDateInRange({ workDate: end }, start, end), true);
  assert.equal(dailyWorkDateInRange({ workDate: "2026-11-01", createdAt: "2026-11-04T10:00:00" }, start, end), false);
  assert.equal(dailyWorkDateInRange({ workDate: "2026-11-09" }, start, end), false);
  assert.equal(dailyWorkDateInRange({ createdAt: "2026-11-04T09:00:00" }, start, end), false);
  assert.equal(dailyWorkDateInRange({ date: "2026-11-06T12:00:00Z" }, start, end), true);
});
test("D1 weekly report is the sole source of wages plus additions minus deductions", () => {
  const rows = reconcileDailyWeeklyReport([
    { employeeId: "p1", name: "A", dayCount: 2, nightCount: 1, totalAmount: 3000, days: { "2026-11-02": { day: true } } },
  ], [
    { employeeId: "p1", name: "A", dayCount: 2, nightCount: 1, baseAmount: 3000, additions: 500, deductions: 125, totalAmount: 3375 },
  ]);
  assert.equal(rows[0].totalAmount, 3375);
  assert.equal(rows[0].baseAmount, 3000);
  assert.equal(rows[0].additions, 500);
  assert.equal(rows[0].deductions, 125);
  assert.equal(rows[0].financialVerified, true);
  assert.equal(rows[0].days["2026-11-02"].day, true);
});
test("an extra-only employee is included and no other employee is called verified by accident", () => {
  const rows = reconcileDailyWeeklyReport([{ employeeId: "p1", name: "A", totalAmount: 250 }], [
    { employeeId: "p2", name: "B", baseAmount: 0, additions: 70, deductions: 10, totalAmount: 60 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.employeeId === "p1").financialVerified, false);
  assert.equal(rows.find((r) => r.employeeId === "p2").totalAmount, 60);
});
test("invalid or inconsistent D1 financial amounts never enter the printable weekly report", () => {
  assert.throws(() => reconcileDailyWeeklyReport([], null), /geçersiz/);
  assert.throws(() => reconcileDailyWeeklyReport([], [{ employeeId: "p1", baseAmount: 100, additions: 20, deductions: 3, totalAmount: 100 }]), /uyuşmuyor/);
  assert.throws(() => reconcileDailyWeeklyReport([], [{ employeeId: "p1", baseAmount: "bad", totalAmount: 100 }]), /geçersiz/);
});

test("vardiya adetleri farklıysa haftalık/fiş basımı için mali kayıt onayı verilmez", () => {
  assert.throws(() => reconcileDailyWeeklyReport([
    { employeeId: "p1", dayCount: 2, nightCount: 1, totalAmount: 3000 },
  ], [
    { employeeId: "p1", dayCount: 3, nightCount: 1, baseAmount: 3000, additions: 0, deductions: 0, totalAmount: 3000 },
  ]), /vardiya sayıları/);
});
test("personelin gün-gece toplamı ile sunucudaki baz tutar farklıysa çıktı durur", () => {
  assert.throws(() => reconcileDailyWeeklyReport([
    { employeeId: "p1", dayCount: 2, nightCount: 1, totalAmount: 3000 },
  ], [
    { employeeId: "p1", dayCount: 2, nightCount: 1, baseAmount: 3100, additions: 0, deductions: 0, totalAmount: 3100 },
  ]), /baz hakedişiyle/);
});
test("aynı personel farklı gün ve gece vardiyalarında doğru fiş neti verir", () => {
  const rows = reconcileDailyWeeklyReport([
    { employeeId: "p1", name: "Çalışan", dayCount: 2, nightCount: 1, dayTotal: 2500, nightTotal: 1800, totalAmount: 4300 },
  ], [
    { employeeId: "p1", dayCount: 2, nightCount: 1, baseAmount: 4300, additions: 200, deductions: 50, totalAmount: 4450 },
  ]);
  assert.equal(rows[0].totalAmount, 4450);
  assert.equal(rows[0].dayTotal, 2500);
  assert.equal(rows[0].nightTotal, 1800);
  assert.equal(rows[0].financialVerified, true);
});
