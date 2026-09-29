import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const responsiveCss = readFileSync(new URL("./responsive-core.css", import.meta.url), "utf8");
const appV3 = readFileSync(new URL("../AppV3.jsx", import.meta.url), "utf8");
const shellV3 = readFileSync(new URL("../layouts/AppShellV3.jsx", import.meta.url), "utf8");
const displayPanel = readFileSync(new URL("../layouts/DisplaySettingsPanel.jsx", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("responsive core tablet ve telefon kirilimlarini korur", () => {
  assert.match(responsiveCss, /@media \(max-width: 1280px\)/);
  assert.match(responsiveCss, /@media \(max-width: 1024px\)/);
  assert.match(responsiveCss, /@media \(max-width: 760px\)/);
  assert.match(responsiveCss, /@media \(max-width: 480px\)/);
  assert.match(responsiveCss, /100dvh/);
  assert.match(responsiveCss, /safe-area-inset-bottom/);
});

test("AppV3 gorunum profilini cihaz algisindan veya manuel ayardan alir", () => {
  assert.match(appV3, /useDisplayPreferences/);
  assert.match(appV3, /displayPreferences\.effectiveMode === "pc"/);
  assert.match(appV3, /displayPreferences=\{displayPreferences\}/);
});

test("AppShellV3 ortak responsive katmani ve Windows benzeri ekran ayarini yukler", () => {
  assert.match(shellV3, /responsive-core\.css/);
  assert.match(shellV3, /data-layout-mode=\{effectiveMode\}/);
  assert.match(shellV3, /openDisplaySettingsFromProfile/);
  assert.match(shellV3, /DisplaySettingsPanel/);
  assert.match(shellV3, /data-ui-scale=\{effectiveScale\}/);
  assert.match(shellV3, /zoom: scaleFactor/);
  assert.match(shellV3, /100 \/ scaleFactor/);
});

test("manuel PC tablet ve telefon profilleri CSS seviyesinde tanimlidir", () => {
  assert.match(responsiveCss, /data-layout-mode="pc"/);
  assert.match(responsiveCss, /data-layout-mode="tablet"/);
  assert.match(responsiveCss, /data-layout-mode="phone"/);
});

test("ekran paneli otomatik manuel mod ve olcek seceneklerini sunar", () => {
  assert.match(displayPanel, /PC Modu/);
  assert.match(displayPanel, /Tablet Modu/);
  assert.match(displayPanel, /Telefon Modu/);
  assert.match(displayPanel, /SCALE_OPTIONS = \["auto", 80, 90, 100, 110, 125\]/);
  assert.match(displayPanel, /Önerilen ayarlara dön/);
});

test("Android viewport klavye ve safe-area davranisi tanimlidir", () => {
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /interactive-widget=resizes-content/);
  assert.match(indexHtml, /mobile-web-app-capable/);
});


test("telefon profili PDKS e-Belge ve IK islemlerini mobil akisa cevirir", () => {
  assert.match(responsiveCss, /\.ppd-workspace/);
  assert.match(responsiveCss, /\.ppd-modal-layer/);
  assert.match(responsiveCss, /\.ppd-center-footer/);
  assert.match(responsiveCss, /\.eb-document-modal/);
  assert.match(responsiveCss, /\.eb-document-lines-section \.eb-line:not\(\.head\)/);
  assert.match(responsiveCss, /\.eb-table > \.eb-tr:not\(\.eb-th\)/);
  assert.match(responsiveCss, /\.hr-modal-overlay/);
  assert.match(responsiveCss, /\.invoice-review-modal/);
  assert.match(responsiveCss, /resize: none !important/);
});

test("mobil tam ekran islemlerde dinamik viewport ve sabit alt aksiyon korunur", () => {
  assert.match(responsiveCss, /height: 100dvh !important/);
  assert.match(responsiveCss, /position: sticky !important/);
  assert.match(responsiveCss, /padding-bottom: max\(12px,var\(--ky-safe-bottom\)\)/);
});

test("mobil touch hotfix portal ve safe-area kurallarini korur", () => {
  assert.match(shellV3, /dataset\.kyLayoutMode = effectiveMode/);
  assert.match(responsiveCss, /data-ky-layout-mode="phone"/);
  assert.match(responsiveCss, /ppd-person-list > button/);
  assert.match(responsiveCss, /eb-line-review-trigger/);
  assert.match(responsiveCss, /min-height: 44px !important/);
  assert.match(responsiveCss, /min-width: 0 !important/);
  assert.match(responsiveCss, /padding-top: max\(14px, var\(--ky-safe-top\)\)/);
  assert.match(responsiveCss, /ppd-modal-actions:last-child/);
});
