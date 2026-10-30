import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src=readFileSync(new URL("./accounting-company-safe-delete.ts",import.meta.url),"utf8");
test("Birleştir yalnız yöneticide, kaynak boşa eşitken ve hedef aktifken",()=>{
 assert.match(src,/merge-preview/); assert.match(src,/\/merge"/);
 assert.match(src,/await manager\(c, slug\)/);
 assert.match(src,/source\.canHardDelete && target\.isActive/);
 assert.match(src,/MERGE_LINKED_BLOCKED/);
 assert.match(src,/confirmSourceId/);assert.match(src,/confirmTargetId/);
 assert.match(src,/expectedSourceUpdatedAt/);
 assert.match(src,/expectedTargetUpdatedAt/);
 assert.match(src,/BIRLESTIR/);
});
test("Birleştirme sadece boş firma ve aliası taşır; mali belge veya model silmez",()=>{
 assert.match(src,/UPDATE company_aliases SET company_id/);
 assert.match(src,/DELETE FROM companies WHERE/);
 assert.match(src,/c\.env\.DB\.batch\(actions\)/);
 assert.match(src,/financialRecordsMoved: 0/);
 assert.doesNotMatch(src,/DELETE FROM accounting_documents/);
 assert.doesNotMatch(src,/DELETE FROM current_account_movements/);
});
