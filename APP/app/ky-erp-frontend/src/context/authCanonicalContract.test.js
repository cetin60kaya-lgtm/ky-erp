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

test("normal sessions refresh silently while owner automatic refresh is disabled", () => {
  assert.match(source, /sessionRefreshDelay/);
  assert.match(source, /NORMAL_REFRESH_BEFORE_MS/);
  assert.match(source, /REFRESH_RETRY_MS/);
  assert.match(source, /isSuperAdmin\(user\.role\)/);
  assert.match(source, /clearPendingRefresh\(\)/);
  assert.match(source, /tokenRef\.current === scheduledToken/);
  assert.doesNotMatch(source, /OWNER_ROLLING_REFRESH_BEFORE_MS/);
});

test("normal users persist across browser restart while owner auth stays session-only", () => {
  assert.match(source, /window\.localStorage\.setItem\(AUTH_TOKEN_KEY/);
  assert.match(source, /window\.sessionStorage\.setItem\(AUTH_TOKEN_KEY/);
  assert.match(source, /isOwnerAuthPair/);
  assert.match(source, /clearPersistentAuth\(\)/);
  assert.match(source, /Owner kimliği browser restart sonrasında otomatik geri yüklenmez/);
  assert.match(source, /payload\.exp/);
});
