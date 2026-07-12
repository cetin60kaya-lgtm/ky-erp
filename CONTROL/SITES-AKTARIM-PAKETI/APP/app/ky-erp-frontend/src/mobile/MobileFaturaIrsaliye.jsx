import React, { useEffect, useState } from "react";
import { mobileApiGet, mobileApiPost, normalizeList, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileFaturaIrsaliye() {
  const [data, setData] = useState([]);
  const [yardimci, setYardimci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("irsaliye");

  async function loadData() {
    setLoading(true);
    setError("");

    const [resBelge, resYardimci] = await Promise.all([
      mobileApiGet("muhasebe/belge-islem"),
      mobileApiGet("muhasebe/fatura-yardimci"),
    ]);

    if (!resBelge.ok && !resYardimci.ok) {
      setError(resBelge.message || resYardimci.message || "Belgeler alınamadı");
      setData([]);
      setLoading(false);
      return;
    }

    setData(resBelge.ok ? normalizeList(resBelge.data) : []);
    setYardimci(resYardimci.ok ? normalizeList(resYardimci.data) : []);
    setLoading(false);
  }
  async function createBelge(tip) {
    const first = yardimci[0] || {};
    const recordId = first.id || first.uuid || first.documentId || first.faturaKesimId || "";
    const res = await mobileApiPost("muhasebe/fatura-kayit", { tip, recordId });
    if (!res.ok) {
      setError(res.message || "Veri alınamadı");
      return;
    }
    loadData();
  }


  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data.length) return <MobileLoading text="Yükleniyor..." />;
  if (error && !data.length) return <MobileError message={error} onRetry={loadData} />;

  const filteredData = data?.filter(d => {
     const tur = getField(d, ["tur", "belgeTuru", "type"], "").toLowerCase();
     if (activeTab === "irsaliye") return tur.includes("irsaliye");
     if (activeTab === "fatura") return tur.includes("fatura");
     return true;
  });

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">📄 Fatura & İrsaliye İşlemleri</h2>
      
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <button className={`ky-mobile-btn ${activeTab === 'irsaliye' ? 'primary' : 'secondary'}`} onClick={() => setActiveTab('irsaliye')}>
          İrsaliyeler
        </button>
        <button className={`ky-mobile-btn ${activeTab === 'fatura' ? 'primary' : 'secondary'}`} onClick={() => setActiveTab('fatura')}>
          Faturalar
        </button>
      </div>

      <div className="ky-mobile-section-title">Hızlı İşlemler</div>
      <div className="ky-mobile-grid2 ky-mobile-mb14">
        <div className="ky-mobile-module-card" onClick={() => createBelge("MUSTERI_IRSALIYE")}>
          <div className="ky-mobile-icon">📥</div>
          <div><h3>Müşteri İrsaliyesi</h3><p>Gelen mal</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => createBelge("SATIS_FATURASI")}>
          <div className="ky-mobile-icon">📤</div>
          <div><h3>Satış Faturası</h3><p>Giden mal fat.</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => createBelge("TEDARIKCI_FATURASI")}>
          <div className="ky-mobile-icon">🧾</div>
          <div><h3>Tedarikçi Fat.</h3><p>Gelen fatura</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => createBelge("BIZIM_IRSALIYE")}>
          <div className="ky-mobile-icon">🚚</div>
          <div><h3>Bizim İrsaliye</h3><p>Sevk</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => createBelge("FATURA_KESIM_YARDIMCISI")}>
          <div className="ky-mobile-icon">💡</div>
          <div><h3>Kesim Yard.</h3><p>Kolay kesim</p></div>
        </div>
        <div className="ky-mobile-module-card" onClick={() => createBelge("FATURA_SONRASI_TAKIP")}>
          <div className="ky-mobile-icon">🔍</div>
          <div><h3>Sonrası Takip</h3><p>Mail/Onay</p></div>
        </div>
      </div>

      <div className="ky-mobile-section-title">Son Belgeler</div>

      {yardimci.length > 0 && (
        <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
          <b>Fatura Kesim Yardımcısı</b>
          <div className="ky-mobile-small ky-mobile-muted">{yardimci.length} yardımcı kayıt bulundu.</div>
        </div>
      )}

      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10" style={{ backgroundColor: '#fffbe6', borderLeft: '4px solid var(--orange)' }}>
         <b>Not:</b> TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.
      </div>

      {!filteredData.length && !loading && !error && <MobileEmpty text="Belge bulunamadı" />}

      {filteredData.map((belge, idx) => {
        const id = belge.id || belge.uuid || idx;
        const firmaAdi = getField(belge, ["firmaAdi", "unvan", "isim"], "Firma Yok");
        const belgeNo = getField(belge, ["belgeNo", "faturaNo", "irsaliyeNo"], "-");
        const belgeTuru = getField(belge, ["tur", "belgeTuru", "type"], "Belge");
        const tutar = Number(getField(belge, ["tutar", "toplamTutar", "amount"], 0));
        const tarih = getField(belge, ["tarih", "date"], "");

        return (
          <div key={id} className="ky-mobile-card ky-mobile-mb10">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{firmaAdi}</h3>
                <div className="ky-mobile-muted ky-mobile-small">
                  <div>No: {belgeNo}</div>
                  <div>Tür: {belgeTuru} | Tarih: {tarih}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {tutar > 0 && (
                   <>
                     <span className="ky-mobile-small ky-mobile-muted">Tutar</span>
                     <div className="ky-mobile-money" style={{ fontSize: '1.2rem' }}>
                       ₺{tutar.toLocaleString('tr-TR')}
                     </div>
                   </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
