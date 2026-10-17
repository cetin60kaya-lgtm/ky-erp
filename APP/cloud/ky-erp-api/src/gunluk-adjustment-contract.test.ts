import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const worker=readFileSync(new URL("./gunluk-operasyon-cloud.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0061_hr_daily_payment_adjustments.sql",import.meta.url),"utf8");
const client=readFileSync(new URL("../../../app/ky-erp-frontend/src/services/dailyOpsApi.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx",import.meta.url),"utf8");

test("immutable bonus/deduction ledger includes sync, audit and concurrency protection",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS hr_daily_payment_adjustments/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS hr_daily_payment_adjustment_snapshots/);
  assert.match(migration,/trg_daily_adjustment_snapshot_no_update/);
  assert.match(migration,/trg_daily_adjustment_snapshot_no_delete/);
  assert.match(migration,/trg_daily_adjustment_prevent_after_paid/);
  assert.match(migration,/trg_daily_adjustment_prevent_void_settled/);
  assert.match(migration,/trg_daily_adjustment_sync_insert/);
  assert.doesNotMatch(migration,/\bDROP TABLE\b|\bDELETE FROM\b|\bALTER TABLE\b/);
  assert.match(worker,/PAYMENT_ADJUSTMENT_ADD/);
  assert.match(worker,/PAYMENT_ADJUSTMENT_VOID/);
  assert.match(worker,/CANCEL_REASON_REQUIRED|VOID_REASON_REQUIRED/);
  assert.match(worker,/ADJUSTMENT_PERIOD_PAID/);
  assert.match(worker,/adjustmentList/);
});

test("real payment and history use same snapshot and exact cents",()=>{
  assert.match(worker,/dailyAdjustmentNetCents\(baseCents/);
  assert.match(worker,/INSERT INTO hr_daily_payment_adjustment_snapshots/);
  assert.match(worker,/UPDATE hr_daily_payment_adjustments SET settled_payment_id=NULL/);
  assert.match(worker,/FROM hr_daily_payment_adjustment_snapshots WHERE main_company_id/);
  assert.match(worker,/periodAdjustments\(c,companyId,start,end,employeeId\)/);
  assert.match(worker,/const adjustmentSummary=adjustmentTotals/);
  assert.match(worker,/totalAmount:totalCents\/100/);
});

test("UI reads D1 not local-only; history and optional adjustments in receipts",()=>{
  assert.match(ui,/getDailyPaymentAdjustments\(/);
  assert.match(ui,/addDailyPaymentAdjustment\(/);
  assert.match(ui,/voidDailyPaymentAdjustment\(/);
  assert.match(ui,/Ek İşlem|Ek \/ Kesinti/);
  assert.match(ui,/İşlem Geçmişi \/ LOG/);
  assert.match(ui,/Gerekçeli İptal/);
  assert.match(ui,/Net Ödenecek/);
  assert.match(ui,/extraDetails/);
  assert.match(ui,/EK ÖDEME/);
  assert.match(ui,/EK KESİNTİ/);
  assert.match(client,/publishDailyMutation\("addDailyPaymentAdjustment"\)/);
  assert.match(client,/publishDailyMutation\("voidDailyPaymentAdjustment"\)/);
  const print=ui.split("const printPeriodRows = useCallback")[1]?.split("const activePaymentRange =")[0];
  assert.ok(print);
  assert.doesNotMatch(print,/createDailyPayment/);
});
