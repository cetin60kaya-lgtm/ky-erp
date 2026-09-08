import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bot, CalendarDays, CheckCircle2, Clock3, DoorOpen,
  LogIn, LogOut, RefreshCw, Search, ShieldCheck, Stethoscope, Users, Wifi, WifiOff,
} from "lucide-react";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import "./PdksLiveHome.css";

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
};
const isOnline = (value) => Boolean(value) && Date.now() - new Date(value).getTime() < 300000;

const FILTERS = [
  ["ALL", "Tümü"],
  ["INSIDE", "İçeride"],
  ["NO_SHOW", "Gelmeyen"],
  ["WAITING", "Beklenen"],
  ["LATE", "Geç"],
  ["LEAVE", "İzin / Rapor"],
  ["MISSING", "Eksik Basım"],
];

function statusTone(status) {
  if (["NO_SHOW", "MISSING_IN", "MISSING_OUT"].includes(status)) return "bad";
  if (["INSIDE_LATE", "LEFT_LATE", "WAITING"].includes(status)) return "warn";
  if (["ANNUAL_LEAVE", "SICK_LEAVE", "LEAVE"].includes(status)) return "leave";
  if (status === "INSIDE") return "ok";
  if (status === "LEFT") return "neutral";
  return "muted";
}

function matchesFilter(row, filter) {
  if (filter === "ALL") return true;
  if (filter === "INSIDE") return ["INSIDE", "INSIDE_LATE"].includes(row.status);
  if (filter === "NO_SHOW") return row.status === "NO_SHOW";
  if (filter === "WAITING") return row.status === "WAITING";
  if (filter === "LATE") return row.late === true;
  if (filter === "LEAVE") return ["ANNUAL_LEAVE", "SICK_LEAVE", "LEAVE"].includes(row.status);
  if (filter === "MISSING") return ["MISSING_IN", "MISSING_OUT"].includes(row.status);
  return true;
}

function Metric({ icon: Icon, label, value, hint, tone, onClick }) {
  return (
    <button type="button" className={`plh-pro-metric ${tone || ""}`} onClick={onClick}>
      <i><Icon size={18} /></i>
      <span><strong>{Number(value || 0).toLocaleString("tr-TR")}</strong><b>{label}</b><small>{hint}</small></span>
    </button>
  );
}

export default function PdksLiveHome({ activeMainCompany, openModule }) {
  const company = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [data, setData] = useState({ metrics: {}, events: [], liveCards: [], devices: [], roster: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await getPdksLiveDashboard({ mainCompanyId: company });
      setData(result || { metrics: {}, events: [], liveCards: [], devices: [], roster: [] });
      setLastRefresh(new Date());
    } catch (cause) {
      setError(cause?.message || "Canlı PDKS verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const metrics = useMemo(() => data?.metrics || {}, [data]);
  const roster = useMemo(() => Array.isArray(data?.roster) ? data.roster : [], [data]);
  const visibleRoster = useMemo(() => {
    const q = query.trim().toLocaleUpperCase("tr-TR");
    return roster.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!q) return true;
      return `${row.personnelCode || ""} ${row.fullName || ""} ${row.department || ""} ${row.statusLabel || ""}`
        .toLocaleUpperCase("tr-TR").includes(q);
    });
  }, [filter, query, roster]);

  const devices = Array.isArray(data?.devices) ? data.devices : [];
  const offlineDevices = devices.filter((row) => Number(row.active) !== 0 && !isOnline(row.lastSeenAt));
  const issueCount = Number(metrics.noShow || 0) + Number(metrics.missingPunch || 0) + offlineDevices.length;
  const controlQueue = useMemo(() => roster
    .filter((row) => row.status === "NO_SHOW" || ["MISSING_IN", "MISSING_OUT"].includes(row.status) || row.late === true)
    .sort((a, b) => {
      const rank = (row) => row.status === "NO_SHOW" ? 1 : ["MISSING_IN", "MISSING_OUT"].includes(row.status) ? 2 : 3;
      return rank(a) - rank(b) || String(a.fullName || "").localeCompare(String(b.fullName || ""), "tr");
    })
    .slice(0, 12), [roster]);
  const departments = useMemo(() => {
    const map = new Map();
    roster.forEach((row) => {
      const key = String(row.department || "Bölüm Yok").trim() || "Bölüm Yok";
      const current = map.get(key) || { name: key, total: 0, scheduled: 0, arrived: 0, inside: 0, noShow: 0, waiting: 0, leave: 0, late: 0 };
      current.total += 1;
      if (row.expectedWorkDay) current.scheduled += 1;
      if (Number(row.eventCount || 0) > 0) current.arrived += 1;
      if (["INSIDE", "INSIDE_LATE"].includes(row.status)) current.inside += 1;
      if (row.status === "NO_SHOW") current.noShow += 1;
      if (row.status === "WAITING") current.waiting += 1;
      if (["ANNUAL_LEAVE", "SICK_LEAVE", "LEAVE"].includes(row.status)) current.leave += 1;
      if (row.late === true) current.late += 1;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.inside - a.inside || b.scheduled - a.scheduled || a.name.localeCompare(b.name, "tr"));
  }, [roster]);
  const go = (tabKey) => openModule?.("pdks", { tabKey });

  return (
    <div className="plh-pro-page">
      <header className="plh-pro-hero">
        <div className="plh-pro-title">
          <span><Activity size={15} /> KY PDKS · CANLI OPERASYON</span>
          <h1>Bugünün Personel Kontrol Merkezi</h1>
          <p>Vardiya, izin, kart geçişi, terminal ve senkron durumu tek ekranda. “Gelmeyen” hesabı vardiya başlangıcını ve çalışma gününü dikkate alır.</p>
        </div>
        <div className="plh-pro-actions">
          <div className={`plh-pro-live ${busy ? "busy" : ""}`}><i /><span>{busy ? "Yenileniyor" : "Canlı"}</span><small>30 sn otomatik</small></div>
          <button type="button" className="ai" onClick={() => go("ai-kontrol")}><Bot size={16} /> AI Kontrol</button>
          <button type="button" onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? "spin" : ""} /> Yenile</button>
        </div>
      </header>

      {error ? <div className="plh-pro-error"><AlertTriangle size={17} /> {error}</div> : null}

      <section className="plh-pro-healthbar">
        <div><ShieldCheck size={16} /><span>Aktif personel</span><strong>{metrics.activePersonnel || 0}</strong></div>
        <div><CalendarDays size={16} /><span>Bugün vardiyalı</span><strong>{metrics.scheduledToday || 0}</strong></div>
        <div className={issueCount ? "warn" : "ok"}><AlertTriangle size={16} /><span>Kontrol gereken</span><strong>{issueCount}</strong></div>
        <div className={offlineDevices.length ? "warn" : "ok"}>{offlineDevices.length ? <WifiOff size={16} /> : <Wifi size={16} />}<span>Cihaz</span><strong>{metrics.onlineDevices || 0}/{metrics.deviceCount || 0}</strong></div>
        <small>{lastRefresh ? `Son kontrol: ${lastRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Bağlanıyor..."}</small>
      </section>

      <section className="plh-pro-metrics">
        <Metric icon={LogIn} label="Bugün Gelen" value={metrics.arrivedToday} hint="En az bir kart basımı" tone="ok" onClick={() => setFilter("ALL")} />
        <Metric icon={DoorOpen} label="İçeride" value={metrics.inside} hint="Son hareket içeride" tone="teal" onClick={() => setFilter("INSIDE")} />
        <Metric icon={LogOut} label="Çıkan" value={metrics.left} hint="Çıkışı tamamlanan" tone="neutral" onClick={() => setFilter("ALL")} />
        <Metric icon={AlertTriangle} label="Gelmeyen" value={metrics.noShow} hint="Vardiyası başlayıp kartı yok" tone="bad" onClick={() => setFilter("NO_SHOW")} />
        <Metric icon={Clock3} label="Beklenen" value={metrics.waiting} hint="Vardiya saati henüz gelmedi" tone="warn" onClick={() => setFilter("WAITING")} />
        <Metric icon={CalendarDays} label="Yıllık İzin" value={metrics.annualLeave} hint="Bugün yıllık izinde" tone="leave" onClick={() => setFilter("LEAVE")} />
        <Metric icon={Stethoscope} label="Raporlu" value={metrics.sickLeave} hint="Sağlık/rapor kaydı" tone="leave" onClick={() => setFilter("LEAVE")} />
        <Metric icon={Users} label="Diğer İzin" value={metrics.otherLeave} hint="Mazeret/ücretsiz vb." tone="leave" onClick={() => setFilter("LEAVE")} />
        <Metric icon={Clock3} label="Geç Gelen" value={metrics.late} hint="Vardiya toleransı aşıldı" tone="warn" onClick={() => setFilter("LATE")} />
        <Metric icon={AlertTriangle} label="Eksik Basım" value={metrics.missingPunch} hint={`Giriş ${metrics.missingEntry || 0} · Çıkış ${metrics.missingExit || 0}`} tone="bad" onClick={() => setFilter("MISSING")} />
      </section>

      <div className="plh-pro-layout">
        <section className="plh-pro-card roster">
          <header>
            <div><small>CANLI PERSONEL LİSTESİ</small><h2>Kim nerede, kim neden yok?</h2></div>
            <div className="plh-pro-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Personel / bölüm / durum ara" /></div>
          </header>
          <nav className="plh-pro-filters">
            {FILTERS.map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </nav>
          <div className="plh-pro-roster">
            <div className="head"><span>Personel</span><span>Durum</span><span>Vardiya</span><span>İlk Giriş</span><span>Son Hareket</span><span>Basım</span></div>
            {visibleRoster.map((row) => (
              <button type="button" className="row" key={row.employeeId} onClick={() => go("giris-cikislar")}>
                <span className="person"><b>{String(row.fullName || "?").split(/\s+/).slice(0,2).map((v) => v[0]).join("")}</b><em><strong>{row.fullName}</strong><small>{row.personnelCode || "-"} · {row.department || "Bölüm yok"}</small></em></span>
                <span><i className={`status ${statusTone(row.status)}`}>{row.statusLabel || row.status}</i></span>
                <span><strong>{row.schedule?.groupName || "-"}</strong><small>{row.schedule?.entryTime || "-"} – {row.schedule?.exitTime || "-"}</small></span>
                <span>{row.firstTime || "-"}</span>
                <span>{row.lastTime || "-"}</span>
                <span>{row.eventCount || 0}</span>
              </button>
            ))}
            {!visibleRoster.length ? <div className="empty"><CheckCircle2 size={20} /> Bu filtrede personel yok.</div> : null}
          </div>
        </section>

        <aside className="plh-pro-side">
          <section className="plh-pro-card">
            <header><div><small>TERMİNAL / AGENT</small><h2>Cihaz Sağlığı</h2></div><button type="button" onClick={() => go("cihaz-baglantilari")}>Yönet</button></header>
            <div className="plh-pro-device-list">
              {devices.slice(0, 8).map((row) => {
                const ok = Number(row.active) !== 0 && isOnline(row.lastSeenAt);
                return <button type="button" key={row.id} onClick={() => go("cihaz-baglantilari")}><i className={ok ? "online" : "offline"}>{ok ? <Wifi size={15} /> : <WifiOff size={15} />}</i><span><strong>{row.deviceLabel}</strong><small>{row.machineName || "Bilgisayar adı yok"}</small></span><em>{row.lastSeenAt ? fmtDate(row.lastSeenAt) : "Bağlanmadı"}</em></button>;
              })}
              {!devices.length ? <div className="empty">Henüz yetkilendirilmiş terminal yok.</div> : null}
            </div>
          </section>

          <section className="plh-pro-card">
            <header><div><small>AKILLI KONTROL KUYRUĞU</small><h2>Bugün Bakılması Gerekenler</h2></div><b className={controlQueue.length ? "plh-pro-issue-count bad" : "plh-pro-issue-count ok"}>{controlQueue.length}</b></header>
            <div className="plh-pro-issue-list">
              {controlQueue.map((row) => (
                <button type="button" key={`${row.employeeId}-${row.status}`} onClick={() => {
                  setFilter(row.status === "NO_SHOW" ? "NO_SHOW" : ["MISSING_IN", "MISSING_OUT"].includes(row.status) ? "MISSING" : "LATE");
                  setQuery(row.fullName || "");
                }}>
                  <i className={`status ${statusTone(row.status)}`}>{row.status === "NO_SHOW" ? "Gelmedi" : row.status === "MISSING_IN" ? "Eksik Giriş" : row.status === "MISSING_OUT" ? "Eksik Çıkış" : "Geç"}</i>
                  <span><strong>{row.fullName}</strong><small>{row.department || "Bölüm yok"}{row.firstTime ? ` · ${row.firstTime}` : ""}</small></span>
                  <em>›</em>
                </button>
              ))}
              {!controlQueue.length ? <div className="empty"><CheckCircle2 size={18} /> Şu an kritik personel istisnası yok.</div> : null}
              {offlineDevices.map((row) => <button type="button" key={`device-${row.id}`} onClick={() => go("cihaz-baglantilari")}><i className="status bad">Cihaz</i><span><strong>{row.deviceLabel}</strong><small>Çevrimdışı · {row.machineName || "Makine adı yok"}</small></span><em>›</em></button>)}
            </div>
          </section>

          <section className="plh-pro-card plh-pro-ai">
            <header><div><small>YAPAY ZEKA</small><h2>PDKS Kontrol Asistanı</h2></div><Bot size={20} /></header>
            <p>“Bugün kim gelmedi?”, “çıkış basmayı unutan var mı?”, “hangi cihaz çevrimdışı?” gibi soruları canlı PDKS bağlamıyla kontrol eder.</p>
            <button type="button" className="primary" onClick={() => go("ai-kontrol")}><Bot size={16} /> AI Kontrol Merkezini Aç</button>
          </section>
        </aside>
      </div>

      <section className="plh-pro-card plh-pro-departments">
        <header><div><small>BÖLÜM BAZLI CANLI GÖRÜNÜM</small><h2>İşyeri Doluluk & Devam Dağılımı</h2></div><span>{departments.length} bölüm</span></header>
        <div className="plh-pro-dept-table">
          <div className="head"><span>Bölüm</span><span>Toplam</span><span>Vardiyalı</span><span>Gelen</span><span>İçeride</span><span>Gelmeyen</span><span>Beklenen</span><span>İzinli</span><span>Geç</span></div>
          {departments.map((row) => <button type="button" className="row" key={row.name} onClick={() => { setFilter("ALL"); setQuery(row.name === "Bölüm Yok" ? "" : row.name); }}>
            <strong>{row.name}</strong><span>{row.total}</span><span>{row.scheduled}</span><b>{row.arrived}</b><b className="inside">{row.inside}</b><em className={row.noShow ? "bad" : ""}>{row.noShow}</em><span>{row.waiting}</span><span>{row.leave}</span><em className={row.late ? "warn" : ""}>{row.late}</em>
          </button>)}
          {!departments.length ? <div className="empty">Bölüm dağılımı için canlı personel verisi bekleniyor.</div> : null}
        </div>
      </section>
    </div>
  );
}
