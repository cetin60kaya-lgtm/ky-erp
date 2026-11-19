import test from "node:test";
import assert from "node:assert/strict";
import {invoiceMailDocumentFromFile,invoiceMailCommonModelIds,invoiceMailOutlookFileEvidence,invoiceMailDispatchKey,invoiceMailLegacyKeyPrefix,invoiceMailIsLegacyOrCanonicalKey,invoiceMailAttachmentProved} from "./invoice-mail-model-evidence.ts";
test("Exact document identities never accept neighboring invoice digits",()=>{
  assert.equal(invoiceMailDocumentFromFile("HKN2026000000989 (1).pdf","HKN"),"HKN2026000000989");
  assert.equal(invoiceMailDocumentFromFile("HKN20260000009890.pdf","HKN"),"HKN20260000009890");
  assert.equal(invoiceMailDocumentFromFile("HKN2026000000989.xml","HKN"),"");
  assert.equal(invoiceMailDocumentFromFile("DDM2026000000974.pdf","HKN"),"");
});
test("One invoice, three models and two dispatches: require HKN and at least one selected DDM",()=>{
  const rows=[{modelId:"A",assetId:"h"},{modelId:"B",assetId:"h"},{modelId:"C",assetId:"h"},{modelId:"D",assetId:"h"},
    {modelId:"A",assetId:"d1"},{modelId:"B",assetId:"d1"},{modelId:"C",assetId:"d2"},{modelId:"Z",assetId:"d2"}];
  assert.deepEqual(invoiceMailCommonModelIds(rows,"h",["d1","d2"]),["A","B","C"]);
  assert.deepEqual(invoiceMailCommonModelIds(rows,"h","d1"),["A","B"]);
  assert.deepEqual(invoiceMailCommonModelIds(rows,"h","unknown"),[]);
});
test("Outlook sent history accepts a single HKN with one or more DDM candidates but no extra HKN",()=>{
  const h=["HKN2026000000989"],d=["DDM2026000000974","DDM2026000000975"];
  assert.deepEqual(invoiceMailOutlookFileEvidence([h[0]+".pdf",d[0]+".pdf",d[1]+".pdf"],h,d),
    {invoiceNo:h[0],deliveryNo:d[0],deliveryNos:d});
  assert.equal(invoiceMailOutlookFileEvidence([h[0]+".pdf"],h,d),null);
  assert.equal(invoiceMailOutlookFileEvidence([h[0]+".pdf","HKN2026000000990.pdf",d[0]+".pdf"],[...h,"HKN2026000000990"],d),null);
  assert.equal(invoiceMailOutlookFileEvidence([h[0]+".pdf","DDM2026000000976.pdf"],h,d),null);
});
test("One HKN one send key regardless of how many DDMs; legacy key remains recognized",()=>{
  const t="mecit-hakan",h="HKN2026000000989",key="MODEL_INVOICE_MAIL:mecit-hakan:"+h;
  assert.equal(invoiceMailDispatchKey(t,h),key);
  assert.equal(invoiceMailLegacyKeyPrefix(t,h),key+":");
  assert.equal(invoiceMailIsLegacyOrCanonicalKey(key,t,h,["DDM2026000000974","DDM2026000000975"]),true);
  assert.equal(invoiceMailIsLegacyOrCanonicalKey(key+":DDM2026000000974",t,h,["DDM2026000000974"]),true);
  assert.equal(invoiceMailIsLegacyOrCanonicalKey(key+":DDM2026000000974",t,h,["DDM2026000000974","DDM2026000000975"]),false);
  assert.throws(()=>invoiceMailDispatchKey("",""));
});
test("Filename-only or different hash never upgrades historical sent-mail evidence",()=>{
  const h="a".repeat(64),other="b".repeat(64);
  const asset={id:"file-1",sha256:h,fileName:"HKN2026000000989.pdf"};
  assert.equal(invoiceMailAttachmentProved({fileName:asset.fileName,fileAssetId:"file-1",sha256:h},asset),true);
  assert.equal(invoiceMailAttachmentProved({fileName:asset.fileName,sha256:h},asset),false);
  assert.equal(invoiceMailAttachmentProved({fileName:asset.fileName,fileAssetId:"file-1",sha256:other},asset),false);
  assert.equal(invoiceMailAttachmentProved({fileName:"HKN2026000000990.pdf",fileAssetId:"file-1",sha256:h},asset),false);
});
