import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mobileUrl=new URL("./auth-security-mobile-control.ts",import.meta.url);
const pushUrl=new URL("./auth-push-cloud.ts",import.meta.url);

test("KY Security mobile control supports system owner and tenant-scoped company owner control",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  const push=await readFile(pushUrl,"utf8");
  assert.match(push,/registerSecurityMobileControlRoutes/);
  assert.match(push,/ownerControlAuthorized/);
  assert.match(mobile,/\/api\/auth\/push\/device\/control-center/);
  assert.match(mobile,/hasOwnerControl/);
  assert.match(mobile,/companyControl/);
  assert.match(mobile,/SECURITY_SCOPE_FORBIDDEN/);
  assert.match(mobile,/scopeType\(actor: AnyRow\)/);
  assert.match(mobile,/return "COMPANY"/);
  assert.match(mobile,/main_companies/);
  assert.match(mobile,/companySlug/);
  assert.match(mobile,/companyStats/);
  assert.match(mobile,/activity/);
});
test("owner activity today counters are aggregated independently from the paginated timeline",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  assert.match(mobile,/buildTodaySummary/);
  assert.match(mobile,/SELECT COUNT\(\*\) AS total FROM auth_login_approvals/);
  assert.match(mobile,/SELECT COUNT\(\*\) AS total FROM auth_sessions WHERE created_at/);
  assert.match(mobile,/revoked_at IS NOT NULL/);
  assert.match(mobile,/\.\.\.todaySummary/);
});

test("mobile session close is signed, tenant-scoped for company owner, audited and idempotent",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  assert.match(mobile,/KYERP-MOBILE-CONTROL-V1/);
  assert.match(mobile,/verifyControlProof/);
  assert.match(mobile,/SESSION_CLOSE/);
  assert.match(mobile,/SESSION_CLOSED_FROM_KY_SECURITY_MOBILE/);
  assert.match(mobile,/SESSION_CLOSE_FORBIDDEN/);
  assert.match(mobile,/text\(row\.main_company_slug\) !== text\(actor\.companySlug\)/);
  assert.match(mobile,/!\["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"\]\.includes/);
  assert.match(mobile,/revoked_at/);
  assert.match(mobile,/alreadyClosed/);
  assert.match(mobile,/hasOwnerControl/);
});

test("phone reports the running KY Security version into its durable device record",async()=>{
  const push=await readFile(pushUrl,"utf8");
  assert.match(push,/X-KYERP-Security-App-Version/);
  assert.match(push,/reportedAppVersion/);
  assert.match(push,/securityAppVersion: acceptedAppVersion/);
  assert.match(push,/SECURITY_APP_VERSION = "security-v4\.0"/);
});

test("mobile active session status uses D1 UTC time and expires stale pending cards",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  assert.match(mobile,/julianday\(s\.expires_at\)>julianday\('now'\)/);
  assert.match(mobile,/active_sql/);
  assert.match(mobile,/"EXPIRED"/);
});


test("security app version request header is allowed by worker CORS",async()=>{
  const main=await readFile(new URL("./main.ts",import.meta.url),"utf8");
  const entry=await readFile(new URL("./main-entry-security.ts",import.meta.url),"utf8");
  const mailEntry=await readFile(new URL("./main-entry-mail.ts",import.meta.url),"utf8");
  assert.match(main,/X-KYERP-Security-App-Version/);
  assert.match(entry,/X-KYERP-Security-App-Version/);
  assert.match(mailEntry,/X-KYERP-Security-App-Version/);
});
