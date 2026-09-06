import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fallback = fs.readFileSync(path.join(here, "auth-policy-recovery-code.ts"), "utf8");
const policy = fs.readFileSync(path.join(here, "auth-policy-cloud.ts"), "utf8");

test("application owner cannot use legacy one-time recovery codes", () => {
  assert.match(fallback, /OWNER_RECOVERY_CODE_BLOCKED/);
  assert.match(fallback, /OWNER_RECOVERY_QUESTIONS_REQUIRED/);
  assert.match(fallback, /!isOwner\(roleOf\(user\)\)/);
  assert.match(fallback, /available:\s*false/);
});

test("saving owner questions retires any remaining legacy recovery codes", () => {
  assert.match(policy, /UPDATE auth_recovery_codes SET used_at=COALESCE\(used_at,\?\)/);
  assert.match(policy, /legacyRecoveryCodesDisabled:\s*true/);
});
