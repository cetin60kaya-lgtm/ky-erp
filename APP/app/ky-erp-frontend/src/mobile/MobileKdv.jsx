import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileKdv() {
  const [data, setData] = useState(null);
  const [firmaBazli, setFirmaBazli] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [resOzet, resFirmaBazli, resDonem] = await Promise.all([
      mobileApiGet("muhasebe/kdv/ozet"),
      mobileApiGet("muhasebe/kdv/firma-bazli"),
      mobileApiGet("muhasebe/kdv/donem"),
    ]);

    if (!resOzet.ok && !resDonem.ok) {
      setError(resOzet.message || resDonem.message || "Veri alınamadı");
      setData(null);
      setLoading(false);
      return;
    }

    const ozet = resOzet.ok ? normalizeObject(resOzet.data) : {};
    const donemData = resDonem.ok ? normalizeObject(resDonem.data) : {};
    setData({ ...ozet, ...donemData });
    setFirmaBazli(resFirmaBazli.ok ? normalizeList(resFirmaBazli.data) : []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={loadData} />;
  if (!data || Object.keys(data).length === 0) return <MobileEmpty text="Kayıt bulunamadı" />;

  const donem = getField(data, ["donem", "period"], "Bu Ay");
  const gelenKdv = Number(getField(data, ["gelenKdv", "inKdv"], 0));
  const gidenKdv = Number(getField(data, ["gidenKdv", "outKdv"], 0));
  const devredenKdv = Number(getField(data, ["devredenKdv"], 0));
  const indirilecekKdv = Number(getField(data, ["indirilecekKdv"], 0));
  const hesaplananKdv = Number(getField(data, ["hesaplananKdv"], 0));
  const sonuc = Number(getField(data, ["netKdv", "resultKdv", "odenecekKdv"], 0));
  
  const sonucText = sonuc >= 0 ? "Ödenecek KDV" : "Devreden KDV";
  const sonucClass = sonuc >= 0 ? "var(--red)" : "var(--green)";

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">📉 KDV Takip Merkezi</h2>
      
      <div className="ky-mobile-card ky-mobile-mb14" style={{ textAlign: 'center', padding: '20px 10px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: 'var(--muted)' }}>Dönem: {donem}</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: sonucClass, margin: '10px 0' }}>
          ₺{Math.abs(sonuc).toLocaleString('tr-TR')}
        </div>
        <div className="ky-mobile-pill" style={{ backgroundColor: sonucClass, color: 'white', display: 'inline-block', padding: '5px 15px' }}>
          {sonucText}
        </div>
      </div>

      <div className="ky-mobile-section-title">KDV Detayları</div>
      
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <div className="ky-mobile-card ky-mobile-p14" style={{ borderLeft: '4px solid var(--green)' }}>
          <span className="ky-mobile-small ky-mobile-muted">Gelen (Alış) KDV</span>
          <div className="ky-mobile-money">₺{gelenKdv.toLocaleString('tr-TR')}</div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14" style={{ borderLeft: '4px solid var(--red)' }}>
          <span className="ky-mobile-small ky-mobile-muted">Giden (Satış) KDV</span>
          <div className="ky-mobile-money">₺{gidenKdv.toLocaleString('tr-TR')}</div>
        </div>
      </div>

      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-kv">
          <span>Önceki Aydan Devreden</span><b>₺{devredenKdv.toLocaleString('tr-TR')}</b>
          <span>Toplam İndirilecek</span><b>₺{indirilecekKdv.toLocaleString('tr-TR')}</b>
          <span>Toplam Hesaplanan</span><b>₺{hesaplananKdv.toLocaleString('tr-TR')}</b>
        </div>
      </div>
      
      {firmaBazli.length > 0 && (
        <>
          <div className="ky-mobile-section-title">Firma Bazlı KDV</div>
          {firmaBazli.slice(0, 6).map((item, idx) => (
            <div key={item?.id || item?.uuid || idx} className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
              <div className="ky-mobile-between">
                <b>{getField(item, ["firmaAdi", "unvan", "name"], "Firma")}</b>
                <span>₺{Number(getField(item, ["netKdv", "kdv", "tutar"], 0)).toLocaleString("tr-TR")}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
