import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression contract for future manual cari postings. Does not touch D1.
const source = readFileSync(new URL("./accounting-current-write.ts", import.meta.url), "utf8");

test("yeni cari hareketi açılış bakiyesini ve hareket toplamını birlikte korur", () => {
  assert.match(
    source,
    /UPDATE companies SET current_balance=ROUND\(COALESCE\(opening_balance,0\)\+\(SELECT COALESCE\(SUM\(effect\),0\) FROM current_account_movements WHERE company_id=\? AND main_company_slug=\?\),2\)/
  );
});

test("cari toplam güncellemesi aynı firma ve ana firma sınırında yapılır", () => {
  assert.match(source, /updated_at=\? WHERE id=\? AND main_company_slug=\?/);
  assert.match(source, /FROM current_account_movements WHERE company_id=\? AND main_company_slug=\?/);
});

test("mükerrer cari isteği geçmiş kayıtları yeniden yazmaz", () => {
  assert.match(source, /if \(existing\) \{/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /db\.batch\(\[/);
});
