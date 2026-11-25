import assert from "node:assert/strict";
import test from "node:test";
import { createUnauthorizedSessionVerifier } from "./authUnauthorizedVerifier.js";

const failure = (status) => Object.assign(new Error("session check"), { status });

test("valid auth/me keeps the session even after a business-route 401", async () => {
  let cleared = 0;
  const verify = createUnauthorizedSessionVerifier({
    readToken: () => "old-token", verify: async () => ({ ok: true }),
    invalidate: () => { cleared += 1; },
  });
  assert.equal(await verify(), false);
  assert.equal(cleared, 0);
});

test("only a confirmed auth/me 401 invalidates an unchanged token", async () => {
  let cleared = 0;
  const verify = createUnauthorizedSessionVerifier({
    readToken: () => "old-token", verify: async () => { throw failure(401); },
    invalidate: () => { cleared += 1; },
  });
  assert.equal(await verify(), true);
  assert.equal(cleared, 1);
});

test("concurrent token rotation prevents obsolete 401 from clearing a newer session", async () => {
  let token = "old-token";
  let cleared = 0;
  const verify = createUnauthorizedSessionVerifier({
    readToken: () => token, verify: async () => { throw failure(401); },
    pause: async () => { token = "new-token"; },
    invalidate: () => { cleared += 1; },
  });
  assert.equal(await verify(), false);
  assert.equal(cleared, 0);
});

test("network failure or 5xx does not erase the authenticated state", async () => {
  for (const status of [0, 403, 500, 502, 503]) {
    let cleared = 0;
    const verify = createUnauthorizedSessionVerifier({
      readToken: () => "token", verify: async () => { throw failure(status); },
      invalidate: () => { cleared += 1; },
    });
    assert.equal(await verify(), false);
    assert.equal(cleared, 0);
  }
});

test("simultaneous business errors use one canonical auth/me request", async () => {
  let probes = 0;
  let resolve;
  const block = new Promise((r) => { resolve = r; });
  const verify = createUnauthorizedSessionVerifier({
    readToken: () => "token",
    verify: async () => { probes += 1; return block; },
    invalidate: () => { throw new Error("unexpected logout"); },
  });
  const first = verify();
  const second = verify();
  assert.equal(first, second);
  resolve({ ok: true });
  await Promise.all([first, second]);
  assert.equal(probes, 1);
});

test("verified browser cookie can recover before logout",async()=>{let token="old",cleared=0;const check=createUnauthorizedSessionVerifier({readToken:()=>token,verify:async()=>{throw failure(401)},recover:async()=>{token="new";return true},invalidate:()=>cleared++});assert.equal(await check(),false);assert.equal(cleared,0)});
test("old recovery cannot clear a newer token",async()=>{let token="old",cleared=0;const check=createUnauthorizedSessionVerifier({readToken:()=>token,verify:async()=>{throw failure(401)},recover:async()=>{token="new";return false},invalidate:()=>cleared++});assert.equal(await check(),false);assert.equal(cleared,0)});
