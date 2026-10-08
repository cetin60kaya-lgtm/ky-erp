import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateStatutoryAnnualLeave, calculateAnnualLeaveBalance, calculateAnnualLeaveRange, annualLeaveDaysForYear, leaveAdjustmentTotal } from "./ik-relational-cloud.ts";

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


test("annual leave writes are tenant-bound and permission-guarded", () => {
  const source = readFileSync(new URL("./ik-relational-cloud.ts", import.meta.url), "utf8");
  assert.match(source, /requireIkWriteAccess/);
  assert.match(source, /TENANT_FORBIDDEN/);
  assert.match(source, /IK_PERMISSION_REQUIRED/);
  assert.match(source, /permission\?\.canApprove/);
  assert.match(source, /permission\?\.canUpdate/);
});

test("leave balance corrections are append-only records", () => {
  const source = readFileSync(new URL("./ik-relational-cloud.ts", import.meta.url), "utf8");
  assert.match(source, /IK_LEAVE_BALANCE_ADJUSTMENT_SCOPE/);
  assert.match(source, /ik-leave-adjustment:/);
  assert.match(source, /INSERT INTO json_store \(id,scope,main_company_slug,file_name,data,created_at,updated_at\) VALUES \(\?,\?,\?,\?,\?,\?,\?\)/);
  const profileStart = source.indexOf("async function saveAdvancedLeaveProfileV2");
  const profileEnd = source.indexOf("async function saveAdvancedLeaveCashRequestV2", profileStart);
  const profileBlock = source.slice(profileStart, profileEnd);
  assert.doesNotMatch(profileBlock, /const adjustments = \[\.\.\.current\.adjustments\]/);
});


test("Ali Akkaya 2026 leave: 14 entitled, 18 taken, 4 advance days", () => {
  const range = calculateAnnualLeaveRange("2026-08-10", "2026-08-31");
  assert.equal(range.calendarDays, 21);
  assert.equal(range.countedDays, 18);
  assert.deepEqual(range.excludedDates.map((item) => item.date), ["2026-08-16", "2026-08-23", "2026-08-30"]);
  assert.deepEqual(calculateAnnualLeaveBalance({ entitlement: 14, carryover: 0, adjustment: 0, used: range.countedDays }),
    { annualRight: 14, usedDays: 18, balance: -4, projectedBalance: -4, excessDays: 4 });
});

test("annual leave uses the same canonical ledger in Personnel and Annual Leave with no wage mutation", () => {
  const worker = readFileSync(new URL("./ik-relational-cloud.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/monthly/IkAdvancedMonthly.jsx", import.meta.url), "utf8");
  assert.match(worker, /async function annualUsedForYear/);
  assert.match(worker, /annualLeaveDaysForYear/);
  assert.match(worker, /const annualPersonPlans = personPlans\.filter/);
  assert.match(worker, /usedDaysAllTime: usedAllTimeDays/);
  assert.match(worker, /LEAVE_ADVANCE_APPROVAL_REQUIRED/);
  assert.match(worker, /LEAVE_ADVANCE_REASON_REQUIRED/);
  assert.match(worker, /requireIkWriteAccess\(c, body, "approve"\)/);
  assert.match(worker, /salaryDeductionApplied: false/);
  assert.match(worker, /c\.env\.DB\.batch\(writeStatements\)/);
  assert.match(ui, /const canonical = leaveEmployeeMap\.get\(employee\.id\)/);
  assert.match(ui, /advanceLeaveApproved/);
  assert.match(ui, /advanceLeaveReason/);
});

test("the next annual year starts with its own entitlement and signed carried deficit", () => {
  const next = calculateAnnualLeaveBalance({ entitlement: 14, carryover: -4, adjustment: 0, used: 0 });
  assert.equal(next.balance, 10);
  const planned = calculateAnnualLeaveBalance({ entitlement: 14, carryover: 0, adjustment: 0, used: 4, planned: 6 });
  assert.equal(planned.balance, 10);
  assert.equal(planned.projectedBalance, 4);
});

test("cross-year approved leave debits counted dates in their calendar year, not the plan start year", () => {
  const plan = {startDate:"2026-12-30", countedDays:4, dayDetails:[
    {date:"2026-12-30",counted:1},{date:"2026-12-31",counted:1},
    {date:"2027-01-01",counted:0},{date:"2027-01-02",counted:1},{date:"2027-01-04",counted:1}
  ]};
  assert.equal(annualLeaveDaysForYear(plan,"2026"),2);
  assert.equal(annualLeaveDaysForYear(plan,"2027"),2);
});
test("prior year adjustments do not compound in subsequent year balances", () => {
  const profile = {birthDate:"",adjustments:[
    {date:"2026-07-15",days:-4},{date:"2027-01-03",days:2}
  ]};
  assert.equal(leaveAdjustmentTotal(profile,"2026"),-4);
  assert.equal(leaveAdjustmentTotal(profile,"2027"),2);
});
test("relational IK is tenant-scoped and denies old direct-write routes",()=>{
  const src=readFileSync(new URL("./ik-relational-cloud.ts",import.meta.url),"utf8");
  assert.match(src,/async function ikRelationalAccess/);
  assert.match(src,/getAuthenticatedUser\(c\)/);
  assert.match(src,/TENANT_CONFLICT/);
  assert.match(src,/IK_PERMISSION_REQUIRED/);
  assert.match(src,/IK_APPROVAL_REQUIRED/);
  assert.match(src,/IK_LEGACY_WRITE_RETIRED/);
  assert.match(src,/LEAVE_PERSON_IMMUTABLE/);
  assert.match(src,/LEAVE_HOLIDAY_CALENDAR_MISSING/);
});
test("2027 holiday calendar contains Diyanet religious holidays and 19 May collision",()=>{
  const src=readFileSync(new URL("./ik-relational-cloud.ts",import.meta.url),"utf8");
  for (const day of ["2027-03-08","2027-03-09","2027-03-10","2027-03-11","2027-05-15","2027-05-16","2027-05-17","2027-05-18","2027-05-19"]) assert.ok(src.includes(day));
});

test("legacy leave uses Turkish-safe annual classification instead of SQLite ASCII UPPER",()=>{
  const worker=readFileSync(new URL("./ik-relational-cloud.ts",import.meta.url),"utf8");
  assert.match(worker,/financeKey\(row\.record_type\)\.includes\("YILLIK"\)/);
  assert.match(worker,/financeKey\(recordType\)\.includes\("YILLIK"\)/);
  assert.doesNotMatch(worker,/UPPER\(l\.record_type\) LIKE '%YILLIK%'/);
});
