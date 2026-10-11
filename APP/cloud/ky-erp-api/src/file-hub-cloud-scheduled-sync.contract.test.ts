import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("./main-entry-security.ts", import.meta.url), "utf8");

test("scheduled cloud sync uses only active CLOUD_API bindings", () => {
  assert.match(cloud, /runFileHubCloudScheduledSync/);
  assert.match(cloud, /c\.sync_mode='CLOUD_API'/);
  assert.match(cloud, /b\.sync_enabled=1/);
  assert.match(cloud, /LIMIT 12/);
});

test("scheduled sync avoids rewriting unchanged cloud files", () => {
  assert.match(cloud, /needsModelSync:changed \|\| Number\(location\.model_relation_count\|\|0\)===0/);
  assert.match(cloud, /if\(indexed\.changed\) changedFiles\+=1/);
  assert.match(cloud, /if\(indexed\.needsModelSync\)/);
});

test("existing five minute Worker cron also runs File Hub cloud sync", () => {
  assert.match(entry, /runFileHubCloudScheduledSync/);
  assert.match(entry, /Promise\.all\(\[runSecurityWorkspaceReminderSweep\(env\), runFileHubCloudScheduledSync\(env\)\]\)/);
});
