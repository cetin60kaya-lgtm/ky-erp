import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDailyPersonnelHistory } from "./gunluk-personnel-history-core.ts";

test("kişi kartı gündüz/gece, eski işaret ve kesin ödeme defterini ayırır", () => {
  const report = summarizeDailyPersonnelHistory([
    {work_date:"2026-11-12",day_shift:1,night_shift:0,day_wage:1000,day_paid_item:1,payment_status:"PAID",ledger_item_count:1},
    {work_date:"2026-11-13",day_shift:1,night_shift:1,day_wage:1200,night_wage:1750,payment_status:"WAITING",ledger_item_count:0},
    {work_date:"2026-11-14",day_shift:0,night_shift:1,night_wage:1500,payment_status:"PAID",ledger_item_count:0},
  ],[
    {status:"PAID",total_amount_cents:100000},
    {status:"CANCELLED",total_amount_cents:300000},
  ],[
    {kind:"ADD",amount_cents:10000,settled_payment_id:null},
    {kind:"DEDUCT",amount_cents:5000,settled_payment_id:"paid-1"},
  ]);
  assert.equal(report.dayCount,2);
  assert.equal(report.nightCount,2);
  assert.equal(report.workedDays,3);
  assert.equal(report.dayTotal,2200);
  assert.equal(report.nightTotal,3250);
  assert.equal(report.baseEarned,5450);
  assert.equal(report.earnedNet,5500);
  assert.equal(report.confirmedPaid,1000);
  assert.equal(report.confirmedPaymentCount,1);
  assert.equal(report.cancelledPaymentCount,1);
  assert.equal(report.legacyMarked,1500);
  assert.equal(report.openBase,2950);
  assert.equal(report.openNet,3050);
  assert.equal(report.shifts[0].date,"2026-11-14");
});
test("aynı kişi farklı dönemlerde de tek ledger hesabı, iptal iki kez sayılmaz",()=>{
  const result=summarizeDailyPersonnelHistory([],[
    {status:"PAID",total_amount_cents:85321},
    {status:"PAID",total_amount_cents:152699},
    {status:"CANCELLED",total_amount_cents:152699},
  ],[]);
  assert.equal(result.confirmedPaid,2380.2);
  assert.equal(result.confirmedPaymentCount,2);
  assert.equal(result.cancelledPaymentCount,1);
  assert.equal(result.earnedNet,0);
});
test("bozuk ödeme kuruşu sessizce sıfırlanmaz", () => {
  assert.throws(() => summarizeDailyPersonnelHistory([], [{status:"PAID",total_amount_cents:1.3}],[]),/INVALID_LEDGER_AMOUNT/);
});
