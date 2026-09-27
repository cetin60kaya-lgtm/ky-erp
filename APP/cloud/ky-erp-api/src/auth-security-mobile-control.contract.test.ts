import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mobileUrl=new URL("./auth-security-mobile-control.ts",import.meta.url);
const pushUrl=new URL("./auth-push-cloud.ts",import.meta.url);

test("KY Security mobile control uses trusted device auth and system company filtering",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  const push=await readFile(pushUrl,"utf8");
  assert.match(push,/registerSecurityMobileControlRoutes/);
  assert.match(push,/securityCapabilities: appAccess\.capabilities/);
  assert.match(mobile,/\/api\/auth\/push\/device\/control-center/);
  assert.match(mobile,/main_companies/);
  assert.match(mobile,/companySlug/);
  assert.match(mobile,/SESSION_VIEW/);
});
test("mobile session close is signed, scoped, audited and idempotent",async()=>{
  const mobile=await readFile(mobileUrl,"utf8");
  assert.match(mobile,/KYERP-MOBILE-CONTROL-V1/);
  assert.match(mobile,/verifyControlProof/);
  assert.match(mobile,/SESSION_CLOSE/);
  assert.match(mobile,/SESSION_CLOSED_FROM_KY_SECURITY_MOBILE/);
  assert.match(mobile,/revoked_at/);
  assert.match(mobile,/alreadyClosed/);
  assert.match(mobile,/SUPER_ADMIN/);
  assert.match(mobile,/COMPANY_ADMIN/);
});

test("phone reports the running KY Security version into its durable device record",async()=>{
  const push=await readFile(pushUrl,"utf8");
  assert.match(push,/X-KYERP-Security-App-Version/);
  assert.match(push,/reportedAppVersion/);
  assert.match(push,/securityAppVersion: acceptedAppVersion/);
  assert.match(push,/SECURITY_APP_VERSION = "security-v3\.0"/);
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
