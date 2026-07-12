import MobileShell from "./MobileShell";

export default function MobileHome() {
  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <>
      <div className="ky-mobile-hero ky-mobile-mb14">
        <h2>KY ERP Yönetim</h2>
        <p>Mecit Hakan — Canlı Sistem</p>
      </div>
      
      <div className="ky-mobile-section-title">Ana Modüller</div>
      <div className="ky-mobile-list">
        
        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/yonetim")}>
          <div className="ky-mobile-icon">📌</div>
          <div>
            <h3>Yönetim Özeti</h3>
            <p>Güncel bakiye, çek, ödeme, imalat, fatura</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/muhasebe")}>
          <div className="ky-mobile-icon">💰</div>
          <div>
            <h3>Muhasebe</h3>
            <p>Cari, çek, ödeme, KDV, ürünler</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/ik")}>
          <div className="ky-mobile-icon">👥</div>
          <div>
            <h3>İnsan Kaynakları</h3>
            <p>Tarih aralıklı günlük + aylık ayrı</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/imalat")}>
          <div className="ky-mobile-icon">🏭</div>
          <div>
            <h3>İmalat</h3>
            <p>Havuz, günlük kayıt, rapor</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/boyahane")}>
          <div className="ky-mobile-icon">🧪</div>
          <div>
            <h3>Boyahane</h3>
            <p>Reçete, renk, lot, gramaj</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/desen")}>
          <div className="ky-mobile-icon">🎨</div>
          <div>
            <h3>Desen</h3>
            <p>Model, görsel, kanal, görselle ara</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

        <div className="ky-mobile-module-card" onClick={() => navigate("/mobile/admin")}>
          <div className="ky-mobile-icon">⚙️</div>
          <div>
            <h3>Admin</h3>
            <p>Kullanıcı, rol, yetki</p>
          </div>
          <div className="ky-mobile-arrow">›</div>
        </div>

      </div>
    </>
  );
}
