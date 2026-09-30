from pathlib import Path
import re

FE = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
API = Path('APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts')

fe = FE.read_text(encoding='utf-8')
api = API.read_text(encoding='utf-8')

# 1) The range pool is explicit persisted roster state. Attendance must never recreate it.
old_range = '''      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];
      const historicalIds = [...new Set(attendanceRows.filter((row) => rowDay(row) || rowNight(row)).map(rowEmployeeId).filter(Boolean))];
      const resolvedIds = savedIds.length ? savedIds : historicalIds;
      setRosterIds(new Set(resolvedIds));
      setRosterSaved(savedIds.length > 0);'''
new_range = '''      const savedIds = Array.isArray(roster?.employeeIds) ? roster.employeeIds.map(String) : Array.isArray(roster) ? roster.map(String) : [];
      setRosterIds(new Set(savedIds));
      setRosterSaved(true);'''
if old_range not in fe:
    raise SystemExit('frontend range roster anchor not found')
fe = fe.replace(old_range, new_range, 1)

# 2) Middle table: stable range-pool people + any historical current-day work kept visible.
old_visible = '''  const visibleEntryPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return employees
      .filter((person) => person.active !== false && selectedIds.has(person.id))
      .filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, query, selectedIds]);'''
new_visible = '''  const visibleEntryPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return employees
      .filter((person) => person.active !== false && (rosterIds.has(person.id) || selectedIds.has(person.id)))
      .filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [employees, query, rosterIds, selectedIds]);'''
if old_visible not in fe:
    raise SystemExit('frontend visible people anchor not found')
fe = fe.replace(old_visible, new_visible, 1)

# 3) Fully separate: add to range pool / select day+shift / remove from range pool.
start = fe.find('  const activatePersonForSelectedShift = async (person) => {')
end = fe.find('  const setPersonReviewed = async (person, nextChecked) => {', start)
if start < 0 or end < 0:
    raise SystemExit('frontend roster/day function block not found')
new_functions = '''  const addPersonToRoster = async (person) => {
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
      const nextRosterIds = new Set(serverRosterIds);
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

'''
fe = fe[:start] + new_functions + fe[end:]

# 4) Pool count is range roster, not the selected day.
old_pool_count = 'Personel Havuzu <b>{selectedIds.size} / {employees.filter((person) => person.active !== false).length}</b>'
new_pool_count = 'Personel Havuzu <b>{rosterIds.size} / {employees.filter((person) => person.active !== false).length}</b>'
if old_pool_count not in fe:
    raise SystemExit('frontend pool count anchor not found')
fe = fe.replace(old_pool_count, new_pool_count, 1)

# 5) Left checkbox means ONLY pool membership. Checked pool members can only be removed via trash in row actions.
pool_pattern = re.compile(r'poolPeople\.map\(\(person\) => \{ const hasWork = selectedIds\.has\(person\.id\); return <label key=\{person\.id\} className=\{hasWork \? "included" : ""\}>.*?</label>; \}\)', re.S)
pool_replacement = '''poolPeople.map((person) => { const inRoster = rosterIds.has(person.id); return <label key={person.id} className={inRoster ? "included" : ""}><input type="checkbox" checked={inRoster} disabled={busy || periodLocked} title={inRoster ? "Havuzdan çıkarmak için orta tablodaki çöp butonunu kullanın." : "Tarih aralığı havuzuna ekle"} onChange={() => { if (!inRoster) void addPersonToRoster(person); }}/><span><strong>{person.personnelNo ? `${person.personnelNo} · ` : ""}{person.name}</strong><small>{person.role || "Vasıfsız"}</small><em>{inRoster ? "Havuzda" : "Havuza ekle"}</em><em>G: {money(person.dayRate)} · N: {money(person.nightRate)}</em></span></label>; })'''
fe, pool_n = pool_pattern.subn(pool_replacement, fe, count=1)
if pool_n != 1:
    raise SystemExit(f'frontend pool map anchor count={pool_n}')

# 6) Row status and actions: first button is day/shift selection; last trash is the only pool deletion.
old_status = '<em>{reviewed ? "✓ Kontrol Edildi" : selected ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em>'
new_status = '<em>{!rosterIds.has(person.id) ? (reviewed ? "Havuz dışı kayıt · ✓ Kontrol Edildi" : "Havuz dışı kayıt · Bu Gün Seçildi") : reviewed ? "✓ Kontrol Edildi" : selected ? "Bu Gün Seçildi" : "Bu Gün Yok"}</em>'
if old_status not in fe:
    raise SystemExit('frontend row status anchor not found')
fe = fe.replace(old_status, new_status, 1)

old_actions = '''<button type="button" title="Gün seçimini kaldır" disabled={blocked || periodLocked || busy} className={selected ? "selected" : ""} onClick={() => deleteShiftAndCleanupRoster(person)}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked || busy} className={reviewed ? "selected" : ""} onClick={() => setPersonReviewed(person, !reviewed)}>✓</button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title="Bu vardiya kaydını sil" disabled={!selected || periodLocked || busy} onClick={() => deleteShiftAndCleanupRoster(person)}><Trash2 size={14}/></button>'''
new_actions = '''<button type="button" title={selected ? "Gün seçimini kaldır" : "Seçili güne/vardiyaya kaydet"} disabled={blocked || periodLocked || busy} className={selected ? "selected" : ""} onClick={() => setPersonSelectedForShift(person, !selected)}><CheckCircle2 size={14}/></button><button type="button" title={reviewed ? "Kontrol işaretini kaldır" : "Kontrol edildi"} disabled={!selected || blocked || periodLocked || busy} className={reviewed ? "selected" : ""} onClick={() => setPersonReviewed(person, !reviewed)}>✓</button><button type="button" title="Personel kartını düzenle" onClick={() => setCardDialog({ ...person })}><Pencil size={14}/></button><button type="button" title={rosterIds.has(person.id) ? "Personeli tarih aralığı havuzundan çıkar" : "Havuz dışı kayıt"} disabled={!rosterIds.has(person.id) || periodLocked || busy} onClick={() => removePersonFromRoster(person)}><Trash2 size={14}/></button>'''
if old_actions not in fe:
    raise SystemExit('frontend row actions anchor not found')
fe = fe.replace(old_actions, new_actions, 1)

old_empty = '<Empty>Seçili gün ve vardiyada personel yok. Soldaki listeden personel ekleyin.</Empty>'
new_empty = '<Empty>Tarih aralığı personel havuzunda ve seçili günde kayıt yok. Soldaki listeden havuza personel ekleyin.</Empty>'
if old_empty not in fe:
    raise SystemExit('frontend entry empty anchor not found')
fe = fe.replace(old_empty, new_empty, 1)

# 7) Right-side daily control denominator is the stable pool/day-visible set, not all company employees.
old_summary = '''<div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(employees.filter((person) => person.active !== false).length - selectedIds.size, 0)}</strong><small>{employees.filter((person) => person.active !== false).length} aktif personel</small></div>'''
new_summary = '''<div className="kyop-control-highlight"><span>Bu Gün Seçili / Seçilmedi</span><strong>{selectedIds.size} / {Math.max(visibleEntryPeople.length - selectedIds.size, 0)}</strong><small>{visibleEntryPeople.length} havuz/gün personeli</small></div>'''
if old_summary not in fe:
    raise SystemExit('frontend control summary anchor not found')
fe = fe.replace(old_summary, new_summary, 1)

# BACKEND: explicit roster only. Working attendance is historical data, not membership.
list_pattern = re.compile(r'''  const \[savedResult, workedResult, knownResult\] = await Promise\.all\(\[\n    c\.env\.DB\.prepare\(`SELECT employee_id\n        FROM hr_daily_range_roster\n        WHERE main_company_id=\? AND start_date=\? AND end_date=\?`\)\n      \.bind\(companyId, start, end\)\n      \.all<Row>\(\),\n    c\.env\.DB\.prepare\(`SELECT DISTINCT a\.employee_id\n        FROM hr_daily_attendance a\n        JOIN hr_daily_employees e ON e\.id=a\.employee_id\n        WHERE e\.main_company_id=\?\n          AND a\.work_date>=\? AND a\.work_date<=\?\n          AND \(a\.day_shift=1 OR a\.night_shift=1\)`\)\n      \.bind\(companyId, start, end\)\n      \.all<Row>\(\),\n    c\.env\.DB\.prepare\("SELECT id FROM hr_daily_employees WHERE main_company_id=\?"\)\n      \.bind\(companyId\)\n      \.all<Row>\(\),\n  \]\);\n\n  const knownIds = new Set\(\(knownResult\.results \|\| \[\]\)\.map\(\(row\) => text\(row\.id\)\)\);\n  const employeeIds = \[\n    \.\.\.new Set\(\[\n      \.\.\.\(savedResult\.results \|\| \[\]\)\.map\(\(row\) => text\(row\.employee_id\)\),\n      \.\.\.\(workedResult\.results \|\| \[\]\)\.map\(\(row\) => text\(row\.employee_id\)\),\n    \]\),\n  \]\.filter\(\(id\) => id && knownIds\.has\(id\)\);''', re.S)
list_replacement = '''  const [savedResult, knownResult] = await Promise.all([
    c.env.DB.prepare(`SELECT employee_id
        FROM hr_daily_range_roster
        WHERE main_company_id=? AND start_date=? AND end_date=?`)
      .bind(companyId, start, end)
      .all<Row>(),
    c.env.DB.prepare("SELECT id FROM hr_daily_employees WHERE main_company_id=?")
      .bind(companyId)
      .all<Row>(),
  ]);

  const knownIds = new Set((knownResult.results || []).map((row) => text(row.id)));
  const employeeIds = (savedResult.results || [])
    .map((row) => text(row.employee_id))
    .filter((id) => id && knownIds.has(id));'''
api, list_n = list_pattern.subn(list_replacement, api, count=1)
if list_n != 1:
    raise SystemExit(f'backend listRoster anchor count={list_n}')

save_pattern = re.compile(r'''  const \[existingResult, workedResult\] = await Promise\.all\(\[\n    c\.env\.DB\.prepare\(`SELECT id,employee_id\n        FROM hr_daily_range_roster\n        WHERE main_company_id=\? AND start_date=\? AND end_date=\?`\)\n      \.bind\(companyId, start, end\)\n      \.all<Row>\(\),\n    c\.env\.DB\.prepare\(`SELECT DISTINCT a\.employee_id\n        FROM hr_daily_attendance a\n        JOIN hr_daily_employees e ON e\.id=a\.employee_id\n        WHERE e\.main_company_id=\?\n          AND a\.work_date>=\? AND a\.work_date<=\?\n          AND \(a\.day_shift=1 OR a\.night_shift=1\)`\)\n      \.bind\(companyId, start, end\)\n      \.all<Row>\(\),\n  \]\);\n\n  const existing = existingResult\.results \|\| \[\];\n  const existingIds = new Set\(existing\.map\(\(row\) => text\(row\.employee_id\)\)\);\n  const finalIds = \[\n    \.\.\.new Set\(\[\n      \.\.\.requested,\n      \.\.\.\(workedResult\.results \|\| \[\]\)\.map\(\(row\) => text\(row\.employee_id\)\),\n    \]\),\n  \];''', re.S)
save_replacement = '''  const existingResult = await c.env.DB.prepare(`SELECT id,employee_id
      FROM hr_daily_range_roster
      WHERE main_company_id=? AND start_date=? AND end_date=?`)
    .bind(companyId, start, end)
    .all<Row>();

  const existing = existingResult.results || [];
  const existingIds = new Set(existing.map((row) => text(row.employee_id)));
  const finalIds = [...new Set(requested)];'''
api, save_n = save_pattern.subn(save_replacement, api, count=1)
if save_n != 1:
    raise SystemExit(f'backend saveRoster anchor count={save_n}')

# Safety assertions
assert 'const addPersonToRoster = async (person)' in fe
assert 'const setPersonSelectedForShift = async (person, nextSelected)' in fe
assert 'const removePersonFromRoster = async (person)' in fe
assert 'rosterIds.has(person.id) || selectedIds.has(person.id)' in fe
assert 'onClick={() => setPersonSelectedForShift(person, !selected)}' in fe
assert 'onClick={() => removePersonFromRoster(person)}' in fe
assert 'checked={inRoster}' in fe and 'inRoster ? "Havuzda" : "Havuza ekle"' in fe
assert 'workedResult' not in api[api.find('async function listRoster'):api.find('async function writeRows')]
roster_save = api[api.find('async function saveRoster'):api.find('async function auditGet')]
assert 'workedResult' not in roster_save
assert 'const finalIds = [...new Set(requested)]' in roster_save

FE.write_text(fe, encoding='utf-8')
API.write_text(api, encoding='utf-8')
print('daily roster/day/shift decoupling patch applied')
