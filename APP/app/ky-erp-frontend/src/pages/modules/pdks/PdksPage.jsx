import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  Clock3,
  HardDrive,
  MonitorCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  getPdksAttendance,
  getPdksPeople,
  getPdksProfile,
} from "../../../services/pdksApi";
import "./pdks.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const TITLES = {
  "genel-bakis": ["PDKS", "Genel Bakış"],
  "canli-kart": ["PDKS", "Canlı Kart"],
  "giris-cikis": ["PDKS", "Giriş / Çıkış"],
  "eksik-kart": ["PDKS", "Eksik Kartlar"],
  puantaj: ["PDKS", "Puantaj"],
  "calisma-takvimi": ["PDKS", "Çalışma Takvimi"],
  terminal: ["PDKS", "Terminal"],
  raporlar: ["PDKS", "Raporlar"],
  ayarlar: ["PDKS", "Ayarlar"],
};

function statusLabel(value) {
  return {
    CALISTI: "Çalıştı",
    YILLIK_IZIN: "Yıllık İzin",
    IZIN: "İzinli",
    RESMI_TATIL: "Resmî Tatil",
    HAFTA_SONU: "Hafta Sonu",
    KART_YOK: "Kart Yok",
    EKSIK_BASIM: "Eksik Basım",
    DEVAMSIZ: "Devamsız",
    DONEM_DISI: "Dönem Dışı",
  }[value] || value || "-";
}

function dayTone(value) {
  if (value === "CALISTI") return "ok";
  if (["YILLIK_IZIN", "IZIN", "RESMI_TATIL", "HAFTA_SONU"].includes(value)) return "info";
  if (value === "EKSIK_BASIM") return "warn";
  if (["KART_YOK", "DEVAMSIZ"].includes(value)) return "bad";
  return "muted";
}

function initials(value) {
  return String(value || "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <article className="pdks-stat">
      <Icon size={20} />
      <span><small>{label}</small><strong>{value}</strong><em>{sub}</em></span>
    </article>
  );
}

export default function PdksPage({ activeTab = "genel-bakis", activeMainCompany }) {
  const now = new Date();
  const [people, setPeople] = useState([]);
  const [profile, setProfile] = useState({ audit: false, scope: "FULL" });
  const [selectedId, setSelectedId] = useState("");
  const [attendance, setAttendance] = useState(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const companyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [eyebrow, title] = TITLES[activeTab] || TITLES["genel-bakis"];

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, authProfile] = await Promise.all([
        getPdksPeople({ mainCompanyId: companyId }),
        getPdksProfile(),
      ]);
      const list = Array.isArray(rows) ? rows : [];
      setPeople(list);
      setProfile(authProfile || { audit: false, scope: "FULL" });
      setSelectedId((current) => list.some((item) => item.id === current) ? current : list[0]?.id || "");
    } catch (cause) {
      setError(cause?.message || "PDKS personel listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadAttendance = useCallback(async () => {
    if (!selectedId) {
      setAttendance(null);
      return;
    }
    setBusy(true);
    try {
      const result = await getPdksAttendance(selectedId, { mainCompanyId: companyId, year, month });
      setAttendance(result || null);
    } catch (cause) {
      setError(cause?.message || "PDKS puantaj verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  }, [companyId, month, selectedId, year]);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return people;
    return people.filter((person) => `${person.fullName} ${person.cardNo} ${person.personnelCode} ${person.department} ${person.title}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [people, query]);

  const selected = people.find((item) => item.id === selectedId) || null;
  const summary = attendance?.summary || {};
  const days = Array.isArray(attendance?.days) ? attendance.days : [];
  const missingDays = days.filter((day) => day.status === "KART_YOK" || day.status === "EKSIK_BASIM" || day.missingPunch);
  const cardCount = people.filter((item) => item.cardNo).length;
  const activeCount = people.filter((item) => !item.exitDate && !String(item.status || "").toLocaleUpperCase("tr-TR").includes("PASIF")).length;

  const tableRows = activeTab === "eksik-kart" ? missingDays : days;
  const tableVisible = ["giris-cikis", "eksik-kart", "puantaj", "calisma-takvimi"].includes(activeTab);
  const terminalTab = activeTab === "terminal";
  const liveTab = activeTab === "canli-kart";

  return (
    <div className="pdks-page">
      <header className="pdks-header">
        <div>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>İK personel kartlarını tek kaynak olarak kullanır; kart hareketi, puantaj ve terminal işlemleri PDKS katmanında yürür.</p>
        </div>
        <button type="button" className="pdks-refresh" onClick={() => Promise.all([loadPeople(), loadAttendance()])} disabled={loading || busy}>
          <RefreshCw size={16} /> Yenile
        </button>
      </header>

      {error ? <div className="pdks-error"><CircleAlert size={17} />{error}</div> : null}

      <section className="pdks-stats">
        <Stat icon={Users} label="Aktif Personel" value={activeCount} sub={`${people.length} toplam kart`} />
        <Stat icon={BadgeCheck} label="Kart Tanımlı" value={cardCount} sub={`${people.length - cardCount} kart bekliyor`} />
        <Stat icon={Clock3} label="Bu Ay Çalışma" value={`${summary.workedDays || 0} gün`} sub={selected?.fullName || "Personel seçilmedi"} />
        <Stat icon={CircleAlert} label="Eksik Kart" value={summary.missingPunchDays || 0} sub={`${summary.noPunchDays || 0} kart yok günü`} />
      </section>

      <div className="pdks-layout">
        <aside className="pdks-people">
          <label className="pdks-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel veya kart no ara" /></label>
          <div className="pdks-list">
            {loading ? <div className="pdks-empty">Personel yükleniyor...</div> : null}
            {!loading && !visiblePeople.length ? <div className="pdks-empty">Personel bulunamadı.</div> : null}
            {visiblePeople.map((person) => (
              <button key={person.id} type="button" className={person.id === selectedId ? "active" : ""} onClick={() => setSelectedId(person.id)}>
                <b>{initials(person.fullName)}</b>
                <span><strong>{person.fullName}</strong><small>{person.cardNo || "Kart yok"} · {person.department || "Departman yok"}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <main className="pdks-workspace">
          <div className="pdks-person-head">
            <div><strong>{selected?.fullName || "Personel seçilmedi"}</strong><small>{selected?.personnelCode || "-"} · Kart {selected?.cardNo || "yok"}</small></div>
            <div className="pdks-period">
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select>
              <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || now.getFullYear())} min="2020" max="2100" />
            </div>
          </div>

          {activeTab === "genel-bakis" ? (
            <div className="pdks-overview-grid">
              <article><UserRoundCheck size={21} /><span><small>Personel</small><strong>{selected?.fullName || "-"}</strong><em>{selected?.status || "-"}</em></span></article>
              <article><CalendarDays size={21} /><span><small>Çalışılan Gün</small><strong>{summary.workedDays || 0}</strong><em>{MONTHS[month - 1]} {year}</em></span></article>
              <article><Clock3 size={21} /><span><small>Geç Giriş</small><strong>{summary.lateDays || 0}</strong><em>{summary.lateMinutes || 0} dakika</em></span></article>
              <article><ShieldCheck size={21} /><span><small>Yetki</small><strong>{profile.audit ? "Salt Okunur" : "Tam"}</strong><em>{profile.scope || "FULL"}</em></span></article>
            </div>
          ) : null}

          {liveTab ? (
            <div className="pdks-local-card">
              <WifiOff size={26} />
              <div><strong>Canlı terminal akışı yerel agent ile bağlanacak</strong><p>Web tarafındaki PDKS mevcut kart/puantaj çekirdeğine bağlandı. Sonraki adım Windows KY PDKS Agent cihazdan ham kart olayını yerel DB'ye yazacak ve bu ekrana senkronlayacak.</p></div>
            </div>
          ) : null}

          {terminalTab ? (
            <div className="pdks-terminal-grid">
              <article><MonitorCheck size={24} /><span><small>Windows Agent</small><strong>Kurulum aşaması</strong><em>Setup ile servis kurulacak</em></span></article>
              <article><HardDrive size={24} /><span><small>Yerel DB</small><strong>SQLite + WAL</strong><em>Bulut kesilse de kart kabul eder</em></span></article>
              <article><Wifi size={24} /><span><small>ERP Senkron</small><strong>Push / Pull</strong><em>Idempotent event UUID</em></span></article>
            </div>
          ) : null}

          {tableVisible ? (
            <div className="pdks-table-wrap">
              <table className="pdks-table">
                <thead><tr><th>Tarih</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Mesai</th><th>Kart</th></tr></thead>
                <tbody>
                  {tableRows.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td><span className={`pdks-pill ${dayTone(day.status)}`}>{statusLabel(day.status)}</span></td>
                      <td>{day.entry || "-"}</td>
                      <td>{day.exit || "-"}</td>
                      <td>{day.lateMinutes || 0} dk</td>
                      <td>{day.earlyMinutes || 0} dk</td>
                      <td>{day.overtimeMinutes || 0} dk</td>
                      <td>{day.eventCount || 0}</td>
                    </tr>
                  ))}
                  {!tableRows.length ? <tr><td colSpan="8" className="pdks-empty-cell">Bu dönem için kayıt yok.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {["raporlar", "ayarlar"].includes(activeTab) ? (
            <div className="pdks-local-card">
              <ShieldCheck size={26} />
              <div><strong>{activeTab === "raporlar" ? "PDKS rapor merkezi" : "PDKS sistem ayarları"}</strong><p>Bu ekran yeni PDKS çekirdeği ile birlikte tamamlanacak; personel ana verisi İK'dan ayrılmayacak.</p></div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
