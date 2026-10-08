import { useCallback, useEffect, useState } from "react";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import { pdksLiveHealth } from "../../services/pdksPresentation";
import "./PdksLiveHome.css";

const fmt = value => {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Bilinmiyor" : date.toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
};
const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toLocaleUpperCase("tr-TR");
const ACTIONS = [
  ["giris-cikislar", "Giriş / Çıkış", "Hareketleri incele"],
  ["personel-bilgileri", "Personel", "Kart ve özlük referansı"],
  ["puantaj", "Puantaj", "Aylık çalışma kontrolü"],
  ["izinler", "İzinler", "İzin ve talepler"],
  ["cihaz-baglantilari", "Cihaz Merkezi", "Terminal ve ajan"],
  ["raporlar", "Raporlar", "Devam ve denetim"],
];

export default function PdksLiveHome({ activeMainCompany, openModule }) {
  const company = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [data, setData] = useState({ metrics: {}, events: [], liveCards: [], devices: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await getPdksLiveDashboard({ mainCompanyId: company });
      setData(result || { metrics: {}, events: [], liveCards: [], devices: [] });
      setLastRefresh(new Date());
    } catch (cause) {
      setError(cause?.message || "PDKS özeti alınamadı.");
    } finally {
      setBusy(false);
    }
  }, [company]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = data?.metrics || {};
  const devices = Array.isArray(data?.devices) ? data.devices : [];
  const { onlineCount, offlineCount, hasRecentSync, lastSyncedDevice, freshness } = pdksLiveHealth(devices);
  const stateLabel = hasRecentSync ? "Senkron güncel" : onlineCount ? "Ajan bağlı, aktarım doğrulanmadı" : "Veri güncelliği doğrulanmadı";
  const checkedValue = (value) => hasRecentSync ? Number(value || 0).toLocaleString("tr-TR") : "—";
  const summary = [
    {label:"Aktif personel",value:Number(metrics.activePersonnel || 0).toLocaleString("tr-TR"),hint:"İK ana kaynağı",to:"personel-bilgileri",key:"people"},
    {label:"İçeride",value:checkedValue(metrics.inside),hint:"Doğrulanmış geçiş",to:"giris-cikislar",key:"inside"},
    {label:"Geç gelen",value:checkedValue(metrics.late),hint:"Seçili gün",to:"giris-cikislar",key:"late"},
    {label:"Eksik kart",value:checkedValue(metrics.missingPunch),hint:"Düzeltme bekleyen",to:"puantaj",key:"missing"},
    {label:"İzinli",value:Number(metrics.permitted || 0).toLocaleString("tr-TR"),hint:"Onaylı izinler",to:"izinler",key:"leave"},
    {label:"Devamsızlık",value:checkedValue(metrics.absent),hint:"Senkron sonrası kesinleşir",to:"raporlar",key:"absent"},
  ];
  const go = tabKey => openModule?.("pdks", { tabKey });
  const liveCards = Array.isArray(data?.liveCards) ? data.liveCards : [];

  return (
    <div className="plh-page">
      <header className="plh-hero">
        <div>
          <span className="plh-kicker">KY ERP / PERSONEL DEVAM KONTROL</span>
          <h1>Günlük kontrol merkezi</h1>
          <p>Personel, kart geçişleri ve cihaz sağlığını tek ekrandan takip edin.</p>
        </div>
        <div className="plh-toolbar">
          <div className={"plh-sync-status "+freshness} role="status">
            <i aria-hidden="true"/>
            <div><strong>{stateLabel}</strong><small>Son terminal aktarımı: {fmt(lastSyncedDevice?.lastSyncAt)}</small></div>
          </div>
          <button type="button" onClick={load} disabled={busy}>{busy ? "Yenileniyor..." : "Yenile"}</button>
        </div>
      </header>

      {!hasRecentSync ? (
        <div className="plh-warning" role="status">
          <strong>Güncel kart verisi doğrulanamadı.</strong>
          <span>Terminal ya da Windows ajanı son 10 dakika içinde doğrulanmış senkron bildirmedi. Devamsızlık, içerideki kişi, geç gelen ve eksik basım sayıları kesin bilgi olarak gösterilmiyor.</span>
          <button type="button" onClick={() => go("cihaz-baglantilari")}>Bağlantıyı İncele</button>
        </div>
      ) : null}
      {error ? <div className="plh-error" role="alert">{error}</div> : null}

      <section className="plh-metrics" aria-label="Günlük özet">
        {summary.map(card => (
          <button type="button" className={"plh-metric "+card.key} key={card.key} onClick={() => go(card.to)}>
            <span className="plh-metric-label">{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </button>
        ))}
      </section>

      <div className="plh-content">
        <section className="plh-section plh-activity">
          <header className="plh-title">
            <div><span>PERSONEL HAREKETLERİ</span><h2>Son geçişler</h2></div>
            <button type="button" onClick={() => go("giris-cikislar")}>Tüm hareketler</button>
          </header>
          <div className="plh-movement-head"><span>Personel</span><span>Bölüm</span><span>Son saat</span><span>Durum</span></div>
          {liveCards.length ? liveCards.slice(0, 12).map((row,index) => (
            <button type="button" className="plh-movement" key={row.employeeId || String(index)} onClick={() => go("giris-cikislar")}>
              <span className="plh-movement-person"><b className="plh-avatar">{initials(row.fullName)}</b><strong>{row.fullName || "Personel"}</strong></span>
              <span className="plh-movement-muted">{row.department || "—"}</span>
              <span className="plh-clock">{row.lastTime || "—"}</span>
              <span className={"plh-movement-state "+(row.inside?"inside":"outside")}>{row.inside?"İçeride":"Çıkış"}</span>
            </button>
          )) : <div className="plh-empty">{hasRecentSync ? "Bugün henüz kart hareketi bulunamadı." : "Son hareketler için terminal aktarımının doğrulanması bekleniyor."}</div>}
        </section>

        <aside className="plh-side">
          <section className="plh-section plh-device-section">
            <header className="plh-title"><div><span>BAĞLANTI</span><h2>Terminal & Ajan</h2></div><button type="button" onClick={() => go("cihaz-baglantilari")}>Yönet</button></header>
            <div className="plh-device-summary">
              <div><strong>{onlineCount}</strong><span>Çevrimiçi</span></div>
              <div><strong>{offlineCount}</strong><span>Çevrimdışı</span></div>
              <div><strong>{devices.length}</strong><span>Tanımlı</span></div>
            </div>
            <div className="plh-device-list">
              {devices.slice(0,5).map(row => <div key={row.id}>
                <i className={Number(row.active)===0?"passive":pdksLiveHealth([row]).onlineCount>0?"online":"offline"}/>
                <span><strong>{row.deviceLabel || "Cihaz"}</strong><small>{row.machineName || "Bilgisayar adı yok"}</small></span>
                <em>{row.lastSeenAt ? fmt(row.lastSeenAt) : "Bağlanmadı"}</em>
              </div>)}
              {!devices.length ? <div className="plh-empty">Henüz kayıtlı cihaz yok.</div> : null}
            </div>
          </section>

          <section className="plh-section plh-actions">
            <header className="plh-title"><div><span>TEK TIK</span><h2>Hızlı erişim</h2></div></header>
            <div className="plh-quick">
              {ACTIONS.map(([tab,label,hint]) => <button type="button" key={tab} onClick={()=>go(tab)}><span><strong>{label}</strong><small>{hint}</small></span><b aria-hidden="true">→</b></button>)}
            </div>
          </section>
        </aside>
      </div>
      <p className="plh-footnote">Web PDKS; masaüstünün senkron görünümüdür. Tarayıcı yenilenmesi, terminalden yeni kayıt alındığı anlamına gelmez.{lastRefresh ? " Son web kontrolü: "+lastRefresh.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}) : ""}</p>
    </div>
  );
}
