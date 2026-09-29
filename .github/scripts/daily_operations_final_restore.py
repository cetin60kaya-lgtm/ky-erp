from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx"
CSS = ROOT / "APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css"

src = PAGE.read_text(encoding="utf-8")


def once(old, new, label):
    global src
    if old not in src:
        raise SystemExit(f"missing patch anchor: {label}")
    src = src.replace(old, new, 1)


def sub_once(pattern, replacement, label, flags=re.S):
    global src
    src2, count = re.subn(pattern, replacement, src, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"patch count {count} for {label}")
    src = src2


once(
    '  getDailyRoster,\n  getDailyWeeklySummary,',
    '  getDailyRoster,\n  getDailyRevisions,\n  getDailyWeeklySummary,',
    'revision import',
)
once(
    'import "./daily-hr-workspace.css";',
    'import "./daily-hr-workspace.css";\nimport "./daily-hr-workspace-final.css";',
    'final css import',
)
once(
    '  const key = normalizeText(row.action || row.operation || row.eventType || row.type);',
    '  const key = normalizeText(row.action || row.operation || row.eventType || row.type || row.changeType);',
    'revision action label',
)
once(
    '  const [query, setQuery] = useState("");\n  const [cardDialog, setCardDialog] = useState(null);',
    '  const [query, setQuery] = useState("");\n  const [poolAddQuery, setPoolAddQuery] = useState("");\n  const [quickAddQuery, setQuickAddQuery] = useState("");\n  const [cardAddToRoster, setCardAddToRoster] = useState(false);\n  const [cardDialog, setCardDialog] = useState(null);',
    'pool states',
)
once(
    '  const [logRows, setLogRows] = useState([]);\n  const [logQuery, setLogQuery] = useState("");',
    '  const [logRows, setLogRows] = useState([]);\n  const [logRevisions, setLogRevisions] = useState([]);\n  const [logAttendance, setLogAttendance] = useState([]);\n  const [logRange, setLogRange] = useState(readRange);\n  const [logQuery, setLogQuery] = useState("");',
    'log states',
)

once(
    '      setAttendance(Array.isArray(rows) ? rows : []);\n      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];\n      if (savedIds.length) { setRosterIds(new Set(savedIds)); setRosterSaved(true); }\n      else { setRosterIds(new Set(employees.filter((row) => row.active !== false).map((row) => row.id))); setRosterSaved(false); }',
    '      const attendanceRows = Array.isArray(rows) ? rows : [];\n      setAttendance(attendanceRows);\n      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];\n      const historicalIds = [...new Set(attendanceRows.map(rowEmployeeId).filter(Boolean))];\n      const resolvedIds = savedIds.length ? savedIds : historicalIds;\n      setRosterIds(new Set(resolvedIds));\n      setRosterSaved(savedIds.length > 0);',
    'empty roster must stay empty',
)

once(
    '  const activeRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && rosterIds.has(person.id)), [employees, rosterIds]);\n  const visibleEntryPeople = useMemo(() => {',
    '''  const activeRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && rosterIds.has(person.id)), [employees, rosterIds]);
  const availableRosterPeople = useMemo(() => employees.filter((person) => person.active !== false && !rosterIds.has(person.id)), [employees, rosterIds]);
  const resolveRosterChoice = useCallback((raw, candidates = availableRosterPeople) => {
    const needle = normalizeText(raw);
    if (!needle) return null;
    return candidates.find((person) => normalizeText(person.personnelNo) === needle || normalizeText(person.name) === needle)
      || candidates.find((person) => `${normalizeText(person.personnelNo)} ${normalizeText(person.name)}`.includes(needle))
      || null;
  }, [availableRosterPeople]);
  const visibleEntryPeople = useMemo(() => {''',
    'available roster people',
)
once(
    '  const selectedTotal = useMemo(() => activeRosterPeople.reduce((sum, person) => sum + (selectedIds.has(person.id) ? (shift === "night" ? person.nightRate : person.dayRate) : 0), 0), [activeRosterPeople, selectedIds, shift]);\n',
    '',
    'remove unused selected total',
)

once(
    '  const saveFocused = async () => {',
    '''  const addRosterPerson = (person, target = "main") => {
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
  const addFromPool = () => addRosterPerson(resolveRosterChoice(poolAddQuery), "main");
  const addFromQuickPool = () => addRosterPerson(resolveRosterChoice(quickAddQuery), "quick");

  const saveFocused = async () => {''',
    'roster add remove actions',
)

once(
    '    try {\n      const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift });',
    '    try {\n      if (!rosterSaved) { await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...rosterIds] }); setRosterSaved(true); }\n      const rows = await getDailyFocusedRecords({ mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift });',
    'quick save roster first',
)

sub_once(
    r'  const loadLog = async \(\) => \{.*?\n  \};\n  const togglePeriodLock = async',
    '''  const loadLog = async (targetRange = logRange, shouldOpen = true) => {
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
  const togglePeriodLock = async''',
    'historical log loader',
)

sub_once(
    r'  const saveCard = async \(\) => \{.*?\n  \};\n  const deactivateCard',
    '''  const saveCard = async () => {
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
  const deactivateCard''',
    'new person adds to roster',
)

once(
    '<button type="button" onClick={() => setCardDialog({ ...EMPTY_PERSON })}><UserPlus size={15}/> Yeni Personel Ekle</button>',
    '<button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={15}/> Yeni Personel Ekle</button>',
    'top new person adds to roster',
)

sub_once(
    r'<aside className="kyop-panel kyop-pool">.*?</aside>\n\n          <main className="kyop-panel kyop-entry">',
    '''<aside className="kyop-panel kyop-pool"><div className="kyop-panel-head"><Users size={16}/> Personel Havuzu <b>{rosterIds.size}</b></div><div className="kyop-pool-add"><label className="kyop-search"><Search size={14}/><input list="kyop-roster-candidates" value={poolAddQuery} onChange={(e) => setPoolAddQuery(e.target.value)} placeholder="Listeye eklenecek personeli ara..."/></label><datalist id="kyop-roster-candidates">{availableRosterPeople.map((person) => <option key={person.id} value={person.personnelNo || person.name}>{person.name} · {person.role || "Vasıfsız"}</option>)}</datalist><button type="button" disabled={!poolAddQuery.trim()} onClick={addFromPool}><Plus size={14}/> Listeye Ekle</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={14}/> Yeni</button></div><div className="kyop-pool-list kyop-selected-roster">{activeRosterPeople.length ? activeRosterPeople.map((person) => <div key={person.id} className="kyop-roster-card"><span><strong>{person.personnelNo ? `${person.personnelNo} · ` : ""}{person.name}</strong><small>{person.role || "Vasıfsız"}</small><em>G: {money(person.dayRate)} · N: {money(person.nightRate)}</em></span><button type="button" title="Listeden çıkar" onClick={() => removeRosterPerson(person.id)}><X size={13}/></button></div>) : <Empty>Bu tarih aralığının havuzu boş. Personel arayıp “Listeye Ekle” ile doldurun.</Empty>}</div><button type="button" className="primary full" disabled={busy || rosterSaved} onClick={saveRoster}><Save size={15}/> {rosterSaved ? "Havuz Kayıtlı" : "Personel Havuzunu Kaydet"}</button></aside>

          <main className="kyop-panel kyop-entry">''',
    'main roster pool',
)

once(
    '<div className="quick-controls"><label className="gop-search"><Search size={14}/><input value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="Personel, kod veya vasıf ara"/></label><div className="quick-legend"><span className="sel-dot"/> Seçildi <span className="ok-dot"/> Kontrol edildi <span className="save-dot"/> Kayıtlı</div></div>',
    '''<div className="quick-controls"><label className="gop-search"><Search size={14}/><input value={quick.query} onChange={(e) => setQuick({ ...quick, query: e.target.value })} placeholder="Personel, kod veya vasıf ara"/></label><div className="quick-add-bar"><label className="gop-search"><Search size={14}/><input list="quick-roster-candidates" value={quickAddQuery} onChange={(e) => setQuickAddQuery(e.target.value)} placeholder="Listeye eklenecek personeli ara..."/></label><datalist id="quick-roster-candidates">{availableRosterPeople.map((person) => <option key={person.id} value={person.personnelNo || person.name}>{person.name} · {person.role || "Vasıfsız"}</option>)}</datalist><button type="button" disabled={!quickAddQuery.trim()} onClick={addFromQuickPool}><Plus size={13}/> Listeye Ekle</button><button type="button" onClick={() => { setCardAddToRoster(true); setCardDialog({ ...EMPTY_PERSON }); }}><UserPlus size={13}/> Yeni Personel</button></div><div className="quick-legend"><span className="sel-dot"/> Seçildi <span className="ok-dot"/> Kontrol edildi <span className="save-dot"/> Kayıtlı</div></div>''',
    'quick add roster controls',
)

once(
    '<p>{dateText(range.start)} — {dateText(range.end)}</p>',
    '<p>{dateText(logRange.start)} — {dateText(logRange.end)}</p>',
    'log header range',
)

once(
    '<div className="log-toolbar"><label>Personel / HKN<input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Personel veya HKN ara"/></label><label>İşlem<input value={logAction} onChange={(e) => setLogAction(e.target.value)} placeholder="İşlem ara"/></label><label>Vardiya<select value={logShift} onChange={(e) => setLogShift(e.target.value)}><option value="all">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option></select></label></div>',
    '''<div className="log-date-toolbar"><button type="button" onClick={() => moveLogWeek(-1)}>‹ Önceki Hafta</button><label>Başlangıç<input type="date" value={logRange.start} onChange={(e) => setLogRange({ ...logRange, start: e.target.value })}/></label><label>Bitiş<input type="date" value={logRange.end} onChange={(e) => setLogRange({ ...logRange, end: e.target.value })}/></label><button type="button" className="primary" onClick={searchLogRange}><Search size={14}/> Kayıt Ara</button><button type="button" onClick={() => moveLogWeek(1)}>Sonraki Hafta ›</button></div><div className="log-toolbar"><label>Personel / HKN<input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Personel veya HKN ara"/></label><label>İşlem<input value={logAction} onChange={(e) => setLogAction(e.target.value)} placeholder="İşlem ara"/></label><label>Vardiya<select value={logShift} onChange={(e) => setLogShift(e.target.value)}><option value="all">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option></select></label></div>''',
    'log date search toolbar',
)

once(
    '  const personControlRows = controlPerson ? attendance.filter((row) => rowEmployeeId(row) === controlPerson.id && rowDate(row) >= range.start && rowDate(row) <= range.end).sort((a, b) => rowDate(a).localeCompare(rowDate(b))) : [];',
    '  const personControlRows = controlPerson ? logAttendance.filter((row) => rowEmployeeId(row) === controlPerson.id && rowDate(row) >= logRange.start && rowDate(row) <= logRange.end).sort((a, b) => rowDate(a).localeCompare(rowDate(b))) : [];',
    'person control uses log range',
)

sub_once(
    r'  const visibleLogRows = logRows\.filter\(\(row\) => \{.*?\n  \}\);\n  const quickDirty',
    '''  const revisionEvents = logRevisions.map((row) => ({ ...row, action: row.action || row.changeType || "REVISION", createdAt: row.createdAt || row.timestamp }));
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
  const quickDirty''',
    'historical visible log rows',
)

once(
    '<div className="log-kpis"><Stat label="Dönem" value={`${days.length} gün`}/><Stat label="Aktif personel" value={rosterIds.size}/><Stat label="Toplam vardiya" value={rangeTotals.day + rangeTotals.night}/><Stat label="Toplam" value={money(rangeTotals.total)}/></div>',
    '<div className="log-kpis"><Stat label="Dönem" value={`${rangeDays(logRange.start, logRange.end).length} gün`}/><Stat label="Kayıtlı personel" value={logPeople}/><Stat label="Toplam vardiya" value={logTotals.day + logTotals.night}/><Stat label="Toplam" value={money(logTotals.total)}/></div>',
    'log kpis historical',
)

once(
    '{row.personName || row.employeeName || row.name || "Personel"}',
    '{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "Personel"}',
    'log employee fallback',
)
once(
    '{row.personName || row.employeeName || row.name || "-"}',
    '{row.personName || row.employeeName || row.name || employeeMap.get(rowEmployeeId(row))?.name || "-"}',
    'log search employee fallback',
)

once(
    '<button type="button" onClick={() => setCardDialog(null)}>Vazgeç</button>',
    '<button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}>Vazgeç</button>',
    'card cancel context',
)
once(
    '<button type="button" onClick={() => setCardDialog(null)}><X size={19}/></button>',
    '<button type="button" onClick={() => { setCardDialog(null); setCardAddToRoster(false); }}><X size={19}/></button>',
    'card close context',
)

# Guardrails: never reintroduce the 169-person auto-fill fallback.
for forbidden in [
    'setRosterIds(new Set(employees.filter((row) => row.active !== false).map((row) => row.id)))',
    'filteredEmployees.filter((p) => p.active).map((person) => <label',
]:
    if forbidden in src:
        raise SystemExit(f"forbidden daily fallback remains: {forbidden}")
for required in [
    'Listeye eklenecek personeli ara...',
    'addFromQuickPool',
    'getDailyRevisions',
    'log-date-toolbar',
    'historicalIds',
]:
    if required not in src:
        raise SystemExit(f"required final behavior missing: {required}")

PAGE.write_text(src, encoding="utf-8")

CSS.write_text(r'''
/* 29.09.2026 final daily operations corrections */
.kyop-pool-add{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:5px;padding:7px;border-bottom:1px solid #e5edf6}.kyop-pool-add>button,.quick-add-bar>button,.log-date-toolbar>button{min-height:31px;border:1px solid #cad6e6;border-radius:7px;background:#fff;color:#294764;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-size:8px;font-weight:900;cursor:pointer}.kyop-pool-add>button:disabled,.quick-add-bar>button:disabled{opacity:.42;cursor:not-allowed}.kyop-selected-roster{padding-top:7px}.kyop-roster-card{display:flex;align-items:flex-start;gap:6px;justify-content:space-between;margin-bottom:5px;padding:7px;border:1px solid #bfdbfe;border-radius:7px;background:#f7fbff}.kyop-roster-card>span{min-width:0}.kyop-roster-card strong,.kyop-roster-card small,.kyop-roster-card em{display:block}.kyop-roster-card strong{font-size:9px;color:#17385f}.kyop-roster-card small{font-size:7px;color:#64748b;margin-top:1px}.kyop-roster-card em{font-size:7px;color:#2563eb;font-style:normal;font-weight:800;margin-top:2px}.kyop-roster-card>button{width:24px;height:24px;border:1px solid #d7e2ef;border-radius:6px;background:#fff;color:#7b8fa6;display:grid;place-items:center;cursor:pointer}.kyop-pool .gop-empty{padding:18px 8px;font-size:9px}.quick-controls{display:grid!important;grid-template-columns:minmax(220px,.9fr) minmax(420px,1.5fr) auto!important;align-items:center!important}.quick-add-bar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:5px;align-items:center}.quick-add-bar .gop-search{width:100%;min-width:0}.quick-check-button{width:72px!important;min-width:72px!important;font-size:7px!important;line-height:1.05!important;white-space:normal!important;padding:0 3px!important}.quick-person{grid-template-columns:minmax(0,1fr) 72px!important}.quick-main-toggle{grid-template-columns:24px minmax(0,1fr) auto auto!important;min-height:43px!important}.quick-avatar{width:22px!important;height:22px!important;font-size:9px!important}.quick-person-text strong{font-size:8px!important}.quick-person-text small,.quick-main-toggle b,.quick-main-toggle em{font-size:7px!important}.log-date-toolbar{display:grid;grid-template-columns:auto 150px 150px auto auto;gap:6px;align-items:end;padding:9px 12px 0;background:#f7f9fc}.log-date-toolbar label{display:grid;gap:3px;color:#52677f;font-size:8px;font-weight:900}.log-date-toolbar input{height:32px;border:1px solid #d5deeb;border-radius:7px;padding:0 7px;background:#fff;color:#17324e}.log-date-toolbar button.primary{background:#2563eb;border-color:#2563eb;color:#fff}.gop-log-dialog .log-list article{min-height:52px}.gop-log-dialog .log-list article strong{font-size:9px}.gop-log-dialog .log-list article small,.gop-log-dialog .log-list article span{font-size:8px}@media(max-width:1100px){.quick-controls{grid-template-columns:1fr!important}.quick-add-bar{grid-template-columns:minmax(0,1fr) auto auto}.quick-legend{margin-left:0!important}.log-date-toolbar{grid-template-columns:1fr 1fr}.log-date-toolbar>button{min-width:0}}@media(max-width:650px){.kyop-pool-add,.quick-add-bar{grid-template-columns:1fr 1fr}.kyop-pool-add .kyop-search,.quick-add-bar .gop-search{grid-column:1/-1}.log-date-toolbar{grid-template-columns:1fr}.quick-person{grid-template-columns:minmax(0,1fr) 62px!important}.quick-check-button{width:62px!important;min-width:62px!important}}
'''.strip() + "\n", encoding="utf-8")

print("daily operations final restore patch applied")
