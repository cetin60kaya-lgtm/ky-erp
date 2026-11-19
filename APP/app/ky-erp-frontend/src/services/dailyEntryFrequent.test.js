import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rankDailyFrequentEmployees } from "./dailyEntryFrequent.js";

const people = [
  { id: "a", name: "Ali", active: true, role: "Serimci" },
  { id: "b", name: "Burak", active: true, role: "Makinacı" },
  { id: "c", name: "Eski", active: false, role: "Serimci" },
];

test("sık kullanılanlar aynı vardiyanın geçmiş gerçek çalışma adedine göre sıralanır", () => {
  const rows = [
    { employeeId: "a", workDate: "2026-11-16", dayShift: 1, nightShift: 0 },
    { employeeId: "a", workDate: "2026-11-17", dayShift: 1, nightShift: 0 },
    { employeeId: "b", workDate: "2026-11-17", dayShift: 0, nightShift: 1 },
    { employeeId: "c", workDate: "2026-11-18", dayShift: 1, nightShift: 1 },
  ];
  assert.deepEqual(rankDailyFrequentEmployees(people, rows, "2026-11-19", "day").map((r) => r.person.id), ["a"]);
  assert.deepEqual(rankDailyFrequentEmployees(people, rows, "2026-11-19", "night").map((r) => r.person.id), ["b"]);
});

test("gelecekteki kayıt, eski kayıt ve çifte kayıt öneriyi kirletmez", () => {
  const rows = [
    { employeeId: "a", workDate: "2026-11-18", dayShift: "1", nightShift: "0" },
    { employeeId: "a", workDate: "2026-11-18", dayShift: "1", nightShift: "0" },
    { employeeId: "a", workDate: "2026-09-01", dayShift: "1", nightShift: "0" },
    { employeeId: "b", workDate: "2026-11-20", dayShift: 1, nightShift: 0 },
  ];
  const frequent = rankDailyFrequentEmployees(people, rows, "2026-11-19", "day");
  assert.equal(frequent.length, 1);
  assert.equal(frequent[0].person.id, "a");
  assert.equal(frequent[0].count, 1);
});

test("yeni tek ekran bütün personelleri yalnız taslakta seçer, kaydetme tek akıştır", () => {
  const workspace = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../pages/modules/ik/DailyEntrySmartSelector.jsx", import.meta.url), "utf8");
  assert.match(workspace, /<DailyEntrySmartSelector/);
  assert.match(workspace, /onSelectMany=\{addManyToDailyDraft\}/);
  assert.match(workspace, /onSave=\{saveFocused\}/);
  assert.match(workspace, /const setPersonSelectedForShift = \(person, nextSelected\) =>/);
  assert.match(workspace, /const missingRosterIds = \[\.\.\.selectedIds\]\.filter/);
  assert.match(picker, /Kartlar sadece taslak değiştirir/);
  assert.doesNotMatch(picker, /saveDailyFocusedRecords|saveDailyRoster|markDailyPaid/);
});

test("tarih/vardiya değişiminde kaydedilmemiş seçimler için güvenlik uyarısı korunur", () => {
  const workspace = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
  assert.match(workspace, /dailyDraftDirty && !window\.confirm/);
  assert.match(workspace, /dailyDraftDirtyRef\.current/);
  assert.match(workspace, /setSelectedIds\(new Set\(focusedIds\(records\)\)\)/);
});
