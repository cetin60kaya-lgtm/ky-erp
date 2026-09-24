import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailySafetySource = readFileSync(
  new URL("./ik-daily-safety.ts", import.meta.url),
  "utf8",
);
const mainSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("daily operation read and write routes stay in the canonical safety module", () => {
  const requiredRoutes = [
    'app.get("/api/ik/daily-attendance", protect(listAttendance));',
    'app.post("/api/ik/daily-attendance/save-range", protect(saveRange));',
    'app.get("/api/ik/gunluk-personel/gun-kayitlari", protect(listFocused));',
    'app.post("/api/ik/gunluk-personel/gun-kayitlari", protect(saveFocused));',
    'app.get("/api/ik/gunluk-personel/liste", protect(listRoster));',
    'app.post("/api/ik/gunluk-personel/liste", protect(saveRoster));',
  ];

  for (const route of requiredRoutes) {
    assert.ok(
      dailySafetySource.includes(route),
      `Canonical Günlük Operasyon route eksik: ${route}`,
    );
  }

  assert.match(dailySafetySource, /hr_daily_attendance\b/);
  assert.match(dailySafetySource, /hr_daily_range_roster\b/);
  assert.match(dailySafetySource, /hr_daily_attendance_notes\b/);
  assert.doesNotMatch(dailySafetySource, /json_store\b/);
});

test("daily safety routes are registered before relational and admin fallbacks", () => {
  const safetyIndex = mainSource.indexOf("registerIkDailySafetyRoutes(app);");
  const relationalIndex = mainSource.indexOf("registerIkRelationalCloudRoutes(app);");
  const adminFallbackIndex = mainSource.indexOf("registerIkAdminCloudRoutes(app);");

  assert.ok(safetyIndex >= 0, "Daily safety route registration is missing.");
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
