import test from "node:test";
import assert from "node:assert/strict";
import { dailyMoneyCents, dailyRevisionConflict, periodContains, mergeDailyRosterIds } from "./gunluk-operasyon-core.ts";

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
