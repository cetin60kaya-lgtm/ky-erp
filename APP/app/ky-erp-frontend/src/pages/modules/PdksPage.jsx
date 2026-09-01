import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPdksTimeEvent,
  closePdksPeriod,
  getPdksAdvancedMonth,
  getPdksAttendance,
  getPdksAuditLogs,
  getPdksHolidays,
  getPdksLeaveCenter,
  getPdksPayroll,
  getPdksPeople,
  getPdksProfile,
  savePdksDayOverride,
  savePdksFinanceMovement,
  savePdksHoliday,
  savePdksLeave,
} from "../../services/pdksApi";
import { confirmIkAdvancedCard, previewIkAdvancedCard } from "../../services/ikApi";
import "./pdks.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - 6 + i);
const safe = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const periodKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

function csvCell(value) {
  const raw = String(value ?? "");
  return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
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
        <thead><tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row[rowKey] || `${rowKey}-${index}`} onClick={() => onRowClick?.(row)} className={onRowClick ? "clickable" : ""}>
            {columns.map((col) => <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function PdksPage({ activeTab = "ana-ekran", activeMainCompany, isAuditAccount = false, openModule }) {
  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState([]);
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
  const [eventForm, setEventForm] = useState({ date: new Date().toISOString().slice(0, 10), time: "08:30", direction: "AUTO" });
  const [override, setOverride] = useState({ date: new Date().toISOString().slice(0, 10), status: "CALISTI", entry: "08:30", exit: "19:00", note: "PDKS düzeltme" });
  const [advance, setAdvance] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", note: "PDKS avans" });
  const [holiday, setHoliday] = useState({ date: "", name: "", halfDay: false });
  const [cardPreview, setCardPreview] = useState(null);
  const cardFile = useRef(null);

  const audit = Boolean(profile?.audit || isAuditAccount);
  const canWrite = !audit;
  const selected = people.find((person) => person.id === selectedId) || people[0] || null;

  const loadBase = useCallback(async () => {
    const [nextProfile, nextPeople] = await Promise.all([getPdksProfile(), getPdksPeople()]);
    const normalizedPeople = safe(nextPeople);
    setProfile(nextProfile || null);
    setPeople(normalizedPeople);
    setSelectedId((old) => normalizedPeople.some((p) => p.id === old) ? old : normalizedPeople[0]?.id || "");
  }, []);

  const loadMonth = useCallback(async () => {
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

  const loadSelectedAttendance = useCallback(async () => {
    if (!selected?.id) { setAttendance([]); return; }
    const result = await getPdksAttendance(selected.id, year, month);
    setAttendance(safe(result?.days));
  }, [month, selected?.id, year]);

  const run = useCallback(async (message, action) => {
    setBusy(true); setError(""); setNotice(message || "");
    try { await action(); }
    catch (e) { setError(e?.message || "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { run("PDKS verileri yükleniyor...", async () => { await loadBase(); await loadMonth(); setNotice(""); }); }, [loadBase, loadMonth, run]);
  useEffect(() => { run("Kart puantajı yükleniyor...", async () => { await loadSelectedAttendance(); setNotice(""); }); }, [loadSelectedAttendance, run]);

  const refresh = () => run("D1 verileri yenileniyor...", async () => { await loadBase(); await loadMonth(); await loadSelectedAttendance(); setNotice("Web ve masaüstü aynı KY ERP verisiyle güncellendi."); });

  const loadAllSummaries = () => run("Aylık puantaj sonuçları hesaplanıyor...", async () => {
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

  const addEvent = () => run("Kart hareketi kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı kart hareketi yazamaz.");
    if (!selected) throw new Error("Personel seçin.");
    await addPdksTimeEvent(selected.id, { cardNo: selected.cardNo, workDate: eventForm.date, eventTime: eventForm.time, direction: eventForm.direction, source: "KYERP_WEB_PDKS", note: "KY ERP Web PDKS" });
    await loadSelectedAttendance();
    setNotice("Kart hareketi tek D1 kaydına işlendi; Windows PDKS yenilediğinde aynı kayıt görünür.");
  });

  const saveOverride = () => run("Gün düzeltmesi kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı puantaj değiştiremez.");
    if (!selected) throw new Error("Personel seçin.");
    const entryMinutes = override.entry ? Math.max(0, Number(override.entry.slice(0, 2)) * 60 + Number(override.entry.slice(3, 5)) - 515) : 0;
    const exitMinutes = override.exit ? Math.max(0, 1130 - (Number(override.exit.slice(0, 2)) * 60 + Number(override.exit.slice(3, 5)))) : 0;
    const overtime = override.exit ? Math.max(0, Number(override.exit.slice(0, 2)) * 60 + Number(override.exit.slice(3, 5)) - 1140) : 0;
    await savePdksDayOverride(selected.id, { workDate: override.date, status: override.status, entry: override.entry || null, exit: override.exit || null, lateMinutes: entryMinutes, earlyMinutes: exitMinutes, overtimeMinutes: overtime, missingPunch: override.status === "EKSIK_BASIM", note: override.note });
    await loadSelectedAttendance();
    setNotice("Puantaj düzeltmesi D1'e kaydedildi.");
  });

  const saveAdvance = () => run("Avans D1'e kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı avans kaydedemez.");
    if (!selected || num(advance.amount) <= 0) throw new Error("Personel ve tutar zorunludur.");
    await savePdksFinanceMovement({ mainCompanyId: companyId, employeeId: selected.id, date: advance.date, adjustmentType: "Avans", amount: num(advance.amount), paymentMethod: "Elden", payrollEffect: "Bordrodan düş", note: advance.note, status: "APPROVED" });
    setAdvance((current) => ({ ...current, amount: "" }));
    await loadMonth();
    setNotice("Avans KY ERP D1'e işlendi; İK Bordro ekranıyla aynı kayıttır.");
  });

  const closePeriod = () => run("Ay sonu kontrolü çalışıyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı dönem kapatamaz.");
    const result = await closePdksPeriod({ mainCompanyId: companyId, year, month, lock: true, reason: "KY ERP Web PDKS kontrollü kapanış" });
    if (result?.blockingCount) throw new Error(`${result.blockingCount} açık kontrol nedeniyle dönem kapanmadı.`);
    setNotice(`${MONTHS[month - 1]} ${year} D1 üzerinde kilitlendi.`);
  });

  const saveHoliday = () => run("Tatil kaydediliyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı tatil değiştiremez.");
    if (!holiday.date || !holiday.name.trim()) throw new Error("Tarih ve tatil adı zorunludur.");
    await savePdksHoliday({ mainCompanyId: companyId, date: holiday.date, name: holiday.name.trim(), halfDay: holiday.halfDay });
    setHoliday({ date: "", name: "", halfDay: false });
    await loadMonth();
    setNotice("Resmî tatil D1'e kaydedildi.");
  });

  const previewCardFile = () => run("Kart dosyası önizleniyor...", async () => {
    const file = cardFile.current?.files?.[0];
    if (!file) throw new Error("Kart dosyası seçin.");
    const result = await previewIkAdvancedCard(file, { mainCompanyId: companyId, year, month });
    setCardPreview(result || null);
    setNotice("Kart dosyası önizlendi. Onaylanana kadar D1'e yazılmaz.");
  });

  const confirmCardFile = () => run("Kart dosyası D1'e işleniyor...", async () => {
    if (!canWrite) throw new Error("Denetim hesabı kart dosyası işleyemez.");
    if (!cardPreview) throw new Error("Önce kart dosyasını önizleyin.");
    await confirmIkAdvancedCard({ mainCompanyId: companyId, year, month, importId: cardPreview.importId || cardPreview.id, rows: cardPreview.rows || cardPreview.items || [] });
    setCardPreview(null);
    await loadSelectedAttendance();
    setNotice("Kart dosyası D1'e işlendi.");
  });

  const exportAuditYear = () => run(`${year} denetim TEMP verisi D1'den hazırlanıyor...`, async () => {
    const rows = [["Personel Kodu", "Ad Soyad", "Kart No", "Bölüm", "Tarih", "Durum", "Giriş", "Çıkış", "Geç", "Erken", "Fazla", "Olay Sayısı", "Not"]];
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
    setNotice(`${year} denetim TEMP dosyası yalnız SGK'lı kart personelinden ve D1 puantajından üretildi; finans alanı yoktur.`);
  });

  const adjustments = safe(monthData?.adjustments);
  const advances = adjustments.filter((row) => text(row.adjustmentType || row.type).toLocaleUpperCase("tr-TR").includes("AVANS"));
  const payrollLines = safe(payroll?.lines);
  const plans = safe(leaveCenter?.plans);
  const departments = useMemo(() => [...new Set(people.map((p) => text(p.department)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [people]);
  const titles = useMemo(() => [...new Set(people.map((p) => text(p.title)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [people]);
  const statuses = useMemo(() => [...new Set(people.map((p) => text(p.status)).filter(Boolean))], [people]);

  const personColumns = [
    { key: "personnelCode", label: "Kod", render: (r) => r.personnelCode || r.code || "" },
    { key: "fullName", label: "Ad Soyad" }, { key: "cardNo", label: "Kart No" }, { key: "department", label: "Bölüm" },
    { key: "title", label: "Görev" }, { key: "startDate", label: "İşe Giriş" }, { key: "exitDate", label: "İşten Çıkış" }, { key: "status", label: "Durum" },
  ];
  const attendanceColumns = [
    { key: "date", label: "Tarih" }, { key: "status", label: "Durum" }, { key: "entry", label: "Giriş" }, { key: "exit", label: "Çıkış" },
    { key: "lateMinutes", label: "Geç" }, { key: "earlyMinutes", label: "Erken" }, { key: "overtimeMinutes", label: "Fazla" }, { key: "eventCount", label: "Basım" }, { key: "note", label: "Not" },
  ];

  function PeriodBar() {
    return <div className="pdks-period"><select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select><select value={year} onChange={(e) => setYear(Number(e.target.value))}>{YEARS.map((item) => <option key={item}>{item}</option>)}</select><button onClick={refresh} disabled={busy}>D1 Yenile</button><span className={audit ? "audit" : "full"}>{audit ? "DENETİM · Salt Okunur" : "FULL · D1 Yazma Yetkili"}</span></div>;
  }

  function PersonPicker() {
    return <select className="pdks-person-picker" value={selected?.id || ""} onChange={(e) => setSelectedId(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.personnelCode || p.code} · {p.fullName} · {p.cardNo}</option>)}</select>;
  }

  function renderCore() {
    if (activeTab === "ana-ekran") return <>
      <div className="pdks-stats"><Card label="SGK + Kart Personel" value={people.length}/><Card label="Seçili Ay Kartlı Gün" value={attendance.filter((d) => ["CALISTI", "EKSIK_BASIM"].includes(d.status)).length} tone="ok"/><Card label="Eksik / Kart Yok" value={attendance.filter((d) => ["EKSIK_BASIM", "KART_YOK"].includes(d.status)).length} tone="warn"/><Card label="Avans Hareketi" value={advances.length}/><Card label="İzin Planı" value={plans.length}/></div>
      <div className="pdks-grid two"><section className="pdks-panel"><h3>Günlük İş Akışı</h3><div className="pdks-flow"><button onClick={() => openModule?.("pdks", { tabKey: "bilgi-aktar" })}>1 Bilgi Aktar</button><button onClick={() => openModule?.("pdks", { tabKey: "giris-cikislar" })}>2 Giriş / Çıkış</button><button onClick={() => openModule?.("pdks", { tabKey: "puantaj" })}>3 Puantaj</button><button onClick={loadAllSummaries}>4 Sonuçları Hesapla</button><button onClick={closePeriod} disabled={!canWrite}>5 Dönemi Kapat</button></div></section><section className="pdks-panel"><h3>Tek DATA Durumu</h3><p><b>Kaynak:</b> KY ERP D1</p><p><b>Masaüstü:</b> Ham kart tamponu + offline kuyruk</p><p><b>Web:</b> Aynı personel, kart, izin, avans, puantaj ve bordro</p><p><b>Denetim:</b> SGK=VAR + kartlı personel, finans alanı kapalı</p></section></div>
      <section className="pdks-panel"><h3>Seçili Personel · {selected?.fullName || "-"}</h3><PersonPicker/><DataTable columns={attendanceColumns} rows={attendance.slice(-14).reverse()} rowKey="date" /></section>
    </>;

    if (activeTab === "personel-bilgileri") return <section className="pdks-panel"><h3>Personel Bilgileri · İK ile aynı D1 kartı</h3><p>PDKS ayrı personel yaratmaz. Bu listede yalnız SGK=VAR ve kart numarası olan personel görünür.</p><DataTable columns={personColumns} rows={people} /></section>;

    if (["giris-cikislar", "puantaj", "calisma-tarihi"].includes(activeTab)) return <>
      <section className="pdks-panel"><h3>{activeTab === "puantaj" ? "Puantaj" : activeTab === "calisma-tarihi" ? "Çalışma Tarihi" : "Giriş / Çıkışlar"}</h3><PersonPicker/></section>
      {activeTab === "giris-cikislar" && canWrite ? <section className="pdks-panel form-row"><input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}/><input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}/><select value={eventForm.direction} onChange={(e) => setEventForm({ ...eventForm, direction: e.target.value })}><option>AUTO</option><option>IN</option><option>OUT</option></select><button className="primary-btn" onClick={addEvent}>Kart Hareketi Ekle</button></section> : null}
      {activeTab === "puantaj" && canWrite ? <section className="pdks-panel form-row wrap"><input type="date" value={override.date} onChange={(e) => setOverride({ ...override, date: e.target.value })}/><select value={override.status} onChange={(e) => setOverride({ ...override, status: e.target.value })}>{["CALISTI", "EKSIK_BASIM", "KART_YOK", "IZIN", "YILLIK_IZIN", "RESMI_TATIL", "HAFTA_SONU"].map((s) => <option key={s}>{s}</option>)}</select><input type="time" value={override.entry} onChange={(e) => setOverride({ ...override, entry: e.target.value })}/><input type="time" value={override.exit} onChange={(e) => setOverride({ ...override, exit: e.target.value })}/><input value={override.note} onChange={(e) => setOverride({ ...override, note: e.target.value })}/><button className="primary-btn" onClick={saveOverride}>D1'e Kaydet</button></section> : null}
      <section className="pdks-panel"><DataTable columns={attendanceColumns} rows={attendance} rowKey="date" onRowClick={(row) => setOverride({ date: row.date, status: row.status || "CALISTI", entry: row.entry || "", exit: row.exit || "", note: row.note || "PDKS düzeltme" })}/></section>
    </>;

    if (activeTab === "puantaj-sonuclari") return <section className="pdks-panel"><div className="pdks-panel-title"><div><h3>Puantaj Sonuçları</h3><p>Tüm personel için D1 aylık hesap sonucu.</p></div><button onClick={loadAllSummaries}>Hesapla / Yenile</button></div><DataTable rows={summaryRows} columns={[{key:"personnelCode",label:"Kod"},{key:"fullName",label:"Personel"},{key:"department",label:"Bölüm"},{key:"workedDays",label:"Çalıştı"},{key:"annualLeaveDays",label:"Yıllık İzin"},{key:"missingPunchDays",label:"Eksik"},{key:"noPunchDays",label:"Kart Yok"},{key:"lateMinutes",label:"Geç Dk"},{key:"earlyMinutes",label:"Erken Dk"},{key:"overtimeMinutes",label:"Fazla Dk"}]}/></section>;

    if (activeTab === "avanslar") return <><section className="pdks-panel"><h3>Avanslar · İK ile aynı finans hareketi</h3>{canWrite ? <div className="form-row"><PersonPicker/><input type="date" value={advance.date} onChange={(e) => setAdvance({ ...advance, date: e.target.value })}/><input type="number" placeholder="Tutar" value={advance.amount} onChange={(e) => setAdvance({ ...advance, amount: e.target.value })}/><input value={advance.note} onChange={(e) => setAdvance({ ...advance, note: e.target.value })}/><button onClick={saveAdvance}>Avansı D1'e Kaydet</button></div> : null}</section><section className="pdks-panel"><DataTable rows={advances} columns={[{key:"date",label:"Tarih"},{key:"employeeName",label:"Personel",render:(r)=>r.fullName||r.employeeName||r.employeeId},{key:"amount",label:"Tutar"},{key:"paymentMethod",label:"Ödeme"},{key:"note",label:"Not"}]}/></section></>;

    if (activeTab === "bordro") return <section className="pdks-panel"><h3>Bordro · İK Bordro & Ödeme ile aynı D1</h3>{audit ? <p className="pdks-warning">Denetim hesabında finans alanları gösterilmez.</p> : <DataTable rows={payrollLines} columns={[{key:"fullName",label:"Personel",render:(r)=>r.fullName||r.employee?.fullName||r.employeeId},{key:"salary",label:"Maaş",render:(r)=>r.salary||r.system?.salary||0},{key:"overtimeAmount",label:"Mesai",render:(r)=>r.overtimeAmount||r.system?.overtimeAmount||0},{key:"advanceAmount",label:"Avans",render:(r)=>r.advanceAmount||r.system?.advanceAmount||0},{key:"bankAmount",label:"Banka",render:(r)=>r.bankAmount||r.final?.bank||0},{key:"cashAmount",label:"Elden",render:(r)=>r.cashAmount||r.final?.cash||0},{key:"totalAmount",label:"Net",render:(r)=>r.totalAmount||r.final?.total||r.net||0}]}/>}</section>;

    if (activeTab === "bilgi-aktar") return <><section className="pdks-panel"><h3>Bilgi Aktar</h3><p><b>Canlı akış:</b> Kart makinesi → Windows Agent → offline ham kuyruk → KY ERP D1 → Web + Windows.</p><p><b>Hedef uyumluluk:</b> Masaüstü Agent, mevcut Hedef/TR500 bilgi.dat akışını da okuyabilir. Web tarayıcısı cihazın yerel COM/TCP portuna doğrudan bağlanmaz.</p></section><section className="pdks-panel"><h3>Kart Dosyası Önizleme / Onay</h3><input ref={cardFile} type="file" accept=".txt,.csv,.dat,.xlsx,.xls"/><button onClick={previewCardFile}>Önizle</button>{cardPreview ? <><pre className="pdks-preview">{JSON.stringify(cardPreview, null, 2).slice(0, 8000)}</pre>{canWrite ? <button className="primary-btn" onClick={confirmCardFile}>D1'e Onayla ve İşle</button> : null}</> : null}</section></>;

    if (activeTab === "donemler") return <section className="pdks-panel"><h3>Dönemler</h3><p>Dönem kilidi yerel bilgisayarda değil D1'de tutulur. Kapanışta SGK, ödeme, mükerrer, puantaj ve açık kontroller server tarafından denetlenir.</p><button className="danger-btn" disabled={!canWrite} onClick={closePeriod}>{MONTHS[month - 1]} {year} Dönemini Kontrol Et ve Kapat</button></section>;

    if (activeTab === "tatiller") return <><section className="pdks-panel"><h3>Tatiller</h3>{canWrite ? <div className="form-row"><input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })}/><input placeholder="Tatil adı" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}/><label><input type="checkbox" checked={holiday.halfDay} onChange={(e) => setHoliday({ ...holiday, halfDay: e.target.checked })}/> Yarım gün</label><button onClick={saveHoliday}>D1'e Kaydet</button></div> : null}</section><section className="pdks-panel"><DataTable rows={holidays} columns={[{key:"date",label:"Tarih"},{key:"name",label:"Tatil"},{key:"halfDay",label:"Yarım Gün",render:(r)=>r.halfDay?"Evet":"Hayır"}]}/></section></>;

    if (activeTab === "gruplar-vardiyalar") return <section className="pdks-panel"><h3>Gruplar / Vardiyalar</h3><div className="pdks-stats"><Card label="Normal Giriş" value="08:30"/><Card label="Normal Çıkış" value="19:00"/><Card label="Normal Son Giriş" value="08:35"/><Card label="Normal İlk Çıkış" value="18:50"/></div><p>Personel/işyeri vardiya kuralı D1 puantaj motoruyla ortak kullanılacaktır. Özel vardiya ataması personel bazında tek kaynaktan yönetilir; masaüstünde ikinci vardiya tablosu yetkili kaynak değildir.</p><DataTable rows={departments.map((name)=>({id:name,name,count:people.filter((p)=>p.department===name).length}))} columns={[{key:"name",label:"Mevcut Bölüm / Grup"},{key:"count",label:"Personel"}]}/></section>;

    if (activeTab === "bolumler") return <section className="pdks-panel"><h3>Bölümler</h3><DataTable rows={departments.map((name)=>({id:name,name,count:people.filter((p)=>p.department===name).length}))} columns={[{key:"name",label:"Bölüm"},{key:"count",label:"Kartlı Personel"}]}/></section>;
    if (activeTab === "gorevler") return <section className="pdks-panel"><h3>Görevler</h3><DataTable rows={titles.map((name)=>({id:name,name,count:people.filter((p)=>p.title===name).length}))} columns={[{key:"name",label:"Görev"},{key:"count",label:"Kartlı Personel"}]}/></section>;
    if (activeTab === "durumlar") return <section className="pdks-panel"><h3>Durumlar</h3><DataTable rows={statuses.map((name)=>({id:name,name,count:people.filter((p)=>p.status===name).length}))} columns={[{key:"name",label:"Durum"},{key:"count",label:"Personel"}]}/></section>;
    if (activeTab === "servisler") return <section className="pdks-panel"><h3>Servisler</h3><p>Servis bilgisi mevcut personel ana kartında ayrı alan olarak bulunmadığı için ikinci sahte kayıt oluşturulmaz. Alan D1 personel kartına eklendiğinde PDKS aynı alanı kullanacaktır.</p></section>;
    if (activeTab === "firmalar") return <section className="pdks-panel"><h3>Firmalar</h3><p>Aktif ana firma: <b>{activeMainCompany?.name || companyId}</b></p><p>Firma seçimi KY ERP'nin çoklu ana firma yapısından gelir; PDKS ayrı firma kartı tutmaz.</p></section>;
    if (activeTab === "kullanicilar") return <section className="pdks-panel"><h3>Kullanıcılar</h3><p>PDKS kullanıcıları KY ERP kullanıcı/MFA sistemiyle aynıdır. Ayrı Hedef kullanıcı veritabanı oluşturulmaz.</p><p>Aktif kapsam: <b>{audit ? "AUDIT / DENETİM" : "FULL"}</b></p></section>;
    if (activeTab === "saat-terminal") return <section className="pdks-panel"><h3>Saat / Terminal</h3><p>Windows Agent destekleri: <b>Hedef/TR500 bilgi.dat</b>, FILE, TCP Server, TCP Client, SERIAL/COM. Terminal bilgisayara bağlı çalışır; Web yalnız D1'e ulaşmış kart hareketlerini gösterir.</p><div className="pdks-stats"><Card label="Hedef Okuma" value="F:\\Ekin\\bilgi.dat"/><Card label="Hedef/TR500" value="Uyumlu" tone="ok"/><Card label="Offline" value="SQLite Kuyruk"/><Card label="Merkez" value="KY ERP D1"/></div></section>;
    if (activeTab === "raporlar") return <section className="pdks-panel"><h3>Raporlar</h3><div className="pdks-flow"><button onClick={loadAllSummaries}>Aylık Puantajı Hazırla</button><button onClick={() => summaryRows.length && downloadCsv(`PDKS_PUANTAJ_${year}_${String(month).padStart(2,"0")}.csv`, [["Kod","Personel","Bölüm","Çalıştı","Yıllık İzin","Eksik","Kart Yok","Geç Dk","Erken Dk","Fazla Dk"], ...summaryRows.map((r)=>[r.personnelCode,r.fullName,r.department,r.workedDays,r.annualLeaveDays,r.missingPunchDays,r.noPunchDays,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes])])} disabled={!summaryRows.length}>Puantaj CSV</button><button onClick={exportAuditYear}>Yıllık Denetim TEMP</button></div><DataTable rows={logs.slice(0,100)} columns={[{key:"createdAt",label:"Tarih",render:(r)=>r.createdAt||r.created_at},{key:"actionType",label:"İşlem",render:(r)=>r.actionType||r.action_type},{key:"sourceScreen",label:"Kaynak",render:(r)=>r.sourceScreen||r.source_screen},{key:"userName",label:"Kullanıcı",render:(r)=>r.userName||r.user_name},{key:"reason",label:"Açıklama"}]}/></section>;
    if (activeTab === "denetim-yillik-temp") return <section className="pdks-panel"><h3>Yıllık TEMP / Denetim</h3><p>Dosya ana veri değildir; her zaman KY ERP D1'den yeniden üretilebilir salt-okunur denetim snapshotıdır. Yalnız SGK=VAR + kartlı personel ve kart/puantaj alanları çıkar; maaş, avans, banka ve elden ödeme çıkarılmaz.</p><div className="form-row"><select value={year} onChange={(e)=>setYear(Number(e.target.value))}>{YEARS.map((y)=><option key={y}>{y}</option>)}</select><button className="primary-btn" onClick={exportAuditYear}>TEMP {year} Oluştur</button></div></section>;
    return <Empty>Bu PDKS ekranı tanımlı değil.</Empty>;
  }

  return <div className="pdks-page"><header className="pdks-header"><div><h1>KY ERP · PDKS</h1><p>Hedef PDKS işlev kapsamı · Windows Agent · tek D1 data</p></div><PeriodBar/></header>{notice ? <div className="pdks-notice">{notice}</div> : null}{error ? <div className="pdks-error">{error}</div> : null}{busy ? <div className="pdks-busy">İşlem sürüyor...</div> : null}{renderCore()}</div>;
}
