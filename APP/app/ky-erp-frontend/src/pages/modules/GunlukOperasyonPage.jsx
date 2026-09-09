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