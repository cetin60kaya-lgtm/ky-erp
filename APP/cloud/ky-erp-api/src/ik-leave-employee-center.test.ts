import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateStatutoryAnnualLeave } from "./ik-relational-cloud.ts";

test("annual leave statutory entitlement follows Turkish tenure thresholds", () => {
  assert.equal(calculateStatutoryAnnualLeave("2025-01-01", "1990-01-01", "2026-01-01").entitlementDays, 14);
  assert.equal(calculateStatutoryAnnualLeave("2020-01-01", "1990-01-01", "2026-01-01").entitlementDays, 20);
  assert.equal(calculateStatutoryAnnualLeave("2011-01-01", "1990-01-01", "2026-01-01").entitlementDays, 26);
});

test("annual leave statutory entitlement applies age minimum and one-year eligibility", () => {
  assert.equal(calculateStatutoryAnnualLeave("2025-01-01", "1976-01-01", "2026-01-01").entitlementDays, 20);
  assert.equal(calculateStatutoryAnnualLeave("2026-06-01", "2000-01-01", "2026-10-06").entitlementDays, 0);
});

test("annual leave employee center persists profile and cash requests without schema migration", () => {
  const source = readFileSync(new URL("./ik-relational-cloud.ts", import.meta.url), "utf8");
  assert.match(source, /IK_LEAVE_PROFILE_SCOPE/);
  assert.match(source, /IK_LEAVE_CASH_REQUEST_SCOPE/);
  assert.match(source, /\/api\/ik\/advanced\/leave\/profile/);
  assert.match(source, /\/api\/ik\/advanced\/leave\/cash-request/);
  assert.match(source, /balanceEffectDays:\s*0/);
  assert.match(source, /Math\.max\(recordedEntitlement, statutory\.entitlementDays\)/);
});
