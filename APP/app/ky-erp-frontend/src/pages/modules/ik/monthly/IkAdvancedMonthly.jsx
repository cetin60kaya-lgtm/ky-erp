import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createIkAdvancedPerson,
  adminMaintainIkAdvancedPerson,
  deleteIkAdvancedFinanceMovement,
  getIkAdvancedAuditLogs,
  getIkAdvancedMonth,
  getIkAdvancedPayroll,
  getIkAdvancedPeriodState,
  getIkAdvancedSyncState,
  prepareIkAdvancedPeriod,
  getIkAdvancedLeaveCenter,
  runIkAdvancedCloseCheck,
  saveIkAdvancedException,
  saveIkAdvancedLeave,
  previewIkAdvancedLeave,
  saveIkAdvancedLeavePolicy,
  saveIkAdvancedLeaveProfile,
  saveIkAdvancedLeaveCashRequest,
  cancelIkAdvancedLeave,
  saveIkAdvancedFinanceMovement,
  saveIkAdvancedPayrollLines,
  saveIkAdvancedFinalPayrollControl,
  saveIkAdvancedPersonCard,
  saveIkAdvancedBulkCompensation,
  previewIkAdvancedSgk,
  confirmIkAdvancedSgk,
  updateIkAdvancedFinanceMovement,
  uploadIkAdvancedDocument,
  downloadIkAdvancedDocument,
} from "../../../../services/ik/monthlyApi";
import { printHtmlDocument } from "../../../../services/printService";
import { exportRowsToExcelFile } from "../../../../utils/excelExport";
import { useAuth } from "../../../../context/AuthContext";
import IkMonthlyProShell from "./IkMonthlyProShell";
import "./ik.advanced.css";
import "./ik.monthly.pro.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const FINANCE_TYPES = ["Mesai", "Avans", "Toplu avans", "Ozel kesinti", "Icra", "Haciz", "Eksik gün", "Eksik saat"];
const LEAVE_TYPES = ["Yillik izin", "Normal izin", "Ucretsiz izin", "Mazeret izni", "Dogum izni", "Olum izni"];
const DAILY_TYPES = ["Isi vardi - sadece not", "Rapor", "Normal izin", "Ucretsiz izin", "Dogum izni", "Olum izni"];
const DOCUMENT_LOG_WORDS = ["EVRAK", "BELGE", "SOZLESME", "RAPOR", "IZIN FORM"];
const PAYROLL_LOG_WORDS = ["BORDRO", "ODEME", "FIS"];
const IK_LIVE_SYNC_INTERVAL_MS = 15000;
const IK_LIVE_SYNC_CHANNEL = "kyerp.ik.monthly.live.v1";

function istanbulDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousPeriod() {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function ikPeriodStorageKey(companyId) {
  return `kyerp.ik.selected-period.v2.${companyId || "default"}`;
}

function ikPreparedStorageKey(companyId) {
  return `kyerp.ik.prepared-periods.v2.${companyId || "default"}`;
}

function readStoredIkPeriod(companyId) {
  const fallback = previousPeriod();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(ikPeriodStorageKey(companyId));
    const parsed = raw ? JSON.parse(raw) : null;
    const year = Number(parsed?.year), month = Number(parsed?.month);
    if (year >= 2020 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  } catch {
    return fallback;
  }
  return fallback;
}

function readPreparedPeriods(companyId) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ikPreparedStorageKey(companyId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => /^\d{4}-\d{2}$/.test(String(value))) : [];
  } catch {
    return [];
  }
}

function dateKey(year, month, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function addDateDays(value, amount = 1) {
  const date = new Date(String(value || "") + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function durationLabel(startValue, endValue = istanbulDateKey()) {
  const start = String(startValue || "").slice(0, 10);
  const end = String(endValue || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return "-";
  let years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  let months = Number(end.slice(5, 7)) - Number(start.slice(5, 7));
  let days = Number(end.slice(8, 10)) - Number(start.slice(8, 10));
  if (days < 0) {
    months -= 1;
    const previousMonth = Number(end.slice(5, 7)) === 1 ? 12 : Number(end.slice(5, 7)) - 1;
    const previousMonthYear = previousMonth === 12 ? Number(end.slice(0, 4)) - 1 : Number(end.slice(0, 4));
    days += new Date(previousMonthYear, previousMonth, 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return Math.max(0, years) + " yıl " + Math.max(0, months) + " ay " + Math.max(0, days) + " gün";
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round(num(value) * 100) / 100;
}

function money(value) {
  return `₺${num(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function params(base) {
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function upper(value) {
  return String(value || "").toLocaleUpperCase("tr-TR");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function financeKey(value) { return upper(value).replace(/İ/g, "I").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ö/g, "O").replace(/Ç/g, "C"); }

function normalizeFinanceType(value) {
  const text = financeKey(value);
  if (text.includes("TOPLU") && text.includes("AVANS")) return "Toplu avans";
  if (text.includes("AVANS")) return "Avans";
  if (text.includes("HACIZ") || text.includes("HACİZ")) return "Haciz";
  if (text.includes("ICRA") || text.includes("İCRA")) return "Icra";
  if ((text.includes("EKSIK") || text.includes("EKSİK")) && text.includes("GUN")) return "Eksik gün";
  if ((text.includes("EKSIK") || text.includes("EKSİK")) && text.includes("GÜN")) return "Eksik gün";
  if ((text.includes("EKSIK") || text.includes("EKSİK")) && text.includes("SAAT")) return "Eksik saat";
  if (text.includes("DEVAMSIZ") || text.includes("GELMEDI") || text.includes("GELMEDİ")) return "Eksik gün";
  if (text.includes("KESINT")) return "Ozel kesinti";
  if (text.includes("MESAI") || text.includes("HAFTA SONU")) return "Mesai";
  return FINANCE_TYPES.includes(value) ? value : "";
}

function normalizeOvertimeMultiplier(value) {
  return num(value) >= 1.75 ? 2 : 1.5;
}

function overtimeTypeLabel(value) {
  return normalizeOvertimeMultiplier(value) === 2 ? "Hafta sonu %100 (x2)" : "Hafta içi %50 (x1,5)";
}

function stripOvertimeMeta(value) {
  return String(value || "")
    .replace(/^Mesai türü:\s*(Hafta içi %50 \(x1,5\)|Hafta sonu %100 \(x2\))\s*(?:·|\||-)\s*/i, "")
    .trim();
}

function employeeHireDate(employee = {}) {
  return String(employee.startDate || employee.hireDate || employee.hire_date || "").slice(0, 10);
}
function employeeExitDate(employee = {}) {
  return String(employee.exitDate || employee.exit_date || "").slice(0, 10);
}
function employmentStateAtPeriod(employee = {}, period = "") {
  if (employee.periodEmploymentState) return employee.periodEmploymentState;
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || month < 1 || month > 12) return "INVALID_PERIOD";
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const hireDate = employeeHireDate(employee);
  const exitDate = employeeExitDate(employee);
  const status = upper(`${employee.status || ""} ${employee.activePassive || ""}`);
  if (!hireDate) return "MISSING_HIRE_DATE";
  if (exitDate && exitDate < hireDate) return "INVALID_LIFECYCLE";
  if (hireDate > periodEnd) return "NOT_STARTED";
  if (exitDate && exitDate < periodStart) return "EXITED";
  if (status.includes("PAS") && !exitDate) return "MISSING_EXIT_DATE";
  if (hireDate.startsWith(period) && exitDate?.startsWith(period)) return "ENTERED_EXITED";
  if (hireDate.startsWith(period)) return "NEW_HIRE";
  if (exitDate?.startsWith(period)) return "EXIT_MONTH";
  return "ACTIVE";
}
function payrollVisibleEmployee(employee = {}, period = "") {
  if (employee.payrollIncluded === false) return false;
  return ["ACTIVE", "NEW_HIRE", "EXIT_MONTH", "ENTERED_EXITED", "MISSING_HIRE_DATE", "MISSING_EXIT_DATE"].includes(employmentStateAtPeriod(employee, period));
}
function employmentPeriodLabel(employee = {}, period = "") {
  const state = employmentStateAtPeriod(employee, period);
  const [year, month] = String(period || "").split("-").map(Number);
  const periodName = year && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : "Seçili dönem";
  if (state === "NEW_HIRE") return `${periodName} · Yeni Giriş`;
  if (state === "EXIT_MONTH") return `${periodName} · Çıkış Ayı`;
  if (state === "ENTERED_EXITED") return `${periodName} · Giriş / Çıkış`;
  if (state === "ACTIVE") return `${periodName} · Aktif`;
  if (state === "EXITED") return `${periodName} · Önceden Ayrılmış`;
  if (state === "NOT_STARTED") return `${periodName} · İşe Başlamamış`;
  if (state === "MISSING_HIRE_DATE") return "Giriş Tarihi Eksik";
  if (state === "MISSING_EXIT_DATE") return "Çıkış Tarihi Eksik";
  return "Tarih Kontrolü";
}

function leavePlanStatusLabel(value) {
  const status = upper(value);
  if (status === "PLANNED") return "Planlandı";
  if (status === "APPROVED") return "Onaylandı";
  if (status === "TAKEN") return "Kullanıldı";
  if (status === "CANCELLED") return "İptal";
  return value || "-";
}

function employmentPeriodTone(employee = {}, period = "") {
  const state = employmentStateAtPeriod(employee, period);
  if (["ACTIVE", "NEW_HIRE"].includes(state)) return "green";
  if (["EXIT_MONTH", "ENTERED_EXITED"].includes(state)) return "orange";
  return "red";
}

function isSgk(employee = {}) {
  return employee.sgkFollow === true;
}

function sgkLabel(employee = {}) {
  if (employee.sgkFollow === true) return "SGK'li";
  if (employee.sgkFollow === false) return "SGK'siz";
  return "Belirtilmemis";
}

function sgkDaySourceLabel(value) {
  const source = upper(value);
  if (source === "RESMI_BORDRO") return "Resmi Bordro";
  if (source === "SISTEM_ONERISI") return "Sistem Önerisi";
  if (source === "MANUEL") return "Manuel";
  if (source === "ONERI") return "Henüz kaydedilmedi";
  if (source === "SGK_DISI") return "SGK dışı";
  return "Belirsiz";
}

function hknNumber(employee = {}) {
  const code = String(employee.code || employee.personelKodu || "").trim().toLocaleUpperCase("tr-TR");
  const match = /^HKN-(\d+)$/.exec(code);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isHknEmployee(employee = {}) {
  return Number.isFinite(hknNumber(employee)) && hknNumber(employee) !== Number.MAX_SAFE_INTEGER;
}

function sortHknEmployees(list = []) {
  return [...list].sort((a, b) => hknNumber(a) - hknNumber(b) || String(a.fullName || "").localeCompare(String(b.fullName || ""), "tr"));
}

function nextHknCode(list = []) {
  const max = list.reduce((value, employee) => Math.max(value, hknNumber(employee) === Number.MAX_SAFE_INTEGER ? 0 : hknNumber(employee)), 0);
  return `HKN-${String(max + 1).padStart(2, "0")}`;
}

function paymentLabel(employee = {}) {
  const type = upper(employee.paymentType);
  if (type.includes("BANKA") && !type.includes("ELDEN")) return "Banka";
  if (type.includes("ELDEN") && !type.includes("BANKA")) return "Elden";
  return num(employee.bankAmount) > 0 && num(employee.cashAmount) > 0 ? "Karisik" : num(employee.bankAmount) > 0 ? "Banka" : "Elden";
}

function calcRow({ salary = 0, road = 0, overtime = 0, extra = 0, advance = 0, deduction = 0, garnishment = 0, bank = 0, cash = 0 }) {
  const hakedis = round(num(salary) + num(road) + num(overtime) + num(extra));
  const net = Math.max(round(hakedis - num(advance) - num(deduction) - num(garnishment)), 0);
  const paymentTotal = round(num(bank) + num(cash));
  return { hakedis, net, total: net, paymentTotal, diff: round(paymentTotal - net) };
}

function reconcilePaymentSplit(netValue, bankValue, cashValue, preferred = "cash") {
  const net = Math.max(round(netValue), 0);
  const bank = Math.max(round(bankValue), 0);
  const cash = Math.max(round(cashValue), 0);
  if (Math.abs(round(bank + cash - net)) <= 0.01) return { bank, cash, adjusted: false };
  if (preferred === "bank") {
    const nextBank = Math.min(bank, net);
    return { bank: nextBank, cash: round(net - nextBank), adjusted: true };
  }
  const nextCash = Math.min(cash, net);
  return { bank: round(net - nextCash), cash: nextCash, adjusted: true };
}

function paymentSplitByType(paymentType, netValue, bankValue = 0, bankDeductionsValue = 0) {
  const net = Math.max(round(netValue), 0);
  const type = upper(paymentType);
  const onlyCash = type.includes("ELDEN") && !type.includes("BANKA");
  const onlyBank = type.includes("BANKA") && !type.includes("ELDEN");
  if (onlyCash) return { bank: 0, cash: net, mode: "ELDEN" };
  if (onlyBank) return { bank: net, cash: 0, mode: "BANKA" };
  const bankPlan = Math.max(round(bankValue), 0);
  const bankDeductions = Math.max(round(bankDeductionsValue), 0);
  const bank = Math.min(Math.max(round(bankPlan - bankDeductions), 0), net);
  return { bank, cash: round(net - bank), mode: "BANKA_ELDEN" };
}

function draftPerson(employee = {}) {
  return {
    id: employee.id || "",
    version: employee.version || employee.updatedAt || "",
    fullName: employee.fullName || "",
    code: employee.code || "",
    cardNo: employee.cardNo || "",
    identityNo: employee.identityNo || "",
    personnelStatus: employee.personnelStatus === "RETIRED" ? "RETIRED" : "NORMAL",
    sgkFollow: employee.sgkFollow === true ? "SGKLI" : employee.sgkFollow === false ? "SGKSIZ" : "BELIRTILMEMIS",
    sgkDays: employee.sgkDays ?? "",
    suggestedSgkDays: employee.suggestedSgkDays ?? null,
    sgkDaySource: employee.sgkDaySource || (employee.sgkDays === null || employee.sgkDays === undefined ? "ONERI" : "MANUEL"),
    sgkDaySourceIntent: employee.sgkDaySource || (employee.sgkDays === null || employee.sgkDays === undefined ? "ONERI" : "MANUEL"),
    pdksCardDays: employee.pdksCardDays ?? 0,
    sgkPdksMatch: employee.sgkPdksMatch ?? null,
    paymentType: employee.paymentType || "BANKA_ELDEN",
    salary: employee.salary ?? "",
    roadAllowance: employee.roadAllowance ?? "",
    bankAmount: employee.bankAmount ?? "",
    cashAmount: employee.cashAmount ?? "",
    baseEmployeeId: employee.baseEmployeeId || "",
    extraPaymentLabel: "EK",
    extraPaymentAmount: employee.extraPaymentAmount ?? "",
    overtimeHourlyBase: employee.overtimeHourlyBase ?? employee.overtimeBaseHours ?? 225,
    deductionHourlyBase: employee.deductionHourlyBase ?? 300,
    startDate: employeeHireDate(employee),
    exitDate: employeeExitDate(employee),
    title: employee.title || "",
    department: employee.department || "",
    phone: employee.phone || "",
    annualLeaveEntitlement: employee.annualLeaveEntitlement ?? "",
    annualLeaveCarryover: employee.annualLeaveCarryover ?? "",
    documentStatus: employee.documentStatus || "",
    status: employee.status || employee.activePassive || "AKTIF",
    payrollIncluded: employee.payrollIncluded !== false,
    note: employee.note || "",
    effectiveDate: employee.effectiveDate || istanbulDateKey(),
    changeNote: "",
    adminNewCode: employee.code || "",
    adminMergeTargetId: "",
    adminReason: "",
    adminActionMessage: "",
    formMessage: "",
  };
}

export default function IkAdvancedMonthly({ mode = "ozet", activeMainCompany, openModule }) {
  const { user } = useAuth();
  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const adminRole = upper(user?.role);
  const canAdminMaintainPersonnel = ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(adminRole);
  const initial = readStoredIkPeriod(companyId);
  const initialPage = mode === "personel" ? "personel"
    : mode === "ucret" ? "ucret"
    : mode === "mesai" ? "hareket"
      : mode === "izin" ? "izin"
        : mode === "bordro" ? "bordro"
          : ["sgk", "evrak", "kapanis", "kontrol"].includes(mode) ? "evrak" : "ozet";
  const [page, setPage] = useState(initialPage);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [data, setData] = useState({});
  const [payrollData, setPayrollData] = useState(null);
  const [preparedPeriods, setPreparedPeriods] = useState(() => readPreparedPeriods(companyId));
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("ALL");
  const [sgkFilter, setSgkFilter] = useState("ALL");
  const [movementTypeFilter, setMovementTypeFilter] = useState("ALL");
  const [movementEffectFilter, setMovementEffectFilter] = useState("ALL");
  const [payrollPaymentFilter, setPayrollPaymentFilter] = useState("ALL");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("ALL");
  const [payrollEmploymentFilter, setPayrollEmploymentFilter] = useState("ACTIVE");
  const [documentFilter, setDocumentFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState(null);
  const [modalDraft, setModalDraft] = useState({});
  const [selectedDays, setSelectedDays] = useState([1]);
  const [leaveDeskTab, setLeaveDeskTab] = useState("overview");
  const [leaveDetailPlanId, setLeaveDetailPlanId] = useState("");
  const [leaveCenter, setLeaveCenter] = useState({ policy: { countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 }, plans: [], conflicts: [], employees: [], cashRequests: [] });
  const [quickLeaveDraft, setQuickLeaveDraft] = useState(() => {
    const today = istanbulDateKey();
    return { startDate: today, returnDate: addDateDays(today, 1), status: "APPROVED", note: "", advanceLeaveApproved: false, advanceLeaveReason: "" };
  });
  const [quickLeavePreview, setQuickLeavePreview] = useState(null);
  const [leaveProfileDraft, setLeaveProfileDraft] = useState({ birthDate: "", annualLeaveEntitlement: "", annualLeaveCarryover: "", adjustmentDays: "", adjustmentReason: "" });
  const [leaveCashDraft, setLeaveCashDraft] = useState({ requestType: "ACTIVE_EMPLOYMENT_REQUEST", requestDate: istanbulDateKey(), requestedDays: "", note: "" });
  const [leavePreview, setLeavePreview] = useState(null);
  const [policyDraft, setPolicyDraft] = useState({ countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 });
  const [leaveCalendarMonth, setLeaveCalendarMonth] = useState(`${initial.year}-${String(initial.month).padStart(2, "0")}`);
  const [leaveRangeStep, setLeaveRangeStep] = useState(0);
  const leaveAutoPreviewSeq = useRef(0);
  const loadRequestRef = useRef({ key: "", seq: 0, promise: null });
  const liveVersionRef = useRef("");
  const livePollBusyRef = useRef(false);
  const lastSuccessfulLoadStartedAtRef = useRef(0);
  const [sgkPreview, setSgkPreview] = useState(null);
  const [selectedPayrollIds, setSelectedPayrollIds] = useState([]);
  const documentInput = useRef(null);
  const payrollInput = useRef(null);
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const periodPrepared = preparedPeriods.includes(period);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  useEffect(() => {
    const stored = readStoredIkPeriod(companyId);
    setYear(stored.year);
    setMonth(stored.month);
    setPreparedPeriods(readPreparedPeriods(companyId));
  }, [companyId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ikPeriodStorageKey(companyId), JSON.stringify({ year, month }));
  }, [companyId, year, month]);

  const rawEmployees = safeList(data.rawEmployees).length ? safeList(data.rawEmployees) : safeList(data.employees);
  const rawMasterEmployees = safeList(data.masterEmployees).length ? safeList(data.masterEmployees) : rawEmployees;
  const masterEmployees = useMemo(() => sortHknEmployees(rawMasterEmployees.filter(isHknEmployee)), [rawMasterEmployees]);
  const employees = safeList(data.employees).filter((item) => payrollVisibleEmployee(item, period));
  const canonicalEmployeeIds = useMemo(() => new Set(employees.map((item) => item.id)), [employees]);
  const rawAdjustments = safeList(data.adjustments).filter((item) => canonicalEmployeeIds.has(item.employeeId));
  const masterLeaves = safeList(data.rawLeaves).length ? safeList(data.rawLeaves) : safeList(data.leaves);
  const masterDocuments = safeList(data.rawDocuments).length ? safeList(data.rawDocuments) : safeList(data.documents);
  const documents = safeList(data.documents).filter((item) => canonicalEmployeeIds.has(item.employeeId));
  const checks = safeList(data.checks);
  const payrollLines = safeList(payrollData?.lines).filter((line) => canonicalEmployeeIds.has(line.employeeId || line.employee?.id));
  const totalDays = daysInMonth(year, month);
  const selected = employees.find((item) => item.id === selectedId) || employees[0] || null;

  const load = useCallback(async ({ force = false, prepare = false, silent = false } = {}) => {
    const requestKey = `${companyId}|${year}|${month}`;
    let activeRequest = loadRequestRef.current;
    if (activeRequest.promise) {
      if (!force && activeRequest.key === requestKey) return activeRequest.promise;
      try { await activeRequest.promise; } catch { /* next serialized refresh still runs */ }
      activeRequest = loadRequestRef.current;
    }

    const requestId = activeRequest.seq + 1;
    const loadStartedAt = Date.now();
    const task = (async () => {
      if (!silent) setBusy(true);
      try {
        const [resultState, auditState, centerState, periodState] = await Promise.allSettled([
          getIkAdvancedMonth(params({ mainCompanyId: companyId, year, month })),
          getIkAdvancedAuditLogs(params({ mainCompanyId: companyId, period, limit: 180 })),
          getIkAdvancedLeaveCenter(params({ mainCompanyId: companyId, from: "2020-01-01", to: `${year + 1}-12-31` })),
          getIkAdvancedPeriodState(params({ mainCompanyId: companyId, year, month })),
        ]);
        if (resultState.status !== "fulfilled") throw resultState.reason;
        const result = resultState.value;
        const audit = auditState.status === "fulfilled" ? auditState.value : [];
        const center = centerState.status === "fulfilled" ? centerState.value : null;

        let authoritativePrepared = periodState.status === "fulfilled"
          ? Boolean(periodState.value?.prepared)
          : null;
        let periodStateFailed = periodState.status === "rejected";

        // Eski tarayıcı hafızasında bu ay daha önce hazırlanmışsa, yeni sunucu
        // kaydına bir kez sessizce taşı. Böylece mevcut kullanıcı tekrar düğmeye basmaz.
        if (authoritativePrepared === false && periodPrepared) {
          try {
            const promoted = await prepareIkAdvancedPeriod({ mainCompanyId: companyId, year, month });
            authoritativePrepared = Boolean(promoted?.prepared);
          } catch {
            periodStateFailed = true;
          }
        }

        const preparedForView = authoritativePrepared === null || periodStateFailed
          ? periodPrepared
          : authoritativePrepared;
        const includePayroll = prepare || preparedForView;

        let payroll = null;
        let payrollFailed = false;
        if (includePayroll) {
          try {
            payroll = await getIkAdvancedPayroll(params({ mainCompanyId: companyId, year, month }));
          } catch {
            payrollFailed = true;
          }
        }

        const auxiliaryFailed = auditState.status === "rejected"
          || centerState.status === "rejected"
          || periodStateFailed
          || payrollFailed;
        if (loadRequestRef.current.seq !== requestId) return;

        const nextEmployees = safeList(result?.employees).filter((item) => payrollVisibleEmployee(item, period));
        const currentIds = new Set(nextEmployees.map((item) => item.id));
        // Personel Kartları tam HKN ana kadrosunu gösterir. Canlı yenileme sırasında
        // seçimi yalnız bordro-dönemi IDsine göre doğrulamak, dönem dışı/eksik tarihli
        // bir karta tıklandığında seçimi ilk bordro personeline geri sıçratıyordu.
        const masterSelectionIds = new Set([
          ...safeList(result?.masterEmployees).map((item) => item.id),
          ...safeList(result?.rawEmployees).map((item) => item.id),
          ...nextEmployees.map((item) => item.id),
        ].filter(Boolean));
        const cleanResult = result ? {
          ...result,
          adjustments: safeList(result.adjustments).filter((item) => currentIds.has(item.employeeId)),
          leaves: safeList(result.leaves).filter((item) => currentIds.has(item.employeeId)),
          payroll: safeList(result.payroll).filter((item) => currentIds.has(item.employeeId)),
          documents: safeList(result.documents).filter((item) => currentIds.has(item.employeeId)),
          contracts: safeList(result.contracts).filter((item) => currentIds.has(item.employeeId)),
        } : {};
        const cleanPayroll = payroll ? {
          ...payroll,
          lines: safeList(payroll.lines).filter((line) => currentIds.has(line.employeeId || line.employee?.id)),
        } : null;

        setData(cleanResult);
        setLogs(safeList(audit));
        setPayrollData(includePayroll ? cleanPayroll : null);
        if (authoritativePrepared !== null && !periodStateFailed) {
          setPreparedPeriods((old) => {
            const withoutCurrent = old.filter((value) => value !== period);
            const next = authoritativePrepared ? [...withoutCurrent, period] : withoutCurrent;
            const unchanged = next.length === old.length && next.every((value, index) => value === old[index]);
            if (!unchanged && typeof window !== "undefined") {
              window.localStorage.setItem(ikPreparedStorageKey(companyId), JSON.stringify(next));
            }
            return unchanged ? old : next;
          });
        }
        setLeaveCenter(center || { plans: [], conflicts: [] });
        if (center?.policy) setPolicyDraft(center.policy);
        setSelectedId((old) => masterSelectionIds.has(old) ? old : nextEmployees[0]?.id || safeList(result?.masterEmployees)[0]?.id || "");
        setSelectedPayrollIds((old) => old.filter((id) => currentIds.has(id)));
        lastSuccessfulLoadStartedAtRef.current = loadStartedAt;
        if (!silent) setNotice(auxiliaryFailed ? "İK ana verisi yüklendi; bazı yardımcı özetler geçici olarak alınamadı." : "");
        return true;
      } catch (error) {
        if (!silent && loadRequestRef.current.seq === requestId) {
          setNotice(error?.message || "IK aylik verisi alinamadi.");
        }
        return false;
      } finally {
        if (!silent && loadRequestRef.current.seq === requestId) setBusy(false);
      }
    })();

    loadRequestRef.current = { key: requestKey, seq: requestId, promise: task };
    try {
      return await task;
    } finally {
      if (loadRequestRef.current.seq === requestId) {
        loadRequestRef.current = { ...loadRequestRef.current, promise: null };
      }
    }
  }, [companyId, month, period, periodPrepared, year]);

  useEffect(() => {
    load();
  }, [load, initialPage]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || livePollBusyRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      livePollBusyRef.current = true;
      try {
        const state = await getIkAdvancedSyncState({ mainCompanyId: companyId }, { forceFresh: true, timeoutMs: 5000 });
        const version = String(state?.version || "");
        if (!version) return;
        if (!liveVersionRef.current) { liveVersionRef.current = version; return; }
        if (version === liveVersionRef.current) return;
        const updatedAtMs = Date.parse(String(state?.updatedAt || ""));
        if (updatedAtMs && lastSuccessfulLoadStartedAtRef.current && updatedAtMs <= lastSuccessfulLoadStartedAtRef.current) {
          liveVersionRef.current = version;
          return;
        }
        if (busy || modal) return;
        const refreshed = await load({ force: true, prepare: periodPrepared, silent: true });
        if (!cancelled && refreshed) liveVersionRef.current = version;
      } catch {
        // Canlı senkron yardımcı katmandır; geçici bağlantı hatası aylık İK işlemlerini durdurmaz.
      } finally {
        livePollBusyRef.current = false;
      }
    };
    const timer = window.setInterval(() => { void poll(); }, IK_LIVE_SYNC_INTERVAL_MS);
    const onFocus = () => { void poll(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    const channel = typeof window.BroadcastChannel === "function" ? new window.BroadcastChannel(IK_LIVE_SYNC_CHANNEL) : null;
    const onMutation = () => { void poll(); };
    channel?.addEventListener?.("message", onMutation);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      channel?.removeEventListener?.("message", onMutation);
      channel?.close?.();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [busy, companyId, load, modal, periodPrepared]);

  const preparePeriod = async () => {
    setBusy(true);
    try {
      const state = await prepareIkAdvancedPeriod({ mainCompanyId: companyId, year, month });
      if (!state?.prepared) throw new Error("Aylık dönem hazırlık kaydı doğrulanamadı.");
      setPreparedPeriods((old) => {
        const next = [...new Set([...old, period])];
        if (typeof window !== "undefined") window.localStorage.setItem(ikPreparedStorageKey(companyId), JSON.stringify(next));
        return next;
      });
      const ok = await load({ force: true, prepare: true });
      if (!ok) return;
      setNotice(`${MONTHS[month - 1]} ${year} bir kez hazırlandı ve sunucuya kaydedildi. Sayfa kapansa da tekrar hazırlamanız gerekmez.`);
    } catch (error) {
      setNotice(error?.message || "Aylık dönem hazırlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const changePeriod = (nextYear, nextMonth) => {
    setYear(Number(nextYear));
    setMonth(Number(nextMonth));
    setPayrollData(null);
    setSelectedPayrollIds([]);
    setEmployeeStatusFilter("ALL");
    setSgkFilter("ALL");
    setMovementTypeFilter("ALL");
    setMovementEffectFilter("ALL");
    setPayrollPaymentFilter("ALL");
    setPayrollStatusFilter("ALL");
    setPayrollEmploymentFilter("ACTIVE");
    setDocumentFilter("ALL");
    setNotice("");
  };

  const filterEmployeeList = useCallback((list, periodAware = false) => {
    const needle = upper(search).trim();
    return list.filter((employee) => {
      if (periodAware) {
        const state = employmentStateAtPeriod(employee, period);
        const worksInPeriod = ["ACTIVE", "NEW_HIRE", "EXIT_MONTH", "ENTERED_EXITED", "MISSING_HIRE_DATE"].includes(state);
        if (employeeStatusFilter === "ACTIVE" && !worksInPeriod) return false;
        if (employeeStatusFilter === "PASSIVE" && !["EXIT_MONTH", "ENTERED_EXITED"].includes(state)) return false;
      } else {
        const status = upper(`${employee.status || ""} ${employee.activePassive || ""}`);
        if (employeeStatusFilter === "ACTIVE" && status.includes("PAS")) return false;
        if (employeeStatusFilter === "PASSIVE" && !status.includes("PAS")) return false;
      }
      if (sgkFilter === "SGK" && !isSgk(employee)) return false;
      if (sgkFilter === "NO_SGK" && isSgk(employee)) return false;
      const haystack = upper(`${employee.fullName || ""} ${employee.code || ""} ${employee.cardNo || ""} ${employee.identityNo || ""}`);
      return !needle || haystack.includes(needle);
    });
  }, [employeeStatusFilter, period, search, sgkFilter]);

  const filteredEmployees = useMemo(() => filterEmployeeList(employees, true), [employees, filterEmployeeList]);
  const filteredMasterEmployees = useMemo(() => filterEmployeeList(masterEmployees, true), [filterEmployeeList, masterEmployees]);

  const leaveEmployeeMap = useMemo(
    () => new Map(safeList(leaveCenter.employees).map((employee) => [employee.id, employee])),
    [leaveCenter.employees],
  );
  const leaveRoster = useMemo(
    () => filteredMasterEmployees.map((employee) => ({ ...employee, ...(leaveEmployeeMap.get(employee.id) || {}) })),
    [filteredMasterEmployees, leaveEmployeeMap],
  );
  const leaveSelected = leaveEmployeeMap.get(selectedId)
    || leaveRoster.find((employee) => employee.id === selectedId)
    || leaveRoster[0]
    || null;

  useEffect(() => {
    if (!leaveSelected) return;
    const today = istanbulDateKey();
    setLeaveProfileDraft({
      birthDate: leaveSelected.birthDate || "",
      annualLeaveEntitlement: leaveSelected.recordedEntitlement ?? leaveSelected.annualLeaveEntitlement ?? "",
      annualLeaveCarryover: leaveSelected.annualCarryover ?? leaveSelected.annualLeaveCarryover ?? "",
      adjustmentDays: "",
      adjustmentReason: "",
    });
    setQuickLeaveDraft({ startDate: today, returnDate: addDateDays(today, 1), status: "APPROVED", note: "", advanceLeaveApproved: false, advanceLeaveReason: "" });
    setQuickLeavePreview(null);
    setLeaveCashDraft({ requestType: "ACTIVE_EMPLOYMENT_REQUEST", requestDate: today, requestedDays: "", note: "" });
    setLeaveDetailPlanId("");
  }, [leaveSelected]);

  const movements = useMemo(() => rawAdjustments
    .map((item) => ({ ...item, type: normalizeFinanceType(item.adjustmentType || item.type) }))
    .filter((item) => item.type), [rawAdjustments]);

  const periodMovements = useMemo(
    () => movements.filter((item) => String(item.date || "").startsWith(period)),
    [movements, period],
  );

  const filteredMovements = useMemo(() => {
    const needle = upper(search).trim();
    return periodMovements.filter((item) => {
      if (movementTypeFilter !== "ALL" && item.type !== movementTypeFilter) return false;
      const effect = upper(item.payrollEffect || "Bordroya yansir");
      if (movementEffectFilter === "PAYROLL" && effect.includes("SADECE")) return false;
      if (movementEffectFilter === "INFO" && !effect.includes("SADECE")) return false;
      if (!needle) return true;
      const employee = employees.find((row) => row.id === item.employeeId);
      return upper(`${employee?.fullName || item.fullName || ""} ${employee?.code || ""} ${item.note || item.description || ""}`).includes(needle);
    });
  }, [employees, movementEffectFilter, movementTypeFilter, periodMovements, search]);

  const employeeLeave = useCallback((employee) => {
    const own = masterLeaves.filter((item) => item.employeeId === employee.id);
    const canonical = leaveEmployeeMap.get(employee.id);
    if (canonical) return { own, annual: num(canonical.usedDays), right: num(canonical.annualRight), balance: num(canonical.balance), carryover: num(canonical.annualCarryover), adjustment: num(canonical.balanceAdjustment), source: "LEAVE_CENTER" };
    const annual = own.filter((item) => upper(item.recordType || item.type).includes("YILLIK") && String(item.startDate || item.start || "").startsWith(String(year))).reduce((sum, item) => sum + num(item.dayCount ?? item.days ?? 0), 0);
    const right = num(employee.annualLeaveEntitlement) + num(employee.annualLeaveCarryover);
    return { own, annual, right, balance: right - annual, source: "FALLBACK" };
  }, [masterLeaves, leaveEmployeeMap, year]);

  const docsFor = useCallback((employee) => masterDocuments.filter((item) => item.employeeId === employee.id), [masterDocuments]);

  const planFor = useCallback((employee) => {
  const own = periodMovements.filter((item) => item.employeeId === employee.id);
  const effective = own.filter((item) => !upper(item.payrollEffect).includes("SADECE"));
  const overtimeRows = effective.filter((item) => item.type === "Mesai");
  const advanceRows = effective.filter((item) => item.type === "Avans" || item.type === "Toplu avans");
  const deductionRows = effective.filter((item) => item.type === "Ozel kesinti" || item.type === "Eksik gün" || item.type === "Eksik saat");
  const legalRows = effective.filter((item) => item.type === "Icra" || item.type === "Haciz");
  const overtime = overtimeRows.reduce((sum, item) => sum + num(item.amount), 0);
  const advance = advanceRows.reduce((sum, item) => sum + num(item.amount), 0);
  const deduction = deductionRows.reduce((sum, item) => sum + num(item.amount), 0);
  const garnishment = legalRows.reduce((sum, item) => sum + num(item.amount), 0);
  const isBank = (item) => upper(item.paymentMethod).includes("BANKA");
  const bankDeductions = [...advanceRows, ...deductionRows, ...legalRows].filter(isBank).reduce((sum, item) => sum + num(item.amount), 0);
  const cashDeductions = [...advanceRows, ...deductionRows, ...legalRows].filter((item) => !isBank(item)).reduce((sum, item) => sum + num(item.amount), 0);
  const legalBank = legalRows.filter(isBank).reduce((sum, item) => sum + num(item.amount), 0);
  const legalCash = legalRows.filter((item) => !isBank(item)).reduce((sum, item) => sum + num(item.amount), 0);
  const advanceBank = advanceRows.filter(isBank).reduce((sum, item) => sum + num(item.amount), 0);
  const advanceCash = advanceRows.filter((item) => !isBank(item)).reduce((sum, item) => sum + num(item.amount), 0);
  const deductionBank = deductionRows.filter(isBank).reduce((sum, item) => sum + num(item.amount), 0);
  const deductionCash = deductionRows.filter((item) => !isBank(item)).reduce((sum, item) => sum + num(item.amount), 0);
  const correctionSource = (bankValue, cashValue) => bankValue >= cashValue ? "Banka" : "Elden";
  const legalKinds = new Set(legalRows.map((item) => item.type));
  const legalType = legalKinds.size > 1 ? "KARMA" : legalKinds.has("Haciz") ? "HACIZ" : legalKinds.has("Icra") ? "ICRA" : "YOK";
  const garnishmentSource = legalBank > 0 && legalCash > 0 ? "KARMA" : legalCash > 0 ? "ELDEN" : "BANKA";
  const actualSalary = num(employee.salary);
  const baseEmployee = employee.baseEmployeeId ? rawEmployees.find((item) => item.id === employee.baseEmployeeId) : null;
  const salary = actualSalary;
  const road = num(employee.roadAllowance);
  const extraLabel = employee.extraPaymentLabel || "EK";
  const extra = num(employee.extraPaymentAmount);
  const pre = calcRow({ salary, road, overtime, extra, advance, deduction, garnishment });
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  const payment = paymentSplitByType(employee.paymentType, pre.net, employee.bankAmount, bankDeductions);
  const bank = payment.bank;
  const cash = payment.cash;
  return {
    employee, actualSalary, baseEmployee, salary, road, extraLabel, extra, overtime, advance, deduction,
    legalType, garnishmentSource, garnishment, legalBank, legalCash, bankDeductions, cashDeductions,
    advanceSource: correctionSource(advanceBank, advanceCash),
    deductionSource: correctionSource(deductionBank, deductionCash),
    bank, cash, saved,
    ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }),
  };
}, [periodMovements, payrollLines, rawEmployees]);

  const payrollRows = useMemo(() => periodPrepared ? employees.map((employee) => {
  const system = planFor(employee);
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  if (!saved?.final) return system;

  const snapshot = {
    salary: saved.final.salaryPay !== undefined ? num(saved.final.salaryPay) : system.salary,
    road: saved.final.roadPay !== undefined ? num(saved.final.roadPay) : system.road,
    extra: saved.final.premiumAmount !== undefined ? num(saved.final.premiumAmount) : system.extra,
    overtime: saved.final.overtimeAmount !== undefined ? num(saved.final.overtimeAmount) : system.overtime,
    advance: saved.final.advanceAmount !== undefined ? num(saved.final.advanceAmount) : system.advance,
    deduction: saved.final.deductionAmount !== undefined ? num(saved.final.deductionAmount) : system.deduction,
    garnishment: saved.final.garnishmentAmount !== undefined ? num(saved.final.garnishmentAmount) : system.garnishment,
    bank: saved.final.bank !== undefined ? num(saved.final.bank) : system.bank,
    cash: saved.final.cash !== undefined ? num(saved.final.cash) : system.cash,
  };
  const sourceChangedSinceSave = [
    system.salary - snapshot.salary,
    system.road - snapshot.road,
    system.extra - snapshot.extra,
    system.overtime - snapshot.overtime,
    system.advance - snapshot.advance,
    system.deduction - snapshot.deduction,
    system.garnishment - snapshot.garnishment,
    system.bank - snapshot.bank,
    system.cash - snapshot.cash,
  ].some((value) => Math.abs(round(value)) > 0.01);

  // Tek kaynak kuralı: bordro sonucu ay kilitlenene kadar her zaman canlı kaynaklardan okunur.
  // Eski PAID/snapshot kayıtları yalnız tarihsel kanıttır; düzenleme kilidi değildir.
  return { ...system, saved, sourceChangedSinceSave, paidLocked: false };
}): [], [employees, payrollLines, planFor, periodPrepared]);

  const summary = useMemo(() => payrollRows.reduce((acc, row) => ({
    count: acc.count + 1,
    salary: round(acc.salary + row.salary),
    road: round(acc.road + row.road),
    hakedis: round(acc.hakedis + row.hakedis),
    bank: round(acc.bank + row.bank),
    cash: round(acc.cash + row.cash),
    net: round(acc.net + row.net),
    advance: round(acc.advance + row.advance),
    deduction: round(acc.deduction + row.deduction),
    extra: round(acc.extra + row.extra),
    garnishment: round(acc.garnishment + row.garnishment),
    overtime: round(acc.overtime + row.overtime),
    annual: acc.annual + employeeLeave(row.employee).annual,
    docsMissing: acc.docsMissing + (docsFor(row.employee).length ? 0 : 1),
    manual: acc.manual + (row.saved?.override ? 1 : 0),
  }), { count: 0, salary: 0, road: 0, hakedis: 0, bank: 0, cash: 0, net: 0, advance: 0, deduction: 0, extra: 0, garnishment: 0, overtime: 0, annual: 0, docsMissing: 0, manual: 0 }), [payrollRows, employeeLeave, docsFor]);

  const filteredPayrollRows = useMemo(() => {
    const needle = upper(search).trim();
    return payrollRows.filter((row) => {
      const employee = row.employee || {};
      if (needle && !upper(`${employee.fullName || ""} ${employee.code || ""} ${employee.department || ""}`).includes(needle)) return false;
      const employmentState = employmentStateAtPeriod(employee, period);
      const activeInPeriod = ["ACTIVE", "NEW_HIRE", "MISSING_HIRE_DATE", "MISSING_EXIT_DATE"].includes(employmentState);
      const leftInPeriod = ["EXIT_MONTH", "ENTERED_EXITED"].includes(employmentState);
      if (payrollEmploymentFilter === "ACTIVE" && !activeInPeriod) return false;
      if (payrollEmploymentFilter === "EXITED" && !leftInPeriod) return false;
      if (payrollPaymentFilter === "BANK" && num(row.bank) <= 0) return false;
      if (payrollPaymentFilter === "CASH" && num(row.cash) <= 0) return false;
      if (payrollPaymentFilter === "MIXED" && !(num(row.bank) > 0 && num(row.cash) > 0)) return false;
      if (payrollStatusFilter === "READY" && Math.abs(num(row.diff)) > 0.01) return false;
      if (payrollStatusFilter === "CONTROL" && Math.abs(num(row.diff)) <= 0.01) return false;
      return true;
    });
  }, [payrollRows, payrollEmploymentFilter, payrollPaymentFilter, payrollStatusFilter, period, search]);

  const visibleDocumentEmployeeIds = useMemo(() => {
    const needle = upper(search).trim();
    return new Set(employees.filter((employee) => {
      if (needle && !upper(`${employee.fullName || ""} ${employee.code || ""} ${employee.department || ""}`).includes(needle)) return false;
      if (sgkFilter === "SGK" && !isSgk(employee)) return false;
      if (sgkFilter === "NO_SGK" && isSgk(employee)) return false;
      const hasDocs = docsFor(employee).length > 0;
      if (documentFilter === "HAS" && !hasDocs) return false;
      if (documentFilter === "MISSING" && hasDocs) return false;
      return true;
    }).map((employee) => employee.id));
  }, [documentFilter, employees, search, sgkFilter, docsFor]);

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => visibleDocumentEmployeeIds.has(doc.employeeId)),
    [documents, visibleDocumentEmployeeIds],
  );

  const unbalancedPayrollRows = useMemo(() => payrollRows.filter((row) => Math.abs(num(row.diff)) > 0.01), [payrollRows]);
  const grandPaymentDiff = round(summary.bank + summary.cash - summary.net);
  const balanced = Math.abs(grandPaymentDiff) <= 0.01 && unbalancedPayrollRows.length === 0;
  const missingHireEmployees = useMemo(() => employees.filter((employee) => !employeeHireDate(employee)), [employees]);
  const passiveWithoutExitEmployees = useMemo(() => rawEmployees.filter((employee) => upper(`${employee.status || ""} ${employee.activePassive || ""}`).includes("PAS") && !employeeExitDate(employee)), [rawEmployees]);
  const duplicateNameCount = useMemo(() => {
    const counts = new Map();
    rawEmployees.forEach((employee) => {
      const key = upper(employee.fullName).replace(/\s+/g, " ").trim();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.values()].filter((count) => count > 1).length;
  }, [rawEmployees]);

  const smartIssues = [
    !periodPrepared ? { tone: "orange", title: "Bordro dönemi hazırlanmadı", detail: `${MONTHS[month - 1]} ${year} için önce Bilgileri Hazırla.`, action: preparePeriod, actionLabel: "Hazırla" } : null,
    periodPrepared && !balanced ? { tone: "red", title: "Ödeme dengesi", detail: unbalancedPayrollRows.length ? `${unbalancedPayrollRows.length} personelde Banka + Elden, Net Ödenecek ile eşleşmiyor.` : `Genel ödeme farkı ${money(grandPaymentDiff)}.`, action: () => go("bordro"), actionLabel: "Bordroya Git" } : null,
    missingHireEmployees.length ? { tone: "orange", title: "İşe giriş tarihi eksik", detail: `${missingHireEmployees.length} dönem personelinde işe giriş tarihi eksik. Ay kapanışı engellenir.`, action: () => go("personel"), actionLabel: "Personellere Git" } : null,
    passiveWithoutExitEmployees.length ? { tone: "red", title: "İşten çıkış tarihi eksik", detail: `${passiveWithoutExitEmployees.length} pasif personelde çıkış tarihi eksik. Ay kapanışı engellenir.`, action: () => go("personel"), actionLabel: "Personellere Git" } : null,
    duplicateNameCount ? { tone: "orange", title: "Mükerrer ad kontrolü", detail: `${duplicateNameCount} ad-soyad birden fazla personel kartında bulunuyor. Kod/TC ile teyit edilmelidir.`, action: () => go("personel"), actionLabel: "Kontrol Et" } : null,
    employees.some(isSgk) && !data.sgkImport ? { tone: "orange", title: "Resmi SGK bordrosu yok", detail: "Seçili dönem için resmi XLS/XLSX bordro henüz onaylanmadı.", action: () => go("evrak"), actionLabel: "SGK / Evrak" } : null,
    summary.docsMissing ? { tone: "orange", title: "Eksik evrak", detail: `${summary.docsMissing} personelde evrak bağlantısı yok.`, action: () => go("evrak"), actionLabel: "Evraka Git" } : null,
  ].filter(Boolean);

  const scopedLogs = useMemo(() => {
    const rows = logs.map((log) => {
      const text = financeKey(`${log.actionType || ""} ${log.sourceScreen || ""} ${log.reason || ""}`);
      const employee = employees.find((item) => item.id === log.employeeId);
      return { ...log, text, personName: employee?.fullName || log.fullName || "-" };
    });
    if (page === "personel") return rows.filter((log) => log.text.includes("PERSON") || log.text.includes("KART") || log.text.includes("SOZLESME") || log.text.includes("MAAS"));
    if (page === "hareket") return rows.filter((log) => log.text.includes("MESAI") || log.text.includes("AVANS") || log.text.includes("KESINT") || log.text.includes("EKSIK") || log.text.includes("EKSİK") || log.text.includes("DEVAMSIZ") || log.text.includes("GELMEDI") || log.text.includes("GELMEDİ"));
    if (page === "izin") return rows.filter((log) => log.text.includes("IZIN") || log.text.includes("RAPOR") || log.text.includes("ISTISNA") || log.text.includes("GUNLUK"));
    if (page === "bordro") return rows.filter((log) => PAYROLL_LOG_WORDS.some((word) => log.text.includes(word)));
    if (page === "evrak") return rows.filter((log) => DOCUMENT_LOG_WORDS.some((word) => log.text.includes(word)));
    return rows;
  }, [logs, employees, page]);

  const go = (target) => {
    const tabByTarget = {
      ozet: "ozet",
      personel: "personel-kartlari",
      ucret: "ucret-odeme-plani",
      hareket: "mesai-avans",
      izin: "yillik-izin",
      bordro: "bordro-odeme",
      evrak: "sgk-evrak-kontrol",
    };
    if (typeof openModule === "function" && tabByTarget[target]) {
      openModule("ik", { tabKey: tabByTarget[target] });
      return;
    }
    setPage(target);
    setNotice("");
    load({ force: true });
  };

  const openNewPerson = () => {
    if (data.close?.isLocked) return setNotice("Kapalı dönemde yeni personel kartı açılamaz.");
    setSelectedId("");
    setModalDraft(draftPerson({ code: nextHknCode(masterEmployees), startDate: istanbulDateKey(), status: "AKTIF" }));
    setModal("personel");
  };

  const openPerson = (employee = selected) => {
    if (!employee) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(employee.id);
    setModalDraft(draftPerson(employee));
    setModal("personel");
  };

  const switchPersonInModal = (employeeId) => {
    if (busy) return;
    const employee = masterEmployees.find((item) => item.id === employeeId);
    if (!employee) return;
    setSelectedId(employee.id);
    setModalDraft(draftPerson(employee));
    setNotice("");
  };

  const adminRecodePerson = async () => {
    if (!modalDraft.id) return setModalDraft((old) => ({ ...old, adminActionMessage: "Önce personel kartını kaydedin." }));
    if (!modalDraft.adminNewCode?.trim()) return setModalDraft((old) => ({ ...old, adminActionMessage: "Yeni HKN personel kodunu girin." }));
    if (!window.confirm(`${modalDraft.fullName} personel kodu ${modalDraft.code} → ${modalDraft.adminNewCode} olarak değiştirilsin mi?`)) return;
    setBusy(true);
    setModalDraft((old) => ({ ...old, adminActionMessage: "" }));
    try {
      const result = await adminMaintainIkAdvancedPerson(modalDraft.id, {
        mainCompanyId: companyId,
        action: "RECODE",
        personnelCode: modalDraft.adminNewCode,
        reason: modalDraft.adminReason,
      });
      setModal(null);
      setNotice(`Personel kodu ${result?.oldCode || modalDraft.code} → ${result?.code || modalDraft.adminNewCode} olarak değiştirildi.`);
      await load({ force: true, prepare: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, adminActionMessage: error?.message || "Personel kodu değiştirilemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const adminMergePerson = async () => {
    if (!modalDraft.id) return setModalDraft((old) => ({ ...old, adminActionMessage: "Kaydedilmemiş personel birleştirilemez." }));
    const target = masterEmployees.find((item) => item.id === modalDraft.adminMergeTargetId);
    if (!target) return setModalDraft((old) => ({ ...old, adminActionMessage: "Doğru personel kaydını seçin." }));
    if (!window.confirm(`${modalDraft.fullName} (${modalDraft.code}) kaydı ${target.fullName} (${target.code}) ile birleştirilsin mi? Bağlı geçmiş doğru personele aktarılacak ve yanlış ana kart kaldırılacak.`)) return;
    setBusy(true);
    setModalDraft((old) => ({ ...old, adminActionMessage: "" }));
    try {
      const result = await adminMaintainIkAdvancedPerson(modalDraft.id, {
        mainCompanyId: companyId,
        action: "MERGE",
        targetEmployeeId: target.id,
        reason: modalDraft.adminReason,
      });
      setModal(null);
      setSelectedId(target.id);
      setNotice(`${modalDraft.code} kaydı ${result?.targetCode || target.code} personeline birleştirildi; bağlı geçmiş kayıtlar korundu.`);
      await load({ force: true, prepare: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, adminActionMessage: error?.message || "Personel kayıtları birleştirilemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const adminHardDeletePerson = async () => {
    if (!modalDraft.id) return setModalDraft((old) => ({ ...old, adminActionMessage: "Kaydedilmemiş personel silinemez." }));
    if (!window.confirm(`${modalDraft.fullName} (${modalDraft.code}) yanlış/mükerrer kayıt olarak silinsin mi? Geçmiş işlem varsa sistem silmeyi durdurup Birleştir yönlendirmesi yapacak.`)) return;
    setBusy(true);
    setModalDraft((old) => ({ ...old, adminActionMessage: "" }));
    try {
      await adminMaintainIkAdvancedPerson(modalDraft.id, {
        mainCompanyId: companyId,
        action: "HARD_DELETE",
        reason: modalDraft.adminReason,
      });
      setModal(null);
      setSelectedId("");
      setNotice(`${modalDraft.fullName} (${modalDraft.code}) yanlış/mükerrer personel kaydı silindi. HKN kodu emekliye ayrıldı ve tekrar otomatik verilmez.`);
      await load({ force: true, prepare: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, adminActionMessage: error?.message || "Personel kaydı silinemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const openFinance = (type, row = null) => {
    const normalized = normalizeFinanceType(type || row?.adjustmentType) || "Mesai";
    const employee = row?.employeeId ? employees.find((item) => item.id === row.employeeId) : selected;
    if (normalized !== "Toplu avans" && !employee) return setNotice("Personel secilmeden kayit yapilamaz.");
    const multiplier = normalizeOvertimeMultiplier(row?.overtimeMultiplier || (upper(row?.note).includes("X2") ? 2 : 1.5));
    setModalDraft({
      id: row?.id || "",
      employeeId: employee?.id || "",
      employeeIds: normalized === "Toplu avans" ? (row?.employeeIds || (employee?.id ? [employee.id] : [])) : undefined,
      adjustmentType: normalized,
      date: row?.date || row?.adjustmentDate || dateKey(year, month, 1),
      hourOrDay: row?.hourOrDay || row?.quantity || (normalized === "Eksik gün" ? 1 : ""),
      amount: row?.amount || "",
      overtimeMultiplier: multiplier,
      overtimeKind: multiplier === 2 ? "WEEKEND_100" : "WEEKDAY_50",
      paymentMethod: row?.paymentMethod || (normalized === "Mesai" ? "Bordro" : "Elden"),
      payrollEffect: row?.payrollEffect || "Bordroya yansir",
      note: normalized === "Mesai" ? stripOvertimeMeta(row?.note || row?.description || "") : (row?.note || row?.description || ""),
    });
    setModal(normalized === "Toplu avans" ? "topluAvans" : normalized === "Avans" ? "avans" : ["Ozel kesinti", "Icra", "Haciz", "Eksik gün", "Eksik saat"].includes(normalized) ? "kesinti" : "mesai");
  };

  const prePayrollDraft = (employee, controlMode = "ENTRY_EDIT", payrollRow = null) => {
    const base = draftPerson(employee);
    const row = payrollRow || payrollRows.find((item) => item.employee.id === employee?.id) || null;
    const sourceRows = movements.filter((item) => item.employeeId === employee?.id && String(item.date || item.adjustmentDate || "").startsWith(period) && !upper(item.payrollEffect).includes("SADECE"));
    const sourceTotals = sourceRows.reduce((acc, item) => { const kind = normalizeFinanceType(item.type || item.adjustmentType); if (kind === "Mesai") acc.overtime += num(item.amount); else if (["Avans","Toplu avans"].includes(kind)) acc.advance += num(item.amount); else if (["Ozel kesinti","Eksik gün","Eksik saat"].includes(kind)) acc.deduction += num(item.amount); else if (["Icra","Haciz"].includes(kind)) acc.garnishment += num(item.amount); return acc; }, {overtime:0,advance:0,deduction:0,garnishment:0});
    const entry = controlMode !== "FINAL";
    return {
      ...base,
      controlMode,
      finalEditor: {
        salary: row && !entry ? num(row.salary) : num(base.salary),
        road: row && !entry ? num(row.road) : num(base.roadAllowance),
        extra: row && !entry ? num(row.extra) : num(base.extraPaymentAmount),
        overtime: entry ? round(sourceTotals.overtime) : (row ? num(row.overtime) : round(sourceTotals.overtime)),
        advance: entry ? round(sourceTotals.advance) : (row ? num(row.advance) : round(sourceTotals.advance)),
        deduction: entry ? round(sourceTotals.deduction) : (row ? num(row.deduction) : round(sourceTotals.deduction)),
        garnishment: entry ? round(sourceTotals.garnishment) : (row ? num(row.garnishment) : round(sourceTotals.garnishment)),
        bank: row && !entry ? num(row.bank) : num(base.bankAmount),
        cash: row && !entry ? num(row.cash) : num(base.cashAmount),
        paymentType: base.paymentType || "BANKA_ELDEN",
        advanceSource: row?.advanceSource || "Elden",
        deductionSource: row?.deductionSource || "Elden",
        garnishmentSource: row?.garnishmentSource === "ELDEN" ? "Elden" : "Banka",
        legalType: row?.legalType === "HACIZ" ? "HACIZ" : "ICRA",
        reason: controlMode === "FINAL" ? "Son bordro kontrolü" : "Bordro öncesi giriş kontrolü",
      },
      movementEditor: {
        id: "",
        adjustmentType: "Mesai",
        date: dateKey(year, month, 1),
        hourOrDay: "",
        amount: "",
        overtimeMultiplier: 1.5,
        paymentMethod: "Bordro",
        payrollEffect: "Bordroya yansir",
        note: "",
      },
    };
  };

  const alignPrePayrollDialog = (employeeId, resetMain = true) => {
    if (typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const root = document.querySelector(".modal-bg .prepayroll-dialog");
        if (!root) return;
        if (resetMain) {
          const main = root.querySelector(".payroll-final-main");
          if (main) main.scrollTop = 0;
        }
        const buttons = root.querySelectorAll(".payroll-person-rail-list button[data-employee-id]");
        for (const button of buttons) {
          if (button.dataset.employeeId === String(employeeId || "")) {
            button.scrollIntoView({ block: "nearest" });
            break;
          }
        }
      });
    });
  };

  const openPayPlan = (employee, controlMode = "ENTRY_EDIT", payrollRow = null) => {
    if (!employee) return setNotice("Personel seçilmeden kontrol ekranı açılamaz.");
    if (data.close?.isLocked) return setNotice(`${MONTHS[month - 1]} ${year} ayı kilitli. Düzenlemek için önce Kilidi Aç.`);
    setSelectedId(employee.id);
    setModalDraft(prePayrollDraft(employee, controlMode, payrollRow));
    setNotice("");
    setModal("ucret");
    alignPrePayrollDialog(employee.id);
  };

  const switchPayPlanPerson = (employeeId) => {
    if (busy) return;
    const employee = employees.find((item) => item.id === employeeId) || masterEmployees.find((item) => item.id === employeeId);
    if (!employee) return;
    const controlMode = modalDraft.controlMode || "ENTRY_EDIT";
    const payrollRow = controlMode === "ENTRY" ? null : payrollRows.find((item) => item.employee.id === employee.id);
    setSelectedId(employee.id);
    setModalDraft(prePayrollDraft(employee, controlMode, payrollRow));
    setNotice("");
    alignPrePayrollDialog(employee.id);
  };

  const editPrePayrollMovement = (row = null, forcedType = "") => {
    const normalized = normalizeFinanceType(forcedType || row?.type || row?.adjustmentType) || "Mesai";
    const multiplier = normalizeOvertimeMultiplier(row?.overtimeMultiplier || (upper(row?.note).includes("X2") ? 2 : 1.5));
    setModalDraft((old) => ({
      ...old,
      formMessage: "",
      movementEditor: {
        id: row?.id || "",
        adjustmentType: normalized,
        date: row?.date || row?.adjustmentDate || dateKey(year, month, 1),
        hourOrDay: row?.hourOrDay || row?.quantity || "",
        amount: row?.amount || "",
        overtimeMultiplier: multiplier,
        paymentMethod: row?.paymentMethod || (normalized === "Mesai" ? "Bordro" : "Elden"),
        payrollEffect: row?.payrollEffect || "Bordroya yansir",
        note: normalized === "Mesai" ? stripOvertimeMeta(row?.note || row?.description || "") : (row?.note || row?.description || ""),
      },
    }));
  };

  const savePrePayrollMovement = async () => {
    const editor = { ...(modalDraft.movementEditor || {}) };
    if (!modalDraft.id) return setModalDraft((old) => ({ ...old, formMessage: "Personel seçilmeden hareket kaydedilemez." }));
    if (!editor.date || !String(editor.date).startsWith(period)) return setModalDraft((old) => ({ ...old, formMessage: `Hareket tarihi ${MONTHS[month - 1]} ${year} içinde olmalıdır.` }));
    if (editor.adjustmentType === "Mesai") {
      if (num(editor.hourOrDay) <= 0) return setModalDraft((old) => ({ ...old, formMessage: "Mesai saati 0'dan büyük olmalıdır." }));
      editor.amount = overtimeAmountFor(modalDraft.id, editor.hourOrDay, editor.overtimeMultiplier);
      editor.paymentMethod = "Bordro";
    } else if (num(editor.amount) <= 0) {
      return setModalDraft((old) => ({ ...old, formMessage: "Hareket tutarı 0'dan büyük olmalıdır." }));
    }
    setBusy(true);
    try {
      const payload = {
        mainCompanyId: companyId,
        id: editor.id || undefined,
        employeeId: modalDraft.id,
        adjustmentType: editor.adjustmentType,
        date: editor.date,
        hourOrDay: editor.hourOrDay,
        amount: editor.amount,
        overtimeMultiplier: editor.adjustmentType === "Mesai" ? normalizeOvertimeMultiplier(editor.overtimeMultiplier) : undefined,
        overtimeKind: editor.adjustmentType === "Mesai" ? (normalizeOvertimeMultiplier(editor.overtimeMultiplier) === 2 ? "WEEKEND_100" : "WEEKDAY_50") : undefined,
        paymentMethod: editor.paymentMethod,
        payrollEffect: "Bordroya yansir",
        note: editor.note,
      };
      if (payload.id) await updateIkAdvancedFinanceMovement(payload);
      else await saveIkAdvancedFinanceMovement(payload);
      setModalDraft((old) => ({
        ...old,
        formMessage: `${editor.adjustmentType} kaydı kaynağına işlendi ✓`,
        movementEditor: {
          id: "",
          adjustmentType: editor.adjustmentType,
          date: editor.date,
          hourOrDay: "",
          amount: "",
          overtimeMultiplier: editor.overtimeMultiplier || 1.5,
          paymentMethod: editor.adjustmentType === "Mesai" ? "Bordro" : "Elden",
          payrollEffect: "Bordroya yansir",
          note: "",
        },
      }));
      setNotice("");
      await load({ force: true, silent: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, formMessage: error?.message || "Hareket kaydedilemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const deletePrePayrollMovement = async (row) => {
    if (!row?.id || busy) return;
    if (!window.confirm(`${row.type || "Hareket"} kaydı silinsin mi? Bordro yeniden hesaplandığında bu kaynak artık kullanılmayacak.`)) return;
    setBusy(true);
    try {
      await deleteIkAdvancedFinanceMovement({ mainCompanyId: companyId, id: row.id });
      setModalDraft((old) => ({ ...old, formMessage: "Hareket kaynağından silindi ✓" }));
      await load({ force: true, silent: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, formMessage: error?.message || "Hareket silinemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const saveFinalPayrollControl = async () => {
    const editor = { ...(modalDraft.finalEditor || {}) };
    if (!modalDraft.id) return setModalDraft((old) => ({ ...old, formMessage: "Personel seçilmeden son kontrol kaydedilemez." }));
    const desired = {
      salary: Math.max(num(editor.salary), 0),
      road: Math.max(num(editor.road), 0),
      extra: Math.max(num(editor.extra), 0),
      overtime: Math.max(num(editor.overtime), 0),
      advance: Math.max(num(editor.advance), 0),
      deduction: Math.max(num(editor.deduction), 0),
      garnishment: Math.max(num(editor.garnishment), 0),
      bank: Math.max(num(editor.bank), 0),
      cash: Math.max(num(editor.cash), 0),
    };
    const totals = calcRow(desired);
    const desiredBankDeductions = (upper(editor.advanceSource).includes("BANKA") ? desired.advance : 0) + (upper(editor.deductionSource).includes("BANKA") ? desired.deduction : 0) + (upper(editor.garnishmentSource).includes("BANKA") ? desired.garnishment : 0);
    const bankBasis = num(editor.bank) + desiredBankDeductions;
    const split = paymentSplitByType(editor.paymentType || modalDraft.paymentType, totals.net, bankBasis, desiredBankDeductions);
    desired.bank = split.bank;
    desired.cash = split.cash;
    const resolvedPaymentType = split.mode === "BANKA" ? "Banka" : split.mode === "ELDEN" ? "Elden" : "BANKA_ELDEN";

    setBusy(true);
    setModalDraft((old) => ({ ...old, formMessage: "Son kontrol tek işlemde kaynaklara kaydediliyor..." }));
    try {
      const savedFinal = await saveIkAdvancedFinalPayrollControl({
        mainCompanyId: companyId,
        year,
        month,
        employeeId: modalDraft.id,
        expectedVersion: modalDraft.version || "",
        paymentType: resolvedPaymentType,
        salary: desired.salary,
        road: desired.road,
        extra: desired.extra,
        overtime: desired.overtime,
        advance: desired.advance,
        deduction: desired.deduction,
        garnishment: desired.garnishment,
        bank: desired.bank,
        cash: desired.cash,
        advanceSource: editor.advanceSource || "Elden",
        deductionSource: editor.deductionSource || "Elden",
        garnishmentSource: editor.garnishmentSource || "Banka",
        legalType: editor.legalType || "ICRA",
        reason: editor.reason || "Son bordro kontrolü",
      });
      const nextPaymentType = savedFinal?.paymentType || resolvedPaymentType;
      setModalDraft((old) => ({
        ...old,
        version: savedFinal?.version || savedFinal?.updatedAt || old.version,
        salary: desired.salary,
        roadAllowance: desired.road,
        extraPaymentAmount: desired.extra,
        paymentType: nextPaymentType,
        bankAmount: savedFinal?.bankPlan ?? old.bankAmount,
        cashAmount: savedFinal?.cashPlan ?? old.cashAmount,
        finalEditor: { ...old.finalEditor, ...desired, paymentType: nextPaymentType },
        formMessage: "Son bordro kontrolü atomik kaydedildi ✓ Ücret planı, hareket kaynakları ve bordro snapshotı birlikte güncellendi.",
      }));
      setNotice("");
      await load({ force: true, silent: true });
    } catch (error) {
      setModalDraft((old) => ({ ...old, formMessage: error?.message || "Son bordro kontrolü kaydedilemedi." }));
    } finally {
      setBusy(false);
    }
  };

  const openLeave = (kind = "yillik", forced = "", employeeOverride = null) => {
    const targetEmployee = employeeOverride || selected;
    if (!targetEmployee) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(targetEmployee.id);
    setSelectedDays([1]);
    const today = istanbulDateKey();
    const periodStart = dateKey(year, month, 1);
    const startDate = periodStart > today ? periodStart : today;
    setLeaveCalendarMonth(startDate.slice(0, 7));
    setLeaveRangeStep(0);
    setLeavePreview(null);
    setModalDraft({
      employeeId: targetEmployee.id,
      leaveType: "Yillik izin",
      statusType: forced || "Isi vardi - sadece not",
      dayCount: 1,
      hourOrDay: "",
      wageEffect: "Ucretli",
      payrollEffect: "Yok",
      hasDeduction: "Hayir",
      deductionAmount: "",
      documentNo: "",
      note: "",
      startDate,
      endDate: startDate,
      status: startDate > today ? "PLANNED" : "APPROVED",
    });
    setModal(kind);
  };

  const editLeavePlan = (plan) => {
    const employee = masterEmployees.find((item) => item.id === plan.employeeId);
    if (employee) setSelectedId(employee.id);
    setLeavePreview(null);
    setLeaveCalendarMonth(plan.startDate.slice(0, 7));
    setLeaveRangeStep(0);
    setModalDraft({ id: plan.id, employeeId: plan.employeeId, leaveType: plan.recordType || "Yillik izin", startDate: plan.startDate, endDate: plan.returnDate || plan.endDate, status: plan.status, wageEffect: plan.effectType || "Ucretli", payrollEffect: "Yansit", documentNo: plan.documentNo || "", note: plan.note || "" });
    setModal("yillik");
  };

  const openPayroll = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Personel seçilmeden son bordro kontrolü açılamaz.");
    if (data.close?.isLocked) return setNotice(`${MONTHS[month - 1]} ${year} ayı kilitli. Düzenlemek için önce Kilidi Aç.`);
    openPayPlan(row.employee, "FINAL", row);
  };

  const openDocument = (employee = selected) => {
    if (employee?.id) setSelectedId(employee.id);
    setModalDraft({ employeeId: employee?.id || "", documentType: "Personel evragi", note: "" });
    setModal("evrak");
  };

  const openBulkCompensation = () => {
    const initialIds = selected?.id ? [selected.id] : filteredEmployees.map((employee) => employee.id);
    setModalDraft({
      employeeIds: initialIds,
      action: "SALARY_PERCENT",
      percent: 20,
      value: "",
      effectiveDate: istanbulDateKey(),
      note: "",
    });
    setModal("topluUcret");
  };

  const saveBulkCompensation = async () => {
    const employeeIds = safeList(modalDraft.employeeIds);
    if (!employeeIds.length) return setNotice("Toplu düzenleme için en az bir personel seçin.");
    if (modalDraft.action?.endsWith("_PERCENT") && (!Number.isFinite(Number(modalDraft.percent)) || Number(modalDraft.percent) <= -100)) {
      return setNotice("Geçerli bir yüzde değişim girin.");
    }
    if (modalDraft.action === "ROAD_SET" && num(modalDraft.value) < 0) return setNotice("Yol yardımı negatif olamaz.");
    if (!modalDraft.effectiveDate) return setNotice("Geçerlilik tarihi zorunludur.");
    setBusy(true);
    try {
      const result = await saveIkAdvancedBulkCompensation({
        mainCompanyId: companyId,
        employeeIds,
        action: modalDraft.action,
        percent: num(modalDraft.percent),
        value: num(modalDraft.value),
        effectiveDate: modalDraft.effectiveDate,
        note: modalDraft.note || "İK toplu ücret/yol düzenlemesi",
      });
      setModal(null);
      setNotice(`${num(result?.changed)} personelin ücret/yol planı tarihçeli olarak güncellendi.`);
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Toplu ücret/yol düzenlemesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const openBulkPayment = () => {
    setModalDraft({ paymentDate: dateKey(year, month, Math.min(new Date().getDate(), totalDays)), group: "BANK", action: "BANK_LIST", note: "" });
    setModal("topluOdeme");
  };

  const runBulkPayment = () => {
    const groupRows = modalDraft.group === "SELECTED" && selectedPayrollIds.length
      ? payrollRows.filter((row) => selectedPayrollIds.includes(row.employee.id))
      : modalDraft.group === "BANK" ? payrollRows.filter((row) => row.bank > 0)
        : modalDraft.group === "CASH" ? payrollRows.filter((row) => row.cash > 0) : payrollRows;
    if (!groupRows.length) return setNotice("Seçilen grupta ödeme satırı yok.");
    const badRows = groupRows.filter((row) => Math.abs(num(row.diff)) > 0.01);
    if (badRows.length) return setNotice(`${badRows.length} personelde Banka + Elden = Net eşleşmiyor. Çıktı hazırlanmadan önce Son Kontrol ile düzeltin.`);
    if (modalDraft.action === "BANK_LIST") {
      exportRowsToExcelFile(`ik-banka-odeme-${period}.xlsx`, groupRows.map((row) => ({ personel: row.employee.fullName, tcKimlikNo: row.employee.identityNo || "", donem: period, resmiBordroNeti: num(row.employee.sgkNet), bankaOdemesi: row.bank, aciklama: modalDraft.note || `${MONTHS[month - 1]} ${year} ucret odemesi` })));
      setModal(null);
      setNotice("Banka hazırlık Exceli oluşturuldu. Bu işlem bordroyu ödenmiş yapmaz.");
      return;
    }
    setSelectedPayrollIds(groupRows.map((row) => row.employee.id));
    setModal(null);
    setTimeout(printPayrollReport, 0);
  };

  const editFromLog = (log) => {
    if (log.forceDetail) { setModalDraft(log); setModal("logDetay"); return; }
    const text = financeKey(log.text || `${log.actionType || ""} ${log.sourceScreen || ""} ${log.reason || ""}`);
    const employee = masterEmployees.find((item) => item.id === log.employeeId) || selected;
    if (employee?.id) setSelectedId(employee.id);
    if (text.includes("TOPLU") && text.includes("AVANS")) return openFinance("Toplu avans");
    if (text.includes("AVANS")) return openFinance("Avans");
    if (text.includes("HACIZ") || text.includes("HACİZ")) return openFinance("Haciz");
    if (text.includes("ICRA") || text.includes("İCRA")) return openFinance("Icra");
    if ((text.includes("EKSIK") || text.includes("EKSİK")) && (text.includes("GUN") || text.includes("GÜN"))) return openFinance("Eksik gün");
    if ((text.includes("EKSIK") || text.includes("EKSİK")) && text.includes("SAAT")) return openFinance("Eksik saat");
    if (text.includes("DEVAMSIZ") || text.includes("GELMEDI") || text.includes("GELMEDİ")) return openFinance("Eksik gün");
    if (text.includes("KESINT")) return openFinance("Ozel kesinti");
    if (financeKey(text).includes("MESAI")) return openFinance("Mesai");
    if (text.includes("BORDRO") || text.includes("ODEME")) return openPayroll();
    if (text.includes("YILLIK") || text.includes("IZIN") || text.includes("RAPOR") || text.includes("GUNLUK")) {
      return setNotice("Yıllık izin ve resmi izin sicili İK bölümünden yönetilir. Giriş/çıkış, vardiya ve kart hareketleri PDKS bölümündedir.");
    }
    if (DOCUMENT_LOG_WORDS.some((word) => text.includes(word))) return openDocument(employee);
    setModalDraft({ ...log, forceDetail: true });
    return setModal("logDetay");
  };

  const savePerson = async () => {
    const failPersonSave = (message) => {
      setModalDraft((old) => ({ ...old, formMessage: message }));
      setNotice(message);
      return false;
    };
    setModalDraft((old) => ({ ...old, formMessage: "" }));
    if (!modalDraft.fullName?.trim()) return failPersonSave("Personel adı boş olamaz.");
    if (!modalDraft.startDate) return failPersonSave("İşe giriş tarihi zorunludur.");
    if (!data.close?.isLocked && !["SGKLI", "SGKSIZ"].includes(modalDraft.sgkFollow)) return failPersonSave("Bu ay için SGK durumu seçilmelidir.");
    const hasSgkDays = modalDraft.sgkDays !== "" && modalDraft.sgkDays !== null && modalDraft.sgkDays !== undefined;
    if (!data.close?.isLocked && modalDraft.sgkFollow === "SGKLI" && hasSgkDays && (num(modalDraft.sgkDays) < 0 || num(modalDraft.sgkDays) > 30)) {
      return failPersonSave("SGK gün sayısı 0-30 arasında olmalıdır. Resmi gün henüz belli değilse alanı boş bırakabilirsiniz.");
    }
    if (modalDraft.exitDate && modalDraft.exitDate < modalDraft.startDate) return failPersonSave("İşten çıkış tarihi işe giriş tarihinden önce olamaz.");
    const derivedEmploymentStatus = modalDraft.exitDate ? "Pasif" : "Aktif";
    if (!modalDraft.paymentType) return failPersonSave("Ödeme tipi boş olamaz.");
    if (!modalDraft.effectiveDate) return failPersonSave("Ücret/personel değişikliği için geçerlilik tarihi zorunludur.");
    if (num(modalDraft.salary) < 0) return failPersonSave("Maaş negatif olamaz.");
    if (num(modalDraft.overtimeHourlyBase) <= 0) return failPersonSave("Mesai saat böleni 0'dan büyük olmalıdır.");
    if (num(modalDraft.deductionHourlyBase) <= 0) return failPersonSave("Kesinti saat böleni 0'dan büyük olmalıdır.");
    if (!modalDraft.id && data.close?.isLocked) return failPersonSave("Kapalı dönemde yeni personel kartı açılamaz.");

    const normalizedCardNo = String(modalDraft.cardNo || "").trim();
    const duplicateCard = normalizedCardNo && rawEmployees.some((item) => item.id !== modalDraft.id && String(item.cardNo || "").trim() === normalizedCardNo);
    if (duplicateCard) return failPersonSave("Bu kart numarası başka bir personele bağlı.");

    const baseEmployee = modalDraft.baseEmployeeId ? rawEmployees.find((item) => item.id === modalDraft.baseEmployeeId) : null;
    if (modalDraft.baseEmployeeId === modalDraft.id) return failPersonSave("Personel kendisini baz personel olarak seçemez.");
    if (modalDraft.baseEmployeeId && !baseEmployee) return failPersonSave("Baz personel bulunamadı.");

    const sourceExtra = Math.max(num(modalDraft.extraPaymentAmount), 0);
    const sourcePlanEarnings = calcRow({
      salary: modalDraft.salary,
      road: modalDraft.roadAllowance,
      extra: sourceExtra,
    }).hakedis;
    const sourcePayment = paymentSplitByType(modalDraft.paymentType, sourcePlanEarnings, modalDraft.bankAmount);

    const cardPayload = {
      mainCompanyId: companyId,
      expectedVersion: modalDraft.version || "",
      fullName: modalDraft.fullName,
      personelKodu: modalDraft.code,
      cardNo: modalDraft.cardNo,
      identityNo: modalDraft.identityNo,
      personnelStatus: modalDraft.personnelStatus || "NORMAL",
      period,
      year,
      month,
      skipPeriodCompliance: Boolean(data.close?.isLocked),
      sgkFollow: modalDraft.sgkFollow === "SGKLI",
      sgkDays: modalDraft.sgkFollow === "SGKLI" ? (hasSgkDays ? Math.round(num(modalDraft.sgkDays)) : null) : 0,
      sgkDaySource: modalDraft.sgkDaySourceIntent || modalDraft.sgkDaySource || "MANUEL",
      sgkNote: `[KYERP:SGK_SOURCE=${modalDraft.sgkDaySourceIntent || modalDraft.sgkDaySource || "MANUEL"}]`,
      preservePeriodCompliance: modalDraft.sgkDaySource === "RESMI_BORDRO",
      paymentType: modalDraft.paymentType,
      salary: num(modalDraft.salary),
      roadAllowance: num(modalDraft.roadAllowance),
      bankAmount: sourcePayment.bank,
      cashAmount: sourcePayment.cash,
      baseEmployeeId: modalDraft.baseEmployeeId || "",
      extraPaymentLabel: "EK",
      extraPaymentAmount: sourceExtra,
      overtimeHourlyBase: num(modalDraft.overtimeHourlyBase) || 225,
      deductionHourlyBase: num(modalDraft.deductionHourlyBase) || 300,
      payrollIncluded: modalDraft.payrollIncluded !== false,
      hireDate: modalDraft.startDate,
      exitDate: modalDraft.exitDate,
      title: modalDraft.title,
      department: modalDraft.department,
      annualLeaveEntitlement: num(modalDraft.annualLeaveEntitlement),
      annualLeaveCarryover: num(modalDraft.annualLeaveCarryover),
      activePassive: derivedEmploymentStatus,
      status: derivedEmploymentStatus,
      note: modalDraft.note,
      phone: modalDraft.phone,
      effectiveDate: modalDraft.effectiveDate || istanbulDateKey(),
      changeNote: modalDraft.changeNote || "",
    };

    setBusy(true);
    setModalDraft((old) => ({ ...old, formMessage: "Kaydediliyor..." }));
    let createdEmployeeId = "";
    try {
      let employeeId = modalDraft.id;
      if (!employeeId) {
        const created = await createIkAdvancedPerson({
          mainCompanyId: companyId,
          fullName: modalDraft.fullName,
          code: modalDraft.code,
          department: modalDraft.department,
          title: modalDraft.title,
          workType: "AYLIK",
          sgkStatus: modalDraft.sgkFollow === "SGKLI" ? "VAR" : "YOK",
          status: derivedEmploymentStatus,
          hireDate: modalDraft.startDate,
          salary: num(modalDraft.salary),
          roadAllowance: num(modalDraft.roadAllowance),
          bankPaymentType: modalDraft.paymentType,
          bankAmount: sourcePayment.bank,
          cashAmount: sourcePayment.cash,
          overtimeHourlyBase: num(modalDraft.overtimeHourlyBase) || 225,
          annualLeaveEntitlement: num(modalDraft.annualLeaveEntitlement),
          annualLeaveCarryover: num(modalDraft.annualLeaveCarryover),
          note: modalDraft.note,
        });
        employeeId = created?.id || created?.employeeId || "";
        createdEmployeeId = employeeId;
        if (!employeeId) throw new Error("Yeni personel kimliği alınamadı.");
        cardPayload.personelKodu = created?.code || modalDraft.code;
        cardPayload.expectedVersion = created?.version || created?.updatedAt || "";
      }

      const savedCard = await saveIkAdvancedPersonCard(employeeId, cardPayload);
      const successMessage = savedCard?.periodComplianceSkipped
        ? `Kaydedildi ✓ ${MONTHS[month - 1]} ${year} dönemi kapalı olduğu için dönemsel SGK alanlarına dokunulmadı.`
        : "Kaydedildi ✓";
      setSelectedId(employeeId);
      setModalDraft((old) => ({
        ...old,
        id: employeeId,
        code: savedCard?.code || cardPayload.personelKodu || old.code,
        version: savedCard?.version || savedCard?.updatedAt || old.version,
        extraPaymentAmount: sourceExtra,
        bankAmount: sourcePayment.bank,
        cashAmount: sourcePayment.cash,
        formMessage: successMessage,
        changeNote: "",
      }));
      setNotice("");
      await load({ force: true, silent: true });
    } catch (error) {
      const detail = error?.message || "Personel kartı kaydedilemedi.";
      const message = createdEmployeeId ? `Personel ana kaydı oluştu ancak kart ayrıntıları tamamlanamadı: ${detail}` : detail;
      setModalDraft((old) => ({ ...old, formMessage: message }));
      setNotice(message);
    } finally {
      setBusy(false);
    }
  };

  const overtimeAmountFor = (employeeId, hours, multiplier) => {
    const employee = rawEmployees.find((item) => item.id === employeeId);
    if (!employee) return 0;
    const baseSalary = num(employee.salary);
    const divisor = num(employee.overtimeHourlyBase || employee.overtimeBaseHours) || 225;
    if (baseSalary <= 0 || divisor <= 0 || num(hours) <= 0) return 0;
    return round((baseSalary / divisor) * num(hours) * normalizeOvertimeMultiplier(multiplier));
  };

  const absenceDeductionFor = (employeeId, mode, hoursValue) => {
    const employee = rawEmployees.find((item) => item.id === employeeId);
    const salary = num(employee?.salary);
    const road = num(employee?.roadAllowance);
    const deductionDivisor = num(employee?.deductionHourlyBase) || 300;
    const salaryDaily = salary > 0 ? round(salary / 30) : 0;
    const roadDaily = road > 0 ? round(road / 30) : 0;
    if (mode === "Eksik gün") {
      return { mode, hours: 10, deductionDivisor, salaryHourly: deductionDivisor > 0 ? round(salary / deductionDivisor) : 0, salaryCut: salaryDaily, roadDaily, roadCut: roadDaily, total: round(salaryDaily + roadDaily) };
    }
    const hours = Math.max(0, Math.min(num(hoursValue), 10));
    const salaryHourly = deductionDivisor > 0 ? round(salary / deductionDivisor) : 0;
    const salaryCut = round(salaryHourly * hours);
    const roadCut = hours >= 10 ? roadDaily : 0;
    return { mode, hours, deductionDivisor, salaryHourly, salaryCut, roadDaily, roadCut, total: round(salaryCut + roadCut) };
  };

  const validateFinance = (draft = modalDraft) => {
    if (draft.adjustmentType !== "Toplu avans" && !draft.employeeId) return "Personel secilmeden kayit yapilamaz.";
    if (draft.adjustmentType === "Toplu avans" && !safeList(draft.employeeIds).length) return "En az 1 personel secilmelidir.";
    if (!draft.date) return "Tarih secilmeden kayit yapilamaz.";
    if (draft.adjustmentType === "Mesai" && num(draft.hourOrDay) <= 0) return "Mesai saati 0 dan buyuk olmalidir.";
    if (draft.adjustmentType === "Eksik gün" && num(draft.amount) <= 0) return "Eksik gun kesintisi hesaplanamadi.";
    if (draft.adjustmentType === "Eksik saat" && (num(draft.hourOrDay) <= 0 || num(draft.hourOrDay) > 10)) return "Eksik saat 0 dan buyuk ve en fazla 10 saat olmalidir.";
    if (num(draft.amount) <= 0) return "Tutar bos veya negatif olamaz.";
    if (num(draft.hourOrDay) < 0) return "Saat / gun negatif olamaz.";
    const duplicate = movements.some((item) => item.id !== draft.id && item.employeeId === draft.employeeId && (item.date || item.adjustmentDate) === draft.date && num(item.amount) === num(draft.amount) && item.type === draft.adjustmentType);
    if (duplicate && !window.confirm("Ayni gun ayni tutarda kayit var. Yine de kaydedilsin mi?")) return "Kayit iptal edildi.";
    return "";
  };

  const saveFinance = async () => {
    let draft = { ...modalDraft };
    if (draft.adjustmentType === "Mesai") {
      const multiplier = normalizeOvertimeMultiplier(draft.overtimeMultiplier);
      const amount = overtimeAmountFor(draft.employeeId, draft.hourOrDay, multiplier);
      draft = {
        ...draft,
        amount,
        overtimeMultiplier: multiplier,
        overtimeKind: multiplier === 2 ? "WEEKEND_100" : "WEEKDAY_50",
        paymentMethod: "Bordro",
        payrollEffect: "Bordroya yansir",
      };
    }
    if (draft.adjustmentType === "Eksik gün" || draft.adjustmentType === "Eksik saat") {
      const absence = absenceDeductionFor(draft.employeeId, draft.adjustmentType, draft.hourOrDay);
      draft = {
        ...draft,
        hourOrDay: draft.adjustmentType === "Eksik gün" ? 1 : absence.hours,
        amount: absence.total,
        payrollEffect: "Bordroya yansir",
      };
    }
    const validationError = validateFinance(draft);
    if (validationError) return setNotice(validationError);
    setBusy(true);
    try {
      const payload = {
        mainCompanyId: companyId,
        id: draft.id || undefined,
        adjustmentType: draft.adjustmentType,
        date: draft.date,
        hourOrDay: draft.hourOrDay,
        amount: draft.amount,
        overtimeMultiplier: draft.overtimeMultiplier,
        overtimeKind: draft.overtimeKind,
        paymentMethod: draft.paymentMethod,
        payrollEffect: draft.payrollEffect,
        note: draft.note,
        status: draft.status,
      };
      if (draft.adjustmentType === "Toplu avans") payload.employeeIds = safeList(draft.employeeIds);
      else payload.employeeId = draft.employeeId;
      if (payload.id) await updateIkAdvancedFinanceMovement(payload);
      else await saveIkAdvancedFinanceMovement(payload);
      setModal(null);
      setNotice(payload.adjustmentType === "Mesai"
        ? `${overtimeTypeLabel(payload.overtimeMultiplier)} mesai kaydı doğru personele kaydedildi.`
        : "Hareket doğru personele kaydedildi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Hareket kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const deleteFinance = async (row) => {
    if (!row?.id) return;
    if (row.payrollEffect && !window.confirm("Bu kayit bordroya yansimis. Silerseniz bordro yeniden hesaplanmalidir. Devam edilsin mi?")) return;
    if (!window.confirm("Bu islem kaydi silinecek. Emin misiniz?")) return;
    setBusy(true);
    try {
      await deleteIkAdvancedFinanceMovement({ mainCompanyId: companyId, id: row.id });
      setNotice("Hareket silindi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Hareket silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveLeave = async () => {
    if (!modalDraft.employeeId) return setNotice("Personel secilmeden kayit yapilamaz.");
    if (modal === "yillik" && (!modalDraft.startDate || !modalDraft.endDate)) return setNotice("Izin baslangic ve bitis tarihleri zorunludur.");
    if (modal === "gunluk" && !selectedDays.length) return setNotice("Gun secilmeden kayit yapilamaz.");
    if (modal === "gunluk" && modalDraft.payrollEffect !== "Yok") return setNotice("Gunluk durum kaydi bordro kesintisi yapmaz. Devamsizlik icin Mesai / Avans / Kesinti ekranindaki Devamsizlik Kesintisi kullanilmalidir.");
    setBusy(true);
    try {
      const recordType = modal === "yillik" ? modalDraft.leaveType : modalDraft.statusType;
      const officialLeave = modal === "yillik" || ["Rapor", "Normal izin", "Ucretsiz izin", "Dogum izni", "Olum izni"].includes(recordType);
      if (officialLeave) {
        const preview = modal === "yillik" ? (leavePreview || await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate: modalDraft.endDate, recordType })) : null;
        if (preview?.hasCriticalConflict) return setNotice("Bu personelin ayni tarihlerde baska izin kaydi var. Kayit engellendi.");
        let advanceLeaveReason = "";
      if (modal === "yillik" && modalDraft.status !== "PLANNED" && num(preview?.annualExcessDays) > 0) {
        advanceLeaveReason = window.prompt(`${preview.annualExcessDays} gün hak aşımı: Avans izin olarak kaydedilsin mi? (Maaş kesintisi yapılmaz.) Gerekçeyi yazın:`, "") || "";
        if (!advanceLeaveReason.trim()) return setNotice("Eksi izin / avans izin için gerekçe zorunludur; yıllık izin kaydı yapılmadı.");
      }
        const allowDepartmentConflict = preview?.hasDepartmentWarning ? window.confirm("Ayni bolumde izin cakismasi var. Yetkili onayiyla devam edilsin mi?") : false;
        if (preview?.hasDepartmentWarning && !allowDepartmentConflict) return;
        await saveIkAdvancedLeave({
          mainCompanyId: companyId,
          employeeId: modalDraft.employeeId,
          dates: modal === "gunluk" ? selectedDays.map((day) => dateKey(year, month, day)) : undefined,
          startDate: modal === "yillik" ? modalDraft.startDate : dateKey(year, month, selectedDays[0]),
          endDate: modal === "yillik" ? modalDraft.endDate : dateKey(year, month, selectedDays[selectedDays.length - 1]),
          returnDate: modal === "yillik" ? modalDraft.endDate : undefined,
          dayCount: modal === "yillik" ? preview?.countedDays : undefined,
          recordType,
          status: modal === "yillik" ? modalDraft.status : "TAKEN",
          effectType: modalDraft.wageEffect,
          hourOrDay: modalDraft.hourOrDay,
          payrollEffect: modalDraft.payrollEffect,
          deductionAmount: num(modalDraft.deductionAmount),
          documentId: modalDraft.documentNo,
          documentNo: modalDraft.documentNo,
          note: modalDraft.note,
          allowDepartmentConflict,
          allowAdvanceLeave: Boolean(advanceLeaveReason),
          advanceLeaveReason,
        });
      } else {
        for (const day of selectedDays) await saveIkAdvancedException({
          mainCompanyId: companyId, employeeId: modalDraft.employeeId, workDate: dateKey(year, month, day), recordType,
          status: recordType, dayCount: 1, hourOrDay: modalDraft.hourOrDay, payrollEffect: "Yok",
          deductionAmount: 0, documentId: modalDraft.documentNo, note: modalDraft.note, source: "MANUAL",
        });
      }
      setModal(null);
      setLeavePreview(null);
      setNotice(modal === "yillik" ? "Izin kaydi ve gun hesaplamasi tamamlandi." : "Gunluk kayit tamamlandi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Kayit yapilamadi.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (modal !== "yillik") return undefined;
    const leaveId = modalDraft.id || "";
    const employeeId = modalDraft.employeeId;
    const startDate = modalDraft.startDate;
    const returnDate = modalDraft.endDate;
    const recordType = modalDraft.leaveType || "Yillik izin";
    if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
      setLeavePreview(null);
      return undefined;
    }
    const seq = ++leaveAutoPreviewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewIkAdvancedLeave({
          mainCompanyId: companyId,
          id: leaveId,
          employeeId,
          startDate,
          endDate: returnDate,
          returnDate,
          recordType,
        });
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(result);
        setNotice("");
      } catch (error) {
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(null);
        setNotice(error?.message || "İzin günleri hesaplanamadı. Tarihleri kontrol edip tekrar deneyin.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [modal, modalDraft.id, modalDraft.employeeId, modalDraft.startDate, modalDraft.endDate, modalDraft.leaveType, companyId]);

  const saveLeavePolicy = async () => {
    setBusy(true);
    try {
      const result = await saveIkAdvancedLeavePolicy({ mainCompanyId: companyId, ...policyDraft });
      setPolicyDraft(result?.policy || { countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 });
      setNotice("Sirket izin gun sayim ayarlari kaydedildi.");
      await load({ force: true });
    } catch (error) { setNotice(error?.message || "Izin ayarlari kaydedilemedi."); } finally { setBusy(false); }
  };

  const runQuickLeavePreview = async () => {
    if (!leaveSelected?.id) return setNotice("Önce personel seçin.");
    if (!quickLeaveDraft.startDate || !quickLeaveDraft.returnDate || quickLeaveDraft.returnDate <= quickLeaveDraft.startDate) {
      return setNotice("İzne çıkış ve işe dönüş tarihlerini kontrol edin.");
    }
    setBusy(true);
    try {
      const result = await previewIkAdvancedLeave({
        mainCompanyId: companyId,
        employeeId: leaveSelected.id,
        startDate: quickLeaveDraft.startDate,
        endDate: quickLeaveDraft.returnDate,
        returnDate: quickLeaveDraft.returnDate,
        recordType: "Yillik izin",
      });
      setQuickLeavePreview(result);
      setNotice("");
      return result;
    } catch (error) {
      setQuickLeavePreview(null);
      setNotice(error?.message || "İzin hesabı yapılamadı.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveQuickLeave = async () => {
    if (!leaveSelected?.id) return setNotice("Önce personel seçin.");
    setBusy(true);
    try {
      const preview = quickLeavePreview || await previewIkAdvancedLeave({
        mainCompanyId: companyId,
        employeeId: leaveSelected.id,
        startDate: quickLeaveDraft.startDate,
        endDate: quickLeaveDraft.returnDate,
        returnDate: quickLeaveDraft.returnDate,
        recordType: "Yillik izin",
      });
      if (preview?.hasCriticalConflict) return setNotice("Bu personelin aynı tarihlerde başka izin kaydı var. Kayıt engellendi.");
      if (quickLeaveDraft.status !== "PLANNED" && num(preview?.annualExcessDays) > 0 && (!quickLeaveDraft.advanceLeaveApproved || !quickLeaveDraft.advanceLeaveReason.trim())) {
        return setNotice("Hak aşımı " + num(preview.annualExcessDays) + " gün. Avans izin onayını ve gerekçesini doldurun; otomatik maaş kesilmez.");
      }
      const allowDepartmentConflict = preview?.hasDepartmentWarning ? window.confirm("Aynı bölümde izin çakışması var. Yetkili onayıyla devam edilsin mi?") : false;
      if (preview?.hasDepartmentWarning && !allowDepartmentConflict) return;
      const saved = await saveIkAdvancedLeave({
        mainCompanyId: companyId,
        employeeId: leaveSelected.id,
        startDate: quickLeaveDraft.startDate,
        endDate: quickLeaveDraft.returnDate,
        returnDate: quickLeaveDraft.returnDate,
        recordType: "Yillik izin",
        status: quickLeaveDraft.status,
        effectType: "Ucretli",
        documentNo: "",
        note: quickLeaveDraft.note,
        allowDepartmentConflict,
        allowAdvanceLeave: quickLeaveDraft.status !== "PLANNED" && quickLeaveDraft.advanceLeaveApproved === true,
        advanceLeaveReason: quickLeaveDraft.advanceLeaveReason,
      });
      setQuickLeavePreview(null);
      setLeaveDetailPlanId(saved?.planId || "");
      setNotice("Yıllık izin kaydı gün gün hesaplanarak kaydedildi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Yıllık izin kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveLeaveProfile = async () => {
    if (!leaveSelected?.id) return setNotice("Önce personel seçin.");
    setBusy(true);
    try {
      await saveIkAdvancedLeaveProfile({
        mainCompanyId: companyId,
        employeeId: leaveSelected.id,
        birthDate: leaveProfileDraft.birthDate,
        annualLeaveEntitlement: leaveProfileDraft.annualLeaveEntitlement,
        annualLeaveCarryover: leaveProfileDraft.annualLeaveCarryover,
        adjustmentDays: leaveProfileDraft.adjustmentDays,
        adjustmentReason: leaveProfileDraft.adjustmentReason,
        adjustmentDate: istanbulDateKey(),
        userName: user?.fullName || user?.name || user?.email || "IK",
      });
      setNotice("İzin hesabı, doğum tarihi ve gerekçeli bakiye bilgileri kaydedildi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "İzin hesap ayarları kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveLeaveCashRequest = async () => {
    if (!leaveSelected?.id) return setNotice("Önce personel seçin.");
    if (num(leaveCashDraft.requestedDays) <= 0) return setNotice("Talep edilen gün sıfırdan büyük olmalıdır.");
    setBusy(true);
    try {
      const saved = await saveIkAdvancedLeaveCashRequest({
        mainCompanyId: companyId,
        employeeId: leaveSelected.id,
        requestType: leaveCashDraft.requestType,
        requestDate: leaveCashDraft.requestDate,
        requestedDays: num(leaveCashDraft.requestedDays),
        note: leaveCashDraft.note,
        status: "REQUESTED",
        userName: user?.fullName || user?.name || user?.email || "IK",
      });
      setLeaveCashDraft((old) => ({ ...old, requestedDays: "", note: "" }));
      setNotice("İzin ücreti talebi kaydedildi. Yıllık izin bakiyesi değiştirilmedi. Referans tutar: " + money(saved?.referenceAmount));
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "İzin ücreti talebi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const updateLeaveCashRequestStatus = async (request, status) => {
    setBusy(true);
    try {
      await saveIkAdvancedLeaveCashRequest({
        mainCompanyId: companyId,
        id: request.id,
        employeeId: request.employeeId,
        requestType: request.requestType,
        requestDate: request.requestDate,
        requestedDays: request.requestedDays,
        note: request.note,
        decisionNote: request.decisionNote,
        status,
        userName: user?.fullName || user?.name || user?.email || "IK",
      });
      setNotice("İzin ücreti talep durumu güncellendi; izin bakiyesine düşüm yapılmadı.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Talep durumu güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const cancelLeave = async (plan) => {
    const reason = window.prompt(`${plan.fullName} izin kaydi iptal edilecek. Iptal aciklamasi:`, "Plan degisikligi");
    if (reason === null) return;
    setBusy(true);
    try { await cancelIkAdvancedLeave({ mainCompanyId: companyId, id: plan.id, reason }); setNotice("Izin iptal edildi; resmi kayit ve puantaj etkisi geri alindi."); await load({ force: true }); }
    catch (error) { setNotice(error?.message || "Izin iptal edilemedi."); } finally { setBusy(false); }
  };

  const refreshPayroll = async () => {
    setBusy(true);
    try {
      const result = await getIkAdvancedPayroll(params({ mainCompanyId: companyId, year, month }));
      setPayrollData(result || null);
      setNotice("Bordro hesaplandi.");
    } catch (error) {
      setNotice(error?.message || "Bordro hesaplanamadi.");
    } finally {
      setBusy(false);
    }
  };

  const savePayroll = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Kaydedilecek bordro satırı bulunamadı.");
    const badRows = rows.filter((row) => Math.abs(num(row.diff)) > 0.01);
    if (badRows.length) return setNotice(`${badRows.length} personelde Banka + Elden = Net eşleşmiyor. Önce Son Kontrol ile düzeltin.`);
    setBusy(true);
    try {
      for (const row of rows) {
        await saveIkAdvancedFinalPayrollControl({
          mainCompanyId: companyId, year, month, employeeId: row.employee.id,
          salary: row.salary, road: row.road, extra: row.extra, overtime: row.overtime,
          advance: row.advance, deduction: row.deduction, garnishment: row.garnishment,
          bank: row.bank, cash: row.cash,
          advanceSource: row.advanceSource || "Elden",
          deductionSource: row.deductionSource || "Elden",
          garnishmentSource: row.garnishmentSource === "ELDEN" ? "Elden" : "Banka",
          legalType: row.legalType === "HACIZ" ? "HACIZ" : "ICRA",
          reason: "Aylık bordro sabitleme",
        });
      }
      await saveIkAdvancedPayrollLines({ mainCompanyId: companyId, year, month, employeeIds: rows.map((row) => row.employee.id), status: "CALCULATED", reason: "Bordro kaydı" });
      setNotice(`${rows.length} personelin bordro ara kaydı güncellendi. Ay kilidi açık olduğu sürece düzenleme devam edebilir.`);
      await load({ force: true, prepare: true });
    } catch (error) {
      setNotice(error?.message || "Bordro kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const previewPayrollFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const previews = [];
      for (const file of files) previews.push(await previewIkAdvancedSgk(file, { mainCompanyId: companyId, year, month }));
      const undetectedPeriod = previews.find((item) => item.periodDetected === false);
      if (undetectedPeriod) throw new Error(`${undetectedPeriod.fileName} dosyasında bordro dönemi tespit edilemedi. Dosya başlığında veya adında ay/yıl bilgisi olmalıdır.`);
      const wrongPeriod = previews.find((item) => !item.periodMatches);
      if (wrongPeriod) throw new Error(`${wrongPeriod.fileName} dosyası ${wrongPeriod.month}/${wrongPeriod.year} dönemine ait. Seçili dönem ${month}/${year}.`);
      const rows = previews.flatMap((item) => safeList(item.rows));
      setSgkPreview({ files: previews.map((item) => item.fileName), workplaces: previews.map((item) => item.workplace).filter(Boolean), rows });
      setModal("sgkImport");
      setNotice(`${files.length} bordro dosyasi okundu; ${rows.filter((row) => row.employeeId).length} satir sirket personeliyle eslesti.`);
    } catch (error) {
      setNotice(error?.message || "Bordro dosyasi okunamadi.");
    } finally {
      setBusy(false);
      if (payrollInput.current) payrollInput.current.value = "";
    }
  };

  const updateSgkPreviewRow = (index, patch) => setSgkPreview((old) => ({ ...old, rows: safeList(old?.rows).map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));

  const confirmPayrollFiles = async () => {
    const rows = safeList(sgkPreview?.rows).filter((row) => row.selected && row.employeeId);
    if (!rows.length) return setNotice("Aktarilacak en az bir sirket personeli secilmelidir.");
    setBusy(true);
    try {
      const result = await confirmIkAdvancedSgk({ mainCompanyId: companyId, year, month, fileName: safeList(sgkPreview?.files).join(" + "), rows });
      setModal(null);
      setSgkPreview(null);
      setNotice(`${result?.matched || rows.length} personelin resmi bordro verisi kaydedildi. Banka listesi Net Istihkak alanindan hazirlanacak.`);
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Bordro onayi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (file) => {
    if (!file) return;
    const employeeId = modalDraft.employeeId || selected?.id;
    if (!employeeId) return setNotice("Evrak yuklemek icin personel secilmelidir.");
    setBusy(true);
    try {
      await uploadIkAdvancedDocument(file, { mainCompanyId: companyId, year, month, employeeId, documentType: modalDraft.documentType || "Personel evragi", note: modalDraft.note || "" });
      setModal(null);
      setNotice("Evrak yuklendi.");
      await load({ force: true });
    } catch (error) {
      setNotice(error?.message || "Evrak yuklenemedi.");
    } finally {
      setBusy(false);
      if (documentInput.current) documentInput.current.value = "";
    }
  };

  const runClose = async (mode = "CHECK") => {
    const action = mode === true ? "LOCK" : mode === false ? "CHECK" : String(mode || "CHECK").toUpperCase();
    const lock = action === "LOCK";
    const unlock = action === "UNLOCK";
    if (lock && !window.confirm(`${MONTHS[month - 1]} ${year} ayı KİLİTLENECEK. Bordro, hareket ve izin kayıtları düzenlemeye kapanacak. Onaylıyor musunuz?`)) return;
    if (unlock && !window.confirm(`${MONTHS[month - 1]} ${year} ayının KİLİDİ AÇILACAK. Bordro, hareket ve izin kayıtları yeniden düzenlenebilir olacak. Onaylıyor musunuz?`)) return;
    setBusy(true);
    try {
      const result = await runIkAdvancedCloseCheck({
        mainCompanyId: companyId,
        year,
        month,
        lock,
        unlock,
        reason: lock
          ? "Yetkili kullanıcı ayı kilitledi."
          : unlock
            ? "Yetkili kullanıcı ay kilidini açtı."
            : "Ay sonu kontrolü",
      });
      setData((old) => ({ ...old, close: { ...(old.close || {}), ...result }, checks: result?.checks || old.checks }));
      setNotice(lock
        ? "Ay kilitlendi. Düzenleme kapandı; çıktılar alınabilir."
        : unlock
          ? "Ay kilidi açıldı. Bordro ve aylık kaynaklar yeniden düzenlenebilir."
          : "Ay sonu kontrolü çalıştırıldı.");
      if (lock || unlock) await load({ force: true, silent: true });
    } catch (error) {
      setNotice(error?.message || (lock ? "Ay kilitlenemedi." : unlock ? "Ay kilidi açılamadı." : "Ay sonu kontrolü çalışmadı."));
    } finally {
      setBusy(false);
    }
  };

  const validatePayrollOutput = async (rows) => {
    const targetRows = safeList(rows);
    if (!targetRows.length) { setNotice("Bordro çıktısı için personel bulunamadı."); return false; }
    if (!periodPrepared) { setNotice("Önce seçili bordro dönemini hazırlayın."); return false; }
    const badRows = targetRows.filter((row) => Math.abs(num(row.diff)) > 0.01);
    if (badRows.length) {
      setNotice(`${badRows.length} personelde Banka + Elden = Net eşleşmiyor. Çıktı alınmadan önce Son Kontrol ile düzeltin.`);
      return false;
    }
    return true;
  };

  const exportPayroll = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Ödeme listesi için personel bulunamadı.");
    if (!(await validatePayrollOutput(rows, "Ödeme listesi Excel çıktısı"))) return;
    const totals = rows.reduce((sum, row) => ({
      salary: sum.salary + row.salary,
      road: sum.road + row.road,
      extra: sum.extra + row.extra,
      overtime: sum.overtime + row.overtime,
      advance: sum.advance + row.advance,
      deduction: sum.deduction + row.deduction,
      garnishment: sum.garnishment + row.garnishment,
      bank: sum.bank + row.bank,
      cash: sum.cash + row.cash,
      net: sum.net + row.net,
    }), { salary: 0, road: 0, extra: 0, overtime: 0, advance: 0, deduction: 0, garnishment: 0, bank: 0, cash: 0, net: 0 });
    const excelRows = rows.map((row) => ({
      personel: row.employee.fullName,
      hkn: row.employee.code || "",
      maas: row.salary,
      yol: row.road,
      ek: row.extra,
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      icraHaciz: row.garnishment,
      banka: row.bank,
      elden: row.cash,
      toplamOdeme: row.net,
      durum: row.diff === 0 ? "Dengeli" : "Kontrol",
    }));
    excelRows.push({
      personel: "TOPLAM",
      hkn: "",
      maas: totals.salary,
      yol: totals.road,
      ek: totals.extra,
      mesai: totals.overtime,
      avans: totals.advance,
      kesinti: totals.deduction,
      icraHaciz: totals.garnishment,
      banka: totals.bank,
      elden: totals.cash,
      toplamOdeme: totals.net,
      durum: "",
    });
    exportRowsToExcelFile(`ik-odeme-listesi-${period}.xlsx`, excelRows);
    setNotice(`${rows.length} personelin ödeme listesi Excel'e hazırlandı; en altta sütun toplamları var.`);
  };

  const printMonthlyControlReport = async () => {
    const rows = payrollRows;
    if (!periodPrepared) return setNotice("Aylık kontrol çıktısı için önce seçili bordro dönemini hazırlayın.");
    if (!rows.length) return setNotice("Aylık kontrol çıktısı için personel bulunamadı.");

    const totals = rows.reduce((sum, row) => ({
      salary: sum.salary + num(row.salary),
      road: sum.road + num(row.road),
      extra: sum.extra + num(row.extra),
      overtime: sum.overtime + num(row.overtime),
      hakedis: sum.hakedis + num(row.hakedis),
      advance: sum.advance + num(row.advance),
      deduction: sum.deduction + num(row.deduction),
      garnishment: sum.garnishment + num(row.garnishment),
      totalDeduction: sum.totalDeduction + num(row.advance) + num(row.deduction) + num(row.garnishment),
      bank: sum.bank + num(row.bank),
      cash: sum.cash + num(row.cash),
      net: sum.net + num(row.net),
    }), { salary: 0, road: 0, extra: 0, overtime: 0, hakedis: 0, advance: 0, deduction: 0, garnishment: 0, totalDeduction: 0, bank: 0, cash: 0, net: 0 });

    const periodLabel = `${MONTHS[month - 1]} ${year}`;
    const rowCount = rows.length;
    const density = rowCount <= 20 ? "normal" : rowCount <= 26 ? "tight" : "ultra";
    const printScale = Math.min(1, 19 / Math.max(19, rowCount));
    const sheetWidth = 100 / printScale;

    const html = `<html><head><meta charset="utf-8"><style>
      @page{size:A4 landscape;margin:3mm}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#14263a}
      .sheet{width:${sheetWidth.toFixed(3)}%;zoom:${printScale.toFixed(3)}}
      .head{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:0 0 3mm;padding-bottom:1.5mm;border-bottom:1px solid #9aabbc}
      h1{font-size:10pt;line-height:1;margin:0}
      .sub{font-size:6.2pt;color:#60758a;margin-top:1mm}
      .count{font-size:6.5pt;font-weight:700;white-space:nowrap}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      col.person{width:15%}
      col.amount{width:7.08%}
      thead{display:table-header-group}
      tr{break-inside:avoid;page-break-inside:avoid}
      th,td{border:0.5px solid #aebdcc;text-align:right;vertical-align:middle;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
      th{background:#edf3f8;text-align:center;font-weight:800}
      td.person{text-align:left;font-weight:700}
      td.person small{display:block;font-weight:400;color:#6b7c8e;margin-top:.25mm}
      .total td{font-weight:900;background:#eaf1f7;border-top:1.4px solid #14263a}
      body.normal th,body.normal td{font-size:6.4pt;padding:1.45mm 1.1mm;line-height:1.08}
      body.normal td.person small{font-size:5.1pt}
      body.tight th,body.tight td{font-size:5.75pt;padding:1.0mm .8mm;line-height:1.04}
      body.tight td.person small{font-size:4.7pt}
      body.ultra th,body.ultra td{font-size:5.0pt;padding:.65mm .55mm;line-height:1}
      body.ultra td.person small{font-size:4.2pt}
      @media print{
        .sheet{page-break-inside:avoid;break-inside:avoid}
      }
    </style></head><body class="${density}">
      <div class="sheet">
        <div class="head">
          <div><h1>Aylık İK Kontrol Çıktısı</h1><div class="sub">${escapeHtml(periodLabel)} · yalnız kontrol amaçlıdır; ödeme/final işlemi yapmaz.</div></div>
          <div class="count">${rowCount} personel</div>
        </div>
        <table>
          <colgroup>
            <col class="person">
            ${Array.from({ length: 12 }).map(() => '<col class="amount">').join("")}
          </colgroup>
          <thead><tr>
            <th>Personel / HKN</th>
            <th>Maaş</th><th>Yol</th><th>EK</th><th>Mesai</th><th>Hak Ediş</th>
            <th>Avans</th><th>Kesinti</th><th>İcra/Haciz</th><th>Top. Kesinti</th>
            <th>Banka</th><th>Elden</th><th>Net</th>
          </tr></thead>
          <tbody>
            ${rows.map((row) => {
              const totalDeduction = num(row.advance) + num(row.deduction) + num(row.garnishment);
              return `<tr>
                <td class="person">${escapeHtml(row.employee.fullName)}<small>${escapeHtml(row.employee.code || "-")}</small></td>
                <td>${money(row.salary)}</td><td>${money(row.road)}</td><td>${money(row.extra)}</td><td>${money(row.overtime)}</td><td>${money(row.hakedis)}</td>
                <td>${money(row.advance)}</td><td>${money(row.deduction)}</td><td>${money(row.garnishment)}</td><td>${money(totalDeduction)}</td>
                <td>${money(row.bank)}</td><td>${money(row.cash)}</td><td><b>${money(row.net)}</b></td>
              </tr>`;
            }).join("")}
            <tr class="total">
              <td class="person">GENEL TOPLAM · ${rowCount} kişi</td>
              <td>${money(totals.salary)}</td><td>${money(totals.road)}</td><td>${money(totals.extra)}</td><td>${money(totals.overtime)}</td><td>${money(totals.hakedis)}</td>
              <td>${money(totals.advance)}</td><td>${money(totals.deduction)}</td><td>${money(totals.garnishment)}</td><td>${money(totals.totalDeduction)}</td>
              <td>${money(totals.bank)}</td><td>${money(totals.cash)}</td><td>${money(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body></html>`;

    try {
      await printHtmlDocument({ title: `Aylık İK Kontrol Çıktısı - ${period}`, html });
      setNotice("Aylık kontrol çıktısı açıldı. Tek sayfa kontrol düzenidir; ödeme durumunu değiştirmez.");
    } catch (error) {
      setNotice(error?.message || "Aylık kontrol çıktısı açılamadı.");
    }
  };

  const printPayrollReport = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Ödeme listesi için personel bulunamadı.");
    if (!(await validatePayrollOutput(rows, "Bordro ödeme listesi / PDF"))) return;

    const totals = rows.reduce((sum, row) => ({
      salary: sum.salary + num(row.salary),
      road: sum.road + num(row.road),
      extra: sum.extra + num(row.extra),
      overtime: sum.overtime + num(row.overtime),
      advance: sum.advance + num(row.advance),
      deduction: sum.deduction + num(row.deduction),
      garnishment: sum.garnishment + num(row.garnishment),
      bank: sum.bank + num(row.bank),
      cash: sum.cash + num(row.cash),
      net: sum.net + num(row.net),
    }), { salary: 0, road: 0, extra: 0, overtime: 0, advance: 0, deduction: 0, garnishment: 0, bank: 0, cash: 0, net: 0 });

    const periodLabel = `${MONTHS[month - 1]} ${year}`;
    const html = `<html><head><meta charset="utf-8"><style>
      @page{size:A4 landscape;margin:6mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#14263a;margin:0;font-size:7.15px}
      .report-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:6px;padding-bottom:5px;border-bottom:1.5px solid #8194a8}
      h1{font-size:15px;margin:0;line-height:1}
      .sub{margin-top:2px;color:#63778b;font-size:7px}
      .head-total{text-align:right;font-size:7.4px;line-height:1.35}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      thead{display:table-header-group}
      tr{break-inside:avoid;page-break-inside:avoid}
      th,td{border:1px solid #b7c4d1;padding:3px 3.5px;vertical-align:middle;white-space:nowrap}
      th{background:#eef3f8;text-align:center;font-size:7px;line-height:1.1}
      td{text-align:right;font-variant-numeric:tabular-nums}
      th.person,td.person{text-align:left;width:13.5%}
      th.salary{width:9.2%} th.road{width:7.2%} th.extra{width:7.1%} th.overtime{width:7.1%}
      th.advance{width:8.1%} th.deduction{width:8.1%} th.garnishment{width:8.1%}
      th.bank{width:9.2%} th.cash{width:9.2%} th.net{width:13.2%}
      tbody tr:not(.total-row) td:not(.person){font-size:10.25pt;line-height:1;font-weight:500}
      td.person strong{display:block;font-size:7.1pt;line-height:1.02;overflow:hidden;text-overflow:ellipsis}
      td.person small{display:block;margin-top:1px;color:#6a7b8c;font-size:5.6pt}
      td.bank,td.cash,td.net{font-weight:800}
      .total-row td{background:#eef4fa;border-top:2.2px solid #15283b;line-height:1;padding:3px 3.5px;white-space:nowrap}
      .total-row td:not(.person){font-size:10.25pt;font-weight:800;text-align:right}
      .total-row td.person{font-size:7.1pt;font-weight:900;text-align:left}
    </style></head><body>
      <div class="report-head">
        <div><h1>İK Ödeme Listesi</h1><div class="sub">${escapeHtml(periodLabel)} · ${rows.length} personel</div></div>
        <div class="head-total">Net: <b>${money(totals.net)}</b> · Banka: <b>${money(totals.bank)}</b> · Elden: <b>${money(totals.cash)}</b></div>
      </div>
      <table>
        <thead><tr>
          <th class="person">Personel / HKN</th>
          <th class="salary">Maaş</th>
          <th class="road">Yol</th>
          <th class="extra">EK</th>
          <th class="overtime">Mesai</th>
          <th class="advance">Avans</th>
          <th class="deduction">Kesinti</th>
          <th class="garnishment">İcra/Haciz</th>
          <th class="bank">Banka</th>
          <th class="cash">Elden</th>
          <th class="net">Net</th>
        </tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>
            <td class="person"><strong>${escapeHtml(row.employee.fullName)}</strong><small>${escapeHtml(row.employee.code || "-")}</small></td>
            <td>${money(row.salary)}</td>
            <td>${money(row.road)}</td>
            <td>${money(row.extra)}</td>
            <td>${money(row.overtime)}</td>
            <td>${money(row.advance)}</td>
            <td>${money(row.deduction)}</td>
            <td>${money(row.garnishment)}</td>
            <td class="bank">${money(row.bank)}</td>
            <td class="cash">${money(row.cash)}</td>
            <td class="net">${money(row.net)}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td class="person">TOPLAM · ${rows.length} personel</td>
            <td>${money(totals.salary)}</td>
            <td>${money(totals.road)}</td>
            <td>${money(totals.extra)}</td>
            <td>${money(totals.overtime)}</td>
            <td>${money(totals.advance)}</td>
            <td>${money(totals.deduction)}</td>
            <td>${money(totals.garnishment)}</td>
            <td class="bank">${money(totals.bank)}</td>
            <td class="cash">${money(totals.cash)}</td>
            <td class="net">${money(totals.net)}</td>
          </tr>
        </tbody>
      </table>
    </body></html>`;

    try {
      await printHtmlDocument({ title: `İK Ödeme Listesi - ${period}`, html });
      setNotice("Ödeme listesi tek satırlı sade düzende açıldı; toplam yalnız listenin en sonunda bir kez gösterilir.");
    } catch (error) {
      setNotice(error?.message || "Ödeme listesi açılamadı.");
    }
  };

  const legalLabel = (row) => row.legalType === "KARMA" ? "İcra/Haciz" : row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "";
  const legalSourceLabel = (row) => row.garnishmentSource === "KARMA" ? "Banka + Elden" : row.garnishmentSource === "ELDEN" ? "Elden" : "Bankadan";

  const slipCardHtml = (row) => {
    const rowTotals = calcRow({ salary: row.salary, road: row.road, extra: row.extra, overtime: row.overtime, advance: row.advance, deduction: row.deduction, garnishment: row.garnishment });
    const balancedSplit = reconcilePaymentSplit(rowTotals.net, row.bank, row.cash);
    const legalTitle = row.garnishment
      ? `${legalLabel(row) || "İcra/Haciz"} (${legalSourceLabel(row)})`
      : "İcra/Haciz";
    const lines = [
      ["Maaş", money(row.salary)],
      ["Yol", money(row.road)],
      ["EK", money(row.extra)],
      ["Mesai", money(row.overtime)],
      ["Avans", row.advance ? `-${money(row.advance)}` : money(0)],
      ["Kesinti", row.deduction ? `-${money(row.deduction)}` : money(0)],
      [legalTitle, row.garnishment ? `-${money(row.garnishment)}` : money(0)],
    ];
    return `<article class="pay-slip">
      <header><div class="brand">KY ERP</div><div class="period">${escapeHtml(MONTHS[month - 1])} ${escapeHtml(year)}<br><b>PERSONEL ÖDEME FİŞİ</b></div></header>
      <div class="person-block"><strong>${escapeHtml(row.employee.fullName)}</strong><span>${escapeHtml(row.employee.code || "-")} · ${escapeHtml(row.employee.department || "Bölüm yok")}</span></div>
      <div class="slip-lines">${lines.map(([label,value])=>`<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>
      <div class="pay-channels"><div><span>BANKA</span><b>${money(balancedSplit.bank)}</b></div><div class="cash-pay"><span>ELDEN</span><b>${money(balancedSplit.cash)}</b></div></div>
      <div class="net"><span>TOPLAM ÖDEME</span><b>${money(rowTotals.net)}</b></div>
      <footer><div><span>Personel İmza</span><i></i></div><div><span>Ödeme Yapan</span><i></i></div></footer>
      ${row.extra > 0 ? `<div class="extra-coupon"><span>✂ EK ÖDEME</span><b>${money(row.extra)}</b><small>Personel: ${escapeHtml(row.employee.fullName)} · İmza: __________________</small></div>` : ""}
    </article>`;
  };

  const compactSlipCardHtml = (row) => {
    const totalDeductions = round(num(row.advance) + num(row.deduction) + num(row.garnishment));
    return `<div class="cut-slot"><article class="compact-slip">
      <header><b>KY ERP</b><span>${escapeHtml(MONTHS[month - 1])} ${escapeHtml(year)}</span></header>
      <div class="compact-person"><strong>${escapeHtml(row.employee.fullName)}</strong><small>${escapeHtml(row.employee.code || "-")} · ${escapeHtml(row.employee.department || "Bölüm yok")}</small></div>
      <div class="compact-grid">
        <div><span>MESAI</span><b>${money(row.overtime)}</b></div>
        <div><span>AVANS/KESİNTİ</span><b>${money(totalDeductions)}</b></div>
        <div><span>BANKA</span><b>${money(row.bank)}</b></div>
        <div class="cash"><span>ELDEN</span><b>${money(row.cash)}</b></div>
        <div class="total"><span>TOPLAM ÖDEME</span><b>${money(row.net)}</b></div>
      </div>
      <footer><span>Personel İmza</span><i></i><span>Ödeme Yapan</span><i></i></footer>
      ${row.extra > 0 ? `<div class="compact-extra"><span>✂ EK ÖDEME</span><b>${money(row.extra)}</b><small>İmza __________</small></div>` : ""}
    </article></div>`;
  };

  const slipCss = `*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#101828;margin:0;background:#fff}.pay-slip{border:1.4px solid #415a77;border-radius:2mm;padding:3.2mm;background:#fff;display:flex;flex-direction:column;min-height:132mm;break-inside:avoid}.pay-slip header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.4px solid #415a77;padding-bottom:2mm}.brand{font-size:15px;font-weight:900;color:#173b72}.period{text-align:right;font-size:8px;line-height:1.25}.period b{font-size:9px}.person-block{padding:2.4mm 0;border-bottom:1px solid #d6dee8}.person-block strong{display:block;font-size:14px}.person-block span{font-size:8px;color:#52657b}.slip-lines{flex:1;padding-top:1mm}.slip-lines>div{display:flex;justify-content:space-between;align-items:center;padding:1.05mm .4mm;border-bottom:1px solid #e6ebf1;font-size:9px}.slip-lines>div b{font-size:10px}.pay-channels{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:2mm}.pay-channels div{text-align:center;border:1px solid #9fb0c3;border-radius:1mm;padding:2mm}.pay-channels span,.net span{display:block;font-size:7px;font-weight:800;letter-spacing:.04em}.pay-channels b{display:block;font-size:14px;margin-top:.6mm}.pay-channels .cash-pay{border:2px solid #111}.pay-channels .cash-pay span{font-size:9px}.pay-channels .cash-pay b{font-size:19px}.net{margin-top:2mm;text-align:center;border:2px solid #111;border-radius:1mm;padding:2.2mm}.net span{font-size:9px}.net b{display:block;font-size:22px;margin-top:.5mm}.pay-slip footer{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm;font-size:7px;color:#52657b}.pay-slip footer div{display:flex;flex-direction:column;gap:5mm}.pay-slip footer i{border-bottom:1px solid #667085}.extra-coupon{margin:4mm -3.2mm -3.2mm;padding:2.2mm 3.2mm;border-top:1.5px dashed #111;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:4mm}.extra-coupon span{font-size:9px;font-weight:900}.extra-coupon b{font-size:16px}.extra-coupon small{text-align:right;font-size:7px;color:#52657b}`;

  const compactSlipCss = `*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#101828;margin:0;background:#fff}.cut-slot{height:100%;padding:1mm;border:1px dashed #7d8b99;break-inside:avoid;overflow:hidden}.compact-slip{height:100%;border:1px solid #34475b;border-radius:.7mm;padding:1.5mm 1.8mm;background:#fff;display:flex;flex-direction:column}.compact-slip header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #8fa0b2;padding-bottom:.7mm;font-size:6.5px}.compact-slip header b{font-size:9.5px;color:#173b72}.compact-person{padding:.8mm 0 .7mm;border-bottom:1px solid #d7dee7;white-space:nowrap;overflow:hidden}.compact-person strong{display:block;font-size:10px;line-height:1.05;overflow:hidden;text-overflow:ellipsis}.compact-person small{display:block;font-size:6px;color:#52657b;overflow:hidden;text-overflow:ellipsis}.compact-grid{display:grid;grid-template-columns:1fr 1fr;gap:.55mm .8mm;padding-top:.7mm;flex:1}.compact-grid>div{border:1px solid #c4ced9;border-radius:.5mm;padding:.45mm .8mm;display:flex;align-items:center;justify-content:space-between;min-height:5.2mm}.compact-grid span{font-size:5.7px;font-weight:800}.compact-grid b{font-size:8.5px}.compact-grid .cash{border:1.8px solid #111}.compact-grid .cash span{font-size:7px}.compact-grid .cash b{font-size:13px}.compact-grid .total{grid-column:1/-1;border:2px solid #111;padding:.55mm 1mm}.compact-grid .total span{font-size:7.2px}.compact-grid .total b{font-size:15px}.compact-slip footer{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:end;gap:1mm;margin-top:.45mm;font-size:5.4px;color:#52657b}.compact-slip footer i{display:block;border-bottom:1px solid #667085;height:2mm}.compact-extra{margin:.6mm -1.8mm -1.5mm;padding:.55mm 1.8mm;border-top:1px dashed #111;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:1.2mm;min-height:4mm}.compact-extra span{font-size:5.8px;font-weight:900}.compact-extra b{font-size:9px}.compact-extra small{text-align:right;font-size:5px;color:#52657b}`;

  const printSlip = async (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Fiş için personel seçilmelidir.");
    if (!(await validatePayrollOutput([row], `Tek kişi bordro/ödeme fişi - ${row.employee.fullName}`))) return;
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:10mm}${slipCss}.single{width:120mm;margin:0 auto}.single .pay-slip{min-height:155mm}</style></head><body><div class="single">${slipCardHtml(row)}</div></body></html>`;
    try {
      await printHtmlDocument({ title: `Ödeme Fişi - ${row.employee.fullName}`, html });
      setNotice(`${row.employee.fullName} için yalnız tek ödeme fişi yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "Tek kişi ödeme fişi açılamadı.");
    }
  };

  const printPaymentSlips = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Fiş için personel bulunamadı.");
    if (!(await validatePayrollOutput(rows, "10'lu toplu bordro/ödeme fişi"))) return;
    const pages = [];
    for (let index = 0; index < rows.length; index += 10) pages.push(rows.slice(index, index + 10));
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:6mm}${compactSlipCss}.page{width:198mm;height:285mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,1fr);gap:1.5mm 2mm;page-break-after:always}.page:last-child{page-break-after:auto}</style></head><body>${pages.map((pageRows)=>`<section class="page">${pageRows.map(compactSlipCardHtml).join("")}</section>`).join("")}</body></html>`;
    try {
      await printHtmlDocument({ title: `Toplu Personel Ödeme Fişleri - ${period}`, html });
      setNotice(`${rows.length} personelin A4 başına 10 adet kesimli toplu ödeme fişi yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "Toplu ödeme fişleri açılamadı.");
    }
  };

  const printSettlement = async (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Kıdem / ayrılış çıktısı için personel seçilmelidir.");
    const totalDeductions = round(num(row.advance) + num(row.deduction) + num(row.garnishment));
    const html = `<html><head><meta charset="utf-8"><style>
      @page{size:A4 portrait;margin:14mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#14263a;margin:0;font-size:11px}
      h1{font-size:20px;margin:0 0 4px}
      .sub{color:#60758a;margin-bottom:18px}
      .person{border:1px solid #9fb0c3;padding:12px;margin-bottom:14px}
      .person b{font-size:16px}.person span{display:block;margin-top:4px;color:#60758a}
      table{width:100%;border-collapse:collapse}
      td{border:1px solid #b8c5d1;padding:8px}
      td:last-child{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
      .ded td:last-child{color:#7a1f1f}
      .total td{border-top:2px solid #111;font-size:15px;font-weight:900}
      .channels{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
      .channels div{border:1.5px solid #64788d;padding:12px;text-align:center}
      .channels span{display:block;font-size:9px;font-weight:800}.channels b{display:block;font-size:18px;margin-top:4px}
      .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
      .sign div{border-top:1px solid #52657b;padding-top:5px;text-align:center;color:#52657b}
    </style></head><body>
      <h1>Kıdem / Ayrılış Ödeme Özeti</h1>
      <div class="sub">${escapeHtml(MONTHS[month - 1])} ${escapeHtml(year)} · Kontrol çıktısı</div>
      <div class="person"><b>${escapeHtml(row.employee.fullName)}</b><span>${escapeHtml(row.employee.code || "-")} · ${escapeHtml(row.employee.department || "Bölüm yok")}</span></div>
      <table><tbody>
        <tr><td>Maaş</td><td>${money(row.salary)}</td></tr>
        <tr><td>Yol</td><td>${money(row.road)}</td></tr>
        <tr><td>EK / İlave Ödeme</td><td>${money(row.extra)}</td></tr>
        <tr><td>Mesai</td><td>${money(row.overtime)}</td></tr>
        <tr class="ded"><td>Avans</td><td>-${money(row.advance)}</td></tr>
        <tr class="ded"><td>Özel Kesinti</td><td>-${money(row.deduction)}</td></tr>
        <tr class="ded"><td>İcra / Haciz</td><td>-${money(row.garnishment)}</td></tr>
        <tr><td>Toplam Kesinti</td><td>${money(totalDeductions)}</td></tr>
        <tr class="total"><td>Net Ödeme</td><td>${money(row.net)}</td></tr>
      </tbody></table>
      <div class="channels"><div><span>BANKA</span><b>${money(row.bank)}</b></div><div><span>ELDEN</span><b>${money(row.cash)}</b></div></div>
      <div class="sign"><div>Personel İmza</div><div>İK / Ödeme Onayı</div></div>
    </body></html>`;
    try {
      await printHtmlDocument({ title: `Kıdem Ayrılış Özeti - ${row.employee.fullName}`, html });
      setNotice(`${row.employee.fullName} için kıdem / ayrılış ödeme özeti yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "Kıdem / ayrılış çıktısı açılamadı.");
    }
  };


const buildLeaveFormDraft = useCallback((employee, selectedPlan = {}) => {
    const leave = employee ? employeeLeave(employee) : { annual: 0, balance: 0 };
    const countedDays = selectedPlan.countedDays ?? "";
    return {
      documentTitle: "IZIN BELGESI",
      documentNo: selectedPlan.documentNo || "",
      documentDate: istanbulDateKey(),
      fullName: employee?.fullName || "",
      registryNo: employee?.cardNo || employee?.code || "",
      department: employee?.department || "",
      jobTitle: employee?.title || "",
      leaveType: selectedPlan.recordType || selectedPlan.leaveType || "Yillik izin",
      effectType: selectedPlan.effectType || selectedPlan.wageEffect || "Ücretli",
      startDate: selectedPlan.startDate || "",
      endDate: selectedPlan.endDate || "",
      returnDate: selectedPlan.returnDate || "",
      countedDays,
      carryover: num(employee?.annualLeaveCarryover),
      entitlement: num(employee?.annualLeaveEntitlement),
      remaining: selectedPlan.balanceAfter ?? leave.balance - num(countedDays),
      note: selectedPlan.formNote || "Personel, belirtilen izin bitiminde ise baslamakla yukumludur. Mazeretsiz gec donusler ilgili mevzuat ve sirket prosedurleri kapsaminda izinsiz devamsizlik olarak degerlendirilir.",
      employeeSignature: "PERSONEL",
      managerSignature: "DEPARTMAN YONETICISI",
      hrSignature: "IK / GENEL MUDUR",
    };
  }, [employeeLeave]);

  useEffect(() => {
    if (modal !== "izinFis" || !selected) return;
    const plan = safeList(leaveCenter.plans).filter((item) => item.employeeId === selected.id && item.status !== "CANCELLED").sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || {};
    setModalDraft((old) => old.formData && old.formEmployeeId === selected.id ? old : { formEmployeeId: selected.id, formPlanId: plan.id || "", formData: buildLeaveFormDraft(selected, plan) });
  }, [buildLeaveFormDraft, leaveCenter.plans, modal, selected, selectedId]);

  const openLeaveForm = (employee = selected, selectedPlan = null) => {
    const target = employee || employees[0];
    if (!target) return setNotice("Izin formu icin personel secilmelidir.");
    const plan = selectedPlan || safeList(leaveCenter.plans).filter((item) => item.employeeId === target.id && item.status !== "CANCELLED").sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || {};
    setSelectedId(target.id);
    setModalDraft({ formEmployeeId: target.id, formPlanId: plan.id || "", formData: buildLeaveFormDraft(target, plan) });
    setModal("izinFis");
  };

  const printLeaveForm = async (employee = selected, selectedPlan = null, formOverride = null) => {
    if (!employee) return setNotice("Izin formu icin personel secilmelidir.");
    if (!formOverride) return openLeaveForm(employee, selectedPlan);
    const plan = selectedPlan || safeList(leaveCenter.plans).filter((item) => item.employeeId === employee.id && item.status !== "CANCELLED").sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || {};
    const form = formOverride || buildLeaveFormDraft(employee, plan);
    const type = form.leaveType, start = form.startDate || ".... / .... / ........", end = form.endDate || ".... / .... / ........", returnDate = form.returnDate || ".... / .... / ........", counted = form.countedDays || "....";
    const checked = (label) => upper(type).includes(upper(label)) ? "&#9745;" : "&#9744;";
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A5 portrait;margin:7mm}*{box-sizing:border-box}body{margin:0;font:10.5px Arial;color:#111}.sheet{width:134mm;min-height:196mm;margin:auto;border:1.2px solid #111;padding:5mm}.head{display:grid;grid-template-columns:25mm 1fr 30mm;align-items:center;border-bottom:1.5px solid #111;padding-bottom:3mm}.logo{font-weight:800;font-size:15px}.head h1{text-align:center;font-size:17px;margin:0}.doc{text-align:right;font-size:9px}.row{display:grid;grid-template-columns:49mm 1fr;border-bottom:1px solid #777;min-height:8mm;align-items:center}.row b{padding:2mm;border-right:1px solid #777}.row span{padding:2mm}.reasons{display:flex;gap:8mm;font-size:11px}.note{font-size:8.5px;line-height:1.35;border:1px solid #777;padding:2.5mm;margin-top:4mm}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:12mm;text-align:center}.sign div{padding-top:13mm;border-bottom:1px solid #111;padding-bottom:2mm}.sign b{display:block;margin-top:2mm}.foot{text-align:center;font-size:8px;margin-top:4mm;color:#444}@media print{.sheet{break-inside:avoid}}</style></head><body><div class="sheet"><div class="head"><div class="logo">KY ERP</div><h1>${form.documentTitle}</h1><div class="doc">Form No: ${form.documentNo || "........"}<br>Duzenleme: ${form.documentDate || "........"}</div></div><div class="row"><b>ADI SOYADI</b><span>${form.fullName || "-"}</span></div><div class="row"><b>SGK SICIL / PERSONEL NO</b><span>${form.registryNo || "-"}</span></div><div class="row"><b>DEPARTMANI</b><span>${form.department || "-"}</span></div><div class="row"><b>UNVANI</b><span>${form.jobTitle || "-"}</span></div><div class="row"><b>IZIN SEBEBI</b><span class="reasons"><i>${checked("Yillik")} YILLIK</i><i>${checked("Ucretsiz")} UCRETSIZ</i><i>${checked("Mazeret")} MAZERET</i></span></div><div class="row"><b>UCRET DURUMU</b><span>${escapeHtml(form.effectType || "Ücretli")}</span></div><div class="row"><b>IZIN SURESI</b><span>${counted} is gunu</span></div><div class="row"><b>IZNE CIKACAGI TARIH</b><span>${start}</span></div><div class="row"><b>IZIN BITIS TARIHI</b><span>${end}</span></div><div class="row"><b>ISE BASLAYACAGI TARIH</b><span>${returnDate}</span></div><div class="row"><b>DEVREDEN IZIN GUN SAYISI</b><span>${form.carryover} gun</span></div><div class="row"><b>YILLIK IZIN HAKEDIS GUN SAYISI</b><span>${form.entitlement} gun</span></div><div class="row"><b>KULLANIM SONRASI KALAN IZIN</b><span>${form.remaining} gun</span></div><div class="note">NOT: ${form.note}</div><div class="sign"><div>IMZA<b>${form.employeeSignature}</b></div><div>ONAY<b>${form.managerSignature}</b></div><div>ONAY<b>${form.hrSignature}</b></div></div><div class="foot">Bu belge A5 boyutunda, A4 kagidin yarisi olacak sekilde yazdirilmaya uygundur.</div></div></body></html>`;
    try {
      await printHtmlDocument({ title: `Yıllık İzin Formu - ${employee.fullName}`, html });
      setNotice(`${employee.fullName} izin formu yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "İzin formu açılamadı.");
    }
  };

  const openLeaveProof = (plan) => {
    if (!plan) return;
    setModalDraft({ ...plan });
    setModal("izinDokum");
  };

  const printLeaveProof = async (plan = modalDraft) => {
    const employee = masterEmployees.find((item) => item.id === plan?.employeeId);
    if (!plan || !employee) return setNotice("İzin gün dökümü için personel ve kayıt seçilmelidir.");
    const dayDetails = safeList(plan.dayDetails);
    const planStatusText = plan.status === "PLANNED" ? "Planlandı" : plan.status === "APPROVED" ? "Onaylandı" : plan.status === "TAKEN" ? "Kullanıldı" : plan.status === "CANCELLED" ? "İptal" : (plan.status || "-");
    const dayRows = dayDetails.length
      ? dayDetails
      : [{ date: plan.startDate || "-", weekdayName: "-", counted: plan.countedDays ?? "-", status: "LEGACY", reason: plan.legacy ? "Eski kayıt; gün bazlı hesaplama anlık kaydedilmemiş." : "Gün dökümü bulunamadı." }];
    const html = `<html><head><meta charset="utf-8"><style>
      @page{size:A4 portrait;margin:10mm}
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#15263a;margin:0;font-size:10px}
      h1{font-size:18px;margin:0 0 3px}.sub{color:#66758b;margin-bottom:12px}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:12px}
      .summary div{border:1px solid #ccd8e5;border-radius:7px;padding:8px}.summary span{display:block;color:#6b7b90;font-size:8px}.summary b{display:block;margin-top:2px;font-size:12px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #bfcbd8;padding:6px;text-align:left}th{background:#eef3f8}td.count{text-align:center;font-weight:800}
      tr.excluded{background:#fff5f5}tr.partial{background:#fff9e8}tr.counted{background:#f5fff8}
      .note{margin-top:12px;border:1px solid #d7e1eb;padding:8px;border-radius:6px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:40px}.sign div{border-top:1px solid #555;padding-top:5px;text-align:center}
    </style></head><body>
      <h1>Yıllık İzin Gün Dökümü</h1>
      <div class="sub">${escapeHtml(employee.fullName)} · ${escapeHtml(employee.code || "-")} · ${escapeHtml(plan.recordType || "Yıllık izin")}</div>
      <div class="summary">
        <div><span>İZNE ÇIKIŞ</span><b>${escapeHtml(plan.startDate || "-")}</b></div>
        <div><span>SON İZİN GÜNÜ</span><b>${escapeHtml(plan.endDate || plan.lastLeaveDate || "-")}</b></div>
        <div><span>İŞE DÖNÜŞ</span><b>${escapeHtml(plan.returnDate || "-")}</b></div>
        <div><span>İZİNDEN DÜŞEN</span><b>${escapeHtml(plan.countedDays ?? "-")} gün</b></div>
        <div><span>ÜCRET DURUMU</span><b>${escapeHtml(plan.effectType || "Ücretli")}</b></div>
        <div><span>BELGE NO</span><b>${escapeHtml(plan.documentNo || "-")}</b></div>
        <div><span>KAYIT DURUMU</span><b>${escapeHtml(planStatusText)}</b></div>
        <div><span>HESAP KURALI</span><b>${plan.policySnapshot ? "Kayıt anı kuralı saklandı" : "Eski kayıt"}</b></div>
      </div>
      <table><thead><tr><th>Tarih</th><th>Gün</th><th>İzin Hesabı</th><th>Açıklama</th></tr></thead><tbody>
        ${dayRows.map((day) => `<tr class="${day.status === "EXCLUDED" ? "excluded" : day.status === "PARTIAL" ? "partial" : "counted"}"><td>${escapeHtml(day.date || "-")}</td><td>${escapeHtml(day.weekdayName || "-")}</td><td class="count">${day.counted === 0 ? "Sayılmaz" : day.counted === 0.5 ? "0,5 gün" : day.counted === 1 ? "1 gün" : escapeHtml(day.counted ?? "-")}</td><td>${escapeHtml(day.reason || day.holidayName || "Yıllık izinden sayılır")}</td></tr>`).join("")}
      </tbody></table>
      <div class="note"><b>Açıklama:</b> ${escapeHtml(plan.note || "-")}</div>
      <div class="sign"><div>Personel İmza</div><div>İK / Yetkili</div></div>
    </body></html>`;
    try {
      await printHtmlDocument({ title: `Yıllık İzin Gün Dökümü - ${employee.fullName}`, html });
      setNotice(`${employee.fullName} yıllık izin gün dökümü yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "İzin gün dökümü açılamadı.");
    }
  };

  return (
    <div className="ik-html ik-monthly-pro">
      <IkMonthlyProShell
        page={page}
        onNavigate={go}
        year={year}
        month={month}
        months={MONTHS}
        onPeriodChange={changePeriod}
        periodPrepared={periodPrepared}
        isLocked={Boolean(data.close?.isLocked)}
        balanced={periodPrepared && balanced}
        issueCount={smartIssues.length}
        employeeCount={employees.length}
        sgkCount={employees.filter(isSgk).length}
        payrollCount={payrollRows.length}
        companyName={activeMainCompany?.name || activeMainCompany?.title || "KY ERP"}
      >
        {notice && <div className="note">{notice}<button className="btn" onClick={() => setNotice("")}>Kapat</button></div>}
        {page === "ozet" && renderOzet()}
        {page === "personel" && renderPersonel()}
        {page === "ucret" && renderUcret()}
        {page === "hareket" && renderHareket()}
        {page === "izin" && renderIzin()}
        {page === "bordro" && renderBordro()}
        {page === "evrak" && renderEvrak()}
      </IkMonthlyProShell>
      {renderModal()}
      {modal && notice ? createPortal(
        <div className="ik-modal-notice" role="alert" aria-live="assertive">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>Kapat</button>
        </div>,
        document.body,
      ) : null}
    </div>
  );

  function filters({ third = "Personel ara", fourth = "", fifth = "" } = {}) {
    const fourthControl = fourth === "Durum"
      ? <div><label>Seçili Dönem Durumu</label><select value={employeeStatusFilter} onChange={(event) => setEmployeeStatusFilter(event.target.value)}><option value="ALL">Tümü</option><option value="ACTIVE">Dönemde Aktif</option><option value="PASSIVE">Dönem Dışı / Ayrılmış</option></select></div>
      : fourth === "Tip"
        ? <div><label>Hareket Tipi</label><select value={movementTypeFilter} onChange={(event) => setMovementTypeFilter(event.target.value)}><option value="ALL">Tümü</option>{FINANCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        : ["Ödeme", "Odeme"].includes(fourth)
          ? <div><label>Ödeme Kanalı</label><select value={payrollPaymentFilter} onChange={(event) => setPayrollPaymentFilter(event.target.value)}><option value="ALL">Tümü</option><option value="BANK">Banka içeren</option><option value="CASH">Elden içeren</option><option value="MIXED">Banka + Elden</option></select></div>
          : fourth === "Evrak"
            ? <div><label>Evrak</label><select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}><option value="ALL">Tümü</option><option value="HAS">Evrakı olan</option><option value="MISSING">Eksik evrak</option></select></div>
            : null;
    const fifthControl = fifth === "SGK"
      ? <div><label>SGK</label><select value={sgkFilter} onChange={(event) => setSgkFilter(event.target.value)}><option value="ALL">Tümü</option><option value="SGK">SGK'lı</option><option value="NO_SGK">SGK'sız</option></select></div>
      : fifth === "Bordro etkisi"
        ? <div><label>Bordro Etkisi</label><select value={movementEffectFilter} onChange={(event) => setMovementEffectFilter(event.target.value)}><option value="ALL">Tümü</option><option value="PAYROLL">Bordroya Yansır</option><option value="INFO">Sadece Kayıt</option></select></div>
        : fifth === "Durum"
          ? <div><label>Bordro Durumu</label><select value={payrollStatusFilter} onChange={(event) => setPayrollStatusFilter(event.target.value)}><option value="ALL">Tümü</option><option value="READY">Hazır</option><option value="CONTROL">Kontrol gerekli</option></select></div>
          : null;
    return (
      <div className="filters ik-essential-filters">
        <div className="ik-search-filter"><label>{third}</label><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, kod, kart no" /></div>
        {fourthControl}
        {fifthControl}
        <button className="btn" onClick={() => load({ force: true })}>{busy ? "Yükleniyor" : "Yenile"}</button>
      </div>
    );
  }

  function summaryBox(label, value, tone = "", small = "") {
    return <div className="sum"><div className="t">{label}</div><div className="v" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>{small && <small>{small}</small>}</div>;
  }

  function renderOzet() {
    const payrollReadyText = periodPrepared ? "Hazır" : "Hazırlanmadı";
    return (
      <section>
        <div className="page-head">
          <div><h1>İK İşlem Merkezi</h1><p>Personel özlük, ücret, bordro, ödeme ve SGK/evrak işlemlerini tek merkezden yönetin. Giriş/çıkış, puantaj, vardiya, terminal ve izin hareketleri PDKS bölümündedir. Yıllık izin hakediş ve resmi izin sicili İK bölümünde yönetilir.</p></div>
          <div className="group"><span className={`badge ${periodPrepared ? "green" : "orange"}`}>{MONTHS[month - 1]} {year} · {payrollReadyText}</span><span className={`badge ${smartIssues.length ? "orange" : "green"}`}>{smartIssues.length ? `${smartIssues.length} kontrol` : "Kontroller temiz"}</span></div>
        </div>
        {filters({ third: "Personel / uyarı ara", fourth: "Durum", fifth: "SGK" })}
        <div className={`warnline ${periodPrepared ? "ok" : "warn"}`}>
          <b>Ödeme dönemi: {MONTHS[month - 1]} {year}</b> · Ay bir kez hazırlandığında firma bazında sunucuya kaydedilir ve tekrar hazırlanmaz.
          {!periodPrepared ? <><span> Bu dönem bordro hesabı henüz açılmadı.</span> <button className="btn primary" onClick={preparePeriod} disabled={busy}>{busy ? "Hazırlanıyor" : "Bilgileri Hazırla"}</button></> : <span> Bordro verileri hazır.</span>}
        </div>

        <div className="sumgrid">
          {summaryBox("Dönem personeli", employees.length, "", `${employees.filter(isSgk).length} SGK'lı · ${employees.filter((item) => employeeHireDate(item).startsWith(period)).length} yeni giriş · ${employees.filter((item) => employeeExitDate(item).startsWith(period)).length} çıkış`)}
          {summaryBox("Banka ödeme", periodPrepared ? money(summary.bank) : "Hazırlanmadı")}
          {summaryBox("Elden ödeme", periodPrepared ? money(summary.cash) : "Hazırlanmadı")}
          {summaryBox("Net ödeme", periodPrepared ? money(summary.net) : "Hazırlanmadı", periodPrepared ? (balanced ? "green" : "red") : "orange")}
          {summaryBox("Ek ödeme", periodPrepared ? money(summary.extra) : "-", summary.extra ? "green" : "")}
          {summaryBox("Mesai", periodPrepared ? money(summary.overtime) : "-", summary.overtime ? "orange" : "")}
          {summaryBox("Avans", periodPrepared ? money(summary.advance) : "-", summary.advance ? "orange" : "")}
          {summaryBox("Kesinti", periodPrepared ? money(summary.deduction) : "-", summary.deduction ? "red" : "")}
          {summaryBox("İcra / Haciz", periodPrepared ? money(summary.garnishment) : "-", summary.garnishment ? "red" : "")}
          {summaryBox("Eksik evrak", summary.docsMissing, summary.docsMissing ? "orange" : "green")}
        </div>

        <div className="card">
          <div className="ch"><div><b>Hızlı Finans İşlemleri</b><span>PDKS işlemi içermez; yalnız İK finans ve bordro aksiyonları. İzin, rapor ve günlük devam hareketleri PDKS bölümünden yönetilir.</span></div></div>
          <div className="workbar"><div className="group">
            <button className="btn" onClick={() => openFinance("Mesai")}>Mesai Ekle</button>
            <button className="btn orange" onClick={() => openFinance("Avans")}>Avans Ekle</button>
            <button className="btn red" onClick={() => openFinance("Ozel kesinti")}>Kesinti Ekle</button>
            <button className="btn green" onClick={() => go("bordro")}>Son Bordro Kontrolü</button>
            <button className="btn" disabled={!periodPrepared} onClick={() => setModal("fis")}>Tek Kişi Fişi</button>
          </div></div>
        </div>

        <div className="card">
          <div className="ch"><div><b>Akıllı İK Kontrol Merkezi</b><span>Bordro, ödeme ve evrak tarafında dikkat isteyen maddeler.</span></div></div>
          <table><tbody>
            {smartIssues.map((item, index) => <tr key={`${item.title}-${index}`}><td><span className={`badge ${item.tone}`}>!</span></td><td><b>{item.title}</b><br/><span>{item.detail}</span></td><td><button className="btn" onClick={item.action}>{item.actionLabel}</button></td></tr>)}
            {!smartIssues.length && <tr><td><span className="badge green">OK</span></td><td><b>Kontroller temiz</b><br/><span>Bordro, ödeme ve evrak kontrollerinde açık görünmüyor.</span></td><td>-</td></tr>}
          </tbody></table>
        </div>

        {periodPrepared && <div className="card"><div className="ch"><div><b>Seçili Dönem Ödeme Özeti</b><span>Satıra tıklayıp personeli seçin; son kontrol bordro ekranından yapılır.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>SGK</th><th>Ek</th><th>Mesai</th><th>Avans</th><th>Kesinti</th><th>Banka</th><th>Elden</th><th>Net</th><th>Durum</th></tr></thead><tbody>
          {payrollRows.map((row) => <tr key={row.employee.id} onClick={() => setSelectedId(row.employee.id)}><td><span className="person">{row.employee.fullName}</span><span className="code">{row.employee.code || "-"}</span></td><td>{sgkLabel(row.employee)}</td><td>{money(row.extra)}</td><td>{money(row.overtime)}</td><td>{money(row.advance)}</td><td>{money(row.deduction + row.garnishment)}</td><td>{money(row.bank)}</td><td>{money(row.cash)}</td><td className="money">{money(row.net)}</td><td><span className={`badge ${row.diff === 0 ? "green" : "red"}`}>{row.diff === 0 ? "Hazır" : "Kontrol"}</span></td></tr>)}
          <EmptyRow show={!payrollRows.length} colSpan={10} text="Hazırlanmış bordro satırı yok."/>
        </tbody></table></div></div>}
        <LogTable title="Son 10 İşlem" rows={logs.map(withPerson).slice(0, 10)} onEdit={editFromLog} />
      </section>
    );
  }

  function renderPersonel() {
    const profile = filteredMasterEmployees.find((item) => item.id === selectedId) || filteredMasterEmployees[0] || null;
    const profileLeave = profile ? employeeLeave(profile) : { annual: 0, balance: 0, right: 0 };
    const profileDocs = profile ? docsFor(profile) : [];
    const profileLeavePlans = profile
      ? safeList(leaveCenter.plans).filter((item) => item.employeeId === profile.id && upper(item.status) !== "CANCELLED").sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")))
      : [];
    const profileLeaveYears = Object.values(profileLeavePlans.reduce((acc, item) => {
      const leaveYear = String(item.startDate || item.endDate || "").slice(0, 4) || "Tarihsiz";
      if (!acc[leaveYear]) acc[leaveYear] = { year: leaveYear, used: 0, records: 0 };
      acc[leaveYear].records += 1;
      if (upper(item.recordType).includes("YILLIK")) acc[leaveYear].used += num(item.countedDays);
      return acc;
    }, {})).sort((a, b) => String(b.year).localeCompare(String(a.year)));
    const initials = (employee) => String(employee?.fullName || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toLocaleUpperCase("tr-TR");
    return (
      <section>
        <div className="page-head">
          <div><h1>Personel Kartları</h1><p>Özlük, SGK, ücret planı, izin ve evrak durumunu tek personel profili üzerinden yönetin.</p></div>
          <div className="group"><button className="btn primary" disabled={data.close?.isLocked} onClick={openNewPerson}>Yeni Personel</button></div>
        </div>
        {filters({ third: "Personel ara", fourth: "Durum", fifth: "SGK" })}

        <div className="ik-pro-personnel-layout">
          <aside className="ik-pro-roster card">
            <div className="ch"><div><b>İK Ana Personel Kadrosu</b><span>{filteredMasterEmployees.length} / {masterEmployees.length} HKN kayıt · durum {MONTHS[month - 1]} {year} işe giriş/çıkış tarihine göre hesaplanır</span></div></div>
            <div className="ik-pro-roster-scroll">
              {filteredMasterEmployees.map((employee) => {
                const leave = employeeLeave(employee);
                const isActive = employee.id === profile?.id;
                const periodLabel = employmentPeriodLabel(employee, period);
                const periodTone = employmentPeriodTone(employee, period);
                return (
                  <button type="button" key={employee.id} className={`ik-pro-roster-item ${isActive ? "active" : ""}`} title="Tek tık: seç · Çift tık: düzenle" onClick={() => setSelectedId(employee.id)} onDoubleClick={() => openPerson(employee)}>
                    <span className="ik-pro-avatar">{initials(employee)}</span>
                    <span className="ik-pro-roster-copy">
                      <b>{employee.fullName}</b>
                      <small>{employee.department || employee.title || "Bölüm belirtilmemiş"} · {employee.code || "Kod yok"}</small>
                    </span>
                    <span className="ik-pro-roster-meta">
                      <i className={periodTone === "green" ? "success" : periodTone === "orange" ? "warning" : "danger"}>{periodLabel}</i>
                      <small>{employee.sgkFollow === true ? "SGK" : "SGK dışı"} · {leave.balance} gün izin</small>
                    </span>
                  </button>
                );
              })}
              {!filteredMasterEmployees.length && <div className="ik-pro-empty">Filtreye uygun HKN personeli bulunamadı.</div>}
            </div>
          </aside>

          <div className="ik-pro-profile card">
            {profile ? <>
              <div className="ik-pro-profile-head">
                <span className="ik-pro-avatar large">{initials(profile)}</span>
                <div>
                  <div className="ik-pro-profile-name"><h2>{profile.fullName}</h2><span className={`badge ${employmentPeriodTone(profile, period)}`}>{employmentPeriodLabel(profile, period)}</span></div>
                  <p>{profile.title || "Unvan belirtilmemiş"} · {profile.department || "Bölüm belirtilmemiş"} · {profile.code || "Personel kodu yok"}</p>
                </div>
                <div className="ik-pro-profile-actions">
                  <button className="btn primary" onClick={() => openPerson(profile)}>Kartı Düzenle</button>
                  <button className="btn" onClick={() => openDocument(profile)}>Evrak</button>
                </div>
              </div>

              <div className="ik-pro-profile-grid">
                <div><span>SGK</span><b>{sgkLabel(profile)}</b><small>{profile.sgkFollow === false ? "SGK dışı" : profile.sgkDays !== null && profile.sgkDays !== undefined ? `${num(profile.sgkDays)} gün · ${sgkDaySourceLabel(profile.sgkDaySource)}` : profile.suggestedSgkDays !== null && profile.suggestedSgkDays !== undefined ? `Öneri: ${profile.suggestedSgkDays} gün` : "Gün bilgisi bekleniyor"}</small></div>
                <div><span>İşe Giriş</span><b>{employeeHireDate(profile) || "Eksik"}</b><small>{employeeExitDate(profile) ? `Çıkış: ${employeeExitDate(profile)}` : "Aktif çalışma"}</small></div>
                <div><span>Ödeme Tipi</span><b>{paymentLabel(profile)}</b><small>Banka + elden planı</small></div>
                <div><span>Yıllık İzin</span><b>{profileLeave.balance} gün</b><small>{profileLeave.annual} gün kullanılmış</small></div>
                <div><span>Evrak</span><b>{profileDocs.length} belge</b><small>{profileDocs.length ? "Bağlı evrak var" : "Evrak kontrolü gerekli"}</small></div>
                <div><span>Kart No</span><b>{profile.cardNo || "—"}</b><small>{profile.phone || "Telefon yok"}</small></div>
              </div>

              <div className="ik-pro-finance-snapshot">
                <div><span>Maaş</span><b>{money(profile.salary)}</b></div>
                <div><span>Yol</span><b>{money(profile.roadAllowance)}</b></div>
                <div><span>EK</span><b>{money(profile.extraPaymentAmount)}</b></div>
                <div><span>Banka</span><b>{money(profile.bankAmount)}</b></div>
                <div><span>Elden</span><b>{money(profile.cashAmount)}</b></div>
              </div>

              <div className="ik-pro-profile-toolbar">
                <button className="btn" onClick={() => openPayPlan(profile)}>Ücret Planı</button>
                <button className="btn" onClick={() => openLeave("yillik", "", profile)}>İzin Gir</button>
                <button className="btn" onClick={() => { setSelectedId(profile.id); go("hareket"); }}>Mesai / Avans</button>
                <button className="btn green" onClick={() => { setSelectedId(profile.id); go("bordro"); }}>Bordroya Git</button>
              </div>

              <details className="ik-pro-leave-ledger" open>
                <summary>Yıllık İzin Hakediş / Kullanım Sicili <span>Personele gösterilecek geçmiş yıl ve tarih kanıtı</span></summary>
                <div className="ik-pro-leave-balance">
                  <div><span>Hakediş</span><b>{num(profile.annualLeaveEntitlement)} gün</b></div>
                  <div><span>Devreden</span><b>{num(profile.annualLeaveCarryover)} gün</b></div>
                  <div><span>Toplam Hak</span><b>{profileLeave.right} gün</b></div>
                  <div><span>Kullanılan</span><b>{profileLeave.annual} gün</b></div>
                  <div><span>Kalan</span><b>{profileLeave.balance} gün</b></div>
                </div>
                <div className="ik-pro-leave-years">
                  {profileLeaveYears.map((item) => <div key={item.year}><span>{item.year}</span><b>{item.used} gün yıllık izin</b><small>{item.records} izin kaydı</small></div>)}
                  {!profileLeaveYears.length ? <div className="empty"><span>Geçmiş</span><b>Kayıt yok</b><small>İzin kullanımı bulunamadı.</small></div> : null}
                </div>
                <div className="tw ik-pro-leave-records"><table><thead><tr><th>Tarih Aralığı</th><th>Tür</th><th>Ücret</th><th>İzinden Düşen</th><th>İşe Dönüş</th><th>Durum</th><th>Açıklama</th><th>Kanıt</th></tr></thead><tbody>
                  {profileLeavePlans.map((item) => <tr key={item.id}><td><b>{item.startDate || "-"}</b><span className="code">→ {item.endDate || item.lastLeaveDate || "-"}</span></td><td>{item.recordType || "-"}</td><td>{item.effectType || "Ücretli"}</td><td>{num(item.countedDays)} gün</td><td>{item.returnDate || "-"}</td><td><span className="badge blue">{leavePlanStatusLabel(item.status)}</span></td><td>{item.note || "-"}</td><td><button className="btn" onClick={() => openLeaveProof(item)}>Gün Dökümü</button></td></tr>)}
                  <EmptyRow show={!profileLeavePlans.length} colSpan={8} text="Bu personel için izin sicili kaydı bulunamadı." />
                </tbody></table></div>
              </details>
            </> : <div className="ik-pro-empty profile">Görüntülenecek personel seçin.</div>}
          </div>
        </div>

        <details className="ik-pro-detail-table card">
          <summary>Detay Personel Tablosunu Aç <span>Tüm kolonlar ve teknik kontrol görünümü</span></summary>
          <div className="tw"><table><thead><tr><th>Personel</th><th>Kod / Kart No</th><th>İşe Giriş</th><th>İşten Çıkış</th><th>SGK</th><th>Ödeme</th><th>Maaş</th><th>Yol</th><th>EK</th><th>Banka Plan</th><th>Elden Plan</th><th>Kalan İzin</th><th>Evrak</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{filteredMasterEmployees.map((employee) => {
            const leave = employeeLeave(employee);
            const docCount = docsFor(employee).length;
            return <tr key={employee.id} title="Tek tık: seç · Çift tık: düzenle" onClick={() => setSelectedId(employee.id)} onDoubleClick={() => openPerson(employee)}><td><span className="person">{employee.fullName}</span><span className="code">{employee.department || "-"}</span></td><td>{employee.code || "-"} / {employee.cardNo || "-"}</td><td><b>{employeeHireDate(employee) || "-"}</b></td><td><b>{employeeExitDate(employee) || "-"}</b></td><td>{sgkLabel(employee)}</td><td>{paymentLabel(employee)}</td><td className="money">{money(employee.salary)}</td><td className="money">{money(employee.roadAllowance)}</td><td className="money">{money(employee.extraPaymentAmount)}</td><td className="money">{money(employee.bankAmount)}</td><td className="money">{money(employee.cashAmount)}</td><td><span className={`badge ${leave.balance < 0 ? "red" : "green"}`}>{leave.balance}</span></td><td><span className={`badge ${docCount ? "green" : "orange"}`}>{docCount ? "Var" : "Eksik"}</span></td><td><span className={`badge ${employmentPeriodTone(employee, period)}`}>{employmentPeriodLabel(employee, period)}</span></td><td><button className="btn" onClick={(event) => { event.stopPropagation(); openPerson(employee); }}>Düzenle</button> <button className="btn" onClick={(event) => { event.stopPropagation(); openDocument(employee); }}>Evrak</button></td></tr>;
          })}<EmptyRow show={!filteredMasterEmployees.length} colSpan={15} text="Personel bulunamadı." /></tbody></table></div>
        </details>

        <LogTable title="Personel İşlem Logları" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderUcret() {
    const salaryTotal = filteredEmployees.reduce((sum, item) => sum + num(item.salary), 0);
    const roadTotal = filteredEmployees.reduce((sum, item) => sum + num(item.roadAllowance), 0);
    const bankTotal = filteredEmployees.reduce((sum, item) => sum + num(item.bankAmount), 0);
    const cashTotal = filteredEmployees.reduce((sum, item) => sum + num(item.cashAmount), 0);
    return (
      <section>
        <div className="page-head"><div><h1>Maaş - Yol - Banka - Elden</h1><p>Personelin aylık ücret ve ödeme planı. Değişiklikler geçerlilik tarihiyle saklanır; geçmiş bordro geriye dönük bozulmaz.</p></div><div className="group"><button className="btn primary" disabled={data.close?.isLocked} onClick={openBulkCompensation}>Toplu Ücret / Yol Düzenle</button></div></div>
        {filters({ third: "Personel ara" })}
        <div className="sumgrid short">{summaryBox("Personel", filteredEmployees.length)}{summaryBox("Maaş toplamı", money(salaryTotal))}{summaryBox("Yol toplamı", money(roadTotal))}{summaryBox("Banka planı", money(bankTotal), "green")}{summaryBox("Elden planı", money(cashTotal), "orange")}</div>
        <div className="card"><div className="ch"><div><b>Bordro Öncesi Giriş Kontrolü</b><span>Ücret planını değiştirmeden aylık Mesai / Avans / Kesinti girişlerini kontrol edin ve kaydedin.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>SGK</th><th>Maaş</th><th>Yol</th><th>EK</th><th>Banka</th><th>Elden</th><th>Ödeme Tipi</th><th>Mesai Böleni</th><th>Kesinti Böleni</th><th>İşlem</th></tr></thead><tbody>{filteredEmployees.map((employee) => <tr key={employee.id} title="Çift tık: bordro öncesi kontrolü aç" onDoubleClick={() => openPayPlan(employee)}><td><span className="person">{employee.fullName}</span><span className="code">{employee.code || "-"}</span></td><td>{sgkLabel(employee)}</td><td className="money">{money(employee.salary)}</td><td className="money">{money(employee.roadAllowance)}</td><td className="money">{money(employee.extraPaymentAmount)}</td><td className="money">{money(employee.bankAmount)}</td><td className="money">{money(employee.cashAmount)}</td><td>{paymentLabel(employee)}</td><td>{employee.overtimeHourlyBase || employee.overtimeBaseHours || 225}</td><td>{employee.deductionHourlyBase || 300}</td><td><button className="btn" disabled={data.close?.isLocked} onClick={() => openPayPlan(employee)}>Giriş Kontrol</button></td></tr>)}<EmptyRow show={!filteredEmployees.length} colSpan={11} text="Personel bulunamadı." /></tbody></table></div></div>
      </section>
    );
  }

  function renderHareket() {
    return (
      <section>
        <div className="page-head"><div><h1>Mesai / Avans / Kesinti</h1><p>Seçili aya ait tüm bordro hareketlerini tek ekrandan yönetin. Toplu avans yalnız bu ekrandan kaydedilir.</p></div></div>
        {filters({ third: "Personel ara", fourth: "Tip", fifth: "Bordro etkisi" })}
        <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openFinance("Mesai")}>Mesai Ekle</button><button className="btn orange" onClick={() => openFinance("Avans")}>Avans Ekle</button><button className="btn green" onClick={() => openFinance("Toplu avans")}>Toplu Avans</button><button className="btn red" onClick={() => openFinance("Ozel kesinti")}>Kesinti Ekle</button></div><button className="btn" onClick={() => exportRowsToExcelFile(`ik-hareket-${period}.xlsx`, filteredMovements.map((item) => {
          const employee = employees.find((row) => row.id === item.employeeId);
          return { tarih: item.date || item.adjustmentDate || "", personelKodu: employee?.code || "", personel: employee?.fullName || item.fullName || "", tip: item.type, saatGun: item.hourOrDay || item.quantity || "", tutar: num(item.amount), odemeSekli: item.paymentMethod || "", bordroEtkisi: item.payrollEffect || "Bordroya yansir", aciklama: item.note || item.description || "" };
        }))}>Excel İndir</button></div>
        <div className="sumgrid short">{summaryBox("Personel", employees.length)}{summaryBox("Mesai toplamı", money(summary.overtime))}{summaryBox("Avans toplamı", money(summary.advance), "orange")}{summaryBox("Özel kesinti", money(summary.deduction), "red")}{summaryBox("İcra / Haciz", money(summary.garnishment), summary.garnishment ? "orange" : "")}</div>
        <div className="card"><div className="ch"><div><b>Hareketler</b><span>Bu liste hareket kaynağıdır; bordro sonucu Bordro & Ödeme ekranında kesinleşir.</span></div></div><div className="tw"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Tip</th><th>Saat/Gun</th><th>Tutar</th><th>Odeme Sekli</th><th>Bordro Etkisi</th><th>Aciklama</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{filteredMovements.map((item) => {
          const employee = employees.find((row) => row.id === item.employeeId);
          const finalCorrection = upper(item.note).includes("SON BORDRO KONTROL");
          const displayType = normalizeFinanceType(item.type || item.adjustmentType);
          return <tr key={item.id || `${item.employeeId}-${item.date}-${item.type}`}><td>{item.date || item.adjustmentDate || "-"}</td><td><span className="person">{employee?.fullName || item.fullName || "-"}</span><span className="code">{employee?.code || "-"}</span></td><td>{displayType === "Ozel kesinti" ? "Özel Kesinti" : displayType}{displayType === "Mesai" ? <span className="code">{overtimeTypeLabel(item.overtimeMultiplier || (upper(item.note).includes("X2") ? 2 : 1.5))}</span> : null}</td><td>{item.hourOrDay || item.quantity || "-"}</td><td className="money">{money(item.amount)}</td><td>{item.paymentMethod || "-"}</td><td>{item.payrollEffect || "Bordroya yansir"}</td><td>{item.note || item.description || "-"}</td><td><span className="badge green">Kaynak kayıt</span>{finalCorrection ? <span className="badge blue">Eski bordro düzeltmesi</span> : null}</td><td><button className="btn" disabled={data.close?.isLocked} onClick={() => openFinance(displayType, item)}>Düzenle</button> <button className="btn red" disabled={data.close?.isLocked} onClick={() => deleteFinance(item)}>Sil</button></td></tr>;
        })}<EmptyRow show={!filteredMovements.length} colSpan={10} text="Seçili filtrelerde hareket kaydı yok." /></tbody></table></div></div>
        <LogTable title="Hareket Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderIzin() {
    const today = istanbulDateKey();
    const plans = safeList(leaveCenter.plans).filter((item) => item.status !== "CANCELLED");
    const currentPlans = plans.filter((item) => item.startDate <= today && item.endDate >= today);
    const person = leaveSelected;
    const personPlans = person
      ? plans.filter((item) => item.employeeId === person.id).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))
      : [];
    const personCashRequests = person
      ? safeList(leaveCenter.cashRequests).filter((item) => item.employeeId === person.id)
      : [];
    const selectedPlan = personPlans.find((item) => item.id === leaveDetailPlanId) || personPlans[0] || null;
    const personOtherLeaves = person
      ? masterLeaves.filter((item) => item.employeeId === person.id && !upper(item.recordType || item.type).includes("YILLIK"))
      : [];
    const departmentPlans = person
      ? plans.filter((item) => item.employeeId !== person.id && item.department && item.department === person.department && item.endDate >= today)
      : [];
    const personConflicts = person
      ? safeList(leaveCenter.conflicts).filter((item) => safeList(item.people).includes(person.fullName))
      : [];
    const annualHistory = personPlans.filter((item) => item.legacy || ["APPROVED", "TAKEN"].includes(upper(item.status))).reduce((map, item) => {
      const historyYear = String(item.startDate || "").slice(0, 4) || "Tarihsiz";
      const current = map.get(historyYear) || { year: historyYear, records: 0, days: 0 };
      current.records += 1;
      current.days += num(item.countedDays);
      map.set(historyYear, current);
      return map;
    }, new Map());
    const annualHistoryRows = [...annualHistory.values()].sort((a, b) => String(b.year).localeCompare(String(a.year)));
    const initials = (value) => String(value || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
    const cashStatusLabel = (value) => upper(value) === "REVIEWED" ? "İncelendi" : upper(value) === "DECLINED" ? "Reddedildi" : upper(value) === "CLOSED" ? "Kapandı" : "Talep";
    const selectedYearPlans = personPlans.filter((item) => item.startDate?.startsWith(String(year)) || item.endDate?.startsWith(String(year)));
    const exportPlans = person ? personPlans : plans;

    return (
      <section className="ik-leave-center-v3">
        <div className="page-head ik-leave-page-head">
          <div>
            <h1>Yıllık İzin & Personel İzin Dosyası</h1>
            <p>Personel bazlı hakediş, bakiye, hızlı izin, sicil, takvim ve izin ücreti işlemleri.</p>
          </div>
          <div className="group">
            <span className="badge green">{currentPlans.length} bugün izinli</span>
            <span className={safeList(leaveCenter.conflicts).length ? "badge orange" : "badge green"}>{safeList(leaveCenter.conflicts).length} çakışma</span>
          </div>
        </div>

        <div className="ik-leave-filterbar">
          {filters({ third: "Personel ara", fourth: "Durum", fifth: "SGK" })}
        </div>

        <div className="ik-leave-workspace">
          <aside className="card ik-leave-roster">
            <div className="ik-leave-roster-head">
              <div><b>Personeller</b><span>{leaveRoster.length} kayıt · kalan izin hızlı görünüm</span></div>
              <span className="badge blue">{year}</span>
            </div>
            <div className="ik-leave-roster-list">
              {leaveRoster.map((employee) => {
                const isActive = employee.id === person?.id;
                const activeLeave = currentPlans.some((plan) => plan.employeeId === employee.id);
                return (
                  <button type="button" key={employee.id} className={isActive ? "ik-leave-roster-row active" : "ik-leave-roster-row"} onClick={() => setSelectedId(employee.id)}>
                    <span className="ik-pro-avatar">{initials(employee.fullName)}</span>
                    <span className="copy"><b>{employee.fullName}</b><small>{employee.code || "-"} · {employee.department || "Bölüm yok"}</small></span>
                    <span className="balance"><b>{num(employee.balance)} gün</b><small>{activeLeave ? "Şu an izinde" : num(employee.projectedBalance) !== num(employee.balance) ? "Plan sonrası " + num(employee.projectedBalance) : "Kalan"}</small></span>
                  </button>
                );
              })}
              {!leaveRoster.length && <div className="empty-panel">Filtreye uygun personel yok.</div>}
            </div>
          </aside>

          <main className="ik-leave-person-file">
            {!person ? <div className="card empty-panel">İzin dosyasını açmak için soldan personel seçin.</div> : <>
              <div className="ik-leave-person-hero">
                <div className="ik-leave-person-id">
                  <span className="ik-pro-avatar large">{initials(person.fullName)}</span>
                  <div><span className="eyebrow">PERSONEL İZİN DOSYASI</span><h2>{person.fullName}</h2><p>{person.code || "-"} · {person.department || "-"} · {person.title || "Unvan yok"}</p></div>
                </div>
                <div className="ik-leave-hero-actions">
                  <button className="btn primary" onClick={() => { setLeaveDeskTab("overview"); setQuickLeavePreview(null); }}>Hızlı İzin</button>
                  <button className="btn green" onClick={() => { setSelectedId(person.id); setModal("izinFis"); }}>A5 İzin Formu</button>
                  <button className="btn" onClick={() => exportRowsToExcelFile("izin-sicili-" + (person.code || person.id) + "-" + year + ".xlsx", exportPlans.map((item) => ({ personel: item.fullName, personelNo: item.code, izinTuru: item.recordType, cikis: item.startDate, sonIzinGunu: item.endDate, iseDonus: item.returnDate, sayilanGun: item.countedDays, haricGun: safeList(item.excludedDates).length, durum: leavePlanStatusLabel(item.status), not: item.note || "" })))}>Sicil Excel</button>
                </div>
              </div>

              <div className="ik-leave-kpi-grid">
                <div><span>Hak Ediş / Kanuni</span><b>{num(person.effectiveEntitlement)} / {num(person.statutoryEntitlement)} gün</b><small>{person.leaveEligible ? "Kayıtlı hak ve kıdeme/yaşa göre asgari" : "1 yıl dolmadı"}</small></div>
                <div><span>Devreden</span><b>{num(person.annualCarryover)} gün</b><small>Önceki dönem</small></div>
                <div><span>Kullanılan / Onaylı</span><b>{num(person.usedDays)} gün</b><small>{person.entitlementYear || year} yılı · Tüm geçmiş: {num(person.usedDaysAllTime)}</small></div>
                <div><span>Planlanan</span><b>{num(person.plannedDays)} gün</b><small>Henüz kesinleşmeyen</small></div>
                <div className={num(person.balance) < 0 ? "danger" : "success"}><span>{num(person.balance) < 0 ? "Eksi Bakiye / Avans" : "Kalan"}</span><b>{num(person.balance)} gün</b><small>{num(person.balance) < 0 ? "Maaş kesintisi oluşturulmaz" : "Plan sonrası " + num(person.projectedBalance) + " gün"}</small></div>
                <div><span>Kıdem / Yaş</span><b>{num(person.serviceYears)} yıl · {person.age ?? "Yaş eksik"}</b><small>{durationLabel(employeeHireDate(person), today)}</small></div>
              </div>

              <div className="ik-leave-proof-strip">
                <div><b>{person.entitlementYear || year} İzin Hesabı</b><span>{num(person.effectiveEntitlement)} hak + ({num(person.annualCarryover)} devir) + ({num(person.balanceAdjustment)} düzeltme) − {num(person.usedDays)} kullanılan/onaylı = <strong>{num(person.balance)} gün</strong></span></div>
                <div><b>Sonraki hakediş</b><span>{person.nextEntitlementDate || "İşe giriş tarihi kontrol edilmeli"}</span></div>
                <div><b>PDKS kartlı gün</b><span>{year}: {num(person.pdksWorkedDaysYear)} · toplam kayıt: {num(person.pdksWorkedDaysTotal)}</span><small>PDKS günü bilgi amaçlıdır; kanuni kıdem hesabının yerine geçmez.</small></div>
              </div>

              <nav className="ik-leave-tabs">
                {[
                  ["overview", "Özet & Hızlı İzin"],
                  ["history", "Sicil & Günler"],
                  ["calendar", "Takvim & Ekip"],
                  ["other", "Rapor / Diğer"],
                  ["cash", "İzin Ücreti"],
                  ["settings", "Hakediş & Ayarlar"],
                ].map(([key, label]) => <button type="button" key={key} className={leaveDeskTab === key ? "active" : ""} onClick={() => setLeaveDeskTab(key)}>{label}</button>)}
              </nav>

              {leaveDeskTab === "overview" && <>
                <div className="ik-leave-overview-grid">
                  <div className="card ik-leave-quick-card">
                    <div className="ch"><div><b>Hızlı Yıllık İzin Girişi</b><span>İzne çıkış ve işe dönüşü seçin; sistem hafta tatili/resmi tatili gün gün ayırsın.</span></div></div>
                    <div className="ik-leave-quick-form">
                      <label><span>İzne çıkış</span><input type="date" value={quickLeaveDraft.startDate} onChange={(event) => { setQuickLeaveDraft((old) => ({ ...old, startDate: event.target.value })); setQuickLeavePreview(null); }} /></label>
                      <label><span>İşe dönüş</span><input type="date" value={quickLeaveDraft.returnDate} onChange={(event) => { setQuickLeaveDraft((old) => ({ ...old, returnDate: event.target.value })); setQuickLeavePreview(null); }} /></label>
                      <label><span>Kayıt durumu</span><select value={quickLeaveDraft.status} onChange={(event) => setQuickLeaveDraft((old) => ({ ...old, status: event.target.value }))}><option value="APPROVED">Onaylandı / Kullanıma hazır</option><option value="PLANNED">Planlandı</option><option value="TAKEN">Kullanıldı</option></select></label>
                      <label className="wide"><span>Not</span><input value={quickLeaveDraft.note} onChange={(event) => setQuickLeaveDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Opsiyonel açıklama" /></label>
                      {quickLeavePreview && num(quickLeavePreview.annualExcessDays) > 0 && quickLeaveDraft.status !== "PLANNED" ? <>
                        <div className="wide warnline warn"><b>{num(quickLeavePreview.annualExcessDays)} gün hak aşımı:</b> Avans izin olarak kaydedilebilir; ücret veya yol kesintisi oluşturulmaz. İleride hakedişten mahsup/ücretsiz izin kararı ayrıca kayıt altına alınmalıdır.</div>
                        <label className="wide ik-check-row"><input type="checkbox" checked={quickLeaveDraft.advanceLeaveApproved === true} onChange={(event) => setQuickLeaveDraft((old) => ({ ...old, advanceLeaveApproved: event.target.checked }))} /> Hak aşımını avans izin olarak onaylıyorum</label>
                        <label className="wide"><span>Avans izin gerekçesi</span><input value={quickLeaveDraft.advanceLeaveReason || ""} onChange={(event) => setQuickLeaveDraft((old) => ({ ...old, advanceLeaveReason: event.target.value }))} placeholder="Örn. 4 gün sonraki hakedişten avans" /></label>
                      </> : null}
                    </div>
                    <div className="ik-leave-preset-row">
                      <button className="btn" onClick={() => { const start = today; setQuickLeaveDraft((old) => ({ ...old, startDate: start, returnDate: addDateDays(start, 1) })); setQuickLeavePreview(null); }}>Bugün · 1 gün</button>
                      <button className="btn" onClick={() => { const start = addDateDays(today, 1); setQuickLeaveDraft((old) => ({ ...old, startDate: start, returnDate: addDateDays(start, 1) })); setQuickLeavePreview(null); }}>Yarın · 1 gün</button>
                      <button className="btn" onClick={() => openLeave("yillik", "", person)}>Gelişmiş İzin Ekranı</button>
                    </div>
                    {quickLeavePreview ? <div className="ik-leave-quick-preview">
                      <div><span>Takvim</span><b>{num(quickLeavePreview.calendarDays)} gün</b></div>
                      <div><span>Bakiyeden düşen</span><b>{num(quickLeavePreview.countedDays)} gün</b></div>
                      <div><span>Hariç</span><b>{safeList(quickLeavePreview.excludedDates).length} gün</b></div>
                      <div><span>İzin sonrası</span><b>{num(quickLeavePreview.balanceAfter)} gün</b></div>
                      <div><span>Haktan karşılanan</span><b>{num(quickLeavePreview.annualCoveredDays)} gün</b></div>
                      <div><span>Avans / Eksi</span><b>{num(quickLeavePreview.annualExcessDays)} gün</b></div>
                    </div> : <div className="ik-leave-quick-placeholder">Önce “Günleri Hesapla” ile hafta tatili, resmi tatil ve bakiyeyi doğrulayın.</div>}
                    <div className="workbar">
                      <div className="group"><button className="btn" onClick={runQuickLeavePreview} disabled={busy}>Günleri Hesapla</button><button className="btn primary" onClick={saveQuickLeave} disabled={busy}>İzni Kaydet</button></div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="ch"><div><b>Personelin İzin Gerçeği</b><span>Personelle mutabakat için tek bakışta açıklanabilir hesap.</span></div></div>
                    <div className="ik-leave-fact-list">
                      <div><span>İşe giriş</span><b>{employeeHireDate(person) || "-"}</b></div>
                      <div><span>Doğum tarihi / yaş</span><b>{person.birthDate || "Eksik"} · {person.age ?? "-"} yaş</b></div>
                      <div><span>Hizmet süresi</span><b>{durationLabel(employeeHireDate(person), today)}</b></div>
                      <div><span>Kayıtlı yıllık hak</span><b>{num(person.recordedEntitlement)} gün</b></div>
                      <div><span>Kanuni asgari</span><b>{num(person.statutoryEntitlement)} gün</b></div>
                      <div><span>Gerekçeli düzeltme toplamı</span><b>{num(person.balanceAdjustment)} gün</b></div>
                    </div>
                    <div className="warnline ok">Kalan izin, tek bir elle yazılmış sayıdan değil; hakediş + devir + gerekçeli düzeltme − resmi/onaylı kullanım hareketlerinden oluşur.</div>
                  </div>
                </div>

                <div className="ik-leave-overview-grid">
                  <div className="card"><div className="ch"><div><b>Son / Yaklaşan İzinler</b><span>Seçili personelin en yakın kayıtları.</span></div></div><div className="leave-card-list">
                    {personPlans.slice(0, 6).map((item) => <button className="ik-leave-mini-plan" key={item.id} onClick={() => { setLeaveDetailPlanId(item.id); setLeaveDeskTab("history"); }}><span><b>{item.startDate} → {item.returnDate || item.endDate}</b><small>{item.countedDays} gün · {item.recordType}</small></span><span className={"badge " + (upper(item.status) === "PLANNED" ? "blue" : "green")}>{leavePlanStatusLabel(item.status)}</span></button>)}
                    {!personPlans.length && <div className="empty-panel">Yıllık izin kaydı yok.</div>}
                  </div></div>
                  <div className="card"><div className="ch"><div><b>Kontrol Uyarıları</b><span>Çakışma ve bakiye riski.</span></div></div><div className="ik-leave-alert-list">
                    {num(person.balance) < 0 && <div className="danger"><b>İzin avansı / eksi bakiye</b><span>{num(person.advanceLeaveDays)} gün hak aşımı var. Ücret kesintisi otomatik yapılmadı; geçmiş onay ve sonraki hakediş mutabakatı kontrol edilmeli.</span></div>}
                    {!person.birthDate && <div className="warning"><b>Doğum tarihi eksik</b><span>Yaşa bağlı 20 günlük asgari hak doğrulanamıyor.</span></div>}
                    {personConflicts.map((item) => <div className="warning" key={item.id}><b>{item.startDate} - {item.endDate}</b><span>{item.message}</span></div>)}
                    {num(person.balance) >= 0 && person.birthDate && !personConflicts.length && <div className="success"><b>Kontrol temiz</b><span>Bakiye ve çakışma tarafında kritik uyarı yok.</span></div>}
                  </div></div>
                </div>
              </>}

              {leaveDeskTab === "history" && <>
                <div className="card">
                  <div className="ch"><div><b>Yıllık İzin Sicili</b><span>Ne zaman çıktı, kaç gün kullandı, ne zaman döndü ve kayıt durumu.</span></div><span className="badge blue">{personPlans.length} kayıt</span></div>
                  <div className="tw"><table><thead><tr><th>İzne Çıkış</th><th>Son İzin Günü</th><th>İşe Dönüş</th><th>Sayılmış</th><th>Hariç</th><th>Durum</th><th>Not</th><th>İşlem</th></tr></thead><tbody>
                    {personPlans.map((item) => <tr key={item.id} className={selectedPlan?.id === item.id ? "selected-row" : ""}><td><b>{item.startDate}</b></td><td>{item.endDate}</td><td>{item.returnDate || "-"}</td><td><b>{num(item.countedDays)} gün</b></td><td>{safeList(item.excludedDates).length}</td><td><span className={"badge " + (upper(item.status) === "PLANNED" ? "blue" : "green")}>{item.legacy ? "Eski kayıt" : leavePlanStatusLabel(item.status)}</span></td><td>{item.note || "-"}</td><td><div className="row-actions"><button className="btn" onClick={() => setLeaveDetailPlanId(item.id)}>Günler</button><button className="btn" disabled={item.legacy} onClick={() => editLeavePlan(item)}>Düzenle</button><button className="btn" onClick={() => printLeaveForm(person, item)}>Form</button><button className="btn red" disabled={item.legacy} onClick={() => cancelLeave(item)}>İptal</button></div></td></tr>)}
                    <EmptyRow show={!personPlans.length} colSpan={8} text="Yıllık izin sicili boş." />
                  </tbody></table></div>
                </div>

                <div className="ik-leave-overview-grid">
                  <div className="card">
                    <div className="ch"><div><b>Gün Gün İzin Dökümü</b><span>{selectedPlan ? selectedPlan.startDate + " → " + (selectedPlan.returnDate || selectedPlan.endDate) : "Yukarıdan kayıt seçin"}</span></div></div>
                    <div className="tw"><table><thead><tr><th>Tarih</th><th>Gün</th><th>İzinden Düşen</th><th>Resmi Tatil</th><th>Neden</th></tr></thead><tbody>
                      {safeList(selectedPlan?.dayDetails).map((day) => <tr key={day.date}><td><b>{day.date}</b></td><td>{day.weekdayName || "-"}</td><td><span className={"badge " + (num(day.counted) > 0 ? "green" : "blue")}>{num(day.counted)} gün</span></td><td>{day.holidayName || "-"}</td><td>{day.reason || "-"}</td></tr>)}
                      <EmptyRow show={!safeList(selectedPlan?.dayDetails).length} colSpan={5} text={selectedPlan?.legacy ? "Eski kayıtta gün gün hesap snapshotı bulunmuyor." : "Gün dökümü için izin kaydı seçin."} />
                    </tbody></table></div>
                  </div>
                  <div className="card">
                    <div className="ch"><div><b>Yıllara Göre Mutabakat</b><span>Personelin hangi yıl kaç gün izin kaydı olduğu.</span></div></div>
                    <div className="tw"><table><thead><tr><th>Yıl</th><th>Kayıt</th><th>Toplam Gün</th></tr></thead><tbody>{annualHistoryRows.map((row) => <tr key={row.year}><td><b>{row.year}</b></td><td>{row.records}</td><td><b>{row.days} gün</b></td></tr>)}<EmptyRow show={!annualHistoryRows.length} colSpan={3} text="Geçmiş izin kaydı yok." /></tbody></table></div>
                  </div>
                </div>
              </>}

              {leaveDeskTab === "calendar" && <>
                <div className="card"><div className="ch"><div><b>{year} · {person.fullName} İzin Takvimi</b><span>Yıllık planı ay ay görün.</span></div></div><div className="leave-year-board">{MONTHS.map((name, index) => { const prefix = String(year) + "-" + String(index + 1).padStart(2, "0"); const rows = selectedYearPlans.filter((item) => item.startDate?.startsWith(prefix) || (item.startDate < prefix + "-31" && item.endDate >= prefix + "-01")); return <div className="leave-month" key={name}><h3>{name}<span>{rows.length}</span></h3>{rows.map((item) => <button key={item.id} onClick={() => { setLeaveDetailPlanId(item.id); setLeaveDeskTab("history"); }}><b>{item.startDate.slice(8)} - {(item.endDate || "").slice(8)}</b><span>{item.countedDays} gün</span><small>{leavePlanStatusLabel(item.status)}</small></button>)}{!rows.length && <em>Plan yok</em>}</div>; })}</div></div>
                <div className="ik-leave-overview-grid">
                  <div className="card"><div className="ch"><div><b>Aynı Bölüm Yaklaşan İzinleri</b><span>{person.department || "Bölüm belirtilmemiş"} ekibinde iş gücü planı.</span></div></div><div className="leave-card-list">{departmentPlans.slice(0, 12).map((item) => <div className="leave-person-card" key={item.id}><div><b>{item.fullName}</b><span>{item.department || "-"}</span></div><div><strong>{item.startDate} - {item.endDate}</strong><span>{item.countedDays} gün</span></div><span className="badge blue">{leavePlanStatusLabel(item.status)}</span></div>)}{!departmentPlans.length && <div className="empty-panel">Aynı bölümde yaklaşan izin yok.</div>}</div></div>
                  <div className="card"><div className="ch"><div><b>Çakışma Kontrolü</b><span>Aynı personel kritik; bölüm kapasitesi uyarı üretir.</span></div></div><div className="ik-leave-alert-list">{personConflicts.map((item) => <div className={item.severity === "CRITICAL" ? "danger" : "warning"} key={item.id}><b>{item.startDate} - {item.endDate}</b><span>{item.message}</span></div>)}{!personConflicts.length && <div className="success"><b>Çakışma yok</b><span>Seçili personelin aktif planlarında çakışma bulunmadı.</span></div>}</div></div>
                </div>
              </>}

              {leaveDeskTab === "other" && <>
                <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openLeave("gunluk", "Rapor", person)}>Rapor Gir</button><button className="btn" onClick={() => openLeave("gunluk", "Normal izin", person)}>Normal İzin</button><button className="btn" onClick={() => openLeave("gunluk", "Ucretsiz izin", person)}>Ücretsiz İzin</button><button className="btn" onClick={() => openLeave("gunluk", "Mazeret izni", person)}>Mazeret</button></div></div>
                <div className="card"><div className="ch"><div><b>Rapor / Mazeret / Diğer İzin Sicili</b><span>Yıllık izin bakiyesinden ayrı devam kayıtları.</span></div></div><div className="tw"><table><thead><tr><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Ücret Etkisi</th><th>Belge</th><th>Not</th></tr></thead><tbody>{personOtherLeaves.map((item) => <tr key={item.id}><td><b>{item.recordType || item.type || "-"}</b></td><td>{item.startDate || item.start || "-"}</td><td>{item.endDate || item.end || "-"}</td><td>{num(item.dayCount || item.days)}</td><td>{item.effectType || item.effect || "-"}</td><td><span className={"badge " + (item.documentPath ? "green" : "orange")}>{item.documentPath ? "Var" : "Eksik"}</span></td><td>{item.note || item.description || "-"}</td></tr>)}<EmptyRow show={!personOtherLeaves.length} colSpan={7} text="Diğer izin / rapor kaydı yok." /></tbody></table></div></div>
              </>}

              {leaveDeskTab === "cash" && <>
                <div className="warnline warn ik-leave-legal-note"><b>Önemli:</b> İş ilişkisi devam ederken “izne çıkmayayım, parasını alayım” talebi kayıt altına alınabilir; bu kayıt yıllık izin bakiyesini otomatik düşürmez. İşten çıkış kullanılmamış izin ödemesi de bu ekranda yalnız talep/hesap kaydıdır; gerçek bordro/ödeme ayrıca tamamlanır.</div>
                <div className="ik-leave-overview-grid">
                  <div className="card"><div className="ch"><div><b>İzin Ücreti Talebi Aç</b><span>Talep ile gerçek ödeme ve izin bakiyesi birbirine karışmasın.</span></div></div><div className="ik-leave-cash-form">
                    <label><span>Talep tipi</span><select value={leaveCashDraft.requestType} onChange={(event) => setLeaveCashDraft((old) => ({ ...old, requestType: event.target.value }))}><option value="ACTIVE_EMPLOYMENT_REQUEST">Çalışırken izin yerine ücret talebi</option><option value="TERMINATION_PAYOUT">İşten çıkış kullanılmamış izin hesabı</option></select></label>
                    <label><span>Talep tarihi</span><input type="date" value={leaveCashDraft.requestDate} onChange={(event) => setLeaveCashDraft((old) => ({ ...old, requestDate: event.target.value }))} /></label>
                    <label><span>Talep edilen gün</span><input type="number" step="0.5" min="0" value={leaveCashDraft.requestedDays} onChange={(event) => setLeaveCashDraft((old) => ({ ...old, requestedDays: event.target.value }))} /></label>
                    <label className="wide"><span>Personel beyanı / not</span><textarea value={leaveCashDraft.note} onChange={(event) => setLeaveCashDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Personelin talebi, görüşme notu veya açıklama" /></label>
                    <button className="btn primary wide" onClick={saveLeaveCashRequest} disabled={busy}>Talebi Kaydet</button>
                  </div></div>
                  <div className="card"><div className="ch"><div><b>Bu Personelin Talep Geçmişi</b><span>Referans tutar maaş/30 × gün olarak yalnız iç kontrol amacıyla gösterilir.</span></div></div><div className="ik-leave-request-list">{personCashRequests.map((request) => <div className="ik-leave-request" key={request.id}><div><b>{request.requestDate} · {request.requestedDays} gün</b><span>{request.requestType === "TERMINATION_PAYOUT" ? "İşten çıkış izin hesabı" : "Çalışırken ücret talebi"}</span><small>{request.note || "Not yok"}</small></div><div><strong>{money(request.referenceAmount)}</strong><span className="badge blue">{cashStatusLabel(request.status)}</span></div><div className="row-actions"><button className="btn" onClick={() => updateLeaveCashRequestStatus(request, "REVIEWED")}>İncelendi</button><button className="btn red" onClick={() => updateLeaveCashRequestStatus(request, "DECLINED")}>Reddet</button><button className="btn green" onClick={() => updateLeaveCashRequestStatus(request, "CLOSED")}>Kapat</button></div></div>)}{!personCashRequests.length && <div className="empty-panel">İzin ücreti talebi yok.</div>}</div></div>
                </div>
              </>}

              {leaveDeskTab === "settings" && <>
                <div className="ik-leave-overview-grid">
                  <div className="card"><div className="ch"><div><b>Personel Hakediş & Bakiye Ayarı</b><span>Doğum tarihi yaş kuralını; hakediş ve devir ise resmi bakiye hesabını besler.</span></div></div><div className="ik-leave-settings-form">
                    <label><span>Doğum tarihi</span><input type="date" value={leaveProfileDraft.birthDate} onChange={(event) => setLeaveProfileDraft((old) => ({ ...old, birthDate: event.target.value }))} /></label>
                    <label><span>Kayıtlı yıllık hak</span><input type="number" step="0.5" min="0" value={leaveProfileDraft.annualLeaveEntitlement} onChange={(event) => setLeaveProfileDraft((old) => ({ ...old, annualLeaveEntitlement: event.target.value }))} /></label>
                    <label><span>Devreden izin (eksi olabilir)</span><input type="number" step="0.5" value={leaveProfileDraft.annualLeaveCarryover} onChange={(event) => setLeaveProfileDraft((old) => ({ ...old, annualLeaveCarryover: event.target.value }))} /></label>
                    <label><span>Bakiye düzeltme (+ / -)</span><input type="number" step="0.5" value={leaveProfileDraft.adjustmentDays} onChange={(event) => setLeaveProfileDraft((old) => ({ ...old, adjustmentDays: event.target.value }))} placeholder="Örn. 2 veya -1" /></label>
                    <label className="wide"><span>Düzeltme gerekçesi</span><textarea value={leaveProfileDraft.adjustmentReason} onChange={(event) => setLeaveProfileDraft((old) => ({ ...old, adjustmentReason: event.target.value }))} placeholder="Manuel düzeltme varsa gerekçe zorunlu" /></label>
                    <div className="wide ik-leave-law-summary"><b>Sistem önerisi: {num(person.statutoryEntitlement)} gün kanuni asgari</b><span>İşe giriş {employeeHireDate(person) || "-"} · yaş {person.age ?? "-"} · kıdem {num(person.serviceYears)} yıl. Sistem kayıtlı hakkı kanuni asgarinin altına kaydetmez.</span></div>
                    <button className="btn primary wide" onClick={saveLeaveProfile} disabled={busy}>Hakediş Bilgilerini Kaydet</button>
                  </div>
                  <div className="ik-leave-adjustment-history"><b>Gerekçeli Düzeltme Geçmişi</b>{safeList(person.leaveProfile?.adjustments).slice().reverse().map((item) => <div key={item.id}><span>{item.date || "-"}</span><strong>{num(item.days) > 0 ? "+" : ""}{num(item.days)} gün</strong><small>{item.reason || "-"} · {item.actor || "IK"}</small></div>)}{!safeList(person.leaveProfile?.adjustments).length && <span className="empty-panel">Manuel bakiye düzeltmesi yok.</span>}</div></div>

                  <div className="card"><div className="ch"><div><b>Şirket İzin Sayım Politikası</b><span>Haftanın hangi günlerinin yıllık izinden sayılacağını ve resmi tatil davranışını yönetin.</span></div></div><div className="leave-policy-grid"><div><div className="weekday-picker">{[[1,"Pazartesi"],[2,"Salı"],[3,"Çarşamba"],[4,"Perşembe"],[5,"Cuma"],[6,"Cumartesi"],[0,"Pazar"]].map(([day,label]) => { const checked=safeList(policyDraft.countedWeekdays).includes(day); return <label key={day} className={checked ? "checked" : ""}><input type="checkbox" checked={checked} onChange={(event) => setPolicyDraft((old) => ({ ...old, countedWeekdays: event.target.checked ? [...new Set([...safeList(old.countedWeekdays), day])].sort() : safeList(old.countedWeekdays).filter((value) => value !== day) }))} /><b>{label}</b><span>{checked ? "İzinden sayılır" : "Hafta tatili / sayılmaz"}</span></label>; })}</div></div><div className="policy-side"><label className="ik-check-row"><input type="checkbox" checked={policyDraft.excludeOfficialHolidays !== false} onChange={(event) => setPolicyDraft((old) => ({ ...old, excludeOfficialHolidays: event.target.checked }))} /> Resmi tatilleri yıllık izinden düşme</label><label><span>Aynı bölüm eş zamanlı izin sınırı</span><input type="number" min="1" value={policyDraft.maxConcurrentDepartment || 1} onChange={(event) => setPolicyDraft((old) => ({ ...old, maxConcurrentDepartment: Math.max(1, num(event.target.value)) }))} /></label><button className="btn primary" onClick={saveLeavePolicy} disabled={busy}>Şirket Politikasını Kaydet</button></div></div></div>
                </div>
              </>}
            </>}
          </main>
        </div>
        <LogTable title="İzin İşlem Logları" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderBordro() {
    if (!periodPrepared) {
      return (
        <section>
          <div className="page-head"><div><h1>Son Bordro ve Ödeme Merkezi</h1><p>{MONTHS[month - 1]} {year} bordrosu henüz hazırlanmadı.</p></div><span className="badge orange">Hazırlanmadı</span></div>
          {filters({ third: "Personel ara", fourth: "Ödeme", fifth: "Durum" })}
          <div className="card"><div className="ch"><div><b>Önce Bilgileri Hazırla</b><span>Yeni aya geçildiğinde önceki ayın hesapları otomatik olarak yeni aya taşınmaz.</span></div></div><div className="warnline warn">Personel, maaş, yol, EK, mesai, avans, kesinti, icra/haciz ve ödeme planı seçili dönem için yeniden okunacak.</div><button className="btn primary" disabled={busy} onClick={preparePeriod}>{busy ? "Hazırlanıyor" : "Bilgileri Hazırla"}</button></div>
        </section>
      );
    }
    return (
      <section>
        <div className="page-head"><div><h1>Son Bordro ve Ödeme Merkezi</h1><p>Resmi bordro, puantaj, avans/kesinti ve banka ödemesi çıktı öncesi burada son kez kontrol edilir.</p></div><div className="group"><span className="badge blue">{MONTHS[month - 1]} {year}</span><span className={`badge ${data.close?.isLocked ? "red" : "blue"}`}>{data.close?.isLocked ? "Dönem Kapalı" : "Dönem Açık"}</span><span className={`badge ${balanced ? "green" : "red"}`}>{balanced ? "Ödeme dengeli" : "Ödeme kontrol gerekli"}</span></div></div>
        {filters({ third: "Personel ara", fourth: "Odeme", fifth: "Durum" })}
        <div className="workbar payroll-employment-switch"><div className="group">
          <button type="button" className={`btn ${payrollEmploymentFilter === "ACTIVE" ? "primary" : ""}`} onClick={() => setPayrollEmploymentFilter("ACTIVE")}>Aktif ({payrollRows.filter((row) => ["ACTIVE","NEW_HIRE","MISSING_HIRE_DATE","MISSING_EXIT_DATE"].includes(employmentStateAtPeriod(row.employee, period))).length})</button>
          <button type="button" className={`btn ${payrollEmploymentFilter === "EXITED" ? "orange" : ""}`} onClick={() => setPayrollEmploymentFilter("EXITED")}>İşten Ayrılan ({payrollRows.filter((row) => ["EXIT_MONTH","ENTERED_EXITED"].includes(employmentStateAtPeriod(row.employee, period))).length})</button>
        </div><span>Seçili aydan önce ayrılan personel bordroya alınmaz.</span></div>
        <div className="sumgrid short">{summaryBox("Ödeme listesi", filteredPayrollRows.length, "", `${payrollRows.length} toplam · ${selectedPayrollIds.length || payrollRows.length} seçili`)}{summaryBox("Maaş", money(summary.salary))}{summaryBox("Yol", money(summary.road))}{summaryBox("Mesai", money(summary.overtime))}{summaryBox("Hak Ediş", money(summary.hakedis))}{summaryBox("Avans / Kesinti", `${money(summary.advance)} / ${money(summary.deduction)}`, "orange")}{summaryBox("İcra / Haciz", money(summary.garnishment), summary.garnishment ? "orange" : "")}{summaryBox("Banka", money(summary.bank))}{summaryBox("Elden", money(summary.cash))}{summaryBox("Net Toplam", money(summary.net), balanced ? "green" : "red")}</div>
        <div className="workbar payroll-clean-actions">
          <div className="group payroll-edit-actions">
            <button className="btn primary" disabled={busy || data.close?.isLocked} onClick={refreshPayroll}>Yeniden Hesapla</button>
            <button className="btn" disabled={busy || data.close?.isLocked} onClick={savePayroll}>Ara Kaydet</button>
            <button className="btn" disabled={busy || data.close?.isLocked} onClick={() => openPayroll()}>Seçili Son Kontrol</button>
          </div>
          <div className="group payroll-output-actions">
            <button className="btn orange" disabled={busy || !payrollRows.length} onClick={printMonthlyControlReport}>Aylık Kontrol</button>
            <button className="btn" disabled={busy || !balanced} onClick={openBulkPayment}>Banka / Toplu</button>
            <button className="btn" disabled={busy || !balanced} onClick={printPayrollReport}>Bordro PDF</button>
            <button className="btn" disabled={busy || !balanced} onClick={printPaymentSlips}>10’lu Fiş</button>
            <button className="btn" disabled={busy} onClick={() => setModal("fis")}>Tek Kişi Fiş</button>
            <button className="btn" disabled={busy || !balanced} onClick={exportPayroll}>Excel</button>
          </div>
          <button
            className={`btn payroll-lock-toggle ${data.close?.isLocked ? "primary" : "red"}`}
            disabled={busy}
            onClick={() => runClose(data.close?.isLocked ? "UNLOCK" : "LOCK")}
          >{data.close?.isLocked ? "Kilidi Aç" : "Ayı Kilitle"}</button>
        </div>
        {data.close?.isLocked
          ? <div className="warnline warn"><b>AY KİLİTLİ.</b> Düzenleme kapalıdır; PDF, fiş ve Excel çıktıları alınabilir. Değişiklik için <b>Kilidi Aç</b>.</div>
          : <div className={`warnline ${balanced ? "ok" : "warn"}`}>{balanced ? "AY AÇIK · Bordro düzenlenebilir. PDF / fiş / Excel yalnız çıktı alır; ayı kilitlemez ve ödeme durumunu değiştirmez." : "AY AÇIK · Düzenleme serbest; ancak Banka + Elden = Net dengesi kurulmadan final çıktı alınamaz."}</div>}
        <div className="card">
          <div className="ch"><div><b>Çıktı Öncesi Son Bordro</b><span>Bu tablo sonuç ekranıdır. Düzenleme gerçek kaynağa yazılır: ücret planı veya Mesai / Avans / Kesinti hareketi. Ayrı bordro override kaynağı kullanılmaz.</span></div></div>
          <div className="tw payroll-screen-table-wrap"><table className="payroll-screen-table"><thead><tr>
            <th className="check-col"><input type="checkbox" checked={filteredPayrollRows.length>0&&filteredPayrollRows.every((row)=>selectedPayrollIds.includes(row.employee.id))} onChange={(event)=>setSelectedPayrollIds(event.target.checked?[...new Set([...selectedPayrollIds,...filteredPayrollRows.map((row)=>row.employee.id)])]:selectedPayrollIds.filter((id)=>!filteredPayrollRows.some((row)=>row.employee.id===id)))} /></th>
            <th className="person-col">Personel</th>
            <th className="official-col">Resmi Bordro</th>
            <th className="summary-col">Hak Ediş</th>
            <th className="summary-col">Kesintiler</th>
            <th className="payment-col">Ödeme</th>
            <th className="status-col">Durum</th>
            <th className="action-col">İşlem</th>
          </tr></thead><tbody>
            {filteredPayrollRows.map((row) => <tr key={row.employee.id} title="Çift tık: gerçek kaynakları düzenle" onDoubleClick={() => openPayroll(row)}>
              <td className="check-col"><input type="checkbox" checked={selectedPayrollIds.includes(row.employee.id)} onChange={(event)=>setSelectedPayrollIds((old)=>event.target.checked?[...new Set([...old,row.employee.id])]:old.filter((id)=>id!==row.employee.id))} /></td>
              <td className="person-col"><span className="person">{row.employee.fullName}</span><span className="code">{row.employee.code || "-"} · {row.employee.department || "Bölüm yok"}</span><span className="employment-dates">Giriş: {employeeHireDate(row.employee) || "-"} · Çıkış: {employeeExitDate(row.employee) || "-"}</span></td>
              <td className="official-col"><div className="payroll-cell-stack"><span><em>SGK Gün</em><b>{num(row.employee.sgkDays)||"-"}</b></span><span><em>Resmi Net</em><b>{num(row.employee.sgkNet)>0?money(row.employee.sgkNet):"-"}</b></span></div></td>
              <td className="summary-col"><div className="payroll-cell-stack"><span><em>Maaş</em><b>{money(row.salary)}</b></span><span><em>Yol / EK</em><b>{money(row.road)} / {money(row.extra)}</b></span><span><em>Mesai</em><b>{money(row.overtime)}</b></span><span className="cell-total"><em>Hak Ediş</em><b>{money(row.hakedis)}</b></span></div></td>
              <td className="summary-col"><div className="payroll-cell-stack"><span><em>Avans</em><b>{money(row.advance)}</b></span><span><em>Kesinti</em><b>{money(row.deduction)}</b></span><span><em>İcra/Haciz</em><b>{money(row.garnishment)}</b></span></div></td>
              <td className="payment-col"><div className="payroll-cell-stack"><span><em>Banka</em><b>{money(row.bank)}</b></span><span><em>Elden</em><b>{money(row.cash)}</b></span><span className="cell-total net"><em>Net Ödenecek</em><b>{money(row.net)}</b></span></div></td>
              <td className="status-col"><span className={`badge ${num(row.employee.sgkNet)>0?"blue":"orange"}`}>{num(row.employee.sgkNet)>0?"Bordro":"Plan"}</span><span className={`badge ${data.close?.isLocked?"red":row.diff===0?"green":"red"}`}>{data.close?.isLocked?"Kilitli":row.diff===0?"Hazır":"Kontrol"}</span>{row.sourceChangedSinceSave ? <span className="badge orange">Kaynak değişti</span> : null}</td>
              <td className="action-col">
                <details className="payroll-row-actions">
                  <summary>İşlemler</summary>
                  <div className="payroll-row-menu">
                    <button className="btn primary" disabled={data.close?.isLocked} onClick={()=>openPayroll(row)}>Son Kontrol / Düzenle</button>
                    <button className="btn" onClick={()=>{setSelectedId(row.employee.id);setSearch(row.employee.code || row.employee.fullName);go("hareket");}}>Kaynak Hareketleri / Log</button>
                    <button className="btn" onClick={()=>{setSelectedId(row.employee.id);setModal("fis");}}>Fiş</button>
                  </div>
                </details>
              </td>
            </tr>)}
            <EmptyRow show={!filteredPayrollRows.length} colSpan={8} text="Filtreye uygun bordro personeli bulunamadı." />
          </tbody>{filteredPayrollRows.length ? <tfoot><tr className="payroll-screen-total"><td></td><td><b>GENEL TOPLAM · {filteredPayrollRows.length} kişi</b></td><td><div className="payroll-cell-stack"><span><em>SGK Gün</em><b>{filteredPayrollRows.reduce((sum,row)=>sum+num(row.employee.sgkDays),0)}</b></span><span><em>Resmi Net</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.employee.sgkNet),0))}</b></span></div></td><td><div className="payroll-cell-stack"><span><em>Maaş</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.salary),0))}</b></span><span><em>Yol / EK</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.road),0))} / {money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.extra),0))}</b></span><span><em>Mesai</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.overtime),0))}</b></span><span className="cell-total"><em>Hak Ediş</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.hakedis),0))}</b></span></div></td><td><div className="payroll-cell-stack"><span><em>Avans</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.advance),0))}</b></span><span><em>Kesinti</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.deduction),0))}</b></span><span><em>İcra/Haciz</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.garnishment),0))}</b></span></div></td><td><div className="payroll-cell-stack"><span><em>Banka</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.bank),0))}</b></span><span><em>Elden</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.cash),0))}</b></span><span className="cell-total net"><em>Net Ödenecek</em><b>{money(filteredPayrollRows.reduce((sum,row)=>sum+num(row.net),0))}</b></span></div></td><td><span className="badge blue">Kontrol</span></td><td>-</td></tr></tfoot> : null}</table></div>
        </div>
        <LogTable title="Bordro Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderEvrak() {
    return (
      <section>
        <div className="page-head"><div><h1>SGK Bordro · Evrak · Ay Sonu</h1><p>Resmi bordro, personel evrakları ve dönem kapanışı aynı seçili ay üzerinden kontrol edilir.</p></div><div className="group"><span className={`badge ${data.sgkImport ? "green" : "orange"}`}>{data.sgkImport ? `SGK Bordro v${data.sgkImport.versionNo}` : "SGK bordro bekleniyor"}</span><span className={`badge ${data.close?.isLocked ? "red" : "blue"}`}>{data.close?.isLocked ? "Dönem Kapalı" : "Dönem Açık"}</span></div></div>
        {filters({ third: "Personel ara", fourth: "Evrak", fifth: "SGK" })}
        <div className="workbar"><div className="group"><input ref={payrollInput} type="file" accept=".xls,.xlsx" multiple hidden onChange={(event)=>previewPayrollFiles(event.target.files)} /><button className="btn primary" disabled={busy || data.close?.isLocked} onClick={() => payrollInput.current?.click()}>Resmi Bordro XLS/XLSX</button><button className="btn" onClick={() => openDocument()}>Evrak Yükle</button><button className="btn" onClick={() => setModal("izinFis")}>İzin Formu</button><button className="btn" onClick={() => setModal("kidemCikti")}>Ayrılış Ödeme Özeti</button><button className="btn orange" disabled={busy} onClick={() => runClose("CHECK")}>Ay Sonu Kontrol</button><button className={`btn ${data.close?.isLocked ? "primary" : "red"}`} disabled={busy} onClick={() => runClose(data.close?.isLocked ? "UNLOCK" : "LOCK")}>{data.close?.isLocked ? "Kilidi Aç" : "Ayı Kilitle"}</button></div></div>
        <div className="sumgrid short">{summaryBox("Bordro satiri", safeList(data.sgkRows).length)}{summaryBox("Eslesen personel", safeList(data.sgkRows).filter((row)=>row.employeeId).length,"green")}{summaryBox("SGK gun",safeList(data.sgkRows).reduce((sum,row)=>sum+num(row.sgkDays),0))}{summaryBox("Resmi net",money(safeList(data.sgkRows).reduce((sum,row)=>sum+num(row.net),0)))}{summaryBox("Yeni giris",safeList(data.sgkRows).filter((row)=>row.hireDate?.startsWith(period)).length,"orange")}{summaryBox("Cikis",safeList(data.sgkRows).filter((row)=>row.exitDate?.startsWith(period)).length,"red")}</div>
        <div className="card sgk-payroll-card"><div className="ch"><div><b>Onayli Resmi Bordro Verisi</b><span>Net Istihkak banka listesine, SGK gun puantaj kontrolune aktarilir.</span></div><button className="btn" onClick={()=>go("bordro")}>Son Bordroya Git</button></div><div className="tw"><table><thead><tr><th>Personel</th><th>TC</th><th>Giris</th><th>Cikis</th><th>SGK Gun</th><th>Normal Kazanc</th><th>Toplam Kazanc</th><th>SGK Matrah</th><th>SGK Primi</th><th>Vergi</th><th>Net Istihkak</th><th>Kaynak</th></tr></thead><tbody>{safeList(data.sgkRows).map((row)=><tr key={row.id}><td>{row.fullName}</td><td>{row.identityNo||"-"}</td><td>{row.hireDate||"-"}</td><td>{row.exitDate||"-"}</td><td>{row.sgkDays}</td><td className="money">{money(row.normalEarning)}</td><td className="money">{money(row.gross)}</td><td className="money">{money(row.sgkBase)}</td><td className="money">{money(row.sgkPremium)}</td><td className="money">{money(num(row.incomeTax)+num(row.stampTax))}</td><td className="money">{money(row.net)}</td><td>{row.source?.sourceFile||data.sgkImport?.fileName||"-"}</td></tr>)}<EmptyRow show={!safeList(data.sgkRows).length} colSpan={12} text="Bu donem icin onayli bordro yok. Bir veya birden cok XLS dosyasi yukleyin." /></tbody></table></div></div>
        <div className="layout2"><div className="card"><div className="ch"><div><b>Evrak / Belge Baglantilari</b><span>Yuklenen belgeler burada listelenir.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Belge Turu</th><th>Dosya</th><th>Tarih</th><th>Not</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{filteredDocuments.map((doc) => <tr key={doc.id}><td>{employees.find((item) => item.id === doc.employeeId)?.fullName || "-"}</td><td>{doc.documentType || "-"}</td><td>{doc.fileName || "-"}</td><td>{doc.date || doc.createdAt || "-"}</td><td>{doc.note || doc.storagePath || "-"}</td><td><span className="badge green">{doc.status || "Kayitli"}</span></td><td><button className="btn" onClick={async () => { try { await downloadIkAdvancedDocument(doc.id, doc.fileName || "ik-evrak"); setNotice("Evrak indirildi."); } catch (error) { setNotice(error?.message || "Evrak indirilemedi."); } }}>İndir</button></td></tr>)}<EmptyRow show={!filteredDocuments.length} colSpan={7} text="Filtreye uygun kayıtlı evrak yok." /></tbody></table></div></div><div className="card"><div className="ch"><div><b>Eksik Evrak Kontrolu</b><span>Bordro loglari burada gorunmez.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Eksik Belge</th><th>Tarih</th><th>Not</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{employees.filter((employee) => visibleDocumentEmployeeIds.has(employee.id) && !docsFor(employee).length).map((employee) => <tr key={employee.id}><td>{employee.fullName}</td><td>Personel evragi</td><td>{period}</td><td>Evrak baglantisi yok</td><td><span className="badge orange">Eksik</span></td><td><button className="btn" onClick={() => openDocument(employee)}>Yukle</button></td></tr>)}<EmptyRow show={!employees.some((employee) => visibleDocumentEmployeeIds.has(employee.id) && !docsFor(employee).length)} colSpan={6} text="Filtreye uygun eksik evrak görünmüyor." /></tbody></table></div></div></div>
        {!!checks.length && <div className="card"><div className="ch"><div><b>Ay Sonu Kontrol Maddeleri</b><span>Kontrol sonucu.</span></div></div><div className="tw"><table><thead><tr><th>Kontrol maddesi</th><th>Durum</th><th>Aciklama</th><th>Islem</th></tr></thead><tbody>{checks.map((item, index) => <tr key={index}><td>{item.title || item.type}</td><td><span className={`badge ${item.ok ? "green" : "orange"}`}>{item.ok ? "Tamam" : "Duzelt"}</span></td><td>{item.detail || "-"}</td><td>{item.ok ? "-" : <button className="btn" onClick={() => go("personel")}>Ac</button>}</td></tr>)}</tbody></table></div></div>}
        <LogTable title="SGK / Evrak Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function withPerson(log) {
    return { ...log, personName: masterEmployees.find((item) => item.id === log.employeeId)?.fullName || log.fullName || "-" };
  }

  function renderModal() {
    if (!modal) return null;
    if (modal === "personel") {
      const personIndex = masterEmployees.findIndex((item) => item.id === modalDraft.id);
      const previousPerson = personIndex > 0 ? masterEmployees[personIndex - 1] : null;
      const nextPerson = personIndex >= 0 && personIndex < masterEmployees.length - 1 ? masterEmployees[personIndex + 1] : null;
      return (
      <Modal title="Personel Kartı ve Ödeme Ayarları" sub="Kimlik, çalışma, SGK, ücret, banka ve izin bilgilerini tek ekrandan yönetin" size="medium" onClose={() => setModal(null)}>
        {modalDraft.id ? <div className="person-modal-nav">
          <button type="button" className="btn" disabled={busy || !previousPerson} onClick={() => previousPerson && switchPersonInModal(previousPerson.id)}>← Önceki</button>
          <label>
            <span>Personel Seç</span>
            <select value={modalDraft.id || ""} disabled={busy} onChange={(event) => switchPersonInModal(event.target.value)}>
              {masterEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code || "HKN yok"} · {employee.fullName}</option>)}
            </select>
          </label>
          <span className="person-modal-position">{personIndex >= 0 ? personIndex + 1 : 0} / {masterEmployees.length}</span>
          <button type="button" className="btn" disabled={busy || !nextPerson} onClick={() => nextPerson && switchPersonInModal(nextPerson.id)}>Sonraki →</button>
          <small>Kişi değiştirildiğinde kaydedilmemiş alanlar bırakılır; önce Kaydet'e basın.</small>
        </div> : null}
        <div className="modal-section-grid">
          <div className="modal-section"><h3>Kimlik ve Çalışma Bilgileri</h3><div className="form"><Field label="Ad Soyad" half><input value={modalDraft.fullName||""} onChange={(event)=>setModalDraft((old)=>({...old,fullName:event.target.value}))}/></Field><Field label="TC Kimlik No"><input value={modalDraft.identityNo||""} maxLength={11} onChange={(event)=>setModalDraft((old)=>({...old,identityNo:event.target.value.replace(/\D/g,"")}))}/></Field><Field label="Personel Kodu"><input value={modalDraft.code||""} readOnly /></Field><Field label="Kart No"><input value={modalDraft.cardNo||""} onChange={(event)=>setModalDraft((old)=>({...old,cardNo:event.target.value}))}/></Field><Field label="İşe Giriş"><input type="date" value={modalDraft.startDate||""} onChange={(event)=>setModalDraft((old)=>({...old,startDate:event.target.value}))}/></Field><Field label="İşten Çıkış"><input type="date" value={modalDraft.exitDate||""} onChange={(event)=>setModalDraft((old)=>({...old,exitDate:event.target.value,status:event.target.value?"Pasif":"Aktif"}))}/></Field><Field label="Görev"><input value={modalDraft.title||""} onChange={(event)=>setModalDraft((old)=>({...old,title:event.target.value}))}/></Field><Field label="Bölüm"><input value={modalDraft.department||""} onChange={(event)=>setModalDraft((old)=>({...old,department:event.target.value}))}/></Field><Field label="Çalışma Durumu"><input value={modalDraft.exitDate ? "İşten ayrılmış / pasif" : "Aktif"} readOnly /><div className="employment-actions">{modalDraft.exitDate ? <button type="button" className="btn" onClick={()=>setModalDraft((old)=>({...old,exitDate:"",status:"Aktif",changeNote:old.changeNote||"Personel yeniden aktife alındı"}))}>Aktife Geri Al</button> : <button type="button" className="btn orange" onClick={()=>setModalDraft((old)=>({...old,exitDate:istanbulDateKey(),status:"Pasif",changeNote:old.changeNote||"İşten çıkış kaydı"}))}>İşten Çıkış Bugün</button>}</div></Field></div></div>
          <div className="modal-section"><h3>SGK ve Bordro Kapsamı · {MONTHS[month-1]} {year}</h3><div className="form">
            <Field label="Personel Statüsü" half><select value={modalDraft.personnelStatus||"NORMAL"} onChange={(event)=>setModalDraft((old)=>({...old,personnelStatus:event.target.value}))}><option value="NORMAL">Normal</option><option value="RETIRED">Emekli</option></select></Field>
            <Field label="SGK Durumu" half><select value={modalDraft.sgkFollow||"BELIRTILMEMIS"} disabled={Boolean(data.close?.isLocked) || modalDraft.sgkDaySource==="RESMI_BORDRO"} onChange={(event)=>setModalDraft((old)=>({...old,sgkFollow:event.target.value,sgkDays:event.target.value==="SGKSIZ"?0:old.sgkDays,sgkDaySourceIntent:"MANUEL"}))}><option value="SGKLI">SGK'lı</option><option value="SGKSIZ">SGK'sız</option><option value="BELIRTILMEMIS">Seçiniz</option></select></Field>
            <Field label="SGK Gün (Kayıt)" half><input type="number" min="0" max={30} value={modalDraft.sgkDays??""} placeholder={modalDraft.suggestedSgkDays===null||modalDraft.suggestedSgkDays===undefined?"":String(modalDraft.suggestedSgkDays)} disabled={Boolean(data.close?.isLocked) || modalDraft.sgkFollow==="SGKSIZ" || modalDraft.sgkDaySource==="RESMI_BORDRO"} onChange={(event)=>setModalDraft((old)=>({...old,sgkDays:event.target.value,sgkDaySourceIntent:"MANUEL"}))}/></Field>
            <Field label="Önerilen SGK Gün" half><div className="inline-action-field"><input value={modalDraft.suggestedSgkDays??""} readOnly/><button type="button" className="btn" disabled={Boolean(data.close?.isLocked) || modalDraft.sgkFollow!=="SGKLI" || modalDraft.sgkDaySource==="RESMI_BORDRO" || modalDraft.suggestedSgkDays===null || modalDraft.suggestedSgkDays===undefined} onClick={()=>setModalDraft((old)=>({...old,sgkDays:old.suggestedSgkDays,sgkDaySourceIntent:"SISTEM_ONERISI"}))}>Öneriyi Kullan</button></div></Field>
            <Field label="PDKS Kartlı Gün (Kontrol)" half><input value={modalDraft.pdksCardDays??0} readOnly/></Field>
            <Field label="SGK Gün Kaynağı" half><input value={sgkDaySourceLabel(modalDraft.sgkDaySourceIntent||modalDraft.sgkDaySource)} readOnly/></Field>
            <Field label="Bordro Kapsamı" half><select value={modalDraft.payrollIncluded===false?"HARIC":"DAHIL"} onChange={(event)=>setModalDraft((old)=>({...old,payrollIncluded:event.target.value==="DAHIL"}))}><option value="DAHIL">Şirket bordrosuna dahil</option><option value="HARIC">Harici - ödeme ve puantaja alma</option></select></Field>
            <Field label="Yıllık İzin Hakkı"><input type="number" value={modalDraft.annualLeaveEntitlement||""} onChange={(event)=>setModalDraft((old)=>({...old,annualLeaveEntitlement:event.target.value}))}/></Field>
            <Field label="Devreden İzin"><input type="number" value={modalDraft.annualLeaveCarryover||""} onChange={(event)=>setModalDraft((old)=>({...old,annualLeaveCarryover:event.target.value}))}/></Field>
            {data.close?.isLocked ? <div className="wide warnline warn">{MONTHS[month-1]} {year} dönemi kapalı. Bu dönemin SGK durumu/günü değiştirilemez; personel ana kartı ve yeni geçerlilik tarihli ücret bilgileri kaydedilebilir.</div> : null}
            {modalDraft.sgkDaySource==="RESMI_BORDRO" ? <div className="wide warnline">SGK günü resmi bordro dosyasından geliyor. Bu değer personel kartından değiştirilmez; düzeltme SGK / Ay Sonu bölümündeki resmi dosya üzerinden yapılır.</div> : null}
            {modalDraft.sgkFollow==="SGKLI" && modalDraft.sgkDays!=="" && num(modalDraft.sgkDays)!==num(modalDraft.pdksCardDays) ? <div className="wide warnline warn">Kontrol farkı: SGK günü {num(modalDraft.sgkDays)}, PDKS kartlı gün {num(modalDraft.pdksCardDays)}. PDKS kartlı gün yalnız kontrol verisidir; izin/hafta tatili ve diğer yasal nedenlerle SGK günüyle bire bir aynı olmak zorunda değildir.</div> : null}
            {modalDraft.personnelStatus==="RETIRED" ? <div className="wide warnline">Emekli personel aktif çalışan olarak devam edebilir. Emekli statüsü SGK durumundan bağımsızdır.</div> : null}
          </div></div>
          <div className="modal-section"><h3>Ücret ve Ödeme Planı</h3><div className="form"><Field label="Gerçek Maaş"><input type="number" value={modalDraft.salary||""} onChange={(event)=>setModalDraft((old)=>({...old,salary:event.target.value}))}/></Field><Field label="Referans Personel"><select value={modalDraft.baseEmployeeId||""} onChange={(event)=>setModalDraft((old)=>({...old,baseEmployeeId:event.target.value}))}><option value="">Referans yok</option>{rawEmployees.filter((item)=>item.id!==modalDraft.id).map((item)=><option key={item.id} value={item.id}>{item.fullName} - {money(item.salary)}{upper(item.status).includes("PAS") ? " · Pasif referans" : ""}</option>)}</select></Field><Field label="Referans Maaş"><input value={modalDraft.baseEmployeeId?money(rawEmployees.find((item)=>item.id===modalDraft.baseEmployeeId)?.salary):"-"} readOnly/></Field><Field label="EK Ödeme"><input type="number" min="0" value={modalDraft.extraPaymentAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,extraPaymentAmount:event.target.value}))}/></Field><Field label="Yol Yardımı"><input type="number" value={modalDraft.roadAllowance||""} onChange={(event)=>setModalDraft((old)=>({...old,roadAllowance:event.target.value}))}/></Field><Field label="Mesai Saat Böleni"><input type="number" min="1" step="1" value={modalDraft.overtimeHourlyBase||225} onChange={(event)=>setModalDraft((old)=>({...old,overtimeHourlyBase:event.target.value}))}/></Field><Field label="Kesinti Saat Böleni"><input type="number" min="1" step="1" value={modalDraft.deductionHourlyBase||300} onChange={(event)=>setModalDraft((old)=>({...old,deductionHourlyBase:event.target.value}))}/></Field><Field label="Ödeme Tipi"><select value={modalDraft.paymentType||"BANKA_ELDEN"} onChange={(event)=>setModalDraft((old)=>({...old,paymentType:event.target.value}))}><option value="BANKA_ELDEN">Banka + Elden</option><option value="Banka">Sadece Banka</option><option value="Elden">Sadece Elden</option></select></Field><Field label="Banka Planı"><input type="number" value={modalDraft.bankAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,bankAmount:event.target.value}))}/></Field><Field label="Elden Planı"><input type="number" value={modalDraft.cashAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,cashAmount:event.target.value}))}/></Field><Field label="Resmi Bordro Net"><input value={money(selected?.sgkNet)} readOnly/></Field><Field label="Geçerlilik Tarihi"><input type="date" value={modalDraft.effectiveDate||""} onChange={(event)=>setModalDraft((old)=>({...old,effectiveDate:event.target.value}))}/></Field><Field label="Değişiklik Açıklaması" wide><input value={modalDraft.changeNote||""} onChange={(event)=>setModalDraft((old)=>({...old,changeNote:event.target.value}))} placeholder="Örn. Ekim 2026 maaş/yol revizyonu"/></Field><Field label="Not" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))}/></Field></div></div>
          {modalDraft.id && canAdminMaintainPersonnel ? <div className="admin-personnel-box">
            <div className="admin-personnel-head"><div><b>Yönetici İşlemleri</b><span>Yanlış veya mükerrer kayıtları doğrudan düzeltin. Yazılı onay kodu yok; butona basınca tek onay sorulur ve işlem loglanır.</span></div><span className="badge red">Yönetici</span></div>
            <div className="admin-personnel-grid">
              <Field label="Mevcut HKN"><input value={modalDraft.code||""} readOnly /></Field>
              <Field label="Yeni HKN Kodu"><input value={modalDraft.adminNewCode||""} onChange={(event)=>setModalDraft((old)=>({...old,adminNewCode:event.target.value.toLocaleUpperCase("tr-TR"),adminActionMessage:""}))} placeholder="HKN-23" /></Field>
              <Field label="Doğru Personelle Birleştir"><select value={modalDraft.adminMergeTargetId||""} onChange={(event)=>setModalDraft((old)=>({...old,adminMergeTargetId:event.target.value,adminActionMessage:""}))}><option value="">Birleştirme yapma</option>{masterEmployees.filter((item)=>item.id!==modalDraft.id).map((item)=><option key={item.id} value={item.id}>{item.code || "HKN yok"} · {item.fullName}{employeeExitDate(item) ? " · Pasif" : " · Aktif"}</option>)}</select></Field>
              <Field label="Açıklama"><input value={modalDraft.adminReason||""} onChange={(event)=>setModalDraft((old)=>({...old,adminReason:event.target.value,adminActionMessage:""}))} placeholder="İsteğe bağlı yönetici notu" /></Field>
            </div>
            {modalDraft.adminActionMessage ? <div className="warnline warn">{modalDraft.adminActionMessage}</div> : null}
            <div className="admin-personnel-actions">
              <button type="button" className="btn" disabled={busy || !modalDraft.adminNewCode || upper(modalDraft.adminNewCode)===upper(modalDraft.code)} onClick={adminRecodePerson}>HKN Değiştir</button>
              <button type="button" className="btn orange" disabled={busy || !modalDraft.adminMergeTargetId} onClick={adminMergePerson}>Birleştir</button>
              <button type="button" className="btn red" disabled={busy} onClick={adminHardDeletePerson}>Sil</button>
              <span className="badge orange">Geçmiş işlem varsa Sil engellenir ve Birleştir kullanılır. Silinen/eski HKN kodu emekliye ayrılır; yeni personele tekrar otomatik verilmez.</span>
            </div>
          </div> : null}
          {modalDraft.formMessage ? <div className="person-save-message" role="alert">{modalDraft.formMessage}</div> : null}
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={savePerson}>{busy?"Kaydediliyor":"Tüm Değişiklikleri Kaydet"}</button>} />
      </Modal>
      );
    }

    if (modal === "ucret") {
      const finalMode = modalDraft.controlMode === "FINAL";
      const editableMode = modalDraft.controlMode !== "ENTRY";
      const periodPeople = employees.length ? employees : masterEmployees;
      const currentIndex = periodPeople.findIndex((item) => item.id === modalDraft.id);
      const previousPerson = currentIndex > 0 ? periodPeople[currentIndex - 1] : null;
      const nextPerson = currentIndex >= 0 && currentIndex < periodPeople.length - 1 ? periodPeople[currentIndex + 1] : null;
      const personMovements = movements
        .filter((item) => item.employeeId === modalDraft.id && String(item.date || item.adjustmentDate || "").startsWith(period))
        .sort((a, b) => String(b.date || b.adjustmentDate || "").localeCompare(String(a.date || a.adjustmentDate || "")));
      const personMonthLogs = logs.filter((log) => log.employeeId === modalDraft.id && String(log.period || period) === period).sort((a,b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));
      const effectiveMovements = personMovements.filter((item) => !upper(item.payrollEffect).includes("SADECE"));
      const movementTotals = effectiveMovements.reduce((acc, item) => {
        const type = normalizeFinanceType(item.type || item.adjustmentType);
        if (type === "Mesai") acc.overtime += num(item.amount);
        else if (type === "Avans" || type === "Toplu avans") acc.advance += num(item.amount);
        else if (["Icra", "Haciz"].includes(type)) acc.garnishment += num(item.amount);
        else if (["Ozel kesinti", "Eksik gün", "Eksik saat"].includes(type)) acc.deduction += num(item.amount);
        return acc;
      }, { overtime: 0, advance: 0, deduction: 0, garnishment: 0 });
      const movementBankDeductions = effectiveMovements
        .filter((item) => {
          const type = normalizeFinanceType(item.type || item.adjustmentType);
          return ["Avans", "Toplu avans", "Ozel kesinti", "Eksik gün", "Eksik saat", "Icra", "Haciz"].includes(type);
        })
        .filter((item) => upper(item.paymentMethod).includes("BANKA"))
        .reduce((sum, item) => sum + num(item.amount), 0);

      const planExtra = num(modalDraft.extraPaymentAmount);
      const preBaseTotals = calcRow({
        salary: modalDraft.salary,
        road: modalDraft.roadAllowance,
        extra: planExtra,
        overtime: movementTotals.overtime,
        advance: movementTotals.advance,
        deduction: movementTotals.deduction,
        garnishment: movementTotals.garnishment,
      });
      const modalPayment = paymentSplitByType(modalDraft.paymentType, preBaseTotals.net, modalDraft.bankAmount, movementBankDeductions);
      const preTotals = calcRow({
        salary: modalDraft.salary,
        road: modalDraft.roadAllowance,
        extra: planExtra,
        overtime: movementTotals.overtime,
        advance: movementTotals.advance,
        deduction: movementTotals.deduction,
        garnishment: movementTotals.garnishment,
        bank: modalPayment.bank,
        cash: modalPayment.cash,
      });

      const finalEditor = modalDraft.finalEditor || {};
      const finalTotals = calcRow({
        salary: finalEditor.salary,
        road: finalEditor.road,
        extra: finalEditor.extra,
        overtime: finalEditor.overtime,
        advance: finalEditor.advance,
        deduction: finalEditor.deduction,
        garnishment: finalEditor.garnishment,
        bank: finalEditor.bank,
        cash: finalEditor.cash,
      });
      const setFinalValue = (key, value) => setModalDraft((old) => ({
        ...old,
        finalEditor: { ...(old.finalEditor || {}), [key]: value },
        formMessage: "",
      }));
      const autoBalanceFinalPayment = () => {
        const netOnly = calcRow({
          salary: finalEditor.salary,
          road: finalEditor.road,
          extra: finalEditor.extra,
          overtime: finalEditor.overtime,
          advance: finalEditor.advance,
          deduction: finalEditor.deduction,
          garnishment: finalEditor.garnishment,
        }).net;
        const split = paymentSplitByType(finalEditor.paymentType || modalDraft.paymentType, netOnly, finalEditor.bank);
        setModalDraft((old) => ({
          ...old,
          finalEditor: { ...(old.finalEditor || {}), bank: split.bank, cash: split.cash },
          formMessage: "",
        }));
      };

      const editor = modalDraft.movementEditor || {};
      const previewMovementAmount = editor.adjustmentType === "Mesai"
        ? overtimeAmountFor(modalDraft.id, editor.hourOrDay, editor.overtimeMultiplier)
        : num(editor.amount);
      const modalTitle = finalMode ? "Son Bordro Kontrolü" : "Bordro Öncesi Giriş Kontrolü";
      const modalSub = editableMode
        ? `${MONTHS[month - 1]} ${year} · Ay kilidi açık; finans alanları düzenlenebilir ve gerçek kaynaklara kaydedilir`
        : `${MONTHS[month - 1]} ${year} · Salt okunur kontrol görünümü`;

      return (
        <Modal title={modalTitle} sub={modalSub} size="wide prepayroll-dialog" onClose={() => setModal(null)}>
          <div className={`payroll-final-layout ${editableMode ? "final-control-mode" : "entry-control-mode"}`}>
            <aside className="payroll-person-rail">
              <div className="payroll-person-rail-head">
                <div><b>Personeller</b><span>{currentIndex >= 0 ? currentIndex + 1 : 0} / {periodPeople.length}</span></div>
                <small>{finalMode ? "Son kontrol için kişiyi seçin; kaydet sonrası pencere açık kalır." : "Aylık giriş kontrolü için personeli seçin."}</small>
              </div>
              <div className="payroll-person-rail-list">
                {periodPeople.map((employee, index) => <button type="button" key={employee.id} data-employee-id={employee.id} className={employee.id === modalDraft.id ? "active" : ""} disabled={busy} onClick={() => switchPayPlanPerson(employee.id)}>
                  <span><b>{index + 1}. {employee.fullName}</b><small>{employee.code || "HKN yok"}</small></span>
                  <em className="ready">{employmentPeriodLabel(employee, period)}</em>
                </button>)}
              </div>
            </aside>

            <div className="payroll-final-main">
              <div className="person-modal-nav">
                <button type="button" className="btn" disabled={busy || !previousPerson} onClick={() => previousPerson && switchPayPlanPerson(previousPerson.id)}>← Önceki</button>
                <label><span>Personel Seç</span><select value={modalDraft.id || ""} disabled={busy} onChange={(event) => switchPayPlanPerson(event.target.value)}>{periodPeople.map((employee) => <option key={employee.id} value={employee.id}>{employee.code || "HKN yok"} · {employee.fullName}</option>)}</select></label>
                <span className="person-modal-position">{currentIndex >= 0 ? currentIndex + 1 : 0} / {periodPeople.length}</span>
                <button type="button" className="btn" disabled={busy || !nextPerson} onClick={() => nextPerson && switchPayPlanPerson(nextPerson.id)}>Sonraki →</button>
                <small>{editableMode ? "Ay kilidi açıkken maaş, yol, EK, banka/elden ve hareketler düzenlenebilir." : "Salt okunur kontrol görünümü."}</small>
              </div>

              {editableMode ? (
                <div className="modal-section-grid payroll-control-grid final-manual-grid">
                  <div className="modal-section final-manual-card">
                    <h3>{finalMode ? "Son Kontrol" : "Bordro Öncesi Giriş Kontrolü"} · Düzenlenebilir</h3>
                    <div className="form">
                      <Field label="Maaş"><input type="number" min="0" value={finalEditor.salary ?? ""} onChange={(event) => setFinalValue("salary", event.target.value)} /></Field>
                      <Field label="Yol"><input type="number" min="0" value={finalEditor.road ?? ""} onChange={(event) => setFinalValue("road", event.target.value)} /></Field>
                      <Field label="EK Ödeme"><input type="number" min="0" value={finalEditor.extra ?? ""} onChange={(event) => setFinalValue("extra", event.target.value)} /></Field>
                      <Field label="Mesai Toplamı"><input type="number" min="0" value={finalEditor.overtime ?? ""} onChange={(event) => setFinalValue("overtime", event.target.value)} /></Field>
                      <Field label="Avans Toplamı"><input type="number" min="0" value={finalEditor.advance ?? ""} onChange={(event) => setFinalValue("advance", event.target.value)} /></Field>
                      <Field label="Kesinti Toplamı"><input type="number" min="0" value={finalEditor.deduction ?? ""} onChange={(event) => setFinalValue("deduction", event.target.value)} /></Field>
                      <Field label="İcra / Haciz"><input type="number" min="0" value={finalEditor.garnishment ?? ""} onChange={(event) => setFinalValue("garnishment", event.target.value)} /></Field>
                      <Field label="Hukuki Kesinti Türü"><select value={finalEditor.legalType || "ICRA"} onChange={(event) => setFinalValue("legalType", event.target.value)}><option value="ICRA">İcra</option><option value="HACIZ">Haciz</option></select></Field>
                      <Field label="Avans Kaynağı"><select value={finalEditor.advanceSource || "Elden"} onChange={(event) => setFinalValue("advanceSource", event.target.value)}><option>Elden</option><option>Banka</option></select></Field>
                      <Field label="Kesinti Kaynağı"><select value={finalEditor.deductionSource || "Elden"} onChange={(event) => setFinalValue("deductionSource", event.target.value)}><option>Elden</option><option>Banka</option></select></Field>
                      <Field label="İcra/Haciz Kaynağı"><select value={finalEditor.garnishmentSource || "Banka"} onChange={(event) => setFinalValue("garnishmentSource", event.target.value)}><option>Banka</option><option>Elden</option></select></Field>
                      <Field label="Ödeme Tipi"><select value={finalEditor.paymentType || "BANKA_ELDEN"} onChange={(event) => setFinalValue("paymentType", event.target.value)}><option value="BANKA_ELDEN">Banka + Elden</option><option value="Banka">Sadece Banka</option><option value="Elden">Sadece Elden</option></select></Field>
                      <Field label="Bankadan Ödenecek"><input type="number" min="0" value={finalEditor.bank ?? ""} onChange={(event) => setFinalValue("bank", event.target.value)} /></Field>
                      <Field label="Elden Ödenecek"><input type="number" min="0" value={finalEditor.cash ?? ""} onChange={(event) => setFinalValue("cash", event.target.value)} /></Field>
                      <Field label="Son Kontrol Açıklaması" wide><input value={finalEditor.reason || ""} onChange={(event) => setFinalValue("reason", event.target.value)} placeholder="Örn. Eylül son bordro kontrolü" /></Field>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn" disabled={busy} onClick={autoBalanceFinalPayment}>Banka / Elden Otomatik Dengele</button>
                      <button type="button" className="btn primary" disabled={busy} onClick={saveFinalPayrollControl}>{busy ? "Kaydediliyor" : finalMode ? "Son Kontrolü Kaydet" : "Değişiklikleri Kaydet"}</button>
                    </div>
                  </div>

                  <div className="modal-section payroll-smart-check final-result-card">
                    <h3>Son Bordro Sonucu</h3>
                    <div className="import-summary payment-summary">
                      <div><span>Maaş</span><b>{money(finalEditor.salary)}</b></div>
                      <div><span>Yol</span><b>{money(finalEditor.road)}</b></div>
                      <div className={num(finalEditor.extra) > 0 ? "summary-highlight" : ""}><span>EK</span><b>{money(finalEditor.extra)}</b></div>
                      <div><span>Mesai</span><b>{money(finalEditor.overtime)}</b></div>
                      <div><span>Hak Ediş</span><b>{money(finalTotals.hakedis)}</b></div>
                      <div><span>Toplam Kesinti</span><b>{money(num(finalEditor.advance) + num(finalEditor.deduction) + num(finalEditor.garnishment))}</b></div>
                      <div><span>Net Ödenecek</span><b>{money(finalTotals.net)}</b></div>
                      <div><span>Banka</span><b>{money(finalEditor.bank)}</b></div>
                      <div><span>Elden</span><b>{money(finalEditor.cash)}</b></div>
                      <div><span>Fark</span><b>{money(Math.abs(finalTotals.diff))}</b></div>
                    </div>
                    <div className={`warnline ${Math.abs(finalTotals.diff) <= 0.01 ? "ok" : "warn"}`}>
                      {Math.abs(finalTotals.diff) <= 0.01
                        ? "Banka + Elden = Net Ödenecek. Son kontrol kayda hazır."
                        : `Banka + Elden ile Net arasında ${money(Math.abs(finalTotals.diff))} fark var. Kaydetmeden önce düzeltin veya Otomatik Dengele kullanın.`}
                    </div>
                    <div className="warnline">Bu ekrandaki Maaş/Yol/EK değişikliği ücret kaynağına; Mesai/Avans/Kesinti/İcra değişikliği hareket kaynağına yazılır.</div>
                  </div>
                </div>
              ) : (
                <div className="modal-section-grid payroll-control-grid entry-readonly-grid">
                  <div className="modal-section entry-plan-card">
                    <h3>Bordro Öncesi Giriş Kontrolü · Ana Plan Salt Okunur</h3>
                    <div className="form">
                      <Field label="Ad Soyad" half><input value={modalDraft.fullName || ""} readOnly /></Field>
                      <Field label="Personel Kodu" half><input value={modalDraft.code || ""} readOnly /></Field>
                      <Field label="SGK Durumu" half><input value={modalDraft.sgkFollow === "SGKLI" ? "SGK'lı" : modalDraft.sgkFollow === "SGKSIZ" ? "SGK'sız" : "Belirtilmemiş"} readOnly /></Field>
                      <Field label="SGK Gün" half><input value={modalDraft.sgkDays ?? ""} readOnly /></Field>
                      <Field label="Maaş" half><input value={money(modalDraft.salary)} readOnly /></Field>
                      <Field label="Yol" half><input value={money(modalDraft.roadAllowance)} readOnly /></Field>
                      <Field label="EK Ödeme" half><input value={money(planExtra)} readOnly /></Field>
                      <Field label="Ödeme Tipi" half><input value={paymentLabel({ paymentType: modalDraft.paymentType, bankAmount: modalPayment.bank, cashAmount: modalPayment.cash })} readOnly /></Field>
                      <Field label="Banka" half><input value={money(modalPayment.bank)} readOnly /></Field>
                      <Field label="Elden" half><input value={money(modalPayment.cash)} readOnly /></Field>
                    </div>
                    <div className="warnline">Maaş / Yol / EK / Banka / Elden bu giriş kontrol ekranında değiştirilmez. Ana plan değişikliği Personel Kartı / Ücret Planı üzerinden yapılır.</div>
                  </div>

                  <div className="modal-section payroll-smart-check">
                    <h3>Aylık Giriş Kontrolü</h3>
                    <div className="import-summary payment-summary">
                      <div><span>Mesai</span><b>{money(movementTotals.overtime)}</b></div>
                      <div><span>Avans</span><b>{money(movementTotals.advance)}</b></div>
                      <div><span>Kesinti</span><b>{money(movementTotals.deduction)}</b></div>
                      <div><span>İcra/Haciz</span><b>{money(movementTotals.garnishment)}</b></div>
                      <div><span>Tahmini Hak Ediş</span><b>{money(preTotals.hakedis)}</b></div>
                      <div><span>Tahmini Net</span><b>{money(preTotals.net)}</b></div>
                      <div><span>Banka</span><b>{money(modalPayment.bank)}</b></div>
                      <div><span>Elden</span><b>{money(modalPayment.cash)}</b></div>
                    </div>
                    <div className="warnline ok">Bu ekran aylık Mesai / Avans / Kesinti / İcra-Haciz giriş ve kontrol ekranıdır.</div>
                  </div>
                </div>
              )}

              <div className="modal-section source-movement-section">
                <div className="ch"><div><b>Kişinin O Ayki Hareketleri</b><span>Buradaki kayıtlar Mesai / Avans / Kesinti ekranına doğrudan yazılır ve bordro aynı kaynaktan beslenir.</span></div></div>
                <details className="prepayroll-quick-entry"><summary>Yeni hareket ekle / hızlı düzenleme</summary><div className="ik-section-tabs">
                  {["Mesai","Avans","Ozel kesinti","Icra","Haciz"].map((type) => <button type="button" key={type} className={editor.adjustmentType === type ? "active" : ""} onClick={() => editPrePayrollMovement(null, type)}>{type === "Ozel kesinti" ? "Kesinti" : type}</button>)}
                </div>
                <div className="form prepayroll-movement-editor">
                  <Field label="Tarih"><input type="date" value={editor.date || ""} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, date: event.target.value }, formMessage: "" }))} /></Field>
                  {editor.adjustmentType === "Mesai" ? <>
                    <Field label="Mesai Saati"><input type="number" min="0" step=".5" value={editor.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, hourOrDay: event.target.value }, formMessage: "" }))} /></Field>
                    <Field label="Mesai Türü"><select value={editor.overtimeMultiplier || 1.5} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, overtimeMultiplier: Number(event.target.value) }, formMessage: "" }))}><option value="1.5">%50 / x1,5</option><option value="2">%100 / x2</option></select></Field>
                    <Field label="Hesaplanan Tutar"><input value={money(previewMovementAmount)} readOnly /></Field>
                  </> : <>
                    <Field label="Tutar"><input type="number" min="0" value={editor.amount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, amount: event.target.value }, formMessage: "" }))} /></Field>
                    <Field label="Ödeme / Kesinti Kaynağı"><select value={editor.paymentMethod || "Elden"} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, paymentMethod: event.target.value } }))}><option>Elden</option><option>Banka</option></select></Field>
                  </>}
                  <Field label="Açıklama" wide><input value={editor.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, movementEditor: { ...old.movementEditor, note: event.target.value } }))} placeholder="İsteğe bağlı açıklama" /></Field>
                </div>
                <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={savePrePayrollMovement}>{editor.id ? "Hareketi Güncelle" : "Hareketi Kaydet"}</button>{editor.id ? <button type="button" className="btn" disabled={busy} onClick={() => editPrePayrollMovement(null, editor.adjustmentType)}>Yeni Kayıt</button> : null}</div></details>

                <div className="tw prepayroll-source-table"><table><thead><tr><th>Tarih</th><th>Tip</th><th>Saat/Gün</th><th>Tutar</th><th>Kaynak</th><th>Açıklama</th><th>İşlem</th></tr></thead><tbody>
                  {personMovements.map((item) => <tr key={item.id || `${item.employeeId}-${item.date}-${item.type}`}><td>{item.date || item.adjustmentDate || "-"}</td><td>{item.type || item.adjustmentType}</td><td>{item.hourOrDay || item.quantity || "-"}</td><td className="money">{money(item.amount)}</td><td>{item.paymentMethod || "-"}</td><td>{item.note || item.description || "-"}</td><td><button type="button" className="btn" disabled={busy} onClick={() => editPrePayrollMovement(item)}>Düzenle</button> <button type="button" className="btn red" disabled={busy} onClick={() => deletePrePayrollMovement(item)}>Sil</button></td></tr>)}
                  <EmptyRow show={!personMovements.length} colSpan={7} text="Bu personel için seçili ayda mesai / avans / kesinti kaydı yok." />
                </tbody></table></div>
              </div>

              <details className="modal-section payroll-person-summary"><summary><b>Özet · Ücret / Bordro / Personel Logu</b></summary><div className="import-summary payment-summary"><div><span>Maaş</span><b>{money(finalEditor.salary)}</b></div><div><span>Yol</span><b>{money(finalEditor.road)}</b></div><div><span>EK</span><b>{money(finalEditor.extra)}</b></div><div><span>Mesai</span><b>{money(movementTotals.overtime)}</b></div><div><span>Avans</span><b>{money(movementTotals.advance)}</b></div><div><span>Kesinti</span><b>{money(movementTotals.deduction)}</b></div><div><span>İcra/Haciz</span><b>{money(movementTotals.garnishment)}</b></div><div><span>Net</span><b>{money(finalTotals.net)}</b></div><div><span>Banka</span><b>{money(finalEditor.bank)}</b></div><div><span>Elden</span><b>{money(finalEditor.cash)}</b></div></div><div className="tw"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th></tr></thead><tbody>{personMonthLogs.map((log,i)=><tr key={log.id || i}><td>{log.createdAt || log.date || "-"}</td><td>{log.actionType || log.action || "-"}</td><td>{log.reason || log.description || log.summary || "-"}</td></tr>)}<EmptyRow show={!personMonthLogs.length} colSpan={3} text="Bu döneme ait personel logu bulunamadı."/></tbody></table></div></details>
              {modalDraft.formMessage ? <div className="person-save-message" role="alert">{modalDraft.formMessage}</div> : null}
            </div>
          </div>
        </Modal>
      );
    }

    if (["mesai", "avans", "kesinti"].includes(modal)) {
      const type = modal === "avans" ? "Avans" : modal === "kesinti" ? (modalDraft.adjustmentType || "Ozel kesinti") : "Mesai";
      return <Modal title={modal === "avans" ? "Avans Girisi" : modal === "kesinti" ? "Kesinti Girisi" : "Mesai Girisi"} sub="Hizli hareket kaydi" onClose={() => setModal(null)}>{financeForm(type)}<ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={saveFinance}>{busy ? "Kaydediliyor" : "Kaydet"}</button>} /></Modal>;
    }

    if (modal === "topluAvans") return (
      <Modal title="Toplu Avans Sihirbazi" sub="1) Personel sec  2) Tutar gir  3) Onizle ve kaydet" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid">
          <div className="steps"><div className="step active"><div className="num">1</div><div><b>Personel Sec</b><span>Grup veya tek tek secim</span></div></div><div className="step"><div className="num">2</div><div><b>Tutar ve Tarih</b><span>Kisi basi avans</span></div></div><div className="step"><div className="num">3</div><div><b>Onay</b><span>Toplam kontrol</span></div></div><div className="mini-summary"><div className="mini"><span>Secili</span><b>{safeList(modalDraft.employeeIds).length}</b></div><div className="mini"><span>Kisi basi</span><b>{money(modalDraft.amount)}</b></div><div className="mini"><span>Toplam</span><b>{money(safeList(modalDraft.employeeIds).length * num(modalDraft.amount))}</b></div></div></div>
          <div><label>Grup secimi</label><select onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: groupEmployeeIds(event.target.value) }))}><option value="selected">Secili personel</option><option value="all">Tum personel</option><option value="sgk">SGK'lilar</option><option value="nonsgk">SGK'sizlar</option><option value="cash">Elden alanlar</option><option value="bank">Banka alanlar</option></select><br /><br /><div className="selectlist">{filteredEmployees.map((employee) => <label className="selrow" key={employee.id}><input type="checkbox" checked={safeList(modalDraft.employeeIds).includes(employee.id)} onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: event.target.checked ? [...new Set([...safeList(old.employeeIds), employee.id])] : safeList(old.employeeIds).filter((id) => id !== employee.id) }))} /><b>{employee.fullName}<span className="code">{employee.code || "-"}</span></b><span>{sgkLabel(employee)}</span><span>{paymentLabel(employee)}</span></label>)}</div><br />{financeForm("Toplu avans", true)}<div className="warnline warn">Kaydetmeden once ayni gun / ayni tutar tekrar avans kontrolu yapilir.</div></div>
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={saveFinance}>{busy ? "Kaydediliyor" : "Onayla ve Kaydet"}</button>} />
      </Modal>
    );

    if (modal === "topluUcret") {
      const bulkIds = safeList(modalDraft.employeeIds);
      const bulkPeople = filteredEmployees.filter((employee) => bulkIds.includes(employee.id));
      const action = modalDraft.action || "SALARY_PERCENT";
      const previewValue = (employee) => {
        if (action === "SALARY_PERCENT") return round(num(employee.salary) * (1 + num(modalDraft.percent) / 100));
        if (action === "ROAD_PERCENT") return round(num(employee.roadAllowance) * (1 + num(modalDraft.percent) / 100));
        return round(num(modalDraft.value));
      };
      return (
        <Modal title="Toplu Ücret / Yol Düzenleme" sub="Seçili personele tek işlemle tarihçeli maaş veya yol değişikliği uygula" size="wide" onClose={() => setModal(null)}>
          <div className="drawer-grid">
            <div>
              <div className="modal-section"><h3>1. Personel Seçimi</h3>
                <div className="group">
                  <button type="button" className="btn" onClick={() => setModalDraft((old) => ({ ...old, employeeIds: filteredEmployees.map((item) => item.id) }))}>Görünenlerin Tümü</button>
                  <button type="button" className="btn" onClick={() => setModalDraft((old) => ({ ...old, employeeIds: groupEmployeeIds("sgk") }))}>SGK'lılar</button>
                  <button type="button" className="btn" onClick={() => setModalDraft((old) => ({ ...old, employeeIds: groupEmployeeIds("nonsgk") }))}>SGK'sızlar</button>
                  <button type="button" className="btn" onClick={() => setModalDraft((old) => ({ ...old, employeeIds: [] }))}>Seçimi Temizle</button>
                </div>
                <div className="selectlist bulk-comp-list">{filteredEmployees.map((employee) => <label className="selrow" key={employee.id}><input type="checkbox" checked={bulkIds.includes(employee.id)} onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: event.target.checked ? [...new Set([...safeList(old.employeeIds), employee.id])] : safeList(old.employeeIds).filter((id) => id !== employee.id) }))}/><b>{employee.fullName}<span className="code">{employee.code || "-"}</span></b><span>{money(employee.salary)}</span><span>Yol {money(employee.roadAllowance)}</span></label>)}</div>
              </div>
            </div>
            <div>
              <div className="modal-section"><h3>2. Değişiklik</h3><div className="form">
                <Field label="İşlem" wide><select value={action} onChange={(event) => setModalDraft((old) => ({ ...old, action: event.target.value }))}><option value="SALARY_PERCENT">Maaşı yüzde değiştir</option><option value="ROAD_SET">Yolu sabit tutara getir</option><option value="ROAD_PERCENT">Yolu yüzde değiştir</option></select></Field>
                {action === "ROAD_SET" ? <Field label="Yeni Yol Tutarı" half><input type="number" min="0" step="0.01" value={modalDraft.value ?? ""} onChange={(event) => setModalDraft((old) => ({ ...old, value: event.target.value }))}/></Field> : <Field label="Değişim Yüzdesi" half><input type="number" min="-99" max="500" step="0.1" value={modalDraft.percent ?? ""} onChange={(event) => setModalDraft((old) => ({ ...old, percent: event.target.value }))}/></Field>}
                <Field label="Geçerlilik Tarihi" half><input type="date" value={modalDraft.effectiveDate || ""} onChange={(event) => setModalDraft((old) => ({ ...old, effectiveDate: event.target.value }))}/></Field>
                <Field label="Açıklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Örn. Ekim 2026 genel maaş artışı %20"/></Field>
              </div></div>
              <div className="modal-section"><h3>3. Önizleme</h3>
                <div className="import-summary"><div><span>Seçili</span><b>{bulkPeople.length}</b></div><div><span>İşlem</span><b>{action === "SALARY_PERCENT" ? "%" + num(modalDraft.percent) + " maaş" : action === "ROAD_SET" ? money(modalDraft.value) + " yol" : "%" + num(modalDraft.percent) + " yol"}</b></div><div><span>Geçerlilik</span><b>{modalDraft.effectiveDate || "-"}</b></div></div>
                <div className="tw bulk-comp-preview"><table><thead><tr><th>Personel</th><th>Önce</th><th>Sonra</th><th>Fark</th></tr></thead><tbody>{bulkPeople.slice(0, 30).map((employee) => { const before = action === "SALARY_PERCENT" ? num(employee.salary) : num(employee.roadAllowance); const after = previewValue(employee); return <tr key={employee.id}><td>{employee.fullName}<span className="code">{employee.code || "-"}</span></td><td className="money">{money(before)}</td><td className="money">{money(after)}</td><td className="money">{money(after-before)}</td></tr>; })}<EmptyRow show={!bulkPeople.length} colSpan={4} text="Personel seçilmedi."/></tbody></table></div>
                <div className="warnline ok">Değişiklik geçerlilik tarihiyle saklanır. Eski ay bordroları eski maaş/yol değerini kullanmaya devam eder. Banka/elden nihai dağılımı bordroda Net tutara göre dengelenir.</div>
              </div>
            </div>
          </div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy || !bulkPeople.length} onClick={saveBulkCompensation}>{busy ? "Kaydediliyor" : bulkPeople.length + " Personeli Güncelle"}</button>}/>
        </Modal>
      );
    }

    if (modal === "yillik") {
      const modalEmployee = employees.find((item) => item.id === modalDraft.employeeId);
      const balance = modalEmployee ? employeeLeave(modalEmployee) : { right: 0, annual: 0, balance: 0 };
      const setLeaveValue = (key, value) => { setModalDraft((old) => ({ ...old, [key]: value })); if (key === "startDate" && value) setLeaveCalendarMonth(value.slice(0, 7)); setLeavePreview(null); };
      return <Modal title="Yillik Izin Planlama ve Resmi Kayit" sub="Personeli secin, takvimden tarih araligini tiklayin ve kontrol ederek kaydedin" size="leave-dialog" onClose={() => setModal(null)}>
        <div className="leave-modal-layout">
          <div className="leave-modal-main"><div className="modal-section"><h3>1. Personel ve Izin Turu</h3><div className="form"><Field label="Personel" half><select value={modalDraft.employeeId || ""} onChange={(event) => setLeaveValue("employeeId", event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} - {employee.department || "Bolum yok"}</option>)}</select></Field><Field label="Izin turu" half><select value={modalDraft.leaveType || "Yillik izin"} onChange={(event) => setLeaveValue("leaveType", event.target.value)}>{LEAVE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Kayit durumu"><select value={modalDraft.status || "PLANNED"} onChange={(event) => setLeaveValue("status", event.target.value)}><option value="PLANNED">Planlandi - puantaja yansitma</option><option value="APPROVED">Onaylandi - resmi kayit ve puantaj</option><option value="TAKEN">Kullanildi - geriye donuk kesin kayit</option></select></Field><Field label="Ucret etkisi"><select value={modalDraft.wageEffect || "Ucretli"} onChange={(event) => setModalDraft((old) => ({ ...old, wageEffect: event.target.value }))}><option>Ucretli</option><option>Ucretsiz / kesinti</option><option>Sadece kayit</option></select></Field></div></div>
          <div className="modal-section"><h3>2. Tarih Araligi ve Donus</h3><div className="form"><Field label="Izne cikis tarihi" half><input type="date" value={modalDraft.startDate || ""} onChange={(event) => setLeaveValue("startDate", event.target.value)} /></Field><Field label="Ise donus tarihi" half><input type="date" min={modalDraft.startDate || undefined} value={modalDraft.endDate || ""} onChange={(event) => setLeaveValue("endDate", event.target.value)} /></Field><Field label="Belge / form no" wide><input value={modalDraft.documentNo || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentNo: event.target.value }))} placeholder="Orn. YI-2026-001" /></Field><Field label="Aciklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Izin talebi, yonetici onayi veya geriye donuk kayit aciklamasi" /></Field></div></div>
          <div className="warnline ok leave-auto-note">Personel veya tarih degistiginde izin gunu, bakiye ve cakisma kontrolu otomatik yenilenir.</div></div>
          <aside className="leave-preview-panel"><h3>Kontrol Ozeti</h3><div className="leave-balance-strip"><div><span>Hak</span><b>{balance.right}</b></div><div><span>Kullanilan</span><b>{balance.annual}</b></div><div><span>Kalan</span><b>{balance.balance}</b></div></div>{leavePreview ? <><div className="preview-numbers"><div><span>Takvim gunu</span><b>{leavePreview.calendarDays}</b></div><div className="highlight"><span>Izinden sayilan</span><b>{leavePreview.countedDays}</b></div><div><span>Sayilmayan</span><b>{safeList(leavePreview.excludedDates).length}</b></div><div><span>Son izin gunu</span><b>{leavePreview.lastLeaveDate || leavePreview.endDate}</b></div><div className="return"><span>Ise donus</span><b>{leavePreview.returnDate}</b></div><div><span>Yeni bakiye</span><b className={leavePreview.balanceAfter < 0 ? "danger-text" : "success-text"}>{leavePreview.balanceAfter}</b></div></div><div className={`warnline ${leavePreview.hasCriticalConflict ? "danger" : leavePreview.hasDepartmentWarning ? "warn" : "ok"}`}>{leavePreview.hasCriticalConflict ? "Ayni personelde cakisma var; kayit engellendi." : leavePreview.hasDepartmentWarning ? "Ayni bolumde izin cakismasi var; yetkili onayi gerekir." : "Tarih araligi uygun. Kritik cakisma yok."}</div><div className="excluded-list"><b>Sayilmayan gunler</b>{safeList(leavePreview.excludedDates).map((item) => <span key={item.date}>{item.date}<em>{item.reason}</em></span>)}{!safeList(leavePreview.excludedDates).length && <small>Sayilmayan gun yok.</small>}</div><div className="leave-day-proof"><b>Gün Gün İzin Dökümü</b><div className="leave-day-proof-table"><div className="head"><span>Tarih</span><span>Gün</span><span>Hesap</span><span>Açıklama</span></div>{safeList(leavePreview.dayDetails).map((day) => <div key={day.date} className={day.status === "EXCLUDED" ? "excluded" : day.status === "PARTIAL" ? "partial" : "counted"}><span>{day.date}</span><span>{day.weekdayName || "-"}</span><strong>{num(day.counted) === 0 ? "Sayılmaz" : num(day.counted) === .5 ? "0,5 gün" : "1 gün"}</strong><span>{day.reason || "-"}</span></div>)}</div></div><div className="conflict-list">{safeList(leavePreview.conflicts).map((item) => <div key={item.id} className={item.severity === "CRITICAL" ? "critical" : item.severity === "WARNING" ? "warning" : "info"}><b>{item.fullName}</b><span>{item.startDate} - {item.endDate}</span><small>{item.message}</small></div>)}</div></> : <div className="preview-placeholder"><b>Henuz hesaplanmadi</b><p>Pazar, resmi tatil, sirket sayim gunleri, bakiye ve personel cakismalari tek seferde kontrol edilir.</p></div>}</aside>
        </div>
        <LeaveRangeCalendar />
        <ModalFooter onClose={() => setModal(null)} actions={<><button className="btn" onClick={() => modalEmployee && openLeaveForm(modalEmployee, leavePreview ? { ...modalDraft, countedDays: leavePreview.countedDays, returnDate: leavePreview.returnDate, balanceAfter: leavePreview.balanceAfter } : modalDraft)}>Duzenlenebilir A5 Form</button><button className="btn primary" disabled={busy || leavePreview?.hasCriticalConflict} onClick={saveLeave}>{modalDraft.status === "PLANNED" ? "Plani Kaydet" : "Onayla ve Resmi Kaydet"}</button></>} />
      </Modal>;
    }

    if (modal === "izinDokum") {
      const proofEmployee = masterEmployees.find((item) => item.id === modalDraft.employeeId);
      const proofDays = safeList(modalDraft.dayDetails);
      return (
        <Modal title="Yıllık İzin Gün Dökümü" sub="Personele gösterilebilir ve PDF olarak saklanabilir tarih bazlı izin kanıtı" size="wide" onClose={() => setModal(null)}>
          <div className="leave-proof-head">
            <div><span>Personel</span><b>{proofEmployee?.fullName || modalDraft.fullName || "-"}</b><small>{proofEmployee?.code || modalDraft.code || "-"}</small></div>
            <div><span>İzin Türü</span><b>{modalDraft.recordType || "Yıllık izin"}</b><small>{modalDraft.effectType || "Ücretli"}</small></div>
            <div><span>Tarih Aralığı</span><b>{modalDraft.startDate || "-"} → {modalDraft.endDate || "-"}</b><small>İşe dönüş: {modalDraft.returnDate || "-"}</small></div>
            <div><span>İzinden Düşen</span><b>{modalDraft.countedDays ?? "-"} gün</b><small>{safeList(modalDraft.excludedDates).length} sayılmayan gün</small></div>
          </div>
          {proofDays.length ? <div className="tw leave-proof-table"><table><thead><tr><th>Tarih</th><th>Gün</th><th>Hesap</th><th>Resmi Tatil</th><th>Açıklama</th></tr></thead><tbody>{proofDays.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.weekdayName || "-"}</td><td><span className={`badge ${num(day.counted) === 0 ? "red" : num(day.counted) === .5 ? "orange" : "green"}`}>{num(day.counted) === 0 ? "Sayılmaz" : num(day.counted) === .5 ? "0,5 gün" : "1 gün"}</span></td><td>{day.holidayName || "-"}</td><td>{day.reason || "-"}</td></tr>)}</tbody></table></div> : <div className="warnline warn">Bu kayıt eski sistemden geldiği için gün bazlı hesaplama snapshotı bulunmuyor. Tarih aralığı ve toplam izin günü korunmuştur.</div>}
          <div className="leave-proof-note"><b>Kayıt açıklaması</b><span>{modalDraft.note || "-"}</span></div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => printLeaveProof(modalDraft)}>Gün Dökümünü Yazdır / PDF</button>} />
        </Modal>
      );
    }

    if (modal === "gunluk") return (
      <Modal title="Gunluk Durum" sub="Gelmedi, rapor, erken cikma, gec gelme" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid"><DayGrid /><div className="form">{dailyFields()}</div></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={saveLeave}>{busy ? "Kaydediliyor" : "Kaydet"}</button>} />
      </Modal>
    );

    if (modal === "sgkImport") {
      const rows = safeList(sgkPreview?.rows);
      const selectedRows = rows.filter((row) => row.selected && row.employeeId);
      return (
        <Modal title="Resmi Bordro On Analizi" sub="XLS/XLSX eslestirme - yalnizca secili sirket personeli aktarilir" size="wide" onClose={() => setModal(null)}>
          <div className="import-summary"><div><span>Dosya</span><b>{safeList(sgkPreview?.files).length}</b></div><div><span>Okunan satir</span><b>{rows.length}</b></div><div><span>Aktarilacak</span><b>{selectedRows.length}</b></div><div><span>Haric / eslesmeyen</span><b>{rows.length-selectedRows.length}</b></div><div><span>Banka toplam</span><b>{money(selectedRows.reduce((sum,row)=>sum+num(row.net),0))}</b></div></div>
          <div className="warnline ok">Secilmeyen veya personel kartiyla eslesmeyen satirlar puantaj, bordro ve banka odemesine aktarilmaz.</div>
          <div className="tw import-table"><table><thead><tr><th>Sec</th><th>Dosya / Isyeri</th><th>Bordrodaki Kisi</th><th>TC Kimlik</th><th>Sirket Personeli</th><th>Giris</th><th>Cikis</th><th>Gun</th><th>Toplam Kazanc</th><th>Net Istihkak</th><th>Durum</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.sourceFile}-${row.rowNumber}`}><td><input type="checkbox" checked={Boolean(row.selected&&row.employeeId)} disabled={!row.employeeId} onChange={(event)=>updateSgkPreviewRow(index,{selected:event.target.checked})} /></td><td><span className="person">{row.sourceFile}</span><span className="code">{row.workplaceNo||row.workplace||"-"}</span></td><td>{row.fullName}</td><td>{row.identityNo||"-"}</td><td><select value={row.employeeId||""} onChange={(event)=>updateSgkPreviewRow(index,{employeeId:event.target.value||null,selected:Boolean(event.target.value),status:event.target.value?"MANUEL_ESLESTI":"ESLESMEDI"})}><option value="">Haric / eslesmedi</option>{employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></td><td>{row.hireDate||"-"}</td><td>{row.exitDate||"-"}</td><td>{row.sgkDays}</td><td className="money">{money(row.gross)}</td><td className="money">{money(row.net)}</td><td><span className={`badge ${row.employeeId?"green":"orange"}`}>{row.employeeId?"Eslesmis":"Haric"}</span></td></tr>)}</tbody></table></div>
          <ModalFooter onClose={() => setModal(null)} actions={<><button className="btn" onClick={()=>setSgkPreview((old)=>({...old,rows:safeList(old?.rows).map((row)=>({...row,selected:Boolean(row.employeeId)}))}))}>Eslesenleri Sec</button><button className="btn primary" disabled={busy} onClick={confirmPayrollFiles}>{busy?"Kaydediliyor":"Secili Personeli Aktar"}</button></>} />
        </Modal>
      );
    }

    if (modal === "evrak") return (
      <Modal title="Evrak Yukle" sub="Belge baglantisi" size="small" onClose={() => setModal(null)}>
        <div className="form"><Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field><Field label="Belge Turu" half><input value={modalDraft.documentType || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentType: event.target.value }))} /></Field><Field label="Dosya" wide><input ref={documentInput} type="file" onChange={(event) => uploadDocument(event.target.files?.[0])} /></Field><Field label="Not" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} /></Field></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => documentInput.current?.click()}>Dosya Sec</button>} />
      </Modal>
    );

    if (modal === "izinFis") {
      const employee = selected || employees[0];
      const personPlans = safeList(leaveCenter.plans).filter((item) => item.employeeId === employee?.id && item.status !== "CANCELLED").sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
      const plan = modalDraft.formPlanId === "" ? {} : personPlans.find((item) => item.id === modalDraft.formPlanId) || personPlans[0] || {};
      const form = modalDraft.formData || buildLeaveFormDraft(employee, plan);
      const updateForm = (key, value) => setModalDraft((old) => ({ ...old, formData: { ...(old.formData || form), [key]: value } }));
      const selectFormEmployee = (employeeId) => { const target = employees.find((item) => item.id === employeeId), targetPlan = safeList(leaveCenter.plans).filter((item) => item.employeeId === employeeId && item.status !== "CANCELLED").sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || {}; setSelectedId(employeeId); setModalDraft({ formEmployeeId: employeeId, formPlanId: targetPlan.id || "", formData: buildLeaveFormDraft(target, targetPlan) }); };
      const selectFormPlan = (planId) => { const targetPlan = personPlans.find((item) => item.id === planId) || {}; setModalDraft({ formEmployeeId: employee.id, formPlanId: planId, formData: buildLeaveFormDraft(employee, targetPlan) }); };
      return <Modal title="Duzenlenebilir A5 Yillik Izin Formu" sub="Formun uzerindeki her alani degistirin; yazdirma bu son degerleri kullanir" size="form-dialog" onClose={() => setModal(null)}><div className="form-modal-layout"><div className="form-control-panel"><Field label="Personel kaynagi"><select value={employee?.id || ""} onChange={(event) => selectFormEmployee(event.target.value)}>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></Field><Field label="Izin kaydi kaynagi"><select value={plan.id || ""} onChange={(event) => selectFormPlan(event.target.value)}><option value="">Bos form</option>{personPlans.map((item) => <option key={item.id} value={item.id}>{item.startDate} - {item.endDate} / {item.countedDays} gun</option>)}</select></Field><div className="warnline ok">Alanlar sadece bu cikti icin duzenlenir. Yazdir / PDF dugmesi ekrandaki son hali kullanir.</div><button className="btn" onClick={() => setModalDraft((old) => ({ ...old, formData: buildLeaveFormDraft(employee, plan) }))}>Personel Kaydindan Yenile</button></div><div className="a5-leave-sheet editable"><div className="a5-edit-head"><span className="a5-logo">KY ERP</span><input className="document-title" value={form.documentTitle || ""} onChange={(event) => updateForm("documentTitle", event.target.value)} /><div><label>Form No<input value={form.documentNo || ""} onChange={(event) => updateForm("documentNo", event.target.value)} /></label><label>Duzenleme<input type="date" value={form.documentDate || ""} onChange={(event) => updateForm("documentDate", event.target.value)} /></label></div></div><div><b>ADI SOYADI</b><input value={form.fullName || ""} onChange={(event) => updateForm("fullName", event.target.value)} /></div><div><b>SGK SICIL / PERSONEL NO</b><input value={form.registryNo || ""} onChange={(event) => updateForm("registryNo", event.target.value)} /></div><div><b>DEPARTMANI</b><input value={form.department || ""} onChange={(event) => updateForm("department", event.target.value)} /></div><div><b>UNVANI</b><input value={form.jobTitle || ""} onChange={(event) => updateForm("jobTitle", event.target.value)} /></div><div><b>IZIN SEBEBI</b><select value={form.leaveType || "Yillik izin"} onChange={(event) => updateForm("leaveType", event.target.value)}>{LEAVE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></div><div><b>IZNE CIKACAGI TARIH</b><input type="date" value={form.startDate || ""} onChange={(event) => updateForm("startDate", event.target.value)} /></div><div><b>IZIN BITIS TARIHI</b><input type="date" value={form.endDate || ""} onChange={(event) => updateForm("endDate", event.target.value)} /></div><div><b>ISE BASLAYACAGI TARIH</b><input type="date" value={form.returnDate || ""} onChange={(event) => updateForm("returnDate", event.target.value)} /></div><div><b>IZIN SURESI</b><input type="number" value={form.countedDays ?? ""} onChange={(event) => updateForm("countedDays", event.target.value)} /></div><div><b>DEVREDEN IZIN</b><input type="number" value={form.carryover ?? ""} onChange={(event) => updateForm("carryover", event.target.value)} /></div><div><b>YILLIK IZIN HAKEDISI</b><input type="number" value={form.entitlement ?? ""} onChange={(event) => updateForm("entitlement", event.target.value)} /></div><div><b>KULLANIM SONRASI KALAN</b><input type="number" value={form.remaining ?? ""} onChange={(event) => updateForm("remaining", event.target.value)} /></div><textarea className="a5-form-note" value={form.note || ""} onChange={(event) => updateForm("note", event.target.value)} /><div className="a5-signatures editable-signatures"><input value={form.employeeSignature || ""} onChange={(event) => updateForm("employeeSignature", event.target.value)} /><input value={form.managerSignature || ""} onChange={(event) => updateForm("managerSignature", event.target.value)} /><input value={form.hrSignature || ""} onChange={(event) => updateForm("hrSignature", event.target.value)} /></div></div></div><ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => printLeaveForm(employee, plan, form)}>Yazdir / PDF</button>} /></Modal>;
    }

    if (modal === "fis" || modal === "kidemCikti") {
      const row = payrollRows.find((item) => item.employee.id === selected?.id) || payrollRows[0];
      return (
        <Modal title={modal === "fis" ? "Tek Kişi Ödeme Fişi" : "Ayrılış Ödeme Özeti"} sub={modal === "fis" ? "Personeli seçin; yanlış tutar varsa son bordrodan düzeltip yalnız bu fişi tekrar alın." : "Yazdırmadan önce önizleme"} size="small" onClose={() => setModal(null)}>
          {modal === "fis" && <div className="form"><Field label="Fişi alınacak personel" wide><select value={row?.employee?.id || ""} onChange={(event)=>setSelectedId(event.target.value)}>{payrollRows.map((item)=><option key={item.employee.id} value={item.employee.id}>{item.employee.fullName} · {item.employee.code || "HKN yok"}</option>)}</select></Field></div>}
          <div className="print-sheet"><h2>{modal === "fis" ? "ÖDEME FİŞİ" : "AYRILIŞ ÖDEME ÖZETİ"}</h2><div className="print-row"><span>Personel</span><b>{row?.employee?.fullName || "-"}</b></div><div className="print-row"><span>Dönem</span><b>{MONTHS[month - 1]} {year}</b></div>{modal === "fis" ? <><div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div><div className="print-row"><span>Avans / Kesinti / İcra-Haciz</span><b>{money(num(row?.advance)+num(row?.deduction)+num(row?.garnishment))}</b></div><div className="print-row"><span>Banka</span><b>{money(row?.bank)}</b></div><div className="print-row" style={{fontSize:18,fontWeight:900,border:"2px solid #111",padding:8}}><span>ELDEN</span><b>{money(row?.cash)}</b></div><div className="print-row" style={{fontSize:20,fontWeight:900,border:"2px solid #111",padding:8,marginTop:6}}><span>TOPLAM ÖDEME</span><b>{money(row?.net)}</b></div></> : <><div className="print-row"><span>Maaş</span><b>{money(row?.salary)}</b></div><div className="print-row"><span>Yol</span><b>{money(row?.road)}</b></div><div className="print-row"><span>EK</span><b>{money(row?.extra)}</b></div><div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div><div className="print-row"><span>Avans</span><b>{money(row?.advance)}</b></div><div className="print-row"><span>Özel Kesinti</span><b>{money(row?.deduction)}</b></div><div className="print-row"><span>İcra / Haciz</span><b>{money(row?.garnishment)}</b></div><div className="print-row"><span>Banka</span><b>{money(row?.bank)}</b></div><div className="print-row"><span>Elden</span><b>{money(row?.cash)}</b></div><div className="print-row"><span>Toplam</span><b>{money(row?.net)}</b></div></>}</div>
          <ModalFooter onClose={() => setModal(null)} actions={modal === "fis" ? <><button className="btn" disabled={!row || data.close?.isLocked} onClick={()=>openPayroll(row)}>Yanlışsa Düzenle</button><button className="btn primary" disabled={!row} onClick={() => printSlip(row)}>Sadece Bu Fişi Yazdır / PDF</button></> : <button className="btn primary" disabled={!row} onClick={() => printSettlement(row)}>Yazdır / PDF</button>} />
        </Modal>
      );
    }

    if (modal === "topluOdeme") {
      const previewRows = modalDraft.group === "SELECTED" && selectedPayrollIds.length ? payrollRows.filter((row)=>selectedPayrollIds.includes(row.employee.id)) : modalDraft.group === "BANK" ? payrollRows.filter((row)=>row.bank>0) : modalDraft.group === "CASH" ? payrollRows.filter((row)=>row.cash>0) : payrollRows;
      return <Modal title="Banka / Toplu Çıktı Merkezi" sub="Banka Exceli ve bordro raporu yalnız çıktı üretir; ay kilidi ayrı yönetilir." size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid"><div className="form"><Field label="Odeme tarihi" half><input type="date" value={modalDraft.paymentDate||""} onChange={(event)=>setModalDraft((old)=>({...old,paymentDate:event.target.value}))} /></Field><Field label="Personel grubu" half><select value={modalDraft.group||"BANK"} onChange={(event)=>setModalDraft((old)=>({...old,group:event.target.value}))}><option value="BANK">Banka odemesi olanlar</option><option value="CASH">Elden odemesi olanlar</option><option value="SELECTED">Tabloda secili personel</option><option value="ALL">Tum personel</option></select></Field><Field label="Yapilacak islem" wide><select value={modalDraft.action||"BANK_LIST"} onChange={(event)=>setModalDraft((old)=>({...old,action:event.target.value}))}><option value="BANK_LIST">Banka ödeme Exceli hazırla</option><option value="REPORT">PDF / imza raporu hazırla</option></select></Field><Field label="Aciklama / banka referansi" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))} placeholder="Odeme aciklamasi, banka referansi veya kontrol notu" /></Field><div className="wide warnline warn">Banka Exceli yalnız hazırlık listesidir ve bordroyu tamamlamaz. Resmi bordro/PDF/fiş çıktısı alındığında seçili personel ödeme tamamlandı kabul edilir ve snapshot kilitlenir.</div></div><div><div className="import-summary payment-summary"><div><span>Personel</span><b>{previewRows.length}</b></div><div><span>Banka</span><b>{money(previewRows.reduce((sum,row)=>sum+row.bank,0))}</b></div><div><span>Elden</span><b>{money(previewRows.reduce((sum,row)=>sum+row.cash,0))}</b></div><div><span>Net</span><b>{money(previewRows.reduce((sum,row)=>sum+row.net,0))}</b></div></div><div className="tw payment-preview"><table><thead><tr><th>Personel</th><th>Banka</th><th>Elden</th><th>Net</th><th>Durum</th></tr></thead><tbody>{previewRows.map((row)=><tr key={row.employee.id}><td>{row.employee.fullName}</td><td className="money">{money(row.bank)}</td><td className="money">{money(row.cash)}</td><td className="money">{money(row.net)}</td><td><span className={`badge ${row.diff===0?"green":"red"}`}>{row.diff===0?"Hazir":"Kontrol"}</span></td></tr>)}</tbody></table></div></div></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={runBulkPayment}>{modalDraft.action==="BANK_LIST"?"Excel Hazırla":"Tamamla ve Raporu Aç"}</button>} />
      </Modal>;
    }

    return <Modal title="Denetim Kaydi Detayi" sub="Degistirilemez islem gecmisi ve onceki/yeni degerler" size="medium" onClose={() => setModal(null)}><div className="audit-detail"><div className="import-summary"><div><span>Tarih</span><b>{modalDraft.createdAt||modalDraft.date||"-"}</b></div><div><span>Personel</span><b>{modalDraft.personName||"-"}</b></div><div><span>Islem</span><b>{modalDraft.actionType||"-"}</b></div><div><span>Kullanici</span><b>{modalDraft.userName||"Sistem"}</b></div><div><span>Ekran</span><b>{modalDraft.sourceScreen||"-"}</b></div></div><div className="audit-reason"><b>Aciklama</b><p>{modalDraft.reason||"Aciklama girilmemis."}</p></div><div className="audit-json-grid"><div><b>Onceki Deger</b><pre>{JSON.stringify(modalDraft.oldValue||{},null,2)}</pre></div><div><b>Yeni Deger</b><pre>{JSON.stringify(modalDraft.newValue||{},null,2)}</pre></div></div></div><ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => { setModal(null); editFromLog({...modalDraft,forceDetail:false}); }}>Ilgili Kaydi Duzenle</button>} /></Modal>;
  }

  function financeForm(type, bulk = false) {
  const isMesai = type === "Mesai";
  const isDayAbsence = type === "Eksik gün";
  const isHourAbsence = type === "Eksik saat";
  const isAbsence = isDayAbsence || isHourAbsence;
  const isKesinti = ["Ozel kesinti", "Icra", "Haciz", "Eksik gün", "Eksik saat"].includes(type);
  const isLegal = ["Icra", "Haciz"].includes(type);
  const financeEmployee = employees.find((employee) => employee.id === modalDraft.employeeId) || null;
  const overtimeBaseSalary = num(financeEmployee?.salary);
  const overtimeDivisor = num(financeEmployee?.overtimeHourlyBase || financeEmployee?.overtimeBaseHours) || 225;
  const overtimeHourly = overtimeDivisor > 0 ? round(overtimeBaseSalary / overtimeDivisor) : 0;
  const multiplier = normalizeOvertimeMultiplier(modalDraft.overtimeMultiplier);
  const overtimeSuggested = overtimeAmountFor(modalDraft.employeeId, modalDraft.hourOrDay, multiplier);
  const absence = absenceDeductionFor(modalDraft.employeeId, type, modalDraft.hourOrDay);
  const currentTotal = movements
    .filter((item) => item.id !== modalDraft.id && item.employeeId === modalDraft.employeeId && (isAbsence ? ["Eksik gün", "Eksik saat"].includes(item.type) : item.type === type))
    .reduce((sum, item) => sum + num(item.amount), 0);
  const afterTotal = round(currentTotal + (isMesai ? overtimeSuggested : isAbsence ? absence.total : num(modalDraft.amount)));
  const typeLabel = type === "Icra" ? "İcra" : type === "Haciz" ? "Haciz" : type === "Ozel kesinti" ? "Özel Kesinti" : type === "Eksik gün" ? "Eksik Gün" : type === "Eksik saat" ? "Eksik Saat" : type;
  return (
    <div className="form">
      {!bulk && <Field label="Personel" half><select value={modalDraft.employeeId || ""} onChange={(event) => { const employeeId = event.target.value; setSelectedId(employeeId); setModalDraft((old) => ({ ...old, employeeId, employeeIds: undefined })); }}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.code || "Kod yok"}</option>)}</select></Field>}
      <Field label="Tarih" half><input type="date" value={modalDraft.date || dateKey(year, month, 1)} onChange={(event) => setModalDraft((old) => ({ ...old, date: event.target.value }))} /></Field>
      {isMesai ? <>
        <Field label="Mesai Türü" half><select value={String(multiplier)} onChange={(event) => { const next = normalizeOvertimeMultiplier(event.target.value); setModalDraft((old) => ({ ...old, overtimeMultiplier: next, overtimeKind: next === 2 ? "WEEKEND_100" : "WEEKDAY_50", adjustmentType: "Mesai" })); }}><option value="1.5">Hafta içi %50 (x1,5)</option><option value="2">Hafta sonu %100 (x2)</option></select></Field>
        <Field label="Mesai Saati" half><input type="number" min="0" step="0.5" value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value, adjustmentType: "Mesai" }))} /></Field>
        <Field label={`Saatlik Baz (${overtimeDivisor} saat)`}><input value={money(overtimeHourly)} readOnly /></Field>
        <Field label="Çarpan"><input value={`x${String(multiplier).replace(".", ",")} · ${multiplier === 2 ? "%100" : "%50"}`} readOnly /></Field>
        <Field label="Hesaplanan Mesai Tutarı" half><input value={money(overtimeSuggested)} readOnly /></Field>
        <Field label="Bordro Etkisi" half><input value="Maaşa eklenir" readOnly /></Field>
      </> : <>
        {isKesinti && <Field label="Kesinti Türü" half><select value={type} onChange={(event) => setModalDraft((old) => ({ ...old, adjustmentType: event.target.value, hourOrDay: event.target.value === "Eksik gün" ? 1 : event.target.value === "Eksik saat" ? "" : old.hourOrDay, amount: ["Eksik gün", "Eksik saat"].includes(event.target.value) ? "" : old.amount, payrollEffect: "Bordroya yansir" }))}><option value="Ozel kesinti">Özel Kesinti</option><option value="Eksik gün">Devamsızlık / 1 Gün Eksik</option><option value="Eksik saat">Devamsızlık / Saat Eksik</option><option value="Icra">İcra</option><option value="Haciz">Haciz</option></select></Field>}
        {isAbsence ? <>
          <div className="wide"><div className="group"><button type="button" className={`btn ${isDayAbsence ? "primary" : ""}`} onClick={() => setModalDraft((old) => ({ ...old, adjustmentType: "Eksik gün", hourOrDay: 1, amount: "" }))}>1 Gün Eksik</button><button type="button" className={`btn ${isHourAbsence ? "primary" : ""}`} onClick={() => setModalDraft((old) => ({ ...old, adjustmentType: "Eksik saat", hourOrDay: "", amount: "" }))}>Saat Eksik</button></div></div>
          {isDayAbsence ? <>
            <Field label="Eksik Süre" half><input value="1 tam gün" readOnly /></Field>
            <Field label="1 Gün Maaş Kesintisi" half><input value={money(absence.salaryCut)} readOnly /></Field>
            <Field label="1 Gün Yol Kesintisi" half><input value={money(absence.roadCut)} readOnly /></Field>
            <Field label="Toplam Kesinti" half><input value={money(absence.total)} readOnly /></Field>
          </> : <>
            <Field label="Eksik Saat" half><input type="number" min="0" max="10" step="0.5" value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value, adjustmentType: "Eksik saat" }))} /></Field>
            <Field label={`Saatlik Maaş Kesintisi (÷ ${absence.deductionDivisor})`} half><input value={money(absence.salaryHourly)} readOnly /></Field>
            <Field label="Maaş Kesintisi" half><input value={money(absence.salaryCut)} readOnly /></Field>
            <Field label="Yol Kesintisi" half><input value={money(absence.roadCut)} readOnly /></Field>
            <Field label="Toplam Kesinti" half><input value={money(absence.total)} readOnly /></Field>
          </>}
        </> : <Field label={isKesinti ? `${typeLabel} Tutarı` : "Avans Tutarı"} half><input type="number" min="0" value={modalDraft.amount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, amount: event.target.value, adjustmentType: type }))} /></Field>}
        <Field label={isKesinti ? "Kesinti Yeri" : "Ödeme Şekli"} half><select value={modalDraft.paymentMethod || "Elden"} onChange={(event) => setModalDraft((old) => ({ ...old, paymentMethod: event.target.value }))}><option>Elden</option><option>Banka</option></select></Field>
        <Field label="Bordro Etkisi" half>{isLegal || isAbsence ? <input value="Bordrodan düşer" readOnly /> : <select value={modalDraft.payrollEffect || "Bordroya yansir"} onChange={(event) => setModalDraft((old) => ({ ...old, payrollEffect: event.target.value }))}><option>Bordroya yansir</option><option>Sadece kayit</option></select>}</Field>
      </>}
      <Field label="Açıklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder={isMesai ? "Mesai nedeni / vardiya notu" : isLegal ? "Dosya no / icra-haciz açıklaması" : isKesinti ? "Kesinti nedeni" : "Avans açıklaması"} /></Field>
      {!bulk && <div className={`wide warnline ${isKesinti ? "warn" : "ok"}`}>{isMesai ? `Bu ay mevcut mesai: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)} · Hesap: baz maaş / ${overtimeDivisor} × saat × ${String(multiplier).replace(".", ",")} (${multiplier === 2 ? "hafta sonu %100" : "hafta içi %50"}).` : isDayAbsence ? `1 gün eksik: maaş / 30 + yol / 30. Maaş kesintisi ${money(absence.salaryCut)}, yol kesintisi ${money(absence.roadCut)}, toplam ${money(absence.total)}.` : isHourAbsence ? `Saat eksik: gerçek maaş / kesinti saat böleni (${absence.deductionDivisor}) × eksik saat. 10 saat girilirse tam gün kabul edilip ayrıca yol / 30 kesilir. Toplam ${money(absence.total)}.` : isKesinti ? `Bu ay mevcut ${typeLabel.toLocaleLowerCase("tr-TR")}: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)} · ${modalDraft.paymentMethod || "Elden"} ödemesinden düşer.` : `Bu ay mevcut avans: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)}.`}</div>}
      {bulk && <div className="wide warnline warn">Toplu avans kaydında seçili personellerin her biri için aynı tarih ve kişi başı tutar kaydedilir.</div>}
    </div>
  );
  }



  function dailyFields() {
    return (
      <>
        <Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field>
        <Field label="Durum" half><select value={modalDraft.statusType || "Isi vardi - sadece not"} onChange={(event) => setModalDraft((old) => ({ ...old, statusType: event.target.value, payrollEffect: "Yok", deductionAmount: "" }))}>{DAILY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Gun sayisi"><input type="number" value={modalDraft.dayCount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, dayCount: event.target.value }))} /></Field>
        <div className="wide warnline ok">Bu kayit bilgi / belge kaydidir ve bordrodan para kesmez. Eksik gun veya eksik saat kesintisi Mesai / Avans / Kesinti ekranindaki Devamsizlik Kesintisi ile girilir.</div>
        <Field label="Belge" wide><input value={modalDraft.documentNo || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentNo: event.target.value }))} /></Field>
        <Field label="Not" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Isi vardi, erken cikti, gec geldi vb." /></Field>
        <div className="wide warnline warn">Ayni gun kayit varsa sistem duzenlemeye yonlendirir.</div>
      </>
    );
  }

  function DayGrid() {
    return <div className="daygrid">{Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const selectedDay = selectedDays.includes(day);
      return <button key={day} className={`day ${selectedDay ? "selected" : ""}`} onClick={() => setSelectedDays((old) => selectedDay ? old.filter((item) => item !== day) : [...old, day].sort((a, b) => a - b))}><b>{day}</b><span>{selectedDay ? "Seçildi" : "Boş"}</span></button>;
    })}</div>;
  }

  function LeaveRangeCalendar({ onChange }) {
    const [calendarYear, calendarMonth] = leaveCalendarMonth.split("-").map(Number);
    const count = daysInMonth(calendarYear, calendarMonth);
    const leading = new Date(calendarYear, calendarMonth - 1, 1).getDay() || 7;
    const monthPlans = safeList(leaveCenter.plans).filter((item) => item.status !== "CANCELLED" && item.startDate <= `${leaveCalendarMonth}-31` && item.endDate >= `${leaveCalendarMonth}-01`);
    const moveMonth = (offset) => { const next = new Date(calendarYear, calendarMonth - 1 + offset, 1); setLeaveCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); };
    const chooseDate = (date) => {
      if (leaveRangeStep === 0) {
        setModalDraft((old) => ({ ...old, startDate: date, endDate: date }));
        setLeaveRangeStep(1);
      } else {
        setModalDraft((old) => ({ ...old, startDate: date < old.startDate ? date : old.startDate, endDate: date < old.startDate ? old.startDate : date }));
        setLeaveRangeStep(0);
      }
      setLeavePreview(null);
      onChange?.(date);
    };
    return <div className="leave-range-calendar">
      <div className="leave-calendar-head"><div><b>Takvimden Izin ve Ise Donus Tarihini Sec</b><span>{leaveRangeStep === 0 ? "Ilk tiklama izne cikis tarihini secer." : "Simdi ise donus tarihini secin."}</span></div><div className="group"><button className="btn" onClick={() => moveMonth(-1)}>Onceki</button><strong>{MONTHS[calendarMonth - 1]} {calendarYear}</strong><button className="btn" onClick={() => moveMonth(1)}>Sonraki</button></div></div>
      <div className="leave-calendar-weekdays">{["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"].map((item) => <b key={item}>{item}</b>)}</div>
      <div className="leave-calendar-days">{Array.from({ length: leading - 1 }, (_, index) => <span className="blank" key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
        const date = `${leaveCalendarMonth}-${String(index + 1).padStart(2, "0")}`;
        const inRange = modalDraft.startDate && modalDraft.endDate && date >= modalDraft.startDate && date < modalDraft.endDate;
        const isStart = date === modalDraft.startDate;
        const isReturn = date === modalDraft.endDate;
        const counted = safeList(leavePreview?.countedDates).includes(date);
        const excludedRow = safeList(leavePreview?.excludedDates).find((item) => item.date === date);
        const isOfficial = Boolean(excludedRow && upper(excludedRow.reason).includes("RESMI"));
        const dayPlans = monthPlans.filter((item) => item.startDate <= date && item.endDate >= date);
        return <button type="button" key={date} title={isReturn ? "Ise donus" : excludedRow?.reason || (counted ? "Izinden sayilir" : "")} className={`${inRange ? "in-range" : ""} ${counted ? "counted-day" : ""} ${excludedRow ? "excluded-day" : ""} ${isOfficial ? "official-day" : ""} ${isStart ? "range-start" : ""} ${isReturn ? "return-day" : ""} ${date === istanbulDateKey() ? "today" : ""}`} onClick={() => chooseDate(date)}><b>{index + 1}</b><span>{isReturn ? <i className="return-label">Donus</i> : excludedRow ? <i className="excluded-label">{isOfficial ? "Tatil" : "Sayilmaz"}</i> : dayPlans.slice(0, 1).map((item) => <i key={item.id} title={`${item.fullName} ${item.startDate}-${item.endDate}`}>{item.fullName.split(" ")[0]}</i>)}</span></button>;
      })}</div>
      <div className="leave-calendar-legend"><span><i className="selected" /> Izinden sayilan</span><span><i className="not-counted" /> Sayilmayan</span><span><i className="return-legend" /> Ise donus</span><span><i className="occupied" /> Kayitli izin</span><b>{modalDraft.startDate || "Izne cikis secilmedi"} → {modalDraft.endDate || "Ise donus secilmedi"}</b></div>
    </div>;
  }

  function groupEmployeeIds(group) {
    if (group === "all") return employees.map((item) => item.id);
    if (group === "sgk") return employees.filter((item) => item.sgkFollow === true).map((item) => item.id);
    if (group === "nonsgk") return employees.filter((item) => item.sgkFollow === false).map((item) => item.id);
    if (group === "cash") return employees.filter((item) => paymentLabel(item) === "Elden").map((item) => item.id);
    if (group === "bank") return employees.filter((item) => paymentLabel(item) === "Banka").map((item) => item.id);
    return selected?.id ? [selected.id] : [];
  }
}

function Modal({ title, sub = "", size = "", children, onClose }) {
  return createPortal(
    <div className="modal-bg show" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className={`modal ${size}`}>
        <div className="mh"><div><b>{title}</b>{sub ? <small>{sub}</small> : null}</div><button className="btn" onClick={onClose}>Kapat</button></div>
        <div className="mb">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function ModalFooter({ actions, onClose }) {
  return <div className="mf"><button className="btn" onClick={onClose}>Vazgec</button><div className="group">{actions}</div></div>;
}

function Field({ label, children, wide = false, half = false }) {
  return <div className={wide ? "wide" : half ? "half" : ""}><label>{label}</label>{children}</div>;
}

function LogTable({ title, rows, onEdit }) {
  return (
    <div className="card">
      <div className="ch"><div><b>{title}</b><span>Denetim kayitlari silinmez; detay gorulur ve ilgili kaynak kayit duzeltilir.</span></div></div>
      <div className="tw"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Islem</th><th>Aciklama</th><th>Kullanici</th><th>Islem</th></tr></thead><tbody>{rows.map((log, index) => <tr key={log.id || index}><td>{log.createdAt || log.date || "-"}</td><td>{log.personName || "-"}</td><td>{log.actionType || log.sourceScreen || "-"}</td><td>{log.reason || log.description || "-"}</td><td>{log.createdBy || log.userName || "Sistem"}</td><td><button className="btn" onClick={() => onEdit({ ...log, forceDetail: true })}>Detay</button> <button className="btn" onClick={() => onEdit(log)}>Kaydi Duzelt</button></td></tr>)}<EmptyRow show={!rows.length} colSpan={6} text="Log kaydi yok." /></tbody></table></div>
    </div>
  );
}

function EmptyRow({ show, colSpan, text }) {
  if (!show) return null;
  return <tr><td colSpan={colSpan} style={{ textAlign: "center", color: "var(--muted)" }}>{text}</td></tr>;
}
