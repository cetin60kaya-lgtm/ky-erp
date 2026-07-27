import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileBoyahane() {
  const [data, setData] = useState(null);
  const [modelHavuzu, setModelHavuzu] = useState([]);
  const [kayitliRenkler, setKayitliRenkler] = useState([]);
  const [hammaddeLot, setHammaddeLot] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const [resOzet, resModelHavuz, resRenkler, resLot] = await Promise.all([
      mobileApiGet("boyahane/ozet"),
      mobileApiGet("boyahane/model-havuzu"),
      mobileApiGet("boyahane/kayitli-renkler"),
      mobileApiGet("boyahane/hammadde-lot"),
    ]);

    if (!resOzet.ok && !resModelHavuz.ok && !resRenkler.ok && !resLot.ok) {
      setError(resOzet.message || resModelHavuz.message || resRenkler.message || resLot.message || "Boyahane özeti alınamadı");
      setData(null);
      setLoading(false);
      return;
    }

    setData(resOzet.ok ? normalizeObject(resOzet.data) : {});
    setModelHavuzu(resModelHavuz.ok ? normalizeList(resModelHavuz.data) : []);
    setKayitliRenkler(resRenkler.ok ? normalizeList(resRenkler.data) : []);
    setHammaddeLot(resLot.ok ? normalizeList(resLot.data) : []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={loadData} />;
  if (!data || Object.keys(data).length === 0) return <MobileEmpty text="Boyahane kaydı bulunamadı" />;

  const sonIslemler = normalizeList(data?.sonIslemler || data?.islemler || data?.recent || []);

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">🎨 Boyahane Merkezi</h2>
      
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <div className="ky-mobile-card ky-mobile-p14" style={{ backgroundColor: '#fff3e0' }}>
          <span className="ky-mobile-small ky-mobile-muted">Bekleyen Model</span>
          <div className="ky-mobile-money" style={{ color: 'var(--orange)' }}>
            {Number(getField(data, ["bekleyenModel", "modelCount"], modelHavuzu.length))}
          </div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14" style={{ backgroundColor: '#e3f2fd' }}>
          <span className="ky-mobile-small ky-mobile-muted">Kayıtlı Renk</span>
          <div className="ky-mobile-money" style={{ color: 'var(--blue)' }}>
            {Number(getField(data, ["kayitliRenk", "colorCount"], kayitliRenkler.length))}
          </div>
        </div>
      </div>

      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-between"><span>Hammadde Lot</span><b>{hammaddeLot.length}</b></div>
      </div>

      <div className="ky-mobile-section-title">Hızlı İşlemler</div>
      <div className="ky-mobile-grid2 ky-mobile-mb14">
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/boyahane/havuz')}>Model Havuzu</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/boyahane/renkler')}>Kayıtlı Renkler</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/boyahane/hammadde')}>Hammadde & Lot</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/boyahane/gider')}>Boya Gideri</button>
      </div>

      <div className="ky-mobile-section-title">Aylık Üretim & Tüketim</div>
      <div className="ky-mobile-card ky-mobile-p14 ky-mobile-mb10">
        <div className="ky-mobile-kv">
          <span>Boya Tüketimi</span><b>{getField(data, ["boyaTuketimi", "dyeUsage"], 0)} kg</b>
          <span>Kimyasal Tüketimi</span><b>{getField(data, ["kimyasalTuketimi", "chemUsage"], 0)} kg</b>
          <span>İşlenen Kumaş</span><b style={{ color: 'var(--green)' }}>{getField(data, ["islenenKumas", "fabricAmount"], 0)} kg</b>
        </div>
      </div>

      <div className="ky-mobile-section-title">Son İşlemler</div>
      <div className="ky-mobile-card">
        {sonIslemler.length === 0 ? (
           <div className="ky-mobile-activity">
             <span className="ky-mobile-small ky-mobile-muted">Kayıt bulunamadı.</span>
           </div>
        ) : (
          sonIslemler.slice(0, 5).map((islem, i) => (
            <div className="ky-mobile-activity" key={islem.id || islem.uuid || i}>
              <div className="ky-mobile-dot" style={{ backgroundColor: 'var(--blue)' }}></div>
              <div>
                <b>{getField(islem, ["islemAdi", "title", "name", "islem"], "İşlem")}</b>
                <div className="ky-mobile-small ky-mobile-muted">
                  {getField(islem, ["tarih", "date"], "")} {getField(islem, ["aciklama", "desc"], "") && ` - ${getField(islem, ["aciklama", "desc"])}`}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
