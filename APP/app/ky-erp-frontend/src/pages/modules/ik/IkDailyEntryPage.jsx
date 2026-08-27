import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Moon,
  RefreshCw,
  Search,
  Sun,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  getGunlukPersonel,
  getGunlukPersonelListe,
  getGunlukPuantaj,
  saveGunlukPersonelGunKayitlari,
  saveGunlukPersonelListe,
} from "../../../services/ikApi";
import "./ik-daily-entry.css";

const LOCAL_ROSTER_PREFIX = "kyerp.ik.dailyRoster.v3";

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function addDays(value, amount) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day + amount, 12, 0, 0, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weekRange(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const weekday = date.getDay() || 7;
  const start = addDays(value, 1 - weekday);
  return { start, end: addDays(start, 6) };
}

function dateRange(start, end) {
  if (!start || !end || start > end) return [];
  const rows = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 62) {
    rows.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return rows;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function dayLabel(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(year, month - 1, day, 12, 0, 0, 0));
}

function fullDayLabel(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12, 0, 0, 0));
}

function normalizePerson(row = {}) {
  return {
    ...row,
    id: String(row.id || ""),
    name: String(row.name || row.fullName || row.adSoyad || "").trim(),
    personnelNo: String(row.personnelNo || row.personelNo || "").trim(),
    role: String(row.role || row.qualification || row.title || "Vasıfsız").trim(),
    broker: String(row.broker || row.araci || "Direkt").trim(),
    dayRate: Number(row.dayRate ?? row.dayWage ?? 0) || 0,
    nightRate: Number(row.nightRate ?? row.nightWage ?? 0) || 0,
    active: row.active !== false,
  };
}

function attendanceDate(row) {
  return String(row?.workDate || row?.date || "").slice(0, 10);
}

function attendanceEmployeeId(row) {
  return String(row?.employeeId || row?.personId || "");
}

function localRosterKey(companyId, range) {
  return `${LOCAL_ROSTER_PREFIX}|${companyId}|${range.start}|${range.end}`;
}

function readLocalRoster(companyId, range) {
  try {
    const raw = window.localStorage.getItem(localRosterKey(companyId, range));
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.ids) ? parsed.ids.map(String) : [];
  } catch {
    return null;
  }
}

function writeLocalRoster(companyId, range, ids) {
  try {
    window.localStorage.setItem(
      localRosterKey(companyId, range),
      JSON.stringify({ ids: [...ids], savedAt: new Date().toISOString() }),
    );
  } catch {
    // Tarayıcı depolaması kapalı olsa da D1 kaydı çalışmaya devam eder.
  }
}

async function retryRead(factory, attempts = 2) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (![0, 500, 502, 503, 504].includes(status) || index === attempts - 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 350 * (index + 1)));
    }
  }
  throw lastError;
}

export default function IkDailyEntryPage({ activeMainCompany }) {
  const companyId = String(
    activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan",
  );
  const initialRange = useMemo(() => weekRange(todayDateOnly()), []);
  const [range, setRange] = useState(initialRange);
  const [selectedDate, setSelectedDate] = useState(() => todayDateOnly());
  const [shift, setShift] = useState("day");
  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [rosterIds, setRosterIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [rosterBusy, setRosterBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const days = useMemo(() => dateRange(range.start, range.end), [range.end, range.start]);

  useEffect(() => {
    if (!days.length) return;
    if (!days.includes(selectedDate)) setSelectedDate(days[0]);
  }, [days, selectedDate]);

  const workedIdsForRange = useCallback(
    (rows) =>
      new Set(
        (Array.isArray(rows) ? rows : [])
          .filter((row) => {
            const date = attendanceDate(row);
            return (
              date >= range.start &&
              date <= range.end &&
              Boolean(row?.day ?? row?.dayShift) ||
              (date >= range.start && date <= range.end && Boolean(row?.night ?? row?.nightShift))
            );
          })
          .map(attendanceEmployeeId)
          .filter(Boolean),
      ),
    [range.end, range.start],
  );

  const load = useCallback(async () => {
    if (!range.start || !range.end) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [personRows, attendanceRows, rosterResult] = await Promise.all([
        retryRead(() => getGunlukPersonel({ mainCompanyId: companyId })),
        retryRead(() =>
          getGunlukPuantaj({
            mainCompanyId: companyId,
            startDate: range.start,
            endDate: range.end,
          }),
        ),
        retryRead(() =>
          getGunlukPersonelListe({
            mainCompanyId: companyId,
            startDate: range.start,
            endDate: range.end,
          }),
        ),
      ]);

      const normalizedPeople = (Array.isArray(personRows) ? personRows : [])
        .map(normalizePerson)
        .filter((person) => person.id && person.name)
        .sort((left, right) => left.name.localeCompare(right.name, "tr"));
      const normalizedAttendance = Array.isArray(attendanceRows) ? attendanceRows : [];
      const activeIds = normalizedPeople.filter((person) => person.active).map((person) => person.id);
      const activeSet = new Set(activeIds);
      const workedIds = workedIdsForRange(normalizedAttendance);
      const localIds = readLocalRoster(companyId, range);
      const serverIds = Array.isArray(rosterResult?.employeeIds)
        ? rosterResult.employeeIds.map(String).filter((id) => activeSet.has(id))
        : [];

      let nextIds;
      if (localIds !== null) {
        nextIds = new Set(localIds.filter((id) => activeSet.has(id)));
      } else {
        const serverLooksLikeLegacyAutoPool =
          activeIds.length > 0 &&
          serverIds.length === activeIds.length &&
          activeIds.every((id) => serverIds.includes(id));
        nextIds = new Set(serverLooksLikeLegacyAutoPool ? [] : serverIds);
        if (serverLooksLikeLegacyAutoPool) {
          setNotice(
            "Eski otomatik personel havuzu temizlendi. Bu tarih aralığında yalnız seçtiğiniz personeller çalışma listesine girer.",
          );
        }
      }

      workedIds.forEach((id) => {
        if (activeSet.has(id)) nextIds.add(id);
      });

      setPeople(normalizedPeople);
      setAttendance(normalizedAttendance);
      setRosterIds(nextIds);
      writeLocalRoster(companyId, range, nextIds);
    } catch (loadError) {
      setError(loadError?.message || "Günlük İK verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyId, range, workedIdsForRange]);

  useEffect(() => {
    load();
  }, [load]);

  const roles = useMemo(
    () =>
      [...new Set(people.filter((person) => person.active).map((person) => person.role).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "tr")),
    [people],
  );

  const poolPeople = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return people
      .filter((person) => person.active)
      .filter((person) => !roleFilter || person.role === roleFilter)
      .filter((person) => {
        if (!term) return true;
        return `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`
          .toLocaleLowerCase("tr-TR")
          .includes(term);
      });
  }, [people, roleFilter, search]);

  const rosterPeople = useMemo(
    () =>
      people
        .filter((person) => person.active && rosterIds.has(person.id))
        .sort((left, right) => left.name.localeCompare(right.name, "tr")),
    [people, rosterIds],
  );

  const entryFor = useCallback(
    (personId, date = selectedDate) =>
      attendance.find(
        (row) => attendanceEmployeeId(row) === personId && attendanceDate(row) === date,
      ) || null,
    [attendance, selectedDate],
  );

  const selectedDaySummary = useMemo(() => {
    let dayCount = 0;
    let nightCount = 0;
    let total = 0;
    rosterPeople.forEach((person) => {
      const row = entryFor(person.id, selectedDate) || {};
      const day = Boolean(row?.day ?? row?.dayShift);
      const night = Boolean(row?.night ?? row?.nightShift);
      if (day) {
        dayCount += 1;
        total += person.dayRate;
      }
      if (night) {
        nightCount += 1;
        total += person.nightRate;
      }
    });
    return { dayCount, nightCount, total };
  }, [entryFor, rosterPeople, selectedDate]);

  const rangeTotal = useMemo(() => {
    let total = 0;
    days.forEach((date) => {
      rosterPeople.forEach((person) => {
        const row = entryFor(person.id, date) || {};
        if (Boolean(row?.day ?? row?.dayShift)) total += person.dayRate;
        if (Boolean(row?.night ?? row?.nightShift)) total += person.nightRate;
      });
    });
    return total;
  }, [days, entryFor, rosterPeople]);

  const persistRoster = async (nextRoster, message) => {
    setRosterBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveGunlukPersonelListe({
        mainCompanyId: companyId,
        startDate: range.start,
        endDate: range.end,
        employeeIds: [...nextRoster],
      });
      const returned = Array.isArray(result?.employeeIds)
        ? result.employeeIds.map(String)
        : [...nextRoster];
      const next = new Set(returned);
      setRosterIds(next);
      writeLocalRoster(companyId, range, next);
      setNotice(message || "Tarih aralığı personel listesi kaydedildi.");
      return true;
    } catch (saveError) {
      setError(saveError?.message || "Personel listesi kaydedilemedi.");
      return false;
    } finally {
      setRosterBusy(false);
    }
  };

  const toggleRoster = async (person) => {
    if (!person?.id || rosterBusy) return;
    const next = new Set(rosterIds);
    const willAdd = !next.has(person.id);
    if (willAdd) next.add(person.id);
    else next.delete(person.id);
    await persistRoster(
      next,
      willAdd
        ? `${person.name} çalışma listesine eklendi.`
        : `${person.name} çalışma listesinden çıkarıldı. Çalışılmış gün varsa sistem kaydı korur.`,
    );
  };

  const clearRoster = async () => {
    if (rosterBusy) return;
    await persistRoster(
      new Set(),
      "Tarih aralığı seçimi temizlendi. Çalışılmış personeller kayıt güvenliği için listede kalabilir.",
    );
  };

  const updateLocalAttendance = (person, active) => {
    setAttendance((current) => {
      const index = current.findIndex(
        (row) =>
          attendanceEmployeeId(row) === person.id &&
          attendanceDate(row) === selectedDate,
      );
      const currentRow = index >= 0 ? current[index] : null;
      const nextDay = shift === "day" ? active : Boolean(currentRow?.day ?? currentRow?.dayShift);
      const nextNight = shift === "night" ? active : Boolean(currentRow?.night ?? currentRow?.nightShift);
      if (!nextDay && !nextNight) {
        return index >= 0 ? current.filter((_, rowIndex) => rowIndex !== index) : current;
      }
      const nextRow = {
        ...(currentRow || {}),
        id: currentRow?.id || `local-${person.id}-${selectedDate}`,
        employeeId: person.id,
        workDate: selectedDate,
        date: selectedDate,
        day: nextDay,
        dayShift: nextDay,
        night: nextNight,
        nightShift: nextNight,
        dayWage: person.dayRate,
        nightWage: person.nightRate,
      };
      if (index < 0) return [...current, nextRow];
      return current.map((row, rowIndex) => (rowIndex === index ? nextRow : row));
    });
  };

  const toggleAttendance = async (person) => {
    if (!person?.id || busyIds.has(person.id)) return;
    if (shift === "night" && person.nightRate <= 0) {
      setError(`${person.name} için gece ücreti tanımlı değil.`);
      return;
    }
    const current = entryFor(person.id, selectedDate) || {};
    const isActive = shift === "day"
      ? Boolean(current?.day ?? current?.dayShift)
      : Boolean(current?.night ?? current?.nightShift);
    const nextActive = !isActive;

    setBusyIds((ids) => new Set([...ids, person.id]));
    setError("");
    setNotice("");
    updateLocalAttendance(person, nextActive);
    try {
      await saveGunlukPersonelGunKayitlari({
        mainCompanyId: companyId,
        date: selectedDate,
        shift,
        personnelEntries: [
          {
            personelId: person.id,
            status: nextActive ? "ACTIVE" : "REMOVE",
            note: "",
          },
        ],
      });
      setNotice(
        `${person.name} · ${fullDayLabel(selectedDate)} ${shift === "day" ? "gündüz" : "gece"} ${nextActive ? "kaydedildi" : "kaldırıldı"}.`,
      );
    } catch (saveError) {
      updateLocalAttendance(person, isActive);
      setError(saveError?.message || "Günlük çalışma kaydı kaydedilemedi.");
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(person.id);
        return next;
      });
    }
  };

  const changeRange = (field, value) => {
    setRange((current) => {
      const next = { ...current, [field]: value };
      if (next.start && next.end && next.start > next.end) {
        if (field === "start") next.end = value;
        else next.start = value;
      }
      return next;
    });
  };

  return (
    <section className="ikde-page">
      <div className="ikde-head">
        <div>
          <span>İK / GÜNLÜK PERSONEL</span>
          <h1>Günlük Giriş</h1>
          <p>
            Personel havuzu ayrı, seçili tarih aralığının çalışma listesi ayrıdır.
            Gündüz ve gece kayıtları birbirinden bağımsız tutulur.
          </p>
        </div>
        <button type="button" className="ikde-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> Yenile
        </button>
      </div>

      <div className="ikde-toolbar">
        <label>
          Başlangıç
          <input type="date" value={range.start} onChange={(event) => changeRange("start", event.target.value)} />
        </label>
        <label>
          Bitiş
          <input type="date" value={range.end} onChange={(event) => changeRange("end", event.target.value)} />
        </label>
        <div className="ikde-shifts">
          <button type="button" className={shift === "day" ? "active" : ""} onClick={() => setShift("day")}>
            <Sun size={16} /> Gündüz
          </button>
          <button type="button" className={shift === "night" ? "active" : ""} onClick={() => setShift("night")}>
            <Moon size={16} /> Gece
          </button>
        </div>
        <button type="button" className="ikde-clear" onClick={clearRoster} disabled={rosterBusy || !rosterPeople.length}>
          Seçili Listeyi Temizle
        </button>
      </div>

      {notice ? <div className="ikde-notice"><CheckCircle2 size={16} />{notice}</div> : null}
      {error ? <div className="ikde-error">{error}</div> : null}

      <div className="ikde-days">
        {days.map((date) => {
          const dayRows = rosterPeople.map((person) => entryFor(person.id, date) || {});
          const dayCount = dayRows.filter((row) => Boolean(row?.day ?? row?.dayShift)).length;
          const nightCount = dayRows.filter((row) => Boolean(row?.night ?? row?.nightShift)).length;
          return (
            <button
              type="button"
              key={date}
              className={selectedDate === date ? "active" : ""}
              onClick={() => setSelectedDate(date)}
            >
              <strong>{dayLabel(date)}</strong>
              <span>G {dayCount} · N {nightCount}</span>
            </button>
          );
        })}
      </div>

      <div className="ikde-stats">
        <div><Users size={18}/><span>Çalışma listesi<strong>{rosterPeople.length}</strong></span></div>
        <div><Sun size={18}/><span>Seçili gün gündüz<strong>{selectedDaySummary.dayCount}</strong></span></div>
        <div><Moon size={18}/><span>Seçili gün gece<strong>{selectedDaySummary.nightCount}</strong></span></div>
        <div><CalendarDays size={18}/><span>Seçili gün toplam<strong>{money(selectedDaySummary.total)}</strong></span></div>
        <div><CheckCircle2 size={18}/><span>Aralık toplamı<strong>{money(rangeTotal)}</strong></span></div>
      </div>

      <div className="ikde-layout">
        <aside className="ikde-pool">
          <div className="ikde-panel-head">
            <div><span>PERSONEL HAVUZU</span><strong>{poolPeople.length} kişi</strong></div>
          </div>
          <label className="ikde-search">
            <Search size={16}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Personel ara" />
          </label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">Tüm vasıflar</option>
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <div className="ikde-pool-list">
            {poolPeople.map((person) => {
              const included = rosterIds.has(person.id);
              return (
                <button
                  type="button"
                  key={person.id}
                  className={included ? "included" : ""}
                  onClick={() => toggleRoster(person)}
                  disabled={rosterBusy}
                >
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.role} · G {money(person.dayRate)} · N {money(person.nightRate)}</small>
                  </span>
                  {included ? <UserMinus size={17}/> : <UserPlus size={17}/>} 
                </button>
              );
            })}
          </div>
        </aside>

        <main className="ikde-main">
          <div className="ikde-panel-head">
            <div>
              <span>SEÇİLİ GÜNÜN PERSONEL GİRİŞİ</span>
              <strong>{fullDayLabel(selectedDate)} / {shift === "day" ? "Gündüz" : "Gece"}</strong>
            </div>
            <em>{rosterPeople.length} personel</em>
          </div>

          {loading ? (
            <div className="ikde-empty">Günlük İK verileri yükleniyor...</div>
          ) : rosterPeople.length ? (
            <div className="ikde-roster-list">
              {rosterPeople.map((person) => {
                const row = entryFor(person.id, selectedDate) || {};
                const active = shift === "day"
                  ? Boolean(row?.day ?? row?.dayShift)
                  : Boolean(row?.night ?? row?.nightShift);
                const busy = busyIds.has(person.id);
                return (
                  <div className={`ikde-person-row ${active ? "worked" : ""}`} key={person.id}>
                    <div className="ikde-person-main">
                      <strong>{person.name}</strong>
                      <span>{person.personnelNo || "-"} · {person.role} · {person.broker}</span>
                    </div>
                    <div className="ikde-rate">
                      <span>{shift === "day" ? "Gündüz" : "Gece"} ücret</span>
                      <strong>{money(shift === "day" ? person.dayRate : person.nightRate)}</strong>
                    </div>
                    <button
                      type="button"
                      className={active ? "active" : ""}
                      onClick={() => toggleAttendance(person)}
                      disabled={busy}
                    >
                      {active ? <CheckCircle2 size={17}/> : <ChevronRight size={17}/>} 
                      {busy ? "Kaydediliyor" : active ? "Çalıştı" : "Giriş Yap"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ikde-empty">
              <Users size={28}/>
              <strong>Bu tarih aralığının çalışma listesi boş.</strong>
              <span>Soldaki personel havuzundan yalnız çalışacak kişileri ekleyin.</span>
            </div>
          )}
        </main>

        <aside className="ikde-summary">
          <span>SEÇİLİ GÜN KONTROLÜ</span>
          <h3>{fullDayLabel(selectedDate)}</h3>
          <div><small>Çalışma listesi</small><strong>{rosterPeople.length}</strong></div>
          <div><small>Gündüz çalışan</small><strong>{selectedDaySummary.dayCount}</strong></div>
          <div><small>Gece çalışan</small><strong>{selectedDaySummary.nightCount}</strong></div>
          <div><small>Günlük toplam</small><strong>{money(selectedDaySummary.total)}</strong></div>
          <div><small>Tarih aralığı toplamı</small><strong>{money(rangeTotal)}</strong></div>
          <p>Çalışma kaydı bulunan personel geçmiş güvenliği için roster listesinden otomatik silinmez.</p>
        </aside>
      </div>
    </section>
  );
}
