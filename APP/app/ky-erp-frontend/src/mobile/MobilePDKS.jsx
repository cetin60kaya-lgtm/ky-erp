import { useCallback, useEffect, useMemo, useState } from "react";
import { mobileApiGet, normalizeObject } from "./mobileApi";
import { MobileError, MobileLoading } from "./MobileComponents";

const fmt = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
};

export default function MobilePDKS() {
  const [dashboard, setDashboard] = useState({ metrics: {}, liveCards: [], events: [], devices: [] });
  const [direct, setDirect] = useState({ configured: false, reachable: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(null);

  const load = useCallback(async (initial = false) => {
    initial ? setLoading(true) : setBusy(true);
    setError("");
    try {
      const [dashResponse, directResponse] = await Promise.all([
        mobileApiGet("ik/personnel-control/dashboard-live"),
        mobileApiGet("ik/personnel-control/direct-terminal/status"),
      ]);
      if (!dashResponse.ok) throw new Error(dashResponse.message || "PDKS özeti alınamadı.");
      const dash = normalizeObject(dashResponse.data);
      setDashboard(dash || { metrics: {}, liveCards: [], events: [], devices: [] });

      if (directResponse.ok) {
        setDirect(normalizeObject(directResponse.data) || { configured: false, reachable: false });
      } else {
        setDirect({ configured: true, reachable: false, error: directResponse.message || "Doğrudan terminal okunamadı." });
      }
      setCheckedAt(new Date());
    } catch (cause) {
      setError(cause?.message || "PDKS verisi alınamadı.");
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = dashboard?.metrics || {};
  const cards = useMemo(() => [
    ["İçeride", metrics.inside || 0],
    ["Geç Kalan", metrics.late || 0],
    ["Devamsız", metrics.absent || 0],
    ["Eksik Basım", metrics.missingPunch || 0],
  ], [metrics]);

  if (loading) return <MobileLoading text="PDKS yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={() => load(true)} />;

  return (
    <div className="ky-mobile-page">
      <div className="ky-mobile-between ky-mobile-mb10">
        <div>
          <h2 className="ky-mobile-h2" style={{ marginBottom: 2 }}>⏱️ PDKS</h2>
          <div className="ky-mobile-small ky-mobile-muted">Canlı geçişler ve doğrudan kart cihazı</div>
        </div>
        <button className="ky-mobile-btn xs secondary" type="button" onClick={() => load(false)} disabled={busy}>
          {busy ? "Yenileniyor" : "Yenile"}
        </button>
      </div>

      <div className={`ky-mobile-alert ${direct.reachable ? "green" : "orange"} ky-mobile-mb10`}>
        <div className="ky-mobile-between">
          <div>
            <div className="ky-mobile-strong">{direct.reachable ? "Kart cihazı doğrudan bağlı" : "Kart cihazı doğrudan bağlı değil"}</div>
            <div className="ky-mobile-small ky-mobile-muted">
              {direct.configured === false ? "Doğrudan Ethernet ayarı bekleniyor." : direct.error || "Cihaz erişimi kontrol ediliyor."}
            </div>
          </div>
          <span className={`ky-mobile-pill ${direct.reachable ? "green" : "orange"}`}>{direct.reachable ? "CANLI" : "KONTROL"}</span>
        </div>
        {direct.reachable ? (
          <div className="ky-mobile-grid3" style={{ marginTop: 10 }}>
            <div className="ky-mobile-summary"><b>{direct.users ?? "-"}</b><span>Kullanıcı</span></div>
            <div className="ky-mobile-summary"><b>{direct.cards ?? "-"}</b><span>Kart</span></div>
            <div className="ky-mobile-summary"><b>{direct.pendingLogs ?? "-"}</b><span>Bekleyen</span></div>
          </div>
        ) : null}
        <div className="ky-mobile-tiny ky-mobile-muted" style={{ marginTop: 8 }}>
          {direct.model ? `${direct.model} · ` : ""}{direct.serial || ""}{direct.latencyMs ? ` · ${direct.latencyMs} ms` : ""}
        </div>
      </div>

      <div className="ky-mobile-grid2 ky-mobile-mb10">
        {cards.map(([label, value]) => (
          <div className="ky-mobile-summary" key={label}><b>{Number(value).toLocaleString("tr-TR")}</b><span>{label}</span></div>
        ))}
      </div>

      <div className="ky-mobile-section-title">Son Geçişler</div>
      <div className="ky-mobile-card">
        {(dashboard.liveCards || []).slice(0, 12).map((row) => (
          <div className="ky-mobile-activity" key={`${row.employeeId}-${row.lastTime}`}>
            <span className="ky-mobile-dot">{row.inside ? "→" : "←"}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ky-mobile-strong">{row.fullName || "Personel"}</div>
              <div className="ky-mobile-small ky-mobile-muted">{row.department || "Bölüm yok"}</div>
            </div>
            <div className="ky-mobile-right">
              <div className="ky-mobile-strong">{row.lastTime || "-"}</div>
              <span className={`ky-mobile-pill ${row.inside ? "green" : "gray"}`}>{row.inside ? "İçeride" : "Çıkış"}</span>
            </div>
          </div>
        ))}
        {!dashboard.liveCards?.length ? (
          <div className="ky-mobile-activity"><span className="ky-mobile-small ky-mobile-muted">Bugün henüz kart geçişi yok.</span></div>
        ) : null}
      </div>

      <div className="ky-mobile-section-title">Durum</div>
      <div className="ky-mobile-card ky-mobile-p14">
        <div className="ky-mobile-kv"><span>Aktif Personel</span><b>{metrics.activePersonnel || 0}</b></div>
        <div className="ky-mobile-kv"><span>İzinli</span><b>{metrics.permitted || 0}</b></div>
        <div className="ky-mobile-kv"><span>D1 Cihazları</span><b>{metrics.onlineDevices || 0} / {metrics.deviceCount || 0}</b></div>
        <div className="ky-mobile-kv"><span>Son Yenileme</span><b>{checkedAt ? fmt(checkedAt) : "-"}</b></div>
      </div>
    </div>
  );
}
