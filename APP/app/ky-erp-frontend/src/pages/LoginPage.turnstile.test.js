import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const loginPage = fs.readFileSync(path.join(here, "LoginPage.jsx"), "utf8");
const authContext = fs.readFileSync(path.join(here, "..", "context", "AuthContext.jsx"), "utf8");

test("login page renders Cloudflare Turnstile and requires a token when enabled", () => {
  assert.match(loginPage, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(loginPage, /turnstile\.render/);
  assert.match(loginPage, /Güvenlik doğrulamasını tamamlayın/);
  assert.match(loginPage, /login\(identity, rawPassword, "", turnstileToken\)/);
});

test("auth context sends turnstileToken to the canonical login endpoint", () => {
  assert.match(authContext, /turnstileToken:\s*String\(turnstileToken/);
  assert.match(authContext, /directAuthRequest\("\/auth\/login"/);
  assert.match(authContext, /getTurnstileConfig/);
});


test("login page final corporate security UX is enforced", () => {
  assert.match(loginPage, /showPassword/);
  assert.match(loginPage, /Şifreyi göster/);
  assert.match(loginPage, /Caps Lock açık/);
  assert.match(loginPage, /turnstileConfig\.enabled && !turnstileToken/);
  assert.match(loginPage, /1 MFA doğrulaması gerekli/);
  assert.match(loginPage, /Özel soru-cevap ile güvenli kurtarma/);
  assert.doesNotMatch(loginPage, /Tek kullanımlık acil kurtarma kodu kullan/);
  assert.doesNotMatch(loginPage, /showRecoveryCode/);
});
