from pathlib import Path

FE = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
REG = Path('APP/app/ky-erp-frontend/src/app/moduleRegistry.js')
fe = FE.read_text(encoding='utf-8')
reg = REG.read_text(encoding='utf-8')

old_range = '''  const setSafeRange = useCallback((next) => {
    const resolved = typeof next === "function" ? next(range) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    if (rangeDays(resolved.start, resolved.end).length > 31) { setError("Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır."); return; }
    setRange(resolved); writeRange(resolved); setError("");
  }, [range]);'''
new_range = '''  const setSafeRange = useCallback((next) => {
    const resolved = typeof next === "function" ? next(range) : next;
    if (!resolved?.start || !resolved?.end || resolved.end < resolved.start) return;
    const maxDays = view === "daily-payments" ? 366 : 31;
    if (rangeDays(resolved.start, resolved.end).length > maxDays) {
      setError(view === "daily-payments"
        ? "Ödemeler tek seferde en fazla 366 günlük aralıkla çalışır."
        : "Günlük Operasyon tek seferde en fazla 31 günlük aralıkla çalışır.");
      return;
    }
    setRange(resolved); writeRange(resolved); setError("");
  }, [range, view]);'''
if old_range not in fe:
    raise SystemExit('setSafeRange anchor not found')
fe = fe.replace(old_range, new_range, 1)

old_year = '    if (mode === "year") return setSafeRange({ start: `${year}-01-01`, end: `${year}-12-31` });'
new_year = '    if (mode === "year") return setSafeRange({ start: `${year}-01-01`, end: today });'
if old_year not in fe:
    raise SystemExit('payment year preset anchor not found')
fe = fe.replace(old_year, new_year, 1)

old_menu = '["daily-payments", "Ödeme Fişleri", "odemeler"]'
new_menu = '["daily-payments", "Ödemeler", "odemeler"]'
if old_menu not in reg:
    raise SystemExit('daily payments menu label anchor not found')
reg = reg.replace(old_menu, new_menu, 1)

assert 'const maxDays = view === "daily-payments" ? 366 : 31;' in fe
assert 'end: today' in fe
assert '["daily-payments", "Ödemeler", "odemeler"]' in reg
assert '["daily-payments", "Ödeme Fişleri", "odemeler"]' not in reg

FE.write_text(fe, encoding='utf-8')
REG.write_text(reg, encoding='utf-8')
print('payment polish applied')
