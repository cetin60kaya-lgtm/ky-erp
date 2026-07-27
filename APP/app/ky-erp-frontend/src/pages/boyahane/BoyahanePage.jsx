import "../modules/cleanWorkflow.css";
import "./boyahaneWorkflow.css";
import BoyahaneIsAkisiPage from "./workflow/BoyahaneIsAkisiPage";
import KayitliRenklerWorkspace from "./workflow/KayitliRenklerWorkspace";
import UrunLotlarPage from "./workflow/UrunLotlarPage";
import { BoyaGiderleriPage, BoyahaneRaporlarPage, UretimGecmisiPage } from "./workflow/BoyahaneRecordPages";

const titles = {
  "is-akisi": "İş Akışı",
  "kayitli-renkler": "Kayıtlı Renkler",
  receteler: "Reçeteler",
  "urun-lotlar": "Ürün ve Lotlar",
  "uretim-gecmisi": "Üretim Geçmişi",
  "boya-giderleri": "Boya Giderleri",
  raporlar: "Raporlar",
};

export default function BoyahanePage({ activeTab, activeMainCompany }) {
  const tab = activeTab === "renk-recete-is-akisi" || activeTab === "boyahane-yonetim-ozeti" ? "is-akisi" : activeTab;
  const page = tab === "kayitli-renkler" ? <KayitliRenklerWorkspace activeMainCompany={activeMainCompany} />
    : tab === "receteler" ? <KayitliRenklerWorkspace activeMainCompany={activeMainCompany} recipesOnly />
      : tab === "urun-lotlar" ? <UrunLotlarPage activeMainCompany={activeMainCompany} />
        : tab === "uretim-gecmisi" ? <UretimGecmisiPage activeMainCompany={activeMainCompany} />
          : tab === "boya-giderleri" ? <BoyaGiderleriPage activeMainCompany={activeMainCompany} />
            : tab === "raporlar" ? <BoyahaneRaporlarPage activeMainCompany={activeMainCompany} />
              : <BoyahaneIsAkisiPage activeMainCompany={activeMainCompany} />;

  return <div className="clean-workflow-page bh-page"><section className="cw-screen"><header className="cw-card bh-header"><div><h1>{titles[tab] || "İş Akışı"}</h1><p>Desen’den gönderilen gerçek işler; kayıtlı reçete, onaylı ürün/lot, üretim snapshotı ve muhasebe gideriyle tek akışta ilerler.</p></div></header>{page}</section></div>;
}
