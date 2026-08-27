import test from "node:test";
import assert from "node:assert/strict";
import { legacyAuthPath, shouldTryLegacyAuth } from "./authRoutePolicy.js";

test("canonical auth only falls back when the route is unavailable", () => {
  assert.equal(shouldTryLegacyAuth(404, null), true);
  assert.equal(shouldTryLegacyAuth(404, { error: { code: "NOT_FOUND" } }), true);
  assert.equal(shouldTryLegacyAuth(405, null), true);
  assert.equal(shouldTryLegacyAuth(200, null), false);
  assert.equal(shouldTryLegacyAuth(500, null), false);
  assert.equal(shouldTryLegacyAuth(503, null), false);
  assert.equal(shouldTryLegacyAuth(0, null), false);
});

test("business 404 responses do not trigger a second auth POST", () => {
  assert.equal(shouldTryLegacyAuth(404, { error: { code: "USER_NOT_FOUND" } }), false);
  assert.equal(legacyAuthPath("/auth/login"), "/auth/v2/login");
  assert.equal(legacyAuthPath("/auth/me"), "");
});
