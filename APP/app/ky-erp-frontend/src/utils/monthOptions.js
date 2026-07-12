export const TR_MONTH_NAMES = [
  "Ocak",
  "Subat",
  "Mart",
  "Nisan",
  "Mayis",
  "Haziran",
  "Temmuz",
  "Agustos",
  "Eylul",
  "Ekim",
  "Kasim",
  "Aralik",
];

export const DEFAULT_MONTH_BASE = "2025-01";

export function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function splitMonthKey(monthKey, fallbackMonth = getCurrentMonthKey()) {
  const normalized =
    normalizeMonthInput(monthKey) || normalizeMonthInput(fallbackMonth);
  const [yearText, monthText] = String(normalized || fallbackMonth).split("-");
  const year = Number(yearText) || new Date().getFullYear();
  const month = Number(monthText) || new Date().getMonth() + 1;
  return { year, month };
}

export function buildYearOptions({
  currentYear = new Date().getFullYear(),
  pastYears = 3,
  futureYears = 3,
} = {}) {
  const years = [currentYear];
  for (let i = 1; i <= futureYears; i += 1) {
    years.push(currentYear + i);
  }
  for (let i = 1; i <= pastYears; i += 1) {
    years.push(currentYear - i);
  }
  return years;
}

export const MONTH_NUMBER_OPTIONS = TR_MONTH_NAMES.map((label, index) => ({
  value: index + 1,
  label,
}));

export function normalizeMonthInput(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(0, 7);
  return "";
}

export function toMonthLabel(monthKey) {
  const raw = normalizeMonthInput(monthKey);
  if (!raw) return String(monthKey || "");
  const [year, month] = raw.split("-");
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return raw;
  return `${year} ${TR_MONTH_NAMES[monthIndex]}`;
}

export function toMonthSlug(monthKey) {
  const raw = normalizeMonthInput(monthKey);
  if (!raw) return "tum";
  const [year, month] = raw.split("-");
  const monthIndex = Number(month) - 1;
  const monthText = String(TR_MONTH_NAMES[monthIndex] || month || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "-");
  return `${year}-${monthText}`;
}

function addMonths(monthKey, add) {
  const normalized = normalizeMonthInput(monthKey);
  if (!normalized) return "";
  const [year, month] = normalized.split("-").map((x) => Number(x));
  const d = new Date(year, month - 1 + add, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthRange(startMonth, endMonth) {
  const start = normalizeMonthInput(startMonth);
  const end = normalizeMonthInput(endMonth);
  if (!start || !end) return [];

  const [sy, sm] = start.split("-").map((x) => Number(x));
  const [ey, em] = end.split("-").map((x) => Number(x));
  const startIndex = sy * 12 + (sm - 1);
  const endIndex = ey * 12 + (em - 1);
  if (endIndex < startIndex) return [];

  const out = [];
  for (let idx = startIndex; idx <= endIndex; idx += 1) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function buildMonthOptions({
  seedKeys = [],
  startMonth = DEFAULT_MONTH_BASE,
  monthsAfterNow = 24,
  descending = true,
} = {}) {
  const set = new Set();

  seedKeys.forEach((key) => {
    const month = normalizeMonthInput(key);
    if (month) set.add(month);
  });

  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const autoEnd = addMonths(nowMonth, Math.max(0, Number(monthsAfterNow) || 0));

  monthRange(startMonth, autoEnd).forEach((month) => set.add(month));

  const sorted = Array.from(set).sort((a, b) =>
    descending ? b.localeCompare(a, "tr") : a.localeCompare(b, "tr"),
  );

  return sorted.map((value) => ({ value, label: toMonthLabel(value) }));
}
