import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteIkAdvancedFinanceMovement,
  getIkAdvancedAuditLogs,
  getIkAdvancedMonth,
  getIkAdvancedPayroll,
  runIkAdvancedCloseCheck,
  saveIkAdvancedException,
  saveIkAdvancedFinanceMovement,
  saveIkAdvancedPayrollLines,
  saveIkAdvancedPayrollOverride,
  saveIkAdvancedPersonCard,
  saveIkAdvancedSettlementDraft,
  updateIkAdvancedFinanceMovement,
  uploadIkAdvancedDocument,
} from "../../services/ikApi";
import { printHtmlDocument } from "../../services/printService";
import { exportRowsToExcelFile } from "../../utils/excelExport";
import "./ik.advanced.css";

const MONTHS = ["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];
const FINANCE_TYPES = ["Mesai", "Avans", "Toplu avans", "Ozel kesinti"];
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

function calcRow({ salary = 0, road = 0, overtime = 0, advance = 0, deduction = 0, bank = 0, cash = 0 }) {
  const hakedis = round(num(salary) + num(road) + num(overtime));
  const net = Math.max(round(hakedis - num(advance) - num(deduction)), 0);
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
    startDate: employee.startDate || employee.hireDate || "",
    title: employee.title || "",
    department: employee.department || "",
    phone: employee.phone || "",
    annualLeaveEntitlement: employee.annualLeaveEntitlement ?? "",
    documentStatus: employee.documentStatus || "",
    status: employee.status || employee.activePassive || "AKTIF",
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
  const documentInput = useRef(null);
  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const period = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  const employees = safeList(data.employees).filter((item) => item.payrollIncluded !== false);
  const rawAdjustments = safeList(data.adjustments);
  const leaves = safeList(data.leaves);
  const documents = safeList(data.documents);
  const contracts = safeList(data.contracts);
  const checks = safeList(data.checks);
  const payrollLines = safeList(payrollData?.lines);
  const totalDays = daysInMonth(year, month);
  const selected = employees.find((item) => item.id === selectedId) || employees[0] || null;

  const load = async () => {
    setBusy(true);
    try {
      const result = await getIkAdvancedMonth(params({ mainCompanyId: companyId, year, month }));
      setData(result || {});
      const audit = await getIkAdvancedAuditLogs(params({ mainCompanyId: companyId, period, limit: 180 }));
      setLogs(safeList(audit));
      const payroll = await getIkAdvancedPayroll(params({ mainCompanyId: companyId, year, month }));
      setPayrollData(payroll || null);
      const nextEmployees = safeList(result?.employees).filter((item) => item.payrollIncluded !== false);
      setSelectedId((old) => nextEmployees.some((item) => item.id === old) ? old : nextEmployees[0]?.id || "");
      setNotice("");
    } catch (error) {
      setNotice(error?.message || "IK aylik verisi alinamadi.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [year, month, companyId]);

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

  const employeeLeave = (employee) => {
    const own = leaves.filter((item) => item.employeeId === employee.id);
    const annual = own.filter((item) => upper(item.recordType || item.type).includes("YILLIK")).reduce((sum, item) => sum + num(item.dayCount || item.days || 1), 0);
    const right = num(employee.annualLeaveEntitlement) + num(employee.annualLeaveCarryover);
    return { own, annual, right, balance: right - annual };
  };

  const docsFor = (employee) => documents.filter((item) => item.employeeId === employee.id);

  const planFor = (employee) => {
    const own = movements.filter((item) => item.employeeId === employee.id);
    const overtime = own.filter((item) => item.type === "Mesai").reduce((sum, item) => sum + num(item.amount), 0);
    const advance = own.filter((item) => item.type === "Avans" || item.type === "Toplu avans").reduce((sum, item) => sum + num(item.amount), 0);
    const deduction = own.filter((item) => item.type === "Ozel kesinti").reduce((sum, item) => sum + num(item.amount), 0);
    const salary = num(employee.salary);
    const road = num(employee.roadAllowance);
    const pre = calcRow({ salary, road, overtime, advance, deduction });
    const saved = payrollLines.find((line) => line.employeeId === employee.id);
    const bank = saved?.final ? num(saved.final.bank) : Math.min(pre.net, num(employee.bankAmount));
    const cash = saved?.final ? num(saved.final.cash) : Math.max(pre.net - bank, 0);
    return { employee, salary, road, overtime, advance, deduction, bank, cash, saved, ...calcRow({ salary, road, overtime, advance, deduction, bank, cash }) };
  };

  const payrollRows = useMemo(() => employees.map((employee) => {
    const saved = payrollLines.find((line) => line.employeeId === employee.id);
    if (!saved?.final) return planFor(employee);
    const salary = num(saved.final.salaryPay);
    const road = num(saved.final.roadPay);
    const overtime = num(saved.final.overtimeAmount);
    const advance = num(saved.final.advanceAmount);
    const deduction = num(saved.final.deductionAmount);
    const bank = num(saved.final.bank);
    const cash = num(saved.final.cash);
    return { employee, salary, road, overtime, advance, deduction, bank, cash, saved, ...calcRow({ salary, road, overtime, advance, deduction, bank, cash }) };
  }), [employees, movements, payrollLines]);

  const summary = useMemo(() => payrollRows.reduce((acc, row) => ({
    count: acc.count + 1,
    bank: round(acc.bank + row.bank),
    cash: round(acc.cash + row.cash),
    net: round(acc.net + row.net),
    advance: round(acc.advance + row.advance),
    deduction: round(acc.deduction + row.deduction),
    overtime: round(acc.overtime + row.overtime),
    annual: acc.annual + employeeLeave(row.employee).annual,
    docsMissing: acc.docsMissing + (docsFor(row.employee).length ? 0 : 1),
    manual: acc.manual + (row.saved?.override ? 1 : 0),
  }), { count: 0, bank: 0, cash: 0, net: 0, advance: 0, deduction: 0, overtime: 0, annual: 0, docsMissing: 0, manual: 0 }), [payrollRows, leaves, documents]);

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
      paymentMethod: row?.paymentMethod || "Elden",
      payrollEffect: row?.payrollEffect || "Bordroya yansir",
      note: row?.note || row?.description || "",
    });
    setModal(normalized === "Toplu avans" ? "topluAvans" : normalized === "Avans" ? "avans" : normalized === "Ozel kesinti" ? "kesinti" : "mesai");
  };

  const openLeave = (kind = "yillik", forced = "") => {
    if (!selected) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedDays([1]);
    setModalDraft({
      employeeId: selected.id,
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
    });
    setModal(kind);
  };

  const openPayroll = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Personel secilmeden kayit yapilamaz.");
    setSelectedId(row.employee.id);
    setModalDraft({
      employeeId: row.employee.id,
      fullName: row.employee.fullName,
      salary: row.salary,
      road: row.road,
      overtime: row.overtime,
      advance: row.advance,
      deduction: row.deduction,
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

  const editFromLog = (log) => {
    const text = log.text || upper(`${log.actionType || ""} ${log.sourceScreen || ""} ${log.reason || ""}`);
    const employee = employees.find((item) => item.id === log.employeeId) || selected;
    if (employee?.id) setSelectedId(employee.id);
    if (text.includes("TOPLU") && text.includes("AVANS")) return openFinance("Toplu avans");
    if (text.includes("AVANS")) return openFinance("Avans");
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
    const planTotal = num(modalDraft.bankAmount) + num(modalDraft.cashAmount);
    if (planTotal > num(modalDraft.salary) + num(modalDraft.roadAllowance) && !window.confirm("Banka plan + elden plan maas/yol toplamindan yuksek. Devam edilsin mi?")) return;
    setBusy(true);
    try {
      await saveIkAdvancedPersonCard(modalDraft.id, {
        mainCompanyId: companyId,
        personelKodu: modalDraft.code,
        cardNo: modalDraft.cardNo,
        identityNo: modalDraft.identityNo,
        sgkFollow: modalDraft.sgkFollow === "SGKLI" ? true : modalDraft.sgkFollow === "SGKSIZ" ? false : null,
        paymentType: modalDraft.paymentType,
        salary: num(modalDraft.salary),
        roadAllowance: num(modalDraft.roadAllowance),
        bankAmount: num(modalDraft.bankAmount),
        cashAmount: num(modalDraft.cashAmount),
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
    if (!selectedDays.length) return setNotice("Gun secilmeden kayit yapilamaz.");
    const employee = employees.find((item) => item.id === modalDraft.employeeId);
    const leave = employee ? employeeLeave(employee) : null;
    if (modal === "yillik" && modalDraft.leaveType === "Yillik izin" && leave && leave.balance < selectedDays.length && !window.confirm("Kalan izin yetersiz. Yine de kaydedilsin mi?")) return;
    if (modal === "gunluk" && modalDraft.statusType === "Gelmedi - net kesinti" && modalDraft.hasDeduction === "Evet" && num(modalDraft.deductionAmount) <= 0) return setNotice("Kesinti tutari girilmelidir.");
    if (modal === "gunluk" && ["Erken cikma", "Gec gelme"].includes(modalDraft.statusType) && num(modalDraft.hourOrDay) <= 0) return setNotice("Saat alani zorunludur.");
    setBusy(true);
    try {
      for (const day of selectedDays) {
        await saveIkAdvancedException({
          mainCompanyId: companyId,
          employeeId: modalDraft.employeeId,
          workDate: dateKey(year, month, day),
          recordType: modal === "yillik" ? modalDraft.leaveType : modalDraft.statusType,
          status: modal === "yillik" ? "Y" : modalDraft.statusType,
          dayCount: num(modalDraft.dayCount || selectedDays.length),
          hourOrDay: modalDraft.hourOrDay,
          payrollEffect: modalDraft.payrollEffect,
          deductionAmount: num(modalDraft.deductionAmount),
          documentId: modalDraft.documentNo,
          note: modalDraft.note,
          source: "MANUAL",
        });
      }
      setModal(null);
      setNotice("Gunluk kayit tamamlandi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Kayit yapilamadi.");
    } finally {
      setBusy(false);
    }
  };

  const savePayrollOverride = async () => {
    const totals = calcRow({
      salary: modalDraft.salary,
      road: modalDraft.road,
      overtime: modalDraft.overtime,
      advance: modalDraft.advance,
      deduction: modalDraft.deduction,
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
          roadPay: num(modalDraft.road),
          overtimeAmount: num(modalDraft.overtime),
          premiumAmount: 0,
          advanceAmount: num(modalDraft.advance),
          deductionAmount: num(modalDraft.deduction),
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
      await saveIkAdvancedPayrollLines({ mainCompanyId: companyId, year, month, status: "CALCULATED", reason: "Bordro kaydi" });
      setNotice("Bordro satirlari kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Bordro kaydedilemedi.");
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
      mesai: row.overtime,
      avans: row.advance,
      kesinti: row.deduction,
      hakedis: row.hakedis,
      netOdenecek: row.net,
      banka: row.bank,
      elden: row.cash,
      toplam: row.total,
      durum: row.diff === 0 ? "Dengeli" : "Kontrol",
    })));
  };

  const printSlip = (row = payrollRows.find((item) => item.employee.id === selected?.id)) => {
    if (!row) return setNotice("Fis icin personel secilmelidir.");
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:22px}.print-row{display:flex;justify-content:space-between;border-bottom:1px solid #edf2f7;padding:8px 0}.sheet{max-width:520px;margin:auto;border:1px solid #d9e3ef;border-radius:12px;padding:18px}</style></head><body><div class="sheet"><h2>BORDRO ODEME FISI</h2>${[
      ["Personel", row.employee.fullName],
      ["Donem", `${MONTHS[month - 1]} ${year}`],
      ["Maas", money(row.salary)],
      ["Yol", money(row.road)],
      ["Mesai", money(row.overtime)],
      ["Avans", money(row.advance)],
      ["Kesinti", money(row.deduction)],
      ["Net Odenecek", money(row.net)],
    ].map(([label, value]) => `<div class="print-row"><span>${label}</span><b>${value}</b></div>`).join("")}<br><p>Imza: ____________________</p></div></body></html>`;
    printHtmlDocument(html, `ik-fis-${row.employee.fullName}`);
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
        <div className="card"><div className="ch"><div><b>Personel Kartlari</b><span>Satirdan Detay / Duzenle / Evrak acilir.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>Kod / Kart No</th><th>SGK</th><th>Odeme</th><th>Maas</th><th>Yol</th><th>Banka Plan</th><th>Elden Plan</th><th>Kalan Izin</th><th>Evrak</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{filteredEmployees.map((employee) => {
          const leave = employeeLeave(employee);
          const docCount = docsFor(employee).length;
          return <tr key={employee.id} onClick={() => setSelectedId(employee.id)}><td><span className="person">{employee.fullName}</span><span className="code">{employee.department || "-"}</span></td><td>{employee.code || "-"} / {employee.cardNo || "-"}</td><td>{sgkLabel(employee)}</td><td>{paymentLabel(employee)}</td><td className="money">{money(employee.salary)}</td><td className="money">{money(employee.roadAllowance)}</td><td className="money">{money(employee.bankAmount)}</td><td className="money">{money(employee.cashAmount)}</td><td><span className={`badge ${leave.balance < 0 ? "red" : "green"}`}>{leave.balance}</span></td><td><span className={`badge ${docCount ? "green" : "orange"}`}>{docCount ? "Var" : "Eksik"}</span></td><td><span className="badge green">{employee.status || "Aktif"}</span></td><td><button className="btn" onClick={(event) => { event.stopPropagation(); openPerson(employee); }}>Detay</button> <button className="btn" onClick={(event) => { event.stopPropagation(); openPerson(employee); }}>Duzenle</button> <button className="btn" onClick={(event) => { event.stopPropagation(); openDocument(employee); }}>Evrak</button></td></tr>;
        })}<EmptyRow show={!filteredEmployees.length} colSpan={12} text="Personel bulunamadi." /></tbody></table></div></div>
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
        <div className="sumgrid short">{summaryBox("Personel", employees.length)}{summaryBox("Mesai toplami", money(summary.overtime))}{summaryBox("Avans toplami", money(summary.advance), "orange")}{summaryBox("Kesinti toplami", money(summary.deduction), "red")}</div>
        <div className="card"><div className="ch"><div><b>Hareketler</b><span>Bordro sonucu gosterilmez; sadece hareket kaydi.</span></div></div><div className="tw"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Tip</th><th>Saat/Gun</th><th>Tutar</th><th>Odeme Sekli</th><th>Bordro Etkisi</th><th>Aciklama</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{movements.map((item) => {
          const employee = employees.find((row) => row.id === item.employeeId);
          return <tr key={item.id || `${item.employeeId}-${item.date}-${item.type}`}><td>{item.date || item.adjustmentDate || "-"}</td><td><span className="person">{employee?.fullName || item.fullName || "-"}</span><span className="code">{employee?.code || "-"}</span></td><td>{item.type}</td><td>{item.hourOrDay || item.quantity || "-"}</td><td className="money">{money(item.amount)}</td><td>{item.paymentMethod || "-"}</td><td>{item.payrollEffect || "Bordroya yansir"}</td><td>{item.note || item.description || "-"}</td><td><span className="badge green">Kayitli</span></td><td><button className="btn" onClick={() => setNotice(item.note || "Hareket detayi acildi.")}>Detay</button> <button className="btn" onClick={() => openFinance(item.type, item)}>Duzenle</button> <button className="btn red" onClick={() => deleteFinance(item)}>Sil</button></td></tr>;
        })}<EmptyRow show={!movements.length} colSpan={10} text="Bu ay hareket kaydi yok." /></tbody></table></div></div>
        <LogTable title="Hareket Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderIzin() {
    return (
      <section>
        <div className="page-head"><div><h1>Yillik Izin / Gunluk Durum</h1><p>Izin, gelmedi, rapor, erken cikma/gec gelme notlari. Giris yok.</p></div></div>
        {filters({ third: "Personel ara", fourth: "Durum turu", fifth: "Gosterim" })}
        <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openLeave("yillik")}>Yillik Izin Gir</button><button className="btn orange" onClick={() => openLeave("gunluk")}>Gunluk Durum Gir</button><button className="btn red" onClick={() => openLeave("gunluk", "Rapor")}>Rapor Gir</button><button className="btn" onClick={() => openLeave("gunluk", "Istisna")}>Istisna Gir</button></div><button className="btn green" onClick={() => setModal("izinFis")}>Izin Formu Yazdir</button></div>
        <div className="sumgrid short">{summaryBox("Hak edilen izin", employees.reduce((sum, item) => sum + employeeLeave(item).right, 0))}{summaryBox("Kullanilan yillik izin", summary.annual, "orange")}{summaryBox("Kalan izin", employees.reduce((sum, item) => sum + employeeLeave(item).balance, 0), "green")}{summaryBox("Rapor / mazeret", leaves.filter((item) => upper(item.recordType || item.type).includes("RAPOR") || upper(item.recordType || item.type).includes("MAZERET")).length)}{summaryBox("Ucretsiz izin", leaves.filter((item) => upper(item.recordType || item.type).includes("UCRETSIZ")).length)}{summaryBox("Eksik evrak", summary.docsMissing, "orange")}</div>
        <div className="card"><div className="ch"><div><b>Personel Izin / Gunluk Durum Listesi</b><span>Gun secimi modalda yapilir; bu liste sadece ay durumudur.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>SGK</th><th>Kalan Izin</th><th>Yillik Izin</th><th>Rapor</th><th>Ucretsiz</th><th>Gelmedi</th><th>Erken Cikma</th><th>Gec Gelme</th><th>Istisna</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{filteredEmployees.map((employee) => {
          const leave = employeeLeave(employee);
          const count = (word) => leave.own.filter((item) => upper(`${item.recordType || ""} ${item.type || ""} ${item.status || ""}`).includes(word)).length;
          return <tr key={employee.id}><td><span className="person">{employee.fullName}</span><span className="code">{employee.code || "-"}</span></td><td>{sgkLabel(employee)}</td><td><span className={`badge ${leave.balance < 0 ? "red" : "green"}`}>{leave.balance}</span></td><td>{leave.annual}</td><td>{count("RAPOR")}</td><td>{count("UCRETSIZ")}</td><td>{count("GELMEDI")}</td><td>{count("ERKEN")}</td><td>{count("GEC")}</td><td>{count("ISTISNA")}</td><td><span className="badge green">Tamam</span></td><td><button className="btn" onClick={() => { setSelectedId(employee.id); openLeave("yillik"); }}>Yillik</button> <button className="btn" onClick={() => { setSelectedId(employee.id); openLeave("gunluk"); }}>Durum</button></td></tr>;
        })}<EmptyRow show={!filteredEmployees.length} colSpan={12} text="Personel bulunamadi." /></tbody></table></div></div>
        <LogTable title="Izin ve Gunluk Durum Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderBordro() {
    return (
      <section>
        <div className="page-head"><div><h1>Bordro & Odeme</h1><p>Sadece ay sonu sonuc, odeme kontrolu ve fis. Giris islemi yok.</p></div><span className={`badge ${balanced ? "green" : "red"}`}>{balanced ? "Toplam odeme dengeli" : "Toplam odeme kontrol"}</span></div>
        {filters({ third: "Personel ara", fourth: "Odeme", fifth: "Durum" })}
        <div className="sumgrid short">{summaryBox("Odeme listesi", payrollRows.length)}{summaryBox("Banka", money(summary.bank))}{summaryBox("Elden", money(summary.cash))}{summaryBox("Avans", money(summary.advance), "orange")}{summaryBox("Kesinti", money(summary.deduction), "red")}{summaryBox("Net Toplam", money(summary.net), balanced ? "green" : "red")}</div>
        <div className="workbar"><div className="group"><button className="btn primary" onClick={refreshPayroll}>Bordro Hesapla</button><button className="btn" onClick={savePayroll}>Secilileri Kaydet</button><button className="btn green" onClick={() => setModal("topluOdeme")}>Toplu Odeme</button><button className="btn" onClick={() => openPayroll()}>Bordro Kontrol & Duzelt</button><button className="btn" onClick={() => payrollRows.forEach((row) => printSlip(row))}>Coklu Fis / PDF</button><button className="btn" onClick={() => setModal("fis")}>Tek Kisi Fisi</button></div><button className="btn green" onClick={exportPayroll}>Excel Indir</button></div>
        <div className={`warnline ${balanced ? "ok" : "warn"}`}>{balanced ? "Toplam odeme dengeli: Banka + Elden = Net Toplam." : "Toplam odeme banka + elden ile eslesmiyor."}</div>
        <div className="card"><div className="ch"><div><b>Bordro & Odeme Listesi</b><span>Hakedis = Maas + Yol + Mesai. Net = Hakedis - Avans - Kesinti. Toplam = Net.</span></div></div><div className="tw"><table><thead><tr><th>Personel</th><th>SGK</th><th>Odeme</th><th>Maas</th><th>Yol</th><th>Mesai</th><th>Avans</th><th>Kesinti</th><th>Hakedis</th><th>Net Odenecek</th><th>Banka</th><th>Elden</th><th>Toplam</th><th>Durum</th><th>Islem</th></tr></thead><tbody>{payrollRows.map((row) => <tr key={row.employee.id}><td><span className="person">{row.employee.fullName}</span><span className="code">{row.employee.code || "-"}</span></td><td>{sgkLabel(row.employee)}</td><td>{paymentLabel(row.employee)}</td><td className="money">{money(row.salary)}</td><td className="money">{money(row.road)}</td><td className="money">{money(row.overtime)}</td><td className="money">{money(row.advance)}</td><td className="money">{money(row.deduction)}</td><td className="money">{money(row.hakedis)}</td><td className="money">{money(row.net)}</td><td className="money">{money(row.bank)}</td><td className="money">{money(row.cash)}</td><td className="money">{money(row.total)}</td><td><span className={`badge ${row.diff === 0 ? "green" : "red"}`}>{row.diff === 0 ? "Dengeli" : "Kontrol"}</span></td><td><button className="btn" onClick={() => openPayroll(row)}>Duzenle</button> <button className="btn" onClick={() => { setSelectedId(row.employee.id); setModal("fis"); }}>Fis</button></td></tr>)}<EmptyRow show={!payrollRows.length} colSpan={15} text="Bordro icin personel bulunamadi." /></tbody></table></div></div>
        <LogTable title="Bordro Islem Loglari" rows={scopedLogs} onEdit={editFromLog} />
      </section>
    );
  }

  function renderEvrak() {
    return (
      <section>
        <div className="page-head"><div><h1>SGK - Evrak - Ay Sonu</h1><p>Evrak, sozlesme, belge ve ay sonu kontrol. Giris yok.</p></div></div>
        {filters({ third: "Personel ara", fourth: "Evrak", fifth: "SGK" })}
        <div className="workbar"><div className="group"><button className="btn primary" onClick={() => openDocument()}>Evrak Yukle</button><button className="btn" onClick={() => setModal("izinFis")}>Izin Formu Yazdir</button><button className="btn" onClick={() => setModal("kidemCikti")}>Kidem Ciktisi</button><button className="btn" onClick={saveSettlementDraft}>Kidem / Ayrilis Taslagi</button><button className="btn orange" onClick={runClose}>Ay Sonu Kontrol</button></div></div>
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
      <Modal title="Personel Detay" sub="Sabit bilgi ve odeme plani" onClose={() => setModal(null)}>
        <div className="form">
          <Field label="Personel adi"><input value={modalDraft.fullName || ""} onChange={(event) => setModalDraft((old) => ({ ...old, fullName: event.target.value }))} /></Field>
          <Field label="Kod / Kart No"><input value={`${modalDraft.code || ""} / ${modalDraft.cardNo || ""}`} onChange={(event) => { const [code, cardNo] = event.target.value.split("/"); setModalDraft((old) => ({ ...old, code: code?.trim() || "", cardNo: cardNo?.trim() || "" })); }} /></Field>
          <Field label="SGK Durumu"><select value={modalDraft.sgkFollow || "BELIRTILMEMIS"} onChange={(event) => setModalDraft((old) => ({ ...old, sgkFollow: event.target.value }))}><option value="SGKLI">SGK'li</option><option value="SGKSIZ">SGK'siz</option><option value="BELIRTILMEMIS">Belirtilmemis</option></select></Field>
          <Field label="Odeme Tipi"><select value={modalDraft.paymentType || "BANKA_ELDEN"} onChange={(event) => setModalDraft((old) => ({ ...old, paymentType: event.target.value }))}><option value="BANKA_ELDEN">Karisik</option><option value="Elden">Elden</option><option value="Banka">Banka</option></select></Field>
          <Field label="Maas"><input type="number" value={modalDraft.salary || ""} onChange={(event) => setModalDraft((old) => ({ ...old, salary: event.target.value }))} /></Field>
          <Field label="Yol"><input type="number" value={modalDraft.roadAllowance || ""} onChange={(event) => setModalDraft((old) => ({ ...old, roadAllowance: event.target.value }))} /></Field>
          <Field label="Banka Plan"><input type="number" value={modalDraft.bankAmount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, bankAmount: event.target.value }))} /></Field>
          <Field label="Elden Plan"><input type="number" value={modalDraft.cashAmount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, cashAmount: event.target.value }))} /></Field>
          <Field label="Ise giris"><input type="date" value={modalDraft.startDate || ""} onChange={(event) => setModalDraft((old) => ({ ...old, startDate: event.target.value }))} /></Field>
          <Field label="Gorev"><input value={modalDraft.title || ""} onChange={(event) => setModalDraft((old) => ({ ...old, title: event.target.value }))} /></Field>
          <Field label="Telefon"><input value={modalDraft.phone || ""} onChange={(event) => setModalDraft((old) => ({ ...old, phone: event.target.value }))} /></Field>
          <Field label="Izin hakki"><input type="number" value={modalDraft.annualLeaveEntitlement || ""} onChange={(event) => setModalDraft((old) => ({ ...old, annualLeaveEntitlement: event.target.value }))} /></Field>
          <Field label="Not" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} /></Field>
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={savePerson}>Kaydet</button>} />
      </Modal>
    );

    if (["mesai", "avans", "kesinti"].includes(modal)) {
      const type = modal === "avans" ? "Avans" : modal === "kesinti" ? "Ozel kesinti" : "Mesai";
      return <Modal title={modal === "avans" ? "Avans Girisi" : modal === "kesinti" ? "Kesinti Girisi" : "Mesai Girisi"} sub="Hizli hareket kaydi" onClose={() => setModal(null)}>{financeForm(type)}<ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={saveFinance}>Kaydet</button>} /></Modal>;
    }

    if (modal === "topluAvans") return (
      <Modal title="Toplu Avans Sihirbazi" sub="1) Personel sec  2) Tutar gir  3) Onizle ve kaydet" size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid">
          <div className="steps"><div className="step active"><div className="num">1</div><div><b>Personel Sec</b><span>Grup veya tek tek secim</span></div></div><div className="step"><div className="num">2</div><div><b>Tutar ve Tarih</b><span>Kisi basi avans</span></div></div><div className="step"><div className="num">3</div><div><b>Onay</b><span>Toplam kontrol</span></div></div><div className="mini-summary"><div className="mini"><span>Secili</span><b>{safeList(modalDraft.employeeIds).length}</b></div><div className="mini"><span>Kisi basi</span><b>{money(modalDraft.amount)}</b></div><div className="mini"><span>Toplam</span><b>{money(safeList(modalDraft.employeeIds).length * num(modalDraft.amount))}</b></div></div></div>
          <div><label>Grup secimi</label><select onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: groupEmployeeIds(event.target.value) }))}><option value="selected">Secili personel</option><option value="all">Tum personel</option><option value="sgk">SGK'lilar</option><option value="nonsgk">SGK'sizlar</option><option value="cash">Elden alanlar</option><option value="bank">Banka alanlar</option></select><br /><br /><div className="selectlist">{filteredEmployees.map((employee) => <label className="selrow" key={employee.id}><input type="checkbox" checked={safeList(modalDraft.employeeIds).includes(employee.id)} onChange={(event) => setModalDraft((old) => ({ ...old, employeeIds: event.target.checked ? [...new Set([...safeList(old.employeeIds), employee.id])] : safeList(old.employeeIds).filter((id) => id !== employee.id) }))} /><b>{employee.fullName}<span className="code">{employee.code || "-"}</span></b><span>{sgkLabel(employee)}</span><span>{paymentLabel(employee)}</span></label>)}</div><br />{financeForm("Toplu avans", true)}<div className="warnline warn">Kaydetmeden once ayni gun / ayni tutar tekrar avans kontrolu yapilir.</div></div>
        </div>
        <ModalFooter onClose={() => setModal(null)} actions={<><button className="btn">Onizle</button><button className="btn primary" onClick={saveFinance}>Onayla ve Kaydet</button></>} />
      </Modal>
    );

    if (modal === "yillik" || modal === "gunluk") return (
      <Modal title={modal === "yillik" ? "Yillik Izin" : "Gunluk Durum"} sub={modal === "yillik" ? "Gun secmeli hizli giris" : "Gelmedi, rapor, erken cikma, gec gelme"} size="medium" onClose={() => setModal(null)}>
        <div className="drawer-grid"><DayGrid /><div className="form">{modal === "yillik" ? leaveFields() : dailyFields()}</div></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={saveLeave}>Kaydet</button>} />
      </Modal>
    );

    if (modal === "bordroDuzelt") {
      const totals = calcRow({ salary: modalDraft.salary, road: modalDraft.road, overtime: modalDraft.overtime, advance: modalDraft.advance, deduction: modalDraft.deduction, bank: modalDraft.bank, cash: modalDraft.cash });
      return (
        <Modal title="Bordro Kontrol & Duzelt" sub="Hesaplar otomatik, manuel duzeltme loglanir" onClose={() => setModal(null)}>
          <div className="drawer-grid"><div className="form">{["salary", "road", "overtime", "advance", "deduction", "bank", "cash"].map((key) => <Field key={key} label={key}><input type="number" value={modalDraft[key] || ""} onChange={(event) => setModalDraft((old) => ({ ...old, [key]: event.target.value }))} /></Field>)}<Field label="Aciklama" wide><textarea value={modalDraft.reason || ""} onChange={(event) => setModalDraft((old) => ({ ...old, reason: event.target.value }))} /></Field></div><div><div className="mini-summary"><div className="mini"><span>Hakedis</span><b>{money(totals.hakedis)}</b></div><div className="mini"><span>Net</span><b>{money(totals.net)}</b></div><div className="mini"><span>Toplam</span><b>{money(totals.total)}</b></div></div><div className={`warnline ${totals.diff === 0 ? "ok" : "warn"}`}>{totals.diff === 0 ? "Banka + elden net odeme ile eslesiyor." : "Banka + elden net odeme ile eslesmiyor."}</div></div></div>
          <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={savePayrollOverride}>Kaydet</button>} />
        </Modal>
      );
    }

    if (modal === "evrak") return (
      <Modal title="Evrak Yukle" sub="Belge baglantisi" size="small" onClose={() => setModal(null)}>
        <div className="form"><Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field><Field label="Belge Turu" half><input value={modalDraft.documentType || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentType: event.target.value }))} /></Field><Field label="Dosya" wide><input ref={documentInput} type="file" onChange={(event) => uploadDocument(event.target.files?.[0])} /></Field><Field label="Not" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} /></Field></div>
        <ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => documentInput.current?.click()}>Dosya Sec</button>} />
      </Modal>
    );

    if (modal === "fis" || modal === "izinFis" || modal === "kidemCikti") {
      const row = payrollRows.find((item) => item.employee.id === selected?.id) || payrollRows[0];
      return (
        <Modal title={modal === "fis" ? "Tek Kisi Fisi" : modal === "izinFis" ? "Izin Formu" : "Kidem Ciktisi"} sub="Yazdirmadan once onizleme" size="small" onClose={() => setModal(null)}>
          <div className="print-sheet"><h2>{modal === "fis" ? "BORDRO ODEME FISI" : modal === "izinFis" ? "IZIN FORMU" : "KIDEM CIKTISI"}</h2><div className="print-row"><span>Personel</span><b>{row?.employee?.fullName || "-"}</b></div><div className="print-row"><span>Donem</span><b>{MONTHS[month - 1]} {year}</b></div><div className="print-row"><span>Maas</span><b>{money(row?.salary)}</b></div><div className="print-row"><span>Yol</span><b>{money(row?.road)}</b></div><div className="print-row"><span>Mesai</span><b>{money(row?.overtime)}</b></div><div className="print-row"><span>Avans</span><b>{money(row?.advance)}</b></div><div className="print-row"><span>Kesinti</span><b>{money(row?.deduction)}</b></div><div className="print-row"><span>Net Odenecek</span><b>{money(row?.net)}</b></div><br /><p>Imza: ____________________</p></div>
          <ModalFooter onClose={() => setModal(null)} actions={<><button className="btn">PDF</button><button className="btn primary" onClick={() => printSlip(row)}>Yazdir</button></>} />
        </Modal>
      );
    }

    if (modal === "topluOdeme") return <Modal title="Toplu Odeme" sub="Odeme tamamlama islemi" size="small" onClose={() => setModal(null)}><div className="form"><Field label="Odeme tarihi" half><input type="date" value={dateKey(year, month, 1)} readOnly /></Field><Field label="Grup" half><select><option>Tum personel</option><option>Secili personel</option><option>Banka alanlar</option><option>Elden alanlar</option></select></Field><Field label="Islem" wide><select><option>Odeme tamamlandi yap</option><option>Fis olustur</option><option>Banka listesi hazirla</option><option>Elden imza listesi hazirla</option></select></Field><Field label="Aciklama" wide><textarea /></Field></div><ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => setModal(null)}>Kaydet</button>} /></Modal>;

    return <Modal title="Log Detay" sub="Islem gecmisi" size="small" onClose={() => setModal(null)}><div className="note">Bu kaydin detaylari burada gorunur. Duzenle tiklaninca ilgili islem modali acilir.</div><ModalFooter onClose={() => setModal(null)} actions={<button className="btn primary" onClick={() => setModal(null)}>Tamam</button>} /></Modal>;
  }

  function financeForm(type, bulk = false) {
    return (
      <div className="form">
        {!bulk && <Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field>}
        <Field label="Tarih"><input type="date" value={modalDraft.date || dateKey(year, month, 1)} onChange={(event) => setModalDraft((old) => ({ ...old, date: event.target.value }))} /></Field>
        <Field label="Tip"><select value={type} onChange={(event) => setModalDraft((old) => ({ ...old, adjustmentType: event.target.value }))}>{FINANCE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Saat / Gun"><input type="number" value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value }))} /></Field>
        <Field label="Tutar"><input type="number" value={modalDraft.amount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, amount: event.target.value, adjustmentType: type }))} /></Field>
        <Field label="Odeme Sekli"><select value={modalDraft.paymentMethod || "Elden"} onChange={(event) => setModalDraft((old) => ({ ...old, paymentMethod: event.target.value }))}><option>Elden</option><option>Banka</option></select></Field>
        <Field label="Bordro Etkisi"><select value={modalDraft.payrollEffect || "Bordroya yansir"} onChange={(event) => setModalDraft((old) => ({ ...old, payrollEffect: event.target.value }))}><option>Bordroya yansir</option><option>Sadece kayit</option></select></Field>
        <Field label="Aciklama" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} /></Field>
        <div className="wide warnline warn">Kayit oncesi: personel, tarih, negatif tutar ve tekrar kayit kontrol edilir.</div>
      </div>
    );
  }

  function leaveFields() {
    return (
      <>
        <Field label="Personel" half><select value={modalDraft.employeeId || selected?.id || ""} onChange={(event) => setModalDraft((old) => ({ ...old, employeeId: event.target.value }))}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></Field>
        <Field label="Izin turu" half><select value={modalDraft.leaveType || "Yillik izin"} onChange={(event) => setModalDraft((old) => ({ ...old, leaveType: event.target.value }))}>{LEAVE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Gun sayisi"><input type="number" value={modalDraft.dayCount || ""} onChange={(event) => setModalDraft((old) => ({ ...old, dayCount: event.target.value }))} /></Field>
        <Field label="Saat / gun"><input value={modalDraft.hourOrDay || ""} onChange={(event) => setModalDraft((old) => ({ ...old, hourOrDay: event.target.value }))} /></Field>
        <Field label="Ucret etkisi"><select value={modalDraft.wageEffect || "Ucretli"} onChange={(event) => setModalDraft((old) => ({ ...old, wageEffect: event.target.value }))}><option>Ucretli</option><option>Ucretsiz / kesinti</option><option>Sadece kayit</option></select></Field>
        <Field label="Bordroya etki"><select value={modalDraft.payrollEffect || "Yansit"} onChange={(event) => setModalDraft((old) => ({ ...old, payrollEffect: event.target.value }))}><option>Yansit</option><option>Yansitma</option></select></Field>
        <Field label="Belge / form" wide><input value={modalDraft.documentNo || ""} onChange={(event) => setModalDraft((old) => ({ ...old, documentNo: event.target.value }))} /></Field>
        <Field label="Not" wide><textarea value={modalDraft.note || ""} onChange={(event) => setModalDraft((old) => ({ ...old, note: event.target.value }))} /></Field>
        <div className="wide warnline warn">Kalan izin yetersizse sistem onay ister.</div>
      </>
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
      <div className="ch"><div><b>{title}</b><span>Detay / Duzenle / Sil standart.</span></div></div>
      <div className="tw"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Islem</th><th>Aciklama</th><th>Kullanici</th><th>Islem</th></tr></thead><tbody>{rows.map((log, index) => <tr key={log.id || index}><td>{log.createdAt || log.date || "-"}</td><td>{log.personName || "-"}</td><td>{log.actionType || log.sourceScreen || "-"}</td><td>{log.reason || log.description || "-"}</td><td>{log.createdBy || log.userName || "Sistem"}</td><td><button className="btn" onClick={() => onEdit({ ...log, forceDetail: true })}>Detay</button> <button className="btn" onClick={() => onEdit(log)}>Duzenle</button> <button className="btn red" onClick={() => window.confirm("Bu islem kaydi silinecek. Emin misiniz?")}>Sil</button></td></tr>)}<EmptyRow show={!rows.length} colSpan={6} text="Log kaydi yok." /></tbody></table></div>
    </div>
  );
}

function EmptyRow({ show, colSpan, text }) {
  if (!show) return null;
  return <tr><td colSpan={colSpan} style={{ textAlign: "center", color: "var(--muted)" }}>{text}</td></tr>;
}
