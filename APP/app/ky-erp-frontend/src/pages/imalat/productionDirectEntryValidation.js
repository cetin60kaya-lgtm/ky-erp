export function validCount(value, required = false) {
  const raw = String(value ?? "").trim();
  if (!raw && !required) return 0;
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && (!required || number > 0) ? number : null;
}
export function validProductionDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const [y, m, d] = date.split("-").map(Number);
  const actual = new Date(Date.UTC(y, m - 1, d));
  return actual.getUTCFullYear() === y && actual.getUTCMonth() === m - 1 && actual.getUTCDate() === d;
}
export function validateDirectProduction(values) {
  if (!values.modelId) return "Önce kayıtlı modeli seçin.";
  if (!validProductionDate(values.date)) return "Geçerli üretim tarihi seçin.";
  const quantity = validCount(values.quantity, true);
  const printDefect = validCount(values.printDefectQty);
  const fabricDefect = validCount(values.fabricDefectQty);
  if (quantity === null) return "Üretim adedi sıfırdan büyük, tam sayı olmalıdır.";
  if (printDefect === null || fabricDefect === null) return "Sakat adetleri negatif olmayan tam sayı olmalıdır.";
  if (printDefect + fabricDefect > quantity) return "Baskı ve kumaş sakatı toplamı üretim adedini aşamaz.";
  if (!values.machineId) return "Makine seçin.";
  if (!values.shift || !["Gündüz", "Gece"].includes(values.shift)) return "Gündüz veya Gece vardiyasını seçin.";
  if (!String(values.printRegion ?? "").trim()) return "Baskı bölgesi seçin.";
  if (!String(values.operatorName ?? "").trim()) return "Bu vardiya için makinacıyı seçin veya elle yazın.";
  return "";
}
