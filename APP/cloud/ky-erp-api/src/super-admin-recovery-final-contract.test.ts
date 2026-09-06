import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

test("Super Admin recovery runtime bootstraps the required D1 schema", () => {
  const source = read("./auth-policy-cloud.ts");
  assert.match(source, /async function ensureOwnerRecoverySchema/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS auth_owner_recovery_questions/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS auth_owner_recovery_challenges/);
  assert.match(source, /addColumnIfMissing/);
  assert.match(source, /OWNER_RECOVERY_SCHEMA_UNAVAILABLE/);
});

test("legacy one-time recovery codes are optional and retired safely", () => {
  const source = read("./auth-policy-cloud.ts");
  assert.match(source, /async function retireLegacyRecoveryCodes/);
  assert.match(source, /if \(!\(await tableExists\(c, "auth_recovery_codes"\)\)\) return/);
  assert.doesNotMatch(source, /await c\.env\.DB\.prepare\("UPDATE auth_recovery_codes SET used_at=COALESCE\(used_at,\?\) WHERE user_id=\? AND used_at IS NULL"\)\.bind\(timestamp, current\.id\)\.run\(\)/);
});

test("Super Admin recovery UI has show-hide answers and no recovery-code UX", () => {
  const source = read("../../../app/ky-erp-frontend/src/pages/admin/AdminOwnerSecurity.jsx");
  assert.match(source, /Hesap Kurtarma ve Kimlik Doğrulama/);
  assert.match(source, /showRecoveryAnswers/);
  assert.match(source, /visible \? "Gizle" : "Göster"/);
  assert.match(source, /Kayıtlı — değiştirmek için yeni cevap yazın/);
  assert.match(source, /Kurtarma Güvenliğini Kaydet/);
  assert.doesNotMatch(source, /tek kullanımlık acil kurtarma kodu/i);
});

test("stored recovery answers stay non-reversible in the UI contract", () => {
  const source = read("../../../app/ky-erp-frontend/src/pages/admin/AdminOwnerSecurity.jsx");
  assert.match(source, /Kayıtlı cevapların düz metni sunucudan geri getirilemez/);
  assert.match(source, /salt \+ PBKDF2 hash/);
  assert.match(source, /“Göster \/ Gizle” yalnız bu ekranda şu anda yazdığınız yeni cevabı gösterir/);
});
