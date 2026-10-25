import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/ky-erp-frontend/public");
const file = (path: string) => readFileSync(resolve(publicRoot, path), "utf8");

test("KY Guvenlik is a single preserved owner PWA; company PWA remains separate", () => {
  const o = JSON.parse(file("guvenlik/manifest.webmanifest"));
  const c = JSON.parse(file("ky-firma/manifest.webmanifest"));
  assert.equal(o.id, "/guvenlik/");
  assert.equal(o.scope, "/guvenlik/");
  assert.equal(o.start_url, "/guvenlik/");
  assert.equal(c.id, "/ky-firma/");
  assert.notEqual(o.id, c.id);
  assert.equal(existsSync(resolve(publicRoot, "ky-sistem")), false);
  assert.equal(existsSync(resolve(publicRoot, "owner-security")), false);
  assert.match(file("guvenlik/index.html"), /id="superAdminConsole"/);
  assert.match(file("ky-firma/index.html"), /data-kind="COMPANY"/);
});

test("company app is fail-closed to company scope and device local unlock", () => {
  const s = file("ky-app-shell/app.js");
  assert.match(s, /companyApprover===true/);
  assert.match(s, /scopeType==="COMPANY"/);
  assert.doesNotMatch(s, /ownerControlAuthorized|hasOwner\(/);
  assert.match(s, /if\(!device\?\.localUnlockCredentialId\)throw/);
  assert.match(s, /userVerification:"required"/);
  assert.match(s, /KYERP-DEVICE-AUTH-V1/);
  assert.match(s, /KYERP-DECISION-V2/);
  assert.match(s, /KYERP-MOBILE-CONTROL-V1/);
  assert.match(s, /indexedDB\.open/);
});

test("each PWA has its own service worker and never resets existing device data", () => {
  const s = file("ky-app-shell/app.js");
  assert.match(s, /navigator\.serviceWorker\.register/);
  assert.match(s, /kyerp-security-fresh-v3/);
  assert.doesNotMatch(s, /indexedDB\.deleteDatabase|delete\("active"\)/);
  assert.match(file("ky-firma/sw.js"), /const HOME="\/ky-firma\/"/);
  assert.match(file("guvenlik/sw.js"), /const APP_URL="\/guvenlik\/"/);
});

test("all critical actions fail closed without device unlock", () => {
  assert.doesNotMatch(file("guvenlik/security-actions.js"), /if\(!device\?\.localUnlockCredentialId\)return true/);
  assert.match(file("guvenlik/security-actions.js"), /if\(!device\?\.localUnlockCredentialId\)throw/);
});

test("security host publishes only canonical owner and company assets", () => {
  const worker = readFileSync(resolve(publicRoot, "../../../cloud/ky-erp-security-host/worker.js"), "utf8");
  const cfg = readFileSync(resolve(publicRoot, "../../../cloud/ky-erp-security-host/wrangler.jsonc"), "utf8");
  assert.match(worker, /ADDITIONAL_APPS=\["\/ky-firma"\]/);
  assert.match(worker, /SHARED_ASSET_PREFIX="\/ky-app-shell"/);
  assert.match(worker, /isAppPath\(url.pathname\)/);
  assert.match(worker, /LEGACY_PREFIXES/);
  assert.match(worker, /Service-Worker-Allowed/);
  assert.match(cfg, /"directory": "\.\/\.security-assets"/);
});

test("owner approves signed critical actions; company page never shows owner action panel", () => {
  const app = file("guvenlik/app.js");
  const actions = file("guvenlik/security-actions.js");
  assert.match(app, /ownerControlAuthorized===true/);
  assert.match(actions, /SECURITY_ACTION/);
  assert.match(actions, /await saConfirmLocalUnlock/);
  assert.match(file("guvenlik/index.html"), /id="criticalList"|id="criticalPanel"|security-actions/);
  assert.doesNotMatch(file("ky-firma/index.html"), /id="criticalList"/);
});
