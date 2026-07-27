import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileMuhasebe() {
  const [data, setData] = useState(null);
  const [belgeler, setBelgeler] = useState([]);
  const [firmalar, setFirmalar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const [resOzet, resBelge, resFirmalar] = await Promise.all([
      mobileApiGet("muhasebe/yonetim-ozeti"),
      mobileApiGet("muhasebe/belge-islem"),
      mobileApiGet("muhasebe/firmalar"),
    ]);

    if (!resOzet.ok && !resBelge.ok && !resFirmalar.ok) {
      setError(resOzet.message || resBelge.message || resFirmalar.message || "Veri alınamadı");
      setData(null);
      setLoading(false);
      return;
    }

    setData(resOzet.ok ? normalizeObject(resOzet.data) : {});
    setBelgeler(resBelge.ok ? normalizeList(resBelge.data) : []);
    setFirmalar(resFirmalar.ok ? normalizeList(resFirmalar.data) : []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={loadData} />;
  if (!data || Object.keys(data).length === 0) return <MobileEmpty text="Kayıt bulunamadı" />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">💼 Muhasebe Merkezi</h2>
      
      <div className="ky-mobile-section-title">İşlem Merkezi</div>
      <div className="ky-mobile-grid2 ky-mobile-mb14">
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/cari')}>
          <div className="ky-mobile-icon">🏢</div>
          <div>
            <h3>Firma Kartları</h3>
            <p>Cari aç, bakiye, hareket</p>
          </div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/odeme')}>
          <div className="ky-mobile-icon">💸</div>
          <div>
            <h3>Ödeme Ekle</h3>
            <p>Tahsilat / ödeme kaydı</p>
          </div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/cek')}>
          <div className="ky-mobile-icon">📝</div>
          <div>
            <h3>Çek / Senet</h3>
            <p>Vade, banka, görsel, ödendi</p>
          </div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/kdv')}>
          <div className="ky-mobile-icon">📉</div>
          <div>
            <h3>KDV Takip</h3>
            <p>Gelen/giden, dönem, firma</p>
          </div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/fatura-irsaliye')}>
          <div className="ky-mobile-icon">📄</div>
          <div>
            <h3>Fatura / İrsaliye</h3>
            <p>Müşteri irsaliyesi, satış faturası</p>
          </div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/muhasebe/urunler')}>
          <div className="ky-mobile-icon">📦</div>
          <div>
            <h3>Ürünler</h3>
            <p>Ürün, KDV, lot, fiyat</p>
          </div>
        </div>
      </div>

      <div className="ky-mobile-section-title">KDV Özeti</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-kv">
          <span>Dönem</span><b>{getField(data, ["donem", "period"], "Bu Ay")}</b>
          <span>Gelen KDV</span><b>₺{Number(getField(data, ["gelenKdv", "inKdv"], 0)).toLocaleString('tr-TR')}</b>
          <span>Giden KDV</span><b>₺{Number(getField(data, ["gidenKdv", "outKdv"], 0)).toLocaleString('tr-TR')}</b>
          <span>Sonuç</span><b className="ky-mobile-pill orange">₺{Number(getField(data, ["netKdv", "resultKdv"], 0)).toLocaleString('tr-TR')}</b>
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
