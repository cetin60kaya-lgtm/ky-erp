import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const frontend=resolve(here,"..");
const repo=resolve(frontend,"../../..");
const readFrontend=(path)=>readFileSync(resolve(frontend,path),"utf8");
const manifest=JSON.parse(readFrontend("public/ky-guvenlik/manifest.webmanifest"));
const html=readFrontend("public/ky-guvenlik/index.html");
const installer=readFrontend("public/ky-guvenlik/install-helper.js");
const app=readFrontend("public/ky-guvenlik/app.js");
const sw=readFrontend("public/ky-guvenlik/sw.js");
const legacyHtml=readFrontend("public/security/index.html");
const legacySw=readFrontend("public/security/sw.js");
const phoneSetup=readFrontend("src/components/shell/PhoneApprovalDeviceSetup.jsx");
const host=readFileSync(resolve(repo,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");

test("Security PWA keeps one immutable install identity and version-free launch URL",()=>{
  assert.equal(manifest.id,"/ky-guvenlik/app-v28");
  assert.equal(manifest.scope,"/ky-guvenlik/");
  assert.equal(manifest.start_url,"/ky-guvenlik/");
  assert.doesNotMatch(html,/boot=|release=|flow-v|shell-v/);
  assert.doesNotMatch(sw,/boot=|release=|shell-v\d/);
  assert.doesNotMatch(host,/searchParams\.set\(["']boot/);
});

test("Android browser is install-only and enrollment starts only in standalone",()=>{
  assert.match(installer,/isBrowserInstall:\(\)=>ANDROID&&!standalone\(\)/);
  assert.match(installer,/installOnly\(\)/);
  assert.match(app,/if\(window\.KYSecurityInstaller\?\.isBrowserInstall\?\.\(\)\)[\s\S]*renderInstall\(\);setBadge\("Kurulum"\);return/);
  assert.match(phoneSetup,/\{ install: 1, platform, chrome:/);
  assert.doesNotMatch(phoneSetup,/install: 1[^\n]+autoRelink/);
});

test("enrollment handoff survives install without leaving its token in browser history",()=>{
  assert.match(installer,/localStorage\.setItem\(PENDING_KEY/);
  assert.match(installer,/url\.searchParams\.delete\("enrollmentToken"\)/);
  assert.match(installer,/history\.replaceState/);
  assert.match(app,/restoreEnrollmentLink/);
  assert.match(app,/Mevcut KY ERP şifreni bir kez gir/);
  assert.match(html,/Yedek kod ile bağla/);
});

test("legacy workers and caches migrate without deleting IndexedDB trusted-device state",()=>{
  assert.match(installer,/pathname!=="\/security\/"/);
  assert.match(installer,/registration\.unregister\(\)/);
  assert.match(installer,/kyerp-security-shell-/);
  assert.doesNotMatch(installer,/indexedDB\.deleteDatabase|clearDevice/);
  assert.match(legacyHtml,/location\.replace\(target\.href\)/);
  assert.match(legacySw,/self\.registration\.unregister\(\)/);
});

test("install, API and service-worker waits are bounded and always leave actionable UI",()=>{
  assert.match(installer,/INSTALL_TIMEOUT_MS=8000/);
  assert.match(installer,/withTimeout/);
  assert.match(installer,/Tekrar Dene/);
  assert.match(app,/AbortController/);
  assert.match(app,/REQUEST_TIMEOUT/);
  assert.match(app,/SW_READY_TIMEOUT/);
  assert.match(app,/setTimeout\(\(\)=>\{if\(els\.setupPanel/);
});

test("canonical worker uses network-fresh runtime and one stable static cache",()=>{
  assert.match(sw,/CACHE_NAME="kyerp-security-static"/);
  assert.match(sw,/runtime=event\.request\.mode==="navigate"/);
  assert.match(sw,/fetch\(event\.request,\{cache:"no-store"\}\)/);
  assert.match(sw,/kyerp-ky-guvenlik-shell-/);
});
