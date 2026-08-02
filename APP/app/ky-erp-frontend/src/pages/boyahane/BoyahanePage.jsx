import "../modules/cleanWorkflow.css";
import "./boyahaneWorkflow.css";
import "./inventoryCenter.css";
import "./boyahaneCommandCenter.css";
import BoyahaneDashboardPage from "./workflow/BoyahaneDashboardPage";
import BoyahaneOperationsPage from "./workflow/BoyahaneOperationsPage";
import BoyahaneInventoryHub from "./workflow/BoyahaneInventoryHub";
import BoyahaneReportsAndLogsPage from "./workflow/BoyahaneReportsAndLogsPage";
import KayitliRenklerWorkspace from "./workflow/KayitliRenklerWorkspace";

const NAV_ITEMS = [
  ["is-akisi", "Ana Ekran"],
  ["receteler", "Numune Çalışmaları"],
  ["uretim-gecmisi", "İmalat Boyaları"],
  ["kayitli-renkler", "Kayıtlı Renkler"],
  ["urun-lotlar", "Stok, Lot ve Ürünler"],
  ["raporlar", "Raporlar ve İşlem Logları"],
];

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
    <BoyahaneOperationsPage
      activeMainCompany={activeMainCompany}
      mode="sample"
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "uretim-gecmisi" ? (
    <BoyahaneOperationsPage
      activeMainCompany={activeMainCompany}
      mode="production"
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "kayitli-renkler" ? (
    <KayitliRenklerWorkspace
      activeMainCompany={activeMainCompany}
      openModule={openModule}
      moduleActionContext={moduleActionContext}
    />
  ) : tab === "urun-lotlar" ? (
    <BoyahaneInventoryHub activeMainCompany={activeMainCompany} />
  ) : tab === "raporlar" ? (
    <BoyahaneReportsAndLogsPage activeMainCompany={activeMainCompany} />
  ) : (
    <BoyahaneDashboardPage
      activeMainCompany={activeMainCompany}
      openModule={openModule}
    />
  );

  return (
    <div className="clean-workflow-page bh-page">
      <section className="cw-screen bh-module-shell">
        <nav className="bh-module-nav" aria-label="Boyahane ekranları">
          {NAV_ITEMS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => openModule?.("boyahane", { tabKey: key })}
            >
              {label}
            </button>
          ))}
        </nav>
        {page}
      </section>
    </div>
  );
}
