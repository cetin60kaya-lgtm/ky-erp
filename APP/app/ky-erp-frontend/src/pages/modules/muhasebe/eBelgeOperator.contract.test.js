import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("Ortak taslak ve belge alma yolları canonical modülde",()=>{
 const app=read("../../../AppV3.jsx"),registry=read("../../../app/moduleRegistry.js"),center=read("./EBelgeCenterPage.jsx");
 for(const key of ["belgeleri-al","fatura-taslaklari","irsaliye-taslaklari"]){assert.ok(app.includes(key));assert.ok(registry.includes(key));assert.ok(center.includes(key))}
 assert.match(center,/mainCompanySlug,filter:effectiveFilter/);
 assert.match(center,/dashboardRequestSeq/);
});
test("Gerçek taslak ekranında TEST veya resmî gönderim çağrısı yok",()=>{
 const draft=read("./EBelgeDraftWorkspace.jsx");
 assert.match(draft,/operator-drafts/);
 assert.match(draft,/version:saved\?\.version/);
 assert.match(draft,/r\.draft\?\.id!==draftId/);
 assert.match(draft,/disabled title="UBL/);
 assert.doesNotMatch(draft,/isnet-test|SendInvoice|SendDespatch/);
});
