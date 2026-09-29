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

const VALID_VIEWS = new Set(["daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);
const RANGE_KEY = "kyerp.dailyOperations.range.v4";
const EMPTY_PERSON = { id: "", name: "", personnelNo: "", role: "", broker: "Direkt", dayRate: 0, nightRate: 0, note: "", active: true };

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
function rangeDays(start, end) {
  const days = [];
  if (!start || !end || end < start) return days;
  for (let cursor = start; cursor <= end && days.length < 62; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}
function readRange() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RANGE_KEY) || "null");
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed?.start || "") && /^\d{4}-\d{2}-\d{2}$/.test(parsed?.end || "") && parsed.end >= parsed.start) return parsed;
  } catch { /* optional browser storage */ }
  return defaultRange();
}
function writeRange(range) { try { window.localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch { /* optional browser storage */ } }
function number(value) { const parsed = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(number(value)); }
function dateText(value, short = false) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("tr-TR", short ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}
function dateTimeText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function employeeOf(row = {}) {
  return { ...EMPTY_PERSON, ...row, id: String(row.id || ""), name: row.fullName || row.name || "", personnelNo: row.personnelNo || row.personelNo || "", role: row.qualification || row.role || row.title || "", broker: row.broker || "Direkt", dayRate: number(row.dayWage ?? row.dayRate), nightRate: number(row.nightWage ?? row.nightRate), note: row.note || "", active: row.active !== false && !["PASSIVE", "PASIF", "PASİF"].includes(String(row.status || "").toLocaleUpperCase("tr-TR")) };
}
function employeePayload(person, companyId) {
  return { mainCompanyId: companyId, fullName: String(person.name || "").trim(), personnelNo: String(person.personnelNo || "").trim(), qualification: String(person.role || "").trim(), broker: String(person.broker || "Direkt").trim() || "Direkt", dayWage: number(person.dayRate), nightWage: number(person.nightRate), note: String(person.note || "").trim(), status: person.active === false ? "PASSIVE" : "ACTIVE" };
}
function rowDate(row = {}) { return String(row.workDate || row.date || "").slice(0, 10); }
function rowEmployeeId(row = {}) { return String(row.employeeId || row.personId || row.personelId || row.dailyEmployeeId || ""); }
function rowDay(row = {}) { return Boolean(row.dayShift ?? row.day ?? row.gunduz); }
function rowNight(row = {}) { return Boolean(row.nightShift ?? row.night ?? row.gece); }
function rowPaid(row = {}) { return String(row.paymentStatus || row.paidStatus || "").toUpperCase() === "PAID" || row.paid === true; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function printRows(title, range, rows) {
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.name || row.fullName)}</td><td>${escapeHtml(row.qualification || row.role || "-")}</td><td>${number(row.dayCount)}</td><td>${number(row.nightCount)}</td><td>${escapeHtml(money(row.totalAmount ?? row.total))}</td></tr>`).join("");
  return printHtmlDocument({ title, html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</p><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table></main>`, css: "@page{size:A4;margin:12mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#f1f5f9}" });
}
function actionLabel(row = {}) {
  const key = String(row.action || row.operation || row.eventType || row.type || "").toUpperCase();
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
  const [query, setQuery] = useState("");
  const [cardDialog, setCardDialog] = useState(null);
  const [quick, setQuick] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState("summary");
  const [logRows, setLogRows] = useState([]);
  const [logQuery, setLogQuery] = useState("");
  const [logShift, setLogShift] = useState("all");
  const [controlPersonId, setControlPersonId] = useState("");
  const [periodLocked, setPeriodLocked] = useState(false);
  const [periodLockKnown, setPeriodLockKnown] = useState(false);
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
    setEmployees(normalized);
    return normalized;
  }, [companyId]);

  const loadRangeData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [rows, roster, lock] = await Promise.all([
        getDailyAttendance({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }),
        getDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }),
        getDailyPeriodLock({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }).catch(() => null),
      ]);
      setAttendance(Array.isArray(rows) ? rows : []);
      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];
      if (savedIds.length) { setRosterIds(new Set(savedIds)); setRosterSaved(true); }
      else { setRosterIds(new Set(employees.filter((row) => row.active !== false).map((row) => row.id))); setRosterSaved(false); }
      if (lock !== null) { setPeriodLocked(Boolean(lock?.locked ?? lock?.isLocked ?? lock?.active)); setPeriodLockKnown(true); }
    } catch (loadError) { setError(loadError?.message || "Dönem kayıtları alınamadı."); }
  }, [companyId, employees, range.end, range.start]);

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
      setRecords(focusedRows);
      setSelectedIds(new Set(focusedRows.filter((row) => row?.selected || String(row.status || "").toUpperCase() === "ACTIVE").map(rowEmployeeId).filter(Boolean)));
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
  const visibleEntryPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return activeRosterPeople.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [activeRosterPeople, query]);
  const recordByEmployee = useMemo(() => new Map(records.map((row) => [rowEmployeeId(row), row])), [records]);
  const selectedTotal = useMemo(() => activeRosterPeople.reduce((sum, person) => sum + (selectedIds.has(person.id) ? (shift === "night" ? person.nightRate : person.dayRate) : 0), 0), [activeRosterPeople, selectedIds, shift]);
  const daySummaries = useMemo(() => days.map((date) => {
    const rows = attendance.filter((row) => rowDate(row) === date);
    let dayCount = 0; let nightCount = 0; let total = 0; const people = new Set();
    rows.forEach((row) => { const person = employeeMap.get(rowEmployeeId(row)); if (rowDay(row)) { dayCount += 1; people.add(rowEmployeeId(row)); total += number(row.dayWage ?? row.dayRate ?? person?.dayRate); } if (rowNight(row)) { nightCount += 1; people.add(rowEmployeeId(row)); total += number(row.nightWage ?? row.nightRate ?? person?.nightRate); } });
    return { date, dayCount, nightCount, total, people: people.size };
  }), [attendance, days, employeeMap]);
  const selectedDaySummary = daySummaries.find((item) => item.date === selectedDate) || { dayCount: 0, nightCount: 0, total: 0, people: 0 };
  const groupedEntryPeople = useMemo(() => {
    const groups = new Map(); visibleEntryPeople.forEach((person) => { const key = person.role || "Vasıfsız"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(person); }); return [...groups.entries()];
  }, [visibleEntryPeople]);

  const saveRoster = async () => {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] }); setRosterIds(new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : [...rosterIds])); setRosterSaved(true); setNotice("Tarih aralığı personel listesi kaydedildi."); }
    catch (e) { setError(e?.message || "Personel listesi kaydedilemedi."); } finally { setBusy(false); }
  };
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
  const thisWeek = () => { const start = startOfWeek(); setSafeRange({ start, end: addDays(start, 6) }); setSelectedDate(localDateKey()); };

  const openQuick = async () => {
    const date = selectedDate; const mode = shift; setBusy(true); setError("");
    try { const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date, shift: mode }); const ids = new Set((Array.isArray(rows) ? rows : []).filter((r) => r.selected || String(r.status || "").toUpperCase() === "ACTIVE").map(rowEmployeeId).filter(Boolean)); setQuick({ date, shift: mode, ids, baseline: new Set(ids), query: "" }); }
    catch (e) { setError(e?.message || "Hızlı giriş açılamadı."); } finally { setBusy(false); }
  };
  const saveQuick = async () => {
    if (!quick || busy || periodLocked) return; setBusy(true); setError("");
    try {
      const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date: quick.date, shift: quick.shift });
      const currentMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [rowEmployeeId(row), row]));
      await saveDailyFocusedRecords({ mainCompanyId: companyId, date: quick.date, shift: quick.shift, personnelEntries: activeRosterPeople.map((person) => ({ personelId: person.id, status: quick.ids.has(person.id) ? "ACTIVE" : "REMOVE", expectedUpdatedAt: currentMap.get(person.id)?.updatedAt || currentMap.get(person.id)?.attendanceUpdatedAt || "", note: currentMap.get(person.id)?.note || "" })) });
      setQuick(null); setSelectedDate(quick.date); setShift(quick.shift); setNotice(`${dateText(quick.date)} hızlı giriş kaydedildi.`); await Promise.all([loadFocused(), loadRangeData()]);
    } catch (e) { setError(e?.message || "Hızlı giriş kaydedilemedi."); } finally { setBusy(false); }
  };

  const loadLog = async () => {
    setBusy(true); setError("");
    try {
      let audits = [];
      try { const result = await getDailyAudit({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, limit: 800 }); audits = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : []; }
      catch { const batches = await Promise.all(days.map((date) => getDailyAudit({ mainCompanyId: companyId, date, limit: 250 }).catch(() => []))); audits = batches.flatMap((r) => Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : []); }
      setLogRows(audits.sort((a, b) => String(b.createdAt || b.timestamp || "").localeCompare(String(a.createdAt || a.timestamp || "")))); setLogOpen(true);
    } catch (e) { setError(e?.message || "Log kayıtları alınamadı."); } finally { setBusy(false); }
  };
  const togglePeriodLock = async () => {
    if (busy) return; setBusy(true); setError("");
    try { const next = !periodLocked; await setDailyPeriodLock({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, locked: next }); setPeriodLocked(next); setPeriodLockKnown(true); setNotice(next ? "Dönem kapatıldı. Günlük kayıt değişikliği kilitlendi." : "Dönem yeniden açıldı."); }
    catch (e) { setError(e?.message || "Dönem kilidi değiştirilemedi."); } finally { setBusy(false); }
  };

  const saveCard = async () => {
    if (busy || !cardDialog) return; if (!String(cardDialog.name || "").trim()) { setError("Ad soyad zorunludur."); return; }
    setBusy(true); setError("");
    try { const payload = employeePayload(cardDialog, companyId); if (cardDialog.id) await updateDailyEmployee(cardDialog.id, payload); else await createDailyEmployee(payload); await loadEmployees(); setCardDialog(null); setNotice(cardDialog.id ? "Personel kartı güncellendi." : "Yeni günlük personel oluşturuldu."); }
    catch (e) { setError(e?.message || "Personel kartı kaydedilemedi."); } finally { setBusy(false); }
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

  const personControlRows = controlPersonId ? attendance.filter((row) => rowEmployeeId(row) === controlPersonId && rowDate(row) >= range.start && rowDate(row) <= range.end).sort((a, b) => rowDate(a).localeCompare(rowDate(b))) : [];
  const controlPerson = employeeMap.get(controlPersonId);
  const controlTotals = personControlRows.reduce((sum, row) => ({ day: sum.day + (rowDay(row) ? 1 : 0), night: sum.night + (rowNight(row) ? 1 : 0), paid: sum.paid + (rowPaid(row) ? (rowDay(row) ? 1 : 0) + (rowNight(row) ? 1 : 0) : 0), total: sum.total + (rowDay(row) ? number(row.dayWage ?? controlPerson?.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? controlPerson?.nightRate) : 0) }), { day: 0, night: 0, paid: 0, total: 0 });
  const visibleLogRows = logRows.filter((row) => { const text = `${row.personName || row.employeeName || row.name || ""} ${row.qualification || ""} ${actionLabel(row)}`.toLocaleLowerCase("tr-TR"); const shiftName = String(row.shift || row.vardiya || "").toLowerCase(); return (!logQuery || text.includes(logQuery.toLocaleLowerCase("tr-TR"))) && (logShift === "all" || shiftName.includes(logShift)); });

  return (
    <section className="gop-workspace notranslate" translate="no">
      {view !== "daily-entry" ? <header className="gop-header"><div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-cards" ? "Personel Kartları" : view === "daily-weekly" ? "Haftalık Özet" : "Ödeme Fişleri"}</h1><p>İK aylık işlemlerinden bağımsız günlük personel, vardiya ve ödeme çalışma alanı.</p></div><button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? loadPayments() : loadEmployees()}><RefreshCw size={16}/> Yenile</button></header> : null}
      {notice ? <div className="gop-notice">{notice}</div> : null}{error ? <div className="gop-error">{error}</div> : null}

      {view === "daily-entry" ? <div className={`kyop-daily ${shift}`}>
        <div className="kyop-titlebar"><div><span>KY ERP / GÜNLÜK OPERASYON / GÜVENLİ GİRİŞ</span><h1>Günlük Personel Girişi</h1><p>Cuma çalışan düzeni, bağımsız Günlük Operasyon API'si üzerinde tek canonical ekran.</p></div><div className="kyop-mode"><button className={shift === "day" ? "active day" : ""} type="button" onClick={() => setShift("day")}><Sun size={17}/> GÜNDÜZ GİRİŞİ</button><button className={shift === "night" ? "active night" : ""} type="button" onClick={() => setShift("night")}><Moon size={17}/> GECE GİRİŞİ</button></div></div>
        <div className="kyop-actions">
          <label>Başlangıç<input type="date" value={range.start} onChange={(e) => setSafeRange({ ...range, start: e.target.value })}/></label><label>Bitiş<input type="date" value={range.end} onChange={(e) => setSafeRange({ ...range, end: e.target.value })}/></label>
          <button type="button" onClick={thisWeek}><CalendarDays size={15}/> Bu Hafta</button><button type="button" className="primary" onClick={openQuick}><Zap size={15}/> Hızlı Giriş</button><button type="button" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><UserPlus size={15}/> Yeni Personel Ekle</button><button type="button" onClick={selectAll}><CheckCircle2 size={15}/> Tümünü Seç</button><button type="button" onClick={clearAll}>Seçimi Kaldır</button><button type="button" onClick={loadFocused}><RefreshCw size={15}/> Kayıtlı Seçimi Yükle</button><button type="button" className="primary" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günlük Kaydet</button><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Liste", range, daySummaries.map((d) => ({ name: dateText(d.date), role: `${d.people} personel`, dayCount: d.dayCount, nightCount: d.nightCount, totalAmount: d.total })))}><Printer size={15}/> Haftalık Liste Yazdır</button><button type="button" onClick={exportExcel}><FileSpreadsheet size={15}/> Excel Aktar</button><button type="button" onClick={importExcel}><FileSpreadsheet size={15}/> Excel Yükle</button>
        </div>
        <div className={`kyop-banner ${shift === "night" ? "night" : ""}`}><strong>{shift === "day" ? "Gündüz" : "Gece"} modu</strong><span>Seçili gün: {dateText(selectedDate)} · {selectedIds.size} personel · {money(selectedTotal)}</span>{periodLocked ? <b><LockKeyhole size={14}/> DÖNEM KAPALI</b> : null}</div>
        <div className="kyop-days">{daySummaries.map((item) => <button type="button" key={item.date} className={item.date === selectedDate ? "active" : ""} onClick={() => setSelectedDate(item.date)}><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))}</small><strong>{dateText(item.date, true)}</strong><span>G {item.dayCount} · N {item.nightCount}</span><b>{money(item.total)}</b><em>{item.people} personel</em>{item.date === selectedDate ? <i>SEÇİLİ</i> : null}</button>)}</div>
        <div className="kyop-grid">
          <aside className="kyop-panel kyop-pool"><div className="kyop-panel-head"><Users size={16}/> Personel Havuzu <b>{rosterIds.size}</b></div><label className="kyop-search"><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Personel ara"/></label><div className="kyop-pool-list">{filteredEmployees.filter((p) => p.active).map((person) => <label key={person.id} className={rosterIds.has(person.id) ? "included" : ""}><input type="checkbox" checked={rosterIds.has(person.id)} onChange={() => { setRosterSaved(false); setRosterIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; }); }}/><span><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small><em>G {money(person.dayRate)} · N {money(person.nightRate)}</em></span></label>)}</div><button type="button" className="primary full" disabled={busy} onClick={saveRoster}><Save size={15}/> Personel Havuzunu Kaydet</button></aside>
          <main className="kyop-panel kyop-entry"><div className="kyop-entry-head"><div><span>SEÇİLİ GÜNÜN PERSONEL GİRİŞİ</span><h2>{dateText(selectedDate)} · {shift === "day" ? "Gündüz" : "Gece"}</h2><p>Personeli seç; ücret ve notu kontrol et; kayıt tek canonical API'ye yazılır.</p></div><div className="kyop-head-actions"><button type="button" onClick={loadLog}>Log</button><button type="button" className={periodLocked ? "locked" : ""} onClick={togglePeriodLock}>{periodLocked ? "Dönemi Aç" : "Dönemi Kapat"}</button><b>{dateText(selectedDate, true)} · {shift === "day" ? "G" : "N"}</b></div></div><div className="kyop-table-wrap"><table><colgroup><col/><col/><col/><col/><col/></colgroup><thead><tr><th>Seçim</th><th>Personel</th><th>Vasıf</th><th>Ücret</th><th>Not</th></tr></thead><tbody>{groupedEntryPeople.length ? groupedEntryPeople.flatMap(([role, people]) => [<tr className="group" key={`g-${role}`}><td colSpan="5">{role} · {people.length}</td></tr>, ...people.map((person) => { const checked = selectedIds.has(person.id); const blocked = shift === "night" && person.nightRate <= 0; return <tr key={person.id} className={checked ? "selected" : ""}><td><button type="button" className={`kyop-check ${checked ? "on" : ""}`} disabled={blocked || periodLocked} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}>{checked ? "✓ SEÇİLİ" : "SEÇ"}</button></td><td><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small></td><td>{person.role || "-"}</td><td>{blocked ? <em>Gece ücreti yok</em> : money(shift === "night" ? person.nightRate : person.dayRate)}</td><td><input value={notes[person.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [person.id]: e.target.value }))} placeholder="Not"/></td></tr>; })]) : <tr><td colSpan="5"><Empty>Dönem havuzunda personel yok.</Empty></td></tr>}</tbody></table></div></main>
          <aside className="kyop-panel kyop-control"><div className="kyop-panel-head"><ClipboardList size={16}/> Seçili Gün Kontrolü</div><div className="kyop-control-body"><Stat label="Personel" value={selectedDaySummary.people}/><Stat label="Gündüz" value={selectedDaySummary.dayCount}/><Stat label="Gece" value={selectedDaySummary.nightCount}/><Stat label="Gün toplamı" value={money(selectedDaySummary.total)}/><div className="kyop-control-summary"><div><span>Aktif vardiya</span><strong>{shift === "day" ? "Gündüz" : "Gece"}</strong></div><div><span>Seçili</span><strong>{selectedIds.size}</strong></div><div><span>Kaydedilecek</span><strong>{money(selectedTotal)}</strong></div><div><span>Havuz</span><strong>{rosterSaved ? "Kayıtlı" : "Değişti"}</strong></div></div><button type="button" className="primary full" disabled={busy || periodLocked} onClick={saveFocused}><Save size={15}/> Günü Kaydet</button></div></aside>
        </div>
      </div> : null}

      {view === "daily-cards" ? <div className="gop-card"><div className="gop-card-head"><div><h2>Günlük Personel Kartları</h2><span>Günlük operasyon ücretleri ve personel kimlikleri.</span></div><button type="button" className="primary" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><Plus size={16}/> Yeni Personel</button></div><label className="gop-search standalone"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad, kod, vasıf veya aracı ara"/></label><div className="gop-table-wrap"><table><thead><tr><th>Kod</th><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Aracı</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filteredEmployees.length ? filteredEmployees.map((person) => <tr key={person.id}><td>{person.personnelNo || "-"}</td><td><strong>{person.name}</strong></td><td>{person.role || "-"}</td><td>{money(person.dayRate)}</td><td>{money(person.nightRate)}</td><td>{person.broker || "-"}</td><td><span className={`gop-badge ${person.active ? "ok" : "passive"}`}>{person.active ? "Aktif" : "Pasif"}</span></td><td><div className="gop-row-actions"><button type="button" onClick={() => setCardDialog({ ...person })}><Pencil size={15}/> Düzenle</button>{person.active ? <button type="button" onClick={() => deactivateCard(person)}><Trash2 size={15}/> Pasif</button> : null}</div></td></tr>) : <tr><td colSpan="8"><Empty>Günlük personel kartı bulunamadı.</Empty></td></tr>}</tbody></table></div></div> : null}
      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Çalışan" value={summaryRows.length}/><Stat label="Vardiya toplamı" value={summaryRows.reduce((s, r) => s + number(r.dayCount) + number(r.nightCount), 0)}/><Stat label="Dönem toplamı" value={money(summaryRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Haftalık Özet</h2><span>Sunucu kayıtlarından hesaplanan dönem özeti.</span></div><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16}/> Yazdır</button></div><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map((row) => <tr key={row.employeeId || row.id}><td><strong>{row.name || row.fullName}</strong></td><td>{row.qualification || row.role || "-"}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><strong>{money(row.totalAmount ?? row.total)}</strong></td></tr>) : <tr><td colSpan="5"><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div></div></> : null}
      {view === "daily-payments" ? <><div className="gop-toolbar-card">{rangeControls}</div><div className="gop-stat-grid three"><Stat label="Ödeme fişi" value={paymentRows.length}/><Stat label="Ödendi" value={paymentRows.filter((r) => number(r.totalAmount ?? r.total) > 0 && number(r.paidAmount) >= number(r.totalAmount ?? r.total)).length}/><Stat label="Dönem toplamı" value={money(paymentRows.reduce((s, r) => s + number(r.totalAmount ?? r.total), 0))}/></div><div className="gop-card"><div className="gop-card-head"><div><h2>Ödeme Fişleri</h2><span>Ödendi işlemi gerçek günlük kaydına yazılır.</span></div><button type="button" onClick={() => printRows("KY ERP Günlük Personel Ödeme Fişleri", range, paymentRows)}><Printer size={16}/> Yazdır</button></div><div className="gop-payment-grid">{paymentRows.length ? paymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = total > 0 && number(row.paidAmount) >= total; return <article key={row.employeeId || row.id} className="gop-payment-card"><div><UserRound size={18}/><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15}/> Ödendi İşaretle</button> : null}</footer></article>; }) : <Empty>Seçili dönemde ödeme fişi oluşacak kayıt yok.</Empty>}</div></div></> : null}

      {quick ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-dialog-wide"><header><div><span>HIZLI GİRİŞ</span><h2>Tek Gün / Tek Vardiya</h2></div><button type="button" onClick={() => setQuick(null)}><X size={19}/></button></header><div className="quick-toolbar"><label>Tarih<input type="date" min={range.start} max={range.end} value={quick.date} onChange={async (e) => { const date = e.target.value; const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date, shift: quick.shift }); const ids = new Set((Array.isArray(rows) ? rows : []).filter((r) => r.selected || String(r.status || "").toUpperCase() === "ACTIVE").map(rowEmployeeId)); setQuick({ ...quick, date, ids, baseline: new Set(ids) }); }}/></label><div className="gop-shift-switch"><button type="button" className={quick.shift === "day" ? "active" : ""} onClick={() => setQuick({ ...quick, shift: "day", ids: new Set() })}><Sun size={15}/> Gündüz</button><button type="button" className={quick.shift === "night" ? "active" : ""} onClick={() => setQuick({ ...quick, shift: "night", ids: new Set() })}><Moon size={15}/> Gece</button></div><label className="gop-search"><Search size={14}/><input value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="Personel ara"/></label></div><div className="quick-list">{activeRosterPeople.filter((p) => !quick.query || `${p.name} ${p.personnelNo} ${p.role}`.toLocaleLowerCase("tr-TR").includes(quick.query.toLocaleLowerCase("tr-TR"))).map((person) => { const checked = quick.ids.has(person.id); const blocked = quick.shift === "night" && person.nightRate <= 0; return <button key={person.id} type="button" className={checked ? "selected" : ""} disabled={blocked} onClick={() => setQuick((current) => { const ids = new Set(current.ids); if (ids.has(person.id)) ids.delete(person.id); else ids.add(person.id); return { ...current, ids }; })}><span>{checked ? "✓" : ""}</span><strong>{person.name}</strong><small>{person.role} · {money(quick.shift === "night" ? person.nightRate : person.dayRate)}</small></button>; })}</div><footer><span>{quick.ids.size} personel seçili</span><button type="button" onClick={() => setQuick(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy || periodLocked} onClick={saveQuick}><Save size={15}/> Hızlı Kaydet</button></footer></section></div> : null}

      {logOpen ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-log-dialog"><header><div><span>GÜNLÜK GİRİŞ / LOG + ANALİZ</span><h2>Log</h2><p>{dateText(range.start)} — {dateText(range.end)}</p></div><button type="button" onClick={() => setLogOpen(false)}><X size={19}/></button></header><div className="log-tabs"><button className={logTab === "summary" ? "active" : ""} onClick={() => setLogTab("summary")}>Log + Özet</button><button className={logTab === "search" ? "active" : ""} onClick={() => setLogTab("search")}>Gelişmiş Arama</button><button className={logTab === "control" ? "active" : ""} onClick={() => setLogTab("control")}>Personel Kontrol</button></div>{logTab !== "control" ? <div className="log-toolbar"><label>Personel / işlem<input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Ara"/></label><label>Vardiya<select value={logShift} onChange={(e) => setLogShift(e.target.value)}><option value="all">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option></select></label></div> : null}{logTab === "summary" ? <><div className="log-kpis"><Stat label="Dönem" value={`${days.length} gün`}/><Stat label="Aktif personel" value={rosterIds.size}/><Stat label="Toplam vardiya" value={daySummaries.reduce((s, d) => s + d.dayCount + d.nightCount, 0)}/><Stat label="Toplam" value={money(daySummaries.reduce((s, d) => s + d.total, 0))}/></div><div className="log-list">{visibleLogRows.length ? visibleLogRows.map((row, index) => { const paid = actionLabel(row) === "ÖDENDİ"; return <article className={paid ? "paid" : ""} key={row.id || `${row.createdAt}-${index}`}><div><strong>{paid ? "✓ ÖDENDİ · Bu kayıt ödenmiştir" : actionLabel(row)}</strong><small>İşlem zamanı: {dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || "Personel"}</b><span>Kayıt tarihi: {dateText(row.workDate || row.date)}</span></div><div><span>{String(row.shift || "").toLowerCase().includes("night") ? "Gece" : "Gündüz"}</span><small>{row.actorName || row.actor || row.source || "Sistem"}</small></div></article>; }) : <Empty>Bu dönemde log kaydı yok.</Empty>}</div></> : null}{logTab === "search" ? <div className="log-list search-mode">{visibleLogRows.length ? visibleLogRows.map((row, index) => <article key={row.id || index}><div><strong>{actionLabel(row)}</strong><small>{dateTimeText(row.createdAt || row.timestamp)}</small></div><div><b>{row.personName || row.employeeName || row.name || "-"}</b><span>{dateText(row.workDate || row.date)}</span></div><div><span>{row.shift || "-"}</span><small>{row.qualification || ""}</small></div></article>) : <Empty>Filtreye uygun kayıt yok.</Empty>}</div> : null}{logTab === "control" ? <div className="person-control"><label>Personel ara / seç<select value={controlPersonId} onChange={(e) => setControlPersonId(e.target.value)}><option value="">Personel seçin</option>{employees.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.personnelNo ? `${p.personnelNo} · ` : ""}{p.name}</option>)}</select></label>{controlPerson ? <><div className="log-kpis"><Stat label="Personel" value={controlPerson.name} hint={controlPerson.role}/><Stat label="Gündüz" value={controlTotals.day}/><Stat label="Gece" value={controlTotals.night}/><Stat label="Toplam" value={money(controlTotals.total)} hint={`${controlTotals.paid} ödendi vardiya`}/></div><div className="person-control-days">{personControlRows.length ? personControlRows.map((row, index) => <div key={`${rowDate(row)}-${index}`}><strong>{dateText(rowDate(row))}</strong><span>{rowDay(row) ? "Gündüz" : ""}{rowDay(row) && rowNight(row) ? " + " : ""}{rowNight(row) ? "Gece" : ""}</span><b>{money((rowDay(row) ? number(row.dayWage ?? controlPerson.dayRate) : 0) + (rowNight(row) ? number(row.nightWage ?? controlPerson.nightRate) : 0))}</b><em className={rowPaid(row) ? "paid" : "waiting"}>{rowPaid(row) ? "Ödendi" : "Hazır"}</em></div>) : <Empty>Seçili dönemde çalışma kaydı yok.</Empty>}</div></> : null}</div> : null}</section></div> : null}

      {cardDialog ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog"><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2></div><button type="button" onClick={() => setCardDialog(null)}><X size={19}/></button></header><div className="gop-form-grid"><label>Ad soyad<input value={cardDialog.name} onChange={(e) => setCardDialog({ ...cardDialog, name: e.target.value })}/></label><label>Personel no<input value={cardDialog.personnelNo} onChange={(e) => setCardDialog({ ...cardDialog, personnelNo: e.target.value })}/></label><label>Vasıf<input value={cardDialog.role} onChange={(e) => setCardDialog({ ...cardDialog, role: e.target.value })}/></label><label>Aracı<input value={cardDialog.broker} onChange={(e) => setCardDialog({ ...cardDialog, broker: e.target.value })}/></label><label>Gündüz ücret<input type="number" value={cardDialog.dayRate} onChange={(e) => setCardDialog({ ...cardDialog, dayRate: number(e.target.value) })}/></label><label>Gece ücret<input type="number" value={cardDialog.nightRate} onChange={(e) => setCardDialog({ ...cardDialog, nightRate: number(e.target.value) })}/></label><label className="wide">Not<textarea rows="3" value={cardDialog.note} onChange={(e) => setCardDialog({ ...cardDialog, note: e.target.value })}/></label><label className="check"><input type="checkbox" checked={cardDialog.active !== false} onChange={(e) => setCardDialog({ ...cardDialog, active: e.target.checked })}/> Aktif personel</label></div><footer><button type="button" onClick={() => setCardDialog(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={saveCard}><Save size={16}/> Kaydet</button></footer></section></div> : null}

      {excelPreview ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true"><section className="gop-dialog gop-dialog-wide"><header><div><span>EXCEL KONTROL</span><h2>İçe Aktarım Önizleme</h2></div><button type="button" onClick={() => setExcelPreview(null)}><X size={19}/></button></header><div className="excel-preview"><p>{Array.isArray(excelPreview.rows) ? excelPreview.rows.length : 0} satır bulundu. Uygulamadan önce tarih ve personel eşleşmelerini kontrol edin.</p><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Gündüz</th><th>Gece</th><th>Uyarı</th></tr></thead><tbody>{(excelPreview.rows || []).slice(0, 250).map((row, index) => <tr key={row.key || index}><td>{row.personName || row.excelName || row.personnelNo || "-"}</td><td>{dateText(row.workDate)}</td><td>{row.dayShift ? "✓" : ""}</td><td>{row.nightShift ? "✓" : ""}</td><td>{Array.isArray(row.warnings) ? row.warnings.join(", ") : row.warning || ""}</td></tr>)}</tbody></table></div></div><footer><button type="button" onClick={() => setExcelPreview(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={applyExcel}><Save size={15}/> Excel'i Uygula</button></footer></section></div> : null}
    </section>
  );
}
