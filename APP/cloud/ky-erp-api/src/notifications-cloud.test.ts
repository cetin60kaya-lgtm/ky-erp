import assert from "node:assert/strict";
import test from "node:test";
import { hasNotificationPermission, sanitizeNotificationReadIds } from "./notifications-cloud.ts";

test("notification read ids only keep supported live notification ids", () => {
  assert.deepEqual(
    sanitizeNotificationReadIds([
      "login-approval:a1",
      "ebelge-issue:d1:2:2026-09-06",
      "payment-due:p1:2026-09-06",
      "fake:3",
      "",
      "login-approval:a1",
    ]),
    [
      "login-approval:a1",
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
