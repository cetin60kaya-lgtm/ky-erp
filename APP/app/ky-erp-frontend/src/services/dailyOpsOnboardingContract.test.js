import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");

test("new card onboarding persists a roster member before claiming success", () => {
  const card = source.split("const saveCard = async () => {")[1]?.split("const deactivateCard = async")[0];
  assert.ok(card);
  assert.match(card, /persistRosterAddition\(createdId\)/);
  assert.match(card, /setCardDialog\(null\)/);
  assert.match(card, /setQuick\(\(current\) =>/);
  assert.match(card, /setSelectedIds\(\(current\) =>/);
  assert.doesNotMatch(card, /setRosterSaved\(false\)/);
});
test("quick next-day action moves main date and keeps the same shift", () => {
  const save = source.split("const saveQuick = async (goNext = false) => {")[1]?.split("const loadInlineAudit = useCallback")[0];
  assert.ok(save);
  assert.match(save, /await loadQuickFocus\(nextDate, snapshot\.shift, snapshot\.query\)/);
  assert.match(save, /setSelectedDate\(nextDate\)/);
  assert.match(save, /setShift\(snapshot\.shift\)/);
});
test("quick pool additions are persisted instead of only setting local roster state", () => {
  const code = source.split("const addRosterPerson = async")[1]?.split("const addPersonToRoster = async")[0];
  assert.ok(code);
  assert.match(code, /await addPersonToRoster\(person\)/);
  assert.doesNotMatch(code, /setRosterSaved\(false\)/);
});
