import assert from "node:assert/strict";
import test from "node:test";
import { shouldClearStoredAuthForStatus } from "./authSessionPolicy.js";

test("temporary server, network and permission failures preserve the stored session", () => {
  for (const status of [0, 403, 500, 502, 503, 504]) {
    assert.equal(shouldClearStoredAuthForStatus(status), false);
  }
});

test("only an invalid or expired authenticated session clears stored auth", () => {
  assert.equal(shouldClearStoredAuthForStatus(401), true);
});
