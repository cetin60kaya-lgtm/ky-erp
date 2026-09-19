import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./auth-email-emergency.ts", import.meta.url), "utf8");
const registrar = readFileSync(new URL("./auth-policy-recovery-code.ts", import.meta.url), "utf8");

test("emergency email routes are registered through canonical auth recovery registrar", () => {
  assert.match(registrar, /registerAuthEmailEmergencyRoutes\(app\)/);
  assert.match(source, /\/api\/auth\/email-emergency\/start/);
  assert.match(source, /\/api\/auth\/email-emergency\/verify/);
});

test("emergency email requires a password-verified phone or MFA challenge proof", () => {
  assert.match(source, /phoneApprovalFromRequest/);
  assert.match(source, /auth_login_challenges/);
  assert.match(source, /EMAIL_EMERGENCY_PROOF_INVALID/);
  assert.doesNotMatch(source, /body\.password/);
});

test("emergency email is owner-only and uses stored account email", () => {
  assert.match(source, /isOwner\(roleOf\(user\)\)/);
  assert.match(source, /EMAIL_EMERGENCY_OWNER_ONLY/);
  assert.match(source, /text\(user\.email\)/);
});

test("OTP is hashed, rate-limited, short lived and locks after repeated failures", () => {
  assert.match(source, /EMAIL_SECONDS = 10 \* 60/);
  assert.match(source, /EMAIL_MAX_ATTEMPTS = 5/);
  assert.match(source, /EMAIL_LOCK_SECONDS = 30 \* 60/);
  assert.match(source, /EMAIL_MAX_SENDS_HOUR = 5/);
  assert.match(source, /await sha256\(`\$\{salt\}:\$\{otp\}`\)/);
  assert.doesNotMatch(source, /otp\s*:/);
});

test("verified email proof creates only a canonical approved login claim", () => {
  assert.match(source, /auth_login_approvals/);
  assert.match(source, /'APPROVED'/);
  assert.match(source, /EMAIL_EMERGENCY_LOGIN_VERIFIED/);
  assert.match(source, /stage: "APPROVAL_PENDING"/);
  assert.doesNotMatch(source, /INSERT INTO auth_sessions/);
});

test("original phone or MFA proof must still be pending at final verification", () => {
  assert.match(source, /sourceStillPending/);
  assert.match(source, /EMAIL_EMERGENCY_SOURCE_FINISHED/);
  assert.match(source, /markSourceConsumed/);
});
