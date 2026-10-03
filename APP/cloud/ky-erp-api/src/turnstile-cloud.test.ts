import assert from "node:assert/strict";
import test from "node:test";
import {
  turnstileHostnameAllowed,
  turnstilePublicConfig,
  turnstileRequiredForOrigin,
} from "./turnstile-cloud.ts";

test("Turnstile is required only for canonical KY ERP browser origins", () => {
  assert.equal(turnstileRequiredForOrigin("https://kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://www.kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("http://localhost:5173"), false);
  assert.equal(turnstileRequiredForOrigin(""), false);
});

test("Turnstile accepts only KY ERP production hostnames", () => {
  assert.equal(turnstileHostnameAllowed("kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("www.kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("legacy.invalid"), false);
  assert.equal(turnstileHostnameAllowed("evil.example"), false);
  assert.equal(turnstileHostnameAllowed(""), false);
});


test("Turnstile public config stays enabled on production but is disabled on Pages preview QA origins", () => {
  const env = { TURNSTILE_SITE_KEY: "prod-site", TURNSTILE_SECRET_KEY: "prod-secret" };
  const context = (origin) => ({ env, req: { header: (name) => name === "Origin" ? origin : "" } });

  assert.deepEqual(turnstilePublicConfig(context("https://kyerp.net")), {
    enabled: true,
    siteKey: "prod-site",
    required: true,
  });
  assert.deepEqual(turnstilePublicConfig(context("https://08389b3c.ky-erp-frontend.pages.dev")), {
    enabled: false,
    siteKey: "",
    required: false,
  });
  assert.deepEqual(turnstilePublicConfig(context("http://localhost:5173")), {
    enabled: false,
    siteKey: "",
    required: false,
  });
});
