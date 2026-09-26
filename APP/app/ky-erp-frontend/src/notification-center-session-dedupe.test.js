import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const shell=readFileSync(resolve(here,"layouts/AppShellV3.jsx"),"utf8");

test("notification center deduplicates security/session records while approvals remain phone-owned",()=>{
  assert.match(shell,/const seenNotificationKeys = new Set\(\)/);
  assert.match(shell,/const key = notificationResolutionKey\(item\)/);
  assert.match(shell,/resolvedNotificationIdsRef\.current\.has\(key\) \|\| seenNotificationKeys\.has\(key\)/);
  assert.match(shell,/seenNotificationKeys\.add\(key\)/);
  assert.doesNotMatch(shell,/decideNotificationApproval/);
  assert.doesNotMatch(shell,/shell-v3-notification-inline-actions/);
  assert.match(shell,/shell-v3-notification-readonly/);
});
