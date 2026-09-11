import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShellV3.jsx", import.meta.url), "utf8");

test("topbar notification badge is data driven, not hard coded", () => {
  assert.doesNotMatch(source, /<span>3<\/span>/);
  assert.match(source, /getNotifications/);
  assert.match(source, /notificationData\.unreadCount/);
  assert.match(source, /markNotificationsRead/);
  assert.match(source, /runPhoneApprovedSecurityAction/);
  assert.match(source, /SESSION_TRUST_APPROVE/);
  assert.match(source, /SESSION_TRUST_REJECT/);
  assert.match(source, /meta\?\.sessionId/);
});
