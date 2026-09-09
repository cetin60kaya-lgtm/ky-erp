import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Moon,
  RefreshCw,
  Search,
  Sun,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import IkPage from "./IkPage";
import { getGunlukDurum, getGunlukPersonel } from "../../services/ikApi";
import "./gunluk-operasyon.css";

const SUBVIEW_MAP = {
  "gunluk-giris": "gunluk-personel",
  "personel-kartlari": "gunluk-personel-kartlari",
  "haftalik-ozet": "gun-haftalik-ozet",
  "odeme-fisleri": "gunluk-odeme-fisleri",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateOnly(date = new Date()) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function parseDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(value, amount) {
  const date = parseDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return dateOnly(date);
}

function startOfWeek(value) {
  const date = parseDate(value);
  if (!date) return "";
  const weekday = date.getDay() || 7;
  return addDays(value, 1 - weekday);
}

function daysBetween(start, end) {
  const rows = [];
  for (let cursor = start; cursor && cursor <= end; cursor = addDays(cursor, 1)) rows.push(cursor);
  return rows;
}

function monthStart(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) + "-01" : "";
}

function monthEnd(value) {
  const start = parseDate(monthStart(value));
  if (!start) return "";
  return dateOnly(new Date(start.getFullYear(), start.getMonth() + 1, 0));
}

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function shortDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  }).format(date);
}

function compactDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(date);
}

function longDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(date);
}

function monthLabel(value) {
  const date = parseDate(monthStart(value));
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(date);
}

function personName(row = {}) {
  return String(
    row.fullName || row.name || row.adSoyad || row.employeeName || row.personName || "",
  ).trim() || "Personel";
}

function personRole(row = {}) {
  return String(
    row.qualification || row.role || row.skillName || row.position || row.vasif || "Günlük Personel",
  ).trim();
}

function personDayRate(row = {}) {
  return numberValue(row.dayRate ?? row.dayWage ?? row.daytimeWage ?? row.gunduzUcreti);
}

function personNightRate(row = {}) {
  return numberValue(row.nightRate ?? row.nightWage ?? row.nighttimeWage ?? row.geceUcreti);
}

function rowDate(row = {}) {
  return String(row.workDate || row.date || row.tarih || "").slice(0, 10);
}

function rowPersonId(row = {}) {
  return String(
    row.employeeId || row.personId || row.dailyEmployeeId || row.personnelId || row.personelId || "",
  );
}

function flagValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLocaleUpperCase("tr-TR");
  return ["1", "TRUE", "EVET", "YES", "VAR", "GÜNDÜZ", "GUNDUZ", "GECE"].includes(normalized);
}

function firstAmount(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function summarize(rows = [], peopleById = new Map()) {
  const map = new Map();
  rows.forEach((row, rowIndex) => {
    const date = rowDate(row);
    if (!date) return;

    const employeeId = rowPersonId(row);
    const person = peopleById.get(employeeId) || row.person || row.employee || {
      fullName: row.employeeName || row.personName || row.name,
      role: row.role || row.qualification,
    };
    const day = flagValue(row.day ?? row.dayShift);
    const night = flagValue(row.night ?? row.nightShift);
    const explicitAmount = firstAmount(row.totalAmount, row.amount, row.paymentAmount, row.tutar);
    const amount = explicitAmount !== null
      ? explicitAmount
      : (day ? numberValue(row.dayWage ?? personDayRate(person)) : 0)
        + (night ? numberValue(row.nightWage ?? personNightRate(person)) : 0);

    const current = map.get(date) || {
      date,
      dayCount: 0,
      nightCount: 0,
      total: 0,
      entriesByPerson: new Map(),
    };
    const personKey = employeeId || personName(person) + "-" + rowIndex;
    const existing = current.entriesByPerson.get(personKey) || {
      employeeId,
      person,
      day: false,
      night: false,
      amount: 0,
    };

    if (day) current.dayCount += 1;
    if (night) current.nightCount += 1;
    current.total += amount;
    current.entriesByPerson.set(personKey, {
      ...existing,
      person: Object.keys(existing.person || {}).length ? existing.person : person,
      day: existing.day || day,
      night: existing.night || night,
      amount: existing.amount + amount,
    });
    map.set(date, current);
  });

  return new Map(
    [...map.entries()].map(([date, row]) => [
      date,
      {
        date,
        dayCount: row.dayCount,
        nightCount: row.nightCount,
        total: row.total,
        entries: [...row.entriesByPerson.values()],
        peopleCount: row.entriesByPerson.size,
      },
    ]),
  );
}

function collectSummary(days, daily) {
  return days.reduce(
    (acc, date) => {
      const row = daily.get(date);
      if (!row) return acc;
      acc.day += row.dayCount;
      acc.night += row.nightCount;
      acc.total += row.total;
      acc.activeDays += row.peopleCount > 0 ? 1 : 0;
      row.entries.forEach((entry) => {
        const key = entry.employeeId || personName(entry.person);
        if (key) acc.people.add(key);
      });
      return acc;
    },
    { day: 0, night: 0, total: 0, activeDays: 0, people: new Set() },
  );
}

function deltaLabel(current, previous) {
  if (!previous && !current) return "Değişim yok";
  if (!previous) return "Yeni hareket";
  const ratio = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (!ratio) return "Aynı seviyede";
  return (ratio > 0 ? "+" : "") + ratio + "%";
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function DailyOperationsOverview({ activeMainCompany, openModule }) {
  const today = useMemo(() => dateOnly(new Date()), []);
  const currentMonth = today.slice(0, 7);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");

  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const selectedWeekDays = useMemo(
    () => daysBetween(selectedWeekStart, addDays(selectedWeekStart, 6)),
    [selectedWeekStart],
  );
  const previousWeekStart = useMemo(() => addDays(selectedWeekStart, -7), [selectedWeekStart]);
  const previousWeekDays = useMemo(
    () => daysBetween(previousWeekStart, addDays(previousWeekStart, 6)),
    [previousWeekStart],
  );
  const selectedMonthStart = useMemo(() => monthStart(selectedMonth), [selectedMonth]);
  const selectedMonthEnd = useMemo(() => monthEnd(selectedMonth), [selectedMonth]);
  const monthDays = useMemo(
    () => daysBetween(selectedMonthStart, selectedMonthEnd),
    [selectedMonthEnd, selectedMonthStart],
  );
  const rangeStart = useMemo(
    () => [previousWeekStart, selectedMonthStart].filter(Boolean).sort()[0] || previousWeekStart,
    [previousWeekStart, selectedMonthStart],
  );
  const rangeEnd = useMemo(
    () => [addDays(selectedWeekStart, 6), selectedMonthEnd].filter(Boolean).sort().at(-1) || selectedMonthEnd,
    [selectedMonthEnd, selectedWeekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const [peopleResult, attendanceResult] = await Promise.allSettled([
      getGunlukPersonel({ mainCompanyId: companyId }),
      getGunlukDurum({ mainCompanyId: companyId, start: rangeStart, end: rangeEnd }),