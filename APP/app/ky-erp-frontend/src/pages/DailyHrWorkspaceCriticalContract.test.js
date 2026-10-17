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
  assert.doesNotMatch(workspace, /function printWeeklyControlList/);
  assert.match(workspace, /function printWeeklySummary/);
  assert.match(workspace, /@page\{size:A4 landscape/);
  assert.doesNotMatch(workspace, /SAYFA TOPLAMI/);
  assert.match(workspace, /GENEL TOPLAM · \$\{totals\.people\} PERSONEL/);
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


test("open past periods remain visible and printing never marks payment completed", () => {
  assert.doesNotMatch(workspace, /function isPastCompletedWeek/);
  assert.doesNotMatch(workspace, /paymentPeriodIsHistorical/);
  assert.match(workspace, /const visiblePaymentRows = paymentRows/);
  assert.match(workspace, /getDailyPeriodPaymentStatus/);
  assert.match(workspace, /paymentStatusByEmployee/);
  assert.match(workspace, /DOĞRULANAMADI/);
  assert.match(workspace, /Çıktı = yalnız hakediş belgesi/);
  assert.match(workspace, /HAKEDİŞ DÖKÜMÜ/);
  const printBlock = workspace.split("const printPeriodRows = useCallback")[1]?.split("const activePaymentRange =")[0];
  assert.ok(printBlock);
  assert.doesNotMatch(printBlock, /createDailyPayment/);
  assert.match(workspace, /const payRow = async/);
  assert.match(workspace, /TOPLAM ÖDEME/);
  assert.doesNotMatch(workspace, /<footer><span>ÖDENDİ<\/span>/);
});


test("manual daily range keeps arbitrary ranges instead of forcing Monday-Sunday", () => {
  assert.match(workspace, /setSafeRange\(value > range\.end \? \{ start: value, end: value \} : \{ \.\.\.range, start: value \}\)/);
  assert.match(workspace, /setSafeRange\(value < range\.start \? \{ start: value, end: value \} : \{ \.\.\.range, end: value \}\)/);
  assert.match(workspace, /rangeSpanDays\(resolved\.start, resolved\.end\) > 31/);
  assert.doesNotMatch(workspace, /kyop-range-summary/);
});

test("weekly summary fits on one A4 landscape sheet and includes grand totals", () => {
  assert.match(workspace, /const pages = \[source\]/);
  assert.doesNotMatch(workspace, /index \+= 26/);
  assert.match(workspace, /\.week-page\{width:100%;height:auto;max-height:198mm;display:block;page-break-after:auto/);
  assert.match(workspace, /@page\{size:A4 landscape;margin:3mm/);
  assert.match(workspace, /GENEL TOPLAM/);
});

test("daily Excel export is generated locally and does not hit missing cloud route", () => {
  assert.match(workspace, /exportRowsToExcelFile/);
  assert.match(workspace, /KYERP_Gunluk_/);
  assert.match(workspace, /Gündüz Toplam/);
  assert.match(workspace, /Gece Toplam/);
  assert.doesNotMatch(workspace, /downloadDailyExcel\(/);
});

test("quick entry saves only changed staff and verifies persisted check state", () => {
  assert.match(workspace, /const changedPeople = activeRosterPeople\.filter/);
  assert.match(workspace, /snapshot\.checkedBaseline\.has/);
  assert.match(workspace, /personnelEntries: changedPeople\.map/);
  assert.match(workspace, /const verified = await getDailyFocusedRecords/);
  assert.match(workspace, /const confirmedChecks = focusedCheckedIds\(verified\)/);
  assert.match(workspace, /Kontrol seçimleri sunucuda doğrulanamadı/);
});

test("same employee keeps last week's wage while current week uses updated card rate", () => {
  assert.match(workspace, /function personWageAtDate/);
  assert.match(workspace, /function confirmBackdatedWage/);
  assert.match(workspace, /wageEffectiveDate/);
  assert.match(workspace, /confirmRetroactiveWage/);
  assert.match(workspace, /personWageAtDate\(person, quick\.date\)/);
  assert.match(workspace, /personWageAtDate\(person, selectedDate\)/);
  assert.match(workspace, /Yeni Ücret Geçerlilik Tarihi/);
  assert.match(workspace, /toplu değiştirilecek/);
});
test("quick entry can navigate dates without changing other daily records", () => {
  assert.match(workspace, /className="quick-direct-navigation"/);
  assert.match(workspace, /Önceki Gün/);
  assert.match(workspace, /Sonraki Gün/);
  assert.match(workspace, /changeQuickFocus\(addDays\(quick.date, -1\), quick.shift\)/);
  assert.match(workspace, /changeQuickFocus\(addDays\(quick.date, 1\), quick.shift\)/);
  assert.match(workspace, /hasPending/);
  assert.match(css, /DAILY_EFFECTIVE_WAGE_AND_NAV_2026_10_16/);
});
test("long custom weekly ranges never silently omit days from printed report", () => {
  assert.match(workspace, /Haftalık PDF çıktısı en fazla 7 gün içindir/);
  assert.match(workspace, /days\.map\(\(date\)/);
  assert.doesNotMatch(workspace, /days\.slice\(0, 7\)\.map/);
});

test("selected date range is shared across operation tabs without overwriting other PCs navigation", () => {
  assert.match(workspace, /const PAYMENT_POOL_RANGE_KEY = RANGE_KEY/);
  assert.match(workspace, /const PAYMENT_HISTORY_RANGE_KEY = RANGE_KEY/);
  assert.match(workspace, /setPaymentPoolRange\(resolved\); setPaymentHistoryRange\(resolved\)/);
  assert.match(workspace, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(workspace, /event\.data\?\.type === "date-range"/);
});

test("main and quick attendance save only changed people and retain original server revisions", () => {
  assert.match(workspace, /const changedPeople = activeRosterPeople\.filter/);
  assert.match(workspace, /snapshot\.baselineRecords\?\.\[person\.id\]\?\.updatedAt/);
  assert.match(workspace, /snapshot\.baselineRecords\?\.\[person\.id\]\?\.checkedUpdatedAt/);
  assert.match(workspace, /expectedCheckedUpdatedAt: current\.checkedUpdatedAt/);
  assert.match(workspace, /mode: "merge"/);
  assert.match(workspace, /mode: "remove", removeEmployeeId: person\.id/);
});

test("selection and control approval are separate clearly-labelled actions and green whole-card state", () => {
  assert.match(workspace, /quick-check-label/);
  assert.match(workspace, /KONTROL EDİLDİ/);
  assert.match(workspace, /Onaylandı/);
  assert.match(css, /GUNLUK_SYNC_CHECK_20261017/);
  assert.match(css, /\.gop-quick-dialog \.quick-person\.checked/);
  assert.match(css, /background:#c6f6d5!important/);
});

test("daily view has real D1 audit log under work area and no duplicated weekly print buttons", () => {
  assert.match(workspace, /const loadInlineAudit = useCallback/);
  assert.match(workspace, /gop-daily-audit-list/);
  assert.match(workspace, /Tüm Geçmiş ve Ayrıntılar/);
  assert.doesNotMatch(workspace, /onClick=\{\(\) => printWeeklyControlList\(range, days, weeklyControlRows\)\}/);
  assert.match(workspace, /onClick=\{\(\) => printWeeklySummary\(range, days, weeklyControlRows\)\}/);
});
