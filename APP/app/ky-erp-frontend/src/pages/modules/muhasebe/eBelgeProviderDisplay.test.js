import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { providerDisplayStatus } from "./eBelgeProviderDisplay.js";
import { documentPageMeta } from "./documentPageMeta.js";

test("İşNet yalnız gerçek CONNECTED+connected=true durumunda bağlı görünür", () => {
  assert.deepEqual(providerDisplayStatus({ key: "ISNET", status: "CONNECTED", connected: true }), { active: true, label: "BAĞLI" });
  assert.equal(providerDisplayStatus({ key: "ISNET", status: "CONNECTED", connected: false }).active, false);
  assert.equal(providerDisplayStatus({ key: "ISNET", status: "CONFIGURED", connected: false }).label, "AYARLI · DOĞRULANMADI");
  assert.equal(providerDisplayStatus({ key: "ISNET", status: "READY_FOR_ADAPTER" }).active, false);
  assert.equal(providerDisplayStatus({ key: "ISNET", status: "SESSION_EXPIRED" }).label, "OTURUM SÜRESİ DOLMUŞ");
  assert.equal(providerDisplayStatus({ key: "ISNET", status: "UNVERIFIED" }).label, "DOĞRULANAMADI");
});
test("XML hazır ancak OCR yoksa OCR aktif gibi görünmez; taslak adaptör asla bağlı değildir", () => {
  assert.deepEqual(providerDisplayStatus({ key: "MANUAL", status: "XML_ACTIVE_OCR_NOT_CONFIGURED" }), { active: true, label: "YALNIZ XML HAZIR" });
  for (const key of ["PARASUT", "LOGO", "MIKRO"]) assert.deepEqual(providerDisplayStatus({ key, status: "READY_FOR_ADAPTER" }), { active:false, label:"ADAPTÖR BEKLİYOR" });
  assert.equal(providerDisplayStatus({ key: "MANUAL", status: "NO_CONNECTION" }).active, false);
});
test("0, 1, 50, 100, 101 belge ve son sayfa; filtreli total kaybolmaz", () => {
  const meta=(total,page)=>documentPageMeta({total,page,pageSize:50});
  assert.deepEqual([0,1,50,100,101].map(n=>meta(n,1).pageCount),[1,1,1,2,3]);
  assert.equal(meta(101,3).end,101);
  assert.equal(meta(101,3).hasNext,false);
  assert.equal(meta(100,2).start,51);
  assert.equal(meta(50,1).hasNext,false);
});
test("e-Belge tenant değişiminde liste kalıntısı ve provider sahte bağlantı engellenir", () => {
  const page=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
  assert.match(page,/providerDisplayStatus\(provider\)/);
  assert.match(page,/setPool\(\{ items: \[\], stats: \{\}, total: 0 \}\)/);
  assert.match(page,/setSelectedId\(""\)/);
  assert.match(page,/e-Belge için ana firma seçin/);
  assert.match(page,/Bitiş tarihi başlangıç tarihinden önce olamaz/);
  assert.doesNotMatch(page,/\/ACTIVE\|CONNECTED\|READY\|OK\//);
});
