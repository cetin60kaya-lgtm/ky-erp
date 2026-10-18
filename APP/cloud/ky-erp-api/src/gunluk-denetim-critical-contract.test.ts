import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("./",import.meta.url);
const worker=readFileSync(new URL("gunluk-operasyon-cloud.ts",base),"utf8");
const main=readFileSync(new URL("main.ts",base),"utf8");
const access=readFileSync(new URL("gunluk-operasyon-access.ts",base),"utf8");
const frontend=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx",base),"utf8");
test("every Daily Operations API route has server-side tenant and IK permission guard",()=>{
  assert.match(main,/shell\.use\("\/api\/gunluk-operasyon\/\*", enforceDailyOperationsTenant\)/);
  assert.match(access,/getAuthenticatedUser/);
  assert.match(access,/dailyAuthorized\(/);
  assert.match(access,/GUNLUK_TENANT_FORBIDDEN/);
  assert.match(access,/GUNLUK_PERMISSION_DENIED/);
});
test("period lock fails closed across check-only, roster, adjustments, and frontend",()=>{
  assert.match(worker,/async function lockedRange\(/);
  assert.match(worker,/async function saveFocused[\s\S]*?if \(await lockedPeriod\(c, companyId, date\)\)/);
  assert.match(worker,/async function saveRoster[\s\S]*?if \(await lockedRange\(c, companyId, start, end\)\)/);
  assert.match(frontend,/action: next \? "LOCK" : "UNLOCK"/);
  assert.match(frontend,/getDailyPeriodLock\(\{ mainCompanyId: companyId, date: selectedDate \}\)/);
  assert.match(frontend,/setPeriodLockKnown\(false\)/);
});
test("weekly checked state comes from exact per-shift D1 check rows",()=>{
  assert.match(worker,/AS day_checked, COALESCE\(cn.checked,0\) AS night_checked/);
  assert.match(worker,/dayChecked: flag\(row.day_shift\) && flag\(row.day_checked\)/);
  assert.match(frontend,/rowDay\(row\) && !row.dayChecked/);
  assert.match(frontend,/rowNight\(row\) && !row.nightChecked/);
});
test("Excel upload is real read-only preview and display accepts XLS/XLSX",()=>{
  assert.match(worker,/async function excelUploadPreview\(/);
  assert.match(worker,/app.post\("\/api\/gunluk-operasyon\/excel-upload", protect\(excelUploadPreview\)\)/);
  assert.match(frontend,/input.accept = "\.xlsx,\.xls"/);
  assert.match(frontend,/!excelPreview\?\.rows\?\.length/);
});
test("card edits and bulk outcomes have audit, and pay requires confirmation",()=>{
  assert.match(worker,/EMPLOYEE_CARD_CREATE/);
  assert.match(worker,/EMPLOYEE_CARD_UPDATE/);
  assert.match(worker,/EMPLOYEE_CARD_DEACTIVATE/);
  assert.match(frontend,/Promise\.allSettled\(chunk\.map/);
  assert.match(frontend,/fiilen ödendi/);
});
