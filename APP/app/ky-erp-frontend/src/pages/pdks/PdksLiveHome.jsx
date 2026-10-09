import { useCallback, useEffect, useMemo, useState } from "react";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import { pdksLivePresentation } from "../../services/pdksLivePresentation";
import "./PdksLiveHome.css";

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
};
const isOnline = (value) => Boolean(value) && Date.now() - new Date(value).getTime() < 300000;

const QUICK = [
  ["giris-cikislar", "Giriş / Çıkış", "Son kart hareketleri ve personel geçişleri", "↔"],
  ["puantaj-sonuclari", "Puantaj Özeti", "Çalışma, eksik basım, geç/erken ve mesai", "▦"],
  ["personel-bilgileri", "Personel", "İK ana kaynağındaki kartlı çalışanlar", "♟"],
  ["izinler", "İzinler", "İK izin kaydının puantaj yansıması", "◷"],
  ["cihaz-baglantilari", "Cihaz Sağlığı", "Windows Agent ve terminal bağlantıları", "▣"],
  ["denetim-yillik-temp", "Yıllık Denetim", "Kart ve puantaj denetim paketini hazırla", "✓"],
]

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
      if (!result || !result.metrics || !Array.isArray(result.devices)) throw new Error("PDKS canlı API eksik yanıt döndürdü.");
      setData(result);
      setLastRefresh(new Date());
    } catch (cause) {
      setData({ metrics: {}, events: [], liveCards: [], devices: [] });
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
  const display = pdksLivePresentation(metrics, error, lastRefresh);
  const count = (value) => display.fresh ? Number(value || 0) : "—";
  const cards = useMemo(() => [
    [display.absenceLabel, display.absenceValue, "bad", "⊘", "raporlar"],
    ["Geç Kalan", count(metrics.late), "warn", "◷", "raporlar"],
    ["Aktif Personel", count(metrics.activePersonnel), "ok", "♟", "personel-bilgileri"],
    ["İzinli Personel", count(metrics.permitted), "accent", "⌛", "izinler"],
    ["İçerideki Personel", count(metrics.inside), "teal", "↪", "giris-cikislar"],
    ["Eksik Basım", count(metrics.missingPunch), "violet", "!", "puantaj"],
  ], [metrics, display.absenceLabel, display.absenceValue, display.fresh]);

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
          <span>{busy ? "Yenileniyor" : display.badge}</span>
          <small>{lastRefresh ? `Son: ${lastRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Bağlanıyor"}</small>
          <button type="button" onClick={load} disabled={busy}>Yenile</button>
        </div>
      </header>

      {error ? <div className="plh-error" role="alert">API güncel PDKS verisi alınamadı: {error}. Eski kart kayıtları canlı veri olarak gösterilmiyor.</div> : null}
      {display.terminalsOffline ? <div className="plh-error" role="status">PDKS terminali çevrimdışı. API yanıt veriyor fakat kart hareketleri güncel olmayabilir. {display.absenceDetail || "Devamsızlık hesabını terminal kayıtlarıyla teyit edin."}</div> : null}

      <section className="plh-metrics">
        {cards.map(([label, value, tone, icon, tab]) => (
          <button type="button" key={label} className={`plh-metric ${tone}`} onClick={() => go(tab)}>
            <b className="plh-metric-icon">{icon}</b>
            <span><strong>{typeof value === "number" ? value.toLocaleString("tr-TR") : value}</strong><small>{label}</small></span>
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
          <div className="plh-title"><div><span>TEK TIK</span><h2>Hızlı İşlemler</h2></div></div>
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
            <div><strong>{count(metrics.onlineDevices)}</strong><span>Çevrimiçi</span></div>
            <div><strong>{count(Math.max(0, (metrics.deviceCount || 0) - (metrics.onlineDevices || 0)))}</strong><span>Çevrimdışı</span></div>
            <div><strong>{count(metrics.deviceCount)}</strong><span>Toplam</span></div>
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
