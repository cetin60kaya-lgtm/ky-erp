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
test("account approval and device approval are independent administrator decisions",()=>{
  assert.match(api,/admin\/accounts\/:userId\/decision/);
  assert.match(api,/PERSONNEL_ACCOUNT_APPROVED|PERSONNEL_ACCOUNT_"\+\(decision/);
  const from=api.indexOf('app.post("/api/employee-portal/admin/devices/:id/decision"');
  assert.ok(from>0);
  const deviceDecision=api.slice(from);
  assert.doesNotMatch(deviceDecision,/SET activated_at=/);
  assert.match(api,/status='REVOKED'/);
});
test("production request validates model and machine, uses stable idempotency key",()=>{
  const runtime=read("src/production-runtime-v2.ts");
  assert.match(runtime,/Uretim islem kimligi gerekli/);
  assert.match(runtime,/machine_shift_defaults WHERE main_company_slug/);
  assert.match(runtime,/model_records WHERE main_company_slug/);
  assert.match(runtime,/const recordId="personnel-"/);
  assert.match(runtime,/reused:true/);
});
test("management supports scoped machine assignment and reversible approver delegation",()=>{
  assert.match(api,/admin\/machines/);
  assert.match(api,/MACHINE_ASSIGNMENT_INVALID/);
  assert.match(api,/admin\/approvers/);
  assert.match(api,/PERSONNEL_APPROVER_REVOKED/);
  assert.match(api,/auditStatement\(c,actor\.user\.id/);
});
test("annual leave uses Turkish record type normalization and excludes planned double counting",()=>{
  assert.match(api,/toLocaleUpperCase\("tr-TR"\)/);
  assert.match(api,/annualType\(row\.record_type\)/);
  assert.match(api,/status='PLANNED'/);
  assert.match(api,/approvedUpcomingDays/);
  assert.match(api,/safeJson/);
});
test("production write atomically creates record and model link",()=>{
  const runtime=read("src/production-runtime-v2.ts");
  assert.match(runtime,/c\.env\.DB\.batch\(\[insertRecord,insertLink\]\)/);
});
test("first-party app.kyerp.net is accepted by both API CORS boundaries",()=>{
  assert.match(main,/https:\/\/app\.kyerp\.net/);
  assert.match(gateway,/https:\/\/app\.kyerp\.net/);
  assert.match(main,/X-KYERP-Employee-Signature/);
});
test("disabled manager approval does not leak into old phone/session approvals",()=>{
  assert.match(security,/LOGIN_POLICY_NO_MANAGER_REVIEW/);
  assert.match(security,/phoneFactorAllowed/);
  assert.match(push,/NOT_REQUIRED/);
  assert.match(push,/CURRENT_POLICY/);
});
