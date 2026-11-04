import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./gunluk-operasyon-cloud.ts", import.meta.url), "utf8");
test("daily period-lock read handles range and selected day without bypassing tenant", () => {
  const lockRead = source.slice(source.indexOf("async function lockGet("), source.indexOf("async function lockWrite("));
  assert.match(lockRead, /companyIdOf\(c\)/);
  assert.match(lockRead, /c\.req\.query\("startDate"\)/);
  assert.match(lockRead, /c\.req\.query\("endDate"\)/);
  assert.match(lockRead, /validDate\(start\)/);
  assert.match(lockRead, /status='LOCKED'/);
  assert.match(lockRead, /start_date<=\? AND end_date>=\?/);
  assert.match(lockRead, /\.bind\(companyId, from, until, from\)/);
});
test("server continues to block locked shifts and locked-range roster writes", () => {
  assert.match(source, /async function lockedPeriod\(/);
  assert.match(source, /async function lockedRange\(/);
  assert.match(source, /DAILY_PERIOD_LOCKED/);
  assert.match(source, /mode === "remove"/);
  assert.match(source, /hr_daily_operation_audit/);
  assert.match(source, /hr_daily_attendance_revision/);
});
