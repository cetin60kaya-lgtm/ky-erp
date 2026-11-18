import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("all mobile KY ERP users can opt in to native PIN/biometric passkey", () => {
  const helper = read("./mobilePasskeyClient.js");
  const provider = read("./AuthContext.jsx");
  const offer = read("./MobilePasskeyOffer.jsx");
  assert.match(helper, /userVerification: "required"/);
  assert.match(helper, /authenticatorAttachment: "platform"/);
  assert.match(helper, /rpId: RP_ID/);
  assert.match(helper, /navigator\.credentials\.create/);
  assert.match(helper, /navigator\.credentials\.get/);
  assert.match(provider, /loginMobilePasskey/);
  assert.match(provider, /registerMobilePasskey/);
  assert.match(provider, /token && user \? <MobilePasskeyOffer/);
  assert.match(offer, /Şimdi değil/);
});
test("mobile fast login preserves password and turnstile as safe fallback", () => {
  const login = read("../pages/LoginPage.jsx");
  assert.match(login, /handlePasskeyLogin/);
  assert.match(login, /Parmak İzi \/ Yüz Tanıma \/ PIN ile Giriş/);
  assert.match(login, /type="submit" disabled=\{loading \|\| !turnstileConfig.loaded/);
  assert.match(login, /login\(identity, rawPassword/);
  assert.doesNotMatch(login, /window\.location\.assign\("https:\/\/app\.kyerp\.net/);
});