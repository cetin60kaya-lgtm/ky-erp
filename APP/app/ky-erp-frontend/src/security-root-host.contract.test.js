import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../../../..");
const host=readFileSync(resolve(root,"APP/cloud/ky-erp-security-host/worker.js"),"utf8");

test("security host keeps /ky-guvenlik launch compatibility over /guvenlik source",()=>{
  assert.match(host,/const SOURCE_PREFIX="\/guvenlik"/);
  assert.match(host,/const PRIMARY_PREFIX="\/ky-guvenlik"/);
  assert.match(host,/COMPAT_PREFIXES=\[PRIMARY_PREFIX,SOURCE_PREFIX\]/);
  assert.match(host,/X-KYERP-Security-App","fresh-v3-compat"/);
  assert.match(host,/return proxyScoped\(request,url,prefix,env\)/);
});

test("only obsolete security URLs are retired",()=>{
  assert.match(host,/LEGACY_PREFIXES=\["\/security","\/ky-guvenlik-recover"\]/);
  assert.match(host,/RETIRE_SW/);
  assert.match(host,/self\.registration\.unregister/);
  assert.match(host,/return new Response\("Gone",\{status:410/);
});

test("retired root service workers redirect navigation to the compatibility launch",()=>{
  const retired=host.match(/const RETIRE_SW=`([\s\S]*?)`;/)?.[1]||"";
  assert.match(retired,/addEventListener\("fetch"/);
  assert.match(retired,/TARGET="\/ky-guvenlik\/"/);
  assert.match(retired,/Response\.redirect\(new URL\(TARGET,self\.location\.origin\),308\)/);
});
