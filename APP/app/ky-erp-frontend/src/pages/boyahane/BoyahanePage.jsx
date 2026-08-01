import "../modules/cleanWorkflow.css";
import "./boyahaneWorkflow.css";
import "./inventoryCenter.css";
import BoyahaneIsAkisiPage from "./workflow/BoyahaneIsAkisiPage";
import KayitliRenklerWorkspace from "./workflow/KayitliRenklerWorkspace";
import UrunLotlarPage from "./workflow/UrunLotlarPage";
import {
  BoyaGiderleriPage,
  BoyahaneRaporlarPage,
  UretimGecmisiPage,
} from "./workflow/BoyahaneRecordPages";

const titles = {
  "is-akisi": "İş Akışı",
  "kayitli-renkler": "Kayıtlı Renkler",
  receteler: "Reçeteler",
  "urun-lotlar": "Onaylı Ürün ve Lot Stoku",
  "uretim-gecmisi": "Üretim Geçmişi",
  "boya-giderleri": "Boya Giderleri",
  raporlar: "Raporlar",
};

const descriptions = {
  "is-akisi":
    "Desen’den gelen işleri renk, reçete, onaylı ürün ve lot stoklarıyla tek akışta yürütün.",
  "kayitli-renkler":
    "Kayıtlı renkleri ve onaylı reçete bağlantılarını yönetin.",
  receteler:
    "Renk reçetelerini sürüm, karşılaştırma ve onay düzeniyle yönetin.",
  "urun-lotlar":
    "Muhasebe tedarikçi faturalarından gelen lotları, onaylı ürünleri ve stok hareketlerini aynı merkezde takip edin.",
  "uretim-gecmisi":
    "Tamamlanan Boyahane üretimlerini kullanılan reçete ve lotlarıyla inceleyin.",
  "boya-giderleri":
    "Boya ve kimyasal sarflarının muhasebe gider karşılıklarını izleyin.",
  raporlar:
    "İş, üretim, stok, sarf ve gider sonuçlarını birlikte raporlayın.",
};

export default function BoyahanePage({ activeTab, activeMainCompany }) {
  const tab =
    activeTab === "renk-recete-is-akisi" ||
    activeTab === "boyahane-yonetim-ozeti"
      ? "is-akisi"
      : activeTab;

  const page =
    tab === "kayitli-renkler" ? (
      <KayitliRenklerWorkspace activeMainCompany={activeMainCompany} />
    ) : tab === "receteler" ? (
      <KayitliRenklerWorkspace
        activeMainCompany={activeMainCompany}
        recipesOnly
      />
    ) : tab === "urun-lotlar" ? (
      <UrunLotlarPage activeMainCompany={activeMainCompany} />
    ) : tab === "uretim-gecmisi" ? (
      <UretimGecmisiPage activeMainCompany={activeMainCompany} />
    ) : tab === "boya-giderleri" ? (
      <BoyaGiderleriPage activeMainCompany={activeMainCompany} />
    ) : tab === "raporlar" ? (
      <BoyahaneRaporlarPage activeMainCompany={activeMainCompany} />
    ) : (
      <BoyahaneIsAkisiPage activeMainCompany={activeMainCompany} />
    );

  return (
    <div className="clean-workflow-page bh-page">
      <section className="cw-screen">
        <header className="cw-card bh-header">
          <div>
            <h1>{titles[tab] || "İş Akışı"}</h1>
            <p>{descriptions[tab] || descriptions["is-akisi"]}</p>
          </div>
        </header>
        {page}
      </section>
    </div>
  );
}
