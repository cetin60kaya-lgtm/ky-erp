import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getIkAdvancedLeaveCenter,
  getIkAdvancedMonth,
  previewIkAdvancedLeave,
  saveIkAdvancedLeave,
} from "../../../services/ikApi";
import { getIkAttendanceMonth } from "../../../services/ikPersonnelControlApi";
import "./ik-monthly-final.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function upper(value) {
  return String(value || "").toLocaleUpperCase("tr-TR");
}

function trStatus(value) {
  const key = upper(value);
  const labels = {
    CALISTI: "Çalıştı",
    EKSIK_BASIM: "Eksik Basım",
    KART_YOK: "Kart Yok",
    YILLIK_IZIN: "Yıllık İzin",
    IZIN: "İzin",
    RESMI_TATIL: "Resmî Tatil",
    HAFTA_SONU: "Hafta Sonu",
    DONEM_DISI: "Dönem Dışı",
  };
  return labels[key] || String(value || "-");
}

function attendanceBadge(status) {
  const key = upper(status);
  if (["CALISTI", "YILLIK_IZIN", "IZIN", "RESMI_TATIL", "HAFTA_SONU"].includes(key)) return "ok";
  if (["EKSIK_BASIM", "KART_YOK"].includes(key)) return "warn";
  return "";
}

function annualUsedFor(plans, employeeId) {
  return safeList(plans)
    .filter((row) => row.employeeId === employeeId)
    .filter((row) => upper(row.status) !== "CANCELLED")
    .filter((row) => upper(row.recordType).includes("YILLIK"))
    .reduce((sum, row) => sum + num(row.countedDays ?? row.dayCount ?? row.days), 0);
}

export default function IkPdksSyncPage({ activeMainCompany, openModule }) {
  const initial = currentPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [employees, setEmployees] = useState([]);
  const [leaveCenter, setLeaveCenter] = useState({ plans: [], policy: {} });
  const [attendanceById, setAttendanceById] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [leaveDraft, setLeaveDraft] = useState({ startDate: "", returnDate: "", note: "" });
  const [leavePreview, setLeavePreview] = useState(null);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const selected = employees.find((row) => row.id === selectedId) || employees[0] || null;
  const selectedAttendance = selected ? attendanceById[selected.id] || null : null;

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [monthData, center] = await Promise.all([
        getIkAdvancedMonth({ mainCompanyId: companyId, year, month }),
        getIkAdvancedLeaveCenter({ mainCompanyId: companyId, from: `${year - 1}-01-01`, to: `${year + 1}-12-31` }),
      ]);
      const rows = safeList(monthData?.employees).filter((row) => row.payrollIncluded !== false);
      const attendanceRows = await Promise.all(rows.map(async (person) => {
        try {
          const attendance = await getIkAttendanceMonth(person.id, { mainCompanyId: companyId, year, month });
          return [person.id, attendance];
        } catch {
          return [person.id, null];
        }
      }));
      setEmployees(rows);
      setLeaveCenter(center || { plans: [], policy: {} });
      setAttendanceById(Object.fromEntries(attendanceRows));
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
    } catch (cause) {
      setError(cause?.message || "İK / PDKS senkron verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  }, [companyId, month, year]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setLeavePreview(null);
    setLeaveDraft({ startDate: "", returnDate: "", note: "" });
  }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = upper(search).trim();
    return employees.filter((row) => !needle || upper(`${row.code || row.personnelCode || ""} ${row.fullName || ""} ${row.department || ""}`).includes(needle));
  }, [employees, search]);

  const rows = useMemo(() => employees.map((person) => {
    const attendance = attendanceById[person.id];
    const summary = attendance?.summary || {};
    const entitlement = num(person.annualLeaveEntitlement);
    const carryover = num(person.annualLeaveCarryover);
    const used = annualUsedFor(leaveCenter?.plans, person.id);
    return {
      person,
      attendance,
      summary,
      entitlement,
      carryover,
      used,
      remaining: Math.max(0, entitlement + carryover - used),
    };
  }), [attendanceById, employees, leaveCenter?.plans]);

  const selectedRow = rows.find((row) => row.person.id === selected?.id) || null;
  const totals = rows.reduce((acc, row) => {
    acc.worked += num(row.summary.workedDays);
    acc.annualLeave += num(row.summary.annualLeaveDays);
    acc.missing += num(row.summary.missingPunchDays) + num(row.summary.noPunchDays);
    acc.overtime += num(row.summary.overtimeMinutes);
    return acc;
  }, { worked: 0, annualLeave: 0, missing: 0, overtime: 0 });

  const previewLeave = async () => {
    if (!selected || !leaveDraft.startDate || !leaveDraft.returnDate) {
      setError("Yıllık izin için personel, başlangıç ve işe dönüş tarihi zorunludur.");
      return;
    }
    setLeaveBusy(true);
    setError("");
    setNotice("");
    try {
      const preview = await previewIkAdvancedLeave({
        mainCompanyId: companyId,
        employeeId: selected.id,
        recordType: "Yıllık izin",
        startDate: leaveDraft.startDate,
        returnDate: leaveDraft.returnDate,
        note: leaveDraft.note,
      });
      setLeavePreview(preview || null);
    } catch (cause) {
      setLeavePreview(null);
      setError(cause?.message || "İzin ön kontrolü yapılamadı.");
    } finally {
      setLeaveBusy(false);
    }
  };

  const saveLeave = async () => {
    if (!leavePreview || !selected) return;
    setLeaveBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveIkAdvancedLeave({
        mainCompanyId: companyId,
        employeeId: selected.id,
        recordType: "Yıllık izin",
        effectType: "Ücretli",
        startDate: leaveDraft.startDate,
        returnDate: leaveDraft.returnDate,
        note: leaveDraft.note,
        status: leaveDraft.startDate > new Date().toISOString().slice(0, 10) ? "PLANNED" : "APPROVED",
        allowDepartmentConflict: leavePreview?.hasDepartmentWarning === true,
      });
      setNotice(result?.message || "Yıllık izin İK kaynağına işlendi; PDKS puantajı aynı kaydı otomatik okuyacak.");
      setLeavePreview(null);
      setLeaveDraft({ startDate: "", returnDate: "", note: "" });
      await load();
    } catch (cause) {
      setError(cause?.message || "Yıllık izin kaydedilemedi.");
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <div className="ikf-page">
      <section className="ikf-head">
        <div>
          <div className="ikf-eyebrow">İK ↔ PDKS TEK VERİ KAYNAĞI</div>
          <h1>Puantaj / Yıllık İzin Senkronu</h1>
          <p>Personel ve izin İK’dan; kart basım, günlük durum ve puantaj PDKS’den gelir. Aynı bilgi ikinci kez girilmez.</p>
        </div>
        <div className="ikf-period">
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
          <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value) || initial.year)} />
          <button type="button" className="ikf-btn" disabled={busy} onClick={load}>{busy ? "Yükleniyor" : "Yenile"}</button>
        </div>
      </section>

      {notice ? <div className="ikf-notice">{notice}</div> : null}
      {error ? <div className="ikf-error">{error}</div> : null}

      <section className="ikf-summary">
        <div className="ikf-stat"><span>Aktif bordro personeli</span><strong>{employees.length}</strong><small>İK personel ana kaynağı</small></div>
        <div className="ikf-stat"><span>Toplam çalışılan gün</span><strong>{totals.worked}</strong><small>PDKS puantaj sonucu</small></div>
        <div className="ikf-stat"><span>Yıllık izin günü</span><strong>{totals.annualLeave}</strong><small>İK izin kaydı → PDKS</small></div>
        <div className="ikf-stat"><span>Kontrol gerektiren basım</span><strong>{totals.missing}</strong><small>Kart yok + eksik basım</small></div>
      </section>

      <section className="ikf-grid">
        <aside className="ikf-side">
          <div className="ikf-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="HKN kodu / personel ara" /></div>
          <div className="ikf-side-count">{filtered.length} personel</div>
          <div className="ikf-people">
            {filtered.map((person) => {
              const attendance = attendanceById[person.id];
              return (
                <button key={person.id} type="button" className={`ikf-person ${selected?.id === person.id ? "active" : ""}`} onClick={() => setSelectedId(person.id)}>
                  <span><strong>{person.fullName}</strong><small>{person.code || person.personnelCode || "HKN kodu bekleniyor"} · {person.department || "Bölüm yok"}</small></span>
                  <em>{attendance?.summary?.missingPunchDays || attendance?.summary?.noPunchDays ? "KONTROL" : "OK"}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="ikf-main">
          {!selected || !selectedRow ? <div className="ikf-card ikf-empty">Personel seçin.</div> : <>
            <section className="ikf-card">
              <div className="ikf-person-head">
                <div><strong>{selected.fullName}</strong><span><span className="ikf-code">{selected.code || selected.personnelCode || "HKN---"}</span> · {selected.department || "-"} · {selected.title || "-"}</span></div>
                <div className="ikf-badges">
                  <span className={`ikf-badge ${upper(selected.status).includes("AKT") ? "ok" : "warn"}`}>{selected.status || selected.activePassive || "Aktif"}</span>
                  <span className={`ikf-badge ${selected.cardNo ? "ok" : "warn"}`}>{selected.cardNo ? `Kart ${selected.cardNo}` : "Kart atanmadı"}</span>
                  <span className="ikf-badge">PDKS → İK canlı</span>
                </div>
              </div>
              <div className="ikf-divider" />
              <div className="ikf-money-grid">
                <div className="ikf-money"><span>Çalıştı</span><strong>{num(selectedRow.summary.workedDays)} gün</strong></div>
                <div className="ikf-money"><span>Yıllık İzin</span><strong>{num(selectedRow.summary.annualLeaveDays)} gün</strong></div>
                <div className="ikf-money"><span>Geç / Erken</span><strong>{num(selectedRow.summary.lateMinutes)} / {num(selectedRow.summary.earlyMinutes)} dk</strong></div>
                <div className="ikf-money"><span>PDKS Mesai</span><strong>{(num(selectedRow.summary.overtimeMinutes) / 60).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} saat</strong></div>
                <div className="ikf-money net"><span>Kart Kontrol</span><strong>{num(selectedRow.summary.missingPunchDays) + num(selectedRow.summary.noPunchDays)} gün</strong></div>
              </div>
              <div className="ikf-actions">
                <button type="button" className="ikf-btn" onClick={() => openModule?.("pdks", { tabKey: "puantaj", actionContext: { employeeId: selected.id, year, month } })}>PDKS Puantajına Git</button>
                <button type="button" className="ikf-btn" onClick={() => openModule?.("pdks", { tabKey: "giris-cikislar", actionContext: { employeeId: selected.id, year, month } })}>Giriş / Çıkışı Aç</button>
              </div>
            </section>

            <section className="ikf-card">
              <h2>Yıllık İzin Hakkı — İK Ana Kaynak</h2>
              <div className="ikf-money-grid">
                <div className="ikf-money"><span>Bu yıl hakediş</span><strong>{selectedRow.entitlement} gün</strong></div>
                <div className="ikf-money"><span>Geçen yıldan kalan</span><strong>{selectedRow.carryover} gün</strong></div>
                <div className="ikf-money"><span>Toplam hak</span><strong>{selectedRow.entitlement + selectedRow.carryover} gün</strong></div>
                <div className="ikf-money"><span>Kullanılan / planlanan</span><strong>{selectedRow.used} gün</strong></div>
                <div className="ikf-money net"><span>Kalan</span><strong>{selectedRow.remaining} gün</strong></div>
              </div>
              <div className="ikf-note" style={{ marginTop: 10 }}>Hakediş ve geçen yıldan kalan gün sadece İK Personel Kartı’nda tutulur. PDKS bu değeri değiştirmez; kaydedilen izin tarihlerini puantajda otomatik olarak “Yıllık İzin” kabul eder.</div>
            </section>

            <section className="ikf-card">
              <h2>Yıllık İzin Kaydı</h2>
              <div className="ikf-form">
                <div className="ikf-field"><span>İzne Çıkış</span><input type="date" value={leaveDraft.startDate} onChange={(event) => { setLeavePreview(null); setLeaveDraft((old) => ({ ...old, startDate: event.target.value })); }} /></div>
                <div className="ikf-field"><span>İşe Dönüş</span><input type="date" value={leaveDraft.returnDate} onChange={(event) => { setLeavePreview(null); setLeaveDraft((old) => ({ ...old, returnDate: event.target.value })); }} /></div>
                <div className="ikf-field"><span>İzin Türü</span><input value="Yıllık izin" readOnly /></div>
                <div className="ikf-field wide"><span>Not</span><textarea value={leaveDraft.note} onChange={(event) => setLeaveDraft((old) => ({ ...old, note: event.target.value }))} placeholder="İsteğe bağlı not" /></div>
              </div>
              <div className="ikf-actions">
                <button type="button" className="ikf-btn" disabled={leaveBusy} onClick={previewLeave}>Günleri Hesapla / Kontrol Et</button>
                <button type="button" className="ikf-btn primary" disabled={leaveBusy || !leavePreview || leavePreview?.hasCriticalConflict} onClick={saveLeave}>İK’ya Kaydet</button>
              </div>
              {leavePreview ? <div className="ikf-note" style={{ marginTop: 10 }}>
                Sayılacak: <strong>{num(leavePreview.countedDays)} gün</strong> · Önceki bakiye: <strong>{num(leavePreview.balanceBefore)} gün</strong> · Sonraki bakiye: <strong>{num(leavePreview.balanceAfter)} gün</strong>
                {leavePreview.hasCriticalConflict ? " · KRİTİK: Aynı personelde çakışan izin var." : ""}
                {leavePreview.hasDepartmentWarning ? " · Uyarı: Aynı bölümde izin çakışması var." : ""}
              </div> : null}
            </section>

            <section className="ikf-card">
              <h2>{MONTHS[month - 1]} {year} — PDKS Günlük Puantaj</h2>
              <div className="ikf-table-wrap">
                <table className="ikf-table">
                  <thead><tr><th>Tarih</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Mesai</th><th>Basım</th></tr></thead>
                  <tbody>
                    {safeList(selectedAttendance?.days).map((day) => <tr key={day.date}>
                      <td>{day.date}</td>
                      <td><span className={`ikf-badge ${attendanceBadge(day.status)}`}>{trStatus(day.status)}</span></td>
                      <td>{day.entry || "-"}</td><td>{day.exit || "-"}</td>
                      <td>{num(day.lateMinutes)} dk</td><td>{num(day.earlyMinutes)} dk</td><td>{num(day.overtimeMinutes)} dk</td>
                      <td>{day.eventCount || 0}{day.missingPunch ? " / kontrol" : ""}</td>
                    </tr>)}
                    {!safeList(selectedAttendance?.days).length ? <tr><td colSpan="8" className="ikf-empty">Bu ay için PDKS sonucu yok.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>}
        </main>
      </section>
    </div>
  );
}
