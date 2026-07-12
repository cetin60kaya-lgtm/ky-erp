import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileIKGunluk() {
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState([]);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [resEmp, resSummary, resSlips] = await Promise.all([
      mobileApiGet("ik/daily-employees"),
      mobileApiGet("ik/daily-attendance/weekly-summary"),
      mobileApiGet("ik/daily-attendance/payment-slips"),
    ]);

    if (!resEmp.ok) {
      setError(resEmp.message || "Personel listesi alınamadı");
      setEmployees([]);
      setLoading(false);
      return;
    }

    setEmployees(normalizeList(resEmp.data));
    setSummary(resSummary.ok ? normalizeList(resSummary.data) : []);
    setSlips(resSlips.ok ? normalizeList(resSlips.data) : []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !employees.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !employees.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">👷 Günlük Personel Listesi</h2>
      
      <div className="ky-mobile-section-title">Aktif Günlük Çalışanlar ({employees.length})</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-between">
          <span>Haftalık Özet Kaydı</span>
          <b>{summary.length}</b>
        </div>
        <div className="ky-mobile-between">
          <span>Günlük Ödeme Fişi</span>
          <b>{slips.length}</b>
        </div>
      </div>

      {!employees.length && !loading && !error && <MobileEmpty text="Personel bulunamadı" />}

      {employees.map(emp => {
        const id = emp.id || emp.uuid || emp.personelId;
        const isim = getField(emp, ["isim", "ad", "fullName", "name"], "İsimsiz");
        const gunlukUcret = Number(getField(emp, ["yevmiye", "gunlukUcret", "dailyWage"], 0));
        const haftalikGun = Number(getField(emp, ["haftalikGun", "calisilanGun"], 0));
        
        const hakedis = gunlukUcret * haftalikGun;

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{isim}</h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  Günlük Yevmiye: ₺{gunlukUcret.toLocaleString('tr-TR')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="ky-mobile-small ky-mobile-muted">Bu Hafta ({haftalikGun} Gün)</span>
                <div className="ky-mobile-money" style={{ fontSize: '1.2rem', color: 'var(--green)' }}>
                  ₺{hakedis.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #eee', marginTop: 10, paddingTop: 10, display: 'flex', gap: 10 }}>
              <button className="ky-mobile-btn secondary" onClick={loadData}>Haftalık Özet</button>
              <button className="ky-mobile-btn" onClick={loadData}>Ödeme Fişi</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
