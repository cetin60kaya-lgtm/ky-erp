const text = (value: unknown) => value == null ? "" : String(value).trim();
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function dailyRevisionConflict(currentUpdatedAt: unknown, expectedUpdatedAt: unknown) {
  const current = text(currentUpdatedAt);
  const expected = text(expectedUpdatedAt);
  if (!current) return "";
  if (!expected) return "DAILY_REVISION_REQUIRED";
  return current === expected ? "" : "DAILY_RECORD_CHANGED";
}

export function periodContains(startDate: unknown, endDate: unknown, workDate: unknown) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  const date = dateOnly(workDate);
  return Boolean(validDate(start) && validDate(end) && validDate(date) && start <= date && date <= end);
}

export function dailyMoneyCents(value: unknown) {
  const parsed = Number(value ?? 0);
  const finite = Number.isFinite(parsed) ? parsed : 0;
  return Math.round(finite * 100);
}
