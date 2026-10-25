import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const responsive = readFileSync(new URL("./responsive-core.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("./ky-pro-shell.css", import.meta.url), "utf8");

test("PC üst şeridi ve sekmeler ayrı satırlarda aynı yüksekliği kullanır", () => {
  assert.match(responsive, /grid-template-rows:\s*64px 42px 34px minmax\(0, 1fr\) 27px !important;/);
  assert.match(shell, /\.shell-v3\[data-layout-mode="pc"\] \.shell-v3-topbar\s*\{[^}]*min-height:\s*64px!important;/);
});

test("Masaüstü profil düğmesi flex kalır ve metin sekme satırına taşmaz", () => {
  assert.match(responsive, /\.shell-v3\[data-layout-mode="pc"\] \.shell-v3-user > \.shell-v3-user-trigger\s*\{[^}]*display:\s*inline-flex !important;/);
  assert.doesNotMatch(responsive, /\.shell-v3\[data-layout-mode="pc"\] \.shell-v3-user > button\s*\{\s*display:\s*block !important;/);
  assert.match(responsive, /\.shell-v3\[data-layout-mode="pc"\] \.shell-v3-user\s*\{[^}]*margin-left:\s*auto;/);
});

test("Çoklu sekmeler profil alanının altına değil yatay kaydırmaya gider", () => {
  assert.match(shell, /\.shell-v3-tabs-bar\s*\{[^}]*overflow:hidden/);
  assert.match(shell, /\.shell-v3-tabs\s*\{[^}]*overflow-x:auto/);
});
