import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const app=readFileSync(resolve(root,"public/security/app.js"),"utf8");
const sw=readFileSync(resolve(root,"public/security/sw.js"),"utf8");
const manifest=readFileSync(resolve(root,"public/security/manifest.webmanifest"),"utf8");
const setup=readFileSync(resolve(here,"components/shell/PhoneApprovalSetup.jsx"),"utf8");

test("KY ERP Security is a separate installable phone tablet PWA",()=>{
  assert.match(manifest,/"name": "KY ERP Güvenlik"/);
  assert.match(manifest,/"id": "\/security\/"/);
  assert.match(manifest,/"scope": "\/security\/"/);
  assert.match(setup,/Microsoft Authenticator mantığında ayrı telefon\/tablet onay uygulaması/);
  assert.match(setup,/Yeni Kurulum Kodu Oluştur/);
});

test("security app uses one consolidated notification and opens app for decision",()=>{
  assert.match(sw,/tag:"kyerp-security-approval"/);
  assert.match(sw,/renotify:false/);
  assert.match(sw,/notificationclick/);
  assert.doesNotMatch(sw,/action:"approve"/);
  assert.doesNotMatch(sw,/action:"deny"/);
});

test("approval is protected by device signature and optional local biometric screen lock",()=>{
  assert.match(app,/createSigningKey/);
  assert.match(app,/signingPrivateKey/);
  assert.match(app,/KYERP-DECISION-V1/);
  assert.match(app,/navigator\.credentials\.create/);
  assert.match(app,/navigator\.credentials\.get/);
  assert.match(app,/userVerification:"required"/);
});


test("security app signs device-authenticated API calls and service worker cache upgrades cleanly",()=>{
  assert.match(app,/signDeviceAuth/);
  assert.match(app,/KYERP-DEVICE-AUTH-V1/);
  assert.match(app,/X-KYERP-Security-Timestamp/);
  assert.match(app,/X-KYERP-Security-Signature/);
  assert.match(sw,/signDeviceAuth/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v5"/);
  assert.match(sw,/caches\.delete/);
});


test("main ERP exposes connection diagnostics and a one-time access refresh path",()=>{
  assert.match(setup,/Erişim Yenileme Kodu Oluştur/);
  assert.match(setup,/Bağlantı kontrolü gerekli/);
  assert.match(setup,/Durumu Yenile/);
});


test("security app verifies server health before ready and provides one-tap connection repair",()=>{
  assert.match(app,/auth\/push\/device\/health/);
  assert.match(app,/auth\/push\/device\/refresh/);
  assert.match(app,/repairConnection/);
  assert.match(app,/Bağlantı yenilendi/);
  assert.match(app,/Erişim Yenileme Kodu/);
  assert.match(app,/replaceDeviceId/);
});

test("push fetch failure stays visible and routes user to connection recovery",()=>{
  assert.match(sw,/KY ERP · Bağlantı Kontrolü/);
  assert.match(sw,/KYERP_SECURITY_CONNECTION_WAKE/);
  assert.match(sw,/fetchFailed/);
});


test("professional security app exposes approvals, short login code and trusted-device tabs",()=>{
  assert.match(app,/showTab/);
  assert.match(app,/generateLoginCode/);
  assert.match(app,/auth\/push\/device\/login-code/);
  assert.match(app,/repairConnection/);
  assert.match(setup,/Telefon Bağlantısını Yenile/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v5"/);
});


test("phone approval has explicit Android and iPhone installation entry points and installer mode",()=>{
  assert.match(setup,/Android için KY Güvenlik'i İndir \/ Kur/);
  assert.match(setup,/iPhone \/ iPad için KY Güvenlik'i Kur/);
  assert.match(setup,/openSecurityInstaller/);
  assert.match(app,/requestedInstall/);
  assert.match(app,/beforeinstallprompt/);
  assert.match(app,/appinstalled/);
  assert.match(app,/Android'e KY Güvenlik'i Yükle/);
  assert.match(app,/Safari → Paylaş → Ana Ekrana Ekle/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v5"/);
});


test("appearance center centralizes KY ERP and KY Security install entry points",()=>{
  assert.match(setup,/Android için KY Güvenlik'i İndir \/ Kur/);
  assert.match(setup,/iPhone \/ iPad için KY Güvenlik'i Kur/);
});
