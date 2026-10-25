import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overduePaymentPlans, isOpenPaymentPlan } from "./paymentPlanView.js";

test("geciken planlarda vade tarihi esas alınır, ödenmiş ve iptal planlar gizlenir", () => {
  const plans = [
    { id: "past", planned_date: "2026-10-20", status: "PLANNED" },
    { id: "due", planned_date: "2026-11-01", due_date: "2026-10-22", status: "PARTIAL" },
    { id: "today", due_date: "2026-10-25", status: "PLANNED" },
    { id: "paid", due_date: "2026-10-01", status: "PAID" },
    { id: "void", due_date: "2026-10-02", status: "CANCELLED" },
    { id: "no-date", status: "PLANNED" },
  ];
  assert.deepEqual(overduePaymentPlans(plans, "2026-10-25").map((row) => row.id), ["past", "due"]);
  assert.equal(isOpenPaymentPlan(plans[3]), false);
  assert.equal(isOpenPaymentPlan(plans[1]), true);
  assert.deepEqual(overduePaymentPlans(plans, ""), []);
});

test("Ödeme Planı tek backend kaynağını kullanır ve deftere onaysız yazmaz", () => {
  const page = readFileSync(new URL("./PaymentPlannerPanel.jsx", import.meta.url), "utf8");
  const finance = readFileSync(new URL("./FinanceOperationsWorkspace.jsx", import.meta.url), "utf8");
  assert.match(page, /mode === "overdue"/);
  assert.match(page, /overduePaymentPlans\(allRows, today\(\)\)/);
  assert.match(page, /setConfirmPayment\(row\)/);
  assert.match(page, /const row = confirmPayment/);
  assert.match(page, /disabled=\{paying\}/);
  assert.match(page, /"\/muhasebe\/odeme-plani"/);
  assert.match(finance, /<PaymentPlannerPanel activeMainCompany=\{activeMainCompany\} refreshKey=\{refreshKey\}/);
});
