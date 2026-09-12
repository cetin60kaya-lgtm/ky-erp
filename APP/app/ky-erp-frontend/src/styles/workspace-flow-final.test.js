import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flowCss = readFileSync(new URL("./workspace-flow-final.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../layouts/AppShellV3.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../app/moduleRegistryBase.js", import.meta.url), "utf8");

test("workspace tek dikey akis sahibidir ve eski viewport kilitlerini ezer", () => {
  assert.match(shell, /workspace-flow-final\.css/);
  assert.match(flowCss, /\.clean-workflow-page[\s\S]*height: auto !important/);
  assert.match(flowCss, /\.ik-page[\s\S]*height: auto !important/);
  assert.match(flowCss, /\.bh-grid-3[\s\S]*overflow: visible !important/);
  assert.match(flowCss, /\.iw-grid-3 > \.iw-card:first-child[\s\S]*height: auto !important/);
  assert.match(flowCss, /safe-area-inset-bottom/);
});

test("ana menu gereksiz grup siniflandirmasi yerine direkt sekmeleri gosterir", () => {
  assert.match(shell, /const flatModuleTabs = !hasPrimarySidebarGroups && groups\.length > 0;/);
  assert.doesNotMatch(shell, /flatModuleTabs[^\n]*<= 6/);
});

test("gunluk operasyon haftalik raporu ana ekranda toplar", () => {
  assert.doesNotMatch(registry, /\["haftalik-ozet", "Haftalık Rapor"/);
  assert.match(registry, /"haftalik-ozet": "ana-ekran"/);
  assert.match(registry, /"gun-haftalik-ozet": "ana-ekran"/);
});
