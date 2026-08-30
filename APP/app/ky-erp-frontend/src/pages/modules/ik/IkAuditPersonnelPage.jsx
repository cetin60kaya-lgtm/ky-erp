import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  Clock,
  FileText,
  IdCard,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { getAuditPdksMonth } from "../../../services/ikAuditApi";
import "./ik-audit-personnel.css";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const TABS = [
  ["overview", "PDKS Genel", LayoutDashboard],
  ["live", "Canlı Kart", Clock],
  ["attendance", "Giriş / Çıkış", IdCard],
  ["missing", "Eksik Kartlar", CircleAlert],
  ["timesheet", "Puantaj", CalendarDays],
  ["reports", "Raporlar", FileText],
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function initials(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function dateText(value) {
  const raw = String(value || "").slice(0, 10);
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}.${month}.${year}` : raw || "-";
}

function minuteText(value) {
  const minutes = Number(value || 0);
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes} dk`;
  const hour = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hour} sa ${rest} dk` : `${hour} sa`;
}

function statusLabel(value) {
  const labels = {
    CALISTI: "Tam Çalıştı",
    EKSIK_BASIM: "Eksik Basım",
    KART_YOK: "Kart Yok",
    YILLIK_IZIN: "Yıllık İzin",
    IZIN: "İzinli",
    RESMI_TATIL: "Resmî Tatil",
    HAFTA_SONU: "Hafta Sonu",
    DEVAMSIZ: "Devamsız",
    DONEM_DISI: "Dönem Dışı",
  };
  return labels[String(value || "").toUpperCase()] || value || "-";
}

function tone(value) {
  const status = String(value || "").toUpperCase();
  if (status === "CALISTI") return "ok";
  if (["YILLIK_IZIN", "IZIN", "RESMI_TATIL", "HAFTA_SONU"].includes(status)) return "info";
  if (status === "EKSIK_BASIM") return "warn";
  if (["KART_YOK", "DEVAMSIZ"].includes(status)) return "bad";
  return "muted";
}

function Stat({ label, value, detail, toneName = "" }) {
  return (
    <article className={`ika-stat ${toneName}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Status({ value }) {
  return <span className={`ika-status-pill ${tone(value)}`}>{statusLabel(value)}</span>;
}

function Empty({ children = "Kayıt bulunamadı." }) {
  return <div className="ika-empty">{children}</div>;
}

function personAggregate(person, rows) {
  const source = rows.filter((row) => row.employeeId === person.id);
  return {
    ...person,
    worked: source.filter((row) => row.status === "CALISTI").length,
    missing: source.filter((row) => row.status === "EKSIK_BASIM").length,
    noPunch: source.filter((row) => row.status === "KART_YOK").length,
    leave: source.filter((row) => ["YILLIK_IZIN", "IZIN"].includes(row.status)).length,
    lateMinutes: source.reduce((sum, row) => sum + Number(row.lateMinutes || 0), 0),
    overtimeMinutes: source.reduce((sum, row) => sum + Number(row.overtimeMinutes || 0), 0),
  };
}

export default function IkAuditPersonnelPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState("overview");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const result = await getAuditPdksMonth({ year, month });
    const people = Array.isArray(result?.people)
      ? result.people.filter(
          (person) =>
            String(person?.sgkStatus || "").trim().toLocaleUpperCase("tr-TR") === "VAR" &&
            String(person?.cardNo || "").trim(),
        )
      : [];
    const allowed = new Set(people.map((person) => person.id));
    const rows = Array.isArray(result?.rows)
      ? result.rows.filter((row) => allowed.has(row.employeeId))
      : [];
    const safe = { ...result, people, rows };
    setData(safe);
    setSelectedId((current) =>
      people.some((person) => person.id === current) ? current : people[0]?.id || "",
    );
  }, [month, year]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((cause) => {
        if (alive) setError(cause?.message || "PDKS verileri alınamadı.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  async function refresh() {
    try {
      setBusy(true);
      await load();
    } catch (cause) {
      setError(cause?.message || "PDKS verileri yenilenemedi.");
    } finally {
      setBusy(false);
    }
  }

  const people = useMemo(() => data?.people || [], [data?.people]);
  const rows = useMemo(() => data?.rows || [], [data?.rows]);
  const summary = data?.summary || {};
  const today = data?.today || localToday();
  const selectedPerson = people.find((person) => person.id === selectedId) || null;

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return people;
    return people.filter((person) =>
      [person.fullName, person.personnelCode, person.department, person.title, person.cardNo]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(needle),
    );
  }, [people, query]);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.employeeId === selectedId),
    [rows, selectedId],
  );

  const focusDate = useMemo(() => {
    const periodKey = `${year}-${pad(month)}`;
    if (today.startsWith(periodKey)) return today;
    const candidates = rows
      .filter((row) => !["DONEM_DISI"].includes(row.status))
      .map((row) => row.date)
      .filter(Boolean)
      .sort();
    return candidates.at(-1) || data?.periodEnd || "";
  }, [data?.periodEnd, month, rows, today, year]);

  const focusRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((row) => row.date === focusDate)
      .filter((row) => {
        if (!needle) return true;
        return `${row.fullName} ${row.cardNo} ${row.personnelCode} ${row.department}`
          .toLocaleLowerCase("tr-TR")
          .includes(needle);
      })
      .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "tr"));
  }, [focusDate, query, rows]);

  const missingRows = useMemo(
    () => rows
      .filter((row) => ["KART_YOK", "EKSIK_BASIM"].includes(row.status))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.fullName).localeCompare(String(b.fullName), "tr")),
    [rows],
  );

  const reportRows = useMemo(
    () => rows
      .filter(
        (row) =>
          ["KART_YOK", "EKSIK_BASIM", "DEVAMSIZ"].includes(row.status) ||
          Number(row.lateMinutes || 0) > 0 ||
          Number(row.earlyMinutes || 0) > 0 ||
          Number(row.overtimeMinutes || 0) > 0,
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.fullName).localeCompare(String(b.fullName), "tr")),
    [rows],
  );

  const timesheetRows = useMemo(
    () => people.map((person) => personAggregate(person, rows)),
    [people, rows],
  );

  const focusSummary = useMemo(() => ({
    complete: focusRows.filter((row) => row.status === "CALISTI").length,
    missing: focusRows.filter((row) => row.status === "EKSIK_BASIM").length,
    noPunch: focusRows.filter((row) => row.status === "KART_YOK").length,
    late: focusRows.filter((row) => Number(row.lateMinutes || 0) > 0).length,
  }), [focusRows]);

  function selectPerson(id, tab = "attendance") {
    setSelectedId(id);
    setActiveTab(tab);
  }

  function downloadCsv() {
    const headers = ["Tarih", "Kart No", "Personel", "Durum", "Giriş", "Çıkış", "Geç Dk", "Erken Dk", "Mesai Dk", "Not"];
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = reportRows.map((row) => [
      row.date,
      row.cardNo,
      row.fullName,
      statusLabel(row.status),
      row.entry,
      row.exit,
      row.lateMinutes || 0,
      row.earlyMinutes || 0,
      row.overtimeMinutes || 0,
      row.note || "",
    ].map(escape).join(";"));
    const content = `\ufeff${headers.map(escape).join(";")}\n${lines.join("\n")}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `KYERP-PDKS-DENETIM-${year}-${pad(month)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="ika-loading">PDKS denetim ekranı yükleniyor...</div>;

  return (
    <div className="ika-page">
      <header className="ika-header">
        <div>
          <span>İK / PDKS / DENETİM</span>
          <h1>PDKS Denetim Merkezi</h1>
          <p>Yalnız SGK durumu VAR ve kart numarası bulunan aylık personel gösterilir. Günlük personel ve ücret bilgileri bu ekranda yer almaz.</p>
        </div>
        <div className="ika-header-actions">
          <span className="ika-readonly"><ShieldCheck size={16} /> Salt okunur</span>
          <button type="button" onClick={refresh} disabled={busy}>
            <RefreshCw size={16} /> {busy ? "Yenileniyor" : "Yenile"}
          </button>
        </div>
      </header>

      {error ? <div className="ika-error"><CircleAlert size={16} /> {error}</div> : null}

      <section className="ika-toolbar">
        <nav className="ika-tabs" aria-label="PDKS bölümleri">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? "active" : ""}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="ika-period">
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
          <input
            type="number"
            min="2020"
            max="2100"
            value={year}
            onChange={(event) => setYear(Number(event.target.value || now.getFullYear()))}
          />
        </div>
      </section>

      <section className="ika-stats">
        <Stat label="SGK + Kart Personeli" value={people.length} detail="Denetim kapsamındaki tek personel kümesi" />
        <Stat label="Tam Çalışma" value={summary.workedDays || 0} detail="Seçili ay kişi/gün" toneName="ok" />
        <Stat label="Eksik Basım" value={summary.missingPunchDays || 0} detail="Tek taraflı veya eksik kart" toneName="warn" />
        <Stat label="Kart Yok" value={summary.noPunchDays || 0} detail="Çalışma gününde hareket yok" toneName="bad" />
        <Stat label="Toplam Geç" value={minuteText(summary.lateMinutes)} detail={`${summary.lateDays || 0} gecikmeli kişi/gün`} />
        <Stat label="Fazla Süre" value={minuteText(summary.overtimeMinutes)} detail={`${data?.expectedIn || "08:30"} / ${data?.expectedOut || "19:00"} referansı`} />
      </section>

      {activeTab === "overview" ? (
        <section className="ika-panel">
          <div className="ika-panel-head">
            <div><small>SEÇİLİ DÖNEM</small><h2>PDKS Genel Kontrol</h2><p>{MONTHS[month - 1]} {year} · SGK ve kart filtresi sunucu tarafında zorunlu.</p></div>
            <span className="ika-scope"><BadgeCheck size={15} /> DENETİM / SGK</span>
          </div>
          <div className="ika-overview-grid">
            <article>
              <strong>{focusRows.length}</strong><span>{dateText(focusDate)} kapsam personeli</span>
            </article>
            <article className="ok"><strong>{focusSummary.complete}</strong><span>Tam giriş / çıkış</span></article>
            <article className="warn"><strong>{focusSummary.missing}</strong><span>Eksik basım</span></article>
            <article className="bad"><strong>{focusSummary.noPunch}</strong><span>Kart hareketi yok</span></article>
            <article><strong>{focusSummary.late}</strong><span>Geç giriş</span></article>
          </div>
          <div className="ika-table-wrap">
            <table>
              <thead><tr><th>Personel</th><th>Kart</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Mesai</th></tr></thead>
              <tbody>
                {focusRows.map((row) => (
                  <tr key={`${row.employeeId}-${row.date}`} onDoubleClick={() => selectPerson(row.employeeId)}>
                    <td><button type="button" className="ika-name-btn" onClick={() => selectPerson(row.employeeId)}>{row.fullName}</button></td>
                    <td>{row.cardNo}</td><td><Status value={row.status} /></td><td>{row.entry || "-"}</td><td>{row.exit || "-"}</td><td>{minuteText(row.lateMinutes)}</td><td>{minuteText(row.overtimeMinutes)}</td>
                  </tr>
                ))}
                {!focusRows.length ? <tr><td colSpan="7"><Empty>Bu tarih için PDKS kaydı bulunamadı.</Empty></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "live" ? (
        <section className="ika-panel">
          <div className="ika-panel-head">
            <div><small>CANLI KART GÖRÜNÜMÜ</small><h2>{dateText(focusDate)} Kart Durumu</h2><p>Her personelde günün ilk ve son geçerli kart saati gösterilir.</p></div>
            <label className="ika-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel veya kart ara" /></label>
          </div>
          <div className="ika-live-grid">
            {focusRows.map((row) => (
              <button key={row.employeeId} type="button" className={`ika-live-card ${tone(row.status)}`} onClick={() => selectPerson(row.employeeId)}>
                <b>{initials(row.fullName)}</b>
                <span><strong>{row.fullName}</strong><small>{row.cardNo} · {row.department || "-"}</small></span>
                <em><Status value={row.status} /><small>{row.entry || "--:--"} → {row.exit || "--:--"}</small></em>
              </button>
            ))}
            {!focusRows.length ? <Empty>Aramaya uygun kart kaydı bulunamadı.</Empty> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "attendance" ? (
        <section className="ika-split">
          <aside className="ika-directory">
            <label className="ika-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel ara" /></label>
            <div className="ika-count"><Users size={15} /> {filteredPeople.length} SGK'lı kart personeli</div>
            <div className="ika-list">
              {filteredPeople.map((person) => (
                <button key={person.id} type="button" className={person.id === selectedId ? "active" : ""} onClick={() => setSelectedId(person.id)}>
                  <b>{initials(person.fullName)}</b><span><strong>{person.fullName}</strong><small>{person.cardNo} · {person.department || "-"}</small></span>
                </button>
              ))}
            </div>
          </aside>
          <main className="ika-panel">
            {selectedPerson ? (
              <>
                <div className="ika-person-head">
                  <b>{initials(selectedPerson.fullName)}</b>
                  <div><small>{selectedPerson.personnelCode || "Personel"}</small><h2>{selectedPerson.fullName}</h2><p>{selectedPerson.department || "-"} · {selectedPerson.title || "-"}</p></div>
                  <span className="ika-person-status"><ShieldCheck size={15} /> SGK {selectedPerson.sgkStatus}</span>
                </div>
                <div className="ika-mini-grid">
                  <div><span>Kart No</span><strong>{selectedPerson.cardNo}</strong></div>
                  <div><span>İşe Giriş</span><strong>{dateText(selectedPerson.startDate)}</strong></div>
                  <div><span>İşten Çıkış</span><strong>{dateText(selectedPerson.exitDate)}</strong></div>
                  <div><span>Referans</span><strong>{data?.expectedIn || "08:30"} / {data?.expectedOut || "19:00"}</strong></div>
                </div>
                <div className="ika-table-wrap">
                  <table><thead><tr><th>Tarih</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Mesai</th><th>Not</th></tr></thead>
                    <tbody>{selectedRows.map((row) => <tr key={row.date}><td>{dateText(row.date)}</td><td><Status value={row.status} /></td><td>{row.entry || "-"}</td><td>{row.exit || "-"}</td><td>{minuteText(row.lateMinutes)}</td><td>{minuteText(row.earlyMinutes)}</td><td>{minuteText(row.overtimeMinutes)}</td><td>{row.note || (row.missingPunch ? "Eksik basım" : "-")}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            ) : <Empty>Personel seçin.</Empty>}
          </main>
        </section>
      ) : null}

      {activeTab === "missing" ? (
        <section className="ika-panel">
          <div className="ika-panel-head"><div><small>KONTROL LİSTESİ</small><h2>Eksik Kartlar</h2><p>Yalnız çalışma günündeki kart yok ve eksik basım kayıtları.</p></div><span className="ika-scope bad">{missingRows.length} kayıt</span></div>
          <div className="ika-table-wrap"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Kart</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Not</th></tr></thead><tbody>
            {missingRows.map((row) => <tr key={`${row.employeeId}-${row.date}`}><td>{dateText(row.date)}</td><td><button type="button" className="ika-name-btn" onClick={() => selectPerson(row.employeeId)}>{row.fullName}</button></td><td>{row.cardNo}</td><td><Status value={row.status} /></td><td>{row.entry || "-"}</td><td>{row.exit || "-"}</td><td>{row.note || (row.missingPunch ? "Eksik basım" : "Kart hareketi yok")}</td></tr>)}
            {!missingRows.length ? <tr><td colSpan="7"><Empty>Seçili ayda eksik kart kaydı yok.</Empty></td></tr> : null}
          </tbody></table></div>
        </section>
      ) : null}

      {activeTab === "timesheet" ? (
        <section className="ika-panel">
          <div className="ika-panel-head"><div><small>AYLIK TOPLAM</small><h2>Puantaj Özeti</h2><p>Kişi bazında kart hareketlerinden üretilen denetim özeti.</p></div></div>
          <div className="ika-table-wrap"><table><thead><tr><th>Personel</th><th>Kart</th><th>Çalıştı</th><th>Eksik</th><th>Kart Yok</th><th>İzin</th><th>Geç</th><th>Mesai</th></tr></thead><tbody>
            {timesheetRows.map((row) => <tr key={row.id}><td><button type="button" className="ika-name-btn" onClick={() => selectPerson(row.id)}>{row.fullName}</button></td><td>{row.cardNo}</td><td>{row.worked}</td><td>{row.missing}</td><td>{row.noPunch}</td><td>{row.leave}</td><td>{minuteText(row.lateMinutes)}</td><td>{minuteText(row.overtimeMinutes)}</td></tr>)}
            {!timesheetRows.length ? <tr><td colSpan="8"><Empty>Puantaj özeti bulunamadı.</Empty></td></tr> : null}
          </tbody></table></div>
        </section>
      ) : null}

      {activeTab === "reports" ? (
        <section className="ika-panel">
          <div className="ika-panel-head"><div><small>DENETİM RAPORU</small><h2>PDKS İstisna Raporu</h2><p>Eksik basım, kart yok, geç/erken hareket ve fazla süre kayıtları.</p></div><button type="button" className="ika-export" onClick={downloadCsv} disabled={!reportRows.length}><FileText size={16} /> CSV İndir</button></div>
          <div className="ika-table-wrap"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Kart</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Mesai</th></tr></thead><tbody>
            {reportRows.map((row) => <tr key={`${row.employeeId}-${row.date}`}><td>{dateText(row.date)}</td><td><button type="button" className="ika-name-btn" onClick={() => selectPerson(row.employeeId)}>{row.fullName}</button></td><td>{row.cardNo}</td><td><Status value={row.status} /></td><td>{row.entry || "-"}</td><td>{row.exit || "-"}</td><td>{minuteText(row.lateMinutes)}</td><td>{minuteText(row.earlyMinutes)}</td><td>{minuteText(row.overtimeMinutes)}</td></tr>)}
            {!reportRows.length ? <tr><td colSpan="9"><Empty>Seçili ayda raporlanacak istisna yok.</Empty></td></tr> : null}
          </tbody></table></div>
        </section>
      ) : null}
    </div>
  );
}
