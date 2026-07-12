import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileImalat() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    let res = await mobileApiGet("imalat/havuz");
    if (!res.ok || res.status === 404) {
       res = await mobileApiGet("uretim/havuz");
     }
     if (!res.ok || res.status === 404) {
       res = await mobileApiGet("imalat/giris-havuzu");
    }
    
    if (!res.ok) {
      setError(res.message || "İmalat havuzu alınamadı");
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(normalizeList(res.data));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">🏭 İmalat (Üretim Giriş Havuzu)</h2>

      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/imalat/gunluk')}>Günlük Üretim</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/imalat/rapor')}>Raporlar</button>
      </div>
      
      <div className="ky-mobile-section-title">Açık İşler ({items.length})</div>

      {!items.length && !loading && !error && <MobileEmpty text="Havuzda bekleyen iş yok" />}

      {items.map(item => {
        const id = item?.id || item?.uuid || item?.planLineId;
        const modelAdi = getField(item, ["modelName", "modelAdi", "model"], "Model Yok");
        const firma = getField(item, ["firmName", "firmaAdi", "firma"], "-");
        const irsaliye = getField(item, ["sourceDispatchNo", "irsaliyeNo", "irsaliye"], "-");
        const baskiBolgesi = getField(item, ["printArea", "baskiBolgesi"], "-");
        
        const beklenen = Number(getField(item, ["expectedQuantity", "beklenen", "adet"], 0));
        const uretilen = Number(getField(item, ["producedQuantity", "uretilen", "uretimAdedi"], 0));
        const fire = Number(getField(item, ["defectQuantity", "fire", "hataliAdet"], 0));
        const kalan = beklenen - uretilen - fire;
        const durum = getField(item, ["status", "durum"], "Üretimde");

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{modelAdi}</h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  <div>Firma: <b>{firma}</b></div>
                  <div>İrsaliye: {irsaliye} | Baskı: {baskiBolgesi}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                 <span className="ky-mobile-pill orange">{durum}</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
               <div style={{ flex: 1, minWidth: '45%', background: '#f5f5f5', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                 <div className="ky-mobile-small ky-mobile-muted">Beklenen</div>
                 <div style={{ fontWeight: 'bold' }}>{beklenen}</div>
               </div>
               <div style={{ flex: 1, minWidth: '45%', background: '#e8f5e9', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                 <div className="ky-mobile-small ky-mobile-muted">Üretilen</div>
                 <div style={{ fontWeight: 'bold', color: 'var(--green)' }}>{uretilen}</div>
               </div>
               <div style={{ flex: 1, minWidth: '45%', background: '#fff3e0', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                 <div className="ky-mobile-small ky-mobile-muted">Kalan</div>
                 <div style={{ fontWeight: 'bold', color: 'var(--orange)' }}>{kalan > 0 ? kalan : 0}</div>
               </div>
               <div style={{ flex: 1, minWidth: '45%', background: '#ffebee', padding: 8, borderRadius: 4, textAlign: 'center' }}>
                 <div className="ky-mobile-small ky-mobile-muted">Fire</div>
                 <div style={{ fontWeight: 'bold', color: 'var(--red)' }}>{fire}</div>
               </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
