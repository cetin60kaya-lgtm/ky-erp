import assert from "node:assert/strict";
import test from "node:test";
import {
  MFA_SESSION_SECONDS,
  OWNER_REFRESH_SECONDS,
  PASSWORD_SESSION_SECONDS,
  sessionRefreshSeconds,
} from "./auth-session-refresh.ts";

test("normal password-only session refresh stays at 8 hours", () => {
  assert.equal(PASSWORD_SESSION_SECONDS, 28_800);
  assert.equal(sessionRefreshSeconds("VIEWER", "PASSWORD_ONLY"), 28_800);
  assert.equal(sessionRefreshSeconds("MUHASEBE", "PASSWORD_ONLY"), 28_800);
});

test("normal MFA session refresh stays at 10 hours for every non-owner role", () => {
  assert.equal(MFA_SESSION_SECONDS, 36_000);
  for (const role of ["VIEWER", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK", "DENETIM", "COMPANY_ADMIN"]) {
    assert.equal(sessionRefreshSeconds(role, "ANY_MFA"), 36_000);
  }
});

test("system owner automatic refresh is disabled", () => {
  assert.equal(OWNER_REFRESH_SECONDS, 0);
  assert.equal(sessionRefreshSeconds("SUPER_ADMIN", "ANY_MFA"), 0);
  assert.equal(sessionRefreshSeconds("ADMIN", "PASSWORD_ONLY"), 0);
});
