import React, { useEffect, useState } from "react";
import { mobileApiGet, getErrorMessage, normalizeList } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileIK() {
  const [people, setPeople] = useState([]);
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
      const response = await mobileApiGet("ik/monthly-employees");
      if (!response.ok) throw new Error(response.message || "Aylık personel verisi alınamadı");
      setPeople(normalizeList(response.data));
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
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <div className="ky-mobile-summary"><b>{people.length}</b><span>Aylık Personel</span></div>
        <div className="ky-mobile-summary"><b>İK</b><span>Aylık Yönetim</span></div>
      </div>

      <div className="ky-mobile-section-title">Personel Yönetimi</div>
      <div className="ky-mobile-list ky-mobile-mb14">
        <button className="ky-mobile-module-card" type="button" onClick={() => navigate('/mobile/ik/aylik')}>
          <div className="ky-mobile-icon">💼</div>
          <div>
            <h3>Aylık Personel</h3>
            <p>Maaş, mesai, avans, kesinti ve izin işlemleri</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </button>
      </div>
      {!people.length ? <MobileEmpty text="Aylık personel bulunamadı" /> : null}

      <div className="ky-mobile-section-title">Durum</div>
      <div className="ky-mobile-card">
        <div className="ky-mobile-activity">
          <span className="ky-mobile-small ky-mobile-muted">
            Günlük Operasyon bu İK ekranından ayrılmıştır. Bu bölüm yalnız aylık personel işlemlerini yönetir.
          </span>
        </div>
      </div>
    </div>
  );
}
