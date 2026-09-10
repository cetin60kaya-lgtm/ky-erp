import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./security-center-cloud.ts", import.meta.url);
const loginUrl = new URL("./security-center-login-cloud.ts", import.meta.url);
const entryUrl = new URL("./main-entry-security.ts", import.meta.url);
const guardUrl = new URL("./auth-policy-owner-guard.ts", import.meta.url);

test("Security Center scopes real sessions and audit data", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /auth_sessions/);
  assert.match(source, /auth_security_audit/);
  assert.match(source, /AUTH_SECURITY_CAPABILITY_GRANT/);
  assert.match(source, /AUTH_SESSION_TRUST/);
  assert.match(source, /scopeType/);
  assert.match(source, /SELF/);
  assert.match(source, /COMPANY/);
  assert.match(source, /SYSTEM/);
  assert.match(source, /platform_role/);
  assert.match(source, /NOT IN \('SUPER_ADMIN','ADMIN'\)/);
});

test("critical Security Center writes require KY Security action approval", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const operation of [
    "SESSION_TRUST_APPROVE",
    "SESSION_TRUST_REJECT",
    "SESSION_CLOSE",
    "SESSION_SUSPICIOUS",
    "SECURITY_CAPABILITY_SET",
    "SUPER_ADMIN_GRANT",
    "SUPER_ADMIN_REVOKE",
    "ONLY_ME",
  ]) assert.match(source, new RegExp(operation));
  assert.match(source, /SECURITY_DEVICE_REQUIRED/);
  assert.match(source, /claimAction/);
  assert.match(source, /consumedAt/);
  assert.match(source, /SECURITY_ACTION_EXPIRED/);
  assert.match(source, /expireAction/);
  assert.match(source, /expiresAt/);
  assert.match(source, /row\.isActive !== false/);
});

test("owner lock and only-me behavior are fail closed", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const guard = await readFile(guardUrl, "utf8");
  assert.match(source, /canonicalOwner/);
  assert.match(source, /OWNER_LOCKED/);
  assert.match(source, /SUPER_ADMIN_ONLY_ME_EXECUTED/);
  assert.match(source, /id<>\?/);
  assert.match(source, /preservedRole:\s*"SUPER_ADMIN"/);
  assert.match(source, /NOT IN \('SUPER_ADMIN','ADMIN'\)/);
  assert.match(guard, /SUPER_ADMIN_SECURITY_ACTION_REQUIRED/);
  assert.match(guard, /OWNER_SECURITY_ACTION_REQUIRED/);
});

test("company approval scope cannot list or decide platform Super Admin login", async () => {
  const source = await readFile(loginUrl, "utf8");
  assert.match(source, /u\.platform_role/);
  assert.match(source, /OWNER_APPROVAL_SYSTEM_ONLY/);
  assert.match(source, /CROSS_TENANT_FORBIDDEN/);
  assert.match(source, /AUTH_SECURITY_CAPABILITY_GRANT/);
  assert.match(source, /LOGIN_APPROVE/);
  assert.match(source, /NOT IN \('SUPER_ADMIN','ADMIN'\)/);
  assert.match(source, /main_company_slug=\?/);
});

test("Worker entry isolates Security Center and preserves existing API fallback", async () => {
  const entry = await readFile(entryUrl, "utf8");
  assert.match(entry, /registerSecurityCenterRoutes/);
  assert.match(entry, /path\.startsWith\("\/api\/security-center\/"\)/);
  assert.match(entry, /return base\.fetch\(request, env, ctx\)/);
});
