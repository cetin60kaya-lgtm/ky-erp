import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,"index.ts"),"utf8");

test("KY PDKS web and native Capacitor endpoints use exact CORS allowlist",()=>{
  assert.match(source,/"https:\/\/app\.kyerp\.net"/);
  assert.match(source,/"capacitor:\/\/localhost"/);
  assert.match(source,/"https:\/\/localhost"/);
  assert.match(source,/origin: \(origin\) => \(ALLOWED_ORIGINS\.has\(origin\) \? origin : undefined\)/);
  assert.doesNotMatch(source,/origin:\s*"\*"/);
  assert.doesNotMatch(source,/origin:\s*\(\)\s*=>\s*"\*"/);
});
test("CORS never replaces PDKS authentication and audit scope guards",()=>{
  const guard=readFileSync(resolve(here,"ik-pdks-guard.ts"),"utf8");
  assert.match(guard,/auditPeriod/);
  assert.match(guard,/canView|isAllowed|safeStatic/);
  const operation=readFileSync(resolve(here,"ik-pdks-operations.ts"),"utf8");
  assert.match(operation,/requireFull/);
  assert.match(operation,/app\.get\("\/api\/ik\/personnel-control\/operations\/payroll"/);
});

test("PDKS masters GET never creates a shift, schema or a fabricated default record",()=>{
  const master=readFileSync(resolve(here,"ik-pdks-master.ts"),"utf8");
  const block=master.split('app.get("/api/ik/personnel-control/pdks-masters"')[1]
    ?.split('app.post("/api/ik/personnel-control/work-groups"')[0];
  assert.ok(block);
  assert.doesNotMatch(block,/ensureSchema|ensurePdksPolicySchema|ensureDefaultGroup|INSERT INTO/);
  assert.match(block,/sqlite_master/);
  assert.match(block,/PDKS_SCHEMA_NOT_READY/);
});
