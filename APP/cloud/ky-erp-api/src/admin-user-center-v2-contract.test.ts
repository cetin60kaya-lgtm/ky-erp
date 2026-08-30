import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");
const workerConfig = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");

const ui = frontend("pages/admin/AdminUsersPanelV2.jsx");
const service = frontend("services/adminApi.js");
const management = api("admin-management-cloud.ts");

test("user filter is isolated from browser credential autofill", () => {
  assert.match(ui, /type="search" name="kyerp-admin-user-filter" autoComplete="off"/);
  assert.match(ui, /data-lpignore="true" data-1p-ignore="true"/);
  assert.match(ui, /if\(document\.activeElement!==event\.currentTarget\)return;setSearch/);
  assert.match(ui, /type="password" autoComplete="new-password"/);
});

test("new user starts with blank password and exposes company role permissions and security before create", () => {
  assert.match(ui, /password:""/);
  assert.match(ui, /Ana Firma/);
  assert.match(ui, /Başlangıç Yetkileri/);
  assert.match(ui, /Giriş Politikası/);
  assert.match(ui, /Yeni cihaz girişinde yönetici onayı/);
  assert.match(ui, /createUserComplete\(\{\.\.\.createForm,permissions:createPermissions\}\)/);
});

test("complete user creation is one atomic D1 batch including HR scope and permissions", () => {
  assert.match(service, /\/admin\/users\/create-complete/);
  assert.match(management, /app\.post\("\/api\/admin\/users\/create-complete"/);
  assert.match(management, /await c\.env\.DB\.batch\(statements\)/);
  assert.match(management, /INSERT INTO ik_user_hr_scope/);
  assert.match(management, /INSERT INTO auth_user_module_permissions/);
  assert.match(management, /role==="DENETIM"\?"AUDIT":"FULL"/);
});

test("email verification does not claim delivery without provider acceptance identity", () => {
  assert.match(management, /PROVIDER_ACCEPTED/);
  assert.match(management, /providerMessageId:accepted\.messageId/);
  assert.match(management, /Resend kabul kimliği dönmedi/);
  assert.match(ui, /deliveryStatus!=="PROVIDER_ACCEPTED"\|\|!result\?\.providerMessageId/);
  assert.match(ui, /teslimat henüz ayrıca doğrulanmış değildir/);
  assert.match(ui, /Gerçek e-posta servisi bağlı değil; sahte başarı mesajı gösterilmez/);
});

test("system email sender is owner-controlled admin@kyerp.net and verification route is owner-only", () => {
  assert.match(workerConfig, /"RECOVERY_EMAIL_FROM"\s*:\s*"KY ERP <admin@kyerp\.net>"/);
  assert.match(management, /E-posta doğrulaması yalnız uygulama sahibi tarafından başlatılabilir/);
  assert.match(management, /!current \|\| !isOwner\(current\.role\)/);
});
