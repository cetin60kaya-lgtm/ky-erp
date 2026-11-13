import test from "node:test";
import assert from "node:assert/strict";
import { payrollPresentation } from "./ikPayrollPresentation.js";

test("EK is part of earnings once, not a second payment on single or ten-up slip", () => {
  const row = { salary: 30000, road: 1500, extra: 6000, overtime: 4000, advance: 2000, deduction: 1000, garnishment: 500, bank: 25000, cash: 13000, net: 38000 };
  const p = payrollPresentation(row);
  assert.equal(p.gross, 41500);
  assert.equal(p.totalDeductions, 3500);
  assert.equal(p.calculatedNet, 38000);
  assert.equal(p.extraCoupon, 6000);
  assert.equal(p.mainNet, 32000);
  assert.equal(p.mainBank, 25000);
  assert.equal(p.mainCash, 7000);
  assert.equal(p.couponBank, 0);
  assert.equal(p.couponCash, 6000);
  assert.equal(p.mainNet + p.extraCoupon, p.fullNet);
  assert.equal(p.mainBank + p.couponBank, p.bank);
  assert.equal(p.mainCash + p.couponCash, p.cash);
  assert.equal(p.bank + p.cash, p.fullNet);
  assert.equal(p.reconciled, true);
});

test("EK coupon preserves bank and cash channel when not enough cash is available", () => {
  const p = payrollPresentation({ salary: 25000, road: 1000, extra: 5000, advance: 200, bank: 30000, cash: 800, net: 30800 });
  assert.equal(p.extraCoupon, 5000);
  assert.equal(p.couponBank, 4200);
  assert.equal(p.couponCash, 800);
  assert.equal(p.mainBank, 25800);
  assert.equal(p.mainCash, 0);
  assert.equal(p.mainNet, 25800);
  assert.equal(p.reconciled, true);
});

test("road is ordinary earning, not an extra detachable coupon", () => {
  const p = payrollPresentation({ salary: 10000, road: 2000, extra: 0, bank: 11000, cash: 1000, net: 12000 });
  assert.equal(p.road, 2000);
  assert.equal(p.extraCoupon, 0);
  assert.equal(p.mainNet, 12000);
  assert.equal(p.reconciled, true);
});

test("a stale net amount or unequal bank and cash is detected, never hidden by print display", () => {
  assert.equal(payrollPresentation({ salary: 10000, road: 1000, extra: 500, bank: 11000, cash: 500, net: 11000 }).reconciled, false);
  assert.equal(payrollPresentation({ salary: 10000, road: 1000, extra: 500, bank: 10000, cash: 0, net: 11500 }).reconciled, false);
});

test("decimal amounts remain exact at cent precision", () => {
  const p = payrollPresentation({ salary: 1234.5, road: 168.75, extra: 6.25, overtime: 0.5, advance: 10.01, bank: 1200, cash: 199.99, net: 1399.99 });
  assert.equal(p.calculatedNet, 1399.99);
  assert.equal(p.fullNet, 1399.99);
  assert.equal(p.mainNet + p.extraCoupon, 1399.99);
  assert.equal(p.reconciled, true);
});
