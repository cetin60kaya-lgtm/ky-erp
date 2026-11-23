import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("./accounting-dispatch-control-canonical.ts",import.meta.url),"utf8");
test("Gelen irsaliye rolünün kaynağı cari kartı; yön tek başına sınıflandırma yapmaz",()=>{
  assert.match(source,/LEFT JOIN companies c ON c.id=d.party_company_id/);
  assert.match(source,/role==="CUSTOMER"/);
  assert.match(source,/role==="SUPPLIER"/);
  assert.match(source,/role==="BOTH"/);
  assert.match(source,/UNCLASSIFIED/);
  assert.match(source,/d.direction='INCOMING'/);
  assert.match(source,/expectedDirection=group==="CUSTOMER"\?"OUTGOING"/);
});
test("Kesin faturalandırıldı yalnız ilişki, şirket/VKN ve uygun fatura yönüyle raporlanır",()=>{
  assert.match(source,/accounting_document_relations/);
  assert.match(source,/r.relation_type IN \('INVOICE_OF','DESPATCH_OF','DISPATCH_OF'\)/);
  assert.match(source,/sameCompany\|\|sameTax/);
  assert.match(source,/unique.length\?"INVOICE_LINKED":"INVOICE_LINK_MISSING"/);
  assert.match(source,/assertAccountingScope\(c\)/);
  assert.match(source,/app.get\("\/api\/muhasebe\/incoming-dispatches\/billing"/);
  assert.doesNotMatch(source,/app.post\("\/api\/muhasebe\/incoming-dispatches\/billing"/);
});
