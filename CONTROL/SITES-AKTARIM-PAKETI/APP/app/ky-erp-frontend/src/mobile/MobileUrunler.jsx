import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, mobileApiPut, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileUrunler() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");

  const [form, setForm] = useState({
    urunAdi: "",
    urunTipi: "Hammadde",
    kdvOrani: 20,
    lotTakibi: true,
    fiyat: "",
    tedarikci: "",
    stok: ""
  });

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("muhasebe/urunler");
    
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

    const payload = {
      ...form,
      kdvOrani: Number(form.kdvOrani),
      fiyat: Number(form.fiyat),
      stok: Number(form.stok)
    };

    if (editItem) {
      const res = await mobileApiPut(`muhasebe/urunler/${editItem}`, payload);
      if (!res.ok) {
        setError(res.message || "Ürün güncellenemedi");
        setLoading(false);
        return;
      }
    } else {
      const res = await mobileApiPost("muhasebe/urunler", payload);
      if (!res.ok) {
        setError(res.message || "Ürün kaydedilemedi");
        setLoading(false);
        return;
      }
    }

    setShowAdd(false);
    setEditItem(null);
    setForm({ urunAdi: "", urunTipi: "Hammadde", kdvOrani: 20, lotTakibi: true, fiyat: "", tedarikci: "", stok: "" });
    loadData();
  }

  function openEdit(urun) {
    setForm({
      urunAdi: getField(urun, ["urunAdi", "ad", "name", "productName"], ""),
      urunTipi: getField(urun, ["urunTipi", "tip", "type", "category"], "Hammadde"),
      kdvOrani: getField(urun, ["kdv", "kdvOrani", "tax"], 20),
      lotTakibi: getField(urun, ["lotTakibi", "hasLot", "isLotTracked"], false),
      fiyat: getField(urun, ["fiyat", "sonFiyat", "price", "lastPrice"], ""),
      tedarikci: getField(urun, ["tedarikci", "supplier", "firma"], ""),
      stok: getField(urun, ["stok", "stokMiktari", "quantity", "stock"], "")
    });
    setEditItem(urun.id || urun.uuid || urun.urunId);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Filter and sort
  let displayedItems = items.filter(f => {
    if (!search) return true;
    const name = getField(f, ["urunAdi", "ad", "name", "productName"], "").toLowerCase();
    const tedarikci = getField(f, ["tedarikci", "supplier", "firma"], "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || tedarikci.includes(q);
  });

  displayedItems.sort((a, b) => {
    const nameA = getField(a, ["urunAdi", "ad", "name", "productName"], "").toLowerCase();
    const nameB = getField(b, ["urunAdi", "ad", "name", "productName"], "").toLowerCase();
    const stokA = Number(getField(a, ["stok", "stokMiktari", "quantity", "stock"], 0));
    const stokB = Number(getField(b, ["stok", "stokMiktari", "quantity", "stock"], 0));

    if (sortBy === "name_asc") return nameA.localeCompare(nameB);
    if (sortBy === "name_desc") return nameB.localeCompare(nameA);
    if (sortBy === "stok_desc") return stokB - stokA;
    if (sortBy === "stok_asc") return stokA - stokB;
    return 0;
  });

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ky-mobile-h2" style={{ margin: 0 }}>📦 Ürünler</h2>
        <button 
           className="ky-mobile-btn primary" 
           style={{ width: 'auto', padding: '5px 15px' }} 
           onClick={() => {
              setEditItem(null);
              setForm({ urunAdi: "", urunTipi: "Hammadde", kdvOrani: 20, lotTakibi: true, fiyat: "", tedarikci: "", stok: "" });
              setShowAdd(!showAdd);
           }}
        >
          {showAdd ? "İptal" : "+ Yeni"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSave} className="ky-mobile-card ky-mobile-mb14" style={{ border: '2px solid var(--blue)' }}>
          <div className="ky-mobile-section-title">{editItem ? "Ürün Düzenle" : "Yeni Ürün Kaydı"}</div>
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Ürün Adı" value={form.urunAdi} onChange={e => setForm({...form, urunAdi: e.target.value})} required />
          <select className="ky-mobile-input ky-mobile-mb10" value={form.urunTipi} onChange={e => setForm({...form, urunTipi: e.target.value})}>
            <option value="Hammadde">Hammadde</option>
            <option value="Yarı Mamul">Yarı Mamul</option>
            <option value="Mamul">Mamul</option>
          </select>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input type="number" className="ky-mobile-input" placeholder="KDV (%)" value={form.kdvOrani} onChange={e => setForm({...form, kdvOrani: e.target.value})} required />
            <input type="number" className="ky-mobile-input" placeholder="Son Fiyat" value={form.fiyat} onChange={e => setForm({...form, fiyat: e.target.value})} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
             <input type="number" className="ky-mobile-input" placeholder="Stok Miktarı" value={form.stok} onChange={e => setForm({...form, stok: e.target.value})} />
             <label style={{ display: 'flex', alignItems: 'center', width: '100%', padding: 10, background: '#f5f5f5', borderRadius: 8 }}>
               <input type="checkbox" checked={form.lotTakibi} onChange={e => setForm({...form, lotTakibi: e.target.checked})} style={{ marginRight: 10 }} />
               Lot Takibi
             </label>
          </div>
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Tedarikçi Firma" value={form.tedarikci} onChange={e => setForm({...form, tedarikci: e.target.value})} />
          
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
            placeholder="Ürün veya tedarikçi ara..."
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
            <option value="stok_desc">Stok ↓</option>
            <option value="stok_asc">Stok ↑</option>
         </select>
      </div>

      {!displayedItems.length && !loading && !error && <MobileEmpty text="Kayıt bulunamadı" />}

      {displayedItems.map((urun) => {
        const id = urun.id || urun.uuid || urun.urunId;
        const urunAdi = getField(urun, ["urunAdi", "ad", "name", "productName"], "Ürün Adı Yok");
        const urunTipi = getField(urun, ["urunTipi", "tip", "type", "category"], "-");
        const kdvOrani = getField(urun, ["kdv", "kdvOrani", "tax"], 20);
        const lotDurumu = getField(urun, ["lotTakibi", "hasLot", "isLotTracked"], false);
        const sonFiyat = Number(getField(urun, ["fiyat", "sonFiyat", "price", "lastPrice"], 0));
        const aktif = getField(urun, ["aktif", "isActive", "status"], true);
        const tedarikci = getField(urun, ["tedarikci", "supplier", "firma"], "-");
        const stok = Number(getField(urun, ["stok", "stokMiktari", "quantity", "stock"], 0));

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>
                  {!aktif && <span style={{ color: 'var(--red)', marginRight: 5 }}>[Pasif]</span>}
                  {urunAdi}
                </h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  <div>Tip: {urunTipi} | KDV: %{kdvOrani}</div>
                  <div>Tedarikçi: {tedarikci}</div>
                  <div style={{ marginTop: 4 }}>
                    {lotDurumu ? <span className="ky-mobile-pill blue">Lot Takipli</span> : <span className="ky-mobile-pill">Lotsuz</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="ky-mobile-small ky-mobile-muted">Son Fiyat</span>
                <div className="ky-mobile-money" style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>
                  ₺{sonFiyat.toLocaleString('tr-TR')}
                </div>
                <div style={{ marginTop: 10 }}>
                   <span className="ky-mobile-small ky-mobile-muted">Stok</span>
                   <div style={{ fontWeight: 'bold' }}>{stok}</div>
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #eee', marginTop: 10, paddingTop: 10, textAlign: 'right' }}>
               <button className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '5px 15px' }} onClick={() => openEdit(urun)}>Düzenle</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
