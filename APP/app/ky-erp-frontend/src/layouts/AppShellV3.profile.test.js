import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShellV3.jsx", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../styles/shell-v3.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../styles/responsive-core.css", import.meta.url), "utf8");

test("topbar account chip opens one profile and security surface", () => {
  assert.match(source, /shell-v3-user-trigger/);
  assert.match(source, /shell-v3-user-menu/);
  assert.match(source, /Profil & Süper Yönetici Güvenliği/);
  assert.match(source, /Platform Yönetimi/);
  assert.match(source, /Telefon Onayı/);
  assert.match(source, /Görünüm & Uygulamalar/);
  assert.match(source, /onLogout/);
  assert.doesNotMatch(source, />Çıkış<\/button>/);
});

test("profile avatar supports a real image with initials fallback", () => {
  assert.match(source, /profileImageUrl/);
  assert.match(source, /profileImageFailed/);
  assert.match(source, /profileInitials/);
  assert.match(source, /<img src=\{profileImageUrl\}/);
});

test("profile menu stays usable on tablet and phone", () => {
  assert.match(shellCss, /\.shell-v3-user-menu/);
  assert.match(responsiveCss, /Profil menüsü responsive kontratı/);
  assert.match(responsiveCss, /data-layout-mode="tablet"/);
  assert.match(responsiveCss, /data-layout-mode="phone"/);
  assert.match(responsiveCss, /min-height: 54px !important/);
});


test("display settings is also the central app installation hub", () => {
  assert.match(source, /canInstallMainApp=\{Boolean\(installPrompt\)\}/);
  assert.match(source, /onInstallMainApp=\{installPwa\}/);
  assert.match(source, /onOpenSecurityCenter/);
});
