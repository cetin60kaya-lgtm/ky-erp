import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const v2 = readFileSync(new URL("./isnet-runtime-v2.ts", import.meta.url), "utf8");
const live = readFileSync(new URL("./isnet-live-sync.ts", import.meta.url), "utf8");
test("İşNet iki modülü: yeni iki aşamalı kimlik doğrulama yolu eski handler'dan önce",()=>{
  const v2At=main.indexOf("registerIsnetRuntimeV2Routes(app);");
  const legacyAt=main.indexOf("registerIsnetLiveSyncRoutes(app);");
  assert.ok(v2At>=0 && legacyAt>=0 && v2At<legacyAt);
  assert.equal(main.split("registerIsnetRuntimeV2Routes(app);").length,2);
  assert.match(v2,/checkedIsnetCompanySave\(current, body\)/);
  assert.match(v2,/mode === "api" && username === text\(current.username\)/);
  assert.match(v2,/testedAt: nowIso\(\)/);
  assert.match(v2,/portalCompanySelected: false/);
});
test("İşNet portal dosyalarını yalnız doğrulanmış formatta arşive alır",()=>{
  assert.match(live,/verifyIsnetDownloadedFile\(format, buffer,/);
  assert.match(live,/MAX_ISNET_DOCUMENT_BYTES/);
  assert.ok(live.indexOf("verifyIsnetDownloadedFile(format, buffer") < live.indexOf("export function registerIsnetLiveSyncRoutes"));
});
