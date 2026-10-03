import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("./utils/installCanonicalDialogSizing.js", import.meta.url), "utf8");
const service = readFileSync(new URL("./services/dialogLayoutApi.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles/canonical-dialog-resize.css", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");

test("all dialogs use one colored corner-arrow resize runtime", () => {
  assert.match(main, /canonical-dialog-resize\.css/);
  assert.match(main, /installCanonicalDialogSizing/);
  assert.match(runtime, /ky-modal-resize-handle/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /pointermove/);
  assert.match(runtime, /M8 16 16 8/);
  assert.match(runtime, /MIN_WIDTH = 420/);
  assert.match(runtime, /MIN_HEIGHT = 280/);
  assert.match(css, /right:\s*5px !important/);
  assert.match(css, /bottom:\s*5px !important/);
  assert.match(css, /color:\s*#7c93b3 !important/);
  assert.match(css, /color:\s*#f59e0b !important/);
  assert.match(css, /cursor:\s*nwse-resize !important/);
  assert.match(css, /touch-action:\s*none !important/);
});

test("every popup keeps an independent server-shared size across computers", () => {
  assert.match(service, /\/ui\/dialog-layouts\//);
  assert.doesNotMatch(service, /localStorage|sessionStorage/);
  assert.doesNotMatch(runtime, /localStorage|sessionStorage/);
  assert.match(runtime, /explicitDialogKey/);
  assert.match(runtime, /dataset\.modalSizeKey/);
  assert.match(runtime, /muhasebe\.cari-hareket/);
  assert.doesNotMatch(runtime, /if \(\/gop-dialog\/\.test\(className\)\) return "gunluk-operasyon\.personel-karti"/);
});
