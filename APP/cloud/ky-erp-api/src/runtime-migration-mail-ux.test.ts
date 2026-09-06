import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("0051 is additive and Mail UX runtime only verifies readiness",()=>{
  const source=readFileSync(new URL("./runtime-migration-mail-ux.ts",import.meta.url),"utf8");
  const sql=readFileSync(new URL("../migrations/0051_mail_workspace_user_state.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS mail_message_user_state/);
  assert.match(sql,/CREATE INDEX IF NOT EXISTS idx_mail_message_user_state_pinned/);
  assert.doesNotMatch(sql,/\b(?:DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|ALTER\s+TABLE|TRUNCATE)\b/i);
  assert.match(sql,/UNIQUE\(main_company_slug,user_id,message_id\)/);
  assert.match(source,/MAIL_UX_SCHEMA_NOT_READY/);
  assert.match(source,/MAIL_UX_INDEX_NOT_READY/);
  assert.doesNotMatch(source,/CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(source,/CREATE INDEX IF NOT EXISTS/);
});
