import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const importer = readFileSync(new URL("../scripts/import-manufacturing-xlsm.mjs", import.meta.url), "utf8");

test("Excel imalat aktarımı 2026 ve sonrası, tenant ve onayla sınırlıdır", () => {
  assert.match(importer, /dt\.y !== year/);
  assert.ok(importer.includes('year < 2026'));
  assert.ok(importer.includes('value("--confirm-tenant") !== tenant'));
  assert.ok(importer.includes('if (!apply || candidates.length === 0) process.exit(0)'));
});

test("Excel imalat aktarımı görseli olmayan/desensiz modeli ve mükerreri yazmaz", () => {
  assert.ok(importer.includes('MODEL_NOT_REGISTERED'));
  assert.ok(importer.includes('MODEL_PREVIEW_MISSING'));
  assert.ok(importer.includes('SOURCE_DUPLICATE'));
  assert.ok(importer.includes('INSERT OR IGNORE INTO production_records'));
  assert.ok(importer.includes('INSERT OR IGNORE INTO model_production_links'));
  assert.ok(!importer.includes('r[13]')); // Excel makine yardımcısı alınmaz.
});
