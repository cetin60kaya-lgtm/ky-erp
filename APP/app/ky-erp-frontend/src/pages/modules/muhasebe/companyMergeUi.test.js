import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync(new URL("./CompaniesCurrentWorkspace.jsx",import.meta.url),"utf8");
const production=readFileSync(new URL("../../imalat/ProductionDirectEntryPanel.jsx",import.meta.url),"utf8");
test("Firma&Cari: hedef ID seçimi ve etki raporu olmadan birleştirilemez",()=>{
  assert.match(ui,/merge-preview/);
  assert.match(ui,/confirmSourceId/);
  assert.match(ui,/confirmTargetId/);
  assert.match(ui,/expectedSourceUpdatedAt/);
  assert.match(ui,/expectedTargetUpdatedAt/);
  assert.match(ui,/mergePhrase !== "BIRLESTIR"/);
  assert.match(ui,/mergePreview\?\.canMerge/);
});
test("İmalat yeni model için muhasebe firma ID'si gerekir",()=>{
  assert.match(production,/!newModelCompanyId/);
  assert.match(production,/Firma seçin \(zorunlu\)/);
  assert.match(production,/company\.id/);
});
