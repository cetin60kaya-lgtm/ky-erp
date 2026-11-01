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
  assert.match(source, /ky-pro-module-tabs-scroll/);
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

test("bölüm sekmeleri mevcut ekranın çalışma alanında kalır; grid satırını sıkıştırmaz", () => {
  const source = load("../layouts/AppShellV3.jsx");
  const start = source.indexOf('<section className="shell-v3-workspace">');
  const moduleTabs = source.indexOf('<nav className="ky-pro-module-tabs"', start);
  const actualPage = source.indexOf("{children}", moduleTabs);
  const end = source.indexOf("</section>", actualPage);
  assert.ok(start >= 0 && moduleTabs > start && actualPage > moduleTabs && end > actualPage,
    "Bölüm işlem sekmeleri ve mevcut modül ekranları aynı workspace içinde olmalı");
  assert.equal(source.indexOf('<nav className="ky-pro-module-tabs"', 0), moduleTabs,
    "İşlem sekmeleri workspace dışında ikinci bir grid satırı oluşturmamalı");
  assert.ok(load("../styles/shell-v3.css").includes("grid-template-rows: 58px 38px 26px minmax(0, 1fr) 28px;"));
  assert.ok(source.includes("getTabs(activeModule, user).map"),
    "Modül işlem sekmeleri aynı mevcut route tanımlarından gelmeli");
  const app = load("../AppV3.jsx");
  for (const key of ["muhasebe", "e-belge", "gunluk-operasyon", "ik", "pdks", "desen", "uretim", "boyahane", "compliance", "iletisim"]) {
    assert.ok(app.includes(`activeModule?.key === "${key}"`),
      `${key}: mevcut modül ekranının AppV3 render bağlantısı korunmalı`);
  }
});
