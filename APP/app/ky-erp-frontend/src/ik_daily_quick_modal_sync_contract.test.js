import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./pages/modules/IkPage.jsx", import.meta.url),
  "utf8",
);

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `start not found: ${start}`);
  assert.ok(to > from, `end not found: ${end}`);
  return source.slice(from, to);
}

test("quick entry owns isolated selection state", () => {
  assert.match(source, /quickSelectedIds, setQuickSelectedIds/);
  assert.match(source, /quickBaselineIds, setQuickBaselineIds/);
  assert.match(source, /quickBaselineUpdatedAt, setQuickBaselineUpdatedAt/);
  assert.match(source, /const quickDayDirty =\s*quickSelectedIds\.size !== quickBaselineIds\.size/);
});

test("quick entry loads focused canonical server truth", () => {
  const block = between("const loadQuickDayTruth", "const setQuickCells");
  assert.match(block, /getGunlukPersonelGunKayitlari/);
  assert.match(block, /row\?\.selected === true/);
  assert.match(block, /setQuickSelectedIds\(selected\)/);
  assert.match(block, /setQuickBaselineIds\(new Set\(selected\)\)/);
});
test("quick selection cannot mutate normal draft state", () => {
  const cellBlock = between("const setQuickCells", "const toggleQuickCell");
  assert.doesNotMatch(cellBlock, /setDraftEntries/);
  assert.doesNotMatch(cellBlock, /setDirty/);
  assert.match(cellBlock, /setQuickSelectedIds/);

  const openBlock = between("const openQuickModal", "const closeQuickModal");
  assert.doesNotMatch(openBlock, /setDraftEntries/);
  assert.doesNotMatch(openBlock, /setDailyEntries/);
  assert.match(openBlock, /loadQuickDayTruth/);
});

test("unchecked or unselected people cannot retain quick control state", () => {
  assert.match(source, /if \(!selectedIds\.has\(id\)\) next\.delete\(quickCheckKeyFor\(id, date, shift\)\)/);
  assert.match(source, /if \(!quickSelectedIds\.has\(id\)\) return/);
  assert.match(source, /const checked = active && fastCheckedKeys\.has\(quickCheckKeyFor\(person\.id, selectedDate\)\)/);
});

test("quick save refreshes normal daily state only after persistence", () => {
  const saveBlock = between("const saveQuickDay", "const changeSelectedDate");
  assert.match(saveBlock, /saveGunlukPersonelGunKayitlari/);
  assert.match(saveBlock, /await refreshDailyEntries\(range\)/);
  assert.match(saveBlock, /setDailyEntries\(refreshed\)/);
  assert.match(saveBlock, /setDraftEntries\(refreshed\)/);
  assert.match(saveBlock, /await loadQuickDayTruth\(targetDate, shiftMode\)/);
});

test("obsolete weekly quick matrix path is removed", () => {
  assert.doesNotMatch(source, /entryView === "quick"/);
  assert.doesNotMatch(source, /saveQuickMatrix/);
});