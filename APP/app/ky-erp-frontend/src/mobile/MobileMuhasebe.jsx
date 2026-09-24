import React, { useCallback, useEffect, useRef, useState } from "react";
import { mobileApiGet, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

const WIDGET_COMPANY_KEY = "kyerp.mobile.accountingWidgetCompanyId";
const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};

export default function MobileMuhasebe() {
  const [data, setData] = useState(null);
  const [belgeler, setBelgeler] = useState([]);
  const [firmalar, setFirmalar] = useState([]);
  const [widgetCompanyId, setWidgetCompanyId] = useState(() => localStorage.getItem(WIDGET_COMPANY_KEY) || "");
  const [widgetData, setWidgetData] = useState(null);
  const [liveOnline, setLiveOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const liveRevisionRef = useRef(null);

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const loadWidget = useCallback(async (companyId) => {
    if (!companyId) { setWidgetData(null); return; }
    const period = new Date().toISOString().slice(0, 7);
    const result = await mobileApiGet(`muhasebe/workspace/company-widget?companyId=${encodeURIComponent(companyId)}&period=${period}&_ts=${Date.now()}`);
    if (result.ok) setWidgetData(normalizeObject(result.data));
  }, []);

  const loadData = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    const [resOzet, resBelge, resFirmalar] = await Promise.all([
      mobileApiGet("muhasebe/yonetim-ozeti"),
      mobileApiGet("muhasebe/belge-islem"),
      mobileApiGet("muhasebe/firmalar"),
    ]);

    if (!resOzet.ok && !resBelge.ok && !resFirmalar.ok) {
      if (!background) setError(resOzet.message || resBelge.message || resFirmalar.message || "Veri alınamadı");
      if (!background) setData(null);
      if (!background) setLoading(false);
      return;
    }
    const nextFirms = resFirmalar.ok ? normalizeList(resFirmalar.data) : [];
    setData(resOzet.ok ? normalizeObject(resOzet.data) : {});
    setBelgeler(resBelge.ok ? normalizeList(resBelge.data) : []);
    setFirmalar(nextFirms);
    if (nextFirms.length) {
      setWidgetCompanyId((currentCompanyId) => {
        if (currentCompanyId) return currentCompanyId;
        const saved = localStorage.getItem(WIDGET_COMPANY_KEY) || "";
        const preferred = nextFirms.find((row) => String(row.id) === String(saved)) || nextFirms[0];
        return preferred?.id ? String(preferred.id) : currentCompanyId;
      });
    }
    if (!background) setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!widgetCompanyId) return;
    localStorage.setItem(WIDGET_COMPANY_KEY, widgetCompanyId);
    void loadWidget(widgetCompanyId);
  }, [widgetCompanyId, loadWidget]);

  useEffect(() => {
    let stopped = false;
    let busy = false;
    const check = async () => {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const response = await mobileApiGet(`muhasebe/workspace/live-state?_ts=${Date.now()}`);
        if (!response.ok) { setLiveOnline(false); return; }
        const live = normalizeObject(response.data);
        const revision = Number(live.revision || 0);
        const changed = liveRevisionRef.current !== null && revision !== liveRevisionRef.current;
        liveRevisionRef.current = revision;
        setLiveOnline(true);
        if (changed) {
          await loadData(true);
          if (widgetCompanyId) await loadWidget(widgetCompanyId);
        }
      } finally { busy = false; }
    };
    const timer = window.setInterval(check, 2000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [widgetCompanyId, loadData, loadWidget]);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={() => loadData()} />;
  if (!data || Object.keys(data).length === 0) return <MobileEmpty text="Kayıt bulunamadı" />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 className="ky-mobile-h2">💼 Muhasebe Merkezi</h2>
        <span className={`ky-mobile-pill ${liveOnline ? "green" : "orange"}`}>{liveOnline ? "Canlı" : "Bağlantı"}</span>
      </div>

      <div className="ky-mobile-section-title">İşlem Merkezi</div>
      <div className="ky-mobile-grid2 ky-mobile-mb14">
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/cari')}>
          <div className="ky-mobile-icon">🏢</div><div><h3>Firma Kartları</h3><p>Cari aç, bakiye, hareket</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/odeme')}>
          <div className="ky-mobile-icon">💸</div><div><h3>Ödeme Ekle</h3><p>Tahsilat / ödeme kaydı</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/cek')}>
          <div className="ky-mobile-icon">📝</div><div><h3>Çek / Senet</h3><p>Vade, banka, görsel, ödendi</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/kdv')}>
          <div className="ky-mobile-icon">📉</div><div><h3>KDV Takip</h3><p>Gelen/giden, dönem, firma</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/fatura-irsaliye')}>
          <div className="ky-mobile-icon">📄</div><div><h3>Fatura / İrsaliye</h3><p>Müşteri irsaliyesi, satış faturası</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/urunler')}>
          <div className="ky-mobile-icon">📦</div><div><h3>Ürünler</h3><p>Ürün, KDV, lot, fiyat</p></div>
        </div>
      </div>

      <div className="ky-mobile-section-title">Firma Özeti · Bu Ay</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <select className="ky-mobile-input ky-mobile-mb10" value={widgetCompanyId} onChange={(e) => setWidgetCompanyId(e.target.value)}>
          <option value="">Firma seçin</option>
          {firmalar.map((firm) => <option key={firm.id} value={firm.id}>{firm.companyName || firm.firmaAdi || firm.name || "Firma"}</option>)}
        </select>
        {widgetData ? <div className="ky-mobile-kv">
          <span>Firma</span><b>{widgetData.companyName || "-"}</b>
          <span>Gelen Fatura</span><b>{widgetData.incomingInvoiceCount || 0} · {money(widgetData.incomingInvoiceTotal)}</b>
          <span>Kesilen Fatura</span><b>{widgetData.outgoingInvoiceCount || 0} · {money(widgetData.outgoingInvoiceTotal)}</b>
          <span>Tahsilat</span><b>{money(widgetData.collectionTotal)}</b>
          <span>Ödeme</span><b>{money(widgetData.paymentTotal)}</b>
          <span>Cari Bakiye</span><b>{money(widgetData.currentBalance)}</b>
          <span>Son İşlem</span><b>{widgetData.lastOperation ? `${dateText(widgetData.lastOperation.date)} · ${widgetData.lastOperation.label || "İşlem"}` : "-"}</b>
        </div> : <div className="ky-mobile-empty">Firma seçildiğinde bu ayın özeti burada görünür.</div>}
        <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>Açık cihazlar arasında değişiklikler otomatik güncellenir.</div>
      </div>

      <div className="ky-mobile-section-title">KDV Özeti</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-kv">
          <span>Dönem</span><b>{getField(data, ["donem", "period"], "Bu Ay")}</b>
          <span>Gelen KDV</span><b>{money(getField(data, ["gelenKdv", "inKdv"], 0))}</b>
          <span>Giden KDV</span><b>{money(getField(data, ["gidenKdv", "outKdv"], 0))}</b>
          <span>Sonuç</span><b className="ky-mobile-pill orange">{money(getField(data, ["netKdv", "resultKdv"], 0))}</b>
        </div>
      </div>

      <div className="ky-mobile-section-title">Onaylar</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-kv">
          <span>Toplam Firma</span><b>{firmalar.length}</b>
          <span>Belge İşlem Kaydı</span><b>{belgeler.length}</b>
          <span>Bekleyen Belge</span><b>{getField(data, ["onayBekleyenBelge"], "0")}</b>
          <span>Mail Bekleyen Fatura</span><b>{getField(data, ["mailBekleyenFatura"], "0")}</b>
          <span>Ekstreye Girmeyen</span><b>{getField(data, ["ekstreyeGirmeyen"], "0")}</b>
        </div>
      </div>
    </div>
  );
}
