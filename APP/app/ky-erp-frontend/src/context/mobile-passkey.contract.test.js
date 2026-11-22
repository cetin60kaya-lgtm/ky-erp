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
test("legacy normal ERP mobile login shares WebAuthn but personnel portal does not escalate",()=>{
 const legacy=read("../mobile/MobileLogin.jsx");
 const app=read("../mobile/MobileApp.jsx");
 assert.match(legacy,/auth\/passkey\/login\/start/);
 assert.match(legacy,/auth\/passkey\/login\/finish/);
 assert.match(legacy,/if \(loading \|\| personnelMode\) return/);
 assert.match(legacy,/PERSONNEL/);
 assert.match(app,/auth\/passkey\/register\/start/);
 assert.match(app,/!personnel \? <MobilePasskeyOffer/);
});

test("PRO ERP button opens native biometric prompt before any password form when registered",()=>{
 const pro=read("../pro/main.jsx");
 const login=read("../pages/LoginPage.jsx");
 assert.match(pro,/const openErpWithPhone=useCallback/);
 assert.match(pro,/const identity=rememberedMobileUser\(\)/);
 assert.match(pro,/await loginMobilePasskey\(identity\)/);
 assert.match(pro,/onClick=\{loginRequested\?\(\)=>setLoginRequested\(false\):openErpWithPhone\}/);
 assert.match(pro,/onClick=\{openErpWithPhone\}/);
 assert.match(login,/initialFlow = null/);
 assert.match(login,/initialFlow\?\.stage \? initialFlow/);
});

test("approved desktop browsers offer Windows Hello without removing KY PRO mobile entry", () => {
  const helper = read("./mobilePasskeyClient.js");
  const offer = read("./MobilePasskeyOffer.jsx");
  const login = read("../pages/LoginPage.jsx");
  const pro = read("../pro/main.jsx");
  assert.match(helper, /isUserVerifyingPlatformAuthenticatorAvailable/);
  assert.match(offer, /hasPlatformPasskeyAuthenticator/);
  assert.match(offer, /Windows Hello Girişini Etkinleştir/);
  assert.match(login, /Windows Hello \/ Parmak İzi \/ PIN ile Giriş/);
  assert.match(login, /useState\(\(\) => rememberedMobileUser\(\)\)/);
  assert.match(pro, /await loginMobilePasskey\(identity\)/);
});

test("security center can list and remove only the current user's platform keys", () => {
  const api = read("../services/securityCenterApi.js");
  const panel = read("../pages/admin/SecurityCenterPanel.jsx");
  assert.match(api, /listOwnPasskeyCredentials/);
  assert.match(api, /revokeOwnPasskeyCredential/);
  assert.match(api, /auth\/passkey\/credentials/);
  assert.match(panel, /Parmak İzi \/ Windows Hello Giriş Anahtarlarım/);
  assert.match(panel, /revokePasskey/);
});

test("KY PRO security center exposes authenticated passkey inventory and safe self-revocation",()=>{
  const proSecurity=read("../pro/SecurityCenter.jsx");
  assert.match(proSecurity,/listOwnPasskeyCredentials/);
  assert.match(proSecurity,/revokeOwnPasskeyCredential/);
  assert.match(proSecurity,/if\(!isAuthenticated\)/);
  assert.match(proSecurity,/\["keys","Hızlı Giriş",KeyRound\]/);
});
