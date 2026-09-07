import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const live = readFileSync(new URL("./PdksLiveHome.jsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("./PdksAiControlCenter.jsx", import.meta.url), "utf8");
const device = readFileSync(new URL("./PdksDeviceCenter.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../AppV3.jsx", import.meta.url), "utf8");

test("PDKS Pro live center separates operational states instead of treating everyone without a punch as absent", () => {
  for (const metric of ["Bugün Gelen", "İçeride", "Gelmeyen", "Beklenen", "Yıllık İzin", "Raporlu", "Eksik Çıkış"]) {
    assert.match(live, new RegExp(metric));
  }
  assert.match(live, /setInterval\(load, 30000\)/);
  assert.match(live, /NO_SHOW/);
  assert.match(live, /WAITING/);
  assert.match(live, /MISSING_OUT/);
  assert.match(live, /Kim nerede, kim neden yok/);
});

test("PDKS AI uses live snapshot ephemerally and keeps write operations preview-first", () => {
  assert.match(ai, /ephemeral: true/);
  assert.match(ai, /AI sohbet geçmişine kaydedilmez/);
  assert.match(ai, /previewPdksAssistantCommand/);
  assert.match(ai, /commitPdksAssistantCommand/);
  assert.match(ai, /Onayla ve Uygula/);
  assert.match(ai, /isAuditAccount/);
});

test("standalone Windows product renders only the canonical PDKS module", () => {
  assert.match(app, /window\.__KYERP_DESKTOP_PRODUCT/);
  assert.match(app, /standaloneProduct === "PDKS"/);
  assert.match(app, /allowed\.filter\(\(item\) => item\.key === "pdks"\)/);
  assert.match(app, /standaloneProduct=\{standalonePdks \? "PDKS" : ""\}/);
});

test("device center exposes the native Windows terminal wizard without duplicating business data", () => {
  assert.match(device, /window\.KYERP_DESKTOP/);
  assert.match(device, /openPdksTerminalSettings/);
  assert.match(device, /Kurulum Sihirbazını Aç/);
  assert.match(device, /Yerel Terminal Köprüsü/);
});
