import "../modules/cleanWorkflow.css";
import "./desenWorkflow.css";
import DesenFolderSettingsBar from "./DesenFolderSettingsBar";
import DesenModelMasasi from "./DesenModelMasasi";
import DesenModeller from "./DesenModeller";
import YerlesimKalipPage from "./YerlesimKalipPage";
import DesenRaporlari from "./DesenRaporlari";

export default function DesenPage({ activeTab, activeMainCompany }) {
  const page =
    activeTab === "desen-modeller" ? (
      <DesenModeller activeMainCompany={activeMainCompany} />
    ) : activeTab === "desen-yerlesim-is-akisi" ? (
      <YerlesimKalipPage activeMainCompany={activeMainCompany} />
    ) : activeTab === "desen-raporlari" ? (
      <DesenRaporlari activeMainCompany={activeMainCompany} />
    ) : (
      <DesenModelMasasi activeMainCompany={activeMainCompany} />
    );

  const title =
    activeTab === "desen-modeller"
      ? "Desen Havuzu"
      : activeTab === "desen-yerlesim-is-akisi"
        ? "Yerlesim / Kalip"
        : activeTab === "desen-raporlari"
          ? "Desen Raporlari"
          : "Gelen Desenler";

  const showFolderSettings = !activeTab || activeTab === "gelen-desenler";

  return (
    <div className="clean-workflow-page dw-page">
      <section className="cw-screen">
        <header className="cw-card dw-header">
          <div>
            <h1>{title}</h1>
            <p>
              {activeTab === "desen-modeller"
                ? "Tüm modelleri, baskı bölgelerini ve hazırlık durumlarını tek merkezden yönetin."
                : activeTab === "desen-yerlesim-is-akisi"
                  ? "Baskı bölgesi bazlı yerleşim ve kalıp işlerini teknik kuyrukta tamamlayın."
                  : activeTab === "desen-raporlari"
                    ? "Desen hazırlık sürecini gerçek kayıtlar ve aynı filtreli Excel çıktısıyla izleyin."
                    : "Gelen klasördeki model ve kanal görsellerini kontrol ederek model kartına dönüştürün."}
            </p>
          </div>
        </header>
        {showFolderSettings ? (
          <DesenFolderSettingsBar activeMainCompany={activeMainCompany} />
        ) : null}
        {page}
      </section>
    </div>
  );
}
