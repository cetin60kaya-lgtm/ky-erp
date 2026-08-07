import assert from "node:assert/strict";
import test from "node:test";
import { signTenantToken, tenantAccessDecision, verifyTenantToken } from "./tenant-auth.ts";

const secret = "unit-test-only-secret-that-is-longer-than-32-bytes";

function payload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "user-a",
    sid: "session-a",
    username: "hkn",
    platformRole: "USER",
    activeCompanyId: "company-a",
    activeCompanySlug: "tenant-a",
    membershipId: "membership-a",
    iat: now,
    exp: now + 300,
    ...overrides,
  };
}

test("HS256 token round trip succeeds", async () => {
  const token = await signTenantToken(secret, payload());
  assert.equal((await verifyTenantToken(secret, token))?.activeCompanySlug, "tenant-a");
});

test("unsigned alg none token is denied", async () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode(payload())}.cloud`;
  assert.equal(await verifyTenantToken(secret, token), null);
});

test("tampered and expired tokens are denied", async () => {
  const token = await signTenantToken(secret, payload());
  assert.equal(await verifyTenantToken(secret, `${token.slice(0, -1)}x`), null);
  const expired = await signTenantToken(secret, payload({ exp: Math.floor(Date.now() / 1000) - 1 }));
  assert.equal(await verifyTenantToken(secret, expired), null);
});

test("tenant A cannot request tenant B or omit verified tenant", () => {
  const auth = { activeCompanyId: "company-a", activeCompanySlug: "tenant-a" };
  assert.equal(tenantAccessDecision(auth, "tenant-a"), "ALLOW");
  assert.equal(tenantAccessDecision(auth, "tenant-b"), "TENANT_MISMATCH");
  assert.equal(tenantAccessDecision(auth, ""), "TENANT_HEADER_REQUIRED");
});

test("a session without active company cannot reach operational data", () => {
  assert.equal(tenantAccessDecision({ activeCompanyId: null, activeCompanySlug: null }, "tenant-a"), "TENANT_REQUIRED");
});
