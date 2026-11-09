import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dialogSizeBounds } from "../../components/shared/kyRecordDialogSize.js";

test("tüm modüllerde ortak başlangıç en-boy", () => {
  assert.deepEqual(dialogSizeBounds(null, { width: 1600, height: 1000 }), { width: 840, height: 600 });
});

test("sağ alt boyutlandırma ekran dışına çıkmaz", () => {
  assert.deepEqual(dialogSizeBounds({ width: 3000, height: 4000 }, { width: 980, height: 650 }), { width: 964, height: 634 });
  assert.deepEqual(dialogSizeBounds({ width: 10, height: 10 }, { width: 1600, height: 900 }), { width: 460, height: 320 });
  assert.deepEqual(dialogSizeBounds({ width: 10, height: 10 }, { width: 300, height: 280 }), { width: 284, height: 264 });
});

test("Desen model penceresi ortak dialoga bağlıdır; sekmeler onu yeniden boyutlandırmaz", () => {
  const shared = readFileSync(new URL("../../components/shared/KyRecordDialog.jsx", import.meta.url), "utf8");
  const jsx = readFileSync(new URL("./DesenWorkflowShared.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../components/shared/kyRecordDialog.css", import.meta.url), "utf8");
  assert.match(jsx, /export function WideModal[\s\S]*<KyRecordDialog/);
  assert.match(shared, /onPointerDown=\{resizeStart\}/);
  assert.match(shared, /onKeyDown=\{resizeKeyboard\}/);
  assert.match(shared, /style=\{\{ width: size\.width, height: size\.height \}\}/);
  assert.match(css, /\.ky-record-modal\s*\{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto/);
});
