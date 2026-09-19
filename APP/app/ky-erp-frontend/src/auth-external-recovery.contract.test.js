import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/auth-external-recovery.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("external recovery bridge is loaded with cache busting", () => {
  assert.match(index, /auth-external-recovery\.js\?v=20260919-google-microsoft-v1/);
});

test("Google and Microsoft buttons are config gated", () => {
  assert.match(source, /\/auth\/external\/providers/);
  assert.match(source, /available\.google/);
  assert.match(source, /available\.microsoft/);
  assert.match(source, /Google ile Doğrula/);
  assert.match(source, /Microsoft ile Doğrula/);
});

test("provider callback messages are accepted only from KY ERP API", () => {
  assert.match(source, /event\.origin !== API_ORIGIN/);
  assert.match(source, /KYERP_EXTERNAL_RECOVERY/);
});

test("provider verification completes through canonical approval before storing session", () => {
  const approval = source.indexOf("/auth/approval/");
  const tokenStore = source.indexOf("sessionStorage.setItem(TOKEN_KEY");
  assert.ok(approval >= 0 && tokenStore > approval);
  assert.match(source, /stageOf\(session\) !== "AUTHENTICATED"/);
});
