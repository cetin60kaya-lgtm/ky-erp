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

export function mergeDailyRosterIds(savedIds: string[], workedIds: string[], knownIds: string[]) {
  const known = new Set(knownIds.filter(Boolean));
  return [...new Set([...savedIds, ...workedIds])].filter((employeeId) => employeeId && known.has(employeeId));
}

/**
 * Tarih etkili günlük ücret: kartın bugünkü rakamı geçmiş haftayı değiştirmez.
 * Ücret değişimleri değişmez işlem geçmişinde önce/sonra olarak saklanır.
 */
export type DailyWageChange = {
  effectiveDate: string;
  beforeDayWage: number;
  beforeNightWage: number;
  dayWage: number;
  nightWage: number;
  createdAt?: string;
  id?: string;
};
export function dailyWageAtDate(
  card: { dayWage: number; nightWage: number },
  workDate: string,
  changes: DailyWageChange[] = [],
) {
  const dated = changes.filter((change) => validDate(dateOnly(change.effectiveDate))).slice().sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
    || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    || String(a.id || "").localeCompare(String(b.id || "")));
  if (!dated.length) return { dayWage: dailyMoneyCents(card.dayWage) / 100, nightWage: dailyMoneyCents(card.nightWage) / 100 };
  const active = dated.filter((change) => change.effectiveDate <= workDate).at(-1);
  const first = dated[0];
  return active
    ? { dayWage: dailyMoneyCents(active.dayWage) / 100, nightWage: dailyMoneyCents(active.nightWage) / 100 }
    : { dayWage: dailyMoneyCents(first.beforeDayWage) / 100, nightWage: dailyMoneyCents(first.beforeNightWage) / 100 };
}

/**
 * Tek vardiya ücreti çözümleme kuralı. D1 ekranı, gün kaydı, haftalık rapor
 * ve ödeme defteri aynı ödeme kilidi/tarih etkisi önceliğini kullanır.
 * Tarihli efektif ücret dailyWageAtDate ile zaten hesaplanmıştır.
 */
export function resolveRecordedShiftWages(
  effective: { dayWage: number; nightWage: number },
  record: {
    paymentStatus?: unknown;
    ledgerItemCount?: unknown;
    savedDayWage?: unknown;
    savedNightWage?: unknown;
    settledDayCents?: unknown;
    settledNightCents?: unknown;
  },
) {
  const legacyPaid = text(record.paymentStatus).toUpperCase() === "PAID"
    && Number(record.ledgerItemCount ?? 0) === 0;
  const shiftWage = (shift: "day" | "night"): number => {
    const settled = shift === "day" ? record.settledDayCents : record.settledNightCents;
    if (settled !== null && settled !== undefined) {
      const cents = Number(settled);
      if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("INVALID_SETTLED_WAGE");
      return cents / 100;
    }
    if (legacyPaid) return dailyMoneyCents(shift === "day" ? record.savedDayWage : record.savedNightWage) / 100;
    return dailyMoneyCents(shift === "day" ? effective.dayWage : effective.nightWage) / 100;
  };
  return { dayWage: shiftWage("day"), nightWage: shiftWage("night") };
}
