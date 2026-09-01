import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPdksTimeEvent,
  assignPdksService,
  assignPdksWorkGroup,
  closePdksPeriod,
  getPdksAdvancedMonth,
  getPdksAttendance,
  getPdksAuditLogs,
  getPdksHolidays,
  getPdksLeaveCenter,
  getPdksMasters,
  getPdksPayroll,
  getPdksPeople,
  getPdksProfile,
  savePdksDayOverride,
  savePdksFinanceMovement,
  savePdksHoliday,
  savePdksLeave,
  savePdksService,
  savePdksWorkGroup,
} from "../../services/pdksApi";
import { confirmIkAdvancedCard, previewIkAdvancedCard } from "../../services/ikApi";
import "./pdks.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - 8 + i);
const safe = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const isoToday = () => new Date().toISOString().slice(0, 10);
const periodKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function csvCell(value) {
  const raw = String(value ?? "");
  return /[;"\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadCsv(name, rows) {
  const body = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Card({ label, value, tone = "" }) {
  return <div className={`pdks-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ children = "Kayıt yok." }) {
  return <div className="pdks-empty">{children}</div>;
}

function DataTable({ columns, rows, rowKey = "id", onRowClick }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="pdks-table-wrap">
      <table className="pdks-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row[rowKey] || `${rowKey}-${index}`} onClick={() => onRowClick?.(row)} className={onRowClick ? "clickable" : ""}>
            {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function PdksPageV2({ activeTab = "ana-ekran", activeMainCompany, isAuditAccount = false, openModule }) {
  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState([]);
  const [masters, setMasters] = useState({ groups: [], services: [], groupAssignments: [], serviceAssignments: [] });
  const [selectedId, setSelectedId] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [monthData, setMonthData] = useState({});
  const [payroll, setPayroll] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [leaveCenter, setLeaveCenter] = useState({ plans: [] });
  const [logs, setLogs] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [eventForm, setEventForm] = useState({ date: isoToday(), time: "08:30", direction: "AUTO" });
  const [override, setOverride] = useState({ date: isoToday(), status: "CALISTI", entry: "08:30", exit: "19:00", note: "PDKS düzeltme" });
  const [advance, setAdvance] = useState({ date: isoToday(), amount: "", note: "PDKS avans" });
  const [leave, setLeave] = useState({ startDate: isoToday(), endDate: isoToday(), type: "YILLIK_IZIN", note: "PDKS izin" });
  const [holiday, setHoliday] = useState({ date: "", name: "", halfDay: false });
  const [groupForm, setGroupForm] = useState({ code: "", name: "", entryTime: "08:30", exitTime: "19:00", lateTolerance: 5, earlyTolerance: 10, active: true });
  const [serviceForm, setServiceForm] = useState({ code: "", name: "", routeNote: "", active: true });
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [cardPreview, setCardPreview] = useState(null);
  const cardFile = useRef(null);

  const audit = Boolean(profile?.audit || masters?.audit || isAuditAccount);
  const canWrite = !audit;
  const selected = people.find((person) => person.id === selectedId) || people[0] || null;
  const groups = safe(masters?.groups);
  const services = safe(masters?.services);
  const groupAssignments = safe(masters?.groupAssignments);
  const serviceAssignments = safe(masters?.serviceAssignments);

  const run = useCallback(async (message, action) => {
    setBusy(true); setError(""); setNotice(message || "");
    try { await action(); }
    catch (e) { setError(e?.message || "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }, []);

  const loadCore = useCallback(async () => {
    const nextProfile = await getPdksProfile();
    const [nextPeople, nextMasters] = await Promise.all([getPdksPeople(), getPdksMasters({ mainCompanyId: companyId })]);
    const list = safe(nextPeople);
    setProfile(nextProfile || null);
    setPeople(list);
    setMasters(nextMasters || { groups: [], services: [], groupAssignments: [], serviceAssignments: [] });
    setSelectedId((old) => list.some((person) => person.id === old) ? old : list[0]?.id || "");
    return Boolean(nextProfile?.audit || nextMasters?.audit || isAuditAccount);
  }, [companyId, isAuditAccount]);

  const loadFullMonth = useCallback(async () => {
    const [advanced, nextPayroll, nextHolidays, nextLeaves, nextLogs] = await Promise.all([
      getPdksAdvancedMonth({ mainCompanyId: companyId, year, month }),
      getPdksPayroll({ mainCompanyId: companyId, year, month }),
      getPdksHolidays({ year, mainCompanyId: companyId }),
      getPdksLeaveCenter({ mainCompanyId: companyId, from: `${year}-01-01`, to: `${year}-12-31` }),
      getPdksAuditLogs({ mainCompanyId: companyId, period: periodKey(year, month), limit: 200 }),
    ]);
    setMonthData(advanced || {});
    setPayroll(nextPayroll || {});
    setHolidays(safe(nextHolidays));
    setLeaveCenter(nextLeaves || { plans: [] });
    setLogs(safe(nextLogs));
  }, [companyId, month, year]);

  const loadSelectedAttendance = useCallback(async (personId = selected?.id) => {
    if (!personId) { setAttendance([]); return; }
    const result = await getPdksAttendance(personId, year, month);
    setAttendance(safe(result?.days));
  }, [month, selected?.id, year]);

  const refresh = useCallback(() => run("KY ERP D1 verisi yenileniyor...", async () => {
    const isAudit = await loadCore();
    if (isAudit) {
      setMonthData({}); setPayroll({}); setHolidays([]); setLeaveCenter({ plans: [] }); setLogs([]);
    } else {
      await loadFullMonth();
    }
    setNotice("Web PDKS güncel D1 verisine bağlandı.");
  }), [loadCore, loadFullMonth, run]);

  useEffect(() => { refresh(); }, [companyId, month, year]);
  useEffect(() => { run("Kart puantajı yükleniyor...", async () => { await loadSelectedAttendance(); setNotice(""); }); }, [loadSelectedAttendance, run]);

  useEffect(() => {
    if (!selected?.id) return;
    setSelectedGroupId(groupAssignments.find((row) => row.employeeId === selected.id)?.groupId || groups.find((row) => String(row.code).toUpperCase() === "NORMAL")?.id || "");
    setSelectedServiceId(serviceAssignments.find((row) => row.employeeId === selected.id)?.serviceId || "");
  }, [groupAssignments, groups, selected?.id, serviceAssignments]);

  const loadAllSummaries = () => run("Aylık puantaj sonuçları D1'den hesaplanıyor...", async () => {
    const rows = [];
    for (let index = 0; index < people.length; index += 4) {
      const batch = people.slice(index, index + 4);
      const results = await Promise.all(batch.map(async (person) => ({ person, data: await getPdksAttendance(person.id, year, month) })));
      results.forEach(({ person, data }) => rows.push({
        id: person.id,
        personnelCode: person.personnelCode || person.code || "",
        fullName: person.fullName,
        department: person.department || "",
        cardNo: person.cardNo || "",
        ...(data?.summary || {}),
      }));
    }
    setSummaryRows(rows);
    setNotice(`${rows.length} personelin ${MONTHS[month - 1]} ${year} puantajı D1'den hesaplandı.`);
  });

  const addEvent = () => run("Kart hareketi D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı kart hareketi yazamaz.");
    if (!selected) throw new Error("Personel seçin.");
    await addPdksTimeEvent(selected.id, { cardNo: selected.cardNo, workDate: eventForm.date, eventTime: eventForm.time, direction: eventForm.direction, source: "KYERP_WEB_PDKS", note: "KY ERP Web PDKS" });
    await loadSelectedAttendance(selected.id);
    setNotice("Kart hareketi tek D1 kaydına işlendi. Windows PDKS aynı kaydı görecek.");
  });

  const saveOverride = () => run("Puantaj düzeltmesi D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı puantaj değiştiremez.");
    if (!selected) throw new Error("Personel seçin.");
    const inMinutes = override.entry ? Number(override.entry.slice(0, 2)) * 60 + Number(override.entry.slice(3, 5)) : null;
    const outMinutes = override.exit ? Number(override.exit.slice(0, 2)) * 60 + Number(override.exit.slice(3, 5)) : null;
    await savePdksDayOverride(selected.id, {
      workDate: override.date,
      status: override.status,
      entry: override.entry || null,
      exit: override.exit || null,
      lateMinutes: inMinutes === null ? 0 : Math.max(0, inMinutes - 515),
      earlyMinutes: outMinutes === null ? 0 : Math.max(0, 1130 - outMinutes),
      overtimeMinutes: outMinutes === null ? 0 : Math.max(0, outMinutes - 1140),
      missingPunch: override.status === "EKSIK_BASIM",
      note: override.note,
    });
    await loadSelectedAttendance(selected.id);
    setNotice("Puantaj düzeltmesi D1'e işlendi.");
  });

  const saveAdvance = () => run("Avans D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı avans kaydedemez.");
    if (!selected || num(advance.amount) <= 0) throw new Error("Personel ve tutar zorunludur.");
    await savePdksFinanceMovement({ mainCompanyId: companyId, employeeId: selected.id, date: advance.date, adjustmentType: "Avans", amount: num(advance.amount), paymentMethod: "Elden", payrollEffect: "Bordrodan düş", note: advance.note, status: "APPROVED" });
    setAdvance((current) => ({ ...current, amount: "" }));
    await loadFullMonth();
    setNotice("Avans İK Bordro ile aynı D1 finans hareketine işlendi.");
  });

  const saveLeave = () => run("İzin D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı izin kaydedemez.");
    if (!selected) throw new Error("Personel seçin.");
    if (leave.endDate < leave.startDate) throw new Error("İzin bitiş tarihi başlangıçtan önce olamaz.");
    const annual = leave.type === "YILLIK_IZIN";
    await savePdksLeave(annual ? {
      mainCompanyId: companyId, employeeId: selected.id, recordType: "Yıllık izin", startDate: leave.startDate,
      returnDate: addDays(leave.endDate, 1), status: "APPROVED", effectType: "Ücretli", note: leave.note,
      allowDepartmentConflict: false,
    } : {
      mainCompanyId: companyId, employeeId: selected.id, recordType: "İzin", startDate: leave.startDate,
      endDate: leave.endDate, status: "APPROVED", effectType: "Kayıt", note: leave.note,
    });
    await loadFullMonth();
    await loadSelectedAttendance(selected.id);
    setNotice("İzin KY ERP D1'e işlendi.");
  });

  const closePeriod = () => run("D1 ay sonu kontrolleri çalışıyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı dönem kapatamaz.");
    const result = await closePdksPeriod({ mainCompanyId: companyId, year, month, lock: true, reason: "KY ERP Web PDKS kontrollü kapanış" });
    if (result?.blockingCount) throw new Error(`${result.blockingCount} açık kontrol nedeniyle dönem kapanmadı.`);
    setNotice(`${MONTHS[month - 1]} ${year} D1 üzerinde kilitlendi.`);
  });

  const saveHoliday = () => run("Tatil D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı tatil değiştiremez.");
    if (!holiday.date || !holiday.name.trim()) throw new Error("Tarih ve tatil adı zorunludur.");
    await savePdksHoliday({ mainCompanyId: companyId, date: holiday.date, name: holiday.name.trim(), halfDay: holiday.halfDay });
    setHoliday({ date: "", name: "", halfDay: false });
    await loadFullMonth();
    setNotice("Resmî tatil D1'e kaydedildi.");
  });

  const saveGroup = () => run("Vardiya D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı vardiya değiştiremez.");
    if (!groupForm.name.trim()) throw new Error("Vardiya adı zorunludur.");
    await savePdksWorkGroup(groupForm);
    const next = await getPdksMasters({ mainCompanyId: companyId });
    setMasters(next || {});
    setGroupForm({ code: "", name: "", entryTime: "08:30", exitTime: "19:00", lateTolerance: 5, earlyTolerance: 10, active: true });
    setNotice("Vardiya D1'e kaydedildi; Web ve Windows için tek tanımdır.");
  });

  const assignGroup = () => run("Personel vardiyası D1'e atanıyor...", async () => {
    if (!canWrite || !selected || !selectedGroupId) throw new Error("Personel ve vardiya seçin.");
    await assignPdksWorkGroup(selected.id, selectedGroupId);
    setMasters(await getPdksMasters({ mainCompanyId: companyId }) || {});
    setNotice(`${selected.fullName} vardiyası D1'e bağlandı.`);
  });

  const saveService = () => run("Servis D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı servis değiştiremez.");
    if (!serviceForm.name.trim()) throw new Error("Servis adı zorunludur.");
    await savePdksService(serviceForm);
    setMasters(await getPdksMasters({ mainCompanyId: companyId }) || {});
    setServiceForm({ code: "", name: "", routeNote: "", active: true });
    setNotice("Servis D1'e kaydedildi.");
  });

  const assignService = () => run("Personel servisi D1'e atanıyor...", async () => {
    if (!canWrite || !selected || !selectedServiceId) throw new Error("Personel ve servis seçin.");
    await assignPdksService(selected.id, selectedServiceId);
    setMasters(await getPdksMasters({ mainCompanyId: companyId }) || {});
    setNotice(`${selected.fullName} servisi D1'e bağlandı.`);
  });

  const previewCardFile = () => run("Kart dosyası önizleniyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı kart dosyası işleyemez.");
    const file = cardFile.current?.files?.[0];
    if (!file) throw new Error("Kart dosyası seçin.");
    const result = await previewIkAdvancedCard(file, { mainCompanyId: companyId, year, month });
    setCardPreview(result || null);
    setNotice("Kart dosyası önizlendi; henüz D1'e yazılmadı.");
  });

  const confirmCardFile = () => run("Kart dosyası D1'e işleniyor...", async () => {
    if (!canWrite || !cardPreview) throw new Error("Önce kart dosyasını önizleyin.");
    await confirmIkAdvancedCard({ mainCompanyId: companyId, year, month, importId: cardPreview.importId || cardPreview.id, rows: cardPreview.rows || cardPreview.items || [] });
    setCardPreview(null);
    await loadSelectedAttendance();
    setNotice("Kart dosyası D1'e işlendi.");
  });

  const exportAuditYear = () => run(`${year} denetim TEMP D1'den hazırlanıyor...`, async () => {
    const rows = [["Personel Kodu", "Ad Soyad", "Kart No", "Bölüm", "Tarih", "Durum", "Giriş", "Çıkış", "Geç", "Erken", "Fazla", "Basım", "Not"]];
    for (let m = 1; m <= 12; m += 1) {
      for (let index = 0; index < people.length; index += 4) {
        const batch = people.slice(index, index + 4);
        const results = await Promise.all(batch.map(async (person) => ({ person, data: await getPdksAttendance(person.id, year, m) })));
        results.forEach(({ person, data }) => safe(data?.days).forEach((day) => rows.push([
          person.personnelCode || person.code || "", person.fullName, person.cardNo || "", person.department || "", day.date, day.status,
          day.entry || "", day.exit || "", day.lateMinutes || 0, day.earlyMinutes || 0, day.overtimeMinutes || 0, day.eventCount || 0, day.note || "",
        ])));
      }
    }
    downloadCsv(`PDKS_DENETIM_TEMP_${year}.csv`, rows);
    setNotice(`${year} TEMP yalnız SGK=VAR + kartlı personel D1 puantajından üretildi; finans alanı yok.`);
  });

  const adjustments = safe(monthData?.adjustments);
  const advances = adjustments.filter((row) => text(row.adjustmentType || row.type).toLocaleUpperCase("tr-TR").includes("AVANS"));
  const payrollLines = safe(payroll?.lines);
  const plans = safe(leaveCenter?.plans);
  const departments = useMemo(() => [...new Set(people.map((person) => text(person.department)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [people]);
  const titles = useMemo(() => [...new Set(people.map((person) => text(person.title)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [people]);
  const statuses = useMemo(() => [...new Set(people.map((person) => text(person.status)).filter(Boolean))], [people]);

  const personColumns = [
    { key: "personnelCode", label: "Kod", render: (row) => row.personnelCode || row.code || "" },
    { key: "fullName", label: "Ad Soyad" }, { key: "cardNo", label: "Kart No" }, { key: "department", label: "Bölüm" },
    { key: "title", label: "Görev" }, { key: "startDate", label: "İşe Giriş" }, { key: "exitDate", label: "İşten Çıkış" }, { key: "status", label: "Durum" },
  ];
  const attendanceColumns = [
    { key: "date", label: "Tarih" }, { key: "status", label: "Durum" }, { key: "entry", label: "Giriş" }, { key: "exit", label: "Çıkış" },
    { key: "lateMinutes", label: "Geç" }, { key: "earlyMinutes", label: "Erken" }, { key: "overtimeMinutes", label: "Fazla" }, { key: "eventCount", label: "Basım" }, { key: "note", label: "Not" },
  ];

  const PersonPicker = () => <select className="pdks-person-picker" value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.personnelCode || person.code} · {person.fullName} · {person.cardNo}</option>)}</select>;

  function renderCore() {
    if (activeTab === "ana-ekran") return <>
      <div className="pdks-stats"><Card label="SGK + Kart Personel" value={people.length}/><Card label="Kartlı Gün" value={attendance.filter((day) => ["CALISTI", "EKSIK_BASIM"].includes(day.status)).length} tone="ok"/><Card label="Eksik / Kart Yok" value={attendance.filter((day) => ["EKSIK_BASIM", "KART_YOK"].includes(day.status)).length} tone="warn"/><Card label="Vardiya" value={groups.length}/><Card label="Servis" value={services.length}/></div>
      <div className="pdks-grid two"><section className="pdks-panel"><h3>Hedef PDKS İş Akışı</h3><div className="pdks-flow"><button onClick={() => openModule?.("pdks", { tabKey: "bilgi-aktar" })}>1 Bilgi Aktar</button><button onClick={() => openModule?.("pdks", { tabKey: "giris-cikislar" })}>2 Giriş / Çıkış</button><button onClick={() => openModule?.("pdks", { tabKey: "puantaj" })}>3 Puantaj</button><button onClick={loadAllSummaries}>4 Sonuç</button><button onClick={closePeriod} disabled={!canWrite}>5 Dönem Kapat</button></div></section><section className="pdks-panel"><h3>Tek DATA</h3><p><b>Ana kaynak:</b> KY ERP D1</p><p><b>Windows SQLite:</b> yalnız ham kart, offline kuyruk, cache, log ve yedek</p><p><b>Denetim:</b> SGK=VAR + kartlı personel, salt okunur</p></section></div>
      <section className="pdks-panel"><h3>Seçili Personel · {selected?.fullName || "-"}</h3><PersonPicker/><DataTable columns={attendanceColumns} rows={attendance.slice(-14).reverse()} rowKey="date" /></section>
    </>;

    if (activeTab === "personel-bilgileri") return <section className="pdks-panel"><h3>Personel Bilgileri</h3><p>İK Personel Kartı ile aynı D1 kaydı. PDKS ikinci personel kartı oluşturmaz.</p><DataTable columns={personColumns} rows={people}/></section>;

    if (["giris-cikislar", "puantaj", "calisma-tarihi"].includes(activeTab)) return <>
      <section className="pdks-panel"><h3>{activeTab === "puantaj" ? "Puantaj" : activeTab === "calisma-tarihi" ? "Çalışma Tarihi" : "Giriş / Çıkışlar"}</h3><PersonPicker/></section>
      {activeTab === "giris-cikislar" && canWrite ? <section className="pdks-panel form-row"><input type="date" value={eventForm.date} onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })}/><input type="time" value={eventForm.time} onChange={(event) => setEventForm({ ...eventForm, time: event.target.value })}/><select value={eventForm.direction} onChange={(event) => setEventForm({ ...eventForm, direction: event.target.value })}><option>AUTO</option><option>IN</option><option>OUT</option></select><button className="primary-btn" onClick={addEvent}>D1 Kart Hareketi Ekle</button></section> : null}
      {activeTab === "puantaj" && canWrite ? <section className="pdks-panel form-row wrap"><input type="date" value={override.date} onChange={(event) => setOverride({ ...override, date: event.target.value })}/><select value={override.status} onChange={(event) => setOverride({ ...override, status: event.target.value })}>{["CALISTI", "EKSIK_BASIM", "KART_YOK", "IZIN", "YILLIK_IZIN", "RESMI_TATIL", "HAFTA_SONU", "DONEM_DISI"].map((status) => <option key={status}>{status}</option>)}</select><input type="time" value={override.entry} onChange={(event) => setOverride({ ...override, entry: event.target.value })}/><input type="time" value={override.exit} onChange={(event) => setOverride({ ...override, exit: event.target.value })}/><input value={override.note} onChange={(event) => setOverride({ ...override, note: event.target.value })}/><button className="primary-btn" onClick={saveOverride}>D1'e Kaydet</button></section> : null}
      <section className="pdks-panel"><DataTable columns={attendanceColumns} rows={attendance} rowKey="date" onRowClick={(row) => setOverride({ date: row.date, status: row.status || "CALISTI", entry: row.entry || "", exit: row.exit || "", note: row.note || "PDKS düzeltme" })}/></section>
    </>;

    if (activeTab === "puantaj-sonuclari") return <section className="pdks-panel"><div className="pdks-panel-title"><div><h3>Puantaj Sonuçları</h3><p>Tüm personel için D1 aylık hesap sonucu.</p></div><button onClick={loadAllSummaries}>Hesapla / Yenile</button></div><DataTable rows={summaryRows} columns={[{key:"personnelCode",label:"Kod"},{key:"fullName",label:"Personel"},{key:"department",label:"Bölüm"},{key:"workedDays",label:"Çalıştı"},{key:"annualLeaveDays",label:"Yıllık İzin"},{key:"missingPunchDays",label:"Eksik"},{key:"noPunchDays",label:"Kart Yok"},{key:"lateMinutes",label:"Geç Dk"},{key:"earlyMinutes",label:"Erken Dk"},{key:"overtimeMinutes",label:"Fazla Dk"}]}/></section>;

    if (activeTab === "izinler") return <><section className="pdks-panel"><h3>İzinler</h3><PersonPicker/>{canWrite ? <div className="form-row"><input type="date" value={leave.startDate} onChange={(event)=>setLeave({...leave,startDate:event.target.value})}/><input type="date" value={leave.endDate} onChange={(event)=>setLeave({...leave,endDate:event.target.value})}/><select value={leave.type} onChange={(event)=>setLeave({...leave,type:event.target.value})}><option value="YILLIK_IZIN">Yıllık İzin</option><option value="IZIN">İzin</option></select><input value={leave.note} onChange={(event)=>setLeave({...leave,note:event.target.value})}/><button onClick={saveLeave}>D1'e Kaydet</button></div> : null}</section><section className="pdks-panel"><DataTable rows={plans} columns={[{key:"startDate",label:"Başlangıç",render:(r)=>r.startDate||r.start_date},{key:"endDate",label:"Bitiş",render:(r)=>r.endDate||r.end_date},{key:"fullName",label:"Personel",render:(r)=>r.fullName||r.employeeName||r.employeeId},{key:"recordType",label:"Tür",render:(r)=>r.recordType||r.record_type},{key:"status",label:"Durum"},{key:"note",label:"Not"}]}/></section></>;

    if (activeTab === "avanslar") return <><section className="pdks-panel"><h3>Avanslar</h3>{audit ? <p className="pdks-warning">Denetim hesabında finans ekranı kapalıdır.</p> : <div className="form-row"><PersonPicker/><input type="date" value={advance.date} onChange={(event) => setAdvance({ ...advance, date: event.target.value })}/><input type="number" placeholder="Tutar" value={advance.amount} onChange={(event) => setAdvance({ ...advance, amount: event.target.value })}/><input value={advance.note} onChange={(event) => setAdvance({ ...advance, note: event.target.value })}/><button onClick={saveAdvance}>D1'e Kaydet</button></div>}</section>{!audit ? <section className="pdks-panel"><DataTable rows={advances} columns={[{key:"date",label:"Tarih"},{key:"employeeName",label:"Personel",render:(r)=>r.fullName||r.employeeName||r.employeeId},{key:"amount",label:"Tutar"},{key:"paymentMethod",label:"Ödeme"},{key:"note",label:"Not"}]}/></section> : null}</>;

    if (activeTab === "bordro") return <section className="pdks-panel"><h3>Bordro</h3>{audit ? <p className="pdks-warning">Denetim hesabında maaş, avans, banka ve elden ödeme gösterilmez.</p> : <DataTable rows={payrollLines} columns={[{key:"fullName",label:"Personel",render:(r)=>r.fullName||r.employee?.fullName||r.employeeId},{key:"salary",label:"Maaş",render:(r)=>r.salary||r.system?.salary||0},{key:"overtimeAmount",label:"Mesai",render:(r)=>r.overtimeAmount||r.system?.overtimeAmount||0},{key:"advanceAmount",label:"Avans",render:(r)=>r.advanceAmount||r.system?.advanceAmount||0},{key:"bankAmount",label:"Banka",render:(r)=>r.bankAmount||r.final?.bank||0},{key:"cashAmount",label:"Elden",render:(r)=>r.cashAmount||r.final?.cash||0},{key:"totalAmount",label:"Net",render:(r)=>r.totalAmount||r.final?.total||r.net||0}]}/>}</section>;

    if (activeTab === "bilgi-aktar") return <><section className="pdks-panel"><h3>Bilgi Aktar / Kart Makinesi</h3><p><b>Canlı yol:</b> Kart makinesi → Windows Agent → offline kuyruk → KY ERP D1 → Web + Windows.</p><p><b>Hedef/TR500:</b> Windows Agent mevcut <code>F:\Ekin\bilgi.dat</code> akışını dosyayı silmeden okur. FILE, TCP Server, TCP Client ve SERIAL/COM alternatifleri de devam eder.</p></section>{canWrite ? <section className="pdks-panel"><h3>Web Dosya Önizleme / Onay</h3><input ref={cardFile} type="file" accept=".txt,.csv,.dat,.xlsx,.xls"/><button onClick={previewCardFile}>Önizle</button>{cardPreview ? <><pre className="pdks-preview">{JSON.stringify(cardPreview, null, 2).slice(0,8000)}</pre><button className="primary-btn" onClick={confirmCardFile}>D1'e Onayla</button></> : null}</section> : null}</>;

    if (activeTab === "gruplar-vardiyalar" || activeTab === "puantaj-kurallari") return <><section className="pdks-panel"><h3>{activeTab === "puantaj-kurallari" ? "Puantaj Kuralları" : "Gruplar / Vardiyalar"}</h3><DataTable rows={groups} columns={[{key:"code",label:"Kod"},{key:"name",label:"Ad"},{key:"entryTime",label:"Giriş"},{key:"exitTime",label:"Çıkış"},{key:"lateTolerance",label:"Geç Tol."},{key:"earlyTolerance",label:"Erken Tol."},{key:"active",label:"Aktif",render:(r)=>Number(r.active)!==0?"Evet":"Hayır"}]}/></section>{canWrite ? <section className="pdks-panel"><h3>Vardiya Tanımı</h3><div className="form-row"><input placeholder="Kod" value={groupForm.code} onChange={(e)=>setGroupForm({...groupForm,code:e.target.value})}/><input placeholder="Ad" value={groupForm.name} onChange={(e)=>setGroupForm({...groupForm,name:e.target.value})}/><input type="time" value={groupForm.entryTime} onChange={(e)=>setGroupForm({...groupForm,entryTime:e.target.value})}/><input type="time" value={groupForm.exitTime} onChange={(e)=>setGroupForm({...groupForm,exitTime:e.target.value})}/><input type="number" title="Geç toleransı" value={groupForm.lateTolerance} onChange={(e)=>setGroupForm({...groupForm,lateTolerance:Number(e.target.value)})}/><input type="number" title="Erken çıkış toleransı" value={groupForm.earlyTolerance} onChange={(e)=>setGroupForm({...groupForm,earlyTolerance:Number(e.target.value)})}/><button onClick={saveGroup}>D1'e Kaydet</button></div><div className="form-row"><PersonPicker/><select value={selectedGroupId} onChange={(e)=>setSelectedGroupId(e.target.value)}><option value="">Vardiya seç</option>{groups.filter((g)=>Number(g.active)!==0).map((g)=><option key={g.id} value={g.id}>{g.name} · {g.entryTime}-{g.exitTime}</option>)}</select><button onClick={assignGroup}>Personele Ata</button></div></section> : null}</>;

    if (activeTab === "servisler") return <><section className="pdks-panel"><h3>Servisler</h3><DataTable rows={services} columns={[{key:"code",label:"Kod"},{key:"name",label:"Servis"},{key:"routeNote",label:"Güzergâh"},{key:"active",label:"Aktif",render:(r)=>Number(r.active)!==0?"Evet":"Hayır"}]}/></section>{canWrite ? <section className="pdks-panel"><div className="form-row"><input placeholder="Kod" value={serviceForm.code} onChange={(e)=>setServiceForm({...serviceForm,code:e.target.value})}/><input placeholder="Servis adı" value={serviceForm.name} onChange={(e)=>setServiceForm({...serviceForm,name:e.target.value})}/><input placeholder="Güzergâh/not" value={serviceForm.routeNote} onChange={(e)=>setServiceForm({...serviceForm,routeNote:e.target.value})}/><button onClick={saveService}>D1'e Kaydet</button></div><div className="form-row"><PersonPicker/><select value={selectedServiceId} onChange={(e)=>setSelectedServiceId(e.target.value)}><option value="">Servis seç</option>{services.filter((s)=>Number(s.active)!==0).map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button onClick={assignService}>Personele Ata</button></div></section> : null}</>;

    if (activeTab === "donemler") return <section className="pdks-panel"><h3>Dönemler</h3><p>Dönem kilidi tek D1 tablosunda tutulur. Windows ve Web aynı kilidi kullanır.</p><button className="danger-btn" disabled={!canWrite} onClick={closePeriod}>{MONTHS[month-1]} {year} Dönemini Kontrol Et ve Kapat</button></section>;

    if (activeTab === "tatiller") return <><section className="pdks-panel"><h3>Tatiller</h3>{canWrite ? <div className="form-row"><input type="date" value={holiday.date} onChange={(e)=>setHoliday({...holiday,date:e.target.value})}/><input placeholder="Tatil adı" value={holiday.name} onChange={(e)=>setHoliday({...holiday,name:e.target.value})}/><label><input type="checkbox" checked={holiday.halfDay} onChange={(e)=>setHoliday({...holiday,halfDay:e.target.checked})}/> Yarım gün</label><button onClick={saveHoliday}>D1'e Kaydet</button></div> : <p>Denetim hesabında tatil tanımları değiştirilemez.</p>}</section>{!audit ? <section className="pdks-panel"><DataTable rows={holidays} columns={[{key:"date",label:"Tarih"},{key:"name",label:"Tatil"},{key:"halfDay",label:"Yarım Gün",render:(r)=>r.halfDay?"Evet":"Hayır"}]}/></section> : null}</>;

    if (activeTab === "bolumler") return <section className="pdks-panel"><h3>Bölümler</h3><p>İK Personel Kartı alanıdır; ikinci PDKS bölüm tablosu yoktur.</p><DataTable rows={departments.map((name)=>({id:name,name,count:people.filter((p)=>p.department===name).length}))} columns={[{key:"name",label:"Bölüm"},{key:"count",label:"Kartlı Personel"}]}/></section>;
    if (activeTab === "gorevler") return <section className="pdks-panel"><h3>Görevler</h3><p>İK Personel Kartı alanıdır.</p><DataTable rows={titles.map((name)=>({id:name,name,count:people.filter((p)=>p.title===name).length}))} columns={[{key:"name",label:"Görev"},{key:"count",label:"Kartlı Personel"}]}/></section>;
    if (activeTab === "durumlar") return <section className="pdks-panel"><h3>Durumlar</h3><DataTable rows={statuses.map((name)=>({id:name,name,count:people.filter((p)=>p.status===name).length}))} columns={[{key:"name",label:"Durum"},{key:"count",label:"Personel"}]}/></section>;
    if (activeTab === "firmalar") return <section className="pdks-panel"><h3>Firmalar</h3><p>PDKS ayrı firma tablosu tutmaz. Aktif KY ERP ana firma: <b>{activeMainCompany?.name || companyId}</b>.</p></section>;
    if (activeTab === "kullanicilar") return <section className="pdks-panel"><h3>Kullanıcılar</h3><p>Hedef'in ayrı kullanıcı tablosu yerine KY ERP kullanıcı + MFA + yetki sistemi kullanılır.</p><p>PDKS kapsamı: <b>{audit ? "AUDIT / Salt Okunur" : "FULL"}</b></p></section>;
    if (activeTab === "saat-terminal") return <section className="pdks-panel"><h3>Saat / Terminal</h3><div className="pdks-stats"><Card label="Hedef/TR500" value="F:\\Ekin\\bilgi.dat"/><Card label="FILE" value="Destekli"/><Card label="TCP Server/Client" value="Destekli"/><Card label="SERIAL / COM" value="Destekli"/><Card label="Offline" value="SQLite Kuyruk"/></div><p>Terminal fiziksel bilgisayara bağlı olduğu için cihaz erişimini Windows Agent yapar; Web D1'e ulaşmış aynı hareketleri gösterir.</p></section>;

    if (activeTab === "raporlar") return <section className="pdks-panel"><h3>Raporlar</h3><div className="pdks-flow"><button onClick={loadAllSummaries}>Aylık Puantajı Hazırla</button><button onClick={() => summaryRows.length && downloadCsv(`PDKS_PUANTAJ_${year}_${String(month).padStart(2,"0")}.csv`, [["Kod","Personel","Bölüm","Çalıştı","Yıllık İzin","Eksik","Kart Yok","Geç Dk","Erken Dk","Fazla Dk"], ...summaryRows.map((r)=>[r.personnelCode,r.fullName,r.department,r.workedDays,r.annualLeaveDays,r.missingPunchDays,r.noPunchDays,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes])])} disabled={!summaryRows.length}>Puantaj CSV</button><button onClick={exportAuditYear}>Yıllık Denetim TEMP</button></div>{!audit ? <DataTable rows={logs.slice(0,100)} columns={[{key:"createdAt",label:"Tarih",render:(r)=>r.createdAt||r.created_at},{key:"actionType",label:"İşlem",render:(r)=>r.actionType||r.action_type},{key:"sourceScreen",label:"Kaynak",render:(r)=>r.sourceScreen||r.source_screen},{key:"userName",label:"Kullanıcı",render:(r)=>r.userName||r.user_name},{key:"reason",label:"Açıklama"}]}/> : null}</section>;

    if (activeTab === "denetim-yillik-temp") return <section className="pdks-panel"><h3>Yıllık TEMP / Denetim</h3><p>Yıl snapshotı D1'den yeniden üretilir; ana veri değildir. Yalnız SGK=VAR + kartlı personel, giriş/çıkış ve puantaj bulunur. Finans kesinlikle çıkmaz.</p><div className="form-row"><select value={year} onChange={(e)=>setYear(Number(e.target.value))}>{YEARS.map((item)=><option key={item}>{item}</option>)}</select><button className="primary-btn" onClick={exportAuditYear}>TEMP {year} Oluştur</button></div></section>;
    return <Empty>Bu PDKS ekranı henüz tanımlı değil.</Empty>;
  }

  return (
    <div className="pdks-page">
      <header className="pdks-header"><div><h1>KY ERP · PDKS</h1><p>Hedef PDKS kapsamı · Windows Agent · tek D1 data</p></div><div className="pdks-period"><select value={month} onChange={(e)=>setMonth(Number(e.target.value))}>{MONTHS.map((name,index)=><option key={name} value={index+1}>{name}</option>)}</select><select value={year} onChange={(e)=>setYear(Number(e.target.value))}>{YEARS.map((item)=><option key={item}>{item}</option>)}</select><button onClick={refresh} disabled={busy}>D1 Yenile</button><span className={audit?"audit":"full"}>{audit?"DENETİM · Salt Okunur":"FULL · D1 Yazma"}</span></div></header>
      {notice ? <div className="pdks-notice">{notice}</div> : null}
      {error ? <div className="pdks-error">{error}</div> : null}
      {busy ? <div className="pdks-busy">İşlem sürüyor...</div> : null}
      {renderCore()}
    </div>
  );
}
