import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ProductionDirectEntryPanel.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./ProductionControlCenterPageV2.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./productionDirectEntry.css", import.meta.url), "utf8");

test("üretim girişi artık sayfa içinde akordeon değil, gerçek erişilebilir modal", () => {
  assert.match(panel, /import \{ createPortal \} from "react-dom"/);
  assert.match(panel, /if \(!modalOpen\) return null/);
  assert.match(panel, /return createPortal\(/);
  assert.match(panel, /className="pde-modal-overlay"/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-labelledby="pde-modal-title"/);
  assert.doesNotMatch(panel, /aria-controls="pde-expandable"/);
  assert.doesNotMatch(panel, /className="pde-head-trigger"/);
  assert.match(css, /\.pde-modal-overlay\{position:fixed/);
  assert.match(css, /\.pde-modal\.pde-shell\{/);
});
test("Üretim Girişi ve model Üretim Gir düğmeleri modal açar", () => {
  assert.match(page, /const \[directEntryModalOpen, setDirectEntryModalOpen\] = useState\(false\)/);
  assert.match(page, /setDirectEntryModalOpen\(true\)/);
  assert.match(page, /modalOpen=\{directEntryModalOpen\}/);
  assert.match(page, /onClose=\{\(\) => setDirectEntryModalOpen\(false\)\}/);
  assert.match(page, /onClick=\{\(\) => focusQuick\(row\)\}/);
});
test("seri giriş ve son kaydedilenler aynı modal içinde, alt aksiyon sabit", () => {
  const modal = panel.indexOf('<section className="pde-modal pde-shell"');
  const scroll = panel.indexOf('<div className="pde-modal-scroll">', modal);
  const queue = panel.indexOf('<div className="pde-queue">', scroll);
  const recent = panel.indexOf('<section className="pde-recent"', queue);
  const footer = panel.indexOf('<footer className="pde-modal-footer">', recent);
  assert.ok(modal >= 0 && scroll > modal && queue > scroll && recent > queue && footer > recent);
  assert.match(panel, /onClick=\{saveAll\}/);
  assert.match(panel, /const \[queue, setQueue\] = useState\(\[\]\)/);
  assert.match(panel, /if \(saving \|\| creatingModel\) return/);
});
test("modal kapatıldığında beden scroll ve odak iade edilir", () => {
  assert.match(panel, /document\.body\.style\.overflow = "hidden"/);
  assert.match(panel, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(panel, /previousFocus\?\.focus\?\.\(\)/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /event\.key === "Tab"/);
});
