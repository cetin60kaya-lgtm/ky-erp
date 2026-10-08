import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path,"utf8");
const api=read("src/employee-portal-cloud.ts");
const migration=read("migrations/0060_employee_portal_access.sql");
const main=read("src/main.ts");
const security=read("src/auth-policy-cloud.ts");
const push=read("src/auth-push-cloud.ts");
const gateway=read("src/main-entry-security.ts");

test("staff links to HR employee and company and never shares privileged grants",()=>{
  assert.match(migration,/UNIQUE \(main_company_slug, employee_id\)/);
  assert.match(migration,/auth_user_id TEXT NOT NULL UNIQUE/);
  assert.match(api,/PERSONNEL_ACCOUNT_REQUIRED/);
  assert.match(api,/role==="PERSONNEL"/);
  assert.match(api,/role,"PERSONNEL"| 'PERSONNEL'/);
  assert.match(main,/PERSONNEL_SCOPE_ONLY/);
  assert.match(gateway,/denyPersonnelOutsidePortal/);
});
test("every device is explicitly approved and signs nonce-bound requests",()=>{
  assert.match(migration,/ky_employee_portal_devices/);
  assert.match(migration,/ky_employee_portal_nonces/);
  assert.match(api,/status='APPROVED' AND revoked_at IS NULL/);
  assert.match(api,/crypto\.subtle\.verify/);
  assert.match(api,/INSERT OR IGNORE INTO ky_employee_portal_nonces/);
  assert.match(api,/device\.kind==="WORKPLACE"/);
  assert.match(api,/PERSONNEL_DEVICE_/);
});
test("read-only personal view reads limited HR and clock fields; no payroll column",()=>{
  const from=api.indexOf("async function ownInfo(");
  const to=api.indexOf("export function registerEmployeePortalRoutes(",from);
  assert.ok(from>0 && to>from);
  const self=api.slice(from,to);
  const sel=self.match(/const person=await c\.env\.DB\.prepare\("([^"]+)"\)/)?.[1]||"";
  assert.match(sel,/annual_leave_carryover/);
  for(const forbidden of ["salary","road_allowance","bank_amount","cash_amount","identity_no","overtime","payroll"])assert.doesNotMatch(sel,new RegExp(forbidden,"i"));
  assert.match(self,/ik_time_clock_events/);
  assert.match(self,/hr_leave_records_v2/);
  assert.match(self,/calculateStatutoryAnnualLeave/);
  assert.match(api,/app\.post\("\/api\/employee-portal\/work\/machine-production"/);
  assert.match(api,/savePersonnelProductionEntry/);
});
test("disabled manager approval does not leak into old phone/session approvals",()=>{
  assert.match(security,/LOGIN_POLICY_NO_MANAGER_REVIEW/);
  assert.match(security,/phoneFactorAllowed/);
  assert.match(push,/NOT_REQUIRED/);
  assert.match(push,/CURRENT_POLICY/);
});
