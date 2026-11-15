import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyReminderDate } from "./weeklyReminderDate.js";
test("Cuma ödeme için çarşamba iki gün önce uyarı",()=>{
  assert.deepEqual(weeklyReminderDate(5,2,"2026-11-16"),{dueDate:"2026-11-20",remindOn:"2026-11-18"});
});
test("hatırlatma günü geçince gelecek haftaya döner",()=>{
  assert.deepEqual(weeklyReminderDate(5,2,"2026-11-19"),{dueDate:"2026-11-27",remindOn:"2026-11-25"});
});
test("ay ve yıl değişiminde güvenli",()=>{
  assert.deepEqual(weeklyReminderDate(5,2,"2026-12-30"),{dueDate:"2027-01-01",remindOn:"2026-12-30"});
});
test("geçersiz aralık yok",()=>{
  assert.equal(weeklyReminderDate(8,2,"2026-11-16"),null);
  assert.equal(weeklyReminderDate(5,-1,"2026-11-16"),null);
});
