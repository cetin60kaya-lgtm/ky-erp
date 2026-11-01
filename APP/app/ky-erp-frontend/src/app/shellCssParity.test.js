import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("PC/tablet/telefon tek shell ve ayrı cihaz CSS dosyalarıyla çalışır", () => {
  const source = load("../layouts/AppShellV3.jsx");
  for (const name of ["shell-menu-core.css", "shell-device-pc.css", "shell-device-tablet.css", "shell-device-phone.css"]) {
    assert.ok(source.includes(`../styles/${name}`), `${name} ortak shell üzerinde yüklenmeli`);
  }
  assert.ok(source.includes("visibleMenuModules(modules, KY_PRIMARY_MENU_KEYS)"));
  assert.ok(source.includes("visibleMenuModules(modules, KY_SETTINGS_MENU_KEYS)"));
  assert.match(source, /ky-pro-sidebar-submenu/);
  assert.match(source, /buildShellMenuSections\(module, visibleGroups\(module, user\)\)/);
  assert.doesNotMatch(source, /ky-pro-module-tabs-scroll/);
  assert.doesNotMatch(source, /flatModuleTabs|hasPrimarySidebarGroups/);
});

test("Mobil kapalı menü klavye odağı almaz; menü düğmesi açık durumunu bildirir", () => {
  const source = load("../layouts/AppShellV3.jsx");
  assert.match(source, /inert=\{effectiveMode !== "pc" && !mobileMenuOpen\}/);
  assert.match(source, /aria-controls="ky-shell-main-menu" aria-expanded=\{mobileMenuOpen\}/);
});

test("Telefon ve tablette profil düğmesi CSS tarafından komple gizlenmez", () => {
  const original = load("../styles/shell-v3.css");
  const responsive = load("../styles/responsive-core.css");
  const phone = load("../styles/shell-device-phone.css");
  assert.doesNotMatch(original, /\.shell-v3-user\s*>\s*button\s*\{\s*display:\s*none/);
  assert.doesNotMatch(responsive, /\.shell-v3-user\s*>\s*button\s*\{\s*display:\s*none/);
  assert.match(phone, /\.shell-v3-user\s*>\s*\.shell-v3-user-trigger\s*\{/);
  assert.match(phone, /min-width:\s*44px/);
});

test("iPhone güvenli alanları ve 44px menü hedefleri cihaz kabuklarında bulunur", () => {
  for (const name of ["shell-device-tablet.css", "shell-device-phone.css"]) {
    const css = load(`../styles/${name}`);
    assert.match(css, /100dvh/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /min-height:\s*44px/);
  }
});

test("alt işlem sekmeleri yalnız sol menüde, gerçek sayfa doğrudan çalışma alanında kalır", () => {
  const source = load("../layouts/AppShellV3.jsx");
  const sidebar = source.indexOf('<nav className="shell-v3-sidebar-nav"');
  const submenu = source.indexOf('ky-pro-sidebar-submenu');
  const main = source.indexOf('<main className="shell-v3-main"');
  const workspace = source.indexOf('<section className="shell-v3-workspace">');
  const actualPage = source.indexOf("{children}", workspace);
  const end = source.indexOf("</section>", actualPage);
  assert.ok(sidebar >= 0 && submenu >= 0 && main > sidebar && workspace > main && actualPage > workspace && end > actualPage);
  assert.ok(source.includes("renderSidebarModule(module)"));
  assert.ok(source.includes("renderSidebarModule(module, true)"));
  assert.ok(source.includes("buildShellMenuSections(module, visibleGroups(module, user))"));
  assert.ok(source.includes("getTabs(module, user)"));
  assert.doesNotMatch(source, /ky-pro-module-tabs/);
  const css = load("../styles/ky-pro-shell.css");
  assert.doesNotMatch(css, /ky-pro-module-tabs/);
  assert.ok(css.includes(".ky-pro-settings-group{margin-top:11px;padding-top:10px;border-top:1px solid #374a63}"));
  assert.ok(load("../styles/shell-v3.css").includes("grid-template-rows: 58px 38px 26px minmax(0, 1fr) 28px;"));
  const app = load("../AppV3.jsx");
  for (const key of ["muhasebe", "e-belge", "gunluk-operasyon", "ik", "pdks", "desen", "uretim", "boyahane", "compliance", "iletisim"]) {
    assert.ok(app.includes(`activeModule?.key === "${key}"`), `${key}: mevcut modülün gerçek ekran bağlantısı korunmalı`);
  }

});
