import test from "node:test";
import assert from "node:assert/strict";
import {splitDateWindows,runIsnetArchiveSync,safeArchiveStatus} from "./sync-core.mjs";

test("31 gün pencere yıl sonu dahil bölünür; geçersiz tarihler reddedilir",()=>{
  const windows=splitDateWindows("2026-11-01","2027-01-05");
  assert.deepEqual(windows,[
    {start:"2026-11-01",end:"2026-12-01"},
    {start:"2026-12-02",end:"2027-01-01"},
    {start:"2027-01-02",end:"2027-01-05"},
  ]);
  assert.throws(()=>splitDateWindows("2026-02-30","2026-03-01"),/TARIH_GECERSIZ/);
  assert.throws(()=>splitDateWindows("2026-11-21","2026-11-20"),/TARIH_SIRASI_GECERSIZ/);
});

test("dört yön tek kontrol, tekrar taramada dosya üstüne yazmama mantığı",async()=>{
  const scans=[];
  const a=await runIsnetArchiveSync({
    start:"2026-11-21",end:"2026-11-21",
    listDocuments:async(start,end,source)=>{scans.push(source);return [{sourceId:"123"}];},
    archiveDocument:async()=>({xmlSaved:true,pdfSaved:true,xmlReused:true,pdfReused:true,errors:[]}),
  });
  assert.equal(scans.length,4);
  assert.deepEqual(scans,["incoming_invoice","outgoing_invoice","incoming_dispatch","outgoing_dispatch"]);
  assert.equal(a.inspected,4);assert.equal(a.complete,4);assert.equal(a.alreadyArchived,4);
  assert.equal(a.status,"COMPLETE");
});

test("200 kayıt sınırında tarihler bölünür; aynı kaynak ID tekrar arşivlenmez",async()=>{
  const scans=[];const archived=[];
  const a=await runIsnetArchiveSync({
    start:"2026-11-20",end:"2026-11-21",sources:["incoming_invoice"],
    listDocuments:async(start,end)=>{scans.push([start,end]);if(start!==end)throw Object.assign(Error("200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN"),{safeCode:"200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN"});return [{sourceId:"123"}];},
    archiveDocument:async id=>{archived.push(id);return {xmlSaved:true,pdfSaved:true,xmlReused:false,pdfReused:false,errors:[]}},
  });
  assert.equal(scans.length,3);assert.equal(a.complete,1);assert.equal(archived.length,1);
  assert.equal(a.status,"COMPLETE");
});

test("aynı güne 200+ kayıt sığmazsa eksiksiz sayılmaz",async()=>{
  const a=await runIsnetArchiveSync({
    start:"2026-11-21",end:"2026-11-21",sources:["incoming_invoice"],
    listDocuments:async()=>{throw Object.assign(Error("200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN"),{safeCode:"200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN"})},
    archiveDocument:async()=>{throw Error("archive not expected")},
  });
  assert.equal(a.status,"NEEDS_REVIEW");assert.equal(a.saturatedDays,1);assert.equal(a.complete,0);
});

test("XML var, PDF farklı ya da eksik ise otomatik başarılı sayılmaz",async()=>{
  const result={xmlSaved:true,pdfSaved:false,xmlReused:true,pdfReused:false,errors:["PDF:ARŞİVDE_FARKLI_ORİJİNAL_VAR"]};
  assert.equal(safeArchiveStatus(result),"NEEDS_REVIEW");
  const a=await runIsnetArchiveSync({
    start:"2026-11-21",end:"2026-11-21",sources:["incoming_invoice"],
    listDocuments:async()=>[{sourceId:"123"}],archiveDocument:async()=>result,
  });
  assert.equal(a.status,"NEEDS_REVIEW");assert.equal(a.needsReview,1);assert.equal(a.xmlSaved,1);assert.equal(a.pdfSaved,0);
});

test("durdurma bayrağı işlem sınırında çalışır ve yeni türleri başlatmaz",async()=>{
  let stop=false;let count=0;
  const a=await runIsnetArchiveSync({
    start:"2026-11-21",end:"2026-11-21",
    listDocuments:async()=>[{sourceId:"1"},{sourceId:"2"}],
    archiveDocument:async()=>{count++;stop=true;return {xmlSaved:true,pdfSaved:true,errors:[]}},
    shouldStop:()=>stop,
  });
  assert.equal(count,1);assert.equal(a.stopped,true);assert.equal(a.status,"STOPPED");
});

test("portal belge listesi hatası rapora işlenir; arşive başarı yazılmaz",async()=>{
  const a=await runIsnetArchiveSync({
    start:"2026-11-21",end:"2026-11-21",sources:["incoming_invoice"],
    listDocuments:async()=>{throw Object.assign(Error("PORTAL_BAGLANTISI_HATASI"),{safeCode:"PORTAL_BAGLANTISI_HATASI"})},
    archiveDocument:async()=>{throw Error("unexpected")},
  });
  assert.equal(a.complete,0);assert.equal(a.failed,1);assert.equal(a.status,"NEEDS_REVIEW");
});
