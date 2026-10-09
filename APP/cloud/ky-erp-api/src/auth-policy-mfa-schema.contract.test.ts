import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const auth = readFileSync(resolve(here, "auth-policy-cloud.ts"), "utf8");
const status = readFileSync(resolve(here, "main.ts"), "utf8");
const migration = readFileSync(resolve(here, "../migrations/0029_auth_security_policy_guard.sql"), "utf8");

test("canonical D1 schema forbids password-only login and requires MFA lifetime", () => {
  assert.match(migration, /CREATE TRIGGER trg_auth_security_mfa_update/);
  assert.match(migration, /NEW.login_policy/);
  assert.match(migration, /NOT IN \('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA'\)/);
  assert.match(migration, /COALESCE\(NEW.session_seconds,0\) <> 36000/);
  assert.match(status, /passwordOnlyEnabled:\s*false/);
});

test("owner policy PATCH blocks forbidden password-only before any D1 write", () => {
  const start = auth.indexOf('app.patch("/api/admin/security/users/:id/policy"');
  assert.ok(start >= 0);
  const end = auth.indexOf('app.get("/api/admin/security/owner-recovery"', start);
  const route = auth.slice(start, end);
  const guard = route.indexOf('upper(body.loginPolicy) === "PASSWORD_ONLY"');
  const update = route.indexOf("UPDATE auth_user_security SET login_policy=");
  assert.ok(guard >= 0 && guard < update);
  assert.match(route, /AUTH_MFA_POLICY_REQUIRED/);
  assert.match(route, /409/);
  assert.match(route, /if \(!isSuper\(current.role\)\)/);
});
