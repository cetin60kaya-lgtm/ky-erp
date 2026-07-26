export const JOB_STATUS = {
  WAITING: "Bekliyor",
  ACTIVE: "Aktif",
  PAUSED: "Beklemede",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const COLOR_STATUS = {
  WAITING: "Bekliyor",
  DRAFT: "Taslak",
  PREPARING: "Hazırlanıyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const RECIPE_STATUS = {
  ACTIVE: "Aktif",
  TRIAL: "Deneme",
  OLD: "Eski",
  PASSIVE: "Pasif",
};

export function statusTone(status) {
  if (["ACTIVE", "COMPLETED"].includes(status)) return "green";
  if (["WAITING", "DRAFT", "PREPARING", "PAUSED", "TRIAL"].includes(status)) return "orange";
  if (["CANCELLED", "PASSIVE"].includes(status)) return "red";
  return "gray";
}

export function formatKg(value, digits = 3) {
  return `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: digits })} KG`;
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}
