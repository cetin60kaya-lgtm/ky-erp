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
const recovery=readFrontend("public/ky-guvenlik-recover/index.html");
const phoneSetup=readFrontend("src/components/shell/PhoneApprovalDeviceSetup.jsx");
const host=readFileSync(resolve(repo,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");

test("Security PWA keeps one immutable install identity and version-free launch URL",()=>{
  assert.equal(manifest.id,"/ky-guvenlik/");
  assert.equal(manifest.scope,"/ky-guvenlik/");
  assert.equal(manifest.start_url,"/ky-guvenlik/");
  assert.doesNotMatch(html,/boot=|release=|flow-v|shell-v/);
  assert.doesNotMatch(sw,/boot=|release=|shell-v\d/);
  assert.doesNotMatch(host,/searchParams\.set\(["']boot/);
});

test("install helper runs immediately after parse and never leaves a preparing-only screen",()=>{
  assert.match(html,/<script defer src="\/ky-guvenlik\/install-helper\.js"><\/script>/);
  assert.doesNotMatch(html,/Kurulum ekranı hazırlanıyor/);
  assert.match(html,/Uygulamayı yükle/);
  assert.ok(html.indexOf("install-helper.js") < html.indexOf("app.js"));
  assert.match(installer,/PROMPT_WAIT_MS=1200/);
  assert.match(installer,/schedulePromptFallback/);
  assert.match(installer,/Bekleme yok:/);
  assert.match(installer,/revision:"canonical-reset-20260922"/);
});

test("Android browser is install-only and enrollment starts only in standalone",()=>{
  assert.match(installer,/isBrowserInstall:\(\)=>ANDROID&&!standalone\(\)/);
  assert.match(installer,/installOnly\(\)/);
  assert.match(app,/if\(!isStandalone\(\)\)[\s\S]*renderInstall\(\);setBadge\("Kurulum"\);return/);
  assert.match(phoneSetup,/\{ install: 1, platform, chrome:/);
  assert.doesNotMatch(phoneSetup,/install: 1[^\n]+autoRelink/);
  assert.doesNotMatch(phoneSetup,/async function openSecurityApp\(\)[\s\S]{0,160}issueEnrollment\(\)/);
  assert.match(phoneSetup,/KY G\u00fcvenlik A\u00e7/);
});

test("installed standalone app clears install handoff params and never reopens installer UI",()=>{
  assert.match(installer,/if\(standalone\(\)\)\{[\s\S]{0,500}\["install","platform","browser","chrome"\][\s\S]{0,300}history\.replaceState[\s\S]{0,160}return/);
  assert.match(app,/if\(standalone\)\{[\s\S]{0,500}\["install","platform","browser","chrome"\][\s\S]{0,300}els\.installPanel\.classList\.add\("hidden"\);[\s\S]{0,100}return/);
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
  assert.match(installer,/scopePath!=="\/security\/"/);
  assert.match(installer,/scriptPath\.startsWith\("\/security\/"\)/);
  assert.match(installer,/registration\.unregister\(\)/);
  assert.match(installer,/kyerp-security-shell-/);
  assert.doesNotMatch(installer,/indexedDB\.deleteDatabase|clearDevice/);
  assert.match(legacyHtml,/location\.replace\(target\.href\)/);
  assert.match(legacySw,/self\.registration\.unregister\(\)/);
});

test("security host exposes only the canonical /ky-guvenlik PWA and retires root/security identities",()=>{
  assert.match(host,/const CANONICAL_PREFIX = "\/ky-guvenlik"/);
  assert.match(host,/const CANONICAL_URL = `\$\{CANONICAL_PREFIX\}\/`/);
  assert.match(host,/incoming\.pathname === "\/sw\.js" \|\| incoming\.pathname === "\/security\/sw\.js"/);
  assert.match(host,/incoming\.pathname === "\/manifest\.webmanifest"/);
  assert.match(host,/redirectToCanonical\(incoming, `\$\{CANONICAL_PREFIX\}\/manifest\.webmanifest`\)/);
  assert.match(host,/Service-Worker-Allowed", CANONICAL_URL/);
  assert.doesNotMatch(host,/ROOT_MANIFEST|transformRootText|LEGACY_PWA_BROWSER_REDIRECT|root-v3/);
});

test("install, API and service-worker waits are bounded and always leave actionable UI",()=>{
  assert.match(installer,/INSTALL_TIMEOUT_MS=8000/);
  assert.match(installer,/withTimeout/);
  assert.match(installer,/Tekrar Dene/);
  assert.match(app,/AbortController/);
  assert.match(app,/REQUEST_TIMEOUT/);
  assert.match(app,/SW_READY_TIMEOUT/);
  assert.match(app,/setTimeout\(\(\)=>\{if\(isStandalone\(\)&&els\.setupPanel/);
});

test("canonical worker is push-only and never intercepts app shell requests",()=>{
  assert.match(sw,/LEGACY_CACHE_NAMES=\["kyerp-security-static","kyerp-security-static-v2","kyerp-security-static-v3"\]/);
  assert.match(sw,/clearLegacyCaches/);
  assert.match(sw,/self\.addEventListener\("push"/);
  assert.match(sw,/self\.addEventListener\("notificationclick"/);
  assert.doesNotMatch(sw,/self\.addEventListener\("fetch"/);
  assert.doesNotMatch(sw,/respondWith|cache\.match|cache\.put/);
});

test("recovery page refreshes the push-only worker without deleting trusted-device state",()=>{
  assert.match(recovery,/getRegistrations\(\)/);
  assert.match(recovery,/reg\.update\(\)/);
  assert.match(recovery,/serviceWorker\.register\('\/ky-guvenlik\/sw\.js'/);
  assert.match(recovery,/updateViaCache:'none'/);
  assert.match(recovery,/kyerp-security-static-v3/);
  assert.doesNotMatch(recovery,/\.unregister\(\)|indexedDB\.deleteDatabase|localStorage\.clear/);
  assert.match(recovery,/location\.replace\('\/ky-guvenlik\/\?recovered=1'\)/);
});


test("canonical security install requires one-time verified account binding",()=>{
  assert.match(app,/CANONICAL_DEVICE_REVISION="canonical-account-bind-20260922"/);
  assert.match(app,/canonicalRevision:CANONICAL_DEVICE_REVISION/);
  assert.match(app,/device\?\.canonicalRevision!==CANONICAL_DEVICE_REVISION/);
  assert.match(app,/ACCOUNT_PROFILE_MISSING/);
  assert.match(app,/els\.appPanel\.classList\.remove\("hidden"\)/);
});
