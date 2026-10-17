/** Canonical exact-kurus adjustment arithmetic. Individual entries always have positive cents. */
export type DailyAdjustmentAmount = { kind: "ADD" | "DEDUCT"; amount_cents: number };
export function dailyAdjustmentNetCents(baseCents: number, adjustments: DailyAdjustmentAmount[]): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error("INVALID_BASE_CENTS");
  return adjustments.reduce((total, entry) => {
    if (!Number.isSafeInteger(entry.amount_cents) || entry.amount_cents <= 0 || !["ADD","DEDUCT"].includes(entry.kind))
      throw new Error("INVALID_ADJUSTMENT_CENTS");
    const next = total + (entry.kind === "ADD" ? entry.amount_cents : -entry.amount_cents);
    if (!Number.isSafeInteger(next)) throw new Error("ADJUSTMENT_OVERFLOW");
    return next;
  },baseCents);
}
