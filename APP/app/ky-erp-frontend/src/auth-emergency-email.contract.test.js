import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../public/auth-emergency-email.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("emergency email bridge loads before the React login bundle", () => {
  const bridge = html.indexOf("/auth-emergency-email.js");
  const app = html.indexOf("/src/main.jsx");
  assert.ok(bridge >= 0);
  assert.ok(app > bridge);
});

test("bridge observes only already verified auth challenges and never reads passwords", () => {
  assert.match(script, /phoneApprovalId/);
  assert.match(script, /challengeId/);
  assert.doesNotMatch(script, /querySelector\([^\n]*password/i);
  assert.doesNotMatch(script, /localStorage\.setItem\([^\n]*password/i);
});

test("email recovery UI is generic, verified-email based and not owner-only", () => {
  assert.match(script, /E-posta ile Kurtarma/);
  assert.match(script, /Telefon kullanılamıyor mu/);
  assert.match(script, /Hesabınıza kayıtlı doğrulanmış e-posta adresine tek kullanımlık doğrulama kodu gönderilir/);
  assert.match(script, /E-posta Doğrulama/);
  assert.match(script, /6 haneli doğrulama kodu/);
  assert.match(script, /Doğrula ve Giriş Yap/);
  assert.match(script, /Yeni Kod Gönder/);
  assert.match(script, /mevcut güvenilir telefon kaydınız değiştirilmez/);
  assert.doesNotMatch(script, /Süper Yönetici için son çare/);
});

test("verified emergency flow uses canonical approval status then stores only the issued session", () => {
  assert.match(script, /\/auth\/email-emergency\/start/);
  assert.match(script, /\/auth\/email-emergency\/verify/);
  assert.match(script, /\/auth\/approval\//);
  assert.match(script, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(script, /sessionStorage\.setItem\(USER_KEY/);
});
