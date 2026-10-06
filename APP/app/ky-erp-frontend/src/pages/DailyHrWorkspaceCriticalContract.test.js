import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("./modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./modules/ik/daily-hr-workspace-final.css", import.meta.url), "utf8");

test("daily operations quick entry keeps existing personnel visible and protects saves", () => {
  assert.match(workspace, /const attendanceRosterIds = useMemo/);
  assert.match(workspace, /const effectiveRosterIds = useMemo/);
  assert.match(workspace, /new Set\(\[\.\.\.rosterIds, \.\.\.attendanceRosterIds, \.\.\.selectedIds\]\)/);
  assert.match(workspace, /missingQuickPeople/);
  assert.match(workspace, /Hızlı giriş personel listesi eksik yüklendi/);
});

test("daily entry keeps manual start/end range, double-click quick entry and wide day dropdown", () => {
  assert.match(workspace, /kyop-manual-range/);
  assert.match(workspace, /aria-label="Tarih aralığını elle seç"/);
  assert.match(workspace, /<span>Başlangıç<\/span><input type="date" value=\{range\.start\}/);
  assert.match(workspace, /<span>Bitiş<\/span><input type="date" value=\{range\.end\}/);
  assert.match(workspace, /shiftRange\(-1\)/);
  assert.match(workspace, /shiftRange\(1\)/);
  assert.match(workspace, /onDoubleClick=\{\(\) => void openQuick\(item\.date, shift\)\}/);
  assert.match(workspace, /quick-active-day-card/);
  assert.match(workspace, /quick-day-popover-grid/);
  assert.match(workspace, /quickDayPickerOpen/);
  assert.doesNotMatch(workspace, /onClick=\{openQuick\}/);
});

test("daily operation popups use independent canonical shared dialog keys", () => {
  assert.match(workspace, /data-ky-dialog-key="gunluk-operasyon\.hizli-personel-girisi"/);
  assert.match(workspace, /data-ky-dialog-key="gunluk-operasyon\.personel-karti"/);
  assert.match(workspace, /data-ky-dialog-key="gunluk-operasyon\.log-analiz"/);
  assert.match(workspace, /data-ky-dialog-key="gunluk-operasyon\.excel-onizleme"/);
  assert.doesNotMatch(workspace, /DIALOG_SIZE_PREFIX|DialogSizer|dialogSizes/);
});

test("weekly control and summary prints use the same readable landscape personnel matrix", () => {
  assert.match(workspace, /function printWeeklyMatrix/);
  assert.match(workspace, /function printWeeklyControlList/);
  assert.match(workspace, /function printWeeklySummary/);
  assert.match(workspace, /@page\{size:A4 landscape/);
  assert.match(workspace, /SAYFA TOPLAMI/);
  assert.match(workspace, /GENEL TOPLAM · \$\{totals\.people\} PERSONEL/);
  assert.match(workspace, /pageDayTotals/);
  assert.match(workspace, /dayTotals/);
  assert.match(workspace, /Toplam<br\/>Gün/);
  assert.match(workspace, /Toplam Tutar/);
  assert.match(workspace, /printWeeklySummary\(range, days, weeklyControlRows\)/);
});

test("quick entry remains compact on smaller monitors", () => {
  assert.match(css, /QUICK-ENTRY-WORKSPACE-FINAL-2026-10-03/);
  assert.match(css, /quick-day-popover-grid/);
  assert.match(css, /quick-status-strip/);
  assert.match(css, /max-width:1100px/);
  assert.match(css, /max-height:720px/);
});


test("daily and quick day cards expose compact day/night/person counts", () => {
  assert.match(workspace, /kyop-day-counts/);
  assert.match(workspace, /G \{item\.dayCount\}/);
  assert.match(workspace, /N \{item\.nightCount\}/);
  assert.match(workspace, /daySummaryByDate\.get\(date\)/);
  assert.match(workspace, /G \{summary\.dayCount\}/);
  assert.match(workspace, /N \{summary\.nightCount\}/);
});

test("quick personnel groups stay tightly packed on small monitors", () => {
  assert.match(css, /DAILY-QUICK-CARDS-DENSE-2026-10-03/);
  assert.match(css, /\.gop-quick-dialog \.quick-groups\{[\s\S]*display:flex!important/);
  assert.match(css, /flex-direction:column!important/);
  assert.match(css, /\.gop-quick-dialog \.quick-group\{[\s\S]*flex:0 0 auto!important/);
  assert.match(css, /--quick-card-w:260px/);
});


test("final quick cards use aligned grid columns with full-name room", () => {
  assert.match(workspace, /quick-person-text[\s\S]*quick-inline-divider[\s\S]*money\(quick\.shift[\s\S]*Seçildi/);
  assert.match(css, /QUICK-CARD-GRID-FINAL-2026-10-03/);
  assert.match(css, /grid-template-columns:20px minmax\(0,1fr\) 1px 64px 38px!important/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 24px!important/);
  assert.match(css, /white-space:normal!important/);
  assert.match(css, /\.gop-quick-dialog \.quick-inline-divider\{/);
});

test("quick card density keeps the two manual row and width controls", () => {
  assert.match(workspace, /QUICK_ROW_HEIGHT_KEY/);
  assert.match(workspace, /QUICK_CARD_WIDTH_KEY/);
  assert.match(workspace, /className="quick-density-controls"/);
  assert.match(workspace, /min="30" max="60" step="2"/);
  assert.match(workspace, /min="220" max="380" step="10"/);
  assert.match(workspace, /"--quick-row-h": `\$\{quickRowHeight\}px`/);
  assert.match(workspace, /"--quick-card-w": `\$\{quickCardWidth\}px`/);
  assert.match(css, /QUICK-DENSITY-CONTROLS-RESTORED-2026-10-03/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(var\(--quick-card-w\),1fr\)\)!important/);
});


test("completed past weeks do not stay in payment waiting UI and print completes open payment", () => {
  assert.match(workspace, /function isPastCompletedWeek/);
  assert.match(workspace, /paymentPeriodIsHistorical/);
  assert.match(workspace, /visiblePaymentRows/);
  assert.match(workspace, /paymentPageOpenMetrics/);
  assert.match(workspace, /Geçmiş hafta tamamlandı/);
  assert.match(workspace, /Çıktı = ödeme tamamlandı/);
  assert.match(workspace, /createDailyPayment/);
  assert.match(workspace, /TOPLAM ÖDEME/);
  assert.doesNotMatch(workspace, /<footer><span>ÖDENDİ<\/span>/);
});


test("manual daily range keeps arbitrary ranges instead of forcing Monday-Sunday", () => {
  assert.match(workspace, /setSafeRange\(value > range\.end \? \{ start: value, end: value \} : \{ \.\.\.range, start: value \}\)/);
  assert.match(workspace, /setSafeRange\(value < range\.start \? \{ start: value, end: value \} : \{ \.\.\.range, end: value \}\)/);
  assert.match(workspace, /rangeSpanDays\(resolved\.start, resolved\.end\) > 31/);
  assert.doesNotMatch(workspace, /kyop-range-summary/);
});
