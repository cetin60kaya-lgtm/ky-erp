import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDailyPersonnelHistory, monthlyDailyPersonnelHistory } from "./gunluk-personnel-history-core.ts";

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

test("altı aylık bordro görünümünde çalışma ayı ve kesin ödeme ayı ayrı hesaplanır", () => {
  const result=monthlyDailyPersonnelHistory([
    {work_date:"2026-08-14",day_shift:1,night_shift:0,day_wage:1500},
    {work_date:"2026-08-15",day_shift:1,night_shift:1,day_wage:1600,night_wage:2000},
    {work_date:"2026-09-01",day_shift:0,night_shift:1,night_wage:2500},
  ],[
    {paid_date:"2026-09-03",status:"PAID",total_amount_cents:310000},
    {paid_date:"2026-09-03",status:"CANCELLED",total_amount_cents:200000},
    {paid_date:"2026-10-02",status:"PAID",total_amount_cents:250000},
  ],[
    {period_start:"2026-08-14",kind:"ADD",amount_cents:25000},
    {period_start:"2026-08-14",kind:"DEDUCT",amount_cents:5000},
  ]);
  assert.deepEqual(result.map(row=>row.month),["2026-10","2026-09","2026-08"]);
  assert.equal(result.find(row=>row.month==="2026-08")?.earnedNet,5300);
  assert.equal(result.find(row=>row.month==="2026-08")?.dayCount,2);
  assert.equal(result.find(row=>row.month==="2026-08")?.nightCount,1);
  assert.equal(result.find(row=>row.month==="2026-09")?.confirmedPaid,3100);
  assert.equal(result.find(row=>row.month==="2026-10")?.confirmedPaid,2500);
  assert.equal(result.reduce((sum,row)=>sum+row.confirmedPaid,0),5600);
});
test("iptal ödeme aylık toplamı değiştirmez; bozulan ödeme kuruşu reddedilir",()=>{
  assert.deepEqual(monthlyDailyPersonnelHistory([],[
    {paid_date:"2026-11-04",status:"CANCELLED",total_amount_cents:40000},
  ],[]),[]);
  assert.throws(()=>monthlyDailyPersonnelHistory([],[
    {paid_date:"2026-11-04",status:"PAID",total_amount_cents:0.33},
  ],[]), /INVALID_LEDGER_AMOUNT/);
});
