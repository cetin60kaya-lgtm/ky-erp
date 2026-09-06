import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const refreshSource = fs.readFileSync(path.join(here, "auth-session-refresh.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(here, "main.ts"), "utf8");

test("owner refresh endpoint is fail-closed", () => {
  assert.match(refreshSource, /OWNER_SESSION_REFRESH_DISABLED/);
  assert.match(refreshSource, /if \(isOwner\(current\.role\)\)/);
  assert.match(refreshSource, /sessionRefreshSeconds\("SUPER_ADMIN"/);
});

test("auth status advertises non-persistent owner policy", () => {
  assert.match(mainSource, /ownerRollingSeconds:\s*OWNER_ROLLING_SESSION_SECONDS/);
  assert.match(mainSource, /ownerPersistentBrowserSession:\s*false/);
  assert.match(mainSource, /ownerAutomaticRefresh:\s*false/);
  assert.match(mainSource, /const OWNER_ROLLING_SESSION_SECONDS = 0/);
});
