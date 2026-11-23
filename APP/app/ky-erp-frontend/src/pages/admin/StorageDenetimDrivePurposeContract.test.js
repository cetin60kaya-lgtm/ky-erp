import assert from "node:assert/strict";
import test from "node:test";
import {
 STORAGE_DOCUMENT_TYPES,STORAGE_PURPOSES_BY_MODULE,storagePurposeLabel
} from "./StorageDocumentCatalog.js";
import {
 ARCHIVE_SECTIONS,ARCHIVE_DEFAULT_BINDINGS,archiveBindingFor
} from "./CompanyArchiveLayout.js";

const types=new Set(STORAGE_DOCUMENT_TYPES.map(x=>x[0]));
const purposeMap=new Map(ARCHIVE_DEFAULT_BINDINGS.filter(x=>x.moduleCode==="DENETIM").map(x=>[x.purposeCode,x.rootPath]));
const required={
 AUDIT_EVIDENCE:"Denetim Evrakları",
 AUDIT_REPORT:"Denetim Raporları ve CAPA",
 MSDS:"MSDS",TDS:"TDS",
 PERIODIC_MAINTENANCE:"Periyodik Bakımlar",
 PROCEDURE:"Prosedürler ve Talimatlar",
 DECLARATION:"Kimyasal Envanter ve Deklarasyonlar/Tedarikçi Deklarasyonları",
 INVENTORY:"Kimyasal Envanter ve Deklarasyonlar/Kimyasal Envanterler",
 ENVIRONMENT:"Çevre ve Emisyon",TRAINING:"Eğitimler ve Katılım Kayıtları",
 LOT_EVIDENCE:"LOT ve Reçete Kanıtları",
 SIGNED_ORIGINAL:"İmzalı Orijinaller ve Revizyonlar",
 OHS_DOCUMENT:"İSG ve Acil Durum",
 QUALITY:"Kalite ve Test Raporları"
};
test("Denetim File Hub ekranı tüm kanıt amaçlarını seçebilir",()=>{
 for(const [purpose,folder] of Object.entries(required)){
  assert.ok(types.has(purpose),`purpose type absent: ${purpose}`);
  assert.ok(STORAGE_PURPOSES_BY_MODULE.DENETIM.includes(purpose),`DENETIM binding missing: ${purpose}`);
  assert.ok(storagePurposeLabel(purpose)!==purpose,`purpose label missing: ${purpose}`);
  assert.equal(purposeMap.get(purpose),`DENETİM/${folder}`);
  assert.equal(archiveBindingFor("DENETIM",purpose)?.rootPath,`DENETİM/${folder}`);
 }
});
test("Marka alt klasörleri korunurken yeni denetim bölümleri de görünür",()=>{
 const denetim=ARCHIVE_SECTIONS.find(x=>x.key==="DENETIM");
 assert.ok(denetim);
 assert.ok(denetim.areas.some(x=>x.includes("LC Waikiki")));
 assert.ok(denetim.areas.some(x=>x.includes("FAMA")));
 assert.ok(denetim.areas.some(x=>x.includes("Disney")));
 assert.ok(denetim.areas.some(x=>x.includes("ZDHC")));
});
