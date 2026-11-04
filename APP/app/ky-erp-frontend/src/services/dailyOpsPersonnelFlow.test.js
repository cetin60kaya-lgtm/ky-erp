import test from "node:test";
import assert from "node:assert/strict";
import { dailyRosterIds, persistDailyRosterMember } from "./dailyOpsPersonnelFlow.js";

const params = { employeeId: "new-employee", mainCompanyId: "hakan", startDate: "2026-11-02", endDate: "2026-11-08" };
test("adding a person persists a merged roster and confirms it with a second fresh server read", async () => {
  const calls = [];
  let roster = ["existing", "other-pc-person"];
  const result = await persistDailyRosterMember({
    ...params, localIds: ["existing", "new-employee"],
    readRoster: async () => { calls.push("read"); return { employeeIds: roster }; },
    writeRoster: async (body) => { calls.push("write"); assert.equal(body.mode, "merge"); assert.ok(body.employeeIds.includes("other-pc-person")); roster = body.employeeIds; return { employeeIds: roster }; },
  });
  assert.deepEqual(calls, ["read", "write", "read"]);
  assert.ok(result.has("new-employee"));
  assert.ok(result.has("other-pc-person"));
});
test("a missing person after the server read is never reported as saved", async () => {
  let reads = 0;
  await assert.rejects(() => persistDailyRosterMember({
    ...params,
    readRoster: async () => ({ employeeIds: ++reads === 1 ? ["existing"] : ["existing"] }),
    writeRoster: async () => ({ employeeIds: ["existing", "new-employee"] }),
  }), /tekrar okununca/);
});
test("malformed server responses and empty IDs fail closed", async () => {
  assert.throws(() => dailyRosterIds({}), /doğrulanamadı/);
  await assert.rejects(() => persistDailyRosterMember({ ...params, employeeId: "", readRoster: async () => [], writeRoster: async () => [] }), /eksik/);
});
test("merge never duplicates staff IDs", async () => {
  const result = await persistDailyRosterMember({
    ...params, localIds: ["existing", "existing", "new-employee"],
    readRoster: async () => ({ employeeIds: ["existing", "existing", "new-employee"] }),
    writeRoster: async (body) => { assert.deepEqual(body.employeeIds, ["existing", "new-employee"]); return { employeeIds: body.employeeIds }; },
  });
  assert.equal(result.size, 2);
});
