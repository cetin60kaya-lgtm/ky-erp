import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const menu = file("./GlobalLeftClickMenu.jsx");
const firm = file("../../pages/modules/muhasebe/CompaniesCurrentWorkspace.jsx");
const pdf = file("../../pages/modules/muhasebe/EBelgeCenterPage.jsx");

test("genel sağ tık kısayolları içerik üzerindeki rasgele tıklamayı ele geçirmez", () => {
  assert.match(menu, /NATIVE_CONTEXT_SELECTOR/);
  assert.match(menu, /target\.closest\(NATIVE_CONTEXT_SELECTOR\)/);
  assert.match(menu, /!target\.matches\(EMPTY_CANVAS_SELECTOR\)/);
  assert.match(menu, /contextualMenuFor\(target\)/);
  assert.match(menu, /menu\.context \? \[\.\.\.menu\.context\.items, \.\.\.shortcuts\] : actions/);
});

test("firma listesi ve seçili kart farklı bağlamları tanımlar", () => {
  assert.match(firm, /data-ky-context-kind="company-row"/);
  assert.match(firm, /data-ky-context-kind=\{selected \? "company-detail" : undefined\}/);
  assert.match(menu, /marked\.closest\("\.ccw-root"\)/);
  for (const action of ["cari-hareket", "finans", "reminder", "edit", "status", "merge", "hard-delete"]) {
    assert.match(firm, new RegExp(`data-ky-context-action="${action}"`));
  }
  assert.match(firm, /<details className="ccw-context-more"/);
  assert.match(menu, /action\.target\?\.isConnected/);
  assert.match(menu, /action\.target\.click\(\)/);
});

test("orijinal PDF, kendi görüntüleme ve yazdırma eylemlerini açar", () => {
  assert.match(pdf, /className="eb-original-file-primary" data-ky-context-kind="pdf"/);
  assert.match(pdf, /data-ky-context-kind="pdf-preview"/);
  assert.match(pdf, /data-ky-context-action="pdf-print"/);
  assert.match(pdf, /data-ky-context-action="pdf-open"/);
  assert.match(pdf, /frame\.contentWindow\.print\(\)/);
  assert.match(menu, /PDF'yi Görüntüle \/ Yazdır/);
});
