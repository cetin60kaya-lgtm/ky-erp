from pathlib import Path

p = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx")
s = p.read_text(encoding="utf-8")

if "const deleteShiftAndCleanupRoster = async (person)" not in s:
    marker = "  const removeRosterPerson = (personId) => {"
    start = s.find(marker)
    if start < 0:
        raise SystemExit("removeRosterPerson start not found")
    end = s.find("\n  };", start)
    if end < 0:
        raise SystemExit("removeRosterPerson end not found")
    end += len("\n  };")
    handler = '''

  const deleteShiftAndCleanupRoster = async (person) => {
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
          status: "REMOVE",
          checked: false,
          expectedUpdatedAt: currentRecord.updatedAt || currentRecord.attendanceUpdatedAt || "",
          note: "",
        }],
      });

      const requestedRosterIds = [...rosterIds].filter((id) => id !== person.id);
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
      const keptForOtherWork = finalRosterIds.has(person.id);

      setRosterIds(finalRosterIds);
      setRosterSaved(true);
      setSelectedIds((current) => { const next = new Set(current); next.delete(person.id); return next; });
      setCheckedIds((current) => { const next = new Set(current); next.delete(person.id); return next; });
      setNotes((current) => { const next = { ...current }; delete next[person.id]; return next; });

      await Promise.all([loadFocused(), loadRangeData()]);
      setNotice(
        keptForOtherWork
          ? `${person.name} ${shift === "day" ? "gündüz" : "gece"} kaydı silindi. Tarih aralığında başka kaydı olduğu için havuzda kaldı.`
          : `${person.name} ${shift === "day" ? "gündüz" : "gece"} kaydı silindi; tarih aralığında başka kaydı olmadığı için havuzdan da çıkarıldı.`,
      );
    } catch (e) {
      setError(e?.message || "Vardiya kaydı silinemedi. Ekranı yenileyip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };'''
    s = s[:end] + handler + s[end:]

old_button = '<button type="button" title="Bu vardiyadan kaldır" disabled={!selected || periodLocked} onClick={() => { setSelectedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); setCheckedIds((current) => { const next = new Set(current); next.delete(person.id); return next; }); }}><Trash2 size={14}/></button>'
new_button = '<button type="button" title="Bu vardiya kaydını sil" disabled={!selected || periodLocked || busy} onClick={() => deleteShiftAndCleanupRoster(person)}><Trash2 size={14}/></button>'

if old_button in s:
    s = s.replace(old_button, new_button, 1)
elif new_button not in s:
    raise SystemExit("trash action not found")

if s.count("const deleteShiftAndCleanupRoster = async (person)") != 1:
    raise SystemExit("delete handler count invalid")
if s.count("onClick={() => deleteShiftAndCleanupRoster(person)}") != 1:
    raise SystemExit("trash handler binding count invalid")
if 'title="Bu vardiyadan kaldır"' in s:
    raise SystemExit("old local-only trash action remains")

p.write_text(s, encoding="utf-8")
print("Daily delete hotfix patched successfully")
