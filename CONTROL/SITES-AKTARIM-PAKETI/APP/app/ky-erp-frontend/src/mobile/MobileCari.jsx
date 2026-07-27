import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, mobileApiPut, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileCari() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");

  const [form, setForm] = useState({ firmaAdi: "", telefon: "", vergiNo: "" });

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("muhasebe/firmalar");
    
    if (!res.ok) {
      setError(res.message || "Veri alınamadı");
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

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    
    if (editItem) {
      const res = await mobileApiPut(`muhasebe/firmalar/${editItem}`, form);
      if (!res.ok) {
        setError(res.message || "Kayıt güncellenemedi");
        setLoading(false);
        return;
      }
    } else {
      const res = await mobileApiPost("muhasebe/firmalar", form);
      if (!res.ok) {
        setError(res.message || "Kayıt eklenemedi");
        setLoading(false);
        return;
      }
    }

    setShowAdd(false);
    setEditItem(null);
    setForm({ firmaAdi: "", telefon: "", vergiNo: "" });
    loadData();
  }

  function openEdit(firma) {
    setForm({
      firmaAdi: getField(firma, ["firmaAdi", "unvan", "ad", "name", "title"], ""),
      telefon: getField(firma, ["telefon", "phone", "tel"], ""),
      vergiNo: getField(firma, ["vergiNo", "taxNo", "vkn", "tcNo"], "")
    });
    setEditItem(firma.id || firma.uuid || firma.firmaId);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function createCariHareket(firma) {
    const firmaId = firma.id || firma.uuid || firma.firmaId;
    const input = window.prompt("İşlem tutarı girin");
    const tutar = Number(input || 0);
    if (!firmaId || !Number.isFinite(tutar) || tutar <= 0) return;

    const res = await mobileApiPost("muhasebe/cari-hareket", {
      firmaId,
      islemTipi: "Tahsilat",
      tutar,
      aciklama: "Mobil Cari İşlem",
    });
    if (!res.ok) {
      setError(res.message || "Veri alınamadı");
      return;
    }
    loadData();
  }

  // Filtering and Sorting
  let displayedItems = items.filter(f => {
    if (!search) return true;
    const name = getField(f, ["firmaAdi", "unvan", "ad", "name", "title"], "").toLowerCase();
    const tel = getField(f, ["telefon", "phone", "tel"], "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || tel.includes(q);
  });

  displayedItems.sort((a, b) => {
    const nameA = getField(a, ["firmaAdi", "unvan"], "").toLowerCase();
    const nameB = getField(b, ["firmaAdi", "unvan"], "").toLowerCase();
    const balA = Number(getField(a, ["bakiye", "currentBalance"], 0));
    const balB = Number(getField(b, ["bakiye", "currentBalance"], 0));

    if (sortBy === "name_asc") return nameA.localeCompare(nameB);
    if (sortBy === "name_desc") return nameB.localeCompare(nameA);
    if (sortBy === "bal_desc") return balB - balA;
    if (sortBy === "bal_asc") return balA - balB;
    return 0;
  });

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ky-mobile-h2" style={{ margin: 0 }}>🏢 Firma Kartları</h2>
        <button 
          className="ky-mobile-btn primary" 
          style={{ width: 'auto', padding: '5px 15px' }} 
          onClick={() => {
            setEditItem(null);
            setForm({ firmaAdi: "", telefon: "", vergiNo: "" });
            setShowAdd(!showAdd);
          }}
        >
          {showAdd ? "İptal" : "+ Yeni"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSave} className="ky-mobile-card ky-mobile-mb14" style={{ border: '2px solid var(--blue)' }}>
          <div className="ky-mobile-section-title">{editItem ? "Cari Düzenle" : "Yeni Cari Aç"}</div>
          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Firma Adı" 
            value={form.firmaAdi} 
            onChange={e => setForm({...form, firmaAdi: e.target.value})}
            required
          />
          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Telefon" 
            value={form.telefon} 
            onChange={e => setForm({...form, telefon: e.target.value})}
          />
          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Vergi No / T.C." 
            value={form.vergiNo} 
            onChange={e => setForm({...form, vergiNo: e.target.value})}
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
            placeholder="Firma veya tel ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
         />
         <select 
            className="ky-mobile-input" 
            style={{ flex: 1, marginBottom: 0, padding: '8px' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
         >
            <option value="name_asc">A-Z</option>
            <option value="name_desc">Z-A</option>
            <option value="bal_desc">Alacak ↓</option>
            <option value="bal_asc">Borç ↓</option>
         </select>
      </div>

      {!displayedItems.length && !loading && !error && <MobileEmpty text="Kayıt bulunamadı" />}

      {displayedItems.map((firma) => {
        const firmaAdi = getField(firma, ["firmaAdi", "unvan", "ad", "name", "title"], "Firma adı yok");
        const bakiye = Number(getField(firma, ["bakiye", "currentBalance", "balance", "netBakiye", "toplamBakiye"], 0));
        const telefon = getField(firma, ["telefon", "phone", "tel"], "");
        const vergiNo = getField(firma, ["vergiNo", "taxNo", "vkn", "tcNo"], "");
        
        return (
          <div key={firma.id || firma.uuid || firma.firmaId} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{firmaAdi}</h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  {telefon && <div>📞 {telefon}</div>}
                  {vergiNo && <div>V.No: {vergiNo}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="ky-mobile-small ky-mobile-muted">Güncel Bakiye</span>
                <div className="ky-mobile-money" style={{ color: bakiye < 0 ? 'var(--red)' : bakiye > 0 ? 'var(--green)' : 'inherit', fontSize: '1.2rem' }}>
                  ₺{bakiye.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #eee', paddingTop: 10, display: 'flex', gap: 10 }}>
               <button className="ky-mobile-btn secondary" onClick={() => openEdit(firma)}>Düzenle</button>
              <button className="ky-mobile-btn" onClick={() => createCariHareket(firma)}>İşlem Yap</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
