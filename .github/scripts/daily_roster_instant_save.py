from pathlib import Path

p = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
s = p.read_text(encoding='utf-8')

old_add = '''  const addRosterPerson = (person, target = "main") => {
    if (!person?.id) { setError("Listeden eklenecek personeli seçin."); return; }
    setRosterIds((current) => { const next = new Set(current); next.add(person.id); return next; });
    setRosterSaved(false);
    if (target === "quick") setQuickAddQuery(""); else setPoolAddQuery("");
    setNotice(`${person.name} tarih aralığı listesine eklendi. Kaydettiğinizde sunucuya yazılacak.`);
  };
  const removeRosterPerson = (personId) => {
    setRosterIds((current) => { const next = new Set(current); next.delete(personId); return next; });
    setSelectedIds((current) => { const next = new Set(current); next.delete(personId); return next; });
    setCheckedIds((current) => { const next = new Set(current); next.delete(personId); return next; });
    setRosterSaved(false);
  };'''

new_add = '''  const addRosterPerson = async (person, target = "main") => {
    if (!person?.id || busy) { if (!person?.id) setError("Listeden eklenecek personeli seçin."); return; }
    const nextIds = new Set(rosterIds); nextIds.add(person.id);
    setRosterIds(nextIds);
    setRosterSaved(false);
    if (target === "quick") setQuickAddQuery(""); else setPoolAddQuery("");
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...nextIds] });
      const finalIds = new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : [...nextIds]);
      setRosterIds(finalIds);
      setRosterSaved(true);
      setNotice(`${person.name} tarih aralığı havuzuna alındı.`);
    } catch (e) {
      setRosterIds(new Set(rosterIds));
      setRosterSaved(true);
      setError(e?.message || "Personel havuza eklenemedi.");
    } finally { setBusy(false); }
  };
  const removeRosterPerson = async (personId) => {
    if (!personId || busy) return;
    const person = employeeMap.get(personId);
    const nextIds = new Set([...rosterIds].filter((id) => id !== personId));
    setRosterIds(nextIds);
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveDailyRoster({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, employeeIds: [...nextIds] });
      const finalIds = new Set(Array.isArray(saved?.employeeIds) ? saved.employeeIds.map(String) : [...nextIds]);
      const kept = finalIds.has(personId);
      setRosterIds(finalIds);
      setRosterSaved(true);
      if (!kept) {
        setSelectedIds((current) => { const next = new Set(current); next.delete(personId); return next; });
        setCheckedIds((current) => { const next = new Set(current); next.delete(personId); return next; });
      }
      setNotice(kept ? `${person?.name || "Personel"} tarih aralığında çalışma kaydı olduğu için havuzda kaldı.` : `${person?.name || "Personel"} tarih aralığı havuzundan çıkarıldı.`);
    } catch (e) {
      setRosterIds(new Set(rosterIds));
      setRosterSaved(true);
      setError(e?.message || "Personel havuzdan çıkarılamadı.");
    } finally { setBusy(false); }
  };'''

if old_add not in s:
    raise SystemExit('roster add/remove block not found')
s = s.replace(old_add, new_add, 1)

old_button = '<button type="button" className="kyop-roster-save" disabled={busy || rosterSaved} onClick={saveRoster}><Save size={14}/> Personel Havuzu Kaydet ({rosterIds.size})</button>'
new_button = '<div className="kyop-roster-save kyop-roster-auto"><CheckCircle2 size={14}/> Havuz otomatik kaydedilir · {rosterIds.size} kişi</div>'
if old_button in s:
    s = s.replace(old_button, new_button, 1)
else:
    # tolerate formatting drift: remove only the explicit roster save button if present
    if 'Personel Havuzu Kaydet' in s:
        import re
        s, count = re.subn(r'<button type="button" className="kyop-roster-save"[^>]*onClick=\{saveRoster\}[^>]*><Save size=\{14\}/> Personel Havuzu Kaydet \(\{rosterIds\.size\}\)</button>', new_button, s, count=1)
        if count != 1:
            raise SystemExit('roster save button not replaced')

p.write_text(s, encoding='utf-8')
print('instant roster save patch applied')
