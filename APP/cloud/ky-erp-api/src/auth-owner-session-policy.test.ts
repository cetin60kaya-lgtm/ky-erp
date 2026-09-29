import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const refreshSource = fs.readFileSync(path.join(here, "auth-session-refresh.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(here, "main.ts"), "utf8");
const authSource = fs.readFileSync(path.join(here, "auth-cloud.ts"), "utf8");
const policySource = fs.readFileSync(path.join(here, "auth-policy-cloud.ts"), "utf8");

test("owner refresh endpoint is fail-closed", () => {
  assert.match(refreshSource, /OWNER_SESSION_REFRESH_DISABLED/);
  assert.match(refreshSource, /if \(isOwner\(current\.role\)\)/);
  assert.match(refreshSource, /if \(isOwner\(prepared\.role\)\)/);
  assert.match(refreshSource, /export const OWNER_REFRESH_SECONDS = 0/);
  assert.match(refreshSource, /if \(isOwner\(role\)\) return OWNER_REFRESH_SECONDS/);
});

test("auth status advertises non-persistent owner policy", () => {
  assert.match(mainSource, /ownerRollingSeconds:\s*OWNER_ROLLING_SESSION_SECONDS/);
  assert.match(mainSource, /ownerPersistentBrowserSession:\s*false/);
  assert.match(mainSource, /ownerAutomaticRefresh:\s*false/);
  assert.match(mainSource, /const OWNER_ROLLING_SESSION_SECONDS = 0/);
});


test("super admin and company owner never require internal login approval", () => {
  assert.match(policySource, /Boolean\(refreshed\?\.approval_required\) && !isSuper\(role\) && !isCompanyAdmin\(role\)/);
  assert.match(policySource, /isSuper\(targetRole\) \|\| isCompanyAdmin\(targetRole\) \? 0/);
  assert.match(authSource, /isSuper\(approvalRole\) \|\| isCompanyAdmin\(approvalRole\) \? 0 : 1/);
  assert.match(authSource, /approvalRequired: isSuper\(role\) \|\| isCompanyAdmin\(role\) \? false/);
});
