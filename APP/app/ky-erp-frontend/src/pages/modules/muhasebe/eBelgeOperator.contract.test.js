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

test("REV3 mobile shares existing routes, draft actions and protected output",()=>{
 const manifest=JSON.parse(read("../../../../public/manifest.webmanifest")),pro=read("../../../pro/main.jsx"),css=read("./eBelgeOperator.css"),centerCss=read("./eBelgeCenter.css"),draft=read("./EBelgeDraftWorkspace.jsx");
 assert.equal(manifest.id,"/");assert.ok(manifest.shortcuts.some(x=>x.url==="/e-belge/genel-bakis"));assert.match(pro,/preferredKeys=\["muhasebe","e-belge"/);
 assert.match(css,/min-height:44px/);assert.match(css,/font-size:16px/);assert.match(css,/ebo-draft-table/);
 assert.match(centerCss,/span\[data-label\]::before/);assert.match(draft,/Taslak PDF İndir/);assert.match(draft,/action:"CANCEL"/);assert.match(draft,/Çoğalt/);
});

test("REV3 AI is explicit proposal only, not an automatic provider send",()=>{const smart=read("./EBelgeSmartWorkspace.jsx");assert.match(smart,/operator-policy/);assert.match(smart,/operator-command\/interpret/);assert.match(smart,/allowAi:true/);assert.match(smart,/requiresReview!==true/);assert.match(smart,/change\(aiSuggestion.command\)/);});

test("Dashboard never displays zero or empty records for failed requests; canonical tenant is verified",()=>{const s=read("./EBelgeCenterPage.jsx");assert.match(s,/canonicalCompanySlug\(activeMainCompany\)/);assert.match(s,/!dashboard\.verified/);assert.match(s,/İstek:/);assert.match(s,/Tekrar Dene/);});

test("REV3 overview uses four reference groups, unknown counters and exact drilldown",()=>{const s=read("./EBelgeRev3Overview.jsx"),c=read("./EBelgeCenterPage.jsx"),a=read("../../../AppV3.jsx");for(const label of ["e-Fatura","e-İrsaliye","e-Arşiv","KYERP Otomasyon Merkezi","Belge iş akışı"])assert.ok(s.includes(label));assert.match(s,/v==null\?"—"/);assert.match(s,/dashboardMetric:true/);assert.match(c,/officialOnly:true/);assert.match(a,/"earchive-out": "outgoing-archive"/);assert.match(c,/EBelgeRev3Overview/);});

test("REV3 File Hub inbox and document families route to existing canonical data",()=>{const nav=read("../../../app/moduleRegistry.js"),base=read("../../../app/moduleRegistryBase.js"),app=read("../../../AppV3.jsx"),center=read("./EBelgeCenterPage.jsx");for(const k of ["dosya-kutusu","earchive-drafts","earchive-cancel","other-docs","responses","send-queue","reports","directory","eksik-orijinaller"]){assert.ok(nav.includes(k));assert.ok(base.includes(k));assert.ok(app.includes(k))}assert.match(center,/EBelgeFileInbox/);assert.match(read("./EBelgeFileInbox.jsx"),/\/e-belge\/file-inbox/);assert.match(read("./EBelgeDraftWorkspace.jsx"),/state:stateFilter,family/);});
