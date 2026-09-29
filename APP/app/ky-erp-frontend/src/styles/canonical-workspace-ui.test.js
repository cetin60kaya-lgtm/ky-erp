import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./canonical-workspace-ui.css", import.meta.url), "utf8");
const popupCss = readFileSync(new URL("./module-action-popups.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const navigator = readFileSync(new URL("../components/erp/CanonicalTaskNavigator.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../app/moduleRegistry.js", import.meta.url), "utf8");
const dailyWorkspace = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");

test("canonical action styles load after legacy module styles", () => {
  assert.match(main, /await import\("\.\/styles\/canonical-workspace-ui\.css"\)/);
  assert.match(main, /await import\("\.\/styles\/module-action-popups\.css"\)/);
  assert.doesNotMatch(main, /installPersistentModalSizing/);
});

test("existing module and page layouts stay visible", () => {
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\) \.shell-v3-sidebar \.shell-v3-submenu/);
  assert.doesNotMatch(css, /--ky-workspace-max/);
  assert.doesNotMatch(css, /\.ccw-master-detail\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/);
});

test("daily operations uses the canonical sidebar and no second in-page navigator", () => {
  assert.match(registry, /\["daily-entry", "Günlük Giriş", "takvim"\]/);
  assert.match(registry, /\["daily-cards", "Personel Kartları", "users"\]/);
  assert.match(registry, /\["daily-weekly", "Haftalık Özet", "raporlar"\]/);
  assert.match(registry, /\["daily-payments", "Ödeme Fişleri", "odemeler"\]/);
  assert.doesNotMatch(dailyWorkspace, /gop-legacy-nav/);
  assert.doesNotMatch(dailyWorkspace, /<nav/);
  assert.match(navigator, /return null/);
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\)/);
  assert.doesNotMatch(css, /\n:where\(\s*\[class\*="drawer-layer"\]/);
  assert.doesNotMatch(css, /\n\[role="dialog"\] > header/);
  assert.doesNotMatch(popupCss, /data-active-module="gunluk-operasyon"\]\s+\.(?:compliance|pc2|eb)/);
});

test("other modules converge drawer side panel and modal layers to centered dialogs", () => {
  assert.match(css, /drawer-layer/);
  assert.match(css, /side-layer/);
  assert.match(css, /modal-backdrop/);
  assert.match(css, /justify-content:\s*center !important/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /max-width:\s*var\(--ky-dialog-max\) !important/);
});

test("page actions use popup behavior and reusable tabs", () => {
  assert.match(css, /\.ccw-transaction\s*\{[\s\S]*position:\s*fixed !important/);
  assert.match(css, /data-active-module="ik"[\s\S]*\.ikpf-new/);
  assert.match(css, /data-active-module="uretim"[\s\S]*\.pc2-layer/);
  assert.match(popupCss, /data-active-module="compliance"[\s\S]*\.compliance-form-card/);
  assert.match(popupCss, /\.capa-form/);
  assert.match(css, /\.ky-action-tabs/);
  assert.match(css, /modal-tabs/);
  assert.match(css, /dialog-tabs/);
});

test("old draggable resizable modal behavior cannot return outside daily operations", () => {
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\) \.ky-modal-resize-handle/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*resize:\s*none !important/);
  assert.match(css, /\.eb-document-modal[\s\S]*resize:\s*none !important/);
});
