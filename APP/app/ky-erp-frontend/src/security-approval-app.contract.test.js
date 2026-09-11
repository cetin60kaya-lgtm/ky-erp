import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const app=readFileSync(resolve(root,"public/security/app.js"),"utf8");
const ios=readFileSync(resolve(root,"public/security/ios-safari.js"),"utf8");
const sw=readFileSync(resolve(root,"public/security/sw.js"),"utf8");
const manifest=readFileSync(resolve(root,"public/security/manifest.webmanifest"),"utf8");
const html=readFileSync(resolve(root,"public/security/index.html"),"utf8");
const setup=readFileSync(resolve(here,"components/shell/PhoneApprovalDeviceSetup.jsx"),"utf8");

test("KY ERP Security is a separate installable phone tablet PWA",()=>{
  assert.match(manifest,/"name": "KY ERP Güvenlik"/);
  assert.match(manifest,/"id": "\/security\/"/);
  assert.match(manifest,/"scope": "\/security\/"/);
  assert.match(setup,/Microsoft Authenticator mantığında ayrı telefon\/tablet onay uygulaması/);
  assert.match(setup,/Yeni Kurulum Kodu Oluştur/);
});

test("security app uses one consolidated notification and opens app for decision",()=>{
  assert.match(sw,/const TAG="kyerp-security-approval"/);
  assert.match(sw,/tag:TAG/);
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

test("security app owns signed API calls while the service worker is notification transport only",()=>{
  assert.match(app,/signDeviceAuth/);
  assert.match(app,/KYERP-DEVICE-AUTH-V1/);
  assert.match(app,/X-KYERP-Security-Timestamp/);
  assert.match(app,/X-KYERP-Security-Signature/);
  assert.doesNotMatch(sw,/API_BASE|deviceFetch|signDeviceAuth|X-KYERP-Push-Device|X-KYERP-Push-Token/);
  assert.match(sw,/showWakeNotification/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v11"/);
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

test("push delivery always shows one wake notification without depending on an API fetch",()=>{
  assert.match(sw,/self\.addEventListener\("push"/);
  assert.match(sw,/showWakeNotification/);
  assert.match(sw,/tag:TAG/);
  assert.match(sw,/renotify:false/);
  assert.doesNotMatch(sw,/deviceFetch|fetchFailed|KY ERP · Bağlantı Kontrolü/);
});

test("professional security app exposes approvals, short login code and trusted-device tabs",()=>{
  assert.match(app,/showTab/);
  assert.match(app,/generateLoginCode/);
  assert.match(app,/auth\/push\/device\/login-code/);
  assert.match(app,/repairConnection/);
  assert.match(setup,/Telefon Bağlantısını Yenile/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v11"/);
});

test("phone approval has explicit Android and iPhone installation entry points and installer mode",()=>{
  assert.match(setup,/Android için KY Güvenlik'i İndir \/ Kur/);
  assert.match(setup,/iPhone \/ iPad için KY Güvenlik'i Kur/);
  assert.match(setup,/openSecurityInstaller/);
  assert.match(app,/requestedInstall/);
  assert.match(app,/beforeinstallprompt/);
  assert.match(app,/appinstalled/);
  assert.match(app,/Android'e KY Güvenlik'i Yükle/);
  assert.match(html,/id="iosInstallNote"/);
  assert.match(sw,/CACHE_NAME="kyerp-security-shell-v11"/);
});

test("iPhone Safari permission is requested directly from a user gesture before async enrollment",()=>{
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/apple-touch-icon/);
  assert.match(html,/\/security\/ios-safari\.js/);
  assert.match(html,/Safari ile açın → Paylaş → Ana Ekrana Ekle → Ekle/);
  assert.match(app,/if\(isIos\(\)&&!isStandalone\(\)\)/);
  assert.match(ios,/display-mode: standalone/);
  assert.match(ios,/Notification\.requestPermission\(\)/);
  assert.match(ios,/event\.stopImmediatePropagation\(\)/);
  assert.match(ios,/button\.click\(\)/);
  assert.match(manifest,/kyerp-security-192\.png/);
  assert.match(manifest,/kyerp-security-512\.png/);
});

test("iPhone Safari assets are part of the offline security shell",()=>{
  assert.match(sw,/\/security\/ios-safari\.js/);
  assert.match(sw,/kyerp-security-apple-touch\.png/);
  assert.match(sw,/kyerp-security-192\.png/);
  assert.match(sw,/kyerp-security-512\.png/);
});

test("appearance center centralizes KY ERP and KY Security install entry points",()=>{
  assert.match(setup,/Android için KY Güvenlik'i İndir \/ Kur/);
  assert.match(setup,/iPhone \/ iPad için KY Güvenlik'i Kur/);
});

test("main ERP and KY Security have separate install and service-worker ownership",()=>{
  const main=readFileSync(resolve(here,"main.jsx"),"utf8");
  const legacy=readFileSync(resolve(root,"public/kyerp-push-sw.js"),"utf8");
  assert.match(main,/retireLegacyPhoneApprovalWorker/);
  assert.doesNotMatch(main,/PhoneApprovalInboxBridge/);
  assert.doesNotMatch(main,/serviceWorker\.register\("\/kyerp-push-sw\.js"/);
  assert.match(legacy,/registration\.unregister/);
  assert.doesNotMatch(legacy,/auth\/push\/device\/decision/);
  assert.match(manifest,/\/security\/kyerp-security-icon\.svg/);
  assert.match(sw,/kyerp-security-shell-v11/);
});

test("security app never renders a blank approvals screen on connection failure",()=>{
  assert.match(html,/id="emptyTitle"/);
  assert.match(html,/id="emptyCopy"/);
  assert.match(app,/setEmptyState/);
  assert.match(app,/NETWORK_ERROR/);
  assert.match(app,/repairConnection\(\{automatic:true\}\)/);
});

test("security app does not navigate into the main ERP application",()=>{
  assert.doesNotMatch(html,/href="\/"[^>]*>Ana KY ERP/);
  assert.match(html,/KY Güvenlik · Android · iPhone Safari/);
});

test("security app shows the verified bound ERP account identity and access scope",()=>{
  assert.match(html,/BAĞLI HESAP/);
  assert.match(html,/id="accountEmail"/);
  assert.match(html,/id="accountUsername"/);
  assert.match(html,/id="accountScope"/);
  assert.match(html,/id="accountModules"/);
  assert.match(html,/id="accountSecurityCaps"/);
  assert.match(app,/renderAccount\(health\.account,health\.device\|\|device\)/);
  assert.match(app,/Bu cihaz yalnız/);
  assert.match(app,/Muhasebe/);
});

test("security runtime files stay JavaScript-syntax valid",()=>{
  assert.doesNotThrow(()=>new Function(app));
  assert.doesNotThrow(()=>new Function(ios));
  assert.doesNotThrow(()=>new Function(sw));
});
