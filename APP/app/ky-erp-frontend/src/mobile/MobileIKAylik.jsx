import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileIKAylik() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollData, setPayrollData] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await mobileApiGet("ik/monthly-employees");
    
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

  async function calculatePayroll(emp) {
    setSelectedEmp(emp);
    setPayrollLoading(true);
    setPayrollData(null);

    const empId = emp.id || emp.uuid || emp.personelId;
    const [resPayroll, resCalc] = await Promise.all([
      mobileApiGet(`ik/payrollpersonelId=${empId}`),
      mobileApiPost("ik/payroll/calculate", { personelId: empId, month: new Date().getMonth() + 1 }),
    ]);

    if (resCalc.ok) {
      setPayrollData(normalizeObject(resCalc.data));
    } else if (resPayroll.ok) {
      setPayrollData(normalizeObject(resPayroll.data));
    } else {
      setError(resCalc.message || resPayroll.message || "Veri alınamadı");
      setPayrollData(null);
    }
    setPayrollLoading(false);
  }

  async function savePayroll() {
    if (!selectedEmp || !payrollData) return;
    setLoading(true);
    const empId = selectedEmp.id || selectedEmp.uuid || selectedEmp.personelId;
    
    const res = await mobileApiPost("ik/payroll/save", { 
       personelId: empId, 
       data: payrollData 
    });
    
    if (!res.ok) {
       alert(res.message || "Kaydedilemedi");
    } else {
       alert("Bordro başarıyla kaydedildi!");
       setSelectedEmp(null);
    }
    setLoading(false);
  }

  if (loading && !employees.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !employees.length) return <MobileError message={error} onRetry={loadData} />;

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">💼 Aylık Personel / Mesai-Kesinti</h2>
      
      {selectedEmp ? (
        <div className="ky-mobile-card ky-mobile-mb10">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h3 style={{ margin: 0 }}>{getField(selectedEmp, ["isim", "ad", "fullName", "name"], "İsimsiz")}</h3>
            <button className="ky-mobile-btn" style={{ padding: '2px 10px', width: 'auto' }} onClick={() => setSelectedEmp(null)}>Geri</button>
          </div>
          
          {payrollLoading ? (
             <div style={{ textAlign: 'center', padding: 20 }}>Hesaplanıyor...</div>
          ) : payrollData ? (
             <div>
                <div className="ky-mobile-kv" style={{ marginBottom: 15 }}>
                  <span>Temel Maaş</span><b>₺{Number(payrollData.maas || 0).toLocaleString('tr-TR')}</b>
                  <span>Toplam Mesai</span><b style={{ color: 'var(--green)' }}>+₺{Number(payrollData.mesai || 0).toLocaleString('tr-TR')}</b>
                  <span>Kullanılan Avans</span><b style={{ color: 'var(--orange)' }}>-₺{Number(payrollData.avans || 0).toLocaleString('tr-TR')}</b>
                  <span>Diğer Kesinti</span><b style={{ color: 'var(--red)' }}>-₺{Number(payrollData.kesinti || 0).toLocaleString('tr-TR')}</b>
                  <div style={{ gridColumn: 'span 2', height: 1, backgroundColor: '#eee', margin: '5px 0' }}></div>
                  <span>Net Ödenecek</span><b style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>₺{Number(payrollData.net || 0).toLocaleString('tr-TR')}</b>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="ky-mobile-btn secondary" onClick={() => calculatePayroll(selectedEmp)}>Hesaplamayı Yenile</button>
                  <button className="ky-mobile-btn primary" onClick={savePayroll}>Bordroyu Kaydet</button>
                </div>
             </div>
           ) : (
             <div className="ky-mobile-muted">Kayıt bulunamadı</div>
          )}
        </div>
      ) : (
        <>
          <div className="ky-mobile-section-title">Aylık Personeller ({employees.length})</div>
          
          {!employees.length && !loading && !error && <MobileEmpty text="Personel bulunamadı" />}
          
          {employees.map(emp => {
            const id = emp.id || emp.uuid || emp.personelId;
            const isim = getField(emp, ["isim", "ad", "fullName", "name"], "İsimsiz");
            const departman = getField(emp, ["departman", "department"], "-");
            const unvan = getField(emp, ["unvan", "title"], "");

            return (
              <div key={id} className="ky-mobile-card ky-mobile-mb10">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{isim}</h3>
                    <div className="ky-mobile-muted ky-mobile-small">{departman} {unvan && `| ${unvan}`}</div>
                  </div>
                  <button className="ky-mobile-btn secondary" style={{ width: 'auto', padding: '8px 15px' }} onClick={() => calculatePayroll(emp)}>
                    Hesapla
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
