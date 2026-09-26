import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShellV3.jsx", import.meta.url), "utf8");

test("topbar notification badge is data driven and security approval is phone-owned", () => {
  assert.doesNotMatch(source, /<span>3<\/span>/);
  assert.match(source, /getNotifications/);
  assert.match(source, /notificationData\.unreadCount/);
  assert.match(source, /markNotificationsRead/);
  assert.doesNotMatch(source, /runPhoneApprovedSecurityAction/);
  assert.doesNotMatch(source, /SESSION_TRUST_APPROVE/);
  assert.doesNotMatch(source, /SESSION_TRUST_REJECT/);
  assert.doesNotMatch(source, /shell-v3-notification-inline-actions/);
  assert.match(source, /shell-v3-notification-readonly/);
  assert.match(source, /Onay ve ret işlemleri yalnız KY ERP Güvenlik uygulamasında tamamlanır/);
});
