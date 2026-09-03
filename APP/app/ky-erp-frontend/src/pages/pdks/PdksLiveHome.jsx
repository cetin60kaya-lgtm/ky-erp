import { useCallback, useEffect, useMemo, useState } from "react";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import "./PdksLiveHome.css";

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
};
const isOnline = (value) => Boolean(value) && Date.now() - new Date(value).getTime() < 300000;

const QUICK = [
  ["giris-cikislar", "Giriş-Çıkış Listesi", "Son kart hareketleri ve personel bazlı geçişler", "↔"],
  ["puantaj-sonuclari", "Puantaj Özet Raporu", "Ayın çalışma, eksik basım ve mesai özeti", "▦"],
  ["personel-bilgileri", "Personel Listesi", "İK ana kaynağındaki PDKS personelleri", "♟"],
  ["raporlar", "Devamsızlık / Geç Kalma", "Kontrol gerektiren günleri tek listede aç", "!"],
  ["izinler", "İzinli Personeller", "İK izin kaydının puantaj yansıması", "◷"],
  ["gruplar-vardiyalar", "Vardiya Planları", "Mesai grupları, tolerans ve çalışma günleri", "⌚"],
  ["cihaz-baglantilari", "Cihaz Sağlığı", "Windows Agent ve terminal heartbeat durumu", "▣"],
  ["denetim-yillik-temp", "Yıllık Denetim", "Kart ve puantaj denetim paketini hazırla", "✓"],
  ["raporlar", "Fazla Mesai Analizi", "Normal / hafta tatili / resmî tatil çalışması", "+"],
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
      setError(cause?.message || "Canlı PDKS verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  const metrics = useMemo(() => data?.metrics || {}, [data]);
  const cards = useMemo(() => [
    ["Bugün Devamsız", metrics.absent || 0, "bad", "⊘", "raporlar"],
    ["Geç Kalan", metrics.late || 0, "warn", "◷", "raporlar"],
    ["Aktif Personel", metrics.activePersonnel || 0, "ok", "♟", "personel-bilgileri"],
    ["İzinli Personel", metrics.permitted || 0, "accent", "⌛", "izinler"],
    ["İçerideki Personel", metrics.inside || 0, "teal", "↪", "giris-cikislar"],
    ["Eksik Basım", metrics.missingPunch || 0, "violet", "!", "puantaj"],
  ], [metrics]);

  const go = (tabKey) => openModule?.("pdks", { tabKey });

  return (
    <div className="plh-page">
      <header className="plh-hero">
        <div>
          <span className="plh-kicker">KY ERP · PDKS CANLI MERKEZ</span>
          <h1>Canlı Geçişler</h1>
          <p>Kart cihazı, Windows Agent, D1 ve İK tek veri akışında. Sayfa açıkken her dakika otomatik yenilenir.</p>
        </div>
        <div className="plh-livebox">
          <i className={busy ? "pulse" : ""} />
          <span>{busy ? "Yenileniyor" : "Canlı"}</span>
          <small>{lastRefresh ? `Son: ${lastRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Bağlanıyor"}</small>
          <button type="button" onClick={load} disabled={busy}>Yenile</button>
        </div>
      </header>

      {error ? <div className="plh-error">{error}</div> : null}

      <section className="plh-metrics">
        {cards.map(([label, value, tone, icon, tab]) => (
          <button type="button" key={label} className={`plh-metric ${tone}`} onClick={() => go(tab)}>
            <b className="plh-metric-icon">{icon}</b>
            <span><strong>{Number(value).toLocaleString("tr-TR")}</strong><small>{label}</small></span>
            <em>›</em>
          </button>
        ))}
      </section>

      <section className="plh-section">
        <div className="plh-title"><div><span>GERÇEK ZAMANLI</span><h2>Son Geçişler</h2></div><button type="button" onClick={() => go("giris-cikislar")}>Tümünü Aç</button></div>
        <div className="plh-live-grid">
          {(data.liveCards || []).slice(0, 10).map((row) => (
            <button type="button" className="plh-person-card" key={`${row.employeeId}-${row.lastTime}`} onClick={() => go("giris-cikislar")}>
              <div className="plh-avatar">{String(row.fullName || "?").split(/\s+/).slice(0,2).map((v) => v[0]).join("")}</div>
              <div><strong>{row.fullName}</strong><small>{row.department || "Bölüm yok"}</small><span className={row.inside ? "in" : "out"}>{row.inside ? "Giriş / İçeride" : "Çıkış"} · {row.lastTime}</span></div>
            </button>
          ))}
          {!data.liveCards?.length ? <div className="plh-empty">Bugün henüz canlı kart geçişi yok.</div> : null}
        </div>
      </section>

      <div className="plh-two">
        <section className="plh-section">
          <div className="plh-title"><div><span>TEK TIK</span><h2>Hızlı Raporlar</h2></div></div>
          <div className="plh-quick">
            {QUICK.map(([tab, label, hint, icon], index) => (
              <button type="button" key={`${tab}-${index}`} onClick={() => go(tab)}>
                <i>{icon}</i><span><strong>{label}</strong><small>{hint}</small></span><b>›</b>
              </button>
            ))}
          </div>
        </section>

        <section className="plh-section plh-device-section">
          <div className="plh-title"><div><span>AGENT / TERMİNAL</span><h2>Cihaz Sağlığı</h2></div><button type="button" onClick={() => go("cihaz-baglantilari")}>Cihaz Merkezi</button></div>
          <div className="plh-device-summary">
            <div><strong>{metrics.onlineDevices || 0}</strong><span>Çevrimiçi</span></div>
            <div><strong>{Math.max(0, (metrics.deviceCount || 0) - (metrics.onlineDevices || 0))}</strong><span>Çevrimdışı</span></div>
            <div><strong>{metrics.deviceCount || 0}</strong><span>Toplam</span></div>
          </div>
          <div className="plh-device-list">
            {(data.devices || []).slice(0, 8).map((row) => (
              <div key={row.id}><i className={Number(row.active) === 0 ? "passive" : isOnline(row.lastSeenAt) ? "online" : "offline"} /><span><strong>{row.deviceLabel}</strong><small>{row.machineName || "Bilgisayar adı yok"}</small></span><em>{row.lastSeenAt ? fmtDate(row.lastSeenAt) : "Bağlanmadı"}</em></div>
            ))}
            {!data.devices?.length ? <div className="plh-empty">Henüz yetkilendirilmiş terminal yok.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
