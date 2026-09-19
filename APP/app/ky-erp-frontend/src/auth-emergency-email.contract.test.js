import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../public/auth-emergency-email.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("email recovery bridge loads before the React login bundle", () => {
  const bridge = html.indexOf("/auth-emergency-email.js?v=20260919-recovery-v2");
  const app = html.indexOf("/src/main.jsx");
  assert.ok(bridge >= 0);
  assert.ok(app > bridge);
});

test("bridge observes only already verified auth challenges and never reads passwords", () => {
  assert.match(script, /phoneApprovalId/);
  assert.match(script, /challengeId/);
  assert.doesNotMatch(script, /querySelector\([^\n]*password/i);
  assert.doesNotMatch(script, /localStorage\.setItem\([^\n]*password/i);
});

test("recovery UI uses corporate wording and inline one-time-code input", () => {
  assert.match(script, /Kurtarma Seçenekleri/);
  assert.match(script, /E-posta Doğrulama/);
  assert.match(script, /autocomplete=\"one-time-code\"/);
  assert.match(script, /Doğrula ve Giriş Yap/);
  assert.match(script, /Yeni Kod Gönder/);
  assert.doesNotMatch(script, /son çare/i);
  assert.doesNotMatch(script, /acil giriş/i);
  assert.doesNotMatch(script, /window\.prompt/);
});

test("verified email recovery uses canonical approval status then stores only issued session", () => {
  assert.match(script, /\/auth\/email-emergency\/start/);
  assert.match(script, /\/auth\/email-emergency\/verify/);
  assert.match(script, /\/auth\/approval\//);
  assert.match(script, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(script, /sessionStorage\.setItem\(USER_KEY/);
});
