/**
 * Günlük personel kartı READ ONLY hakediş/ödeme özetleyicisi.
 * Ücret çözümlemesi bu fonksiyonda yapılmaz: caller, canonical
 * paymentSourceRows() ile ücret geçmişi/ödeme defteri sabitlerini çözer.
 * Kuruş bazında işlem yapar. Ödeme tarihi ile çalışma tarihi AYRIDIR.
 */
type HistoryRow = Record<string, unknown>;
const str = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) throw new Error("INVALID_HISTORY_AMOUNT");
  return n;
};
const cents = (value: unknown) => {
  const rounded = Math.round(numeric(value) * 100);
  if (!Number.isSafeInteger(rounded)) throw new Error("INVALID_HISTORY_CENTS");
  return rounded;
};
const bool = (value: unknown) => value === true || value === 1 || value === "1";
const amountCents = (value: unknown) => {
  const n = numeric(value);
  if (!Number.isSafeInteger(n)) throw new Error("INVALID_LEDGER_AMOUNT");
  return n;
};

export function summarizeDailyPersonnelHistory(
  worked: HistoryRow[], payments: HistoryRow[], adjustments: HistoryRow[],
) {
  const dates = new Set<string>();
  let dayCount = 0, nightCount = 0;
  let dayCents = 0, nightCents = 0, openBaseCents = 0, legacyMarkedCents = 0;
  const shifts: Array<{date:string;day:boolean;night:boolean;dayAmount:number;nightAmount:number;dayPaid:boolean;nightPaid:boolean;legacyMarked:boolean}> = [];
  for (const row of worked) {
    const date = str(row.work_date).slice(0, 10);
    const isDay = bool(row.day_shift), isNight = bool(row.night_shift);
    if (!date || (!isDay && !isNight)) continue;
    dates.add(date);
    const legacy = str(row.payment_status).toUpperCase() === "PAID" && numeric(row.ledger_item_count) === 0;
    const dayAmount = isDay ? cents(row.day_wage) : 0;
    const nightAmount = isNight ? cents(row.night_wage) : 0;
    const dayPaid = isDay && (bool(row.day_paid_item) || legacy);
    const nightPaid = isNight && (bool(row.night_paid_item) || legacy);
    if (isDay) {
      dayCount++;
      dayCents += dayAmount;
      if (!dayPaid) openBaseCents += dayAmount;
      if (legacy) legacyMarkedCents += dayAmount;
    }
    if (isNight) {
      nightCount++;
      nightCents += nightAmount;
      if (!nightPaid) openBaseCents += nightAmount;
      if (legacy) legacyMarkedCents += nightAmount;
    }
    shifts.push({date,day:isDay,night:isNight,dayAmount:dayAmount/100,nightAmount:nightAmount/100,dayPaid,nightPaid,legacyMarked:legacy});
  }

  let additionsCents = 0, deductionsCents = 0;
  let openAdditionsCents = 0, openDeductionsCents = 0;
  for (const adj of adjustments) {
    const value = amountCents(adj.amount_cents);
    const kind = str(adj.kind).toUpperCase();
    if (!["ADD","DEDUCT"].includes(kind) || value < 0) throw new Error("INVALID_ADJUSTMENT");
    if (kind === "ADD") {
      additionsCents += value;
      if (!str(adj.settled_payment_id)) openAdditionsCents += value;
    } else {
      deductionsCents += value;
      if (!str(adj.settled_payment_id)) openDeductionsCents += value;
    }
  }

  let confirmedPaidCents = 0, confirmedPaymentCount = 0, cancelledPaymentCount = 0;
  for (const pay of payments) {
    const status = str(pay.status).toUpperCase();
    if (status === "PAID") {
      confirmedPaymentCount++;
      confirmedPaidCents += amountCents(pay.total_amount_cents);
    } else if (status === "CANCELLED") cancelledPaymentCount++;
  }

  return {
    dayCount, nightCount, workedDays: dates.size,
    dayTotal: dayCents/100, nightTotal: nightCents/100,
    baseEarned: (dayCents + nightCents)/100,
    additions: additionsCents/100, deductions: deductionsCents/100,
    earnedNet: (dayCents + nightCents + additionsCents - deductionsCents)/100,
    openBase: openBaseCents/100,
    openAdjustments: (openAdditionsCents - openDeductionsCents)/100,
    openNet: (openBaseCents + openAdditionsCents - openDeductionsCents)/100,
    confirmedPaid: confirmedPaidCents/100, confirmedPaymentCount,
    cancelledPaymentCount, legacyMarked: legacyMarkedCents/100,
    shifts: shifts.sort((a,b)=>b.date.localeCompare(a.date)),
  };
}
