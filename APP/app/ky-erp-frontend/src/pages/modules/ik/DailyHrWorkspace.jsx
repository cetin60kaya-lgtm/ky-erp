import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  getDailyPaymentSlips,
  getDailyPeriodLock,
  getDailyRoster,
  getDailyRevisions,
  getDailyWeeklySummary,
  markDailyPaid,
  previewDailyExcel,
  saveDailyFocusedRecords,
  saveDailyRoster,
  setDailyPeriodLock,
  updateDailyEmployee,
} from "../../../services/dailyOpsApi";
import { printHtmlDocument } from "../../../services/printService";
import "./daily-hr-workspace.css";
import "./daily-hr-workspace-final.css";

const VALID_VIEWS = new Set(["daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);
const RANGE_KEY = "kyerp.dailyOperations.range.v5";
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
function defaultRange() { const start = startOfWeek(); return { start, end: addDays(start, 4) }; }
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
function employeeOf(row = {}) {
  return { ...EMPTY_PERSON, ...row, id: String(row.id || ""), name: row.fullName || row.name || "", personnelNo: row.personnelNo || row.personelNo || "", role: row.qualification || row.role || row.title || "", broker: row.broker || "Direkt", dayRate: number(row.dayWage ?? row.dayRate), nightRate: number(row.nightWage ?? row.nightRate), note: row.note || "", active: row.active !== false && !["PASSIVE", "PASIF", "PASİF"].includes(normalizeText(row.status)) };
}
function employeePayload(person, companyId) {
  return { mainCompanyId: companyId, fullName: String(person.name || "").trim(), personnelNo: String(person.personnelNo || "").trim(), qualification: String(person.role || "").trim(), broker: String(person.broker || "Direkt").trim() || "Direkt", dayWage: number(person.dayRate), nightWage: number(person.nightRate), note: String(person.note || "").trim(), status: person.active === false ? "PASSIVE" : "ACTIVE" };
}
function rowDate(row = {}) { return String(row.workDate || row.date || "").slice(0, 10); }
function rowEmployeeId(row = {}) { return String(row.employeeId || row.personId || row.personelId || row.dailyEmployeeId || ""); }
function rowDay(row = {}) { return Boolean(row.dayShift ?? row.day ?? row.gunduz); }
function rowNight(row = {}) { return Boolean(row.nightShift ?? row.night ?? row.gece); }
function rowPaid(row = {}) { return normalizeText(row.paymentStatus || row.paidStatus) === "PAID" || row.paid === true; }
function focusedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.selected || normalizeText(row.status) === "ACTIVE").map(rowEmployeeId).filter(Boolean)); }
function sameSet(a, b) { if (a.size !== b.size) return false; for (const value of a) if (!b.has(value)) return false; return true; }
function roleKey(role) { return normalizeText(role || "Vasıfsız") || "VASIFSIZ"; }
function roleSort(a, b) {
  const ak = roleKey(a[0]); const bk = roleKey(b[0]);
  const ai = ROLE_ORDER.indexOf(ak); const bi = ROLE_ORDER.indexOf(bk);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return ak.localeCompare(bk, "tr");
}
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function printRows(title, range, rows) {
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.name || row.fullName)}</td><td>${escapeHtml(row.qualification || row.role || "-")}</td><td>${number(row.dayCount)}</td><td>${number(row.nightCount)}</td><td>${escapeHtml(money(row.totalAmount ?? row.total))}</td></tr>`).join("");
  return printHtmlDocument({ title, html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</p><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table></main>`, css: "@page{size:A4;margin:12mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#f1f5f9}" });
}
function printDailyPaymentSlips(range, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const pages = [];
  for (let index = 0; index < source.length; index += 10) pages.push(source.slice(index, index + 10));
  const html = pages.map((pageRows, pageIndex) => `<section class="pay-page"><header><strong>GÜNLÜK PERSONEL ÖDEME FİŞLERİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><div class="pay-grid">${pageRows.map((row, index) => {
    const dayCount = number(row.dayCount);
    const nightCount = number(row.nightCount);
    const dayRate = number(row.dayRate ?? row.dayWage);
    const nightRate = number(row.nightRate ?? row.nightWage);
    const dayTotal = number(row.dayTotal) || dayCount * dayRate;
    const nightTotal = number(row.nightTotal) || nightCount * nightRate;
    const total = number(row.totalAmount ?? row.total) || dayTotal + nightTotal;
    const no = pageIndex * 10 + index + 1;
    return `<article class="pay-card"><div class="pay-name"><b>${no}. ${escapeHtml(row.name || row.fullName || "-")}</b><span>${escapeHtml(row.qualification || row.role || "-")}</span></div><div class="pay-shifts"><div><strong>GÜNDÜZ</strong><span>${dayCount} gün</span><b>${escapeHtml(money(dayTotal))}</b></div><div><strong>GECE</strong><span>${nightCount} gün</span><b>${escapeHtml(money(nightTotal))}</b></div></div><div class="pay-total"><span>TOPLAM ÖDEME</span><strong>${escapeHtml(money(total))}</strong></div></article>`;
  }).join("")}</div></section>`).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Ödeme Fişleri",
    html: `<main class="pay-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.pay-print{width:200mm}.pay-page{width:200mm;height:287mm;page-break-after:always;break-after:page;overflow:hidden}.pay-page:last-child{page-break-after:auto;break-after:auto}.pay-page>header{height:13mm;border:1px solid #000;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:6mm;padding:1.8mm 3mm;margin-bottom:3mm}.pay-page>header strong{font-size:12pt}.pay-page>header span,.pay-page>header em{font-size:7.5pt;font-style:normal;white-space:nowrap}.pay-grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(5,50mm);gap:3mm 4mm}.pay-card{height:50mm;border:1px solid #000;padding:2.2mm 2.6mm;display:grid;grid-template-rows:auto 1fr auto;gap:1.4mm;break-inside:avoid;page-break-inside:avoid}.pay-name{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;border-bottom:1px solid #000;padding-bottom:1.2mm}.pay-name b{font-size:10.5pt;text-transform:uppercase;line-height:1}.pay-name span{font-size:7.5pt;white-space:nowrap}.pay-shifts{border:1px solid #000}.pay-shifts>div{display:grid;grid-template-columns:1fr 18mm 31mm;align-items:center;min-height:8mm;padding:1mm 2mm}.pay-shifts>div+div{border-top:1px solid #000}.pay-shifts strong{font-size:8pt}.pay-shifts span{font-size:7.5pt;text-align:center}.pay-shifts b{font-size:9pt;text-align:right}.pay-total{display:flex;align-items:flex-end;justify-content:space-between;border-top:1.5px solid #000;padding-top:1.2mm}.pay-total span{font-size:8.5pt;font-weight:900}.pay-total strong{font-size:17pt;line-height:1;font-weight:900}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
  });
}
function printWeeklyControlList(range, days, rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const safeDays = Array.isArray(days) ? days : [];
  const pages = [];
  for (let index = 0; index < source.length; index += 35) pages.push(source.slice(index, index + 35));
  const headers = safeDays.map((date) => `<th class="date-col">${escapeHtml(dateText(date, true))}</th>`).join("");
  const html = pages.map((pageRows, pageIndex) => {
    const body = pageRows.map((row, index) => {
      const dayCells = safeDays.map((date) => {
        const cell = row.days?.[date] || {};
        return `<td class="work-cell"><span><b>G</b>${cell.day ? "✓" : "–"}</span><span><b>N</b>${cell.night ? "✓" : "–"}</span></td>`;
      }).join("");
      const dayCount = number(row.dayCount);
      const nightCount = number(row.nightCount);
      const total = number(row.totalAmount ?? row.total);
      const dayTotal = number(row.dayTotal);
      const nightTotal = number(row.nightTotal);
      return `<tr><td class="no">${pageIndex * 35 + index + 1}</td><td class="person"><strong>${escapeHtml(row.name || row.fullName || "-")}</strong><small>${escapeHtml(row.personnelNo || "")}</small></td><td class="role">${escapeHtml(row.qualification || row.role || "-")}</td>${dayCells}<td class="sum">${dayCount}<small>${dayTotal ? escapeHtml(money(dayTotal)) : ""}</small></td><td class="sum">${nightCount}<small>${nightTotal ? escapeHtml(money(nightTotal)) : ""}</small></td><td class="sum total">${dayCount + nightCount}<small>${escapeHtml(money(total))}</small></td></tr>`;
    }).join("");
    return `<section class="week-page"><header><div><strong>GÜNLÜK PERSONEL HAFTALIK KONTROL LİSTESİ</strong><span>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</span></div><em>Sayfa ${pageIndex + 1} / ${pages.length}</em></header><table><thead><tr><th class="no">No</th><th class="person">Personel</th><th class="role">Vasıf</th>${headers}<th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table></section>`;
  }).join("");
  return printHtmlDocument({
    title: "KY ERP Günlük Personel Haftalık Kontrol Listesi",
    html: `<main class="week-print">${html || '<p>Kayıt yok.</p>'}</main>`,
    css: `@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#000;background:#fff}.week-print{width:287mm}.week-page{width:287mm;min-height:200mm;page-break-after:always;break-after:page}.week-page:last-child{page-break-after:auto;break-after:auto}.week-page>header{height:12mm;border:1px solid #000;display:flex;align-items:center;justify-content:space-between;padding:1.4mm 3mm;margin-bottom:2mm}.week-page>header div{display:flex;align-items:baseline;gap:5mm}.week-page>header strong{font-size:11.5pt}.week-page>header span,.week-page>header em{font-size:7pt;font-style:normal;white-space:nowrap}.week-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.4pt}.week-page th,.week-page td{border:1px solid #000;padding:.45mm .6mm;line-height:1.02;vertical-align:middle}.week-page th{font-weight:900;text-align:center;height:6mm}.week-page td{height:4.55mm}.week-page .no{width:8mm;text-align:center}.week-page .person{width:43mm;text-align:left}.week-page .person strong{display:block;font-size:6.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .person small{display:block;font-size:5.2pt;line-height:1;color:#000}.week-page .role{width:20mm;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-page .date-col{width:25mm}.work-cell{padding:.25mm!important;text-align:center}.work-cell>span{display:inline-flex;align-items:center;justify-content:center;gap:.6mm;width:50%;font-size:6.2pt;white-space:nowrap}.work-cell>span+span{border-left:1px solid #000}.work-cell b{font-size:5.4pt}.sum{width:20mm;text-align:center;font-weight:900}.sum small{display:block;font-size:5.2pt;font-weight:400;line-height:1}.sum.total{width:23mm}@media print{body{-webkit-print-color-adjust:economy;print-color-adjust:economy}}`
  });
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
  const [notes, setNotes] = useState({});
  const [rosterIds, setRosterIds] = useState(() => new Set());
  const [rosterSaved, setRosterSaved] = useState(false);
  const [summaryRows, setSummaryRows] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);
  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());
  const [query, setQuery] = useState("");
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

  const days = useMemo(() => rangeDays(range.start, range.end), [range.end, range.start]);
  const setSafeRange = useCallback((next) => {
    const resolved = typeof next === "function" ? next(range) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    if (rangeDays(resolved.start, resolved.end).length > 31) { setError("Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır."); return; }
    setRange(resolved); writeRange(resolved); setError("");
  }, [range]);

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
      const historicalIds = [...new Set(attendanceRows.map(rowEmployeeId).filter(Boolean))];
      const resolvedIds = savedIds.length ? savedIds : historicalIds;
      setRosterIds(new Set(resolvedIds));
      setRosterSaved(savedIds.length > 0);
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
      setRecords(focusedRows); setSelectedIds(focusedIds(focusedRows));
      setNotes(Object.fromEntries(focusedRows.map((row) => [rowEmployeeId(row), row.note || ""]).filter(([id]) => id)));
    } catch (loadError) { setError(loadError?.message || "Seçili gün kayıtları alınamadı."); }
    finally { setLoading(false); }
  }, [companyId, selectedDate, shift, view]);
  useEffect(() => { void loadFocused(); }, [loadFocused]);

  const loadWeekly = useCallback(async () => {
    if (!companyId || view !== "daily-weekly") return;
    setLoading(true); setError("");
    try { const rows = await getDailyWeeklySummary({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setSummaryRows(Array.isArray(rows) ? rows : []); }
    catch (e) { setError(e?.message || "Haftalık özet alınamadı."); } finally { setLoading(false); }
  }, [companyId, range.end, range.start, view]);
  useEffect(() => { void loadWeekly(); }, [loadWeekly]);

  const loadPayments = useCallback(async () => {
    if (!companyId || view !== "daily-payments") return;
    setLoading(true); setError("");
    try { const rows = await getDailyPaymentSlips({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setPaymentRows(Array.isArray(rows) ? rows : []); }
    catch (e) { setError(e?.message || "Ödeme fişleri alınamadı."); } finally { setLoading(false); }
  }, [companyId, range.end, range.start, view]);
  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const employeeMap = useMemo(() => new Map(employees.map((person) => [person.id, person])), [employees]);
  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return employees.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, query]);
  const activeRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && rosterIds.has(person.id)), [employees, rosterIds]);
  const availableRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && !rosterIds.has(person.id)), [employees, rosterIds]);
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
    return activeRosterPeople.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [activeRosterPeople, query]);
  const recordByEmployee = useMemo(() => new Map(records.map((row) => [rowEmployeeId(row), row])), [records]);
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
      const current = map.get(employeeId) || { employeeId, name: person.name || row.name || row.fullName || "Personel", personnelNo: person.personnelNo || row.personnelNo || "", role: person.role || row.qualification || row.role || "-", days: {}, dayCount: 0, nightCount: 0, totalAmount: 0 };
      const day = rowDay(row);
      const night = rowNight(row);
      current.days[date] = { day, night };
      if (day) { current.dayCount += 1; current.totalAmount += number(row.dayWage ?? row.dayRate ?? person.dayRate); }
      if (night) { current.nightCount += 1; current.totalAmount += number(row.nightWage ?? row.nightRate ?? person.nightRate); }
      map.set(employeeId, current);
    });
    return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  }, [attendance, employeeMap, range.end, range.start]);
  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""))), [paymentRows, paymentSelectedIds]);
  useEffect(() => {
    const valid = new Set(paymentRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || "")));
    setPaymentSelectedIds((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [paymentRows]);

  const saveRoster = async () => {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] }); setRosterIds(new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : [...rosterIds])); setRosterSaved(true); setNotice("Tarih aralığı personel listesi kaydedildi."); }
    catch (e) { setError(e?.message || "Personel listesi kaydedilemedi."); } finally { setBusy(false); }
  };
  const addRosterPerson = (person, target = "main") => {
    if (!person?.id) { setError("Listeden eklenecek personeli seçin."); return; }
    setRosterIds((current) => { const next = new Set(current); next.add(person.id); return next; });
    setRosterSaved(false);
    if (target === "quick") setQuickAddQuery(""); else setPoolAddQuery("");
    setNotice(`${person.name} tarih aralığı listesine eklendi. Kaydettiğinizde sunucuya yazılacak.`);
  };
  const removeRosterPerson = (personId) => {
    setRosterIds((current) => { const next = new Set(current); next.delete(personId); return next; });
    setSelectedIds((current) => { const next = new Set(current); next.delete(personId); return next; });
    setRosterSaved(false);
  };
  const addFromQuickPool = () => addRosterPerson(resolveRosterChoice(quickAddQuery), "quick");

  const saveFocused = async () => {
    if (busy || periodLocked) return; setBusy(true); setError(""); setNotice("");
    try {
      if (!rosterSaved) { await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] }); setRosterSaved(true); }
      await saveDailyFocusedRecords({ mainCompanyId: companyId, date: selectedDate, shift, personnelEntries: activeRosterPeople.map((person) => { const current = recordByEmployee.get(person.id) || {}; return { personelId: person.id, status: selectedIds.has(person.id) ? "ACTIVE" : "REMOVE", expectedUpdatedAt: current.updatedAt || current.attendanceUpdatedAt || "", note: notes[person.id] || "" }; }) });
      setNotice(`${dateText(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} kayıtları kaydedildi.`); await Promise.all([loadFocused(), loadRangeData()]);
    } catch (e) { setError(e?.message || "Günlük giriş kaydedilemedi. Başka cihazda değişiklik olduysa Yenile'ye basın."); } finally { setBusy(false); }
  };
  const selectAll = () => setSelectedIds(new Set(activeRosterPeople.filter((p) => shift === "day" || p.nightRate > 0).map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());
  const thisWeek = () => { const start = startOfWeek(); setSafeRange({ start, end: addDays(start, 4) }); setSelectedDate(localDateKey()); };

  const loadQuickFocus = async (date, mode, preserveQuery = "") => {
    const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date, shift: mode });
    const ids = focusedIds(rows);
    setQuick({ date, shift: mode, ids, baseline: new Set(ids), checked: new Set(), query: preserveQuery });
  };
  const openQuick = async () => {
    setBusy(true); setError("");
    try { await loadQuickFocus(selectedDate, shift); }
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
      if (!rosterSaved) { await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] }); setRosterSaved(true); }
      const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift });
      const currentMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [rowEmployeeId(row), row]));
      await saveDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift, personnelEntries: activeRosterPeople.map((person) => ({ personelId: person.id, status: snapshot.ids.has(person.id) ? "ACTIVE" : "REMOVE", expectedUpdatedAt: currentMap.get(person.id)?.updatedAt || currentMap.get(person.id)?.attendanceUpdatedAt || "", note: currentMap.get(person.id)?.note || "" })) });
      setSelectedDate(snapshot.date); setShift(snapshot.shift); setNotice(`${dateText(snapshot.date)} hızlı giriş kaydedildi.`);
      await Promise.all([loadFocused(), loadRangeData()]);
      const nextDate = addDays(snapshot.date, 1);
      if (goNext && nextDate && nextDate <= range.end) await loadQuickFocus(nextDate, snapshot.shift, snapshot.query);
      else setQuick(null);
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
  const deactivateCard = async (person) => { if (busy || !person?.id) return; setBusy(true); try { await deleteDailyEmployee(person.id, { mainCompanyId: companyId }); await loadEmployees(); setNotice(`${person.name} pasife alındı.`); } catch (e) { setError(e?.message || "Personel pasife alınamadı."); } finally { setBusy(false); } };
  const payRow = async (row) => { if (busy) return; setBusy(true); try { await markDailyPaid({ mainCompanyId: companyId, employeeId: row.employeeId || row.id, startDate: range.start, endDate: range.end }); setNotice(`${row.name || row.fullName} için dönem ödemesi işlendi.`); await Promise.all([loadPayments(), loadRangeData()]); } catch (e) { setError(e?.message || "Ödeme durumu güncellenemedi."); } finally { setBusy(false); } };

  const exportExcel = async () => { setBusy(true); try { await downloadDailyExcel({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); } catch (e) { setError(e?.message || "Excel indirilemedi."); } finally { setBusy(false); } };
  const importExcel = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx";
    input.onchange = async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const preview = await previewDailyExcel(file, { mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setExcelPreview(preview); setNotice("Excel okundu. Kontrol edip uygula."); } catch (e) { setError(e?.message || "Excel okunamadı."); } finally { setBusy(false); } };
    input.click();
  };
  const applyExcel = async () => { if (!excelPreview || busy) return; setBusy(true); try { const result = await applyDailyExcel({ mainCompanyId: companyId, startDate: excelPreview.startDate || range.start, endDate: excelPreview.endDate || range.end, rows: excelPreview.rows || [] }); setExcelPreview(null); setNotice(`${result?.count || 0} Excel satırı uygulandı.`); await Promise.all([loadEmployees(), loadRangeData(), loadFocused()]); } catch (e) { setError(e?.message || "Excel uygulanamadı."); } finally { setBusy(false); } };

  if (!companyId) return <div className="content-card module-error-card"><h3>Günlük Operasyon için firma seçin</h3><p>Günlük personel ve ödeme kayıtları firma bazında tutulur.</p></div>;

  const shiftRange = (weeks) => setSafeRange({ start: addDays(range.start, weeks * 7), end: addDays(range.end, weeks * 7) });
  const rangeControls = <div className="gop-range-controls"><button type="button" onClick={() => shiftRange(-1)}>‹ Önceki hafta</button><label>Başlangıç<input type="date" value={range.start} onChange={(e) => setSafeRange({ ...range, start: e.target.value })} /></label><label>Bitiş<input type="date" value={range.end} onChange={(e) => setSafeRange({ ...range, end: e.target.value })} /></label><button type="button" onClick={() => shiftRange(1)}>Sonraki hafta ›</button></div>;
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
  const quickDirty = quick ? !sameSet(quick.ids, quick.baseline) : false;
  const quickPeople = quick ? activeRosterPeople.filter((person) => !quick.query || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(quick.query.toLocaleLowerCase("tr-TR"))) : [];
  const quickGroups = quick ? (() => { const groups = new Map(); quickPeople.forEach((person) => { const key = person.role || "Vasıfsız"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(person); }); return [...groups.entries()].sort(roleSort); })() : [];
  const quickChecked = quick ? [...quick.checked].filter((id) => quick.ids.has(id)).length : 0;
  const quickPending = quick ? Math.max(quick.ids.size - quickChecked, 0) : 0;
  const currentWeekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`));

  return (
    <section className="gop-workspace notranslate" translate="no">
      {view !== "daily-entry" ? <header className="gop-header"><div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-cards" ? "Personel Kartları" : view === "daily-weekly" ? "Haftalık Özet" : "Ödeme Fişleri"}</h1><p>İK aylık işlemlerinden bağımsız günlük personel, vardiya ve ödeme çalışma alanı.</p></div><button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? loadPayments() : loadEmployees()}><RefreshCw size={16}/> Yenile</button></header> : null}
      {notice ? <div className="gop-notice">{notice}</div> : null}{error ? <div className="gop-error">{error}</div> : null}

      {view === "daily-entry" ? <div className={`kyop-daily ${shift}`}>
        <div className="kyop-titlebar"><div><span>KY ERP / GÜNLÜK OPERASYON / GÜVENLİ GİRİŞ</span><h1>Günlük Personel Girişi</h1><p>Detaylı kontrolde tek gün aktiftir; hızlı giriş de tek gün ve tek vardiya üzerinden çalışır.</p></div><div className="kyop-mode"><button className={shift === "day" ? "active day" : ""} type="button" onClick={() => setShift("day")}><Sun size={17}/> GÜNDÜZ GİRİŞİ</button><button className={shift === "night" ? "active night" : ""} type="button" onClick={() => setShift("night")}><Moon size={17}/> GECE GİRİŞİ</button></div></div>
        <div className="kyop-actions">
          <label>Başlangıç<input type="date" value={range.start} onChange={(e) => setSafeRange({ ...range, start: e.target.value })}/></label><label>Bitiş<input type="date" value={range.end} onChange={(e) => setSafeRange({ ...range, end: e.target.value })}/></label>
          <button type="button" onClick={thisWeek}><CalendarDays size={15}/> Bu Hafta</button><button type="button" className="primary" onClick={openQuick}><Zap size={15}/> Hızlı Giriş</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={15}/> Yeni Personel Ekle</button><button type="button" onClick={selectAll}><CheckCircle2 size={15}/> Tümünü Seç</button><button type="button" onClick={clearAll}>Seçimi Kaldır</button><button type="button" onClick={loadFocused}><RefreshCw size={15}/> Kayıtlı Seçimi Yükle</button><button type="button" className="primary" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günlük Kaydet</button><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Liste", range, daySummaries.map((d) => ({ name: dateText(d.date), role: `${d.people} personel`, dayCount: d.dayCount, nightCount: d.nightCount, totalAmount: d.total })))}><Printer size={15}/> Haftalık Liste Yazdır</button><button type="button" onClick={exportExcel}><FileSpreadsheet size={15}/> Excel Aktar</button><button type="button" onClick={importExcel}><FileSpreadsheet size={15}/> Excel Yükle</button>
        </div>
        <div className={`kyop-banner ${shift === "night" ? "night" : ""}`}><strong>Güvenli giriş modu:</strong><span>Yalnız {longDateText(selectedDate)} — {shift === "day" ? "Gündüz" : "Gece"} aktif. Hızlı girişte de aynı anda yalnız bir gün düzenlenir.</span>{periodLocked ? <b><LockKeyhole size={14}/> DÖNEM KAPALI</b> : null}</div>
        <div className="kyop-days">{daySummaries.map((item) => <button type="button" key={item.date} className={item.date === selectedDate ? "active" : ""} onClick={() => setSelectedDate(item.date)}><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))}</small><strong>{dateText(item.date, true)}</strong><span>G: {item.dayCount} · N: {item.nightCount}</span><b>{money(item.total)}</b><em>{item.people ? `${item.people} personel` : "Kayıt yok"}</em>{item.date === selectedDate ? <i>AKTİF GÜN</i> : null}</button>)}</div>
        <div className="kyop-grid">
          <aside className="kyop-panel kyop-pool"><div className="kyop-panel-head"><Users size={16}/> Personel Havuzu <b>{rosterIds.size} / {employees.filter((person) => person.active !== false).length}</b></div><div className="kyop-pool-top"><label className="kyop-search"><Search size={14}/><input value={poolAddQuery} onChange={(e) => setPoolAddQuery(e.target.value)} placeholder="Personel ara"/></label><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><Plus size={14}/> Personel</button></div><div className="kyop-pool-list">{poolPeople.length ? poolPeople.map((person) => { const inRoster = rosterIds.has(person.id); const hasWork = selectedIds.has(person.id); return <label key={person.id} className={inRoster ? "included" : ""}><input type="checkbox" checked={inRoster} onChange={() => inRoster ? removeRosterPerson(person.id) : addRosterPerson(person, "main")}/><span><strong>{person.personnelNo ? `${person.personnelNo} · ` : ""}{person.name}</strong><small>{person.role || "Vasıfsız"}</small><em>{hasWork ? `${shift === "day" ? "Gündüz" : "Gece"} seçili` : inRoster ? "Havuzda" : "Havuza ekle"}</em><em>G: {money(person.dayRate)} · N: {money(person.nightRate)}</em></span></label>; }) : <Empty>Personel bulunamadı.</Empty>}</div><button type="button" className="primary full" disabled={busy || rosterSaved} onClick={saveRoster}><Save size={15}/> {rosterSaved ? `Personel Havuzu Kayıtlı (${rosterIds.size})` : `Personel Havuzunu Kaydet (${rosterIds.size})`}</button></aside>

          <main className="kyop-panel kyop-entry"><div className="kyop-entry-head"><div><span>SEÇİLİ GÜNÜN PERSONEL GİRİŞİ</span><h2>{dateText(selectedDate)} · {shift === "day" ? "Gündüz" : "Gece"}</h2><p>Bu tablo yalnız {currentWeekday} günü için gösterilir. Üstte gün seçince liste ve toplamlar aynı güne yenilenir.</p></div><div className="kyop-head-actions"><button type="button" onClick={loadLog}>Log</button><button type="button" className={periodLocked ? "locked" : ""} onClick={togglePeriodLock}>{periodLocked ? "Dönemi Aç" : "Dönemi Kapat"}</button><b>{dateText(selectedDate, true)} · {shift === "day" ? "G" : "N"}</b></div></div>
            <div className="kyop-table-wrap"><table><thead><tr><th>Personel / Giriş / Durum</th><th>Vasıf</th><th>Aktif Gün</th><th>Gündüz Ücret</th><th>Gece Ücret</th><th>Not</th><th>İşlem</th></tr></thead><tbody>{groupedEntryPeople.length ? groupedEntryPeople.flatMap(([role, people]) => [<tr className="group" key={`g-${role}`}><td colSpan="7">{role} <b>{people.length} personel</b></td></tr>, ...people.map((person) => { const checked = selectedIds.has(person.id); const blocked = shift === "night" && person.nightRate <= 0; return <tr key={person.id} className={checked ? "selected" : ""}><td><div className="kyop-person-cell"><div><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small><em>{checked ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em></div><span className={`kyop-row-shift ${shift}`}>{shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div></td><td>{person.role || "-"}</td><td>{dateText(selectedDate, true)}</td><td>{money(person.dayRate)}</td><td>{person.nightRate > 0 ? money(person.nightRate) : "-"}</td><td><input value={notes[person.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [person.id]: e.target.value }))} placeholder="Not"/></td><td><div className="kyop-row-actions"><button type="button" title={checked ? "Seçimi kaldır" : "Seç"} disabled={blocked || periodLocked} className={checked ? "selected" : ""} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}><CheckCircle2 size={14}/></button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title="Bu vardiyadan kaldır" disabled={!checked || periodLocked} onClick={() => setSelectedIds((current) => { const next = new Set(current); next.delete(person.id); return next; })}><Trash2 size={14}/></button></div></td></tr>; })]) : <tr><td colSpan="7"><Empty>Dönem havuzunda personel yok.</Empty></td></tr>}</tbody></table></div>
          </main>

          <aside className="kyop-panel kyop-control"><div className="kyop-panel-head"><ClipboardList size={16}/> Seçili Gün Kontrolü</div><div className="kyop-control-body"><div className="kyop-active-day"><span>Aktif Gün</span><strong>{dateText(selectedDate)}</strong><small>{shift === "day" ? "Gündüz" : "Gece"}</small></div><div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(activeRosterPeople.length - selectedIds.size, 0)}</strong><small>{activeRosterPeople.length} aktif personel</small></div><div className="kyop-control-highlight cyan"><span>Kontrol Edilen / Toplam</span><strong>0 / {selectedIds.size}</strong><small>{selectedIds.size} kayıt kontrol bekliyor</small></div><div className="kyop-control-highlight blue"><span>Günlük Toplam</span><strong>{money(selectedDaySummary.total)}</strong><small>G {money(activeRosterPeople.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.dayRate : 0), 0))} · N {money(activeRosterPeople.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.nightRate : 0), 0))}</small></div><div className="kyop-control-highlight violet"><span>Tarih Aralığı Toplamı</span><strong>{money(rangeTotals.total)}</strong><small>{dateText(range.start)} - {dateText(range.end)} · G {rangeTotals.day} · N {rangeTotals.night}</small></div><div className="kyop-role-counts"><div><span>Gündüz çalışan</span><b>{selectedDaySummary.dayCount}</b></div><div><span>Gece çalışan</span><b>{selectedDaySummary.nightCount}</b></div>{selectedRoleCounts.map((row) => <div key={row.role}><span>{row.role}</span><b>{row.count}</b></div>)}</div><div className={`kyop-control-alert ${selectedIds.size ? "ok" : "warn"}`}>{selectedIds.size ? `${shift === "day" ? "Gündüz" : "Gece"} seçili · ${selectedIds.size} personel seçildi.` : `${shift === "day" ? "Gündüz" : "Gece"} seçili · henüz personel seçilmedi.`}</div><button type="button" className="primary full" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günü Kaydet</button></div></aside>
        </div>
      </div> : null}

      {view === "daily-cards" ? <div className="gop-card"><div className="gop-card-head"><div><h2>Günlük Personel Kartları</h2><span>Günlük operasyon ücretleri ve personel kimlikleri.</span></div><button type="button" className="primary" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><Plus size={16}/> Yeni Personel</button></div><label className="gop-search standalone"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad, kod, vasıf veya aracı ara"/></label><div className="gop-table-wrap"><table><thead><tr><th>Kod</th><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Aracı</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filteredEmployees.length ? filteredEmployees.map((person) => <tr key={person.id}><td>{person.personnelNo || "-"}</td><td><strong>{person.name}</strong></td><td>{person.role || "-"}</td><td>{money(person.dayRate)}</td><td>{money(person.nightRate)}</td><td>{person.broker || "-"}</td><td><span className={`gop-badge ${person.active ? "ok" : "passive"}`}>{person.active ? "Aktif" : "Pasif"}</span></td><td><div className="gop-row-actions"><button type="button" onClick={() => setCardDialog({ ...person })}><Pencil size={15}/> Düzenle</button>{person.active ? <button type="button" onClick={() => deactivateCard(person)}><Trash2 size={15}/> Pasif</button> : null}</div></td></tr>) : <tr><td colSpan="8"><Empty>Günlük personel kartı bulunamadı.</Empty></td></tr>}</tbody></table></div></div> : null}
      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Çalışan" value={summaryRows.length}/><Stat label="Vardiya toplamı" value={summaryRows.reduce((s, r) => s + number(r.dayCount) + number(r.nightCount), 0)}/><Stat label="Dönem toplamı" value={money(summaryRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Haftalık Özet</h2><span>Sunucu kayıtlarından hesaplanan dönem özeti ve eski haftalık kontrol listesi.</span></div><div className="gop-print-actions"><button type="button" onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><Printer size={16}/> Haftalık Kontrol Listesi</button><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16}/> Özet Yazdır</button></div></div><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map((row) => <tr key={row.employeeId || row.id}><td><strong>{row.name || row.fullName}</strong></td><td>{row.qualification || row.role || "-"}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><strong>{money(row.totalAmount ?? row.total)}</strong></td></tr>) : <tr><td colSpan="5"><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div></div></> : null}
      {view === "daily-payments" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Ödeme fişi" value={paymentRows.length}/><Stat label="Ödendi" value={paymentRows.filter((r) => rowPaid(r) || (number(r.totalAmount ?? r.total) > 0 && number(r.paidAmount) >= number(r.totalAmount ?? r.total))).length}/><Stat label="Dönem toplamı" value={money(paymentRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Ödeme Fişleri</h2><span>{paymentSelectedIds.size ? `${paymentSelectedIds.size} kişi seçili.` : "Yazdırılacak kişileri kartlardan seçebilirsiniz."}</span></div><div className="gop-print-actions"><button type="button" className="primary" disabled={!selectedPaymentRows.length} onClick={() => printDailyPaymentSlips(range, selectedPaymentRows)}><Printer size={16}/> Seçili Kişileri Yazdır{paymentSelectedIds.size ? ` (${paymentSelectedIds.size})` : ""}</button><button type="button" disabled={!paymentRows.length} onClick={() => printDailyPaymentSlips(range, paymentRows)}><Printer size={16}/> Tümünü Yazdır</button><button type="button" disabled={!weeklyControlRows.length} onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><ClipboardList size={16}/> Haftalık Özet</button></div></div><div className="gop-payment-grid">{paymentRows.length ? paymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = rowPaid(row) || (total > 0 && number(row.paidAmount) >= total); const paymentKey = String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""); const picked = paymentSelectedIds.has(paymentKey); return <article key={paymentKey} className={`gop-payment-card ${paid ? "paid" : ""} ${picked ? "selected" : ""}`}><div><label className="gop-payment-pick"><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next = new Set(current); if (next.has(paymentKey)) next.delete(paymentKey); else next.add(paymentKey); return next; })}/><span>Seç</span></label><UserRound size={18}/><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15}/> Ödendi İşaretle</button> : null}</footer></article>; }) : <Empty>Seçili dönemde ödeme fişi oluşacak kayıt yok.</Empty>}</div></div></> : null}

      {quick ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-quick-dialog"><header><div><span>TEK GÜN GÜVENLİ HIZLI GİRİŞ</span><h2>{longDateText(quick.date)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</h2><p>Bu pencerede yalnız seçili gün ve seçili vardiya değişir.</p></div><button type="button" onClick={() => setQuick(null)}><X size={19}/></button></header>
        <div className="quick-day-nav"><button type="button" disabled={quickDirty || quick.date <= range.start || busy} onClick={() => changeQuickFocus(addDays(quick.date, -1), quick.shift)}>‹ Önceki Gün</button><label><span>İşlem yapılacak gün</span><input type="date" min={range.start} max={range.end} value={quick.date} disabled={quickDirty || busy} onChange={(e) => changeQuickFocus(e.target.value, quick.shift)}/></label><button type="button" disabled={quickDirty || quick.date >= range.end || busy} onClick={() => changeQuickFocus(addDays(quick.date, 1), quick.shift)}>Sonraki Gün ›</button><div className="gop-shift-switch"><button type="button" className={quick.shift === "day" ? "active day" : ""} disabled={quickDirty || busy} onClick={() => changeQuickFocus(quick.date, "day")}><Sun size={15}/> Gündüz</button><button type="button" className={quick.shift === "night" ? "active night" : ""} disabled={quickDirty || busy} onClick={() => changeQuickFocus(quick.date, "night")}><Moon size={15}/> Gece</button></div></div>
        <div className="quick-warning"><strong>Yalnız {longDateText(quick.date)} — {quick.shift === "day" ? "Gündüz" : "Gece"}</strong><span>Başka bir gün veya vardiya bu kayıt sırasında değiştirilemez.</span></div>
        <div className="quick-kpis"><Stat label="Seçilen" value={quick.ids.size} hint="Bu gün çalışacak"/><Stat label="Kontrol Edildi" value={quickChecked} hint="Yeşil işaretli"/><Stat label="Kontrol Bekleyen" value={quickPending} hint="Gözden geçirilecek"/><Stat label="Toplam Personel" value={activeRosterPeople.length} hint="Tarih aralığı listesi"/></div>
        <div className="quick-controls"><label className="gop-search"><Search size={14}/><input value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="Personel, kod veya vasıf ara"/></label><div className="quick-add-bar"><label className="gop-search"><Search size={14}/><input list="quick-roster-candidates" value={quickAddQuery} onChange={(e) => setQuickAddQuery(e.target.value)} placeholder="Listeye eklenecek personeli ara..."/></label><datalist id="quick-roster-candidates">{availableRosterPeople.map((person) => <option key={person.id} value={person.personnelNo || person.name}>{person.name} · {person.role || "Vasıfsız"}</option>)}</datalist><button type="button" disabled={!quickAddQuery.trim()} onClick={addFromQuickPool}><Plus size={13}/> Listeye Ekle</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={13}/> Yeni Personel</button></div><div className="quick-legend"><span className="sel-dot"/> Seçildi <span className="ok-dot"/> Kontrol edildi <span className="save-dot"/> Kayıtlı</div></div>
        <div className="quick-groups">{quickGroups.length ? quickGroups.map(([role, people]) => { const selectable = people.filter((person) => quick.shift === "day" || person.nightRate > 0); const selectedCount = selectable.filter((person) => quick.ids.has(person.id)).length; const allSelected = selectable.length > 0 && selectedCount === selectable.length; return <section className="quick-group" key={role}><div className="quick-group-head"><strong>{role}</strong><span>{selectedCount} / {selectable.length} seçildi</span><button type="button" onClick={() => setQuick((current) => { const ids = new Set(current.ids); const checked = new Set(current.checked); selectable.forEach((person) => { if (allSelected) { ids.delete(person.id); checked.delete(person.id); } else ids.add(person.id); }); return { ...current, ids, checked }; })}>{allSelected ? "Vasıf Seçimini Kaldır" : "Vasıfın Tümünü Seç"}</button></div><div className="quick-person-grid">{people.map((person) => { const selected = quick.ids.has(person.id); const checked = quick.checked.has(person.id); const blocked = quick.shift === "night" && person.nightRate <= 0; return <article key={person.id} className={`quick-person ${selected ? "selected" : ""} ${checked ? "checked" : ""} ${blocked ? "blocked" : ""}`}><button type="button" className="quick-main-toggle" disabled={blocked} onClick={() => setQuick((current) => { const ids = new Set(current.ids); const checkedSet = new Set(current.checked); if (ids.has(person.id)) { ids.delete(person.id); checkedSet.delete(person.id); } else ids.add(person.id); return { ...current, ids, checked: checkedSet }; })}><span className="quick-avatar">G</span><span className="quick-person-text"><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small></span><b>{money(quick.shift === "night" ? person.nightRate : person.dayRate)}</b><em>{selected ? "Seçildi" : "Seç"}</em></button><button type="button" className="quick-check-button" disabled={!selected || blocked} onClick={() => setQuick((current) => { const next = new Set(current.checked); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return { ...current, checked: next }; })}>{checked ? "✓ Kontrol Edildi" : "○ Kontrol Et"}</button></article>; })}</div></section>; }) : <Empty>Bu filtrede personel bulunamadı.</Empty>}</div>
        <footer className="quick-footer"><div><strong>{quickDirty ? "Kaydedilmemiş seçimler var." : "Kayıtlı seçimler yüklendi."}</strong><small>Gün veya vardiya değiştirmek için önce kaydedin.</small></div><button type="button" onClick={() => setQuick(null)}><X size={14}/> Kapat</button><button type="button" className="primary" disabled={busy || periodLocked || !quickDirty} onClick={() => saveQuick(false)}><Save size={15}/> {quick.shift === "day" ? "Gündüz" : "Gece"} Kaydet</button><button type="button" className="primary soft" disabled={busy || periodLocked || !quickDirty || quick.date >= range.end} onClick={() => saveQuick(true)}><Save size={15}/> Kaydet ve Sonraki Gün</button></footer>
      </section></div> : null}

      {logOpen ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-log-dialog"><header><div><span>GÜNLÜK GİRİŞ / LOG + ANALİZ</span><h2>Log</h2><p>{dateText(logRange.start)} — {dateText(logRange.end)}</p></div><button type="button" onClick={() => setLogOpen(false)}><X size={19}/></button></header><div className="log-tabs"><button className={logTab === "summary" ? "active" : ""} onClick={() => setLogTab("summary")}>Log + Özet</button><button className={logTab === "search" ? "active" : ""} onClick={() => setLogTab("search")}>Gelişmiş Arama</button><button className={logTab === "control" ? "active" : ""} onClick={() => setLogTab("control")}>Personel Kontrol</button></div>{logTab !== "control" ? <><div className="log-date-toolbar"><button type="button" onClick={() => moveLogWeek(-1)}>‹ Önceki Hafta</button><label>Başlangıç<input type="date" value={logRange.start} onChange={(e) => setLogRange({ ...logRange, start: e.target.value })}/></label><label>Bitiş<input type="date" value={logRange.end} onChange={(e) => setLogRange({ ...logRange, end: e.target.value })}/></label><button type="button" className="primary" onClick={searchLogRange}><Search size={14}/> Kayıt Ara</button><button type="button" onClick={() => moveLogWeek(1)}>Sonraki Hafta ›</button></div><div className="log-toolbar"><label>Personel / HKN<input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Personel veya HKN ara"/></label><label>İşlem<input value={logAction} onChange={(e) => setLogAction(e.target.value)} placeholder="İşlem ara"/></label><label>Vardiya<select value={logShift} onChange={(e) => setLogShift(e.target.value)}><option value="all">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option></select></label></div></> : null}{logTab === "summary" ? <><div className="log-kpis"><Stat label="Dönem" value={`${rangeDays(logRange.start, logRange.end).length} gün`}/><Stat label="Kayıtlı personel" value={logPeople}/><Stat label="Toplam vardiya" value={logTotals.day + logTotals.night}/><Stat label="Toplam" value={money(logTotals.total)}/></div><div className="log-list">{visibleLogRows.length ? visibleLogRows.map((row, index) => { const paid = actionLabel(row) === "ÖDENDİ"; return <article className={paid ? "paid" : ""} key={row.id || `${row.createdAt}-${index}`}><div><strong>{paid ? "✓ ÖDENDİ · Bu kayıt ödenmiştir" : actionLabel(row)}</strong><small>İşlem zamanı: {dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "Personel"}</b><span>Kayıt tarihi: {dateText(row.workDate || row.date)}</span></div><div><span>{String(row.shift || "").toLowerCase().includes("night") ? "Gece" : "Gündüz"}</span><small>{row.actorName || row.actor || row.source || "Sistem"}</small></div></article>; }) : <Empty>Bu dönemde log kaydı yok.</Empty>}</div></> : null}{logTab === "search" ? <div className="log-list search-mode">{visibleLogRows.length ? visibleLogRows.map((row, index) => <article key={row.id || index}><div><strong>{actionLabel(row)}</strong><small>{dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "-"}</b><span>{dateText(row.workDate || row.date)}</span></div><div><span>{row.shift || "-"}</span><small>{row.qualification || ""}</small></div></article>) : <Empty>Filtreye uygun kayıt yok.</Empty>}</div> : null}{logTab === "control" ? <div className="person-control"><label>HKN veya isim ara<input list="gop-person-control-list" value={controlQuery} onChange={(e) => setControlQuery(e.target.value)} placeholder="HKN111 veya RESUL"/><datalist id="gop-person-control-list">{employees.filter((p) => p.active).map((p) => <option key={p.id} value={p.personnelNo || p.name}>{p.name}</option>)}</datalist></label>{controlPerson ? <><div className="log-kpis"><Stat label="Personel" value={controlPerson.name} hint={controlPerson.role}/><Stat label="Gündüz" value={controlTotals.day}/><Stat label="Gece" value={controlTotals.night}/><Stat label="Toplam" value={money(controlTotals.total)} hint={`${controlTotals.paid} ödendi vardiya`}/></div><div className="person-control-days">{personControlRows.length ? personControlRows.map((row, index) => <div key={`${rowDate(row)}-${index}`}><strong>{dateText(rowDate(row))}</strong><span>{rowDay(row) ? "Gündüz" : ""}{rowDay(row) && rowNight(row) ? " + " : ""}{rowNight(row) ? "Gece" : ""}</span><b>{money((rowDay(row) ? number(row.dayWage ?? controlPerson.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? controlPerson.nightRate) : 0))}</b><em className={rowPaid(row) ? "paid" : "waiting"}>{rowPaid(row) ? "Ödendi" : "Hazır"}</em></div>) : <Empty>Seçili dönemde çalışma kaydı yok.</Empty>}</div></> : <Empty>Personel seçin veya HKN / isim yazarak arayın.</Empty>}</div> : null}</section></div> : null}

      {cardDialog ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog"><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2></div><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}><X size={19}/></button></header><div className="gop-form-grid"><label>Ad soyad<input value={cardDialog.name} onChange={(e) => setCardDialog({ ...cardDialog, name: e.target.value })}/></label><label>Personel no<input value={cardDialog.personnelNo} onChange={(e) => setCardDialog({ ...cardDialog, personnelNo: e.target.value })}/></label><label>Vasıf<input value={cardDialog.role} onChange={(e) => setCardDialog({ ...cardDialog, role: e.target.value })}/></label><label>Aracı<input value={cardDialog.broker} onChange={(e) => setCardDialog({ ...cardDialog, broker: e.target.value })}/></label><label>Gündüz ücret<input type="number" value={cardDialog.dayRate} onChange={(e) => setCardDialog({ ...cardDialog, dayRate: number(e.target.value) })}/></label><label>Gece ücret<input type="number" value={cardDialog.nightRate} onChange={(e) => setCardDialog({ ...cardDialog, nightRate: number(e.target.value) })}/></label><label className="wide">Not<textarea rows="3" value={cardDialog.note} onChange={(e) => setCardDialog({ ...cardDialog, note: e.target.value })}/></label><label className="check"><input type="checkbox" checked={cardDialog.active !== false} onChange={(e) => setCardDialog({ ...cardDialog, active: e.target.checked })}/> Aktif personel</label></div><footer><button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={saveCard}><Save size={16}/> Kaydet</button></footer></section></div> : null}

      {excelPreview ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-dialog-wide"><header><div><span>EXCEL KONTROL</span><h2>İçe Aktarım Önizleme</h2></div><button type="button" onClick={() => setExcelPreview(null)}><X size={19}/></button></header><div className="excel-preview"><p>{Array.isArray(excelPreview.rows) ? excelPreview.rows.length : 0} satır bulundu. Uygulamadan önce tarih ve personel eşleşmelerini kontrol edin.</p><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Gündüz</th><th>Gece</th><th>Uyarı</th></tr></thead><tbody>{(excelPreview.rows || []).slice(0, 250).map((row, index) => <tr key={row.key || index}><td>{row.personName || row.excelName || row.personnelNo || "-"}</td><td>{dateText(row.workDate)}</td><td>{row.dayShift ? "✓" : ""}</td><td>{row.nightShift ? "✓" : ""}</td><td>{Array.isArray(row.warnings) ? row.warnings.join(", ") : row.warning || ""}</td></tr>)}</tbody></table></div></div><footer><button type="button" onClick={() => setExcelPreview(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={applyExcel}><Save size={15}/> Excel'i Uygula</button></footer></section></div> : null}
    </section>
  );
}
