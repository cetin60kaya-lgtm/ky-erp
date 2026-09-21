import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const shell=readFileSync(resolve(here,"layouts/AppShellV3.jsx"),"utf8");

test("notification center deduplicates session approvals and removes resolved duplicates immediately",()=>{
  assert.match(shell,/const seenNotificationKeys = new Set\(\)/);
  assert.match(shell,/resolvedNotificationIdsRef\.current\.has\(key\) \|\| seenNotificationKeys\.has\(key\)/);
  assert.match(shell,/const resolutionKey = notificationResolutionKey\(item\)/);
  assert.match(shell,/const duplicateIds = \[\.\.\.new Set\(/);
  assert.match(shell,/current\.items\.filter\(\(entry\) => notificationResolutionKey\(entry\) !== resolutionKey\)/);
  assert.match(shell,/dismissNotifications\(duplicateIds\.length \? duplicateIds : \[item\.id\]\)/);
  assert.doesNotMatch(shell,/setTimeout\(\(\) => \{[\s\S]{0,500}entry\.id !== item\.id[\s\S]{0,200}1600/);
});
