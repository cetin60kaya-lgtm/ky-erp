import assert from "node:assert/strict";
import test from "node:test";
import { shouldClearStoredAuthForStatus } from "./authSessionPolicy.js";

test("temporary server, network and permission failures preserve the stored session", () => {
  for (const status of [0, 403, 500, 502, 503, 504]) {
    assert.equal(shouldClearStoredAuthForStatus(status), false);
  }
});

test("business endpoint 401 does not clear the whole application session without a session-invalid proof", () => {
  assert.equal(shouldClearStoredAuthForStatus(401, "OTP_INVALID", "/api/admin/security/step-up"), false);
  assert.equal(shouldClearStoredAuthForStatus(401, "STEP_UP_FAILED", "/api/admin/security/owner-recovery/contact/start"), false);
  assert.equal(shouldClearStoredAuthForStatus(401, "", "/api/ik/daily"), false);
});

test("explicit invalid-session codes clear stored auth", () => {
  for (const code of ["UNAUTHORIZED", "SESSION_EXPIRED", "SESSION_REVOKED", "TOKEN_INVALID", "TOKEN_EXPIRED"]) {
    assert.equal(shouldClearStoredAuthForStatus(401, code, "/api/ik/daily"), true);
  }
});

test("auth me 401 clears stored auth even if the backend omitted an error code", () => {
  assert.equal(shouldClearStoredAuthForStatus(401, "", "/api/auth/me"), true);
  assert.equal(shouldClearStoredAuthForStatus(401, "", "https://api.kyerp.net/api/auth/me"), true);
});
