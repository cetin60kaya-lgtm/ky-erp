import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./security-center-cloud.ts", import.meta.url);
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
  assert.match(source, /status\) !== "APPROVED"/);
  assert.match(source, /SECURITY_DEVICE_REQUIRED/);
  assert.match(source, /claimAction/);
  assert.match(source, /consumedAt/);
});

test("owner lock and only-me behavior are fail closed", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const guard = await readFile(guardUrl, "utf8");
  assert.match(source, /canonicalOwner/);
  assert.match(source, /OWNER_LOCKED/);
  assert.match(source, /SUPER_ADMIN_ONLY_ME_EXECUTED/);
  assert.match(source, /id<>\?/);
  assert.match(guard, /SUPER_ADMIN_SECURITY_ACTION_REQUIRED/);
  assert.match(guard, /OWNER_SECURITY_ACTION_REQUIRED/);
});

test("Worker entry isolates Security Center and preserves existing API fallback", async () => {
  const entry = await readFile(entryUrl, "utf8");
  assert.match(entry, /registerSecurityCenterRoutes/);
  assert.match(entry, /path\.startsWith\("\/api\/security-center\/"\)/);
  assert.match(entry, /return base\.fetch\(request, env, ctx\)/);
});
