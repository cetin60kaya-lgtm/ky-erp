from pathlib import Path

ROOT = Path("APP/app/ky-erp-frontend/src")
workspace_path = ROOT / "pages/modules/ik/DailyHrWorkspace.jsx"
css_path = ROOT / "pages/modules/ik/daily-hr-workspace-final.css"
registry_path = ROOT / "app/moduleRegistry.js"

text = workspace_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
registry = registry_path.read_text(encoding="utf-8")

# Hard guard: Daily Entry visual block must remain byte-for-byte unchanged.
daily_start = text.index('      {view === "daily-entry" ?')
daily_end = text.index('\n\n      {view === "daily-cards" ?', daily_start)
daily_entry_before = text[daily_start:daily_end]

text = text.replace(
    'const VALID_VIEWS = new Set(["daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);',
    'const VALID_VIEWS = new Set(["daily-dashboard", "daily-entry", "daily-cards", "daily-weekly", "daily-payments"]);',
    1,
)

state_marker = '  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());\n  const [query, setQuery] = useState("");'
state_replacement = '''  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [cardQuery, setCardQuery] = useState("");
  const [cardStatusFilter, setCardStatusFilter] = useState("active");
  const [cardRoleFilter, setCardRoleFilter] = useState("all");
  const [cardBrokerFilter, setCardBrokerFilter] = useState("all");
  const [cardSelectedIds, setCardSelectedIds] = useState(() => new Set());
  const [cardEditor, setCardEditor] = useState(null);
  const [bulkMode, setBulkMode] = useState("day-set");
  const [bulkValue, setBulkValue] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState("");
  const [query, setQuery] = useState("");'''
if state_marker not in text:
    raise SystemExit("State insertion marker missing")
text = text.replace(state_marker, state_replacement, 1)

text = text.replace(
    'if (!companyId || view !== "daily-weekly") return;',
    'if (!companyId || !["daily-weekly", "daily-dashboard"].includes(view)) return;',
    1,
)
text = text.replace(
    'if (!companyId || view !== "daily-payments") return;',
    'if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;',
    1,
)

refresh_old = '''      } else if (view === "daily-payments") {
        await loadPayments();
      }
'''
refresh_new = '''      } else if (view === "daily-payments") {
        await loadPayments();
      } else if (view === "daily-dashboard") {
        await Promise.all([loadEmployees(), loadRangeData(), loadWeekly(), loadPayments()]);
      }
'''
if refresh_old not in text:
    raise SystemExit("Live refresh marker missing")
text = text.replace(refresh_old, refresh_new, 1)

selected_payment_marker = '''  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""))), [paymentRows, paymentSelectedIds]);
'''
management_derived = selected_payment_marker + '''  const cardRoles = useMemo(() => [...new Set(employees.map((person) => person.role || "Vasıfsız").filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [employees]);
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

  const paymentSettled = (row) => {
    const total = number(row.totalAmount ?? row.total);
    return rowPaid(row) || (total > 0 && number(row.paidAmount) >= total);
  };
  const visiblePaymentRows = useMemo(() => paymentRows.filter((row) => paymentFilter === "all" || (paymentFilter === "paid" ? paymentSettled(row) : !paymentSettled(row))), [paymentFilter, paymentRows]);
  const paymentMetrics = useMemo(() => paymentRows.reduce((sum, row) => {
    const total = number(row.totalAmount ?? row.total);
    const paid = paymentSettled(row);
    sum.total += total;
    if (paid) { sum.paidCount += 1; sum.paidAmount += total; }
    else { sum.waitingCount += 1; sum.waitingAmount += total; }
    return sum;
  }, { total: 0, paidCount: 0, waitingCount: 0, paidAmount: 0, waitingAmount: 0 }), [paymentRows]);

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
  const dashboardDays = daySummaries.length > 7 ? daySummaries.slice(-7) : daySummaries;
  const dashboardPeople = useMemo(() => new Set(attendance.filter((row) => rowDay(row) || rowNight(row)).map(rowEmployeeId).filter(Boolean)).size, [attendance]);
  const dashboardZeroWage = useMemo(() => employees.filter((person) => person.active !== false && person.dayRate <= 0).length, [employees]);
  const dashboardWarnings = useMemo(() => {
    const rows = [];
    if (weeklyPending) rows.push(`${weeklyPending} vardiya kontrol bekliyor.`);
    if (paymentMetrics.waitingCount) rows.push(`${paymentMetrics.waitingCount} personelin ödemesi bekliyor.`);
    if (dashboardZeroWage) rows.push(`${dashboardZeroWage} aktif personelin gündüz ücreti 0.`);
    if (periodLocked) rows.push("Seçili dönem kapalı; günlük kayıt değişikliği kilitli.");
    if (!attendance.length) rows.push("Seçili tarih aralığında çalışma kaydı yok.");
    return rows;
  }, [attendance.length, dashboardZeroWage, paymentMetrics.waitingCount, periodLocked, weeklyPending]);
  const recentOperations = useMemo(() => [...attendance].sort((a, b) => String(b.updatedAt || b.createdAt || rowDate(b)).localeCompare(String(a.updatedAt || a.createdAt || rowDate(a)))).slice(0, 8), [attendance]);
'''
if selected_payment_marker not in text:
    raise SystemExit("Derived insertion marker missing")
text = text.replace(selected_payment_marker, management_derived, 1)

function_marker = '''  const deactivateCard = async (person) => { if (busy || !person?.id) return; setBusy(true); try { await deleteDailyEmployee(person.id, { mainCompanyId: companyId }); await loadEmployees(); setNotice(`${person.name} pasife alındı.`); } catch (e) { setError(e?.message || "Personel pasife alınamadı."); } finally { setBusy(false); } };
  const payRow = async (row) => { if (busy) return; setBusy(true); try { await markDailyPaid({ mainCompanyId: companyId, employeeId: row.employeeId || row.id, startDate: range.start, endDate: range.end }); setNotice(`${row.name || row.fullName} için dönem ödemesi işlendi.`); await Promise.all([loadPayments(), loadRangeData()]); } catch (e) { setError(e?.message || "Ödeme durumu güncellenemedi."); } finally { setBusy(false); } };
'''
functions = '''  const deactivateCard = async (person) => { if (busy || !person?.id) return; setBusy(true); try { await deleteDailyEmployee(person.id, { mainCompanyId: companyId }); await loadEmployees(); if (cardEditor?.id === person.id) setCardEditor(null); setNotice(`${person.name} pasife alındı.`); } catch (e) { setError(e?.message || "Personel pasife alınamadı."); } finally { setBusy(false); } };
  const saveCardEditor = async () => {
    if (busy || !cardEditor?.id) return;
    if (!String(cardEditor.name || "").trim()) { setError("Ad soyad zorunludur."); return; }
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
  const payRow = async (row) => { if (busy) return; setBusy(true); try { await markDailyPaid({ mainCompanyId: companyId, employeeId: row.employeeId || row.id, startDate: range.start, endDate: range.end }); setNotice(`${row.name || row.fullName} için dönem ödemesi işlendi.`); await Promise.all([loadPayments(), loadRangeData()]); } catch (e) { setError(e?.message || "Ödeme durumu güncellenemedi."); } finally { setBusy(false); } };
  const paySelectedRows = async () => {
    const rows = selectedPaymentRows.filter((row) => !paymentSettled(row));
    if (busy || !rows.length) return;
    setBusy(true); setError("");
    try {
      for (let index = 0; index < rows.length; index += 8) {
        await Promise.all(rows.slice(index, index + 8).map((row) => markDailyPaid({ mainCompanyId: companyId, employeeId: row.employeeId || row.id, startDate: range.start, endDate: range.end })));
      }
      setPaymentSelectedIds(new Set());
      setNotice(`${rows.length} personelin ödemesi işlendi.`);
      await Promise.all([loadPayments(), loadRangeData()]);
    } catch (e) { setError(e?.message || "Seçili ödemeler güncellenemedi."); }
    finally { setBusy(false); }
  };
'''
if function_marker not in text:
    raise SystemExit("Function marker missing")
text = text.replace(function_marker, functions, 1)

range_marker = '''  const shiftRange = (weeks) => setSafeRange({ start: addDays(range.start, weeks * 7), end: addDays(range.end, weeks * 7) });
  const rangeControls = <div className="gop-range-controls"><button type="button" onClick={() => shiftRange(-1)}>‹ Önceki hafta</button><label>Başlangıç<input type="date" value={range.start} onChange={(e) => setSafeRange({ ...range, start: e.target.value })} /></label><label>Bitiş<input type="date" value={range.end} onChange={(e) => setSafeRange({ ...range, end: e.target.value })} /></label><button type="button" onClick={() => shiftRange(1)}>Sonraki hafta ›</button></div>;
'''
range_replacement = range_marker + '''  const dashboardPreset = (mode) => {
    const today = localDateKey();
    const [year, month] = today.split("-").map(Number);
    const monthStart = `${year}-${pad(month)}-01`;
    const monthEnd = localDateKey(new Date(year, month, 0, 12));
    if (mode === "today" || mode === "live") return setSafeRange({ start: today, end: today });
    if (mode === "week") { const start = startOfWeek(today); return setSafeRange({ start, end: addDays(start, 6) }); }
    if (mode === "last") { const start = addDays(startOfWeek(today), -7); return setSafeRange({ start, end: addDays(start, 6) }); }
    if (mode === "month") return setSafeRange({ start: monthStart, end: monthEnd });
  };
'''
if range_marker not in text:
    raise SystemExit("Range marker missing")
text = text.replace(range_marker, range_replacement, 1)

header_old = '''      {view !== "daily-entry" ? <header className="gop-header"><div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-cards" ? "Personel Kartları" : view === "daily-weekly" ? "Haftalık Özet" : "Ödeme Fişleri"}</h1><p>İK aylık işlemlerinden bağımsız günlük personel, vardiya ve ödeme çalışma alanı.</p></div><button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? loadPayments() : loadEmployees()}><RefreshCw size={16}/> Yenile</button></header> : null}'''
header_new = '''      {view !== "daily-entry" ? <header className="gop-header"><div><span>GÜNLÜK OPERASYON</span><h1>{view === "daily-dashboard" ? "Ana Sayfa" : view === "daily-cards" ? "Personel Kartları" : view === "daily-weekly" ? "Haftalık Özet" : "Ödeme Fişleri"}</h1><p>{view === "daily-dashboard" ? "Çalışma, kontrol ve ödeme durumunu tek ekranda izleyin." : view === "daily-cards" ? "Personel kartlarını, vasıfları ve günlük ücretleri yönetin." : view === "daily-weekly" ? "Seçili dönemi gün gün kontrol edin ve çıktısını alın." : "Bekleyen ve tamamlanan dönem ödemelerini yönetin."}</p></div><button className="gop-refresh" type="button" disabled={loading || busy} onClick={() => view === "daily-dashboard" ? Promise.all([loadEmployees(), loadRangeData(), loadWeekly(), loadPayments()]) : view === "daily-weekly" ? loadWeekly() : view === "daily-payments" ? loadPayments() : loadEmployees()}><RefreshCw size={16}/> Yenile</button></header> : null}'''
if header_old not in text:
    raise SystemExit("Header marker missing")
text = text.replace(header_old, header_new, 1)

# Re-evaluate Daily Entry marker after shared code edits; visual block itself is replaced only after this marker.
daily_start_after = text.index('      {view === "daily-entry" ?')
cards_marker = '\n\n      {view === "daily-cards" ?'
daily_end_after = text.index(cards_marker, daily_start_after)
if text[daily_start_after:daily_end_after] != daily_entry_before:
    raise SystemExit("Daily Entry visual block changed; refusing patch")

dashboard_block = r'''

      {view === "daily-dashboard" ? <div className="gop-dashboard">
        <div className="gop-dashboard-filter"><div className="gop-preset-buttons"><button type="button" onClick={() => dashboardPreset("live")}>● Canlı</button><button type="button" onClick={() => dashboardPreset("today")}>Bugün</button><button type="button" onClick={() => dashboardPreset("week")}>Bu Hafta</button><button type="button" onClick={() => dashboardPreset("last")}>Geçen Hafta</button><button type="button" onClick={() => dashboardPreset("month")}>Bu Ay</button></div>{rangeControls}</div>
        <div className="gop-dashboard-stats"><Stat label="Çalışan Personel" value={dashboardPeople} hint={`${dateText(range.start)} — ${dateText(range.end)}`}/><Stat label="Toplam Vardiya" value={rangeTotals.day + rangeTotals.night} hint={`G ${rangeTotals.day} · N ${rangeTotals.night}`}/><Stat label="Kontrol Bekleyen" value={weeklyPending} hint={weeklyPending ? "İnceleme gerekli" : "Kontroller tamam"}/><Stat label="Ödeme Bekleyen" value={paymentMetrics.waitingCount} hint={money(paymentMetrics.waitingAmount)}/><Stat label="Dönem Toplamı" value={money(rangeTotals.total)} hint={`Ödenen ${money(paymentMetrics.paidAmount)}`}/></div>
        <div className="gop-dashboard-grid">
          <section className="gop-dashboard-main"><div className="gop-section-title"><div><strong>Günlük Durum</strong><span>Seçili aralıktaki son 7 gün</span></div><span className="gop-live-chip">● Canlı senkron</span></div><div className="gop-dashboard-days">{dashboardDays.length ? dashboardDays.map((item) => <article key={item.date}><div><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${item.date}T12:00:00`))}</small><strong>{dateText(item.date, true)}</strong></div><dl><div className="day"><dt>Gündüz</dt><dd>{item.dayCount}</dd></div><div className="night"><dt>Gece</dt><dd>{item.nightCount}</dd></div><div><dt>Personel</dt><dd>{item.people}</dd></div></dl><b>{money(item.total)}</b></article>) : <Empty>Bu aralıkta günlük kayıt yok.</Empty>}</div></section>
          <aside className="gop-dashboard-side"><div className="gop-section-title"><div><strong>Yönetici Bilgilendirme</strong><span>Öncelikli kontrol noktaları</span></div></div><div className="gop-alert-list">{dashboardWarnings.length ? dashboardWarnings.map((warning, index) => <div key={index} className="warn">{warning}</div>) : <div className="ok">Bu dönem için kritik uyarı yok.</div>}</div><div className="gop-dashboard-mini"><div><span>Aktif personel</span><b>{employees.filter((person) => person.active !== false).length}</b></div><div><span>Ödenen</span><b>{paymentMetrics.paidCount}</b></div><div><span>Bekleyen tutar</span><b>{money(paymentMetrics.waitingAmount)}</b></div></div></aside>
        </div>
        <div className="gop-dashboard-details">
          <details open={dashboardOpen === "roles"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "roles" : "")}><summary>Vasıf Dağılımı <span>{roleOverview.length} grup</span></summary><div className="gop-role-overview">{roleOverview.length ? roleOverview.map(([role, count]) => <div key={role}><span>{role}</span><b>{count}</b></div>) : <Empty>Kayıt yok.</Empty>}</div></details>
          <details open={dashboardOpen === "payments"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "payments" : "")}><summary>Maliyet & Ödeme <span>{money(rangeTotals.total)}</span></summary><div className="gop-cost-overview"><div><span>Gündüz vardiya</span><b>{rangeTotals.day}</b></div><div><span>Gece vardiya</span><b>{rangeTotals.night}</b></div><div><span>Dönem toplamı</span><b>{money(rangeTotals.total)}</b></div><div><span>Ödeme bekleyen</span><b>{money(paymentMetrics.waitingAmount)}</b></div></div></details>
          <details open={dashboardOpen === "recent"} onToggle={(e) => setDashboardOpen(e.currentTarget.open ? "recent" : "")}><summary>Son Kayıtlar <span>{recentOperations.length}</span></summary><div className="gop-recent-list">{recentOperations.length ? recentOperations.map((row, index) => { const person = employeeMap.get(rowEmployeeId(row)); return <div key={`${rowEmployeeId(row)}-${rowDate(row)}-${index}`}><span><strong>{person?.name || row.name || row.fullName || "Personel"}</strong><small>{dateText(rowDate(row))}</small></span><b>{rowDay(row) ? "G" : ""}{rowDay(row) && rowNight(row) ? " + " : ""}{rowNight(row) ? "N" : ""}</b><em>{dateTimeText(row.updatedAt || row.createdAt)}</em></div>; }) : <Empty>Kayıt yok.</Empty>}</div></details>
        </div>
      </div> : null}'''
text = text[:daily_end_after] + dashboard_block + text[daily_end_after:]

# Replace management views only, leaving Daily Entry untouched.
def replace_view_block(source, start_marker, end_marker, replacement):
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[:start] + replacement + source[end:]

cards_block = r'''      {view === "daily-cards" ? <div className="gop-card-manager">
        <section className="gop-card-pool"><div className="gop-card-manager-head"><div><strong>Personel Havuzu</strong><span>{managedEmployees.length} / {employees.length} kayıt</span></div><button type="button" className="primary" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><Plus size={15}/> Yeni Personel</button></div><label className="gop-search standalone"><Search size={15}/><input value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder="Ad, kod, vasıf veya aracı ara"/></label><div className="gop-card-filters"><select value={cardStatusFilter} onChange={(e) => setCardStatusFilter(e.target.value)}><option value="active">Aktif</option><option value="passive">Pasif</option><option value="all">Tümü</option></select><select value={cardRoleFilter} onChange={(e) => setCardRoleFilter(e.target.value)}><option value="all">Tüm vasıflar</option>{cardRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select><select value={cardBrokerFilter} onChange={(e) => setCardBrokerFilter(e.target.value)}><option value="all">Tüm aracılar</option>{cardBrokers.map((broker) => <option key={broker} value={broker}>{broker}</option>)}</select></div><div className="gop-card-selectbar"><button type="button" onClick={() => setCardSelectedIds(new Set(managedEmployees.map((person) => person.id)))}>Görünenleri Seç</button><button type="button" onClick={() => setCardSelectedIds(new Set())}>Seçimi Kaldır</button><b>{cardSelectedIds.size} seçili</b></div><div className="gop-card-person-list">{managedEmployees.length ? managedEmployees.map((person) => { const picked = cardSelectedIds.has(person.id); const active = cardEditor?.id === person.id; return <div key={person.id} className={`${active ? "active" : ""} ${person.active === false ? "passive" : ""}`}><label><input type="checkbox" checked={picked} onChange={() => setCardSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}/></label><button type="button" onClick={() => setCardEditor({ ...person })}><span><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small></span><span><b>G {money(person.dayRate)}</b><b>N {money(person.nightRate)}</b></span></button></div>; }) : <Empty>Filtreye uygun personel yok.</Empty>}</div></section>
        <section className="gop-card-detail"><div className="gop-card-manager-head"><div><strong>{cardEditor ? "Personel Bilgileri" : "Personel Yönetimi"}</strong><span>{cardEditor ? `${cardEditor.personnelNo || "Kod yok"} · ${cardEditor.role || "Vasıfsız"}` : "Düzenlemek için soldan personel seçin"}</span></div></div>{cardEditor ? <div className="gop-inline-person-form"><label>Ad Soyad<input value={cardEditor.name} onChange={(e) => setCardEditor({ ...cardEditor, name: e.target.value })}/></label><label>Personel No<input value={cardEditor.personnelNo} onChange={(e) => setCardEditor({ ...cardEditor, personnelNo: e.target.value })}/></label><label>Vasıf<input value={cardEditor.role} onChange={(e) => setCardEditor({ ...cardEditor, role: e.target.value })}/></label><label>Aracı<input value={cardEditor.broker} onChange={(e) => setCardEditor({ ...cardEditor, broker: e.target.value })}/></label><label>Gündüz Ücret<input type="number" value={cardEditor.dayRate} onChange={(e) => setCardEditor({ ...cardEditor, dayRate: number(e.target.value) })}/></label><label>Gece Ücret<input type="number" value={cardEditor.nightRate} onChange={(e) => setCardEditor({ ...cardEditor, nightRate: number(e.target.value) })}/></label><label className="wide">Not<textarea rows="3" value={cardEditor.note || ""} onChange={(e) => setCardEditor({ ...cardEditor, note: e.target.value })}/></label><label className="check"><input type="checkbox" checked={cardEditor.active !== false} onChange={(e) => setCardEditor({ ...cardEditor, active: e.target.checked })}/> Aktif personel</label><div className="gop-inline-person-actions"><button type="button" onClick={() => setCardEditor(null)}>Kapat</button>{cardEditor.active !== false ? <button type="button" onClick={() => deactivateCard(cardEditor)}><Trash2 size={14}/> Pasife Al</button> : null}<button type="button" className="primary" disabled={busy} onClick={saveCardEditor}><Save size={15}/> Kaydet</button></div></div> : <div className="gop-card-empty-detail"><Users size={30}/><strong>Personel seçin</strong><span>Kart bilgileri sağ tarafta açılır; modal açmadan düzenleyebilirsiniz.</span></div>}
          <div className="gop-bulk-editor"><div><strong>Toplu Düzenleme</strong><span>Seçili {selectedCardPeople.length} personel</span></div><select value={bulkMode} onChange={(e) => setBulkMode(e.target.value)}><option value="day-set">Gündüz ücret ata</option><option value="night-set">Gece ücret ata</option><option value="both-set">Gündüz + Gece aynı tutar</option><option value="percent">Ücretlere % uygula</option><option value="role-set">Vasıf değiştir</option></select><input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "role-set" ? "Yeni vasıf" : bulkMode === "percent" ? "+10 veya -5" : "Tutar"}/><button type="button" className="primary" disabled={busy || !selectedCardPeople.length || !String(bulkValue).trim()} onClick={applyBulkCards}>Seçililere Uygula</button></div>
        </section>
      </div> : null}
'''
weekly_block = r'''      {view === "daily-weekly" ? <><div className="gop-toolbar-card">{rangeControls}<div className="gop-print-actions"><button type="button" disabled={!weeklyControlRows.length} onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><Printer size={16}/> Kontrol Listesi</button><button type="button" disabled={!summaryRows.length} onClick={() => printRows("KY ERP Günlük Personel Haftalık Özeti", range, summaryRows)}><Printer size={16}/> Özet Yazdır</button><button type="button" onClick={exportExcel}><FileSpreadsheet size={16}/> Excel</button></div></div><div className="gop-week-stats"><Stat label="Çalışan" value={weeklyTotals.people}/><Stat label="Toplam Gün" value={weeklyTotals.day + weeklyTotals.night}/><Stat label="Gündüz" value={weeklyTotals.day}/><Stat label="Gece" value={weeklyTotals.night}/><Stat label="Kontrol Bekleyen" value={weeklyPending}/><Stat label="Toplam Tutar" value={money(weeklyTotals.total)}/></div><div className="gop-card gop-week-card"><div className="gop-card-head"><div><h2>Haftalık Kontrol Matrisi</h2><span>{dateText(range.start)} — {dateText(range.end)} · Gün gün çalışma ve hakediş kontrolü.</span></div></div><div className="gop-week-matrix"><table><thead><tr><th className="person">Personel</th><th className="role">Vasıf</th>{days.slice(0, 7).map((date) => <th key={date}><span>{new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</span><b>{dateText(date, true)}</b></th>)}<th>Toplam Gün</th><th>Toplam</th></tr></thead><tbody>{weeklyControlRows.length ? weeklyControlRows.map((row) => <tr key={row.employeeId}><td className="person"><strong>{row.name}</strong><small>{row.personnelNo || ""}</small></td><td className="role">{row.role || "-"}</td>{days.slice(0, 7).map((date) => { const cell = row.days?.[date] || {}; return <td key={date} className="shift-cell"><span className={cell.day ? "on day" : ""}>G{cell.day ? "✓" : "–"}</span><span className={cell.night ? "on night" : ""}>N{cell.night ? "✓" : "–"}</span></td>; })}<td className="total-day"><strong>{number(row.dayCount) + number(row.nightCount)}</strong></td><td className="money"><strong>{money(row.totalAmount)}</strong></td></tr>) : <tr><td colSpan={days.slice(0, 7).length + 4}><Empty>Seçili dönemde çalışma kaydı yok.</Empty></td></tr>}</tbody></table></div><details className="gop-week-detail"><summary>Vasıf Dağılımı <span>{roleOverview.length} grup</span></summary><div className="gop-role-overview">{roleOverview.map(([role, count]) => <div key={role}><span>{role}</span><b>{count}</b></div>)}</div></details></div></> : null}
'''
payments_block = r'''      {view === "daily-payments" ? <><div className="gop-toolbar-card">{rangeControls}<div className="gop-payment-filter"><button type="button" className={paymentFilter === "all" ? "active" : ""} onClick={() => setPaymentFilter("all")}>Tümü</button><button type="button" className={paymentFilter === "waiting" ? "active" : ""} onClick={() => setPaymentFilter("waiting")}>Bekleyen</button><button type="button" className={paymentFilter === "paid" ? "active" : ""} onClick={() => setPaymentFilter("paid")}>Ödenen</button></div></div><div className="gop-payment-stats"><Stat label="Personel" value={paymentRows.length}/><Stat label="Ödeme Bekleyen" value={paymentMetrics.waitingCount} hint={money(paymentMetrics.waitingAmount)}/><Stat label="Ödenen" value={paymentMetrics.paidCount} hint={money(paymentMetrics.paidAmount)}/><Stat label="Bekleyen Tutar" value={money(paymentMetrics.waitingAmount)}/><Stat label="Dönem Toplamı" value={money(paymentMetrics.total)}/></div><div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Ödeme Yönetimi</h2><span>{paymentSelectedIds.size ? `${paymentSelectedIds.size} kişi seçili.` : `${visiblePaymentRows.length} kayıt gösteriliyor.`}</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentSelectedIds(new Set(visiblePaymentRows.map((row) => String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""))))}>Tümünü Seç</button><button type="button" disabled={!paymentSelectedIds.size} onClick={() => setPaymentSelectedIds(new Set())}>Seçimi Kaldır</button><button type="button" className="primary" disabled={busy || !selectedPaymentRows.some((row) => !paymentSettled(row))} onClick={paySelectedRows}><WalletCards size={15}/> Seçili Ödendi</button><button type="button" disabled={!selectedPaymentRows.length} onClick={() => printDailyPaymentSlips(range, selectedPaymentRows)}><Printer size={15}/> Seçili Yazdır</button><button type="button" disabled={!paymentRows.length} onClick={() => printDailyPaymentSlips(range, paymentRows)}><Printer size={15}/> Tümünü Yazdır</button><button type="button" disabled={!weeklyControlRows.length} onClick={() => printWeeklyControlList(range, days, weeklyControlRows)}><ClipboardList size={15}/> Haftalık Kontrol</button></div></div><div className="gop-payment-grid compact">{visiblePaymentRows.length ? visiblePaymentRows.map((row) => { const total = number(row.totalAmount ?? row.total); const paid = paymentSettled(row); const paymentKey = String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""); const picked = paymentSelectedIds.has(paymentKey); return <article key={paymentKey} className={`gop-payment-card ${paid ? "paid" : ""} ${picked ? "selected" : ""}`}><div className="payment-person"><label className="gop-payment-pick"><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next = new Set(current); if (next.has(paymentKey)) next.delete(paymentKey); else next.add(paymentKey); return next; })}/><span>Seç</span></label><UserRound size={18}/><span><strong>{row.name || row.fullName}</strong><small>{row.qualification || row.role || "-"}</small></span></div><dl><div><dt>Gündüz</dt><dd>{number(row.dayCount)}</dd></div><div><dt>Gece</dt><dd>{number(row.nightCount)}</dd></div><div className="payment-total"><dt>Ödenecek</dt><dd>{money(total)}</dd></div></dl><footer><span className={`gop-badge ${paid ? "ok" : "waiting"}`}>{paid ? "Ödendi" : "Ödeme Bekliyor"}</span>{!paid ? <button type="button" className="primary" disabled={busy} onClick={() => payRow(row)}><WalletCards size={15}/> Ödendi İşaretle</button> : <span className="paid-note">Tamamlandı</span>}</footer></article>; }) : <Empty>Filtreye uygun ödeme kaydı yok.</Empty>}</div></div></> : null}
'''

text = replace_view_block(text, '      {view === "daily-cards" ?', '\n      {view === "daily-weekly" ?', cards_block)
text = replace_view_block(text, '      {view === "daily-weekly" ?', '\n      {view === "daily-payments" ?', weekly_block)
text = replace_view_block(text, '      {view === "daily-payments" ?', '\n\n      {quick ?', payments_block)

# Daily Entry must still be unchanged after management-view replacements.
check_start = text.index('      {view === "daily-entry" ?')
check_end = text.index('\n\n      {view === "daily-dashboard" ?', check_start)
if text[check_start:check_end] != daily_entry_before:
    raise SystemExit("Daily Entry visual block changed after view replacements")

# Registry: add management home before Daily Entry and aliases.
registry_tabs_old = '''      tabs: [
        ["daily-entry", "Günlük Giriş", "takvim"],
        ["daily-cards", "Personel Kartları", "users"],
        ["daily-weekly", "Haftalık Özet", "raporlar"],
        ["daily-payments", "Ödeme Fişleri", "odemeler"],
      ],'''
registry_tabs_new = '''      tabs: [
        ["daily-dashboard", "Ana Sayfa", "dashboard"],
        ["daily-entry", "Günlük Giriş", "takvim"],
        ["daily-cards", "Personel Kartları", "users"],
        ["daily-weekly", "Haftalık Özet", "raporlar"],
        ["daily-payments", "Ödeme Fişleri", "odemeler"],
      ],'''
if registry_tabs_old not in registry:
    raise SystemExit("Registry tabs marker missing")
registry = registry.replace(registry_tabs_old, registry_tabs_new, 1)
alias_marker = '''  "gunluk-operasyon": {
    "gunluk-giris": "daily-entry",'''
alias_replacement = '''  "gunluk-operasyon": {
    "ana-sayfa": "daily-dashboard",
    "genel-bakis": "daily-dashboard",
    "dashboard": "daily-dashboard",
    "gunluk-giris": "daily-entry",'''
if alias_marker not in registry:
    raise SystemExit("Registry alias marker missing")
registry = registry.replace(alias_marker, alias_replacement, 1)

css_marker = "/* DAILY-OPERATIONS-MANAGEMENT-UI-2026-09-30 */"
if css_marker not in css:
    css += r'''

/* DAILY-OPERATIONS-MANAGEMENT-UI-2026-09-30 */
.gop-dashboard{display:grid;gap:10px}.gop-dashboard-filter{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px}.gop-preset-buttons{display:flex;gap:5px;flex-wrap:wrap}.gop-preset-buttons button,.gop-payment-filter button,.gop-card-selectbar button{border:1px solid #d6e0ec;background:#fff;color:#28445f;border-radius:7px;min-height:30px;padding:0 9px;font-size:9px;font-weight:900;cursor:pointer}.gop-preset-buttons button:first-child{color:#15803d;border-color:#bbf7d0;background:#f0fdf4}.gop-dashboard-stats,.gop-week-stats,.gop-payment-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.gop-week-stats{grid-template-columns:repeat(6,minmax(0,1fr))}.gop-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(260px,.8fr);gap:10px}.gop-dashboard-main,.gop-dashboard-side,.gop-dashboard-details details{background:#fff;border:1px solid #e1e8f0;border-radius:10px}.gop-dashboard-main,.gop-dashboard-side{padding:10px}.gop-section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px}.gop-section-title strong{display:block;font-size:12px;color:#17324e}.gop-section-title span{display:block;font-size:8px;color:#728197;margin-top:2px}.gop-live-chip{color:#15803d!important;border:1px solid #bbf7d0;border-radius:999px;padding:4px 7px;background:#f0fdf4;font-weight:900}.gop-dashboard-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.gop-dashboard-days article{border:1px solid #dfe7f0;border-radius:8px;padding:7px;min-width:0}.gop-dashboard-days article>div{display:flex;justify-content:space-between;gap:4px}.gop-dashboard-days small{font-size:7px;color:#6b7e93;text-transform:uppercase;font-weight:900}.gop-dashboard-days strong{font-size:9px}.gop-dashboard-days dl{margin:6px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px}.gop-dashboard-days dl div{display:flex;justify-content:space-between;gap:3px;font-size:7px;padding:3px 4px;border-radius:5px;background:#f8fafc}.gop-dashboard-days dl .day{border-left:3px solid #f97316}.gop-dashboard-days dl .night{border-left:3px solid #4338ca}.gop-dashboard-days article>b{font-size:10px;color:#153b66}.gop-alert-list{display:grid;gap:5px}.gop-alert-list>div{border-radius:7px;padding:7px 8px;font-size:8px;font-weight:800}.gop-alert-list .warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}.gop-alert-list .ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}.gop-dashboard-mini{display:grid;grid-template-columns:1fr;gap:5px;margin-top:8px}.gop-dashboard-mini>div{display:flex;justify-content:space-between;border-top:1px solid #edf2f7;padding-top:5px;font-size:8px}.gop-dashboard-details{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gop-dashboard-details details{padding:0 9px}.gop-dashboard-details summary,.gop-week-detail summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;padding:9px 0;font-size:9px;font-weight:900;color:#1e3a56}.gop-dashboard-details summary::-webkit-details-marker,.gop-week-detail summary::-webkit-details-marker{display:none}.gop-role-overview,.gop-cost-overview{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;padding:0 0 9px}.gop-role-overview>div,.gop-cost-overview>div{display:flex;justify-content:space-between;gap:7px;padding:6px;border:1px solid #e7edf4;border-radius:6px;font-size:8px}.gop-recent-list{display:grid;gap:4px;padding:0 0 9px}.gop-recent-list>div{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border-top:1px solid #edf2f7;padding-top:5px;font-size:8px}.gop-recent-list span strong,.gop-recent-list span small{display:block}.gop-recent-list em{font-style:normal;color:#718096;font-size:7px}

.gop-card-manager{display:grid;grid-template-columns:minmax(350px,.85fr) minmax(480px,1.15fr);gap:10px;min-height:620px}.gop-card-pool,.gop-card-detail{background:#fff;border:1px solid #e1e8f0;border-radius:10px;overflow:hidden}.gop-card-manager-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;border-bottom:1px solid #edf2f7}.gop-card-manager-head strong{display:block;font-size:12px;color:#17324e}.gop-card-manager-head span{display:block;font-size:8px;color:#728197;margin-top:2px}.gop-card-pool>.gop-search{margin:8px 9px 5px}.gop-card-filters{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:0 9px 7px}.gop-card-filters select,.gop-bulk-editor select,.gop-bulk-editor input{height:32px;border:1px solid #d7e1ec;border-radius:7px;background:#fff;color:#26445f;padding:0 7px;font-size:8px;font-weight:800}.gop-card-selectbar{display:flex;align-items:center;gap:5px;padding:6px 9px;background:#f8fafc;border-top:1px solid #edf2f7;border-bottom:1px solid #edf2f7}.gop-card-selectbar b{margin-left:auto;font-size:8px;color:#2563eb}.gop-card-person-list{height:510px;overflow:auto;padding:5px}.gop-card-person-list>div{display:grid;grid-template-columns:24px 1fr;align-items:center;border:1px solid transparent;border-radius:7px;margin-bottom:3px}.gop-card-person-list>div.active{background:#eff6ff;border-color:#bfdbfe}.gop-card-person-list>div.passive{opacity:.58}.gop-card-person-list>div>label{display:grid;place-items:center}.gop-card-person-list>div>button{border:0;background:transparent;display:flex;justify-content:space-between;gap:8px;text-align:left;padding:7px 6px;cursor:pointer;color:#17324e}.gop-card-person-list span strong,.gop-card-person-list span small,.gop-card-person-list span b{display:block}.gop-card-person-list span strong{font-size:9px}.gop-card-person-list span small{font-size:7px;color:#708197;margin-top:2px}.gop-card-person-list span:last-child{text-align:right;white-space:nowrap}.gop-card-person-list span b{font-size:7px;font-weight:800}.gop-inline-person-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px}.gop-inline-person-form label{display:grid;gap:4px;font-size:8px;font-weight:900;color:#52677f}.gop-inline-person-form input,.gop-inline-person-form textarea{border:1px solid #d7e1ec;border-radius:7px;padding:7px;background:#fff;color:#17324e}.gop-inline-person-form .wide{grid-column:1/-1}.gop-inline-person-form .check{display:flex;align-items:center;gap:6px}.gop-inline-person-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:6px;border-top:1px solid #edf2f7;padding-top:8px}.gop-inline-person-actions button,.gop-bulk-editor button{min-height:32px;border:1px solid #d5deeb;border-radius:7px;background:#fff;color:#28445f;padding:0 10px;font-weight:900;cursor:pointer}.gop-inline-person-actions button.primary,.gop-bulk-editor button.primary{background:#2563eb;color:#fff;border-color:#2563eb}.gop-card-empty-detail{min-height:280px;display:grid;place-items:center;align-content:center;gap:7px;color:#7890a8;text-align:center}.gop-card-empty-detail strong{color:#24435f}.gop-bulk-editor{margin:12px;border:1px solid #dbe5ef;background:#f8fafc;border-radius:9px;padding:9px;display:grid;grid-template-columns:minmax(130px,.8fr) minmax(150px,1fr) minmax(120px,.8fr) auto;gap:6px;align-items:end}.gop-bulk-editor>div strong,.gop-bulk-editor>div span{display:block}.gop-bulk-editor>div strong{font-size:9px}.gop-bulk-editor>div span{font-size:7px;color:#728197;margin-top:2px}

.gop-week-stats .gop-stat,.gop-payment-stats .gop-stat,.gop-dashboard-stats .gop-stat{min-height:72px}.gop-toolbar-card{display:flex;align-items:end;justify-content:space-between;gap:10px}.gop-week-card{padding-bottom:8px}.gop-week-matrix{overflow:auto}.gop-week-matrix table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:980px}.gop-week-matrix th,.gop-week-matrix td{border-bottom:1px solid #e4ebf3;padding:6px 5px;text-align:center;font-size:8px}.gop-week-matrix th{background:#f8fafc;color:#536b84;font-size:7px;font-weight:900}.gop-week-matrix th span,.gop-week-matrix th b{display:block}.gop-week-matrix .person{width:190px;text-align:left}.gop-week-matrix .role{width:95px;text-align:left}.gop-week-matrix td.person strong,.gop-week-matrix td.person small{display:block}.gop-week-matrix td.person strong{font-size:9px;color:#17324e}.gop-week-matrix td.person small{font-size:7px;color:#718096}.gop-week-matrix .shift-cell{padding:4px 2px}.gop-week-matrix .shift-cell span{display:inline-flex;align-items:center;justify-content:center;min-width:31px;height:21px;border-radius:5px;font-size:7px;font-weight:900;color:#94a3b8}.gop-week-matrix .shift-cell span.on.day{background:#fff1e6;color:#c2410c}.gop-week-matrix .shift-cell span.on.night{background:#eef2ff;color:#3730a3}.gop-week-matrix .total-day strong{font-size:11px}.gop-week-matrix .money{text-align:right;white-space:nowrap}.gop-week-detail{margin:7px 10px;border-top:1px solid #edf2f7}

.gop-payment-filter{display:flex;gap:5px}.gop-payment-filter button.active{background:#173d68;color:#fff;border-color:#173d68}.gop-payment-grid.compact{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gop-payment-grid.compact .gop-payment-card{min-height:135px}.gop-payment-grid.compact .payment-person{display:flex;align-items:center;gap:6px}.gop-payment-grid.compact .payment-total dd{font-size:17px;color:#153b66}.gop-payment-grid.compact footer{align-items:center}.paid-note{font-size:8px;font-weight:900;color:#15803d}

@media(max-width:1200px){.gop-dashboard-days{grid-template-columns:repeat(4,1fr)}.gop-dashboard-stats,.gop-week-stats,.gop-payment-stats{grid-template-columns:repeat(3,1fr)}.gop-card-manager{grid-template-columns:1fr}.gop-card-person-list{height:360px}.gop-payment-grid.compact{grid-template-columns:repeat(2,1fr)}}
@media(max-width:800px){.gop-dashboard-filter,.gop-toolbar-card{align-items:stretch;flex-direction:column}.gop-dashboard-grid{grid-template-columns:1fr}.gop-dashboard-days{grid-template-columns:repeat(2,1fr)}.gop-dashboard-details{grid-template-columns:1fr}.gop-dashboard-stats,.gop-week-stats,.gop-payment-stats{grid-template-columns:repeat(2,1fr)}.gop-card-filters{grid-template-columns:1fr}.gop-inline-person-form{grid-template-columns:1fr}.gop-inline-person-form .wide,.gop-inline-person-actions{grid-column:1}.gop-bulk-editor{grid-template-columns:1fr}.gop-payment-grid.compact{grid-template-columns:1fr}}
'''

workspace_path.write_text(text, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")
registry_path.write_text(registry, encoding="utf-8")
print("Daily Operations management UI patch applied; Daily Entry visual block preserved.")
