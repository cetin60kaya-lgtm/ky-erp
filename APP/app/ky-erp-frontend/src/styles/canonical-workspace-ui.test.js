import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./canonical-workspace-ui.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const navigator = readFileSync(new URL("../components/erp/CanonicalTaskNavigator.jsx", import.meta.url), "utf8");

test("canonical UI is loaded globally after legacy module styles", () => {
  assert.match(main, /await import\("\.\/styles\/canonical-workspace-ui\.css"\)/);
  assert.doesNotMatch(main, /installPersistentModalSizing/);
});

test("existing module and page layouts stay visible", () => {
  assert.match(css, /\.shell-v3-sidebar \.shell-v3-submenu\s*\{\s*display:\s*block;/);
  assert.doesNotMatch(css, /--ky-workspace-max/);
  assert.doesNotMatch(css, /\.ccw-master-detail\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/);
  assert.match(navigator, /return null/);
});

test("drawer side panel and modal layers converge to centered dialogs", () => {
  assert.match(css, /drawer-layer/);
  assert.match(css, /side-layer/);
  assert.match(css, /modal-backdrop/);
  assert.match(css, /justify-content:\s*center !important/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /max-width:\s*var\(--ky-dialog-max\) !important/);
});

test("operations use popup behavior and reusable tabs", () => {
  assert.match(css, /\.ccw-transaction\s*\{[\s\S]*position:\s*fixed !important/);
  assert.match(css, /\.ky-action-tabs/);
  assert.match(css, /modal-tabs/);
  assert.match(css, /dialog-tabs/);
});

test("old draggable resizable modal behavior cannot return", () => {
  assert.match(css, /\.ky-modal-resize-handle[\s\S]*display:\s*none !important/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*resize:\s*none !important/);
});
