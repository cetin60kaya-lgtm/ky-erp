import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHrCompanyId,
  hrDateOnly,
  hrListResponse,
  mergeDailyRosterIds,
  calculateAnnualLeaveRange,
} from "./ik-relational-cloud.ts";

test("mecit-hakan tenant aliases normalize to one canonical id", () => {
  assert.equal(canonicalHrCompanyId("mecit-hakan"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId("main-mecit-hakan"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId("MAIN_MECIT_HAKAN"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId(undefined), "mecit-hakan");
});

test("SQLite millisecond and ISO dates map to frontend date-only values", () => {
  assert.equal(hrDateOnly(1781827200000), "2026-06-19");
  assert.equal(hrDateOnly("2026-08-05T09:30:00.000Z"), "2026-08-05");
  assert.equal(hrDateOnly(null), "");
});

test("list responses expose both frontend-compatible list keys", () => {
  const rows = [{ id: "one" }];
  const response = hrListResponse(rows);
  assert.deepEqual(response, {
    ok: true,
    success: true,
    data: rows,
    items: rows,
  });
  assert.equal(response.data, response.items);
});

test("empty roster never falls back to every active daily employee", () => {
  assert.deepEqual(mergeDailyRosterIds([], [], ["one", "two", "three"]), []);
});

test("daily roster keeps explicit and actually worked employees only", () => {
  assert.deepEqual(
    mergeDailyRosterIds(["selected", "missing"], ["worked", "selected"], ["selected", "worked", "pool-only"]),
    ["selected", "worked"],
  );
});


test("10 Aug 2026 leave start and 31 Aug return counts exactly 18 days", () => {
  const result = calculateAnnualLeaveRange(
    "2026-08-10",
    "2026-08-31",
    [1, 2, 3, 4, 5, 6],
    true,
    ["2026-08-30"],
  );
  assert.equal(result.lastLeaveDate, "2026-08-30");
  assert.equal(result.returnDate, "2026-08-31");
  assert.equal(result.calendarDays, 21);
  assert.equal(result.countedDays, 18);
  assert.deepEqual(result.excludedDates.map((row) => row.date), ["2026-08-16", "2026-08-23", "2026-08-30"]);
});
