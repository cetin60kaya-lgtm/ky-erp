import "../modules/cleanWorkflow.css";
import "./desenWorkflow.css";
import DesenModelMasasi from "./DesenModelMasasi";
import DesenModeller from "./DesenModeller";
import YerlesimKalipPage from "./YerlesimKalipPage";
import DesenRaporlari from "./DesenRaporlari";

export default function DesenPage({ activeTab, activeMainCompany }) {
  const page =
    activeTab === "desen-modeller" ? (
      <DesenModeller activeMainCompany={activeMainCompany} />
    ) : activeTab === "desen-yerlesim-is-akisi" ? (
      <YerlesimKalipPage />
    ) : activeTab === "desen-raporlari" ? (
      <DesenRaporlari />
    ) : (
      <DesenModelMasasi />
    );

  const title =
    activeTab === "desen-modeller"
       ? "Desen Havuzu"
      : activeTab === "desen-yerlesim-is-akisi"
         ? "Yerlesim / Kalip"
        : activeTab === "desen-raporlari"
           ? "Desen Raporlari"
          : "Yeni Model / Eksik Bilgi";

  return (
    <div className="clean-workflow-page dw-page">
      <section className="cw-screen">
        <header className="cw-card dw-header">
          <div>
            <h1>{title}</h1>
            <p>
              Desen, kanal, renk, kalip ve uretime hazirlik bilgileri
              sikismadan yonetilir.
            </p>
          </div>
        </header>
        {page}
      </section>
    </div>
  );
}
