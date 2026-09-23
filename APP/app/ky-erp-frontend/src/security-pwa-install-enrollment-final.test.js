import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const frontend=resolve(here,"..");
const repo=resolve(frontend,"../../..");
const read=(p)=>readFileSync(resolve(frontend,p),"utf8");
const manifest=JSON.parse(read("public/guvenlik/manifest.webmanifest"));
const html=read("public/guvenlik/index.html");
const app=read("public/guvenlik/app.js");
const installer=read("public/guvenlik/install-helper.js");
const sw=read("public/guvenlik/sw.js");
const control=read("public/guvenlik/security-control-center.js");
const actions=read("public/guvenlik/security-actions.js");
const setup=read("src/components/shell/PhoneApprovalDeviceSetup.jsx");
const host=readFileSync(resolve(repo,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");
const mobileControl=readFileSync(resolve(repo,"APP/cloud/ky-erp-api/src/auth-security-mobile-control.ts"),"utf8");

test("fresh security app has a new immutable identity",()=>{
  assert.equal(manifest.id,"/guvenlik/");
  assert.equal(manifest.scope,"/guvenlik/");
  assert.equal(manifest.start_url,"/guvenlik/");
  assert.match(html,/\/guvenlik\/app\.js/);
  assert.match(app,/kyerp-security-fresh-v3/);
  assert.match(app,/kyerp-security-fresh-enrollment-v3/);
});

test("old PWA packages are physically removed",()=>{
  assert.equal(existsSync(resolve(frontend,"public/ky-guvenlik")),false);
  assert.equal(existsSync(resolve(frontend,"public/security")),false);
  assert.equal(existsSync(resolve(frontend,"public/ky-guvenlik-recover")),false);
});

test("fresh worker supports installability without shell caching",()=>{
  assert.match(sw,/self\.addEventListener\("fetch"/);
  assert.match(sw,/event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(sw,/self\.addEventListener\("push"/);
  assert.match(sw,/self\.addEventListener\("notificationclick"/);
  assert.doesNotMatch(sw,/cache\.put|cache\.add|cache\.addAll/);
});

test("security host keeps both installed PWA launch scopes alive",()=>{
  assert.match(host,/const SOURCE_PREFIX="\/guvenlik"/);
  assert.match(host,/const PRIMARY_PREFIX="\/ky-guvenlik"/);
  assert.match(host,/const COMPAT_PREFIXES=\[PRIMARY_PREFIX,SOURCE_PREFIX\]/);
  assert.match(host,/const LEGACY_PREFIXES=\["\/security","\/ky-guvenlik-recover"\]/);
  assert.match(host,/proxyScoped/);
  assert.match(host,/Service-Worker-Allowed/);
  assert.match(host,/env\.ASSETS/);
  assert.match(host,/return suffix&&suffix!=="\/"\?suffix:"\/"/);
  assert.match(host,/return new Response\("Gone",\{status:410/);
});

test("legacy redirects preserve only canonical enrollment and install handoff parameters",()=>{
  assert.match(host,/const REDIRECT_QUERY_KEYS=\["enrollmentId","enrollmentToken","mode","install","platform","browser","chrome"\]/);
  assert.match(host,/const preserved=new URLSearchParams\(\)/);
  assert.match(host,/if\(value!==null\)preserved\.set\(key,value\)/);
  assert.match(host,/target\.search=preserved\.toString\(\)/);
  assert.doesNotMatch(host,/target\.search=""/);
});

test("enrollment no longer waits for platform biometric creation",()=>{
  assert.doesNotMatch(app,/localUnlockCredentialId=await createLocalUnlock/);
  assert.match(app,/let localUnlockCredentialId="";/);
  assert.match(app,/security-v3\.0/);
});

test("trusted-device enrollment requires 8 character backup code plus ERP password",()=>{
  assert.match(mobileControl,/SECURITY_ENROLLMENT_CODE_REQUIRED/);
  assert.match(mobileControl,/8 karakter KY Güvenlik yedek bağlantı kodu zorunludur/);
  assert.match(mobileControl,/SECURITY_ENROLLMENT_CODE_INVALID/);
  assert.match(mobileControl,/security-relink\/by-subscription/);
  assert.match(actions,/8 karakter yedek bağlantı kodu · zorunlu/);
  assert.match(actions,/Mevcut ADMIN \/ KY ERP şifresi/);
  assert.match(actions,/stopImmediatePropagation/);
  assert.match(setup,/8 KARAKTER BAĞLANTI KODU · ZORUNLU/);
  assert.match(setup,/ADMIN \/ KY ERP şifresi/);
  assert.doesNotMatch(app,/security-relink\/by-subscription/);
  assert.match(app,/Yedek Kod \+ Admin Şifresiyle Bağla/);
});

test("mobile shell is single-stage and approval requires explicit confirm plus device unlock",()=>{
  assert.match(html,/id="bootPanel"/);
  assert.match(html,/id="installPanel" class="security-card hidden"/);
  assert.match(app,/approve\.disabled=true/);
  assert.match(app,/selectedMatch!==match/);
  assert.match(app,/await confirmLocalUnlock\(device\)/);
  assert.match(app,/const id=await createLocalUnlock\(\)/);
  assert.doesNotMatch(app,/if\(!device\?\.localUnlockCredentialId\)return true/);
});

test("installer still clears every legacy worker before Android install",()=>{
  assert.match(installer,/legacyScope=\["\/","\/security\/","\/ky-guvenlik\/","\/ky-guvenlik-recover\/"\]/);
  assert.match(installer,/legacyScript=\["\/sw\.js","\/security\/sw\.js","\/ky-guvenlik\/sw\.js","\/ky-guvenlik-recover\/sw\.js"\]/);
  assert.match(installer,/candidate=registration\.installing\|\|registration\.waiting/);
});

test("live host contains install handoff override",()=>{
  assert.match(host,/INSTALL_HELPER_HOTFIX/);
  assert.match(host,/beforeinstallprompt/);
});

test("security UI has one canonical refresh owner and no DOM rewrite observer",()=>{
  assert.doesNotMatch(html,/security-foreground-sync\.js/);
  assert.equal(existsSync(resolve(frontend,"public/guvenlik/security-foreground-sync.js")),false);
  assert.doesNotMatch(control,/MutationObserver/);
  assert.doesNotMatch(control,/stableSystemAccountSnapshot/);
  assert.doesNotMatch(control,/installSecurityUiStability/);
});