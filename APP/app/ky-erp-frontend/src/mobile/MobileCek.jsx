import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, mobileApiPut, normalizeList, normalizeObject, getField, resolveAssetUrl } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileCek() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("vade_asc");
  const [filterTip, setFilterTip] = useState(""); // Alınan Çek, Verilen Çek

  const [form, setForm] = useState({
    firmaAdi: "",
    cekNo: "",
    tip: "Alınan Çek",
    banka: "",
    sube: "",
    vadeTarihi: "",
    tutar: ""
  });

  async function loadData() {
    setLoading(true);
    setError("");

    // Once muhasebe/cekler, yoksa muhasebe/yonetim-ozeti
    const res = await mobileApiGet("muhasebe/cekler");
    
    if (res.ok && res.status !== 404) {
       setItems(normalizeList(res.data));
    } else {
       const resYonetim = await mobileApiGet("muhasebe/yonetim-ozeti");
       if (!resYonetim.ok) {
          setError(resYonetim.message || "Veri alınamadı");
          setItems([]);
       } else {
          const summary = normalizeObject(resYonetim.data);
          const cekler = normalizeList(summary.cekler || summary.yaklasanCekler || summary.verilenCekler || summary.alinanCekler);
          setItems(cekler);
       }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    
    if (editItem) {
      const res = await mobileApiPut(`muhasebe/cekler/${editItem}`, { ...form, tutar: Number(form.tutar) });
      if (!res.ok) {
        setError(res.message || "Çek güncellenemedi");
        setLoading(false);
        return;
      }
    } else {
      const res = await mobileApiPost("muhasebe/cekler", { ...form, tutar: Number(form.tutar) });
      if (!res.ok) {
        setError(res.message || "Çek kaydedilemedi");
        setLoading(false);
        return;
      }
    }

    setShowAdd(false);
    setEditItem(null);
    setForm({ firmaAdi: "", cekNo: "", tip: "Alınan Çek", banka: "", sube: "", vadeTarihi: "", tutar: "" });
    loadData();
  }

  function openEdit(cek) {
    setForm({
      firmaAdi: getField(cek, ["firmaAdi", "unvan", "isim"], ""),
      cekNo: getField(cek, ["cekNo", "belgeNo"], ""),
      tip: getField(cek, ["tip", "type", "islemTipi"], "Alınan Çek"),
      banka: getField(cek, ["banka", "bankName"], ""),
      sube: getField(cek, ["sube", "branch"], ""),
      vadeTarihi: getField(cek, ["vade", "vadeTarihi", "date"], ""),
      tutar: getField(cek, ["tutar", "amount"], "")
    });
    setEditItem(cek.id || cek.uuid || cek.cekId);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleOdendi(id) {
    if (!confirm("Çek ödendi olarak işaretlensin mi")) return;
    setLoading(true);
    const res = await mobileApiPost(`muhasebe/cekler/${id}/odendi`, {});
    if (!res.ok) {
      alert(res.message || "İşlem başarısız");
    }
    loadData();
  }

  function getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const vade = new Date(dateStr);
    const bugun = new Date();
    const diff = vade.getTime() - bugun.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }

  function getBadgeColor(days, isPaid) {
    if (isPaid) return "var(--green)";
    if (days === null) return "var(--muted)";
    if (days < 0) return "var(--red)";
    if (days <= 7) return "var(--orange)";
    if (days <= 30) return "#d4b106"; // sariya yakin
    return "var(--blue)";
  }

  // Filter and sort
  let displayedItems = items.filter(f => {
    const tip = getField(f, ["tip", "type", "islemTipi"], "Alınan Çek");
    if (filterTip && tip !== filterTip) return false;

    if (!search) return true;
    const name = getField(f, ["firmaAdi", "unvan", "isim"], "").toLowerCase();
    const no = getField(f, ["cekNo", "belgeNo"], "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || no.includes(q);
  });

  displayedItems.sort((a, b) => {
    const vadeA = new Date(getField(a, ["vade", "vadeTarihi", "date"], "2099-01-01"));
    const vadeB = new Date(getField(b, ["vade", "vadeTarihi", "date"], "2099-01-01"));
    const tutarA = Number(getField(a, ["tutar", "amount"], 0));
    const tutarB = Number(getField(b, ["tutar", "amount"], 0));

    if (sortBy === "vade_asc") return vadeA - vadeB;
    if (sortBy === "vade_desc") return vadeB - vadeA;
    if (sortBy === "tutar_desc") return tutarB - tutarA;
    if (sortBy === "tutar_asc") return tutarA - tutarB;
    return 0;
  });

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ky-mobile-h2" style={{ margin: 0 }}>📝 Çek / Senet</h2>
        <button 
          className="ky-mobile-btn primary" 
          style={{ width: 'auto', padding: '5px 15px' }} 
          onClick={() => {
             setEditItem(null);
             setForm({ firmaAdi: "", cekNo: "", tip: "Alınan Çek", banka: "", sube: "", vadeTarihi: "", tutar: "" });
             setShowAdd(!showAdd);
          }}
        >
          {showAdd ? "İptal" : "+ Yeni"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSave} className="ky-mobile-card ky-mobile-mb14" style={{ border: '2px solid var(--blue)' }}>
          <div className="ky-mobile-section-title">{editItem ? "Çek Düzenle" : "Yeni Çek Kaydı"}</div>
          <select 
            className="ky-mobile-input ky-mobile-mb10" 
            value={form.tip} 
            onChange={e => setForm({...form, tip: e.target.value})}
          >
            <option value="Alınan Çek">Alınan Çek</option>
            <option value="Verilen Çek">Verilen Çek</option>
          </select>
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Firma Adı" value={form.firmaAdi} onChange={e => setForm({...form, firmaAdi: e.target.value})} required />
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Çek No" value={form.cekNo} onChange={e => setForm({...form, cekNo: e.target.value})} required />
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Banka" value={form.banka} onChange={e => setForm({...form, banka: e.target.value})} />
          <input className="ky-mobile-input ky-mobile-mb10" placeholder="Şube" value={form.sube} onChange={e => setForm({...form, sube: e.target.value})} />
          <input className="ky-mobile-input ky-mobile-mb10" type="date" value={form.vadeTarihi} onChange={e => setForm({...form, vadeTarihi: e.target.value})} required />
          <input className="ky-mobile-input ky-mobile-mb10" type="number" placeholder="Tutar (₺)" value={form.tutar} onChange={e => setForm({...form, tutar: e.target.value})} required />
          
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ky-mobile-btn" onClick={() => { setShowAdd(false); setEditItem(null); }}>İptal</button>
            <button type="submit" className="ky-mobile-btn primary">{editItem ? "Güncelle" : "Kaydet"}</button>
          </div>
        </form>
      )}

      {error && <div className="ky-mobile-card ky-mobile-mb10" style={{ color: 'var(--red)' }}>{error}</div>}

      <div className="ky-mobile-card ky-mobile-mb10" style={{ padding: '10px' }}>
         <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
           <input 
              className="ky-mobile-input" 
              style={{ flex: 2, marginBottom: 0 }}
              placeholder="Firma veya Çek No ara..."
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
         <div style={{ display: 'flex', gap: 10 }}>
           <button 
             className={`ky-mobile-btn ${filterTip === "" ? "primary" : "secondary"}`} 
             style={{ flex: 1, padding: '5px' }}
             onClick={() => setFilterTip("")}
           >
             Tümü
           </button>
           <button 
             className={`ky-mobile-btn ${filterTip === "Alınan Çek" ? "primary" : "secondary"}`} 
             style={{ flex: 1, padding: '5px' }}
             onClick={() => setFilterTip("Alınan Çek")}
           >
             Alınan
           </button>
           <button 
             className={`ky-mobile-btn ${filterTip === "Verilen Çek" ? "primary" : "secondary"}`} 
             style={{ flex: 1, padding: '5px' }}
             onClick={() => setFilterTip("Verilen Çek")}
           >
             Verilen
           </button>
         </div>
      </div>

      {!displayedItems.length && !loading && !error && <MobileEmpty text="Çek kaydı bulunamadı" />}

      {displayedItems.map((cek) => {
        const id = cek.id || cek.uuid || cek.cekId;
        const firmaAdi = getField(cek, ["firmaAdi", "unvan", "isim"], "Firma Yok");
        const cekNo = getField(cek, ["cekNo", "belgeNo"], "-");
        const tutar = Number(getField(cek, ["tutar", "amount"], 0));
        const vade = getField(cek, ["vade", "vadeTarihi", "date"], "");
        const banka = getField(cek, ["banka", "bankName"], "-");
        const durum = getField(cek, ["durum", "status"], "Bekliyor");
        const onGorsel = resolveAssetUrl(getField(cek, ["onGorsel", "frontImage", "frontImageUrl"], ""));
        const arkaGorsel = resolveAssetUrl(getField(cek, ["arkaGorsel", "backImage", "backImageUrl"], ""));
        const isPaid = durum.toLowerCase() === "ödendi" || durum.toLowerCase() === "tahsil edildi";
        
        const daysLeft = getDaysLeft(vade);
        const color = getBadgeColor(daysLeft, isPaid);

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10" style={{ borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{firmaAdi}</h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  <div>Vade: <b>{vade}</b> {daysLeft !== null && !isPaid && `(${daysLeft} gün)`}</div>
                  <div>Çek No: {cekNo} | {banka}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="ky-mobile-small ky-mobile-muted">Tutar</span>
                <div className="ky-mobile-money" style={{ color: color, fontSize: '1.2rem' }}>
                  ₺{tutar.toLocaleString('tr-TR')}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: 4, fontWeight: 'bold', color: color }}>
                  {durum.toUpperCase()}
                </div>
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #eee', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
               <button className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '5px 15px' }} onClick={() => openEdit(cek)}>Düzenle</button>
               {!isPaid && (
                 <button className="ky-mobile-btn primary" style={{ width: 'auto', padding: '5px 15px', background: 'var(--green)', border: 'none' }} onClick={() => handleOdendi(id)}>Ödendi</button>
               )}
            </div>
            {(onGorsel || arkaGorsel) && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                {onGorsel && <a className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '4px 10px' }} href={onGorsel} target="_blank" rel="noreferrer">Ön görsel</a>}
                {arkaGorsel && <a className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '4px 10px' }} href={arkaGorsel} target="_blank" rel="noreferrer">Arka görsel</a>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
