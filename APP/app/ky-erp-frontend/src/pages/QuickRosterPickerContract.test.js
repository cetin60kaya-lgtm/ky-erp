import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("./modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("./modules/ik/QuickRosterPicker.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./modules/ik/quick-roster-picker.css", import.meta.url), "utf8");

test("eski Günlük Personel Girişi ekranı birebir korunur; yeni tam ekran panel yoktur", () => {
  assert.match(workspace, /<div className="kyop-grid">/);
  assert.match(workspace, /<aside className="kyop-panel kyop-pool">/);
  assert.match(workspace, /<main className="kyop-panel kyop-entry">/);
  assert.match(workspace, /<aside className="kyop-panel kyop-control">/);
  assert.match(workspace, /onDoubleClick=\{\(\) => void openQuick\(item\.date, shift\)\}/);
  assert.doesNotMatch(workspace, /DailyEntrySmartSelector|ky-smart-entry|daily-entry-smart\.css/);
});

test("Hızlı Giriş penceresinde yalnız Personel Ekle bölümü yenilenir", () => {
  assert.match(workspace, /data-ky-dialog-key="gunluk-operasyon\.hizli-personel-girisi"/);
  assert.match(workspace, /<QuickRosterPicker/);
  assert.match(workspace, /people=\{availableRosterPeople\}/);
  assert.match(workspace, /onAdd=\{addManyFromQuickPool\}/);
  assert.match(workspace, /data-ky-quick-layout="compact-v3"/);
  assert.match(workspace, /onClick=\{\(\) => saveQuick\(false\)\}/);
  assert.doesNotMatch(workspace, /quick-roster-candidates/);
});

test("çoklu ekleme tek D1 merge, sunucu doğrulaması ve vardiya bağımsızlığı ile korunur", () => {
  const handler = workspace.split("const addManyFromQuickPool = async")[1]?.split("const saveFocused = async")[0];
  assert.ok(handler);
  assert.match(handler, /mode: "merge"/);
  assert.match(handler, /await saveDailyRoster\(/);
  assert.match(handler, /ids\.some\(\(id\) => !confirmed\.includes\(id\)\)/);
  assert.match(handler, /rangeRequestRef\.current \+= 1/);
  assert.match(handler, /setRosterIds\(new Set\(confirmed\)\)/);
  assert.doesNotMatch(handler, /saveDailyFocusedRecords|createDailyPayment/);
  assert.match(picker, /const \[selected, setSelected\] = useState/);
  assert.match(picker, /await onAdd\(pending\)/);
  assert.match(picker, /Seçimi Temizle/);
});

test("açılır personel alanı eskisinin içinde ve kompakt; ana ekranın CSS'i değişmez", () => {
  assert.match(css, /\.gop-quick-dialog \.kyq-roster-panel/);
  assert.match(css, /right:0;bottom:0;left:auto/);
  assert.match(css, /--kyq-panel-width/);
  assert.match(picker, /Son 7 gün/);
  assert.match(picker, /Son 14 gün/);
  assert.match(picker, /<UserPlus size=\{15\}\/> Yeni Personel/);
  assert.match(picker, /aria-expanded=\{open\}/);
});
