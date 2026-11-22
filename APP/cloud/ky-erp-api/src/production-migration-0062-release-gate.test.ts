import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const workflow=readFileSync(resolve(process.cwd(),"../../../.github/workflows/worker-production-release.yml"),"utf8");
const migration=readFileSync(resolve(process.cwd(),"migrations/0062_accounting_physical_receipt_journal.sql"),"utf8");

test("0062 production migration yalniz ayri onayli hedefte calisabilir",()=>{
 for(const required of [
  "applyPhysical0062 == true","migrationApprovedByUser == true",
  'approvedMigrationId == "0062"',"applyMigrations == false",
  "if: steps.physical_0062_gate.outputs.apply == 'true'",
  "migrations/0062_accounting_physical_receipt_journal.sql"
 ])assert.ok(workflow.includes(required),required);
});
test("0062 once Time Travel ve bagimsiz gizli yedek gerektirir; Github artifact YASAK",()=>{
 const pre=workflow.indexOf("- name: Cloudflare D1 Time Travel geri donus noktasini dogrula");
 const gate=workflow.indexOf("- name: 0062 fiziksel journal icin tek-hedef user onay kapisi");
 const apply=workflow.indexOf("- name: Sadece 0062 D1 fiziksel journal migration ve salt-okunur kanit");
 assert.ok(pre>0&&gate>pre&&apply>gate);
 assert.ok(workflow.includes("D1_TIME_TRAVEL_READY"));
 assert.ok(workflow.includes("KYERP_EXTERNAL_BACKUP_VERIFIED"));
 assert.ok(!workflow.includes("upload-artifact"));
 assert.ok(!workflow.includes("wrangler d1 export"));
 assert.ok(workflow.includes("journal_tables == 2 and .journal_indexes == 4 and .capacity_trigger == 1"));
});
test("0062 schema additive, yalniz fiziksel journal objeleri",()=>{
 assert.doesNotMatch(migration,/^\s*(DROP|DELETE|UPDATE|INSERT|ALTER|REPLACE|TRUNCATE)\s/mi);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS accounting_physical_operations/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS accounting_provisional_reconciliations/);
 assert.match(migration,/CREATE TRIGGER IF NOT EXISTS trg_accounting_physical_cost_capacity/);
});
