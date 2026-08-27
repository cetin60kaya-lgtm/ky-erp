import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AuthContext.jsx", import.meta.url), "utf8");

test("frontend auth uses the canonical status handshake and no legacy v2 route", () => {
  assert.match(source, /\/auth\/status/);
  assert.match(source, /canonical-v3/);
  assert.doesNotMatch(source, /\/auth\/v2\//);
  assert.doesNotMatch(source, /legacyAuthPath|shouldTryLegacyAuth/);
});

test("credential and MFA POSTs use canonical application/json transport without custom device headers", () => {
  assert.match(source, /Content-Type.*application\/json/s);
  assert.doesNotMatch(source, /text\/plain;charset=UTF-8/);
  assert.doesNotMatch(source, /X-KYERP-Device/);
});

test("valid stored JWT survives browser restart until its real exp", () => {
  assert.match(source, /localStorage\.setItem\(AUTH_TOKEN_KEY/);
  assert.match(source, /payload\.exp/);
});
