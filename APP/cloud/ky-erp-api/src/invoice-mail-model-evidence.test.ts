import test from "node:test";
import assert from "node:assert/strict";
import {invoiceMailDocumentFromFile,invoiceMailCommonModelIds,invoiceMailOutlookFileEvidence} from "./invoice-mail-model-evidence.ts";
test("exact HKN/DDM filenames, not similar numbers or other attachments",()=>{
 assert.equal(invoiceMailDocumentFromFile("HKN2026000000989.pdf","HKN"),"HKN2026000000989");
 assert.equal(invoiceMailDocumentFromFile("HKN2026000000989 (1).PDF","HKN"),"HKN2026000000989");
 assert.equal(invoiceMailDocumentFromFile("HKN20260000009890.pdf","HKN"),"HKN20260000009890");
 assert.equal(invoiceMailDocumentFromFile("HKN2026000000989.xml","HKN"),"");
 assert.equal(invoiceMailDocumentFromFile("DDM2026000000974.pdf","HKN"),"");
});
test("one HKN can link many models but only models related to both PDFs",()=>{
 const r=[{modelId:"A",assetId:"h"},{modelId:"B",assetId:"h"},{modelId:"C",assetId:"h"},{modelId:"A",assetId:"d"},{modelId:"B",assetId:"d"}];
 assert.deepEqual(invoiceMailCommonModelIds(r,"h","d"),["A","B"]);
 assert.deepEqual(invoiceMailCommonModelIds(r,"h","other"),[]);
});
test("manually sent Outlook mail requires exactly one known HKN and DDM attachment",()=>{
 const hkn=["HKN2026000000989"],ddm=["DDM2026000000974"];
 assert.deepEqual(invoiceMailOutlookFileEvidence(["HKN2026000000989.pdf","DDM2026000000974.pdf"],hkn,ddm),{invoiceNo:hkn[0],deliveryNo:ddm[0]});
 assert.equal(invoiceMailOutlookFileEvidence(["HKN2026000000989.pdf"],hkn,ddm),null);
 assert.equal(invoiceMailOutlookFileEvidence(["HKN2026000000989.pdf","DDM2026000000975.pdf"],hkn,ddm),null);
 assert.equal(invoiceMailOutlookFileEvidence(["HKN2026000000989.pdf","HKN2026000000990.pdf","DDM2026000000974.pdf"],[...hkn,"HKN2026000000990"],ddm),null);
});
