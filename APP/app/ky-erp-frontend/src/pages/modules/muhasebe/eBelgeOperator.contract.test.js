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

// Corporate labels: preserve existing route keys and align base, active registry, and page title.
test("e-Belge kurumsal menü adları iki kayıt katmanında ve çalışma ekranında tutarlıdır",()=>{
 const nav=read("../../../app/moduleRegistry.js"),base=read("../../../app/moduleRegistryBase.js"),center=read("./EBelgeCenterPage.jsx");
 for(const [key,label] of [["genel-bakis","Genel Bakış"],["gelen-faturalar","Gelen Faturalar"],["okunmamis-faturalar","Okunmamış Faturalar"],["giden-faturalar","Giden Faturalar"],["fatura-taslaklari","Fatura Taslakları"],["gelen-irsaliyeler","Gelen İrsaliyeler"],["okunmamis-irsaliyeler","Okunmamış İrsaliyeler"],["giden-irsaliyeler","Giden İrsaliyeler"],["irsaliye-taslaklari","İrsaliye Taslakları"],["belgeleri-al","Belge Aktarımı"],["belge-havuzu","Belge Havuzu"],["eslestirmeler","Belge Eşleştirme"],["onay-sorunlar","Belge Kontrol ve Onay"],["is-akislari","Sevk ve Faturalandırma"],["arsiv-cikti","Belge Arşivi ve Çıktılar"],["gorsel-sablonlar","Belge Şablonları"],["entegrasyonlar","Entegrasyon Yönetimi"]]){
  for(const source of [nav,base])assert.ok(source.includes(JSON.stringify(key)+", "+JSON.stringify(label)),key);
  assert.ok(center.includes(JSON.stringify(label)),label);
 }
 assert.doesNotMatch(center,/> Belgeleri Al<\/button>/);
});

test("REV3 quick command and create hub use canonical routes, never provider send",()=>{const app=read("../../../AppV3.jsx"),nav=read("../../../app/moduleRegistry.js"),center=read("./EBelgeCenterPage.jsx"),smart=read("./EBelgeSmartWorkspace.jsx");for(const k of ["olustur","ai-center"]){assert.ok(app.includes(k));assert.ok(nav.includes(k));assert.ok(center.includes(k))}assert.match(smart,/operator-command\/prepare/);assert.match(smart,/saveDraft:save,id:key/);assert.doesNotMatch(smart,/SendInvoice|SendDespatch|\/send\b/);});
