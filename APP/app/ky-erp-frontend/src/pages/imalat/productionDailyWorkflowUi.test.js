import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODULES } from "../../app/moduleRegistryBase.js";
import { availableProductionRegions, filterProductionModels } from "./productionDirectEntryOptions.js";

const src = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const center = src("./ProductionControlCenterPageV2.jsx");
const entry = src("./ProductionDirectEntryPanel.jsx");
const settings = src("./ProductionSettingsPage.jsx");
const report = src("./ImalatKontrolRapor.jsx");

test("İmalat ana menü dört gerçek operasyon ekranı; rapor ve makine ayarı ayrı", () => {
  const imalat = MODULES.find((item) => item.key === "uretim");
  assert.ok(imalat);
  assert.deepEqual(imalat.groups[0].tabs.map(([id]) => id),
    ["uretim-merkezi", "irsaliye-bekleyen", "uretim-tamamlanan", "fatura-kontrol"]);
  assert.deepEqual(imalat.groups[1].tabs.map(([id]) => id),
    ["uretim-raporlari", "uretim-gecmis-arsiv"]);
  assert.match(center, /const WORKFLOW = \{/);
  for (const name of ["IMALATTA", "IRSALIYE", "TAMAMLANAN", "FATURA", "ARSIV"]) {
    assert.ok(center.includes(name + ": {"), name);
  }
});

test("Her havuz amacına uygun ve gerçek menü rotasına giden işlemi gösterir", () => {
  assert.match(center, /href="\/e-belge\/eslestirmeler"/);
  assert.match(center, /href="\/e-belge\/giden-belgeler"/);
  assert.match(center, /href="\/uretim\/uretim-raporlari"/);
  assert.match(center, /pool === "IMALATTA" \? <button className="primary"/);
  assert.match(center, /pool === "IRSALIYE" \? <a href="\/e-belge\/eslestirmeler"/);
  assert.match(center, /pool === "FATURA" \? <a href="\/e-belge\/giden-belgeler"/);
  assert.match(center, /pool === "ARSIV" \? <button type="button" onClick=\{\(\) => setHistoryOpen\(true\)\}/);
  assert.match(center, /<ModelThumbnail row=\{row\}/);
  assert.match(center, /productionDateTime\(row\)/);
  assert.match(center, /Üretim Fişi Gir/);
});

test("Günlük girişte model ID + görsel ve doğru baskı bölgeleri görünür", () => {
  const rows = [
    { id: "model-128", modelName: "MELİN", companyName: "FİRMA A", printRegions: [{ regionName: "Ön" }] },
    { id: "model-998", modelName: "MELİN", companyName: "FİRMA B", printRegions: [{ regionName: "Kol" }] },
  ];
  assert.deepEqual(filterProductionModels(rows, "model-998").map((m) => m.id), ["model-998"]);
  assert.deepEqual(availableProductionRegions(rows[0]), ["Ön"]);
  assert.deepEqual(availableProductionRegions(rows[1]), ["Kol"]);
  assert.match(entry, /Model ID: \{modelKey\(selectedModel\)\}/);
  assert.match(entry, /pde-selected-image/);
  assert.match(entry, /id="pde-model-input"/);
  assert.match(entry, /Makine No \/ Adı/);
});

test("Kaydedilmemiş seri satırları varken modal kapanışı onay ister", () => {
  assert.match(entry, /queue\.length > 0 && !window\.confirm/);
  assert.match(entry, /if \(saveLock\.current \|\| saving \|\| creatingModel \|\| !queue\.length\) return/);
  assert.match(entry, /requestId: row\.requestId/);
  assert.match(entry, /onClick=\{saveAll\}/);
});

test("Makine vardiya sekmesi açılır düzenleme ve sadece değişen kaydı yazar", () => {
  assert.match(settings, /aria-expanded=\{editingIndex === index\}/);
  assert.match(settings, /editingIndex === index \|\| !row\.id/);
  assert.match(settings, /for \(const \{ row, index \} of changed\)/);
  assert.match(settings, /setEditingIndex\(-1\)/);
  assert.match(report, /aria-expanded=\{filtersExpanded\}/);
  assert.match(report, /filtreleri/i);
});
