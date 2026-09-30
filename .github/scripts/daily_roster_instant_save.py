from pathlib import Path

p = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
s = p.read_text(encoding='utf-8')

# 1) Selected day/shift activation: persist roster from fresh server state, then persist attendance immediately.
if 'const activatePersonForSelectedShift = async (person)' not in s:
    marker = '  const deleteShiftAndCleanupRoster = async (person) => {'
    idx = s.find(marker)
    if idx < 0:
        raise SystemExit('delete handler anchor not found')
    handler = '''  const activatePersonForSelectedShift = async (person) => {\n    if (!person?.id || busy || periodLocked) return;\n    setBusy(true); setError(\"\"); setNotice(\"\");\n    try {\n      const serverRoster = await getDailyRoster({\n        mainCompanyId: companyId,\n        startDate: range.start,\n        endDate: range.end,\n      });\n      const serverRosterIds = Array.isArray(serverRoster?.employeeIds)\n        ? serverRoster.employeeIds.map(String)\n        : Array.isArray(serverRoster)\n          ? serverRoster.map(String)\n          : [...rosterIds];\n      const nextRosterIds = new Set(serverRosterIds);\n      nextRosterIds.add(person.id);\n      const savedRoster = await saveDailyRoster({\n        mainCompanyId: companyId,\n        startDate: range.start,\n        endDate: range.end,\n        employeeIds: [...nextRosterIds],\n      });\n      const finalRosterIds = new Set(\n        Array.isArray(savedRoster?.employeeIds)\n          ? savedRoster.employeeIds.map(String)\n          : [...nextRosterIds],\n      );\n      setRosterIds(finalRosterIds);\n      setRosterSaved(true);\n\n      const currentRecord = recordByEmployee.get(person.id) || {};\n      await saveDailyFocusedRecords({\n        mainCompanyId: companyId,\n        date: selectedDate,\n        shift,\n        personnelEntries: [{\n          personelId: person.id,\n          status: \"ACTIVE\",\n          checked: false,\n          expectedUpdatedAt: currentRecord.updatedAt || currentRecord.attendanceUpdatedAt || \"\",\n          note: notes[person.id] || \"\",\n        }],\n      });\n\n      setSelectedIds((current) => { const next = new Set(current); next.add(person.id); return next; });\n      await Promise.all([loadFocused(), loadRangeData()]);\n      setNotice(`${person.name} ${shift === \"day\" ? \"gündüz\" : \"gece\"} vardiyasına eklendi.`);\n    } catch (e) {\n      setError(e?.message || \"Personel seçili vardiyaya eklenemedi.\");\n    } finally {\n      setBusy(false);\n    }\n  };\n\n'''
    s = s[:idx] + handler + s[idx:]

# 2) Delete cleanup must also start from fresh server roster to preserve another PC's current roster.
old_delete_roster = '''      const requestedRosterIds = [...rosterIds].filter((id) => id !== person.id);\n      const savedRoster = await saveDailyRoster({'''
new_delete_roster = '''      const serverRoster = await getDailyRoster({\n        mainCompanyId: companyId,\n        startDate: range.start,\n        endDate: range.end,\n      });\n      const serverRosterIds = Array.isArray(serverRoster?.employeeIds)\n        ? serverRoster.employeeIds.map(String)\n        : Array.isArray(serverRoster)\n          ? serverRoster.map(String)\n          : [...rosterIds];\n      const requestedRosterIds = serverRosterIds.filter((id) => id !== person.id);\n      const savedRoster = await saveDailyRoster({'''
if old_delete_roster in s:
    s = s.replace(old_delete_roster, new_delete_roster, 1)
elif 'const requestedRosterIds = serverRosterIds.filter((id) => id !== person.id);' not in s:
    raise SystemExit('delete roster block not found')

# 3) Left list always shows all active employees. Its selected state is CURRENT day/current shift only.
old_intro = 'const inRoster = rosterIds.has(person.id); const hasWork = selectedIds.has(person.id); return <label key={person.id} className={inRoster ? "included" : ""}>'
new_intro = 'const hasWork = selectedIds.has(person.id); return <label key={person.id} className={hasWork ? "included" : ""}>'
if old_intro in s:
    s = s.replace(old_intro, new_intro, 1)
elif new_intro not in s:
    raise SystemExit('pool row intro not found')

old_checkbox = '<input type="checkbox" checked={inRoster} onChange={() => inRoster ? removeRosterPerson(person.id) : addRosterPerson(person, "main")}/>'
new_checkbox = '<input type="checkbox" checked={hasWork} disabled={busy || periodLocked} onChange={() => hasWork ? deleteShiftAndCleanupRoster(person) : activatePersonForSelectedShift(person)}/>'
if old_checkbox in s:
    s = s.replace(old_checkbox, new_checkbox, 1)
elif new_checkbox not in s:
    raise SystemExit('pool checkbox not found')

old_status = '{hasWork ? `${shift === "day" ? "Gündüz" : "Gece"} seçili` : inRoster ? "Havuzda" : "Havuza ekle"}'
new_status = '{hasWork ? `${shift === "day" ? "Gündüz" : "Gece"} seçili` : "Havuza ekle"}'
if old_status in s:
    s = s.replace(old_status, new_status, 1)
elif new_status not in s:
    raise SystemExit('pool status not found')

# 4) Counter also represents the selected day/shift, not hidden date-range roster membership.
old_count = 'Personel Havuzu <b>{rosterIds.size} / {employees.filter((person) => person.active !== false).length}</b>'
new_count = 'Personel Havuzu <b>{selectedIds.size} / {employees.filter((person) => person.active !== false).length}</b>'
if old_count in s:
    s = s.replace(old_count, new_count, 1)
elif new_count not in s:
    raise SystemExit('pool counter not found')

# 5) Keep the existing helper referenced, but the UI no longer requires a second manual save.
old_save_button = '<button type="button" className="kyop-roster-save" disabled={busy || rosterSaved} onClick={saveRoster}><Save size={14}/> Personel Havuzu Kaydet ({rosterIds.size})</button>'
new_save_button = '<button type="button" className="kyop-roster-save" disabled onClick={saveRoster}><CheckCircle2 size={14}/> Seçili vardiya otomatik kaydedilir</button>'
if old_save_button in s:
    s = s.replace(old_save_button, new_save_button, 1)
elif new_save_button not in s:
    raise SystemExit('pool save button not found')

# 6) Old local-only remove helper becomes unused after switching the checkbox to persisted current-shift actions.
if s.count('removeRosterPerson(') == 1:
    start = s.find('  const removeRosterPerson = (personId) => {')
    if start < 0:
        raise SystemExit('removeRosterPerson definition not found')
    end = s.find('\n  };', start)
    if end < 0:
        raise SystemExit('removeRosterPerson definition end not found')
    s = s[:start] + s[end + len('\n  };'):]

# 7) Clarify delete notices to separate date-range membership from current shift state.
s = s.replace('tarih aralığında başka kaydı olduğu için havuzda kaldı.', 'tarih aralığında başka kaydı olduğu için tarih aralığı listesinde kaldı.')
s = s.replace('tarih aralığında başka kaydı olmadığı için havuzdan da çıkarıldı.', 'tarih aralığında başka kaydı olmadığı için tarih aralığı listesinden de çıkarıldı.')

# Safety assertions: exactly one immediate activation path and no stale "Havuzda" current-row logic.
assert s.count('const activatePersonForSelectedShift = async (person)') == 1
assert s.count('onChange={() => hasWork ? deleteShiftAndCleanupRoster(person) : activatePersonForSelectedShift(person)}') == 1
assert 'inRoster ? "Havuzda" : "Havuza ekle"' not in s
assert 'checked={inRoster}' not in s
assert 'Personel Havuzu <b>{selectedIds.size} /' in s
assert 'Seçili vardiya otomatik kaydedilir' in s
assert 'const requestedRosterIds = serverRosterIds.filter((id) => id !== person.id);' in s
assert s.count('removeRosterPerson(') == 0

p.write_text(s, encoding='utf-8')
print('daily current-shift pool patch applied safely')
