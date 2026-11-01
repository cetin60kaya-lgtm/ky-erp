import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("./main-entry-security.ts", import.meta.url), "utf8");

test("scheduled cloud sync includes enabled bindings or a previously started partial scan", () => {
  assert.match(cloud, /runFileHubCloudScheduledSync/);
  assert.match(cloud, /c\.sync_mode='CLOUD_API'/);
  assert.match(cloud, /c\.is_active=1/);
  assert.match(cloud, /LEFT JOIN file_hub_bindings/);
  assert.match(cloud, /b\.sync_enabled=1/);
  assert.match(cloud, /b\.id IS NOT NULL OR json_extract\(c\.metadata,'\$\.cloudSyncCursor'\) IS NOT NULL/);
  assert.match(cloud, /LIMIT 4/);
});

test("scheduled sync avoids rewriting unchanged cloud files", () => {
  assert.match(cloud, /needsModelSync:changed \|\| Number\(location\.model_relation_count\|\|0\)===0/);
  assert.match(cloud, /if\(indexed\.changed\) changedFiles\+=1/);
  assert.match(cloud, /if\(indexed\.needsModelSync\)/);
});

test("existing five minute Worker cron also runs File Hub cloud sync", () => {
  assert.match(entry, /runFileHubCloudScheduledSync/);
  assert.ok(entry.includes("runSecurityWorkspaceReminderSweep(env)"));
  assert.ok(entry.includes("runFileHubCloudScheduledSync(env)"));
  assert.ok(entry.includes("retryPhysicalOperations(env)"));
});
