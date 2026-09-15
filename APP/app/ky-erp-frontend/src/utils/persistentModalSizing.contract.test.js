import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("./installPersistentModalSizing.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("tum uygulama acilirlari basliktan tasinir ve yalniz sol alttan boyutlanir", () => {
  assert.match(main, /installPersistentModalSizing/);
  assert.match(runtime, /\[role='dialog'\]/);
  assert.match(runtime, /\[aria-modal='true'\]/);
  assert.match(runtime, /function attachDrag/);
  assert.match(runtime, /function isBottomLeftResizePoint/);
  assert.match(runtime, /function attachResize/);
  assert.match(runtime, /start\.width - dx/);
  assert.match(runtime, /start\.height \+ dy/);
  assert.match(runtime, /nesw-resize/);
  assert.match(runtime, /writeGeometry\(key/);
});

test("modal yalniz kullanici tasiyip boyutlandirinca geometriyi kaydeder ve son olcude acilir", () => {
  assert.match(runtime, /modal-geometry:v4/);
  assert.match(runtime, /localStorage\.setItem/);
  assert.match(css, /\.ky-persistent-modal[\s\S]*resize:\s*none !important/);
  assert.match(css, /\.ky-persistent-modal\.ky-modal-positioned[\s\S]*width:\s*var\(--ky-modal-width/);
  assert.match(css, /\.ky-persistent-modal\.ky-modal-positioned[\s\S]*height:\s*var\(--ky-modal-height/);
  assert.doesNotMatch(runtime, /if \(!savedGeometry\) writeGeometry/);
  assert.doesNotMatch(runtime, /\.ccw-root > \.ccw-profile-card/);
  assert.doesNotMatch(runtime, /new ResizeObserver/);
});
