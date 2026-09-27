import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./auth-external-recovery.ts", import.meta.url), "utf8");
const registrar = readFileSync(new URL("./auth-policy-recovery-code.ts", import.meta.url), "utf8");

test("external recovery routes are registered and config gated", () => {
  assert.match(registrar, /registerAuthExternalRecoveryRoutes\(app\)/);
  assert.match(source, /\/api\/auth\/external\/providers/);
  assert.match(source, /\/api\/auth\/external\/:provider\/start/);
  assert.match(source, /\/api\/auth\/external\/:provider\/callback/);
  assert.match(source, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(source, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(source, /MICROSOFT_OAUTH_CLIENT_ID/);
  assert.match(source, /MICROSOFT_OAUTH_CLIENT_SECRET/);
  assert.match(source, /MICROSOFT_OAUTH_TENANT_ID/);
});

test("external recovery requires an existing password-verified login proof", () => {
  assert.match(source, /phoneApprovalFromRequest/);
  assert.match(source, /auth_login_challenges/);
  assert.match(source, /EXTERNAL_RECOVERY_PROOF_INVALID/);
  assert.doesNotMatch(source, /body\.email/);
});

test("provider flow uses one-time state, nonce and PKCE", () => {
  assert.match(source, /state_hash/);
  assert.match(source, /nonce/);
  assert.match(source, /pkce_verifier/);
  assert.match(source, /code_challenge_method: "S256"/);
  assert.match(source, /used_at IS NULL/);
  assert.match(source, /STATE_SECONDS = 10 \* 60/);
});

test("provider identity is cryptographically checked and bound to verified account email", () => {
  assert.match(source, /RSASSA-PKCS1-v1_5/);
  assert.match(source, /email_verified !== true/);
  assert.match(source, /claims\.tid/);
  assert.match(source, /identity\.email !== accountEmail/);
  assert.match(source, /EXTERNAL_RECOVERY_EMAIL_MISMATCH/);
});

test("successful provider recovery preserves trusted phone and uses canonical approval", () => {
  assert.match(source, /INSERT INTO auth_login_approvals/);
  assert.match(source, /phoneTrustPreserved: true/);
  assert.match(source, /securityCenterRequired: false/);
  assert.match(source, /cancelPhoneApproval/);
});
