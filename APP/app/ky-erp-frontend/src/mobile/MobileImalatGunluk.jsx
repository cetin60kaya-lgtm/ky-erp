import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileImalatGunluk() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedPlanLine, setSelectedPlanLine] = useState(null);
  const [form, setForm] = useState({
    adet: "",
    hataliAdet: "0",
    not: ""
  });
  
  const [recentEntries, setRecentEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

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

  async function loadRecentEntries(planLineId) {
    setEntriesLoading(true);
    const res = await mobileApiGet(`imalat/havuz/${planLineId}/girisler`);
    if (res.ok) {
       setRecentEntries(normalizeList(res.data));
    } else {
       setRecentEntries([]);
    }
    setEntriesLoading(false);
  }

  function handleSelect(item) {
    setSelectedPlanLine(item);
    setForm({ adet: "", hataliAdet: "0", not: "" });
    const id = item?.id || item?.uuid || item?.planLineId;
    if (id) loadRecentEntries(id);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!selectedPlanLine) return;
    
    const id = selectedPlanLine.id || selectedPlanLine.uuid || selectedPlanLine.planLineId;
    if (!id) return;

    setLoading(true);
    let res = await mobileApiPost(`imalat/havuz/${id}/giris`, {
      ...form,
      adet: Number(form.adet),
      hataliAdet: Number(form.hataliAdet)
    });
    
    if (!res.ok && res.status === 404) {
       res = await mobileApiPost("imalat/gunluk-kayit", {
         planLineId: id,
         ...form,
         adet: Number(form.adet),
         hataliAdet: Number(form.hataliAdet)
       });
    }

    if (!res.ok) {
      alert(res.message || "Kayıt eklenemedi");
    } else {
      alert("Üretim girişi kaydedildi!");
      setForm({ adet: "", hataliAdet: "0", not: "" });
      loadRecentEntries(id);
    }
    setLoading(false);
  }

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">🏭 Günlük İmalat Kaydı</h2>

      {selectedPlanLine ? (
        <>
          <div className="ky-mobile-card ky-mobile-mb14">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>
                 {getField(selectedPlanLine, ["modelName", "modelAdi", "model"], "Model Yok")}
              </h3>
              <button className="ky-mobile-btn" style={{ padding: '2px 10px', width: 'auto' }} onClick={() => setSelectedPlanLine(null)}>Geri</button>
            </div>
            <div className="ky-mobile-muted ky-mobile-small ky-mobile-mb10">
              {getField(selectedPlanLine, ["firmName", "firmaAdi", "firma"], "-")} | 
              İrsaliye: {getField(selectedPlanLine, ["sourceDispatchNo", "irsaliyeNo"], "-")}
            </div>
            
            <form onSubmit={handleSave}>
               <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                 <div style={{ flex: 1 }}>
                   <label className="ky-mobile-small ky-mobile-muted">Sağlam Üretim</label>
                   <input type="number" className="ky-mobile-input" value={form.adet} onChange={e => setForm({...form, adet: e.target.value})} required />
                 </div>
                 <div style={{ flex: 1 }}>
                   <label className="ky-mobile-small ky-mobile-muted">Fire (Hatalı)</label>
                   <input type="number" className="ky-mobile-input" value={form.hataliAdet} onChange={e => setForm({...form, hataliAdet: e.target.value})} required />
                 </div>
               </div>
               <input className="ky-mobile-input ky-mobile-mb10" placeholder="Açıklama / Not" value={form.not} onChange={e => setForm({...form, not: e.target.value})} />
               <button type="submit" className="ky-mobile-btn primary">Kaydet</button>
            </form>
          </div>

          <div className="ky-mobile-section-title">Son Girişler</div>
          {entriesLoading ? (
             <div style={{ padding: 10, textAlign: 'center' }}>Yükleniyor...</div>
          ) : !recentEntries.length ? (
             <MobileEmpty text="Bu modele ait giriş bulunamadı" />
          ) : (
             recentEntries.map((e, idx) => {
               const adet = getField(e, ["adet", "uretimAdedi", "quantity"], 0);
               const hatali = getField(e, ["hataliAdet", "fire", "defect"], 0);
               const tarih = getField(e, ["tarih", "date", "createdAt"], "");
               const not = getField(e, ["not", "note"], "");
               
               return (
                 <div key={e.id || e.uuid || idx} className="ky-mobile-card ky-mobile-mb10">
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                     <div>
                       <div className="ky-mobile-muted ky-mobile-small">{tarih}</div>
                       {not && <div style={{ fontSize: '0.9rem', marginTop: 5 }}>{not}</div>}
                     </div>
                     <div style={{ textAlign: 'right' }}>
                       <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>{adet} Sağlam</span>
                       {hatali > 0 && <span style={{ color: 'var(--red)', marginLeft: 10 }}>{hatali} Fire</span>}
                     </div>
                   </div>
                 </div>
               );
             })
          )}
        </>
      ) : (
        <>
          <div className="ky-mobile-section-title">Açık Modeller ({items.length})</div>
          {!items.length && !loading && !error && <MobileEmpty text="Kayıt bulunamadı" />}
          
          {items.map(item => {
            const id = item?.id || item?.uuid || item?.planLineId;
            const modelAdi = getField(item, ["modelName", "modelAdi", "model"], "Model Yok");
            const firma = getField(item, ["firmName", "firmaAdi", "firma"], "-");
            const beklenen = Number(getField(item, ["expectedQuantity", "beklenen", "adet"], 0));
            const uretilen = Number(getField(item, ["producedQuantity", "uretilen", "uretimAdedi"], 0));
            
            return (
              <div key={id} className="ky-mobile-card ky-mobile-mb10">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{modelAdi}</h3>
                    <div className="ky-mobile-muted ky-mobile-small">{firma}</div>
                    <div className="ky-mobile-muted ky-mobile-small" style={{ marginTop: 5 }}>
                      Beklenen: {beklenen} | Üretilen: <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>{uretilen}</span>
                    </div>
                  </div>
                  <button className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '8px 15px' }} onClick={() => handleSelect(item)}>
                    Giriş Yap
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
