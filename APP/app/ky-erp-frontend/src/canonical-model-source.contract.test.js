import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = resolve(here);
const repoRoot = resolve(frontendRoot, "../../../..");

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("Desen model tüketicisi yalnız canonical /models yolunu kullanır", () => {
  const service = read("APP/app/ky-erp-frontend/src/services/desenService.js");
  assert.match(service, /apiGet\("\/models"/);
  assert.match(service, /apiPost\("\/models"/);
  assert.doesNotMatch(service, /model-takip\/models\/shared-list/);
  assert.doesNotMatch(service, /models-simple/);
});

test("Cloud /api/models ürün tablosunu değil model_records kaynağını kullanır", () => {
  const worker = read("APP/cloud/ky-erp-api/src/index.ts");
  const start = worker.indexOf('app.get("/api/models"');
  const end = worker.indexOf('app.post("/api/muhasebe/odeme/firma"', start);
  assert.ok(start >= 0 && end > start, "canonical model route block bulunamadı");
  const block = worker.slice(start, end);
  assert.match(block, /scopedRows\(c, "model_records"/);
  assert.doesNotMatch(block, /scopedRows\(c, "products"/);
  assert.match(block, /app\.get\("\/api\/models\/:id"/);
  assert.match(block, /app\.post\("\/api\/models"/);
});

test("Günlük Operasyon kodu korunurken ana modül kaydından geçici olarak çıkarılır", () => {
  const registry = read("APP/app/ky-erp-frontend/src/app/moduleRegistry.js");
  assert.match(registry, /TEMPORARILY_DISABLED_MODULE_KEYS = new Set\(\["gunluk-operasyon"\]\)/);
  assert.match(registry, /\.filter\(\(module\) => !TEMPORARILY_DISABLED_MODULE_KEYS\.has\(module\.key\)\)/);
});