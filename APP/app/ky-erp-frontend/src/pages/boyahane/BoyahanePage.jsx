import "../modules/cleanWorkflow.css";
import "./boyahaneWorkflow.css";
import "./inventoryCenter.css";
import "./boyahaneCommandCenter.css";
import "./boyahaneForms.css";
import "./boyahaneFinal.css";
import "./boyahaneCompactV2.css";
import "./boyahaneCompactV2Patch.css";
import "./boyahaneRefineV3.css";
import BoyahaneDashboardCompactPage from "./workflow/BoyahaneDashboardCompactPage";
import BoyahaneWorkPageV3 from "./workflow/BoyahaneWorkPageV3";
import BoyahaneInventoryHubV2 from "./workflow/BoyahaneInventoryHubV2";
import BoyahaneReportsAndLogsPage from "./workflow/BoyahaneReportsAndLogsPage";
import KayitliRenklerWorkspace from "./workflow/KayitliRenklerWorkspace";

function normalizeTab(value) {
  const aliases = {
    "boyahane-yonetim-ozeti": "is-akisi",
    "renk-recete-is-akisi": "is-akisi",
    "renk-gramaj": "uretim-gecmisi",
    "boya-giderleri": "raporlar",
    "boyahane-raporlari": "raporlar",
    "hammadde-lot": "urun-lotlar",
    "onayli-envanter": "urun-lotlar",
    "renk-havuzu": "kayitli-renkler",
  };
  return aliases[value] || value || "is-akisi";
}

export default function BoyahanePage({
  activeTab,
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const tab = normalizeTab(activeTab);

  const page = tab === "receteler" ? (
    <BoyahaneWorkPageV3
      mode="sample"
      activeMainCompany={activeMainCompany}
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "uretim-gecmisi" ? (
    <BoyahaneWorkPageV3
      mode="production"
      activeMainCompany={activeMainCompany}
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "kayitli-renkler" ? (
    <KayitliRenklerWorkspace
      activeMainCompany={activeMainCompany}
      openModule={openModule}
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "urun-lotlar" ? (
    <BoyahaneInventoryHubV2 activeMainCompany={activeMainCompany} />
  ) : tab === "raporlar" ? (
    <BoyahaneReportsAndLogsPage activeMainCompany={activeMainCompany} />
  ) : (
    <BoyahaneDashboardCompactPage
      activeMainCompany={activeMainCompany}
      openModule={openModule}
    />
  );

  return (
    <div className="clean-workflow-page bh-page">
      <section className="cw-screen bh-module-shell">{page}</section>
    </div>
  );
}
