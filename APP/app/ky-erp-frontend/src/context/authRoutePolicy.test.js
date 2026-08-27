import test from "node:test";
import assert from "node:assert/strict";
import { legacyAuthPath, shouldTryLegacyAuth } from "./authRoutePolicy.js";

test("production auth uses canonical routes only", () => {
  assert.equal(legacyAuthPath("/auth/login"), "");
  assert.equal(legacyAuthPath("/auth/mfa/verify"), "");
  assert.equal(legacyAuthPath("/auth/recovery-code"), "");
  assert.equal(legacyAuthPath("/auth/me"), "");
});

test("legacy auth fallback never triggers", () => {
  assert.equal(shouldTryLegacyAuth(404, null), false);
  assert.equal(shouldTryLegacyAuth(405, null), false);
  assert.equal(shouldTryLegacyAuth(500, null), false);
  assert.equal(shouldTryLegacyAuth(0, null), false);
  assert.equal(shouldTryLegacyAuth(404, { error: { code: "NOT_FOUND" } }), false);
});
