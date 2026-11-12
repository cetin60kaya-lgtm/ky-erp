import test from "node:test";
import assert from "node:assert/strict";
import { matchingPdfFiles, matchingRecipientRoutes, parseRecipientEmails, makeInvoiceMailContent } from "../pages/modules/muhasebe/invoiceMailRouting.js";

test("D1 Mail Core'da yanlış PDF veya kayıp dosya eklenmez", () => {
  const files=[
    {id:"good",file_name:"HKN2026000000909 OSTENES.pdf",status:"AVAILABLE"},
    {id:"other",file_name:"HKN20260000009099 OSTENES.pdf",status:"AVAILABLE"},
    {id:"missing",file_name:"HKN2026000000909 OSTENES.pdf",status:"MISSING"},
  ];
  assert.deepEqual(matchingPdfFiles(files,"HKN2026000000909","HKN").map(x=>x.id),["good"]);
  assert.deepEqual(matchingPdfFiles(files,"DDM2026000000909","DDM"),[]);
});
test("Alt gruplar ve planlamacı farklıysa alıcı kimliği kesin eşleşmez",()=>{
  const routes=[{id:1,groupCode:"165-6",plannerName:"Plan A"},{id:2,groupCode:"165-7",plannerName:"Plan B"}];
  assert.deepEqual(matchingRecipientRoutes(routes,"165-6","Plan B"),[]);
  assert.equal(matchingRecipientRoutes(routes,"165-6","Plan A").length,1);
});
test("Çok alıcı ve standart mail metni doğrudan kodla hazırlanır",()=>{
  assert.deepEqual(parseRecipientEmails("a@example.com,b@example.com"),["a@example.com","b@example.com"]);
  const draft=makeInvoiceMailContent("OSTENES","HKN2026000000909","DDM2026000000897");
  assert.ok(draft.bodyText.includes("DDM2026000000897"));
  assert.throws(()=>makeInvoiceMailContent("OSTENES","HKN2026000000909",""));
});
