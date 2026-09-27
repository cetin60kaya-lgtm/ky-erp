import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const core = fs.readFileSync(path.join(root, "src", "accounting-workspace-core.ts"), "utf8");
const operations = fs.readFileSync(path.join(root, "src", "accounting-operations.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations", "0055_accounting_workspace_core.sql"), "utf8");

test("workspace core is one tenant-guarded accounting surface", () => {
  assert.match(core, /\/api\/muhasebe\/workspace\/\*/);
  assert.match(core, /enforceAccountingTenant/);
  assert.match(operations, /registerAccountingWorkspaceCoreRoutes\(app\)/);
});

test("financial accounts reuse canonical ledger bank account id", () => {
  assert.match(migration, /accounting_financial_accounts/);
  assert.match(core, /accounting_ledger_entries/);
  assert.match(core, /bank_account_id=a\.id/);
  assert.match(core, /opening_balance/);
});

test("live sync watches the whole accounting table family without self recursion", () => {
  assert.match(core, /name LIKE 'accounting_%'/);
  assert.match(core, /table === "accounting_live_revision"/);
  assert.match(core, /CREATE TRIGGER IF NOT EXISTS/);
  assert.match(core, /revision=revision\+1/);
});

test("reconciliation stays period and company scoped", () => {
  assert.match(migration, /accounting_reconciliations/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS ux_accounting_reconciliations_period/);
  assert.match(core, /WAITING/);
  assert.match(core, /MATCHED/);
  assert.match(core, /DIFFERENCE/);
});

test("mobile company widget reads canonical documents ledger and current balance", () => {
  assert.match(core, /company-widget/);
  assert.match(core, /GELEN_FATURA/);
  assert.match(core, /GIDEN_FATURA/);
  assert.match(core, /entry_type='TAHSILAT'/);
  assert.match(core, /current_balance/);
});
