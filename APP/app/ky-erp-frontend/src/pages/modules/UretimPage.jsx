import { CircleAlert, Gauge } from "lucide-react";
import ImalatKontrolRapor from "../imalat/ImalatKontrolRapor";
import ProductionControlCenterPage from "../imalat/ProductionControlCenterPage";
import ProductionSettingsPage from "../imalat/ProductionSettingsPage";
import "../imalat/productionCenter.css";

function CompanyPending() {
  return (
    <div className="imalat-entry-page">
      <section className="iw-card production-page-intro">
        <div>
          <h1>
            <CircleAlert size={21} /> Ana firma hazırlanıyor
          </h1>
          <p>
            Model, irsaliye, üretim ve fatura bağlantısını kurmak için aktif ana
            firma bilgisi bekleniyor.
          </p>
        </div>
        <span className="production-page-intro-badge">
          <Gauge size={15} /> Güvenli bekleme
        </span>
      </section>
    </div>
  );
}

export default function UretimPage({ activeMainCompany, activeTab }) {
  if (!activeMainCompany?.slug && !activeMainCompany?.id) {
    return <CompanyPending />;
  }

  if (
    [
      "uretim-raporlari",
      "imalat-kontrol-rapor",
      "uretim-raporu",
    ].includes(activeTab)
  ) {
    return (
      <ImalatKontrolRapor
        activeMainCompany={activeMainCompany}
        initialView="report"
      />
    );
  }

  if (activeTab === "uretim-ayarlari") {
    return <ProductionSettingsPage activeMainCompany={activeMainCompany} />;
  }

  return (
    <ProductionControlCenterPage activeMainCompany={activeMainCompany} />
  );
}
