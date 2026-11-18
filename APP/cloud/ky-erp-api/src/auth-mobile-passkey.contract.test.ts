import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./auth-mobile-passkey.ts", import.meta.url), "utf8");
const policy = readFileSync(new URL("./auth-policy-cloud.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("./auth-cloud.ts", import.meta.url), "utf8");

test("mobile passkey requires server-side challenge, RP hash, user verification and ECDSA proof", () => {
  assert.match(source, /const RP_ID = "kyerp.net"/);
  assert.match(source, /ALLOWED_ORIGINS = new Set/);
  assert.match(source, /data\.origin !== origin/);
  assert.match(source, /!equal\(bytes\.slice\(0, 32\), rpHash\)/);
  assert.match(source, /!\(flags & 0x01\) \|\| !\(flags & 0x04\)/);
  assert.match(source, /signatureToRaw/);
  assert.match(source, /crypto\.subtle\.verify/);
  assert.match(source, /challenge\.challenge_type !== "PASSKEY_LOGIN"/);
  assert.match(source, /oneUseChallenge\(c, challenge\)/);
  assert.match(source, /consumed_at IS NULL AND expires_at>\?/);
});
test("registration requires fresh authenticated session; recovery revokes enrolled keys", () => {
  assert.match(source, /getAuthenticatedUser\(c\)/);
  assert.match(source, /recent > 5 \* 60 \* 1000/);
  assert.match(source, /CREDENTIAL_ALREADY_USED/);
  assert.match(source, /PASSKEY_REGISTER/);
  assert.match(source, /securityStorePut\(c, SCOPE, credentialId/);
  assert.match(policy, /registerMobilePasskeyRoutes\(app, \{ userById, userByIdentity, createChallenge, challengeFromRequest, afterFactors, audit \}\)/);
  assert.match(policy, /scope='AUTH_MOBILE_PASSKEY_V1'/);
  assert.match(auth, /scope='AUTH_MOBILE_PASSKEY_V1'/);
});
test("fast login never overrides role, company or manager approval policy", () => {
  assert.match(source, /deps\.userById\(c, text\(challenge\.user_id\)\)/);
  assert.match(source, /user\.must_change_password/);
  assert.match(source, /BOTH_MFA/);
  assert.match(source, /deps\.afterFactors\(c, user/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|password_hash/);
});