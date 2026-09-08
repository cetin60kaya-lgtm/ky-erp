import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), "utf8");

test("mobile login keeps credentials first and touch friendly", () => {
  const page = read("./pages/LoginPage.jsx");
  const css = read("./pages/LoginPage.css");
  assert.match(page, /auth-mobile-brand/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /\.auth-brand-panel\{display:none!important\}/);
  assert.match(css, /min-height:100dvh!important/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /min-height:52px!important/);
});

test("phone approval is named in topbar and mobile setup is full screen", () => {
  const shell = read("./components/shell/ApprovedShellEnhancer.jsx");
  const shellCss = read("./components/shell/approved-shell-menu.css");
  const setupCss = read("./components/shell/phone-approval-setup.css");
  assert.match(shell, /approved-phone-approval-label">Telefon Onayı</);
  assert.match(shellCss, /\.approved-phone-approval-label\{display:inline\}/);
  assert.match(shellCss, /\.approved-global-search\{display:none!important\}/);
  assert.match(setupCss, /height:100dvh/);
  assert.match(setupCss, /font-size:16px/);
});
