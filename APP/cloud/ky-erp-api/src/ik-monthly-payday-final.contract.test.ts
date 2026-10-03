import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("IK master people route is never shadowed by the PDKS card population", () => {
  const feed = api("pdks-web-change-feed.ts");
  const deviceJobs = api("pdks-device-jobs.ts");
  const guard = api("ik-pdks-guard.ts");
  const personnel = api("ik-personnel-control.ts");
  const personnelUi = frontend("pages/modules/ik/monthly/IkPersonnelFinancePage.jsx");
  const pdksApi = frontend("services/pdksApi.js");

  assert.doesNotMatch(feed, /app\.get\("\/api\/ik\/personnel-control\/people"/);
  assert.doesNotMatch(feed, /app\.get\("\/api\/ik\/personnel-control\/pdks-people"/);
  assert.match(deviceJobs, /app\.get\("\/api\/ik\/personnel-control\/pdks-people"/);
  assert.match(guard, /"\/api\/ik\/personnel-control\/pdks-people"/);
  assert.match(pdksApi, /"\/ik\/personnel-control\/pdks-people"/);
  assert.match(personnel, /canonicalHrCompanyId/);
  assert.match(personnel, /adminRole\(user\.role\) \? "FULL"/);
  assert.match(personnel, /ORDER BY.*personnelCodeNumber|ORDER BY.*CAST/s);
  assert.match(personnelUi, /useState\("ALL"\)/);
  assert.match(personnelUi, /SGK'lı \+ SGK'sız tüm personel/);
  assert.match(personnel, /nextPersonnelCode/);
});

test("monthly personnel API returns the full HKN master roster and allocates the next HKN code", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /async function nextMonthlyPersonnelCode/);
  assert.match(relational, /MAX\(CASE[\s\S]*UPPER\(TRIM\(code\)\) LIKE 'HKN-%'/);
  assert.match(relational, /value\.code = await nextMonthlyPersonnelCode/);
  assert.match(relational, /const allEmployees = rawEmployeesWithCalc\.map/);
  assert.match(relational, /masterEmployees,/);
  assert.match(relational, /rawEmployees: allEmployees/);
  assert.match(relational, /rawLeaves: leaves/);
  assert.match(relational, /rawDocuments: documents\.map/);
});

test("finance create update delete mutations are visible to live sync", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /action:\s*"FINANCE_CREATE"/);
  assert.match(relational, /action:\s*"FINANCE_UPDATE"/);
  assert.match(relational, /action:\s*"FINANCE_DELETE"/);
  assert.match(relational, /entityType:\s*"HAREKET"/);
  assert.match(relational, /key:\s*"audit"/);
});

test("payroll row exposes quick source actions and balanced bank cash editing", () => {
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  assert.match(monthly, /payroll-row-actions/);
  assert.match(monthly, /Mesai Ekle/);
  assert.match(monthly, /Avans Ekle/);
  assert.match(monthly, /Kesinti Ekle/);
  assert.match(monthly, /editPayrollPaymentSplit/);
  assert.match(monthly, /Bordrodan Düzelt/);
  assert.match(monthly, /reconcilePaymentSplit/);
});


test("canonical monthly domain owns date-driven lifecycle and history-safe bulk compensation", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /function employmentStateAtPeriod/);
  assert.match(relational, /MISSING_HIRE_DATE/);
  assert.match(relational, /MISSING_EXIT_DATE/);
  assert.match(relational, /async function saveAdvancedBulkCompensation/);
  assert.match(relational, /SALARY_PERCENT/);
  assert.match(relational, /ROAD_SET/);
  assert.match(relational, /ROAD_PERCENT/);
  assert.match(relational, /BULK_COMPENSATION_UPDATE/);
  assert.match(relational, /hr_salary_contracts/);
  assert.match(relational, /\/api\/ik\/advanced\/compensation\/bulk/);
});

test("leave plans persist day-by-day calculation proof and wage effect", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /DEFAULT_TR_OFFICIAL_HOLIDAY_RULES_2026/);
  assert.match(relational, /partialDates/);
  assert.match(relational, /dayDetails/);
  assert.match(relational, /calculation_json/);
  assert.match(relational, /effect_type/);
  assert.match(relational, /calculationSnapshot/);
  assert.match(relational, /\[1, 2, 3, 4, 5\]/);
});

test("final payroll output path freezes rows and marks them paid in one workflow", () => {
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");
  assert.match(monthly, /finalizePayrollForOutput/);
  assert.match(monthly, /saveIkAdvancedFinalPayrollControl/);
  assert.match(monthly, /saveIkAdvancedPayrollLines/);
  assert.match(monthly, /status:\s*"PAID"/);
  assert.match(monthly, /Bordroyu Tamamla \/ PDF/);
  assert.match(monthly, /window\.confirm/);
});


test("canonical personnel admin maintenance requires admin and protects operational history", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /async function adminMaintainPerson/);
  assert.match(relational, /getAuthenticatedUser/);
  assert.match(relational, /ADMIN_REQUIRED/);
  assert.match(relational, /ADMIN_RECODE/);
  assert.match(relational, /ADMIN_HARD_DELETE/);
  assert.match(relational, /PERSONNEL_HAS_OPERATIONAL_HISTORY/);
  assert.match(relational, /SİL \$\{currentCode\}/);
  assert.match(relational, /\/api\/ik\/advanced\/person-card\/:employeeId\/admin-maintenance/);
});
