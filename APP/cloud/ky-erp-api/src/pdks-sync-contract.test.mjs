import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./pdks-sync.ts", import.meta.url);
const migrationUrl = new URL("../migrations/0003_pdks_sync.sql", import.meta.url);

test("PDKS sync routes require injected canonical session authorizer", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /PdksSyncAuthorizer/);
  assert.match(source, /if \(!principal\).*UNAUTHORIZED/);
  assert.match(source, /permissions\.includes\("PDKS_SYNC"\)/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /INSERT OR IGNORE INTO pdks_sync_events/);
});

test("PDKS sync migration is additive and tenant scoped", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pdks_sync_events/i);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(sql, /tenant_id TEXT NOT NULL/i);
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
});
