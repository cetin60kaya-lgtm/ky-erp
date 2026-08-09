import { useState } from "react";
import "../modules/cleanWorkflow.css";
import "./desenWorkflow.css";
import "./desenCloud.css";
import DesenFolderSettingsBar from "./DesenFolderSettingsBar";
import DesenInboxUploadButton from "./DesenInboxUploadButton";
import DesenModelMasasi from "./DesenModelMasasi";
import DesenModeller from "./DesenModeller";
import YerlesimKalipPage from "./YerlesimKalipPage";
import DesenRaporlari from "./DesenRaporlari";

const SCREEN_COPY = {
  "desen-klasor-ayarlari": {
    title: "Desen R2 Depolama Ayarları",
    description:
      "Canlı uygulamanın R2 gelen, model, hata ve arşiv alanlarını kontrol edin.",
  },
  "desen-modeller": {
    title: "Desen Havuzu",
    description:
      "Tüm modelleri, baskı bölgelerini, kanalları, renk gruplarını ve Boyahane bağlantısını tek merkezden yönetin.",
  },
  "desen-yerlesim-is-akisi": {
    title: "Yerleşim / Kalıp",
    description:
      "Baskı bölgesi bazlı yerleşim ve kalıp işlerini teknik kuyrukta tamamlayın.",
  },
  "desen-raporlari": {
    title: "Desen Raporları",
    description:
      "Desen hazırlık sürecini gerçek kayıtlar ve filtreli CSV çıktısıyla izleyin.",
  },
  "gelen-desenler": {
    title: "Gelen Desenler",
    description:
      "UXP / yerel Desen Köprüsü veya telefon yüklemesiyle gelen görselleri düşük boyutlu R2 önizlemelerine dönüştürüp model kartına bağlayın.",
  },
};

function resolveScreenKey(activeTab) {
  return activeTab && SCREEN_COPY[activeTab] ? activeTab : "gelen-desenler";
}

function renderScreen(screenKey, activeMainCompany, inboxRevision) {
  if (screenKey === "desen-klasor-ayarlari") return null;
  if (screenKey === "desen-modeller") {
    return <DesenModeller activeMainCompany={activeMainCompany} />;
  }
  if (screenKey === "desen-yerlesim-is-akisi") {
    return <YerlesimKalipPage activeMainCompany={activeMainCompany} />;
  }
  if (screenKey === "desen-raporlari") {
    return <DesenRaporlari activeMainCompany={activeMainCompany} />;
  }
  return (
    <DesenModelMasasi
      key={`${activeMainCompany?.slug || "company"}-${inboxRevision}`}
      activeMainCompany={activeMainCompany}
    />
  );
}

export default function DesenPage({ activeTab, activeMainCompany }) {
  const [inboxRevision, setInboxRevision] = useState(0);
  const screenKey = resolveScreenKey(activeTab);
  const screenCopy = SCREEN_COPY[screenKey];
  const isInbox = screenKey === "gelen-desenler";
  const showFolderSettings =
    isInbox || screenKey === "desen-klasor-ayarlari";
  const page = renderScreen(screenKey, activeMainCompany, inboxRevision);

  return (
    <div className="clean-workflow-page dw-page">
      <section className="cw-screen">
        <header className="cw-card dw-header">
          <div>
            <h1>{screenCopy.title}</h1>
            <p>{screenCopy.description}</p>
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
