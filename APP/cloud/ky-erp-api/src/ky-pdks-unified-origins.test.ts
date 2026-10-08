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
  const guard=readFileSync(resolve(here,"ik-pdks-guard.ts"),"utf8");
  assert.match(guard,/registerIkPdksOperationRoutes\(app\)/);
  assert.match(guard,/registerIkPdksAdjustmentRoutes\(app\)/);
  assert.doesNotMatch(main,/registerIkPdksOperationRoutes\(app\)/);
  assert.doesNotMatch(main,/registerIkPdksAdjustmentRoutes\(app\)/);
  assert.match(main,/registerIkPdksUnifiedCommandRoutes\(app\)/);
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


test("new unified commands have an atomic four-record D1 write contract",()=>{
  const gateway=readFileSync(resolve(here,"ik-pdks-unified-commands.ts"),"utf8");
  assert.match(gateway,/registerIkPdksUnifiedCommandRoutes/);
  assert.match(gateway,/await db\.batch\(statements\)/);
  assert.match(gateway,/ik_pdks_unified_commands/);
  assert.match(gateway,/ik_pdks_unified_outbox/);
  assert.match(gateway,/ik_audit_logs/);
  assert.match(gateway,/payload_sha256/);
  assert.match(gateway,/PDKS_IDEMPOTENCY_CONFLICT/);
  assert.match(gateway,/PDKS_BATCH_ROLLED_BACK/);
  assert.match(gateway,/pdksCompany/);
  const guard=readFileSync(resolve(here,"ik-pdks-guard.ts"),"utf8");
  assert.match(guard,/enforcePdksTenantAndPermission/);
  assert.match(guard,/c as any\)\.set\?\.\("pdksCompany"/);
  const migration=readFileSync(resolve(here,"../migrations/0060_pdks_unified_command_ledger.sql"),"utf8");
  assert.match(migration,/UNIQUE\(main_company_id,actor_user_id,request_id\)/);
  assert.match(migration,/FOREIGN KEY\(command_id\)/);
});
test("D1 GET and POST never silently provision command or receipt tables",()=>{
  const command=readFileSync(resolve(here,"ik-pdks-unified-commands.ts"),"utf8");
  assert.doesNotMatch(command,/CREATE TABLE|DROP TABLE|DELETE FROM ik_pdks/);
  assert.match(command,/PDKS_MIGRATION_0060_REQUIRED/);
  const worker=readFileSync(resolve(here,"main.ts"),"utf8");
  assert.match(worker,/registerIkPdksUnifiedCommandRoutes\(app\)/);
});

test("Windows Agent unified outbox uses signed lease + fail-closed local receipt ACK",()=>{
  const main=readFileSync(resolve(here,"main.ts"),"utf8");
  const agent=readFileSync(resolve(here,"ik-pdks-unified-agent.ts"),"utf8");
  assert.match(main,/registerIkPdksUnifiedAgentRoutes\(app\)/);
  assert.match(agent,/\/api\/auth\/pdks-unified\/outbox\/next/);
  assert.match(agent,/\/api\/auth\/pdks-unified\/outbox\/:id\/ack/);
  assert.match(agent,/HMAC-SHA256/);
  assert.match(agent,/KY_PDKS_UNIFIED_SYNC_KEY/);
  assert.match(agent,/state='CLAIMED'/);
  assert.match(agent,/PDKS_LOCAL_RECEIPT_INVALID/);
  assert.match(agent,/fdbValidated/);
  assert.match(agent,/tnfTouched/);
  assert.doesNotMatch(agent,/CREATE TABLE|DROP TABLE/);
  const command=readFileSync(resolve(here,"ik-pdks-unified-commands.ts"),"utf8");
  assert.match(command,/commandData:p/);
  assert.match(command,/localCardNo/);
  assert.doesNotMatch(command,/@ts-nocheck/);
});
