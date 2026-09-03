import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const responsiveCss = readFileSync(new URL("./responsive-core.css", import.meta.url), "utf8");
const appV3 = readFileSync(new URL("../AppV3.jsx", import.meta.url), "utf8");
const shellV3 = readFileSync(new URL("../layouts/AppShellV3.jsx", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("responsive core tablet ve telefon kirilimlarini korur", () => {
  assert.match(responsiveCss, /@media \(max-width: 1280px\)/);
  assert.match(responsiveCss, /@media \(max-width: 1024px\)/);
  assert.match(responsiveCss, /@media \(max-width: 760px\)/);
  assert.match(responsiveCss, /@media \(max-width: 480px\)/);
  assert.match(responsiveCss, /100dvh/);
  assert.match(responsiveCss, /safe-area-inset-bottom/);
});

test("AppV3 tablet drawer esigini 1024px kullanir", () => {
  assert.match(appV3, /COMPACT_SHELL_QUERY = "\(max-width: 1024px\)"/);
  assert.match(appV3, /window\.matchMedia\(COMPACT_SHELL_QUERY\)/);
});

test("AppShellV3 ortak responsive katmani yukler", () => {
  assert.match(shellV3, /responsive-core\.css/);
});

test("Android viewport klavye ve safe-area davranisi tanimlidir", () => {
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /interactive-widget=resizes-content/);
  assert.match(indexHtml, /mobile-web-app-capable/);
});
