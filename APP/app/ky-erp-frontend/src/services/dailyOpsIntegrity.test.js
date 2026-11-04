import test from "node:test";
import assert from "node:assert/strict";
import {
  dailyPeriodScope, dailyRangeScope, dailyFocusedScope,
  dailyLockOverlaps, assessDailyPeriodLocks, dailyWriteGate,
} from "./dailyOpsIntegrity.js";

const scope = dailyPeriodScope("hakan", "2026-11-04", "2026-11-02", "2026-11-08");
const rangeScope = dailyRangeScope("hakan", "2026-11-02", "2026-11-08");
const focusedScope = dailyFocusedScope("hakan", "2026-11-04", "day");
const open = {
  lockKnown: true, lockScope: scope, requiredLockScope: scope,
  dayLock: null, rangeScope, requiredRangeScope: rangeScope,
  focusedScope, requiredFocusedScope: focusedScope, rangeLock: null,
};
test("a verified open day and range may be edited", () => {
  assert.equal(dailyWriteGate(open), "");
  assert.equal(dailyWriteGate({ ...open, roster: true }), "");
});
test("an unknown lock is not equivalent to a closed period", () => {
  assert.match(dailyWriteGate({ ...open, lockKnown: false }), /doğrulanamadı/);
  assert.match(dailyWriteGate({ ...open, lockScope: "older-company" }), /doğrulanamadı/);
});
test("old day, night shift and range responses never authorize edits", () => {
  assert.match(dailyWriteGate({ ...open, requiredLockScope: dailyPeriodScope("hakan", "2026-11-05", "2026-11-02", "2026-11-08") }), /doğrulanamadı/);
  assert.match(dailyWriteGate({ ...open, requiredFocusedScope: dailyFocusedScope("hakan", "2026-11-04", "night") }), /gün\/vardiya/);
  assert.match(dailyWriteGate({ ...open, requiredRangeScope: dailyRangeScope("hakan", "2026-11-09", "2026-11-15") }), /listesi/);
});
test("day and range locks have distinct effects", () => {
  const otherDayLock = { status: "LOCKED", start_date: "2026-11-05", end_date: "2026-11-06" };
  assert.equal(assessDailyPeriodLocks([otherDayLock], { date: "2026-11-04", start: "2026-11-02", end: "2026-11-08" }).dayLock, null);
  assert.ok(dailyLockOverlaps(otherDayLock, "2026-11-02", "2026-11-08"));
  assert.equal(dailyWriteGate({ ...open, rangeLock: otherDayLock }), "");
  assert.match(dailyWriteGate({ ...open, rangeLock: otherDayLock, roster: true }), /kapalı dönem/);
  assert.match(dailyWriteGate({ ...open, dayLock: otherDayLock }), /kapalı/);
});
test("open, adjacent and non-overlapping records do not block", () => {
  const opened = { status: "OPEN", start_date: "2026-11-02", end_date: "2026-11-08" };
  assert.equal(assessDailyPeriodLocks([opened], { date: "2026-11-04", start: "2026-11-02", end: "2026-11-08" }).rangeLock, null);
  assert.equal(dailyLockOverlaps({ status: "LOCKED", start_date: "2026-11-09", end_date: "2026-11-15" }, "2026-11-02", "2026-11-08"), false);
});
test("malformed lock payload is rejected, never interpreted as unlocked", () => {
  assert.throws(() => assessDailyPeriodLocks({}, { date: "2026-11-04", start: "2026-11-02", end: "2026-11-08" }), /geçersiz/);
});
