import test from "node:test";
import assert from "node:assert/strict";
import { safeModelLogRows } from "./desenModelLogs.js";

test("XLSM_IMPORT modelinde logs yoksa sekme boş listeye düşer", () => {
  assert.deepEqual(safeModelLogRows(undefined), []);
  assert.deepEqual(safeModelLogRows(null), []);
  assert.deepEqual(safeModelLogRows({}), []);
  assert.deepEqual(safeModelLogRows(""), []);
});

test("günlüklerde yalnız geçerli nesneler gösterilir, orijinaller korunur", () => {
  const item = { id: "action-1", createdAt: "2026-11-08T09:00:00Z", action: "MODEL_UPDATED", description: "Kaynak ilişkilendirildi" };
  const result = safeModelLogRows([null, item, 123, false, [], undefined]);
  assert.deepEqual(result, [item]);
  assert.equal(result[0], item);
});

test("boş ve yanlış tipli kayıtlar sayfayı çökertmez", () => {
  assert.deepEqual(safeModelLogRows([undefined, null, "x", 12, []]), []);
  assert.deepEqual(safeModelLogRows([]), []);
});
