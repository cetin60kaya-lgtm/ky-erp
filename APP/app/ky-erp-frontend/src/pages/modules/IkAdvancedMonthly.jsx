import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteIkAdvancedFinanceMovement,
  getIkAdvancedAuditLogs,
  getIkAdvancedMonth,
  getIkAdvancedPayroll,
  getIkAdvancedLeaveCenter,
  runIkAdvancedCloseCheck,
  saveIkAdvancedException,
  saveIkAdvancedLeave,
  previewIkAdvancedLeave,
  saveIkAdvancedLeavePolicy,
  cancelIkAdvancedLeave,
  saveIkAdvancedFinanceMovement,
  saveIkAdvancedPayrollLines,
  saveIkAdvancedPayrollOverride,
  saveIkAdvancedPersonCard,
  saveIkAdvancedSettlementDraft,
  previewIkAdvancedSgk,
  confirmIkAdvancedSgk,
  updateIkAdvancedFinanceMovement,
  uploadIkAdvancedDocument,
} from "../../services/ikApi";
import { printHtmlDocument } from "../../services/printService";
import { exportRowsToExcelFile } from "../../utils/excelExport";
import "./ik.advanced.css";

const MONTHS = ["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];
const FINANCE_TYPES = ["Mesai", "Avans", "Toplu avans", "Ozel kesinti", "Icra", "Haciz"];
const LEAVE_TYPES = ["Yillik izin", "Normal izin", "Ucretsiz izin", "Mazeret izni", "Dogum izni", "Olum izni"];
const DAILY_TYPES = ["Gelmedi - net kesinti", "Isi vardi - sadece not", "Rapor", "Istisna", "Erken cikma", "Gec gelme", "Normal izin", "Ucretsiz izin", "Dogum izni", "Olum izni"];
const DOCUMENT_LOG_WORDS = ["EVRAK", "BELGE", "SOZLESME", "RAPOR", "IZIN FORM"];
const PAYROLL_LOG_WORDS = ["BORDRO", "ODEME", "FIS"];

function todayPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function dateKey(year, month, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
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

function normalizeFinanceType(value) {
  const text = upper(value);
  if (text.includes("TOPLU") && text.includes("AVANS")) return "Toplu avans";
  if (text.includes("AVANS")) return "Avans";
  if (text.includes("HACIZ") || text.includes("HACİZ")) return "Haciz";
  if (text.includes("ICRA") || text.includes("İCRA")) return "Icra";
  if (text.includes("KESINT")) return "Ozel kesinti";
  if (text.includes("MESAI") || text.includes("HAFTA SONU")) return "Mesai";
  return FINANCE_TYPES.includes(value) ? value : "";
}

function isSgk(employee = {}) {
  return employee.sgkFollow === true;
}

function sgkLabel(employee = {}) {
  if (employee.sgkFollow === true) return "SGK'li";
  if (employee.sgkFollow === false) return "SGK'siz";
  return "Belirtilmemis";
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

function draftPerson(employee = {}) {
  return {
    id: employee.id || "",
    fullName: employee.fullName || "",
    code: employee.code || "",
    cardNo: employee.cardNo || "",
    identityNo: employee.identityNo || "",
    sgkFollow: employee.sgkFollow === true ? "SGKLI" : employee.sgkFollow === false ? "SGKSIZ" : "BELIRTILMEMIS",
    paymentType: employee.paymentType || "BANKA_ELDEN",
    salary: employee.salary ?? "",
    roadAllowance: employee.roadAllowance ?? "",
    bankAmount: employee.bankAmount ?? "",
    cashAmount: employee.cashAmount ?? "",
    baseEmployeeId: employee.baseEmployeeId || "",
    extraPaymentLabel: "EK",
    extraPaymentAmount: employee.extraPaymentAmount ?? "",
    startDate: employee.startDate || employee.hireDate || "",
    title: employee.title || "",
    department: employee.department || "",
    phone: employee.phone || "",
    annualLeaveEntitlement: employee.annualLeaveEntitlement ?? "",
    annualLeaveCarryover: employee.annualLeaveCarryover ?? "",
    documentStatus: employee.documentStatus || "",
    status: employee.status || employee.activePassive || "AKTIF",
    payrollIncluded: employee.payrollIncluded !== false,
    note: employee.note || "",
  };
}

export default function IkAdvancedMonthly({ mode = "ozet", activeMainCompany }) {
  const initial = todayPeriod();
  const initialPage = mode === "personel" ? "personel"
    : mode === "mesai" ? "hareket"
      : mode === "izin" ? "izin"
        : mode === "bordro" ? "bordro"
          : ["sgk", "evrak", "kapanis", "kontrol"].includes(mode) ? "evrak" : "ozet";
  const [page, setPage] = useState(initialPage);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [data, setData] = useState({});
  const [payrollData, setPayrollData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState(null);
  const [modalDraft, setModalDraft] = useState({});
  const [selectedDays, setSelectedDays] = useState([1]);
  const [leaveView, setLeaveView] = useState("annual");
  const [annualView, setAnnualView] = useState("control");
  const [leaveCenter, setLeaveCenter] = useState({ policy: { countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 }, plans: [], conflicts: [] });
  const [leavePreview, setLeavePreview] = useState(null);
  const [policyDraft, setPolicyDraft] = useState({ countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 });
  const [leaveCalendarMonth, setLeaveCalendarMonth] = useState(`${initial.year}-${String(initial.month).padStart(2, "0")}`);
  const [leaveRangeStep, setLeaveRangeStep] = useState(0);
  const leaveAutoPreviewSeq = useRef(0);
  const [sgkPreview, setSgkPreview] = useState(null);
  const [selectedPayrollIds, setSelectedPayrollIds] = useState([]);
  const documentInput = useRef(null);
  const payrollInput = useRef(null);
  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const period = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  const employees = safeList(data.employees).filter((item) => item.payrollIncluded !== false);
  const rawAdjustments = safeList(data.adjustments);
  const leaves = safeList(data.leaves);
  const documents = safeList(data.documents);
  const checks = safeList(data.checks);
  const payrollLines = safeList(payrollData?.lines);
  const totalDays = daysInMonth(year, month);
  const selected = employees.find((item) => item.id === selectedId) || employees[0] || null;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getIkAdvancedMonth(params({ mainCompanyId: companyId, year, month }));
      setData(result || {});
      const audit = await getIkAdvancedAuditLogs(params({ mainCompanyId: companyId, period, limit: 180 }));
      setLogs(safeList(audit));
      const payroll = await getIkAdvancedPayroll(params({ mainCompanyId: companyId, year, month }));
      setPayrollData(payroll || null);
      const center = await getIkAdvancedLeaveCenter(params({ mainCompanyId: companyId, from: `${year - 1}-01-01`, to: `${year + 1}-12-31` }));
      setLeaveCenter(center || { plans: [], conflicts: [] });
      if (center?.policy) setPolicyDraft(center.policy);
      const nextEmployees = safeList(result?.employees).filter((item) => item.payrollIncluded !== false);
      setSelectedId((old) => nextEmployees.some((item) => item.id === old) ? old : nextEmployees[0]?.id || "");
      setSelectedPayrollIds((old) => old.filter((id) => nextEmployees.some((item) => item.id === id)));
      setNotice("");
    } catch (error) {
      setNotice(error?.message || "IK aylik verisi alinamadi.");
    } finally {
      setBusy(false);
    }
  }, [companyId, month, period, year]);

  useEffect(() => {
    load();
  }, [year, month, companyId, load]);

  const filteredEmployees = useMemo(() => {
    const needle = upper(search).trim();
    return employees.filter((employee) => {
      const haystack = upper(`${employee.fullName || ""} ${employee.code || ""} ${employee.cardNo || ""} ${employee.identityNo || ""}`);
      return !needle || haystack.includes(needle);
    });
  }, [employees, search]);

  const movements = useMemo(() => rawAdjustments
    .map((item) => ({ ...item, type: normalizeFinanceType(item.adjustmentType || item.type) }))
    .filter((item) => item.type), [rawAdjustments]);

  const employeeLeave = useCallback((employee) => {
    const own = leaves.filter((item) => item.employeeId === employee.id);
    const annual = own.filter((item) => upper(item.recordType || item.type).includes("YILLIK")).reduce((sum, item) => sum + num(item.dayCount || item.days || 1), 0);
    const right = num(employee.annualLeaveEntitlement) + num(employee.annualLeaveCarryover);
    return { own, annual, right, balance: right - annual };
  }, [leaves]);

  const docsFor = useCallback((employee) => documents.filter((item) => item.employeeId === employee.id), [documents]);

  const planFor = useCallback((employee) => {
  const own = movements.filter((item) => item.employeeId === employee.id);
  const effective = own.filter((item) => !upper(item.payrollEffect).includes("SADECE"));
  const overtimeRows = effective.filter((item) => item.type === "Mesai");
  const advanceRows = effective.filter((item) => item.type === "Avans" || item.type === "Toplu avans");
  const deductionRows = effective.filter((item) => item.type === "Ozel kesinti");
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
  const legalKinds = new Set(legalRows.map((item) => item.type));
  const legalType = legalKinds.size > 1 ? "KARMA" : legalKinds.has("Haciz") ? "HACIZ" : legalKinds.has("Icra") ? "ICRA" : "YOK";
  const garnishmentSource = legalBank > 0 && legalCash > 0 ? "KARMA" : legalCash > 0 ? "ELDEN" : "BANKA";
  const actualSalary = num(employee.salary);
  const baseEmployee = employee.baseEmployeeId ? employees.find((item) => item.id === employee.baseEmployeeId) : null;
  const salary = baseEmployee ? num(baseEmployee.salary) : actualSalary;
  const road = num(employee.roadAllowance);
  const extraLabel = "EK";
  const extra = baseEmployee ? Math.max(round(actualSalary - salary), 0) : num(employee.extraPaymentAmount);
  const pre = calcRow({ salary, road, overtime, extra, advance, deduction, garnishment });
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  const bankPlanAfterDeductions = Math.max(num(employee.bankAmount) - bankDeductions, 0);
  const bank = saved?.final ? num(saved.final.bank) : Math.min(pre.net, bankPlanAfterDeductions);
  const cash = saved?.final ? num(saved.final.cash) : Math.max(pre.net - bank, 0);
  return { employee, actualSalary, baseEmployee, salary, road, extraLabel, extra, overtime, advance, deduction, legalType, garnishmentSource, garnishment, legalBank, legalCash, bankDeductions, cashDeductions, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
}, [employees, movements, payrollLines]);

  const payrollRows = useMemo(() => employees.map((employee) => {
  const system = planFor(employee);
  const saved = payrollLines.find((line) => line.employeeId === employee.id);
  if (!saved?.final) return system;
  const salary = num(saved.final.salaryPay);
  const road = num(saved.final.roadPay);
  const extraLabel = "EK";
  const extra = saved.final.premiumAmount !== undefined ? num(saved.final.premiumAmount) : system.extra;
  const overtime = num(saved.final.overtimeAmount);
  const advance = num(saved.final.advanceAmount);
  const deduction = num(saved.final.deductionAmount);
  const garnishment = saved.final.garnishmentAmount !== undefined ? num(saved.final.garnishmentAmount) : system.garnishment;
  const bank = num(saved.final.bank);
  const cash = num(saved.final.cash);
  return { ...system, salary, road, extraLabel, extra, overtime, advance, deduction, garnishment, bank, cash, saved, ...calcRow({ salary, road, overtime, extra, advance, deduction, garnishment, bank, cash }) };
}), [employees, payrollLines, planFor]);

  const summary = useMemo(() => payrollRows.reduce((acc, row) => ({
    count: acc.count + 1,
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
  }), { count: 0, bank: 0, cash: 0, net: 0, advance: 0, deduction: 0, extra: 0, garnishment: 0, overtime: 0, annual: 0, docsMissing: 0, manual: 0 }), [payrollRows, employeeLeave, docsFor]);

  const balanced = round(summary.bank + summary.cash - summary.net) === 0;

  const scopedLogs = useMemo(() => {
    const rows = logs.map((log) => {
      const text = upper(`${log.actionType || ""} ${log.sourceScreen || ""} ${log.reason || ""}`);
      const employee = employees.find((item) => item.id === log.employeeId);
      return { ...log, text, personName: employee?.fullName || log.fullName || "-" };
    });
    if (page === "personel") return rows.filter((log) => log.text.includes("PERSON") || log.text.includes("KART") || log.text.includes("SOZLESME") || log.text.includes("MAAS"));
    if (page === "hareket") return rows.filter((log) => log.text.includes("MESAI") || log.text.includes("AVANS") || log.text.includes("KESINT"));
    if (page === "izin") return rows.filter((log) => log.text.includes("IZIN") || log.text.includes("RAPOR") || log.text.includes("ISTISNA") || log.text.includes("GUNLUK"));
    if (page === "bordro") return rows.filter((log) => PAYROLL_LOG_WORDS.some((word) => log.text.includes(word)));
    if (page === "evrak") return rows.filter((log) => DOCUMENT_LOG_WORDS.some((word) => log.text.includes(word)));
    return rows;
  }, [logs, employees, page]);

  const go = (target) => {
    setPage(target);
    setNotice("");
  };

  const openPerson = (employee = selected) => {
    if (!employee) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(employee.id);
    setModalDraft(draftPerson(employee));
    setModal("personel");
  };

  const openFinance = (type, row = null) => {
    const normalized = normalizeFinanceType(type || row?.adjustmentType) || "Mesai";
    const employee = row?.employeeId ? employees.find((item) => item.id === row.employeeId) : selected;
    if (normalized !== "Toplu avans" && !employee) return setNotice("Personel secilmeden kayit yapilamaz.");
    setModalDraft({
      id: row?.id || "",
      employeeId: employee?.id || "",
      employeeIds: row?.employeeIds || (employee?.id ? [employee.id] : []),
      adjustmentType: normalized,
      date: row?.date || row?.adjustmentDate || dateKey(year, month, 1),
      hourOrDay: row?.hourOrDay || row?.quantity || "",
      amount: row?.amount || "",
      paymentMethod: row?.paymentMethod || (normalized === "Mesai" ? "Bordro" : "Elden"),
      payrollEffect: row?.payrollEffect || "Bordroya yansir",
      note: row?.note || row?.description || "",
    });
    setModal(normalized === "Toplu avans" ? "topluAvans" : normalized === "Avans" ? "avans" : ["Ozel kesinti", "Icra", "Haciz"].includes(normalized) ? "kesinti" : "mesai");
  };

  const openLeave = (kind = "yillik", forced = "", employeeOverride = null) => {
    const targetEmployee = employeeOverride || selected;
    if (!targetEmployee) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(targetEmployee.id);
    setSelectedDays([1]);
    const today = new Date().toISOString().slice(0, 10);
    const periodStart = dateKey(year, month, 1);
    const startDate = periodStart > today ? periodStart : today;
    setLeaveCalendarMonth(startDate.slice(0, 7));
    setLeaveRangeStep(0);
    setLeavePreview(null);
    setModalDraft({
      employeeId: targetEmployee.id,
      leaveType: "Yillik izin",
      statusType: forced || "Gelmedi - net kesinti",
      dayCount: 1,
      hourOrDay: "",
      wageEffect: "Ucretli",
      payrollEffect: kind === "gunluk" ? "Yok" : "Yansit",
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
    const employee = employees.find((item) => item.id === plan.employeeId);
    if (employee) setSelectedId(employee.id);
    setLeavePreview(null);
    setLeaveCalendarMonth(plan.startDate.slice(0, 7));
    setLeaveRangeStep(0);
    setModalDraft({ id: plan.id, employeeId: plan.employeeId, leaveType: plan.recordType || "Yillik izin", startDate: plan.startDate, endDate: plan.returnDate || plan.endDate, status: plan.status, wageEffect: "Ucretli", payrollEffect: "Yansit", documentNo: plan.documentNo || "", note: plan.note || "" });
    setModal("yillik");
  };

  const openPayroll = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(row.employee.id);
    setModalDraft({
      employeeId: row.employee.id,
      fullName: row.employee.fullName,
      salary: row.salary,
      road: row.road,
      extra: row.extra,
      overtime: row.overtime,
      advance: row.advance,
      deduction: row.deduction,
      garnishment: row.garnishment,
      bank: row.bank,
      cash: row.cash,
      reason: "",
    });
    setModal("bordroDuzelt");
  };

  const openDocument = (employee = selected) => {
    if (employee?.id) setSelectedId(employee.id);
    setModalDraft({ employeeId: employee?.id || "", documentType: "Personel evragi", note: "" });
    setModal("evrak");
  };

  const openBulkPayment = () => {
    setModalDraft({ paymentDate: dateKey(year, month, Math.min(new Date().getDate(), totalDays)), group: "BANK", action: "BANK_LIST", note: "" });
    setModal("topluOdeme");
  };

  const runBulkPayment = async () => {
    const groupRows = modalDraft.group === "SELECTED" && selectedPayrollIds.length
      ? payrollRows.filter((row) => selectedPayrollIds.includes(row.employee.id))
      : modalDraft.group === "BANK" ? payrollRows.filter((row) => row.bank > 0)
        : modalDraft.group === "CASH" ? payrollRows.filter((row) => row.cash > 0) : payrollRows;
    if (!groupRows.length) return setNotice("Secilen grupta odeme satiri yok.");
    if (modalDraft.action === "BANK_LIST") {
      exportRowsToExcelFile(`ik-banka-odeme-${period}.xlsx`, groupRows.map((row) => ({ personel: row.employee.fullName, tcKimlikNo: row.employee.identityNo || "", donem: period, resmiBordroNeti: num(row.employee.sgkNet), bankaOdemesi: row.bank, aciklama: modalDraft.note || `${MONTHS[month - 1]} ${year} ucret odemesi` })));
      setModal(null); return;
    }
    if (modalDraft.action === "REPORT") { setSelectedPayrollIds(groupRows.map((row) => row.employee.id)); setModal(null); setTimeout(printPayrollReport, 0); return; }
    setBusy(true);
    try {
      await saveIkAdvancedPayrollLines({ mainCompanyId: companyId, year, month, employeeIds: groupRows.map((row) => row.employee.id), status: "PAID", reason: modalDraft.note || `Odeme tamamlandi: ${modalDraft.paymentDate}` });
      setModal(null); setNotice(`${groupRows.length} personelin odeme durumu tamamlandi olarak kaydedildi.`); await load();
    } catch (error) { setNotice(error?.message || "Toplu odeme islemi kaydedilemedi."); } finally { setBusy(false); }
  };

  const editFromLog = (log) => {
    if (log.forceDetail) { setModalDraft(log); setModal("logDetay"); return; }
    const text = log.text || upper(`${log.actionType || ""} ${log.sourceScreen || ""} ${log.reason || ""}`);
    const employee = employees.find((item) => item.id === log.employeeId) || selected;
    if (employee?.id) setSelectedId(employee.id);
    if (text.includes("TOPLU") && text.includes("AVANS")) return openFinance("Toplu avans");
    if (text.includes("AVANS")) return openFinance("Avans");
    if (text.includes("HACIZ") || text.includes("HACİZ")) return openFinance("Haciz");
    if (text.includes("ICRA") || text.includes("İCRA")) return openFinance("Icra");
    if (text.includes("KESINT")) return openFinance("Ozel kesinti");
    if (text.includes("MESAI")) return openFinance("Mesai");
    if (text.includes("BORDRO") || text.includes("ODEME")) return openPayroll();
    if (text.includes("YILLIK")) return openLeave("yillik");
    if (text.includes("IZIN") || text.includes("RAPOR") || text.includes("GUNLUK")) return openLeave("gunluk", text.includes("RAPOR") ? "Rapor" : "");
    if (DOCUMENT_LOG_WORDS.some((word) => text.includes(word))) return openDocument(employee);
    return openPerson(employee);
  };

  const savePerson = async () => {
    if (!modalDraft.fullName?.trim()) return setNotice("Personel adi bos olamaz.");
    if (!modalDraft.sgkFollow) return setNotice("SGK durumu bos olamaz.");
    if (!modalDraft.paymentType) return setNotice("Odeme tipi bos olamaz.");
    if (num(modalDraft.salary) < 0) return setNotice("Maas negatif olamaz.");
    const baseEmployee = modalDraft.baseEmployeeId ? employees.find((item) => item.id === modalDraft.baseEmployeeId) : null;
    if (modalDraft.baseEmployeeId === modalDraft.id) return setNotice("Personel kendisini baz personel olarak secemez.");
    if (modalDraft.baseEmployeeId && !baseEmployee) return setNotice("Baz personel bulunamadi.");
    if (baseEmployee && num(baseEmployee.salary) > num(modalDraft.salary)) return setNotice("Baz personel maasi gercek maastan yuksek olamaz.");
    const autoExtra = baseEmployee ? Math.max(round(num(modalDraft.salary) - num(baseEmployee.salary)), 0) : 0;
    const planTotal = num(modalDraft.bankAmount) + num(modalDraft.cashAmount);
    if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) && !window.confirm("Banka plan + elden plan gercek maas ve yol toplamindan yüksek. Devam edilsin mi?")) return;
    setBusy(true);
    try {
      await saveIkAdvancedPersonCard(modalDraft.id, {
        mainCompanyId: companyId,
        fullName: modalDraft.fullName,
        personelKodu: modalDraft.code,
        cardNo: modalDraft.cardNo,
        identityNo: modalDraft.identityNo,
        sgkFollow: modalDraft.sgkFollow === "SGKLI" ? true : modalDraft.sgkFollow === "SGKSIZ" ? false : null,
        paymentType: modalDraft.paymentType,
        salary: num(modalDraft.salary),
        roadAllowance: num(modalDraft.roadAllowance),
        bankAmount: num(modalDraft.bankAmount),
        cashAmount: num(modalDraft.cashAmount),
        baseEmployeeId: modalDraft.baseEmployeeId || "",
        extraPaymentLabel: "EK",
        extraPaymentAmount: autoExtra,
        payrollIncluded: modalDraft.payrollIncluded !== false,
        hireDate: modalDraft.startDate,
        title: modalDraft.title,
        department: modalDraft.department,
        annualLeaveEntitlement: num(modalDraft.annualLeaveEntitlement),
        annualLeaveCarryover: num(modalDraft.annualLeaveCarryover),
        activePassive: modalDraft.status,
        note: modalDraft.note,
      });
      setModal(null);
      setNotice("Personel karti kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Personel karti kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const validateFinance = () => {
    if (modalDraft.adjustmentType !== "Toplu avans" && !modalDraft.employeeId) return "Personel secilmeden kayit yapilamaz.";
    if (modalDraft.adjustmentType === "Toplu avans" && !safeList(modalDraft.employeeIds).length) return "En az 1 personel secilmelidir.";
    if (!modalDraft.date) return "Tarih secilmeden kayit yapilamaz.";
    if (modalDraft.adjustmentType === "Mesai" && num(modalDraft.hourOrDay) <= 0) return "Mesai saati 0 dan buyuk olmalidir.";
    if (num(modalDraft.amount) <= 0) return "Tutar bos veya negatif olamaz.";
    if (num(modalDraft.hourOrDay) < 0) return "Saat / gun negatif olamaz.";
    const duplicate = movements.some((item) => item.id !== modalDraft.id && item.employeeId === modalDraft.employeeId && (item.date || item.adjustmentDate) === modalDraft.date && num(item.amount) === num(modalDraft.amount) && item.type === modalDraft.adjustmentType);
    if (duplicate && !window.confirm("Ayni gun ayni tutarda kayit var. Yine de kaydedilsin mi?")) return "Kayit iptal edildi.";
    return "";
  };

  const saveFinance = async () => {
    const error = validateFinance();
    if (error) return setNotice(error);
    setBusy(true);
    try {
      const payload = { mainCompanyId: companyId, ...modalDraft };
      if (modalDraft.id) await updateIkAdvancedFinanceMovement(payload);
      else await saveIkAdvancedFinanceMovement(payload);
      setModal(null);
      setNotice("Hareket kaydedildi.");
      await load();
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
      await load();
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
    if (modal === "gunluk" && modalDraft.statusType === "Gelmedi - net kesinti" && modalDraft.hasDeduction === "Evet" && num(modalDraft.deductionAmount) <= 0) return setNotice("Kesinti tutari girilmelidir.");
    if (modal === "gunluk" && ["Erken cikma", "Gec gelme"].includes(modalDraft.statusType) && num(modalDraft.hourOrDay) <= 0) return setNotice("Saat alani zorunludur.");
    setBusy(true);
    try {
      const recordType = modal === "yillik" ? modalDraft.leaveType : modalDraft.statusType;
      const officialLeave = modal === "yillik" || ["Rapor", "Normal izin", "Ucretsiz izin", "Dogum izni", "Olum izni"].includes(recordType);
      if (officialLeave) {
        const preview = modal === "yillik" ? (leavePreview || await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate: modalDraft.endDate, recordType })) : null;
        if (preview?.hasCriticalConflict) return setNotice("Bu personelin ayni tarihlerde baska izin kaydi var. Kayit engellendi.");
        if (preview?.balanceAfter < 0 && !window.confirm(`Izin sonrasi bakiye ${preview.balanceAfter} gun olacak. Devam edilsin mi?`)) return;
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
        });
      } else {
        for (const day of selectedDays) await saveIkAdvancedException({
          mainCompanyId: companyId, employeeId: modalDraft.employeeId, workDate: dateKey(year, month, day), recordType,
          status: recordType, dayCount: 1, hourOrDay: modalDraft.hourOrDay, payrollEffect: modalDraft.payrollEffect,
          deductionAmount: num(modalDraft.deductionAmount), documentId: modalDraft.documentNo, note: modalDraft.note, source: "MANUAL",
        });
      }
      setModal(null);
      setLeavePreview(null);
      setNotice(modal === "yillik" ? "Izin kaydi ve gun hesaplamasi tamamlandi." : "Gunluk kayit tamamlandi.");
      await load();
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
      await load();
    } catch (error) { setNotice(error?.message || "Izin ayarlari kaydedilemedi."); } finally { setBusy(false); }
  };

  const cancelLeave = async (plan) => {
    const reason = window.prompt(`${plan.fullName} izin kaydi iptal edilecek. Iptal aciklamasi:`, "Plan degisikligi");
    if (reason === null) return;
    setBusy(true);
    try { await cancelIkAdvancedLeave({ mainCompanyId: companyId, id: plan.id, reason }); setNotice("Izin iptal edildi; resmi kayit ve puantaj etkisi geri alindi."); await load(); }
    catch (error) { setNotice(error?.message || "Izin iptal edilemedi."); } finally { setBusy(false); }
  };

  const savePayrollOverride = async () => {
    const totals = calcRow({
      salary: modalDraft.salary,
      road: modalDraft.road,
      extra: modalDraft.extra,
      overtime: modalDraft.overtime,
      advance: modalDraft.advance,
      deduction: modalDraft.deduction,
      garnishment: modalDraft.garnishment,
      bank: modalDraft.bank,
      cash: modalDraft.cash,
    });
    if (totals.diff !== 0 && !window.confirm("Banka + elden net odeme ile eslesmiyor. Devam edilsin mi?")) return;
    setBusy(true);
    try {
      await saveIkAdvancedPayrollOverride({
        mainCompanyId: companyId,
        year,
        month,
        employeeId: modalDraft.employeeId,
        reason: modalDraft.reason || "Bordro kontrol duzeltmesi",
        override: {
          bank: num(modalDraft.bank),
          cash: num(modalDraft.cash),
          total: totals.net,
        },
      });
      setModal(null);
      setNotice("Bordro duzeltmesi kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Bordro duzeltmesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    try {
      await saveIkAdvancedPayrollLines({ mainCompanyId: companyId, year, month, employeeIds: selectedPayrollIds.length ? selectedPayrollIds : undefined, status: "CALCULATED", reason: "Bordro kaydi" });
      setNotice("Bordro satirlari kaydedildi.");
      await load();
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
      const wrongPeriod = previews.find((item) => !item.periodMatches);
      if (wrongPeriod) throw new Error(`${wrongPeriod.fileName} dosyasi ${wrongPeriod.month}/${wrongPeriod.year} donemine ait. Secili donem ${month}/${year}.`);
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
      await load();
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
      await load();
    } catch (error) {
      setNotice(error?.message || "Evrak yuklenemedi.");
    } finally {
      setBusy(false);
      if (documentInput.current) documentInput.current.value = "";
    }
  };

  const runClose = async () => {
    setBusy(true);
    try {
      const result = await runIkAdvancedCloseCheck({ mainCompanyId: companyId, year, month, lock: false });
      setData((old) => ({ ...old, close: result, checks: result?.checks || old.checks }));
      setNotice("Ay sonu kontrolu calistirildi.");
    } catch (error) {
      setNotice(error?.message || "Ay sonu kontrolu calismadi.");
    } finally {
      setBusy(false);
    }
  };

  const saveSettlementDraft = async () => {
    if (!selected) return setNotice("Personel secilmelidir.");
    setBusy(true);
    try {
      await saveIkAdvancedSettlementDraft({ mainCompanyId: companyId, year, month, employeeId: selected.id, reason: "Kidem / ayrilis taslagi" });
      setNotice("Kidem / ayrilis taslagi kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Taslak kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const exportPayroll = () => {
    exportRowsToExcelFile(`ik-bordro-${period}.xlsx`, payrollRows.map((row) => ({
      personel: row.employee.fullName,
      sgk: sgkLabel(row.employee),
      odeme: paymentLabel(row.employee),
      maas: row.salary,
      yol: row.road,
      ek: row.extra,
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      hukukiKesintiTuru: row.legalType === "KARMA" ? "İcra / Haciz" : row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "",
      hukukiKesintiYeri: row.garnishmentSource === "KARMA" ? "Banka + Elden" : row.garnishmentSource === "ELDEN" ? "Elden" : row.garnishment ? "Banka" : "",
      hukukiKesinti: row.garnishment,
      hakedis: row.hakedis,
      netOdenecek: row.net,
      banka: row.bank,
      elden: row.cash,
      toplam: row.total,
      durum: row.diff === 0 ? "Dengeli" : "Kontrol",
    })));
  };


  const printPayrollReport = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Cikti icin personel bulunamadi.");
    const html = `<html><head><meta charset="utf-8"><style>body{font:12px Arial;color:#14263a;padding:20px}h1{font-size:20px;margin:0}p{color:#52657b}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #cad6e4;padding:7px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eef4fb}.tot{font-weight:700;background:#f8fbff}@media print{body{padding:0}}</style></head><body><h1>IK Aylik Bordro ve Odeme Kontrol Listesi</h1><p>${MONTHS[month - 1]} ${year} - Cikti oncesi son kontrol</p><table><thead><tr><th>Personel</th><th>SGK Gun</th><th>Resmi Net</th><th>Hak Edis</th><th>Avans</th><th>Özel Kesinti</th><th>İcra / Haciz</th><th>Banka</th><th>Elden</th><th>Net</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.employee.fullName}</td><td>${num(row.employee.sgkDays)}</td><td>${money(row.employee.sgkNet)}</td><td>${money(row.hakedis)}</td><td>${money(row.advance)}</td><td>${money(row.deduction)}</td><td>${money(row.garnishment)}</td><td>${money(row.bank)}</td><td>${money(row.cash)}</td><td>${money(row.net)}</td></tr>`).join("")}<tr class="tot"><td>TOPLAM</td><td></td><td>${money(rows.reduce((sum,row)=>sum+num(row.employee.sgkNet),0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.hakedis,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.advance,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.deduction,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.garnishment,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.bank,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.cash,0))}</td><td>${money(rows.reduce((sum,row)=>sum+row.net,0))}</td></tr></tbody></table></body></html>`;
    try {
      await printHtmlDocument({ title: `İK Aylık Bordro - ${period}`, html });
      setNotice("Toplu bordro raporu yazdırma / PDF ekranına gönderildi.");
    } catch (error) {
      setNotice(error?.message || "Toplu bordro raporu açılamadı.");
    }
  };

  const legalLabel = (row) => row.legalType === "KARMA" ? "İcra/Haciz" : row.legalType === "HACIZ" ? "Haciz" : row.legalType === "ICRA" ? "İcra" : "";
  const legalSourceLabel = (row) => row.garnishmentSource === "KARMA" ? "Banka + Elden" : row.garnishmentSource === "ELDEN" ? "Elden" : "Bankadan";

  const slipCardHtml = (row) => {
    const lines = [
      ["Maaş", money(row.salary)],
      ...(row.road ? [["Yol", money(row.road)]] : []),
      ...(row.overtime ? [["Mesai", money(row.overtime)]] : []),
      ...(row.advance ? [["Avans", `-${money(row.advance)}`]] : []),
      ...(row.deduction ? [["Özel Kesinti", `-${money(row.deduction)}`]] : []),
      ...(row.garnishment ? [[`${legalLabel(row)} (${legalSourceLabel(row)})`, `-${money(row.garnishment)}`]] : []),
    ];
    return `<article class="pay-slip"><header><b>${row.employee.fullName}</b><span>${MONTHS[month - 1]} ${year} ÖDEME FİŞİ</span></header><div class="slip-lines">${lines.map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join("")}</div><div class="pay-channels"><div><span>BANKADAN</span><b>${money(row.bank)}</b></div><div><span>ELDEN</span><b>${money(row.cash)}</b></div></div><div class="net"><span>TOPLAM ÖDENECEK</span><b>${money(row.net)}</b></div>${row.extra>0?`<div class="ek-cut"><span>EK</span><b>${money(row.extra)}</b></div>`:""}</article>`;
  };

  const printSlip = async (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Fis icin personel secilmelidir.");
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial;color:#101828;margin:0}.single{width:96mm;margin:auto}.pay-slip{border:1px solid #8fa3b8;padding:3mm;background:#fff}.pay-slip header{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:2mm}.pay-slip header b{display:block;font-size:15px}.pay-slip header span{font-size:9px}.slip-lines>div{display:flex;justify-content:space-between;padding:1.1mm 0;border-bottom:1px solid #e7edf3;font-size:10px}.pay-channels{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:2mm}.pay-channels div{text-align:center;border:1px solid #b9c8d8;padding:2mm}.pay-channels span,.net span{display:block;font-size:8px;font-weight:700}.pay-channels b{font-size:14px}.net{margin-top:2mm;text-align:center;border:1.5px solid #111;padding:2mm}.net b{font-size:18px}.ek-cut{margin:3mm -3mm -3mm;border-top:1px dashed #111;padding:2mm 3mm;display:flex;justify-content:center;gap:5mm;font-size:13px}.ek-cut b{font-size:15px}</style></head><body><div class="single">${slipCardHtml(row)}</div></body></html>`;
    try {
      await printHtmlDocument({ title: `Ödeme Fişi - ${row.employee.fullName}`, html });
      setNotice(`${row.employee.fullName} ödeme fişi yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "Tek kişi ödeme fişi açılamadı.");
    }
  };

  const printPaymentSlips = async () => {
    const rows = payrollRows.filter((row) => !selectedPayrollIds.length || selectedPayrollIds.includes(row.employee.id));
    if (!rows.length) return setNotice("Fis icin personel bulunamadi.");
    const pages = [];
    for (let index = 0; index < rows.length; index += 10) pages.push(rows.slice(index, index + 10));
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{font-family:Arial;color:#101828;margin:0}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,1fr);gap:2mm;page-break-after:always}.page:last-child{page-break-after:auto}.pay-slip{border:1px dashed #6f8194;padding:2mm;overflow:hidden;display:flex;flex-direction:column;background:#fff}.pay-slip header{text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:1mm}.pay-slip header b{display:block;font-size:11px}.pay-slip header span{font-size:7px}.slip-lines{flex:1}.slip-lines>div{display:flex;justify-content:space-between;padding:.55mm 0;border-bottom:1px solid #edf1f5;font-size:7.5px}.pay-channels{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:1mm}.pay-channels div{text-align:center;border:1px solid #b9c8d8;padding:1mm}.pay-channels span,.net span{display:block;font-size:6.5px;font-weight:700}.pay-channels b{font-size:10.5px}.net{margin-top:1mm;text-align:center;border:1.3px solid #111;padding:1mm}.net b{font-size:13px}.ek-cut{margin:1mm -2mm -2mm;border-top:1px dashed #111;padding:1mm 2mm;display:flex;justify-content:center;gap:4mm;font-size:8px}.ek-cut b{font-size:10px}@media print{.pay-slip{break-inside:avoid}}</style></head><body>${pages.map((pageRows)=>`<section class="page">${pageRows.map(slipCardHtml).join("")}</section>`).join("")}</body></html>`;
    try {
      await printHtmlDocument({ title: `Toplu Personel Ödeme Fişleri - ${period}`, html });
      setNotice(`${rows.length} personelin toplu ödeme fişi yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "Toplu ödeme fişleri açılamadı.");
    }
  };

const buildLeaveFormDraft = useCallback((employee, selectedPlan = {}) => {
    const leave = employee ? employeeLeave(employee) : { annual: 0, balance: 0 };
    const countedDays = selectedPlan.countedDays ?? "";
    return {
      documentTitle: "IZIN BELGESI",
      documentNo: selectedPlan.documentNo || "",
      documentDate: new Date().toISOString().slice(0, 10),
      fullName: employee?.fullName || "",
      registryNo: employee?.cardNo || employee?.code || "",
      department: employee?.department || "",
      jobTitle: employee?.title || "",
      leaveType: selectedPlan.recordType || selectedPlan.leaveType || "Yillik izin",
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
    const html = `<html><head><meta charset="utf-8"><style>@page{size:A5 portrait;margin:7mm}*{box-sizing:border-box}body{margin:0;font:10.5px Arial;color:#111}.sheet{width:134mm;min-height:196mm;margin:auto;border:1.2px solid #111;padding:5mm}.head{display:grid;grid-template-columns:25mm 1fr 30mm;align-items:center;border-bottom:1.5px solid #111;padding-bottom:3mm}.logo{font-weight:800;font-size:15px}.head h1{text-align:center;font-size:17px;margin:0}.doc{text-align:right;font-size:9px}.row{display:grid;grid-template-columns:49mm 1fr;border-bottom:1px solid #777;min-height:8mm;align-items:center}.row b{padding:2mm;border-right:1px solid #777}.row span{padding:2mm}.reasons{display:flex;gap:8mm;font-size:11px}.note{font-size:8.5px;line-height:1.35;border:1px solid #777;padding:2.5mm;margin-top:4mm}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:12mm;text-align:center}.sign div{padding-top:13mm;border-bottom:1px solid #111;padding-bottom:2mm}.sign b{display:block;margin-top:2mm}.foot{text-align:center;font-size:8px;margin-top:4mm;color:#444}@media print{.sheet{break-inside:avoid}}</style></head><body><div class="sheet"><div class="head"><div class="logo">KY ERP</div><h1>${form.documentTitle}</h1><div class="doc">Form No: ${form.documentNo || "........"}<br>Duzenleme: ${form.documentDate || "........"}</div></div><div class="row"><b>ADI SOYADI</b><span>${form.fullName || "-"}</span></div><div class="row"><b>SGK SICIL / PERSONEL NO</b><span>${form.registryNo || "-"}</span></div><div class="row"><b>DEPARTMANI</b><span>${form.department || "-"}</span></div><div class="row"><b>UNVANI</b><span>${form.jobTitle || "-"}</span></div><div class="row"><b>IZIN SEBEBI</b><span class="reasons"><i>${checked("Yillik")} YILLIK</i><i>${checked("Ucretsiz")} UCRETSIZ</i><i>${checked("Mazeret")} MAZERET</i></span></div><div class="row"><b>IZIN SURESI</b><span>${counted} is gunu</span></div><div class="row"><b>IZNE CIKACAGI TARIH</b><span>${start}</span></div><div class="row"><b>IZIN BITIS TARIHI</b><span>${end}</span></div><div class="row"><b>ISE BASLAYACAGI TARIH</b><span>${returnDate}</span></div><div class="row"><b>DEVREDEN IZIN GUN SAYISI</b><span>${form.carryover} gun</span></div><div class="row"><b>YILLIK IZIN HAKEDIS GUN SAYISI</b><span>${form.entitlement} gun</span></div><div class="row"><b>KULLANIM SONRASI KALAN IZIN</b><span>${form.remaining} gun</span></div><div class="note">NOT: ${form.note}</div><div class="sign"><div>IMZA<b>${form.employeeSignature}</b></div><div>ONAY<b>${form.managerSignature}</b></div><div>ONAY<b>${form.hrSignature}</b></div></div><div class="foot">Bu belge A5 boyutunda, A4 kagidin yarisi olacak sekilde yazdirilmaya uygundur.</div></div></body></html>`;
    try {
      await printHtmlDocument({ title: `Yıllık İzin Formu - ${employee.fullName}`, html });
      setNotice(`${employee.fullName} izin formu yazdırma / PDF ekranına gönderildi.`);
    } catch (error) {
      setNotice(error?.message || "İzin formu açılamadı.");
    }
  };

  return (
    <div className="ik-html">
      {notice && <div className="note">{notice}<button className="btn" onClick={() => setNotice("")}>Kapat</button></div>}
      {page === "ozet" && renderOzet()}
      {page === "personel" && renderPersonel()}
      {page === "hareket" && renderHareket()}
      {page === "izin" && renderIzin()}
      {page === "bordro" && renderBordro()}
      {page === "evrak" && renderEvrak()}
      {renderModal()}
    </div>
  );

  function filters({ third = "Personel ara", fourth = "Durum", fifth = "SGK" } = {}) {
    return (
      <div className="filters">
        <div><label>Yil</label><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{[2025, 2026, 2027, 2028].map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label>Ay</label><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select></div>
        <div><label>{third}</label><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, kod, kart no" /></div>
        <div><label>{fourth}</label><select><option>Tumu</option></select></div>
        <div><label>{fifth}</label><select><option>Tumu</option></select></div>
        <button className="btn" onClick={load}>{busy ? "Yukleniyor" : "Yenile"}</button>
      </div>
    );
  }

  function summaryBox(label, value, tone = "", small = "") {
    return <div className="sum"><div className="t">{label}</div><div className="v" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>{small && <small>{small}</small>}</div>;
  }

  function renderOzet() {
    return (
      <section>
        <div className="page-head"><div><h1>IK Ozet</h1><p>Sadece durum panosu. Giris islemi yok; uyaridan ilgili ekrana gidilir.</p></div><span className={`badge ${balanced ? "green" : "red"}`}>{balanced ? "Toplam odeme dengeli" : "Toplam odeme kontrol"}</span></div>
        {filters({ third: "Personel / uyari ara", fourth: "Durum", fifth: "SGK" })}
        <div className="sumgrid">
          {summaryBox("Aylik personel", summary.count, "", `${employees.filter(isSgk).length} SGK'li / ${employees.filter((item) => item.sgkFollow === false).length} SGK'siz`)}
          {summaryBox("Banka odeme", money(summary.bank))}
          {summaryBox("Elden odeme", money(summary.cash))}
          {summaryBox("Net odeme", money(summary.net), balanced ? "green" : "red")}
          {summaryBox("Avans", money(summary.advance), "orange")}
          {summaryBox("Kesinti", money(summary.deduction), "red")}
          {summaryBox("Yillik izin", summary.annual)}
          {summaryBox("Eksik evrak", summary.docsMissing, "orange")}
        </div>
        <div className="layout2">
          <div className="card"><div className="ch"><div><b>Aylik Personel Durumu</b><span>Islem yapilmaz; sadece kontrol listesi.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>SGK</th><th>Odeme</th><th>Net</th><th>Durum</th></tr></thead><tbody>{payrollRows.map((row) => <tr key={row.employee.id}><td><span className="person">{row.employee.fullName}</span><span className="code">{row.employee.code || "-"}</span></td><td>{sgkLabel(row.employee)}</td><td>{paymentLabel(row.employee)}</td><td className="money">{money(row.net)}</td><td><span className={`badge ${row.diff === 0 ? "green" : "orange"}`}>{row.diff === 0 ? "Dengeli" : "Kontrol"}</span></td></tr>)}<EmptyRow show={!payrollRows.length} colSpan={5} text="Personel yok." /></tbody></table></div></div>
          <div className="card"><div className="ch"><div><b>Acik Isler / Kontrol Uyarilari</b><span>Butonlar ilgili ekrana yonlendirir.</span></div></div><table><tbody><tr><td><span className="badge orange">!</span></td><td><b>Kart eksikleri</b><br /><span>{employees.filter((item) => !item.cardNo).length} personelde kart no eksik</span></td><td><button className="btn" onClick={() => go("personel")}>Git</button></td></tr><tr><td><span className="badge orange">!</span></td><td><b>Evrak eksikleri</b><br /><span>{summary.docsMissing} personelde evrak yok</span></td><td><button className="btn" onClick={() => go("evrak")}>Git</button></td></tr><tr><td><span className={`badge ${balanced ? "green" : "red"}`}>{balanced ? "OK" : "!"}</span></td><td><b>Bordro odeme kontrolu</b><br /><span>{balanced ? "Banka + elden nete esit" : "Toplam odeme eslesmiyor"}</span></td><td><button className="btn" onClick={() => go("bordro")}>Git</button></td></tr></tbody></table></div>
        </div>
        <LogTable title="Son 10 Islem" rows={logs.map(withPerson).slice(0, 10)} onEdit={editFromLog} />
      </section>
    );
  }

  function renderPersonel() {
    return (
      <section>
        <div className="page-head"><div><h1>Personel Karti</h1><p>Sabit bilgi. Avans, mesai, kesinti ve bordro girisi burada yok.</p></div><button className="btn primary" onClick={() => openPerson()}>Yeni / Detay</button></div>
        {filters({ third: "Personel ara", fourth: "SGK", fifth: "Odeme" })}
        <div className="card"><div className="ch"><div><b>Personel Kartlari</b><span>Satirdan Detay / Duzenle / Evrak acilir.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Kod / Kart No</th><th>SGK</th><th>Odeme</th><th>Maas</th><th>Yol</th><th>EK</th><th>Banka Plan</th><th>Elden Plan</th><th>Kalan Izin</th><th>Evrak</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{filteredEmployees.map((employee) => {
          const leave = employeeLeave(employee);
          const docCount = docsFor(employee).length;
          return <tr key={employee.id} onClick={() => setSelectedId(employee.id)}><td><span className="person">{employee.fullName}</span><span className="code">{employee.department || "-"}</span></td><td>{employee.code || "-"} / {employee.cardNo || "-"}</td><td>{sgkLabel(employee)}</td><td>{paymentLabel(employee)}</td><td className="money">{money(employee.salary)}</td><td className="money">{money(employee.roadAllowance)}</td><td className="money">{money(employee.extraPaymentAmount)}</td><td className="money">{money(employee.bankAmount)}</td><td className="money">{money(employee.cashAmount)}</td><td><span className={`badge ${leave.balance < 0 ? "red" : "green"}`}>{leave.balance}</span></td><td><span className={`badge ${docCount ? "green" : "orange"}`}>{docCount ? "Var" : "Eksik"}</span></td><td><span className="badge green">{employee.status || "Aktif"}</span></td><td><button className="btn" onClick={(event) => { event.stopPropagation(); openPerson(employee); }}>Detay</button> <button className="btn" onClick={(event) => { event.stopPropagation(); openPerson(employee); }}>Duzenle</button> <button className="btn" onClick={(event) => { event.stopPropagation(); openDocument(employee); }}>Evrak</button></td></tr>;
        })}<EmptyRow show={!filteredEmployees.length} colSpan={13} text="Personel bulunamadi." /></tbody></table></div></div>
        <LogTable title="Personel Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderHareket() {
    return (
      <section>
        <div className="page-head"><div><h1>Mesai - Avans - Kesinti</h1><p>Tek hareket giris ekrani. Toplu avans sadece burada ve sihirbaz pencerede yapilir.</p></div></div>
        {filters({ third: "Personel ara", fourth: "Tip", fifth: "Bordro etkisi" })}
        <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openFinance("Mesai")}>Mesai Ekle</button><button className="btn orange" onClick={() => openFinance("Avans")}>Avans Ekle</button><button className="btn green" onClick={() => openFinance("Toplu avans")}>Toplu Avans</button><button className="btn red" onClick={() => openFinance("Ozel kesinti")}>Kesinti Ekle</button></div><button className="btn" onClick={() => exportRowsToExcelFile(`ik-hareket-${period}.xlsx`, movements)}>Excel Indir</button></div>
        <div className="sumgrid short">{summaryBox("Personel", employees.length)}{summaryBox("Mesai toplamı", money(summary.overtime))}{summaryBox("Avans toplamı", money(summary.advance), "orange")}{summaryBox("Özel kesinti", money(summary.deduction), "red")}{summaryBox("İcra / Haciz", money(summary.garnishment), summary.garnishment ? "orange" : "")}</div>
        <div className="card"><div className="ch"><div><b>Hareketler</b><span>Bordro sonucu gosterilmez; sadece hareket kaydi.</span></div></div><div className="tw"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Tip</th><th>Saat/Gun</th><th>Tutar</th><th>Odeme Sekli</th><th>Bordro Etkisi</th><th>Aciklama</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{movements.map((item) => {
          const employee = employees.find((row) => row.id === item.employeeId);
          return <tr key={item.id || `${item.employeeId}-${item.date}-${item.type}`}><td>{item.date || item.adjustmentDate || "-"}</td><td><span className="person">{employee?.fullName || item.fullName || "-"}</span><span className="code">{employee?.code || "-"}</span></td><td>{item.type}</td><td>{item.hourOrDay || item.quantity || "-"}</td><td className="money">{money(item.amount)}</td><td>{item.paymentMethod || "-"}</td><td>{item.payrollEffect || "Bordroya yansir"}</td><td>{item.note || item.description || "-"}</td><td><span className="badge green">Kayitli</span></td><td><button className="btn" onClick={() => setNotice(item.note || "Hareket detayi acildi.")}>Detay</button> <button className="btn" onClick={() => openFinance(item.type, item)}>Duzenle</button> <button className="btn red" onClick={() => deleteFinance(item)}>Sil</button></td></tr>;
        })}<EmptyRow show={!movements.length} colSpan={10} text="Bu ay hareket kaydi yok." /></tbody></table></div></div>
        <LogTable title="Hareket Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderIzin() {
    const otherLeaves = leaves.filter((item) => !upper(item.recordType || item.type).includes("YILLIK"));
    const dailyRecords = safeList(data.attendance).filter((item) => !["G", "W", "X"].includes(upper(item.status)));
    const plans = safeList(leaveCenter.plans).filter((item) => item.status !== "CANCELLED");
    const today = new Date().toISOString().slice(0, 10);
    const currentPlans = plans.filter((item) => item.startDate <= today && item.endDate >= today);
    const upcomingPlans = plans.filter((item) => item.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const yearPlans = plans.filter((item) => item.startDate?.startsWith(String(year)) || item.endDate?.startsWith(String(year)));
    const statusLabel = (value) => value === "PLANNED" ? "Planlandi" : value === "APPROVED" ? "Onaylandi" : value === "TAKEN" ? "Kullanildi" : "Iptal";
    return (
      <section>
        <div className="page-head"><div><h1>Izin ve Resmi Devam Kayitlari</h1><p>Yillik izin resmi sicili ile rapor, mazeret ve diger gunluk durumlar birbirinden ayridir.</p></div></div>
        {filters({ third: "Personel ara", fourth: "Durum turu", fifth: "Gosterim" })}
        <div className="ik-section-tabs leave-main-tabs"><button className={leaveView === "annual" && annualView === "control" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("control"); }}>Genel Bakis</button><button className={leaveView === "annual" && annualView === "calendar" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("calendar"); }}>Yillik Izin</button><button className={leaveView === "other" ? "active" : ""} onClick={() => setLeaveView("other")}>Rapor / Diger Izin</button><button className={leaveView === "annual" && annualView === "registry" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("registry"); }}>Izin Sicili</button><button className={leaveView === "annual" && annualView === "policy" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("policy"); }}>Ayarlar</button></div>
        {leaveView === "annual" ? <>
          <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openLeave("yillik")}>Yeni Izin / Plan</button><button className="btn green" onClick={() => setModal("izinFis")}>A5 Resmi Izin Formu</button></div><button className="btn" onClick={() => exportRowsToExcelFile(`yillik-izin-sicili-${year}.xlsx`, plans.map((item) => ({ personel: item.fullName, bolum: item.department, izinTuru: item.recordType, baslangic: item.startDate, bitis: item.endDate, iseDonus: item.returnDate, sayilanGun: item.countedDays, durum: statusLabel(item.status) })))}>Izin Plani Excel</button></div>

          {annualView === "control" && <>
            <div className="sumgrid short">{summaryBox("Bugun izinde", currentPlans.length, currentPlans.length ? "orange" : "green")}{summaryBox("Yaklasan plan", upcomingPlans.length)}{summaryBox("Yillik izin kaydi", yearPlans.length)}{summaryBox("Cakisma uyarisi", safeList(leaveCenter.conflicts).length, safeList(leaveCenter.conflicts).length ? "red" : "green")}{summaryBox("Bakiye asimi", employees.filter((item) => employeeLeave(item).balance < 0).length, "red")}{summaryBox("Sayim duzeni", `${safeList(leaveCenter.policy?.countedWeekdays).length} gun/hafta`)}</div>
            <div className="leave-control-grid"><div className="card"><div className="ch"><div><b>Bugun Izinde Olanlar</b><span>Aktif izinler ve ise donus tarihleri.</span></div></div><div className="leave-card-list">{currentPlans.map((item) => <div className="leave-person-card" key={item.id}><div><b>{item.fullName}</b><span>{item.department || "Bolum belirtilmemis"}</span></div><div><strong>{item.startDate} - {item.endDate}</strong><span>Ise donus: {item.returnDate}</span></div><span className="badge orange">{statusLabel(item.status)}</span></div>)}{!currentPlans.length && <div className="empty-panel">Bugun izinli personel yok.</div>}</div></div><div className="card"><div className="ch"><div><b>Yaklasan Izinler</b><span>En yakin planlar; duzenleme ve form cikisi hazir.</span></div></div><div className="leave-card-list">{upcomingPlans.slice(0, 8).map((item) => <div className="leave-person-card" key={item.id}><div><b>{item.fullName}</b><span>{item.department || "-"}</span></div><div><strong>{item.startDate}</strong><span>{item.countedDays} gun / Donus {item.returnDate}</span></div><div className="row-actions"><button className="btn" onClick={() => editLeavePlan(item)}>Duzenle</button><button className="btn" onClick={() => printLeaveForm(employees.find((employee) => employee.id === item.employeeId), item)}>Form</button></div></div>)}{!upcomingPlans.length && <div className="empty-panel">Yaklasan izin plani yok.</div>}</div></div></div>
            <div className="card"><div className="ch"><div><b>Cakisma ve Onay Kontrolu</b><span>Ayni personel cakismasi engellenir; ayni bolum cakismasi yetkili onayi ister.</span></div></div><div className="tw"><table><thead><tr><th>Seviye</th><th>Personeller</th><th>Bolum</th><th>Cakisan Tarih</th><th>Aciklama</th></tr></thead><tbody>{safeList(leaveCenter.conflicts).map((item) => <tr key={item.id}><td><span className={`badge ${item.severity === "CRITICAL" ? "red" : "orange"}`}>{item.severity === "CRITICAL" ? "Kritik" : "Uyari"}</span></td><td>{safeList(item.people).join(" / ")}</td><td>{item.department || "-"}</td><td>{item.startDate} - {item.endDate}</td><td>{item.message}</td></tr>)}<EmptyRow show={!safeList(leaveCenter.conflicts).length} colSpan={5} text="Cakisan izin kaydi yok." /></tbody></table></div></div>
          </>}
          {annualView === "calendar" && <div className="card"><div className="ch"><div><b>{year} Yillik Izin Plani</b><span>Gecmis, mevcut ve ileri tarihli izinler tek zaman cizelgesinde.</span></div></div><div className="leave-year-board">{MONTHS.map((name, index) => { const prefix = `${year}-${String(index + 1).padStart(2, "0")}`; const rows = yearPlans.filter((item) => item.startDate?.startsWith(prefix) || (item.startDate < `${prefix}-31` && item.endDate >= `${prefix}-01`)); return <div className="leave-month" key={name}><h3>{name}<span>{rows.length}</span></h3>{rows.map((item) => <button key={item.id} onClick={() => editLeavePlan(item)}><b>{item.fullName}</b><span>{item.startDate.slice(8)} - {item.endDate.slice(8)} / {item.countedDays} gun</span><small>{item.department || "-"} - {statusLabel(item.status)}</small></button>)}{!rows.length && <em>Plan yok</em>}</div>; })}</div></div>}
          {annualView === "registry" && <><div className="card"><div className="ch"><div><b>Yillik Izin Plan ve Kullanim Kayitlari</b><span>Geriye donuk kayit, ileri plan, duzenleme, iptal ve A5 form islemleri.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Bolum</th><th>Tur</th><th>Izne Cikis</th><th>Son Izin Gunu</th><th>Ise Donus</th><th>Sayilan</th><th>Haric</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{safeList(leaveCenter.plans).map((item) => <tr key={item.id}><td><span className="person">{item.fullName}</span><span className="code">{item.code || "-"}</span></td><td>{item.department || "-"}</td><td>{item.recordType}</td><td>{item.startDate}</td><td>{item.endDate}</td><td>{item.returnDate}</td><td><b>{item.countedDays} gun</b></td><td>{safeList(item.excludedDates).length}</td><td><span className={`badge ${item.status === "CANCELLED" ? "red" : item.status === "PLANNED" ? "blue" : "green"}`}>{item.legacy ? "Eski resmi kayit" : statusLabel(item.status)}</span></td><td><button className="btn" disabled={item.status === "CANCELLED" || item.legacy} title={item.legacy ? "Eski kayit yeni plan ekranindan degistirilemez" : ""} onClick={() => editLeavePlan(item)}>Duzenle</button> <button className="btn" onClick={() => printLeaveForm(employees.find((employee) => employee.id === item.employeeId), item)}>Form</button> <button className="btn red" disabled={item.status === "CANCELLED" || item.legacy} onClick={() => cancelLeave(item)}>Iptal</button></td></tr>)}<EmptyRow show={!safeList(leaveCenter.plans).length} colSpan={10} text="Izin plan kaydi yok." /></tbody></table></div></div><div className="card"><div className="ch"><div><b>Personel Izin Bakiyeleri</b><span>Hak edis, devir, resmi kullanim ve kalan bakiye.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Ise Giris</th><th>Hak Edilen</th><th>Devir</th><th>Kullanilan</th><th>Kalan</th><th>Islem</th></tr></thead><tbody>{filteredEmployees.map((employee) => { const leave = employeeLeave(employee); return <tr key={employee.id}><td>{employee.fullName}</td><td>{employee.hireDate || "-"}</td><td>{num(employee.annualLeaveEntitlement)}</td><td>{num(employee.annualLeaveCarryover)}</td><td>{leave.annual}</td><td><span className={`badge ${leave.balance < 0 ? "red" : "green"}`}>{leave.balance}</span></td><td><button className="btn" onClick={() => openLeave("yillik", "", employee)}>Izin Gir</button> <button className="btn" onClick={() => { setSelectedId(employee.id); setModal("izinFis"); }}>Form</button></td></tr>; })}</tbody></table></div></div></>}
          {annualView === "policy" && <div className="card leave-policy-card"><div className="ch"><div><b>Sirket Yillik Izin Gun Sayim Duzeni</b><span>Kod degisikligi olmadan haftalik sayilan gunleri ve resmi tatil kuralini yonetin.</span></div></div><div className="leave-policy-grid"><div><h3>Haftalik Sayilan Gunler</h3><p>Izin araliginda isaretli gunler yillik izin bakiyesinden duser.</p><div className="weekday-picker">{["Pazar", "Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi"].map((name, day) => <label className={safeList(policyDraft.countedWeekdays).includes(day) ? "checked" : ""} key={name}><input type="checkbox" checked={safeList(policyDraft.countedWeekdays).includes(day)} onChange={(event) => setPolicyDraft((old) => ({ ...old, countedWeekdays: event.target.checked ? [...new Set([...safeList(old.countedWeekdays), day])].sort() : safeList(old.countedWeekdays).filter((value) => value !== day) }))} /><b>{name}</b><span>{safeList(policyDraft.countedWeekdays).includes(day) ? "Izinden sayilir" : "Sayilmaz"}</span></label>)}</div></div><div className="policy-side"><Field label="Resmi tatiller"><select value={policyDraft.excludeOfficialHolidays === false ? "COUNT" : "EXCLUDE"} onChange={(event) => setPolicyDraft((old) => ({ ...old, excludeOfficialHolidays: event.target.value === "EXCLUDE" }))}><option value="EXCLUDE">Izinden sayma</option><option value="COUNT">Izinden say</option></select></Field><Field label="Bolumde ayni anda izinli personel siniri"><input type="number" min="1" value={policyDraft.maxConcurrentDepartment || 1} onChange={(event) => setPolicyDraft((old) => ({ ...old, maxConcurrentDepartment: Number(event.target.value) }))} /></Field><div className="warnline ok">Varsayilan duzen: Pazartesi-Cumartesi 6 gun sayilir; Pazar ve resmi tatiller sayilmaz.</div><button className="btn primary" disabled={busy} onClick={saveLeavePolicy}>Ayarlari Kaydet</button></div></div></div>}
        </> : <>
          <div className="workbar"><div className="group"><button className="btn red" onClick={() => openLeave("gunluk", "Rapor")}>Rapor Kaydi</button><button className="btn orange" onClick={() => openLeave("gunluk")}>Mazeret / Gunluk Durum</button><button className="btn" onClick={() => openLeave("gunluk", "Istisna")}>Istisna</button></div></div>
          <div className="sumgrid short">{summaryBox("Rapor", otherLeaves.filter((item)=>upper(item.recordType).includes("RAPOR")).length, "orange")}{summaryBox("Ucretsiz izin", otherLeaves.filter((item)=>upper(item.recordType).includes("UCRETSIZ")).length)}{summaryBox("Mazeret", otherLeaves.filter((item)=>upper(item.recordType).includes("MAZERET")).length)}{summaryBox("Gunluk durum", dailyRecords.length)}{summaryBox("Belgesiz rapor", otherLeaves.filter((item)=>upper(item.recordType).includes("RAPOR")&&!item.documentPath).length, "red")}{summaryBox("Toplam kayit", otherLeaves.length+dailyRecords.length)}</div>
          <div className="card"><div className="ch"><div><b>Rapor, Mazeret ve Diger Izin Kayitlari</b><span>Yillik izin bakiyesinden ayri resmi devam kayitlari.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Tur / Durum</th><th>Baslangic</th><th>Bitis</th><th>Gun</th><th>Ucret Etkisi</th><th>Belge</th><th>Not</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{otherLeaves.map((item) => { const employee=employees.find((row)=>row.id===item.employeeId); return <tr key={item.id}><td>{employee?.fullName || "-"}</td><td>{item.recordType || "-"}</td><td>{item.startDate || "-"}</td><td>{item.endDate || "-"}</td><td>{item.dayCount || 0}</td><td>{item.effectType || "-"}</td><td><span className={`badge ${item.documentPath ? "green" : "orange"}`}>{item.documentPath ? "Var" : "Eksik"}</span></td><td>{item.note || "-"}</td><td><span className="badge green">Kayitli</span></td><td><button className="btn" onClick={() => openLeave("gunluk", item.recordType, employee)}>Duzenle</button></td></tr>; })}<EmptyRow show={!otherLeaves.length} colSpan={10} text="Bu donemde diger izin / rapor kaydi yok." /></tbody></table></div></div>
        </>}
        <LogTable title="Izin ve Gunluk Durum Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderBordro() {
    return (
      <section>
        <div className="page-head"><div><h1>Son Bordro ve Odeme Merkezi</h1><p>Resmi bordro, puantaj, avans/kesinti ve banka odemesi cikti oncesi burada son kez duzenlenir.</p></div><span className={`badge ${balanced ? "green" : "red"}`}>{balanced ? "Odeme dengeli" : "Odeme kontrol gerekli"}</span></div>
        {filters({ third: "Personel ara", fourth: "Odeme", fifth: "Durum" })}
        <div className="sumgrid short">{summaryBox("Odeme listesi", payrollRows.length, "", `${selectedPayrollIds.length || payrollRows.length} secili`)}{summaryBox("Resmi bordro neti", money(employees.reduce((sum,item)=>sum+num(item.sgkNet),0)))}{summaryBox("Banka", money(summary.bank))}{summaryBox("Elden", money(summary.cash))}{summaryBox("Avans / Kesinti", `${money(summary.advance)} / ${money(summary.deduction)}`, "orange")}{summaryBox("EK / İcra-Haciz", `${money(summary.extra)} / ${money(summary.garnishment)}`, summary.garnishment ? "orange" : "")}{summaryBox("Net Toplam", money(summary.net), balanced ? "green" : "red")}</div>
        <div className="workbar"><div className="group"><button className="btn primary" onClick={refreshPayroll}>Yeniden Hesapla</button><button className="btn" onClick={savePayroll}>Secilileri Kaydet</button><button className="btn green" onClick={openBulkPayment}>Odeme Merkezi</button><button className="btn" onClick={() => openPayroll()}>Seciliyi Duzenle</button><button className="btn" onClick={printPayrollReport}>Toplu Rapor / PDF</button><button className="btn" onClick={printPaymentSlips}>Toplu Fiş / PDF</button><button className="btn" onClick={() => setModal("fis")}>Tek Kisi Fisi</button></div><button className="btn green" onClick={exportPayroll}>Tum Bordro Excel</button></div>
        <div className={`warnline ${balanced ? "ok" : "warn"}`}>{balanced ? "Toplam odeme dengeli: Banka + Elden = Net Toplam." : "Toplam odeme banka + elden ile eslesmiyor."}</div>
        <div className="card">
          <div className="ch"><div><b>Cikti Oncesi Son Bordro</b><span>Resmi Net bordro dosyasindan gelir; Banka + Elden = sirket net odemesi olmalidir.</span></div></div>
          <div className="tw"><table><thead><tr><th><input type="checkbox" checked={payrollRows.length>0&&selectedPayrollIds.length===payrollRows.length} onChange={(event)=>setSelectedPayrollIds(event.target.checked?payrollRows.map((row)=>row.employee.id):[])} /></th><th>Personel</th><th>SGK Gun</th><th>Resmi Net</th><th>Maas</th><th>Yol</th><th>EK</th><th>Mesai</th><th>Avans</th><th>Kesinti</th><th>İcra/Haciz</th><th>Hak Edis</th><th>Net Odenecek</th><th>Banka</th><th>Elden</th><th>Kaynak</th><th>Durum</th><th>Islem</th></tr></thead><tbody>
            {payrollRows.map((row) => <tr key={row.employee.id}><td><input type="checkbox" checked={selectedPayrollIds.includes(row.employee.id)} onChange={(event)=>setSelectedPayrollIds((old)=>event.target.checked?[...new Set([...old,row.employee.id])]:old.filter((id)=>id!==row.employee.id))} /></td><td><span className="person">{row.employee.fullName}</span><span className="code">{row.employee.code || "-"}</span></td><td>{num(row.employee.sgkDays)||"-"}</td><td className="money">{num(row.employee.sgkNet)>0?money(row.employee.sgkNet):"-"}</td><td className="money">{money(row.salary)}</td><td className="money">{money(row.road)}</td><td className="money">{money(row.extra)}</td><td className="money">{money(row.overtime)}</td><td className="money">{money(row.advance)}</td><td className="money">{money(row.deduction)}</td><td className="money">{money(row.garnishment)}</td><td className="money">{money(row.hakedis)}</td><td className="money">{money(row.net)}</td><td className="money">{money(row.bank)}</td><td className="money">{money(row.cash)}</td><td><span className={`badge ${num(row.employee.sgkNet)>0?"blue":"orange"}`}>{num(row.employee.sgkNet)>0?"Bordro":"Plan"}</span></td><td><span className={`badge ${row.diff===0?"green":"red"}`}>{row.diff===0?"Hazir":"Kontrol"}</span></td><td><button className="btn" onClick={()=>openPayroll(row)}>Ödeme Dağılımı</button> <button className="btn" onClick={()=>{setSelectedId(row.employee.id);setModal("fis");}}>Fis</button></td></tr>)}
            <EmptyRow show={!payrollRows.length} colSpan={18} text="Bordro icin personel bulunamadi." />
          </tbody></table></div>
        </div>
        <LogTable title="Bordro Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderEvrak() {
    return (
      <section>
        <div className="page-head"><div><h1>SGK Bordro - Evrak - Ay Sonu</h1><p>Muhasebeden gelen XLS/XLSX bordrolari sirket personeliyle eslestirilir; harici kisiler odeme ve puantaja alinmaz.</p></div><span className={`badge ${data.sgkImport ? "green" : "orange"}`}>{data.sgkImport ? `Bordro v${data.sgkImport.versionNo}` : "Bordro bekleniyor"}</span></div>
        {filters({ third: "Personel ara", fourth: "Evrak", fifth: "SGK" })}
        <div className="workbar"><div className="group"><input ref={payrollInput} type="file" accept=".xls,.xlsx" multiple hidden onChange={(event)=>previewPayrollFiles(event.target.files)} /><button className="btn primary" onClick={() => payrollInput.current?.click()}>Bordro XLS Dosyalari Yukle</button><button className="btn" onClick={() => openDocument()}>Evrak Yukle</button><button className="btn" onClick={() => setModal("izinFis")}>Izin Formu</button><button className="btn" onClick={() => setModal("kidemCikti")}>Kidem Ciktisi</button><button className="btn" onClick={saveSettlementDraft}>Kidem / Ayrilis Taslagi</button><button className="btn orange" onClick={runClose}>Ay Sonu Kontrol</button></div></div>
        <div className="sumgrid short">{summaryBox("Bordro satiri", safeList(data.sgkRows).length)}{summaryBox("Eslesen personel", safeList(data.sgkRows).filter((row)=>row.employeeId).length,"green")}{summaryBox("SGK gun",safeList(data.sgkRows).reduce((sum,row)=>sum+num(row.sgkDays),0))}{summaryBox("Resmi net",money(safeList(data.sgkRows).reduce((sum,row)=>sum+num(row.net),0)))}{summaryBox("Yeni giris",safeList(data.sgkRows).filter((row)=>row.hireDate?.startsWith(period)).length,"orange")}{summaryBox("Cikis",safeList(data.sgkRows).filter((row)=>row.exitDate?.startsWith(period)).length,"red")}</div>
        <div className="card sgk-payroll-card"><div className="ch"><div><b>Onayli Resmi Bordro Verisi</b><span>Net Istihkak banka listesine, SGK gun puantaj kontrolune aktarilir.</span></div><button className="btn" onClick={()=>go("bordro")}>Son Bordroya Git</button></div><div className="tw"><table><thead><tr><th>Personel</th><th>TC</th><th>Giris</th><th>Cikis</th><th>SGK Gun</th><th>Normal Kazanc</th><th>Toplam Kazanc</th><th>SGK Matrah</th><th>SGK Primi</th><th>Vergi</th><th>Net Istihkak</th><th>Kaynak</th></tr></thead><tbody>{safeList(data.sgkRows).map((row)=><tr key={row.id}><td>{row.fullName}</td><td>{row.identityNo||"-"}</td><td>{row.hireDate||"-"}</td><td>{row.exitDate||"-"}</td><td>{row.sgkDays}</td><td className="money">{money(row.normalEarning)}</td><td className="money">{money(row.gross)}</td><td className="money">{money(row.sgkBase)}</td><td className="money">{money(row.sgkPremium)}</td><td className="money">{money(num(row.incomeTax)+num(row.stampTax))}</td><td className="money">{money(row.net)}</td><td>{row.source?.sourceFile||data.sgkImport?.fileName||"-"}</td></tr>)}<EmptyRow show={!safeList(data.sgkRows).length} colSpan={12} text="Bu donem icin onayli bordro yok. Bir veya birden cok XLS dosyasi yukleyin." /></tbody></table></div></div>
        <div className="layout2"><div className="card"><div className="ch"><div><b>Evrak / Belge Baglantilari</b><span>Yuklenen belgeler burada listelenir.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Belge Turu</th><th>Dosya</th><th>Tarih</th><th>Not</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{documents.map((doc) => <tr key={doc.id}><td>{employees.find((item) => item.id === doc.employeeId)?.fullName || "-"}</td><td>{doc.documentType || "-"}</td><td>{doc.fileName || "-"}</td><td>{doc.date || doc.createdAt || "-"}</td><td>{doc.note || doc.storagePath || "-"}</td><td><span className="badge green">{doc.status || "Kayitli"}</span></td><td><button className="btn" onClick={() => setNotice("Evrak detayi acildi.")}>Detay</button></td></tr>)}<EmptyRow show={!documents.length} colSpan={7} text="Kayitli evrak yok." /></tbody></table></div></div><div className="card"><div className="ch"><div><b>Eksik Evrak Kontrolu</b><span>Bordro loglari burada gorunmez.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Eksik Belge</th><th>Tarih</th><th>Not</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{employees.filter((employee) => !docsFor(employee).length).map((employee) => <tr key={employee.id}><td>{employee.fullName}</td><td>Personel evragi</td><td>{period}</td><td>Evrak baglantisi yok</td><td><span className="badge orange">Eksik</span></td><td><button className="btn" onClick={() => openDocument(employee)}>Yukle</button></td></tr>)}<EmptyRow show={employees.every((employee) => docsFor(employee).length)} colSpan={6} text="Eksik evrak gorunmuyor." /></tbody></table></div></div></div>
        {!!checks.length && <div className="card"><div className="ch"><div><b>Ay Sonu Kontrol Maddeleri</b><span>Kontrol sonucu.</span></div></div><div className="tw"><table><thead><tr><th>Kontrol maddesi</th><th>Durum</th><th>Aciklama</th><th>Islem</th></tr></thead><tbody>{checks.map((item, index) => <tr key={index}><td>{item.title || item.type}</td><td><span className={`badge ${item.ok ? "green" : "orange"}`}>{item.ok ? "Tamam" : "Duzelt"}</span></td><td>{item.detail || "-"}</td><td>{item.ok ? "-" : <button className="btn" onClick={() => go("personel")}>Ac</button>}</td></tr>)}</tbody></table></div></div>}
        <LogTable title="SGK / Evrak Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function withPerson(log) {
    return { ...log, personName: employees.find((item) => item.id === log.employeeId)?.fullName || log.fullName || "-" };
  }

  function renderModal() {
    if (!modal) return null;
    if (modal === "personel") return (
      <Modal title="Personel Kartı ve Ödeme Ayarları" sub="Kimlik, çalışma, SGK, ücret, banka ve izin bilgilerini tek ekrandan yönetin" size="medium" onClose={() => setModal(null)}>
        <div className="modal-section-grid">
          <div className="modal-section"><h3>Kimlik ve Çalışma Bilgileri</h3><div className="form"><Field label="Ad Soyad" half><input value={modalDraft.fullName||""} onChange={(event)=>setModalDraft((old)=>({...old,fullName:event.target.value}))}/></Field><Field label="TC Kimlik No"><input value={modalDraft.identityNo||""} maxLength={11} onChange={(event)=>setModalDraft((old)=>({...old,identityNo:event.target.value.replace(/\D/g,"")}))}/></Field><Field label="Personel Kodu"><input value={modalDraft.code||""} onChange={(event)=>setModalDraft((old)=>({...old,code:event.target.value}))}/></Field><Field label="Kart No"><input value={modalDraft.cardNo||""} onChange={(event)=>setModalDraft((old)=>({...old,cardNo:event.target.value}))}/></Field><Field label="İşe Giriş"><input type="date" value={modalDraft.startDate||""} onChange={(event)=>setModalDraft((old)=>({...old,startDate:event.target.value}))}/></Field><Field label="Görev"><input value={modalDraft.title||""} onChange={(event)=>setModalDraft((old)=>({...old,title:event.target.value}))}/></Field><Field label="Bölüm"><input value={modalDraft.department||""} onChange={(event)=>setModalDraft((old)=>({...old,department:event.target.value}))}/></Field><Field label="Durum"><select value={modalDraft.status||"AKTIF"} onChange={(event)=>setModalDraft((old)=>({...old,status:event.target.value}))}><option value="AKTIF">Aktif</option><option value="PASIF">Pasif</option></select></Field></div></div>
          <div className="modal-section"><h3>SGK ve Bordro Kapsamı</h3><div className="form"><Field label="SGK Durumu" half><select value={modalDraft.sgkFollow||"BELIRTILMEMIS"} onChange={(event)=>setModalDraft((old)=>({...old,sgkFollow:event.target.value}))}><option value="SGKLI">SGK'lı</option><option value="SGKSIZ">SGK'sız</option><option value="BELIRTILMEMIS">Belirtilmemiş</option></select></Field><Field label="Bordro Kapsamı" half><select value={modalDraft.payrollIncluded===false?"HARIC":"DAHIL"} onChange={(event)=>setModalDraft((old)=>({...old,payrollIncluded:event.target.value==="DAHIL"}))}><option value="DAHIL">Şirket bordrosuna dahil</option><option value="HARIC">Harici - ödeme ve puantaja alma</option></select></Field><Field label="Yıllık İzin Hakkı"><input type="number" value={modalDraft.annualLeaveEntitlement||""} onChange={(event)=>setModalDraft((old)=>({...old,annualLeaveEntitlement:event.target.value}))}/></Field><Field label="Devreden İzin"><input type="number" value={modalDraft.annualLeaveCarryover||""} onChange={(event)=>setModalDraft((old)=>({...old,annualLeaveCarryover:event.target.value}))}/></Field></div></div>
          <div className="modal-section"><h3>Ücret ve Ödeme Planı</h3><div className="form"><Field label="Gerçek Maaş"><input type="number" value={modalDraft.salary||""} onChange={(event)=>setModalDraft((old)=>({...old,salary:event.target.value}))}/></Field><Field label="Baz Personel"><select value={modalDraft.baseEmployeeId||""} onChange={(event)=>setModalDraft((old)=>({...old,baseEmployeeId:event.target.value}))}><option value="">Yok - gerçek maaşı kullan</option>{employees.filter((item)=>item.id!==modalDraft.id).map((item)=><option key={item.id} value={item.id}>{item.fullName} - {money(item.salary)}</option>)}</select></Field><Field label="Bordro Baz Maaşı"><input value={money(modalDraft.baseEmployeeId?employees.find((item)=>item.id===modalDraft.baseEmployeeId)?.salary:modalDraft.salary)} readOnly/></Field><Field label="EK"><input value={money(modalDraft.baseEmployeeId?Math.max(num(modalDraft.salary)-num(employees.find((item)=>item.id===modalDraft.baseEmployeeId)?.salary),0):0)} readOnly/></Field><Field label="Yol Yardımı"><input type="number" value={modalDraft.roadAllowance||""} onChange={(event)=>setModalDraft((old)=>({...old,roadAllowance:event.target.value}))}/></Field><Field label="Ödeme Tipi"><select value={modalDraft.paymentType||"BANKA_ELDEN"} onChange={(event)=>setModalDraft((old)=>({...old,paymentType:event.target.value}))}><option value="BANKA_ELDEN">Banka + Elden</option><option value="Banka">Sadece Banka</option><option value="Elden">Sadece Elden</option></select></Field><Field label="Banka Planı"><input type="number" value={modalDraft.bankAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,bankAmount:event.target.value}))}/></Field><Field label="Elden Planı"><input type="number" value={modalDraft.cashAmount||""} onChange={(event)=>setModalDraft((old)=>({...old,cashAmount:event.target.value}))}/></Field><Field label="Resmi Bordro Net"><input value={money(selected?.sgkNet)} readOnly/></Field><Field label="Not" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))}/></Field></div></div>
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={savePerson}>{busy?"Kaydediliyor":"Tüm Değişiklikleri Kaydet"}</button>} />
      </Modal>
    );

    if (["mesai", "avans", "kesinti"].includes(modal)) {
      const type = modal === "avans" ? "Avans" : modal === "kesinti" ? (modalDraft.adjustmentType || "Ozel kesinti") : "Mesai";
      return <Modal title={modal === "avans" ? "Avans Girisi" : modal === "kesinti" ? "Kesinti Girisi" : "Mesai Girisi"} sub="Hizli hareket kaydi" onClose={() => setModal(null)}>{financeForm(type)}<ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={saveFinance}>Kaydet</button>} /></Modal>;
    }

    if (modal === "topluAvans") return (
      <Modal title="Toplu Avans Sihirbazi" sub="1) Personel sec  2) Tutar gir  3) Onizle ve kaydet" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid">
          <div className="steps"><div className="step active"><div className="num">1</div><div><b>Personel Sec</b><span>Grup veya tek tek secim</span></div></div><div className="step"><div className="num">2</div><div><b>Tutar ve Tarih</b><span>Kisi basi avans</span></div></div><div className="step"><div className="num">3</div><div><b>Onay</b><span>Toplam kontrol</span></div></div><div className="mini-summary"><div className="mini"><span>Secili</span><b>{safeList(modalDraft.employeeIds).length}</b></div><div className="mini"><span>Kisi basi</span><b>{money(modalDraft.amount)}</b></div><div className="mini"><span>Toplam</span><b>{money(safeList(modalDraft.employeeIds).length * num(modalDraft.amount))}</b></div></div></div>
          <div><label>Grup secimi</label><select onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: groupEmployeeIds(event.target.value) }))}><option value="selected">Secili personel</option><option value="all">Tum personel</option><option value="sgk">SGK'lilar</option><option value="nonsgk">SGK'sizlar</option><option value="cash">Elden alanlar</option><option value="bank">Banka alanlar</option></select><br /><br /><div className="selectlist">{filteredEmployees.map((employee) => <label className="selrow" key={employee.id}><input type="checkbox" checked={safeList(modalDraft.employeeIds).includes(employee.id)} onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: event.target.checked ? [...new Set([...safeList(old.employeeIds), employee.id])] : safeList(old.employeeIds).filter((id) => id !== employee.id) }))} /><b>{employee.fullName}<span className="code">{employee.code || "-"}</span></b><span>{sgkLabel(employee)}</span><span>{paymentLabel(employee)}</span></label>)}</div><br />{financeForm("Toplu avans", true)}<div className="warnline warn">Kaydetmeden once ayni gun / ayni tutar tekrar avans kontrolu yapilir.</div></div>
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={saveFinance}>Onayla ve Kaydet</button>} />
      </Modal>
    );

    if (modal === "yillik") {
      const modalEmployee = employees.find((item) => item.id === modalDraft.employeeId);
      const balance = modalEmployee ? employeeLeave(modalEmployee) : { right: 0, annual: 0, balance: 0 };
      const setLeaveValue = (key, value) => { setModalDraft((old) => ({ ...old, [key]: value })); if (key === "startDate" && value) setLeaveCalendarMonth(value.slice(0, 7)); setLeavePreview(null); };
      return <Modal title="Yillik Izin Planlama ve Resmi Kayit" sub="Personeli secin, takvimden tarih araligini tiklayin ve kontrol ederek kaydedin" size="leave-dialog" onClose={() => setModal(null)}>
        <div className="leave-modal-layout">
          <div className="leave-modal-main"><div className="modal-section"><h3>1. Personel ve Izin Turu</h3><div className="form"><Field label="Personel" half><select value={modalDraft.employeeId || ""} onChange={(event) => setLeaveValue("employeeId", event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} - {employee.department || "Bolum yok"}</option>)}</select></Field><Field label="Izin turu" half><select value={modalDraft.leaveType || "Yillik izin"} onChange={(event) => setLeaveValue("leaveType", event.target.value)}>{LEAVE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Kayit durumu"><select value={modalDraft.status || "PLANNED"} onChange={(event) => setLeaveValue("status", event.target.value)}><option value="PLANNED">Planlandi - puantaja yansitma</option><option value="APPROVED">Onaylandi - resmi kayit ve puantaj</option><option value="TAKEN">Kullanildi - geriye donuk kesin kayit</option></select></Field><Field label="Ucret etkisi"><select value={modalDraft.wageEffect || "Ucretli"} onChange={(event) => setModalDraft((old) => ({ ...old, wageEffect: event.target.value }))}><option>Ucretli</option><option>Ucretsiz / kesinti</option><option>Sadece kayit</option></select></Field></div></div>
          <div className="modal-section"><h3>2. Tarih Araligi ve Donus</h3><div className="form"><Field label="Izne cikis tarihi" half><input type="date" value={modalDraft.startDate || ""} onChange={(event) => setLeaveValue("startDate", event.target.value)} /></Field><Field label="Ise donus tarihi" half><input type="date" min={modalDraft.startDate || undefined} value={modalDraft.endDate || ""} onChange={(event) => setLeaveValue("endDate", event.target.value)} /></Field><Field label="Belge / form no" wide><input value={modalDraft.documentNo || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentNo: event.target.value }))} placeholder="Orn. YI-2026-001" /></Field><Field label="Aciklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder="Izin talebi, yonetici onayi veya geriye donuk kayit aciklamasi" /></Field></div></div>
          <div className="warnline ok leave-auto-note">Personel veya tarih degistiginde izin gunu, bakiye ve cakisma kontrolu otomatik yenilenir.</div></div>
          <aside className="leave-preview-panel"><h3>Kontrol Ozeti</h3><div className="leave-balance-strip"><div><span>Hak</span><b>{balance.right}</b></div><div><span>Kullanilan</span><b>{balance.annual}</b></div><div><span>Kalan</span><b>{balance.balance}</b></div></div>{leavePreview ? <><div className="preview-numbers"><div><span>Takvim gunu</span><b>{leavePreview.calendarDays}</b></div><div className="highlight"><span>Izinden sayilan</span><b>{leavePreview.countedDays}</b></div><div><span>Sayilmayan</span><b>{safeList(leavePreview.excludedDates).length}</b></div><div><span>Son izin gunu</span><b>{leavePreview.lastLeaveDate || leavePreview.endDate}</b></div><div className="return"><span>Ise donus</span><b>{leavePreview.returnDate}</b></div><div><span>Yeni bakiye</span><b className={leavePreview.balanceAfter < 0 ? "danger-text" : "success-text"}>{leavePreview.balanceAfter}</b></div></div><div className={`warnline ${leavePreview.hasCriticalConflict ? "danger" : leavePreview.hasDepartmentWarning ? "warn" : "ok"}`}>{leavePreview.hasCriticalConflict ? "Ayni personelde cakisma var; kayit engellendi." : leavePreview.hasDepartmentWarning ? "Ayni bolumde izin cakismasi var; yetkili onayi gerekir." : "Tarih araligi uygun. Kritik cakisma yok."}</div><div className="excluded-list"><b>Sayilmayan gunler</b>{safeList(leavePreview.excludedDates).map((item) => <span key={item.date}>{item.date}<em>{item.reason}</em></span>)}{!safeList(leavePreview.excludedDates).length && <small>Sayilmayan gun yok.</small>}</div><div className="conflict-list">{safeList(leavePreview.conflicts).map((item) => <div key={item.id} className={item.severity === "CRITICAL" ? "critical" : item.severity === "WARNING" ? "warning" : "info"}><b>{item.fullName}</b><span>{item.startDate} - {item.endDate}</span><small>{item.message}</small></div>)}</div></> : <div className="preview-placeholder"><b>Henuz hesaplanmadi</b><p>Pazar, resmi tatil, sirket sayim gunleri, bakiye ve personel cakismalari tek seferde kontrol edilir.</p></div>}</aside>
        </div>
        <LeaveRangeCalendar />
        <ModalFooter onClose={() => setModal(null)} actions={<><button className="btn" onClick={() => modalEmployee && openLeaveForm(modalEmployee, leavePreview ? { ...modalDraft, countedDays: leavePreview.countedDays, returnDate: leavePreview.returnDate, balanceAfter: leavePreview.balanceAfter } : modalDraft)}>Duzenlenebilir A5 Form</button><button className="btn primary" disabled={busy || leavePreview?.hasCriticalConflict} onClick={saveLeave}>{modalDraft.status === "PLANNED" ? "Plani Kaydet" : "Onayla ve Resmi Kaydet"}</button></>} />
      </Modal>;
    }

    if (modal === "gunluk") return (
      <Modal title="Gunluk Durum" sub="Gelmedi, rapor, erken cikma, gec gelme" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid"><DayGrid /><div className="form">{dailyFields()}</div></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={saveLeave}>Kaydet</button>} />
      </Modal>
    );

    if (modal === "bordroDuzelt") {
      const totals = calcRow({ salary: modalDraft.salary, road: modalDraft.road, overtime: modalDraft.overtime, extra: modalDraft.extra, advance: modalDraft.advance, deduction: modalDraft.deduction, garnishment: modalDraft.garnishment, bank: modalDraft.bank, cash: modalDraft.cash });
      const sourceRows = [["Maaş", modalDraft.salary], ["Yol", modalDraft.road], ["EK", modalDraft.extra], ["Mesai", modalDraft.overtime], ["Avans", -num(modalDraft.advance)], ["Özel Kesinti", -num(modalDraft.deduction)], ["İcra / Haciz", -num(modalDraft.garnishment)]];
      return (
        <Modal title="Ödeme Dağılımı Kontrolü" sub="Maaş ve hareket kalemleri kendi ekranlarından gelir; burada yalnız banka / elden dağılımı düzeltilir" onClose={() => setModal(null)}>
          <div className="drawer-grid"><div><div className="card" style={{margin:0}}><div className="ch"><div><b>Kaynak Hesap</b><span>Bu değerler burada değiştirilemez.</span></div></div><div className="tw"><table><tbody>{sourceRows.map(([label,value]) => <tr key={label}><td>{label}</td><td className="money"><b>{money(value)}</b></td></tr>)}</tbody></table></div></div></div><div className="form"><Field label="Bankadan Ödenecek" half><input type="number" min="0" value={modalDraft.bank || ""} onChange={(event) => setModalDraft((old) => ({ ...old, bank: event.target.value }))} /></Field><Field label="Elden Ödenecek" half><input type="number" min="0" value={modalDraft.cash || ""} onChange={(event) => setModalDraft((old) => ({ ...old, cash: event.target.value }))} /></Field><Field label="Düzeltme Açıklaması" wide><textarea value={modalDraft.reason || ""} onChange={(event) => setModalDraft((old) => ({ ...old, reason: event.target.value }))} placeholder="Neden banka / elden dağılımı değiştirildi?" /></Field><div className="wide mini-summary"><div className="mini"><span>Hakediş</span><b>{money(totals.hakedis)}</b></div><div className="mini"><span>Net</span><b>{money(totals.net)}</b></div><div className="mini"><span>Banka + Elden</span><b>{money(totals.paymentTotal)}</b></div></div><div className={`wide warnline ${totals.diff === 0 ? "ok" : "warn"}`}>{totals.diff === 0 ? "Banka + elden net ödeme ile eşleşiyor." : `Dağılım net ödemeyle eşleşmiyor. Fark: ${money(totals.diff)}`}</div></div></div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={savePayrollOverride}>Dağılımı Kaydet</button>} />
        </Modal>
      );
    }

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
        <Modal title={modal === "fis" ? "Tek Kisi Fisi" : "Kidem Ciktisi"} sub="Yazdirmadan once onizleme" size="small" onClose={() => setModal(null)}>
          <div className="print-sheet"><h2>{modal === "fis" ? "ÖDEME FİŞİ" : "KIDEM CIKTISI"}</h2><div className="print-row"><span>Personel</span><b>{row?.employee?.fullName || "-"}</b></div><div className="print-row"><span>Dönem</span><b>{MONTHS[month - 1]} {year}</b></div><div className="print-row"><span>Maaş</span><b>{money(row?.salary)}</b></div>{row?.road>0&&<div className="print-row"><span>Yol</span><b>{money(row?.road)}</b></div>}{row?.overtime>0&&<div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div>}{row?.advance>0&&<div className="print-row"><span>Avans</span><b>-{money(row?.advance)}</b></div>}{row?.deduction>0&&<div className="print-row"><span>Özel Kesinti</span><b>-{money(row?.deduction)}</b></div>}{row?.garnishment>0&&<div className="print-row"><span>{row?.legalType==="HACIZ"?"Haciz":"İcra"} ({row?.garnishmentSource==="ELDEN"?"Elden":"Bankadan"})</span><b>-{money(row?.garnishment)}</b></div>}<div className="print-row"><span>Bankadan</span><b>{money(row?.bank)}</b></div><div className="print-row"><span>Elden</span><b>{money(row?.cash)}</b></div><div className="print-row"><span>Toplam Ödenecek</span><b>{money(row?.net)}</b></div>{row?.extra>0&&<div className="print-row" style={{marginTop:10,borderTop:"1px dashed #111",justifyContent:"center",gap:18}}><span>EK</span><b>{money(row?.extra)}</b></div>}</div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => printSlip(row)}>Yazdir / PDF</button>} />
        </Modal>
      );
    }

    if (modal === "topluOdeme") {
      const previewRows = modalDraft.group === "SELECTED" && selectedPayrollIds.length ? payrollRows.filter((row)=>selectedPayrollIds.includes(row.employee.id)) : modalDraft.group === "BANK" ? payrollRows.filter((row)=>row.bank>0) : modalDraft.group === "CASH" ? payrollRows.filter((row)=>row.cash>0) : payrollRows;
      return <Modal title="Toplu Odeme Merkezi" sub="Grup sec, banka listesini veya resmi raporu hazirla, odeme durumunu kaydet" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid"><div className="form"><Field label="Odeme tarihi" half><input type="date" value={modalDraft.paymentDate||""} onChange={(event)=>setModalDraft((old)=>({...old,paymentDate:event.target.value}))} /></Field><Field label="Personel grubu" half><select value={modalDraft.group||"BANK"} onChange={(event)=>setModalDraft((old)=>({...old,group:event.target.value}))}><option value="BANK">Banka odemesi olanlar</option><option value="CASH">Elden odemesi olanlar</option><option value="SELECTED">Tabloda secili personel</option><option value="ALL">Tum personel</option></select></Field><Field label="Yapilacak islem" wide><select value={modalDraft.action||"BANK_LIST"} onChange={(event)=>setModalDraft((old)=>({...old,action:event.target.value}))}><option value="BANK_LIST">Banka odeme Exceli hazirla</option><option value="REPORT">Toplu bordro / imza raporu yazdir</option><option value="COMPLETE">Odemeyi tamamlandi kaydet</option></select></Field><Field label="Aciklama / banka referansi" wide><textarea value={modalDraft.note||""} onChange={(event)=>setModalDraft((old)=>({...old,note:event.target.value}))} placeholder="Odeme aciklamasi, banka referansi veya kontrol notu" /></Field><div className="wide warnline warn">Tamamlandi kaydi denetim loguna yazilir. Banka listesi yalniz banka tutari sifirdan buyuk personeli icerir.</div></div><div><div className="import-summary payment-summary"><div><span>Personel</span><b>{previewRows.length}</b></div><div><span>Banka</span><b>{money(previewRows.reduce((sum,row)=>sum+row.bank,0))}</b></div><div><span>Elden</span><b>{money(previewRows.reduce((sum,row)=>sum+row.cash,0))}</b></div><div><span>Net</span><b>{money(previewRows.reduce((sum,row)=>sum+row.net,0))}</b></div></div><div className="tw payment-preview"><table><thead><tr><th>Personel</th><th>Banka</th><th>Elden</th><th>Net</th><th>Durum</th></tr></thead><tbody>{previewRows.map((row)=><tr key={row.employee.id}><td>{row.employee.fullName}</td><td className="money">{money(row.bank)}</td><td className="money">{money(row.cash)}</td><td className="money">{money(row.net)}</td><td><span className={`badge ${row.diff===0?"green":"red"}`}>{row.diff===0?"Hazir":"Kontrol"}</span></td></tr>)}</tbody></table></div></div></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" disabled={busy} onClick={runBulkPayment}>{modalDraft.action==="BANK_LIST"?"Excel Hazirla":modalDraft.action==="REPORT"?"Raporu Ac":"Odemeyi Kaydet"}</button>} />
      </Modal>;
    }

    return <Modal title="Denetim Kaydi Detayi" sub="Degistirilemez islem gecmisi ve onceki/yeni degerler" size="medium" onClose={() => setModal(null)}><div className="audit-detail"><div className="import-summary"><div><span>Tarih</span><b>{modalDraft.createdAt||modalDraft.date||"-"}</b></div><div><span>Personel</span><b>{modalDraft.personName||"-"}</b></div><div><span>Islem</span><b>{modalDraft.actionType||"-"}</b></div><div><span>Kullanici</span><b>{modalDraft.userName||"Sistem"}</b></div><div><span>Ekran</span><b>{modalDraft.sourceScreen||"-"}</b></div></div><div className="audit-reason"><b>Aciklama</b><p>{modalDraft.reason||"Aciklama girilmemis."}</p></div><div className="audit-json-grid"><div><b>Onceki Deger</b><pre>{JSON.stringify(modalDraft.oldValue||{},null,2)}</pre></div><div><b>Yeni Deger</b><pre>{JSON.stringify(modalDraft.newValue||{},null,2)}</pre></div></div></div><ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => { setModal(null); editFromLog({...modalDraft,forceDetail:false}); }}>Ilgili Kaydi Duzenle</button>} /></Modal>;
  }

  function financeForm(type, bulk = false) {
  const isMesai = type === "Mesai";
  const isKesinti = ["Ozel kesinti", "Icra", "Haciz"].includes(type);
  const isLegal = ["Icra", "Haciz"].includes(type);
  const financeEmployee = employees.find((employee) => employee.id === modalDraft.employeeId) || selected;
  const financeBaseEmployee = financeEmployee?.baseEmployeeId ? employees.find((employee) => employee.id === financeEmployee.baseEmployeeId) : null;
  const overtimeBaseSalary = num(financeBaseEmployee?.salary || financeEmployee?.salary);
  const overtimeDivisor = num(financeEmployee?.overtimeHourlyBase || financeEmployee?.overtimeBaseHours) || 225;
  const overtimeHourly = overtimeDivisor > 0 ? round(overtimeBaseSalary / overtimeDivisor) : 0;
  const overtimeSuggested = round(overtimeHourly * num(modalDraft.hourOrDay));
  const currentTotal = movements
    .filter((item) => item.id !== modalDraft.id && item.employeeId === modalDraft.employeeId && item.type === type)
    .reduce((sum, item) => sum + num(item.amount), 0);
  const afterTotal = round(currentTotal + num(modalDraft.amount));
  const typeLabel = type === "Icra" ? "İcra" : type === "Haciz" ? "Haciz" : type === "Ozel kesinti" ? "Özel Kesinti" : type;
  return (
    <div className="form">
      {!bulk && <Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field>}
      <Field label="Tarih" half><input type="date" value={modalDraft.date || dateKey(year, month, 1)} onChange={(event) => setModalDraft((old) => ({ ...old, date: event.target.value }))} /></Field>
      {isMesai ? <>
        <Field label="Mesai Saati"><input type="number" min="0" step="0.5" value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value, adjustmentType: type }))} /></Field>
        <Field label={`Saatlik Baz (${overtimeDivisor} saat)`}><input value={money(overtimeHourly)} readOnly /></Field>
        <Field label="Mesai Tutarı" half><div style={{ display: "flex", gap: 6 }}><input type="number" min="0" value={modalDraft.amount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, amount: event.target.value, adjustmentType: type, payrollEffect: "Bordroya yansir", paymentMethod: "Bordro" }))} /><button type="button" className="btn" disabled={!num(modalDraft.hourOrDay)} onClick={() => setModalDraft((old) => ({ ...old, amount: overtimeSuggested, adjustmentType: type, payrollEffect: "Bordroya yansir", paymentMethod: "Bordro" }))}>Hesapla</button></div></Field>
        <Field label="Bordro Etkisi" half><input value="Maaşa eklenir" readOnly /></Field>
      </> : <>
        {isKesinti && <Field label="Kesinti Türü" half><select value={type} onChange={(event) => setModalDraft((old) => ({ ...old, adjustmentType: event.target.value, payrollEffect: "Bordroya yansir" }))}><option value="Ozel kesinti">Özel Kesinti</option><option value="Icra">İcra</option><option value="Haciz">Haciz</option></select></Field>}
        <Field label={isKesinti ? `${typeLabel} Tutarı` : "Avans Tutarı"} half><input type="number" min="0" value={modalDraft.amount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, amount: event.target.value, adjustmentType: type }))} /></Field>
        <Field label={isKesinti ? "Kesinti Yeri" : "Ödeme Şekli"} half><select value={modalDraft.paymentMethod || "Elden"} onChange={(event) => setModalDraft((old) => ({ ...old, paymentMethod: event.target.value }))}><option>Elden</option><option>Banka</option></select></Field>
        <Field label="Bordro Etkisi" half>{isLegal ? <input value="Bordrodan düşer" readOnly /> : <select value={modalDraft.payrollEffect || "Bordroya yansir"} onChange={(event) => setModalDraft((old) => ({ ...old, payrollEffect: event.target.value }))}><option>Bordroya yansir</option><option>Sadece kayit</option></select>}</Field>
      </>}
      <Field label="Açıklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} placeholder={isMesai ? "Mesai nedeni / vardiya notu" : isLegal ? "Dosya no / icra-haciz açıklaması" : isKesinti ? "Kesinti nedeni" : "Avans açıklaması"} /></Field>
      {!bulk && <div className={`wide warnline ${isKesinti ? "warn" : "ok"}`}>{isMesai ? `Bu ay mevcut mesai: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)} · Hesaplama: baz maaş / ${overtimeDivisor} × saat.` : isKesinti ? `Bu ay mevcut ${typeLabel.toLocaleLowerCase("tr-TR")}: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)} · ${modalDraft.paymentMethod || "Elden"} ödemesinden düşer.` : `Bu ay mevcut avans: ${money(currentTotal)} · Bu kayıt sonrası: ${money(afterTotal)}.`}</div>}
      {bulk && <div className="wide warnline warn">Toplu avans kaydında seçili personellerin her biri için aynı tarih ve kişi başı tutar kaydedilir.</div>}
    </div>
  );
}


  function dailyFields() {
    return (
      <>
        <Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field>
        <Field label="Durum" half><select value={modalDraft.statusType || "Gelmedi - net kesinti"} onChange={(event) => setModalDraft((old) => ({ ...old, statusType: event.target.value }))}>{DAILY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Gun sayisi"><input type="number" value={modalDraft.dayCount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, dayCount: event.target.value }))} /></Field>
        <Field label="Saat"><input value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value }))} /></Field>
        <Field label="Kesinti var mi?"><select value={modalDraft.hasDeduction || "Hayir"} onChange={(event) => setModalDraft((old) => ({ ...old, hasDeduction: event.target.value }))}><option>Hayir</option><option>Evet</option></select></Field>
        <Field label="Kesinti tutari"><input type="number" value={modalDraft.deductionAmount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, deductionAmount: event.target.value }))} /></Field>
        <Field label="Bordroya etki"><select value={modalDraft.payrollEffect || "Yok"} onChange={(event) => setModalDraft((old) => ({ ...old, payrollEffect: event.target.value }))}><option>Yok</option><option>Yansit</option></select></Field>
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
      return <button key={day} className={`day ${day === 12 ? "used" : ""} ${selectedDay ? "selected" : ""}`} onClick={() => setSelectedDays((old) => selectedDay ? old.filter((item) => item !== day) : [...old, day].sort((a, b) => a - b))}><b>{day}</b><span>{day === 12 ? "Kayit var" : "Bos"}</span></button>;
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
        return <button type="button" key={date} title={isReturn ? "Ise donus" : excludedRow?.reason || (counted ? "Izinden sayilir" : "")} className={`${inRange ? "in-range" : ""} ${counted ? "counted-day" : ""} ${excludedRow ? "excluded-day" : ""} ${isOfficial ? "official-day" : ""} ${isStart ? "range-start" : ""} ${isReturn ? "return-day" : ""} ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}`} onClick={() => chooseDate(date)}><b>{index + 1}</b><span>{isReturn ? <i className="return-label">Donus</i> : excludedRow ? <i className="excluded-label">{isOfficial ? "Tatil" : "Sayilmaz"}</i> : dayPlans.slice(0, 1).map((item) => <i key={item.id} title={`${item.fullName} ${item.startDate}-${item.endDate}`}>{item.fullName.split(" ")[0]}</i>)}</span></button>;
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
