import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileEBelgeInvoice} from "./e-belge-match-engine.ts";

const invoice=(direction="INCOMING")=>({
  id:"invoice-1",documentNo:"INV-001",direction,partyTaxNo:"1234567890",
  issueDate:"2026-11-21",
  lines:[{id:"invoice-line-1",productCode:"BOYA-A",description:"Boya A",quantity:15,unitCode:"KGM"}],
});
const dispatch=(direction="INCOMING")=>({
  id:"dispatch-1",documentNo:"IRS-001",direction,partyTaxNo:"1234567890",
  issueDate:"2026-11-20",
  lines:[{id:"dispatch-line-1",productCode:"BOYA-A",description:"Boya A",quantity:15,unitCode:"KGM"}],
});

test("gelen fatura UBL irsaliye numarası, VKN, ürün ve miktarla eşleşir",()=>{
  const result=reconcileEBelgeInvoice(invoice(),[dispatch()],["IRS-001"]);
  assert.equal(result.status,"MATCHED");
  assert.equal(result.linkedDispatches.length,1);
  assert.equal(result.linkedDispatches[0].explicitReference,true);
  assert.equal(result.lines[0].dispatchedQuantity,15);
});

test("giden fatura ve giden irsaliye aynı kuralla eşleşir",()=>{
  const result=reconcileEBelgeInvoice(invoice("OUTGOING"),[dispatch("OUTGOING")],["IRS-001"]);
  assert.equal(result.status,"MATCHED");
});

test("başka firma/VKN, karşı yön veya eksik irsaliye bağlantı sayılmaz",()=>{
  assert.equal(reconcileEBelgeInvoice(invoice(),[{...dispatch(),partyTaxNo:"9876543210"}],["IRS-001"]).linkedDispatches.length,0);
  assert.equal(reconcileEBelgeInvoice(invoice(),[dispatch("OUTGOING")],["IRS-001"]).linkedDispatches.length,0);
  assert.equal(reconcileEBelgeInvoice(invoice(),[],["IRS-001"]).status,"MISMATCH");
});

test("ürün, birim ve miktar uyumsuzluğu otomatik TAM EŞLEŞTİ sayılmaz",()=>{
  const part={...dispatch(),lines:[{...dispatch().lines[0],quantity:8}]};
  assert.notEqual(reconcileEBelgeInvoice(invoice(),[part],["IRS-001"]).status,"MATCHED");
  const wrongUnit={...dispatch(),lines:[{...dispatch().lines[0],unitCode:"C62"}]};
  assert.notEqual(reconcileEBelgeInvoice(invoice(),[wrongUnit],["IRS-001"]).status,"MATCHED");
});

test("geç gelen irsaliye yalnız açık, aynı tenant/firma/yön faturalarını yeniden hesaplar",()=>{
  const cloud=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
  const ubl=readFileSync(new URL("./e-belge-ubl.ts",import.meta.url),"utf8");
  assert.match(ubl,/xmlBlocks\(xml, "DespatchDocumentReference"\)/);
  assert.match(cloud,/async function autoReconcileInvoicesAfterDispatch/);
  assert.match(cloud,/if\(isDispatch\(p\.documentType\)\)await autoReconcileInvoicesAfterDispatch/);
  assert.match(cloud,/posted_at IS NULL/);
  assert.match(cloud,/party_company_id=\?/);
  assert.match(cloud,/party_tax_no=\?/);
  assert.match(cloud,/await reconcileOne\(c,slug,text\(invoice\.id\)\)/);
  assert.match(cloud,/relation_type='INVOICE_OF'/);
});
