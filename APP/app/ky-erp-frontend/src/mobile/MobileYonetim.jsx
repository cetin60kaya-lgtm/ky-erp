import React, { useEffect, useState } from "react";
import { mobileApiGet, normalizeList, normalizeObject, getField } from "./mobileApi";
import { MobileLoading, MobileError, MobileEmpty } from "./MobileComponents";

export default function MobileYonetim() {
  const [data, setData] = useState(null);
  const [yaklasanOdemeler, setYaklasanOdemeler] = useState([]);
  const [imalatRapor, setImalatRapor] = useState([]);
  const [boyahaneOzet, setBoyahaneOzet] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const [resOzet, resYaklasan, resImalat, resBoyahane] = await Promise.all([
      mobileApiGet("muhasebe/yonetim-ozeti"),
      mobileApiGet("muhasebe/yaklasan-odemeler"),
      mobileApiGet("imalat/raporlar"),
      mobileApiGet("boyahane/ozet"),
    ]);

    if (!resOzet.ok && !resYaklasan.ok && !resImalat.ok && !resBoyahane.ok) {
      setError(resOzet.message || resYaklasan.message || resImalat.message || resBoyahane.message || "Veri alınamadı");
      setData(null);
      setLoading(false);
      return;
    }

    setData(resOzet.ok ? normalizeObject(resOzet.data) : {});
    setYaklasanOdemeler(resYaklasan.ok ? normalizeList(resYaklasan.data) : []);
    setImalatRapor(resImalat.ok ? normalizeList(resImalat.data) : []);
    setBoyahaneOzet(resBoyahane.ok ? normalizeObject(resBoyahane.data) : {});
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <MobileLoading text="Yükleniyor..." />;
  if (error) return <MobileError message={error} onRetry={loadData} />;
  if (!data || Object.keys(data).length === 0) return <MobileEmpty text="Kayıt bulunamadı" />;

  const sonHareketler = normalizeList(data?.sonHareketler || data?.hareketler || []);
  const yaklasanOdemeToplam = yaklasanOdemeler.reduce((sum, item) => sum + Number(getField(item, ["tutar", "amount", "odenecek"], 0)), 0);

  return (
    <div className="ky-mobile-page">
      <h2 className="ky-mobile-h2">📊 Yönetim Özeti</h2>
      
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">Güncel Cari Bakiye</span>
          <div className="ky-mobile-money">₺{getField(data, ["guncelCariBakiye", "buAySatis"], 0).toLocaleString('tr-TR')}</div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">Yaklaşan Ödeme</span>
          <div className="ky-mobile-money">₺{Number(getField(data, ["yaklasanOdeme", "buAyAlisGider"], yaklasanOdemeToplam)).toLocaleString('tr-TR')}</div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">Vadesi Gelen Çek</span>
          <div className="ky-mobile-money">₺{getField(data, ["vadesiGelenCek", "netKdv"], 0).toLocaleString('tr-TR')}</div>
        </div>
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">Bugün İmalat</span>
          <div className="ky-mobile-money">{Number(getField(data, ["bugunImalat", "onayBekleyenBelge"], imalatRapor.length))}</div>
          <span className="ky-mobile-pill orange">Adet</span>
        </div>
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">Fatura Bekleyen</span>
          <div className="ky-mobile-money">{getField(data, ["faturaBekleyen"], 0)}</div>
          <span className="ky-mobile-pill blue">İşlem</span>
        </div>
        <div className="ky-mobile-card ky-mobile-p14">
          <span className="ky-mobile-small ky-mobile-muted">KDV Durumu</span>
          <div className="ky-mobile-money">₺{Number(getField(data, ["kdvDurumu", "kdvBakiye"], getField(boyahaneOzet, ["kdvDurumu"], 0))).toLocaleString('tr-TR')}</div>
        </div>
      </div>

      <div className="ky-mobile-section-title">Hızlı İşlemler</div>
      <div className="ky-mobile-grid2 ky-mobile-mb10">
        <button className="ky-mobile-btn" onClick={() => navigate('/mobile/muhasebe/odeme')}>Ödeme Ekle</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/muhasebe/cari')}>Cari Hareket</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/muhasebe/cek')}>Çekler</button>
        <button className="ky-mobile-btn secondary" onClick={() => navigate('/mobile/muhasebe/fatura-irsaliye')}>Fatura / İrsaliye</button>
      </div>

      <div className="ky-mobile-section-title">Son Hareketler</div>
      <div className="ky-mobile-card">
        {sonHareketler.length === 0 ? (
           <div className="ky-mobile-activity">
             <span className="ky-mobile-small ky-mobile-muted">Kayıt bulunamadı.</span>
           </div>
        ) : (
          sonHareketler.slice(0, 5).map((h, i) => (
            <div className="ky-mobile-activity" key={h.id || h.uuid || i}>
              <div className="ky-mobile-dot"></div>
              <div>
                <b>{getField(h, ["firmaAdi", "isim", "name", "unvan"], "İşlem")}</b>
                <div className="ky-mobile-small ky-mobile-muted">{getField(h, ["tarih", "date"], "-")} - ₺{Number(getField(h, ["tutar", "amount"], 0)).toLocaleString('tr-TR')}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
