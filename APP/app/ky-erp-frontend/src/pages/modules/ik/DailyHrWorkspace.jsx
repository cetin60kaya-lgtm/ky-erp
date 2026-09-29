import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Moon,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sun,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  createDailyEmployee,
  deleteDailyEmployee,
  getDailyEmployees,
  getDailyFocusedRecords,
  getDailyPaymentSlips,
  getDailyRoster,
  getDailyWeeklySummary,
  markDailyPaid,
  saveDailyFocusedRecords,
  saveDailyRoster,
  updateDailyEmployee,
} from "../../../services/dailyOpsApi";
import { printHtmlDocument } from "../../../services/printService";
import "./daily-hr-workspace.css";

const VALID_VIEWS = new Set(["daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);
const RANGE_KEY = "kyerp.dailyOperations.range.v3";
const EMPTY_PERSON = {
  id: "",
  name: "",
  personnelNo: "",
  role: "",
  broker: "Direkt",
  dayRate: 0,
  nightRate: 0,
  note: "",
  active: true,
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(value, amount) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day + amount, 12, 0, 0);
  return localDateKey(date);
}

function startOfWeek(value = localDateKey()) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const weekDay = date.getDay() || 7;
  return addDays(value, 1 - weekDay);
}

function defaultRange() {
  const start = startOfWeek();
  return { start, end: addDays(start, 6) };
}

function readRange() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RANGE_KEY) || "null");
    const start = String(parsed?.start || "");
    const end = String(parsed?.end || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= start) {
      return { start, end };
    }
  } catch {
    // Tarayıcı depolaması kullanılamıyorsa varsayılan hafta kullanılır.
  }
  return defaultRange();
}

function writeRange(range) {
  try {
    window.localStorage.setItem(RANGE_KEY, JSON.stringify(range));
  } catch {
    // Aralık React durumunda çalışmaya devam eder.
  }
}

function number(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function dateText(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(year, month - 1, day, 12, 0, 0));
}

function employeeOf(row = {}) {
  return {
    ...EMPTY_PERSON,
    ...row,
    id: String(row.id || ""),
    name: row.fullName || row.name || "",
    personnelNo: row.personnelNo || row.personelNo || "",
    role: row.qualification || row.role || row.title || "",
    broker: row.broker || "Direkt",
    dayRate: number(row.dayWage ?? row.dayRate),
    nightRate: number(row.nightWage ?? row.nightRate),
    note: row.note || "",
    active: row.active !== false && !["PASSIVE", "PASIF", "PASİF"].includes(String(row.status || "").toLocaleUpperCase("tr-TR")),
  };
}

function employeePayload(person, companyId) {
  return {
    mainCompanyId: companyId,
    fullName: String(person.name || "").trim(),
    personnelNo: String(person.personnelNo || "").trim(),
    qualification: String(person.role || "").trim(),
    broker: String(person.broker || "Direkt").trim() || "Direkt",
    dayWage: number(person.dayRate),
    nightWage: number(person.nightRate),
    note: String(person.note || "").trim(),
    status: person.active === false ? "PASSIVE" : "ACTIVE",
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function printRows(title, range, rows) {
  const body = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name || row.fullName)}</td>
      <td>${escapeHtml(row.qualification || row.role || "-")}</td>
      <td>${number(row.dayCount)}</td>
      <td>${number(row.nightCount)}</td>
      <td>${escapeHtml(money(row.totalAmount ?? row.total))}</td>
    </tr>`).join("");
  return printHtmlDocument({
    title,
    html: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(dateText(range.start))} — ${escapeHtml(dateText(range.end))}</p><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${body}</tbody></table></main>`,
    css: "@page{size:A4;margin:12mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#f1f5f9}",
  });
}

function Stat({ label, value, hint }) {
  return <div className="gop-stat"><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}

function Empty({ children }) {
  return <div className="gop-empty">{children}</div>;
}

export default function DailyHrWorkspace({ activeTab = "daily-entry", activeMainCompany }) {
  const view = VALID_VIEWS.has(activeTab) ? activeTab : "daily-entry";
  const companyId = String(activeMainCompany?.slug || activeMainCompany?.id || "").trim();
  const [employees, setEmployees] = useState([]);
  const [range, setRange] = useState(readRange);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());
  const [shift, setShift] = useState("day");
  const [records, setRecords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [notes, setNotes] = useState({});
  const [rosterIds, setRosterIds] = useState(() => new Set());
  const [rosterSaved, setRosterSaved] = useState(false);
  const [summaryRows, setSummaryRows] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);
  const [query, setQuery] = useState("");
  const [cardDialog, setCardDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const setSafeRange = useCallback((next) => {
    const resolved = typeof next === "function" ? next(range) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    setRange(resolved);
    writeRange(resolved);
  }, [range]);

  useEffect(() => {
    if (selectedDate < range.start || selectedDate > range.end) setSelectedDate(range.start);
  }, [range.end, range.start, selectedDate]);

  const loadEmployees = useCallback(async () => {
    if (!companyId) return [];
    const rows = await getDailyEmployees({ mainCompanyId: companyId });
    const normalized = (Array.isArray(rows) ? rows : []).map(employeeOf);
    setEmployees(normalized);
    return normalized;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    loadEmployees().catch((loadError) => setError(loadError?.message || "Günlük personel listesi alınamadı."))
      .finally(() => setLoading(false));
  }, [companyId, loadEmployees]);

  const loadFocused = useCallback(async () => {
    if (!companyId || view !== "daily-entry" || !selectedDate) return;
    setLoading(true);
    setError("");
    try {
      const [focused, roster] = await Promise.all([
        getDailyFocusedRecords({ mainCompanyId: companyId, date: selectedDate, shift }),
        getDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }),
      ]);
      const focusedRows = Array.isArray(focused) ? focused : [];
      setRecords(focusedRows);
      setSelectedIds(new Set(focusedRows.filter((row) => row?.selected).map((row) => String(row.employeeId || row.personelId || "")).filter(Boolean)));
      setNotes(Object.fromEntries(focusedRows.map((row) => [String(row.employeeId || row.personelId || ""), row.note || ""]).filter(([id]) => id)));
      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];
      if (savedIds.length) {
        setRosterIds(new Set(savedIds));
        setRosterSaved(true);
      } else {
        const defaults = employees.filter((row) => row.active !== false).map((row) => row.id);
        setRosterIds(new Set(defaults));
        setRosterSaved(false);
      }
    } catch (loadError) {
      setError(loadError?.message || "Seçili gün kayıtları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyId, employees, range.end, range.start, selectedDate, shift, view]);

  useEffect(() => {
    void loadFocused();
  }, [loadFocused]);

  const loadWeekly = useCallback(async () => {
    if (!companyId || view !== "daily-weekly") return;
    setLoading(true);
    setError("");
    try {
      const rows = await getDailyWeeklySummary({ mainCompanyId: companyId, startDate: range.start, endDate: range.end });
      setSummaryRows(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(loadError?.message || "Haftalık özet alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyId, range.end, range.start, view]);

  useEffect(() => { void loadWeekly(); }, [loadWeekly]);

  const loadPayments = useCallback(async () => {
    if (!companyId || view !== "daily-payments") return;
    setLoading(true);
    setError("");
    try {
      const rows = await getDailyPaymentSlips({ mainCompanyId: companyId, startDate: range.start, endDate: range.end });
      setPaymentRows(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(loadError?.message || "Ödeme fişleri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyId, range.end, range.start, view]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return employees.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, query]);

  const recordByEmployee = useMemo(() => new Map(records.map((row) => [String(row.employeeId || row.personelId || ""), row])), [records]);
  const activeRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && rosterIds.has(person.id)), [employees, rosterIds]);
  const visibleEntryPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return activeRosterPeople.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [activeRosterPeople, query]);

  const selectedTotal = useMemo(() => activeRosterPeople.reduce((sum, person) => {
    if (!selectedIds.has(person.id)) return sum;
    return sum + (shift === "night" ? number(person.nightRate) : number(person.dayRate));
  }, 0), [activeRosterPeople, selectedIds, shift]);

  const saveRoster = async () => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] });
      setRosterIds(new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : [...rosterIds]));
      setRosterSaved(true);
      setNotice("Tarih aralığı personel listesi kaydedildi.");
    } catch (saveError) {
      setError(saveError?.message || "Personel listesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveFocused = async () => {
    if (busy || !activeRosterPeople.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!rosterSaved) {
        await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] });
        setRosterSaved(true);
      }
      await saveDailyFocusedRecords({
        mainCompanyId: companyId,
        date: selectedDate,
        shift,
        personnelEntries: activeRosterPeople.map((person) => {
          const current = recordByEmployee.get(person.id) || {};
          return {
            personelId: person.id,
            status: selectedIds.has(person.id) ? "ACTIVE" : "REMOVE",
            expectedUpdatedAt: current.updatedAt || current.attendanceUpdatedAt || "",
            note: notes[person.id] || "",
          };
        }),
      });
      setNotice(`${dateText(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} kaydı güncellendi.`);
      await loadFocused();
    } catch (saveError) {
      setError(saveError?.message || "Günlük giriş kaydedilemedi. Başka bilgisayarda değişiklik olduysa ekranı yenileyin.");
    } finally {
      setBusy(false);
    }
  };

  const saveCard = async () => {
    if (busy || !cardDialog) return;
    if (!String(cardDialog.name || "").trim()) { setError("Ad soyad zorunludur."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = employeePayload(cardDialog, companyId);
      if (cardDialog.id) await updateDailyEmployee(cardDialog.id, payload);
      else await createDailyEmployee(payload);
      await loadEmployees();
      setCardDialog(null);
      setNotice(cardDialog.id ? "Personel kartı güncellendi." : "Yeni günlük personel oluşturuldu.");
    } catch (saveError) {
      setError(saveError?.message || "Personel kartı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const deactivateCard = async (person) => {
    if (busy || !person?.id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await deleteDailyEmployee(person.id, { mainCompanyId: companyId });
      await loadEmployees();
      setNotice(`${person.name} pasife alındı.`);
    } catch (saveError) {
      setError(saveError?.message || "Personel pasife alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const payRow = async (row) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await markDailyPaid({ mainCompanyId: companyId, employeeId: row.employeeId || row.id, startDate: range.start, endDate: range.end });
      setNotice(`${row.name || row.fullName} için dönem ödemesi işlendi.`);
      await loadPayments();
    } catch (saveError) {
      setError(saveError?.message || "Ödeme durumu güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return <div className="content-card module-error-card"><h3>Günlük Operasyon için firma seçin</h3><p>Günlük personel ve ödeme kayıtları firma bazında tutulur.</p></div>;
  }

  const shiftRange = (weeks) => {
    const next = { start: addDays(range.start, weeks * 7), end: addDays(range.end, weeks * 7) };
    setSafeRange(next);
  };

  const rangeControls = (
    <div className="gop-range-controls">
      <button type="button" onClick={() => shiftRange(-1)}>‹ Önceki hafta</button>
      <label>Başlangıç<input type="date" value={range.start} onChange={(event) => setSafeRange({ ...range, start: event.target.value })} /></label>
      <label>Bitiş<input type="date" value={range.end} onChange={(event) => setSafeRange({ ...range, end: event.target.value })} /></label>
      <button type="button" onClick={() => shiftRange(1)}>Sonraki hafta ›</button>
    </div>
  );

  return (
    <section className="gop-workspace notranslate" translate="no">
      <header className="gop-header">
        <div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-entry" ? "Günlük Giriş" : view === "daily-cards" ? "Personel Kartları" : view === "daily-weekly" ? "Haftalık Özet" : "Ödeme Fişleri"}</h1><p>İK aylık işlemlerinden bağımsız günlük personel, vardiya ve ödeme çalışma alanı.</p></div>
        <button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-entry" ? loadFocused() : view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? loadPayments() : loadEmployees()}><RefreshCw size={16} /> Yenile</button>
      </header>

      {notice ? <div className="gop-notice">{notice}</div> : null}
      {error ? <div className="gop-error">{error}</div> : null}

      {view === "daily-entry" ? (
        <>
          <div className="gop-stat-grid">
            <Stat label="Dönem personeli" value={activeRosterPeople.length} hint={`${dateText(range.start)} — ${dateText(range.end)}`} />
            <Stat label="Seçili vardiya" value={selectedIds.size} hint={shift === "day" ? "Gündüz" : "Gece"} />
            <Stat label="Günlük toplam" value={money(selectedTotal)} hint={dateText(selectedDate)} />
            <Stat label="Liste durumu" value={rosterSaved ? "Kayıtlı" : "Hazırlanıyor"} hint="Firma bazlı" />
          </div>
          <div className="gop-toolbar-card">
            {rangeControls}
            <div className="gop-entry-tools">
              <label>İşlem günü<input type="date" min={range.start} max={range.end} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
              <div className="gop-shift-switch"><button type="button" className={shift === "day" ? "active" : ""} onClick={() => setShift("day")}><Sun size={16} /> Gündüz</button><button type="button" className={shift === "night" ? "active" : ""} onClick={() => setShift("night")}><Moon size={16} /> Gece</button></div>
              <label className="gop-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel ara" /></label>
            </div>
          </div>
          <div className="gop-entry-layout">
            <main className="gop-card">
              <div className="gop-card-head"><div><h2>{dateText(selectedDate)} · {shift === "day" ? "Gündüz" : "Gece"}</h2><span>Tek gün ve tek vardiya üzerinde çalışılır. Başka bilgisayarda değişen kayıt üzerine yazılmaz.</span></div><button type="button" className="primary" disabled={busy || loading || !activeRosterPeople.length} onClick={saveFocused}><Save size={16} /> Kaydet</button></div>
              <div className="gop-table-wrap"><table><thead><tr><th>Çalışıyor</th><th>Personel</th><th>Vasıf</th><th>Ücret</th><th>Not</th></tr></thead><tbody>
                {visibleEntryPeople.length ? visibleEntryPeople.map((person) => {
                  const checked = selectedIds.has(person.id);
                  const nightBlocked = shift === "night" && number(person.nightRate) <= 0;
                  return <tr key={person.id} className={checked ? "selected" : ""}><td><button type="button" className={`gop-check ${checked ? "on" : ""}`} disabled={nightBlocked} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}>{checked ? <CheckCircle2 size={17} /> : <span />}{checked ? "Seçili" : "Seç"}</button></td><td><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small></td><td>{person.role || "-"}</td><td>{nightBlocked ? <em>Gece ücreti yok</em> : money(shift === "night" ? person.nightRate : person.dayRate)}</td><td><input value={notes[person.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [person.id]: event.target.value }))} placeholder="Not" /></td></tr>;
                }) : <tr><td colSpan="5"><Empty>Dönem listesinde görüntülenecek aktif personel yok.</Empty></td></tr>}
              </tbody></table></div>
            </main>
            <aside className="gop-card gop-roster"><div className="gop-card-head"><div><h2>Dönem Personel Listesi</h2><span>Bu tarih aralığında çalışabilecek personeller.</span></div></div><div className="gop-roster-list">{filteredEmployees.filter((person) => person.active !== false).map((person) => <label key={person.id}><input type="checkbox" checked={rosterIds.has(person.id)} onChange={() => { setRosterSaved(false); setRosterIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; }); }} /><span><strong>{person.name}</strong><small>{person.role || "Vasıf yok"}</small></span></label>)}</div><button type="button" className="primary full" disabled={busy} onClick={saveRoster}><Save size={16} /> Dönem Listesini Kaydet</button></aside>
          </div>
        </>
      ) : null}

      {view === "daily-cards" ? (
        <div className="gop-card">
          <div className="gop-card-head"><div><h2>Günlük Personel Kartları</h2><span>Gündüz ve gece ücretleri günlük operasyona aittir; aylık İK kartlarıyla karışmaz.</span></div><button type="button" className="primary" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><Plus size={16} /> Yeni Personel</button></div>
          <label className="gop-search standalone"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, kod, vasıf veya aracı ara" /></label>
          <div className="gop-table-wrap"><table><thead><tr><th>Kod</th><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Aracı</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
            {filteredEmployees.length ? filteredEmployees.map((person) => <tr key={person.id}><td>{person.personnelNo || "-"}</td><td><strong>{person.name}</strong></td><td>{person.role || "-"}</td><td>{money(person.dayRate)}</td><td>{money(person.nightRate)}</td><td>{person.broker || "-"}</td><td><span className={`gop-badge ${person.active ? "ok" : "passive"}`}>{person.active ? "Aktif" : "Pasif"}</span></td><td><div className="gop-row-actions"><button type="button" onClick={() => setCardDialog({ ...person })}><Pencil size={15} /> Düzenle</button>{person.active ? <button type="button" onClick={() => deactivateCard(person)}><Trash2 size={15} /> Pasif</button> : null}</div></td></tr>) : <tr><td colSpan="8"><Empty>Günlük personel kartı bulunamadı.</Empty></td></tr>}
          </tbody></table></div>
        </div>
      ) : null}

      {view === "daily-weekly" ? (
        <>
          <div className="gop-toolbar-card">{rangeControls}</div>
          <div className="gop-stat-grid three"><Stat label="Çalışan" value={summaryRows.length} /><Stat label="Vardiya toplamı" value={summaryRows.reduce((sum, row) => sum + number(row.dayCount) + number(row.nightCount), 0)} /><Stat label="Haftalık toplam" value={money(summaryRows.reduce((sum, row) => sum + number(row.totalAmount ?? row.total), 0))} /></div>
          <div className="gop-card"><div className="gop-card-head"><div><h2>Haftalık Özet</h2><span>Sunucu kayıtlarından hesaplanan dönem özeti.</span></div><button type="button" onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16} /> Yazdır</button></div><div className="gop-table-wrap"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map((row) => <tr key={row.employeeId || row.id}><td><strong>{row.name || row.fullName}</strong></td><td>{row.qualification || row.role || "-"}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><strong>{money(row.totalAmount ?? row.total)}</strong></td></tr>) : <tr><td colSpan="5"><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div></div>
        </>
      ) : null}

      {view === "daily-payments" ? (
        <>
          <div className="gop-toolbar-card">{rangeControls}</div>
          <div className="gop-stat-grid three"><Stat label="Ödeme fişi" value={paymentRows.length} /><Stat label="Ödendi" value={paymentRows.filter((row) => number(row.totalAmount ?? row.total) > 0 && number(row.paidAmount) >= number(row.totalAmount ?? row.total)).length} /><Stat label="Dönem toplamı" value={money(paymentRows.reduce((sum, row) => sum + number(row.totalAmount ?? row.total), 0))} /></div>
          <div className="gop-card"><div className="gop-card-head"><div><h2>Ödeme Fişleri</h2><span>Ödendi işlemi gerçek günlük kayıtların ödeme durumuna yazılır.</span></div><button type="button" onClick={() => printRows("KY ERP Günlük Personel Ödeme Fişleri", range, paymentRows)}><Printer size={16} /> Yazdır</button></div><div className="gop-payment-grid">{paymentRows.length ? paymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = total > 0 && number(row.paidAmount) >= total; return <article key={row.employeeId || row.id} className="gop-payment-card"><div><UserRound size={18} /><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15} /> Ödendi İşaretle</button> : null}</footer></article>; }) : <Empty>Seçili dönemde ödeme fişi oluşacak çalışma kaydı yok.</Empty>}</div></div>
        </>
      ) : null}

      {cardDialog ? <div className="gop-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Günlük personel kartı" onMouseDown={(event) => { if (event.target === event.currentTarget) setCardDialog(null); }}><section className="gop-dialog"><header><div><span>GÜNLÜK OPERASYON</span><h2>{cardDialog.id ? "Personel Kartını Düzenle" : "Yeni Personel"}</h2></div><button type="button" aria-label="Kapat" onClick={() => setCardDialog(null)}><X size={19} /></button></header><div className="gop-form-grid"><label>Ad soyad<input value={cardDialog.name} onChange={(event) => setCardDialog({ ...cardDialog, name: event.target.value })} /></label><label>Personel no<input value={cardDialog.personnelNo} onChange={(event) => setCardDialog({ ...cardDialog, personnelNo: event.target.value })} /></label><label>Vasıf<input value={cardDialog.role} onChange={(event) => setCardDialog({ ...cardDialog, role: event.target.value })} /></label><label>Aracı<input value={cardDialog.broker} onChange={(event) => setCardDialog({ ...cardDialog, broker: event.target.value })} /></label><label>Gündüz ücret<input type="number" value={cardDialog.dayRate} onChange={(event) => setCardDialog({ ...cardDialog, dayRate: number(event.target.value) })} /></label><label>Gece ücret<input type="number" value={cardDialog.nightRate} onChange={(event) => setCardDialog({ ...cardDialog, nightRate: number(event.target.value) })} /></label><label className="wide">Not<textarea rows="3" value={cardDialog.note} onChange={(event) => setCardDialog({ ...cardDialog, note: event.target.value })} /></label><label className="check"><input type="checkbox" checked={cardDialog.active !== false} onChange={(event) => setCardDialog({ ...cardDialog, active: event.target.checked })} /> Aktif personel</label></div><footer><button type="button" onClick={() => setCardDialog(null)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={saveCard}><Save size={16} /> {busy ? "Kaydediliyor" : "Kaydet"}</button></footer></section></div> : null}
    </section>
  );
}
