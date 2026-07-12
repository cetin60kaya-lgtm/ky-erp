import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileIKGunlukGiris() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAddPerson, setShowAddPerson] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("ik/daily-employees");
    
    if (!res.ok) {
      setError(res.message || "Personel listesi alınamadı");
      setEmployees([]);
      setLoading(false);
      return;
    }

    setEmployees(normalizeList(res.data));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function getDaysArray(start, end) {
    const dates = [];
    let curr = new Date(start);
    const last = new Date(end);
    while (curr <= last) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  const days = startDate && endDate && new Date(startDate) <= new Date(endDate) 
     ? getDaysArray(startDate, endDate) 
    : [];

  function addEmployee(emp) {
    if (selectedEmployees.find(e => e.personelId === emp.id)) return;
    
    const newEmp = {
      personelId: emp.id || emp.uuid,
      isim: getField(emp, ["isim", "ad", "fullName", "name"], "İsimsiz"),
      gunler: days.map(d => ({ tarih: d, gunduz: false, gece: false }))
    };
    
    setSelectedEmployees([...selectedEmployees, newEmp]);
    setShowAddPerson(false);
  }

  function removeEmployee(personelId) {
    setSelectedEmployees(selectedEmployees.filter(e => e.personelId !== personelId));
  }

  function toggleDay(personelId, tarih, field) {
    setSelectedEmployees(prev => prev?.map(emp => {
      if (emp.personelId !== personelId) return emp;
      return {
        ...emp,
        gunler: emp.gunler.map(g => {
          if (g.tarih !== tarih) return g;
          return { ...g, [field]: !g[field] };
        })
      };
    }));
  }

  useEffect(() => {
    // Tarih araligi degisince mevcut personellerin gunlerini guncelle
    setSelectedEmployees(prev => prev?.map(emp => {
      const newGunler = days.map(d => {
        const existing = emp.gunler.find(eg => eg.tarih === d);
        return existing || { tarih: d, gunduz: false, gece: false };
      });
      return { ...emp, gunler: newGunler };
    }));
  }, [startDate, endDate]);

  async function handleSave() {
    if (!selectedEmployees.length) {
      alert("En az bir personel eklemelisiniz.");
      return;
    }

    const payload = {
      baslangicTarih: startDate,
      bitisTarih: endDate,
      kayitlar: selectedEmployees.map(e => ({
        personelId: e.personelId,
        gunler: e.gunler
      }))
    };

    setLoading(true);
    const res = await mobileApiPost("ik/daily-attendance/save-range", payload);
    
    if (!res.ok) {
      setError(res.message || "Kaydedilemedi");
      setLoading(false);
      return;
    }

    alert("Günlük girişler başarıyla kaydedildi!");
    setSelectedEmployees([]);
    setLoading(false);
  }

  if (loading && !employees.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !employees.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">🗓️ Günlük Giriş</h2>
      
      <div className="ky-mobile-card ky-mobile-mb10">
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="ky-mobile-small ky-mobile-muted">Başlangıç</label>
            <input type="date" className="ky-mobile-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="ky-mobile-small ky-mobile-muted">Bitiş</label>
            <input type="date" className="ky-mobile-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        
        <button className="ky-mobile-btn secondary" onClick={() => setShowAddPerson(true)}>
          + Personel Ekle
        </button>
      </div>

      {showAddPerson && (
        <div className="ky-mobile-card ky-mobile-mb10" style={{ border: '2px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Personel Seç</h3>
            <button className="ky-mobile-btn" style={{ padding: '2px 10px', width: 'auto' }} onClick={() => setShowAddPerson(false)}>Kapat</button>
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {employees.length === 0 ? <div className="ky-mobile-muted">Sistemde personel bulunamadı.</div> : null}
            {employees.map(emp => (
              <div 
                key={emp.id || emp.uuid} 
                style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}
                onClick={() => addEmployee(emp)}
              >
                <span>{getField(emp, ["isim", "ad", "fullName", "name"], "İsimsiz")}</span>
                <span className="ky-mobile-muted">+ Ekle</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="ky-mobile-card ky-mobile-mb10" style={{ color: 'var(--red)' }}>{error}</div>}

      {!selectedEmployees.length ? (
        <MobileEmpty text="Listeye personel ekleyin" />
      ) : (
        <>
          <div className="ky-mobile-section-title">Seçili Personeller ({selectedEmployees.length})</div>
          {selectedEmployees.map((emp) => (
            <div key={emp.personelId} className="ky-mobile-card ky-mobile-mb10">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{emp.isim}</h3>
                <button className="ky-mobile-btn" style={{ width: 'auto', padding: '2px 10px', background: '#fee', color: 'var(--red)' }} onClick={() => removeEmployee(emp.personelId)}>
                  Sil
                </button>
              </div>
              
              <div style={{ overflowX: 'auto', display: 'flex', gap: 10, paddingBottom: 5 }}>
                {emp.gunler.map(g => (
                  <div key={g.tarih} style={{ minWidth: '80px', border: '1px solid #ddd', borderRadius: 8, padding: '5px', textAlign: 'center' }}>
                    <div className="ky-mobile-small ky-mobile-muted" style={{ marginBottom: 5 }}>{g.tarih.slice(5)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <button 
                        style={{ padding: '8px', border: 'none', borderRadius: 4, background: g.gunduz ? 'var(--green)' : '#eee', color: g.gunduz ? 'white' : 'black', fontWeight: 'bold' }}
                        onClick={() => toggleDay(emp.personelId, g.tarih, 'gunduz')}
                      >
                        G
                      </button>
                      <button 
                        style={{ padding: '8px', border: 'none', borderRadius: 4, background: g.gece ? '#1a237e' : '#eee', color: g.gece ? 'white' : 'black', fontWeight: 'bold' }}
                        onClick={() => toggleDay(emp.personelId, g.tarih, 'gece')}
                      >
                        N
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button className="ky-mobile-btn primary" style={{ marginTop: 10, padding: 15, fontSize: '1.1rem' }} onClick={handleSave}>
            Günlük Girişleri Kaydet
          </button>
        </>
      )}
    </div>
  );
}
