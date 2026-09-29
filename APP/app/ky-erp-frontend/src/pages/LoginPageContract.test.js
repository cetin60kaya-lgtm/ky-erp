import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./LoginPage.jsx", import.meta.url), "utf8");

test("successful login does not force a second full page navigation", () => {
  assert.doesNotMatch(source, /window\.location\.replace\s*\(/);
  assert.doesNotMatch(source, /window\.location\.reload\s*\(/);
  assert.doesNotMatch(source, /location\.reload\s*\(/);
});

test("login UI delegates credentials and MFA to the shared AuthContext engine", () => {
  assert.match(source, /useAuth\(\)/);
  assert.match(source, /await login\(identity, rawPassword/);
  assert.match(source, /await verifyMfa\(/);
});

test("login UI does not expose connection-state wording or admin-only copy", () => {
  assert.match(source, /Giriş yapılıyor\.\.\./);
  assert.doesNotMatch(source, /Güvenli bağlantı kuruluyor/);
  assert.doesNotMatch(source, /Admin hesaplarında MFA zorunludur/);
});

test("phone approval stays primary in a fixed corporate verification card", () => {
  assert.doesNotMatch(source, /AUTHENTICATOR_FALLBACK_DELAY_MS/);
  assert.doesNotMatch(source, /Onayı Şimdi Kontrol Et/);
  assert.doesNotMatch(source, /Telefonla onaylayamıyorum/);
  assert.match(source, /auth-stage-viewport/);
  assert.match(source, /Kurumsal doğrulama yöntemleri/);
  assert.match(source, /auth-method-tabs-triple/);
  assert.match(source, /auth-site-backdrop/);
  assert.match(source, /Authenticator/);
  assert.match(source, /Hesap Kurtarma/);
  assert.match(source, /Kod \+ güvenlik soruları/);
});
