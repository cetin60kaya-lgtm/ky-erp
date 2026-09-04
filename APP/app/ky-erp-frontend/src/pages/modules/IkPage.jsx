import React, { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import {
  BadgeCheck,
  
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock,
  FileText,
  FileSpreadsheet,
  FolderUp,
  LayoutDashboard,
  ListChecks,
  Minus,
  Moon,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Search,
  Sun,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  Zap,
  X,
} from "lucide-react";
import "./ik.css";
import "./ik.safe-row.css";
import IkAdvancedMonthly from "./IkAdvancedMonthly";
import { exportRowsToExcelFile } from "../../utils/excelExport";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import {
  createAylikPersonel,
  createGunlukPersonel,
  deleteGunlukPersonel,
  getAylikPersonel,
  getAylikEvraklar,
  getAylikIzinler,
  getAylikLoglar,
  getAylikMesailer,
  getResmiTatiller,
  getAylikSozlesmeler,
  getIkSkills,
  getGunlukPersonel,
  getGunlukPersonelGunKayitlari,
  getGunlukPersonelListe,
  getGunlukDurum,
  createIkSkill,
  saveResmiTatil,
  saveGunlukDurum,
  saveGunlukPersonelGunKayitlari,
  saveGunlukPersonelListe,
  applyGunlukPersonelGirisExcel,
  uploadGunlukPersonelExcel,
  uploadGunlukPersonelGirisExcel,
  updateGunlukPersonel,
  updateAylikPersonel,
} from "../../services/ikApi";
import { downloadFile } from "../../utils/api";

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatDateOnly(year, month, day) {
  return `${String(year).padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
}

function parseLocalDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function addDaysDateOnly(value, amount) {
  const parsed = parseLocalDateOnly(value);
  if (!parsed) return "";
  const date = new Date(parsed.year, parsed.month - 1, parsed.day + amount);
  return formatDateOnly(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function startOfWeekDateOnly(value) {
  const parsed = parseLocalDateOnly(value);
  if (!parsed) return "";
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  const weekday = date.getDay() || 7;
  return addDaysDateOnly(value, 1 - weekday);
}

function createInclusiveDateRange(start, end) {
  const startParsed = parseLocalDateOnly(start);
  const endParsed = parseLocalDateOnly(end);
  if (!startParsed || !endParsed) return [];
  const startValue = formatDateOnly(startParsed.year, startParsed.month, startParsed.day);
  const endValue = formatDateOnly(endParsed.year, endParsed.month, endParsed.day);
  if (startValue > endValue) return [];
  const days = [];
  for (let cursor = startValue; cursor <= endValue; cursor = addDaysDateOnly(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

const TODAY = (() => {
  const now = new Date();
  return formatDateOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());
})();
const IK_DAILY_DATE_RANGE_KEY = "ikDailyDateRange.v2";
const IK_DAILY_SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
const IK_DAILY_FAST_CHECK_KEY = "ikDailyFastCheck";
const DEFAULT_DAILY_RANGE = (() => {
  const start = startOfWeekDateOnly(TODAY);
  return { start, end: addDaysDateOnly(start, 6) };
})();
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_OFFICIAL_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "Yılbaşı" },
  { date: "2026-03-19", name: "Ramazan Bayramı Arifesi" },
  { date: "2026-03-20", name: "Ramazan Bayramı 1. Gün" },
  { date: "2026-03-21", name: "Ramazan Bayramı 2. Gün" },
  { date: "2026-03-22", name: "Ramazan Bayramı 3. Gün" },
  { date: "2026-04-23", name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { date: "2026-05-01", name: "Emek ve Dayanışma Günü" },
  { date: "2026-05-19", name: "Atatürk'ü Anma Gençlik ve Spor Bayramı" },
  { date: "2026-05-26", name: "Kurban Bayramı Arifesi" },
  { date: "2026-05-27", name: "Kurban Bayramı 1. Gün" },
  { date: "2026-05-28", name: "Kurban Bayramı 2. Gün" },
  { date: "2026-05-29", name: "Kurban Bayramı 3. Gün" },
  { date: "2026-05-30", name: "Kurban Bayramı 4. Gün" },
  { date: "2026-07-15", name: "Demokrasi ve Milli Birlik Günü" },
  { date: "2026-08-30", name: "Zafer Bayramı" },
  { date: "2026-10-28", name: "Cumhuriyet Bayramı Arifesi" },
  { date: "2026-10-29", name: "Cumhuriyet Bayramı" },
];

function readStoredDailyRange() {
  try {
    if (typeof window === "undefined") return DEFAULT_DAILY_RANGE;
    const parsed = JSON.parse(
      window.localStorage.getItem(IK_DAILY_DATE_RANGE_KEY) || "null",
    );
    const start = String(parsed?.startDate || parsed?.start || "").trim();
    const end = String(parsed?.endDate || parsed?.end || "").trim();
    return ISO_DATE_ONLY_PATTERN.test(start) && ISO_DATE_ONLY_PATTERN.test(end)
      ? { start, end }
      : DEFAULT_DAILY_RANGE;
  } catch {
    return DEFAULT_DAILY_RANGE;
  }
}

function readFastCheckKeys() {
  try {
    if (typeof window === "undefined") return [];
    const parsed = JSON.parse(window.localStorage.getItem(IK_DAILY_FAST_CHECK_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFastCheckKeys(keys) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IK_DAILY_FAST_CHECK_KEY, JSON.stringify([...keys]));
  } catch {
    // Local fast-check state is optional.
  }
}

function readStoredSelectedDailyDate() {
  try {
    if (typeof window === "undefined") return "";
    const date = String(window.localStorage.getItem(IK_DAILY_SELECTED_DATE_KEY) || "").trim();
    return date;
  } catch {
    return "";
  }
}

function writeStoredSelectedDailyDate(date) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IK_DAILY_SELECTED_DATE_KEY, String(date));
  } catch {
    // localStorage unavailable; selected date still stays in React state.
  }
}

function writeStoredDailyRange(range) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      IK_DAILY_DATE_RANGE_KEY,
      JSON.stringify({ startDate: range.start, endDate: range.end }),
    );
  } catch {
    // localStorage unavailable; date still stays in React state.
  }
}
const DEFAULT_SGK_BANK_AMOUNT = 28075.5;
const MIN_WAGE_BASE = DEFAULT_SGK_BANK_AMOUNT;
const DAILY_WORK_HOURS = 10;
const DEFAULT_ANNUAL_LEAVE_DAYS = 14;
const PAYMENT_SLIPS_PER_PAGE = 10;
const DAILY_PAYMENT_SLIPS_PER_PAGE = 10;
const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const CURRENT_YEAR = Number(TODAY.slice(0, 4)) || new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) =>
  String(CURRENT_YEAR - 5 + index),
);
const ADDITION_ADJUSTMENT_TYPES = ["Mesai", "Yol farkı", "Maaş farkı"];
const DEDUCTION_ADJUSTMENT_TYPES = ["Kesinti", "Avans", "Devamsızlık"];

const TAB_MAP = {
  ozet: "overview",
  "ik-ozet": "overview",
  "ik-yonetim-ozeti": "overview",
  "aylik-personel": "monthly-cards",
  "bordro-odeme": "advanced-bordro",
  "izin-mesai-kesinti": "monthly-leave",
  "ik-raporlari": "daily-weekly",
  "gunluk-personel": "daily-entry",
  "ay-genel-kontrol": "overview",
  "genel-kontrol": "overview",
  "monthly-overview": "overview",
  "ay-personel-kartlari": "monthly-cards",
  "personel-kartlari": "monthly-cards",
  "monthly-personnel": "monthly-cards",
  "puantaj-izin": "monthly-leave",
  "ay-maas-sozlesme": "monthly-contract",
  "maas-sozlesme": "monthly-contract",
  "yillik-izin": "monthly-leave",
  "ay-izin-evrak": "monthly-leave",
  "izin-evrak": "monthly-leave",
  "monthly-leave-management": "monthly-leave",
  "puantaj-kart-takibi": "monthly-leave",
  "sgk-bordro-aktarim": "advanced-kapanis",
  "sgk-bordro-aktirim": "advanced-kapanis",
  "sgk-evrak-kontrol": "advanced-kapanis",
  "aylik-ik-kapanis": "advanced-kapanis",
  "ay-mesai-avans": "monthly-adjustments",
  "mesai-avans": "monthly-adjustments",
  "mesai-kesinti": "monthly-adjustments",
  "monthly-work-advance": "monthly-adjustments",
  "ay-bordro": "advanced-bordro",
  bordro: "advanced-bordro",
  "monthly-payroll": "advanced-bordro",
  "ay-odeme": "advanced-bordro",
  "monthly-payment": "advanced-bordro",
  "ay-evrak": "advanced-kapanis",
  "evrak-belgeler": "advanced-kapanis",
  "gunluk-personel-kartlari": "daily-cards",
  "gun-personel-kartlari": "daily-cards",
  "daily-personnel": "daily-cards",
  "gun-giris": "daily-entry",
  "gunluk-giris": "daily-entry",
  "daily-entry": "daily-entry",
  "gun-haftalik-ozet": "daily-weekly",
  "haftalik-ozet": "daily-weekly",
  "daily-weekly-summary": "daily-weekly",
  "gun-odemeler": "daily-payments",
  "gunluk-odeme-fisleri": "daily-payments",
  odemeler: "daily-payments",
  "daily-payments": "daily-payments",
};

const NAV_GROUPS = [
  {
    title: "İK Yönetimi",
    items: [
      { key: "overview", label: "İK Özet", icon: LayoutDashboard },
      { key: "monthly-cards", label: "Personel Kartı", icon: Users },
      { key: "monthly-adjustments", label: "Mesai • Avans • Kesinti", icon: Clock },
      { key: "monthly-leave", label: "Yıllık İzin / Günlük Durum", icon: CalendarDays },
      { key: "advanced-bordro", label: "Bordro & Ödeme", icon: WalletCards },
      { key: "advanced-kapanis", label: "SGK • Evrak • Ay Sonu", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Günlük Personel",
    items: [
      { key: "daily-entry", label: "Günlük Giriş", icon: ClipboardList },
      {
        key: "daily-cards",
        label: "Günlük Personel Kartları",
        icon: UserRound,
      },
      { key: "daily-weekly", label: "Haftalık Özet", icon: CalendarDays },
      {
        key: "daily-payments",
        label: "Günlük Ödeme Fişleri",
        icon: ReceiptText,
      },
    ],
  },
];

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let cleaned = String(value ?? "")
    .trim()
    .replace(/[₺\s]/g, "");
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }
  const numberValue = Number(cleaned);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeMonthlyCode(value) {
  const raw = String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR");
  if (!raw) return "";
  if (raw.startsWith("AY-")) return `HKN-${raw.slice(3)}`;
  return raw.startsWith("HKN-") ? raw : `HKN-${raw}`;
}

function nextMonthlyCodeFromRows(rows = []) {
  const max = rows.reduce((currentMax, person) => {
    const match = String(person.personnelCode || person.code || "").match(/(\d+)$/);
    if (!match) return currentMax;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > currentMax ? value : currentMax;
  }, 0);
  return `HKN-${String(max + 1).padStart(2, "0")}`;
}

function normalizeMonthlyPerson(row = {}) {
  const normalized = {
    ...row,
    id: row?.id,
    fullName: row?.fullName || row?.adSoyad || "",
    personnelCode: normalizeMonthlyCode(
      row?.personnelCode || row?.code || row?.personelKodu,
    ),
    department: row?.department || "",
    title: row?.title || "",
    workType: row?.workType || "Aylık",
    sgkStatus: row?.sgkStatus === "YOK" ? "YOK" : "VAR",
    status: row?.status || "Aktif",
    startDate:
      row?.startDate || row?.hireDate?.slice?.(0, 10) || row?.hireDate || "",
    salary: toNumber(row?.salary),
    roadAllowance: toNumber(row?.roadAllowance),
    paymentChannel:
      row?.paymentChannel || row?.bankPaymentType || "Banka + Elden",
    bankAmount: toNumber(row?.bankAmount),
    cashAmount: toNumber(row?.cashAmount),
    annualLeaveEntitlement: toNumber(
      row?.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
    ),
    annualLeaveCarryover: toNumber(row?.annualLeaveCarryover),
    overtimeBaseHours: toNumber(
      row?.overtimeBaseHours || row?.overtimeHourlyBase || 225,
    ),
    note: row?.note || "",
  };
  return normalizeMonthlyPaymentAmounts(normalized);
}

function isCashOnlyPaymentChannel(paymentChannel) {
  const text = String(paymentChannel || "").toLocaleLowerCase("tr-TR");
  return text.includes("elden") && !text.includes("banka");
}

function isSgkCovered(person = {}) {
  return String(person?.sgkStatus || "VAR").toLocaleUpperCase("tr-TR") !== "YOK";
}

function resolveMonthlyBankAmount(person = {}, total = 0, options = {}) {
  const totalAmount = Math.max(0, toNumber(total));
  if (!isSgkCovered(person)) return 0;
  if (isCashOnlyPaymentChannel(person.paymentChannel || person.bankPaymentType)) return 0;
  const enteredBank = Math.max(0, toNumber(person.bankAmount));
  const defaultBank = Math.min(totalAmount, DEFAULT_SGK_BANK_AMOUNT);
  const hasManualBank =
    options.manual === true ||
    person.bankAmountManual === true ||
    enteredBank > 0;
  return Math.min(totalAmount, hasManualBank ? enteredBank : defaultBank);
}

function normalizeMonthlyPaymentAmounts(person = {}, totalOverride = null, options = {}) {
  const total =
    totalOverride === null || totalOverride === undefined
      ? toNumber(person.salary) + toNumber(person.roadAllowance)
      : toNumber(totalOverride);
  const bankAmount = resolveMonthlyBankAmount(person, total, options);
  const cashAmount = Math.max(total - bankAmount, 0);
  const paymentChannel =
    bankAmount > 0 && cashAmount > 0
      ? "Banka + Elden"
      : bankAmount > 0
        ? "Banka"
        : "Elden";
  return {
    ...person,
    sgkStatus: isSgkCovered(person) ? "VAR" : "YOK",
    bankAmount: roundCurrency(bankAmount),
    cashAmount: roundCurrency(cashAmount),
    paymentChannel,
    bankPaymentType: paymentChannel,
  };
}

function normalizeDailyPerson(row = {}) {
  const role =
    row?.role ||
    row?.qualification ||
    row?.vasif ||
    row?.activeSkill ||
    row?.primarySkill ||
    row?.skillName ||
    row?.qualification ||
    row?.title ||
    "";
  return {
    ...row,
    id: row?.id,
    name: row?.fullName || row?.name || row?.adSoyad || "",
    role: standardSkillName(role) || role,
    dayRate: toNumber(row?.dayRate ?? row?.dayWage ?? row?.daytimeWage ?? row?.gunduzUcreti),
    nightRate: toNumber(row?.nightRate ?? row?.nightWage ?? row?.nighttimeWage ?? row?.geceUcreti),
    broker: row?.broker || row?.araci || row?.source || "Direkt",
    personnelNo: row?.personnelNo || row?.personelNo || "",
    note: row?.note || row?.not || "",
    active:
      row?.active ??
      row?.aktif ??
      !["PASSIVE", "PASIF", "PASİF"].includes(
        String(row?.status || row?.varsayilanDurum || "").toLocaleUpperCase("tr-TR"),
      ),
  };
}

function normalizeLeave(row = {}) {
  return {
    id: row?.id,
    personId: row?.personId || row?.employeeId || "",
    type: row?.type || row?.recordType || "Yıllık izin",
    effect: row?.effect || row?.effectType || "Yıllık izinden düş",
    start: row?.start || row?.startDate?.slice?.(0, 10) || "",
    end: row?.end || row?.endDate?.slice?.(0, 10) || "",
    days: toNumber(row?.days ?? row?.dayCount),
    description: row?.description || row?.note || "",
    document: row?.document || row?.documentPath || "",
  };
}

function normalizeAdjustment(row = {}) {
  const type = row?.type || row?.adjustmentType || "Mesai";
  return {
    id: row?.id,
    personId: row?.personId || row?.employeeId || "",
    date: row?.date?.slice?.(0, 10) || row?.date || TODAY,
    type,
    amount: toNumber(row?.amount),
    hours: toNumber(row?.hours ?? row?.hourOrDay),
    amountManual: Boolean(row?.amountManual),
    overtimeMode: row?.overtimeMode || "AUTO",
    overtimeMultiplier: toNumber(row?.overtimeMultiplier),
    payrollEffect: payrollEffectForType(type, row?.payrollEffect),
    status: row?.status || "Taslak",
    note: row?.note || "",
  };
}

function normalizeDocument(row = {}) {
  return {
    id: row?.id,
    personId: row?.personId || row?.employeeId || "",
    type: row?.type || row?.documentType || "Evrak",
    file: row?.file || row?.fileName || row?.filePath || "",
    date: row?.date?.slice?.(0, 10) || row?.createdAt?.slice?.(0, 10) || TODAY,
    status: row?.status || "Bekliyor",
  };
}

function normalizeDailyEntry(row = {}) {
  return {
    day: Boolean(row?.day ?? row?.dayShift),
    night: Boolean(row?.night ?? row?.nightShift),
  };
}

function buildDailyWeekOptions(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const date = row?.workDate?.slice?.(0, 10) || row?.workDate || row?.date;
    const dateText = dateOnlyText(date);
    const weekStart = startOfWeekDateOnly(dateText);
    if (!weekStart) return;
    const day = Boolean(row?.day ?? row?.dayShift);
    const night = Boolean(row?.night ?? row?.nightShift);
    const amount =
      row?.totalAmount !== undefined
        ? toNumber(row?.totalAmount)
        : (day ? toNumber(row?.dayWage) : 0) + (night ? toNumber(row?.nightWage) : 0);
    if (!day && !night && amount <= 0) return;
    const current = map.get(weekStart) || {
      id: weekStart,
      start: weekStart,
      end: addDaysDateOnly(weekStart, 6),
      firstDate: dateText,
      lastDate: dateText,
      rows: 0,
      people: new Set(),
      dayCount: 0,
      nightCount: 0,
      total: 0,
    };
    current.rows += 1;
    if (row?.employeeId) current.people.add(row.employeeId);
    if (day) current.dayCount += 1;
    if (night) current.nightCount += 1;
    current.total += amount;
    current.firstDate = current.firstDate < dateText ? current.firstDate : dateText;
    current.lastDate = current.lastDate > dateText ? current.lastDate : dateText;
    map.set(weekStart, current);
  });
  return [...map.values()]
    .map((row) => ({
      ...row,
      peopleCount: row.people.size,
      people: undefined,
    }))
    .sort((left, right) => right.start.localeCompare(left.start));
}

function monthlyPayload(person, activeMainCompany) {
  const paymentTotal = toNumber(person.total) || null;
  const normalized = normalizeMonthlyPaymentAmounts(person, paymentTotal, {
    manual: person.bankAmountManual === true,
  }, []);
  return {
    mainCompanyId:
      activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan",
    personnelCode: normalizeMonthlyCode(normalized.personnelCode),
    code: normalizeMonthlyCode(normalized.personnelCode),
    fullName: normalized.fullName,
    department: normalized.department,
    title: normalized.title,
    workType: normalized.workType,
    sgkStatus: normalized.sgkStatus,
    status: normalized.status,
    startDate: normalized.startDate,
    hireDate: normalized.startDate,
    salary: toNumber(normalized.salary),
    roadAllowance: toNumber(normalized.roadAllowance),
    paymentChannel: normalized.paymentChannel,
    bankPaymentType: normalized.paymentChannel,
    bankAmount: toNumber(normalized.bankAmount),
    cashAmount: toNumber(normalized.cashAmount),
    annualLeaveEntitlement: toNumber(
      normalized.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
    ),
    annualLeaveCarryover: toNumber(normalized.annualLeaveCarryover),
    overtimeBaseHours: toNumber(normalized.overtimeBaseHours),
    overtimeHourlyBase: toNumber(normalized.overtimeBaseHours),
    note: normalized.note,
  };
}

function dailyPersonPayload(person, companyId) {
  return {
    mainCompanyId: companyId,
    fullName: person.name,
    skillId: person.skillId || "",
    qualification: person.role,
    dayWage: toNumber(person.dayRate),
    nightWage: toNumber(person.nightRate),
    broker: person.broker || "Direkt",
    personnelNo: person.personnelNo || "",
    note: person.note || "",
    status: person.active ? "ACTIVE" : "PASSIVE",
  };
}

function emptyDailyPersonForm(companyId) {
  return {
    id: "",
    mainCompanyId: companyId,
    name: "",
    personnelNo: "",
    role: "Makinacı",
    broker: "Direkt",
    note: "",
    dayRate: 0,
    nightRate: 0,
    active: true,
  };
}

function dailyPersonFormFromPerson(person = {}, companyId) {
  return {
    ...emptyDailyPersonForm(companyId),
    ...person,
    role: standardSkillName(person.role) || person.role || "Diğer",
    dayRate: toNumber(person.dayRate),
    nightRate: toNumber(person.nightRate),
    active: person.active !== false,
  };
}

function shiftHasWage(person = {}, shiftMode = "day") {
  return shiftMode === "day"
     ? toNumber(person.dayRate) > 0
    : toNumber(person.nightRate) > 0;
}

function shiftWageWarning(person = {}, shiftMode = "day") {
  if (shiftHasWage(person, shiftMode)) return "";
  return shiftMode === "day"
     ? "Gündüz ücreti tanımlı değil"
    : "Gece ücreti tanımlı değil";
}

function wageEligibilityLabel(value, rate) {
  return toNumber(rate) > 0 ? value : "Ücret Yok";
}

function formatTRY(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatTRYDetailed(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function roundCurrency(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function payrollEffectForType(type, fallback = "Bordroya ekle") {
  if (fallback === "Yıllık izinden düş") return "Yıllık izinden düş";
  if (fallback === "Sadece kayıt") return "Sadece kayıt";
  if (ADDITION_ADJUSTMENT_TYPES.includes(type)) return "Bordroya ekle";
  if (DEDUCTION_ADJUSTMENT_TYPES.includes(type)) return "Bordrodan düş";
  return fallback || "Sadece not";
}

function adjustmentDirection(row = {}) {
  if (row.payrollEffect === "Yıllık izinden düş") return 0;
  if (row.payrollEffect === "Sadece kayıt") return 0;
  if (ADDITION_ADJUSTMENT_TYPES.includes(row?.type)) return 1;
  if (DEDUCTION_ADJUSTMENT_TYPES.includes(row?.type)) return -1;
  if (row.payrollEffect === "Bordroya ekle") return 1;
  if (row.payrollEffect === "Bordrodan düş") return -1;
  return 0;
}

function adjustmentHourlyRate(person = {}) {
  const baseHours = Math.max(1, toNumber(person.overtimeBaseHours || 225));
  return toNumber(person.salary) / baseHours;
}

function dateOnlyText(value) {
  return String(value || "").slice(0, 10);
}

function officialHolidayMap(holidays = []) {
  const rows = holidays.length ? holidays : DEFAULT_OFFICIAL_HOLIDAYS_2026;
  return new Map(
    rows
      .filter((row) => row?.active !== false && row?.aktif !== false)
      .map((row) => [dateOnlyText(row?.date || row?.tarih), row?.name || row?.ad || "Resmi tatil"]),
  );
}

function automaticOvertimeType(date, holidays = []) {
  const dateText = dateOnlyText(date);
  const holiday = officialHolidayMap(holidays).get(dateText);
  if (holiday) {
    return {
      key: "OFFICIAL_100",
      multiplier: 2,
      label: "Resmi tatil %100 mesai",
      shortLabel: "Resmi tatil %100",
      holiday,
    };
  }
  const parsed = parseLocalDateOnly(dateText);
  if (!parsed) {
    return {
      key: "WEEKDAY_50",
      multiplier: 1.5,
      label: "Hafta içi %50 mesai",
      shortLabel: "Hafta içi %50",
    };
  }
  const day = new Date(parsed.year, parsed.month - 1, parsed.day).getDay();
  if (day === 0 || day === 6) {
    return {
      key: "WEEKEND_100",
      multiplier: 2,
      label: "Hafta sonu %100 mesai",
      shortLabel: "Hafta sonu %100",
    };
  }
  return {
    key: "WEEKDAY_50",
    multiplier: 1.5,
    label: "Hafta içi %50 mesai",
    shortLabel: "Hafta içi %50",
  };
}

function resolveOvertimeType(date, holidays = [], mode = "AUTO") {
  if (mode === "WEEKDAY_50") {
    return {
      key: "WEEKDAY_50",
      multiplier: 1.5,
      label: "Hafta içi %50 mesai",
      shortLabel: "Hafta içi %50",
    };
  }
  if (mode === "WEEKEND_100") {
    return {
      key: "WEEKEND_100",
      multiplier: 2,
      label: "Hafta sonu / resmi tatil %100 mesai",
      shortLabel: "Hafta sonu / resmi tatil %100",
    };
  }
  return automaticOvertimeType(date, holidays);
}

function shouldAutoCalculateAdjustment(type) {
  return ["Mesai", "Kesinti", "Devamsızlık", "Yol farkı", "Maaş farkı"].includes(type);
}

function calculateAdjustmentAmount(
  type,
  hours,
  person = {},
  dayMode = "Saatlik",
  options = {},
) {
  const quantity = Math.max(0, toNumber(hours));
  if (quantity <= 0) return 0;
  if (type === "Mesai") {
    return adjustmentHourlyRate(person) * quantity * toNumber(options.multiplier || 1.5);
  }
  if (["Kesinti", "Devamsızlık"].includes(type)) {
    const dayCount = dayMode === "Saatlik" ? quantity / DAILY_WORK_HOURS : quantity / DAILY_WORK_HOURS;
    const dailySalary = toNumber(person.salary) / 30;
    const dailyRoad = toNumber(person.roadAllowance) / 30;
    return (dailySalary + dailyRoad) * dayCount;
  }
  if (type === "Yol farkı") {
    return (toNumber(person.roadAllowance) / 30) * quantity;
  }
  return adjustmentHourlyRate(person) * quantity;
}

function annualLeaveDaysFromAdjustment(row = {}) {
  if (row?.payrollEffect !== "Yıllık izinden düş") return 0;
  return Math.max(0, toNumber(row?.hours) / DAILY_WORK_HOURS);
}

function annualLeaveUsedForPerson(personId, leaves = [], adjustments = []) {
  const leaveDays = leaves
    .filter(
      (leave) =>
        leave.personId === personId && leave.effect === "Yıllık izinden düş",
    )
    .reduce((sum, leave) => sum + toNumber(leave.days), 0);
  const adjustmentDays = adjustments
    .filter((row) => row.personId === personId)
    .reduce((sum, row) => sum + annualLeaveDaysFromAdjustment(row), 0);
  return leaveDays + adjustmentDays;
}

function recordYear(value) {
  return String(value || "").slice(0, 4);
}

function recordMonth(value) {
  return String(value || "").slice(5, 7);
}

function monthNumberFromName(name) {
  const index = MONTH_NAMES.indexOf(name);
  return index >= 0 ? index + 1 : 0;
}

function adjustmentInYearMonth(row, year, monthName) {
  const yearText = String(year || "");
  const monthNumber = monthNumberFromName(monthName);
  const monthText = String(monthNumber).padStart(2, "0");
  if (!yearText || !monthNumber) return true;
  return recordYear(row.date) === yearText && recordMonth(row?.date) === monthText;
}

function leaveInYear(leave, year) {
  if (!year) return true;
  return recordYear(leave.start) === String(year) || recordYear(leave.end) === String(year);
}

function annualLeaveUsedForPersonInYear(
  personId,
  year,
  leaves = [],
  adjustments = [],
) {
  const leaveDays = leaves
    .filter(
      (leave) =>
        leave.personId === personId &&
        leave.effect === "Yıllık izinden düş" &&
        leaveInYear(leave, year),
    )
    .reduce((sum, leave) => sum + toNumber(leave.days), 0);
  const adjustmentDays = adjustments
    .filter(
      (row) =>
        row.personId === personId &&
        (!year || recordYear(row.date) === String(year)),
    )
    .reduce((sum, row) => sum + annualLeaveDaysFromAdjustment(row), 0);
  return leaveDays + adjustmentDays;
}

function leaveDayRows(leaves = [], people = []) {
  const personMap = new Map(people.map((person) => [person.id, person]));
  return leaves.flatMap((leave) =>
    daysBetween(leave.start, leave.end).map((date) => {
      const person = personMap.get(leave.personId);
      return {
        id: `${leave.id}-${date}`,
        leaveId: leave.id,
        personId: leave.personId,
        personName: person.fullName || "-",
        personnelCode: person.personnelCode || "",
        date,
        type: leave.type,
        effect: leave.effect,
        document: leave.document,
        description: leave.description,
      };
    }),
  );
}

function daysBetween(start, end) {
  return createInclusiveDateRange(start, end);
}

function leaveRangeBreakdown(start, end, holidays = []) {
  const days = daysBetween(start, end);
  const holidayMap = officialHolidayMap(holidays);
  const weekendDates = [];
  const holidayDates = [];
  const weekDayDates = [];
  days.forEach((dateText) => {
    const parsed = parseLocalDateOnly(dateText);
    if (parsed) {
      const weekday = new Date(parsed.year, parsed.month - 1, parsed.day).getDay();
      if (weekday === 0 || weekday === 6) weekendDates.push(dateText);
      else weekDayDates.push(dateText);
    }
    if (holidayMap.has(dateText)) holidayDates.push(dateText);
  });
  const excludedDates = new Set([...weekendDates, ...holidayDates]);
  const annualLeaveDates = days.filter((dateText) => !excludedDates.has(dateText));
  return {
    totalDays: days.length,
    weekDays: weekDayDates.length,
    weekendDays: weekendDates.length,
    officialHolidayDays: holidayDates.length,
    excludedDays: excludedDates.size,
    annualLeaveDays: annualLeaveDates.length,
    holidayNames: holidayDates.map((dateText) => holidayMap.get(dateText)).filter(Boolean),
  };
}

function entryHasWork(entry = {}) {
  return Boolean(entry.day || entry.night);
}

function personHasWorkInRange(personId, entries = {}, start, end) {
  return daysBetween(start, end).some((date) =>
    entryHasWork(entries[`${personId}-${date}`]),
  );
}

function personHasWorkOnDate(personId, entries = {}, date) {
  if (!date) return false;
  return entryHasWork(entries[`${personId}-${date}`]);
}


function normalizeSkillName(value) {
  return String(value || "").trim();
}

function skillKey(value) {
  return normalizeSkillName(value)
    .replace(/[ıİIi]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
      .toUpperCase();
}

function standardSkillName(value) {
  const key = skillKey(value).replace(/LAR$|LER$/i, "");
  if (key.includes("MAK")) return "Makinacı";
  if (key.includes("SER")) return "Serimci";
  if (key.includes("BOYA")) return "Boyacı";
  if (key.includes("VASIFSIZ") || key.includes("VASIFSZ")) return "Vasıfsız";
  if (!key) return "";
  return "Diğer";
}

function skillGroupLabel(value) {
  return standardSkillName(value) || "Vasıf Yok / Tanımsız";
}

function canonicalSkillForPerson(person = {}, skills = []) {
  const raw = standardSkillName(person.role) || normalizeSkillName(person.role);
  if (!raw) return { id: "", name: "" };
  const key = skillKey(raw).replace(/LAR$|LER$/i, "");
  const safeSkills = skills.filter(Boolean);
  return (
    safeSkills.find((skill) => skill.id === person.skillId) ||
    safeSkills.find((skill) => skillKey(skill.name).replace(/LAR$|LER$/i, "") === key) ||
    { id: "", name: raw }
  );
}

function personSkillName(person = {}, skills = []) {
  return canonicalSkillForPerson(person, skills).name || standardSkillName(person.role) || "Vasıf Yok / Tanımsız";
}

function personSkillGroupTitle(person = {}, skills = []) {
  const skill = canonicalSkillForPerson(person, skills);
  if (skill?.name) return standardSkillName(skill.name) || skill.name;
  if (!normalizeSkillName(person.role)) return "Vasıf Yok / Tanımsız";
  return skillGroupLabel(person.role);
}

function skillGroupSortValue(label) {
  const key = skillKey(label);
  if (key === "MAKINACI" || key === "MAKiNACI") return "01";
  if (key === "SERIMCI" || key === "SERiMCI") return "02";
  if (key === "BOYACI") return "03";
  if (key === "VASIFSIZ" || key === "VASIFSIZ") return "98";
  if (key === "VASIF YOK / TANIMSIZ" || key === "VASIF YOK / TANIMSIZ") return "99";
  return `50-${label.toLocaleLowerCase("tr-TR")}`;
}

function skillFilterMatches(person, filter, skills = []) {
  if (!filter) return true;
  const label = personSkillGroupTitle(person, skills);
  const skill = canonicalSkillForPerson(person, skills);
  if (filter === "other") {
    return label === "Diğer";
  }
  return label === filter || skill?.id === filter || skill?.name === filter;
}

function compactMoney(value) {
  const number = toNumber(value);
  return number > 0 ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(number) : "-";
}

function shortDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return day && month && year ? `${day}.${month}.${String(year).slice(2)}` : value;
}

function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("");
}

function calculatePayroll(person, adjustmentRows) {
  const additions = adjustmentRows
    .filter((row) => row.personId === person.id && adjustmentDirection(row) > 0)
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const deductions = adjustmentRows
    .filter((row) => row.personId === person.id && adjustmentDirection(row) < 0)
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const total =
    toNumber(person.salary) +
    toNumber(person.roadAllowance) +
    additions -
    deductions;
  const bank = resolveMonthlyBankAmount(person, total);
  const cash = Math.max(total - bank, 0);

  return { additions, deductions, total, bank, cash };
}

function Input({ label, children, wide = false }) {
  return (
    <label className={wide ? "kyik-field wide" : "kyik-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} />;
}

function SelectInput({ children, ...props }) {
  return <select {...props}>{children}</select>;
}

function SkillSelect({
  value,
  onChange,
  skills = [],
  onCreateSkill,
  companyId,
  allowCreate = true,
}) {
  const activeSkills = skills.filter((skill) => skill && skill.active !== false);
  const selected =
    activeSkills.find((skill) => skill.id === value || skill.name === value) ||
    activeSkills.find((skill) => skill.name === value);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    groupTitle: "",
    sortOrder: 500,
    active: true,
  });
  const [notice, setNotice] = useState("");
  const saveNewSkill = async () => {
    if (!form.name.trim() || !onCreateSkill) return;
    try {
      const saved = await onCreateSkill({
        ...form,
        mainCompanyId: companyId,
      });
      onChange?.(saved);
      setForm({ name: "", groupTitle: "", sortOrder: 500, active: true });
      setCreating(false);
      setNotice("");
    } catch (error) {
      setNotice(error?.message || "Vasıf eklenemedi.");
    }
  };
  return (
    <div className="kyik-skill-select">
      <SelectInput
        value={selected?.id || ""}
        onChange={(event) => {
          const skill = activeSkills.find((item) => item.id === event?.target.value);
          onChange?.(skill || null);
        }}
      >
        <option value="">Vasıf Yok / Tanımsız</option>
        {activeSkills.map((skill, index) => (
          <option key={skill.id || skill.name || index} value={skill.id || ""}>
            {skill.name || "Tanımsız"} - {skill.groupTitle || "Genel"}
          </option>
        ))}
      </SelectInput>
      {allowCreate ? (
        <button type="button" onClick={() => setCreating((current) => !current)}>
          + Yeni Vasıf Ekle
        </button>
      ) : null}
      {creating ? (
        <div className="kyik-skill-create">
          <input
            placeholder="Vasıf adı"
            value={form.name}
            onChange={(event) =>
              setForm({
                ...form,
                name: event?.target.value,
                groupTitle: form.groupTitle || `${event?.target.value} Grubu`,
              })
            }
          />
          <input
            placeholder="Grup başlığı"
            value={form.groupTitle}
            onChange={(event) => setForm({ ...form, groupTitle: event?.target.value })}
          />
          <input
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: toNumber(event?.target.value) })}
          />
          <label>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event?.target.checked })}
            />
            Aktif
          </label>
          <Button icon={Save} onClick={saveNewSkill}>Ekle</Button>
          {notice ? <small>{notice}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function TextArea(props) {
  return <textarea {...props} />;
}

function Button({ icon: Icon, children, tone = "default", ...props }) {
  return (
    <button className={`kyik-btn ${tone}`} type="button" {...props}>
      {Icon ? <Icon size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`kyik-panel ${className}`}>
      <div className="kyik-panel-head">
        <div>
          <h3>
            {Icon ? <Icon size={18} /> : null}
            {title}
          </h3>
        </div>
        {action || null}
      </div>
      {children}
    </section>
  );
}

function Badge({ children, tone = "blue" }) {
  return <span className={`kyik-badge ${tone}`}>{children}</span>;
}

function Stat({ icon, label, value, sub }) {
  return (
    <div className="kyik-stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {sub ? <small>{sub}</small> : null}
      </div>
      {React.createElement(icon, { size: 22 })}
    </div>
  );
}

function Table({
  columns,
  rows,
  empty = "Henüz kayıt yok. Yukarıdaki formdan veya hızlı kayıt butonundan yeni kayıt ekleyebilirsiniz.",
}) {
  const safeColumns = Array.isArray(columns) ? columns.filter(Boolean) : [];
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  return (
    <div className="kyik-table-wrap">
      <table className="kyik-table">
        <thead>
          <tr>
            {safeColumns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length ? (
            safeRows.map((row) => (
              <tr
                key={row?.id || row?.key}
                className={row?.onClick ? "clickable" : ""}
                onClick={row?.onClick || undefined}
              >
                {safeColumns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="kyik-empty-cell" colSpan={Math.max(1, safeColumns.length)}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PersonList({ people, selectedId, onSelect, type = "monthly" }) {
  const [search, setSearch] = useState("");
  const visiblePeople = people.filter((person) =>
    `${person.fullName || person.name || ""} ${person.personnelCode || ""} ${person.department || person.broker || ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  return (
    <aside className="kyik-person-rail">
      <div className="kyik-person-rail-head">
        <strong>
          {type === "monthly"
             ? "Aylık Personel Listesi"
            : "Günlük Personel Listesi"}
        </strong>
        <span>
          {visiblePeople.length} / {people.length} kayıt
        </span>
      </div>
      <div className="kyik-person-list-search">
        <Search size={15} />
        <input
          placeholder="Personel ara"
          value={search}
          onChange={(event) => setSearch(event?.target.value)}
        />
      </div>
      <div className="kyik-person-list">
        {visiblePeople.map((person) => (
          <button
            className={`kyik-person-row ${selectedId === person.id ? "active" : ""}`}
            key={person.id}
            type="button"
            onClick={() => onSelect(person.id)}
          >
            <span className="kyik-avatar">
              {initials(person.fullName || person.name)}
            </span>
            <span>
              <strong>{person.fullName || person.name}</strong>
              <small>
                {person.personnelCode || person.role} ·{" "}
                {person.department || person.broker}
              </small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function MonthlyCardEditor({
  person,
  onChange,
  onSave,
  onCreate,
  onDeactivate,
  busy = false,
  notice = "",
  skills = [],
  companyId,
  onCreateSkill,
}) {
  const sgkCovered = isSgkCovered(person);
  const update = (key, value) => {
    if (key === "paymentChannel" && !sgkCovered) return;
    const patch =
      key === "sgkStatus" && value === "YOK"
        ? { sgkStatus: "YOK", paymentChannel: "Elden", bankPaymentType: "Elden", bankAmount: 0 }
        : { [key]: key === "personnelCode" ? normalizeMonthlyCode(value) : value };
    onChange({
      ...person,
      ...patch,
    });
  };

  return (
    <Panel title="Aylık Personel Kartı" icon={UserRound}>
      {notice ? <div className="kyik-save-notice">{notice}</div> : null}
      <div className="kyik-form-grid three">
        <Input label="Ad soyad">
          <TextInput
            value={person.fullName}
            onChange={(e) => update("fullName", e.target.value)}
          />
        </Input>
        <Input label="Personel kodu">
          <TextInput
            value={person.personnelCode}
            readOnly
            onChange={(e) => update("personnelCode", e.target.value)}
          />
        </Input>
        <Input label="Departman">
          <TextInput
            value={person.department}
            onChange={(e) => update("department", e.target.value)}
          />
        </Input>
        <Input label="Görev">
          <SkillSelect
            value={canonicalSkillForPerson({ role: person.title }, skills).id || ""}
            skills={skills}
            companyId={companyId}
            onCreateSkill={onCreateSkill}
            onChange={(skill) => update("title", skill?.name || "")}
          />
        </Input>
        <Input label="Çalışma tipi">
          <SelectInput
            value={person.workType}
            onChange={(e) => update("workType", e.target.value)}
          >
            <option>Aylık</option>
            <option>Sözleşmeli</option>
            <option>Deneme</option>
          </SelectInput>
        </Input>
        <Input label="SGK">
          <SelectInput
            value={person.sgkStatus}
            onChange={(e) => update("sgkStatus", e.target.value)}
          >
            <option>VAR</option>
            <option>YOK</option>
          </SelectInput>
        </Input>
        <Input label="Durum">
          <SelectInput
            value={person.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option>Aktif</option>
            <option>Pasif</option>
            <option>İzinli</option>
          </SelectInput>
        </Input>
        <Input label="İşe giriş tarihi">
          <TextInput
            type="date"
            value={person.startDate}
            onChange={(e) => update("startDate", e.target.value)}
          />
        </Input>
        <Input label="Maaş kısa bilgi">
          <TextInput
            type="number"
            value={person.salary}
            onChange={(e) => update("salary", toNumber(e.target.value))}
          />
        </Input>
        <Input label="Yol kısa bilgi">
          <TextInput
            type="number"
            value={person.roadAllowance}
            onChange={(e) => update("roadAllowance", toNumber(e.target.value))}
          />
        </Input>
        <Input label="Banka / Elden">
          <SelectInput
            value={sgkCovered ? person.paymentChannel : "Elden"}
            disabled={!sgkCovered}
            onChange={(e) => update("paymentChannel", e.target.value)}
          >
            <option>Elden</option>
            {sgkCovered ? (
              <>
                <option>Banka</option>
                <option>Banka + Elden</option>
              </>
            ) : null}
          </SelectInput>
        </Input>
        <Input label="Mesai saat tabanı">
          <TextInput
            type="number"
            value={person.overtimeBaseHours}
            onChange={(e) =>
              update("overtimeBaseHours", toNumber(e.target.value))
            }
          />
        </Input>
        <Input label="Not" wide>
          <TextArea
            value={person.note}
            onChange={(e) => update("note", e.target.value)}
          />
        </Input>
      </div>
      <div className="kyik-action-row">
        <Button icon={Plus} onClick={onCreate} disabled={busy}>
          Yeni Personel
        </Button>
        <Button icon={Save} tone="primary" onClick={onSave} disabled={busy}>
          {busy ? "Kaydediliyor..." : "Kartı Kaydet"}
        </Button>
        {onDeactivate ? (
          <Button icon={Minus} onClick={onDeactivate} disabled={busy}>
            Pasif Yap
          </Button>
        ) : null}
        <Button icon={BadgeCheck} onClick={onSave} disabled={busy}>
          Durumu Kontrol Et
        </Button>
      </div>
    </Panel>
  );
}

function Overview({ monthly, daily, adjustments, leaves }) {
  const payrollTotal = monthly.reduce(
    (sum, person) => sum + calculatePayroll(person, adjustments).total,
    0,
  );
  const sgkCount = monthly.filter(
    (person) => person.sgkStatus === "VAR",
  ).length;
  const leaveDays = leaves.reduce(
    (sum, leave) => sum + toNumber(leave.days),
    0,
  );
  const dayCapacity = daily.filter((person) => person.active).length;

  return (
    <div className="kyik-screen">
      <div className="kyik-title-band">
        <div>
          <span>İK Yönetim Özeti</span>
          <h2>Aylık bordro, günlük giriş ve izin kontrolü tek ekranda.</h2>
        </div>
        <Badge tone="green">{TODAY}</Badge>
      </div>
      <div className="kyik-stat-grid">
        <Stat
          icon={Users}
          label="Aylık personel"
          value={monthly.length}
          sub={`${sgkCount} SGK kayıtlı`}
        />
        <Stat
          icon={UserRound}
          label="Günlük personel"
          value={daily.length}
          sub={`${dayCapacity} aktif`}
        />
        <Stat
          icon={WalletCards}
          label="Bordro toplamı"
          value={formatTRY(payrollTotal)}
          sub="Maaş + yol + net ekler"
        />
        <Stat
          icon={CalendarDays}
          label="İzin günü"
          value={leaveDays}
          sub="Bu ay kayıtlı"
        />
      </div>
      <div className="kyik-grid two">
        <Panel title="Aylık Personel Durumu" icon={BriefcaseBusiness}>
          <Table
            columns={[
              { key: "fullName", label: "Personel" },
              { key: "department", label: "Departman" },
              { key: "title", label: "Görev" },
              {
                key: "sgkStatus",
                label: "SGK",
                render: (row) => (
                  <Badge tone={row.sgkStatus === "VAR" ? "green" : "orange"}>
                    {row?.sgkStatus}
                  </Badge>
                ),
              },
              {
                key: "salary",
                label: "Maaş",
                render: (row) => formatTRY(row?.salary),
              },
            ]}
            rows={monthly}
          />
        </Panel>
        <Panel title="Açık İşler" icon={ClipboardList}>
          <div className="kyik-task-list">
            <div>
              <strong>Yıllık izin kayıtları</strong>
              <span>{leaves.length} kayıt kontrol edildi</span>
            </div>
            <div>
              <strong>Bordro ödeme planı</strong>
              <span>SGK banka / elden ayrımı hesaplandı</span>
            </div>
            <div>
              <strong>Günlük giriş hazırlığı</strong>
              <span>Gündüz ve gece ücretleri ayrıldı</span>
            </div>
            <div>
              <strong>Evrak takibi</strong>
              <span>Eksik sözleşmeler evrak sekmesinde</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MonthlyCards({
  monthly,
  selectedId,
  setSelectedId,
  updatePerson,
  createPerson,
  savePerson,
  deletePerson,
  saveBusy,
  notice,
  skills = [],
  companyId,
  onCreateSkill,
}) {
  const [draft, setDraft] = useState(() =>
    normalizeMonthlyPerson({
      id: "new-monthly-person",
      personnelCode: nextMonthlyCodeFromRows([]),
      code: nextMonthlyCodeFromRows([]),
      fullName: "Yeni Personel",
      department: "",
      title: "",
      workType: "Aylık",
      sgkStatus: "VAR",
      status: "Aktif",
      startDate: TODAY,
      salary: 0,
      roadAllowance: 0,
      paymentChannel: "Banka + Elden",
      bankAmount: 0,
      cashAmount: 0,
      annualLeaveEntitlement: DEFAULT_ANNUAL_LEAVE_DAYS,
      annualLeaveCarryover: 0,
      overtimeBaseHours: 225,
      note: "",
    }),
  );
  const selected =
    monthly.find((person) => person.id === selectedId) || monthly[0];
  if (!selected) {
    const draftWithCode = {
      ...draft,
      personnelCode: draft.personnelCode || nextMonthlyCodeFromRows(monthly),
      code: draft.code || nextMonthlyCodeFromRows(monthly),
    };
    return (
      <div className="kyik-workspace with-rail">
        <main className="kyik-main-stack">
          <MonthlyCardEditor
            person={draftWithCode}
            onChange={setDraft}
            onCreate={() => createPerson(draftWithCode)}
            onSave={() => createPerson(draftWithCode)}
            busy={saveBusy}
            notice={notice}
            skills={skills}
            companyId={companyId}
            onCreateSkill={onCreateSkill}
          />
          <Panel title="Aylık Personel Kartları" icon={Users}>
            <div className="kyik-empty-box">
              Henüz aylık personel kartı yok. İlk gerçek personeli yukarıdaki formdan ekleyebilirsiniz; kayıt oluşunca liste, düzenleme ve pasife alma işlemleri burada aktif çalışır.
            </div>
          </Panel>
        </main>
        <PersonList
          people={monthly}
          selectedId=""
          onSelect={setSelectedId}
        />
      </div>
    );
  }

  return (
    <div className="kyik-workspace with-rail">
      <main className="kyik-main-stack">
        <MonthlyCardEditor
          person={selected}
          onChange={updatePerson}
          onCreate={createPerson}
          onSave={() => savePerson(selected)}
          onDeactivate={() => deletePerson(selected.id)}
          busy={saveBusy}
          notice={notice}
          skills={skills}
          companyId={companyId}
          onCreateSkill={onCreateSkill}
        />
        <Panel title="Aylık Personel Kartları" icon={Users}>
          <Table
            columns={[
              { key: "personnelCode", label: "Kod" },
              { key: "fullName", label: "Ad soyad" },
              { key: "department", label: "Departman" },
              { key: "title", label: "Görev" },
              { key: "workType", label: "Çalışma tipi" },
              {
                key: "sgkStatus",
                label: "SGK",
                render: (row) => (
                  <Badge tone={row.sgkStatus === "VAR" ? "green" : "orange"}>
                    {row?.sgkStatus}
                  </Badge>
                ),
              },
              { key: "status", label: "Durum" },
              {
                key: "salary",
                label: "Maaş",
                render: (row) => formatTRY(row?.salary),
              },
              {
                key: "roadAllowance",
                label: "Yol",
                render: (row) => formatTRY(row?.roadAllowance),
              },
              { key: "paymentChannel", label: "Banka/Elden" },
              {
                key: "actions",
                label: "İşlem",
                render: (row) => (
                  <button
                    type="button"
                    className="kyik-inline-action"
                    onClick={(event) => {
                      event?.stopPropagation();
                      setSelectedId(row?.id);
                      deletePerson(row?.id);
                    }}
                  >
                    Pasif yap
                  </button>
                ),
              },
            ]}
            rows={monthly}
          />
        </Panel>
      </main>
      <PersonList
        people={monthly}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />
    </div>
  );
}

function ContractScreen({
  monthly,
  selectedId,
  setSelectedId,
  updatePerson,
  savePerson,
  saveContract,
  saveBusy,
  notice,
}) {
  const selected =
    monthly.find((person) => person.id === selectedId) || monthly[0];
  const [contract, setContract] = useState({
    startDate: selected?.startDate || TODAY,
    endDate: "2026-12-31",
    contractType: "Belirsiz süreli",
    validDate: TODAY,
    description: "Maaş ve sözleşme bilgisi.",
  });
  const [salaryContracts, setSalaryContracts] = useState([]);

  useEffect(() => {
    if (selected?.startDate) {
      setContract((current) =>
        current.startDate === selected.startDate
          ? current
          : { ...current, startDate: selected.startDate },
      );
    }
  }, [selected?.id, selected?.startDate]);

  useEffect(() => {
    let cancelled = false;
    async function loadSalaryContracts() {
      if (!selected?.id) {
        setSalaryContracts([]);
        return;
      }
      const rows = await getAylikSozlesmeler(selected.id).catch(() => []);
      if (!cancelled) setSalaryContracts(Array.isArray(rows) ? rows : []);
    }
    loadSalaryContracts();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, notice]);

  if (!selected) {
    return (
      <Panel title="Maaş / Sözleşme" icon={BriefcaseBusiness}>
        <div className="kyik-empty-box">
          Maaş işlemi için önce personel kaydı gerekiyor.
        </div>
      </Panel>
    );
  }
  const selectedSgkCovered = isSgkCovered(selected);
  const payroll = calculatePayroll(selected, []);
  const salaryHistory = salaryContracts.map((row) => ({
    id: row?.id,
    date: row?.effectiveDate?.slice?.(0, 10) || row?.effectiveDate || row?.createdAt?.slice?.(0, 10) || "",
    oldSalary: "",
    newSalary: toNumber(row?.salary),
    road: toNumber(row?.roadAllowance),
    bank: toNumber(row?.bankAmount),
    cash: toNumber(row?.cashAmount),
    description: row?.note || row?.contractType || "Maaş sözleşme kaydı",
  }));

  return (
    <div className="kyik-workspace with-rail">
      <main className="kyik-main-stack">
        <Panel title="Maaş / Sözleşme" icon={BriefcaseBusiness}>
          {notice ? <div className="kyik-save-notice">{notice}</div> : null}
          <div className="kyik-contract-card">
            <div>
              <span>Personel</span>
              <strong>{selected.fullName}</strong>
              <small>
                {selected.department} · {selected.title}
              </small>
            </div>
            <div>
              <span>SGK</span>
              <strong>{selected.sgkStatus}</strong>
              <small>
                {selectedSgkCovered
                  ? `Varsayılan banka: ${formatTRY(MIN_WAGE_BASE)}`
                  : "Banka kapalı"}
              </small>
            </div>
            <div>
              <span>Sözleşme</span>
              <strong>{selected.workType}</strong>
              <small>İşe giriş: {formatDate(selected.startDate)}</small>
            </div>
            <div>
              <span>Aylık hakediş</span>
              <strong>
                {formatTRY(
                  toNumber(selected.salary) + toNumber(selected.roadAllowance),
                )}
              </strong>
              <small>Maaş + yol</small>
            </div>
          </div>
          <div className="kyik-form-grid three">
            <Input label="Maaş">
              <TextInput
                type="number"
                value={selected.salary}
                onChange={(e) =>
                  updatePerson({
                    ...selected,
                    salary: toNumber(e.target.value),
                  })
                }
              />
            </Input>
            <Input label="Yol">
              <TextInput
                type="number"
                value={selected.roadAllowance}
                onChange={(e) =>
                  updatePerson({
                    ...selected,
                    roadAllowance: toNumber(e.target.value),
                  })
                }
              />
            </Input>
            <Input label="Banka / Elden">
              <SelectInput
                value={selectedSgkCovered ? selected.paymentChannel : "Elden"}
                disabled={!selectedSgkCovered}
                onChange={(e) =>
                  updatePerson({ ...selected, paymentChannel: e.target.value })
                }
              >
                <option>Elden</option>
                {selectedSgkCovered ? (
                  <>
                    <option>Banka</option>
                    <option>Banka + Elden</option>
                  </>
                ) : null}
              </SelectInput>
            </Input>
            <Input label="Banka tutarı">
              <TextInput value={formatTRY(payroll.bank)} readOnly />
            </Input>
            <Input label="Elden kalan">
              <TextInput value={formatTRY(payroll.cash)} readOnly />
            </Input>
            <Input label="Mesai saat tabanı">
              <TextInput
                type="number"
                value={selected.overtimeBaseHours}
                onChange={(e) =>
                  updatePerson({
                    ...selected,
                    overtimeBaseHours: toNumber(e.target.value),
                  })
                }
              />
            </Input>
            <Input label="Sözleşme başlangıç tarihi">
              <TextInput
                type="date"
                value={contract.startDate}
                onChange={(e) =>
                  setContract({ ...contract, startDate: e.target.value })
                }
              />
            </Input>
            <Input label="Sözleşme bitiş tarihi">
              <TextInput
                type="date"
                value={contract.endDate}
                onChange={(e) =>
                  setContract({ ...contract, endDate: e.target.value })
                }
              />
            </Input>
            <Input label="Sözleşme türü">
              <SelectInput
                value={contract.contractType}
                onChange={(e) =>
                  setContract({ ...contract, contractType: e.target.value })
                }
              >
                <option>Belirsiz süreli</option>
                <option>Belirli süreli</option>
                <option>Deneme süreli</option>
                <option>Kısmi süreli</option>
              </SelectInput>
            </Input>
            <Input label="Maaş geçerlilik tarihi">
              <TextInput
                type="date"
                value={contract.validDate}
                onChange={(e) =>
                  setContract({ ...contract, validDate: e.target.value })
                }
              />
            </Input>
            <Input label="Açıklama" wide>
              <TextArea
                value={contract.description}
                onChange={(e) =>
                  setContract({ ...contract, description: e.target.value })
                }
              />
            </Input>
          </div>
          <div className="kyik-action-row">
            <Button
              icon={Save}
              tone="primary"
              onClick={() => savePerson(selected)}
              disabled={saveBusy}
            >
              Maaş Bilgisini Kaydet
            </Button>
            <Button
              icon={BadgeCheck}
              onClick={() => saveContract(selected, contract)}
              disabled={saveBusy}
            >
              Sözleşme Güncelle
            </Button>
            <Button
              icon={Plus}
              onClick={() => saveContract(selected, contract)}
              disabled={saveBusy}
            >
              Maaş Geçmişine Ekle
            </Button>
          </div>
        </Panel>
        <Panel title="Maaş Geçmişi" icon={ReceiptText}>
          <Table
            rows={salaryHistory}
            columns={[
              {
                key: "date",
                label: "Tarih",
                render: (row) => formatDate(row?.date),
              },
              {
                key: "oldSalary",
                label: "Önceki",
                render: (row) => row?.oldSalary ? formatTRY(row?.oldSalary) : "-",
              },
              {
                key: "newSalary",
                label: "Yeni maaş",
                render: (row) => formatTRY(row?.newSalary),
              },
              {
                key: "road",
                label: "Yol",
                render: (row) => formatTRY(row?.road),
              },
              {
                key: "bank",
                label: "Banka",
                render: (row) => formatTRY(row?.bank),
              },
              {
                key: "cash",
                label: "Elden",
                render: (row) => formatTRY(row?.cash),
              },
              { key: "description", label: "Açıklama" },
              {
                key: "action",
                label: "İşlem",
                render: () => <Button>İncele</Button>,
              },
            ]}
          />
        </Panel>
      </main>
      <PersonList
        people={monthly}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />
    </div>
  );
}

function LeaveScreen({
  monthly,
  leaves,
  setLeaves,
  adjustments = [],
  saveLeave,
  updateLeave,
  deleteLeave,
  savePerson,
  saveLeaveBalancesBulk,
  saveBusy,
  officialHolidays = DEFAULT_OFFICIAL_HOLIDAYS_2026,
}) {
  const [selectedId, setSelectedId] = useState(monthly[0]?.id || "");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [editingId, setEditingId] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedLeavePersonIds, setSelectedLeavePersonIds] = useState(() => new Set());
  const [leaveBalanceForm, setLeaveBalanceForm] = useState({
    annualLeaveEntitlement: DEFAULT_ANNUAL_LEAVE_DAYS,
    annualLeaveCarryover: 0,
  });
  const [bulkLeaveBalanceForm, setBulkLeaveBalanceForm] = useState({
    annualLeaveEntitlement: DEFAULT_ANNUAL_LEAVE_DAYS,
    annualLeaveCarryover: 0,
  });
  const [form, setForm] = useState({
    personId: monthly[0]?.id || "",
    type: "Yıllık izin",
    effect: "Yıllık izinden düş",
    start: TODAY,
    end: TODAY,
    days: 1,
    description: "",
    document: "",
  });
  const selected =
    monthly.find((person) => person.id === selectedId) || monthly[0];
  const leaveBreakdown = leaveRangeBreakdown(form.start, form.end, officialHolidays);

  useEffect(() => {
    if (!editingId && selected?.id && form.personId !== selected.id) {
      setForm((current) => ({ ...current, personId: selected.id }));
    }
    if (selected?.id) {
      setLeaveBalanceForm({
        annualLeaveEntitlement: toNumber(
          selected.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
        ),
        annualLeaveCarryover: toNumber(selected.annualLeaveCarryover),
      });
    }
  }, [editingId, form.personId, selected?.annualLeaveCarryover, selected?.annualLeaveEntitlement, selected?.id]);

  if (!selected) {
    return (
      <Panel title="Yıllık İzin" icon={CalendarDays}>
        <div className="kyik-empty-box">
          İzin işlemi için önce aylık personel kartı gerekiyor.
        </div>
      </Panel>
    );
  }

  const updateForm = (patch) => {
    const next = { ...form, ...patch };
    if (patch.type && ["Doğum izni", "Ölüm izni"].includes(patch.type)) {
      next.effect = "Düşme";
    }
    setForm(next);
  };

  const resetForm = () => {
    setEditingId("");
    setForm({
      personId: selected.id || monthly[0]?.id || "",
      type: "Yıllık izin",
      effect: "Yıllık izinden düş",
      start: TODAY,
      end: TODAY,
      days: 1,
      description: "",
      document: "",
    });
    setFormError("");
  };

  const startEdit = (leave) => {
    setEditingId(leave.id);
    setSelectedId(leave.personId);
    setForm({
      personId: leave.personId,
      type: leave.type,
      effect: leave.effect,
      start: leave.start,
      end: leave.end,
      days: toNumber(leave.days),
      description: leave.description || "",
      document: leave.document || "",
    });
    setFormError("");
  };

  const rows = leaves
    .filter((leave) => leaveInYear(leave, year))
    .map((leave) => ({
    ...leave,
    personName:
      monthly.find((person) => person.id === leave.personId)?.fullName || "-",
    onClick: () => startEdit(leave),
  }));
  const selectedRows = rows.filter((leave) => leave.personId === selected.id);
  const selectedUsedDays = selected
     ? annualLeaveUsedForPersonInYear(selected.id, year, leaves, adjustments)
    : 0;
  const selectedEntitlement = toNumber(
    selected.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
  );
  const selectedCarryover = toNumber(selected.annualLeaveCarryover);
  const selectedRemaining = Math.max(
    selectedEntitlement + selectedCarryover - selectedUsedDays,
    0,
  );
  const adjustmentLeaveDays = adjustments
    .filter((row) => !year || recordYear(row?.date) === String(year))
    .reduce(
    (sum, row) => sum + annualLeaveDaysFromAdjustment(row),
    0,
  );
  const plannedDays = rows
    .filter((leave) => leave.start >= TODAY)
    .reduce((sum, leave) => sum + toNumber(leave.days), 0);
  const personSummaryRows = monthly.map((person) => {
    const personUsed = annualLeaveUsedForPersonInYear(
      person.id,
      year,
      leaves,
      adjustments,
    );
    const personCarryover = toNumber(person.annualLeaveCarryover);
    const personEntitlement = toNumber(
      person.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
    );
    const personPlanned = rows
      .filter((leave) => leave.personId === person.id && leave.start >= TODAY)
      .reduce((sum, leave) => sum + toNumber(leave.days), 0);
    return {
      id: person.id,
      personnelCode: person.personnelCode,
      personName: person.fullName,
      earned: personEntitlement,
      carryover: personCarryover,
      used: personUsed,
      planned: personPlanned,
      remaining: Math.max(personEntitlement + personCarryover - personUsed, 0),
      lastLeave:
        rows.find((leave) => leave.personId === person.id)?.start || "",
      selected: selectedLeavePersonIds.has(person.id),
      onClick: () => setSelectedId(person.id),
    };
  });
  const visiblePersonIds = personSummaryRows.map((row) => row.id);
  const allVisibleSelected =
    visiblePersonIds.length > 0 &&
    visiblePersonIds.every((id) => selectedLeavePersonIds.has(id));
  const selectedLeavePeople = monthly.filter((person) =>
    selectedLeavePersonIds.has(person.id),
  );
  const toggleLeavePerson = (id) => {
    setSelectedLeavePersonIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllLeavePeople = () => {
    setSelectedLeavePersonIds(new Set(visiblePersonIds));
  };
  const clearLeavePeople = () => {
    setSelectedLeavePersonIds(new Set());
  };
  const dayMovementRows = leaveDayRows(selectedRows, monthly)
    .filter((row) => !year || recordYear(row?.date) === String(year))
    .sort((a, b) => a.date.localeCompare(b.date));

  const save = async () => {
    if (!form.personId || !form.start || !form.end) {
      setFormError("Personel, başlangıç ve bitiş tarihi zorunlu.");
      return;
    }
    if (toNumber(form.days) <= 0) {
      setFormError("İzin günü sıfır olamaz.");
      return;
    }
    setFormError("");
    const payload = { ...form, id: editingId || `lv-${Date.now()}` };
    const saved = editingId
       ? await updateLeave(editingId, payload)
      : await saveLeave(payload);
    setLeaves((current) =>
      editingId
         ? current.map((leave) => (leave.id === editingId ? saved : leave))
        : [saved, ...current],
    );
    resetForm();
  };

  const remove = async () => {
    if (!editingId) return;
    await deleteLeave(editingId);
    setLeaves((current) => current?.filter((leave) => leave.id !== editingId));
    resetForm();
  };

  const saveLeaveBalance = async () => {
    if (!selected || !savePerson || saveBusy) return;
    const saved = await savePerson({
      ...selected,
      annualLeaveEntitlement: toNumber(leaveBalanceForm.annualLeaveEntitlement),
      annualLeaveCarryover: toNumber(leaveBalanceForm.annualLeaveCarryover),
    });
    if (saved) setSelectedId(saved?.id);
  };

  const saveBulkLeaveBalance = async () => {
    if (!selectedLeavePeople.length || !saveLeaveBalancesBulk || saveBusy) return;
    setFormError("");
    const savedRows = await saveLeaveBalancesBulk({
      employeeIds: selectedLeavePeople.map((person) => person.id),
      annualLeaveEntitlement: toNumber(bulkLeaveBalanceForm.annualLeaveEntitlement),
      annualLeaveCarryover: toNumber(bulkLeaveBalanceForm.annualLeaveCarryover),
    });
    if (savedRows?.length) setSelectedLeavePersonIds(new Set());
  };

  return (
    <div className="kyik-workspace with-rail leave">
      <main className="kyik-main-stack">
      <div className="kyik-stat-grid six">
        <Stat
          icon={CalendarDays}
          label="Hak edilen"
          value={`${selectedEntitlement} gün`}
          sub={selected.fullName || "Seçili personel"}
        />
        <Stat
          icon={ClipboardList}
          label="Devreden"
          value={`${selectedCarryover} gün`}
          sub={year}
        />
        <Stat
          icon={CheckCircle2}
          label="Kullanılan"
          value={`${selectedUsedDays} gün`}
          sub={`İzin + kesinti (${adjustmentLeaveDays} gün)`}
        />
        <Stat
          icon={WalletCards}
          label="Kalan"
          value={`${selectedRemaining} gün`}
          sub="Seçili personel"
        />
        <Stat
          icon={Clock}
          label="Planlanan"
          value={`${plannedDays} gün`}
          sub="İleri tarihli"
        />
        <Stat
          icon={FolderUp}
          label="Eksik evrak"
          value={String(rows.filter((row) => !row?.document).length)}
          sub="Evraksız kayıt"
        />
      </div>
      <Panel
        title="Personel İzin Bakiyesi"
        icon={Users}
        action={
          <div className="kyik-inline-filter-row">
            <SelectInput value={year} onChange={(event) => setYear(event?.target.value)}>
              {YEAR_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
            <Button icon={CheckCircle2} onClick={selectAllLeavePeople} disabled={allVisibleSelected}>
              {allVisibleSelected ? "Tümü Seçili" : "Tümünü Seç"}
            </Button>
            <Button icon={X} onClick={clearLeavePeople} disabled={!selectedLeavePersonIds.size}>
              Seçimi Kaldır
            </Button>
          </div>
        }
      >
        <Table
          rows={personSummaryRows}
          columns={[
            {
              key: "selected",
              label: "Seç",
              render: (row) => (
                <input
                  type="checkbox"
                  checked={selectedLeavePersonIds.has(row?.id)}
                  onChange={(event) => {
                    event.stopPropagation();
                    toggleLeavePerson(row?.id);
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              ),
            },
            { key: "personnelCode", label: "Kod" },
            { key: "personName", label: "Personel" },
            { key: "earned", label: "Hak" },
            { key: "carryover", label: "Devreden" },
            { key: "used", label: "Kullanılan" },
            { key: "planned", label: "Planlanan" },
            {
              key: "remaining",
              label: "Kalan",
              render: (row) => <strong>{row?.remaining} gün</strong>,
            },
            {
              key: "lastLeave",
              label: "Son izin",
              render: (row) => formatDate(row?.lastLeave),
            },
          ]}
        />
        <div className="kyik-info-line">
          {selectedLeavePersonIds.size} personel seçili. Seçili kişiler için hak/devir düzenlemesini aşağıdaki toplu alandan tek seferde kaydedebilirsin.
        </div>
      </Panel>
      <Panel title="Hak Ediş ve Devir" icon={BadgeCheck}>
        <div className="kyik-form-grid four">
          <Input label="Personel">
            <TextInput value={selected.fullName || ""} readOnly />
          </Input>
          <Input label="Yıllık hak ediş">
            <TextInput
              type="number"
              value={leaveBalanceForm.annualLeaveEntitlement}
              onChange={(event) =>
                setLeaveBalanceForm((current) => ({
                  ...current,
                  annualLeaveEntitlement: toNumber(event?.target.value),
                }))
              }
            />
          </Input>
          <Input label="Devreden izin">
            <TextInput
              type="number"
              value={leaveBalanceForm.annualLeaveCarryover}
              onChange={(event) =>
                setLeaveBalanceForm((current) => ({
                  ...current,
                  annualLeaveCarryover: toNumber(event?.target.value),
                }))
              }
            />
          </Input>
          <Input label="Kalan">
            <TextInput value={`${selectedRemaining} gün`} readOnly />
          </Input>
        </div>
        <div className="kyik-action-row">
          <Button icon={Save} tone="primary" onClick={saveLeaveBalance} disabled={saveBusy}>
            Hak / Devir Kaydet
          </Button>
        </div>
        {selectedLeavePersonIds.size ? (
          <>
            <div className="kyik-section-divider" />
            <div className="kyik-form-grid four">
              <Input label="Seçili personel">
                <TextInput value={`${selectedLeavePersonIds.size} kişi`} readOnly />
              </Input>
              <Input label="Toplu yıllık hak">
                <TextInput
                  type="number"
                  value={bulkLeaveBalanceForm.annualLeaveEntitlement}
                  onChange={(event) =>
                    setBulkLeaveBalanceForm((current) => ({
                      ...current,
                      annualLeaveEntitlement: toNumber(event?.target.value),
                    }))
                  }
                />
              </Input>
              <Input label="Toplu devreden">
                <TextInput
                  type="number"
                  value={bulkLeaveBalanceForm.annualLeaveCarryover}
                  onChange={(event) =>
                    setBulkLeaveBalanceForm((current) => ({
                      ...current,
                      annualLeaveCarryover: toNumber(event?.target.value),
                    }))
                  }
                />
              </Input>
              <Input label="İşlem">
                <Button icon={Save} tone="primary" onClick={saveBulkLeaveBalance} disabled={saveBusy}>
                  Seçililere Kaydet
                </Button>
              </Input>
            </div>
          </>
        ) : null}
      </Panel>
      <Panel title="Yıllık İzin Kaydı" icon={CalendarDays}>
        <div className="kyik-form-grid four">
          <Input label="Personel">
            <SelectInput
              value={form.personId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                updateForm({ personId: e.target.value });
              }}
            >
              {monthly.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </SelectInput>
          </Input>
          <Input label="Kayıt türü">
            <SelectInput
              value={form.type}
              onChange={(e) => updateForm({ type: e.target.value })}
            >
              <option>Yıllık izin</option>
              <option>Mazeret</option>
              <option>Doğum izni</option>
              <option>Ölüm izni</option>
              <option>Rapor</option>
              <option>Ücretsiz izin</option>
              <option>Diğer</option>
            </SelectInput>
          </Input>
          <Input label="Etki">
            <SelectInput
              value={form.effect}
              onChange={(e) => updateForm({ effect: e.target.value })}
            >
              <option>Yıllık izinden düş</option>
              <option>Bordrodan düş</option>
              <option>Düşme</option>
              <option>Rapor</option>
              <option>İstisna</option>
            </SelectInput>
          </Input>
          <Input label="Başlangıç">
            <TextInput
              type="date"
              value={form.start}
              onChange={(e) => updateForm({ start: e.target.value })}
            />
          </Input>
          <Input label="Bitiş">
            <TextInput
              type="date"
              value={form.end}
              onChange={(e) => updateForm({ end: e.target.value })}
            />
          </Input>
          <Input label="Yıllık izin gün sayısı">
            <TextInput
              type="number"
              value={form.days}
              onChange={(e) =>
                updateForm({ days: toNumber(e.target.value) })
              }
            />
          </Input>
          <Input label="Hesaplanan hafta içi izin günü">
            <TextInput value={`${leaveBreakdown.annualLeaveDays} gün`} readOnly />
          </Input>
          <Input label="Evrak yükleme">
            <TextInput
              value={form.document}
              placeholder="Dosya adı veya evrak notu"
              onChange={(e) => updateForm({ document: e.target.value })}
            />
          </Input>
          <Input label="Açıklama" wide>
            <TextArea
              value={form.description}
              placeholder="Örn. köye gittim, aile işi, özel iş, sağlık, mazeret..."
              onChange={(e) =>
                updateForm({ description: e.target.value })
              }
            />
          </Input>
        </div>
        <div className="kyik-info-line">
          Bu tarih aralığında {leaveBreakdown.totalDays} takvim günü var. Pazartesi-salı dahil hafta içi {leaveBreakdown.weekDays} gün sayılır; cumartesi/pazar {leaveBreakdown.weekendDays} gün ve resmi tatil {leaveBreakdown.officialHolidayDays} gün yıllık izinden düşülmez. Hesaplanan izin günü: {leaveBreakdown.annualLeaveDays}.
          {leaveBreakdown.holidayNames.length ? ` Resmi tatil: ${leaveBreakdown.holidayNames.join(", ")}.` : ""}
        </div>
        <div className="kyik-action-row">
          <Button
            icon={CheckCircle2}
            onClick={() => updateForm({ days: leaveBreakdown.annualLeaveDays })}
          >
            Hesaplanan Günü Yaz
          </Button>
        </div>
        {formError ? <div className="kyik-error-line">{formError}</div> : null}
        <div className="kyik-action-row">
          <Button icon={Save} tone="primary" onClick={save}>
            {editingId ? "İzin Güncelle" : "İzin Kaydet"}
          </Button>
          {editingId ? (
            <>
              <Button icon={Minus} onClick={remove}>
                Sil
              </Button>
              <Button onClick={resetForm}>Vazgeç</Button>
            </>
          ) : null}
          <Button icon={FolderUp}>Evrak Ekle</Button>
        </div>
      </Panel>
      <Panel title="Gün Gün İzin Hareketi" icon={ClipboardList}>
        <Table
          rows={dayMovementRows}
          empty="Seçili personel için günlük izin hareketi yok"
          columns={[
            {
              key: "date",
              label: "Tarih",
              render: (row) => formatDate(row?.date),
            },
            { key: "personnelCode", label: "Kod" },
            { key: "personName", label: "Personel" },
            { key: "type", label: "Tür" },
            { key: "effect", label: "Etki" },
            { key: "description", label: "Açıklama" },
          ]}
        />
      </Panel>
      <Panel title="İzin Kayıtları Tablosu" icon={FileText}>
        <Table
          rows={selectedRows}
          empty="Seçili personel için izin kaydı yok"
          columns={[
            { key: "personName", label: "Personel" },
            { key: "type", label: "Kayıt türü" },
            { key: "effect", label: "Etki" },
            {
              key: "start",
              label: "Başlangıç",
              render: (row) => formatDate(row?.start),
            },
            {
              key: "end",
              label: "Bitiş",
              render: (row) => formatDate(row?.end),
            },
            { key: "days", label: "Gün" },
            {
              key: "document",
              label: "Evrak",
              render: (row) => row?.document || "-",
            },
            { key: "description", label: "Açıklama" },
            {
              key: "action",
              label: "İşlem",
              render: (row) => (
                <Button
                  onClick={(event) => {
                    event?.stopPropagation();
                    startEdit(row);
                  }}
                >
                  Düzenle
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      </main>
      <PersonList
        people={monthly}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />
    </div>
  );
}

function AdjustmentScreen({
  monthly,
  adjustments,
  setAdjustments,
  leaves,
  saveAdjustment,
  updateAdjustment,
  deleteAdjustment,
  officialHolidays = DEFAULT_OFFICIAL_HOLIDAYS_2026,
  setOfficialHolidays,
}) {
  const [selectedId, setSelectedId] = useState(monthly[0]?.id || "");
  const [filters, setFilters] = useState({
    year: String(CURRENT_YEAR),
    month: MONTH_NAMES[new Date(`${TODAY}T00:00:00`).getMonth()] || "Mayıs",
  });
  const [form, setForm] = useState({
    personId: selectedId,
    date: TODAY,
    type: "Mesai",
    dayMode: "Saatlik",
    amount: 0,
    hours: 0,
    overtimeMode: "AUTO",
    amountManual: false,
    payrollEffect: "Bordroya ekle",
    note: "",
  });
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [holidayForm, setHolidayForm] = useState({
    date: "",
    name: "",
  });
  const selected =
    monthly.find((person) => person.id === selectedId) || monthly[0];
  if (!selected) {
    return (
      <Panel title="Mesai / Kesinti / Avans Kaydı" icon={Clock}>
        <div className="kyik-empty-box">
          Kayıt girmek için önce aylık personel kaydı gerekiyor.
        </div>
      </Panel>
    );
  }
  const filteredAdjustments = adjustments.filter((row) =>
    adjustmentInYearMonth(row, filters.year, filters.month),
  );
  const monthOvertime = filteredAdjustments
    .filter((row) => ["Mesai", "Yol farkı", "Maaş farkı"].includes(row?.type))
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const monthBonus = filteredAdjustments
    .filter((row) => row.type === "Prim")
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const monthAdvance = filteredAdjustments
    .filter((row) => row.type === "Avans")
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const monthDeduction = filteredAdjustments
    .filter((row) => ["Kesinti", "Devamsızlık"].includes(row?.type))
    .filter((row) => row?.payrollEffect !== "Yıllık izinden düş")
    .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const selectedAnnualUsed = annualLeaveUsedForPerson(
    selected.id,
    leaves,
    adjustments,
  );
  const selectedAnnualRemaining = Math.max(
    DEFAULT_ANNUAL_LEAVE_DAYS - selectedAnnualUsed,
    0,
  );
  const baseAdjustments = editingId
     ? filteredAdjustments.filter((row) => row?.id !== editingId)
    : filteredAdjustments;
  const payrollBeforeThisRecord = calculatePayroll(selected, baseAdjustments);
  const overtimeType = resolveOvertimeType(
    form.date,
    officialHolidays,
    form.overtimeMode,
  );
  const calculatedOvertimeAmount = calculateAdjustmentAmount(
    "Mesai",
    form.hours,
    selected,
    form.dayMode,
    { multiplier: overtimeType.multiplier },
  );
  const previewEffect = adjustmentDirection(form);
  const previewAmount = toNumber(form.amount);
  const previewTotal = payrollBeforeThisRecord.total + previewEffect * previewAmount;
  const hourlyRate = adjustmentHourlyRate(selected);

  const updateForm = (patch) => {
    const next = { ...form, ...patch };
    if (patch.type && patch.type !== form.type) next.amountManual = false;
    if (patch.overtimeMode) next.amountManual = false;
    if (next.dayMode === "Tam gün") next.hours = DAILY_WORK_HOURS;
    if (next.dayMode === "Yıllık izin") {
      next.hours = DAILY_WORK_HOURS;
      next.payrollEffect = "Yıllık izinden düş";
    }
    next.payrollEffect = payrollEffectForType(next.type, next.payrollEffect);
    if (next.payrollEffect === "Yıllık izinden düş") {
      next.amount = 0;
    } else if (shouldAutoCalculateAdjustment(next.type) && !next.amountManual) {
      const nextOvertimeType = resolveOvertimeType(
        next.date,
        officialHolidays,
        next.overtimeMode,
      );
      next.amount = roundCurrency(
        calculateAdjustmentAmount(next.type, next.hours, selected, next.dayMode, {
          multiplier: nextOvertimeType.multiplier,
        }),
      );
    }
    setForm(next);
  };

  const startEdit = (row) => {
    setEditingId(row?.id);
    setSelectedId(row?.personId);
    setForm({
      personId: row?.personId,
      date: row?.date || TODAY,
      type: row?.type || "Mesai",
      dayMode:
        row.payrollEffect === "Yıllık izinden düş"
           ? "Yıllık izin"
          : toNumber(row?.hours) >= DAILY_WORK_HOURS
             ? "Tam gün"
            : "Saatlik",
      amount: toNumber(row?.amount),
      hours: toNumber(row?.hours),
      overtimeMode: "AUTO",
      amountManual: true,
      payrollEffect: payrollEffectForType(row?.type, row?.payrollEffect),
      note: row?.note || "",
    });
    setFormError("");
  };

  const resetForm = () => {
    setEditingId("");
    setForm({
      personId: selected.id,
      date: TODAY,
      type: "Mesai",
      dayMode: "Saatlik",
      amount: 0,
      hours: 0,
      overtimeMode: "AUTO",
      amountManual: false,
      payrollEffect: "Bordroya ekle",
      note: "",
    });
    setFormError("");
  };

  const addOfficialHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      setFormError("Resmi tatil için tarih ve ad zorunlu.");
      return;
    }
    try {
      const saved = await saveResmiTatil({
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        year: Number(holidayForm.date.slice(0, 4)),
        active: true,
      });
      const nextHoliday = saved || {
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        active: true,
      };
      setOfficialHolidays((current) => {
        const withoutSameDate = current?.filter(
          (row) => dateOnlyText(row?.date || row?.tarih) !== holidayForm.date,
        );
        return [...withoutSameDate, nextHoliday].sort((a, b) =>
          dateOnlyText(a.date || a.tarih).localeCompare(dateOnlyText(b.date || b.tarih)),
        );
      });
      setHolidayForm({ date: "", name: "" });
      setFormError("");
    } catch (error) {
      setFormError(error?.message || "Resmi tatil eklenemedi.");
    }
  };

  const rows = filteredAdjustments.map((row) => ({
    ...row,
    personName:
      monthly.find((person) => person.id === row?.personId)?.fullName || "-",
    onClick: () => startEdit(row),
  }));

  const save = async () => {
    const payrollEffect = payrollEffectForType(form.type, form.payrollEffect);
    const amount =
      payrollEffect === "Yıllık izinden düş"
         ? 0
        : shouldAutoCalculateAdjustment(form.type) && !form.amountManual
      ? roundCurrency(
          calculateAdjustmentAmount(
            form.type,
            form.hours,
            selected,
            form.dayMode,
            { multiplier: overtimeType.multiplier },
          ),
        )
      : toNumber(form.amount);
    if (
      !["Sadece not", "Sadece kayıt", "Yıllık izinden düş"].includes(
        payrollEffect,
      ) &&
      amount <= 0
    ) {
      setFormError("Bordroya etki edecek kayıt için tutar sıfır olamaz.");
      return;
    }
    if (!form.date) {
      setFormError("Hangi gün olduğu zorunlu. Tarih olmadan kayıt girilemez.");
      return;
    }
    setFormError("");
    const payload = {
      ...form,
      amount,
      payrollEffect,
      amountManual: form.amountManual,
      overtimeMode: form.overtimeMode,
      overtimeMultiplier: overtimeType.multiplier,
      personId: selected.id,
      status: "Taslak",
      id: editingId || `adj-${Date.now()}`,
    };
    const saved = editingId
       ? await updateAdjustment(editingId, payload)
      : await saveAdjustment(payload);
    setAdjustments((current) =>
      editingId
         ? current.map((row) => (row.id === editingId ? saved : row))
        : [saved, ...current],
    );
    resetForm();
  };

  const remove = async () => {
    if (!editingId) return;
    await deleteAdjustment(editingId);
    setAdjustments((current) => current?.filter((row) => row?.id !== editingId));
    resetForm();
  };

  return (
    <div className="kyik-workspace with-rail">
      <main className="kyik-main-stack">
        <div className="kyik-stat-grid five">
          <Stat
            icon={Clock}
            label="Bu ay mesai"
            value={formatTRY(monthOvertime)}
            sub="Bordroya ek"
          />
          <Stat
            icon={BadgeCheck}
            label="Bu ay prim"
            value={formatTRY(monthBonus)}
            sub="Bordroya ek"
          />
          <Stat
            icon={Banknote}
            label="Bu ay avans"
            value={formatTRY(monthAdvance)}
            sub="Bordrodan düş"
          />
          <Stat
            icon={Minus}
            label="Bu ay kesinti"
            value={formatTRY(monthDeduction)}
            sub="Bordrodan düş"
          />
          <Stat
            icon={WalletCards}
            label="Bordroya etki toplamı"
            value={formatTRY(
              monthOvertime + monthBonus - monthAdvance - monthDeduction,
            )}
            sub="Net fark"
          />
        </div>
        <Panel
          title="Mesai / Kesinti / Avans Kaydı"
          icon={Clock}
          action={
            <div className="kyik-inline-filter-row">
              <SelectInput
                value={filters.year}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, year: event?.target.value }))
                }
              >
                {YEAR_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                value={filters.month}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, month: event?.target.value }))
                }
              >
                {MONTH_NAMES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectInput>
            </div>
          }
        >
          <div className="kyik-selected-line">
            <strong>{selected.fullName}</strong>
            <span>
              {selected.department} · {selected.title}
            </span>
          </div>
          <div className="kyik-adjustment-context">
            <div>
              <span>Taban maaş</span>
              <strong>{formatTRY(selected.salary)}</strong>
            </div>
            <div>
              <span>Yol</span>
              <strong>{formatTRY(selected.roadAllowance)}</strong>
            </div>
            <div>
              <span>Mesai saat tabanı</span>
              <strong>{toNumber(selected.overtimeBaseHours || 225)} saat</strong>
            </div>
            <div>
              <span>Saat ücreti</span>
              <strong>{formatTRYDetailed(hourlyRate)}</strong>
            </div>
            {form.type === "Mesai" ? (
              <>
                <div>
                  <span>Mesai Saati</span>
                  <strong>{toNumber(form.hours)} saat</strong>
                </div>
                <div>
                  <span>Katsayı</span>
                  <strong>x{String(overtimeType.multiplier).replace(".", ",")}</strong>
                </div>
                <div>
                  <span>Mesai Tipi</span>
                  <strong>{overtimeType.shortLabel}</strong>
                </div>
                <div className="total">
                  <span>Hesaplanan Tutar</span>
                  <strong>{formatTRYDetailed(calculatedOvertimeAmount)}</strong>
                </div>
              </>
            ) : null}
            <div className="total">
              <span>Bu kayıt etkisi</span>
              <strong>
                {previewEffect < 0 ? "-" : previewEffect > 0 ? "+" : ""}
                {form.type === "Mesai"
                   ? formatTRYDetailed(previewAmount)
                  : formatTRY(previewAmount)}
              </strong>
            </div>
            <div className="total">
              <span>Kayıt sonrası alacağı</span>
              <strong>{formatTRY(previewTotal)}</strong>
            </div>
            <div>
              <span>Kalan yıllık izin</span>
              <strong>
                {Math.max(
                  selectedAnnualRemaining -
                    annualLeaveDaysFromAdjustment(form),
                  0,
                )}{" "}
                gün
              </strong>
            </div>
          </div>
          {form.type === "Mesai" ? (
            <div className="kyik-info-line">
              {overtimeType.label}
              {overtimeType.holiday ? ` · ${overtimeType.holiday}` : ""}
            </div>
          ) : null}
          {form.type === "Mesai" ? (
            <div className="kyik-holiday-inline">
              <Input label="Resmi tatil tarihi">
                <TextInput
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) =>
                    setHolidayForm((current) => ({
                      ...current,
                      date: e.target.value,
                    }))
                  }
                />
              </Input>
              <Input label="Resmi tatil adı">
                <TextInput
                  value={holidayForm.name}
                  onChange={(e) =>
                    setHolidayForm((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                />
              </Input>
              <Button icon={Plus} onClick={addOfficialHoliday}>
                Tatil Ekle
              </Button>
            </div>
          ) : null}
          <div className="kyik-form-grid five">
            <Input label="Personel">
              <SelectInput
                value={selected.id}
                onChange={(e) => {
                  const personId = e.target.value;
                  const nextPerson =
                    monthly.find((person) => person.id === personId) ||
                    selected;
                  setSelectedId(personId);
                  setForm({
                    ...form,
                    personId,
                    amount: shouldAutoCalculateAdjustment(form.type) && !form.amountManual
                      ? roundCurrency(
                          calculateAdjustmentAmount(
                            form.type,
                            form.hours,
                            nextPerson,
                            form.dayMode,
                            { multiplier: overtimeType.multiplier },
                          ),
                        )
                      : form.amount,
                  });
                }}
              >
                {monthly.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </SelectInput>
            </Input>
            <Input label="Tarih">
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => updateForm({ date: e.target.value })}
              />
            </Input>
            <Input label="Kayıt tipi">
              <SelectInput
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value;
                  updateForm({ type });
                }}
              >
                <option>Mesai</option>
                <option>Avans</option>
                <option>Kesinti</option>
                <option>Devamsızlık</option>
                <option>Yol farkı</option>
                <option>Maaş farkı</option>
              </SelectInput>
            </Input>
            {form.type === "Mesai" ? (
              <Input label="Mesai tipi">
                <SelectInput
                  value={form.overtimeMode}
                  onChange={(e) => updateForm({ overtimeMode: e.target.value })}
                >
                  <option value="AUTO">Otomatik</option>
                  <option value="WEEKDAY_50">Hafta içi %50 / x1,5</option>
                  <option value="WEEKEND_100">
                    Hafta sonu / resmi tatil %100 / x2
                  </option>
                </SelectInput>
              </Input>
            ) : null}
            <Input label="Gün / Saat durumu">
              <SelectInput
                value={form.dayMode}
                onChange={(e) => updateForm({ dayMode: e.target.value })}
              >
                <option>Saatlik</option>
                <option>Tam gün</option>
                <option>Yıllık izin</option>
              </SelectInput>
            </Input>
            <Input label="Saat / Gün">
              <TextInput
                type="number"
                value={form.hours}
                onChange={(e) => updateForm({ hours: toNumber(e.target.value) })}
              />
            </Input>
            <Input label="Tutar">
              <TextInput
                type="number"
                value={form.amount}
                readOnly={
                  form.payrollEffect === "Yıllık izinden düş"
                }
                onChange={(e) =>
                  updateForm({
                    amount: toNumber(e.target.value),
                    amountManual: true,
                  })
                }
              />
            </Input>
            <Input label="Bordro etkisi">
              <SelectInput
                value={form.payrollEffect}
                onChange={(e) =>
                  updateForm({ payrollEffect: e.target.value })
                }
                disabled={ADDITION_ADJUSTMENT_TYPES.includes(form.type)}
              >
                <option>Bordroya ekle</option>
                <option>Bordrodan düş</option>
                <option>Yıllık izinden düş</option>
                <option>Sadece kayıt</option>
              </SelectInput>
            </Input>
            <Input label="Açıklama" wide>
              <TextArea
                value={form.note}
                onChange={(e) => updateForm({ note: e.target.value })}
              />
            </Input>
          </div>
          {formError ? <div className="kyik-error-line">{formError}</div> : null}
          <div className="kyik-action-row">
            <Button icon={Plus} tone="primary" onClick={save}>
              {editingId ? "Güncelle" : "Kayıt Ekle"}
            </Button>
            {editingId ? (
              <>
                <Button icon={Minus} onClick={remove}>
                  Sil
                </Button>
                <Button onClick={resetForm}>Vazgeç</Button>
              </>
            ) : null}
          </div>
        </Panel>
        <Panel title="Aylık Hareketler" icon={ClipboardList}>
          <Table
            rows={rows}
            columns={[
              {
                key: "date",
                label: "Tarih",
                render: (row) => formatDate(row?.date),
              },
              { key: "personName", label: "Personel" },
              {
                key: "type",
                label: "Kayıt tipi",
                render: (row) => (
                  <Badge
                    tone={
                      row.type === "Kesinti" || row.type === "Avans"
                         ? "orange"
                        : "green"
                    }
                  >
                    {row?.type}
                  </Badge>
                ),
              },
              { key: "hours", label: "Saat / Gün" },
              {
                key: "amount",
                label: "Tutar",
                render: (row) => formatTRY(row?.amount),
              },
              {
                key: "payrollEffect",
                label: "Bordro etkisi",
                render: (row) => payrollEffectForType(row?.type, row?.payrollEffect),
              },
              { key: "note", label: "Açıklama" },
              {
                key: "status",
                label: "Durum",
                render: (row) => (
                  <Badge tone={row.status === "Onaylandı" ? "green" : "orange"}>
                    {row?.status || "Taslak"}
                  </Badge>
                ),
              },
              {
                key: "action",
                label: "İşlem",
                render: (row) => (
                  <Button
                    onClick={(event) => {
                      event?.stopPropagation();
                      startEdit(row);
                    }}
                  >
                    Düzenle
                  </Button>
                ),
              },
            ]}
          />
        </Panel>
      </main>
      <PersonList
        people={monthly}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />
    </div>
  );
}

function AdjustmentBulkScreen({
  monthly,
  adjustments,
  setAdjustments,
  leaves,
  savePerson,
  saveAdjustment,
  updateAdjustment,
  deleteAdjustment,
  officialHolidays = DEFAULT_OFFICIAL_HOLIDAYS_2026,
  setOfficialHolidays,
}) {
  const [selectedId, setSelectedId] = useState(monthly[0]?.id || "");
  const [filters, setFilters] = useState({
    year: String(CURRENT_YEAR),
    month: MONTH_NAMES[new Date(`${TODAY}T00:00:00`).getMonth()] || "Mayıs",
    query: "",
    payment: "Tümü",
  });
  const [drafts, setDrafts] = useState({});
  const [savingRows, setSavingRows] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  const [formError, setFormError] = useState("");
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });

  const defaultDate = TODAY;
  const filteredAdjustments = adjustments.filter((row) =>
    adjustmentInYearMonth(row, filters.year, filters.month),
  );
  const visiblePeople = monthly.filter((person) =>
    {
      const draft = drafts[person.id] || {
        bankAmount: person.bankAmount,
        cashAmount: person.cashAmount,
      };
      const bank = toNumber(draft.bankAmount);
      const cash = toNumber(draft.cashAmount);
      const queryMatches = `${person.fullName || ""} ${person.personnelCode || ""} ${person.department || ""} ${person.title || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(filters.query.toLocaleLowerCase("tr-TR"));
      const paymentMatches =
        filters.payment === "Tümü" ||
        (filters.payment === "Banka alanlar" && bank > 0) ||
        (filters.payment === "Elden alanlar" && cash > 0) ||
        (filters.payment === "Banka + Elden" && bank > 0 && cash > 0);
      return queryMatches && paymentMatches;
    },
  );
  const selected =
    monthly.find((person) => person.id === selectedId) ||
    visiblePeople[0] ||
    monthly[0];

  const existingForPerson = (personId, type) =>
    filteredAdjustments.filter((row) => row?.personId === personId && row?.type === type);
  const aggregatePersonDraft = useCallback((person) => {
    const own = filteredAdjustments.filter((row) => row?.personId === person.id);
    const mesaiRows = own.filter((row) => row?.type === "Mesai");
    const note = own.map((row) => row?.note).filter(Boolean).join(" / ");
    const currentPayroll = calculatePayroll(person, filteredAdjustments);
    return {
      date: mesaiRows[0]?.date || own[0]?.date || defaultDate,
      overtimeHours: mesaiRows.reduce((sum, row) => sum + toNumber(row?.hours), 0),
      overtimeMode: mesaiRows[0]?.overtimeMode || "AUTO",
      advance: own.filter((row) => row?.type === "Avans").reduce((sum, row) => sum + toNumber(row?.amount), 0),
      deduction: own
        .filter((row) => ["Kesinti", "Devamsızlık"].includes(row?.type))
        .filter((row) => row?.payrollEffect !== "Yıllık izinden düş")
        .reduce((sum, row) => sum + toNumber(row?.amount), 0),
      salary: toNumber(person.salary),
      roadAllowance: toNumber(person.roadAllowance),
      bankAmount: roundCurrency(currentPayroll.bank),
      cashAmount: roundCurrency(currentPayroll.cash),
      note,
    };
  }, [defaultDate, filteredAdjustments]);

  useEffect(() => {
    setDrafts(() =>
      monthly.reduce((acc, person) => {
        acc[person.id] = aggregatePersonDraft(person);
        return acc;
      }, {}),
    );
    setSelectedId((current) =>
      monthly.some((person) => person.id === current)
        ? current
        : monthly[0]?.id || "",
    );
  }, [monthly.length, adjustments.length, filters.year, filters.month, monthly, aggregatePersonDraft]);

  if (!monthly.length) {
    return (
      <Panel title="Mesai / Kesinti / Avans" icon={Clock}>
        <div className="kyik-empty-box">
          Kayıt girmek için önce aylık personel kaydı gerekiyor.
        </div>
      </Panel>
    );
  }

  const patchDraft = (personId, patch) => {
    setDrafts((current) => ({
      ...current,
      [personId]: {
        ...(current[personId] || {}),
        ...patch,
      },
    }));
  };

  const draftFor = (person) => drafts[person.id] || aggregatePersonDraft(person);
  const personWithDraft = (person, draft = draftFor(person)) => ({
    ...person,
    salary: toNumber(person.salary),
    roadAllowance: toNumber(person.roadAllowance),
    bankAmount: roundCurrency(draft.bankAmount),
    cashAmount: roundCurrency(draft.cashAmount),
    bankAmountManual: true,
    paymentChannel:
      toNumber(draft.bankAmount) > 0 && toNumber(draft.cashAmount) > 0
        ? "Banka + Elden"
        : toNumber(draft.bankAmount) > 0
          ? "Banka"
          : "Elden",
  }, []);
  const draftAdjustmentRows = (person, draft) => {
    const payrollPerson = personWithDraft(person, draft);
    const overtimeType = resolveOvertimeType(
      draft.date || defaultDate,
      officialHolidays,
      draft.overtimeMode || "AUTO",
    );
    const overtimeAmount = roundCurrency(
      calculateAdjustmentAmount("Mesai", draft.overtimeHours, payrollPerson, "Saatlik", {
        multiplier: overtimeType.multiplier,
      }),
    );
    const rows = [];
    if (toNumber(draft.overtimeHours) > 0) {
      rows.push({
        id: `draft-${person.id}-mesai`,
        personId: person.id,
        date: draft.date || defaultDate,
        type: "Mesai",
        hours: toNumber(draft.overtimeHours),
        amount: overtimeAmount,
        overtimeMode: draft.overtimeMode || "AUTO",
        overtimeMultiplier: overtimeType.multiplier,
        payrollEffect: "Bordroya ekle",
        note: draft.note || "",
      });
    }
    if (toNumber(draft.advance) > 0) {
      rows.push({
        id: `draft-${person.id}-avans`,
        personId: person.id,
        date: draft.date || defaultDate,
        type: "Avans",
        hours: 0,
        amount: toNumber(draft.advance),
        payrollEffect: "Bordrodan düş",
        note: draft.note || "",
      });
    }
    if (toNumber(draft.deduction) > 0) {
      rows.push({
        id: `draft-${person.id}-kesinti`,
        personId: person.id,
        date: draft.date || defaultDate,
        type: "Kesinti",
        hours: 0,
        amount: toNumber(draft.deduction),
        payrollEffect: "Bordrodan düş",
        note: draft.note || "",
      });
    }
    return rows;
  };
  const replacePersonCoreAdjustments = (person, draft) => {
    const excludedTypes = new Set(["Mesai", "Avans", "Kesinti"]);
    return [
      ...filteredAdjustments.filter(
        (row) => row?.personId !== person.id || !excludedTypes.has(row?.type),
      ),
      ...draftAdjustmentRows(person, draft),
    ];
  };
  const rowTotals = (person) => {
    const draft = draftFor(person);
    const payrollPerson = personWithDraft(person, draft);
    const overtimeType = resolveOvertimeType(
      draft.date || defaultDate,
      officialHolidays,
      draft.overtimeMode || "AUTO",
    );
    const overtimeAmount = roundCurrency(
      calculateAdjustmentAmount("Mesai", draft.overtimeHours, payrollPerson, "Saatlik", {
        multiplier: overtimeType.multiplier,
      }),
    );
    const additions = overtimeAmount;
    const deductions = toNumber(draft.advance) + toNumber(draft.deduction);
    const payroll = calculatePayroll(payrollPerson, replacePersonCoreAdjustments(payrollPerson, draft));
    return { draft, overtimeType, overtimeAmount, additions, deductions, payroll, payrollPerson };
  };

  const upsertSingleType = async (person, type, amount, extra = {}) => {
    const existing = existingForPerson(person.id, type);
    const first = existing[0];
    const positive = toNumber(amount) > 0 || toNumber(extra.hours) > 0;
    if (!positive) {
      for (const row of existing) {
        if (row?.id) await deleteAdjustment(row.id);
      }
      return [];
    }
    const payload = {
      personId: person.id,
      date: extra.date || defaultDate,
      type,
      hours: toNumber(extra.hours),
      amount: roundCurrency(amount),
      amountManual: type !== "Mesai",
      overtimeMode: extra.overtimeMode || "AUTO",
      overtimeMultiplier: extra.overtimeMultiplier,
      payrollEffect: payrollEffectForType(type, extra.payrollEffect),
      note: extra.note || "",
      status: "Taslak",
      id: first?.id || `adj-${person.id}-${type}-${Date.now()}`,
    };
    const saved = first?.id
      ? await updateAdjustment(first.id, payload)
      : await saveAdjustment(payload);
    for (const extraRow of existing.slice(1)) {
      if (extraRow?.id) await deleteAdjustment(extraRow.id);
    }
    return [normalizeAdjustment(saved || payload)];
  };

  const savePersonRow = async (person) => {
    const draft = draftFor(person);
    const totals = rowTotals(person);
    setSavingRows((current) => ({ ...current, [person.id]: true }));
    setFormError("");
    try {
      if (savePerson) {
        await savePerson(totals.payrollPerson);
      }
      const savedRows = [
        ...(await upsertSingleType(person, "Mesai", totals.overtimeAmount, {
          date: draft.date,
          hours: draft.overtimeHours,
          overtimeMode: draft.overtimeMode,
          overtimeMultiplier: totals.overtimeType.multiplier,
          payrollEffect: "Bordroya ekle",
          note: draft.note,
        })),
        ...(await upsertSingleType(person, "Avans", draft.advance, {
          date: draft.date,
          payrollEffect: "Bordrodan düş",
          note: draft.note,
        })),
        ...(await upsertSingleType(person, "Kesinti", draft.deduction, {
          date: draft.date,
          payrollEffect: "Bordrodan düş",
          note: draft.note,
        })),
      ];
      const replaceIds = new Set(
        filteredAdjustments
          .filter(
            (row) =>
              row?.personId === person.id &&
              ["Mesai", "Avans", "Kesinti"].includes(row?.type),
          )
          .map((row) => row.id),
      );
      setAdjustments((current) => [
        ...current.filter((row) => !replaceIds.has(row?.id)),
        ...savedRows,
      ]);
    } catch (error) {
      setFormError(error?.message || "Satır kaydedilemedi.");
    } finally {
      setSavingRows((current) => ({ ...current, [person.id]: false }));
    }
  };

  const addOfficialHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      setFormError("Resmi tatil için tarih ve ad zorunlu.");
      return;
    }
    try {
      const saved = await saveResmiTatil({
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        year: Number(holidayForm.date.slice(0, 4)),
        active: true,
      });
      setOfficialHolidays((current) => {
        const withoutSameDate = current?.filter(
          (row) => dateOnlyText(row?.date || row?.tarih) !== holidayForm.date,
        );
        return [...withoutSameDate, saved || holidayForm].sort((a, b) =>
          dateOnlyText(a.date || a.tarih).localeCompare(dateOnlyText(b.date || b.tarih)),
        );
      });
      setHolidayForm({ date: "", name: "" });
      setFormError("");
    } catch (error) {
      setFormError(error?.message || "Resmi tatil eklenemedi.");
    }
  };

  const monthRows = visiblePeople.map((person) => {
    const totals = rowTotals(person);
    return {
      person,
      ...totals,
      annualRemaining: Math.max(
        DEFAULT_ANNUAL_LEAVE_DAYS -
          annualLeaveUsedForPerson(person.id, leaves, adjustments),
        0,
      ),
    };
  });
  const monthOvertime = monthRows.reduce((sum, row) => sum + row.overtimeAmount, 0);
  const monthAdvance = monthRows.reduce((sum, row) => sum + toNumber(row.draft.advance), 0);
  const monthDeduction = monthRows.reduce((sum, row) => sum + toNumber(row.draft.deduction), 0);
  const selectedTotals = selected ? rowTotals(selected) : null;
  const saveVisibleRows = async () => {
    if (!monthRows.length || savingAll) return;
    setSavingAll(true);
    setFormError("");
    try {
      for (const row of monthRows) {
        await savePersonRow(row.person);
      }
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="kyik-workspace with-rail adjustment-bulk">
      <main className="kyik-main-stack">
        <Panel
          title="Toplu Avans / Ödeme Giriş Havuzu"
          icon={Clock}
          action={
            <div className="kyik-adjustment-toolbar">
              <SelectInput
                value={filters.year}
                onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}
              >
                {YEAR_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectInput>
              <SelectInput
                value={filters.month}
                onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
              >
                {MONTH_NAMES.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectInput>
              <SelectInput
                value={filters.payment}
                onChange={(event) => setFilters((current) => ({ ...current, payment: event.target.value }))}
              >
                <option>Tümü</option>
                <option>Banka alanlar</option>
                <option>Elden alanlar</option>
                <option>Banka + Elden</option>
              </SelectInput>
              <TextInput
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Personel ara / filtrele"
              />
              <Button
                icon={Save}
                tone="primary"
                onClick={saveVisibleRows}
                disabled={savingAll || !monthRows.length}
              >
                {savingAll ? "Kaydediliyor" : "Tümünü Kaydet"}
              </Button>
            </div>
          }
        >
          <div className="kyik-adjustment-board">
            <aside className="kyik-adjustment-side">
              <strong className="kyik-adjustment-person-name">{selected?.fullName || "Personel seç"}</strong>
              <small>{selected?.personnelCode || "-"} · {selected?.title || selected?.department || "-"}</small>
              {selected && selectedTotals ? (
                <>
                  <div className="kyik-adjustment-month-totals">
                    <span>Ay Toplamı</span>
                    <b>Mesai {formatTRY(monthOvertime)}</b>
                    <b>Avans {formatTRY(monthAdvance)}</b>
                    <b>Kesinti {formatTRY(monthDeduction)}</b>
                  </div>
                  <div>
                    <span>Maaş + Yol</span>
                    <b>{formatTRY(toNumber(selected.salary) + toNumber(selected.roadAllowance))}</b>
                  </div>
                  <div>
                    <span>Mesai - Avans / Kesinti</span>
                    <b>
                      {formatTRY(selectedTotals.additions)} / {formatTRY(selectedTotals.deductions)}
                    </b>
                  </div>
                  <div>
                    <span>Canlı bordro</span>
                    <b>{formatTRY(selectedTotals.payroll.total)}</b>
                  </div>
                  <div>
                    <span>Banka / Elden</span>
                    <b>{formatTRY(selectedTotals.payroll.bank)} / {formatTRY(selectedTotals.payroll.cash)}</b>
                  </div>
                  <label>
                    <span>Tarih</span>
                    <input
                      type="date"
                      value={selectedTotals.draft.date || defaultDate}
                      onChange={(event) => patchDraft(selected.id, { date: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Mesai saati</span>
                    <input
                      type="number"
                      value={selectedTotals.draft.overtimeHours}
                      onChange={(event) => patchDraft(selected.id, { overtimeHours: toNumber(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Mesai tipi</span>
                    <select
                      value={selectedTotals.draft.overtimeMode || "AUTO"}
                      onChange={(event) => patchDraft(selected.id, { overtimeMode: event.target.value })}
                    >
                      <option value="AUTO">Otomatik</option>
                      <option value="WEEKDAY_50">Hafta içi %50</option>
                      <option value="WEEKEND_100">Tatil %100</option>
                    </select>
                  </label>
                  <label>
                    <span>Not</span>
                    <textarea
                      value={selectedTotals.draft.note || ""}
                      onChange={(event) => patchDraft(selected.id, { note: event.target.value })}
                    />
                  </label>
                  <Button
                    icon={Save}
                    tone="primary"
                    onClick={() => savePersonRow(selected)}
                    disabled={Boolean(savingRows[selected.id])}
                  >
                    {savingRows[selected.id] ? "Kaydediliyor" : "Seçiliyi Kaydet"}
                  </Button>
                </>
              ) : null}
              <div className="kyik-holiday-mini">
                <strong>Resmi tatil</strong>
                <input
                  type="date"
                  value={holidayForm.date}
                  onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))}
                />
                <input
                  value={holidayForm.name}
                  onChange={(event) => setHolidayForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Tatil adı"
                />
                <Button icon={Plus} onClick={addOfficialHoliday}>Ekle</Button>
              </div>
            </aside>

            <div className="kyik-live-adjustment-table-wrap">
              <table className="kyik-live-adjustment-table">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>Maaş</th>
                    <th>Yol</th>
                    <th>Banka</th>
                    <th>Elden</th>
                    <th>Avans</th>
                    <th>Kesinti</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map(({ person, draft }) => (
                    <tr
                      key={person.id}
                      className={person.id === selected?.id ? "selected" : ""}
                      onClick={() => setSelectedId(person.id)}
                    >
                      <td className="sticky-person">
                        <strong>{person.fullName}</strong>
                        <small>{person.personnelCode} · {person.title || person.department || "-"}</small>
                      </td>
                      <td>
                        <strong>{formatTRY(person.salary)}</strong>
                      </td>
                      <td>
                        <strong>{formatTRY(person.roadAllowance)}</strong>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={draft.bankAmount}
                          onChange={(event) => patchDraft(person.id, { bankAmount: toNumber(event.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={draft.cashAmount}
                          onChange={(event) => patchDraft(person.id, { cashAmount: toNumber(event.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={draft.advance}
                          onChange={(event) => patchDraft(person.id, { advance: toNumber(event.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={draft.deduction}
                          onChange={(event) => patchDraft(person.id, { deduction: toNumber(event.target.value) })}
                        />
                      </td>
                      <td>
                        <Button
                          icon={Save}
                          tone="primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            savePersonRow(person);
                          }}
                          disabled={Boolean(savingRows[person.id])}
                        >
                          {savingRows[person.id] ? "..." : "Kaydet"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!monthRows.length ? (
                    <tr>
                      <td colSpan={8} className="kyik-empty-cell">Bu filtrede personel yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          {formError ? <div className="kyik-error-line">{formError}</div> : null}
        </Panel>

        <Panel title="Aylık Kayıt Geçmişi" icon={ClipboardList}>
          <Table
            rows={filteredAdjustments.map((row) => ({
              ...row,
              personName: monthly.find((person) => person.id === row?.personId)?.fullName || "-",
            }))}
            columns={[
              { key: "date", label: "Tarih", render: (row) => formatDate(row?.date) },
              { key: "personName", label: "Personel" },
              { key: "type", label: "Tip" },
              { key: "hours", label: "Saat / Gün" },
              { key: "amount", label: "Tutar", render: (row) => formatTRY(row?.amount) },
              { key: "payrollEffect", label: "Bordro etkisi", render: (row) => payrollEffectForType(row?.type, row?.payrollEffect) },
              { key: "note", label: "Açıklama" },
            ]}
          />
        </Panel>
      </main>
    </div>
  );
}

function PayrollScreen({
  monthly,
  adjustments,
  selectedId,
  setSelectedId,
  createPerson,
  savePerson,
  saveBusy,
  companyId,
  monthlyLogs = [],
  refreshMonthlyLogs,
}) {
  const selected =
    monthly.find((person) => person.id === selectedId) || monthly[0];
  const [filters, setFilters] = useState({
    year: String(CURRENT_YEAR),
    month: MONTH_NAMES[new Date(`${TODAY}T00:00:00`).getMonth()] || "Mayıs",
    query: "",
    sgk: "Tümü",
    payment: "Tümü",
  });
  const [bankEdits, setBankEdits] = useState({});
  const [bulkBankAmount, setBulkBankAmount] = useState(String(DEFAULT_SGK_BANK_AMOUNT));
  const [selectedPaymentIds, setSelectedPaymentIds] = useState(
    () => new Set(monthly.map((person) => person.id)),
  );
  const [paymentLog, setPaymentLog] = useState(() => [
    {
      id: "initial-check",
      time: new Date().toLocaleString("tr-TR"),
      text: "Aylık bordro ekranı açıldı; mesai eklenir, kesinti ve avans düşülür.",
    },
  ]);

  useEffect(() => {
    setSelectedPaymentIds(new Set(monthly.map((person) => person.id)));
  }, [monthly, monthly.length]);

  if (!selected) {
    return (
      <Panel title="Bordro Filtre ve Çıktı" icon={Search}>
        <div className="kyik-empty-box">
          Bordro hesaplamak için önce aylık personel kartı gerekir. Aşağıdaki hızlı kayıtla ilk kartı açıp maaş, SGK ve ödeme bilgilerini düzenleyebilirsiniz.
        </div>
        <div className="kyik-action-row">
          <Button icon={Plus} tone="primary" onClick={() => createPerson?.()} disabled={saveBusy}>
            İlk Aylık Personeli Ekle
          </Button>
        </div>
      </Panel>
    );
  }

  const personWithBankEdit = (person) => ({
    ...person,
    bankAmount:
      Object.prototype.hasOwnProperty.call(bankEdits, person.id)
         ? bankEdits[person.id]
        : person.bankAmount,
    bankAmountManual: Object.prototype.hasOwnProperty.call(
      bankEdits,
      person.id,
    ),
  }, []);
  const filteredAdjustments = adjustments.filter((row) =>
    adjustmentInYearMonth(row, filters.year, filters.month),
  );
  const rows = monthly
    .map((person, index) => {
      const editablePerson = personWithBankEdit(person);
      return {
        ...editablePerson,
        ...calculatePayroll(editablePerson, filteredAdjustments),
        payrollStatus: ["Taslak", "Hesaplandı", "Onaylandı", "Ödendi"][
          index % 4
        ],
        paymentSelected: selectedPaymentIds.has(person.id),
      };
    })
    .filter((row) =>
      row?.fullName
        .toLocaleLowerCase("tr-TR")
        .includes(filters.query.toLocaleLowerCase("tr-TR")),
    )
    .filter((row) => filters.sgk === "Tümü" || row.sgkStatus === filters.sgk)
    .filter(
      (row) =>
        filters.payment === "Tümü" || row.payrollStatus === filters.payment,
    );
  const selectedWithBankEdit = personWithBankEdit(selected);
  const selectedPayroll = calculatePayroll(
    selectedWithBankEdit,
    filteredAdjustments,
  );
  const bankTotal = rows.reduce((sum, row) => sum + row?.bank, 0);
  const cashTotal = rows.reduce((sum, row) => sum + row?.cash, 0);
  const selectedMonthNumber = Math.max(1, MONTH_NAMES.indexOf(filters.month) + 1);
  const selectedPeriod = `${filters.year}-${String(selectedMonthNumber).padStart(2, "0")}`;
  const persistedLogs = monthlyLogs
    .filter((row) => !row?.period || row.period === selectedPeriod)
    .slice(0, 80);
  const combinedPaymentLog = [
    ...persistedLogs.map((row) => ({
      id: row?.id,
      time: row?.createdAt
        ? new Date(row.createdAt).toLocaleString("tr-TR")
        : row?.period || "",
      text: `${row?.entityType || "IK"} / ${row?.action || "LOG"}: ${row?.summary || ""}`,
    })),
    ...paymentLog,
  ];
  const printablePages = rows.reduce((pages, row, index) => {
    const pageIndex = Math.floor(index / DAILY_PAYMENT_SLIPS_PER_PAGE);
    if (!pages[pageIndex]) pages[pageIndex] = [];
    pages[pageIndex].push(row);
    return pages;
  }, []);

  const handlePrint = () => {
    window.print();
  };
  const addPaymentLog = (text) => {
    setPaymentLog((current) => [
      {
        id: `paylog-${Date.now()}`,
        time: new Date().toLocaleString("tr-TR"),
        text,
      },
      ...current,
    ]);
  };
  const togglePaymentSelection = (id) => {
    setSelectedPaymentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedPaymentIds.has(row?.id));
  const selectedPaymentCount = rows.filter((row) =>
    selectedPaymentIds.has(row?.id),
  ).length;
  const applyBulkBank = (mode = "manual") => {
    const ids = rows
      .filter((row) => selectedPaymentIds.has(row?.id))
      .map((row) => row?.id);
    if (!ids.length) return;
    setBankEdits((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        if (!ids.includes(row?.id)) return;
        if (!isSgkCovered(row)) next[row?.id] = 0;
        else if (mode === "full-bank") next[row?.id] = row?.total;
        else if (mode === "cash-only") next[row?.id] = 0;
        else next[row.id] = Math.max(0, toNumber(bulkBankAmount));
      });
      return next;
    });
    addPaymentLog(
      `${selectedPaymentCount} kişi için banka ödeme dağılımı güncellendi.`,
    );
  };
  const saveSelectedPayments = async () => {
    const targets = rows.filter((row) => selectedPaymentIds.has(row?.id));
    if (!targets.length || !savePerson || saveBusy) return;
    for (const row of targets) {
      await savePerson({
        ...row,
        bankAmount: row?.bank,
        cashAmount: row?.cash,
        paymentChannel: row?.bank > 0 && row?.cash > 0 ? "Banka + Elden" : row?.bank > 0 ? "Banka" : "Elden",
      });
    }
    addPaymentLog(`${targets.length} kişinin banka/elden ödeme bilgisi kaydedildi.`);
    if (refreshMonthlyLogs) await refreshMonthlyLogs({ year: filters.year, month: selectedMonthNumber });
  };
  const exportMonthlyBackup = async () => {
    await downloadFile(
      "/ik/monthly-backup/excel",
      {
        mainCompanyId: companyId,
        year: filters.year,
        month: selectedMonthNumber,
      },
      `KYERP_IK_Aylik_Yedek_${filters.year}_${String(selectedMonthNumber).padStart(2, "0")}.xlsx`,
    );
    addPaymentLog(`${selectedPeriod} aylık İK yedek Excel'i indirildi.`);
  };

  return (
    <div className="kyik-workspace with-rail payroll">
      <main className="kyik-main-stack">
        <Panel
          title="Bordro Filtre ve Çıktı"
          icon={Search}
          className="kyik-filter-panel"
        >
          <div className="kyik-form-grid five">
            <Input label="Yıl">
              <SelectInput
                value={filters.year}
                onChange={(e) =>
                  setFilters({ ...filters, year: e.target.value })
                }
              >
                {YEAR_OPTIONS.map((yearOption) => (
                  <option key={yearOption}>{yearOption}</option>
                ))}
              </SelectInput>
            </Input>
            <Input label="Ay">
              <SelectInput
                value={filters.month}
                onChange={(e) =>
                  setFilters({ ...filters, month: e.target.value })
                }
              >
                {MONTH_NAMES.map((month) => (
                  <option key={month}>{month}</option>
                ))}
              </SelectInput>
            </Input>
            <Input label="Personel ara">
              <TextInput
                value={filters.query}
                onChange={(e) =>
                  setFilters({ ...filters, query: e.target.value })
                }
              />
            </Input>
            <Input label="SGK durumu">
              <SelectInput
                value={filters.sgk}
                onChange={(e) =>
                  setFilters({ ...filters, sgk: e.target.value })
                }
              >
                <option>Tümü</option>
                <option>VAR</option>
                <option>YOK</option>
              </SelectInput>
            </Input>
            <Input label="Ödeme durumu">
              <SelectInput
                value={filters.payment}
                onChange={(e) =>
                  setFilters({ ...filters, payment: e.target.value })
                }
              >
                <option>Tümü</option>
                <option>Taslak</option>
                <option>Hesaplandı</option>
                <option>Onaylandı</option>
                <option>Ödendi</option>
              </SelectInput>
            </Input>
          </div>
          <div className="kyik-action-row">
            <Button
              icon={WalletCards}
              tone="primary"
              onClick={() =>
                addPaymentLog(
                  `${rows.length} kişi için bordro yeniden hesaplandı.`,
                )
              }
            >
              Bordro Hesapla
            </Button>
            <Button icon={Save} onClick={saveSelectedPayments} disabled={saveBusy}>
              Seçilileri Kaydet
            </Button>
            <Button
              icon={CheckCircle2}
              onClick={() =>
                addPaymentLog(
                  `${selectedPaymentCount} kişi için ödeme onayı işaretlendi.`,
                )
              }
            >
              Ödeme Onayla
            </Button>
            <Button icon={ReceiptText} onClick={handlePrint}>
              Aylık Ödeme Fişi
            </Button>
            <Button icon={FileSpreadsheet} onClick={exportMonthlyBackup}>
              Aylık İK Excel
            </Button>
            <Button icon={ClipboardList} onClick={handlePrint}>
              Kontrol Sayfası
            </Button>
            <Button icon={FileText} onClick={handlePrint}>
              Yazdır
            </Button>
            <Button icon={FolderUp} onClick={handlePrint}>
              PDF İndir
            </Button>
          </div>
        </Panel>
        <Panel title="Toplu Banka Ödemesi" icon={Banknote}>
          <div className="kyik-bulk-pay-grid">
            <Input label="Toplu banka tutarı">
              <TextInput
                type="number"
                value={bulkBankAmount}
                onChange={(e) => setBulkBankAmount(e.target.value)}
                placeholder="Örn. 22105"
              />
            </Input>
            <div className="kyik-bulk-pay-actions">
              <Button
                icon={CheckCircle2}
                onClick={() => {
                  if (allVisibleSelected) setSelectedPaymentIds(new Set());
                  else setSelectedPaymentIds(new Set(rows.map((row) => row?.id)));
                }}
              >
                {allVisibleSelected ? "Seçimi Temizle" : "Tümünü Seç"}
              </Button>
              <Button icon={Banknote} tone="primary" onClick={() => applyBulkBank()}>
                Seçililere Uygula
              </Button>
              <Button icon={WalletCards} onClick={() => applyBulkBank("full-bank")}>
                Tamamı Banka
              </Button>
              <Button icon={Minus} onClick={() => applyBulkBank("cash-only")}>
                Elden Bırak
              </Button>
              <Button icon={Save} onClick={saveSelectedPayments} disabled={saveBusy}>
                Kaydet
              </Button>
            </div>
          </div>
          <div className="kyik-info-line">
            {selectedPaymentCount} kişi seçili. SGK yoksa tamamı elden kalır; SGK varsa
            girilen banka tutarı uygulanır, kalan otomatik elden olur.
          </div>
        </Panel>
        <Panel title="Bordro Tablosu" icon={WalletCards}>
          <Table
            rows={rows}
            columns={[
              {
                key: "paymentSelected",
                label: "Seç",
                render: (row) => (
                  <input
                    type="checkbox"
                    checked={selectedPaymentIds.has(row?.id)}
                    onChange={() => togglePaymentSelection(row?.id)}
                  />
                ),
              },
              { key: "personnelCode", label: "Kod" },
              { key: "fullName", label: "Personel" },
              {
                key: "salary",
                label: "Maaş",
                render: (row) => formatTRY(row?.salary),
              },
              {
                key: "roadAllowance",
                label: "Yol",
                render: (row) => formatTRY(row?.roadAllowance),
              },
              {
                key: "additions",
                label: "Mesai",
                render: (row) => formatTRY(row?.additions),
              },
              {
                key: "deductions",
                label: "Kesinti / Avans",
                render: (row) => formatTRY(row?.deductions),
              },
              {
                key: "bank",
                label: "Banka",
                render: (row) => (
                  <input
                    className="kyik-money-input"
                    type="number"
                    step="0.01"
                    disabled={!isSgkCovered(row)}
                    value={roundCurrency(row?.bank)}
                    onChange={(e) =>
                      setBankEdits((current) => ({
                        ...current,
                        [row?.id]: toNumber(e.target.value),
                      }))
                    }
                  />
                ),
              },
              {
                key: "cash",
                label: "Elden",
                render: (row) => formatTRY(row?.cash),
              },
              {
                key: "total",
                label: "Bordro toplamı",
                render: (row) => <strong>{formatTRY(row?.total)}</strong>,
              },
              {
                key: "payrollStatus",
                label: "Durum",
                render: (row) => (
                  <Badge
                    tone={row.payrollStatus === "Ödendi" ? "green" : "orange"}
                  >
                    {row?.payrollStatus}
                  </Badge>
                ),
              },
              {
                key: "action",
                label: "İşlem",
                render: (row) => (
                  <Button onClick={() => setSelectedId(row?.id)}>Seç</Button>
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="Seçili Personel Bordro Özeti" icon={Banknote}>
          <div className="kyik-payroll-summary">
            <div>
              <span>Maaş</span>
              <strong>{formatTRY(selected.salary)}</strong>
            </div>
            <div>
              <span>Yol</span>
              <strong>{formatTRY(selected.roadAllowance)}</strong>
            </div>
            <div>
              <span>Mesai</span>
              <strong>{formatTRY(selectedPayroll.additions)}</strong>
            </div>
            <div>
              <span>Kesinti / Avans</span>
              <strong>{formatTRY(selectedPayroll.deductions)}</strong>
            </div>
            <div className="total">
              <span>Toplam</span>
              <strong>{formatTRY(selectedPayroll.total)}</strong>
            </div>
            <div>
              <span>Banka</span>
              <strong>{formatTRY(selectedPayroll.bank)}</strong>
            </div>
            <div>
              <span>Elden</span>
              <strong>{formatTRY(selectedPayroll.cash)}</strong>
            </div>
          </div>
          <div className="kyik-action-row">
            <Button icon={ReceiptText} tone="primary" onClick={handlePrint}>
              Bordro Fişi
            </Button>
            <Button icon={ClipboardList} onClick={handlePrint}>
              Kontrol Sayfası
            </Button>
            <Button icon={CheckCircle2}>Ödeme Onayla</Button>
          </div>
        </Panel>
        <Panel
          title="Aylık Ödeme Fişi Çıktısı"
          icon={ReceiptText}
          className="printable monthly-print"
        >
          {printablePages.map((pageRows, pageIndex) => (
            <section
              className="monthly-print-page"
              key={`monthly-${pageIndex + 1}`}
            >
              <div className="monthly-print-title">
                AYLIK PERSONEL ODEME FISLERI
              </div>
              <div className="monthly-print-subtitle">
                Sayfa {pageIndex + 1} / {printablePages.length} · 10 fis duzeni
              </div>
              <div className="monthly-slip-grid">
                {pageRows.map((row) => (
                  <div className="monthly-slip-card" key={row?.id}>
                    <h4>{row?.fullName}</h4>
                    <strong>ODEME FISI</strong>
                    <div>
                      <span>Maaş / Yol</span>
                      <b>
                        {formatTRY(row?.salary)} / {formatTRY(row?.roadAllowance)}
                      </b>
                    </div>
                    <div>
                      <span>Toplam Mesai / Avans</span>
                      <b>
                        {formatTRY(row?.additions)} / {formatTRY(row?.deductions)}
                      </b>
                    </div>
                    <div>
                      <span>Kesinti / Avans</span>
                      <b>{formatTRY(row?.deductions)}</b>
                    </div>
                    <div>
                      <span>Banka / Elden</span>
                      <b>
                        {formatTRY(row?.bank)} / {formatTRY(row?.cash)}
                      </b>
                    </div>
                    <div className="big">
                      <span>Toplam Odenecek</span>
                      <b>{formatTRY(row?.total)}</b>
                    </div>
                    <div className="big">
                      <span>Elden Odeme</span>
                      <b>{formatTRY(row?.cash)}</b>
                    </div>
                    <small>
                      Aciklama: Maas {formatTRY(row?.salary)} + yol{" "}
                      {formatTRY(row?.roadAllowance)} + ek odeme{" "}
                      {formatTRY(row?.additions)} - kesinti{" "}
                      {formatTRY(row?.deductions)}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="monthly-control-page">
            <h3>Kontrol Sayfası</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Personel</th>
                  <th>Banka</th>
                  <th>Elden</th>
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row?.id}>
                    <td>{index + 1}</td>
                    <td>{row?.fullName}</td>
                    <td>{formatTRY(row?.bank)}</td>
                    <td>{formatTRY(row?.cash)}</td>
                    <td>{formatTRY(row?.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2">Alt toplam</td>
                  <td>{formatTRY(bankTotal)}</td>
                  <td>{formatTRY(cashTotal)}</td>
                  <td>{formatTRY(bankTotal + cashTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
        <Panel title="Aylık İşlem Logu" icon={ClipboardList}>
          <div className="kyik-payment-log">
            {combinedPaymentLog.map((item) => (
              <div className="kyik-log-row" key={item?.id}>
                <strong>{item?.time}</strong>
                <span>{item?.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </main>
      <PersonList
        people={monthly}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />
    </div>
  );
}

function DocumentsScreen({ monthly, docs, setDocs, saveDocument, deleteDocument }) {
  const [form, setForm] = useState({
    personId: monthly[0]?.id || "",
    type: "Kimlik",
    file: "",
    date: TODAY,
    status: "Bekliyor",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!form.personId && monthly[0]?.id) {
      setForm((current) => ({ ...current, personId: monthly[0]?.id || "" }));
    }
  }, [monthly.length, form.personId, monthly]);
  const rows = docs.map((doc) => ({
    ...doc,
    personName:
      monthly.find((person) => person.id === doc.personId)?.fullName || "-",
  }));

  const save = async () => {
    if (!form.personId) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await saveDocument?.(form);
      const normalized = normalizeDocument(saved || { ...form, id: `doc-${Date.now()}` });
      setDocs((current) => [normalized, ...current]);
      setForm((current) => ({ ...current, file: "" }));
      setNotice("Evrak kaydı SQL'e eklendi.");
    } catch (error) {
      setNotice(error?.message || "Evrak kaydı eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!doc?.id) return;
    setBusy(true);
    setNotice("");
    try {
      await deleteDocument?.(doc.id);
      setDocs((current) => current.filter((item) => item.id !== doc.id));
      setNotice("Evrak kaydı silindi.");
    } catch (error) {
      setNotice(error?.message || "Evrak kaydı silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kyik-screen">
      <Panel title="Personel Evrak Yükleme" icon={FolderUp}>
        {notice ? <div className="kyik-save-notice">{notice}</div> : null}
        <div className="kyik-form-grid four">
          <Input label="Personel">
            <SelectInput
              value={form.personId}
              onChange={(e) => setForm({ ...form, personId: e.target.value })}
            >
              {monthly.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </SelectInput>
          </Input>
          <Input label="Evrak türü">
            <SelectInput
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option>Kimlik</option>
              <option>SGK giriş</option>
              <option>Sözleşme</option>
              <option>Banka bilgisi</option>
              <option>Sağlık raporu</option>
              <option>İzin formu</option>
              <option>Rapor</option>
              <option>Uyarı / tutanak</option>
              <option>Diğer</option>
            </SelectInput>
          </Input>
          <Input label="Dosya adı">
            <TextInput
              value={form.file}
              placeholder="evrak.pdf"
              onChange={(e) => setForm({ ...form, file: e.target.value })}
            />
          </Input>
          <Input label="Tarih">
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Input>
        </div>
        <div className="kyik-upload-box">
          <FolderUp size={28} />
          <strong>Evrak yükleme alanı</strong>
          <span>
            Dosya seçimi için kayıt satırı oluşturulur; gerçek dosya servisi
            bağlandığında aynı liste kullanılabilir.
          </span>
        </div>
        <div className="kyik-action-row">
          <Button icon={Plus} tone="primary" onClick={save} disabled={busy || !form.personId}>
            Evrak Kaydet
          </Button>
        </div>
      </Panel>
      <Panel title="Evrak / Belgeler Listesi" icon={FileText}>
        <Table
          rows={rows}
          columns={[
            { key: "personName", label: "Personel" },
            { key: "type", label: "Evrak türü" },
            { key: "file", label: "Dosya" },
            {
              key: "date",
              label: "Tarih",
              render: (row) => formatDate(row?.date),
            },
            {
              key: "status",
              label: "Durum",
              render: (row) => (
                <Badge tone={row.status === "Tamam" ? "green" : "orange"}>
                  {row?.status}
                </Badge>
              ),
            },
            {
              key: "action",
              label: "İşlem",
              render: (row) => (
                <div className="kyik-table-actions">
                  <Button>Aç</Button>
                  <Button>İndir</Button>
                  <Button icon={Trash2} onClick={() => remove(row)} disabled={busy}>
                    Sil
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function DailyCards({
  daily,
  setDaily,
  companyId,
  skills = [],
  onCreateSkill,
  range,
  setRange,
}) {
  const emptyDailyForm = useMemo(() => ({
    id: "",
    name: "",
    skillId: "",
    role: "VASIFSIZ",
    broker: "Direkt",
    dayRate: 0,
    nightRate: 0,
    active: true,
  }), []);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [form, setForm] = useState(emptyDailyForm);
  const [isNew, setIsNew] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const visibleDaily = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    const nameMatches = (person) => {
      if (!term) return true;
      return String(person.name || "")
        .toLocaleLowerCase("tr-TR")
        .split(/\s+/)
        .some((part) => part.startsWith(term));
    };
    return daily
      .filter((person) => person.active !== false)
      .filter(nameMatches)
      .filter((person) => (roleFilter ? personSkillName(person, skills) === roleFilter : true));
  }, [daily, roleFilter, search, skills]);

  const selected = daily.find((person) => person.id === selectedId) || null;

  useEffect(() => {
    if (isNew) return;
    if (!selected) {
      setForm(emptyDailyForm);
      return;
    }
    setForm({
      id: selected.id,
      name: selected.name || "",
      role: selected.role || "VASIFSIZ",
      skillId: canonicalSkillForPerson(selected, skills).id || "",
      broker: selected.broker || "Direkt",
      dayRate: toNumber(selected.dayRate),
      nightRate: toNumber(selected.nightRate),
      active: Boolean(selected.active),
    });
  }, [emptyDailyForm, isNew, selected, skills]);

  useEffect(() => {
    if (isNew) return;
    setSelectedId((current) => {
      if (
        current &&
        daily.some((person) => person.id === current && person.active !== false)
      )
        return current;
      return "";
    });
  }, [daily, isNew]);

  const resetNewForm = () => {
    setIsNew(true);
    setSelectedId("");
    setForm({ ...emptyDailyForm });
    setNotice("");
  };

  const saveDailyPerson = async () => {
    if (!form.name.trim()) {
      setNotice("Personel adı zorunlu.");
      return;
    }
    setSaveBusy(true);
    setNotice("");
    try {
      if (isNew || !form.id) {
        const saved = await createGunlukPersonel(
          dailyPersonPayload(form, companyId),
        );
        const normalized = normalizeDailyPerson(saved);
        setDaily((current) =>
          [...current, normalized].sort((left, right) =>
            String(left.name || "").localeCompare(
              String(right.name || ""),
              "tr",
            ),
          ),
        );
        setSelectedId(normalized.id);
        setIsNew(false);
        setNotice("Günlük personel eklendi.");
      } else {
        const saved = await updateGunlukPersonel(
          form.id,
          dailyPersonPayload(form, companyId),
        );
        const normalized = normalizeDailyPerson(saved);
        setDaily((current) =>
          current
            .map((person) =>
              person.id === normalized.id ? normalized : person,
            )
            .sort((left, right) =>
              String(left.name || "").localeCompare(
                String(right.name || ""),
                "tr",
              ),
            ),
        );
        setSelectedId(normalized.id);
        setNotice("Günlük personel güncellendi.");
      }
    } catch (error) {
      setNotice(error?.message || "Günlük personel kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected?.id || saveBusy) return;
    setSaveBusy(true);
    setNotice("");
    try {
      await deleteGunlukPersonel(selected.id, { mainCompanyId: companyId });
      setDaily((current) =>
        current.filter((person) => person.id !== selected.id),
      );
      setSelectedId("");
      setIsNew(false);
      setForm({ ...emptyDailyForm });
      setNotice("Günlük personel silindi.");
    } catch (error) {
      setNotice(error?.message || "Günlük personel silinemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const exportDailyCardsExcel = async () => {
    setSaveBusy(true);
    setNotice("");
    try {
      await downloadFile(
        "/ik/daily-employees/excel",
        { mainCompanyId: companyId, includePassive: true },
        "KYERP_Gunluk_Personel_Kartlari.xlsx",
      );
    } catch (error) {
      setNotice(error?.message || "Personel Excel'i indirilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const importDailyCardsExcel = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
        setNotice("Lütfen uygulamadan indirilen .xlsx şablonunu seçin.");
        return;
      }
      setSaveBusy(true);
      setNotice("");
      try {
        const result = await uploadGunlukPersonelExcel(file, {
          mainCompanyId: companyId,
        });
        const nextEmployees = Array.isArray(result?.employees)
          ? result.employees.map(normalizeDailyPerson)
          : daily;
        setDaily(
          nextEmployees.sort((left, right) =>
            String(left.name || "").localeCompare(String(right.name || ""), "tr"),
          ),
        );
        setNotice(`${result?.count || 0} personel kartı Excel'den uygulandı.`);
      } catch (error) {
        setNotice(error?.message || "Personel Excel'i içeri alınamadı.");
      } finally {
        setSaveBusy(false);
      }
    };
    input.click();
  };

  return (
    <div className="kyik-workspace with-rail daily-card-layout">
      <main className="kyik-main-stack">
        <Panel title="Ortak Günlük Tarih Aralığı" icon={CalendarDays}>
          <div className="kyik-form-grid two compact-filter">
            <Input label="Başlangıç">
              <TextInput
                type="date"
                value={safeRange.start}
                onChange={(event) =>
                  setRange((current) => ({ ...current, start: event?.target.value }))
                }
              />
            </Input>
            <Input label="Bitiş">
              <TextInput
                type="date"
                value={safeRange.end}
                onChange={(event) =>
                  setRange((current) => ({ ...current, end: event?.target.value }))
                }
              />
            </Input>
          </div>
          <div className="kyik-save-notice">
            Bu aralık Günlük Giriş, Haftalık Özet ve Günlük Ödeme Fişleri
            sekmelerinde ortak kullanılır ve sayfadan çıkınca korunur.
          </div>
        </Panel>
        <Panel title="Günlük Personel Kartı" icon={UserRound}>
          {notice ? <div className="kyik-save-notice">{notice}</div> : null}
          <div className="kyik-form-grid four">
            <Input label="Personel Kodu">
              <TextInput
                value={form.personnelNo || ""}
                onChange={(e) => setForm({ ...form, personnelNo: e.target.value })}
                placeholder="HKN001"
              />
            </Input>
            <Input label="Ad soyad">
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Input>
            <Input label="Vasıf">
              <SkillSelect
                value={canonicalSkillForPerson({ role: form.role }, skills).id || ""}
                skills={skills}
                companyId={companyId}
                onCreateSkill={onCreateSkill}
                  onChange={(skill) =>
                    setForm({
                      ...form,
                      skillId: skill?.id || "",
                      role: skill?.name || "",
                    })
                  }
              />
            </Input>
            <Input label="Aracı">
              <TextInput
                value={form.broker}
                onChange={(e) => setForm({ ...form, broker: e.target.value })}
              />
            </Input>
            <Input label="Durum">
              <SelectInput
                value={form.active ? "ACTIVE" : "PASSIVE"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "ACTIVE" })
                }
              >
                <option value="ACTIVE">Aktif</option>
                <option value="PASSIVE">Pasif</option>
              </SelectInput>
            </Input>
            <Input label="Gündüz günlük ücret">
              <TextInput
                type="number"
                value={form.dayRate}
                onChange={(e) =>
                  setForm({ ...form, dayRate: toNumber(e.target.value) })
                }
              />
            </Input>
            <Input label="Gece günlük ücret">
              <TextInput
                type="number"
                value={form.nightRate}
                onChange={(e) =>
                  setForm({ ...form, nightRate: toNumber(e.target.value) })
                }
              />
            </Input>
          </div>
          <div className="kyik-action-row">
            <Button icon={Plus} onClick={resetNewForm} disabled={saveBusy}>
              Yeni Personel
            </Button>
            <Button
              icon={Save}
              tone="primary"
              onClick={saveDailyPerson}
              disabled={saveBusy}
            >
              {isNew ? "Personel Ekle" : "Kaydet / Güncelle"}
            </Button>
            <Button
              icon={Minus}
              onClick={deleteSelected}
              disabled={!selected?.id || saveBusy}
            >
              Sil
            </Button>
            <Button icon={FileSpreadsheet} onClick={exportDailyCardsExcel} disabled={saveBusy}>
              Excel Aktar
            </Button>
            <Button icon={FolderUp} onClick={importDailyCardsExcel} disabled={saveBusy}>
              Excel Yükle
            </Button>
          </div>
        </Panel>
        <Panel title="Günlük Personel Kartları" icon={UserRound}>
          <Table
            rows={visibleDaily}
            columns={[
              { key: "personnelNo", label: "Kod", render: (row) => row?.personnelNo || "-" },
              { key: "name", label: "Personel" },
              { key: "role", label: "Vasıf" },
              {
                key: "dayRate",
                label: "Gündüz ücret",
                render: (row) => formatTRY(row?.dayRate),
              },
              {
                key: "nightRate",
                label: "Gece ücret",
                render: (row) => formatTRY(row?.nightRate),
              },
              { key: "broker", label: "Aracı" },
              {
                key: "active",
                label: "Durum",
                render: (row) => (
                  <Badge tone={row?.active ? "green" : "orange"}>
                    {row?.active ? "Aktif" : "Pasif"}
                  </Badge>
                ),
              },
              {
                key: "action",
                label: "İşlem",
                render: (row) => (
                  <Button
                    onClick={() => {
                      setIsNew(false);
                      setSelectedId(row?.id || "");
                    }}
                  >
                    Düzenle
                  </Button>
                ),
              },
            ]}
          />
        </Panel>
      </main>
      <aside className="kyik-person-rail">
        <div className="kyik-person-rail-head">
          <strong>Günlük Personel</strong>
          <span>{visibleDaily.length} kayıt</span>
        </div>
        <div className="kyik-person-list-search">
          <Search size={15} />
          <input
            placeholder="Personel ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="kyik-inline-filter-row">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Tüm vasıflar</option>
            {[
              ...new Set(
                daily
                  .filter((person) => person.active !== false)
                  .map((person) => personSkillName(person, skills))
                  .filter(Boolean),
              ),
            ]
              .sort((left, right) => left.localeCompare(right, "tr"))
              .map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
          </select>
        </div>
        <div className="kyik-person-list">
          {visibleDaily.map((person) => (
            <button
              className={`kyik-person-row ${selectedId === person.id && !isNew ? "active" : ""}`}
              key={person.id}
              type="button"
              onClick={() => {
                setIsNew(false);
                setSelectedId(person.id || "");
              }}
            >
              <span className="kyik-avatar">{initials(person.name)}</span>
              <span>
                <strong>{person.personnelNo ? `${person.personnelNo} · ${person.name}` : person.name}</strong>
                <small>
                  {personSkillName(person, skills)} · G {formatTRY(person.dayRate)} /
                  Gece {formatTRY(person.nightRate)}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function focusedDateParts(value, options = {}) {
  const parsed = parseLocalDateOnly(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("tr-TR", options).format(
    new Date(parsed.year, parsed.month - 1, parsed.day),
  );
}

function SafeDailyEntry({
  daily,
  setDaily,
  dailyEntries,
  setDailyEntries,
  refreshDailyEntries,
  refreshDailyPeople,
  companyId,
  skills = [],
  range,
  setRange,
}) {
  const workDays = useMemo(
    () => daysBetween(range.start, range.end),
    [range.start, range.end],
  );
  const [selectedDate, setSelectedDate] = useState(() => readStoredSelectedDailyDate());
  const [shiftMode, setShiftMode] = useState("day");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [baselineIds, setBaselineIds] = useState(() => new Set());
  const [rosterIds, setRosterIds] = useState(() => new Set());
  const [draftEntries, setDraftEntries] = useState(dailyEntries);
  const [notes, setNotes] = useState({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savingPersonIds, setSavingPersonIds] = useState(() => new Set());
  const [pendingDate, setPendingDate] = useState("");
  const [personModal, setPersonModal] = useState(null);
  const [excelPreview, setExcelPreview] = useState(null);
  const [fastCheckedKeys, setFastCheckedKeys] = useState(() => new Set(readFastCheckKeys()));
  const [entryView] = useState("detail");
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickAddPersonId, setQuickAddPersonId] = useState("");

  useEffect(() => {
    if (!workDays.length) {
      setSelectedDate("");
      return;
    }
    if (!workDays.includes(selectedDate)) {
      const next = workDays[0];
      setSelectedDate(next);
      writeStoredSelectedDailyDate(next);
    }
  }, [workDays, selectedDate]);

  useEffect(() => {
    if (!dirty) setDraftEntries(dailyEntries);
  }, [dailyEntries, dirty]);

  useEffect(() => {
    if (!range.start || !range.end) return;
    let cancelled = false;
    getGunlukPersonelListe({
      startDate: range.start,
      endDate: range.end,
      mainCompanyId: companyId,
    })
      .then((result) => {
        if (cancelled) return;
        setRosterIds(new Set(result?.employeeIds || []));
      })
      .catch((error) =>
        setNotice(error?.message || "Tarih aralığı personel listesi okunamadı."),
      );
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, companyId]);

  useEffect(() => {
    if (!selectedDate || dirty) return;
    let cancelled = false;
    getGunlukPersonelGunKayitlari({
      date: selectedDate,
      shift: shiftMode,
      mainCompanyId: companyId,
    })
      .then((rows) => {
        if (cancelled) return;
        const ids = new Set();
        const nextNotes = {};
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          if (row?.selected) ids.add(String(row?.employeeId));
          if (row.employeeId) nextNotes[row.employeeId] = row?.note || "";
        });
        setSelectedIds(ids);
        setBaselineIds(new Set(ids));
        setNotes(nextNotes);
      })
      .catch((error) =>
        setNotice(error?.message || "Seçili gün kayıtları okunamadı."),
      );
    return () => {
      cancelled = true;
    };
  }, [selectedDate, shiftMode, companyId, dailyEntries, dirty]);

  const entryKeyFor = (personId, date = selectedDate) => `${personId}-${date}`;
  const getDraftEntry = (personId, date = selectedDate) =>
    draftEntries[entryKeyFor(personId, date)] || { day: false, night: false };
  const modeLabel = shiftMode === "day" ? "Gündüz" : "Gece";
  const modeCode = shiftMode === "day" ? "G" : "N";
  const activeDayInfo = useMemo(
    () => ({
      date: selectedDate,
      long: focusedDateParts(selectedDate, {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "long",
      }),
      short: focusedDateParts(selectedDate, {
        day: "numeric",
        month: "short",
        weekday: "long",
      }),
      mini: shortDate(selectedDate),
    }),
    [selectedDate],
  );
  const activeDateLong = activeDayInfo.long;
  const activeDateShort = activeDayInfo.short;
  const fastCheckScope = `${companyId}|${range.start}|${range.end}|${selectedDate}|${shiftMode}`;
  const fastCheckKeyFor = (personId) => `${fastCheckScope}|${personId}`;
  const quickCheckKeyFor = (personId, date, shift = shiftMode) => `${companyId}|${range.start}|${range.end}|${date}|${shift}|${personId}`;
  useEffect(() => {
    setFastCheckedKeys(new Set(readFastCheckKeys()));
  }, [fastCheckScope]);
  const toggleFastChecked = (personId) => {
    setFastCheckedKeys((current) => {
      const next = new Set(current);
      const key = fastCheckKeyFor(personId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFastCheckKeys(next);
      return next;
    });
  };

  const toggleQuickChecked = (personId, date) => {
    const entry = getDraftEntry(personId, date);
    if (!entry[shiftMode]) return;
    setFastCheckedKeys((current) => {
      const next = new Set(current);
      const key = quickCheckKeyFor(personId, date);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFastCheckKeys(next);
      return next;
    });
  };

  const visiblePeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return daily.filter((person) => {
      const role = personSkillName(person, skills);
      if (roleFilter && role !== roleFilter) return false;
      if (!term) return true;
      return `${person.name} ${role} ${person.broker || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(term);
    });
  }, [daily, search, roleFilter, skills]);

  const includedPeople = daily.filter(
    (person) => person.active !== false && rosterIds.has(person.id),
  );
  const groupedIncludedPeople = useMemo(() => {
    const groups = new Map();
    includedPeople.forEach((person) => {
      const label = personSkillGroupTitle(person, skills);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(person);
    });
    return [...groups.entries()]
      .map(([label, people]) => ({
        label,
        people: [...people].sort((left, right) =>
          left.name.localeCompare(right.name, "tr"),
        ),
      }))
      .sort((left, right) =>
        skillGroupSortValue(left.label).localeCompare(
          skillGroupSortValue(right.label),
          "tr",
        ),
      );
  }, [includedPeople, skills]);
  const daySummaries = useMemo(
    () =>
      workDays.map((date) => {
        let dayCount = 0;
        let nightCount = 0;
        let dayTotal = 0;
        let nightTotal = 0;
        includedPeople.forEach((person) => {
          const entry = draftEntries[`${person.id}-${date}`] || {};
          if (entry.day) {
            dayCount += 1;
            dayTotal += toNumber(person.dayRate);
          }
          if (entry.night) {
            nightCount += 1;
            nightTotal += toNumber(person.nightRate);
          }
        });
        return {
          date,
          dayCount,
          nightCount,
          dayTotal,
          nightTotal,
          total: dayTotal + nightTotal,
        };
      }),
    [workDays, includedPeople, draftEntries],
  );
  const selectedSummary =
    daySummaries.find((item) => item.date === selectedDate) || {
      dayCount: 0,
      nightCount: 0,
      dayTotal: 0,
      nightTotal: 0,
      total: 0,
    };
  const rangeSummary = daySummaries.reduce(
    (total, day) => ({
      dayCount: total.dayCount + day.dayCount,
      nightCount: total.nightCount + day.nightCount,
      dayTotal: total.dayTotal + day.dayTotal,
      nightTotal: total.nightTotal + day.nightTotal,
      total: total.total + day.total,
    }),
    { dayCount: 0, nightCount: 0, dayTotal: 0, nightTotal: 0, total: 0 },
  );
  const activeShiftHasWork = (personId) =>
    Boolean((draftEntries[entryKeyFor(personId)] || {})[shiftMode]);
  const selectedShiftCount = includedPeople.filter((person) =>
    activeShiftHasWork(person.id),
  ).length;
  const savedCount = selectedShiftCount;
  const pendingCount = Math.max(0, includedPeople.length - selectedShiftCount);
  const activeIncludedPeople = includedPeople.filter((person) =>
    activeShiftHasWork(person.id),
  );
  const checkedCount = activeIncludedPeople.filter((person) =>
    fastCheckedKeys.has(fastCheckKeyFor(person.id)),
  ).length;
  const uncheckedCount = Math.max(0, activeIncludedPeople.length - checkedCount);
  const missingNightCount = includedPeople.filter(
    (person) => toNumber(person.nightRate) <= 0,
  ).length;
  const skillTotals = includedPeople.reduce((acc, person) => {
    if (!getDraftEntry(person.id)[shiftMode]) return acc;
    const skill = personSkillName(person, skills) || "Diğer";
    acc[skill] = (acc[skill] || 0) + 1;
    return acc;
  }, {});
  const quickSelectedCount = includedPeople.reduce((sum, person) => sum + workDays.filter((date) => Boolean(getDraftEntry(person.id, date)[shiftMode])).length, 0);
  const quickCheckedCount = includedPeople.reduce((sum, person) => sum + workDays.filter((date) => Boolean(getDraftEntry(person.id, date)[shiftMode]) && fastCheckedKeys.has(quickCheckKeyFor(person.id, date))).length, 0);
  const quickPersonCount = new Set(includedPeople.filter((person) => workDays.some((date) => Boolean(getDraftEntry(person.id, date)[shiftMode]))).map((person) => person.id)).size;
  const quickPendingCount = Math.max(0, quickSelectedCount - quickCheckedCount);
  const quickDayPeople = includedPeople.filter((person) =>
    Boolean(getDraftEntry(person.id, selectedDate)[shiftMode]),
  );
  const quickDayCheckedCount = quickDayPeople.filter((person) =>
    fastCheckedKeys.has(quickCheckKeyFor(person.id, selectedDate)),
  ).length;
  const quickDayPendingCount = Math.max(0, quickDayPeople.length - quickDayCheckedCount);
  const quickModalGroups = useMemo(() => {
    const term = quickSearch.trim().toLocaleLowerCase("tr-TR");
    if (!term) return groupedIncludedPeople;
    return groupedIncludedPeople
      .map((group) => ({
        ...group,
        people: group.people.filter((person) =>
          `${person.name || ""} ${person.personnelNo || ""} ${group.label}`
            .toLocaleLowerCase("tr-TR")
            .includes(term),
        ),
      }))
      .filter((group) => group.people.length);
  }, [groupedIncludedPeople, quickSearch]);
  const quickAvailablePeople = useMemo(
    () => daily
      .filter((person) => person.active !== false && !rosterIds.has(person.id))
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "tr")),
    [daily, rosterIds],
  );

  const setQuickCells = (people, dates, active) => {
    setDraftEntries((entries) => {
      const next = { ...entries };
      people.forEach((person) => dates.forEach((date) => {
        if (shiftMode === "night" && toNumber(person.nightRate) <= 0) return;
        const key = entryKeyFor(person.id, date);
        next[key] = { ...(next[key] || {}), [shiftMode]: active };
      }));
      return next;
    });
    if (!active) {
      setFastCheckedKeys((current) => {
        const next = new Set(current);
        people.forEach((person) => dates.forEach((date) => next.delete(quickCheckKeyFor(person.id, date))));
        writeFastCheckKeys(next);
        return next;
      });
    }
    setDirty(true);
  };

  const toggleQuickCell = (person, date) => {
    if (shiftMode === "night" && toNumber(person.nightRate) <= 0) {
      setNotice(`${person.name}: Gece ücreti tanımlı değil.`);
      return;
    }
    const active = Boolean(getDraftEntry(person.id, date)[shiftMode]);
    setQuickCells([person], [date], !active);
  };

  const saveQuickMatrix = async () => {
    const changes = [];
    workDays.forEach((date) => {
      const personnelEntries = includedPeople.flatMap((person) => {
        const key = entryKeyFor(person.id, date);
        const before = Boolean((dailyEntries[key] || {})[shiftMode]);
        const after = Boolean((draftEntries[key] || {})[shiftMode]);
        if (before === after) return [];
        return [{ personelId: person.id, note: "", status: after ? "ACTIVE" : "REMOVE" }];
      });
      if (personnelEntries.length) changes.push({ date, personnelEntries });
    });
    if (!changes.length) {
      setNotice("Hızlı girişte kaydedilecek değişiklik yok.");
      return;
    }
    setSaveBusy(true);
    try {
      for (const change of changes) await saveGunlukPersonelGunKayitlari({ date: change.date, shift: shiftMode, mainCompanyId: companyId, personnelEntries: change.personnelEntries });
      const refreshed = refreshDailyEntries ? await refreshDailyEntries(range) : draftEntries;
      setDraftEntries(refreshed);
      setDailyEntries(refreshed);
      setDirty(false);
      setNotice(`${changes.length} gün için ${modeLabel} hızlı giriş değişiklikleri kaydedildi.`);
    } catch (error) {
      setNotice(error?.message || "Hızlı giriş kayıtları kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const openQuickModal = () => {
    if (dirty) {
      setNotice("Hızlı girişi açmadan önce mevcut değişiklikleri kaydedin veya geri alın.");
      return;
    }
    if (!workDays.length || !selectedDate) {
      setNotice("Hızlı giriş için geçerli bir tarih aralığı seçin.");
      return;
    }
    setQuickSearch("");
    setQuickAddPersonId("");
    setQuickModalOpen(true);
    setNotice("");
  };

  const closeQuickModal = () => {
    if (dirty && !window.confirm("Kaydedilmemiş hızlı giriş seçimleri silinsin mi?")) return;
    if (dirty) {
      setDraftEntries(dailyEntries);
      setDirty(false);
    }
    setQuickModalOpen(false);
    setNotice("");
  };

  const changeQuickDate = (date) => {
    if (!date || date === selectedDate) return;
    if (dirty) {
      setNotice("Yanlış güne kayıt gitmemesi için önce bu günün değişikliklerini kaydedin.");
      return;
    }
    setSelectedDate(date);
    writeStoredSelectedDailyDate(date);
    setNotice("");
  };

  const saveQuickDay = async (nextDate = "") => {
    const personnelEntries = includedPeople.flatMap((person) => {
      const key = entryKeyFor(person.id, selectedDate);
      const before = Boolean((dailyEntries[key] || {})[shiftMode]);
      const after = Boolean((draftEntries[key] || {})[shiftMode]);
      if (before === after) return [];
      return [{ personelId: person.id, note: "", status: after ? "ACTIVE" : "REMOVE" }];
    });
    if (!personnelEntries.length) {
      setDraftEntries(dailyEntries);
      setDirty(false);
      setNotice("Bu gün için kaydedilecek değişiklik yok.");
      if (nextDate) {
        setSelectedDate(nextDate);
        writeStoredSelectedDailyDate(nextDate);
      }
      return true;
    }
    setSaveBusy(true);
    try {
      await saveGunlukPersonelGunKayitlari({
        date: selectedDate,
        shift: shiftMode,
        mainCompanyId: companyId,
        personnelEntries,
      });
      const refreshed = refreshDailyEntries ? await refreshDailyEntries(range) : draftEntries;
      setDraftEntries(refreshed);
      setDailyEntries(refreshed);
      setDirty(false);
      setNotice(`${activeDayInfo.long} ${modeLabel} hızlı giriş kayıtları kaydedildi.`);
      if (nextDate) {
        setSelectedDate(nextDate);
        writeStoredSelectedDailyDate(nextDate);
      }
      return true;
    } catch (error) {
      setNotice(error?.message || "Hızlı giriş kayıtları kaydedilemedi.");
      return false;
    } finally {
      setSaveBusy(false);
    }
  };

  const changeSelectedDate = (date) => {
    if (date === selectedDate) return;
    if (dirty) {
      setPendingDate(date);
      return;
    }
    setSelectedDate(date);
    writeStoredSelectedDailyDate(date);
    setNotice("");
  };

  const setShift = (nextShift) => {
    if (nextShift === shiftMode) return;
    if (dirty) {
      setNotice("Vardiya değiştirmeden önce seçili günün değişikliklerini kaydedin.");
      return;
    }
    setShiftMode(nextShift);
  };

  const persistRoster = async (nextRoster) => {
    await saveGunlukPersonelListe({
      startDate: range.start,
      endDate: range.end,
      mainCompanyId: companyId,
      employeeIds: [...nextRoster],
    });
    setRosterIds(nextRoster);
  };

  const toggleRosterPerson = async (personId) => {
    const person = daily.find((item) => item.id === personId);
    const next = new Set(rosterIds);
    const willAdd = !next.has(personId);
    if (willAdd) next.add(personId);
    else next.delete(personId);
    try {
      await persistRoster(next);
      setNotice(
        willAdd
           ? `${person.name || "Personel"} tarih aralığı listesine eklendi.`
          : `${person.name || "Personel"} tarih aralığı listesinden çıkarıldı.`,
      );
      return true;
    } catch (error) {
      setNotice(error?.message || "Tarih aralığı listesi kaydedilemedi.");
      return false;
    }
  };

  const addQuickRosterPerson = async () => {
    if (!quickAddPersonId) {
      setNotice("Önce listeden eklenecek personeli seçin.");
      return;
    }
    const saved = await toggleRosterPerson(quickAddPersonId);
    if (saved) setQuickAddPersonId("");
  };

  const reloadDailyAfterSave = async () => {
    const refreshed = refreshDailyEntries
       ? await refreshDailyEntries(range)
      : dailyEntries;
    setDraftEntries(refreshed);
    setDailyEntries(refreshed);
    const nextSelected = new Set(
      includedPeople
        .filter((person) => Boolean(refreshed[entryKeyFor(person.id)]?.[shiftMode]))
        .map((person) => person.id),
    );
    setSelectedIds(nextSelected);
    setBaselineIds(new Set(nextSelected));
    setDirty(false);
    return refreshed;
  };

  const toggleActiveShift = async (person) => {
    if (shiftMode === "night" && toNumber(person.nightRate) <= 0) {
      setNotice(`${person.name}: Gece ücreti tanımlı değil.`);
      return;
    }
    const key = entryKeyFor(person.id);
    const current = getDraftEntry(person.id);
    const nextActive = !current[shiftMode];
    setDraftEntries((entries) => ({
      ...entries,
      [key]: { ...current, [shiftMode]: nextActive },
    }));
    setSelectedIds((ids) => {
      const next = new Set(ids);
      if (nextActive) next.add(person.id);
      else next.delete(person.id);
      return next;
    });
    setSavingPersonIds((currentIds) => new Set([...currentIds, person.id]));
    try {
      await saveGunlukPersonelGunKayitlari({
        date: selectedDate,
        shift: shiftMode,
        mainCompanyId: companyId,
        personnelEntries: [{
          personelId: person.id,
          note: notes[person.id] || "",
          status: nextActive ? "ACTIVE" : "REMOVE",
        }],
      });
      await reloadDailyAfterSave();
      setNotice(
        `${person.name} · ${activeDateShort} ${modeCode} ${
          nextActive ? "kaydedildi" : "kaydı kaldırıldı"
        }.`,
      );
    } catch (error) {
      setDraftEntries((entries) => ({
        ...entries,
        [key]: { ...current, [shiftMode]: current[shiftMode] },
      }));
      setSelectedIds((ids) => {
        const next = new Set(ids);
        if (current[shiftMode]) next.add(person.id);
        else next.delete(person.id);
        return next;
      });
      setNotice(error?.message || "Günlük vardiya kaydedilemedi.");
    } finally {
      setSavingPersonIds((currentIds) => {
        const next = new Set(currentIds);
        next.delete(person.id);
        return next;
      });
    }
  };

  const selectAllForActiveDay = async () => {
    const eligiblePeople = includedPeople.filter(
      (person) => shiftMode === "day" || toNumber(person.nightRate) > 0,
    );
    setSelectedIds(new Set(eligiblePeople.map((person) => person.id)));
    setDraftEntries((entries) => {
      const next = { ...entries };
      eligiblePeople.forEach((person) => {
        const key = entryKeyFor(person.id);
        next[key] = { ...(next[key] || {}), [shiftMode]: true };
      });
      return next;
    });
    setSaveBusy(true);
    try {
      await saveGunlukPersonelGunKayitlari({
        date: selectedDate,
        shift: shiftMode,
        mainCompanyId: companyId,
        personnelEntries: eligiblePeople.map((person) => ({
          personelId: person.id,
          note: notes[person.id] || "",
          status: "ACTIVE",
        })),
      });
      await reloadDailyAfterSave();
      setNotice(`${activeDateShort} için ${eligiblePeople.length} personel seçildi ve kaydedildi.`);
    } catch (error) {
      await reloadDailyAfterSave();
      setNotice(error?.message || "Toplu vardiya seçimi kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const clearActiveDaySelection = async () => {
    setDraftEntries((entries) => {
      const next = { ...entries };
      includedPeople.forEach((person) => {
        const key = entryKeyFor(person.id);
        next[key] = { ...(next[key] || {}), [shiftMode]: false };
      });
      return next;
    });
    setSelectedIds(new Set());
    setSaveBusy(true);
    try {
      await saveGunlukPersonelGunKayitlari({
        date: selectedDate,
        shift: shiftMode,
        mainCompanyId: companyId,
        personnelEntries: includedPeople.map((person) => ({
          personelId: person.id,
          note: notes[person.id] || "",
          status: "REMOVE",
        })),
      });
      await reloadDailyAfterSave();
      setNotice(`${activeDateShort} için vardiya seçimi kaldırıldı ve kaydedildi.`);
    } catch (error) {
      await reloadDailyAfterSave();
      setNotice(error?.message || "Toplu seçim kaldırma kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const saveSelectedDay = async () => {
    if (!selectedDate) {
      setNotice("Geçerli tarih seçilmedi.");
      return false;
    }
    const affectedIds = new Set([...baselineIds, ...selectedIds]);
    if (!affectedIds.size) {
      setNotice("Seçili güne eklenmiş personel yok.");
      return false;
    }
    setSaveBusy(true);
    try {
      const personnelEntries = [...affectedIds].map((personelId) => {
        const entry = getDraftEntry(personelId);
        return {
          personelId,
          note: notes[personelId] || "",
          status: entry[shiftMode] && selectedIds.has(personelId) ? "ACTIVE" : "REMOVE",
        };
      });
      await saveGunlukPersonelGunKayitlari({
        date: selectedDate,
        shift: shiftMode,
        mainCompanyId: companyId,
        personnelEntries,
      });
      const refreshed = refreshDailyEntries
         ? await refreshDailyEntries(range)
        : dailyEntries;
      setDraftEntries(refreshed);
      setDailyEntries(refreshed);
      const nextBaseline = new Set(
        [...selectedIds].filter(
          (personId) => Boolean(refreshed[entryKeyFor(personId)]?.[shiftMode]),
        ),
      );
      setBaselineIds(nextBaseline);
      setSelectedIds((current) => {
        const next = new Set(current);
        nextBaseline.forEach((id) => next.add(id));
        return next;
      });
      setDirty(false);
      setNotice(`${activeDateLong} ${modeLabel} kayıtları kaydedildi.`);
      return true;
    } catch (error) {
      setNotice(error?.message || "Günlük giriş kaydedilemedi.");
      return false;
    } finally {
      setSaveBusy(false);
    }
  };

  const savePersonModal = async () => {
    if (!personModal.form.name.trim()) {
      setNotice("Personel adı zorunlu.");
      return;
    }
    if (personModal.mode === "new") {
      const normalizedName = personModal.form.name
        .trim()
        .toLocaleUpperCase("tr-TR");
      const existingPerson = daily.find(
        (person) =>
          String(person.name || "").trim().toLocaleUpperCase("tr-TR") ===
          normalizedName,
      );
      if (existingPerson) {
        setSaveBusy(true);
        try {
          const nextRoster = new Set([...rosterIds, existingPerson.id]);
          await persistRoster(nextRoster);
          setPersonModal(null);
          setNotice(
            `${existingPerson.name} zaten personel havuzunda vardı; yeni kayıt açılmadı ve bu tarih aralığına eklendi.`,
          );
        } catch (error) {
          setNotice(error?.message || "Mevcut personel tarih aralığına eklenemedi.");
        } finally {
          setSaveBusy(false);
        }
        return;
      }
    }
    setSaveBusy(true);
    try {
      const payload = dailyPersonPayload(personModal.form, companyId);
      const saved = personModal.mode === "new"
         ? await createGunlukPersonel(payload)
        : await updateGunlukPersonel(personModal.form.id, payload);
      const normalized = normalizeDailyPerson(saved);
      setDaily((current) =>
        (personModal.mode === "new"
           ? [...current, normalized]
          : current.map((person) =>
              person.id === normalized.id ? normalized : person,
            )
        ).sort((left, right) =>
          String(left.name || "").localeCompare(String(right.name || ""), "tr"),
        ),
      );
      const nextRoster = new Set([...rosterIds, normalized.id]);
      await persistRoster(nextRoster);
      setPersonModal(null);
      setNotice(
        personModal.mode === "new"
           ? `${normalized.name} oluşturuldu ve bu tarih aralığının personel listesine eklendi.`
          : `${normalized.name} bilgileri güncellendi.`,
      );
    } catch (error) {
      setNotice(error?.message || "Personel kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const exportExcel = async () => {
    setSaveBusy(true);
    setNotice("");
    try {
      await downloadFile(
        "/ik/gunluk-personel/excel",
        {
          startDate: range.start,
          endDate: range.end,
          mainCompanyId: companyId,
        },
        `KYERP_Gunluk_Personel_${range.start}_${range.end}.xlsx`,
      );
    } catch (error) {
      setNotice(error?.message || "Günlük giriş Excel'i indirilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const importExcel = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
        setNotice("Lütfen uygulamadan indirilen .xlsx şablonunu seçin.");
        return;
      }
      setSaveBusy(true);
      setNotice("");
      try {
        const result = await uploadGunlukPersonelGirisExcel(file, {
          startDate: range.start,
          endDate: range.end,
          mainCompanyId: companyId,
        });
        setExcelPreview(result);
        setNotice("Excel okundu. Uygulamadan önce kontrol et.");
      } catch (error) {
        setNotice(error?.message || "Günlük giriş Excel'i içeri alınamadı.");
      } finally {
        setSaveBusy(false);
      }
    };
    input.click();
  };

  const derivePreviewRow = (row) => {
    const blocked = !row.matched || !row.workDate;
    let action = "same";
    if (blocked) action = "control";
    else if (!row.currentDay && !row.currentNight && (row.dayShift || row.nightShift)) action = "add";
    else if ((row.currentDay || row.currentNight) && !row.dayShift && !row.nightShift) action = "remove";
    else if (row.currentDay !== row.dayShift || row.currentNight !== row.nightShift) action = "change";
    return { ...row, action };
  };

  const updatePreviewRow = (key, patch) => {
    setExcelPreview((current) => ({
      ...current,
      rows: (current?.rows || []).map((row) =>
        row.key === key
          ? derivePreviewRow({ ...row, ...patch })
          : row,
      ),
    }));
  };

  const setPreviewRowsEnabled = (enabled) => {
    setExcelPreview((current) => ({
      ...current,
      rows: (current?.rows || []).map((row) => ({
        ...row,
        enabled:
          typeof enabled === "function"
            ? enabled(row)
            : Boolean(enabled),
      })),
    }));
  };

  const applyExcelPreview = async () => {
    if (!excelPreview) return;
    setSaveBusy(true);
    setNotice("");
    try {
      const result = await applyGunlukPersonelGirisExcel({
        startDate: excelPreview.startDate || range.start,
        endDate: excelPreview.endDate || range.end,
        mainCompanyId: companyId,
        rows: excelPreview.rows || [],
      });
      if (Array.isArray(result?.employeeIds)) {
        setRosterIds(new Set(result.employeeIds));
      }
      if (refreshDailyPeople) await refreshDailyPeople();
      const refreshed = refreshDailyEntries
        ? await refreshDailyEntries(range)
        : dailyEntries;
      setDraftEntries(refreshed);
      setDailyEntries(refreshed);
      setDirty(false);
      setExcelPreview(null);
      setNotice(`${result?.count || 0} Excel satırı uygulandı.`);
    } catch (error) {
      setNotice(error?.message || "Excel satırları uygulanamadı.");
    } finally {
      setSaveBusy(false);
    }
  };

  const previewRows = useMemo(() => excelPreview?.rows || [], [excelPreview?.rows]);
  const previewEnabledCount = previewRows.filter((row) => row.enabled !== false).length;
  const previewDates = useMemo(
    () => [...new Set(previewRows.map((row) => row.workDate).filter(Boolean))].sort(),
    [previewRows],
  );
  const previewPeopleRows = useMemo(() => {
    const people = new Map();
    previewRows.forEach((row) => {
      const key = row.employeeId || row.personnelNo || row.personName || row.excelName || row.key;
      const current = people.get(key) || {
        key,
        name: row.personName || row.excelName || "-",
        personnelNo: row.personnelNo || "",
        qualification: row.qualification || "",
        cells: {},
        warningCount: 0,
      };
      if (row.workDate) current.cells[row.workDate] = row;
      if (row.warnings?.length) current.warningCount += 1;
      people.set(key, current);
    });
    return [...people.values()].sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || ""), "tr"),
    );
  }, [previewRows]);

  return (
    <div className={`kyik-safe-daily ${shiftMode}`}>
      <div className="kyik-safe-titlebar">
        <div>
          <span className="kyik-safe-kicker">KY ERP / İK / GÜVENLİ GİRİŞ</span>
          <h2>Günlük Personel Girişi</h2>
          <p>Detaylı kontrolde tek gün aktiftir; hızlı giriş ise yalnız açılır pencerede ve tek gün üzerinden yapılır.</p>
        </div>
        <div className="kyik-safe-mode">
          <button className={shiftMode === "day" ? "active day" : ""} onClick={() => setShift("day")} type="button">
            <Sun size={18} /> GÜNDÜZ GİRİŞİ
          </button>
          <button className={shiftMode === "night" ? "active night" : ""} onClick={() => setShift("night")} type="button">
            <Moon size={18} /> GECE GİRİŞİ
          </button>
        </div>
      </div>

      <div className="kyik-safe-actions">
        <Input label="Başlangıç">
          <TextInput type="date" value={range.start} onChange={(event) => setRange({ ...range, start: event?.target.value })} />
        </Input>
        <Input label="Bitiş">
          <TextInput type="date" value={range.end} onChange={(event) => setRange({ ...range, end: event?.target.value })} />
        </Input>
        <Button icon={Zap} tone="primary" onClick={openQuickModal}>Hızlı Giriş</Button>
        <Button icon={Plus} onClick={() => setPersonModal({ mode: "new", form: emptyDailyPersonForm(companyId) })}>Yeni Personel Ekle</Button>
        <Button icon={CheckCircle2} onClick={selectAllForActiveDay}>Tümünü Seç</Button>
        <Button icon={X} onClick={clearActiveDaySelection}>Seçimi Kaldır</Button>
        <Button icon={CheckCircle2} onClick={() => {
          const ids = includedPeople.filter((person) => {
            const entry = getDraftEntry(person.id);
            return Boolean(entry[shiftMode]);
          }).map((person) => person.id);
          setSelectedIds(new Set(ids));
          setBaselineIds(new Set(ids));
        }}>Kayıtlı Seçimi Yükle</Button>
        <Button icon={Save} tone="primary" disabled={saveBusy} onClick={saveSelectedDay}>Günlük Kaydet</Button>
        <Button icon={FileText} onClick={() => window.print()}>Haftalık Liste Yazdır</Button>
        <Button icon={FileSpreadsheet} onClick={exportExcel} disabled={saveBusy}>Excel Aktar</Button>
        <Button icon={FolderUp} onClick={importExcel} disabled={saveBusy}>Excel Yükle</Button>
      </div>

      <div className={`kyik-safe-banner ${shiftMode}`}>
        <CircleAlert size={18} />
        <span>Güvenli giriş modu: Yalnız <strong>{activeDayInfo.long} — {modeLabel}</strong> aktif. Hızlı girişte de aynı anda yalnız bir gün düzenlenir.</span>
      </div>
      {notice ? <div className="kyik-save-notice">{notice}</div> : null}

      {entryView === "quick" ? <div className={`kyik-quick-entry ${shiftMode}`}>
        <div className="kyik-quick-head"><div><span>VASIF BAZLI HAFTALIK HIZLI GİRİŞ</span><h3>{modeLabel} Personel Girişi</h3><p>{shortDate(range.start)} – {shortDate(range.end)} aralığında gün gün seçim yapın. Bu ekranda yalnız {modeLabel.toLocaleLowerCase("tr-TR")} vardiyası değişir.</p></div><div className="kyik-quick-actions"><Button onClick={() => setQuickCells(includedPeople, workDays, true)}>Aralığın Tümünü Seç</Button><Button onClick={() => setQuickCells(includedPeople, workDays, false)}>Tüm Seçimi Kaldır</Button><Button icon={Save} tone="primary" disabled={saveBusy || !dirty} onClick={saveQuickMatrix}>{saveBusy ? "Kaydediliyor" : `${modeLabel} Hızlı Kaydet`}</Button></div></div>
        <div className="kyik-quick-stats"><div className="orange"><span>Seçilen Hücre</span><b>{quickSelectedCount}</b><small>Personel × gün</small></div><div className="blue"><span>Seçilen Personel</span><b>{quickPersonCount}</b><small>{includedPeople.length} kişiden</small></div><div className="green"><span>Kontrol Edildi</span><b>{quickCheckedCount}</b><small>Yeşil hücre</small></div><div className={quickPendingCount ? "red" : "green"}><span>Kontrol Bekleyen</span><b>{quickPendingCount}</b><small>{quickPendingCount ? "İşlem gerekli" : "Tamamlandı"}</small></div><div className="purple"><span>Tarih Aralığı</span><b>{workDays.length} gün</b><small>{modeLabel} ayrı kaydedilir</small></div></div>
        <div className="kyik-quick-legend"><span className="empty">Boş</span><span className="selected">1 · Seçildi</span><span className="checked">2 · Kontrol edildi</span><span className="saved">Kayıtlı seçim</span>{shiftMode === "night" ? <em>Gece ücreti olmayan personel seçilemez.</em> : null}</div>
        <div className="kyik-quick-matrix-wrap"><table className="kyik-quick-matrix"><thead><tr><th className="person-col">Personel / Vasıf</th>{workDays.map((date) => { const eligible = includedPeople.filter((person) => shiftMode === "day" || toNumber(person.nightRate) > 0); const allActive = eligible.length > 0 && eligible.every((person) => Boolean(getDraftEntry(person.id, date)[shiftMode])); const selectedForDay = eligible.filter((person) => Boolean(getDraftEntry(person.id, date)[shiftMode])).length; const checkedForDay = eligible.filter((person) => Boolean(getDraftEntry(person.id, date)[shiftMode]) && fastCheckedKeys.has(quickCheckKeyFor(person.id, date))).length; return <th key={date}><button type="button" className={allActive ? "all-active" : ""} onClick={() => setQuickCells(eligible, [date], !allActive)}><small>{focusedDateParts(date, { weekday: "short" })}</small><b>{focusedDateParts(date, { day: "2-digit", month: "2-digit" })}</b><span>{selectedForDay} seçili · {checkedForDay} kontrol</span></button></th>; })}</tr></thead><tbody>{groupedIncludedPeople.map((group) => <React.Fragment key={`quick-${group.label}`}><tr className="quick-skill-row"><td colSpan={workDays.length + 1}><div><strong>{group.label}</strong><span>{group.people.length} personel</span><button type="button" onClick={() => setQuickCells(group.people, workDays, true)}>Vasıfı Tüm Günlere Seç</button><button type="button" onClick={() => setQuickCells(group.people, workDays, false)}>Temizle</button></div></td></tr>{group.people.map((person) => <tr key={`quick-person-${person.id}`}><td className="person-col"><strong>{person.name}</strong><span>{person.personnelNo || "Kod yok"} · {personSkillName(person, skills)}</span><small>G {formatTRY(person.dayRate)} · N {formatTRY(person.nightRate)}</small></td>{workDays.map((date) => { const entry = getDraftEntry(person.id, date); const active = Boolean(entry[shiftMode]); const persisted = Boolean((dailyEntries[entryKeyFor(person.id, date)] || {})[shiftMode]); const checked = active && fastCheckedKeys.has(quickCheckKeyFor(person.id, date)); const blocked = shiftMode === "night" && toNumber(person.nightRate) <= 0; return <td key={`${person.id}-${date}`}><div className={`quick-cell ${blocked ? "blocked" : checked ? "checked" : active ? "selected" : "empty"} ${persisted ? "persisted" : ""}`}><button type="button" className="quick-select" disabled={blocked} onClick={() => toggleQuickCell(person, date)}><b>{blocked ? "—" : modeCode}</b><span>{blocked ? "Ücret yok" : checked ? "Kontrol edildi" : active ? "Seçildi" : "Seç"}</span>{persisted && !checked ? <small>Kayıtlı</small> : null}</button><button type="button" className="quick-check" disabled={!active || blocked} onClick={() => toggleQuickChecked(person.id, date)} title="Kontrol durumunu değiştir">{checked ? <BadgeCheck size={15} /> : <CheckCircle2 size={15} />}</button></div></td>; })}</tr>)}</React.Fragment>)}</tbody></table></div>
        <div className="kyik-quick-footer"><div><b>{dirty ? "Kaydedilmemiş hızlı giriş değişiklikleri var." : "Hızlı giriş kayıtları veritabanıyla eşleşiyor."}</b><span>Turuncu seçimleri kaydedin; son gözden geçirmede hücreleri yeşil “Kontrol edildi” yapın.</span></div><Button icon={Save} tone="primary" disabled={saveBusy || !dirty} onClick={saveQuickMatrix}>{modeLabel} Değişikliklerini Kaydet</Button></div>
      </div> : null}

      <div>

      <div className="kyik-safe-days">
        {daySummaries.map((day) => (
          <button type="button" key={day.date} className={day.date === selectedDate ? "active" : ""} onClick={() => changeSelectedDate(day.date)}>
            {day.date === selectedDate ? <span className="active-label">AKTİF GÜN</span> : null}
            <small>{focusedDateParts(day.date, { weekday: "long" })}</small>
            <strong>{focusedDateParts(day.date, { day: "numeric", month: "short" })}</strong>
            <span>G: {day.dayCount} · N: {day.nightCount}</span>
            <b>{formatTRY(day.total)}</b>
            <em>{day.dayCount + day.nightCount ? "Kayıt var" : "Bekliyor"}</em>
          </button>
        ))}
      </div>

      <div className="kyik-safe-grid">
        <aside className="kyik-safe-panel kyik-safe-pool">
          <div className="kyik-safe-panel-head">
            <span><Users size={17} /> Personel Havuzu</span>
            <button
              type="button"
              className="kyik-safe-add-person"
              onClick={() => setPersonModal({ mode: "new", form: emptyDailyPersonForm(companyId) })}
            >
              <Plus size={14} /> Yeni Personel
            </button>
          </div>
          <div className="kyik-person-list-search compact">
            <Search size={15} />
            <input placeholder="Personel ara" value={search} onChange={(event) => setSearch(event?.target.value)} />
          </div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event?.target.value)}>
            <option value="">Tüm vasıflar</option>
            <option>Makinacı</option><option>Serimci</option><option>Boyacı</option><option>Vasıfsız</option><option>Diğer</option>
          </select>
          <div className="kyik-safe-pool-list">
            {visiblePeople.map((person) => {
              const inRoster = rosterIds.has(person.id);
              const hasWork = activeShiftHasWork(person.id);
              return (
                <button
                  type="button"
                  key={person.id}
                  className={`${inRoster ? "selected" : ""} ${hasWork ? "has-work" : "missing-work"}`}
                  onClick={() => {
                    if (!inRoster) toggleRosterPerson(person.id);
                  }}
                >
                  <strong>{person.personnelNo ? `${person.personnelNo} · ${person.name}` : person.name}</strong>
                  <small>{personSkillName(person, skills)}</small>
                  <span>G: {formatTRY(person.dayRate)} · N: {formatTRY(person.nightRate)}</span>
                  <em>{hasWork ? "Bu gün kayıtlı" : inRoster ? "Aralık listesinde" : "Listeye ekle"}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="kyik-safe-panel kyik-safe-entry">
          <div className="kyik-safe-entry-head">
            <div><span>SEÇİLİ GÜNÜN PERSONEL GİRİŞİ</span><h3>{activeDayInfo.long} / {modeLabel}</h3><p>Bu tablo yalnız {activeDayInfo.short} için gösterilir. Üstte gün seçince liste ve toplamlar aynı günle yenilenir.</p></div>
            <b>{activeDayInfo.mini} · {modeCode}</b>
          </div>
          <div className="kyik-safe-table-wrap">
            <table>
              <colgroup>
                <col className="safe-col-person" />
                <col className="safe-col-skill" />
                <col className="safe-col-day" />
                <col className="safe-col-wage" />
                <col className="safe-col-wage" />
                <col className="safe-col-note" />
                <col className="safe-col-action" />
              </colgroup>
              <thead><tr><th>Personel / Giriş / Durum</th><th>Vasıf</th><th>Aktif Gün</th><th>Gündüz Ücret</th><th>Gece Ücret</th><th>Not</th><th>İşlem</th></tr></thead>
              <tbody>
                {groupedIncludedPeople.length ? groupedIncludedPeople.flatMap((group) => [
                  <tr className="kyik-safe-skill-group" key={`safe-group-${group.label}`}>
                    <td colSpan="7">
                      <strong>{group.label}</strong>
                      <span>{group.people.length} personel</span>
                    </td>
                  </tr>,
                  ...group.people.map((person) => {
                    const entry = getDraftEntry(person.id);
                    const active = Boolean(entry[shiftMode]);
                    const checked = fastCheckedKeys.has(fastCheckKeyFor(person.id));
                    const nightBlocked = shiftMode === "night" && toNumber(person.nightRate) <= 0;
                    const rowClass = `kyik-safe-row ${checked ? "checked" : "unchecked"} ${active ? "selected-entry" : "no-entry"}`;
                    const statusText = active ? (checked ? "Bu gün teslim" : "Bu gün seçildi") : "Bu gün yok";
                    const statusClass = active ? (checked ? "delivered" : "selected") : "missing";
                    return (
                      <tr key={person.id} className={rowClass}>
                        <td>
                          <div className="kyik-safe-person-status">
                            <div className="kyik-safe-name-row">
                              <div className="kyik-safe-name-title">
                                <strong>{person.name}</strong>
                              </div>
                              {person.personnelNo ? <small>{person.personnelNo}</small> : null}
                              <small className={`kyik-safe-entry-status ${statusClass}`}>{statusText}</small>
                            </div>
                            <div className="kyik-safe-row-check">
                              <button
                                type="button"
                                className={`kyik-safe-row-check-button ${checked ? "checked" : ""}`}
                                onClick={() => toggleFastChecked(person.id)}
                                disabled={!active}
                              >
                                {checked ? <BadgeCheck size={14} /> : <CheckCircle2 size={14} />} {checked ? "Kontrol edildi" : "Kontrol et"}
                              </button>
                            </div>
                            <div className="kyik-safe-shift-entry">
                              <button
                                type="button"
                                disabled={nightBlocked || savingPersonIds.has(person.id)}
                                className={`kyik-safe-shift ${shiftMode} ${active ? "selected" : ""}`}
                                title={nightBlocked ? "Gece ücreti tanımlı değil" : `${modeLabel} girişini seç / kaldır ve kaydet`}
                                onClick={() => toggleActiveShift(person)}
                              >
                                {savingPersonIds.has(person.id) ? "…" : modeCode}
                              </button>
                              <span className="kyik-safe-shift disabled">{shiftMode === "day" ? "N" : "G"}</span>
                            </div>
                          </div>
                        </td>
                        <td>{personSkillName(person, skills)}</td>
                        <td className="kyik-safe-active-day">{activeDayInfo.short}</td>
                        <td>{formatTRY(person.dayRate)}</td>
                        <td>{formatTRY(person.nightRate)}{nightBlocked ? <small className="kyik-row-warning">Gece ücreti tanımlı değil</small> : null}</td>
                        <td><input className="kyik-safe-note" value={notes[person.id] || ""} onChange={(event) => { setNotes((current) => ({ ...current, [person.id]: event?.target.value })); setDirty(true); }} placeholder="Not" /></td>
                        <td><div className="kyik-safe-row-actions">
                          <button type="button" title="Düzenle" onClick={() => setPersonModal({ mode: "edit", form: dailyPersonFormFromPerson(person, companyId) })}><Pencil size={14} /></button>
                          <button type="button" title="Tarih aralığı listesinden çıkar" onClick={() => toggleRosterPerson(person.id)}><Trash2 size={14} /></button>
                        </div></td>
                      </tr>
                    );
                  }),
                ]) : <tr><td colSpan="7" className="kyik-empty-cell">Personel havuzundan tarih aralığı listesine personel ekleyin.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="kyik-safe-bottom"><span>{dirty ? "Kaydedilmemiş değişiklikler var." : "Seçili gün SQLite verisiyle eşleşiyor."}</span><Button icon={Save} tone="primary" disabled={saveBusy} onClick={saveSelectedDay}>{shortDate(selectedDate)} {modeLabel} Kaydet</Button></div>
        </main>

        <aside className="kyik-safe-panel kyik-safe-control">
          <div className="kyik-safe-panel-head"><CheckCircle2 size={17} /> Seçili Gün Kontrolü</div>
          <div className="kyik-safe-summary orange"><span>Aktif Gün</span><strong>{activeDayInfo.mini}</strong><small>{modeLabel}</small></div>
          <div className="kyik-safe-summary green"><span>Bu Gün Seçili / Seçilmedi</span><strong>{savedCount} / {pendingCount}</strong><small>{includedPeople.length} aktif personel</small></div>
          <div className="kyik-safe-summary cyan"><span>Kontrol Edilen / Toplam</span><strong>{checkedCount} / {activeIncludedPeople.length}</strong><small>{uncheckedCount} kayıt kontrol bekliyor</small></div>
          <div className="kyik-safe-summary blue"><span>Günlük Toplam</span><strong>{formatTRY(selectedSummary.total)}</strong><small>G {formatTRY(selectedSummary.dayTotal)} · N {formatTRY(selectedSummary.nightTotal)}</small></div>
          <div className="kyik-safe-summary purple"><span>Tarih Aralığı Toplamı</span><strong>{formatTRY(rangeSummary.total)}</strong><small>{shortDate(range.start)} – {shortDate(range.end)} · G {rangeSummary.dayCount} · N {rangeSummary.nightCount}</small></div>
          <div className="kyik-safe-metrics">
            <div><span>Gündüz çalışan</span><b>{selectedSummary.dayCount}</b></div>
            <div><span>Gece çalışan</span><b>{selectedSummary.nightCount}</b></div>
            {["Makinacı", "Serimci", "Boyacı", "Vasıfsız"].map((skill) => <div key={skill}><span>{skill}</span><b>{skillTotals[skill] || 0}</b></div>)}
          </div>
          <div className={`kyik-safe-status ${pendingCount ? "warning" : "success"}`}>
            {savedCount ? `${savedCount} personel bu gün için seçildi` : "Bu gün için vardiya seçilmedi"}
          </div>
          {shiftMode === "night" && missingNightCount ? <div className="kyik-safe-status warning">{missingNightCount} personelde gece ücret tanımı eksik</div> : null}
          <div className="kyik-safe-tips">Tek gün aktif.<br />Gün değişmeden kayıt kontrol edilir.<br />Diğer günlere giriş kapalı.<br />Aktif vardiya dışındaki butonlar pasif.</div>
        </aside>
      </div>
      </div>

      {quickModalOpen ? (
        <div className="kyik-modal-backdrop kyik-quick-day-backdrop" role="dialog" aria-modal="true" aria-label="Tek gün hızlı personel girişi">
          <div className={`kyik-modal kyik-quick-day-modal ${shiftMode}`} data-modal-size-key="ik-gunluk-personel-hizli-giris">
            <div className="kyik-modal-head kyik-quick-day-head">
              <div>
                <span>TEK GÜN GÜVENLİ HIZLI GİRİŞ</span>
                <h3>{activeDayInfo.long} · {modeLabel}</h3>
                <p>Bu pencerede yalnız seçili gün ve seçili vardiya değişir.</p>
              </div>
              <button type="button" onClick={closeQuickModal} title="Hızlı girişi kapat"><X size={20} /></button>
            </div>

            <div className="kyik-quick-day-toolbar">
              <button
                type="button"
                disabled={dirty || workDays.indexOf(selectedDate) <= 0}
                onClick={() => changeQuickDate(workDays[workDays.indexOf(selectedDate) - 1])}
              >‹ Önceki Gün</button>
              <label>
                <span>İşlem yapılacak gün</span>
                <select value={selectedDate} disabled={dirty} onChange={(event) => changeQuickDate(event?.target.value)}>
                  {workDays.map((date) => <option key={date} value={date}>{focusedDateParts(date, { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={dirty || workDays.indexOf(selectedDate) >= workDays.length - 1}
                onClick={() => changeQuickDate(workDays[workDays.indexOf(selectedDate) + 1])}
              >Sonraki Gün ›</button>
              <div className="kyik-quick-day-shifts">
                <button type="button" disabled={dirty} className={shiftMode === "day" ? "active day" : ""} onClick={() => setShift("day")}><Sun size={17} /> Gündüz</button>
                <button type="button" disabled={dirty} className={shiftMode === "night" ? "active night" : ""} onClick={() => setShift("night")}><Moon size={17} /> Gece</button>
              </div>
            </div>

            <div className={`kyik-quick-day-focus ${shiftMode}`}>
              <CircleAlert size={18} />
              <div><strong>Yalnız {activeDayInfo.long} — {modeLabel}</strong><span>Başka bir gün veya vardiya bu kayıt sırasında değiştirilemez.</span></div>
            </div>

            <div className="kyik-quick-day-stats">
              <div className="orange"><span>Seçilen</span><b>{quickDayPeople.length}</b><small>Bu gün çalışacak</small></div>
              <div className="green"><span>Kontrol Edildi</span><b>{quickDayCheckedCount}</b><small>Yeşil işaretli</small></div>
              <div className={quickDayPendingCount ? "red" : "green"}><span>Kontrol Bekleyen</span><b>{quickDayPendingCount}</b><small>{quickDayPendingCount ? "Gözden geçirilecek" : "Tamamlandı"}</small></div>
              <div className="blue"><span>Toplam Personel</span><b>{includedPeople.length}</b><small>Tarih aralığı listesi</small></div>
            </div>

            <div className="kyik-quick-day-filter">
              <div><Search size={16} /><input value={quickSearch} onChange={(event) => setQuickSearch(event?.target.value)} placeholder="Personel, kod veya vasıf ara" /></div>
              <div className="kyik-quick-person-add">
                <select value={quickAddPersonId} onChange={(event) => setQuickAddPersonId(event?.target.value)}>
                  <option value="">Mevcut personelden seç</option>
                  {quickAvailablePeople.map((person) => <option key={`quick-add-${person.id}`} value={person.id}>{person.name} · {personSkillName(person, skills)}</option>)}
                </select>
                <button type="button" disabled={!quickAddPersonId} onClick={addQuickRosterPerson}><Plus size={14} /> Listeye Ekle</button>
                <button type="button" onClick={() => setPersonModal({ mode: "new", form: emptyDailyPersonForm(companyId) })}><UserPlus size={14} /> Yeni Personel</button>
              </div>
              <span><i className="selected" /> Seçildi <i className="checked" /> Kontrol edildi <i className="persisted" /> Kayıtlı</span>
              {shiftMode === "night" && missingNightCount ? <em>{missingNightCount} personelde gece ücreti yok; seçim kapalıdır.</em> : null}
            </div>

            <div className="kyik-quick-day-body">
              {quickModalGroups.map((group) => {
                const eligible = group.people.filter((person) => shiftMode === "day" || toNumber(person.nightRate) > 0);
                const selectedInGroup = eligible.filter((person) => Boolean(getDraftEntry(person.id, selectedDate)[shiftMode])).length;
                const allSelected = eligible.length > 0 && selectedInGroup === eligible.length;
                return (
                  <section className={`kyik-quick-day-group ${group.people.length >= 12 ? "dense" : ""}`} key={`quick-modal-${group.label}`}>
                    <div className="kyik-quick-day-group-head">
                      <div><strong>{group.label}</strong><span>{selectedInGroup} / {eligible.length} seçildi</span></div>
                      <button type="button" onClick={() => setQuickCells(eligible, [selectedDate], !allSelected)} disabled={!eligible.length}>{allSelected ? "Vasıf Seçimini Kaldır" : "Vasıfın Tümünü Seç"}</button>
                    </div>
                    <div className="kyik-quick-day-people">
                      {group.people.map((person) => {
                        const active = Boolean(getDraftEntry(person.id, selectedDate)[shiftMode]);
                        const persisted = Boolean((dailyEntries[entryKeyFor(person.id, selectedDate)] || {})[shiftMode]);
                        const checked = active && fastCheckedKeys.has(quickCheckKeyFor(person.id, selectedDate));
                        const blocked = shiftMode === "night" && toNumber(person.nightRate) <= 0;
                        return (
                          <div className={`kyik-quick-day-person ${blocked ? "blocked" : checked ? "checked" : active ? "selected" : ""} ${persisted ? "persisted" : ""}`} key={`quick-modal-person-${person.id}`}>
                            <button type="button" className="person-select" disabled={blocked} onClick={() => toggleQuickCell(person, selectedDate)}>
                              <span className="mode-box">{blocked ? "—" : modeCode}</span>
                              <span className="person-name"><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {group.label}</small></span>
                              <span className="person-rate">{blocked ? "Gece ücreti yok" : formatTRY(shiftMode === "day" ? person.dayRate : person.nightRate)}</span>
                              <span className="selection-state">{checked ? "Kontrol edildi" : active ? "Seçildi" : "Seç"}</span>
                            </button>
                            <button type="button" className="person-check" disabled={!active || blocked} onClick={() => toggleQuickChecked(person.id, selectedDate)} title="Kontrol durumunu değiştir">
                              {checked ? <BadgeCheck size={18} /> : <CheckCircle2 size={18} />}<span>{checked ? "Kontrol Edildi" : "Kontrol Et"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!quickModalGroups.length ? <div className="kyik-empty-cell">Aramaya uygun personel bulunamadı.</div> : null}
            </div>

            <div className="kyik-quick-day-footer">
              <div>
                <b>{dirty ? "Kaydedilmemiş seçimler var." : "Seçili gün kayıtları güncel."}</b>
                <span>{dirty ? "Gün veya vardiya değiştirmek için önce kaydedin." : `${quickDayPeople.length} personel seçili, ${quickDayCheckedCount} personel kontrol edildi.`}</span>
              </div>
              <Button icon={X} onClick={closeQuickModal}>Kapat</Button>
              <Button icon={Save} tone="primary" disabled={saveBusy || !dirty} onClick={() => saveQuickDay()}>{saveBusy ? "Kaydediliyor" : `${modeLabel} Kaydet`}</Button>
              {workDays.indexOf(selectedDate) < workDays.length - 1 ? (
                <Button icon={Save} tone="primary" disabled={saveBusy} onClick={() => saveQuickDay(workDays[workDays.indexOf(selectedDate) + 1])}>Kaydet ve Sonraki Gün</Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {pendingDate ? (
        <div className="kyik-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kyik-modal kyik-safe-confirm">
            <h3>Kaydedilmemiş girişler var</h3>
            <p>Seçili günü değiştirmeden önce nasıl devam etmek istersiniz</p>
            <div className="kyik-action-row">
              <Button icon={Save} tone="primary" onClick={async () => { if (await saveSelectedDay()) { setSelectedDate(pendingDate); writeStoredSelectedDailyDate(pendingDate); setPendingDate(""); } }}>Kaydet ve Günü Değiştir</Button>
              <Button onClick={() => { setDraftEntries(dailyEntries); setDirty(false); setSelectedDate(pendingDate); writeStoredSelectedDailyDate(pendingDate); setPendingDate(""); }}>Kaydetmeden Değiştir</Button>
              <Button icon={X} onClick={() => setPendingDate("")}>İptal</Button>
            </div>
          </div>
        </div>
      ) : null}

      {personModal ? (
        <div className="kyik-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kyik-modal">
            <div className="kyik-modal-head"><h3>{personModal.mode === "new" ? "Personel Ekle" : "Personeli Düzenle"}</h3><button type="button" onClick={() => setPersonModal(null)}><X size={18} /></button></div>
            {personModal.mode === "new" ? (
              <div className="kyik-safe-person-help">
                Diğer sekmeye geçmeden yeni personeli oluşturun. Kaydedilen personel bu tarih aralığının listesine otomatik eklenir.
              </div>
            ) : null}
            <div className="kyik-form-grid two">
              <Input label="Ad Soyad"><TextInput value={personModal.form.name} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, name: event?.target.value } }))} /></Input>
              <Input label="Personel Kodu"><TextInput value={personModal.form.personnelNo || ""} placeholder="HKN001" onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, personnelNo: event?.target.value } }))} /></Input>
              <Input label="Vasıf"><select value={personModal.form.role} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, role: event?.target.value } }))}><option>Makinacı</option><option>Serimci</option><option>Boyacı</option><option>Vasıfsız</option><option>Diğer</option></select></Input>
              <Input label="Bağlı Olduğu Yer / Aracı"><TextInput value={personModal.form.broker || ""} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, broker: event?.target.value } }))} /></Input>
              <Input label="Gündüz Ücret"><TextInput type="number" value={personModal.form.dayRate} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, dayRate: toNumber(event?.target.value) } }))} /></Input>
              <Input label="Gece Ücret"><TextInput type="number" value={personModal.form.nightRate} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, nightRate: toNumber(event?.target.value) } }))} /></Input>
              <Input label="Not"><TextInput value={personModal.form.note || ""} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, note: event?.target.value } }))} /></Input>
              <label className="kyik-checkline"><input type="checkbox" checked={personModal.form.active !== false} onChange={(event) => setPersonModal((current) => ({ ...current, form: { ...current?.form, active: event?.target.checked } }))} /> Aktif</label>
            </div>
            <div className="kyik-action-row"><Button icon={Save} tone="primary" disabled={saveBusy} onClick={savePersonModal}>Kaydet</Button><Button icon={X} onClick={() => setPersonModal(null)}>Kapat</Button></div>
          </div>
        </div>
      ) : null}

      {excelPreview ? (
        <div className="kyik-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kyik-modal kyik-excel-review">
            <div className="kyik-modal-head">
              <h3>Excel Kontrol ve Uygula</h3>
              <button type="button" onClick={() => setExcelPreview(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="kyik-excel-review-stats">
              <span>Toplam <b>{excelPreview.counts?.total || previewRows.length}</b></span>
              <span>Ekle <b>{excelPreview.counts?.add || 0}</b></span>
              <span>Çıkar <b>{excelPreview.counts?.remove || 0}</b></span>
              <span>Değiştir <b>{excelPreview.counts?.change || 0}</b></span>
              <span>Aynı <b>{excelPreview.counts?.same || 0}</b></span>
              <span>Kontrol <b>{excelPreview.counts?.warning || 0}</b></span>
            </div>
            {!previewEnabledCount && previewRows.length ? (
              <div className="kyik-excel-review-note">
                Excel ile kayıtlar aynı görünüyor. Kaydedilecek değişiklik yok; kontrol için satırlar aşağıda açık şekilde bırakıldı.
              </div>
            ) : null}
            <div className="kyik-excel-review-actions">
              <Button
                onClick={() =>
                  setPreviewRowsEnabled((row) =>
                    row.matched && row.workDate && !["same", "control"].includes(row.action),
                  )
                }
              >
                Tümünü Seç
              </Button>
              <Button onClick={() => setPreviewRowsEnabled(false)}>Tümünü Kapat</Button>
            </div>
            <div className="kyik-excel-review-table matrix">
              <table>
                <thead>
                  <tr>
                    <th>Personel</th>
                    {previewDates.map((date) => (
                      <th key={date}>{shortDate(date)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewPeopleRows.map((person) => {
                    return (
                      <tr key={person.key}>
                        <td>
                          <strong>{person.name}</strong>
                          <small>{person.personnelNo || "-"} {person.qualification ? `· ${person.qualification}` : ""}</small>
                          {person.warningCount ? <em>{person.warningCount} kontrol</em> : null}
                        </td>
                        {previewDates.map((date) => {
                          const row = person.cells[date];
                          if (!row) return <td key={`${person.key}-${date}`} className="excel-empty-cell">-</td>;
                          const actionLabel = {
                            add: "Ekle",
                            remove: "Çıkar",
                            change: "Değiştir",
                            same: "Aynı",
                            control: "Kontrol",
                          }[row.action] || row.action;
                          return (
                            <td key={row.key} className={`excel-cell excel-${row.action}`}>
                              <div className="kyik-excel-cell-top">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={row.enabled !== false}
                                    disabled={!row.matched || !row.workDate}
                                    onChange={(event) =>
                                      updatePreviewRow(row.key, { enabled: event.target.checked })
                                    }
                                  />
                                  {actionLabel}
                                </label>
                                <span>Mevcut {row.currentDay ? "G" : "-"} / {row.currentNight ? "N" : "-"}</span>
                              </div>
                              <div className="kyik-excel-result">
                                <strong>Excel</strong>
                                <b className={row.dayShift ? "on" : ""}>G</b>
                                <b className={row.nightShift ? "on" : ""}>N</b>
                              </div>
                              {row.warnings?.length ? <small>{row.warnings.join(" · ")}</small> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="kyik-action-row">
              <Button icon={CheckCircle2} tone="primary" disabled={saveBusy || !previewEnabledCount} onClick={applyExcelPreview}>
                {previewEnabledCount ? `${previewEnabledCount} Satırı Kaydet` : "Değişiklik Yok"}
              </Button>
              <Button icon={X} onClick={() => setExcelPreview(null)}>Kapat</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DailyEntry({
  daily,
  setDaily,
  dailyEntries,
  setDailyEntries,
  refreshDailyEntries,
  companyId,
  skills = [],
  onCreateSkill,
  range,
  setRange,
}) {
  const [includedIds, setIncludedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(daily[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [wageFilter, setWageFilter] = useState("");
  const [shiftMode, setShiftMode] = useState("day");
  const [personModal, setPersonModal] = useState(null);
  const [personSaveBusy, setPersonSaveBusy] = useState(false);
  const [rangeSaveBusy, setRangeSaveBusy] = useState(false);
  const [poolSaveBusy, setPoolSaveBusy] = useState(false);
  const [clearedIds, setClearedIds] = useState(() => new Set());
  const [manualPoolIds, setManualPoolIds] = useState(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [highlightedDate, setHighlightedDate] = useState("");
  const includeWorkedPeople = async () => {
    try {
      const refreshedEntries = refreshDailyEntries
         ? await refreshDailyEntries(range)
        : dailyEntries;
      const emptyRows = daily.flatMap((person) =>
        days
          .filter((date) => {
            const entry = refreshedEntries[entryKey(person.id, date)];
            return entry && !entryHasWork(entry);
          })
          .map((date) => ({
            employeeId: person.id,
            workDate: date,
            dayShift: false,
            nightShift: false,
            dayWage: person.dayRate,
            nightWage: person.nightRate,
          })),
      );
      if (emptyRows.length) {
        await saveGunlukDurum({ rows: emptyRows, deleteEmptyRows: true });
      }
      const cleanedEntries =
        emptyRows.length && refreshDailyEntries
           ? await refreshDailyEntries(range)
          : refreshedEntries;
      const workedIds = daily
        .filter((person) =>
          highlightedDate
             ? personHasWorkOnDate(person.id, cleanedEntries, highlightedDate)
            : personHasWorkInRange(person.id, cleanedEntries, range.start, range.end),
        )
        .map((person) => person.id);
      setManualPoolIds(new Set());
      setIncludedIds(new Set(workedIds));
      setClearedIds(new Set());
      if (workedIds[0]) setSelectedId(workedIds[0]);
      if (highlightedDate) {
        // Eğer bir gün seçiliyse, sadece o güne ait kayıtları havuza ekle ve hemen DB'ye kaydet
        const peopleToPersist = daily.filter((p) => workedIds.includes(p.id));
        const rowsForDate = peopleToPersist
          .map((person) => {
            const entry = cleanedEntries[entryKey(person.id, highlightedDate)] || { day: false, night: false };
            return {
              employeeId: person.id,
              workDate: highlightedDate,
              dayShift: Boolean(entry.day),
              nightShift: Boolean(entry.night),
              dayWage: person.dayRate,
              nightWage: person.nightRate,
            };
          })
          .filter((row) => row?.dayShift || row?.nightShift);
        try {
          if (rowsForDate.length) {
            await saveGunlukDurum({ rows: rowsForDate });
            if (refreshDailyEntries) await refreshDailyEntries(range);
            setNotice(`${formatDate(highlightedDate)} seçili gün için ${rowsForDate.length} kayıt SQL'e kaydedildi ve havuza eklendi.`);
          } else {
            setNotice(`${formatDate(highlightedDate)} seçili günde kayıtlı vardiya bulunmuyor.`);
          }
        } catch (error) {
          setNotice(error?.message || "Seçili gün kayıtları SQL'e kaydedilemedi.");
        }
      } else {
        setNotice(`${workedIds.length} kayıtlı personel DB'den yüklendi.`);
      }
    } catch (error) {
      setNotice(error?.message || "Kayıtlı günlük girişler okunamadı.");
    }
  };
  const persistClearedPeople = async (idsToClear) => {
    const peopleToClear = daily.filter((person) => idsToClear.has(person.id));
    if (!peopleToClear.length) return;
    const rows = peopleToClear.flatMap((person) =>
      days.map((date) => ({
        employeeId: person.id,
        workDate: date,
        dayShift: false,
        nightShift: false,
        dayWage: person.dayRate,
        nightWage: person.nightRate,
      })),
    );
    try {
      await saveGunlukDurum({ rows, deleteEmptyRows: true });
      if (refreshDailyEntries) await refreshDailyEntries(range);
      setClearedIds((current) => {
        const next = new Set(current);
        idsToClear.forEach((id) => next.delete(id));
        return next;
      });
      setNotice(
        `${formatDate(range.start)} - ${formatDate(range.end)} çıkarılan personel SQL'de temizlendi.`,
      );
    } catch (error) {
      setNotice(error?.message || "Çıkarılan personel SQL'de temizlenemedi.");
    }
  };
  const clearWeekList = async () => {
    const idsToClear = new Set(includedIds);
    const hasWork = [...idsToClear].some((personId) =>
      personHasWorkInRange(personId, dailyEntries, range.start, range.end),
    );
    if (hasWork && !window.confirm("Secili tarih araligindaki kayitlar temizlensin mi")) {
      return;
    }
    setManualPoolIds(new Set());
    setIncludedIds(new Set());
    setClearedIds(idsToClear);
    setDailyEntries((entries) => {
      const nextEntries = { ...entries };
      idsToClear.forEach((personId) => {
        days.forEach((date) => {
          nextEntries[entryKey(personId, date)] = {
            ...(nextEntries[entryKey(personId, date)] || {}),
            day: false,
            night: false,
          };
        });
      });
      return nextEntries;
    });
    await persistClearedPeople(idsToClear);
  };
  useEffect(() => {
    setIncludedIds(() => {
      const next = new Set(
        daily
          .filter((person) =>
            personHasWorkInRange(person.id, dailyEntries, range.start, range.end),
          )
          .map((person) => person.id),
      );
      manualPoolIds.forEach((id) => {
        if (daily.some((person) => person.id === id)) next.add(id);
      });
      return next;
    });
    setSelectedId((current) =>
      daily.some((person) => person.id === current)
         ? current
        : daily[0]?.id || "",
    );
  }, [daily, dailyEntries, range.start, range.end, manualPoolIds]);
  const days = useMemo(
    () => daysBetween(range.start, range.end),
    [range.start, range.end],
  );
  const entryKey = (personId, date) => `${personId}-${date}`;
  const getEntry = useCallback((personId, date) =>
    dailyEntries[entryKey(personId, date)] || { day: false, night: false }, [dailyEntries]);
  const buildDailyRowsForPeople = (people, clear = false) =>
    people.flatMap((person) =>
      days.map((date) => {
        const entry = clear
           ? { day: false, night: false }
          : getEntry(person.id, date);
        return {
          employeeId: person.id,
          workDate: date,
          dayShift: Boolean(entry.day),
          nightShift: Boolean(entry.night),
          dayWage: person.dayRate,
          nightWage: person.nightRate,
        };
      }),
    );
  const buildShiftModeRow = (person, date, nextEntry = getEntry(person.id, date)) => {
    const currentEntry = getEntry(person.id, date);
    const dayShift =
      shiftMode === "day" ? Boolean(nextEntry.day) : Boolean(currentEntry.day);
    const nightShift =
      shiftMode === "night" ? Boolean(nextEntry.night) : Boolean(currentEntry.night);
    return {
      employeeId: person.id,
      workDate: date,
      dayShift,
      nightShift,
      dayWage: person.dayRate,
      nightWage: person.nightRate,
    };
  };
  const persistIncludedPeople = async (peopleToPersist, successMessage) => {
    if (!peopleToPersist.length) return true;
    setPoolSaveBusy(true);
    try {
      const rows = buildDailyRowsForPeople(peopleToPersist).filter((row) => row?.dayShift || row?.nightShift);
      if (rows.length) await saveGunlukDurum({ rows });
      if (refreshDailyEntries) await refreshDailyEntries(range);
      setClearedIds((cleared) => {
        const nextCleared = new Set(cleared);
        peopleToPersist.forEach((person) => nextCleared.delete(person.id));
        return nextCleared;
      });
      setNotice(successMessage);
      return true;
    } catch (error) {
      setNotice(error?.message || "Haftaya eklenen personel SQL'e kaydedilemedi.");
      return false;
    } finally {
      setPoolSaveBusy(false);
    }
  };
  const matchesDailyPerson = useCallback((person) => {
    if (!skillFilterMatches(person, roleFilter, skills)) return false;
    if (wageFilter === "day" && toNumber(person.dayRate) <= 0) return false;
    if (wageFilter === "night" && toNumber(person.nightRate) <= 0) return false;
    if (
      wageFilter === "missing" &&
      toNumber(person.dayRate) > 0 &&
      toNumber(person.nightRate) > 0
    ) {
      return false;
    }
    if (!wageFilter && !shiftHasWage(person, shiftMode)) return false;
    const term = search.trim().toLocaleLowerCase("tr-TR");
    if (!term) return true;
    return `${person.name} ${person.role} ${person.broker}`
      .toLocaleLowerCase("tr-TR")
      .includes(term);
  }, [roleFilter, search, shiftMode, skills, wageFilter]);
  const visiblePeople = useMemo(() => {
    return daily.filter(matchesDailyPerson);
  }, [daily, matchesDailyPerson]);
  const includedPeople = daily.filter((person) => includedIds.has(person.id));
  const groupedIncludedPeople = useMemo(() => {
    const map = new Map();
    includedPeople.forEach((person) => {
      const label = personSkillGroupTitle(person, skills);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(person);
    });
    return [...map.entries()]
      .map(([label, people]) => ({
        label,
        people: people.sort((left, right) =>
          left.name.localeCompare(right.name, "tr"),
        ),
      }))
      .sort((left, right) =>
        skillGroupSortValue(left.label).localeCompare(
          skillGroupSortValue(right.label),
          "tr",
        ),
      );
  }, [includedPeople, skills]);
  const dailyShiftSummary = useMemo(
    () =>
      days.map((date) => {
        const uniqueIds = new Set();
        let dayCount = 0;
        let nightCount = 0;
        let amount = 0;
        includedPeople.forEach((person) => {
          const entry = getEntry(person.id, date);
          if (entry.day) {
            dayCount += 1;
            uniqueIds.add(person.id);
            amount += toNumber(person.dayRate);
          }
          if (entry.night) {
            nightCount += 1;
            uniqueIds.add(person.id);
            amount += toNumber(person.nightRate);
          }
        });
        return {
          date,
          dayCount,
          nightCount,
          shiftCount: dayCount + nightCount,
          uniqueEmployeeCount: uniqueIds.size,
          amount,
        };
      }),
    [days, includedPeople, getEntry],
  );
  const selected =
    daily.find((person) => person.id === selectedId) ||
    includedPeople[0] ||
    visiblePeople[0] ||
    daily[0] ||
    emptyDailyPersonForm(companyId);

  const toggleEntry = async (personId, date, shift) => {
    if (shift !== shiftMode) {
      setNotice(
        shiftMode === "day"
           ? "Gündüz girişi açıkken gece vardiyası değiştirilemez."
          : "Gece girişi açıkken gündüz vardiyası değiştirilemez.",
      );
      return;
    }
    const person = daily.find((item) => item.id === personId);
    if (!person) return;
    const warning = shiftWageWarning(person, shiftMode);
    if (warning) {
      setNotice(`${person.name} için ${warning.toLocaleLowerCase("tr-TR")}. Personel kartından ücret girin.`);
      return;
    }
    const key = entryKey(personId, date);
    const previous = dailyEntries[key] || { day: false, night: false };
    const nextEntry = { ...previous, [shift]: !previous[shift] };
    setDailyEntries((current) => ({ ...current, [key]: nextEntry }));
    setSelectedId(personId);
    try {
      await saveGunlukDurum({
        rows: [buildShiftModeRow(person, date, nextEntry)],
        deleteEmptyRows: true,
      });
      const refreshedEntries = refreshDailyEntries
         ? await refreshDailyEntries(range)
        : { ...dailyEntries, [key]: nextEntry };
      const stillHasWork = personHasWorkInRange(
        person.id,
        refreshedEntries,
        range.start,
        range.end,
      );
      setIncludedIds((current) => {
        const next = new Set(current);
        if (stillHasWork) next.add(person.id);
        else next.delete(person.id);
        return next;
      });
      setClearedIds((current) => {
        const next = new Set(current);
        next.delete(person.id);
        return next;
      });
      setNotice(
        nextEntry.day || nextEntry.night
           ? `${formatDate(date)} vardiya SQL'e kaydedildi.`
          : `${formatDate(date)} vardiya havuzdan silindi.`,
      );
    } catch (error) {
      setDailyEntries((current) => ({ ...current, [key]: previous }));
      setNotice(error?.message || "Günlük vardiya kaydedilemedi.");
    }
  };
  const toggleIncluded = async (personId) => {
    if (!personId) return;
    let addedToPool = false;
    let addPersisted = false;
    if (includedIds.has(personId)) {
      const nextIncludedIds = new Set(includedIds);
      nextIncludedIds.delete(personId);
      setManualPoolIds((current) => {
        const next = new Set(current);
        next.delete(personId);
        return next;
      });
      setIncludedIds(nextIncludedIds);
      setClearedIds((cleared) => new Set([...cleared, personId]));
      setDailyEntries((entries) => {
        const nextEntries = { ...entries };
        days.forEach((date) => {
          nextEntries[entryKey(personId, date)] = {
            ...(nextEntries[entryKey(personId, date)] || {}),
            day: false,
            night: false,
          };
        });
        return nextEntries;
      });
      await persistClearedPeople(new Set([personId]));
      setSelectedId((current) => {
        if (current === personId) {
          const remaining = daily.find((person) => nextIncludedIds.has(person.id));
          return remaining?.id || daily[0]?.id || "";
        }
        return current;
      });
    } else {
      const person = daily.find((item) => item.id === personId);
      setManualPoolIds((current) => new Set([...current, personId]));
      setIncludedIds((current) => new Set([...current, personId]));
      setClearedIds((cleared) => {
        const nextCleared = new Set(cleared);
        nextCleared.delete(personId);
        return nextCleared;
      });
      setSelectedId(personId);
      const saved = await persistIncludedPeople(
        person ? [person] : [],
        "Personel havuza eklendi. G/N seçince SQL'e kaydedilir.",
      );
      addedToPool = true;
      addPersisted = saved;
      if (!saved) {
        setIncludedIds((current) => {
          const next = new Set(current);
          next.delete(personId);
          return next;
        });
      }
      setNotice("Personel haftaya eklendi. Günlerini işaretleyip Günlük Kaydet'e bas.");
    }
    if (addedToPool) {
      setNotice(
        addPersisted
           ? "Personel havuza eklendi. G/N seçince SQL'e kaydedilir."
          : "Haftaya eklenen personel SQL'e kaydedilemedi.",
      );
    }
  };

  const saveSelectedPerson = async () => {
    if (!selected?.id) return;
    setPersonSaveBusy(true);
    try {
      const saved = await updateGunlukPersonel(
        selected.id,
        dailyPersonPayload(selected, companyId),
      );
      const normalized = normalizeDailyPerson(saved);
      setDaily((current) =>
        current.map((person) =>
          person.id === normalized.id ? normalized : person,
        ),
      );
      setNotice(`${selected.name} kartı güncellendi.`);
    } catch (error) {
      setNotice(error?.message || "Seçili personel güncellenemedi.");
    } finally {
      setPersonSaveBusy(false);
    }
  };

  const openNewPersonModal = () => {
    setPersonModal({ mode: "new", form: emptyDailyPersonForm(companyId) });
  };

  const openEditPersonModal = (person = selected) => {
    if (!person?.id) return;
    setPersonModal({
      mode: "edit",
      form: dailyPersonFormFromPerson(person, companyId),
    });
  };

  const updatePersonModalForm = (patch) => {
    setPersonModal((current) =>
      current ? { ...current, form: { ...current?.form, ...patch } } : current,
    );
  };

  const savePersonModal = async () => {
    if (!personModal.form.name.trim()) {
      setNotice("Personel adı boş bırakılamaz.");
      return;
    }
    setPersonSaveBusy(true);
    try {
      const payload = dailyPersonPayload(personModal.form, companyId);
      const saved =
        personModal.mode === "new"
           ? await createGunlukPersonel(payload)
          : await updateGunlukPersonel(personModal.form.id, payload);
      const normalized = normalizeDailyPerson(saved);
      setDaily((current) => {
        if (personModal.mode === "new") return [...current, normalized];
        return current.map((person) =>
          person.id === normalized.id ? normalized : person,
        );
      });
      setSelectedId(normalized.id);
      if (personModal.mode === "new") {
        setManualPoolIds((current) => new Set([...current, normalized.id]));
        setIncludedIds((current) => new Set([...current, normalized.id]));
      }
      setPersonModal(null);
      setNotice(
        personModal.mode === "new"
           ? "Günlük personel SQL'e eklendi ve sol listeye alındı."
          : "Personel kartı güncellendi; ücretler günlük girişe yansıtıldı.",
      );
    } catch (error) {
      setNotice(error?.message || "Personel kartı kaydedilemedi.");
    } finally {
      setPersonSaveBusy(false);
    }
  };

  const selectedTotals = days.reduce(
    (acc, date) => {
      const entry = getEntry(selected.id, date);
      return {
        dayCount: acc.dayCount + (entry.day ? 1 : 0),
        nightCount: acc.nightCount + (entry.night ? 1 : 0),
      };
    },
    { dayCount: 0, nightCount: 0 },
  );
  const selectedTotal =
    selectedTotals.dayCount * toNumber(selected.dayRate) +
    selectedTotals.nightCount * toNumber(selected.nightRate);

  const grand = includedPeople.reduce((sum, person) => {
    return (
      sum +
      days.reduce((personSum, date) => {
        const entry = getEntry(person.id, date);
        return (
          personSum +
          (entry.day ? person.dayRate : 0) +
          (entry.night ? person.nightRate : 0)
        );
      }, 0)
    );
  }, 0);
  const rangeTotals = useMemo(() => {
    const uniqueIds = new Set();
    let dayCount = 0;
    let nightCount = 0;
    includedPeople.forEach((person) => {
      days.forEach((date) => {
        const entry = getEntry(person.id, date);
        if (entry.day) {
          dayCount += 1;
          uniqueIds.add(person.id);
        }
        if (entry.night) {
          nightCount += 1;
          uniqueIds.add(person.id);
        }
      });
    });
    return {
      dayCount,
      nightCount,
      shiftCount: dayCount + nightCount,
      uniqueCount: uniqueIds.size,
    };
  }, [includedPeople, days, getEntry]);
  const weeklyListRows = useMemo(
    () =>
      includedPeople.map((person) => {
        const row = {
          Personel: person.name,
          "Vasif": personSkillName(person, skills),
        };
        let dayTotal = 0;
        let nightTotal = 0;
        days.forEach((date) => {
          const entry = getEntry(person.id, date);
          row[`${shortDate(date)} G`] = entry.day ? "G" : "";
          row[`${shortDate(date)} N`] = entry.night ? "N" : "";
          dayTotal += entry.day ? 1 : 0;
          nightTotal += entry.night ? 1 : 0;
        });
        row["Gündüz Toplam"] = dayTotal;
        row["Gece Toplam"] = nightTotal;
        row["Haftalık Toplam"] = dayTotal + nightTotal;
        row.Tutar = dayTotal * toNumber(person.dayRate) + nightTotal * toNumber(person.nightRate);
        return row;
      }),
    [includedPeople, skills, days, getEntry],
  );

  const exportWeeklyExcel = () => {
    if (!weeklyListRows.length) {
      setNotice("Excel aktarımı için haftaya eklenmiş personel yok.");
      return;
    }
    exportRowsToExcelFile(
      `gunluk-personel-${range.start}-${range.end}.xls`,
      "Günlük Personel",
      weeklyListRows,
    );
  };

  const printWeeklyList = () => {
    if (!weeklyListRows.length) {
      setNotice("Yazdırma için haftaya eklenmiş personel yok.");
      return;
    }
    window.print();
  };

  const addPerson = async () => {
    openNewPersonModal();
  };

  const saveRange = async () => {
    if (rangeSaveBusy) return;
    setRangeSaveBusy(true);
    try {
      const savePeople = daily.filter(
        (person) => includedIds.has(person.id) || clearedIds.has(person.id),
      );
      const rows = savePeople.flatMap((person) =>
        days.map((date) => {
          const entry = getEntry(person.id, date);
          return buildShiftModeRow(person, date, entry);
        }),
      );
      const missingWagePeople = savePeople.filter((person) => {
        const hasSelectedShift = days.some((date) =>
          shiftMode === "day"
             ? getEntry(person.id, date).day
            : getEntry(person.id, date).night,
        );
        return hasSelectedShift && !shiftHasWage(person, shiftMode);
      });
      if (missingWagePeople.length) {
        setNotice(
          `${shiftMode === "day" ? "Gündüz" : "Gece"} ücreti eksik olduğu için kaydedilmedi:\n${missingWagePeople
            .map((person) => `- ${person.name}`)
            .join("\n")}`,
        );
        return;
      }
      const savedRows = await saveGunlukDurum({ rows, deleteEmptyRows: true });
      if (!Array.isArray(savedRows)) {
        throw new Error("Günlük kayıt API cevabı beklenen formatta değil.");
      }
      const refreshedEntries = refreshDailyEntries
         ? await refreshDailyEntries(range)
        : dailyEntries;
      const expectedWorkedKeys = rows
        .filter((row) => row?.dayShift || row?.nightShift)
        .map((row) => `${row?.employeeId}-${row?.workDate}`);
      const savedShiftRows = rows.filter((row) =>
        shiftMode === "day" ? row?.dayShift : row?.nightShift,
      );
      let noticeMessage = `${shiftMode === "day" ? "Gündüz" : "Gece"} kayıtları kaydedildi: ${savedShiftRows.length} vardiya / ${days.length} gün. DB'den tekrar yüklendi.`;
      if (expectedWorkedKeys.length && refreshDailyEntries) {
        const missingWorkedKeys = expectedWorkedKeys.filter(
          (key) => !entryHasWork(refreshedEntries[key]),
        );
        if (missingWorkedKeys.length) {
          noticeMessage = `${formatDate(range.start)} - ${formatDate(range.end)} günlük giriş SQL'e kaydedildi. DB doğrulaması tamamlanamadı.`;
        }
      }
      setClearedIds(new Set());
      setNotice(noticeMessage);
    } catch (error) {
      setNotice(error?.message || "Günlük giriş kaydedilemedi.");
    } finally {
      setRangeSaveBusy(false);
    }
  };

  return (
    <div className="kyik-screen">
      <Panel title="Günlük Giriş" icon={ClipboardList}>
        <div className="kyik-daily-filter">
          <div className="kyik-shift-mode" role="group" aria-label="Vardiya giriş modu">
            <button
              type="button"
              className={shiftMode === "day" ? "active day" : ""}
              onClick={() => setShiftMode("day")}
            >
              <Sun size={16} />
              <span>GÜNDÜZ GİRİŞİ</span>
            </button>
            <button
              type="button"
              className={shiftMode === "night" ? "active night" : ""}
              onClick={() => setShiftMode("night")}
            >
              <Moon size={16} />
              <span>GECE GİRİŞİ</span>
            </button>
          </div>
          <Input label="Başlangıç">
            <TextInput
              type="date"
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
          </Input>
          <Input label="Bitiş">
            <TextInput
              type="date"
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
            />
          </Input>
          <Button icon={Plus} onClick={addPerson}>
            Personel Ekle
          </Button>
          <Button
            icon={Users}
            disabled={poolSaveBusy}
            onClick={async () => {
              const peopleToInclude = visiblePeople.filter((person) => personHasWorkInRange(person.id, dailyEntries, range.start, range.end));
              const previousIncludedIds = new Set(includedIds);
              setIncludedIds(new Set(peopleToInclude.map((person) => person.id)));
              const saved = await persistIncludedPeople(
                peopleToInclude,
                `${peopleToInclude.length} seçili kayıt havuza alındı ve SQL'e kaydedildi.`,
              );
              if (saved) setClearedIds(new Set());
              else setIncludedIds(previousIncludedIds);
            }}
          >
            Tümünü Haftaya Al
          </Button>
          <Button icon={CheckCircle2} onClick={includeWorkedPeople}>
            Kayıtlıları Göster
          </Button>
          <Button icon={Minus} onClick={clearWeekList}>
            Listeyi Temizle
          </Button>
          <Button icon={Save} tone="primary" onClick={saveRange} disabled={rangeSaveBusy}>
            Günlük Kaydet
          </Button>
          <Button icon={FileText} onClick={printWeeklyList}>
            Haftalık Liste Yazdır
          </Button>
          <Button icon={FileSpreadsheet} onClick={exportWeeklyExcel}>
            Excel Aktar
          </Button>
          <strong>
            {days.length} Gün · G {rangeTotals.dayCount} · N {rangeTotals.nightCount} · Vardiya {rangeTotals.shiftCount} · Tekil {rangeTotals.uniqueCount} · Toplam {formatTRY(grand)}
          </strong>
        </div>
        <div className={`kyik-shift-banner ${shiftMode}`}>
          {shiftMode === "day" ? (
            <>
              <Sun size={18} />
              <strong>Gündüz vardiyası giriliyor</strong>
              <span>Bu modda yalnızca G butonları aktiftir; gece kayıtları korunur.</span>
            </>
          ) : (
            <>
              <Moon size={18} />
              <strong>Gece vardiyası giriliyor</strong>
              <span>Bu modda yalnızca N butonları aktiftir; gündüz kayıtları korunur.</span>
            </>
          )}
        </div>
        {notice ? <div className="kyik-save-notice">{notice}</div> : null}
        <div className="kyik-daily-entry-grid">
          <aside className="kyik-daily-left">
            <div className="kyik-section-kicker">
              Sol · haftaya personel ekle / çıkar
            </div>
            <div className="kyik-person-list-search compact">
              <Search size={15} />
              <input
                placeholder="Personel ara"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="kyik-inline-filter-row">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">Tüm vasıflar</option>
                <option value="Makinacı">Makinacı</option>
                <option value="Serimci">Serimci</option>
                <option value="Boyacı">Boyacı</option>
                <option value="Vasıfsız">Vasıfsız</option>
                <option value="Diğer">Diğer</option>
                <option value="Vasıf Yok / Tanımsız">Vasıf Yok / Tanımsız</option>
              </select>
              <select
                value={wageFilter}
                onChange={(e) => setWageFilter(e.target.value)}
              >
                <option value="">Vardiya uygunluğu: aktif moda göre</option>
                <option value="all">Tümü</option>
                <option value="day">Gündüz ücreti olanlar</option>
                <option value="night">Gece ücreti olanlar</option>
                <option value="missing">Ücreti eksik olanlar</option>
              </select>
            </div>
            <Button icon={Plus} onClick={openNewPersonModal}>
              Personel Ekle
            </Button>
            {visiblePeople.length ? (
              visiblePeople.map((person) => (
                <button
                  className={`kyik-daily-person ${selected.id === person.id ? "active" : ""} ${includedIds.has(person.id) ? "" : "removed"} ${personHasWorkInRange(person.id, dailyEntries, range.start, range.end) ? "has-work" : ""}`}
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedId(person.id)}
                >
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {personSkillName(person, skills)} · G {wageEligibilityLabel(formatTRY(person.dayRate), person.dayRate)} | N {wageEligibilityLabel(formatTRY(person.nightRate), person.nightRate)}
                    </small>
                    <small>{includedIds.has(person.id) ? "Haftada" : "Haftaya ekli değil"}</small>
                    {shiftWageWarning(person, shiftMode) ? (
                      <em>{shiftWageWarning(person, shiftMode)}</em>
                    ) : null}
                  </span>
                  <span className="kyik-mini-buttons">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditPersonModal(person);
                      }}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      disabled={poolSaveBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleIncluded(person.id);
                      }}
                    >
                      {includedIds.has(person.id) ? "Çıkar" : "Ekle"}
                    </button>
                  </span>
                </button>
              ))
            ) : (
              <div className="kyik-empty-box">
                Günlük personel kartı yok. Günlük Personel Kartları ekranından veya hızlı kayıt akışından personel ekleyip vardiya girişi yapabilirsiniz.
              </div>
            )}
            <div className="kyik-daily-summary">
              <div className="kyik-section-kicker">Gunluk Vardiya Ozeti</div>
              {dailyShiftSummary.length ? (
                dailyShiftSummary.map((row) => (
                  <button
                    key={row?.date}
                    type="button"
                    className={highlightedDate === row?.date ? "active" : ""}
                    onClick={() =>
                      setHighlightedDate((current) =>
                        current === row?.date ? "" : row?.date,
                      )
                    }
                  >
                    <span>{shortDate(row?.date)}</span>
                    <b>G {row?.dayCount}</b>
                    <b>N {row?.nightCount}</b>
                    <b>Vardiya {row?.shiftCount}</b>
                    <b>Tekil {row?.uniqueEmployeeCount}</b>
                    <b>{formatTRY(row?.amount)}</b>
                  </button>
                ))
              ) : (
                <div className="kyik-empty-box">Tarih araligi secin.</div>
              )}
            </div>
          </aside>
          <div className="kyik-daily-table-shell">
            <div className="kyik-section-kicker">
              Orta · tarih aralıklı günlük giriş tablosu
            </div>
            <div className="kyik-daily-scroll">
              <table className="kyik-daily-table-clean">
                <thead>
                  <tr>
                    <th className="sticky-name">Personel</th>
                    {days.map((date) => (
                      <th
                        key={date}
                        className={highlightedDate === date ? "highlight-date" : ""}
                      >
                        <span>{formatDate(date)}</span>
                        <small className={shiftMode === "day" ? "active-shift-count" : ""}>
                          G: {dailyShiftSummary.find((row) => row.date === date)?.dayCount || 0}
                        </small>
                        <small className={shiftMode === "night" ? "active-shift-count" : ""}>
                          N: {dailyShiftSummary.find((row) => row.date === date)?.nightCount || 0}
                        </small>
                        <small>
                          Toplam {dailyShiftSummary.find((row) => row.date === date)?.uniqueEmployeeCount || 0}
                        </small>
                      </th>
                    ))}
                    <th>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedIncludedPeople.length ? (
                    groupedIncludedPeople.flatMap((group) => {
                      const isCollapsed = collapsedGroups.has(group.label);
                      const header = (
                        <tr className="kyik-daily-group-row" key={`group-${group.label}`}>
                          <td className="sticky-name">
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedGroups((current) => {
                                  const next = new Set(current);
                                  if (next.has(group.label)) next.delete(group.label);
                                  else next.add(group.label);
                                  return next;
                                })
                              }
                            >
                              {isCollapsed ? "+" : "-"} {group.label} · {group.people.length} kisi
                            </button>
                          </td>
                          <td colSpan={days.length + 1}></td>
                        </tr>
                      );
                      if (isCollapsed) return [header];
                      return [
                        header,
                        ...group.people.map((person) => {
                          const total = days.reduce((sum, date) => {
                            const entry = getEntry(person.id, date);
                            return (
                              sum +
                              (entry.day ? person.dayRate : 0) +
                              (entry.night ? person.nightRate : 0)
                            );
                          }, 0);
                          return (
                            <tr
                              className={
                                `${selected.id === person.id ? "selected" : ""} ${shiftWageWarning(person, shiftMode) ? "wage-missing" : ""}`
                              }
                              key={person.id}
                            >
                              <td className="sticky-name">
                                <button
                                  type="button"
                                  onClick={() => setSelectedId(person.id)}
                                >
                                  <span>{person.name}</span>
                                  <small>
                                    {personSkillName(person, skills)} · G {compactMoney(person.dayRate)} · N {compactMoney(person.nightRate)}
                                  </small>
                                  {shiftWageWarning(person, shiftMode) ? (
                                    <small className="kyik-row-warning">
                                      {shiftWageWarning(person, shiftMode)}
                                    </small>
                                  ) : null}
                                </button>
                              </td>
                              {days.map((date) => {
                                const entry = getEntry(person.id, date);
                                const dayDisabled = shiftMode !== "day" || toNumber(person.dayRate) <= 0;
                                const nightDisabled = shiftMode !== "night" || toNumber(person.nightRate) <= 0;
                                return (
                                  <td
                                    key={date}
                                    className={highlightedDate === date ? "highlight-date" : ""}
                                  >
                                    <span className="shift-pair">
                                      <button
                                        className={`shift day ${entry.day ? "on" : ""} ${shiftMode === "day" ? "mode-active" : ""}`}
                                        type="button"
                                        disabled={dayDisabled}
                                        title={toNumber(person.dayRate) <= 0 ? "Gündüz ücreti tanımlı değil" : "Gündüz"}
                                        onClick={() =>
                                          toggleEntry(person.id, date, "day")
                                        }
                                      >
                                        <Sun size={14} />
                                        <span>G</span>
                                      </button>
                                      <i aria-hidden="true"></i>
                                      <button
                                        className={`shift night ${entry.night ? "on" : ""} ${shiftMode === "night" ? "mode-active" : ""}`}
                                        type="button"
                                        disabled={nightDisabled}
                                        title={toNumber(person.nightRate) <= 0 ? "Gece ücreti tanımlı değil" : "Gece"}
                                        onClick={() =>
                                          toggleEntry(person.id, date, "night")
                                        }
                                      >
                                        <Moon size={14} />
                                        <span>N</span>
                                      </button>
                                    </span>
                                  </td>
                                );
                              })}
                              <td>
                                <strong>{formatTRY(total)}</strong>
                              </td>
                            </tr>
                          );
                        }),
                      ];
                    })
                  ) : (
                    <tr>
                      <td className="kyik-empty-cell" colSpan={days.length + 2}>
                        Tarih aralığında gösterilecek günlük personel yok. Soldan personel ekle veya Kayıtlıları Göster butonunu kullan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="kyik-daily-right">
            <div className="kyik-section-kicker">
              Sağ · seçili personel çalışma kontrolü
            </div>
            <div className="kyik-control-card">
              <span className="kyik-avatar large">
                {initials(selected.name)}
              </span>
              <h3>{selected.name}</h3>
              <p>
                {personSkillName(selected, skills)} · {selected.broker}
              </p>
              <div>
                <span>Gündüz</span>
                <strong>
                  {selectedTotals.dayCount} gün ·{" "}
                  {formatTRY(
                    selectedTotals.dayCount * toNumber(selected.dayRate),
                  )}
                </strong>
              </div>
              <div>
                <span>Gece</span>
                <strong>
                  {selectedTotals.nightCount} gece ·{" "}
                  {formatTRY(
                    selectedTotals.nightCount * toNumber(selected.nightRate),
                  )}
                </strong>
              </div>
              <div className="total">
                <span>Personel toplamı</span>
                <strong>{formatTRY(selectedTotal)}</strong>
              </div>
              <label>
                <span>Vasıf</span>
                <SkillSelect
                  value={canonicalSkillForPerson(selected, skills).id || ""}
                  skills={skills}
                  companyId={companyId}
                  onCreateSkill={onCreateSkill}
                  onChange={(skill) =>
                    setDaily((current) =>
                      current.map((person) =>
                        person.id === selected.id
                          ? {
                              ...person,
                              skillId: skill?.id || "",
                              role: skill?.name || "",
                            }
                          : person,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span>Aracı</span>
                <input
                  value={selected.broker || ""}
                  onChange={(e) =>
                    setDaily((current) =>
                      current.map((person) =>
                        person.id === selected.id
                           ? { ...person, broker: e.target.value }
                          : person,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span>Gündüz ücret</span>
                <input
                  className={toNumber(selected.dayRate) <= 0 ? "missing-wage" : ""}
                  type="number"
                  value={selected.dayRate || 0}
                  onChange={(e) =>
                    setDaily((current) =>
                      current.map((person) =>
                        person.id === selected.id
                           ? { ...person, dayRate: toNumber(e.target.value) }
                          : person,
                      ),
                    )
                  }
                />
                {toNumber(selected.dayRate) <= 0 ? <small className="kyik-field-warning">Ücret yok</small> : null}
              </label>
              <label>
                <span>Gece ücret</span>
                <input
                  className={toNumber(selected.nightRate) <= 0 ? "missing-wage" : ""}
                  type="number"
                  value={selected.nightRate || 0}
                  onChange={(e) =>
                    setDaily((current) =>
                      current.map((person) =>
                        person.id === selected.id
                           ? { ...person, nightRate: toNumber(e.target.value) }
                          : person,
                      ),
                    )
                  }
                />
                {toNumber(selected.nightRate) <= 0 ? <small className="kyik-field-warning">Ücret yok</small> : null}
              </label>
              <div className="kyik-action-row slim">
                <Button
                  icon={Save}
                  tone="primary"
                  onClick={saveSelectedPerson}
                  disabled={personSaveBusy}
                >
                  Personel Kartını Kaydet
                </Button>
                <Button
                  icon={includedIds.has(selected.id) ? Minus : Plus}
                  onClick={() => toggleIncluded(selected.id)}
                >
                  {includedIds.has(selected.id)
                     ? "Bu Haftadan Çıkar"
                    : "Bu Haftaya Ekle"}
                </Button>
                <Button icon={UserRound} onClick={() => openEditPersonModal(selected)}>
                  Personeli Düzenle
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Panel>
      {personModal ? (
        <div className="kyik-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kyik-modal">
            <div className="kyik-modal-head">
              <h3>{personModal.mode === "new" ? "Personel Ekle" : "Personeli Düzenle"}</h3>
              <button type="button" onClick={() => setPersonModal(null)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="kyik-form-grid two">
              <Input label="Ad Soyad">
                <TextInput
                  value={personModal.form.name}
                  onChange={(e) => updatePersonModalForm({ name: e.target.value })}
                />
              </Input>
              <Input label="Personel Kodu">
                <TextInput
                  value={personModal.form.personnelNo || ""}
                  placeholder="HKN001"
                  onChange={(e) => updatePersonModalForm({ personnelNo: e.target.value })}
                />
              </Input>
              <Input label="Vasıf">
                <select
                  value={personModal.form.role}
                  onChange={(e) => updatePersonModalForm({ role: e.target.value })}
                >
                  <option>Makinacı</option>
                  <option>Serimci</option>
                  <option>Boyacı</option>
                  <option>Vasıfsız</option>
                  <option>Diğer</option>
                </select>
              </Input>
              <Input label="Aracı / Görev">
                <TextInput
                  value={personModal.form.broker || ""}
                  onChange={(e) => updatePersonModalForm({ broker: e.target.value })}
                />
              </Input>
              <Input label="Gündüz Ücret">
                <TextInput
                  type="number"
                  value={personModal.form.dayRate}
                  onChange={(e) => updatePersonModalForm({ dayRate: toNumber(e.target.value) })}
                />
              </Input>
              <Input label="Gece Ücret">
                <TextInput
                  type="number"
                  value={personModal.form.nightRate}
                  onChange={(e) => updatePersonModalForm({ nightRate: toNumber(e.target.value) })}
                />
              </Input>
              <label className="kyik-checkline">
                <input
                  type="checkbox"
                  checked={personModal.form.active !== false}
                  onChange={(e) => updatePersonModalForm({ active: e.target.checked })}
                />
                Aktif
              </label>
            </div>
            <div className="kyik-action-row">
              <Button icon={Save} tone="primary" onClick={savePersonModal} disabled={personSaveBusy}>
                Kaydet
              </Button>
              <Button icon={X} onClick={() => setPersonModal(null)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="printable daily-print daily-weekly-list-print">
        <section className="daily-print-page">
          <div className="daily-print-title">GUNLUK PERSONEL HAFTALIK LISTE</div>
          <div className="daily-print-subtitle">
            {formatDate(range.start)} - {formatDate(range.end)}
          </div>
          <table>
            <thead>
              <tr>
                <th>Personel</th>
                <th>Vasıf</th>
                {days.map((date) => (
                  <th key={`print-day-${date}`}>{shortDate(date)} G</th>
                ))}
                {days.map((date) => (
                  <th key={`print-night-${date}`}>{shortDate(date)} N</th>
                ))}
                <th>Gündüz</th>
                <th>Gece</th>
                <th>Toplam</th>
                <th>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {weeklyListRows.map((row) => (
                <tr key={`print-${row?.Personel}`}>
                  <td>{row?.Personel}</td>
                  <td>{row?.Vasif}</td>
                  {days.map((date) => (
                    <td key={`print-row-day-${row?.Personel}-${date}`}>
                      {row[`${shortDate(date)} G`]}
                    </td>
                  ))}
                  {days.map((date) => (
                    <td key={`print-row-night-${row?.Personel}-${date}`}>
                      {row[`${shortDate(date)} N`]}
                    </td>
                  ))}
                  <td>{row["Gündüz Toplam"]}</td>
                  <td>{row["Gece Toplam"]}</td>
                  <td>{row["Haftalık Toplam"]}</td>
                  <td>{formatTRY(row?.Tutar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Gündüz Kişi</th>
                <th>Gece Kişi</th>
                <th>Toplam</th>
                <th>Günlük Tutar</th>
              </tr>
            </thead>
            <tbody>
              {dailyShiftSummary.map((row) => (
                <tr key={`print-summary-${row?.date}`}>
                  <td>{formatDate(row?.date)}</td>
                  <td>{row?.dayCount}</td>
                  <td>{row?.nightCount}</td>
                  <td>{row?.uniqueEmployeeCount}</td>
                  <td>{formatTRY(row?.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function getDailySummary(
  daily,
  entries,
  start = DEFAULT_DAILY_RANGE.start,
  end = DEFAULT_DAILY_RANGE.end,
  skills = [],
) {
  const safeDaily = Array.isArray(daily) ? daily.filter(Boolean) : [];
  const safeEntries = entries && typeof entries === "object" && !Array.isArray(entries) ? entries : {};
  const safeSkills = Array.isArray(skills) ? skills.filter(Boolean) : [];
  const safeStart = ISO_DATE_ONLY_PATTERN.test(String(start || "")) ? String(start) : DEFAULT_DAILY_RANGE.start;
  const safeEnd = ISO_DATE_ONLY_PATTERN.test(String(end || "")) ? String(end) : DEFAULT_DAILY_RANGE.end;
  const days = daysBetween(safeStart, safeEnd);

  return safeDaily.map((person, index) => {
    const personId = String(person?.id || "").trim();
    const totals = days.reduce(
      (acc, date) => {
        const entry = safeEntries[`${personId}-${date}`] || {
          day: false,
          night: false,
        };
        return {
          dayCount: acc.dayCount + (entry?.day ? 1 : 0),
          nightCount: acc.nightCount + (entry?.night ? 1 : 0),
        };
      },
      { dayCount: 0, nightCount: 0 },
    );
    const dayRate = toNumber(person?.dayRate);
    const nightRate = toNumber(person?.nightRate);
    const dayTotal = totals.dayCount * dayRate;
    const nightTotal = totals.nightCount * nightRate;
    return {
      ...person,
      id: personId || `daily-row-${index + 1}`,
      name: String(person?.name || person?.fullName || "İsimsiz Personel"),
      dayRate,
      nightRate,
      role: personSkillName(person || {}, safeSkills),
      ...totals,
      dayTotal,
      nightTotal,
      total: dayTotal + nightTotal,
    };
  });
}

function WeeklySummary({ daily, dailyEntries, range, setRange, skills = [], weekOptions = [] }) {
  const safeRange = {
    start: ISO_DATE_ONLY_PATTERN.test(String(range?.start || "")) ? String(range.start) : DEFAULT_DAILY_RANGE.start,
    end: ISO_DATE_ONLY_PATTERN.test(String(range?.end || "")) ? String(range.end) : DEFAULT_DAILY_RANGE.end,
  };
  const safeWeekOptions = Array.isArray(weekOptions) ? weekOptions.filter(Boolean) : [];
  const rows = getDailySummary(daily, dailyEntries, safeRange.start, safeRange.end, skills).filter(
    (row) => toNumber(row?.total) > 0,
  );
  const dayTotal = rows.reduce((sum, row) => sum + toNumber(row?.dayTotal), 0);
  const nightTotal = rows.reduce((sum, row) => sum + toNumber(row?.nightTotal), 0);
  const handlePrint = () => window.print();
  const shiftWeek = (amount) => {
    setRange((current) => ({
      start: addDaysDateOnly(
        ISO_DATE_ONLY_PATTERN.test(String(current?.start || "")) ? current.start : safeRange.start,
        amount * 7,
      ),
      end: addDaysDateOnly(
        ISO_DATE_ONLY_PATTERN.test(String(current?.end || "")) ? current.end : safeRange.end,
        amount * 7,
      ),
    }));
  };

  return (
    <div className="kyik-screen">
      <div className="kyik-stat-grid three">
        <Stat
          icon={Sun}
          label="Gündüz toplam"
          value={formatTRY(dayTotal)}
          sub={`${rows.reduce((s, r) => s + r.dayCount, 0)} gündüz`}
        />
        <Stat
          icon={Moon}
          label="Gece toplam"
          value={formatTRY(nightTotal)}
          sub={`${rows.reduce((s, r) => s + r.nightCount, 0)} gece`}
        />
        <Stat
          icon={WalletCards}
          label="Genel toplam"
          value={formatTRY(dayTotal + nightTotal)}
          sub="Gündüz + gece"
        />
      </div>
      <Panel title="Haftalık Özet" icon={CalendarDays}>
        <div className="kyik-form-grid four compact-filter">
          <Input label="Başlangıç">
            <TextInput
              type="date"
              value={range.start}
              onChange={(event) =>
                setRange((current) => ({ ...current, start: event?.target.value }))
              }
            />
          </Input>
          <Input label="Bitiş">
            <TextInput
              type="date"
              value={range.end}
              onChange={(event) =>
                setRange((current) => ({ ...current, end: event?.target.value }))
              }
            />
          </Input>
        </div>
        <div className="kyik-action-row top-actions">
          <Button icon={CalendarDays} onClick={() => shiftWeek(-1)}>
            Önceki Hafta
          </Button>
          <Button icon={CalendarDays} onClick={() => shiftWeek(1)}>
            Sonraki Hafta
          </Button>
        </div>
        {safeWeekOptions.length ? (
          <div className="kyik-week-picker">
            {safeWeekOptions.map((week, index) => {
              const weekStart = ISO_DATE_ONLY_PATTERN.test(String(week?.start || "")) ? String(week.start) : "";
              const weekEnd = ISO_DATE_ONLY_PATTERN.test(String(week?.end || "")) ? String(week.end) : "";
              if (!weekStart || !weekEnd) return null;
              const active = safeRange.start === weekStart && safeRange.end === weekEnd;
              return (
                <button
                  type="button"
                  key={week?.id || `${weekStart}-${weekEnd}-${index}`}
                  className={active ? "active" : ""}
                  onClick={() => setRange({ start: weekStart, end: weekEnd })}
                >
                  <strong>{formatDate(weekStart)} - {formatDate(weekEnd)}</strong>
                  <span>
                    {toNumber(week?.peopleCount)} kişi · G {toNumber(week?.dayCount)} / N {toNumber(week?.nightCount)} · {formatTRY(week?.total)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="kyik-action-row top-actions">
          <Button icon={FileText} onClick={handlePrint}>
            Haftalık Özet Yazdır
          </Button>
          <Button icon={ReceiptText} tone="primary" onClick={handlePrint}>
            A4 Çıktı Önizle
          </Button>
        </div>
        <Table
          rows={rows}
          columns={[
            { key: "name", label: "Personel" },
            { key: "role", label: "Vasıf" },
            { key: "dayCount", label: "Gündüz adet" },
            {
              key: "dayTotal",
              label: "Gündüz toplam",
              render: (row) => formatTRY(row?.dayTotal),
            },
            { key: "nightCount", label: "Gece adet" },
            {
              key: "nightTotal",
              label: "Gece toplam",
              render: (row) => formatTRY(row?.nightTotal),
            },
            {
              key: "total",
              label: "Genel toplam",
              render: (row) => <strong>{formatTRY(row?.total)}</strong>,
            },
          ]}
        />
      </Panel>
      {rows.length ? (
        <Panel
          title="Haftalık Özet Çıktısı"
          icon={FileText}
          className="printable weekly-print"
        >
          <section className="weekly-print-page">
            <div className="daily-print-title">HAFTALIK GUNLUK PERSONEL OZETI</div>
            <div className="daily-print-subtitle">
              {formatDate(safeRange.start)} / {formatDate(safeRange.end)}
            </div>
            <table className="weekly-print-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Personel</th>
                  <th>Vasıf</th>
                  <th>Gündüz</th>
                  <th>Gece</th>
                  <th>Gündüz Toplam</th>
                  <th>Gece Toplam</th>
                  <th>Genel Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row?.id}>
                    <td>{index + 1}</td>
                    <td>{row?.name}</td>
                    <td>{row?.role}</td>
                    <td>{row?.dayCount}</td>
                    <td>{row?.nightCount}</td>
                    <td>{formatTRY(row?.dayTotal)}</td>
                    <td>{formatTRY(row?.nightTotal)}</td>
                    <td>{formatTRY(row?.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="5">Alt toplam</td>
                  <td>{formatTRY(dayTotal)}</td>
                  <td>{formatTRY(nightTotal)}</td>
                  <td>{formatTRY(dayTotal + nightTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </Panel>
      ) : null}
    </div>
  );
}

function DailyPayments({ daily, dailyEntries, range, setRange, skills = [] }) {
  const [filters, setFilters] = useState({
    query: "",
    role: "Tümü",
    status: "Tümü",
  });
  const [paidIds, setPaidIds] = useState(() => new Set());
  const [selectedPrintIds, setSelectedPrintIds] = useState(() => new Set());
  const rows = getDailySummary(daily, dailyEntries, range.start, range.end, skills)
    .filter((row) => row?.total > 0)
    .filter((row) =>
      row?.name
        .toLocaleLowerCase("tr-TR")
        .includes(filters.query.toLocaleLowerCase("tr-TR")),
    )
    .filter((row) => filters.role === "Tümü" || row.role === filters.role)
    .filter((row) => {
      if (filters.status === "Tümü") return true;
      const paid = paidIds.has(row?.id);
      return filters.status === "Ödendi" ? paid : !paid;
    })
    .map((row) => ({
      ...row,
      paymentStatus: paidIds.has(row?.id) ? "Ödendi" : "Hazır",
    }));
  const selectedPrintableRows = rows.filter((row) => selectedPrintIds.has(row?.id));
  const printableRows = selectedPrintIds.size ? selectedPrintableRows : rows;
  const printablePages = printableRows.reduce((pages, row, index) => {
    const pageIndex = Math.floor(index / PAYMENT_SLIPS_PER_PAGE);
    if (!pages[pageIndex]) pages[pageIndex] = [];
    pages[pageIndex].push(row);
    return pages;
  }, []);
  const selectedPrintCount = selectedPrintableRows.length;
  const allVisiblePrintSelected =
    rows.length > 0 && rows.every((row) => selectedPrintIds.has(row?.id));

  const handlePrint = () => {
    window.print();
  };
  const markPaid = () => {
    setPaidIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => next.add(row?.id));
      return next;
    });
  };
  const togglePrintSelection = (personId) => {
    setSelectedPrintIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  };
  const toggleAllVisiblePrintSelection = () => {
    setSelectedPrintIds((current) => {
      const next = new Set(current);
      if (allVisiblePrintSelected) {
        rows.forEach((row) => next.delete(row?.id));
      } else {
        rows.forEach((row) => next.add(row?.id));
      }
      return next;
    });
  };
  const roleOptions = [
    "Tümü",
    ...skills.filter((skill) => skill.active !== false).map((skill) => skill.name),
  ].sort((left, right) =>
    left === "Tümü" ? -1 : right === "Tümü" ? 1 : left.localeCompare(right, "tr"),
  );
  return (
    <div className="kyik-screen">
      <Panel title="Günlük Ödeme Fişleri" icon={ReceiptText}>
        <div className="kyik-form-grid six compact-filter">
          <Input label="Başlangıç">
            <TextInput
              type="date"
              value={range.start}
              onChange={(e) =>
                setRange((current) => ({ ...current, start: e.target.value }))
              }
            />
          </Input>
          <Input label="Bitiş">
            <TextInput
              type="date"
              value={range.end}
              onChange={(e) => setRange((current) => ({ ...current, end: e.target.value }))}
            />
          </Input>
          <Input label="Personel ara">
            <TextInput
              value={filters.query}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
            />
          </Input>
          <Input label="Vasıf filtresi">
            <SelectInput
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            >
              {roleOptions.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </SelectInput>
          </Input>
          <Input label="Ödeme durumu">
            <SelectInput
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option>Tümü</option>
              <option>Hazır</option>
              <option>Ödendi</option>
            </SelectInput>
          </Input>
        </div>
        <div className="kyik-action-row">
          <Button icon={ReceiptText} tone="primary" onClick={handlePrint}>
            A4 Önizle
          </Button>
          <Button icon={FileText} onClick={handlePrint}>
            Yazdır
          </Button>
          <Button icon={FolderUp} onClick={handlePrint}>
            PDF İndir
          </Button>
          <Button icon={CheckCircle2} onClick={markPaid}>
            Ödendi İşaretle
          </Button>
          <Button icon={Users} onClick={toggleAllVisiblePrintSelection}>
            {allVisiblePrintSelected ? "Görünen Seçimi Kaldır" : "Görünenleri Seç"}
          </Button>
          <Button icon={X} onClick={() => setSelectedPrintIds(new Set())}>
            Çıktı Seçimini Temizle
          </Button>
          <span className="kyik-print-pick-info">
            {selectedPrintIds.size
               ? `${selectedPrintCount} kişi seçili basılacak`
              : "Seçim yok: tüm görünen liste basılır"}
          </span>
        </div>
        <div className="kyik-slip-grid">
          {rows.length ? (
            rows.map((row) => (
              <div className="kyik-slip" key={row?.id}>
                <div className="kyik-slip-head">
                  <strong>{row?.name}</strong>
                  <label className="kyik-slip-select">
                    <input
                      type="checkbox"
                      checked={selectedPrintIds.has(row?.id)}
                      onChange={() => togglePrintSelection(row?.id)}
                    />
                    Çıktı
                  </label>
                </div>
                <span>{row?.role}</span>
                <Badge tone={row.paymentStatus === "Ödendi" ? "green" : "orange"}>
                  {row?.paymentStatus}
                </Badge>
                <div className="kyik-slip-line">
                  <span>Gündüz</span>
                  <b>
                    {row?.dayCount} · {formatTRY(row?.dayTotal)}
                  </b>
                </div>
                <div className="kyik-slip-line">
                  <span>Gece</span>
                  <b>
                    {row?.nightCount} · {formatTRY(row?.nightTotal)}
                  </b>
                </div>
                <div className="kyik-slip-line total">
                  <span>Ödenecek</span>
                  <b>{formatTRY(row?.total)}</b>
                </div>
              </div>
            ))
          ) : (
            <div className="kyik-empty-box">
              Seçili hafta için kayıtlı günlük çalışma yok.
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title="A4 Çıktı Önizleme"
        icon={FileText}
        className="printable daily-print"
      >
        {printablePages.length ? (
          printablePages.map((pageRows, pageIndex) => (
            <section className="daily-print-page" key={`page-${pageIndex + 1}`}>
              <div className="daily-print-title">
                GUNLUK PERSONEL ODEME FISLERI
              </div>
              <div className="daily-print-subtitle">
                {formatDate(range.start)} / {formatDate(range.end)}
              </div>
              <div className="daily-slip-print-grid">
                {pageRows.map((row) => (
                  <div className="daily-slip-card" key={row?.id}>
                    <h4>PERSONEL ODEME FISI</h4>
                    <strong>{row?.name}</strong>
                    <span>
                      Tarih: {formatDate(range.start)} /{" "}
                      {formatDate(range.end)}
                    </span>
                    <b>VARDIYA OZETI</b>
                    <table>
                      <thead>
                        <tr>
                          <th>Vardiya</th>
                          <th>Birim</th>
                          <th>Adet</th>
                          <th>Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>GUNDUZ</td>
                          <td>{formatTRY(row?.dayRate)}</td>
                          <td>{row?.dayCount}</td>
                          <td>{formatTRY(row?.dayTotal)}</td>
                        </tr>
                        <tr>
                          <td>GECE</td>
                          <td>{formatTRY(row?.nightRate)}</td>
                          <td>{row?.nightCount}</td>
                          <td>{formatTRY(row?.nightTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="daily-slip-note">
                      Aciklama: {row?.dayCount} gunduz x {formatTRY(row?.dayRate)}{" "}
                      + {row?.nightCount} gece x {formatTRY(row?.nightRate)}
                    </div>
                    <div className="daily-slip-total">
                      <span>TOPLAM ODEME</span>
                      <strong>{formatTRY(row?.total)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="kyik-empty-box">
            Secili hafta icin basilmaya hazir gunluk odeme fisi yok.
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function IkPage({
  activeTab = "ik-yonetim-ozeti",
  activeMainCompany,
}) {
  const screen = TAB_MAP[activeTab] || "overview";
  const [monthly, setMonthly] = useState([]);
  const [daily, setDaily] = useState([]);
  const [selectedMonthlyId, setSelectedMonthlyId] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setLeaves] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [, setDocs] = useState([]);
  const [monthlyLogs, setMonthlyLogs] = useState([]);
  const [dailyEntries, setDailyEntries] = useState({});
  const [dailyWeekOptions, setDailyWeekOptions] = useState([]);
  const [skills, setSkills] = useState([]);
  const [, setOfficialHolidays] = useState(DEFAULT_OFFICIAL_HOLIDAYS_2026);
  const [dailyDateRange, setDailyDateRange] = useState(() => readStoredDailyRange());

  const companyId =
    activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  useEffect(() => {
    let cancelled = false;
    async function loadIkData() {
      try {
        const result = await loadModuleData({
          scope: `ik:${companyId}:${dailyDateRange.start}:${dailyDateRange.end}`,
          sources: {
            monthly: { critical: true, fallback: [], load: () => getAylikPersonel({ mainCompanyId: companyId }) },
            leaves: { fallback: [], load: () => getAylikIzinler({ mainCompanyId: companyId }) },
            adjustments: { fallback: [], load: () => getAylikMesailer({ mainCompanyId: companyId }) },
            documents: { fallback: [], load: () => getAylikEvraklar({ mainCompanyId: companyId }) },
            daily: { critical: true, fallback: [], load: () => getGunlukPersonel({ mainCompanyId: companyId }) },
            attendance: {
              fallback: [],
              load: () => getGunlukDurum({
                mainCompanyId: companyId,
                start: dailyDateRange.start,
                end: dailyDateRange.end,
              }),
            },
            skills: { fallback: [], load: () => getIkSkills({ mainCompanyId: companyId }) },
            holidays: {
              fallback: DEFAULT_OFFICIAL_HOLIDAYS_2026,
              load: () => getResmiTatiller({ year: CURRENT_YEAR }),
            },
            logs: { fallback: [], load: () => getAylikLoglar({ mainCompanyId: companyId, limit: 200 }) },
          },
        });
        if (cancelled) return;
        const {
          monthly: monthlyRows,
          leaves: leaveRows,
          adjustments: adjustmentRows,
          documents: documentRows,
          daily: dailyRows,
          attendance: attendanceRows,
          skills: skillRows,
          holidays: holidayRows,
          logs: logRows,
        } = result.data;
        const normalized = Array.isArray(monthlyRows)
           ? monthlyRows.map(normalizeMonthlyPerson)
          : [];
        setMonthly(normalized);
        setLeaves(
          Array.isArray(leaveRows) ? leaveRows.map(normalizeLeave) : [],
        );
        setAdjustments(
          Array.isArray(adjustmentRows)
             ? adjustmentRows.map(normalizeAdjustment)
            : [],
        );
        setDocs(
          Array.isArray(documentRows)
             ? documentRows.map(normalizeDocument)
            : [],
        );
        setMonthlyLogs(Array.isArray(logRows) ? logRows : []);
        setDaily(
          Array.isArray(dailyRows) ? dailyRows.map(normalizeDailyPerson) : [],
        );
        setSkills(Array.isArray(skillRows) ? skillRows : []);
        setOfficialHolidays(
          Array.isArray(holidayRows) && holidayRows.length
             ? holidayRows
            : DEFAULT_OFFICIAL_HOLIDAYS_2026,
        );
        setDailyEntries(
          Array.isArray(attendanceRows)
            ? attendanceRows.reduce((acc, row) => {
                const date = row?.workDate?.slice?.(0, 10) || row?.workDate;
                if (row?.employeeId && date) {
                  acc[`${row.employeeId}-${date}`] = normalizeDailyEntry(row);
                }
                return acc;
              }, {})
            : {},
        );
        setDailyWeekOptions(
          Array.isArray(attendanceRows) ? buildDailyWeekOptions(attendanceRows) : [],
        );
        setSelectedMonthlyId((current) =>
          normalized.some((person) => person.id === current)
             ? current
            : normalized[0]?.id || "",
        );
        setNotice(moduleLoadMessage(
          result,
          "İK ana personel kaynağı geçici olarak okunamadı; diğer başarılı bilgiler korunuyor.",
          "Bazı yardımcı İK bilgileri yenilenemedi; personel havuzu ve son başarılı veriler korunuyor.",
        ));
      } catch (error) {
        setNotice(error?.message || "İK verisi okunamadı.");
      }
    }
    loadIkData();
    return () => {
      cancelled = true;
    };
  }, [companyId, dailyDateRange.end, dailyDateRange.start]);

  const updateDailyDateRange = (nextRange) => {
    setDailyDateRange((current) => {
      const next =
        typeof nextRange === "function" ? nextRange(current) : nextRange;
      writeStoredDailyRange(next);
      return next;
    });
  };

  const refreshDailyEntries = useCallback(async (rangeOverride = dailyDateRange) => {
    const rows = await getGunlukDurum({
      mainCompanyId: companyId,
      start: rangeOverride.start,
      end: rangeOverride.end,
    });
    const normalizedEntries = Array.isArray(rows)
      ? rows.reduce((acc, row) => {
          const date = row?.workDate?.slice?.(0, 10) || row?.workDate || row?.date;
          if (row?.employeeId && date) {
            acc[`${row.employeeId}-${date}`] = normalizeDailyEntry(row);
          }
          return acc;
        }, {})
      : {};
    setDailyEntries(normalizedEntries);
    return normalizedEntries;
  }, [companyId, dailyDateRange]);

  const refreshDailyPeople = async () => {
    const rows = await getGunlukPersonel({ mainCompanyId: companyId });
    const normalizedRows = Array.isArray(rows)
      ? rows.map(normalizeDailyPerson)
      : [];
    setDaily(normalizedRows);
    return normalizedRows;
  };

  const refreshMonthlyLogs = async (params = {}) => {
    const rows = await getAylikLoglar({
      mainCompanyId: companyId,
      limit: 200,
      ...params,
    }).catch(() => []);
    setMonthlyLogs(Array.isArray(rows) ? rows : []);
    return rows;
  };

  useEffect(() => {
    refreshDailyEntries(dailyDateRange).catch((error) => {
      setNotice(error?.message || "Günlük giriş kayıtları okunamadı.");
    });
  }, [companyId, dailyDateRange.start, dailyDateRange.end, refreshDailyEntries, dailyDateRange]);

  const createSkillAndRefresh = async (payload) => {
    const saved = await createIkSkill({ ...payload, mainCompanyId: companyId });
    const rows = await getIkSkills({ mainCompanyId: companyId });
    setSkills(Array.isArray(rows) ? rows : []);
    return saved;
  };


  const saveMonthlyPerson = async (person) => {
    if (!person.id || saveBusy) return null;
    setSaveBusy(true);
    setNotice("");
    try {
      const saved = await updateAylikPersonel(
        person.id,
        monthlyPayload(person, activeMainCompany),
      );
      const normalized = normalizeMonthlyPerson(saved);
      setMonthly((current) =>
        current.map((item) => (item.id === normalized.id ? normalized : item)),
      );
      setSelectedMonthlyId(normalized.id);
      setNotice("Bilgiler kaydedildi.");
      refreshMonthlyLogs().catch(() => {});
      return normalized;
    } catch (error) {
      setNotice(error?.message || "Kayıt yapılamadı.");
      return null;
    } finally {
      setSaveBusy(false);
    }
  };

  const createMonthlyPerson = async (draft = {}) => {
    if (saveBusy) return null;
    setSaveBusy(true);
    setNotice("");
    try {
      const nextCode = nextMonthlyCodeFromRows(monthly);
      const normalizedDraft = normalizeMonthlyPaymentAmounts({
        ...draft,
        personnelCode: draft.personnelCode || nextCode,
        sgkStatus: draft.sgkStatus || "VAR",
        salary: toNumber(draft.salary),
        roadAllowance: toNumber(draft.roadAllowance),
        paymentChannel: draft.paymentChannel || "Banka + Elden",
        bankAmount: toNumber(draft.bankAmount),
        cashAmount: toNumber(draft.cashAmount),
      });
      const created = await createAylikPersonel({
        mainCompanyId: companyId,
        personnelCode: normalizedDraft.personnelCode,
        code: normalizedDraft.personnelCode,
        fullName: draft.fullName || "Yeni Personel",
        department: draft.department || "",
        title: draft.title || "",
        workType: draft.workType || "Aylık",
        sgkStatus: normalizedDraft.sgkStatus,
        status: draft.status || "Aktif",
        startDate: draft.startDate || TODAY,
        hireDate: draft.startDate || TODAY,
        salary: normalizedDraft.salary,
        roadAllowance: normalizedDraft.roadAllowance,
        paymentChannel: normalizedDraft.paymentChannel,
        bankPaymentType: normalizedDraft.paymentChannel,
        bankAmount: normalizedDraft.bankAmount,
        cashAmount: normalizedDraft.cashAmount,
        annualLeaveEntitlement: toNumber(
          draft.annualLeaveEntitlement ?? DEFAULT_ANNUAL_LEAVE_DAYS,
        ),
        annualLeaveCarryover: toNumber(draft.annualLeaveCarryover),
        overtimeBaseHours: toNumber(draft.overtimeBaseHours || 225),
        overtimeHourlyBase: toNumber(draft.overtimeBaseHours || 225),
        note: draft.note || "",
      });
      const normalized = normalizeMonthlyPerson(created);
      setMonthly((current) => [...current, normalized]);
      setSelectedMonthlyId(normalized.id);
      setNotice("Yeni personel kaydı oluşturuldu.");
      refreshMonthlyLogs().catch(() => {});
      return normalized;
    } catch (error) {
      setNotice(error?.message || "Yeni personel kaydı oluşturulamadı.");
      return null;
    } finally {
      setSaveBusy(false);
    }
  };












  const renderScreen = () => {
    if (screen === "advanced-puantaj")
      return (
        <IkAdvancedMonthly
          mode="izin"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "advanced-sgk")
      return (
        <IkAdvancedMonthly
          mode="kapanis"
          initialControlTab="sgk"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "advanced-kapanis")
      return (
        <IkAdvancedMonthly
          mode="kapanis"
          initialControlTab={activeTab.includes("evrak") ? "evrak" : activeTab.includes("sgk") ? "sgk" : "kontrol"}
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "advanced-bordro")
      return (
        <IkAdvancedMonthly
          mode="bordro"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "overview")
      return (
        <IkAdvancedMonthly
          mode="ozet"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "monthly-cards")
      return (
        <IkAdvancedMonthly
          mode="personel"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "monthly-contract")
      return (
        <IkAdvancedMonthly
          mode="personel"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "monthly-leave")
      return (
        <IkAdvancedMonthly mode="izin" activeMainCompany={activeMainCompany} />
      );
    if (screen === "monthly-adjustments")
      return (
        <IkAdvancedMonthly
          mode="mesai"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "monthly-payroll")
      return (
        <PayrollScreen
          monthly={monthly}
          adjustments={adjustments}
          selectedId={selectedMonthlyId}
          setSelectedId={setSelectedMonthlyId}
          createPerson={createMonthlyPerson}
          savePerson={saveMonthlyPerson}
          saveBusy={saveBusy}
          companyId={companyId}
          monthlyLogs={monthlyLogs}
          refreshMonthlyLogs={refreshMonthlyLogs}
        />
      );
    if (screen === "monthly-documents")
      return (
        <IkAdvancedMonthly
          mode="kapanis"
          activeMainCompany={activeMainCompany}
        />
      );
    if (screen === "daily-entry")
      return (
        <SafeDailyEntry
          daily={daily}
          setDaily={setDaily}
          dailyEntries={dailyEntries}
          setDailyEntries={setDailyEntries}
          refreshDailyEntries={refreshDailyEntries}
          refreshDailyPeople={refreshDailyPeople}
          companyId={companyId}
          skills={skills}
          onCreateSkill={createSkillAndRefresh}
          range={dailyDateRange}
          setRange={updateDailyDateRange}
        />
      );
    if (screen === "daily-cards")
      return (
        <DailyCards
          daily={daily}
          setDaily={setDaily}
          companyId={companyId}
          skills={skills}
          onCreateSkill={createSkillAndRefresh}
          range={dailyDateRange}
          setRange={updateDailyDateRange}
        />
      );
    if (screen === "daily-weekly")
      return (
        <WeeklySummary
          daily={daily}
          dailyEntries={dailyEntries}
          range={dailyDateRange}
          setRange={updateDailyDateRange}
          skills={skills}
          weekOptions={dailyWeekOptions}
        />
      );
    if (screen === "daily-payments")
      return (
        <DailyPayments
          daily={daily}
          dailyEntries={dailyEntries}
          range={dailyDateRange}
          setRange={updateDailyDateRange}
          skills={skills}
        />
      );
    return null;
  };

  return (
    <div className="kyik-page notranslate" translate="no">
      <style>{IK_STYLE}</style>
      <main className="kyik-content">
        {notice ? <div className="kyik-save-notice kyik-load-notice">{notice}</div> : null}
        {renderScreen()}
      </main>
    </div>
  );
}

const IK_STYLE = `
.kyik-page{height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(0,1fr);background:#f4f7fb;color:#0f2344;overflow:hidden}
.kyik-page *{box-sizing:border-box}
.daily-weekly-list-print{display:none}
.kyik-content{min-width:0;overflow:auto;padding:18px 22px 24px}
.kyik-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}
.kyik-header span,.kyik-title-band span{font-size:12px;color:#64748b;font-weight:800}.kyik-header h1{font-size:24px;margin:4px 0 0;color:#061b3b}.kyik-header-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.kyik-screen,.kyik-main-stack{display:grid;gap:14px;min-width:0}.kyik-workspace.with-rail{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px;align-items:start}
.kyik-panel{background:#fff;border:1px solid #dce6f4;border-radius:8px;box-shadow:0 10px 24px rgba(15,35,68,.06);padding:14px;min-width:0}
.kyik-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid #e7eef8}
.kyik-panel h3{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;color:#102548}
.kyik-title-band{background:#fff;border:1px solid #dce6f4;border-radius:8px;padding:16px;display:flex;justify-content:space-between;gap:16px;align-items:center}.kyik-title-band h2{font-size:20px;margin:4px 0 0;color:#102548}
.kyik-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.kyik-stat-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.kyik-stat-grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}.kyik-stat-grid.six{grid-template-columns:repeat(6,minmax(0,1fr))}
.kyik-stat{min-height:82px;background:#fff;border:1px solid #dce6f4;border-radius:8px;padding:13px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 8px 18px rgba(15,35,68,.05)}
.kyik-stat span,.kyik-stat small{display:block;color:#64748b}.kyik-stat span{font-size:12px;font-weight:800}.kyik-stat strong{display:block;margin-top:6px;font-size:22px;color:#0f2344}.kyik-stat svg{color:#1d63ee}
.kyik-grid.two{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);gap:14px}
.kyik-form-grid{display:grid;gap:10px}.kyik-form-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.kyik-form-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.kyik-form-grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}.kyik-form-grid.six{grid-template-columns:repeat(6,minmax(0,1fr))}.kyik-form-grid.compact-filter{margin-bottom:10px}
.kyik-form-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.kyik-field{display:grid;gap:6px;align-content:start}.kyik-field.wide{grid-column:1/-1}.kyik-field span{font-size:12px;font-weight:800;color:#38506f}
.kyik-field input,.kyik-field select,.kyik-field textarea,.kyik-control-card input{width:100%;border:1px solid #d6e1f0;border-radius:8px;background:#fff;min-height:36px;padding:0 10px;color:#12213a;font:inherit}
.kyik-skill-select{display:grid;gap:6px}.kyik-skill-select>button{border:0;background:transparent;color:#1d63ee;font-size:12px;font-weight:900;text-align:left;cursor:pointer;padding:0}.kyik-skill-create{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 80px auto auto;gap:6px;align-items:center;border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px}.kyik-skill-create label{display:flex;gap:4px;align-items:center;font-size:12px;font-weight:800}.kyik-skill-create small{grid-column:1/-1;color:#be123c;font-weight:800}
.kyik-field textarea{min-height:72px;padding:9px 10px;resize:vertical}
.kyik-action-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.kyik-action-row?.top-actions{margin:0 0 10px}
.kyik-btn{min-height:36px;border:1px solid #d6e1f0;background:#fff;border-radius:8px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:800;color:#111827;cursor:pointer;white-space:nowrap}.kyik-btn.primary{background:#dbeafe;border-color:#93c5fd;color:#111827}.kyik-btn.primary:hover{background:#bfdbfe;border-color:#60a5fa;color:#111827}.kyik-btn.default:hover{border-color:#93b7f4;background:#eff6ff;color:#111827}.kyik-btn:disabled{background:#e5eefc;border-color:#cbd5e1;color:#111827;opacity:1;cursor:not-allowed}.kyik-btn span,.kyik-btn svg{color:inherit}
.kyik-badge{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:0 9px;border-radius:999px;background:#eaf2ff;color:#1d63ee;font-size:12px;font-weight:900}.kyik-badge.green{background:#dcfce7;color:#15803d}.kyik-badge.orange{background:#fff2d8;color:#b45309}.kyik-badge.blue{background:#eaf2ff;color:#1d63ee}
.kyik-table-wrap{overflow:auto;border:1px solid #e1e9f5;border-radius:8px;background:#fff;max-height:590px}.kyik-table{width:100%;min-width:900px;border-collapse:collapse;font-size:13px}.kyik-table th,.kyik-table td{padding:10px;border-bottom:1px solid #e9eff7;text-align:left;white-space:nowrap}.kyik-table th{position:sticky;top:0;background:#f8fbff;color:#30496f;font-size:12px;z-index:1}.kyik-empty-cell{text-align:center!important;color:#64748b;padding:30px!important}
.kyik-table tr.clickable{cursor:pointer}.kyik-table tr.clickable:hover td{background:#f8fbff}
.kyik-table-actions{display:flex;gap:6px}.kyik-table-actions .kyik-btn{min-height:30px;padding:0 8px}
.adjustment-bulk.kyik-workspace.with-rail{grid-template-columns:minmax(0,1fr)}
.kyik-adjustment-toolbar{display:grid;grid-template-columns:90px 120px 150px minmax(190px,1fr);gap:8px;align-items:center}.kyik-adjustment-toolbar input,.kyik-adjustment-toolbar select{min-height:34px;border:1px solid #d6e1f0;border-radius:8px;background:#fff;padding:0 10px;color:#12213a;font:inherit}
.kyik-adjustment-board{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:10px;align-items:start}
.kyik-adjustment-side{order:2;position:sticky;top:0;display:grid;gap:8px;border:1px solid #dce6f4;border-radius:8px;background:#f8fbff;padding:10px;min-width:0}.kyik-adjustment-person-name{display:block;text-align:center;color:#102548;font-size:17px!important;line-height:1.2}.kyik-adjustment-side>small{display:block;text-align:center;color:#64748b;font-weight:800}.kyik-adjustment-side div{border:1px solid #e1e9f5;border-radius:8px;background:#fff;padding:8px}.kyik-adjustment-side span,.kyik-adjustment-side label span{display:block;color:#64748b;font-size:11px;font-weight:900}.kyik-adjustment-side b{display:block;margin-top:3px;color:#102548}.kyik-adjustment-side label{display:grid;gap:5px}.kyik-adjustment-side input,.kyik-adjustment-side select,.kyik-adjustment-side textarea,.kyik-holiday-mini input{width:100%;min-height:34px;border:1px solid #d6e1f0;border-radius:8px;background:#fff;padding:0 8px;color:#12213a;font:inherit}.kyik-adjustment-side textarea{min-height:58px;padding:8px;resize:vertical}.kyik-adjustment-month-totals{display:grid!important;grid-template-columns:1fr 1fr;gap:4px}.kyik-adjustment-month-totals span{grid-column:1/-1}.kyik-adjustment-month-totals b{font-size:11px}
.kyik-holiday-mini{display:grid!important;gap:6px;background:#fff7ed!important;border-color:#fed7aa!important}.kyik-holiday-mini strong{color:#9a3412;font-size:12px}
.kyik-live-adjustment-table-wrap{order:1;overflow:auto;border:1px solid #e1e9f5;border-radius:8px;background:#fff;max-height:calc(100vh - 350px)}
.kyik-live-adjustment-table{width:100%;min-width:920px;border-collapse:separate;border-spacing:0;font-size:12px}.kyik-live-adjustment-table th,.kyik-live-adjustment-table td{border-bottom:1px solid #e9eff7;padding:7px 8px;text-align:left;vertical-align:middle;white-space:nowrap}.kyik-live-adjustment-table th{position:sticky;top:0;z-index:3;background:#edf5ff;color:#30496f;font-size:11px;font-weight:900}.kyik-live-adjustment-table tr:nth-child(even) td{background:#fbfdff}.kyik-live-adjustment-table tr.selected td{background:#eaf2ff}.kyik-live-adjustment-table tr:hover td{background:#f5f9ff}.kyik-live-adjustment-table .sticky-person{position:sticky;left:0;z-index:2;background:#fff;min-width:220px;box-shadow:1px 0 0 #e1e9f5}.kyik-live-adjustment-table tr:nth-child(even) .sticky-person{background:#fbfdff}.kyik-live-adjustment-table tr.selected .sticky-person{background:#eaf2ff}.kyik-live-adjustment-table .sticky-person strong,.kyik-live-adjustment-table .sticky-person small{display:block;text-align:center}.kyik-live-adjustment-table .sticky-person small{margin-top:2px;color:#64748b;font-size:10px;font-weight:800}.kyik-live-adjustment-table input,.kyik-live-adjustment-table select{width:100%;min-height:32px;border:1px solid #d6e1f0;border-radius:8px;background:#fff;padding:0 7px;color:#12213a;font:inherit}.kyik-live-adjustment-table td:nth-child(2),.kyik-live-adjustment-table td:nth-child(3),.kyik-live-adjustment-table td:nth-child(4),.kyik-live-adjustment-table td:nth-child(5),.kyik-live-adjustment-table td:nth-child(6){min-width:118px}.kyik-live-adjustment-table small{display:block;margin-top:3px;color:#64748b;font-size:10px;font-weight:800}.kyik-live-adjustment-table b.positive{color:#15803d}.kyik-live-adjustment-table b.negative{color:#b91c1c}.kyik-live-adjustment-table .kyik-btn{min-height:30px;padding:0 9px;font-size:11px}
.kyik-inline-action{min-height:30px;border:1px solid #d6e1f0;background:#fff;border-radius:8px;padding:0 9px;color:#16335d;font-weight:900;cursor:pointer}.kyik-inline-action:hover{border-color:#93b7f4;color:#1d63ee}
.kyik-person-rail{position:sticky;top:0;background:#fff;border:1px solid #dce6f4;border-radius:8px;padding:12px;box-shadow:0 10px 24px rgba(15,35,68,.06)}
.kyik-person-rail-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px}.kyik-person-rail-head span{color:#64748b;font-size:12px}.kyik-person-list-search{height:36px;border:1px solid #d6e1f0;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 10px;margin-bottom:10px}.kyik-person-list-search.compact{margin-bottom:8px}.kyik-person-list-search input{border:0;outline:0;width:100%;font:inherit}
.kyik-person-list{display:grid;gap:8px;max-height:calc(100vh - 250px);overflow:auto}.kyik-person-row{border:1px solid #dce6f4;background:#fff;border-radius:8px;min-height:62px;padding:9px;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;text-align:left;cursor:pointer}.kyik-person-row?.active{background:#eaf2ff;border-color:#1d63ee}.kyik-person-row strong,.kyik-person-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kyik-person-row small{color:#64748b;margin-top:3px}
.kyik-avatar{width:36px;height:36px;border-radius:999px;background:#eaf2ff;color:#1d63ee;display:grid;place-items:center;font-weight:900}.kyik-avatar.large{width:54px;height:54px;margin:auto}
.kyik-inline-filter-row{display:grid;gap:8px;margin-bottom:10px}.kyik-inline-filter-row select{width:100%;min-height:36px;border:1px solid #d6e1f0;border-radius:8px;background:#fff;padding:0 10px;color:#12213a;font:inherit}
.kyik-contract-card,.kyik-payroll-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.kyik-contract-card div,.kyik-payroll-summary div{border:1px solid #e1e9f5;border-radius:8px;padding:12px;background:#f9fbff}.kyik-contract-card span,.kyik-contract-card small,.kyik-payroll-summary span{display:block;color:#64748b;font-size:12px}.kyik-contract-card strong,.kyik-payroll-summary strong{display:block;margin:5px 0;color:#102548}.kyik-payroll-summary .total{background:#eaf2ff;border-color:#9cc0ff}
.kyik-selected-line{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f8fbff;border:1px solid #e1e9f5;border-radius:8px;padding:10px;margin-bottom:12px}.kyik-selected-line span{color:#64748b}
.kyik-adjustment-context{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:12px}.kyik-adjustment-context div{border:1px solid #e1e9f5;border-radius:8px;background:#f9fbff;padding:10px}.kyik-adjustment-context span{display:block;color:#64748b;font-size:12px;font-weight:800}.kyik-adjustment-context strong{display:block;margin-top:4px;color:#102548}.kyik-adjustment-context .total{background:#eaf2ff;border-color:#9cc0ff}
.kyik-info-line{margin-top:10px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:9px 11px;font-weight:800;line-height:1.35}.kyik-holiday-inline{display:grid;grid-template-columns:180px minmax(220px,1fr) auto;gap:10px;align-items:end;margin:10px 0 12px;padding:10px;border:1px solid #e1e9f5;border-radius:8px;background:#f8fbff}.kyik-holiday-inline .kyik-btn{min-height:36px}.kyik-error-line{margin-top:10px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;padding:9px 11px;font-weight:900}.kyik-bulk-pay-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;align-items:end}.kyik-bulk-pay-actions{display:flex;gap:8px;flex-wrap:wrap}.kyik-money-input{width:100px;min-height:32px;border:1px solid #d6e1f0;border-radius:8px;padding:0 8px;color:#12213a}.kyik-payment-log{display:grid;gap:8px;max-height:220px;overflow:auto}.kyik-log-row{display:grid;grid-template-columns:180px minmax(0,1fr);gap:10px;border:1px solid #e1e9f5;border-radius:8px;background:#f9fbff;padding:10px}.kyik-log-row strong{color:#102548}.kyik-log-row span{color:#38506f}
.kyik-week-picker{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:10px 0 12px}.kyik-week-picker button{border:1px solid #d6e1f0;background:#fff;border-radius:8px;padding:9px 10px;text-align:left;cursor:pointer;color:#102548}.kyik-week-picker button.active{border-color:#1d63ee;background:#eaf2ff;box-shadow:inset 0 0 0 1px #1d63ee}.kyik-week-picker strong,.kyik-week-picker span{display:block}.kyik-week-picker strong{font-size:12px}.kyik-week-picker span{margin-top:4px;color:#64748b;font-size:11px;font-weight:800}
.kyik-task-list{display:grid;gap:0}.kyik-task-list div{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e9eff7}.kyik-task-list span{color:#64748b}
.kyik-upload-box{margin-top:12px;border:1px dashed #9cc0ff;border-radius:8px;min-height:120px;display:grid;place-items:center;align-content:center;gap:6px;color:#64748b;text-align:center;background:#f8fbff}.kyik-upload-box strong{color:#102548}
.kyik-daily-filter{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px}.kyik-daily-filter .kyik-field{width:150px}.kyik-daily-filter>strong{margin-left:auto;color:#0f3f89;font-size:18px}
.kyik-shift-mode{display:flex;border:1px solid #d6e1f0;border-radius:8px;overflow:hidden;background:#fff;min-height:38px}.kyik-shift-mode button{border:0;border-right:1px solid #d6e1f0;background:#fff;color:#475569;display:inline-flex;align-items:center;gap:7px;padding:0 12px;font-weight:900;cursor:pointer}.kyik-shift-mode button:last-child{border-right:0}.kyik-shift-mode button.active.day{background:#f97316;color:#fff}.kyik-shift-mode button.active.night{background:#2563eb;color:#fff}
.kyik-shift-banner{display:flex;align-items:center;gap:10px;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-weight:800}.kyik-shift-banner span{color:#475569;font-weight:700}.kyik-shift-banner.day{border:1px solid #fed7aa;background:#fff7ed;color:#c2410c}.kyik-shift-banner.night{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8}
.kyik-save-notice{background:#ecfdf5;color:#15803d;border:1px solid #bbf7d0;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-weight:800}
.kyik-load-notice{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
.kyik-daily-entry-grid{display:grid;grid-template-columns:320px minmax(0,1fr) 310px;gap:12px;align-items:start}.kyik-section-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:900;margin-bottom:8px}
.kyik-daily-left,.kyik-daily-right,.kyik-daily-table-shell{min-width:0}.kyik-daily-left{display:grid;gap:8px;max-height:calc(100vh - 325px);overflow:auto;padding-right:4px}
.kyik-daily-person{border:1px solid #dce6f4;background:#fff;border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}.kyik-daily-person.active{border-color:#1d63ee;background:#eaf2ff}.kyik-daily-person.removed{opacity:.55}.kyik-daily-person strong,.kyik-daily-person small,.kyik-daily-person em{display:block}.kyik-daily-person strong{line-height:1.3}.kyik-daily-person small{color:#64748b;margin-top:4px;line-height:1.35}.kyik-daily-person em{margin-top:5px;color:#b91c1c;font-size:11px;font-style:normal;font-weight:900}.kyik-mini-buttons{display:grid;gap:6px}.kyik-mini-buttons button{min-width:58px;height:32px;border:1px solid #d6e1f0;background:#fff;border-radius:8px;display:grid;place-items:center;cursor:pointer;font-size:11px;font-weight:900;padding:0 8px}
.kyik-daily-scroll{overflow:auto;border:1px solid #e1e9f5;border-radius:8px;max-height:calc(100vh - 305px)}.kyik-daily-table-clean{border-collapse:separate;border-spacing:0;min-width:1050px;width:max-content;background:#fff}.kyik-daily-table-clean th,.kyik-daily-table-clean td{padding:8px;border-bottom:1px solid #e9eff7;text-align:center;white-space:nowrap}.kyik-daily-table-clean th{position:sticky;top:0;background:#f8fbff;z-index:3}.kyik-daily-table-clean th span,.kyik-daily-table-clean th small{display:block}.kyik-daily-table-clean th small{font-size:10px;color:#64748b;line-height:1.35}.kyik-daily-table-clean .sticky-name{position:sticky;left:0;background:#fff;z-index:4;text-align:left;min-width:145px}.kyik-daily-table-clean th.sticky-name{background:#f8fbff;z-index:5}.kyik-daily-table-clean tr.selected td{background:#eaf2ff}.kyik-daily-table-clean .sticky-name button{border:0;background:transparent;font-weight:900;color:#102548;cursor:pointer}
.kyik-daily-table-clean tbody tr:not(.kyik-daily-group-row):nth-child(odd) td{background:#fbfdff}.kyik-daily-table-clean .sticky-name button{display:grid;gap:2px;text-align:left}.kyik-daily-table-clean .sticky-name small{font-size:10px;color:#64748b;font-weight:800}.kyik-row-warning{color:#b91c1c!important}.kyik-daily-table-clean tr.wage-missing td{box-shadow:inset 0 1px 0 #fee2e2}.kyik-daily-group-row td{background:#e6f0fb!important;border-top:2px solid #bfd4ee;border-bottom:2px solid #bfd4ee!important}.kyik-daily-group-row .sticky-name button{color:#0f3f89;text-transform:uppercase;letter-spacing:.02em}.kyik-daily-table-clean .highlight-date{background:#fff7ed!important;box-shadow:inset 0 0 0 1px #fdba74}.active-shift-count{font-size:12px!important;color:#0f2344!important;font-weight:900!important}.kyik-daily-summary{border-top:1px solid #e2e8f0;margin-top:4px;padding-top:8px;display:grid;gap:5px}.kyik-daily-summary button{width:100%;border:1px solid #e2e8f0;background:#fff;border-radius:7px;padding:6px;display:grid;grid-template-columns:58px repeat(5,max-content);gap:6px;align-items:center;text-align:left;cursor:pointer;font-size:11px}.kyik-daily-summary button.active{border-color:#f97316;background:#fff7ed}.kyik-daily-summary span{font-weight:900;color:#0f172a}.kyik-daily-summary b{font-size:10px;color:#334155}
.shift-pair{display:inline-grid;grid-template-columns:48px 1px 48px;gap:10px;align-items:center}.shift-pair i{display:block;width:1px;height:30px;background:#cbd5e1}.shift{min-width:48px;height:36px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-size:11px;font-weight:900}.shift.mode-active{transform:scale(1.06)}.shift:disabled{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0;cursor:not-allowed;transform:none}.shift.day.on{background:#f97316;border-color:#f97316;color:#fff}.shift.night.on{background:#2563eb;border-color:#2563eb;color:#fff}
.kyik-control-card{position:sticky;top:0;background:#fff;border:1px solid #dce6f4;border-radius:8px;padding:14px;text-align:center}.kyik-control-card h3{margin:8px 0 2px}.kyik-control-card p{margin:0 0 12px;color:#64748b}.kyik-control-card div{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #e9eff7;text-align:left}.kyik-control-card div span,.kyik-control-card label span{color:#64748b}.kyik-control-card div.total strong{color:#1d63ee;font-size:18px}.kyik-control-card label{display:grid;text-align:left;gap:6px;margin-top:10px}.kyik-control-card .kyik-action-row?.slim{justify-content:stretch}.kyik-control-card .kyik-action-row?.slim .kyik-btn{flex:1}
.kyik-control-card input.missing-wage{border-color:#ef4444;background:#fef2f2}.kyik-field-warning{color:#b91c1c;font-size:11px;font-weight:900}
.kyik-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.42);display:grid;place-items:center;z-index:1000;padding:20px}.kyik-modal{width:min(680px,100%);background:#fff;border:1px solid #dce6f4;border-radius:8px;box-shadow:0 24px 70px rgba(15,23,42,.28);padding:16px}.kyik-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e7eef8}.kyik-modal-head h3{margin:0}.kyik-modal-head button{width:34px;height:34px;border:1px solid #d6e1f0;background:#fff;border-radius:8px;display:grid;place-items:center;cursor:pointer}.kyik-checkline{display:flex;align-items:center;gap:8px;font-weight:900;color:#102548}.kyik-checkline input{width:18px;height:18px}.kyik-excel-review{width:min(1180px,100%);max-height:88vh;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:10px}.kyik-excel-review-stats,.kyik-excel-review-actions{display:flex;gap:8px;flex-wrap:wrap}.kyik-excel-review-stats span{border:1px solid #dbeafe;background:#f8fbff;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:900;color:#334155}.kyik-excel-review-stats b{color:#0f3f89}.kyik-excel-review-table{overflow:auto;border:1px solid #e2e8f0;border-radius:8px}.kyik-excel-review-table table{width:100%;border-collapse:collapse;font-size:12px}.kyik-excel-review-table th{position:sticky;top:0;background:#edf5ff;color:#24466f;text-align:left;padding:8px;border-bottom:1px solid #cfe0f5;z-index:1}.kyik-excel-review-table td{padding:7px 8px;border-bottom:1px solid #eef2f7;vertical-align:middle}.kyik-excel-review-table small{display:block;color:#64748b;font-weight:800}.kyik-excel-review-table.matrix th:first-child,.kyik-excel-review-table.matrix td:first-child{position:sticky;left:0;z-index:2;background:#fff;min-width:190px}.kyik-excel-review-table.matrix th:first-child{z-index:3;background:#edf5ff}.kyik-excel-review-table.matrix th:not(:first-child){min-width:118px;text-align:center}.kyik-excel-review-table.matrix td.excel-cell{min-width:118px;padding:6px}.kyik-excel-review-table.matrix td>em{display:block;margin-top:3px;color:#b45309;font-size:10px;font-weight:900}.excel-empty-cell{text-align:center;color:#94a3b8}.kyik-excel-cell-top{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:5px}.kyik-excel-cell-top label{display:flex;gap:4px;align-items:center;font-size:10px;font-weight:900}.kyik-excel-cell-top span{font-size:10px;color:#64748b;font-weight:900}.kyik-excel-review-table .excel-add{background:#f0fdf4}.kyik-excel-review-table .excel-remove{background:#fff1f2}.kyik-excel-review-table .excel-change{background:#eff6ff}.kyik-excel-review-table .excel-control{background:#fffbeb}.kyik-excel-result{display:flex;align-items:center;gap:5px}.kyik-excel-result strong{font-size:10px;color:#64748b}.kyik-excel-result b{width:26px;height:24px;border:1px solid #d7e2f0;border-radius:7px;display:grid;place-items:center;color:#94a3b8;background:#fff}.kyik-excel-result b.on{background:#f97316;border-color:#f97316;color:#fff}.kyik-excel-action{font-weight:900;color:#0f2344}
.kyik-safe-summary.cyan{background:#ecfeff;border-color:#67e8f9}.kyik-safe-pool-list button.has-work{background:#f0fdf4}.kyik-safe-pool-list button.checked{border-color:#22c55e;background:#ecfdf5;box-shadow:inset 4px 0 0 #22c55e}.kyik-safe-pool-list button.missing-work{opacity:.72}.kyik-safe-pool-list button.missing-work em{color:#b45309}.kyik-safe-pool-list button.checked em{color:#15803d}.kyik-safe-row-checked{display:inline-flex;align-items:center;gap:6px;margin:4px 0 0;color:#15803d;font-size:11px;font-weight:900}.kyik-safe-row-checked svg{min-width:14px}.kyik-safe-check-row{margin:4px 0 6px}.kyik-safe-row-check-button{display:inline-flex;align-items:center;gap:6px;border:1px solid #c7d2fe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer}.kyik-safe-row-check-button.checked{background:#dcfce7;border-color:#22c55e;color:#166534}.kyik-safe-row-check-button svg{min-width:14px}.kyik-excel-review-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:9px 11px;font-size:12px;font-weight:900}.kyik-excel-review-table.matrix tbody tr{border-bottom:2px solid #dbe6f4}.kyik-excel-review-table.matrix tbody tr:nth-child(even) td{background:#fbfdff}.kyik-excel-review-table.matrix tbody tr:nth-child(even) td:first-child{background:#fbfdff}.kyik-excel-review-table .excel-same{background:#f8fafc}.kyik-safe-table-wrap tbody tr.kyik-safe-row td{border-top:1px solid #edf2f7;border-bottom:1px solid #edf2f7}.kyik-safe-table-wrap tbody tr.kyik-safe-row td:first-child{border-left:4px solid #cbd5e1}.kyik-safe-table-wrap tbody tr.kyik-safe-row.checked td:first-child{border-left-color:#22c55e}.kyik-safe-table-wrap tbody tr.kyik-safe-row.selected-entry.unchecked td:first-child{border-left-color:#f97316}
.daily-card-layout .kyik-person-rail{max-height:calc(100vh - 185px);overflow:auto}.daily-card-layout .kyik-table{min-width:760px}
.kyik-daily-person.has-work{border-color:#86efac;background:#f0fdf4}.kyik-daily-person.has-work small:after{content:" · kayıt var";color:#15803d;font-weight:900}
.kyik-cell-input{width:96px;min-height:32px;border:1px solid #d6e1f0;border-radius:8px;padding:0 8px}.kyik-print-pick-info{display:inline-flex;align-items:center;min-height:36px;color:#475569;font-weight:900}.kyik-slip-grid{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:10px}.kyik-slip{border:1px solid #dce6f4;border-radius:8px;background:#fff;padding:12px}.kyik-slip-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px}.kyik-slip-head strong{display:block;min-width:0;line-height:1.25}.kyik-slip-select{display:inline-flex;align-items:center;gap:5px;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d4ed8;padding:3px 8px;font-size:11px;font-weight:900;white-space:nowrap}.kyik-slip-select input{width:14px;height:14px;margin:0}.kyik-slip>span{display:block;color:#64748b;margin:3px 0 10px}.kyik-slip-line{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid #e9eff7}.kyik-slip .total b{color:#1d63ee;font-size:18px}.kyik-empty-box{border:1px dashed #cbd5e1;border-radius:8px;padding:24px;text-align:center;color:#64748b;grid-column:1/-1}
.monthly-print-page{width:100%;page-break-after:always;break-after:page}.monthly-print-page:last-child{page-break-after:auto;break-after:auto}.monthly-print-title{text-align:center;font-size:15px;font-weight:900;margin-bottom:1mm;color:#111;letter-spacing:.03em}.monthly-print-subtitle{text-align:center;font-size:9px;font-weight:700;margin-bottom:2mm;color:#444}.monthly-slip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,1fr);gap:3mm 4mm}.monthly-slip-card{border:1px solid #111;background:#fff;min-height:55mm;padding:2.5mm 3mm;font-size:9.5px;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column}.monthly-slip-card h4{margin:0 0 1.5mm;background:#fde047;color:#111;padding:1.5mm;text-align:center;font-size:11px}.monthly-slip-card>strong{display:block;text-align:center;margin-bottom:1mm}.monthly-slip-card div{display:flex;justify-content:space-between;gap:4px;border-top:1px solid #111;padding:1.2mm 0}.monthly-slip-card .big b{font-size:13px;color:#0f2344}.monthly-slip-card small{display:block;margin-top:auto;color:#334155;font-size:8px;line-height:1.25}.monthly-control-page,.daily-control-page{margin-top:14px;page-break-before:always}.monthly-control-page h3,.daily-control-page h3{margin:0 0 8px}.monthly-control-page table,.daily-control-page table,.daily-slip-card table{width:100%;border-collapse:collapse}.monthly-control-page th,.monthly-control-page td,.daily-control-page th,.daily-control-page td,.daily-slip-card th,.daily-slip-card td{border:1px solid #111;padding:4px;text-align:left}.monthly-control-page tfoot td,.daily-control-page tfoot td{font-weight:900}
.daily-print-page{width:100%;page-break-after:always;break-after:page}.daily-print-page:last-child{page-break-after:auto;break-after:auto}.daily-print-title{text-align:center;font-size:14px;font-weight:900;margin-bottom:.6mm;color:#111;letter-spacing:.03em}.daily-print-subtitle{text-align:center;font-size:8.5px;font-weight:700;margin-bottom:1mm;color:#444}.daily-slip-print-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(5,48mm);gap:1mm 3mm;align-items:stretch}.daily-slip-card{border:1.5px solid #111;height:48mm;padding:1.5mm 2.5mm;background:#fff;color:#111;page-break-inside:avoid;break-inside:avoid;font-size:8.8px;display:flex;flex-direction:column;overflow:hidden}.daily-slip-card h4{margin:0 0 1px;text-align:center;font-size:9px}.daily-slip-card>strong{display:block;font-size:10px;line-height:1.05}.daily-slip-card>span{display:block;margin:1px 0;font-size:8px}.daily-slip-card>b{display:block;margin-bottom:1px;font-size:8px}.daily-slip-card table{font-size:8px}.daily-slip-card th,.daily-slip-card td{padding:1px 2.5px}.daily-slip-note{margin-top:1px;padding-top:1px;border-top:1px dashed #777;font-size:7.5px;line-height:1.1;min-height:5mm}.daily-slip-total{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;border-top:1.5px solid #111;padding-top:1px}.daily-slip-total span{font-size:9px;font-weight:800}.daily-slip-total strong{font-size:20px;line-height:.95;color:#dc2626}.daily-slip-page-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:2mm;padding:2mm 3mm;border:1.5px solid #111;background:#f8fafc;font-size:9px}.daily-slip-page-summary span{display:flex;justify-content:space-between;gap:4px}.daily-slip-page-summary strong{color:#b91c1c;font-size:11px}.daily-control-grand-total td{background:#eef6ff;font-size:11px;font-weight:900}
.weekly-print-page{width:100%;page-break-after:auto;break-after:auto}.weekly-print-table{width:100%;border-collapse:collapse;font-size:10px}.weekly-print-table th,.weekly-print-table td{border:1px solid #111;padding:4px;text-align:left}.weekly-print-table tfoot td{font-weight:900}
.daily-slip-print-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(5,52mm);gap:2.5mm 5mm}.daily-slip-card{position:relative;height:52mm;padding:2mm 3mm;font-size:8.6px;border:1.2px dashed #111}.daily-slip-card h4{font-size:8px;font-weight:800}.daily-slip-card>strong{font-size:14px;line-height:1.1;text-align:center}.daily-slip-card table{font-size:8.2px}.daily-slip-card th,.daily-slip-card td{padding:1.4px 2.5px}.daily-slip-note{display:none}.daily-slip-total{border-top:1.4px solid #111;padding-top:1.5mm}.daily-slip-total span{font-size:9px}.daily-slip-total strong{font-size:24px;color:#111}.daily-slip-page-summary,.daily-control-page{display:none}.weekly-print-page{height:auto;max-height:285mm;overflow:hidden}.weekly-print-table{font-size:8.8px}.weekly-print-table th,.weekly-print-table td{padding:2.6px 3px}
@media(max-width:1400px){.kyik-workspace.with-rail,.adjustment-bulk.kyik-workspace.with-rail,.kyik-adjustment-board,.kyik-daily-entry-grid,.kyik-grid.two{grid-template-columns:1fr}.kyik-person-rail,.kyik-control-card,.kyik-adjustment-side{position:static}.kyik-stat-grid,.kyik-stat-grid.three,.kyik-stat-grid.five,.kyik-stat-grid.six,.kyik-form-grid.three,.kyik-form-grid.four,.kyik-form-grid.five,.kyik-form-grid.six,.kyik-contract-card,.kyik-payroll-summary,.kyik-slip-grid,.kyik-adjustment-context{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.kyik-page{height:auto;min-height:calc(100vh - 58px)}.kyik-content{padding:14px}.kyik-stat-grid,.kyik-stat-grid.three,.kyik-stat-grid.five,.kyik-stat-grid.six,.kyik-form-grid.three,.kyik-form-grid.four,.kyik-form-grid.five,.kyik-form-grid.six,.kyik-contract-card,.kyik-payroll-summary,.kyik-slip-grid,.monthly-slip-grid,.daily-slip-print-grid,.kyik-bulk-pay-grid,.kyik-log-row,.kyik-adjustment-context,.kyik-holiday-inline,.kyik-adjustment-toolbar{grid-template-columns:1fr}.kyik-header{flex-direction:column}.kyik-daily-filter>strong{margin-left:0}}
@media print{
  @page{size:A4 portrait;margin:6mm}
  body *{visibility:hidden!important}
  .printable,.printable *{visibility:visible!important}
  .printable{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;border:0!important;box-shadow:none!important;padding:0!important;background:#fff!important}
  .printable.daily-print,.printable.monthly-print,.printable.weekly-print{position:absolute!important;left:0!important;top:0!important;width:198mm!important;max-width:198mm!important;margin:0!important}
  .kyik-header,.kyik-person-rail,.kyik-filter-panel,.kyik-daily-filter,.compact-filter,.kyik-action-row,.kyik-panel-head{display:none!important}
  .daily-print-page{page-break-after:always!important;break-after:page!important}
  .daily-print-page:last-child{page-break-after:auto!important;break-after:auto!important}
  .daily-print-page{width:198mm!important;height:285mm!important;overflow:hidden!important;box-sizing:border-box!important}
  .daily-print-title{font-size:14px!important;margin-bottom:.6mm!important}
  .daily-print-subtitle{font-size:8.5px!important;margin-bottom:1mm!important}
  .daily-slip-print-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,48mm)!important;gap:1mm 3mm!important;align-items:stretch!important}
  .daily-slip-card{height:48mm!important;padding:1.5mm 2.5mm!important;font-size:8.8px!important;page-break-inside:avoid!important;break-inside:avoid!important;overflow:hidden!important}
  .daily-slip-note{min-height:5mm!important}
  .daily-slip-total strong{font-size:20px!important}
  .daily-slip-page-summary{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:2mm!important;margin-top:2mm!important;padding:2mm 3mm!important}
  .monthly-print-page{page-break-after:always!important;break-after:page!important}
  .monthly-print-page:last-child{page-break-after:auto!important;break-after:auto!important}
  .monthly-print-title{font-size:15px!important;margin-bottom:1mm!important}
  .monthly-print-subtitle{font-size:9px!important;margin-bottom:2mm!important}
  .monthly-slip-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;grid-template-rows:repeat(4,1fr)!important;gap:3mm 4mm!important}
  .monthly-slip-card{min-height:55mm!important;padding:2.5mm 3mm!important;font-size:9.5px!important;page-break-inside:avoid!important;break-inside:avoid!important}
  .monthly-control-page,.daily-control-page{page-break-before:always!important}
  .daily-control-page{width:198mm!important;height:285mm!important;margin:0!important;page-break-after:always!important;break-after:page!important;overflow:hidden!important;font-size:9px!important;box-sizing:border-box!important}
  .daily-control-page:last-child{page-break-after:auto!important;break-after:auto!important}
  .daily-control-page table{width:100%!important;border-collapse:collapse!important;font-size:9px!important}
  .daily-control-page th,.daily-control-page td{padding:2.5px 3px!important}
  .daily-weekly-list-print table{width:100%!important;border-collapse:collapse!important;font-size:9px!important;margin-bottom:5mm!important}
  .daily-weekly-list-print th,.daily-weekly-list-print td{border:1px solid #111!important;padding:3px!important;text-align:left!important}
  .daily-print-page{width:198mm!important;height:285mm!important;padding:0!important;overflow:hidden!important}
  .daily-print-subtitle{font-size:8px!important;margin-bottom:1.5mm!important}
  .daily-slip-print-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,52mm)!important;gap:2.5mm 5mm!important}
  .daily-slip-card{height:52mm!important;padding:2mm 3mm!important;border:1.2px dashed #111!important;font-size:8.6px!important;overflow:hidden!important}
  .daily-slip-card h4{font-size:8px!important;margin:0 0 .8mm!important}
  .daily-slip-card>strong{font-size:14px!important;line-height:1.1!important;text-align:center!important;margin-bottom:.8mm!important;text-transform:uppercase!important}
  .daily-slip-card>span,.daily-slip-card>b{font-size:8px!important;margin:.4mm 0!important}
  .daily-slip-card table{font-size:8.2px!important}
  .daily-slip-card th,.daily-slip-card td{padding:1.4px 2.5px!important}
  .daily-slip-note,.daily-slip-page-summary,.daily-control-page{display:none!important}
  .daily-slip-total{border-top:1.4px solid #111!important;padding-top:1.5mm!important}
  .daily-slip-total span{font-size:9px!important}
  .daily-slip-total strong{font-size:24px!important;color:#111!important;line-height:1!important}
  .weekly-print-page{width:198mm!important;height:auto!important;max-height:285mm!important;overflow:hidden!important;page-break-after:auto!important;break-after:auto!important}
  .weekly-print-table{font-size:8.6px!important;line-height:1.12!important}
  .weekly-print-table th,.weekly-print-table td{padding:2.4px 3px!important}
  html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
  .printable{height:auto!important;min-height:0!important;overflow:visible!important;page-break-after:auto!important;break-after:auto!important}
  .printable.daily-print{width:198mm!important;max-width:198mm!important}
  .daily-print-page{height:auto!important;min-height:0!important;max-height:277mm!important;padding:0!important;overflow:hidden!important;page-break-inside:avoid!important;break-inside:avoid!important}
  .daily-print-page:last-child{page-break-after:auto!important;break-after:auto!important}
  .daily-slip-print-grid{grid-template-rows:repeat(5,50mm)!important;gap:2mm 5mm!important}
  .daily-slip-card{height:50mm!important;padding:1.7mm 3mm!important}
  .daily-slip-total{padding-top:1mm!important}
  .daily-slip-total strong{font-size:23px!important}
  .daily-slip-print-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,48mm)!important;gap:3.5mm 7mm!important}
  .daily-slip-card{height:48mm!important;padding:1.7mm 3mm 4mm!important;border:1.2px dashed #111!important}
  .daily-slip-total{margin-top:auto!important;margin-bottom:1.8mm!important;padding-top:1mm!important;border-top:1.4px solid #111!important}
  .daily-slip-total strong{font-size:23px!important}
}
`;
