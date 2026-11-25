import test from "node:test";
import assert from "node:assert/strict";
import { createApiGetMemo } from "./apiGetMemo.js";
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function setup() {
  let scope = ["synthetic-session-a", "firm-a"];
  const memo = createApiGetMemo(60000);
  const get = (load, forceFresh = false) => memo.get({key: "/example", readScope: () => scope, load, forceFresh});
  return { memo, get, setScope: value => { scope = value; } };
}
test("invalidated request cannot repopulate cache or remove new flight", async () => {
  const {memo, get} = setup(), old = deferred(), fresh = deferred();
  const first = get(() => old.promise);
  await Promise.resolve();
  memo.clear();
  const second = get(() => fresh.promise);
  await Promise.resolve();
  old.resolve("old");
  await first;
  assert.equal(get(() => assert.fail("duplicate GET")), second);
  fresh.resolve("new");
  await second;
  assert.equal(await get(() => assert.fail("cache miss")), "new");
});
test("older normal GET cannot replace a newer forced GET", async () => {
  const {get} = setup(), old = deferred();
  const first = get(() => old.promise);
  await Promise.resolve();
  assert.equal(await get(async () => "new", true), "new");
  old.resolve("old");
  await first;
  assert.equal(await get(() => assert.fail("cache miss")), "new");
});
test("old session or company response is rejected and never reused", async () => {
  const {get, setScope} = setup(), pending = deferred();
  const first = get(() => pending.promise);
  await Promise.resolve();
  setScope(["synthetic-session-b", "firm-b"]);
  pending.resolve("old");
  await assert.rejects(first, {code: "API_SCOPE_CHANGED"});
  assert.equal(await get(async () => "new"), "new");
});
test("cached response is never shared with another session", async () => {
  const {get, setScope} = setup();
  assert.equal(await get(async () => "old"), "old");
  setScope(["synthetic-session-b", "firm-a"]);
  assert.equal(await get(async () => "new"), "new");
});
