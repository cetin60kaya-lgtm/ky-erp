import { useState } from "react";
import "../modules/cleanWorkflow.css";
import "./desenWorkflow.css";
import DesenFolderSettingsBar from "./DesenFolderSettingsBar";
import DesenInboxUploadButton from "./DesenInboxUploadButton";
import DesenModelMasasi from "./DesenModelMasasi";
import DesenModeller from "./DesenModeller";
import YerlesimKalipPage from "./YerlesimKalipPage";
import DesenRaporlari from "./DesenRaporlari";

export default function DesenPage({ activeTab, activeMainCompany }) {
  const [inboxRevision, setInboxRevision] = useState(0);
  const isInbox = !activeTab || activeTab === "gelen-desenler";
  const page =
    activeTab === "desen-klasor-ayarlari" ? null : activeTab === "desen-modeller" ? (
      <DesenModeller activeMainCompany={activeMainCompany} />
    ) : activeTab === "desen-yerlesim-is-akisi" ? (
      <YerlesimKalipPage activeMainCompany={activeMainCompany} />
    ) : activeTab === "desen-raporlari" ? (
      <DesenRaporlari activeMainCompany={activeMainCompany} />
    ) : (
      <DesenModelMasasi
        key={`${activeMainCompany?.slug || "company"}-${inboxRevision}`}
        activeMainCompany={activeMainCompany}
      />
    );

  const title =
    activeTab === "desen-klasor-ayarlari"
      ? "Desen R2 Depolama Ayarları"
      : activeTab === "desen-modeller"
        ? "Desen Havuzu"
        : activeTab === "desen-yerlesim-is-akisi"
          ? "Yerleşim / Kalıp"
          : activeTab === "desen-raporlari"
            ? "Desen Raporları"
            : "Gelen Desenler";

  const showFolderSettings =
    isInbox || activeTab === "desen-klasor-ayarlari";

  return (
    <div className="clean-workflow-page dw-page">
      <section className="cw-screen">
        <header className="cw-card dw-header">
          <div>
            <h1>{title}</h1>
            <p>
              {activeTab === "desen-klasor-ayarlari"
                ? "Canlı uygulamanın R2 gelen, model, hata ve arşiv alanlarını kontrol edin."
                : activeTab === "desen-modeller"
                  ? "Tüm modelleri, baskı bölgelerini, kanalları, renk gruplarını ve Boyahane bağlantısını tek merkezden yönetin."
                  : activeTab === "desen-yerlesim-is-akisi"
                    ? "Baskı bölgesi bazlı yerleşim ve kalıp işlerini teknik kuyrukta tamamlayın."
                    : activeTab === "desen-raporlari"
                      ? "Desen hazırlık sürecini gerçek kayıtlar ve filtreli CSV çıktısıyla izleyin."
                      : "Model, kanal ve yerleşim görsellerini R2 gelen alanına yükleyip kontrol ederek tek model kartına dönüştürün."}
            </p>
          </div>
          {isInbox ? (
            <DesenInboxUploadButton
              activeMainCompany={activeMainCompany}
              onUploaded={() => setInboxRevision((value) => value + 1)}
            />
          ) : null}
        </header>
        {showFolderSettings ? (
          <DesenFolderSettingsBar activeMainCompany={activeMainCompany} />
        ) : null}
        {page}
      </section>
    </div>
  );
}
