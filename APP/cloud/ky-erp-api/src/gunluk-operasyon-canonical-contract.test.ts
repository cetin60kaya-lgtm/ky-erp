import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailySource = readFileSync(
  new URL("./gunluk-operasyon-cloud.ts", import.meta.url),
  "utf8",
);
const mainSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("daily operation read and write routes stay in the canonical safety module", () => {
  const requiredRoutes = [
    'app.get("/api/gunluk-operasyon/attendance", protect(listAttendance));',
    'app.post("/api/gunluk-operasyon/attendance/save-range", protect(saveRange));',
    'app.get("/api/gunluk-operasyon/records", protect(listFocused));',
    'app.post("/api/gunluk-operasyon/records", protect(saveFocused));',
    'app.get("/api/gunluk-operasyon/roster", protect(listRoster));',
    'app.post("/api/gunluk-operasyon/roster", protect(saveRoster));',
  ];

  for (const route of requiredRoutes) {
    assert.ok(
      dailySource.includes(route),
      `Canonical Günlük Operasyon route eksik: ${route}`,
    );
  }

  assert.match(dailySource, /hr_daily_attendance\b/);
  assert.match(dailySource, /hr_daily_range_roster\b/);
  assert.match(dailySource, /hr_daily_attendance_notes\b/);
  assert.doesNotMatch(dailySource, /json_store\b/);
});

test("Günlük Operasyon routes are registered before relational and admin fallbacks", () => {
  const safetyIndex = mainSource.indexOf("registerGunlukOperasyonRoutes(app);");
  const relationalIndex = mainSource.indexOf("registerIkRelationalCloudRoutes(app);");
  const adminFallbackIndex = mainSource.indexOf("registerIkAdminCloudRoutes(app);");

  assert.ok(safetyIndex >= 0, "Günlük Operasyon route registration is missing.");
  assert.ok(relationalIndex >= 0, "Relational IK registration is missing.");
  assert.ok(adminFallbackIndex >= 0, "IK admin fallback registration is missing.");
  assert.ok(
    safetyIndex < relationalIndex,
    "Canonical daily routes must be registered before relational routes.",
  );
  assert.ok(
    safetyIndex < adminFallbackIndex,
    "Canonical daily routes must be registered before legacy/admin fallback routes.",
  );
});
test("daily batch revision lookup is bounded to requested dates", () => {
  assert.match(dailySource, /a\.work_date>=\? AND a\.work_date<=\?/);
  assert.match(
    dailySource,
    /SELECT MAX\(r\.revision\)[\s\S]*r\.attendance_id=a\.id/,
  );
  assert.doesNotMatch(dailySource, /const attendanceIds =/);
  assert.doesNotMatch(
    dailySource,
    /attendance_id IN \(\$\{attendanceIds\.map/,
  );
});


test("check-only focused save avoids rewriting unchanged attendance", () => {
  assert.match(dailySource, /const shiftChanges = rows\.filter/);
  assert.match(dailySource, /if \(shiftChanges\.length\) \{/);
  assert.match(dailySource, /writeRows\(c, body, shiftChanges, "KYERP_DAILY_ENTRY_V3"\)/);
  assert.match(dailySource, /checkOnly: true/);
});

test("reviewed status updates persisted check by id or inserts minimal safe columns", () => {
  assert.match(dailySource, /SELECT id,employee_id,checked/);
  assert.match(dailySource, /UPDATE hr_daily_attendance_check/);
  assert.match(dailySource, /INSERT INTO hr_daily_attendance_check/);
  assert.match(dailySource, /GUNLUK_CHECK_WRITE_FAILED/);
});

test("effective-dated wages are written to append-only audit and reused across reports/payments", () => {
  assert.match(dailySource, /action: "EMPLOYEE_WAGE_CHANGE"/);
  assert.match(dailySource, /wageEffectiveDate/);
  assert.match(dailySource, /RETROACTIVE_WAGE_CONFIRM_REQUIRED/);
  assert.match(dailySource, /dailyWageAtDate/);
  assert.match(dailySource, /datedWages\(row,history\)/);
  assert.match(dailySource, /async function weeklySummary[\s\S]*paymentSourceRows\(c,companyId,start,end\)/);
  assert.match(dailySource, /async function paymentSourceRows[\s\S]*const history=await wageHistory/);
  assert.match(dailySource, /settled_day_cents/);
  assert.match(dailySource, /settled_night_cents/);
  assert.match(dailySource, /PAID_SHIFT_LOCKED/);
  assert.doesNotMatch(dailySource, /ALTER TABLE hr_daily_employees/);
});
