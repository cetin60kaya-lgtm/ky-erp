import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");

test("e-Belge dashboard bugun sayacini sisteme alinma zamanindan uretir",()=>{
  assert.match(source,/date\(created_at\)=\?/);
  assert.match(source,/date\(COALESCE\(issue_date,created_at\)\) BETWEEN \? AND \?/);
});

test("e-Belge Tam Sil soft delete degil bagli kayitlari fiziksel temizler",()=>{
  assert.match(source,/app\.delete\("\/api\/e-belge\/documents\/:id"/);
  assert.match(source,/DELETE FROM accounting_documents WHERE id=\? AND main_company_slug=\?/);
  assert.match(source,/accounting_document_issues","accounting_document_taxes","accounting_document_lines/);
  assert.match(source,/DELETE FROM file_hub_relations/);
  assert.match(source,/POSTED_DELETE_BLOCKED/);
});
