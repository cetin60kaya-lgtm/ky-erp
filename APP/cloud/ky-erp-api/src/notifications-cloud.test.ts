import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasNotificationPermission, sanitizeNotificationReadIds } from "./notifications-core.ts";

test("notification read ids only keep supported live notification ids", () => {
  assert.deepEqual(
    sanitizeNotificationReadIds([
      "login-approval:a1",
      "session-trust:s1",
      "ebelge-issue:d1:2:2026-09-06",
      "payment-due:p1:2026-09-06",
      "fake:3",
      "",
      "login-approval:a1",
    ]),
    [
      "login-approval:a1",
      "session-trust:s1",
      "ebelge-issue:d1:2:2026-09-06",
      "payment-due:p1:2026-09-06",
    ],
  );
});

test("notification permissions respect module visibility and owner role", () => {
  assert.equal(hasNotificationPermission({ role: "SUPER_ADMIN", permissions: [] }, ["MUHASEBE"]), true);
  assert.equal(
    hasNotificationPermission({ role: "VIEWER", permissions: [{ moduleKey: "MUHASEBE", canView: true }] }, ["MUHASEBE"]),
    true,
  );
  assert.equal(
    hasNotificationPermission({ role: "VIEWER", permissions: [{ moduleKey: "MUHASEBE", canView: false }] }, ["MUHASEBE"]),
    false,
  );
});

const cloudSource = readFileSync(new URL("./notifications-cloud.ts", import.meta.url), "utf8");

test("session trust approvals are surfaced as actionable security notifications", () => {
  assert.match(cloudSource, /collectSessionTrustApprovals/);
  assert.match(cloudSource, /SESSION_APPROVE/);
  assert.match(cloudSource, /session-trust:/);
  assert.match(cloudSource, /securityAction: "SESSION_TRUST"/);
});

test("company login notifications keep privileged targets system-only", () => {
  assert.ok(cloudSource.includes("NOT IN ('SUPER_ADMIN','ADMIN','COMPANY_ADMIN')"));
});
