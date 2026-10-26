import test from "node:test";
import assert from "node:assert/strict";
import { partitionWorkspaceTabs } from "./workspaceTabs.js";

const tabs = Array.from({ length: 14 }, (_, i) => ({ id: `tab-${i + 1}`, label: `Sekme ${i + 1}` }));

test("6 sekmeden fazlasi menude saklanir, kapanmaz", () => {
  const { visible, overflow } = partitionWorkspaceTabs(tabs, "tab-2");
  assert.equal(visible.length, 6);
  assert.equal(overflow.length, 8);
  assert.deepEqual([...visible, ...overflow].map((tab) => tab.id).sort(), tabs.map((tab) => tab.id).sort());
});
test("ilk 6 disindaki aktif sekme ustte gorunur", () => {
  const { visible, overflow } = partitionWorkspaceTabs(tabs, "tab-14");
  assert.ok(visible.some((tab) => tab.id === "tab-14"));
  assert.ok(overflow.some((tab) => tab.id === "tab-6"));
  assert.equal(visible.length, 6);
});
test("dar ekran ve bos liste guvenli", () => {
  assert.deepEqual(partitionWorkspaceTabs([], ""), { visible: [], overflow: [] });
  assert.deepEqual(partitionWorkspaceTabs(null, ""), { visible: [], overflow: [] });
  const { visible, overflow } = partitionWorkspaceTabs(tabs.slice(0, 2), "tab-2", 4);
  assert.equal(visible.length, 2);
  assert.equal(overflow.length, 0);
});
