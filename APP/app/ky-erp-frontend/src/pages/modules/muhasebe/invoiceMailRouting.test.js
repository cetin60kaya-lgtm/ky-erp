import test from "node:test";
import assert from "node:assert/strict";
import { documentKey, matchingPdfFiles, matchingRecipientRoutes, parseRecipientEmails, makeInvoiceMailContent } from "./invoiceMailRouting.js";

test("HKN ve DDM belgeleri numaraya göre eksiksiz ve kesin eşleşir", () => {
  const files = [
    { id:"a",file_name:"HKN2026000000909 OSTENES.pdf", status:"AVAILABLE" },
    { id:"b",file_name:"HKN20260000009099 OSTENES.pdf", status:"AVAILABLE" },
    { id:"c",file_name:"DDM2026000000897 OSTENES.pdf", status:"AVAILABLE" },
    { id:"d",file_name:"HKN2026000000909 OSTENES.pdf", status:"MISSING" },
    { id:"e",file_name:"HKN2026000000909 OSTENES.xml", status:"AVAILABLE" },
  ];
  assert.deepEqual(matchingPdfFiles(files,"HKN2026000000909","HKN").map(x=>x.id),["a"]);
  assert.deepEqual(matchingPdfFiles(files,"DDM2026000000897","DDM").map(x=>x.id),["c"]);
  assert.deepEqual(matchingPdfFiles(files,"HKN2026000000909","DDM"),[]);
  assert.equal(documentKey(" hkn 2026000000909 "), "HKN2026000000909");
});
test("165-6 ve 165-7 farklı alıcı profilleridir; tahminle karıştırılmaz", () => {
  const routes = [
    { id:"1",groupCode:"165-6",plannerName:"Emre",to:["first@example.com"] },
    { id:"2",groupCode:"165-7",plannerName:"Kıvanç",to:["second@example.com"] },
    { id:"3",groupCode:"165-6",plannerName:"Başka",to:["third@example.com"] },
  ];
  assert.deepEqual(matchingRecipientRoutes(routes,"165-6","Emre").map(x=>x.id),["1"]);
  assert.deepEqual(matchingRecipientRoutes(routes,"165-7","Emre"),[]);
  assert.equal(matchingRecipientRoutes(routes,"165-6").length,2);
});
test("Alıcılar doğrulanır, yinelenenler tekilleştirilir", () => {
  assert.deepEqual(parseRecipientEmails("a@example.com; A@EXAMPLE.com, b@example.com"),["a@example.com","b@example.com"]);
  assert.throws(()=>parseRecipientEmails("yanlis eposta"));
});
test("Mail metni yalnız kesin HKN/DDM ve modelden üretilir", () => {
  const draft=makeInvoiceMailContent("OSTENES","HKN2026000000909","DDM2026000000897");
  assert.match(draft.bodyText,/HKN2026000000909/);
  assert.match(draft.bodyText,/DDM2026000000897/);
  assert.throws(()=>makeInvoiceMailContent("OSTENES","HKN2026000000909",""));
});
