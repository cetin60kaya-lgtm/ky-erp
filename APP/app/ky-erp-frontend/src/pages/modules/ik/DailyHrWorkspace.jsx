import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LockKeyhole,
  Moon,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sun,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import {
  applyDailyExcel,
  createDailyEmployee,
  deleteDailyEmployee,
  downloadDailyExcel,
  getDailyAttendance,
  getDailyAudit,
  getDailyEmployees,
  getDailyFocusedRecords,
  getDailyPaymentHistory,
  getDailyPaymentPool,
  getDailyPeriodLock,
  getDailyRoster,
  getDailyRevisions,
  getDailySyncState,
  getDailyWeeklySummary,
  cancelDailyPayment,
  createDailyPayment,
  previewDailyExcel,
  saveDailyFocusedRecords,
  saveDailyRoster,
  setDailyPeriodLock,
  updateDailyEmployee,
} from "../../../services/dailyOpsApi";
import { printHtmlDocument } from "../../../services/printService";
import "./daily-hr-workspace.css";
import "./daily-hr-workspace-final.css";

const VALID_VIEWS = new Set(["daily-dashboard", "daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);
const RANGE_KEY = "kyerp.dailyOperations.range.v5";
const PAYMENT_POOL_RANGE_KEY = "kyerp.dailyOperations.paymentPoolRange.v1";
const PAYMENT_HISTORY_RANGE_KEY = "kyerp.dailyOperations.paymentHistoryRange.v1";
const LIVE_SYNC_INTERVAL_MS = 1500;
const DAILY_SYNC_CHANNEL = "kyerp.dailyOperations.live.v1";
const LEGACY_DIALOG_SIZE_KEY = "kyerp.dailyOperations.dialogSizes.v1";
const DIALOG_SIZE_PREFIX = "kyerp.dailyOperations.dialogSize.v2.";
const QUICK_ROW_HEIGHT_KEY = "kyerp.dailyOperations.quickRowHeight.v2";
const QUICK_CARD_WIDTH_KEY = "kyerp.dailyOperations.quickCardWidth.v2";
const DEFAULT_DIALOG_SIZES = {
  quick: { w: 1180, h: 700 },
  person: { w: 560, h: 430 },
  log: { w: 1120, h: 700 },
  excel: { w: 940, h: 650 },
};
function readDialogSizes() {
  let legacy = {};
  try { legacy = JSON.parse(window.localStorage.getItem(LEGACY_DIALOG_SIZE_KEY) || "null") || {}; } catch { legacy = {}; }
  return Object.fromEntries(Object.entries(DEFAULT_DIALOG_SIZES).map(([key, value]) => {
    try {
      const own = JSON.parse(window.localStorage.getItem(`${DIALOG_SIZE_PREFIX}${key}`) || "null") || {};
      return [key, { ...value, ...(legacy[key] || {}), ...own }];
    } catch {
      return [key, { ...value, ...(legacy[key] || {}) }];
    }
  }));
}
function writeDialogSize(kind, value) {
  try { window.localStorage.setItem(`${DIALOG_SIZE_PREFIX}${kind}`, JSON.stringify(value)); } catch { /* optional storage */ }
}
function readQuickRowHeight() { try { const value = Number(window.localStorage.getItem(QUICK_ROW_HEIGHT_KEY)); return Number.isFinite(value) && value >= 28 && value <= 42 ? value : 30; } catch { return 30; } }
function writeQuickRowHeight(value) { try { window.localStorage.setItem(QUICK_ROW_HEIGHT_KEY, String(value)); } catch { /* optional storage */ } }
function readQuickCardWidth() { try { const value = Number(window.localStorage.getItem(QUICK_CARD_WIDTH_KEY)); return Number.isFinite(value) && value >= 160 && value <= 280 ? value : 190; } catch { return 190; } }
function writeQuickCardWidth(value) { try { window.localStorage.setItem(QUICK_CARD_WIDTH_KEY, String(value)); } catch { /* optional storage */ } }
function dialogBoxStyle(size) { return { width: `${size?.w || 760}px`, height: `${size?.h || 600}px`, maxWidth: "calc(100vw - 28px)", maxHeight: "calc(100dvh - 28px)" }; }
function DialogSizer({ kind, size, onResize }) {
  return <div className="dialog-sizer" title="Pencere ölçüsü tarayıcıda hatırlanır"><span>En</span><input type="number" min="420" max="1600" value={size?.w || ""} onChange={(e) => onResize(kind, "w", e.target.value)}/><span>Boy</span><input type="number" min="260" max="1000" value={size?.h || ""} onChange={(e) => onResize(kind, "h", e.target.value)}/></div>;
}
const EMPTY_PERSON = { id: "", name: "", personnelNo: "", role: "", broker: "Direkt", dayRate: 0, nightRate: 0, note: "", active: true };
const ROLE_ORDER = ["MAKİNACI", "SERİMCİ", "BOYACI", "VASIFSIZ"];

function pad(value) { return String(value).padStart(2, "0"); }
function localDateKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function addDays(value, amount) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return localDateKey(new Date(year, month - 1, day + amount, 12));
}
function startOfWeek(value = localDateKey()) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return addDays(value, 1 - (date.getDay() || 7));
}
function defaultRange() { const start = startOfWeek(); return { start, end: addDays(start, 6) }; }
function defaultPaymentRange() { const start = startOfWeek(); return { start, end: addDays(start, 6) }; }
function paymentPresetRange(mode, today = localDateKey()) {
  const start = startOfWeek(today);
  const [year, month] = today.split("-").map(Number);
  if (mode === "today") return { start: today, end: today };
  if (mode === "week") return { start, end: addDays(start, 6) };
  if (mode === "lastWeek") { const previous = addDays(start, -7); return { start: previous, end: addDays(previous, 6) }; }
  if (mode === "month") return { start: `${year}-${pad(month)}-01`, end: localDateKey(new Date(year, month, 0, 12)) };
  if (mode === "lastMonth") { const d = new Date(year, month - 2, 1, 12); return { start: localDateKey(d), end: localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }; }
  if (mode === "year") return { start: `${year}-01-01`, end: today };
  return defaultPaymentRange();
}
function rangeSpanDays(start, end) {
  if (!start || !end || end < start) return 0;
  const [sy, sm, sd] = String(start).split("-").map(Number);
  const [ey, em, ed] = String(end).split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;
  const a = Date.UTC(sy, sm - 1, sd);
  const b = Date.UTC(ey, em - 1, ed);
  return Math.floor((b - a) / 86400000) + 1;
}
function rangeDays(start, end) {
  const days = [];
  if (!start || !end || end < start) return days;
  for (let cursor = start; cursor <= end && days.length < 31; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}
function readRange() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RANGE_KEY) || "null");
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed?.start || "") && /^\d{4}-\d{2}-\d{2}$/.test(parsed?.end || "") && parsed.end >= parsed.start) return parsed;
  } catch { /* optional storage */ }
  return defaultRange();
}
function writeRange(range) { try { window.localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch { /* optional storage */ } }
function readNamedRange(key, fallback = defaultPaymentRange) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed?.start || "") && /^\d{4}-\d{2}-\d{2}$/.test(parsed?.end || "") && parsed.end >= parsed.start) return parsed;
  } catch { /* optional storage */ }
  return fallback();
}
function writeNamedRange(key, range) { try { window.localStorage.setItem(key, JSON.stringify(range)); } catch { /* optional storage */ } }
function sameRange(a, b) { return Boolean(a?.start && b?.start && a.start === b.start && a.end === b.end); }
function number(value) { const parsed = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(number(value)); }
function dateText(value, short = false) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("tr-TR", short ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}
function longDateText(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(new Date(year, month - 1, day, 12));
}
function dateTimeText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function normalizeText(value) { return String(value || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " "); }
function roleLabel(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  const key = normalizeText(raw);
  if (["MAKİNACI", "MAKINACI", "MAKİNECİ", "MAKINECI"].includes(key)) return "Makinacı";
  if (["SERİMCİ", "SERIMCI", "SERİM", "SERIM"].includes(key)) return "Serimci";
  if (key === "USTA") return "Usta";
  if (key === "BOYACI") return "Boyacı";
  if (["VASIFSIZ", "VASIFSİZ"].includes(key)) return "Vasıfsız";
  return raw;
}
function employeeOf(row = {}) {
  return { ...EMPTY_PERSON, ...row, id: String(row.id || ""), name: row.fullName || row.name || "", personnelNo: row.personnelNo || row.personelNo || "", role: row.qualification || row.role || row.title || "", broker: row.broker || "Direkt", dayRate: number(row.dayWage ?? row.dayRate), nightRate: number(row.nightWage ?? row.nightRate), note: row.note || "", active: row.active !== false && !["PASSIVE", "PASIF", "PASİF"].includes(normalizeText(row.status)) };
}
function employeePayload(person, companyId) {
  return { mainCompanyId: companyId, fullName: String(person.name || "").trim(), personnelNo: String(person.personnelNo || "").trim(), qualification: roleLabel(person.role), broker: String(person.broker || "Direkt").trim() || "Direkt", dayWage: number(person.dayRate), nightWage: number(person.nightRate), note: String(person.note || "").trim(), status: person.active === false ? "PASSIVE" : "ACTIVE" };
}
function rowDate(row = {}) { return String(row.workDate || row.date || "").slice(0, 10); }
function rowEmployeeId(row = {}) { return String(row.employeeId || row.personId || row.personelId || row.dailyEmployeeId || ""); }
function rowDay(row = {}) { return Boolean(row.dayShift ?? row.day ?? row.gunduz); }
function rowNight(row = {}) { return Boolean(row.nightShift ?? row.night ?? row.gece); }
function rowPaid(row = {}) { return normalizeText(row.paymentStatus || row.paidStatus) === "PAID" || row.paid === true; }
function focusedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.selected || normalizeText(row.status) === "ACTIVE").map(rowEmployeeId).filter(Boolean)); }
function focusedCheckedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.checked === true || row?.checked === 1 || row?.checked === "1").map(rowEmployeeId).filter(Boolean)); }
function sameSet(a, b) { if (a.size !== b.size) return false; for (const value of a) if (!b.has(value)) return false; return true; }
function roleKey(role) { return normalizeText(role || "Vasıfsız") || "VASIFSIZ"; }
function roleSort(a, b) {
  const ak = roleKey(a[0]); const bk = roleKey(b[0]);
  const ai = ROLE_ORDER.indexOf(ak); const bi = ROLE_ORDER.indexOf(bk);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return ak.localeCompare(bk, "tr");
}
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function printRows(title, range, rows, options = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const body = source.map((row) => `<tr><td>${escapeHtml(row.name || row.fullName)}</td><td>${escapeHtml(row.qualification || row.role || "-")}</td><td>${number(row.dayCount)}</td><td>${number(row.nightCount)}</td><td>${escapeHtml(money(row.totalAmount ?? row.total))}</td></tr>`).join("");
  const totals = source.reduce((sum, row) => ({
    day: sum.day + number(row.dayCount),
    night: sum.night + number(row.nightCount),
    amount: sum.amount + number(row.totalAmount ?? row.total),
  }), { day: 0, night: 0, amount: 0 });
  const totalsHtml = options.showTotals ? `<section class="summary-totals"><div><span>TOPLAM PERSONEL</span><strong>${source.length}</strong></div><div><span>TOPLAM GÜNDÜZ</span><strong>${totals.day}</strong></div><div><span>TOPLAM GECE</span><strong>${totals.night}</strong></div><div><span>GENEL TOPLAM GÜN</span><strong>${totals.day + totals.night}</strong></div><div class="grand"><span>TOPLAM TUTAR</span><strong>${escapeHtml(money(totals.amount))}</strong></div></section>` : "";
  return printHtmlDocument({
    title,
    html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</p><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table>${totalsHtml}</main>`,
    css: "@page{size:A4;margin:12mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#f1f5f9}.summary-totals{display:grid;grid-template-columns:repeat(4,1fr) 1.45fr;gap:6px;margin-top:10px}.summary-totals>div{border:1.5px solid #111;padding:8px;min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:8px}.summary-totals span{font-size:9px;font-weight:900}.summary-totals strong{font-size:17px}.summary-totals .grand{border-width:2px}.summary-totals .grand strong{font-size:15px;white-space:nowrap}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}",
  });
}
function printDailyPaymentSlips(range, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const grandTotal = source.reduce((sum, row) => sum + number(row.totalAmount ?? row.total), 0);
  const pages = [];
  for (let index = 0; index < source.length; index += 10) pages.push(source.slice(index, index + 10));
  const html = pages.map((pageRows, pageIndex) => `<section class="pay-page"><header><strong>GÜNLÜK PERSONEL ÖDEME FİŞLERİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><div class="pay-grid">${pageRows.map((row, index) => {
    const items = Array.isArray(row.items) ? row.items : [];
    const dayCount = number(row.dayCount);
    const nightCount = number(row.nightCount);
    const dayItemTotal = items.filter((item) => String(item.shift || "").toLowerCase() === "day" && item.active !== false).reduce((sum, item) => sum + number(item.amount), 0);
    const nightItemTotal = items.filter((item) => String(item.shift || "").toLowerCase() === "night" && item.active !== false).reduce((sum, item) => sum + number(item.amount), 0);
    const dayTotal = number(row.dayTotal) || dayItemTotal;
    const nightTotal = number(row.nightTotal) || nightItemTotal;
    const dayRate = dayCount ? dayTotal / dayCount : number(row.dayRate ?? row.dayWage);
    const nightRate = nightCount ? nightTotal / nightCount : number(row.nightRate ?? row.nightWage);
    const total = number(row.totalAmount ?? row.total) || dayTotal + nightTotal;
    const no = pageIndex * 10 + index + 1;
    return `<article class="pay-card">
      <div class="pay-name"><b>${no}. ${escapeHtml(row.name || row.fullName || "-")}</b><span>${escapeHtml(row.qualification || row.role || "-")}</span></div>
      <div class="pay-lines">
        <div><span>GÜNLÜK ÜCRETİ</span><b>${escapeHtml(money(dayRate))}</b><small>${dayCount} gün</small></div>
        <div><span>GECE ÜCRETİ</span><b>${escapeHtml(money(nightRate))}</b><small>${nightCount} gece</small></div>
        <div class="sum"><span>ÜCRET TOPLAMI</span><b>${escapeHtml(money(total))}</b></div>
      </div>
    </article>`;
  }).join("")}</div><footer class="page-grand"><span>GENEL TOPLAM</span><strong>${escapeHtml(money(grandTotal))}</strong></footer></section>`).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Ödeme Fişleri",
    html: `<main class="pay-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.pay-print{width:200mm}.pay-page{width:200mm;height:287mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}.pay-page:last-child{page-break-after:auto;break-after:auto}.pay-page>header{height:11mm;border:1px solid #000;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:5mm;padding:1.5mm 3mm;margin-bottom:2.5mm}.pay-page>header strong{font-size:11.5pt}.pay-page>header span,.pay-page>header em{font-size:7.5pt;font-style:normal;white-space:nowrap}.pay-grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(5,47mm);gap:2.5mm 4mm}.pay-card{height:47mm;border:1px solid #000;padding:2.2mm 2.6mm;display:grid;grid-template-rows:auto 1fr;gap:1.5mm;break-inside:avoid;page-break-inside:avoid}.pay-name{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;border-bottom:1px solid #000;padding-bottom:1mm}.pay-name b{font-size:10pt;text-transform:uppercase;line-height:1}.pay-name span{font-size:7.2pt;white-space:nowrap}.pay-lines{display:grid;gap:0;border:1px solid #000}.pay-lines>div{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:3mm;padding:1.4mm 2mm;min-height:8.5mm}.pay-lines>div+div{border-top:1px solid #000}.pay-lines span{font-size:8pt;font-weight:900}.pay-lines b{font-size:11pt;text-align:right}.pay-lines small{min-width:23mm;text-align:right;font-size:7pt;font-weight:700}.pay-lines .sum{grid-template-columns:1fr auto;background:#f7f7f7}.pay-lines .sum b{font-size:14pt}.page-grand{margin-top:auto;border:2px solid #000;min-height:15mm;padding:2.5mm 4mm;display:flex;align-items:center;justify-content:space-between}.page-grand span{font-size:11pt;font-weight:900}.page-grand strong{font-size:20pt;line-height:1;font-weight:900}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`
  });
}
function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const rangeBoundDays = Array.isArray(days)
    ? days.filter((date) => (!range?.start || date >= range.start) && (!range?.end || date <= range.end)).slice(0, 7)
    : [];
  const safeDays = rangeBoundDays.length ? rangeBoundDays : rangeDays(range?.start, range?.end).slice(0, 7);
  const printStart = range?.start || safeDays[0] || "";
  const printEnd = range?.end || safeDays[safeDays.length - 1] || printStart;
  const totals = source.reduce((sum, row) => ({
    people: sum.people + 1,
    days: sum.days + number(row.dayCount) + number(row.nightCount),
    amount: sum.amount + number(row.totalAmount ?? row.total),
  }), { people: 0, days: 0, amount: 0 });
  const pages = [];
  for (let index = 0; index < source.length; index += 30) pages.push(source.slice(index, index + 30));
  const headers = safeDays.map((date) => {
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace('.', '').toLocaleUpperCase("tr-TR");
    return `<th class="date-col"><span>${escapeHtml(weekday)}</span><b>${escapeHtml(dateText(date, true))}</b></th>`;
  }).join("");
  const html = pages.map((pageRows, pageIndex) => {
    const body = pageRows.map((row, index) => {
      const dayCells = safeDays.map((date) => {
        const cell = row.days?.[date] || {};
        const dayOn = Boolean(cell.day);
        const nightOn = Boolean(cell.night);
        return `<td class="work-cell"><span><b>G</b><i class="${dayOn ? "check day-on" : "off"}">${dayOn ? "✓" : "–"}</i></span><span><b>N</b><i class="${nightOn ? "check night-on" : "off"}">${nightOn ? "✓" : "–"}</i></span></td>`;
      }).join("");
      const totalDays = number(row.dayCount) + number(row.nightCount);
      const totalAmount = number(row.totalAmount ?? row.total);
      return `<tr><td class="no">${pageIndex * 30 + index + 1}</td><td class="person"><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td class="role">${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}<td class="total-days"><strong>${totalDays}</strong></td><td class="total-money"><strong>${escapeHtml(money(totalAmount))}</strong></td></tr>`;
    }).join("");
    return `<section class="week-page"><header><div><strong>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</strong><span>${escapeHtml(dateText(printStart))} — ${escapeHtml(dateText(printEnd))}</span></div><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><table><thead><tr><th class="no">No</th><th class="person">Personel</th><th class="role">Vasıf</th>${headers}<th class="total-days">Toplam<br/>Gün</th><th class="total-money">Toplam Tutar</th></tr></thead><tbody>${body}</tbody></table><footer class="week-totals"><div><span>TOPLAM PERSONEL</span><strong>${totals.people}</strong></div><div><span>TOPLAM GÜN</span><strong>${totals.days}</strong></div><div class="grand"><span>GENEL TUTAR</span><strong>${escapeHtml(money(totals.amount))}</strong></div></footer></section>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main class="week-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 landscape;margin:4.5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.week-print{width:288mm}.week-page{width:288mm;height:201mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}.week-page:last-child{page-break-after:auto;break-after:auto}.week-page>header{height:10mm;border:1px solid #000;display:flex;align-items:center;justify-content:space-between;padding:1.2mm 2mm;margin-bottom:1.6mm}.week-page>header div{display:flex;align-items:baseline;gap:3mm}.week-page>header strong{font-size:10pt}.week-page>header span,.week-page>header em{font-size:6.6pt;font-style:normal;white-space:nowrap}.week-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.2pt}.week-page th,.week-page td{border:1px solid #000;padding:.42mm .55mm;line-height:1.05;vertical-align:middle}.week-page th{font-weight:900;text-align:center;height:8mm}.week-page td{height:5.25mm}.week-page .no{width:5.5mm;text-align:center}.week-page .person{width:46mm;text-align:left}.week-page .person strong{display:block;font-size:7.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .person small{display:block;font-size:5.8pt;line-height:1;color:#000}.week-page .role{width:25mm;text-align:left;font-size:7pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .date-col{width:19mm}.week-page .date-col span,.week-page .date-col b{display:block}.week-page .date-col span{font-size:6.4pt}.week-page .date-col b{font-size:7pt;margin-top:.5mm}.work-cell{padding:.12mm!important;text-align:center}.work-cell>span{display:inline-flex;align-items:center;justify-content:center;gap:.28mm;width:50%;font-size:7.2pt;font-weight:900;white-space:nowrap}.work-cell>span+span{border-left:1px solid #000}.work-cell b{font-size:7pt;font-weight:900;color:#000}.work-cell i{font-style:normal;font-size:9pt;font-weight:900;line-height:.9}.work-cell i.off{color:#777;font-size:6.5pt}.work-cell i.day-on{color:#ea580c}.work-cell i.night-on{color:#4338ca}.week-page .total-days{width:16mm;text-align:center}.week-page td.total-days strong{font-size:9pt}.week-page .total-money{width:34mm;text-align:right}.week-page th.total-money{text-align:center}.week-page td.total-money strong{font-size:8.5pt;white-space:nowrap}.week-totals{margin-top:auto;display:grid;grid-template-columns:1fr 1fr 1.45fr;gap:2mm;padding-top:2mm}.week-totals>div{border:1.5px solid #000;min-height:15mm;padding:1.8mm 2.3mm;display:flex;align-items:center;justify-content:space-between}.week-totals span{font-size:7.5pt;font-weight:900}.week-totals strong{font-size:17pt;line-height:1;font-weight:900}.week-totals .grand{border-width:2px}.week-totals .grand strong{font-size:15pt}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`
  });
}
function printPaidPaymentReceipt(row = {}) {
  const items = Array.isArray(row.items) ? row.items : [];
  const details = items.length ? items.map((item) => `<tr><td>${escapeHtml(dateText(item.workDate))}</td><td>${item.shift === "night" ? "Gece" : "Gündüz"}</td><td>${escapeHtml(money(item.amount))}</td></tr>`).join("") : `<tr><td colspan="3">Gündüz ${number(row.dayCount)} · Gece ${number(row.nightCount)}</td></tr>`;
  return printHtmlDocument({ title: `Ödeme Fişi ${row.paymentNo || ""}`, html: `<main class="paid-receipt"><header><h1>KY ERP PERSONEL ÖDEME FİŞİ</h1><b>${escapeHtml(row.paymentNo || "")}</b></header><section><div><span>Personel</span><strong>${escapeHtml(row.name || row.fullName || "-")}</strong></div><div><span>Hakediş Dönemi</span><strong>${escapeHtml(dateText(row.periodStart || row.startDate))} — ${escapeHtml(dateText(row.periodEnd || row.endDate))}</strong></div><div><span>Ödeme Tarihi</span><strong>${escapeHtml(dateText(row.paidDate || String(row.paidAt || "").slice(0,10)))}</strong></div><div><span>Ödeyen</span><strong>${escapeHtml(row.paidByLabel || "KY ERP Kullanıcısı")}</strong></div></section><table><thead><tr><th>Tarih</th><th>Vardiya</th><th>Tutar</th></tr></thead><tbody>${details}</tbody></table><footer><span>ÖDENDİ</span><strong>${escapeHtml(money(row.totalAmount))}</strong></footer></main>`, css: `@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;color:#111}.paid-receipt{max-width:180mm;margin:auto}.paid-receipt header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}.paid-receipt h1{font-size:16px;margin:0}.paid-receipt section{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}.paid-receipt section div{border:1px solid #bbb;padding:8px}.paid-receipt span{display:block;font-size:11px}.paid-receipt strong{font-size:14px}.paid-receipt table{width:100%;border-collapse:collapse}.paid-receipt th,.paid-receipt td{border:1px solid #777;padding:6px;text-align:left}.paid-receipt footer{margin-top:14px;border:2px solid #111;padding:12px;display:flex;justify-content:space-between;align-items:center}.paid-receipt footer span{font-size:18px;font-weight:900}.paid-receipt footer strong{font-size:24px}` });
}

function actionLabel(row = {}) {
  const key = normalizeText(row.action || row.operation || row.eventType || row.type || row.changeType);
  if (key.includes("PAID") || key.includes("ODE") || key.includes("ÖDE")) return "ÖDENDİ";
  if (key.includes("REMOVE") || key.includes("DELETE") || key.includes("SIL")) return "KAYIT KALDIRILDI";
  if (key.includes("CREATE") || key.includes("ADD")) return "KAYIT EKLENDİ";
  if (key.includes("UPDATE") || key.includes("SAVE")) return "KAYIT GÜNCELLENDİ";
  return key || "İŞLEM";
}
function Stat({ label, value, hint }) { return <div className="gop-stat"><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>; }
function Empty({ children }) { return <div className="gop-empty">{children}</div>; }

export default function DailyHrWorkspace({ activeTab = "daily-entry", activeMainCompany }) {
  const view = VALID_VIEWS.has(activeTab) ? activeTab : "daily-entry";
  const companyId = String(activeMainCompany?.slug || activeMainCompany?.id || "").trim();
  const [employees, setEmployees] = useState([]);
  const [range, setRange] = useState(readRange);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());
  const [shift, setShift] = useState("day");
  const [records, setRecords] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [notes, setNotes] = useState({});
  const [rosterIds, setRosterIds] = useState(() => new Set());
  const [rosterSaved, setRosterSaved] = useState(false);
  const [summaryRows, setSummaryRows] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);
  const [paymentPeriodRows, setPaymentPeriodRows] = useState([]);
  const [paymentLoadError, setPaymentLoadError] = useState("");
  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);
  const [paymentPoolRange, setPaymentPoolRange] = useState(() => readNamedRange(PAYMENT_POOL_RANGE_KEY));
  const [paymentHistoryRange, setPaymentHistoryRange] = useState(() => readNamedRange(PAYMENT_HISTORY_RANGE_KEY));
  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());
  const [paymentTab, setPaymentTab] = useState("period");
  const [paymentHistoryStatus, setPaymentHistoryStatus] = useState("all");
  const [paymentHistoryGroup, setPaymentHistoryGroup] = useState("week");
  const [cardQuery, setCardQuery] = useState("");
  const [cardStatusFilter, setCardStatusFilter] = useState("active");
  const [cardRoleFilter, setCardRoleFilter] = useState("all");
  const [cardBrokerFilter, setCardBrokerFilter] = useState("all");
  const [cardSelectedIds, setCardSelectedIds] = useState(() => new Set());
  const [cardEditor, setCardEditor] = useState(null);
  const [bulkMode, setBulkMode] = useState("day-set");
  const [bulkValue, setBulkValue] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState("");
  const [query] = useState("");
  const [poolAddQuery, setPoolAddQuery] = useState("");
  const [quickAddQuery, setQuickAddQuery] = useState("");
  const [cardAddToRoster, setCardAddToRoster] = useState(false);
  const [cardDialog, setCardDialog] = useState(null);
  const [quick, setQuick] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState("summary");
  const [logRows, setLogRows] = useState([]);
  const [logRevisions, setLogRevisions] = useState([]);
  const [logAttendance, setLogAttendance] = useState([]);
  const [logRange, setLogRange] = useState(readRange);
  const [logQuery, setLogQuery] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logShift, setLogShift] = useState("all");
  const [controlQuery, setControlQuery] = useState("");
  const [periodLocked, setPeriodLocked] = useState(false);
  const [, setPeriodLockKnown] = useState(false);
  const [excelPreview, setExcelPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dialogSizes, setDialogSizes] = useState(readDialogSizes);
  const [quickRowHeight, setQuickRowHeight] = useState(readQuickRowHeight);
  const [quickCardWidth, setQuickCardWidth] = useState(readQuickCardWidth);
  const liveVersionRef = useRef("");
  const livePollBusyRef = useRef(false);

  const days = useMemo(() => rangeDays(range.start, range.end), [range.end, range.start]);
  const roleOptions = useMemo(() => {
    const values = ["Makinacı", "Serimci", "Usta", "Boyacı", "Vasıfsız", ...employees.map((person) => person.role)];
    const unique = new Map();
    values.forEach((value) => { const label = roleLabel(value); const key = normalizeText(label); if (label && key && !unique.has(key)) unique.set(key, label); });
    return [...unique.values()];
  }, [employees]);
  const askNewRole = useCallback(() => {
    const raw = window.prompt("Yeni vasıf adını yazın:");
    if (!String(raw || "").trim()) return "";
    const label = roleLabel(raw);
    return roleOptions.find((item) => normalizeText(item) === normalizeText(label)) || label;
  }, [roleOptions]);
  const resizeDialog = useCallback((kind, field, raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setDialogSizes((current) => {
      const base = current[kind] || DEFAULT_DIALOG_SIZES[kind] || { w: 760, h: 600 };
      const value = field === "w" ? Math.max(420, Math.min(1600, parsed)) : Math.max(260, Math.min(1000, parsed));
      const next = { ...current, [kind]: { ...base, [field]: value } };
      writeDialogSize(kind, next[kind]);
      return next;
    });
  }, []);
  const setSafeRange = useCallback((next) => {
    const resolved = typeof next === "function" ? next(range) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    if (rangeSpanDays(resolved.start, resolved.end) > 31) { setError("Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır."); return; }
    setRange(resolved); writeRange(resolved); setError("");
  }, [range]);
  const setSafePaymentRange = useCallback((target, next) => {
    const current = target === "history" ? paymentHistoryRange : paymentPoolRange;
    const resolved = typeof next === "function" ? next(current) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    if (target === "history") { setPaymentHistoryRange(resolved); writeNamedRange(PAYMENT_HISTORY_RANGE_KEY, resolved); }
    else { setPaymentPoolRange(resolved); writeNamedRange(PAYMENT_POOL_RANGE_KEY, resolved); }
    setError("");
  }, [paymentHistoryRange, paymentPoolRange]);

  useEffect(() => { if (selectedDate < range.start || selectedDate > range.end) setSelectedDate(range.start); }, [range.end, range.start, selectedDate]);

  const loadEmployees = useCallback(async () => {
    if (!companyId) return [];
    const rows = await getDailyEmployees({ mainCompanyId: companyId });
    const normalized = (Array.isArray(rows) ? rows : []).map(employeeOf).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    setEmployees(normalized); return normalized;
  }, [companyId]);

  const loadRangeData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [rows, roster, lock] = await Promise.all([
        getDailyAttendance({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }),
        getDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }),
        getDailyPeriodLock({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }).catch(() => null),
      ]);
      const attendanceRows = Array.isArray(rows) ? rows : [];
      setAttendance(attendanceRows);
      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];
      const savedSet = new Set(savedIds);
      const recordedIds = new Set(attendanceRows.filter((row) => rowDay(row) || rowNight(row)).map(rowEmployeeId).filter(Boolean));
      setRosterIds(savedSet);
      setRosterSaved(![...recordedIds].some((id) => !savedSet.has(id)));
      if (lock !== null) { setPeriodLocked(Boolean(lock?.locked ?? lock?.isLocked ?? lock?.active)); setPeriodLockKnown(true); }
    } catch (loadError) { setError(loadError?.message || "Dönem kayıtları alınamadı."); }
  }, [companyId, range.end, range.start]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true); setError("");
    loadEmployees().catch((e) => setError(e?.message || "Günlük personel listesi alınamadı.")).finally(() => setLoading(false));
  }, [companyId, loadEmployees]);
  useEffect(() => { if (companyId && employees.length) void loadRangeData(); }, [companyId, employees.length, loadRangeData]);

  const loadFocused = useCallback(async () => {
    if (!companyId || view !== "daily-entry" || !selectedDate) return;
    setLoading(true); setError("");
    try {
      const focused = await getDailyFocusedRecords({ mainCompanyId: companyId, date: selectedDate, shift });
      const focusedRows = Array.isArray(focused) ? focused : [];
      setRecords(focusedRows); setSelectedIds(focusedIds(focusedRows)); setCheckedIds(focusedCheckedIds(focusedRows));
      setNotes(Object.fromEntries(focusedRows.map((row) => [rowEmployeeId(row), row.note || ""]).filter(([id]) => id)));
    } catch (loadError) { setError(loadError?.message || "Seçili gün kayıtları alınamadı."); }
    finally { setLoading(false); }
  }, [companyId, selectedDate, shift, view]);
  useEffect(() => { void loadFocused(); }, [loadFocused]);

  const loadWeekly = useCallback(async () => {
    if (!companyId || !["daily-weekly", "daily-dashboard"].includes(view)) return;
    setLoading(true); setError("");
    try { const rows = await getDailyWeeklySummary({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setSummaryRows(Array.isArray(rows) ? rows : []); }
    catch (e) { setError(e?.message || "Haftalık özet alınamadı."); } finally { setLoading(false); }
  }, [companyId, range.end, range.start, view]);
  useEffect(() => { void loadWeekly(); }, [loadWeekly]);

  const loadPayments = useCallback(async () => {
    if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;
    setLoading(true); setPaymentLoadError("");
    if (view === "daily-payments") setError("");
    try {
      const sourceRange = view === "daily-dashboard" ? range : paymentPoolRange;
      const [poolResult, attendanceResult] = await Promise.all([
        getDailyPaymentPool({ mainCompanyId: companyId, startDate: sourceRange.start, endDate: sourceRange.end }),
        getDailyAttendance({ mainCompanyId: companyId, startDate: sourceRange.start, endDate: sourceRange.end }, { forceFresh: true }),
      ]);
      const poolRows = Array.isArray(poolResult) ? poolResult : [];
      const attendanceRows = Array.isArray(attendanceResult) ? attendanceResult : [];
      setPaymentRows(poolRows);

      const employeeLookup = new Map(employees.map((person) => [String(person.id), person]));
      const map = new Map();
      attendanceRows.forEach((row) => {
        const date = rowDate(row);
        if (!date || date < sourceRange.start || date > sourceRange.end) return;
        const employeeId = rowEmployeeId(row);
        if (!employeeId) return;
        const person = employeeLookup.get(String(employeeId)) || {};
        const current = map.get(employeeId) || {
          employeeId,
          name: person.name || row.name || row.fullName || "Personel",
          fullName: person.name || row.name || row.fullName || "Personel",
          personnelNo: person.personnelNo || row.personnelNo || "",
          qualification: person.role || row.qualification || row.role || "-",
          periodStart: sourceRange.start,
          periodEnd: sourceRange.end,
          dayCount: 0,
          dayTotal: 0,
          nightCount: 0,
          nightTotal: 0,
          totalDays: 0,
          totalAmount: 0,
          items: [],
        };
        if (rowDay(row)) {
          const amount = number(row.dayWage ?? row.dayRate ?? person.dayRate);
          current.dayCount += 1;
          current.dayTotal += amount;
          current.totalDays += 1;
          current.totalAmount += amount;
          current.items.push({ workDate: date, shift: "day", amount, active: true });
        }
        if (rowNight(row)) {
          const amount = number(row.nightWage ?? row.nightRate ?? person.nightRate);
          current.nightCount += 1;
          current.nightTotal += amount;
          current.totalDays += 1;
          current.totalAmount += amount;
          current.items.push({ workDate: date, shift: "night", amount, active: true });
        }
        map.set(employeeId, current);
      });
      setPaymentPeriodRows([...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")));
    } catch (e) {
      const message = e?.message || "Dönem ödeme verileri alınamadı.";
      setPaymentRows([]);
      setPaymentPeriodRows([]);
      setPaymentLoadError(message);
      if (view === "daily-payments") setError(message);
    } finally { setLoading(false); }
  }, [companyId, employees, paymentPoolRange, range, view]);
  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const loadPaymentHistory = useCallback(async () => {
    if (!companyId || view !== "daily-payments") return;
    try {
      const rows = await getDailyPaymentHistory({ mainCompanyId: companyId, startDate: paymentHistoryRange.start, endDate: paymentHistoryRange.end, status: paymentHistoryStatus === "all" ? "" : paymentHistoryStatus.toUpperCase() });
      setPaymentHistoryRows(Array.isArray(rows) ? rows : []);
    } catch (e) { setError(e?.message || "Yapılan ödemeler alınamadı."); }
  }, [companyId, paymentHistoryRange.end, paymentHistoryRange.start, paymentHistoryStatus, view]);
  useEffect(() => { void loadPaymentHistory(); }, [loadPaymentHistory]);

  const employeeMap = useMemo(() => new Map(employees.map((person) => [person.id, person])), [employees]);
  const attendanceRosterIds = useMemo(() => new Set(attendance
    .filter((row) => {
      const date = rowDate(row);
      return date >= range.start && date <= range.end && (rowDay(row) || rowNight(row));
    })
    .map(rowEmployeeId)
    .filter(Boolean)), [attendance, range.end, range.start]);
  const effectiveRosterIds = useMemo(() => {
    const next = new Set([...rosterIds, ...attendanceRosterIds, ...selectedIds]);
    if (quick?.ids) quick.ids.forEach((id) => next.add(String(id)));
    return next;
  }, [attendanceRosterIds, quick, rosterIds, selectedIds]);
  const activeRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && effectiveRosterIds.has(person.id)), [effectiveRosterIds, employees]);
  const availableRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && !effectiveRosterIds.has(person.id)), [effectiveRosterIds, employees]);
  const poolPeople = useMemo(() => {
    const needle = poolAddQuery.trim().toLocaleLowerCase("tr-TR");
    return employees.filter((person) => person.active !== false).filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, poolAddQuery]);
  const resolveRosterChoice = useCallback((raw, candidates = availableRosterPeople) => {
    const needle = normalizeText(raw);
    if (!needle) return null;
    return candidates.find((person) => normalizeText(person.personnelNo) === needle || normalizeText(person.name) === needle)
      || candidates.find((person) => `${normalizeText(person.personnelNo)} ${normalizeText(person.name)}`.includes(needle))
      || null;
  }, [availableRosterPeople]);
  const visibleEntryPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return employees
      .filter((person) => person.active !== false && (rosterIds.has(person.id) || selectedIds.has(person.id)))
      .filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, query, rosterIds, selectedIds]);
  const recordByEmployee = useMemo(() => new Map(records.map((row) => [rowEmployeeId(row), row])), [records]);
  useEffect(() => {
    setCheckedIds((current) => {
      const next = new Set([...current].filter((id) => selectedIds.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [selectedIds]);
  const daySummaries = useMemo(() => days.map((date) => {
    const rows = attendance.filter((row) => rowDate(row) === date);
    let dayCount = 0; let nightCount = 0; let total = 0; const people = new Set();
    rows.forEach((row) => {
      const person = employeeMap.get(rowEmployeeId(row));
      if (rowDay(row)) { dayCount += 1; people.add(rowEmployeeId(row)); total += number(row.dayWage ?? row.dayRate ?? person?.dayRate); }
      if (rowNight(row)) { nightCount += 1; people.add(rowEmployeeId(row)); total += number(row.nightWage ?? row.nightRate ?? person?.nightRate); }
    });
    return { date, dayCount, nightCount, total, people: people.size };
  }), [attendance, days, employeeMap]);
  const selectedDaySummary = daySummaries.find((item) => item.date === selectedDate) || { dayCount: 0, nightCount: 0, total: 0, people: 0 };
  const rangeTotals = useMemo(() => daySummaries.reduce((sum, row) => ({ day: sum.day + row.dayCount, night: sum.night + row.nightCount, total: sum.total + row.total }), { day: 0, night: 0, total: 0 }), [daySummaries]);
  const groupedEntryPeople = useMemo(() => {
    const groups = new Map(); visibleEntryPeople.forEach((person) => { const key = person.role || "Vasıfsız"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(person); }); return [...groups.entries()].sort(roleSort);
  }, [visibleEntryPeople]);
  const selectedRoleCounts = useMemo(() => groupedEntryPeople.map(([role, people]) => ({ role, count: people.filter((person) => selectedIds.has(person.id)).length })).filter((row) => row.count > 0), [groupedEntryPeople, selectedIds]);
  const weeklyControlRows = useMemo(() => {
    const map = new Map();
    attendance.forEach((row) => {
      const date = rowDate(row);
      if (!date || date < range.start || date > range.end) return;
      const employeeId = rowEmployeeId(row);
      if (!employeeId) return;
      const person = employeeMap.get(employeeId) || {};
      const current = map.get(employeeId) || { employeeId, name: person.name || row.name || row.fullName || "Personel", personnelNo: person.personnelNo || row.personnelNo || "", role: person.role || row.qualification || row.role || "-", days: {}, dayCount: 0, nightCount: 0, dayTotal: 0, nightTotal: 0, totalAmount: 0 };
      const day = rowDay(row);
      const night = rowNight(row);
      current.days[date] = { day, night };
      if (day) { const amount = number(row.dayWage ?? row.dayRate ?? person.dayRate); current.dayCount += 1; current.dayTotal += amount; current.totalAmount += amount; }
      if (night) { const amount = number(row.nightWage ?? row.nightRate ?? person.nightRate); current.nightCount += 1; current.nightTotal += amount; current.totalAmount += amount; }
      map.set(employeeId, current);
    });
    return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  }, [attendance, employeeMap, range.end, range.start]);
  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentRows, paymentSelectedIds]);
  const selectedPaymentPeriodRows = useMemo(() => paymentPeriodRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentPeriodRows, paymentSelectedIds]);
  const cardRoles = useMemo(() => [...new Set(employees.map((person) => person.role || "Vasıfsız").filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [employees]);
  const cardBrokers = useMemo(() => [...new Set(employees.map((person) => person.broker || "Direkt").filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [employees]);
  const managedEmployees = useMemo(() => {
    const needle = cardQuery.trim().toLocaleLowerCase("tr-TR");
    return employees.filter((person) => {
      const matchesText = !needle || `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`.toLocaleLowerCase("tr-TR").includes(needle);
      const matchesStatus = cardStatusFilter === "all" || (cardStatusFilter === "active" ? person.active !== false : person.active === false);
      const matchesRole = cardRoleFilter === "all" || (person.role || "Vasıfsız") === cardRoleFilter;
      const matchesBroker = cardBrokerFilter === "all" || (person.broker || "Direkt") === cardBrokerFilter;
      return matchesText && matchesStatus && matchesRole && matchesBroker;
    });
  }, [cardBrokerFilter, cardQuery, cardRoleFilter, cardStatusFilter, employees]);
  const selectedCardPeople = useMemo(() => employees.filter((person) => cardSelectedIds.has(person.id)), [cardSelectedIds, employees]);
  useEffect(() => {
    const valid = new Set(employees.map((person) => person.id));
    setCardSelectedIds((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [employees]);

  const paymentMetrics = useMemo(() => paymentPeriodRows.reduce((sum, row) => {
    sum.people += 1;
    sum.dayCount += number(row.dayCount);
    sum.dayTotal += number(row.dayTotal);
    sum.nightCount += number(row.nightCount);
    sum.nightTotal += number(row.nightTotal);
    sum.totalDays += number(row.totalDays);
    sum.totalAmount += number(row.totalAmount);
    return sum;
  }, { people: 0, dayCount: 0, dayTotal: 0, nightCount: 0, nightTotal: 0, totalDays: 0, totalAmount: 0 }), [paymentPeriodRows]);
  const openPaymentMetrics = useMemo(() => paymentRows.reduce((sum, row) => {
    sum.people += 1;
    sum.days += number(row.totalDays ?? (number(row.dayCount) + number(row.nightCount)));
    sum.amount += number(row.totalAmount);
    sum.controlPending += number(row.pendingCheckCount) > 0 ? 1 : 0;
    return sum;
  }, { people: 0, days: 0, amount: 0, controlPending: 0 }), [paymentRows]);
  const periodPaymentStatus = useMemo(() => {
    const openMap = new Map(paymentRows.map((row) => [String(row.employeeId), row]));
    return paymentPeriodRows.reduce((sum, row) => {
      const open = openMap.get(String(row.employeeId));
      if (open) {
        sum.waiting += 1;
        sum.waitingAmount += number(open.totalAmount);
        if (number(open.pendingCheckCount) > 0) sum.controlPending += 1;
      } else {
        sum.paid += 1;
        sum.paidAmount += number(row.totalAmount);
      }
      return sum;
    }, { paid: 0, paidAmount: 0, waiting: 0, waitingAmount: 0, controlPending: 0 });
  }, [paymentPeriodRows, paymentRows]);
  const paymentHistoryMetrics = useMemo(() => paymentHistoryRows.reduce((sum, row) => {
    if (String(row.status).toUpperCase() !== "PAID") return sum;
    sum.amount += number(row.totalAmount); sum.count += 1; sum.days += number(row.totalDays); sum.people.add(String(row.employeeId)); return sum;
  }, { amount: 0, count: 0, days: 0, people: new Set() }), [paymentHistoryRows]);
  const paymentHistoryGroups = useMemo(() => {
    const groups = new Map();
    paymentHistoryRows.forEach((row) => {
      const date = row.paidDate || String(row.paidAt || "").slice(0, 10);
      const key = paymentHistoryGroup === "month" ? String(date).slice(0, 7) : paymentHistoryGroup === "week" ? startOfWeek(date) : date;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
    });
    return [...groups.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  }, [paymentHistoryGroup, paymentHistoryRows]);

  const weeklyTotals = useMemo(() => weeklyControlRows.reduce((sum, row) => ({
    people: sum.people + 1,
    day: sum.day + number(row.dayCount),
    night: sum.night + number(row.nightCount),
    total: sum.total + number(row.totalAmount ?? row.total),
  }), { people: 0, day: 0, night: 0, total: 0 }), [weeklyControlRows]);
  const weeklyPending = useMemo(() => attendance.filter((row) => (rowDay(row) || rowNight(row)) && !(row.checked === true || row.checked === 1 || row.checked === "1")).length, [attendance]);
  const roleOverview = useMemo(() => {
    const ids = new Set(attendance.filter((row) => rowDay(row) || rowNight(row)).map(rowEmployeeId).filter(Boolean));
    const counts = new Map();
    employees.filter((person) => ids.has(person.id)).forEach((person) => {
      const key = person.role || "Vasıfsız";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [attendance, employees]);
  const dashboardPaidAmount = Math.max(0, number(rangeTotals.total) - number(openPaymentMetrics.amount));
  const dashboardDays = daySummaries.length > 7 ? daySummaries.slice(-7) : daySummaries;
  const dashboardPeople = useMemo(() => new Set(attendance.filter((row) => rowDay(row) || rowNight(row)).map(rowEmployeeId).filter(Boolean)).size, [attendance]);
  const dashboardZeroWage = useMemo(() => employees.filter((person) => person.active !== false && person.dayRate <= 0).length, [employees]);
  const dashboardWarnings = useMemo(() => {
    const rows = [];
    if (weeklyPending) rows.push(`${weeklyPending} vardiya kontrol bekliyor.`);
    if (openPaymentMetrics.people) rows.push(`${openPaymentMetrics.people} personelin ödemesi bekliyor.`);
    if (paymentLoadError) rows.push("Ödeme verisi şu anda alınamadı; diğer günlük operasyon verileri etkilenmedi.");
    if (dashboardZeroWage) rows.push(`${dashboardZeroWage} aktif personelin gündüz ücreti 0.`);
    if (periodLocked) rows.push("Seçili dönem kapalı; günlük kayıt değişikliği kilitli.");
    if (!attendance.length) rows.push("Seçili tarih aralığında çalışma kaydı yok.");
    return rows;
  }, [attendance.length, dashboardZeroWage, paymentLoadError, openPaymentMetrics.people, periodLocked, weeklyPending]);
  const recentOperations = useMemo(() => [...attendance].sort((a, b) => String(b.updatedAt || b.createdAt || rowDate(b)).localeCompare(String(a.updatedAt || a.createdAt || rowDate(a)))).slice(0, 8), [attendance]);
  useEffect(() => {
    const valid = new Set(paymentPeriodRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || "")));
    setPaymentSelectedIds((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [paymentPeriodRows]);

  const saveRoster = async () => {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const requestedIds = [...effectiveRosterIds];
      const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: requestedIds });
      setRosterIds(new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : requestedIds));
      setRosterSaved(true);
      setNotice("Tarih aralığı personel listesi kaydedildi.");
    }
    catch (e) { setError(e?.message || "Personel listesi kaydedilemedi."); } finally { setBusy(false); }
  };
  const addRosterPerson = (person, target = "main") => {
    if (!person?.id) { setError("Listeden eklenecek personeli seçin."); return; }
    setRosterIds((current) => { const next = new Set(current); next.add(person.id); return next; });
    setRosterSaved(false);
    if (target === "quick") setQuickAddQuery(""); else setPoolAddQuery("");
    setNotice(`${person.name} tarih aralığı listesine eklendi. Kaydettiğinizde sunucuya yazılacak.`);
  };


  const addPersonToRoster = async (person) => {
    if (!person?.id || busy || periodLocked || rosterIds.has(person.id)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const serverRoster = await getDailyRoster({
        mainCompanyId: companyId,
        startDate: range.start,
        endDate: range.end,
      });
      const serverRosterIds = Array.isArray(serverRoster?.employeeIds)
        ? serverRoster.employeeIds.map(String)
        : Array.isArray(serverRoster)
          ? serverRoster.map(String)
          : [...rosterIds];
      const nextRosterIds = new Set([...serverRosterIds, ...effectiveRosterIds]);
      nextRosterIds.add(person.id);
      const savedRoster = await saveDailyRoster({
        mainCompanyId: companyId,
        startDate: range.start,
        endDate: range.end,
        employeeIds: [...nextRosterIds],
      });
      const finalRosterIds = new Set(
        Array.isArray(savedRoster?.employeeIds)
          ? savedRoster.employeeIds.map(String)
          : [...nextRosterIds],
      );
      setRosterIds(finalRosterIds);
      setRosterSaved(true);
      setNotice(`${person.name} ${dateText(range.start)}–${dateText(range.end)} personel havuzuna eklendi.`);
    } catch (e) {
      setError(e?.message || "Personel tarih aralığı havuzuna eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const setPersonSelectedForShift = async (person, nextSelected) => {
    if (!person?.id || busy || periodLocked) return;
    const currentRecord = recordByEmployee.get(person.id) || {};
    setBusy(true); setError(""); setNotice("");
    try {
      await saveDailyFocusedRecords({
        mainCompanyId: companyId,
        date: selectedDate,
        shift,
        personnelEntries: [{
          personelId: person.id,
          status: nextSelected ? "ACTIVE" : "REMOVE",
          checked: nextSelected ? false : false,
          expectedUpdatedAt: currentRecord.updatedAt || currentRecord.attendanceUpdatedAt || "",
          note: nextSelected ? (notes[person.id] || "") : "",
        }],
      });
      await Promise.all([loadFocused(), loadRangeData()]);
      setNotice(
        nextSelected
          ? `${person.name} ${dateText(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} vardiyasına kaydedildi.`
          : `${person.name} ${dateText(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} kaydı kaldırıldı. Personel havuzda kaldı.`,
      );
    } catch (e) {
      setError(e?.message || "Gün/vardiya kaydı güncellenemedi. Ekranı yenileyip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const removePersonFromRoster = async (person) => {
    if (!person?.id || busy || periodLocked || !rosterIds.has(person.id)) return;
    const workRows = attendance.filter((row) => {
      const date = rowDate(row);
      return rowEmployeeId(row) === person.id
        && date >= range.start
        && date <= range.end
        && (rowDay(row) || rowNight(row));
    });
    const workDates = new Set(workRows.map(rowDate).filter(Boolean));
    const shiftCount = workRows.reduce((sum, row) => sum + (rowDay(row) ? 1 : 0) + (rowNight(row) ? 1 : 0), 0);
    if (shiftCount > 0) {
      const confirmed = window.confirm(
        `${person.name} personelinin ${dateText(range.start)}–${dateText(range.end)} aralığında ${workDates.size} gün / ${shiftCount} vardiya çalışma kaydı var. Personeli havuzdan çıkarmak istediğinize emin misiniz? Mevcut gün/vardiya kayıtları silinmeyecektir.`,
      );
      if (!confirmed) return;
    }

    setBusy(true); setError(""); setNotice("");
    try {
      const serverRoster = await getDailyRoster({
        mainCompanyId: companyId,
        startDate: range.start,
        endDate: range.end,
      });
      const serverRosterIds = Array.isArray(serverRoster?.employeeIds)
        ? serverRoster.employeeIds.map(String)
        : Array.isArray(serverRoster)
          ? serverRoster.map(String)
          : [...rosterIds];
      const requestedRosterIds = serverRosterIds.filter((id) => id !== person.id);
      const savedRoster = await saveDailyRoster({
        mainCompanyId: companyId,
        startDate: range.start,
        endDate: range.end,
        employeeIds: requestedRosterIds,
      });
      const finalRosterIds = new Set(
        Array.isArray(savedRoster?.employeeIds)
          ? savedRoster.employeeIds.map(String)
          : requestedRosterIds,
      );
      setRosterIds(finalRosterIds);
      setRosterSaved(true);
      await loadRangeData();
      setNotice(
        shiftCount > 0
          ? `${person.name} personel havuzundan çıkarıldı. ${workDates.size} gün / ${shiftCount} vardiya geçmiş kaydı korundu.`
          : `${person.name} personel havuzundan çıkarıldı.`,
      );
    } catch (e) {
      setError(e?.message || "Personel havuzdan çıkarılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const setPersonReviewed = async (person, nextChecked) => {
    if (!person?.id || busy || periodLocked || !selectedIds.has(person.id)) return;
    const currentRecord = recordByEmployee.get(person.id) || {};
    setBusy(true); setError(""); setNotice("");
    try {
      await saveDailyFocusedRecords({
        mainCompanyId: companyId,
        date: selectedDate,
        shift,
        personnelEntries: [{
          personelId: person.id,
          status: "ACTIVE",
          checked: Boolean(nextChecked),
          expectedUpdatedAt: currentRecord.updatedAt || currentRecord.attendanceUpdatedAt || "",
          note: notes[person.id] || "",
        }],
      });
      await Promise.all([loadFocused(), loadRangeData()]);
      setNotice(`${person.name} kontrol durumu ${nextChecked ? "onaylandı" : "kaldırıldı"}.`);
    } catch (e) {
      setError(e?.message || "Kontrol durumu güncellenemedi. Ekranı yenileyip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const addFromQuickPool = () => addRosterPerson(resolveRosterChoice(quickAddQuery), "quick");

  const saveFocused = async () => {
    if (busy || periodLocked) return; setBusy(true); setError(""); setNotice("");
    try {
      const missingSelectedPeople = [...selectedIds].filter((id) => !employeeMap.has(id));
      if (missingSelectedPeople.length) throw new Error("Personel listesi eksik yüklendi. Kayıt korunması için ekranı yenileyip tekrar deneyin.");
      if (!rosterSaved) { await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...effectiveRosterIds] }); setRosterIds(new Set(effectiveRosterIds)); setRosterSaved(true); }
      await saveDailyFocusedRecords({ mainCompanyId: companyId, date: selectedDate, shift, personnelEntries: activeRosterPeople.map((person) => { const current = recordByEmployee.get(person.id) || {}; return { personelId: person.id, status: selectedIds.has(person.id) ? "ACTIVE" : "REMOVE", checked: selectedIds.has(person.id) && checkedIds.has(person.id), expectedUpdatedAt: current.updatedAt || current.attendanceUpdatedAt || "", note: notes[person.id] || "" }; }) });
      setNotice(`${dateText(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} kayıtları kaydedildi.`); await Promise.all([loadFocused(), loadRangeData()]);
    } catch (e) { setError(e?.message || "Günlük giriş kaydedilemedi. Başka cihazda değişiklik olduysa Yenile'ye basın."); } finally { setBusy(false); }
  };
  const selectAll = () => setSelectedIds(new Set(activeRosterPeople.filter((p) => shift === "day" || p.nightRate > 0).map((p) => p.id)));
  const clearAll = () => { setSelectedIds(new Set()); setCheckedIds(new Set()); };
  const thisWeek = () => { const start = startOfWeek(); setSafeRange({ start, end: addDays(start, 6) }); setSelectedDate(localDateKey()); };

  const loadQuickFocus = async (date, mode, preserveQuery = "") => {
    const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date, shift: mode });
    const ids = focusedIds(rows);
    const checked = focusedCheckedIds(rows);
    setQuick({ date, shift: mode, ids, baseline: new Set(ids), checked, checkedBaseline: new Set(checked), query: preserveQuery });
  };
  const openQuick = async (date = selectedDate, mode = shift) => {
    if (!date || busy) return;
    setBusy(true); setError("");
    try {
      setSelectedDate(date);
      setShift(mode);
      await loadQuickFocus(date, mode);
    }
    catch (e) { setError(e?.message || "Hızlı giriş açılamadı."); }
    finally { setBusy(false); }
  };
  const changeQuickFocus = async (date, mode) => {
    if (!quick || busy) return;
    setBusy(true); setError("");
    try { await loadQuickFocus(date, mode, quick.query); }
    catch (e) { setError(e?.message || "Hızlı giriş günü yüklenemedi."); }
    finally { setBusy(false); }
  };
  const saveQuick = async (goNext = false) => {
    if (!quick || busy || periodLocked) return;
    const snapshot = quick; setBusy(true); setError("");
    try {
      const missingQuickPeople = [...snapshot.ids].filter((id) => !employeeMap.has(id));
      if (missingQuickPeople.length) throw new Error("Hızlı giriş personel listesi eksik yüklendi. Kayıtlar korunması için Yenile yapıp tekrar deneyin.");
      if (!rosterSaved) { await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...effectiveRosterIds] }); setRosterIds(new Set(effectiveRosterIds)); setRosterSaved(true); }
      const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift });
      const currentMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [rowEmployeeId(row), row]));
      await saveDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift, personnelEntries: activeRosterPeople.map((person) => ({ personelId: person.id, status: snapshot.ids.has(person.id) ? "ACTIVE" : "REMOVE", checked: snapshot.ids.has(person.id) && snapshot.checked.has(person.id), expectedUpdatedAt: currentMap.get(person.id)?.updatedAt || currentMap.get(person.id)?.attendanceUpdatedAt || "", note: currentMap.get(person.id)?.note || "" })) });
      setSelectedDate(snapshot.date); setShift(snapshot.shift); setNotice(`${dateText(snapshot.date)} hızlı giriş kaydedildi.`);
      await Promise.all([loadFocused(), loadRangeData()]);
      const nextDate = addDays(snapshot.date, 1);
      if (goNext && nextDate && nextDate <= range.end) await loadQuickFocus(nextDate, snapshot.shift, snapshot.query);
      else await loadQuickFocus(snapshot.date, snapshot.shift, snapshot.query);
    } catch (e) { setError(e?.message || "Hızlı giriş kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const loadLog = async (targetRange = logRange, shouldOpen = true) => {
    if (busy) return;
    const safe = targetRange?.start && targetRange?.end && targetRange.end >= targetRange.start ? targetRange : range;
    setBusy(true); setError("");
    try {
      const auditPromise = getDailyAudit({ mainCompanyId: companyId, startDate: safe.start, endDate: safe.end, limit: 1200 }).catch(async () => {
        const batches = await Promise.all(rangeDays(safe.start, safe.end).map((date) => getDailyAudit({ mainCompanyId: companyId, date, limit: 300 }).catch(() => [])));
        return batches.flatMap((row) => Array.isArray(row) ? row : Array.isArray(row?.rows) ? row.rows : []);
      });
      const [auditResult, revisionResult, attendanceResult] = await Promise.all([
        auditPromise,
        getDailyRevisions({ mainCompanyId: companyId, startDate: safe.start, endDate: safe.end, limit: 1200 }).catch(() => []),
        getDailyAttendance({ mainCompanyId: companyId, startDate: safe.start, endDate: safe.end }).catch(() => []),
      ]);
      const audits = Array.isArray(auditResult) ? auditResult : Array.isArray(auditResult?.rows) ? auditResult.rows : [];
      const revisions = Array.isArray(revisionResult) ? revisionResult : Array.isArray(revisionResult?.rows) ? revisionResult.rows : [];
      setLogRows(audits.sort((a, b) => String(b.createdAt || b.timestamp || "").localeCompare(String(a.createdAt || a.timestamp || ""))));
      setLogRevisions(revisions);
      setLogAttendance(Array.isArray(attendanceResult) ? attendanceResult : []);
      setLogRange(safe);
      if (shouldOpen) setLogOpen(true);
    } catch (e) { setError(e?.message || "Log kayıtları alınamadı."); }
    finally { setBusy(false); }
  };
  const searchLogRange = () => loadLog(logRange, true);
  const moveLogWeek = (offset) => {
    const next = { start: addDays(logRange.start, offset * 7), end: addDays(logRange.end, offset * 7) };
    setLogRange(next);
    void loadLog(next, true);
  };
  const togglePeriodLock = async () => {
    if (busy) return; setBusy(true); setError("");
    try { const next = !periodLocked; await setDailyPeriodLock({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, locked: next }); setPeriodLocked(next); setPeriodLockKnown(true); setNotice(next ? "Dönem kapatıldı. Günlük kayıt değişikliği kilitlendi." : "Dönem yeniden açıldı."); }
    catch (e) { setError(e?.message || "Dönem kilidi değiştirilemedi."); }
    finally { setBusy(false); }
  };

  const saveCard = async () => {
    if (busy || !cardDialog) return;
    if (!String(cardDialog.name || "").trim()) { setError("Ad soyad zorunludur."); return; }
    if (!String(cardDialog.role || "").trim()) { setError("Vasıf seçimi zorunludur."); return; }
    setBusy(true); setError("");
    try {
      const payload = employeePayload(cardDialog, companyId);
      let saved = null;
      if (cardDialog.id) saved = await updateDailyEmployee(cardDialog.id, payload);
      else saved = await createDailyEmployee(payload);
      const refreshed = await loadEmployees();
      if (cardAddToRoster && !cardDialog.id) {
        const savedId = String(saved?.id || saved?.employeeId || "");
        const created = refreshed.find((person) => person.id === savedId)
          || refreshed.find((person) => normalizeText(person.personnelNo) === normalizeText(payload.personnelNo) && payload.personnelNo)
          || refreshed.find((person) => normalizeText(person.name) === normalizeText(payload.fullName));
        if (created?.id) {
          setRosterIds((current) => { const next = new Set(current); next.add(created.id); return next; });
          setRosterSaved(false);
        }
      }
      setCardDialog(null); setCardAddToRoster(false);
      setNotice(cardDialog.id ? "Personel kartı güncellendi." : "Yeni günlük personel oluşturuldu.");
    } catch (e) { setError(e?.message || "Personel kartı kaydedilemedi."); }
    finally { setBusy(false); }
  };
  const deactivateCard = async (person) => { if (busy || !person?.id) return; setBusy(true); try { await deleteDailyEmployee(person.id, { mainCompanyId: companyId }); await loadEmployees(); if (cardEditor?.id === person.id) setCardEditor(null); setNotice(`${person.name} pasife alındı.`); } catch (e) { setError(e?.message || "Personel pasife alınamadı."); } finally { setBusy(false); } };
  const saveCardEditor = async () => {
    if (busy || !cardEditor?.id) return;
    if (!String(cardEditor.name || "").trim()) { setError("Ad soyad zorunludur."); return; }
    if (!String(cardEditor.role || "").trim()) { setError("Vasıf seçimi zorunludur."); return; }
    setBusy(true); setError("");
    try {
      await updateDailyEmployee(cardEditor.id, employeePayload(cardEditor, companyId));
      const refreshed = await loadEmployees();
      const fresh = refreshed.find((person) => person.id === cardEditor.id);
      if (fresh) setCardEditor({ ...fresh });
      setNotice(`${cardEditor.name} güncellendi.`);
    } catch (e) { setError(e?.message || "Personel güncellenemedi."); }
    finally { setBusy(false); }
  };
  const applyBulkCards = async () => {
    if (busy || !selectedCardPeople.length || !String(bulkValue).trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const percent = bulkMode === "percent" ? number(bulkValue) : 0;
      const updatedPeople = selectedCardPeople.map((person) => {
        const next = { ...person };
        if (bulkMode === "day-set") next.dayRate = number(bulkValue);
        if (bulkMode === "night-set") next.nightRate = number(bulkValue);
        if (bulkMode === "both-set") { next.dayRate = number(bulkValue); next.nightRate = number(bulkValue); }
        if (bulkMode === "role-set") next.role = String(bulkValue).trim();
        if (bulkMode === "percent") {
          next.dayRate = Math.max(0, Math.round(person.dayRate * (1 + percent / 100) * 100) / 100);
          next.nightRate = Math.max(0, Math.round(person.nightRate * (1 + percent / 100) * 100) / 100);
        }
        return next;
      });
      for (let index = 0; index < updatedPeople.length; index += 8) {
        const chunk = updatedPeople.slice(index, index + 8);
        await Promise.all(chunk.map((person) => updateDailyEmployee(person.id, employeePayload(person, companyId))));
      }
      await loadEmployees();
      setNotice(`${updatedPeople.length} personel toplu güncellendi.`);
    } catch (e) { setError(e?.message || "Toplu personel güncellemesi tamamlanamadı."); }
    finally { setBusy(false); }
  };
  const payRow = async (row, printAfter = false) => {
    if (busy || number(row.pendingCheckCount) > 0) return;
    setBusy(true); setError("");
    try {
      const payment = await createDailyPayment({ mainCompanyId: companyId, employeeId: row.employeeId, startDate: paymentPoolRange.start, endDate: paymentPoolRange.end, paymentDate: localDateKey() });
      setNotice(`${payment?.paymentNo || "Ödeme"} · ${row.name || row.fullName} ödendi.`);
      await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);
      if (printAfter) printPaidPaymentReceipt(payment || { ...row, periodStart: paymentPoolRange.start, periodEnd: paymentPoolRange.end, paidDate: localDateKey(), status: "PAID" });
    } catch (e) { setError(e?.message || "Ödeme tamamlanamadı."); } finally { setBusy(false); }
  };
  const paySelectedRows = async () => {
    const rows = selectedPaymentRows.filter((row) => number(row.pendingCheckCount) === 0);
    if (busy || !rows.length) return;
    setBusy(true); setError("");
    try {
      let completed = 0;
      for (const row of rows) { await createDailyPayment({ mainCompanyId: companyId, employeeId: row.employeeId, startDate: paymentPoolRange.start, endDate: paymentPoolRange.end, paymentDate: localDateKey() }); completed += 1; }
      setPaymentSelectedIds(new Set()); setNotice(`${completed} personelin ödemesi kaydedildi.`);
      await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);
    } catch (e) { setError(e?.message || "Seçili ödemeler tamamlanamadı."); } finally { setBusy(false); }
  };
  const cancelPaymentRow = async (row) => {
    if (busy || String(row.status).toUpperCase() !== "PAID") return;
    const reason = window.prompt(`${row.paymentNo || "Ödeme"} iptal nedeni:`);
    if (!reason?.trim()) return;
    if (!window.confirm(`${row.paymentNo || "Ödeme"} iptal edilsin mi? Ödeme geçmişi silinmeyecek; hakediş tekrar ödeme havuzuna açılacak.`)) return;
    setBusy(true); setError("");
    try { await cancelDailyPayment(row.id || row.paymentId, { mainCompanyId: companyId, reason: reason.trim() }); setNotice(`${row.paymentNo} iptal edildi; hakediş yeniden havuza açıldı.`); await Promise.all([loadPaymentHistory(), loadPayments(), loadRangeData()]); }
    catch (e) { setError(e?.message || "Ödeme iptal edilemedi."); } finally { setBusy(false); }
  };
  const settleAndPrintPeriodRows = useCallback(async (rowsToPrint = []) => {
    const slips = Array.isArray(rowsToPrint) ? rowsToPrint : [];
    if (!slips.length || busy) return;
    const openMap = new Map(paymentRows.map((row) => [String(row.employeeId), row]));
    const openRows = slips.map((row) => openMap.get(String(row.employeeId))).filter(Boolean);
    const blocked = openRows.filter((row) => number(row.pendingCheckCount) > 0);
    if (blocked.length) {
      setError(`${blocked.length} personelin kontrolü tamamlanmamış. Fiş ödeme kaydı oluşturduğu için önce Kontrol Edildi işlemini tamamlayın.`);
      return;
    }

    setBusy(true); setError("");
    try {
      let paidNow = 0;
      for (const row of openRows) {
        await createDailyPayment({
          mainCompanyId: companyId,
          employeeId: row.employeeId,
          startDate: paymentPoolRange.start,
          endDate: paymentPoolRange.end,
          paymentDate: localDateKey(),
        });
        paidNow += 1;
      }
      if (paidNow) {
        setNotice(`${paidNow} personelin ödemesi fiş işlemiyle kaydedildi. Çıktı hazırlanıyor.`);
        await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);
      }
      printDailyPaymentSlips(paymentPoolRange, slips);
    } catch (e) {
      setError(e?.message || "Fiş / ödeme işlemi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }, [busy, companyId, loadPaymentHistory, loadPayments, loadRangeData, paymentPoolRange, paymentRows]);

  const printPaymentPeriodSlips = useCallback(async ({ selectedOnly = false } = {}) => {
    let slips = paymentPeriodRows;
    if (selectedOnly) slips = slips.filter((row) => paymentSelectedIds.has(String(row.employeeId)));
    await settleAndPrintPeriodRows(slips);
  }, [paymentPeriodRows, paymentSelectedIds, settleAndPrintPeriodRows]);

  const activePaymentRange = paymentTab === "history" ? paymentHistoryRange : paymentPoolRange;
  const paymentPreset = (mode) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", paymentPresetRange(mode));
  const paymentPresetActive = (mode) => sameRange(activePaymentRange, paymentPresetRange(mode));
  const shiftPaymentRange = (weeks) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { start: addDays(activePaymentRange.start, weeks * 7), end: addDays(activePaymentRange.end, weeks * 7) });
  const paymentRangeControls = <div className="gop-range-controls payment-range-controls"><button type="button" onClick={() => shiftPaymentRange(-1)}>‹ Önceki hafta</button><label>Başlangıç<input type="date" value={activePaymentRange.start} onChange={(e) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { ...activePaymentRange, start: e.target.value })}/></label><label>Bitiş<input type="date" value={activePaymentRange.end} onChange={(e) => setSafePaymentRange(paymentTab === "history" ? "history" : "pool", { ...activePaymentRange, end: e.target.value })}/></label><button type="button" onClick={() => shiftPaymentRange(1)}>Sonraki hafta ›</button></div>;

  const exportExcel = async () => { setBusy(true); try { await downloadDailyExcel({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); } catch (e) { setError(e?.message || "Excel indirilemedi."); } finally { setBusy(false); } };
  const importExcel = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx";
    input.onchange = async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const preview = await previewDailyExcel(file, { mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setExcelPreview(preview); setNotice("Excel okundu. Kontrol edip uygula."); } catch (e) { setError(e?.message || "Excel okunamadı."); } finally { setBusy(false); } };
    input.click();
  };
  const applyExcel = async () => { if (!excelPreview || busy) return; setBusy(true); try { const result = await applyDailyExcel({ mainCompanyId: companyId, startDate: excelPreview.startDate || range.start, endDate: excelPreview.endDate || range.end, rows: excelPreview.rows || [] }); setExcelPreview(null); setNotice(`${result?.count || 0} Excel satırı uygulandı.`); await Promise.all([loadEmployees(), loadRangeData(), loadFocused()]); } catch (e) { setError(e?.message || "Excel uygulanamadı."); } finally { setBusy(false); } };

  useEffect(() => {
    liveVersionRef.current = "";
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return undefined;
    let cancelled = false;

    const refreshQuick = async () => {
      if (!quick) return;
      const snapshot = quick;
      const rows = await getDailyFocusedRecords(
        { mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift },
        { forceFresh: true },
      );
      const ids = focusedIds(rows);
      const checked = focusedCheckedIds(rows);
      if (cancelled) return;
      setQuick((current) => {
        if (!current || current.date !== snapshot.date || current.shift !== snapshot.shift) return current;
        return { ...current, ids, baseline: new Set(ids), checked, checkedBaseline: new Set(checked) };
      });
    };

    const refreshVisibleView = async () => {
      if (view === "daily-entry") {
        await Promise.all([loadEmployees(), loadRangeData(), loadFocused(), refreshQuick()]);
      } else if (view === "daily-cards") {
        await loadEmployees();
      } else if (view === "daily-weekly") {
        await loadWeekly();
      } else if (view === "daily-payments") {
        await Promise.all([loadPayments(), loadPaymentHistory()]);
      } else if (view === "daily-dashboard") {
        await Promise.all([loadEmployees(), loadRangeData(), loadWeekly(), loadPayments()]);
      }
    };

    const poll = async () => {
      if (cancelled || livePollBusyRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      livePollBusyRef.current = true;
      try {
        const state = await getDailySyncState({ mainCompanyId: companyId }, { forceFresh: true, timeoutMs: 5000 });
        const version = String(state?.version || "");
        if (!version) return;
        if (!liveVersionRef.current) { liveVersionRef.current = version; return; }
        if (version === liveVersionRef.current) return;

        const serverSelected = focusedIds(records);
        const serverChecked = focusedCheckedIds(records);
        const noteDirty = view === "daily-entry" && activeRosterPeople.some((person) => String(notes[person.id] || "") !== String(recordByEmployee.get(person.id)?.note || ""));
        const mainDirty = view === "daily-entry" && (!rosterSaved || !sameSet(selectedIds, serverSelected) || !sameSet(checkedIds, serverChecked) || noteDirty);
        const quickHasDirty = quick ? !sameSet(quick.ids, quick.baseline) || !sameSet(quick.checked, quick.checkedBaseline || new Set()) : false;
        if (busy || mainDirty || quickHasDirty) {
          if (!cancelled) setNotice((current) => current || "Başka bilgisayarda yeni kayıt var. Yerel değişiklik kaydedilince otomatik eşitlenecek.");
          return;
        }

        await refreshVisibleView();
        if (!cancelled) {
          liveVersionRef.current = version;
          setNotice("Canlı senkron: başka bilgisayardaki değişiklikler alındı.");
        }
      } catch {
        // Canlı senkron yardımcı katmandır; geçici bağlantı hatası ana günlük işlemi durdurmaz.
      } finally {
        livePollBusyRef.current = false;
      }
    };

    const timer = window.setInterval(() => { void poll(); }, LIVE_SYNC_INTERVAL_MS);
    const onFocus = () => { void poll(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    const localChannel = typeof window.BroadcastChannel === "function" ? new window.BroadcastChannel(DAILY_SYNC_CHANNEL) : null;
    const onLocalMutation = () => { void poll(); };
    localChannel?.addEventListener?.("message", onLocalMutation);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      localChannel?.removeEventListener?.("message", onLocalMutation);
      localChannel?.close?.();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeRosterPeople, busy, checkedIds, companyId, loadEmployees, loadFocused, loadPaymentHistory, loadPayments, loadRangeData, loadWeekly, notes, quick, recordByEmployee, records, rosterSaved, selectedIds, view]);

  if (!companyId) return <div className="content-card module-error-card"><h3>Günlük Operasyon için firma seçin</h3><p>Günlük personel ve ödeme kayıtları firma bazında tutulur.</p></div>;

  const shiftRange = (weeks) => setSafeRange({ start: addDays(range.start, weeks * 7), end: addDays(range.end, weeks * 7) });
  const rangeControls = <div className="gop-range-controls"><button type="button" onClick={() => shiftRange(-1)}>‹ Önceki hafta</button><label>Başlangıç<input type="date" value={range.start} onChange={(e) => setSafeRange({ ...range, start: e.target.value })} /></label><label>Bitiş<input type="date" value={range.end} onChange={(e) => setSafeRange({ ...range, end: e.target.value })} /></label><button type="button" onClick={() => shiftRange(1)}>Sonraki hafta ›</button></div>;
  const dashboardPreset = (mode) => {
    const today = localDateKey();
    const [year, month] = today.split("-").map(Number);
    const monthStart = `${year}-${pad(month)}-01`;
    const monthEnd = localDateKey(new Date(year, month, 0, 12));
    if (mode === "today" || mode === "live") return setSafeRange({ start: today, end: today });
    if (mode === "week") { const start = startOfWeek(today); return setSafeRange({ start, end: addDays(start, 6) }); }
    if (mode === "last") { const start = addDays(startOfWeek(today), -7); return setSafeRange({ start, end: addDays(start, 6) }); }
    if (mode === "month") return setSafeRange({ start: monthStart, end: monthEnd });
    if (mode === "lastMonth") {
      const previous = new Date(year, month - 2, 1, 12);
      return setSafeRange({ start: localDateKey(previous), end: localDateKey(new Date(previous.getFullYear(), previous.getMonth() + 1, 0, 12)) });
    }
  };
  const controlNeedle = normalizeText(controlQuery);
  const controlPerson = controlNeedle ? employees.find((person) => normalizeText(person.personnelNo) === controlNeedle || normalizeText(person.name) === controlNeedle) || employees.find((person) => `${normalizeText(person.personnelNo)} ${normalizeText(person.name)}`.includes(controlNeedle)) : null;
  const personControlRows = controlPerson ? logAttendance.filter((row) => rowEmployeeId(row) === controlPerson.id && rowDate(row) >= logRange.start && rowDate(row) <= logRange.end).sort((a, b) => rowDate(a).localeCompare(rowDate(b))) : [];
  const controlTotals = personControlRows.reduce((sum, row) => ({ day: sum.day + (rowDay(row) ? 1 : 0), night: sum.night + (rowNight(row) ? 1 : 0), paid: sum.paid + (rowPaid(row) ? (rowDay(row) ? 1 : 0) + (rowNight(row) ? 1 : 0) : 0), total: sum.total + (rowDay(row) ? number(row.dayWage ?? controlPerson?.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? controlPerson?.nightRate) : 0) }), { day: 0, night: 0, paid: 0, total: 0 });
  const revisionEvents = logRevisions.map((row) => ({ ...row, action: row.action || row.changeType || "REVISION", createdAt: row.createdAt || row.timestamp }));
  const rawLogRows = logRows.length || revisionEvents.length ? [...logRows, ...revisionEvents] : logAttendance.flatMap((row) => {
    const events = [];
    if (rowDay(row)) events.push({ ...row, action: "KAYIT", shift: "day", createdAt: row.updatedAt || row.createdAt });
    if (rowNight(row)) events.push({ ...row, action: "KAYIT", shift: "night", createdAt: row.updatedAt || row.createdAt });
    return events;
  });
  const visibleLogRows = rawLogRows.filter((row) => {
    const person = employeeMap.get(rowEmployeeId(row));
    const personText = `${row.personName || row.employeeName || row.name || person?.name || ""} ${row.personnelNo || row.code || person?.personnelNo || ""}`.toLocaleLowerCase("tr-TR");
    const actionText = actionLabel(row).toLocaleLowerCase("tr-TR");
    const shiftName = String(row.shift || row.vardiya || "").toLowerCase();
    return (!logQuery || personText.includes(logQuery.toLocaleLowerCase("tr-TR"))) && (!logAction || actionText.includes(logAction.toLocaleLowerCase("tr-TR"))) && (logShift === "all" || shiftName.includes(logShift));
  }).sort((a, b) => String(b.createdAt || b.timestamp || rowDate(b)).localeCompare(String(a.createdAt || a.timestamp || rowDate(a))));
  const logPeople = new Set(logAttendance.map(rowEmployeeId).filter(Boolean)).size;
  const logTotals = logAttendance.reduce((sum, row) => ({ day: sum.day + (rowDay(row) ? 1 : 0), night: sum.night + (rowNight(row) ? 1 : 0), total: sum.total + (rowDay(row) ? number(row.dayWage ?? employeeMap.get(rowEmployeeId(row))?.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? employeeMap.get(rowEmployeeId(row))?.nightRate) : 0) }), { day: 0, night: 0, total: 0 });
  const quickDirty = quick ? !sameSet(quick.ids, quick.baseline) || !sameSet(quick.checked, quick.checkedBaseline || new Set()) : false;
  const closeQuickDialog = () => {
    if (quickDirty && !window.confirm("Kaydedilmemiş hızlı giriş değişiklikleri var. Kaydetmeden kapatılsın mı?")) return;
    setQuick(null);
  };
  const checkedSelectedCount = [...checkedIds].filter((id) => selectedIds.has(id)).length;
  const quickPeople = quick ? activeRosterPeople.filter((person) => !quick.query || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(quick.query.toLocaleLowerCase("tr-TR"))) : [];
  const quickGroups = quick ? (() => { const groups = new Map(); quickPeople.forEach((person) => { const key = person.role || "Vasıfsız"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(person); }); return [...groups.entries()].sort(roleSort); })() : [];
  const quickChecked = quick ? [...quick.checked].filter((id) => quick.ids.has(id)).length : 0;
  const quickPending = quick ? Math.max(quick.ids.size - quickChecked, 0) : 0;
  const currentWeekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`));

  return (
    <section className="gop-workspace notranslate" translate="no">
      {view !== "daily-entry" ? <header className="gop-header"><div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-dashboard" ? "Yönetim Özeti" : view === "daily-cards" ? "Personel & Ücret Kartları" : view === "daily-weekly" ? "Dönem Kontrolü" : "Hakediş & Ödeme"}</h1><p>{view === "daily-dashboard" ? "Personel, vardiya, kontrol ve hakediş durumunu canlı olarak izleyin." : view === "daily-cards" ? "Personel kartlarını, vasıfları ve günlük ücretleri tek merkezden yönetin." : view === "daily-weekly" ? "Seçili dönemi gün gün doğrulayın, kontrol edin ve raporlayın." : "Hakediş, ödeme, fiş ve kalıcı ödeme geçmişini yönetin."}</p></div><button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-dashboard" ? Promise.all([loadEmployees(), loadRangeData(), loadWeekly(), loadPayments()]) : view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? Promise.all([loadPayments(), loadPaymentHistory()]) : loadEmployees()}><RefreshCw size={16}/> Yenile</button></header> : null}
      {notice ? <div className="gop-notice">{notice}</div> : null}{error ? <div className="gop-error">{error}</div> : null}

      {view === "daily-entry" ? <div className={`kyop-daily ${shift}`}>
        <div className="kyop-titlebar"><div><span>KY ERP / GÜNLÜK OPERASYON / GÜVENLİ GİRİŞ</span><h1>Günlük Personel Girişi</h1><p>Detaylı kontrolde tek gün aktiftir; hızlı giriş de tek gün ve tek vardiya üzerinden çalışır.</p></div><div className="kyop-mode"><button className={shift === "day" ? "active day" : ""} type="button" onClick={() => setShift("day")}><Sun size={17}/> GÜNDÜZ GİRİŞİ</button><button className={shift === "night" ? "active night" : ""} type="button" onClick={() => setShift("night")}><Moon size={17}/> GECE GİRİŞİ</button></div></div>
        <div className="kyop-actions">
          <div className="kyop-range-summary"><span>Tarih Aralığı</span><strong>{dateText(range.start)} — {dateText(range.end)}</strong></div><button type="button" onClick={() => shiftRange(-1)}>‹ Önceki Hafta</button><button type="button" onClick={() => shiftRange(1)}>Sonraki Hafta ›</button>
          <button type="button" onClick={thisWeek}><CalendarDays size={15}/> Bu Hafta</button><button type="button" className="primary" onClick={() => void openQuick()}><Zap size={15}/> Hızlı Personel Girişi</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={15}/> Yeni Personel Ekle</button><button type="button" onClick={selectAll}><CheckCircle2 size={15}/> Tümünü Seç</button><button type="button" onClick={clearAll}>Seçimi Kaldır</button><button type="button" onClick={loadFocused}><RefreshCw size={15}/> Kayıtlı Seçimi Yükle</button><button type="button" className="primary" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günlük Kaydet</button><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Liste", range, daySummaries.map((d) => ({ name: dateText(d.date), role: `${d.people} personel`, dayCount: d.dayCount, nightCount: d.nightCount, totalAmount: d.total })))}><Printer size={15}/> Haftalık Liste Yazdır</button><button type="button" onClick={exportExcel}><FileSpreadsheet size={15}/> Excel Aktar</button><button type="button" onClick={importExcel}><FileSpreadsheet size={15}/> Excel Yükle</button>
        </div>
        <div className={`kyop-banner ${shift === "night" ? "night" : ""}`}><strong>Güvenli giriş modu:</strong><span>Yalnız {longDateText(selectedDate)} — {shift === "day" ? "Gündüz" : "Gece"} aktif. Hızlı girişte de aynı anda yalnız bir gün düzenlenir.</span>{periodLocked ? <b><LockKeyhole size={14}/> DÖNEM KAPALI</b> : null}</div>
        <div className="kyop-days" aria-label="Tarih aralığı">{daySummaries.map((item) => <button type="button" key={item.date} className={item.date === selectedDate ? "active" : ""} title={`${longDateText(item.date)} · çift tıkla hızlı giriş`} onClick={() => setSelectedDate(item.date)} onDoubleClick={() => void openQuick(item.date, shift)}><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))}</small><strong>{dateText(item.date, true)}</strong>{item.date === selectedDate ? <i>AKTİF</i> : null}</button>)}</div>
        <div className="kyop-grid">
          <aside className="kyop-panel kyop-pool"><div className="kyop-panel-head"><Users size={16}/> Dönem Personel Listesi <b>{rosterIds.size} / {employees.filter((person) => person.active !== false).length}</b></div><div className="kyop-pool-top"><label className="kyop-search"><Search size={14}/><input value={poolAddQuery} onChange={(e) => setPoolAddQuery(e.target.value)} placeholder="Personel ara"/></label><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><Plus size={14}/> Personel</button></div><div className="kyop-pool-list">{poolPeople.length ? poolPeople.map((person) => { const inRoster = rosterIds.has(person.id); return <label key={person.id} className={inRoster ? "included" : ""}><input type="checkbox" checked={inRoster} disabled={busy || periodLocked} title={inRoster ? "Havuzdan çıkarmak için orta tablodaki çöp butonunu kullanın." : "Tarih aralığı havuzuna ekle"} onChange={() => { if (!inRoster) void addPersonToRoster(person); }}/><span><strong>{person.personnelNo ? `${person.personnelNo} · ` : ""}{person.name}</strong><small>{person.role || "Vasıfsız"}</small><em>{inRoster ? "Havuzda" : "Havuza ekle"}</em><em>G: {money(person.dayRate)} · N: {money(person.nightRate)}</em></span></label>; }) : <Empty>Personel bulunamadı.</Empty>}</div><button type="button" className="primary full" disabled={busy || rosterSaved} onClick={saveRoster}><Save size={15}/> {rosterSaved ? `Dönem Listesi Kayıtlı (${rosterIds.size})` : `Dönem Listesini Kaydet (${rosterIds.size})`}</button></aside>

          <main className="kyop-panel kyop-entry"><div className="kyop-entry-head"><div><span>SEÇİLİ GÜNÜN PERSONEL GİRİŞİ</span><h2>{dateText(selectedDate)} · {shift === "day" ? "Gündüz" : "Gece"}</h2><p>Bu tablo yalnız {currentWeekday} günü için gösterilir. Üstte gün seçince liste ve toplamlar aynı güne yenilenir.</p></div><div className="kyop-head-actions"><button type="button" onClick={loadLog}>Log</button><button type="button" className={periodLocked ? "locked" : ""} onClick={togglePeriodLock}>{periodLocked ? "Dönemi Aç" : "Dönemi Kapat"}</button><b>{dateText(selectedDate, true)} · {shift === "day" ? "G" : "N"}</b></div></div>
            <div className="kyop-table-wrap"><table><thead><tr><th>Personel / Giriş / Durum</th><th>Vasıf</th><th>Aktif Gün</th><th>Gündüz Ücret</th><th>Gece Ücret</th><th>Not</th><th>İşlem</th></tr></thead><tbody>{groupedEntryPeople.length ? groupedEntryPeople.flatMap(([role, people]) => [<tr className="group" key={`g-${role}`}><td colSpan="7">{role} <b>{people.length} personel</b></td></tr>, ...people.map((person) => { const selected = selectedIds.has(person.id); const reviewed = checkedIds.has(person.id); const blocked = shift === "night" && person.nightRate <= 0; return <tr key={person.id} className={`${selected ? "selected" : ""} ${reviewed ? "checked" : ""}`}><td><div className="kyop-person-cell"><div><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small><em>{!rosterIds.has(person.id) ? (reviewed ? "Dönem listesi dışı kayıt · ✓ Kontrol Edildi" : "Dönem listesi dışı kayıt · Bu Gün Seçildi") : reviewed ? "✓ Kontrol Edildi" : selected ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em></div><span className={`kyop-row-shift ${shift}`}>{shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div></td><td>{person.role || "-"}</td><td>{dateText(selectedDate, true)}</td><td>{money(person.dayRate)}</td><td>{person.nightRate > 0 ? money(person.nightRate) : "-"}</td><td><input value={notes[person.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [person.id]: e.target.value }))} placeholder="Not"/></td><td><div className="kyop-row-actions"><button type="button" title={selected ? "Gün seçimini kaldır" : "Seçili güne/vardiyaya kaydet"} disabled={blocked || periodLocked || busy} className={selected ? "selected" : ""} onClick={() => setPersonSelectedForShift(person, !selected)}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked || busy} className={reviewed ? "selected" : ""} onClick={() => setPersonReviewed(person, !reviewed)}>✓</button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title={rosterIds.has(person.id) ? "Personeli tarih aralığı havuzundan çıkar" : "Dönem listesi dışı kayıt"} disabled={!rosterIds.has(person.id) || periodLocked || busy} onClick={() => removePersonFromRoster(person)}><Trash2 size={14}/></button></div></td></tr>; })]) : <tr><td colSpan="7"><Empty>Seçili dönemin personel listesinde veya aktif günde kayıt yok. Soldaki listeden personel ekleyin.</Empty></td></tr>}</tbody></table></div>
          </main>

          <aside className="kyop-panel kyop-control"><div className="kyop-panel-head"><ClipboardList size={16}/> Günlük Kontrol</div><div className="kyop-control-body"><div className="kyop-active-day"><span>Aktif Gün</span><strong>{dateText(selectedDate)}</strong><small>{shift === "day" ? "Gündüz" : "Gece"}</small></div><div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(visibleEntryPeople.length - selectedIds.size, 0)}</strong><small>{visibleEntryPeople.length} havuz/gün personeli</small></div><div className="kyop-control-highlight cyan"><span>Kontrol Edilen / Toplam</span><strong>{checkedSelectedCount} / {selectedIds.size}</strong><small>{Math.max(selectedIds.size - checkedSelectedCount, 0)} kayıt kontrol bekliyor</small></div><div className="kyop-control-highlight blue"><span>Günlük Toplam</span><strong>{money(selectedDaySummary.total)}</strong><small>G {money(employees.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.dayRate : 0), 0))} · N {money(employees.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.nightRate : 0), 0))}</small></div><div className="kyop-control-highlight violet"><span>Tarih Aralığı Toplamı</span><strong>{money(rangeTotals.total)}</strong><small>{dateText(range.start)} - {dateText(range.end)} · G {rangeTotals.day} · N {rangeTotals.night}</small></div><div className="kyop-role-counts"><div><span>Gündüz çalışan</span><b>{selectedDaySummary.dayCount}</b></div><div><span>Gece çalışan</span><b>{selectedDaySummary.nightCount}</b></div>{selectedRoleCounts.map((row) => <div key={row.role}><span>{row.role}</span><b>{row.count}</b></div>)}</div><div className={`kyop-control-alert ${selectedIds.size ? "ok" : "warn"}`}>{selectedIds.size ? `${shift === "day" ? "Gündüz" : "Gece"} seçili · ${selectedIds.size} personel seçildi.` : `${shift === "day" ? "Gündüz" : "Gece"} seçili · henüz personel seçilmedi.`}</div><button type="button" className="primary full" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günü Kaydet</button></div></aside>
        </div>
      </div> : null}

      {view === "daily-dashboard" ? <div className="gop-dashboard">
        <div className="gop-dashboard-filter"><div className="gop-preset-buttons"><button type="button" onClick={() => dashboardPreset("live")}>● Canlı</button><button type="button" onClick={() => dashboardPreset("today")}>Bugün</button><button type="button" onClick={() => dashboardPreset("week")}>Bu Hafta</button><button type="button" onClick={() => dashboardPreset("last")}>Geçen Hafta</button><button type="button" onClick={() => dashboardPreset("month")}>Bu Ay</button><button type="button" onClick={() => dashboardPreset("lastMonth")}>Geçen Ay</button></div>{rangeControls}</div>
        <section className="gop-owner-strip" aria-label="Yönetici hızlı özeti">
          <div className="owner-total"><span>YÖNETİCİ ÖZETİ</span><small>{dateText(range.start)} — {dateText(range.end)}</small><strong>{money(rangeTotals.total)}</strong><em>Toplam hakediş</em></div>
          <div><span>ÖDENDİ</span><strong>{money(dashboardPaidAmount)}</strong><small>{periodPaymentStatus.paid} personel</small></div>
          <div><span>BEKLEYEN</span><strong>{money(openPaymentMetrics.amount)}</strong><small>{openPaymentMetrics.people} personel</small></div>
          <div><span>KONTROL</span><strong>{weeklyPending}</strong><small>{weeklyPending ? "vardiya kontrol bekliyor" : "tamamlandı"}</small></div>
        </section>
        <div className="gop-dashboard-stats"><Stat label="Çalışan Personel" value={dashboardPeople} hint={`${dateText(range.start)} — ${dateText(range.end)}`}/><Stat label="Toplam Vardiya" value={rangeTotals.day + rangeTotals.night} hint={`G ${rangeTotals.day} · N ${rangeTotals.night}`}/><Stat label="Kontrol Bekleyen" value={weeklyPending} hint={weeklyPending ? "İnceleme gerekli" : "Kontroller tamam"}/><Stat label="Ödeme Bekleyen" value={openPaymentMetrics.people} hint={money(openPaymentMetrics.amount)}/><Stat label="Dönem Toplamı" value={money(rangeTotals.total)} hint={`Ödenen ${money(dashboardPaidAmount)}`}/></div>
        <div className="gop-dashboard-grid">
          <section className="gop-dashboard-main"><div className="gop-section-title"><div><strong>Günlük Durum</strong><span>Seçili aralıktaki son 7 gün</span></div><span className="gop-live-chip">● Canlı senkron</span></div><div className="gop-dashboard-days">{dashboardDays.length ? dashboardDays.map((item) => <article key={item.date}><div><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${item.date}T12:00:00`))}</small><strong>{dateText(item.date, true)}</strong></div><dl><div className="day"><dt>Gündüz</dt><dd>{item.dayCount}</dd></div><div className="night"><dt>Gece</dt><dd>{item.nightCount}</dd></div><div><dt>Personel</dt><dd>{item.people}</dd></div></dl><b>{money(item.total)}</b></article>) : <Empty>Bu aralıkta günlük kayıt yok.</Empty>}</div></section>
          <aside className="gop-dashboard-side"><div className="gop-section-title"><div><strong>Yönetici Bilgilendirme</strong><span>Öncelikli kontrol noktaları</span></div></div><div className="gop-alert-list">{dashboardWarnings.length ? dashboardWarnings.map((warning, index) => <div key={index} className="warn">{warning}</div>) : <div className="ok">Bu dönem için kritik uyarı yok.</div>}</div><div className="gop-dashboard-mini"><div><span>Aktif personel</span><b>{employees.filter((person) => person.active !== false).length}</b></div><div><span>Ödenen personel</span><b>{periodPaymentStatus.paid}</b></div><div><span>Bekleyen tutar</span><b>{money(openPaymentMetrics.amount)}</b></div></div></aside>
        </div>
        <div className="gop-dashboard-details">
          <details open={dashboardOpen === "roles"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "roles" : "")}><summary>Vasıf Dağılımı <span>{roleOverview.length} grup</span></summary><div className="gop-role-overview">{roleOverview.length ? roleOverview.map(([role, count]) => <div key={role}><span>{role}</span><b>{count}</b></div>) : <Empty>Kayıt yok.</Empty>}</div></details>
          <details open={dashboardOpen === "payments"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "payments" : "")}><summary>Maliyet & Ödeme <span>{money(rangeTotals.total)}</span></summary><div className="gop-cost-overview"><div><span>Gündüz vardiya</span><b>{rangeTotals.day}</b></div><div><span>Gece vardiya</span><b>{rangeTotals.night}</b></div><div><span>Dönem toplamı</span><b>{money(rangeTotals.total)}</b></div><div><span>Ödeme bekleyen</span><b>{money(openPaymentMetrics.amount)}</b></div></div></details>
          <details open={dashboardOpen === "recent"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "recent" : "")}><summary>Son Kayıtlar <span>{recentOperations.length}</span></summary><div className="gop-recent-list">{recentOperations.length ? recentOperations.map((row, index) => { const person = employeeMap.get(rowEmployeeId(row)); return <div key={`${rowEmployeeId(row)}-${rowDate(row)}-${index}`}><span><strong>{person?.name || row.name || row.fullName || "Personel"}</strong><small>{dateText(rowDate(row))}</small></span><b>{rowDay(row) ? "G" : ""}{rowDay(row) && rowNight(row) ? " + " : ""}{rowNight(row) ? "N" : ""}</b><em>{dateTimeText(row.updatedAt || row.createdAt)}</em></div>; }) : <Empty>Kayıt yok.</Empty>}</div></details>
        </div>
      </div> : null}

      {view === "daily-cards" ? <div className="gop-card-manager">
        <section className="gop-card-pool"><div className="gop-card-manager-head"><div><strong>Personel Havuzu</strong><span>{managedEmployees.length} / {employees.length} kayıt</span></div><button type="button" className="primary" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><Plus size={15}/> Yeni Personel</button></div><label className="gop-search standalone"><Search size={15}/><input value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder="Ad, kod, vasıf veya aracı ara"/></label><div className="gop-card-filters"><select value={cardStatusFilter} onChange={(e) => setCardStatusFilter(e.target.value)}><option value="active">Aktif</option><option value="passive">Pasif</option><option value="all">Tümü</option></select><select value={cardRoleFilter} onChange={(e) => setCardRoleFilter(e.target.value)}><option value="all">Tüm vasıflar</option>{cardRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select><select value={cardBrokerFilter} onChange={(e) => setCardBrokerFilter(e.target.value)}><option value="all">Tüm aracılar</option>{cardBrokers.map((broker) => <option key={broker} value={broker}>{broker}</option>)}</select></div><div className="gop-card-selectbar"><button type="button" onClick={() => setCardSelectedIds(new Set(managedEmployees.map((person) => person.id)))}>Görünenleri Seç</button><button type="button" onClick={() => setCardSelectedIds(new Set())}>Seçimi Kaldır</button><b>{cardSelectedIds.size} seçili</b></div><div className="gop-card-person-list">{managedEmployees.length ? managedEmployees.map((person) => { const picked = cardSelectedIds.has(person.id); const active = cardEditor?.id === person.id; return <div key={person.id} className={`${active ? "active" : ""} ${person.active === false ? "passive" : ""}`}><label><input type="checkbox" checked={picked} onChange={() => setCardSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}/></label><button type="button" onClick={() => setCardEditor({ ...person })}><span><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small></span><span><b>G {money(person.dayRate)}</b><b>N {money(person.nightRate)}</b></span></button></div>; }) : <Empty>Filtreye uygun personel yok.</Empty>}</div></section>
        <section className="gop-card-detail"><div className="gop-card-manager-head"><div><strong>{cardEditor ? "Personel Bilgileri" : "Personel Yönetimi"}</strong><span>{cardEditor ? `${cardEditor.personnelNo || "Kod yok"} · ${cardEditor.role || "Vasıfsız"}` : "Düzenlemek için soldan personel seçin"}</span></div></div>{cardEditor ? <div className="gop-inline-person-form"><label>Ad Soyad<input value={cardEditor.name} onChange={(e) => setCardEditor({ ...cardEditor, name: e.target.value })}/></label><label>Personel No<input value={cardEditor.personnelNo} onChange={(e) => setCardEditor({ ...cardEditor, personnelNo: e.target.value })}/></label><div className="gop-role-field"><label>Vasıf<select value={cardEditor.role} onChange={(e) => setCardEditor({ ...cardEditor, role: e.target.value })}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" onClick={() => { const role = askNewRole(); if (role) setCardEditor({ ...cardEditor, role }); }}><Plus size={13}/> Vasıf Ekle</button></div><label>Aracı<input value={cardEditor.broker} onChange={(e) => setCardEditor({ ...cardEditor, broker: e.target.value })}/></label><label>Gündüz Ücret<input type="number" value={cardEditor.dayRate} onChange={(e) => setCardEditor({ ...cardEditor, dayRate: number(e.target.value) })}/></label><label>Gece Ücret<input type="number" value={cardEditor.nightRate} onChange={(e) => setCardEditor({ ...cardEditor, nightRate: number(e.target.value) })}/></label><label className="wide">Not<textarea rows="3" value={cardEditor.note || ""} onChange={(e) => setCardEditor({ ...cardEditor, note: e.target.value })}/></label><label className="check"><input type="checkbox" checked={cardEditor.active !== false} onChange={(e) => setCardEditor({ ...cardEditor, active: e.target.checked })}/> Aktif personel</label><div className="gop-inline-person-actions"><button type="button" onClick={() => setCardEditor(null)}>Kapat</button>{cardEditor.active !== false ? <button type="button" onClick={() => deactivateCard(cardEditor)}><Trash2 size={14}/> Pasife Al</button> : null}<button type="button" className="primary" disabled={busy} onClick={saveCardEditor}><Save size={15}/> Kaydet</button></div></div> : <div className="gop-card-empty-detail"><Users size={30}/><strong>Personel seçin</strong><span>Kart bilgileri sağ tarafta açılır; modal açmadan düzenleyebilirsiniz.</span></div>}
          <div className="gop-bulk-editor"><div><strong>Toplu Düzenleme</strong><span>Seçili {selectedCardPeople.length} personel</span></div><select value={bulkMode} onChange={(e) => setBulkMode(e.target.value)}><option value="day-set">Gündüz ücret ata</option><option value="night-set">Gece ücret ata</option><option value="both-set">Gündüz + Gece aynı tutar</option><option value="percent">Ücretlere % uygula</option><option value="role-set">Vasıf değiştir</option></select>{bulkMode === "role-set" ? <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select> : <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "percent" ? "+10 veya -5" : "Tutar"}/>}<button type="button" className="primary" disabled={busy || !selectedCardPeople.length || !String(bulkValue).trim()} onClick={applyBulkCards}>Seçililere Uygula</button></div>
        </section>
      </div> : null}

      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}<div className="gop-print-actions"><button type="button" disabled={!weeklyControlRows.length} onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><Printer size={16}/> Kontrol Listesi</button><button type="button" disabled={!summaryRows.length} onClick={() => printRows("KY ERP Günlük Operasyon Dönem Özeti", range, summaryRows, { showTotals: true })}><Printer size={16}/> Özet Yazdır</button><button type="button" onClick={exportExcel}><FileSpreadsheet size={16}/> Excel</button></div></div><div className="gop-week-stats"><Stat label="Çalışan" value={weeklyTotals.people}/><Stat label="Toplam Gün" value={weeklyTotals.day + weeklyTotals.night}/><Stat label="Gündüz" value={weeklyTotals.day}/><Stat label="Gece" value={weeklyTotals.night}/><Stat label="Kontrol Bekleyen" value={weeklyPending}/><Stat label="Toplam Tutar" value={money(weeklyTotals.total)}/></div><div className="gop-card gop-week-card"><div className="gop-card-head"><div><h2>Dönem Kontrol Matrisi</h2><span>{dateText(range.start)} — {dateText(range.end)} · Gün gün çalışma ve hakediş kontrolü.</span></div></div><div className="gop-week-matrix"><table><thead><tr><th className="person">Personel</th><th className="role">Vasıf</th>{days.slice(0, 7).map((date) => <th key={date}><span>{new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</span><b>{dateText(date, true)}</b></th>)}<th>Toplam Gün</th><th>Toplam</th></tr></thead><tbody>{weeklyControlRows.length ? weeklyControlRows.map((row) => <tr key={row.employeeId}><td className="person"><strong>{row.name}</strong><small>{row.personnelNo || ""}</small></td><td className="role">{row.role || "-"}</td>{days.slice(0, 7).map((date) => { const cell = row.days?.[date] || {}; return <td key={date} className="shift-cell"><span className={cell.day ? "on day" : ""}>G{cell.day ? "✓" : "–"}</span><span className={cell.night ? "on night" : ""}>N{cell.night ? "✓" : "–"}</span></td>; })}<td className="total-day"><strong>{number(row.dayCount) + number(row.nightCount)}</strong></td><td className="money"><strong>{money(row.totalAmount)}</strong></td></tr>) : <tr><td colSpan={days.slice(0, 7).length + 4}><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div><details className="gop-week-detail"><summary>Vasıf Dağılımı <span>{roleOverview.length} grup</span></summary><div className="gop-role-overview">{roleOverview.map(([role, count]) => <div key={role}><span>{role}</span><b>{count}</b></div>)}</div></details></div></> : null}

      {view === "daily-payments" ? <div className="gop-payments-v2">
        <div className="gop-payment-tabs three">
          <button type="button" className={paymentTab === "period" ? "active" : ""} onClick={() => setPaymentTab("period")}><Printer size={16}/> Dönem / Çıktı <b>{paymentPeriodRows.length}</b></button>
          <button type="button" className={paymentTab === "pool" ? "active" : ""} onClick={() => setPaymentTab("pool")}><WalletCards size={16}/> Ödeme Bekleyen <b>{paymentRows.length}</b></button>
          <button type="button" className={paymentTab === "history" ? "active" : ""} onClick={() => { setPaymentHistoryRange(paymentPoolRange); writeNamedRange(PAYMENT_HISTORY_RANGE_KEY, paymentPoolRange); setPaymentTab("history"); }}><ClipboardList size={16}/> Yapılan Ödemeler <b>{paymentHistoryRows.filter((row) => String(row.status).toUpperCase() === "PAID").length}</b></button>
        </div>
        <div className="gop-toolbar-card payment-toolbar"><div className="gop-payment-filter-context"><strong>{paymentTab === "history" ? "Ödeme Tarihi Filtresi" : "Hakediş Filtresi"}</strong><span>{dateText(activePaymentRange.start)} — {dateText(activePaymentRange.end)}</span></div><div className="gop-preset-buttons"><button type="button" className={paymentPresetActive("today") ? "active" : ""} onClick={() => paymentPreset("today")}>Bugün</button><button type="button" className={paymentPresetActive("week") ? "active" : ""} onClick={() => paymentPreset("week")}>Bu Hafta</button><button type="button" className={paymentPresetActive("lastWeek") ? "active" : ""} onClick={() => paymentPreset("lastWeek")}>Geçen Hafta</button><button type="button" className={paymentPresetActive("month") ? "active" : ""} onClick={() => paymentPreset("month")}>Bu Ay</button><button type="button" className={paymentPresetActive("lastMonth") ? "active" : ""} onClick={() => paymentPreset("lastMonth")}>Geçen Ay</button><button type="button" className={paymentPresetActive("year") ? "active" : ""} onClick={() => paymentPreset("year")}>Bu Yıl</button></div>{paymentRangeControls}</div>

        {paymentTab === "period" ? <>
          <div className="gop-payment-stats period-stats"><Stat label="Personel" value={paymentMetrics.people} hint={`${paymentMetrics.totalDays} vardiya`}/><Stat label="Gündüz" value={paymentMetrics.dayCount} hint={money(paymentMetrics.dayTotal)}/><Stat label="Gece" value={paymentMetrics.nightCount} hint={money(paymentMetrics.nightTotal)}/><Stat label="Ödendi" value={periodPaymentStatus.paid} hint={money(periodPaymentStatus.paidAmount)}/><Stat label="Bekleyen" value={periodPaymentStatus.waiting} hint={money(periodPaymentStatus.waitingAmount)}/><Stat label="GENEL TOPLAM" value={money(paymentMetrics.totalAmount)}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Dönem Hakedişleri ve Çıktı</h2><span>Bu liste kalıcıdır. Fiş yazdırılan açık hakediş otomatik ÖDENDİ olarak kaydedilir; daha önce ödenen fişler tekrar yazdırılabilir.</span></div><div className="gop-print-actions"><span className="print-payment-note">Fiş = Ödendi</span><button type="button" disabled={!selectedPaymentPeriodRows.length} onClick={() => printPaymentPeriodSlips({ selectedOnly: true })}><Printer size={15}/> Seçili Fişleri Yazdır</button><button type="button" disabled={!paymentPeriodRows.length} onClick={() => printPaymentPeriodSlips()}><Printer size={15}/> Tüm Fişleri Yazdır</button><button type="button" onClick={() => setPaymentSelectedIds(new Set(paymentPeriodRows.map((row) => String(row.employeeId))))}>Tümünü Seç</button><button type="button" disabled={!paymentSelectedIds.size} onClick={() => setPaymentSelectedIds(new Set())}>Seçimi Kaldır</button></div></div>
            <div className="gop-payment-ledger-table period-ledger"><table><thead><tr><th>Seç</th><th>Personel</th><th>Hakediş Dönemi</th><th>Gündüz Adet</th><th>Gündüz Toplam</th><th>Gece Adet</th><th>Gece Toplam</th><th>Ücret Toplamı</th><th>Durum</th><th>Fiş</th></tr></thead><tbody>{paymentPeriodRows.length ? paymentPeriodRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); const open=paymentRows.find((item) => String(item.employeeId)===key); const controlPending=open ? number(open.pendingCheckCount)>0 : false; return <tr key={key}><td><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next=new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next; })}/></td><td><strong>{row.name || row.fullName}</strong><small>{row.personnelNo || ""} · {row.qualification || "-"}</small></td><td>{dateText(paymentPoolRange.start)} — {dateText(paymentPoolRange.end)}</td><td><b>{number(row.dayCount)}</b></td><td className="money">{money(row.dayTotal)}</td><td><b>{number(row.nightCount)}</b></td><td className="money">{money(row.nightTotal)}</td><td className="money grand"><strong>{money(row.totalAmount)}</strong></td><td><span className={`payment-state ${open ? (controlPending ? "control" : "waiting") : "paid"}`}>{open ? (controlPending ? "KONTROL BEKLİYOR" : "ÖDEME BEKLİYOR") : "✓ ÖDENDİ"}</span></td><td><button type="button" disabled={busy || controlPending} onClick={() => settleAndPrintPeriodRows([row])}><Printer size={14}/> {open ? "Fiş Al" : "Tekrar Yazdır"}</button></td></tr>; }) : <tr><td colSpan="10"><Empty>Seçili tarih aralığında çalışma kaydı yok.</Empty></td></tr>}</tbody><tfoot><tr><td colSpan="3"><strong>GENEL TOPLAM</strong></td><td><strong>{paymentMetrics.dayCount}</strong></td><td className="money"><strong>{money(paymentMetrics.dayTotal)}</strong></td><td><strong>{paymentMetrics.nightCount}</strong></td><td className="money"><strong>{money(paymentMetrics.nightTotal)}</strong></td><td className="money grand"><strong>{money(paymentMetrics.totalAmount)}</strong></td><td><strong>{periodPaymentStatus.paid} ödendi / {periodPaymentStatus.waiting} bekliyor</strong></td><td></td></tr></tfoot></table></div>
          </div>
        </> : paymentTab === "pool" ? <>
          <div className="gop-payment-stats pool-stats"><Stat label="Ödeme Bekleyen" value={openPaymentMetrics.people} hint={`${openPaymentMetrics.days} vardiya`}/><Stat label="Bekleyen Tutar" value={money(openPaymentMetrics.amount)}/><Stat label="Kontrol Bekleyen" value={openPaymentMetrics.controlPending}/><Stat label="Hakediş Dönemi" value={`${dateText(paymentPoolRange.start)} — ${dateText(paymentPoolRange.end)}`}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Ödeme Bekleyenler</h2><span>Bu alan yalnız ödenmemiş hakedişleri gösterir. Ödeme sonrası kayıt Dönem / Çıktı ve Yapılan Ödemeler tarafında kalır.</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentTab("period")}><Printer size={15}/> Dönem Çıktısına Git</button><button type="button" onClick={() => setPaymentSelectedIds(new Set(paymentRows.map((row) => String(row.employeeId))))}>Tümünü Seç</button><button type="button" className="primary" disabled={busy || !selectedPaymentRows.length || selectedPaymentRows.some((row) => number(row.pendingCheckCount) > 0)} onClick={paySelectedRows}><WalletCards size={15}/> Seçili Ödendi</button></div></div>
            <div className="gop-payment-ledger-table"><table><thead><tr><th>Seç</th><th>Personel</th><th>Dönem</th><th>Gündüz</th><th>Gece</th><th>Vardiya</th><th>Ödenecek</th><th>Kontrol</th><th>İşlem</th></tr></thead><tbody>{paymentRows.length ? paymentRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); const ready=number(row.pendingCheckCount)===0; return <tr key={key} className={!ready ? "needs-control" : ""}><td><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next=new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next; })}/></td><td><strong>{row.name || row.fullName}</strong><small>{row.personnelNo || ""} · {row.qualification || "-"}</small></td><td>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><b>{number(row.totalDays)}</b></td><td className="money"><strong>{money(row.totalAmount)}</strong></td><td><span className={`gop-badge ${ready ? "ok" : "waiting"}`}>{ready ? "✓ Tam" : `${number(row.pendingCheckCount)} eksik`}</span></td><td><div className="ledger-actions"><button type="button" className="primary" disabled={busy || !ready} onClick={() => payRow(row,false)}><WalletCards size={14}/> Ödendi Yap</button><button type="button" className="primary soft" disabled={busy || !ready} onClick={() => payRow(row,true)}><Printer size={14}/> Ödendi + Fiş</button></div></td></tr>; }) : <tr><td colSpan="9"><Empty>Bu dönemde bekleyen ödeme yok. Çıktılar Dönem / Çıktı sekmesinden alınabilir.</Empty></td></tr>}</tbody></table></div>
          </div>
        </> : <>
          <div className="gop-payment-stats"><Stat label="Yapılan Ödeme" value={money(paymentHistoryMetrics.amount)}/><Stat label="Ödeme Adedi" value={paymentHistoryMetrics.count}/><Stat label="Personel" value={paymentHistoryMetrics.people.size}/><Stat label="Toplam Gün/Vardiya" value={paymentHistoryMetrics.days}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Yapılan Ödemeler</h2><span>Kalıcı ödeme defteri · tarih aralığı, haftalık/aylık gruplama, fiş tekrar yazdırma ve iptal kaydı birlikte tutulur.</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentTab("period")}><Printer size={14}/> Dönem / Çıktı</button></div><div className="gop-payment-filter"><button type="button" className={paymentHistoryStatus === "all" ? "active" : ""} onClick={() => setPaymentHistoryStatus("all")}>Tümü</button><button type="button" className={paymentHistoryStatus === "paid" ? "active" : ""} onClick={() => setPaymentHistoryStatus("paid")}>Ödenen</button><button type="button" className={paymentHistoryStatus === "cancelled" ? "active" : ""} onClick={() => setPaymentHistoryStatus("cancelled")}>İptal</button><select value={paymentHistoryGroup} onChange={(e) => setPaymentHistoryGroup(e.target.value)}><option value="day">Günlük</option><option value="week">Haftalık</option><option value="month">Aylık</option></select></div></div>
            <div className="gop-payment-history-records">{paymentHistoryGroups.length ? paymentHistoryGroups.map(([group, rows]) => {
              const paidRows = rows.filter((row) => String(row.status).toUpperCase() === "PAID");
              const groupAmount = paidRows.reduce((sum, row) => sum + number(row.totalAmount), 0);
              return <section className="gop-payment-history-group" key={group}>
                <header className="gop-payment-history-group-head"><div><strong>{paymentHistoryGroup === "month" ? group : paymentHistoryGroup === "week" ? `${dateText(group)} haftası` : dateText(group)}</strong><span>{rows.length} ödeme kaydı · {paidRows.length} aktif</span></div><b>{money(groupAmount)}</b></header>
                <div className="gop-payment-record-grid">{rows.map((row) => {
                  const cancelled = String(row.status).toUpperCase() === "CANCELLED";
                  const items = Array.isArray(row.items) ? row.items : [];
                  return <article className={`gop-payment-record ${cancelled ? "cancelled" : "paid"}`} key={row.id}>
                    <div className="gop-payment-record-top"><div><span className={`gop-badge ${cancelled ? "waiting" : "ok"}`}>{cancelled ? "İPTAL" : "✓ ÖDENDİ"}</span><strong>{row.paymentNo || "Ödeme kaydı"}</strong><small>{dateTimeText(row.paidAt || row.paidDate)}</small></div><div className="gop-payment-record-amount"><span>Ödenen Tutar</span><strong>{money(row.totalAmount)}</strong></div></div>
                    <div className="gop-payment-record-person"><div><strong>{row.name || row.fullName || "Personel"}</strong><small>{row.personnelNo || "Kod yok"} · {row.qualification || "Vasıf yok"}</small></div><span>{cancelled ? "İptal edilmiş ödeme" : "Tamamlanmış ödeme"}</span></div>
                    <div className="gop-payment-record-meta"><div><span>Hakediş Dönemi</span><strong>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</strong></div><div><span>Vardiya</span><strong>G {number(row.dayCount)} · N {number(row.nightCount)} · Toplam {number(row.totalDays)}</strong></div><div><span>Ödeme Tarihi</span><strong>{dateText(row.paidDate || String(row.paidAt || "").slice(0,10))}</strong></div><div><span>İşlemi Yapan</span><strong>{row.paidByLabel || "KY ERP Kullanıcısı"}</strong></div></div>
                    {cancelled ? <div className="gop-payment-cancel-note"><strong>Ödeme İptal Edildi</strong><span>{row.cancelReason || "İptal açıklaması girilmedi."}</span><small>{row.cancelledByLabel || "-"} · {dateTimeText(row.cancelledAt)}</small></div> : null}
                    <details className="gop-payment-record-details"><summary>İşlem Detayı <span>{items.length || number(row.totalDays)} vardiya</span></summary><div className="gop-payment-item-list">{items.length ? items.map((item, index) => <div key={item.id || `${item.workDate}-${item.shift}-${index}`}><span><strong>{dateText(item.workDate)}</strong><small>{item.shift === "night" ? "Gece vardiyası" : "Gündüz vardiyası"}</small></span><b>{money(item.amount)}</b></div>) : <Empty>Vardiya detay kaydı bulunamadı.</Empty>}</div></details>
                    <footer className="gop-payment-record-actions"><button type="button" onClick={() => printPaidPaymentReceipt(row)}><Printer size={14}/> Ödeme Fişi</button>{!cancelled ? <button type="button" disabled={busy} onClick={() => cancelPaymentRow(row)}><Trash2 size={14}/> Ödemeyi İptal Et</button> : <span>Geçmiş kayıt korunuyor</span>}</footer>
                  </article>;
                })}</div>
              </section>;
            }) : <Empty>Seçili ödeme tarihi aralığında kayıt yok.</Empty>}</div>
          </div>
        </>}
      </div> : null}


      {quick ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section data-modal-size-key="daily-operations-quick-entry" className={`gop-dialog gop-quick-dialog shift-${quick.shift}`} style={{ ...dialogBoxStyle(dialogSizes.quick), "--quick-row-h": `${quickRowHeight}px`, "--quick-card-w": `${quickCardWidth}px` }}><header><div><span>HIZLI PERSONEL GİRİŞİ</span><div className="quick-title-line"><h2>{longDateText(quick.date)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</h2><span className={`quick-shift-badge ${quick.shift}`}>{quick.shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div><p>Yalnız seçili gün ve vardiya değiştirilir; diğer günlerin kayıtları korunur.</p></div><div className="quick-header-actions"><span className={`quick-safety-chip ${quick.shift}`}>Tek Gün · {dateText(quick.date, true)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</span><button type="button" onClick={closeQuickDialog}><X size={19}/></button></div></header>
        <div className="quick-day-nav"><div className="quick-day-list" aria-label="Hızlı giriş tarih aralığı">{days.map((date) => <button type="button" key={date} className={date === quick.date ? "active" : ""} disabled={quickDirty || busy} onClick={() => changeQuickFocus(date, quick.shift)}><span>{new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</span><strong>{dateText(date, true)}</strong></button>)}</div><div className="gop-shift-switch"><button type="button" className={quick.shift === "day" ? "active day" : ""} disabled={quickDirty || busy} onClick={() => changeQuickFocus(quick.date, "day")}><Sun size={15}/> Gündüz</button><button type="button" className={quick.shift === "night" ? "active night" : ""} disabled={quickDirty || busy} onClick={() => changeQuickFocus(quick.date, "night")}><Moon size={15}/> Gece</button></div></div>
        <div className="quick-kpis"><Stat label="Seçilen" value={quick.ids.size} hint="Bu gün çalışacak"/><Stat label="Kontrol Edildi" value={quickChecked} hint="Yeşil işaretli"/><Stat label="Kontrol Bekleyen" value={quickPending} hint="Gözden geçirilecek"/><Stat label="Toplam Personel" value={activeRosterPeople.length} hint="Tarih aralığı listesi"/></div>
        <div className="quick-controls"><label className="gop-search"><Search size={14}/><input value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="Personel, kod veya vasıf ara"/></label><div className="quick-add-bar"><label className="gop-search"><Search size={14}/><input list="quick-roster-candidates" value={quickAddQuery} onChange={(e) => setQuickAddQuery(e.target.value)} placeholder="Listeye eklenecek personeli ara..."/></label><datalist id="quick-roster-candidates">{availableRosterPeople.map((person) => <option key={person.id} value={person.personnelNo || person.name}>{person.name} · {person.role || "Vasıfsız"}</option>)}</datalist><button type="button" disabled={!quickAddQuery.trim()} onClick={addFromQuickPool}><Plus size={13}/> Listeye Ekle</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={13}/> Yeni Personel</button></div><div className="quick-legend"><span className="sel-dot"/> Seçildi <span className="ok-dot"/> Kontrol edildi <span className="save-dot"/> Kayıtlı</div></div>
        <div className="quick-groups">{quickGroups.length ? quickGroups.map(([role, people]) => { const selectable = people.filter((person) => quick.shift === "day" || person.nightRate > 0); const selectedCount = selectable.filter((person) => quick.ids.has(person.id)).length; const allSelected = selectable.length > 0 && selectedCount === selectable.length; return <section className="quick-group" key={role}><div className="quick-group-head"><strong>{role}</strong><span>{selectedCount} / {selectable.length} seçildi</span><button type="button" onClick={() => setQuick((current) => { const ids = new Set(current.ids); const checked = new Set(current.checked); selectable.forEach((person) => { if (allSelected) { ids.delete(person.id); checked.delete(person.id); } else ids.add(person.id); }); return { ...current, ids, checked }; })}>{allSelected ? "Vasıf Seçimini Kaldır" : "Vasıfın Tümünü Seç"}</button></div><div className="quick-person-grid">{people.map((person) => { const selected = quick.ids.has(person.id); const checked = quick.checked.has(person.id); const blocked = quick.shift === "night" && person.nightRate <= 0; return <article key={person.id} className={`quick-person ${selected ? "selected" : ""} ${checked ? "checked" : ""} ${blocked ? "blocked" : ""}`}><button type="button" className="quick-main-toggle" disabled={blocked} onClick={() => setQuick((current) => { const ids = new Set(current.ids); const checkedSet = new Set(current.checked); if (ids.has(person.id)) { ids.delete(person.id); checkedSet.delete(person.id); } else ids.add(person.id); return { ...current, ids, checked: checkedSet }; })}><span className="quick-avatar">{quick.shift === "day" ? "G" : "N"}</span><span className="quick-person-text"><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small></span><b>{money(quick.shift === "night" ? person.nightRate : person.dayRate)}</b><em>{selected ? "Seçildi" : "Seç"}</em></button><button type="button" className={`quick-check-button ${checked ? "is-checked" : ""}`} aria-label={checked ? "Kontrol edildi" : "Kontrol et"} aria-pressed={checked} title={checked ? "Kontrol edildi" : "Kontrol et"} disabled={!selected || blocked} onClick={() => setQuick((current) => { const next = new Set(current.checked); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return { ...current, checked: next }; })}><span className="quick-check-mark">{checked ? "✓" : ""}</span></button></article>; })}</div></section>; }) : <Empty>Bu filtrede personel bulunamadı.</Empty>}</div>
        <footer className="quick-footer"><DialogSizer kind="quick" size={dialogSizes.quick} onResize={resizeDialog}/><label className="quick-row-height" title="Excel satır yüksekliği gibi hızlı giriş personel satırlarını sıkıştırır veya açar"><span>Satır</span><input type="range" min="28" max="42" step="1" value={quickRowHeight} onChange={(e) => { const value = Number(e.target.value); setQuickRowHeight(value); writeQuickRowHeight(value); }}/><b>{quickRowHeight}px</b></label><label className="quick-card-width" title="Kişi kartı genişliği. Daralttıkça kişiler otomatik daha fazla sütuna yerleşir"><span>En</span><input type="range" min="160" max="280" step="10" value={quickCardWidth} onChange={(e) => { const value = Number(e.target.value); setQuickCardWidth(value); writeQuickCardWidth(value); }}/><b>{quickCardWidth}px</b></label><div><strong>{quickDirty ? "Kaydedilmemiş seçimler var." : "Kayıtlı seçimler yüklendi."}</strong><small>Gün veya vardiya değiştirmek için önce kaydedin.</small></div><button type="button" onClick={closeQuickDialog}><X size={14}/> Kapat</button><button type="button" className="primary" disabled={busy || periodLocked || !quickDirty} onClick={() => saveQuick(false)}><Save size={15}/> {quick.shift === "day" ? "Gündüz" : "Gece"} Kaydet</button><button type="button" className="primary soft" disabled={busy || periodLocked || !quickDirty || quick.date >= range.end} onClick={() => saveQuick(true)}><Save size={15}/> Kaydet ve Sonraki Gün</button></footer>
      </section></div> : null}

      {logOpen ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-log-dialog" style={dialogBoxStyle(dialogSizes.log)}><header><div><span>GÜNLÜK GİRİŞ / LOG + ANALİZ</span><h2>Log</h2><p>{dateText(logRange.start)} — {dateText(logRange.end)}</p></div><button type="button" onClick={() => setLogOpen(false)}><X size={19}/></button></header><div className="log-tabs"><button className={logTab === "summary" ? "active" : ""} onClick={() => setLogTab("summary")}>Log + Özet</button><button className={logTab === "search" ? "active" : ""} onClick={() => setLogTab("search")}>Gelişmiş Arama</button><button className={logTab === "control" ? "active" : ""} onClick={() => setLogTab("control")}>Personel Kontrol</button></div>{logTab !== "control" ? <><div className="log-date-toolbar"><button type="button" onClick={() => moveLogWeek(-1)}>‹ Önceki Hafta</button><label>Başlangıç<input type="date" value={logRange.start} onChange={(e) => setLogRange({ ...logRange, start: e.target.value })}/></label><label>Bitiş<input type="date" value={logRange.end} onChange={(e) => setLogRange({ ...logRange, end: e.target.value })}/></label><button type="button" className="primary" onClick={searchLogRange}><Search size={14}/> Kayıt Ara</button><button type="button" onClick={() => moveLogWeek(1)}>Sonraki Hafta ›</button></div><div className="log-toolbar"><label>Personel / HKN<input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Personel veya HKN ara"/></label><label>İşlem<input value={logAction} onChange={(e) => setLogAction(e.target.value)} placeholder="İşlem ara"/></label><label>Vardiya<select value={logShift} onChange={(e) => setLogShift(e.target.value)}><option value="all">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option></select></label></div></> : null}{logTab === "summary" ? <><div className="log-kpis"><Stat label="Dönem" value={`${rangeDays(logRange.start, logRange.end).length} gün`}/><Stat label="Kayıtlı personel" value={logPeople}/><Stat label="Toplam vardiya" value={logTotals.day + logTotals.night}/><Stat label="Toplam" value={money(logTotals.total)}/></div><div className="log-list">{visibleLogRows.length ? visibleLogRows.map((row, index) => { const paid = actionLabel(row) === "ÖDENDİ"; return <article className={paid ? "paid" : ""} key={row.id || `${row.createdAt}-${index}`}><div><strong>{paid ? "✓ ÖDENDİ · Bu kayıt ödenmiştir" : actionLabel(row)}</strong><small>İşlem zamanı: {dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "Personel"}</b><span>Kayıt tarihi: {dateText(row.workDate || row.date)}</span></div><div><span>{String(row.shift || "").toLowerCase().includes("night") ? "Gece" : "Gündüz"}</span><small>{row.actorName || row.actor || row.source || "Sistem"}</small></div></article>; }) : <Empty>Bu dönemde log kaydı yok.</Empty>}</div></> : null}{logTab === "search" ? <div className="log-list search-mode">{visibleLogRows.length ? visibleLogRows.map((row, index) => <article key={row.id || index}><div><strong>{actionLabel(row)}</strong><small>{dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "-"}</b><span>{dateText(row.workDate || row.date)}</span></div><div><span>{row.shift || "-"}</span><small>{row.qualification || ""}</small></div></article>) : <Empty>Filtreye uygun kayıt yok.</Empty>}</div> : null}{logTab === "control" ? <div className="person-control"><label>HKN veya isim ara<input list="gop-person-control-list" value={controlQuery} onChange={(e) => setControlQuery(e.target.value)} placeholder="HKN111 veya RESUL"/><datalist id="gop-person-control-list">{employees.filter((p) => p.active).map((p) => <option key={p.id} value={p.personnelNo || p.name}>{p.name}</option>)}</datalist></label>{controlPerson ? <><div className="log-kpis"><Stat label="Personel" value={controlPerson.name} hint={controlPerson.role}/><Stat label="Gündüz" value={controlTotals.day}/><Stat label="Gece" value={controlTotals.night}/><Stat label="Toplam" value={money(controlTotals.total)} hint={`${controlTotals.paid} ödendi vardiya`}/></div><div className="person-control-days">{personControlRows.length ? personControlRows.map((row, index) => <div key={`${rowDate(row)}-${index}`}><strong>{dateText(rowDate(row))}</strong><span>{rowDay(row) ? "Gündüz" : ""}{rowDay(row) && rowNight(row) ? " + " : ""}{rowNight(row) ? "Gece" : ""}</span><b>{money((rowDay(row) ? number(row.dayWage ?? controlPerson.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? controlPerson.nightRate) : 0))}</b><em className={rowPaid(row) ? "paid" : "waiting"}>{rowPaid(row) ? "Ödendi" : "Hazır"}</em></div>) : <Empty>Seçili dönemde çalışma kaydı yok.</Empty>}</div></> : <Empty>Personel seçin veya HKN / isim yazarak arayın.</Empty>}</div> : null}<DialogSizer kind="log" size={dialogSizes.log} onResize={resizeDialog}/></section></div> : null}

      {cardDialog ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section data-modal-size-key="daily-operations-person-editor" className="gop-dialog gop-person-dialog" style={dialogBoxStyle(dialogSizes.person)}><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2></div><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}><X size={19}/></button></header><div className="gop-form-grid"><label>Ad soyad<input value={cardDialog.name} onChange={(e) => setCardDialog({ ...cardDialog, name: e.target.value })}/></label><label>Personel no<input value={cardDialog.personnelNo} onChange={(e) => setCardDialog({ ...cardDialog, personnelNo: e.target.value })}/></label><div className="gop-role-field"><label>Vasıf<select value={cardDialog.role} onChange={(e) => setCardDialog({ ...cardDialog, role: e.target.value })}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" onClick={() => { const role = askNewRole(); if (role) setCardDialog({ ...cardDialog, role }); }}><Plus size={13}/> Vasıf Ekle</button></div><label>Aracı<input value={cardDialog.broker} onChange={(e) => setCardDialog({ ...cardDialog, broker: e.target.value })}/></label><label>Gündüz ücret<input type="number" value={cardDialog.dayRate} onChange={(e) => setCardDialog({ ...cardDialog, dayRate: number(e.target.value) })}/></label><label>Gece ücret<input type="number" value={cardDialog.nightRate} onChange={(e) => setCardDialog({ ...cardDialog, nightRate: number(e.target.value) })}/></label><label className="wide">Not<textarea rows="3" value={cardDialog.note} onChange={(e) => setCardDialog({ ...cardDialog, note: e.target.value })}/></label><label className="check"><input type="checkbox" checked={cardDialog.active !== false} onChange={(e) => setCardDialog({ ...cardDialog, active: e.target.checked })}/> Aktif personel</label></div><footer><DialogSizer kind="person" size={dialogSizes.person} onResize={resizeDialog}/><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={saveCard}><Save size={16}/> Kaydet</button></footer></section></div> : null}

      {excelPreview ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-dialog-wide" style={dialogBoxStyle(dialogSizes.excel)}><header><div><span>EXCEL KONTROL</span><h2>İçe Aktarım Önizleme</h2></div><button type="button" onClick={() => setExcelPreview(null)}><X size={19}/></button></header><div className="excel-preview"><p>{Array.isArray(excelPreview.rows) ? excelPreview.rows.length : 0} satır bulundu. Uygulamadan önce tarih ve personel eşleşmelerini kontrol edin.</p><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Gündüz</th><th>Gece</th><th>Uyarı</th></tr></thead><tbody>{(excelPreview.rows || []).slice(0, 250).map((row, index) => <tr key={row.key || index}><td>{row.personName || row.excelName || row.personnelNo || "-"}</td><td>{dateText(row.workDate)}</td><td>{row.dayShift ? "✓" : ""}</td><td>{row.nightShift ? "✓" : ""}</td><td>{Array.isArray(row.warnings) ? row.warnings.join(", ") : row.warning || ""}</td></tr>)}</tbody></table></div></div><footer><DialogSizer kind="excel" size={dialogSizes.excel} onResize={resizeDialog}/><button type="button" onClick={() => setExcelPreview(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={applyExcel}><Save size={15}/> Excel'i Uygula</button></footer></section></div> : null}
    </section>
  );
}
