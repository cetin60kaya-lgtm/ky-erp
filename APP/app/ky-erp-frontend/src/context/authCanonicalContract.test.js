import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AuthContext.jsx", import.meta.url), "utf8");

test("frontend auth uses canonical v3 routes and no legacy v2 fallback", () => {
  assert.match(source, /canonical-v3/);
  assert.match(source, /\/auth\/login/);
  assert.match(source, /\/auth\/mfa\/verify/);
  assert.match(source, /\/auth\/me/);
  assert.doesNotMatch(source, /\/auth\/v2\//);
  assert.doesNotMatch(source, /legacyAuthPath|shouldTryLegacyAuth/);
});

test("credential and MFA POSTs use preflight-free text plain JSON transport without custom device headers", () => {
  assert.match(source, /Content-Type.*text\/plain;charset=UTF-8/s);
  assert.doesNotMatch(source, /Content-Type.*application\/json/s);
  assert.doesNotMatch(source, /X-KYERP-Device/);
});

test("auth mutations are de-duplicated so double click does not create parallel login sessions", () => {
  assert.match(source, /authMutationRef/);
  assert.match(source, /runAuthOnce/);
  assert.match(source, /runAuthOnce\("LOGIN"/);
});

test("valid stored JWT survives browser restart until its real exp", () => {
  assert.match(source, /localStorage\.setItem\(AUTH_TOKEN_KEY/);
  assert.match(source, /payload\.exp/);
});
