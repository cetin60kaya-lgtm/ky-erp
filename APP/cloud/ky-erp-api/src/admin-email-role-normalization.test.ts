import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "admin-management-cloud.ts"), "utf8");

test("admin email routes use ASCII-safe technical role normalization", () => {
  assert.match(source, /function upper\(value: unknown\) \{ return text\(value\)\.toUpperCase\(\)\.replace\(\/İ\/g, "I"\); \}/);
  assert.doesNotMatch(source, /function upper\(value: unknown\).*toLocaleUpperCase\("tr-TR"\)/);
  assert.match(source, /\["SUPER_ADMIN", "ADMIN"\]\.includes\(upper\(role\)\)/);
});

test("email verification remains real Resend delivery with provider acceptance", () => {
  assert.match(source, /env\.RESEND_API_KEY/);
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /deliveryStatus:"PROVIDER_ACCEPTED"/);
  assert.match(source, /providerMessageId:accepted\.messageId/);
  assert.match(source, /purpose='USER_EMAIL_VERIFY'/);
  assert.match(source, /email_verified=1/);
});
