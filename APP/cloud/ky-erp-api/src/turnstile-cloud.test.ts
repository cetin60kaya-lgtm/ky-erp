import assert from "node:assert/strict";
import test from "node:test";
import {
  turnstileHostnameAllowed,
  turnstileRequiredForOrigin,
} from "./turnstile-cloud.ts";

test("Turnstile is required only for canonical KY ERP browser origins", () => {
  assert.equal(turnstileRequiredForOrigin("https://kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://www.kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://app.kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("http://localhost:5173"), false);
  assert.equal(turnstileRequiredForOrigin(""), false);
});

test("Turnstile accepts only KY ERP production hostnames", () => {
  assert.equal(turnstileHostnameAllowed("kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("www.kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("app.kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("evil.example"), false);
  assert.equal(turnstileHostnameAllowed(""), false);
});
