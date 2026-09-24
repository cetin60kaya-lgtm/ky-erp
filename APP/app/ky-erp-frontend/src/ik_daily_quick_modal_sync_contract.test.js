import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./pages/modules/IkPage.jsx", import.meta.url),
  "utf8",
);

test("quick entry modal opens from fresh server truth", () => {
  assert.match(source, /const openQuickModal = async \(\) =>/);
  assert.match(source, /await refreshDailyEntries\(range\)/);
  assert.match(source, /setDraftEntries\(refreshed\)/);
  assert.match(source, /setDailyEntries\(refreshed\)/);
  assert.match(source, /setDirty\(false\)/);
  assert.match(source, /setQuickModalOpen\(true\)/);
});

test("quick entry modal discards stale draft state on close", () => {
  assert.match(source, /const closeQuickModal = \(\) =>[\s\S]*setDraftEntries\(dailyEntries\)[\s\S]*setDirty\(false\)[\s\S]*setQuickModalOpen\(false\)/);
});
test("quick entry modal derives unsaved state from actual draft difference", () => {
  assert.match(source, /const quickDayDirty = includedPeople\.some/);
  assert.match(source, /Boolean\(\(dailyEntries\[key\] \|\| \{\}\)\[shiftMode\]\) !== Boolean\(\(draftEntries\[key\] \|\| \{\}\)\[shiftMode\]\)/);
  assert.match(source, /disabled=\{quickDayDirty \|\| workDays\.indexOf\(selectedDate\) <= 0\}/);
  assert.match(source, /quickDayDirty \? "Kaydedilmemiş seçimler var\." : "Seçili gün kayıtları güncel\."/);
});
