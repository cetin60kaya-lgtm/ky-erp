import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewExpense } from "./expenseReview.js";

const valid = { date: "2026-10-25", category: "Boya", amount: "120.50", vatAmount: "20.10", recordType: "RESMI", recurring: false };
test("manuel gider yalniz onizleme snapshotini uretir; mutation yok", () => {
  const result = reviewExpense(valid, { mainCompanySlug: "test" });
  assert.deepEqual([result.payload.amount, result.payload.vatAmount, result.templateOnly], [120.5, 20.1, false]);
  assert.equal(result.payload.mainCompanySlug, "test");
  assert.equal(reviewExpense({ ...valid, recurring: true }).templateOnly, true);
});
test("gider tutari ve KDV sayisal olmayan negatif veya bos olamaz", () => {
  for (const value of ["", "0", "-10", "NaN", "Infinity"]) assert.ok(reviewExpense({ ...valid, amount: value }).error);
  for (const value of ["-1", "abc", "Infinity"]) assert.ok(reviewExpense({ ...valid, vatAmount: value }).error);
  assert.equal(reviewExpense({ ...valid, vatAmount: "" }).payload.vatAmount, 0);
  assert.ok(reviewExpense({ ...valid, date: "2026-44-32" }).error);
  assert.ok(reviewExpense({ ...valid, recordType: "X" }).error);
});
test("gider ekrani kaydetmeden once acik onay ve tekli POST kilidi kullanir", () => {
  const ui = readFileSync(new URL("./ProfitLossWorkspace.jsx", import.meta.url), "utf8");
  assert.match(ui, /onClick=\{pendingExpense \? confirmExpenseSave : requestExpenseSave\}/);
  assert.match(ui, /savingLock\.current = true/);
  assert.match(ui, /<fieldset className="plw-form" disabled=/);
  assert.match(ui, /Onayla ve Kaydet/);
  assert.match(ui, /Gerçek gider kaydı/);
  assert.doesNotMatch(ui, /onClick=\{saveExpense\}/);
});
