import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("./installPersistentModalSizing.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("tum uygulama acilirlari tasinabilir ve sekiz yonden boyutlanabilir", () => {
  assert.match(main, /installPersistentModalSizing/);
  assert.match(runtime, /\[role='dialog'\]/);
  assert.match(runtime, /\[aria-modal='true'\]/);
  assert.match(runtime, /function attachResize/);
  assert.match(runtime, /return "se"/);
  assert.match(runtime, /return "sw"/);
  assert.match(runtime, /return "ne"/);
  assert.match(runtime, /return "nw"/);
  assert.match(runtime, /ky-modal-resizing/);
  assert.match(runtime, /writeGeometry\(key/);
});

test("modal konumu ve boyutu kalici saklanir ve css native resize yerine ortak motoru kullanir", () => {
  assert.match(runtime, /modal-geometry:v3/);
  assert.match(runtime, /localStorage\.setItem/);
  assert.match(css, /\.ky-persistent-modal[\s\S]*resize:\s*none !important/);
  assert.match(css, /width:\s*var\(--ky-modal-width/);
  assert.match(css, /height:\s*var\(--ky-modal-height/);
  assert.doesNotMatch(runtime, /panel\.matches\("\.ccw-drawer"\)/);
  assert.match(runtime, /function looksLikeBackdrop/);
  assert.match(runtime, /resolveDialogPanel/);
  assert.doesNotMatch(runtime, /new ResizeObserver/);
});
