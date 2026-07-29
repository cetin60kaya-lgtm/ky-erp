import { ClipboardList, Factory, Gauge, Settings, Zap } from "lucide-react";
import ImalatKontrolRapor from "../imalat/ImalatKontrolRapor";
import ProductionReconciliationPage from "../imalat/ProductionReconciliationPage";
import ProductionSettingsPage from "../imalat/ProductionSettingsPage";
import ProductionWorkPoolPage from "../imalat/ProductionWorkPoolPage";
import CanonicalSmartProductionEntry from "../imalat/smart/CanonicalSmartProductionEntry";
import "../imalat/productionCenter.css";

function openProductionSettings() {
  window.history.pushState({}, "", "/uretim/uretim-ayarlari");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function PageIntro({ icon: Icon, title, description, badge }) {
  return (
    <section className="iw-card production-page-intro">
      <div>
        <h1><Icon size={21} /> {title}</h1>
        <p>{description}</p>
      </div>
      <span className="production-page-intro-badge"><Gauge size={15} /> {badge}</span>
    </section>
  );
}

export default function UretimPage({ activeMainCompany, activeTab }) {
  if (["uretim-denge", "imalat-denetim"].includes(activeTab)) {
    return <ProductionReconciliationPage activeMainCompany={activeMainCompany} />;
  }

  if (["uretim-raporlari", "imalat-kontrol-rapor", "uretim-raporu"].includes(activeTab)) {
    return <ImalatKontrolRapor activeMainCompany={activeMainCompany} initialView="report" />;
  }

  if (activeTab === "uretim-ayarlari") {
    return <ProductionSettingsPage activeMainCompany={activeMainCompany} />;
  }

  if (["uretim-is-havuzu", "uretim-girisi"].includes(activeTab)) {
    return (
      <div className="imalat-entry-page">
        <PageIntro
          icon={Factory}
          title="Üretim İş Havuzu"
          description="İşNet irsaliyesine bağlanan tek merkez modeli ve baskı operasyonunu seçin; brüt üretim, baskı sakatı, kumaş sakatı ve net sağlam adedi kaydedin."
          badge="Tek kaynaklı kontrollü giriş"
        />
        <ProductionWorkPoolPage activeMainCompany={activeMainCompany} />
      </div>
    );
  }

  return (
    <div className="imalat-entry-page">
      <PageIntro
        icon={Zap}
        title="Akıllı Hızlı Üretim Girişi"
        description="Fişi serbest sırayla yazın. Sistem yalnız Desen merkezindeki tek model kaydını, baskı bölgesini, makineyi, vardiyayı ve makinacıyı kullanır."
        badge="Varsayılan hızlı ekran"
      />
      <CanonicalSmartProductionEntry
        activeMainCompany={activeMainCompany}
        onConfigureMachines={openProductionSettings}
      />
      <section className="iw-card production-page-intro">
        <div><h1><ClipboardList size={20} /> Sakat veya irsaliye kontrolü var mı?</h1><p>Baskı-kumaş sakatı, çoklu baskı bölgesi ve irsaliye farkı için Üretim İş Havuzu sekmesini kullanın; sonuç Üretim Dengesi’nde otomatik görünür.</p></div>
        <button className="iw-btn" type="button" onClick={openProductionSettings}><Settings size={16} /> Makine Ayarları</button>
      </section>
    </div>
  );
}
