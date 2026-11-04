import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../app/moduleRegistry.js", import.meta.url), "utf8");
const api = readFileSync(new URL("./dailyOpsApi.js", import.meta.url), "utf8");
const tabs = ["daily-dashboard", "daily-entry", "daily-cards", "daily-weekly", "daily-payments"];

test("all five daily operations tabs remain reachable through the same canonical workspace", () => {
  for (const tab of tabs) {
    assert.ok(registry.includes(`"${tab}"`), `Missing menu: ${tab}`);
    assert.ok(source.includes(`"${tab}"`), `Missing view: ${tab}`);
  }
});
test("period lock is read independently from attendance and roster and never guessed from failures", () => {
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /assessDailyPeriodLocks\(lockResult\.value/);
  assert.match(source, /setPeriodLockKnown\(false\)/);
  assert.match(source, /periodLockError \|\|/);
  assert.match(source, /startDate: range\.start, endDate: range\.end \}\)/);
});
test("day/range/shift response versions and safe write gates protect daily entry", () => {
  assert.match(source, /requestId !== rangeRequestRef\.current/);
  assert.match(source, /requestId !== focusedRequestRef\.current/);
  assert.match(source, /dailyWriteGate\(sharedGate\)/);
  assert.match(source, /rosterWriteBlocked/);
  assert.match(source, /disabled=\{busy \|\| dailyWriteBlocked\}/);
  assert.match(source, /quick\.date !== selectedDate \|\| quick\.shift !== shift/);
});
test("payment, payroll and roster operations keep D1 endpoints and optimistic guards", () => {
  for (const route of ["/payments", "/payments/pool", "/payments/history", "/roster", "/records", "/audit", "/period-lock"]) {
    assert.ok(api.includes(route), `Missing existing API contract: ${route}`);
  }
  assert.match(source, /expectedUpdatedAt:/);
  assert.match(source, /expectedCheckedUpdatedAt:/);
  assert.match(source, /mode: "remove", removeEmployeeId: person\.id/);
  assert.match(source, /paymentNo/);
});

test("new employee is saved to the D1 roster and not silently counted as worked", () => {
  const start = source.indexOf("  const saveCard = async () => {");
  const end = source.indexOf("  const deactivateCard = async", start);
  assert.ok(start >= 0 && end > start, "Canonical person create handler is missing");
  const flow = source.slice(start, end);
  assert.match(flow, /addToRoster && rosterWriteBlocked/);
  assert.match(flow, /const saved = await createDailyEmployee\(payload\)/);
  assert.match(flow, /const createdId = String\(saved\?\.id/);
  assert.match(flow, /const savedRoster = await saveDailyRoster\(/);
  assert.match(flow, /employeeIds: \[createdId\], mode: "merge"/);
  assert.match(flow, /serverIds\?\.includes\(createdId\)/);
  assert.match(flow, /setRosterIds\(new Set\(/);
  assert.match(flow, /setRosterSaved\(pendingRosterIds\.length === 0\)/);
  assert.match(flow, /Personel kartı oluşturuldu ancak dönem listesine eklenemedi/);
  assert.doesNotMatch(flow, /saveDailyFocusedRecords\(/, "Card creation must not book an unselected work shift");
});
