import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, mobileApiPut, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState("");

  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "USER"
  });

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("admin/users");
    
    if (!res.ok) {
      setError(res.message || "Kullanıcı listesi alınamadı");
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
    
    const res = editId
       ? await mobileApiPut(`admin/users/${editId}`, form)
      : await mobileApiPost("admin/users", form);
    
    if (!res.ok) {
      setError(res.message || "Kullanıcı eklenemedi");
      setLoading(false);
      return;
    }

    setShowAdd(false);
    setEditId("");
    setForm({ username: "", password: "", role: "USER" });
    loadData();
  }

  function startEdit(user) {
    const id = user?.id || user?.uuid || user?.userId;
    setEditId(String(id || ""));
    setForm({
      username: getField(user, ["username", "kullaniciAdi", "email"], ""),
      password: "",
      role: getField(user, ["role", "yetki"], "USER"),
    });
    setShowAdd(true);
  }

  async function handleResetPassword(id) {
    if (!confirm("Şifreyi sıfırlamak (123456) istediğinize emin misiniz")) return;
    setLoading(true);
    const res = await mobileApiPost(`admin/users/${id}/reset-password`, { newPassword: "123456" });
    if (!res.ok) {
      alert(res.message || "Sıfırlama başarısız");
    } else {
      alert("Şifre 123456 olarak sıfırlandı.");
    }
    setLoading(false);
  }

  if (loading && !items.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !items.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="ky-mobile-h2" style={{ margin: 0 }}>⚙️ Sistem Yönetimi</h2>
        <button className="ky-mobile-btn primary" style={{ width: 'auto', padding: '5px 15px' }} onClick={() => setShowAdd(!showAdd)}>
          + Yeni Kullanıcı
        </button>
      </div>

      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <div className="ky-mobile-card ky-mobile-p14" style={{ backgroundColor: '#e3f2fd' }}>
           <span className="ky-mobile-small ky-mobile-muted">Kayıtlı Kullanıcı</span>
           <div className="ky-mobile-money" style={{ color: 'var(--blue)' }}>{items.length}</div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14" style={{ backgroundColor: '#fff3e0' }}>
           <span className="ky-mobile-small ky-mobile-muted">Admin Sayısı</span>
           <div className="ky-mobile-money" style={{ color: 'var(--orange)' }}>
             {items.filter(u => getField(u, ["role", "yetki"], "").includes("ADMIN")).length}
           </div>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleSave} className="ky-mobile-card ky-mobile-mb14">
          <div className="ky-mobile-section-title">Yeni Kullanıcı Kaydı</div>
          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Kullanıcı Adı" 
            value={form.username} 
            onChange={e => setForm({...form, username: e.target.value})} 
            required 
          />
          <input 
            className="ky-mobile-input ky-mobile-mb10" 
            placeholder="Şifre" 
            type="password"
            value={form.password} 
            onChange={e => setForm({...form, password: e.target.value})} 
            required 
          />
          <select 
            className="ky-mobile-input ky-mobile-mb10" 
            value={form.role} 
            onChange={e => setForm({...form, role: e.target.value})}
          >
            <option value="USER">Standart Kullanıcı</option>
            <option value="ADMIN">Sistem Yöneticisi</option>
          </select>
          
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ky-mobile-btn" onClick={() => { setShowAdd(false); setEditId(""); }}>İptal</button>
            <button type="submit" className="ky-mobile-btn primary">{editId ? "Güncelle" : "Kaydet"}</button>
          </div>
        </form>
      )}

      {error && <div className="ky-mobile-card ky-mobile-mb10" style={{ color: 'var(--red)' }}>{error}</div>}

      <div className="ky-mobile-section-title">Sistem Kullanıcıları</div>
      
      {!items.length && !loading && !error && <MobileEmpty text="Kullanıcı bulunamadı" />}

      {items.map((user) => {
        const id = user?.id || user?.uuid || user?.userId;
        const username = getField(user, ["username", "kullaniciAdi", "email"], "Bilinmiyor");
        const role = getField(user, ["role", "yetki", "roles"], "USER");
        const isAdmin = role.includes("ADMIN");

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{username}</h3>
                <span className={`ky-mobile-pill ${isAdmin ? 'orange' : 'blue'}`}>
                  {isAdmin ? 'YÖNETİCİ' : 'KULLANICI'}
                </span>
              </div>
              <button 
                 className="ky-mobile-btn secondary" 
                 style={{ width: 'auto', padding: '5px 10px', fontSize: '0.8rem' }} 
                 onClick={() => handleResetPassword(id)}
              >
                Şifre Sıfırla
              </button>
              <button
                 className="ky-mobile-btn"
                 style={{ width: 'auto', padding: '5px 10px', fontSize: '0.8rem' }}
                 onClick={() => startEdit(user)}
              >
                Düzenle
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
