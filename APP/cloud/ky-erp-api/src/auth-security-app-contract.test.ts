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
