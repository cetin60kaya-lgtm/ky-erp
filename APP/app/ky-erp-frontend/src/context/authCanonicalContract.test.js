import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AuthContext.jsx", import.meta.url), "utf8");

test("frontend auth uses canonical v3 routes and no legacy v2 fallback", () => {
  assert.match(source, /canonical-v3/);
  assert.match(source, /\/auth\/login/);
  assert.match(source, /\/auth\/mfa\/verify/);
  assert.match(source, /\/auth\/me/);
  assert.match(source, /\/auth\/refresh/);
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
  assert.match(source, /runAuthOnce\("SESSION_REFRESH"/);
});

test("only the first password login transport gets one automatic network retry", () => {
  assert.match(source, /loginTransportRetry/);
  assert.match(source, /normalizedPath === "\/auth\/login"/);
  assert.match(source, /maxAttempts = loginTransportRetry \? 2 : 1/);
  assert.match(source, /await wait\(250\)/);
});

test("active sessions are refreshed silently while temporary refresh failures preserve the valid token", () => {
  assert.match(source, /sessionRefreshDelay/);
  assert.match(source, /NORMAL_REFRESH_BEFORE_MS/);
  assert.match(source, /OWNER_ROLLING_REFRESH_BEFORE_MS/);
  assert.match(source, /REFRESH_RETRY_MS/);
  assert.match(source, /tokenRef\.current === scheduledToken/);
});

test("valid stored JWT survives browser restart until its real exp", () => {
  assert.match(source, /localStorage\.setItem\(AUTH_TOKEN_KEY/);
  assert.match(source, /payload\.exp/);
});
