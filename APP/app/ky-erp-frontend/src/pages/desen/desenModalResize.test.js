import test from "node:test";
import assert from "node:assert/strict";
import { resizeModelDetailBox } from "./desenModalResize.js";

const start = { width: 840, height: 580, startX: 160, startY: 580, maxWidth: 1200, maxHeight: 900 };

test("sol kenarı sola sürüklemek yalnız genişliği artırır", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 80, y: 660, edge: "left" }), { width: 920, height: 580 });
});
test("sol kenarı sağa sürüklemek genişliği azaltır, yükseklik sabit kalır", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 230, y: 480, edge: "left" }), { width: 770, height: 580 });
});
test("sol-alt köşe hem en hem boy değiştirir", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 100, y: 630, edge: "corner" }), { width: 900, height: 630 });
});
test("en ve boy ekran sınırlarına sığar", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: -2000, y: 4000, edge: "corner", maxWidth: 980, maxHeight: 650 }), { width: 980, height: 650 });
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 2000, y: -2000, edge: "corner" }), { width: 460, height: 320 });
});
test("dar pencerede alt sınır kullanılabilir alandan büyük olamaz", () => {
  assert.deepEqual(resizeModelDetailBox({ ...start, x: 500, y: 0, edge: "corner", maxWidth: 300, maxHeight: 280 }), { width: 300, height: 280 });
});
