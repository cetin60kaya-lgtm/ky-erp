import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow=readFileSync(resolve(process.cwd(),"../../../.github/workflows/worker-production-release.yml"),"utf8");
const migration=readFileSync(resolve(process.cwd(),"migrations/0062_accounting_physical_receipt_journal.sql"),"utf8");

test("0062 canli migration yalniz ayrica onayli hedeften calisabilir",()=>{
  assert.match(workflow,/applyPhysical0062 == true/);
  assert.match(workflow,/migrationApprovedByUser == true/);
  assert.match(workflow,/approvedMigrationId == "0062"/);
  assert.match(workflow,/applyMigrations == false/);
  assert.match(workflow,/if: steps\.physical_0062_gate\.outputs\.apply == 'true'/);
  assert.match(workflow,/migrations\/0062_accounting_physical_receipt_journal\.sql/);
});

test("0062 kesinlikle backup artifact'inden once calismaz",()=>{
  const backup=workflow.indexOf("- name: Canli D1 tam yedegini al");
  const artifact=workflow.indexOf("- name: D1 yedegini artifact olarak sakla");
  const gate=workflow.indexOf("- name: 0062 fiziksel journal icin tek-hedef user onay kapisi");
  const apply=workflow.indexOf("- name: Sadece 0062 D1 fiziksel journal migration ve salt-okunur kanit");
  assert.ok(backup>0 && artifact>backup && gate>artifact && apply>gate);
  assert.match(workflow,/test -n "\$\{D1_BACKUP:-\}" && test -s "\$D1_BACKUP"/);
  assert.match(workflow,/journal_tables == 2 and \.journal_indexes == 4 and \.capacity_trigger == 1/);
});

test("0062 schema additive, yalniz fiziksel journal objeleri",()=>{
  assert.doesNotMatch(migration,/^\s*(DROP|DELETE|UPDATE|INSERT|ALTER|REPLACE|TRUNCATE)\s/mi);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS accounting_physical_operations/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS accounting_provisional_reconciliations/);
  assert.match(migration,/CREATE TRIGGER IF NOT EXISTS trg_accounting_physical_cost_capacity/);
});
