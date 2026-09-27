import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const page = readFileSync(resolve(here, "pages/imalat/ProductionControlCenterPageV2.jsx"), "utf8");

test("üretim girişi makine ve vardiya tercihini bu istasyonda hatırlar", () => {
  assert.match(page, /productionEntryPreferenceKey/);
  assert.match(page, /writeProductionEntryPreferences\(activeMainCompany, \{ machineId:/);
  assert.match(page, /writeProductionEntryPreferences\(activeMainCompany, \{ shift:/);
  assert.match(page, /readProductionEntryPreferences\(activeMainCompany\)/);
});

test("operatör formu tekrar bilinen model ve makinacıyı elle istemez", () => {
  assert.match(page, /Model<input value=\{entryModel\?\.modelName/);
  assert.match(page, /Makinacı<input value=\{entry\.operatorName\} readOnly/);
  assert.match(page, /readOnly=\{Boolean\(entry\.dispatchNo\)\}/);
  assert.doesNotMatch(page, /Model<select value=\{entry\.modelId\}/);
});

test("tanımlı baskı bölgeleri serbest metin yerine seçim olarak sunulur", () => {
  assert.match(page, /entryPrintRegions\.length \? \(<select value=\{entry\.printRegion\}/);
});