from pathlib import Path

path = Path("APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx")
text = path.read_text(encoding="utf-8")
old = '''  const fallbackDays = Array.isArray(days) ? days.slice(0, 7) : [];
  const safeDays = range?.start
    ? Array.from({ length: 7 }, (_, index) => addDays(range.start, index))
    : fallbackDays;
  const printStart = safeDays[0] || range.start;
  const printEnd = safeDays[safeDays.length - 1] || range.end;
'''
new = '''  const rangeBoundDays = Array.isArray(days)
    ? days.filter((date) => (!range?.start || date >= range.start) && (!range?.end || date <= range.end)).slice(0, 7)
    : [];
  const safeDays = rangeBoundDays.length ? rangeBoundDays : rangeDays(range?.start, range?.end).slice(0, 7);
  const printStart = range?.start || safeDays[0] || "";
  const printEnd = range?.end || safeDays[safeDays.length - 1] || printStart;
'''
if old not in text:
    raise SystemExit("Expected seven-day forcing block not found; aborting safely.")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
