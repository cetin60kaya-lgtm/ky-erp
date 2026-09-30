from pathlib import Path

FE = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
API = Path('APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts')

fe = FE.read_text(encoding='utf-8')
api = API.read_text(encoding='utf-8')

old_visible = '''  const visibleEntryPeople = useMemo(() => {\n    const needle = query.trim().toLocaleLowerCase("tr-TR");\n    return activeRosterPeople.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));\n  }, [activeRosterPeople, query]);'''
new_visible = '''  const visibleEntryPeople = useMemo(() => {\n    const needle = query.trim().toLocaleLowerCase("tr-TR");\n    return employees\n      .filter((person) => person.active !== false && selectedIds.has(person.id))\n      .filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));\n  }, [employees, query, selectedIds]);'''
if old_visible not in fe:
    raise SystemExit('visibleEntryPeople anchor not found')
fe = fe.replace(old_visible, new_visible, 1)

anchor_effect = '''  const recordByEmployee = useMemo(() => new Map(records.map((row) => [rowEmployeeId(row), row])), [records]);\n'''
insert_effect = '''  const recordByEmployee = useMemo(() => new Map(records.map((row) => [rowEmployeeId(row), row])), [records]);\n  useEffect(() => {\n    setCheckedIds((current) => {\n      const next = new Set([...current].filter((id) => selectedIds.has(id)));\n      return sameSet(current, next) ? current : next;\n    });\n  }, [selectedIds]);\n'''
if anchor_effect not in fe:
    raise SystemExit('checked invariant anchor not found')
fe = fe.replace(anchor_effect, insert_effect, 1)

anchor_review = '''  const addFromQuickPool = () => addRosterPerson(resolveRosterChoice(quickAddQuery), "quick");\n'''
review_helper = '''  const setPersonReviewed = async (person, nextChecked) => {\n    if (!person?.id || busy || periodLocked || !selectedIds.has(person.id)) return;\n    const currentRecord = recordByEmployee.get(person.id) || {};\n    setBusy(true); setError(""); setNotice("");\n    try {\n      await saveDailyFocusedRecords({\n        mainCompanyId: companyId,\n        date: selectedDate,\n        shift,\n        personnelEntries: [{\n          personelId: person.id,\n          status: "ACTIVE",\n          checked: Boolean(nextChecked),\n          expectedUpdatedAt: currentRecord.updatedAt || currentRecord.attendanceUpdatedAt || "",\n          note: notes[person.id] || "",\n        }],\n      });\n      await Promise.all([loadFocused(), loadRangeData()]);\n      setNotice(`${person.name} kontrol durumu ${nextChecked ? "onaylandı" : "kaldırıldı"}.`);\n    } catch (e) {\n      setError(e?.message || "Kontrol durumu güncellenemedi. Ekranı yenileyip tekrar deneyin.");\n    } finally {\n      setBusy(false);\n    }\n  };\n\n  const addFromQuickPool = () => addRosterPerson(resolveRosterChoice(quickAddQuery), "quick");\n'''
if anchor_review not in fe:
    raise SystemExit('review helper anchor not found')
fe = fe.replace(anchor_review, review_helper, 1)

old_actions = '''<button type="button" title={selected ? "Seçimi kaldır" : "Seç"} disabled={blocked || periodLocked} className={selected ? "selected" : ""} onClick={() => { setSelectedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; }); if (selected) setCheckedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); }}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked} className={reviewed ? "selected" : ""} onClick={() => setCheckedIds((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })}>✓</button>'''
new_actions = '''<button type="button" title="Gün seçimini kaldır" disabled={blocked || periodLocked || busy} className={selected ? "selected" : ""} onClick={() => deleteShiftAndCleanupRoster(person)}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked || busy} className={reviewed ? "selected" : ""} onClick={() => setPersonReviewed(person, !reviewed)}>✓</button>'''
if old_actions not in fe:
    raise SystemExit('row action anchor not found')
fe = fe.replace(old_actions, new_actions, 1)

old_empty = '<Empty>Dönem havuzunda personel yok.</Empty>'
new_empty = '<Empty>Seçili gün ve vardiyada personel yok. Soldaki listeden personel ekleyin.</Empty>'
if old_empty not in fe:
    raise SystemExit('entry empty text anchor not found')
fe = fe.replace(old_empty, new_empty, 1)

old_summary = '''<div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(activeRosterPeople.length - selectedIds.size, 0)}</strong><small>{activeRosterPeople.length} aktif personel</small></div>'''
new_summary = '''<div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(employees.filter((person) => person.active !== false).length - selectedIds.size, 0)}</strong><small>{employees.filter((person) => person.active !== false).length} aktif personel</small></div>'''
if old_summary not in fe:
    raise SystemExit('control summary anchor not found')
fe = fe.replace(old_summary, new_summary, 1)

old_daily_money = '''G {money(activeRosterPeople.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.dayRate : 0), 0))} · N {money(activeRosterPeople.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.nightRate : 0), 0))}'''
new_daily_money = '''G {money(employees.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.dayRate : 0), 0))} · N {money(employees.reduce((sum, p) => sum + (selectedIds.has(p.id) ? p.nightRate : 0), 0))}'''
if old_daily_money not in fe:
    raise SystemExit('daily money anchor not found')
fe = fe.replace(old_daily_money, new_daily_money, 1)

old_checked = '    checked: flag(row.checked),\n'
new_checked = '    checked: (shift === "day" ? flag(row.day_shift) : flag(row.night_shift)) && flag(row.checked),\n'
if old_checked not in api:
    raise SystemExit('focused checked anchor not found')
api = api.replace(old_checked, new_checked, 1)

trigger_anchor = '''      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_roster_insert\n        AFTER INSERT ON hr_daily_range_roster\n'''
trigger_insert = '''      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_check_clear_day\n        AFTER UPDATE OF day_shift ON hr_daily_attendance\n        WHEN OLD.day_shift=1 AND NEW.day_shift=0\n        BEGIN\n          UPDATE hr_daily_attendance_check\n          SET checked=0,updated_at=CURRENT_TIMESTAMP\n          WHERE employee_id=NEW.employee_id AND work_date=NEW.work_date AND shift='day' AND checked<>0;\n        END`),\n      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_check_clear_night\n        AFTER UPDATE OF night_shift ON hr_daily_attendance\n        WHEN OLD.night_shift=1 AND NEW.night_shift=0\n        BEGIN\n          UPDATE hr_daily_attendance_check\n          SET checked=0,updated_at=CURRENT_TIMESTAMP\n          WHERE employee_id=NEW.employee_id AND work_date=NEW.work_date AND shift='night' AND checked<>0;\n        END`),\n      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_roster_insert\n        AFTER INSERT ON hr_daily_range_roster\n'''
if trigger_anchor not in api:
    raise SystemExit('trigger insertion anchor not found')
api = api.replace(trigger_anchor, trigger_insert, 1)

# Safety assertions
assert 'checked: (shift === "day" ? flag(row.day_shift) : flag(row.night_shift)) && flag(row.checked)' in api
assert 'trg_daily_check_clear_day' in api and 'trg_daily_check_clear_night' in api
assert 'setPersonReviewed(person, !reviewed)' in fe
assert 'onClick={() => deleteShiftAndCleanupRoster(person)}><CheckCircle2' in fe
assert 'employees.filter((person) => person.active !== false && selectedIds.has(person.id))' in fe

FE.write_text(fe, encoding='utf-8')
API.write_text(api, encoding='utf-8')
print('daily entry consistency patch applied')
