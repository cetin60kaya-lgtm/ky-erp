import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./canonical-workspace-ui.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("canonical UI is loaded globally after legacy module styles", () => {
  assert.match(main, /await import\("\.\/styles\/canonical-workspace-ui\.css"\)/);
  assert.doesNotMatch(main, /installPersistentModalSizing/);
});

test("all module workspaces share one compact centered canvas", () => {
  assert.match(css, /--ky-workspace-max:\s*1180px/);
  assert.match(css, /\.shell-v3-workspace > \*[\s\S]*margin-inline:\s*auto/);
});

test("drawer side panel and modal layers converge to centered dialogs", () => {
  assert.match(css, /drawer-layer/);
  assert.match(css, /side-layer/);
  assert.match(css, /modal-backdrop/);
  assert.match(css, /justify-content:\s*center !important/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /max-width:\s*var\(--ky-dialog-max\) !important/);
});

test("legacy master detail layouts become one vertical work stream", () => {
  assert.match(css, /master-detail/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) !important/);
  assert.match(css, /\.ccw-table-card > \.ccw-table-wrap[\s\S]*max-height:\s*320px !important/);
});

test("old draggable resizable modal behavior cannot return", () => {
  assert.match(css, /\.ky-modal-resize-handle[\s\S]*display:\s*none !important/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*resize:\s*none !important/);
});
