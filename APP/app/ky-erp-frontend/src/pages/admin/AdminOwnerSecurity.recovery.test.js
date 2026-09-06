import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ownerSecurity = fs.readFileSync(path.join(here, "AdminOwnerSecurity.jsx"), "utf8");
const adminApi = fs.readFileSync(path.join(here, "..", "..", "services", "adminApi.js"), "utf8");

test("owner security center manages question-answer recovery with MFA step-up", () => {
  assert.match(ownerSecurity, /getOwnerRecoveryConfig/);
  assert.match(ownerSecurity, /saveOwnerRecoveryQuestions/);
  assert.match(ownerSecurity, /Uygulama Sahibi Özel Soru-Cevap/);
  assert.match(ownerSecurity, /Üç soru kaydedilir; kurtarmada iki tanesi rastgele sorulur/);
  assert.match(ownerSecurity, /Mevcut Authenticator kodu/);
  assert.match(ownerSecurity, /recoveryStepUpCode/);
  assert.match(ownerSecurity, /provider:\s*recoveryProvider/);
  assert.match(ownerSecurity, /code:\s*cleanCode/);
  assert.match(ownerSecurity, /questions/);
});

test("owner recovery admin API uses canonical protected endpoints", () => {
  assert.match(adminApi, /\/admin\/security\/owner-recovery/);
  assert.match(adminApi, /\/admin\/security\/owner-recovery\/questions/);
});
