import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("./ProductionControlCenterPageV2.jsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("./ProductionDirectEntryPanel.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../AppV3.jsx", import.meta.url), "utf8");

test("aktif imalat satırı detay açılmadan render edilebilir; null detail çökmeyi tetiklemez", () => {
  const i = page.indexOf("visibleRows.map((row)");
  assert.ok(i > 0, "her imalat satırı görünür sorgu verisinden render edilir");
  const tableRow = page.slice(i, page.indexOf("</tr>)}", i) + 7);
  assert.match(tableRow, /statusTone\(row\.legacyApproved \? "COMPLETED" : row\.status\)/);
  assert.match(tableRow, /row\.legacyApproved \? "Tamamlandı" : statusLabel\(row\.status\)/);
  assert.doesNotMatch(tableRow, /detail\.legacyApproved/);
});

test("dört iş ekranında yükleme-hata-boş durumları ayrılır ve eski satırlar karışmaz", () => {
  assert.match(page, /const queryKey = JSON\.stringify\(\[tenantKey, pool,/);
  assert.match(page, /visibleCenter = center\.__queryKey === queryKey \? center : listCache\.current\.get\(queryKey\)/);
  assert.match(page, /if \(ticket !== requestSeq\.current\) return/);
  assert.match(page, /!loading && dataReady && !visibleRows\.length/);
  assert.match(page, /isInitialLoad \? <tr>/);
  assert.match(page, /setListError\(/);
  assert.match(page, /Tekrar Yükle/);
  assert.doesNotMatch(page, /\(center\.rows \|\| \[\]\)\.map\(/);
  assert.doesNotMatch(page, /\[pool\][\s\S]{0,300}setCenter\(\{ rows: \[\], summary: \{\}, pagination: \{\} \}\)/);
});

test("üretim girişi penceresi seçenek eksikliğini bildirir ve yeniden yükler", () => {
  assert.match(page, /modalOpen=\{directEntryModalOpen\}/);
  assert.match(page, /onRefreshOptions=\{load\}/);
  assert.match(modal, /optionsLoading = false, onRefreshOptions/);
  assert.match(modal, /onRefreshOptions\?\.\(\)/);
  assert.match(modal, /Model ve makine listeleri yükleniyor/);
  assert.match(modal, /createPortal\(/);
});

test("ortak hata ekranı render hatasını sadece eski JavaScript sürümü diye adlandırmaz", () => {
  assert.match(app, /const chunkError = isDynamicImportError\(this\.state\.error\)/);
  assert.match(app, /chunkError \? "Uygulama sürümü değiştiği/);
});
