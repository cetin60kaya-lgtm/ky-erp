import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../../../..");
const host=readFileSync(resolve(root,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");

test("security host serves only the fresh /guvenlik PWA",()=>{
  assert.match(host,/const APP_PREFIX="\/guvenlik"/);
  assert.match(host,/const APP_URL="\/guvenlik\/"/);
  assert.match(host,/X-KYERP-Security-App","fresh-v3"/);
  assert.match(host,/url\.pathname===APP_URL/);
});

test("old security URLs are retired",()=>{
  assert.match(host,/LEGACY_PREFIXES=\["\/security","\/ky-guvenlik","\/ky-guvenlik-recover"\]/);
  assert.match(host,/RETIRE_SW/);
  assert.match(host,/self\.registration\.unregister/);
  assert.match(host,/return new Response\("Gone",\{status:410/);
});

test("legacy service workers never intercept navigation",()=>{
  const retired=host.match(/const RETIRE_SW=`([\s\S]*?)`;/)?.[1]||"";
  assert.doesNotMatch(retired,/addEventListener\("fetch"/);
  assert.match(retired,/navigate\("\/guvenlik\/"\)/);
});