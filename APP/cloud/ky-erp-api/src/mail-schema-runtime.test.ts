import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ensureMailCommunicationCore0050 } from "./runtime-migration-0050.ts";
import { ensureMailWorkspaceUx } from "./runtime-migration-mail-ux.ts";

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const core = migration("0050_mail_communication_core.sql");
const ux = migration("0051_mail_workspace_user_state.sql");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      assert.match(sql, /^(SELECT|PRAGMA)\b/, "readiness must never write D1");
      queries.push(sql);
      let values: any[] = [];
      return {
        bind(...args: any[]) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      };
    },
  } as unknown as D1Database;
  return { sqlite, db, queries };
}

test("0050 and 0051 are repeatable and readiness never writes or leaks across databases", async () => {
  const {sqlite, db, queries} = fixture();
  try {
    sqlite.exec(core + ux);
    sqlite.exec("INSERT INTO mail_accounts(id,main_company_slug,provider_type,email_address,display_name,created_at,updated_at) VALUES('local-mail','tenant-a','GMAIL','test@example.invalid','Preserved','2026-09-06','2026-09-06')");
    sqlite.exec(core + ux);
    assert.equal(sqlite.prepare("SELECT display_name FROM mail_accounts WHERE id='local-mail'").get()?.display_name, "Preserved");
    assert.equal((await ensureMailCommunicationCore0050(db)).state, "READY");
    assert.equal((await ensureMailWorkspaceUx(db)).state, "READY");
    const count = queries.length;
    await ensureMailCommunicationCore0050(db);
    await ensureMailWorkspaceUx(db);
    assert.equal(queries.length, count);
    const empty = fixture();
    try {
      await assert.rejects(ensureMailCommunicationCore0050(empty.db), /MIGRATION_0050_REQUIRED_TABLES/);
      await assert.rejects(ensureMailWorkspaceUx(empty.db), /MAIL_UX_SCHEMA_NOT_READY/);
    } finally { empty.sqlite.close(); }
  } finally { sqlite.close(); }
});

test("partial mail columns and index drift fail closed", async () => {
  const partial = fixture();
  try {
    partial.sqlite.exec("CREATE TABLE mail_accounts(id TEXT PRIMARY KEY)");
    await assert.rejects(ensureMailCommunicationCore0050(partial.db), /MIGRATION_0050_PARTIAL_SCHEMA:mail_accounts/);
  } finally { partial.sqlite.close(); }
  const drift = fixture();
  try {
    drift.sqlite.exec(core + ux);
    drift.sqlite.exec("DROP INDEX idx_mail_accounts_tenant_status; CREATE INDEX idx_mail_accounts_tenant_status ON mail_accounts(status)");
    await assert.rejects(ensureMailCommunicationCore0050(drift.db), /MIGRATION_0050_PARTIAL_INDEX/);
  } finally { drift.sqlite.close(); }
});
