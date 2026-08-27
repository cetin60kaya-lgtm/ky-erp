import assert from "node:assert/strict";
import test from "node:test";
import { shouldClearStoredAuthForStatus } from "./authSessionPolicy.js";

test("temporary server and network failures preserve the stored session", () => {
  for (const status of [0, 500, 502, 503, 504]) {
    assert.equal(shouldClearStoredAuthForStatus(status), false);
  }
});

test("real authorization failures clear the stored session", () => {
  assert.equal(shouldClearStoredAuthForStatus(401), true);
  assert.equal(shouldClearStoredAuthForStatus(403), true);
});
