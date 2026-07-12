import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileImalatRapor() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("imalat/raporlar");
    
    if (!res.ok) {
      setError(res.message || "Rapor verisi alınamadı");
      setData([]);
      setLoading(false);
      return;
    }

    setData(normalizeList(res.data));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !data.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">📊 İmalat Raporları</h2>

      <div className="ky-mobile-section-title">Genel Rapor Çıktısı</div>

      {!data.length && !loading && !error && <MobileEmpty text="Rapor kaydı bulunamadı" />}

      {data.map((item, idx) => {
        const id = item?.id || item?.uuid || idx;
        const raporAdi = getField(item, ["raporAdi", "title", "name", "isim"], "İsimsiz Rapor");
        const deger1 = getField(item, ["deger1", "toplam", "value1"], "");
        const deger2 = getField(item, ["deger2", "kalan", "value2"], "");
        const aciklama = getField(item, ["aciklama", "description"], "");

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: 'var(--primary)' }}>{raporAdi}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               {deger1 && (
                 <div>
                   <div className="ky-mobile-small ky-mobile-muted">Değer 1</div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{deger1}</div>
                 </div>
               )}
               {deger2 && (
                 <div style={{ textAlign: 'right' }}>
                   <div className="ky-mobile-small ky-mobile-muted">Değer 2</div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{deger2}</div>
                 </div>
               )}
            </div>
            
            {aciklama && (
              <div className="ky-mobile-muted ky-mobile-small" style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                {aciklama}
              </div>
            )}
          </div>
        );
      })}
      
      {data?.length > 0 && (
         <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button className="ky-mobile-btn secondary" onClick={() => loadData()}>Yenile</button>
         </div>
      )}
    </div>
  );
}
