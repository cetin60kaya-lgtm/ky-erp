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

test("daily entry exposes compact date navigation and day double click quick entry", () => {
  assert.match(workspace, /kyop-range-summary/);
  assert.match(workspace, /onDoubleClick=\{\(\) => void openQuick\(item\.date, shift\)\}/);
  assert.match(workspace, /className="quick-day-list"/);
  assert.doesNotMatch(workspace, /onClick=\{openQuick\}/);
});

test("quick entry and person editor persist independent modal sizes", () => {
  assert.match(workspace, /DIALOG_SIZE_PREFIX/);
  assert.match(workspace, /writeDialogSize\(kind, next\[kind\]\)/);
  assert.match(workspace, /daily-operations-quick-entry/);
  assert.match(workspace, /daily-operations-person-editor/);
});

test("weekly control print is landscape and period summary prints totals", () => {
  assert.match(workspace, /@page\{size:A4 landscape/);
  assert.match(workspace, /TOPLAM PERSONEL/);
  assert.match(workspace, /TOPLAM GÜNDÜZ/);
  assert.match(workspace, /TOPLAM GECE/);
  assert.match(workspace, /GENEL TOPLAM GÜN/);
  assert.match(workspace, /TOPLAM TUTAR/);
  assert.match(workspace, /showTotals: true/);
});

test("quick entry remains compact on smaller monitors", () => {
  assert.match(css, /DAILY-OPERATIONS-CRITICALS-2026-10-03/);
  assert.match(css, /\.quick-day-list/);
  assert.match(css, /\.kyop-days/);
  assert.match(css, /max-width:1366px/);
  assert.match(css, /max-height:820px/);
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
  assert.match(css, /--quick-card-w:205px/);
});


test("final quick cards use aligned grid columns with full-name room", () => {
  assert.match(workspace, /quick-person-text[\s\S]*quick-inline-divider[\s\S]*money\(quick\.shift[\s\S]*Seçildi/);
  assert.match(css, /QUICK-CARD-GRID-FINAL-2026-10-03/);
  assert.match(css, /grid-template-columns:20px minmax\(0,1fr\) 1px 64px 38px!important/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 24px!important/);
  assert.match(css, /white-space:normal!important/);
  assert.match(css, /\.gop-quick-dialog \.quick-inline-divider\{/);
});

test("row and width controls use final grid-safe ranges and fresh saved defaults", () => {
  assert.match(workspace, /quickRowHeight\.v3/);
  assert.match(workspace, /quickCardWidth\.v3/);
  assert.match(workspace, /value >= 30 && value <= 60/);
  assert.match(workspace, /value >= 220 && value <= 380/);
  assert.match(workspace, /min="30" max="60" step="2"/);
  assert.match(workspace, /min="220" max="380" step="10"/);
});
