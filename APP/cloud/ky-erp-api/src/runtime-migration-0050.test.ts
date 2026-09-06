import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mailCommunication0050Contract } from "./runtime-migration-0050.ts";

test("0050 runtime contract covers the complete canonical Mail Core schema", () => {
  assert.equal(mailCommunication0050Contract.tables.length, 22);
  assert.equal(mailCommunication0050Contract.indexes.length, 17);
  for (const name of [
    "mail_provider_configs","mail_accounts","mail_account_credentials","mail_oauth_states",
    "mail_account_members","mail_account_scopes","mail_folders","mail_threads","mail_messages",
    "mail_recipients","mail_attachments","mail_relations","mail_sync_cursors","mail_drafts",
    "mail_send_jobs","mail_templates","mail_approval_requests","mail_approval_steps",
    "mail_ai_drafts","mail_audit_log","system_mail_providers","system_mail_events"
  ]) {
    assert.ok(mailCommunication0050Contract.tables.some((row) => row.name === name), name);
  }
});

test("0050 SQL stays additive-only", () => {
  const sql = readFileSync(new URL("../migrations/0050_mail_communication_core.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mail_accounts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mail_messages/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS system_mail_events/);
  assert.doesNotMatch(sql, /\bDROP\b|\bALTER\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\b/i);
});

test("0050 runtime gate is fail-closed on partial schema or index drift", () => {
  const source = readFileSync(new URL("./runtime-migration-0050.ts", import.meta.url), "utf8");
  assert.match(source, /MIGRATION_0050_PARTIAL_SCHEMA/);
  assert.match(source, /MIGRATION_0050_PARTIAL_INDEX/);
  assert.match(source, /MIGRATION_0050_VERIFY_TABLE_MISSING/);
  assert.match(source, /MIGRATION_0050_VERIFY_INDEX_MISSING/);
  assert.match(source, /await db\.batch\(statements\)/);
});


test("Mail routes activate 0050 readiness without exposing a global migration endpoint", () => {
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert.match(main, /import \{ ensureMailCommunicationCore0050 \} from "\.\/runtime-migration-0050";/);
  assert.match(main, /shell\.use\("\/api\/mail\/\*", async \(c, next\) => \{/);
  assert.match(main, /await ensureMailCommunicationCore0050\(c\.env\.DB\)/);
  assert.doesNotMatch(main, /shell\.use\("\/api\/\*", async \(c, next\) => \{\s*await ensureMailCommunicationCore0050/);
});
