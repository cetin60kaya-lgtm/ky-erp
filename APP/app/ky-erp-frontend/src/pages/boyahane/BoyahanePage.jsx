import "../modules/cleanWorkflow.css";
import "./boyahaneWorkflow.css";
import BoyahaneOzet from "./BoyahaneOzet";
import RenkRecetePage from "./RenkRecetePage";
import KayitliRenklerPage from "./KayitliRenklerPage";
import HammaddeLotPage from "./HammaddeLotPage";
import OnayliEnvanterPage from "./OnayliEnvanterPage";
import EvrakDenetimPage from "./EvrakDenetimPage";
import BoyahaneRaporlari from "./BoyahaneRaporlari";

const titles = {
  "boyahane-yonetim-ozeti": "Yönetim Özeti",
  "renk-recete-is-akisi": "Renk & Reçete",
  "kayitli-renkler": "Kayıtlı Renkler",
  "hammadde-lot": "Hammadde / Lot",
  "urun-lot-takibi": "Hammadde / Lot",
  "onayli-envanter": "Onaylı Envanter",
  "evraklar-denetim": "Evraklar / Denetim",
  "boyahane-raporlari": "Raporlar",
};

export default function BoyahanePage({ activeTab, activeMainCompany }) {
  const normalizedTab = activeTab === "urun-lot-takibi" ? "hammadde-lot" : activeTab;
  const page =
    normalizedTab === "renk-recete-is-akisi" || normalizedTab === "renk-gramaj"
       ? <RenkRecetePage activeMainCompany={activeMainCompany} />
      : normalizedTab === "kayitli-renkler"
         ? <KayitliRenklerPage />
        : normalizedTab === "hammadde-lot"
           ? <HammaddeLotPage />
          : normalizedTab === "onayli-envanter"
             ? <OnayliEnvanterPage />
            : normalizedTab === "evraklar-denetim" || normalizedTab === "evraklar"
               ? <EvrakDenetimPage />
              : normalizedTab === "boyahane-raporlari" || normalizedTab === "raporlar"
                 ? <BoyahaneRaporlari />
                : <BoyahaneOzet />;

  return (
    <div className="clean-workflow-page bh-page">
      <section className="cw-screen">
        <header className="cw-card bh-header">
          <div>
            <h1>{titles[normalizedTab] || "Yönetim Özeti"}</h1>
            <p>Renk reçetesi, lot, onaylı envanter ve denetim evrakları ayrı ekranlarda seri kullanıma hazırlanır.</p>
          </div>
        </header>
        {page}
      </section>
    </div>
  );
}
