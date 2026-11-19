import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (relative) => readFileSync(new URL(relative,import.meta.url),"utf8");
const view=read("./modules/ik/DailyHrWorkspace.jsx");
const history=read("./modules/ik/DailyEmployeeWorkPaymentHistory.jsx");
const api=read("../services/dailyOpsApi.js");
const worker=read("../../../../cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts");

test("mevcut personel kartında hem modal hem kart yönetiminde gerçek D1 geçmişi ayrı açılır",()=>{
  assert.match(view,/import DailyEmployeeWorkPaymentHistory/);
  assert.match(view,/className="gop-person-history-toggle"/);
  assert.match(view,/employeeId=\{cardEditor\.id\}/);
  assert.match(view,/employeeId=\{cardDialog\.id\}/);
  assert.match(view,/historyPersonId === cardEditor\.id/);
  assert.match(view,/historyPersonId === cardDialog\.id/);
});
test("tarih bazlı hakediş ve ödeme tarihi bazlı ödeme ayrı, iptal dahil değil",()=>{
  assert.match(worker,/paymentSourceRows\(c,companyId,start,end,employeeId\)/);
  assert.match(worker,/FROM hr_daily_payments[\s\S]*?employee_id=\?/);
  assert.match(worker,/summarizeDailyPersonnelHistory\(worked,payments,adjustmentsResult\.results \|\| \[\]\)/);
  assert.match(api,/getDailyEmployeeWorkPaymentHistory/);
  assert.match(history,/Son 6 Ay/);
  assert.match(history,/Tüm Geçmiş/);
  assert.match(history,/confirmedPaid/);
  assert.match(history,/legacyMarked/);
  assert.match(history,/EARNED_BY_WORK_DATE_PAID_BY_PAYMENT_DATE|Çalışma\/hakediş çalışma tarihine göre/);
});
test("personel geçmişi sadece GET; başka kişi ücretini yazmaz ve ödeme oluşturmaz",()=>{
  assert.match(api,/apiGet\(\x60\$\{ROOT\}\/employees\/\$\{encodeURIComponent\(employeeId\)\}\/history\x60/);
  assert.doesNotMatch(history,/createDailyPayment|saveDailyAttendanceRange|updateDailyEmployee|apiPost/);
  assert.match(history,/setInterval\(\(\) => \{ if \(!document\.hidden\) void load\(true\); \}, 60000\)/);
});
