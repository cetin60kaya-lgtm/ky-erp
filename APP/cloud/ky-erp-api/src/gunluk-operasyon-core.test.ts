import test from "node:test";
import assert from "node:assert/strict";
import { dailyMoneyCents, dailyRevisionConflict, periodContains, mergeDailyRosterIds, dailyWageAtDate, resolveRecordedShiftWages, validDailyWageAmount } from "./gunluk-operasyon-core.ts";

test("new record does not require revision", () => {
  assert.equal(dailyRevisionConflict("", ""), "");
});

test("existing record requires the revision read from server", () => {
  assert.equal(dailyRevisionConflict("2026-09-19T08:00:00Z", ""), "DAILY_REVISION_REQUIRED");
});

test("second computer with stale revision is rejected", () => {
  assert.equal(
    dailyRevisionConflict("2026-09-19T08:05:00Z", "2026-09-19T08:00:00Z"),
    "DAILY_RECORD_CHANGED",
  );
});

test("same server revision can be saved", () => {
  assert.equal(
    dailyRevisionConflict("2026-09-19T08:05:00Z", "2026-09-19T08:05:00Z"),
    "",
  );
});

test("period lock contains only dates inside range", () => {
  assert.equal(periodContains("2026-09-14", "2026-09-18", "2026-09-14"), true);
  assert.equal(periodContains("2026-09-14", "2026-09-18", "2026-09-18"), true);
  assert.equal(periodContains("2026-09-14", "2026-09-18", "2026-09-19"), false);
});

test("money is stored as integer cents in immutable revision", () => {
  assert.equal(dailyMoneyCents(1500.5), 150050);
  assert.equal(dailyMoneyCents("725.25"), 72525);
});


test("empty roster never falls back to every active daily employee", () => {
  assert.deepEqual(mergeDailyRosterIds([], [], ["one", "two", "three"]), []);
});

test("daily roster keeps explicit and actually worked employees only", () => {
  assert.deepEqual(mergeDailyRosterIds(["selected", "missing"], ["worked", "selected"], ["selected", "worked", "pool-only"]), ["selected", "worked"]);
});

test("1000 TL last week and 1200 TL this week remain separate for same person", () => {
  const change = [{ id:"w1", effectiveDate:"2026-10-12", createdAt:"2026-10-16T07:00:00Z", beforeDayWage:1000, beforeNightWage:1300, dayWage:1200, nightWage:1600 }];
  assert.deepEqual(dailyWageAtDate({ dayWage:1200, nightWage:1600 }, "2026-10-10", change), { dayWage:1000, nightWage:1300 });
  assert.deepEqual(dailyWageAtDate({ dayWage:1200, nightWage:1600 }, "2026-10-12", change), { dayWage:1200, nightWage:1600 });
  assert.deepEqual(dailyWageAtDate({ dayWage:1200, nightWage:1600 }, "2026-10-16", change), { dayWage:1200, nightWage:1600 });
});
test("sequential wage raises and same-week corrections respect effective dates", () => {
  const changes = [
    { effectiveDate:"2026-10-12", createdAt:"2026-10-12T09:00:00Z", beforeDayWage:1000, beforeNightWage:1400, dayWage:1200, nightWage:1500 },
    { effectiveDate:"2026-10-12", createdAt:"2026-10-13T09:00:00Z", beforeDayWage:1200, beforeNightWage:1500, dayWage:1250, nightWage:1550 },
    { effectiveDate:"2026-10-19", createdAt:"2026-10-19T09:00:00Z", beforeDayWage:1250, beforeNightWage:1550, dayWage:1350, nightWage:1650 },
  ];
  assert.equal(dailyWageAtDate({ dayWage:1350, nightWage:1650 }, "2026-10-10", changes).dayWage,1000);
  assert.equal(dailyWageAtDate({ dayWage:1350, nightWage:1650 }, "2026-10-16", changes).dayWage,1250);
  assert.equal(dailyWageAtDate({ dayWage:1350, nightWage:1650 }, "2026-10-20", changes).nightWage,1650);
});

test("aynı kişi ve tarihte gündüz/gece ücreti ödenmemiş vardiyada tarihli karttan gelir", () => {
  const effective = dailyWageAtDate({dayWage: 1250,nightWage: 1600},"2026-11-17",
    [{effectiveDate:"2026-11-15",beforeDayWage:1100,beforeNightWage:1400,dayWage:1250,nightWage:1600}]);
  assert.deepEqual(resolveRecordedShiftWages(effective,{paymentStatus:"WAITING",ledgerItemCount:0}),
    {dayWage:1250,nightWage:1600});
});
test("kısmi ödemede sadece ödenmiş vardiya sabitlenir; açık gece tarihli ücreti alır", () => {
  assert.deepEqual(resolveRecordedShiftWages({dayWage:1400,nightWage:1750},{
    paymentStatus:"PAID",ledgerItemCount:1,savedDayWage:900,savedNightWage:1000,
    settledDayCents:115050,settledNightCents:null,
  }),{dayWage:1150.5,nightWage:1750});
});
test("ödeme defteri öncesindeki eski ödemede iki vardiya da tarihsel sabit kalır", () => {
  assert.deepEqual(resolveRecordedShiftWages({dayWage:1800,nightWage:2200},{
    paymentStatus:"PAID",ledgerItemCount:0,savedDayWage:900,savedNightWage:1250,
  }),{dayWage:900,nightWage:1250});
});
test("ödenmiş hatalı kuruş tutarı sessiz sıfıra dönüştürülmez", () => {
  assert.throws(() => resolveRecordedShiftWages({dayWage:1000,nightWage:1500},{settledDayCents:33.4}), /INVALID_SETTLED_WAGE/);
});

test("personel kartı ücretinde tek kuruş kuralı: geçerli ve geçersiz tutarlar", () => {
  assert.equal(validDailyWageAmount(1250.55), 1250.55);
  assert.equal(validDailyWageAmount("1450,50"), null);
  assert.equal(validDailyWageAmount(-1), null);
  assert.equal(validDailyWageAmount("abc"), null);
  assert.equal(validDailyWageAmount(1234.567), null);
  assert.equal(validDailyWageAmount(0), 0);
});
