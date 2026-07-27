import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, mobileApiPut, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileOdeme() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [firmalar, setFirmalar] = useState([]);
  const [yaklasanOdemeler, setYaklasanOdemeler] = useState([]);
  
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("vade_asc");

  const [form, setForm] = useState({
    firmaId: "",
    islemTipi: "Tahsilat",
    tutar: "",
    aciklama: ""
  });

  const islemTipleri = [
    "Tahsilat", "Ödeme", "Borç", "Alacak", 
    "Kredi Kartı Ödemesi", "Çek Tahsilatı", "Çek Ödemesi"
  ];

  async function loadData() {
    setLoading(true);
    setError("");

    const [resFirmalar, resOdemeler] = await Promise.all([
      mobileApiGet("muhasebe/firmalar"),
      mobileApiGet("muhasebe/yaklasan-odemeler")
    ]);

    if (!resFirmalar.ok) {
      setError(resFirmalar.message || "Firmalar alınamadı");
      setLoading(false);
      return;
    }

    setFirmalar(normalizeList(resFirmalar.data));
    setYaklasanOdemeler(normalizeList(resOdemeler.data));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.firmaId || !form.tutar) {
      setError("Firma ve tutar zorunludur.");
      return;
    }

    setLoading(true);
    
    if (editItem) {
      const res = await mobileApiPut(`muhasebe/cari-hareket/${editItem}`, {
        ...form,
        tutar: Number(form.tutar)
      });
      if (!res.ok) {
        setError(res.message || "İşlem güncellenemedi");
        setLoading(false);
        return;
      }
    } else {
      const res = await mobileApiPost("muhasebe/cari-hareket", {
        ...form,
        tutar: Number(form.tutar)
      });
      if (!res.ok) {
        setError(res.message || "İşlem kaydedilemedi");
        setLoading(false);
        return;
      }
    }

    setShowAdd(false);
    setEditItem(null);
    setForm({ firmaId: "", islemTipi: "Tahsilat", tutar: "", aciklama: "" });
    loadData();
  }

  function openEdit(odeme) {
    setForm({
      firmaId: getField(odeme, ["firmaId", "cariId"], ""),
      islemTipi: getField(odeme, ["islemTipi", "type"], "Tahsilat"),
      tutar: getField(odeme, ["tutar", "amount", "odenecek"], ""),
      aciklama: getField(odeme, ["aciklama", "description", "note"], "")
    });
    setEditItem(odeme.id || odeme.uuid);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Filter and Sort
  let displayedItems = yaklasanOdemeler.filter(f => {
    if (!search) return true;
    const name = getField(f, ["firmaAdi", "unvan", "ad", "isim"], "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  displayedItems.sort((a, b) => {
    const vadeA = new Date(getField(a, ["vade", "tarih", "date", "vadeTarihi"], "2099-01-01"));
    const vadeB = new Date(getField(b, ["vade", "tarih", "date", "vadeTarihi"], "2099-01-01"));
    const tutarA = Number(getField(a, ["tutar", "amount", "odenecek"], 0));
    const tutarB = Number(getField(b, ["tutar", "amount", "odenecek"], 0));

    if (sortBy === "vade_asc") return vadeA - vadeB;
    if (sortBy === "vade_desc") return vadeB - vadeA;
    if (sortBy === "tutar_desc") return tutarB - tutarA;
    if (sortBy === "tutar_asc") return tutarA - tutarB;
    return 0;
  });

  if (loading && !firmalar.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !firmalar.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ky-mobile-h2" style={{ margin: 0 }}>💸 Ödeme / Tahsilat</h2>
        <button 
          className="ky-mobile-btn primary" 
          style={{ width: 'auto', padding: '5px 15px' }} 
          onClick={() => {
             setEditItem(null);
             setForm({ firmaId: "", islemTipi: "Tahsilat", tutar: "", aciklama: "" });
             setShowAdd(!showAdd);
          }}
        >
          {showAdd ? "İptal" : "+ Yeni"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSave} className="ky-mobile-card ky-mobile-mb14" style={{ border: '2px solid var(--blue)' }}>
          <div className="ky-mobile-section-title">{editItem ? "İşlem Düzenle" : "Yeni İşlem Kaydı"}</div>
          
          <select 
            className="ky-mobile-input ky-mobile-mb10"
            value={form.firmaId}
            onChange={e => setForm({...form, firmaId: e.target.value})}
            required
          >
            <option value="">-- Firma Seçin --</option>
            {firmalar.map(f => (
              <option key={f.id || f.uuid || f.firmaId} value={f.id || f.uuid || f.firmaId}>
                {getField(f, ["firmaAdi", "unvan", "ad", "name"], "Firma")}
              </option>
            ))}
          </select>

          <select 
            className="ky-mobile-input ky-mobile-mb10"
            value={form.islemTipi}
            onChange={e => setForm({...form, islemTipi: e.target.value})}
          >
            {islemTipleri.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input 
            type="number"
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Tutar (₺)" 
            value={form.tutar} 
            onChange={e => setForm({...form, tutar: e.target.value})}
            required
          />

          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Açıklama (Opsiyonel)" 
            value={form.aciklama} 
            onChange={e => setForm({...form, aciklama: e.target.value})}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ky-mobile-btn" onClick={() => { setShowAdd(false); setEditItem(null); }}>İptal</button>
            <button type="submit" className="ky-mobile-btn primary">{editItem ? "Güncelle" : "Kaydet"}</button>
          </div>
        </form>
      )}

      {error && <div className="ky-mobile-card ky-mobile-mb10" style={{ color: 'var(--red)' }}>{error}</div>}

      <div className="ky-mobile-card ky-mobile-mb10" style={{ display: 'flex', gap: 10, padding: '10px' }}>
         <input 
            className="ky-mobile-input" 
            style={{ flex: 2, marginBottom: 0 }}
            placeholder="Firma ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
         />
         <select 
            className="ky-mobile-input" 
            style={{ flex: 1, marginBottom: 0, padding: '8px' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
         >
            <option value="vade_asc">Vade ↑</option>
            <option value="vade_desc">Vade ↓</option>
            <option value="tutar_desc">Tutar ↓</option>
            <option value="tutar_asc">Tutar ↑</option>
         </select>
      </div>

      <div className="ky-mobile-section-title">Yaklaşan Ödemeler</div>
      
      {!displayedItems.length && !loading && !error && <MobileEmpty text="Yaklaşan ödeme bulunamadı" />}

      {displayedItems.map((odeme, idx) => {
        const firmaAdi = getField(odeme, ["firmaAdi", "unvan", "ad", "isim"], "Firma adı yok");
        const tutar = Number(getField(odeme, ["tutar", "amount", "odenecek"], 0));
        const vade = getField(odeme, ["vade", "tarih", "date", "vadeTarihi"], "-");
        
        return (
          <div key={odeme.id || odeme.uuid || idx} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{firmaAdi}</h3>
                <div className="ky-mobile-muted ky-mobile-small">Vade: {vade}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="ky-mobile-small ky-mobile-muted">Tutar</span>
                <div className="ky-mobile-money" style={{ color: 'var(--red)', fontSize: '1.2rem' }}>
                  ₺{tutar.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #eee', marginTop: 10, paddingTop: 10, display: 'flex', gap: 10 }}>
               <button className="ky-mobile-btn secondary" onClick={() => openEdit(odeme)}>Düzenle</button>
              <button className="ky-mobile-btn" onClick={loadData}>Ödeme Yap</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
