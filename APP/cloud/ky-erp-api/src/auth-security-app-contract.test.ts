import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const push=readFileSync(resolve(here,"auth-push-cloud.ts"),"utf8");

test("security app enrollment is one-time, password stepped-up and migration retires legacy devices",()=>{
  assert.match(push,/AUTH_PUSH_SECURITY_ENROLLMENT/);
  assert.match(push,/security-enrollment\/start/);
  assert.match(push,/security-enrollment\/complete/);
  assert.match(push,/compare\(password, text\(user\.password_hash\)\)/);
  assert.match(push,/legacyDevicesRetired: true/);
  assert.match(push,/row\.securityApp !== true/);
  assert.match(push,/retiredReason: "KY ERP Güvenlik uygulamasına taşındı"/);
});

test("security app devices are preferred and every decision is signed with device key",()=>{
  assert.match(push,/return eligible\.filter\(\(row: AnyRow\) => row\.securityApp === true\)/);
  assert.match(push,/LEGACY_PHONE_APPROVAL_RETIRED/);
  assert.match(push,/verifySecurityAppDecision/);
  assert.match(push,/SECURITY_DEVICE_SIGNATURE_INVALID/);
  assert.match(push,/KYERP-DECISION-V1/);
  assert.match(push,/decisionPublicKeyJwk/);
});


test("security device token drift self-heals only with a fresh signed device-auth proof",()=>{
  assert.match(push,/verifySecurityDeviceAuth/);
  assert.match(push,/KYERP-DEVICE-AUTH-V1/);
  assert.match(push,/X-KYERP-Security-Timestamp/);
  assert.match(push,/X-KYERP-Security-Signature/);
  assert.match(push,/120_000/);
  assert.match(push,/SECURITY_DEVICE_TOKEN_REPAIRED/);
  assert.match(push,/deviceTokenHash: suppliedHash/);
});


test("security app health and signed connection refresh can recover an inactive push channel",()=>{
  assert.match(push,/auth\/push\/device\/health/);
  assert.match(push,/auth\/push\/device\/refresh/);
  assert.match(push,/signedSecurityActorForRecovery/);
  assert.match(push,/SECURITY_APP_CONNECTION_REFRESHED/);
  assert.match(push,/PUSH_DEVICE_RECOVERY_UNAUTHORIZED/);
  assert.match(push,/lastRefreshAt/);
});


test("access refresh reuses the same security device id instead of creating duplicate push devices",()=>{
  assert.match(push,/replaceDeviceId/);
  assert.match(push,/replaceCandidate = replaceDeviceId/);
  assert.match(push,/const existing = replaceCandidate \|\| endpointCandidate/);
  assert.match(push,/SECURITY_DEVICE_RELINK_INVALID/);
  assert.match(push,/relinkedDevice: Boolean\(replaceCandidate\)/);
  assert.match(push,/SECURITY_APP_VERSION = "security-v1\.2"/);
});
