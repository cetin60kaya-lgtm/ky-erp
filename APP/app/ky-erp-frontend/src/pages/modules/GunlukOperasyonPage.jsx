import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Moon,
  RefreshCw,
  Sun,
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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function addDays(value, amount) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day + amount);
  return dateOnly(date);
}
function startOfWeek(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay() || 7;
  return addDays(value, 1 - weekday);
}
function daysBetween(start, end) {
  const rows = [];
  for (let cursor = start; cursor && cursor <= end; cursor = addDays(cursor, 1)) rows.push(cursor);
  return rows;
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
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", weekday: "short" })
    .format(new Date(year, month - 1, day));
}
function longDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })
    .format(new Date(year, month - 1, day));
}
function personName(row = {}) {
  return String(row.fullName || row.name || row.adSoyad || "").trim() || "Personel";
}
function personDayRate(row = {}) {
  return numberValue(row.dayRate ?? row.dayWage ?? row.daytimeWage ?? row.gunduzUcreti);
}
function personNightRate(row = {}) {
  return numberValue(row.nightRate ?? row.nightWage ?? row.nighttimeWage ?? row.geceUcreti);
}
function rowDate(row = {}) {
  return String(row.workDate || row.date || "").slice(0, 10);
}
function summarize(rows = [], peopleById = new Map()) {
  const map = new Map();
  for (const row of rows) {
    const date = rowDate(row);
    if (!date) continue;
    const employeeId = String(row.employeeId || row.personId || row.id || "");
    const day = Boolean(row.day ?? row.dayShift);
    const night = Boolean(row.night ?? row.nightShift);
    const person = peopleById.get(employeeId) || {};
    const rowAmount = row.totalAmount !== undefined
      ? numberValue(row.totalAmount)
      : (day ? numberValue(row.dayWage ?? personDayRate(person)) : 0)
        + (night ? numberValue(row.nightWage ?? personNightRate(person)) : 0);
    const current = map.get(date) || {
      date,
      people: new Set(),
      dayCount: 0,
      nightCount: 0,
      total: 0,
      entries: [],
    };
    if (employeeId) current.people.add(employeeId);
    if (day) current.dayCount += 1;
    if (night) current.nightCount += 1;
    current.total += rowAmount;
    current.entries.push({ ...row, employeeId, day, night, person, amount: rowAmount });
    map.set(date, current);
  }
  return new Map([...map.entries()].map(([date, row]) => [date, { ...row, peopleCount: row.people.size }]));
}

function DailyOperationsOverview({ activeMainCompany }) {
  const today = useMemo(() => dateOnly(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const previousWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const rangeStart = previousWeekStart;
  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const [peopleResult, attendanceResult] = await Promise.allSettled([
      getGunlukPersonel({ mainCompanyId: companyId }),
      getGunlukDurum({ mainCompanyId: companyId, start: rangeStart, end: today }),
    ]);
    if (peopleResult.status === "fulfilled") setPeople(Array.isArray(peopleResult.value) ? peopleResult.value : []);
    else setPeople([]);
    if (attendanceResult.status === "fulfilled") setAttendance(Array.isArray(attendanceResult.value) ? attendanceResult.value : []);
    else setAttendance([]);
    if (peopleResult.status === "rejected" || attendanceResult.status === "rejected") {
      const detail = attendanceResult.status === "rejected"
        ? attendanceResult.reason?.message
        : peopleResult.reason?.message;
      setNotice(detail || "Günlük Operasyon verilerinin bir bölümü okunamadı.");
    }
    setLoading(false);
  }, [companyId, rangeStart, today]);

  useEffect(() => { load(); }, [load]);

  const activePeople = useMemo(() => people.filter((row) => {
    const status = String(row.status || "").toLocaleUpperCase("tr-TR");
    return row.active !== false && !["PASSIVE", "PASIF", "PASİF"].includes(status);
  }), [people]);

  const peopleById = useMemo(
    () => new Map(people.map((row) => [String(row.id || row.employeeId || ""), row])),
    [people],
  );
  const daily = useMemo(() => summarize(attendance, peopleById), [attendance, peopleById]);
  const todayRow = daily.get(today) || { dayCount: 0, nightCount: 0, peopleCount: 0, total: 0, entries: [] };
  const currentWeekDays = useMemo(() => daysBetween(weekStart, addDays(weekStart, 6)), [weekStart]);
  const previousWeekDays = useMemo(() => daysBetween(previousWeekStart, addDays(previousWeekStart, 6)), [previousWeekStart]);
  const recentDays = useMemo(() => daysBetween(rangeStart, today).reverse(), [rangeStart, today]);

  const weekSummary = useMemo(() => {
    const collect = (days) => days.reduce((acc, date) => {
      const row = daily.get(date);
      if (!row) return acc;
      acc.day += row.dayCount;
      acc.night += row.nightCount;
      acc.total += row.total;
      row.entries.forEach((entry) => entry.employeeId && acc.people.add(entry.employeeId));
      return acc;
    }, { day: 0, night: 0, total: 0, people: new Set() });
    return { current: collect(currentWeekDays.filter((date) => date <= today)), previous: collect(previousWeekDays) };
  }, [currentWeekDays, daily, previousWeekDays, today]);

  const todayEntries = useMemo(
    () => [...todayRow.entries].sort((a, b) => personName(a.person).localeCompare(personName(b.person), "tr")),
    [todayRow.entries],
  );

  const noRecordDays = currentWeekDays.filter((date) => date <= today && !daily.has(date)).length;

  return (
    <div className="gop-page">
      <header className="gop-hero">
        <div>
          <span>GÜNLÜK OPERASYON / CANLI ÖZET</span>
          <h1>Operasyon Ana Ekranı</h1>
          <p>{longDate(today)} · gündüz/gece çalışan akışı, haftalık devam ve ödeme görünümü.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/>{loading ? "Yenileniyor..." : "Yenile"}</button>
      </header>

      {notice ? <div className="gop-notice">{notice}</div> : null}

      <section className="gop-kpis">
        <article><div className="gop-icon"><Users size={20}/></div><span>Bugün Gelen</span><strong>{todayRow.peopleCount}</strong><small>{activePeople.length} aktif günlük personel</small></article>
        <article><div className="gop-icon"><Sun size={20}/></div><span>Bugün Gündüz</span><strong>{todayRow.dayCount}</strong><small>Gündüz vardiyası kaydı</small></article>
        <article><div className="gop-icon"><Moon size={20}/></div><span>Bugün Gece</span><strong>{todayRow.nightCount}</strong><small>Gece vardiyası kaydı</small></article>
        <article><div className="gop-icon"><WalletCards size={20}/></div><span>Bu Hafta Tahmini</span><strong>{money(weekSummary.current.total)}</strong><small>{weekSummary.current.people.size} farklı personel</small></article>
      </section>

      <section className="gop-card">
        <div className="gop-card-head">
          <div><span>BU HAFTA</span><h2>Gün Gün Operasyon</h2></div>
          <small>{noRecordDays ? `${noRecordDays} geçmiş günde kayıt yok` : "Geçmiş gün kayıtları tamam"}</small>
        </div>
        <div className="gop-week-grid">
          {currentWeekDays.map((date) => {
            const row = daily.get(date);
            const future = date > today;
            const isToday = date === today;
            return <article key={date} className={isToday ? "is-today" : future ? "is-future" : ""}>
              <div className="gop-day-title"><b>{shortDate(date)}</b>{isToday ? <span>BUGÜN</span> : null}</div>
              {future ? <div className="gop-day-empty">Bekleniyor</div> : row ? <>
                <div className="gop-shifts"><span><Sun size={14}/> {row.dayCount}</span><span><Moon size={14}/> {row.nightCount}</span></div>
                <strong>{row.peopleCount} kişi</strong>
                <small>{money(row.total)}</small>
              </> : <div className="gop-day-empty">Kayıt yok</div>}
            </article>;
          })}
        </div>
      </section>

      <div className="gop-two">
        <section className="gop-card">
          <div className="gop-card-head"><div><span>BUGÜN</span><h2>Gelen Personel</h2></div><small>{todayEntries.length} kayıt</small></div>
          <div className="gop-people-list">
            {todayEntries.length ? todayEntries.map((entry, index) => (
              <div className="gop-person" key={`${entry.employeeId}-${index}`}>
                <div className="gop-avatar">{personName(entry.person).split(" ").filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</div>
                <div><strong>{personName(entry.person)}</strong><small>{entry.person?.qualification || entry.person?.role || entry.person?.skillName || "Günlük Personel"}</small></div>
                <div className="gop-shift-tags">{entry.day ? <span className="day">Gündüz</span> : null}{entry.night ? <span className="night">Gece</span> : null}</div>
              </div>
            )) : <div className="gop-empty">Bugün için henüz günlük giriş kaydı yok.</div>}
          </div>
        </section>

        <section className="gop-card">
          <div className="gop-card-head"><div><span>KARŞILAŞTIRMA</span><h2>Haftalık Operasyon</h2></div></div>
          <div className="gop-compare">
            <article><span>Bu Hafta</span><strong>{weekSummary.current.people.size} kişi</strong><small>Gündüz {weekSummary.current.day} · Gece {weekSummary.current.night}</small><b>{money(weekSummary.current.total)}</b></article>
            <article><span>Geçen Hafta</span><strong>{weekSummary.previous.people.size} kişi</strong><small>Gündüz {weekSummary.previous.day} · Gece {weekSummary.previous.night}</small><b>{money(weekSummary.previous.total)}</b></article>
          </div>
        </section>
      </div>

      <section className="gop-card">
        <div className="gop-card-head"><div><span>SON DÖNEM</span><h2>Günlük Hareket Özeti</h2></div><small>Önceki hafta + bu hafta</small></div>
        <div className="gop-history">
          <div className="gop-history-head"><span>Tarih</span><span>Gündüz</span><span>Gece</span><span>Kişi</span><span>Tahmini Ödeme</span></div>
          {recentDays.map((date) => {
            const row = daily.get(date);
            return <div className={date === today ? "is-today" : ""} key={date}>
              <strong>{shortDate(date)}</strong>
              <span>{row?.dayCount || 0}</span>
              <span>{row?.nightCount || 0}</span>
              <span>{row?.peopleCount || 0}</span>
              <b>{money(row?.total || 0)}</b>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}

export default function GunlukOperasyonPage({ activeTab = "ana-ekran", activeMainCompany }) {
  if (activeTab !== "ana-ekran") {
    return <IkPage activeTab={SUBVIEW_MAP[activeTab] || "gunluk-personel"} activeMainCompany={activeMainCompany} dailyOnly />;
  }
  return <DailyOperationsOverview activeMainCompany={activeMainCompany} />;
}
