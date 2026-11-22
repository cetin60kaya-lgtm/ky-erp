import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Kept in the Worker unit test glob (src/*.test.ts), never touches production D1.
const source = readFileSync(new URL("./accounting-current-write.ts", import.meta.url), "utf8");

test("new cari entry preserves opening balance and movement total", () => {
  assert.match(source, /UPDATE companies SET current_balance=ROUND\(COALESCE\(opening_balance,0\)\+\(SELECT COALESCE\(SUM\(effect\),0\) FROM current_account_movements WHERE company_id=\? AND main_company_slug=\?\),2\)/);
});

test("tenant boundaries and idempotency remain intact", () => {
  assert.match(source, /updated_at=\? WHERE id=\? AND main_company_slug=\?/);
  assert.match(source, /FROM current_account_movements WHERE company_id=\? AND main_company_slug=\?/);
  assert.match(source, /if \(existing\) \{/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /db\.batch\(\[/);
});
