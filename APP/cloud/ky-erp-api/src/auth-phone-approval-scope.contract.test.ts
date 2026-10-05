import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,"auth-push-cloud.ts"),"utf8");

test("phone approval list follows SELF COMPANY SYSTEM scope",()=>{
  assert.match(source,/function canApprovePhoneChallenge/);
  assert.match(source,/text\(challenge\.userId\) === text\(actor\.userId\)/);
  assert.match(source,/isSuper\(actor\.role\).*ownerControlAuthorized === true/s);
  assert.match(source,/isCompanyAdmin\(actor\.role\).*companyApprover === true/s);
  assert.match(source,/text\(actor\.companySlug\) === text\(challenge\.mainCompanySlug\)/);
  assert.match(source,/!\["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"\]\.includes\(targetRole\)/);
});

test("system and company observers are woken without replacing target user's self device requirement",()=>{
  assert.match(source,/const selfDevices = await activeDevicesForUser/);
  assert.match(source,/if \(!selfDevices\.length\) return null/);
  assert.match(source,/approvalObserverDevices/);
  assert.match(source,/const observerCandidates = await approvalObserverDevices/);
  assert.match(source,/const selfEndpoints = new Set/);
  assert.match(source,/observerCandidates\.filter/);
});

test("pending challenge dedupe is isolated per target user",()=>{
  assert.match(source,/latestSelfPendingByUser = new Map/);
  assert.match(source,/latestSelfPendingByUser\.get\(targetUserId\)/);
  assert.match(source,/latestSelfPendingByUser\.set\(targetUserId/);
  assert.match(source,/dedupeKey: `self:\$\{text\(current\.userId\)\}`/);
});

test("phone decision endpoint authorizes scope before applying decision",()=>{
  assert.match(source,/const targetUser = await userRow\(c, text\(row\.userId\)\)/);
  assert.match(source,/if \(!canApprovePhoneChallenge\(actor, row, targetUser\)\)/);
  assert.match(source,/PHONE_APPROVAL_FORBIDDEN/);
});
