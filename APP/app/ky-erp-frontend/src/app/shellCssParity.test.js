import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("PC/tablet/telefon tek shell ve ayrı cihaz CSS dosyalarıyla çalışır", () => {
  const source = load("../layouts/AppShellV3.jsx");
  for (const name of ["shell-menu-core.css", "shell-device-pc.css", "shell-device-tablet.css", "shell-device-phone.css"]) {
    assert.ok(source.includes(`../styles/${name}`), `${name} ortak shell üzerinde yüklenmeli`);
  }
  assert.match(source, /buildShellMenuSections\(module, visibleGroups\(module, user\)\)/);
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
