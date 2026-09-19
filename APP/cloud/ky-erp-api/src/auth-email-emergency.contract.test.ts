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

test("email recovery is available to active users only through their stored verified account email", () => {
  assert.match(source, /Boolean\(user\.is_active\)/);
  assert.match(source, /Boolean\(user\.email_verified\)/);
  assert.match(source, /text\(user\.email\)/);
  assert.doesNotMatch(source, /EMAIL_EMERGENCY_OWNER_ONLY/);
  assert.doesNotMatch(source, /isOwner\(roleOf\(user\)\)/);
  assert.doesNotMatch(source, /text\(body\.email\)/);
});

test("OTP is hashed, rate-limited, short lived and locks after repeated failures", () => {
  assert.match(source, /EMAIL_SECONDS = 10 \* 60/);
  assert.match(source, /EMAIL_MAX_ATTEMPTS = 5/);
  assert.match(source, /EMAIL_LOCK_SECONDS = 30 \* 60/);
  assert.match(source, /EMAIL_MAX_SENDS_HOUR = 5/);
  assert.match(source, /await sha256\(`\$\{salt\}:\$\{otp\}`\)/);
  assert.doesNotMatch(source, /otp\s*:/);
});

test("verified email proof creates only a canonical approved login claim and preserves phone trust", () => {
  assert.match(source, /auth_login_approvals/);
  assert.match(source, /'APPROVED'/);
  assert.match(source, /EMAIL_RECOVERY_CODE_VERIFIED/);
  assert.match(source, /securityCenterRequired: false/);
  assert.match(source, /phoneTrustPreserved: true/);
  assert.match(source, /stage: "APPROVAL_PENDING"/);
  assert.doesNotMatch(source, /INSERT INTO auth_sessions/);
});

test("email recovery emits canonical security audit events", () => {
  assert.match(source, /EMAIL_RECOVERY_CODE_SENT/);
  assert.match(source, /EMAIL_RECOVERY_CODE_FAILED/);
  assert.match(source, /EMAIL_RECOVERY_CODE_EXPIRED/);
  assert.match(source, /EMAIL_RECOVERY_RATE_LIMITED/);
});

test("original phone or MFA proof must still be pending at final verification", () => {
  assert.match(source, /sourceStillPending/);
  assert.match(source, /EMAIL_EMERGENCY_SOURCE_FINISHED/);
  assert.match(source, /markSourceConsumed/);
});
