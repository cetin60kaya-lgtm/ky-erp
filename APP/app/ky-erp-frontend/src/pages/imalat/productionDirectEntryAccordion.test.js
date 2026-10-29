import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ProductionDirectEntryPanel.jsx", import.meta.url), "utf8");
const parent = readFileSync(new URL("./ProductionControlCenterPageV2.jsx", import.meta.url), "utf8");

test("günlük üretim formu ilk açılışta kapalı; bütün başlık etkileşimli", () => {
  assert.match(panel, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(panel, /className="pde-head-trigger"/);
  assert.match(panel, /aria-expanded=\{open\}/);
  assert.match(panel, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
  assert.match(panel, /\{open \? "Daralt" : "Girişi Aç"\}/);
});
test("kapalıyken seri kuyruk ve son kayıtlar gizli kalır; veri korunur", () => {
  assert.match(panel, /\{open && <div id="pde-expandable">/);
  const opened = panel.indexOf('{open && <div id="pde-expandable">');
  const recent = panel.indexOf('<section className="pde-recent"');
  const close = panel.indexOf('      </div>}\n    </section>', recent);
  assert.ok(opened >= 0 && recent > opened && close > recent);
  assert.match(panel, /const \[queue, setQueue\] = useState\(\[\]\)/);
});
test("üst üretim girişi ve modelden üretim gir formu tekrar açar", () => {
  assert.match(parent, /setOpenRequestToken\(\(current\) => current \+ 1\)/);
  assert.match(parent, /openRequestToken=\{openRequestToken\}/);
  assert.match(panel, /if \(openRequestToken > 0\) setOpen\(true\)/);
});
