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

/**
 * Personel kartında aylık tek görünüm: ayın hakedişi çalışma tarihine,
 * teyitli ödeme ise ödeme tarihine göre gruplanır. Bunlar ayrı mali
 * metriklerdir; kesinlikle birbiri yerine kullanılmaz.
 */
export function monthlyDailyPersonnelHistory(
  worked: HistoryRow[], payments: HistoryRow[], adjustments: HistoryRow[],
) {
  type Month = {month:string;dayCount:number;nightCount:number;dayCents:number;nightCents:number;
    additionCents:number;deductionCents:number;paidCents:number;paidCount:number};
  const byMonth = new Map<string,Month>();
  const ensure = (date: unknown) => {
    const key=str(date).slice(0,7);
    if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("INVALID_HISTORY_MONTH");
    if (!byMonth.has(key)) byMonth.set(key,{month:key,dayCount:0,nightCount:0,
      dayCents:0,nightCents:0,additionCents:0,deductionCents:0,paidCents:0,paidCount:0});
    return byMonth.get(key)!;
  };
  for (const row of worked) {
    const isDay=bool(row.day_shift),isNight=bool(row.night_shift);
    if (!isDay && !isNight) continue;
    const month=ensure(row.work_date);
    if(isDay){month.dayCount++;month.dayCents+=cents(row.day_wage);}
    if(isNight){month.nightCount++;month.nightCents+=cents(row.night_wage);}
  }
  for(const adjustment of adjustments) {
    const month=ensure(adjustment.period_start);
    const amount=amountCents(adjustment.amount_cents);
    if(amount<0) throw new Error("INVALID_ADJUSTMENT");
    if(str(adjustment.kind).toUpperCase()==="ADD") month.additionCents+=amount;
    else if(str(adjustment.kind).toUpperCase()==="DEDUCT") month.deductionCents+=amount;
    else throw new Error("INVALID_ADJUSTMENT");
  }
  for(const payment of payments) {
    if(str(payment.status).toUpperCase()!=="PAID") continue;
    const month=ensure(payment.paid_date);
    month.paidCents+=amountCents(payment.total_amount_cents);
    month.paidCount++;
  }
  return [...byMonth.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(row=>({
    month:row.month,dayCount:row.dayCount,nightCount:row.nightCount,
    dayTotal:row.dayCents/100,nightTotal:row.nightCents/100,
    earnedNet:(row.dayCents+row.nightCents+row.additionCents-row.deductionCents)/100,
    confirmedPaid:row.paidCents/100,confirmedPaymentCount:row.paidCount,
  }));
}

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
