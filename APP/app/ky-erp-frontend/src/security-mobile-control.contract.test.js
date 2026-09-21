import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const html=readFileSync(resolve(root,"public/ky-guvenlik/index.html"),"utf8");
const app=readFileSync(resolve(root,"public/ky-guvenlik/app.js"),"utf8");
const control=readFileSync(resolve(root,"public/ky-guvenlik/security-control-center.js"),"utf8");
const actions=readFileSync(resolve(root,"public/ky-guvenlik/security-actions.js"),"utf8");
const sw=readFileSync(resolve(root,"public/ky-guvenlik/sw.js"),"utf8");
test("KY Security shows its canonical version and stores version state",()=>{
  assert.match(html,/id="appVersionBadge">v2\.9/);
  assert.match(html,/id="accountVersion">v2\.9/);
  assert.match(app,/CLIENT_VERSION="security-v2\.9"/);
  assert.match(app,/lastKnownServerVersion/);
  assert.match(app,/versionCheckedAt/);
  assert.match(app,/X-KYERP-Security-App-Version/);
});

test("system manager mobile center exposes sessions computers logs and company filter",()=>{
  assert.match(html,/data-tab="sessions"/);
  assert.match(html,/data-tab="computers"/);
  assert.match(html,/data-tab="logs"/);
  assert.match(html,/id="controlCompanyFilter"/);
  assert.match(html,/superAdminConsole/);
  assert.match(html,/UYGULAMA YÖNETİMİ/);
  assert.match(app,/super-admin-security/);
  assert.match(app,/scopeType==="SYSTEM"/);
  assert.match(html,/data-system-only/);
  assert.match(control,/auth\/push\/device\/control-center/);
  assert.match(control,/companySlug=/);
});
test("mobile session close requires local unlock and signed control proof",()=>{
  assert.match(control,/confirmLocalUnlock/);
  assert.match(control,/KYERP-MOBILE-CONTROL-V1/);
  assert.match(control,/SESSION_CLOSE/);
  assert.match(control,/Oturumu Kapat/);
});

test("mobile security refresh is event driven without short interval polling",()=>{
  assert.doesNotMatch(actions,/setInterval/);
  assert.doesNotMatch(control,/setInterval/);
  assert.match(control,/visibilitychange/);
  assert.match(control,/KYERP_SECURITY_PUSH_WAKE/);
  assert.match(sw,/KYERP_SECURITY_PUSH_WAKE/);
  assert.match(sw,/kyerp-security-static/);
});

test("mobile control runtime files stay JavaScript syntax valid",()=>{
  assert.doesNotThrow(()=>new Function(control));
  assert.doesNotThrow(()=>new Function(actions));
});
