import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0022_auth_same_browser_session_guard.sql"), "utf8");
const refresh = readFileSync(resolve(here, "auth-session-refresh.ts"), "utf8");

test("same-browser guard applies to every role through user + BROWSER identity", () => {
  assert.match(migration, /BEFORE INSERT ON auth_sessions/);
  assert.match(migration, /NEW\.device_label LIKE 'BROWSER:%'/);
  assert.match(migration, /s\.user_id = NEW\.user_id/);
  assert.match(migration, /s\.device_label = NEW\.device_label/);
  assert.match(migration, /s\.revoked_at IS NULL/);
  assert.match(migration, /s\.expires_at > NEW\.created_at/);
  assert.doesNotMatch(migration, /role_at_login\s*=/i);
});

test("same-browser replacement is auditable and does not globally revoke devices", () => {
  assert.match(migration, /SESSION_REPLACED_SAME_BROWSER/);
  assert.match(migration, /UPDATE auth_sessions/);
  assert.match(migration, /WHERE user_id = NEW\.user_id/);
  assert.match(migration, /device_label = NEW\.device_label/);
  assert.doesNotMatch(migration, /UPDATE auth_sessions\s+SET[\s\S]*WHERE user_id = NEW\.user_id\s*;/i);
});

test("silent refresh rotates the existing session row instead of inserting a competing browser session", () => {
  assert.match(refresh, /UPDATE auth_sessions/);
  assert.match(refresh, /SET token_hash=/);
  assert.match(refresh, /WHERE id=\?/);
  assert.doesNotMatch(refresh, /INSERT INTO auth_sessions/);
});
