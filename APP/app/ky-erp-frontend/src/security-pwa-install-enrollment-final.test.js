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
const host=readFileSync(resolve(repo,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");

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
test("fresh worker is push-only",()=>{
  assert.match(sw,/self\.addEventListener\("push"/);
  assert.match(sw,/self\.addEventListener\("notificationclick"/);
  assert.doesNotMatch(sw,/self\.addEventListener\("fetch"/);
});

test("legacy host paths only retire or redirect",()=>{
  assert.match(host,/const APP_PREFIX="\/guvenlik"/);
  assert.match(host,/const LEGACY_PREFIXES=\["\/security","\/ky-guvenlik","\/ky-guvenlik-recover"\]/);
  assert.match(host,/RETIRE_SW/);
  assert.match(host,/return new Response\("Gone",\{status:410/);
});

test("enrollment no longer waits for platform biometric creation",()=>{
  assert.doesNotMatch(app,/localUnlockCredentialId=await createLocalUnlock/);
  assert.match(app,/let localUnlockCredentialId="";/);
  assert.match(app,/security-v3\.0/);
});

test("installer clears every legacy worker before Android install",()=>{
  assert.match(installer,/legacyScope=\["\/","\/security\/","\/ky-guvenlik\/","\/ky-guvenlik-recover\/"\]/);
  assert.match(installer,/legacyScript=\["\/sw\.js","\/security\/sw\.js","\/ky-guvenlik\/sw\.js","\/ky-guvenlik-recover\/sw\.js"\]/);
  assert.match(installer,/await prepareInstall\(\);\r?\n      if\(!deferredPrompt\)await waitForPrompt\(\);/);
  assert.match(installer,/candidate=registration\.installing\|\|registration\.waiting/);
});
