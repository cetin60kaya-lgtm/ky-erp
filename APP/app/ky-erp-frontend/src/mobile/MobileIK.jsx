import React, { useEffect, useState } from "react";
import { mobileApiGet, getErrorMessage, normalizeList } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileIK() {
  const [data, setData] = useState({ daily: [], monthly: [], summary: {}, slips: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [resDaily, resMonthly, resSummary, resSlips] = await Promise.all([
        mobileApiGet("ik/daily-employees"),
        mobileApiGet("ik/monthly-employees"),
        mobileApiGet("ik/daily-attendance/weekly-summary"),
        mobileApiGet("ik/daily-attendance/payment-slips"),
      ]);

      if (!resDaily.ok && !resMonthly.ok) {
        throw new Error(resDaily.message || "İnsan kaynakları verisi alınamadı");
      }

      setData({
        daily: normalizeList(resDaily.data),
        monthly: normalizeList(resMonthly.data),
        summary: resSummary.ok ? resSummary.data : {},
        slips: resSlips.ok ? normalizeList(resSlips.data) : [],
      });
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">👥 İnsan Kaynakları</h2>

      <div className="ky-mobile-grid3 ky-mobile-mb10">
        <div className="ky-mobile-summary"><b>{data?.daily.length}</b><span>Günlük Çalışan</span></div>
        <div className="ky-mobile-summary"><b>{data?.monthly.length}</b><span>Aylık Personel</span></div>
        <div className="ky-mobile-summary"><b>{Number(data?.summary.toplam || data?.summary.count || 0)}</b><span>Haftalık Özet</span></div>
      </div>

      <div className="ky-mobile-section-title">Personel Yönetimi</div>
      <div className="ky-mobile-list ky-mobile-mb14">
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/ik/gunluk-giris')}>
          <div className="ky-mobile-icon">🗓️</div>
          <div>
            <h3>Günlük Giriş</h3>
            <p>Tarih aralığı, G/N, vardiya girişi</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>
        
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/ik/gunluk')}>
          <div className="ky-mobile-icon">👷</div>
          <div>
            <h3>Günlük Personel Listesi</h3>
            <p>Günlükçü personel takibi, yevmiye</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>
        
        <div className="ky-mobile-module-card" onClick={() => navigate('/mobile/ik/aylik')}>
          <div className="ky-mobile-icon">💼</div>
          <div>
            <h3>Aylık Personel Mesai/Kesinti</h3>
            <p>Maaşlı personel, mesai/avans kayıtları</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>
      </div>

      <div className="ky-mobile-section-title">Raporlar & Belgeler</div>
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <button className="ky-mobile-btn secondary" onClick={loadData}>Haftalık Özet</button>
        <button className="ky-mobile-btn secondary" onClick={loadData}>Günlük Ödeme Fişleri ({data?.slips.length})</button>
        <button className="ky-mobile-btn secondary" onClick={loadData} style={{ gridColumn: "span 2" }}>Evrak / Belgeler</button>
      </div>

      <div className="ky-mobile-section-title">Durum Özeti</div>
      <div className="ky-mobile-card">
        <div className="ky-mobile-activity">
          <span className="ky-mobile-small ky-mobile-muted">Günlük ve Aylık personel işlemlerini üst menülerden ayrı ayrı yönetebilirsiniz. Veriler doğrudan canlı sisteme kaydedilir.</span>
        </div>
      </div>
    </div>
  );
}
