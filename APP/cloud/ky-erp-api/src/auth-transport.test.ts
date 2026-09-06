import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const recoverySource = readFileSync(new URL("./auth-policy-recovery-code.ts", import.meta.url), "utf8");

test("Fetch Request.json parses preflight-safe text/plain JSON auth bodies", async () => {
  const request = new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ username: "test", password: "value" }),
  });
  assert.deepEqual(await request.json(), { username: "test", password: "value" });
});

test("Worker exposes the canonical-v3 auth handshake and current MFA session contract", () => {
  assert.match(mainSource, /canonical-v3/);
  assert.match(mainSource, /\/api\/auth\/status/);
  assert.match(mainSource, /PASSWORD_SESSION_SECONDS = 0/);
  assert.match(mainSource, /MFA_SESSION_SECONDS = 36_000/);
  assert.match(mainSource, /OWNER_ROLLING_SESSION_SECONDS = 0/);
  assert.match(mainSource, /ownerPersistentBrowserSession:\s*false/);
  assert.match(mainSource, /ownerAutomaticRefresh:\s*false/);
  assert.match(mainSource, /X-KYERP-Auth-Version/);
});

test("owner recovery cannot downgrade MFA sessions back to eight hours", () => {
  assert.match(recoverySource, /MFA_SESSION_SECONDS = 36_000/);
  assert.doesNotMatch(recoverySource, /session_seconds>28800|session_seconds > 28800/);
});
