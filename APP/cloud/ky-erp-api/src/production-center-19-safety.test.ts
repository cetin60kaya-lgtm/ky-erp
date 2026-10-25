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
test("İmalat aynı tek toplu istekte yinelenen fişi ikinci kez yazmaz", () => {
  assert.match(source, /seenThisBatch = new Set/);
  assert.match(source, /seenThisBatch\.has\(fingerprint\)/);
  assert.match(source, /Aynı toplu istekte mükerrer üretim fişi/);
  assert.match(source, /seenThisBatch\.add\(fingerprint\)/);
  assert.match(source, /PRODUCTION_CENTER_REQUEST/);
});
