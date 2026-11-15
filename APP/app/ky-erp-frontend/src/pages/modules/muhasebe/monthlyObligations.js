// Aylık planlar muhasebe fişi değildir. Dönem ve parasal hesaplar deterministiktir.
export const validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
export function nextMonth(month, offset = 1) {
  if (!validMonth(month) || !Number.isSafeInteger(offset)) return "";
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function validateMonthlyPlan(value = {}) {
  const startMonth = String(value.startMonth || "");
  const endMonth = String(value.endMonth || "");
  const amount = Number(value.amount);
  if (!validMonth(startMonth) || !validMonth(endMonth)) return "Başlangıç ve bitiş ayı YYYY-AA biçiminde olmalıdır.";
  if (endMonth < startMonth) return "Bitiş ayı başlangıç ayından önce olamaz.";
  const start = Number(startMonth.slice(0,4)) * 12 + Number(startMonth.slice(5));
  const end = Number(endMonth.slice(0,4)) * 12 + Number(endMonth.slice(5));
  if (end - start + 1 > 120) return "En fazla 120 aylık plan yapılabilir.";
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) return "Tutar sıfırdan büyük ve en fazla iki ondalıklı olmalıdır.";
  return "";
}
export function monthlyPeriods(value = {}) {
  if (validateMonthlyPlan(value)) return [];
  const result = [];
  const amountMinor = Math.round(Number(value.amount) * 100);
  for (let month = value.startMonth; month <= value.endMonth; month = nextMonth(month)) {
    result.push({ period: month, amountMinor, status: "PLANNED", key: `${value.id || "draft"}:${month}` });
  }
  return result;
}
export function totalMinor(rows) {
  return rows.reduce((total, row) => total + Number(row.amountMinor || 0), 0);
}
