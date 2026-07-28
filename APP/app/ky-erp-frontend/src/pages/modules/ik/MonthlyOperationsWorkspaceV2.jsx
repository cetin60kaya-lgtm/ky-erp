import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  CalendarDays,
  CircleAlert,
  Clock3,
  MinusCircle,
  Plus,
  ReceiptText,
  Save,
  Search,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import {
  deleteAylikIzin,
  deleteAylikMesai,
  getAylikIzinler,
  getAylikMesailer,
  getAylikPersonel,
  getResmiTatiller,
  hesaplaBordro,
  olusturBordro,
  saveAylikIzin,
  saveAylikMesai,
  updateAylikIzin,
  updateAylikMesai,
  updateAylikPersonel,
} from "../../../services/ikApi";
import "./monthly-operations-workspace.css";

const ACTIVE_PATHS = new Set([
  "/ik/mesai-avans",
  "/ik/puantaj-izin",
  "/ik/bordro-odeme",
]);
const ADDITION_TYPES = new Set(["Mesai", "Prim", "Ek ödeme", "Maaş farkı", "Yol farkı"]);
const DEDUCTION_TYPES = new Set(["Avans", "Kesinti", "Devamsızlık"]);

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TODAY = localDate();
const CURRENT_PERIOD = TODAY.slice(0, 7);

function num(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(num(value));
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function personName(person) {
  return person?.fullName || person?.adSoyad || "İsimsiz personel";
}

function hasSgk(person) {
  return String(person?.sgkStatus || "VAR").toLocaleUpperCase("tr-TR") !== "YOK";
}

function overtimeBase(person) {
  return num(person?.overtimeHourlyBase || person?.overtimeBaseHours) === 300 ? 300 : 225;
}

function isWeekend(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function overtimeMultiplier(dateValue, holidayDates) {
  return holidayDates.has(dateValue) || isWeekend(dateValue) ? 2 : 1.5;
}

function overtimePreview(person, hours, dateValue, holidayDates) {
  const salary = num(person?.salary);
  const divisor = overtimeBase(person);
  const multiplier = overtimeMultiplier(dateValue, holidayDates);
  return Number(((salary / divisor) * num(hours) * multiplier).toFixed(2));
}

function inclusiveDays(startValue, endValue) {
  const start = new Date(`${startValue}T12:00:00`);
  const end = new Date(`${endValue}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function normalizeAdjustment(row = {}) {
  return {
    id: row.id || "",
    personId: row.personId || row.employeeId || "",
    date: dateOnly(row.date || TODAY),
    type: row.type || row.adjustmentType || "Mesai",
    hours: num(row.hours ?? row.hourOrDay),
    amount: num(row.amount),
    amountManual: row.amountManual === true,
    note: row.note || "",
    status: row.status || "Onaylı",
  };
}

function normalizeLeave(row = {}) {
  return {
    id: row.id || "",
    personId: row.personId || row.employeeId || "",
    type: row.type || row.recordType || "Yıllık izin",
    start: dateOnly(row.start || row.startDate || TODAY),
    end: dateOnly(row.end || row.endDate || TODAY),
    days: num(row.days ?? row.dayCount ?? 1),
    description: row.description || row.note || "",
  };
}

function adjustmentPayload(form, company, calculatedAmount) {
  const isOvertime = form.type === "Mesai";
  return {
    mainCompanyId: company?.slug || company?.id || "mecit-hakan",
    employeeId: form.personId,
    personId: form.personId,
    date: form.date,
    adjustmentType: form.type,
    type: form.type,
    hourOrDay: num(form.hours),
    hours: num(form.hours),
    amount: isOvertime && !form.amountManual ? calculatedAmount : num(form.amount),
    amountManual: isOvertime ? form.amountManual === true : true,
    payrollEffect: ADDITION_TYPES.has(form.type) ? "Bordroya ekle" : "Bordrodan düş",
    status: form.status || "Onaylı",
    note: form.note.trim(),
  };
}

function leavePayload(form, company) {
  return {
    mainCompanyId: company?.slug || company?.id || "mecit-hakan",
    employeeId: form.personId,
    personId: form.personId,
    recordType: form.type,
    type: form.type,
    startDate: form.start,
    endDate: form.end,
    dayCount: num(form.days),
    days: num(form.days),
    effectType: form.type === "Yıllık izin" ? "Yıllık izinden düş" : "Düşme",
    description: form.description.trim(),
    note: form.description.trim(),
  };
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? "ikop-field wide" : "ikop-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function MonthlyOperationsWorkspaceV2() {
  const { activeCompany } = useActiveCompany();
  const [host, setHost] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [period, setPeriod] = useState(CURRENT_PERIOD);
  const [people, setPeople] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingAdjustmentId, setEditingAdjustmentId] = useState("");
  const [editingLeaveId, setEditingLeaveId] = useState("");
  const [adjustmentForm, setAdjustmentForm] = useState({
    personId: "",
    date: TODAY,
    type: "Mesai",
    hours: 0,
    amount: 0,
    amountManual: false,
    note: "",
    status: "Onaylı",
  });
  const [leaveForm, setLeaveForm] = useState({
    personId: "",
    type: "Yıllık izin",
    start: TODAY,
    end: TODAY,
    days: 1,
    description: "",
  });
  const [payrollForm, setPayrollForm] = useState({
    salary: 0,
    roadAllowance: 0,
    overtimeHourlyBase: 225,
    paymentChannel: "Banka + Elden",
    bankAmount: 0,
  });

  const active = ACTIVE_PATHS.has(pathname);
  const companyId = activeCompany?.slug || activeCompany?.id || "mecit-hakan";
  const [year, month] = period.split("-").map(Number);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 250);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const resolve = () => setHost(document.querySelector(".main-content"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("ik-monthly-operations-active", active);
    return () => document.body.classList.remove("ik-monthly-operations-active");
  }, [active]);

  const load = useCallback(async () => {
    if (!active) return;
    setError("");
    try {
      const [personRows, adjustmentRows, leaveRows, holidayRows] = await Promise.all([
        getAylikPersonel({ mainCompanyId: companyId }),
        getAylikMesailer({ mainCompanyId: companyId, year, month }),
        getAylikIzinler({ mainCompanyId: companyId }),
        getResmiTatiller({ mainCompanyId: companyId, year }),
      ]);
      const nextPeople = Array.isArray(personRows) ? personRows : [];
      setPeople(nextPeople);
      setAdjustments((Array.isArray(adjustmentRows) ? adjustmentRows : []).map(normalizeAdjustment));
      setLeaves((Array.isArray(leaveRows) ? leaveRows : []).map(normalizeLeave));
      setHolidays(Array.isArray(holidayRows) ? holidayRows : []);
      setSelectedId((current) =>
        nextPeople.some((row) => row.id === current) ? current : nextPeople[0]?.id || "",
      );
    } catch (loadError) {
      setError(loadError?.message || "Aylık İK kayıtları yüklenemedi.");
    }
  }, [active, companyId, month, year]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = people.find((row) => row.id === selectedId) || null;
  const holidayDates = useMemo(
    () => new Set(holidays.filter((row) => row.active !== false).map((row) => dateOnly(row.date))),
    [holidays],
  );

  useEffect(() => {
    if (!selectedId) return;
    setAdjustmentForm((current) => ({ ...current, personId: selectedId }));
    setLeaveForm((current) => ({ ...current, personId: selectedId }));
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const sgkCovered = hasSgk(selected);
    setPayrollForm({
      salary: num(selected.salary),
      roadAllowance: num(selected.roadAllowance),
      overtimeHourlyBase: overtimeBase(selected),
      paymentChannel: sgkCovered
        ? selected.paymentChannel || selected.bankPaymentType || "Banka + Elden"
        : "Elden",
      bankAmount: sgkCovered ? num(selected.bankAmount) : 0,
    });
  }, [selected]);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return people.filter((person) =>
      `${personName(person)} ${person.personnelCode || person.code || ""} ${person.department || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(needle),
    );
  }, [people, query]);

  const selectedAdjustments = adjustments.filter(
    (row) => row.personId === selectedId && row.date.startsWith(period),
  );
  const selectedLeaves = leaves.filter(
    (row) => row.personId === selectedId && (row.start.startsWith(period) || row.end.startsWith(period)),
  );
  const additions = selectedAdjustments
    .filter((row) => ADDITION_TYPES.has(row.type))
    .reduce((sum, row) => sum + num(row.amount), 0);
  const deductions = selectedAdjustments
    .filter((row) => DEDUCTION_TYPES.has(row.type))
    .reduce((sum, row) => sum + num(row.amount), 0);
  const base = num(payrollForm.salary) + num(payrollForm.roadAllowance);
  const localNet = base + additions - deductions;
  const currentPayroll = payrollRows.find((row) => row.employeeId === selectedId) || null;
  const net = currentPayroll ? num(currentPayroll.totalAmount) : localNet;
  const bank = !hasSgk(selected) || payrollForm.paymentChannel === "Elden"
    ? 0
    : Math.min(net, num(currentPayroll?.bankAmount ?? payrollForm.bankAmount) || net);
  const cash = Math.max(net - bank, 0);
  const calculatedOvertime = selected
    ? overtimePreview(selected, adjustmentForm.hours, adjustmentForm.date, holidayDates)
    : 0;
  const multiplier = overtimeMultiplier(adjustmentForm.date, holidayDates);
  const holidayName = holidays.find((row) => dateOnly(row.date) === adjustmentForm.date)?.name || "";

  const resetAdjustment = () => {
    setEditingAdjustmentId("");
    setAdjustmentForm({
      personId: selectedId,
      date: TODAY,
      type: "Mesai",
      hours: 0,
      amount: 0,
      amountManual: false,
      note: "",
      status: "Onaylı",
    });
  };

  const saveAdjustment = async () => {
    if (!selected || !adjustmentForm.personId) {
      setError("Personel seçimi zorunludur.");
      return;
    }
    const amount = adjustmentForm.type === "Mesai" && !adjustmentForm.amountManual
      ? calculatedOvertime
      : num(adjustmentForm.amount);
    if (adjustmentForm.type === "Mesai" && num(adjustmentForm.hours) <= 0) {
      setError("Mesai saati sıfırdan büyük olmalıdır.");
      return;
    }
    if (adjustmentForm.type !== "Mesai" && amount <= 0) {
      setError("İşlem tutarı sıfırdan büyük olmalıdır.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = adjustmentPayload(adjustmentForm, activeCompany, calculatedOvertime);
      const saved = editingAdjustmentId
        ? await updateAylikMesai(editingAdjustmentId, payload)
        : await saveAylikMesai(payload);
      const normalized = normalizeAdjustment(
        saved || { ...adjustmentForm, amount, id: editingAdjustmentId || crypto.randomUUID() },
      );
      setAdjustments((current) =>
        editingAdjustmentId
          ? current.map((row) => (row.id === editingAdjustmentId ? normalized : row))
          : [normalized, ...current],
      );
      resetAdjustment();
      setNotice("Aylık işlem kaydedildi ve bordroya bağlandı.");
    } catch (saveError) {
      setError(saveError?.message || "İşlem kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const removeAdjustment = async (id) => {
    setBusy(true);
    setError("");
    try {
      await deleteAylikMesai(id);
      setAdjustments((current) => current.filter((row) => row.id !== id));
      setNotice("İşlem silindi.");
    } catch (deleteError) {
      setError(deleteError?.message || "İşlem silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const resetLeave = () => {
    setEditingLeaveId("");
    setLeaveForm({
      personId: selectedId,
      type: "Yıllık izin",
      start: TODAY,
      end: TODAY,
      days: 1,
      description: "",
    });
  };

  const saveLeave = async () => {
    if (!leaveForm.personId || num(leaveForm.days) <= 0) {
      setError("Personel ve izin günü zorunludur.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = leavePayload(leaveForm, activeCompany);
      const saved = editingLeaveId
        ? await updateAylikIzin(editingLeaveId, payload)
        : await saveAylikIzin(payload);
      const normalized = normalizeLeave(
        saved || { ...leaveForm, id: editingLeaveId || crypto.randomUUID() },
      );
      setLeaves((current) =>
        editingLeaveId
          ? current.map((row) => (row.id === editingLeaveId ? normalized : row))
          : [normalized, ...current],
      );
      resetLeave();
      setNotice("İzin kaydı kaydedildi.");
    } catch (saveError) {
      setError(saveError?.message || "İzin kaydı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const removeLeave = async (id) => {
    setBusy(true);
    setError("");
    try {
      await deleteAylikIzin(id);
      setLeaves((current) => current.filter((row) => row.id !== id));
      setNotice("İzin kaydı silindi.");
    } catch (deleteError) {
      setError(deleteError?.message || "İzin kaydı silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const savePayrollSettings = async () => {
    if (!selected) return null;
    const sgkCovered = hasSgk(selected);
    const payload = {
      salary: num(payrollForm.salary),
      roadAllowance: num(payrollForm.roadAllowance),
      overtimeHourlyBase: num(payrollForm.overtimeHourlyBase) === 300 ? 300 : 225,
      overtimeBaseHours: num(payrollForm.overtimeHourlyBase) === 300 ? 300 : 225,
      paymentChannel: sgkCovered ? payrollForm.paymentChannel : "Elden",
      bankPaymentType: sgkCovered ? payrollForm.paymentChannel : "Elden",
      bankAmount: sgkCovered && payrollForm.paymentChannel !== "Elden"
        ? num(payrollForm.bankAmount)
        : 0,
      sgkStatus: sgkCovered ? "VAR" : "YOK",
    };
    const saved = await updateAylikPersonel(selected.id, payload);
    setPeople((current) =>
      current.map((row) => (row.id === selected.id ? { ...row, ...payload, ...(saved || {}) } : row)),
    );
    return saved;
  };

  const calculatePayroll = async ({ save = false } = {}) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await savePayrollSettings();
      const rows = await hesaplaBordro({ mainCompanyId: companyId, year, month });
      const normalizedRows = Array.isArray(rows) ? rows : [];
      setPayrollRows(normalizedRows);
      if (save) {
        await olusturBordro({ mainCompanyId: companyId, year, month, rows: normalizedRows });
        setNotice(`${period} bordrosu kaydedildi. Resmî ödeme onayı ayrıca verilmelidir.`);
      } else {
        setNotice(`${period} bordrosu yeniden hesaplandı.`);
      }
    } catch (payrollError) {
      setError(payrollError?.message || "Bordro hesaplanamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (!active || !host) return null;
  const screen = pathname.includes("puantaj-izin")
    ? "leave"
    : pathname.includes("bordro-odeme")
      ? "payroll"
      : "adjustment";

  return createPortal(
    <section className="ikop-workspace">
      <header className="ikop-header">
        <div>
          <span>AYLIK İK</span>
          <h1>
            {screen === "adjustment"
              ? "Mesai · Avans · Kesinti"
              : screen === "leave"
                ? "Yıllık İzin / Günlük Durum"
                : "Bordro & Ödeme"}
          </h1>
          <p>SGK, maaş, yol, izin, mesai, avans, banka ve elden ödeme tek bordro zincirinde.</p>
        </div>
        <Field label="Dönem">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </Field>
      </header>

      {notice ? <div className="ikop-notice"><Save size={16} />{notice}</div> : null}
      {error ? <div className="ikop-error"><CircleAlert size={16} />{error}</div> : null}

      <div className="ikop-layout">
        <aside className="ikop-people">
          <label>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel ara" />
          </label>
          <div>
            {filteredPeople.map((person) => (
              <button
                type="button"
                key={person.id}
                className={person.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(person.id)}
              >
                <UserRound size={17} />
                <span>
                  <strong>{personName(person)}</strong>
                  <small>
                    {person.personnelCode || person.code || "Kodsuz"} · {hasSgk(person) ? "SGK VAR" : "SGK YOK"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="ikop-main">
          {!selected ? (
            <div className="ikop-empty">Aylık personel kaydı bulunamadı.</div>
          ) : (
            <>
              <div className="ikop-person-head">
                <div>
                  <strong>{personName(selected)}</strong>
                  <span>{selected.department || "-"} · {selected.title || "-"}</span>
                </div>
                <em>{hasSgk(selected) ? "SGK VAR · BANKA + ELDEN" : "SGK YOK · TAMAMI ELDEN"}</em>
              </div>

              <div className="ikop-stats">
                <div><WalletCards /><span>Maaş + yol<strong>{money(base)}</strong></span></div>
                <div><Plus /><span>Mesai / ek ödeme<strong>{money(additions)}</strong></span></div>
                <div><MinusCircle /><span>Avans / kesinti<strong>{money(deductions)}</strong></span></div>
                <div><Banknote /><span>Net hakediş<strong>{money(net)}</strong></span></div>
              </div>

              {screen === "adjustment" ? (
                <>
                  <section className="ikop-card">
                    <h2><Clock3 size={19} />Yeni aylık işlem</h2>
                    <div className="ikop-form">
                      <Field label="Tarih">
                        <input
                          type="date"
                          value={adjustmentForm.date}
                          onChange={(event) => setAdjustmentForm({ ...adjustmentForm, date: event.target.value })}
                        />
                      </Field>
                      <Field label="İşlem türü">
                        <select
                          value={adjustmentForm.type}
                          onChange={(event) => setAdjustmentForm({
                            ...adjustmentForm,
                            type: event.target.value,
                            amount: 0,
                            amountManual: false,
                          })}
                        >
                          <option>Mesai</option>
                          <option>Prim</option>
                          <option>Ek ödeme</option>
                          <option>Maaş farkı</option>
                          <option>Yol farkı</option>
                          <option>Avans</option>
                          <option>Kesinti</option>
                          <option>Devamsızlık</option>
                        </select>
                      </Field>
                      <Field label={adjustmentForm.type === "Mesai" ? "Mesai saati" : "Saat / gün"}>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={adjustmentForm.hours}
                          onChange={(event) => setAdjustmentForm({ ...adjustmentForm, hours: event.target.value })}
                        />
                      </Field>
                      {adjustmentForm.type === "Mesai" ? (
                        <>
                          <Field label="Saat tabanı">
                            <input value={`${overtimeBase(selected)} saat`} disabled />
                          </Field>
                          <Field label="Mesai çarpanı">
                            <input value={`×${multiplier}${holidayName ? ` · ${holidayName}` : ""}`} disabled />
                          </Field>
                          <Field label="Hesaplanan tutar">
                            <input value={money(calculatedOvertime)} disabled />
                          </Field>
                          <Field label="Tutar modu">
                            <select
                              value={adjustmentForm.amountManual ? "MANUAL" : "AUTO"}
                              onChange={(event) => setAdjustmentForm({
                                ...adjustmentForm,
                                amountManual: event.target.value === "MANUAL",
                                amount: event.target.value === "MANUAL" ? calculatedOvertime : 0,
                              })}
                            >
                              <option value="AUTO">Otomatik formül</option>
                              <option value="MANUAL">Elle düzelt</option>
                            </select>
                          </Field>
                        </>
                      ) : null}
                      <Field label="Tutar">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={adjustmentForm.type === "Mesai" && !adjustmentForm.amountManual}
                          value={
                            adjustmentForm.type === "Mesai" && !adjustmentForm.amountManual
                              ? calculatedOvertime
                              : adjustmentForm.amount
                          }
                          onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })}
                        />
                      </Field>
                      <Field label="Açıklama" wide>
                        <textarea
                          value={adjustmentForm.note}
                          onChange={(event) => setAdjustmentForm({ ...adjustmentForm, note: event.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="ikop-actions">
                      <button type="button" className="primary" onClick={saveAdjustment} disabled={busy}>
                        <Save size={16} />{editingAdjustmentId ? "Güncelle" : "Kaydet"}
                      </button>
                      {editingAdjustmentId ? <button type="button" onClick={resetAdjustment}>İptal</button> : null}
                    </div>
                  </section>

                  <section className="ikop-card">
                    <h2><ReceiptText size={19} />Dönem işlem geçmişi</h2>
                    <div className="ikop-table">
                      <table>
                        <thead><tr><th>Tarih</th><th>Tür</th><th>Saat/Gün</th><th>Tutar</th><th>Açıklama</th><th /></tr></thead>
                        <tbody>
                          {selectedAdjustments.map((row) => (
                            <tr key={row.id}>
                              <td>{row.date}</td><td>{row.type}</td><td>{row.hours || "-"}</td>
                              <td>{money(row.amount)}</td><td>{row.note || "-"}</td>
                              <td>
                                <button type="button" onClick={() => {
                                  setEditingAdjustmentId(row.id);
                                  setAdjustmentForm({ ...row, amountManual: true });
                                }}>Düzenle</button>
                                <button type="button" className="danger" onClick={() => removeAdjustment(row.id)}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              {screen === "leave" ? (
                <>
                  <section className="ikop-card">
                    <h2><CalendarDays size={19} />İzin kaydı</h2>
                    <div className="ikop-form">
                      <Field label="İzin türü">
                        <select value={leaveForm.type} onChange={(event) => setLeaveForm({ ...leaveForm, type: event.target.value })}>
                          <option>Yıllık izin</option><option>Rapor</option><option>Ücretsiz izin</option>
                          <option>Mazeret izni</option><option>Doğum izni</option><option>Ölüm izni</option>
                        </select>
                      </Field>
                      <Field label="Başlangıç">
                        <input
                          type="date"
                          value={leaveForm.start}
                          onChange={(event) => {
                            const start = event.target.value;
                            setLeaveForm({ ...leaveForm, start, days: inclusiveDays(start, leaveForm.end) || 1 });
                          }}
                        />
                      </Field>
                      <Field label="Bitiş">
                        <input
                          type="date"
                          value={leaveForm.end}
                          onChange={(event) => {
                            const end = event.target.value;
                            setLeaveForm({ ...leaveForm, end, days: inclusiveDays(leaveForm.start, end) || 1 });
                          }}
                        />
                      </Field>
                      <Field label="Gün">
                        <input type="number" min="0.5" step="0.5" value={leaveForm.days} onChange={(event) => setLeaveForm({ ...leaveForm, days: event.target.value })} />
                      </Field>
                      <Field label="Açıklama" wide>
                        <textarea value={leaveForm.description} onChange={(event) => setLeaveForm({ ...leaveForm, description: event.target.value })} />
                      </Field>
                    </div>
                    <div className="ikop-actions">
                      <button type="button" className="primary" onClick={saveLeave} disabled={busy}>
                        <Save size={16} />{editingLeaveId ? "Güncelle" : "Kaydet"}
                      </button>
                      {editingLeaveId ? <button type="button" onClick={resetLeave}>İptal</button> : null}
                    </div>
                  </section>

                  <section className="ikop-card">
                    <h2><CalendarDays size={19} />İzin ve bakiye kontrolü</h2>
                    <div className="ikop-payroll-grid">
                      <div><span>Yıllık hak</span><strong>{num(selected.annualLeaveEntitlement || 14)} gün</strong></div>
                      <div><span>Devreden</span><strong>{num(selected.annualLeaveCarryover)} gün</strong></div>
                      <div><span>Bu dönem izin</span><strong>{selectedLeaves.reduce((sum, row) => sum + num(row.days), 0)} gün</strong></div>
                      <div className="net"><span>Tahmini kalan</span><strong>{Math.max(0, num(selected.annualLeaveEntitlement || 14) + num(selected.annualLeaveCarryover) - leaves.filter((row) => row.personId === selectedId && row.type === "Yıllık izin").reduce((sum, row) => sum + num(row.days), 0))} gün</strong></div>
                    </div>
                    <div className="ikop-table">
                      <table>
                        <thead><tr><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Açıklama</th><th /></tr></thead>
                        <tbody>
                          {selectedLeaves.map((row) => (
                            <tr key={row.id}>
                              <td>{row.type}</td><td>{row.start}</td><td>{row.end}</td><td>{row.days}</td><td>{row.description || "-"}</td>
                              <td>
                                <button type="button" onClick={() => { setEditingLeaveId(row.id); setLeaveForm(row); }}>Düzenle</button>
                                <button type="button" className="danger" onClick={() => removeLeave(row.id)}><Trash2 size={14} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              {screen === "payroll" ? (
                <>
                  <section className="ikop-card">
                    <h2><ReceiptText size={19} />Bordro temel bilgileri</h2>
                    <div className="ikop-form">
                      <Field label="Maaş"><input type="number" value={payrollForm.salary} onChange={(event) => setPayrollForm({ ...payrollForm, salary: event.target.value })} /></Field>
                      <Field label="Yol"><input type="number" value={payrollForm.roadAllowance} onChange={(event) => setPayrollForm({ ...payrollForm, roadAllowance: event.target.value })} /></Field>
                      <Field label="Mesai saat tabanı">
                        <select value={payrollForm.overtimeHourlyBase} onChange={(event) => setPayrollForm({ ...payrollForm, overtimeHourlyBase: Number(event.target.value) })}>
                          <option value="225">225 saat</option><option value="300">300 saat</option>
                        </select>
                      </Field>
                      <Field label="SGK durumu"><input value={hasSgk(selected) ? "SGK VAR" : "SGK YOK"} disabled /></Field>
                      <Field label="Ödeme şekli">
                        <select
                          value={hasSgk(selected) ? payrollForm.paymentChannel : "Elden"}
                          disabled={!hasSgk(selected)}
                          onChange={(event) => setPayrollForm({ ...payrollForm, paymentChannel: event.target.value })}
                        >
                          <option>Banka + Elden</option><option>Banka</option><option>Elden</option>
                        </select>
                      </Field>
                      <Field label="Banka tutarı">
                        <input
                          type="number"
                          disabled={!hasSgk(selected) || payrollForm.paymentChannel === "Elden"}
                          value={hasSgk(selected) ? payrollForm.bankAmount : 0}
                          onChange={(event) => setPayrollForm({ ...payrollForm, bankAmount: event.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="ikop-actions">
                      <button type="button" onClick={() => calculatePayroll()} disabled={busy}>Bordroyu Hesapla</button>
                      <button type="button" className="primary" onClick={() => calculatePayroll({ save: true })} disabled={busy}>
                        <Save size={16} />Bordro Taslağını Kaydet
                      </button>
                    </div>
                  </section>

                  <section className="ikop-card payroll">
                    <h2><ReceiptText size={19} />Aylık bordro özeti</h2>
                    <div className="ikop-payroll-grid">
                      <div><span>Maaş</span><strong>{money(currentPayroll?.salary ?? payrollForm.salary)}</strong></div>
                      <div><span>Yol</span><strong>{money(currentPayroll?.roadAllowance ?? payrollForm.roadAllowance)}</strong></div>
                      <div><span>Mesai</span><strong>{money(currentPayroll?.overtimeAmount ?? additions)}</strong></div>
                      <div><span>Prim</span><strong>{money(currentPayroll?.premiumAmount)}</strong></div>
                      <div><span>Avans</span><strong>-{money(currentPayroll?.advanceAmount)}</strong></div>
                      <div><span>Kesinti</span><strong>-{money(currentPayroll?.deductionAmount ?? deductions)}</strong></div>
                      <div><span>İzin kaydı</span><strong>{selectedLeaves.reduce((sum, row) => sum + num(row.days), 0)} gün</strong></div>
                      <div className="net"><span>Net ödeme</span><strong>{money(net)}</strong></div>
                      <div><span>Banka</span><strong>{money(bank)}</strong></div>
                      <div><span>Elden</span><strong>{money(cash)}</strong></div>
                    </div>
                    <div className="ikop-payroll-note">
                      Hafta içi mesai maaş / 225 veya 300 × saat × 1,5; hafta sonu ve resmî tatil ×2 hesaplanır. SGK’sız personelin banka tutarı zorunlu olarak sıfırdır. Bu ekran yalnız bordro taslağını kaydeder; resmî ödeme onayı ayrıca verilir.
                    </div>
                  </section>

                  <section className="ikop-card">
                    <h2><ReceiptText size={19} />Bordroya giren kayıtlar</h2>
                    <div className="ikop-table">
                      <table>
                        <thead><tr><th>Tarih</th><th>Tür</th><th>Saat/Gün</th><th>Tutar</th><th>Açıklama</th></tr></thead>
                        <tbody>
                          {selectedAdjustments.map((row) => (
                            <tr key={row.id}><td>{row.date}</td><td>{row.type}</td><td>{row.hours || "-"}</td><td>{money(row.amount)}</td><td>{row.note || "-"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}
            </>
          )}
        </main>
      </div>
    </section>,
    host,
  );
}
