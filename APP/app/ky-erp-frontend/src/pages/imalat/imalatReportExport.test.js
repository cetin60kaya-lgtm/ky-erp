import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imalatReportTsv } from "./imalatReportExport.js";

const headers = [{ key: "model", label: "Model" }, { key: "basilan", label: "Basılan" }];
test("imalat TSV gerçek veri satirlarini Turkce BOM ile Excel acilisina hazirlar", () => {
  const text = imalatReportTsv(headers, [{ model: "ÇİÇEK", basilan: 120 }, { model: "ÖRNEK", basilan: 5 }]);
  assert.equal(text, "\ufeffModel\tBasılan\r\nÇİÇEK\t120\r\nÖRNEK\t5");
});
test("imalat raporu hücre formül enjeksiyonuna ve sekme satır bozulmasına izin vermez", () => {
  const text = imalatReportTsv(headers, [{ model: "=HYPERLINK(\"url\")\nAlt\tSatır", basilan: 2 }, { model: "@SUM(1)", basilan: 0 }]);
  assert.match(text, /'=HYPERLINK/);
  assert.match(text, /'@SUM/);
  assert.doesNotMatch(text, /Alt\tSatır/);
  assert.equal(text.split("\r\n").length, 3);
});
test("imalat raporunda xls olmayan veri xls diye indirilmez, güncel filtre şart", () => {
  const ui = readFileSync(new URL("./ImalatKontrolRapor.jsx", import.meta.url), "utf8");
  assert.match(ui, /filtersDirty/);
  assert.match(ui, /disabled=\{loading \|\| filtersDirty \|\| !exportedRows.length\}/);
  assert.match(ui, /\.tsv/);
  assert.doesNotMatch(ui, /imalat-denetim-\$\{date\}\.xls/);
  const settings = readFileSync(new URL("./ProductionSettingsPage.jsx", import.meta.url), "utf8");
  assert.match(settings, /saved.length.*prepared.length/);
  assert.match(settings, /saveLock\.current = true/);
  assert.match(settings, /Değişiklikleri Geri Al/);
  assert.match(settings, /Ana firma seçin|ana firma seçin/);
});
