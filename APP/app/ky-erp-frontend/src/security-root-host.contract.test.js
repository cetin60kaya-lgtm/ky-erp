import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const host = readFileSync(resolve(repo, "APP/cloud/ky-erp-security-host/worker.js"), "utf8");

test("KY Security host exposes one root PWA identity", () => {
  assert.match(host, /id:\s*"\/"/);
  assert.match(host, /start_url:\s*"\/"/);
  assert.match(host, /scope:\s*"\/"/);
  assert.match(host, /X-KYERP-Security-App/);
  assert.match(host, /root-v3/);
});

test("legacy security paths retire into the root app without losing enrollment query", () => {
  assert.match(host, /isLegacyAppPath/);
  assert.match(host, /target\.pathname\s*=\s*"\/"/);
  assert.match(host, /Response\.redirect\(target\.toString\(\),\s*308\)/);
  assert.match(host, /RETIRE_LEGACY_SW/);
  assert.match(host, /self\.registration\.unregister/);
});

test("root app rewrites old ky-guvenlik asset references and keeps push worker at root scope", () => {
  assert.match(host, /replaceAll\("\/ky-guvenlik\/",\s*"\/"\)/);
  assert.match(host, /"\/sw\.js"/);
  assert.match(host, /Service-Worker-Allowed/);
  assert.doesNotMatch(host, /incoming\.pathname\s*===\s*"\/"[^\n]+ky-guvenlik[^\n]+Response\.redirect/);
});

test("security host never app-shell caches transformed responses", () => {
  assert.match(host, /Cache-Control",\s*"no-store/);
  assert.match(host, /CDN-Cache-Control",\s*"no-store/);
  assert.match(host, /cache:\s*"no-store"/);
});
