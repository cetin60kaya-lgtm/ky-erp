import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("./utils/installCanonicalDialogSizing.js", import.meta.url), "utf8");
const service = readFileSync(new URL("./services/dialogLayoutApi.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles/canonical-dialog-resize.css", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");

test("all dialogs use centered bottom-right resize runtime", () => {
  assert.match(main, /canonical-dialog-resize\.css/);
  assert.match(main, /installCanonicalDialogSizing/);
  assert.match(runtime, /ky-modal-resize-handle/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /pointermove/);
  assert.match(runtime, /MIN_WIDTH = 420/);
  assert.match(runtime, /MIN_HEIGHT = 280/);
  assert.match(css, /right:\s*4px !important/);
  assert.match(css, /bottom:\s*4px !important/);
  assert.match(css, /cursor:\s*nwse-resize !important/);
  assert.match(css, /touch-action:\s*none !important/);
});

test("dialog size is shared through server and never stored per device", () => {
  assert.match(service, /\/ui\/dialog-layouts\//);
  assert.doesNotMatch(service, /localStorage|sessionStorage/);
  assert.doesNotMatch(runtime, /localStorage|sessionStorage/);
  assert.match(runtime, /gunluk-operasyon\.personel-karti/);
  assert.match(runtime, /muhasebe\.cari-hareket/);
});
