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

test("Windows local planner freezes all 11 admin actions without RAW/TNF mutation",()=>{
  const planner=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedLocalActionPlanner.cs"),"utf8");
  const agent=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedSyncAgent.cs"),"utf8");
  for(const action of [
    "work-group","personnel-group","assign-work-group","assign-personnel-group",
    "service","assign-service","holiday","leave","advance","overtime","deduction"
  ]) assert.equal(planner.includes(`"${action}"`),true,`missing local plan action ${action}`);
  assert.match(planner,/TouchesAnnualTnf:\s*false/);
  assert.match(planner,/TouchesTerminalRaw:\s*false/);
  assert.match(planner,/ApplySupported:/);
  assert.equal(planner.includes('action is "personnel-group" or "holiday"'),true);
  assert.match(agent,/LOCAL_PLAN_FROZEN/);
  assert.match(agent,/LOCAL_PLAN_NOT_APPLY_READY/);
  assert.doesNotMatch(agent,/DELETE\s+FROM\s+GIRCIK|UPDATE\s+GIRCIK|INSERT\s+INTO\s+GIRCIK/i);
});

test("annual TNF store requires backup hash exact format and same-volume atomic replace",()=>{
  const store=readFileSync(resolve(here,"../../../pdks-unified/windows/AtomicTnfFileStore.cs"),"utf8");
  assert.match(store,/TNF_DUPLICATE_LINE/);
  assert.match(store,/TNF_LINE_FORMAT_INVALID/);
  assert.match(store,/TNF_LINE_YEAR_MISMATCH/);
  assert.match(store,/File\.Copy\(targetPath, backupPath/);
  assert.match(store,/File\.Move\(temp, targetPath, true\)/);
  assert.match(store,/SHA256\.HashDataAsync/);
  assert.match(store,/1,001/);
  assert.doesNotMatch(store,/GIRCIK|Firebird/i);
});

test("Windows replay journal and Cloud lease use strict source-proof contracts",()=>{
  const schema=readFileSync(resolve(here,"../migrations/0060_pdks_unified_command_ledger.sql"),"utf8");
  const agent=readFileSync(resolve(here,"ik-pdks-unified-agent.ts"),"utf8");
  const windows=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedSyncAgent.cs"),"utf8");
  const journal=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedJournalStore.cs"),"utf8");
  for (const token of ["ik_pdks_devices","secret_hash","active INTEGER"]) assert.equal(schema.includes(token),true);
  for (const token of ["PDKS_OUTBOX_LEASE_EXPIRED","PDKS_LOCAL_RECEIPT_PAYLOAD_MISMATCH","delivery_owner","lease_until"]) assert.equal(agent.includes(token),true);
  for (const token of ["SIGNED_ENVELOPE_BINDING_MISMATCH","SIGNED_LEASE_EXPIRED_OR_INVALID","LOCAL_RECEIPT_ACK_REPLAYED"]) assert.equal(windows.includes(token),true);
  for (const token of ["JOURNAL_REPLAY_CONFLICT","FileMode.CreateNew","JOURNAL_APPLIED_RECEIPT_CONFLICT"]) assert.equal(journal.includes(token),true);
});

test("local sidecar policy is two-action allowlisted and receipt is durable before Cloud ACK",()=>{
  const policy=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedLocalPolicyStore.cs"),"utf8");
  const agent=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedSyncAgent.cs"),"utf8");
  for(const operation of ["personnel-group","holiday"])
    assert.equal(policy.includes('"'+operation+'"'),true);
  assert.equal(policy.includes("LOCAL_POLICY_CONFLICT"),true);
  assert.equal(policy.includes("File.Move(temp,destination,false)"),true);
  assert.equal(agent.includes("SaveAppliedReceiptAsync(journalPath, localReceipt"),true);
  assert.equal(agent.includes('"ACKED"'),true);
  assert.equal(agent.includes("POLICY_MIRROR_AND_CLOUD_ACK_OK"),true);
});

test("Windows Agent loop has a single-process lock, heartbeat and conservative poll interval",()=>{
  const runner=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedAgentRunner.cs"),"utf8");
  const program=readFileSync(resolve(here,"../../../pdks-unified/windows/Program.cs"),"utf8");
  for(const value of ["FileShare.None","unified-agent-health.json","AGENT_ALREADY_RUNNING","Math.Clamp(minutes,5,60)"])
    assert.equal(runner.includes(value),true);
  assert.equal(program.includes("--agent-loop"),true);
  assert.equal(program.includes("--agent-loop-selftest"),true);
});

test("Cloud requires independently HMAC-signed local receipt for successful ACK",()=>{
  const cloud=readFileSync(resolve(here,"ik-pdks-unified-agent.ts"),"utf8");
  const agent=readFileSync(resolve(here,"../../../pdks-unified/windows/UnifiedSyncAgent.cs"),"utf8");
  assert.equal(cloud.includes("PDKS_LOCAL_RECEIPT_HMAC_INVALID"),true);
  assert.equal(cloud.includes("localReceiptHmac"),true);
  assert.equal(agent.includes("HMACSHA256(Encoding.UTF8.GetBytes(credential.SigningKey))"),true);
  assert.equal(agent.includes("localReceiptHmac"),true);
});
