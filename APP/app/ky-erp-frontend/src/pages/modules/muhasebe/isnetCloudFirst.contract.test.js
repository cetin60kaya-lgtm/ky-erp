import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("./EBelgeIsnetPortalSync.jsx", import.meta.url),"utf8");
const manager = readFileSync(new URL("./EBelgeAdapterManager.jsx", import.meta.url),"utf8");

test("İşNet tek ekran yalnız Worker cloud readiness ve Drive bağlantısını yoklar",()=>{
  assert.match(screen,/apiGet\("\/isnet\/cloud-readiness"/);
  assert.match(screen,/apiGet\("\/file-hub\/cloud\/tenant-readiness"/);
  assert.match(screen,/apiConnected/);
  assert.match(screen,/eDocumentBindingCount|storageLabel/);
  assert.match(screen,/FILE_HUB_CLOUD_API|Google Drive/);
  assert.doesNotMatch(screen,/127\.0\.0\.1|8791|LOCAL_ARCHIVE_URL|<iframe/);
});
test("Resmî API ve Drive kontrolü kullanıcıya aynı sayfadan erişir",()=>{
  assert.match(screen,/API Bağlantısını Kur \/ Kontrol Et/);
  assert.match(screen,/onOpenSettings\?\.\(\)/);
  assert.match(screen,/\/depolama\/depolama-kaynaklar/);
  assert.match(manager,/onOpenSettings=\{\(\)=>setPanel\("connection"\)\}/);
  assert.match(manager,/hideConnection=\{false\}/);
});
test("İlk kabul olmadan resmi gönderim veya bulut aktarıldı iddiası yok",()=>{
  assert.match(screen,/belge kabul testi gerekli/);
  assert.match(screen,/İlk doğrulamadan önce otomatik fatura kesme\/gönderme yapılmaz/);
  assert.doesNotMatch(screen,/submitOfficialInvoice|apiPost\("/);
});
