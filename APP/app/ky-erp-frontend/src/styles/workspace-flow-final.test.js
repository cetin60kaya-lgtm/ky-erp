import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flowCss = readFileSync(new URL("./workspace-flow-final.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../layouts/AppShellV3.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../app/moduleRegistryBase.js", import.meta.url), "utf8");
const appV3 = readFileSync(new URL("../AppV3.jsx", import.meta.url), "utf8");

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
  assert.doesNotMatch(registry, /\["haftalik-ozet", "HaftalÄ±k Rapor"/);
  assert.match(registry, /"haftalik-ozet": "ana-ekran"/);
  assert.match(registry, /"gun-haftalik-ozet": "ana-ekran"/);
});

test("tum ana moduller menu, ikon ve renk kimligiyle tek tek kapsanir", () => {
  const registryExt = readFileSync(new URL("../app/moduleRegistry.js", import.meta.url), "utf8");
  const pdksRegistry = readFileSync(new URL("../app/pdksModuleRegistryPatch.js", import.meta.url), "utf8");
  const shellCss = readFileSync(new URL("./shell-v3-modern.css", import.meta.url), "utf8") + flowCss;
  const sources = registry + registryExt + pdksRegistry;
  const modules = ["muhasebe", "desen", "boyahane", "gunluk-operasyon", "ik", "pdks", "uretim", "isnet", "iletisim", "compliance", "depolama", "sistem-merkezi", "admin", "asistan"];
  for (const key of modules) {
    assert.match(sources, new RegExp(`key:\\s*["']${key}["']`), `${key} menu kaydi eksik`);
    assert.ok(shell.includes(`${key}: { icon:`) || shell.includes(`"${key}": { icon:`), `${key} ikon kimligi eksik`);
    assert.match(shellCss, new RegExp(`data-(?:active-)?module=["']${key}["']`), `${key} renk kimligi eksik`);
  }
});

test("workspace kirik beyaz taban ve gorunur alt bitis siniri tasir", () => {
  assert.match(flowCss, /--ky-app-canvas:\s*#f5f7fa/);
  assert.match(flowCss, /\.shell-v3-workspace::after/);
  assert.match(flowCss, /border-bottom:\s*1px solid/);
  assert.match(flowCss, /scroll-padding-bottom:\s*72px/);
  assert.match(flowCss, /color-mix\(in srgb, var\(--active-tab-soft\)/);
});
test("tum ana moduller preload ve render yoluna sahiptir", () => {
  const modules = ["muhasebe", "desen", "boyahane", "gunluk-operasyon", "ik", "pdks", "uretim", "isnet", "iletisim", "compliance", "depolama", "sistem-merkezi", "admin", "asistan"];
  for (const key of modules) {
    const loaderKey = key.includes("-") ? `"${key}": () =>` : `${key}: () =>`;
    assert.ok(appV3.includes(loaderKey), `${key} preload yolu eksik`);
  }
  assert.match(appV3, /activeModule\?\.key === "muhasebe"/);
  assert.match(appV3, /activeModule\?\.key === "sistem-merkezi"/);
  assert.match(appV3, /\["depolama", "admin"\]\.includes\(activeModule\?\.key\)/);
  assert.match(appV3, /Ekran bulunamadı/);
});
