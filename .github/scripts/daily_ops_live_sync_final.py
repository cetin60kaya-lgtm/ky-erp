from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts"
SERVICE = ROOT / "APP/app/ky-erp-frontend/src/services/dailyOpsApi.js"
UI = ROOT / "APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[skip] {label} already applied")
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    print(f"[ok] {label}")
    return text.replace(old, new, 1)


# ---------------- API: persistent review/check + lightweight sync version ----------------
api = API.read_text(encoding="utf-8")

api = replace_once(
    api,
    '''      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_attendance_notes (\n        id TEXT PRIMARY KEY,\n        main_company_id TEXT NOT NULL,\n        employee_id TEXT NOT NULL,\n        work_date TEXT NOT NULL,\n        shift TEXT NOT NULL,\n        note TEXT NOT NULL DEFAULT '',\n        updated_at TEXT NOT NULL,\n        UNIQUE(main_company_id, employee_id, work_date, shift)\n      )`),''',
    '''      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_attendance_notes (\n        id TEXT PRIMARY KEY,\n        main_company_id TEXT NOT NULL,\n        employee_id TEXT NOT NULL,\n        work_date TEXT NOT NULL,\n        shift TEXT NOT NULL,\n        note TEXT NOT NULL DEFAULT '',\n        updated_at TEXT NOT NULL,\n        UNIQUE(main_company_id, employee_id, work_date, shift)\n      )`),\n      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_attendance_check (\n        id TEXT PRIMARY KEY,\n        main_company_id TEXT NOT NULL,\n        employee_id TEXT NOT NULL,\n        work_date TEXT NOT NULL,\n        shift TEXT NOT NULL,\n        checked INTEGER NOT NULL DEFAULT 0,\n        checked_by_user_id TEXT,\n        checked_by_label TEXT,\n        updated_at TEXT NOT NULL,\n        UNIQUE(main_company_id, employee_id, work_date, shift)\n      )`),''',
    "daily check table",
)

api = replace_once(
    api,
    '''      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_period_lock_range ON hr_daily_period_lock(main_company_id, status, start_date, end_date)",\n      ),''',
    '''      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_period_lock_range ON hr_daily_period_lock(main_company_id, status, start_date, end_date)",\n      ),\n      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_check_lookup ON hr_daily_attendance_check(main_company_id, work_date, shift, employee_id)",\n      ),''',
    "daily check index",
)

api = replace_once(
    api,
    '''        COALESCE(n.note,'') AS note,\n        n.updated_at AS note_updated_at\n      FROM hr_daily_employees e''',
    '''        COALESCE(n.note,'') AS note,\n        n.updated_at AS note_updated_at,\n        COALESCE(ch.checked,0) AS checked,\n        ch.updated_at AS checked_updated_at\n      FROM hr_daily_employees e''',
    "focused check select",
)

api = replace_once(
    api,
    '''      LEFT JOIN hr_daily_attendance_notes n\n        ON n.main_company_id=e.main_company_id\n       AND n.employee_id=e.id\n       AND n.work_date=?\n       AND n.shift=?\n      WHERE e.main_company_id=?\n      ORDER BY e.qualification ASC,e.full_name ASC,e.id ASC`)\n    .bind(date, date, shift, companyId)''',
    '''      LEFT JOIN hr_daily_attendance_notes n\n        ON n.main_company_id=e.main_company_id\n       AND n.employee_id=e.id\n       AND n.work_date=?\n       AND n.shift=?\n      LEFT JOIN hr_daily_attendance_check ch\n        ON ch.main_company_id=e.main_company_id\n       AND ch.employee_id=e.id\n       AND ch.work_date=?\n       AND ch.shift=?\n      WHERE e.main_company_id=?\n      ORDER BY e.qualification ASC,e.full_name ASC,e.id ASC`)\n    .bind(date, date, shift, date, shift, companyId)''',
    "focused check join",
)

api = replace_once(
    api,
    '''    note: text(row.note),\n    updatedAt: text(row.attendance_updated_at),\n    noteUpdatedAt: text(row.note_updated_at),''',
    '''    note: text(row.note),\n    checked: flag(row.checked),\n    updatedAt: text(row.attendance_updated_at),\n    noteUpdatedAt: text(row.note_updated_at),\n    checkedUpdatedAt: text(row.checked_updated_at),''',
    "focused check dto",
)

old_save_meta = '''  const statements: D1PreparedStatement[] = [];\n  const notesResult = employeeIds.length\n    ? await c.env.DB.prepare(`SELECT employee_id,note\n        FROM hr_daily_attendance_notes\n        WHERE main_company_id=? AND work_date=? AND shift=?\n          AND employee_id IN (${employeeIds.map(() => "?").join(",")})`)\n        .bind(companyId, date, shift, ...employeeIds)\n        .all<Row>()\n    : { results: [] as Row[] };\n  const noteByEmployee = new Map(\n    (notesResult.results || []).map((row) => [text(row.employee_id), text(row.note)]),\n  );\n\n  for (const entry of entries) {\n    const employeeId = text(entry.personelId || entry.employeeId);\n    const before = noteByEmployee.get(employeeId) || "";\n    const after = text(entry.note);\n    if (before === after) continue;\n\n    statements.push(\n      c.env.DB.prepare(`INSERT INTO hr_daily_attendance_notes\n        (id,main_company_id,employee_id,work_date,shift,note,updated_at)\n        VALUES (?,?,?,?,?,?,?)\n        ON CONFLICT(main_company_id,employee_id,work_date,shift)\n        DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(\n        crypto.randomUUID(),\n        companyId,\n        employeeId,\n        date,\n        shift,\n        after,\n        nowIso(),\n      ),\n    );\n    statements.push(\n      auditStmt(c, {\n        companyId,\n        employeeId,\n        workDate: date,\n        shift,\n        action: "NOTE_UPDATE",\n        before: { note: before },\n        after: { note: after },\n        actor,\n        note: after,\n        source: "KYERP_DAILY_ENTRY_V3",\n      }),\n    );\n  }'''

new_save_meta = '''  const statements: D1PreparedStatement[] = [];\n  const notesResult = employeeIds.length\n    ? await c.env.DB.prepare(`SELECT employee_id,note\n        FROM hr_daily_attendance_notes\n        WHERE main_company_id=? AND work_date=? AND shift=?\n          AND employee_id IN (${employeeIds.map(() => "?").join(",")})`)\n        .bind(companyId, date, shift, ...employeeIds)\n        .all<Row>()\n    : { results: [] as Row[] };\n  const checksResult = employeeIds.length\n    ? await c.env.DB.prepare(`SELECT employee_id,checked\n        FROM hr_daily_attendance_check\n        WHERE main_company_id=? AND work_date=? AND shift=?\n          AND employee_id IN (${employeeIds.map(() => "?").join(",")})`)\n        .bind(companyId, date, shift, ...employeeIds)\n        .all<Row>()\n    : { results: [] as Row[] };\n  const noteByEmployee = new Map(\n    (notesResult.results || []).map((row) => [text(row.employee_id), text(row.note)]),\n  );\n  const checkedByEmployee = new Map(\n    (checksResult.results || []).map((row) => [text(row.employee_id), flag(row.checked)]),\n  );\n\n  for (const entry of entries) {\n    const employeeId = text(entry.personelId || entry.employeeId);\n    const noteBefore = noteByEmployee.get(employeeId) || "";\n    const noteAfter = text(entry.note);\n    if (noteBefore !== noteAfter) {\n      statements.push(\n        c.env.DB.prepare(`INSERT INTO hr_daily_attendance_notes\n          (id,main_company_id,employee_id,work_date,shift,note,updated_at)\n          VALUES (?,?,?,?,?,?,?)\n          ON CONFLICT(main_company_id,employee_id,work_date,shift)\n          DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(\n          crypto.randomUUID(),\n          companyId,\n          employeeId,\n          date,\n          shift,\n          noteAfter,\n          nowIso(),\n        ),\n      );\n      statements.push(\n        auditStmt(c, {\n          companyId,\n          employeeId,\n          workDate: date,\n          shift,\n          action: "NOTE_UPDATE",\n          before: { note: noteBefore },\n          after: { note: noteAfter },\n          actor,\n          note: noteAfter,\n          source: "KYERP_DAILY_ENTRY_V3",\n        }),\n      );\n    }\n\n    const status = text(entry.status).toUpperCase().replace(/İ/g, "I");\n    const selected = !["REMOVE", "PASSIVE", "INACTIVE", "DELETE"].includes(status);\n    const checkBefore = checkedByEmployee.get(employeeId) === true;\n    const checkAfter = selected && (entry.checked === undefined ? checkBefore : flag(entry.checked));\n    if (checkBefore !== checkAfter) {\n      const timestamp = nowIso();\n      statements.push(\n        c.env.DB.prepare(`INSERT INTO hr_daily_attendance_check\n          (id,main_company_id,employee_id,work_date,shift,checked,checked_by_user_id,checked_by_label,updated_at)\n          VALUES (?,?,?,?,?,?,?,?,?)\n          ON CONFLICT(main_company_id,employee_id,work_date,shift)\n          DO UPDATE SET checked=excluded.checked,checked_by_user_id=excluded.checked_by_user_id,checked_by_label=excluded.checked_by_label,updated_at=excluded.updated_at`).bind(\n          crypto.randomUUID(),\n          companyId,\n          employeeId,\n          date,\n          shift,\n          checkAfter ? 1 : 0,\n          actor.id || null,\n          actor.label,\n          timestamp,\n        ),\n      );\n      statements.push(\n        auditStmt(c, {\n          companyId,\n          employeeId,\n          workDate: date,\n          shift,\n          action: "ATTENDANCE_CHECK_UPDATE",\n          before: { checked: checkBefore },\n          after: { checked: checkAfter },\n          actor,\n          source: "KYERP_DAILY_CHECK_V1",\n        }),\n      );\n    }\n  }'''
api = replace_once(api, old_save_meta, new_save_meta, "persist focused review state")

sync_fn = '''\nasync function syncState(c: Context<AppEnv>) {\n  await ensureSchema(c);\n  const companyId = companyIdOf(c);\n  const [attendanceVersion, employeeVersion, auditVersion, checkVersion] = await Promise.all([\n    c.env.DB.prepare(`SELECT COALESCE(MAX(a.updated_at),'') AS version\n        FROM hr_daily_attendance a\n        JOIN hr_daily_employees e ON e.id=a.employee_id\n        WHERE e.main_company_id=?`).bind(companyId).first<Row>(),\n    c.env.DB.prepare("SELECT COALESCE(MAX(updated_at),'') AS version FROM hr_daily_employees WHERE main_company_id=?")\n      .bind(companyId).first<Row>(),\n    c.env.DB.prepare("SELECT COALESCE(MAX(created_at),'') AS version FROM hr_daily_operation_audit WHERE main_company_id=?")\n      .bind(companyId).first<Row>(),\n    c.env.DB.prepare("SELECT COALESCE(MAX(updated_at),'') AS version FROM hr_daily_attendance_check WHERE main_company_id=?")\n      .bind(companyId).first<Row>(),\n  ]);\n  const version = [\n    text(attendanceVersion?.version),\n    text(employeeVersion?.version),\n    text(auditVersion?.version),\n    text(checkVersion?.version),\n  ].join("|");\n  return ok(c, { mainCompanyId: companyId, version, serverTime: nowIso() });\n}\n'''
api = replace_once(api, '\nfunction protect(fn: (c: Context<AppEnv>) => Promise<Response>) {', sync_fn + '\nfunction protect(fn: (c: Context<AppEnv>) => Promise<Response>) {', "sync state endpoint function")
api = replace_once(api, 'export function registerGunlukOperasyonRoutes(app: Hono<AppEnv>) {\n  app.get("/api/gunluk-operasyon/employees", protect(listEmployees));', 'export function registerGunlukOperasyonRoutes(app: Hono<AppEnv>) {\n  app.get("/api/gunluk-operasyon/sync-state", protect(syncState));\n  app.get("/api/gunluk-operasyon/employees", protect(listEmployees));', "sync state route")

API.write_text(api, encoding="utf-8")


# ---------------- Frontend API: Daily Ops GETs always fresh ----------------
service = SERVICE.read_text(encoding="utf-8")
service = replace_once(
    service,
    'const ROOT = "/gunluk-operasyon";',
    'const ROOT = "/gunluk-operasyon";\nconst freshOptions = (options = {}) => ({ ...options, forceFresh: options.forceFresh !== false });',
    "fresh daily GET options",
)

for name, path in [
    ("getDailyEmployees", "employees"),
    ("getDailyAttendance", "attendance"),
    ("getDailyWeeklySummary", "attendance/weekly-summary"),
    ("getDailyPaymentSlips", "attendance/payment-slips"),
    ("getDailyFocusedRecords", "records"),
    ("getDailyRoster", "roster"),
    ("getDailyAudit", "audit"),
    ("getDailyRevisions", "revisions"),
    ("getDailyPeriodLock", "period-lock"),
]:
    old = f'''export async function {name}(params = {{}}, options = {{}}) {{\n  return unwrap(await apiGet(`${{ROOT}}/{path}`, params, options));\n}}'''
    new = f'''export async function {name}(params = {{}}, options = {{}}) {{\n  return unwrap(await apiGet(`${{ROOT}}/{path}`, params, freshOptions(options)));\n}}'''
    service = replace_once(service, old, new, f"fresh {name}")

service = replace_once(
    service,
    '''export async function getDailyEmployees(params = {}, options = {}) {\n  return unwrap(await apiGet(`${ROOT}/employees`, params, freshOptions(options)));\n}''',
    '''export async function getDailySyncState(params = {}, options = {}) {\n  return unwrap(await apiGet(`${ROOT}/sync-state`, params, freshOptions(options)));\n}\n\nexport async function getDailyEmployees(params = {}, options = {}) {\n  return unwrap(await apiGet(`${ROOT}/employees`, params, freshOptions(options)));\n}''',
    "daily sync service",
)
SERVICE.write_text(service, encoding="utf-8")


# ---------------- UI: live polling + persistent checked state ----------------
ui = UI.read_text(encoding="utf-8")
ui = replace_once(ui, 'import React, { useCallback, useEffect, useMemo, useState } from "react";', 'import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";', "useRef import")
ui = replace_once(ui, '  getDailyRoster,\n  getDailyRevisions,', '  getDailyRoster,\n  getDailyRevisions,\n  getDailySyncState,', "sync service import")
ui = replace_once(ui, 'const RANGE_KEY = "kyerp.dailyOperations.range.v5";', 'const RANGE_KEY = "kyerp.dailyOperations.range.v5";\nconst LIVE_SYNC_INTERVAL_MS = 1500;', "live sync interval")
ui = replace_once(ui, 'function focusedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.selected || normalizeText(row.status) === "ACTIVE").map(rowEmployeeId).filter(Boolean)); }', 'function focusedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.selected || normalizeText(row.status) === "ACTIVE").map(rowEmployeeId).filter(Boolean)); }\nfunction focusedCheckedIds(rows = []) { return new Set((Array.isArray(rows) ? rows : []).filter((row) => row?.checked === true || row?.checked === 1 || row?.checked === "1").map(rowEmployeeId).filter(Boolean)); }', "checked ids helper")
ui = replace_once(ui, '  const [selectedIds, setSelectedIds] = useState(() => new Set());\n  const [notes, setNotes] = useState({});', '  const [selectedIds, setSelectedIds] = useState(() => new Set());\n  const [checkedIds, setCheckedIds] = useState(() => new Set());\n  const [notes, setNotes] = useState({});', "main checked state")
ui = replace_once(ui, '  const [dialogSizes, setDialogSizes] = useState(readDialogSizes);', '  const [dialogSizes, setDialogSizes] = useState(readDialogSizes);\n  const liveVersionRef = useRef("");\n  const livePollBusyRef = useRef(false);', "live refs")
ui = replace_once(ui, '      setRecords(focusedRows); setSelectedIds(focusedIds(focusedRows));\n      setNotes(', '      setRecords(focusedRows); setSelectedIds(focusedIds(focusedRows)); setCheckedIds(focusedCheckedIds(focusedRows));\n      setNotes(', "load main checked state")
ui = replace_once(ui, '    setSelectedIds((current) => { const next = new Set(current); next.delete(personId); return next; });\n    setRosterSaved(false);', '    setSelectedIds((current) => { const next = new Set(current); next.delete(personId); return next; });\n    setCheckedIds((current) => { const next = new Set(current); next.delete(personId); return next; });\n    setRosterSaved(false);', "roster remove clears checked")
ui = replace_once(ui, 'status: selectedIds.has(person.id) ? "ACTIVE" : "REMOVE", expectedUpdatedAt:', 'status: selectedIds.has(person.id) ? "ACTIVE" : "REMOVE", checked: selectedIds.has(person.id) && checkedIds.has(person.id), expectedUpdatedAt:', "main save checked")
ui = replace_once(ui, '  const clearAll = () => setSelectedIds(new Set());', '  const clearAll = () => { setSelectedIds(new Set()); setCheckedIds(new Set()); };', "clear checked with selection")
ui = replace_once(ui, '    const ids = focusedIds(rows);\n    setQuick({ date, shift: mode, ids, baseline: new Set(ids), checked: new Set(), query: preserveQuery });', '    const ids = focusedIds(rows);\n    const checked = focusedCheckedIds(rows);\n    setQuick({ date, shift: mode, ids, baseline: new Set(ids), checked, checkedBaseline: new Set(checked), query: preserveQuery });', "quick loads persisted checks")
ui = replace_once(ui, 'status: snapshot.ids.has(person.id) ? "ACTIVE" : "REMOVE", expectedUpdatedAt:', 'status: snapshot.ids.has(person.id) ? "ACTIVE" : "REMOVE", checked: snapshot.ids.has(person.id) && snapshot.checked.has(person.id), expectedUpdatedAt:', "quick save checked")
ui = replace_once(ui, '  const quickDirty = quick ? !sameSet(quick.ids, quick.baseline) : false;', '  const quickDirty = quick ? !sameSet(quick.ids, quick.baseline) || !sameSet(quick.checked, quick.checkedBaseline || new Set()) : false;\n  const checkedSelectedCount = [...checkedIds].filter((id) => selectedIds.has(id)).length;', "quick/main dirty checked")

old_row = '''...people.map((person) => { const checked = selectedIds.has(person.id); const blocked = shift === "night" && person.nightRate <= 0; return <tr key={person.id} className={checked ? "selected" : ""}><td><div className="kyop-person-cell"><div><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small><em>{checked ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em></div><span className={`kyop-row-shift ${shift}`}>{shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div></td><td>{person.role || "-"}</td><td>{dateText(selectedDate, true)}</td><td>{money(person.dayRate)}</td><td>{person.nightRate > 0 ? money(person.nightRate) : "-"}</td><td><input value={notes[person.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [person.id]: e.target.value }))} placeholder="Not"/></td><td><div className="kyop-row-actions"><button type="button" title={checked ? "Seçimi kaldır" : "Seç"} disabled={blocked || periodLocked} className={checked ? "selected" : ""} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}><CheckCircle2 size={14}/></button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title="Bu vardiyadan kaldır" disabled={!checked || periodLocked} onClick={() => setSelectedIds((current) => { const next = new Set(current); next.delete(person.id); return next; })}><Trash2 size={14}/></button></div></td></tr>; })'''
new_row = '''...people.map((person) => { const selected = selectedIds.has(person.id); const reviewed = checkedIds.has(person.id); const blocked = shift === "night" && person.nightRate <= 0; return <tr key={person.id} className={`${selected ? "selected" : ""} ${reviewed ? "checked" : ""}`}><td><div className="kyop-person-cell"><div><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"}</small><em>{reviewed ? "✓ Kontrol Edildi" : selected ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em></div><span className={`kyop-row-shift ${shift}`}>{shift === "day" ? "GÜNDÜZ" : "GECE"}</span></div></td><td>{person.role || "-"}</td><td>{dateText(selectedDate, true)}</td><td>{money(person.dayRate)}</td><td>{person.nightRate > 0 ? money(person.nightRate) : "-"}</td><td><input value={notes[person.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [person.id]: e.target.value }))} placeholder="Not"/></td><td><div className="kyop-row-actions"><button type="button" title={selected ? "Seçimi kaldır" : "Seç"} disabled={blocked || periodLocked} className={selected ? "selected" : ""} onClick={() => { setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; }); if (selected) setCheckedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); }}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked} className={reviewed ? "selected" : ""} onClick={() => setCheckedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}>✓</button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title="Bu vardiyadan kaldır" disabled={!selected || periodLocked} onClick={() => { setSelectedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); setCheckedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); }}><Trash2 size={14}/></button></div></td></tr>; })'''
ui = replace_once(ui, old_row, new_row, "main control button")

ui = replace_once(
    ui,
    '<div className="kyop-control-highlight cyan"><span>Kontrol Edilen / Toplam</span><strong>0 / {selectedIds.size}</strong><small>{selectedIds.size} kayıt kontrol bekliyor</small></div>',
    '<div className="kyop-control-highlight cyan"><span>Kontrol Edilen / Toplam</span><strong>{checkedSelectedCount} / {selectedIds.size}</strong><small>{Math.max(selectedIds.size - checkedSelectedCount, 0)} kayıt kontrol bekliyor</small></div>',
    "main checked KPI",
)

live_effect = '''\n  useEffect(() => {\n    liveVersionRef.current = "";\n  }, [companyId]);\n\n  useEffect(() => {\n    if (!companyId) return undefined;\n    let cancelled = false;\n\n    const refreshQuick = async () => {\n      if (!quick) return;\n      const snapshot = quick;\n      const rows = await getDailyFocusedRecords(\n        { mainCompanyId: companyId, date: snapshot.date, shift: snapshot.shift },\n        { forceFresh: true },\n      );\n      const ids = focusedIds(rows);\n      const checked = focusedCheckedIds(rows);\n      if (cancelled) return;\n      setQuick((current) => {\n        if (!current || current.date !== snapshot.date || current.shift !== snapshot.shift) return current;\n        return { ...current, ids, baseline: new Set(ids), checked, checkedBaseline: new Set(checked) };\n      });\n    };\n\n    const refreshVisibleView = async () => {\n      if (view === "daily-entry") {\n        await Promise.all([loadEmployees(), loadRangeData(), loadFocused(), refreshQuick()]);\n      } else if (view === "daily-cards") {\n        await loadEmployees();\n      } else if (view === "daily-weekly") {\n        await loadWeekly();\n      } else if (view === "daily-payments") {\n        await loadPayments();\n      }\n    };\n\n    const poll = async () => {\n      if (cancelled || livePollBusyRef.current) return;\n      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;\n      livePollBusyRef.current = true;\n      try {\n        const state = await getDailySyncState({ mainCompanyId: companyId }, { forceFresh: true, timeoutMs: 5000 });\n        const version = String(state?.version || "");\n        if (!version) return;\n        if (!liveVersionRef.current) { liveVersionRef.current = version; return; }\n        if (version === liveVersionRef.current) return;\n\n        const serverSelected = focusedIds(records);\n        const serverChecked = focusedCheckedIds(records);\n        const noteDirty = view === "daily-entry" && activeRosterPeople.some((person) => String(notes[person.id] || "") !== String(recordByEmployee.get(person.id)?.note || ""));\n        const mainDirty = view === "daily-entry" && (!rosterSaved || !sameSet(selectedIds, serverSelected) || !sameSet(checkedIds, serverChecked) || noteDirty);\n        const quickHasDirty = quick ? !sameSet(quick.ids, quick.baseline) || !sameSet(quick.checked, quick.checkedBaseline || new Set()) : false;\n        if (busy || mainDirty || quickHasDirty) {\n          if (!cancelled) setNotice((current) => current || "Başka bilgisayarda yeni kayıt var. Yerel değişiklik kaydedilince otomatik eşitlenecek.");\n          return;\n        }\n\n        await refreshVisibleView();\n        if (!cancelled) {\n          liveVersionRef.current = version;\n          setNotice("Canlı senkron: başka bilgisayardaki değişiklikler alındı.");\n        }\n      } catch {\n        // Canlı senkron yardımcı katmandır; geçici bağlantı hatası ana günlük işlemi durdurmaz.\n      } finally {\n        livePollBusyRef.current = false;\n      }\n    };\n\n    const timer = window.setInterval(() => { void poll(); }, LIVE_SYNC_INTERVAL_MS);\n    const onFocus = () => { void poll(); };\n    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };\n    window.addEventListener("focus", onFocus);\n    document.addEventListener("visibilitychange", onVisibility);\n    void poll();\n\n    return () => {\n      cancelled = true;\n      window.clearInterval(timer);\n      window.removeEventListener("focus", onFocus);\n      document.removeEventListener("visibilitychange", onVisibility);\n    };\n  }, [activeRosterPeople, busy, checkedIds, companyId, loadEmployees, loadFocused, loadPayments, loadRangeData, loadWeekly, notes, quick, recordByEmployee, records, rosterSaved, selectedIds, view]);\n'''
ui = replace_once(ui, '\n  if (!companyId) return <div className="content-card module-error-card"><h3>Günlük Operasyon için firma seçin</h3><p>Günlük personel ve ödeme kayıtları firma bazında tutulur.</p></div>;', live_effect + '\n  if (!companyId) return <div className="content-card module-error-card"><h3>Günlük Operasyon için firma seçin</h3><p>Günlük personel ve ödeme kayıtları firma bazında tutulur.</p></div>;', "live sync polling effect")

UI.write_text(ui, encoding="utf-8")

print("Daily Operations live-sync + persistent review patch completed.")
