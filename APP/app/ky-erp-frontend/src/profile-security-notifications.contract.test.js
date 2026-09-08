import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), "utf8");

test("platform management is no longer rendered in the left sidebar", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  assert.match(shell, /modules\.filter\(\(module\) => module\.key !== "admin"\)/);
  assert.match(shell, /Platform Yönetimi/);
  assert.match(shell, /ProfileSecurityPanel/);
});

test("super admin profile identity does not append the active company", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const ownerSecurity = read("./pages/admin/AdminOwnerSecurity.jsx");
  assert.match(shell, /ownerUser \? roleLabel\(user\?\.role\)/);
  assert.doesNotMatch(ownerSecurity, /<span>\{owner\.mainCompanySlug \|\| "-"\}<\/span>/);
});

test("every normal user can view only own sessions from profile security", () => {
  const panel = read("./components/shell/ProfileSecurityPanel.jsx");
  assert.match(panel, /\/auth\/security\/sessions/);
  assert.match(panel, /Oturumu Kapat/);
  assert.match(panel, /Her kullanıcı yalnız kendi oturumlarını görür/);
});

test("notification center has direct approve and reject controls", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const api = read("./services/notificationApi.js");
  assert.match(shell, /decideNotification\(item, "APPROVE"\)/);
  assert.match(shell, /decideNotification\(item, "REJECT"\)/);
  assert.match(api, /type === "LOGIN"/);
  assert.match(api, /type === "MAIL_ACCOUNT"/);
  assert.match(api, /\/mail\/approvals\//);
});
