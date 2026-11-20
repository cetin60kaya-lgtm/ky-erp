import test from "node:test";
import assert from "node:assert/strict";
import { classifyIsnetPortalFailure } from "./isnet-portal-safe-diagnostics.ts";

test("portal form failure never claims bad password", () => {
  const result=classifyIsnetPortalFailure(new Error("İşNet giriş sayfası veya doğrulama anahtarı alınamadı."));
  assert.equal(result.code,"ISNET_PORTAL_FORM_UNAVAILABLE");
  assert.match(result.message,/şifre yanlış olarak değerlendirilmedi/i);
});
test("missing company list is not an invalid credential claim", () => {
  const result=classifyIsnetPortalFailure(new Error("Portal girişi açıldı ancak yetkili firma listesi alınamadı."));
  assert.equal(result.code,"ISNET_PORTAL_COMPANIES_UNVERIFIED");
});
test("selected-company session is distinct from account login", () => {
  assert.equal(classifyIsnetPortalFailure(new Error("Portal firma seçimi başlatılamadı.")).code,"ISNET_PORTAL_COMPANY_SESSION_UNVERIFIED");
});
test("MFA challenge is reported separately", () => {
  assert.equal(classifyIsnetPortalFailure(new Error("İşNet ek güvenlik doğrulaması istiyor.")).code,"ISNET_PORTAL_SECURITY_CHALLENGE");
});
test("diagnostics never echo raw provider data", () => {
  const secret="SensitiveValue_DoNotEcho_92";
  const result=classifyIsnetPortalFailure(new Error("Provider failed "+secret));
  assert.equal(result.code,"ISNET_PORTAL_SESSION_UNVERIFIED");
  assert.equal(result.message.includes(secret),false);
});
