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


test("production worker entrypoints register ALL live KY PDKS operations",()=>{
  const main=readFileSync(resolve(here,"main.ts"),"utf8");
  assert.match(main,/registerIkPdksOperationRoutes\(app\)/);
  assert.match(main,/registerIkPdksAdjustmentRoutes\(app\)/);
  const op=readFileSync(resolve(here,"ik-pdks-operations.ts"),"utf8");
  const extra=readFileSync(resolve(here,"ik-pdks-adjustments.ts"),"utf8");
  for(const path of [
    "/operations/month","/operations/leaves","/operations/leave",
    "/operations/advance","/operations/payroll","/operations/holidays",
    "/operations/audit-logs","/operations/period-close"
  ])assert.ok(op.includes(path),path+" API is not registered in handler");
  assert.ok(extra.includes("/operations/adjustment"));
  assert.match(op,/requireFull\(c/);
  assert.match(extra,/PDKS_AUDIT_READ_ONLY/);
});
test("every active worker security layer accepts EXACT KY web and Capacitor origins",()=>{
  for(const file of ["index.ts","main.ts","main-entry.ts","main-entry-security.ts"]){
    const source=readFileSync(resolve(here,file),"utf8");
    assert.match(source,/"https:\/\/app\.kyerp\.net"/,file);
    assert.match(source,/"capacitor:\/\/localhost"/,file);
    assert.match(source,/"https:\/\/localhost"/,file);
    assert.doesNotMatch(source,/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*["']/);
  }
});
