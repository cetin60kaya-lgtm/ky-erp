/**
 * Günlük Operasyon: all five tabs share this single date/range read contract.
 * A response for a different company, range or shift must never enable a write.
 * A failed read is UNKNOWN, not a real closed accounting period.
 */
export function dailyPeriodScope(companyId, date, start, end) {
  return [companyId, date, start, end].map((value) => String(value || "")).join("|");
}

export function dailyRangeScope(companyId, start, end) {
  return [companyId, start, end].map((value) => String(value || "")).join("|");
}

export function dailyFocusedScope(companyId, date, shift) {
  return [companyId, date, shift].map((value) => String(value || "")).join("|");
}

export function dailyLockOverlaps(lock, start, end) {
  return String(lock?.status || "").toUpperCase() === "LOCKED"
    && Boolean(start && end && lock?.start_date && lock?.end_date)
    && String(lock.start_date) <= end && String(lock.end_date) >= start;
}

export function assessDailyPeriodLocks(rows, { date, start, end }) {
  if (!Array.isArray(rows)) throw new Error("Dönem kilidi için sunucudan geçersiz yanıt alındı.");
  const active = rows.filter((item) => dailyLockOverlaps(item, start, end));
  return {
    dayLock: active.find((item) => dailyLockOverlaps(item, date, date)) || null,
    rangeLock: active[0] || null,
  };
}

export function dailyWriteGate({
  lockKnown, lockScope, requiredLockScope, dayLock,
  rangeScope, requiredRangeScope, focusedScope, requiredFocusedScope,
  rangeLock, roster = false,
}) {
  if (!lockKnown || lockScope !== requiredLockScope) return "Dönem kilidi doğrulanamadı.";
  if (dayLock) return "Seçili günün dönemi kapalı.";
  if (rangeScope !== requiredRangeScope) return "Çalışma ve personel listesi doğrulanamadı.";
  if (roster && rangeLock) return "Tarih aralığında kapalı dönem var; personel havuzu düzenlenemez.";
  if (!roster && focusedScope !== requiredFocusedScope) return "Seçili gün/vardiya kayıtları doğrulanamadı.";
  return "";
}
