import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./ik-relational-cloud.ts", import.meta.url), "utf8");
const front = readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/monthly/IkAdvancedMonthly.jsx", import.meta.url), "utf8");

test("Hakan Emprime payroll import never creates staff from outside SGK workbook", () => {
  const preview = api.slice(api.indexOf("async function previewAdvancedSgk"), api.indexOf("async function confirmAdvancedSgk"));
  assert.match(preview, /FROM hr_monthly_employees e/);
  assert.match(preview, /WHERE e\.main_company_id=\?/);
  assert.match(preview, /payroll_included/);
  assert.match(preview, /identityConflict \|\| nameConflict \? null : \(identityMatch \|\| codeMatch \|\| null\)/);
  assert.doesNotMatch(preview, /identityMatch \|\| codeMatch \|\| nameMatch \|\| null/);
  assert.match(preview, /AD_DOGRULAMA_GEREKLI/);
  assert.match(preview, /HKN_BORDRO_HARIC/);
  assert.match(preview, /selected: Boolean\(employeeId\) && !invalidNet/);
  assert.doesNotMatch(preview, /INSERT INTO hr_monthly_employees/);
});

test("SGK confirm verifies company, payroll inclusion, identity and name before D1 batch", () => {
  const confirm = api.slice(api.indexOf("async function confirmAdvancedSgk"), api.indexOf("function safeIkDocumentName"));
  assert.match(confirm, /e\.main_company_id=\?/);
  assert.match(confirm, /s\.payroll_included/);
  assert.match(confirm, /SGK_HKN_PAYROLL_SCOPE/);
  assert.match(confirm, /SGK_HKN_IDENTITY_MISMATCH/);
  assert.match(confirm, /SGK_HKN_NAME_MISMATCH/);
  assert.match(confirm, /SGK_HKN_CODE_MISMATCH/);
  assert.ok(confirm.indexOf("SGK_HKN_PAYROLL_SCOPE") < confirm.indexOf("const statements: D1PreparedStatement[]"));
  assert.match(confirm, /SGK_PAID_PAYROLL_LOCKED/);
});

test("SGK preview only offers registered Hakan Emprime payroll people", () => {
  const importView = front.slice(front.indexOf('if (modal === "sgkImport")'), front.indexOf('if (modal === "evrak")'));
  assert.match(importView, /KY ERP \/ Hakan Emprime Çalışanı/);
  assert.match(importView, /employees\.filter\(\(employee\)=>employee\.payrollIncluded !== false\)/);
  assert.match(importView, /Hakan Emprime dışı \/ alma/);
  assert.match(importView, /İsim benzerliği otomatik eşleştirme değildir/);
  assert.match(front, /const hakanPayrollIds = new Set/);
});
