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
  assert.match(relational, /SELECT MAX\(code_no\) AS max_code FROM/);
  assert.match(relational, /ik_employee_change_history/);
  assert.match(relational, /field_name='personnelCode'/);
  assert.match(relational, /value\.code = await nextMonthlyPersonnelCode/);
  assert.match(relational, /const allEmployees = rawEmployeesWithCalc\.map/);
  assert.match(relational, /masterEmployees: masterEmployeesWithSgk/);
  assert.match(relational, /rawEmployees: allEmployees/);
  assert.match(relational, /rawLeaves: leaves/);
  assert.match(relational, /rawDocuments: documents\.map/);
});

test("closed month protects monthly SGK compliance without blocking master personnel card updates", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /const periodLocked = flag\(periodLockRow\?\.is_locked\)/);
  assert.match(relational, /const skipPeriodCompliance = body\.skipPeriodCompliance === true/);
  assert.match(relational, /if \(periodLocked && !skipPeriodCompliance\)/);
  assert.match(relational, /if \(!periodLocked && !preservePeriodCompliance\) \{/);
  assert.match(relational, /periodComplianceSkipped: periodLocked/);
});

test("person card SGK day contract accepts zero or unknown values and caps a month at 30", () => {
  const relational = api("ik-relational-cloud.ts");
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");
  assert.match(relational, /const maxSgkDays = 30/);
  assert.match(relational, /rawSgkDays < 0 \|\| rawSgkDays > maxSgkDays/);
  assert.match(relational, /SGK gün sayısı 0-\$\{maxSgkDays\} arasında olmalıdır/);
  assert.match(monthly, /SGK gün sayısı 0-30 arasında olmalıdır/);
  assert.match(monthly, /hasSgkDays \? Math\.round\(num\(modalDraft\.sgkDays\)\) : null/);
});

test("SGK suggestion is date-driven, PDKS stays control-only and official payroll wins", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /export function suggestedSgkDaysAtPeriod/);
  assert.match(relational, /coverageStart === periodStart && coverageEnd === periodEnd\) return 30/);
  assert.match(relational, /Math\.max\(0, Math\.min\(30,/);
  assert.match(relational, /COUNT\(DISTINCT work_date\) AS card_days FROM ik_time_clock_events/);
  assert.match(relational, /sgkDaySource: "RESMI_BORDRO"/);
  assert.match(relational, /masterEmployees: masterEmployeesWithSgk/);
});

test("official SGK import preserves monthly compliance while person master data can still save", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /const preservePeriodCompliance = body\.preservePeriodCompliance === true/);
  assert.match(relational, /if \(!periodLocked && !preservePeriodCompliance\)/);
  assert.match(relational, /periodComplianceSkipped: periodLocked \|\| preservePeriodCompliance/);
});

test("person card save returns a fresh version for repeated in-modal saves", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /freshVersionRow/);
  assert.match(relational, /card_updated_at/);
  assert.match(relational, /version: freshVersion/);
  assert.match(relational, /updatedAt: freshVersion/);
});

test("payroll domain excludes people who left before the selected period", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /if \(exitDate && exitDate < periodStart\) return "EXITED"/);
  assert.match(relational, /\["ACTIVE", "NEW_HIRE", "EXIT_MONTH", "ENTERED_EXITED", "MISSING_HIRE_DATE", "MISSING_EXIT_DATE"\]\.includes\(employmentStateAtPeriod/);
});

test("finance create update delete mutations are visible to live sync", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /action:\s*"FINANCE_CREATE"/);
  assert.match(relational, /action:\s*"FINANCE_UPDATE"/);
  assert.match(relational, /action:\s*"FINANCE_DELETE"/);
  assert.match(relational, /entityType:\s*"HAREKET"/);
  assert.match(relational, /key:\s*"audit"/);
});

test("payroll row opens fully editable final mode on canonical sources", () => {
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  assert.match(monthly, /payroll-row-actions/);
  assert.match(monthly, /Son Kontrol \/ Düzenle/);
  assert.match(monthly, /Kaynak Hareketleri \/ Log/);
  assert.match(monthly, /openPayPlan\(row\.employee, "FINAL", row\)/);
  assert.match(monthly, /Son Kontrolü Kaydet/);
  assert.doesNotMatch(monthly, /editPayrollPaymentSplit/);
  assert.doesNotMatch(monthly, /Bordrodan Düzelt/);
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

test("payroll output is read-only while month lock owns editability", () => {
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");
  const relational = api("ik-relational-cloud.ts");
  assert.match(monthly, /validatePayrollOutput/);
  assert.doesNotMatch(monthly, /Bordroyu Tamamla \/ PDF/);
  assert.doesNotMatch(monthly, /10['’]lu Fiş \+ Tamamla/);
  assert.match(monthly, />Bordro PDF</);
  assert.ok(monthly.includes('"Ayı Kilitle"'));
  assert.ok(monthly.includes('"Kilidi Aç"'));
  assert.match(monthly, /unlock,/);
  assert.match(relational, /body\.unlock === true/);
  assert.match(relational, /"UNLOCK"/);
  assert.doesNotMatch(relational, /PAYROLL_PAID_LOCKED/);
});


test("canonical personnel admin maintenance requires admin and protects operational history", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /async function adminMaintainPerson/);
  assert.match(relational, /getAuthenticatedUser/);
  assert.match(relational, /ADMIN_REQUIRED/);
  assert.match(relational, /ADMIN_RECODE/);
  assert.match(relational, /ADMIN_HARD_DELETE/);
  assert.match(relational, /ADMIN_PERSONNEL_MERGE/);
  assert.match(relational, /PERSONNEL_MERGE_CONFLICT/);
  assert.match(relational, /ADMIN_PERSONNEL_MERGE_CODE_RETIRED/);
  assert.match(relational, /ADMIN_PERSONNEL_CODE_RETIRED/);
  assert.match(relational, /PERSONNEL_HAS_OPERATIONAL_HISTORY/);
  assert.doesNotMatch(relational, /ADMIN_CONFIRMATION_REQUIRED/);
  assert.match(relational, /\/api\/ik\/advanced\/person-card\/:employeeId\/admin-maintenance/);
});


test("legacy synthetic overtime corrections never count as real overtime", () => {
  const relational = api("ik-relational-cloud.ts");
  assert.match(relational, /function isLegacySyntheticOvertimeCorrection/);
  assert.match(relational, /BORDRO KAYNAK KONTROL/);
  assert.match(relational, /!isLegacySyntheticOvertimeCorrection\(row\)/);
  assert.match(relational, /OVERTIME_SOURCE_REQUIRED/);
  assert.match(relational, /syncOvertimeSource/);
  assert.doesNotMatch(relational, /pushCorrection\("overtime"/);
});
