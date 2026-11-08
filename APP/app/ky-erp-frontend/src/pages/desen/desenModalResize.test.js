import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resizeModelDetailBox } from "./desenModalResize.js";

const start = { width: 840, height: 580, startX: 160, startY: 580, maxWidth: 1200, maxHeight: 900 };

test("sağ-alt köşeyi sağa çekmek genişliği, aşağı çekmek yüksekliği artırır", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 230, y: 640 }), { width: 910, height: 640 });
});

test("sağ-alt köşe sola-yukarı sürüklendiğinde iki boyutu küçültür", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 100, y: 530 }), { width: 780, height: 530 });
});

test("boyutlar ekrandan taşmadan sınırlandırılır", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 2000, y: 4000, maxWidth: 980, maxHeight: 650 }), { width: 980, height: 650 });
  assert.deepEqual(resizeModelDetailBox({ ...start, x: -2000, y: -2000 }), { width: 460, height: 320 });
});

test("küçük ekranlarda minimum pencere boyutu ekran sınırını aşmaz", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: -500, y: -500, maxWidth: 300, maxHeight: 280 }), { width: 300, height: 280 });
});

test("model detayında yalnız sağ-alt tutacak var ve sekmeler dış boyuta etki etmiyor", () => {
  const jsx = readFileSync(new URL("./DesenWorkflowShared.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./desenWorkflow.css", import.meta.url), "utf8");
  assert.match(jsx, /className="dsg-modal-resize-corner"/);
  assert.doesNotMatch(jsx, /className="dsg-modal-resize-left"/);
  assert.match(jsx, /height:\s*modalBox\?\.height\s*\?\?\s*"min\(590px/);
  assert.match(jsx, /width:\s*modalBox\?\.width\s*\?\?\s*"min\(840px/);
  assert.match(css, /\.dsg-modal\.model-detail\s*\{/);
  assert.match(css, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.dsg-modal-resize-corner\s*\{[^}]*right:\s*0;[^}]*bottom:\s*0/s);
});
