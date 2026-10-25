import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/production-center.ts"), "utf8");

test("İmalat hiçbir zaman sabit başka tenant'a düşmez ve şirket zorunludur", () => {
  assert.doesNotMatch(source, /"mecit-hakan"/);
  assert.match(source, /c\.req\.header\("X-KYERP-Tenant-Slug"\)/);
  assert.match(source, /"MAIN_COMPANY_REQUIRED"/);
  assert.match(source, /app\.use\(pattern, requireProductionTenant\)/);
});
test("İmalat 101+ kayıt için güvenli sunucu sayfa ve boyut parametreleri", () => {
  assert.match(source, /Number\.isSafeInteger\(rawPage\)/);
  assert.match(source, /Number\.isSafeInteger\(rawSize\)/);
  assert.match(source, /pagination: \{ page, pageSize, total: filtered\.length \}/);
  assert.match(source, /filtered\.slice\(start, start \+ pageSize\)/);
});
test("İmalat D1 PK idempotency; tek batch içinde aynı clientId tekrarına izin verilmez", () => {
  assert.match(source, /seenThisBatch/);
  assert.match(source, /seenThisBatch\.has\(clientId\)/);
  assert.match(source, /seenThisBatch\.add\(clientId\)/);
  assert.match(source, /writeProductionEntryAtomic/);
  assert.match(source, /PRODUCTION_CENTER_REQUEST/);
  assert.doesNotMatch(source.slice(source.indexOf("async function saveProductionBatch("), source.indexOf("async function createModel(")), /storage = "json_store"/);
});
