import { Bot, RefreshCw } from "lucide-react";
import MuhasebePage from "../MuhasebePage";
import "./MuhasebeFinalPage.css";

const CONTEXT_PROMPTS = {
  "yonetim-ozeti":
    "Muhasebe yönetim özetini incele. Açık cari, gelen ve giden KDV, kâr zarar, kategorisiz gider, İşNet işlem hatası ve yaklaşan ödemelerde öncelikli işleri çıkar.",
  "firma-kartlari":
    "Muhasebe firma kartlarını denetle. Müşteri/tedarikçi tipi, resmi/gayri resmi kuralı, cari davranışı, gider kategorisi, benzer veya mükerrer firma adları ve eksik alias kayıtlarını çıkar.",
  "envanter-urunleri":
    "Ürün ve alias eşleştirmelerini denetle. Yazım farklarını, eşleşmemiş fatura kalemlerini, gider/stok/Boyahane yönlendirmesini, eksik lotları ve mükerrer ürün kartlarını çıkar.",
  "tedarikci-faturalar":
    "Tedarikçi faturalarını denetle. PDF/XML, firma, kalem, gider kategorisi, cari, KDV, stok ve lot kayıtlarından eksik veya mükerrer olanları çıkar.",
  "cari-hareketler":
    "Cari hareketleri denetle. Resmi/gayri resmi ayrımını, mükerrer belge etkisini, açık borç/alacakları, ters bakiye ve belgesiz hareketleri çıkar.",
  "kdv-kontrol":
    "KDV kontrolünü incele. Gelen KDV, çıkan KDV, devreden KDV, ödenecek KDV, belge toplamı farkı ve kayıt dışı kalan faturaları çıkar.",
  "kar-zarar":
    "Gelir gider ve kâr zarar dengesini incele. Firma, kategori ve ay bazında olağan dışı değişimleri ve eksik gider sınıflarını çıkar.",
  "cek-odeme":
    "Çek ve ödeme merkezini incele. Yaklaşan vadeler, nakit ihtiyacı, mükerrer ödeme ve cariyle bağlanmayan hareketleri çıkar.",
};

export default function MuhasebeFinalPage({
  activeTab,
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const prompt =
    CONTEXT_PROMPTS[activeTab] ||
    "Muhasebe ekranındaki mevcut kayıtları denetle; eksik, mükerrer, sınıflanmamış veya kullanıcı onayı bekleyen işlemleri önem sırasına göre çıkar.";

  function openAssistant() {
    openModule?.("asistan", {
      tabKey: "sohbet",
      actionContext: {
        sourceModule: "muhasebe",
        sourceTab: activeTab,
        sourceRoute: window.location.pathname,
        mainCompanySlug: activeMainCompany?.slug || activeMainCompany?.id || "",
        prompt,
      },
    });
  }

  return (
    <div className="muhasebe-final-shell">
      <div className="muhasebe-final-toolbar">
        <div>
          <span>MUHASEBE ÇALIŞMA MERKEZİ</span>
          <strong>{activeMainCompany?.name || "KY ERP"}</strong>
        </div>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Yenile
          </button>
          <button type="button" className="assistant" onClick={openAssistant}>
            <Bot size={16} /> Asistanla İncele
          </button>
        </div>
      </div>
      <MuhasebePage
        activeTab={activeTab}
        activeMainCompany={activeMainCompany}
        openModule={openModule}
        moduleActionContext={moduleActionContext}
      />
    </div>
  );
}
