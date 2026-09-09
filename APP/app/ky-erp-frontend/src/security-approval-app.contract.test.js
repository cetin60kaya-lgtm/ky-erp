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
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v2"/);
  assert.match(sw,/caches\.delete/);
});


test("main ERP exposes connection diagnostics and a one-time access refresh path",()=>{
  assert.match(setup,/Erişim Yenileme Kodu Oluştur/);
  assert.match(setup,/Bağlantı kontrolü gerekli/);
  assert.match(setup,/Durumu Yenile/);
});
