import test from "node:test";
import assert from "node:assert/strict";
import { dailyAdjustmentNetCents } from "./gunluk-adjustment-core.ts";

test("ek ödeme ve kesinti kuruş bazında net hakedişi hesaplar", () => {
  assert.equal(dailyAdjustmentNetCents(1000000,[{kind:"ADD",amount_cents:100000},{kind:"DEDUCT",amount_cents:30000}]),1070000);
  assert.equal(dailyAdjustmentNetCents(100001,[{kind:"ADD",amount_cents:29},{kind:"DEDUCT",amount_cents:50}]),99980);
  assert.equal(dailyAdjustmentNetCents(140000,[]),140000);
});
test("tutar, tür ve overflow hataları sessizce kabul edilmez", () => {
  assert.throws(()=>dailyAdjustmentNetCents(100,[{kind:"ADD",amount_cents:-1}]));
  assert.throws(()=>dailyAdjustmentNetCents(100,[{kind:"DEDUCT",amount_cents:0}]));
  assert.throws(()=>dailyAdjustmentNetCents(-1,[]));
  assert.throws(()=>dailyAdjustmentNetCents(Number.MAX_SAFE_INTEGER,[{kind:"ADD",amount_cents:1}]));
});
