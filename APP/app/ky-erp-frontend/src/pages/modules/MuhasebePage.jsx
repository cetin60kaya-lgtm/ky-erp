import { useMemo, useState } from "react";
import CekOdemeMerkeziPage from "../muhasebe/CekOdemeMerkeziPage";
import MailTemplatesWorkspace from "./muhasebe/MailTemplatesWorkspace";
import IrsaliyeFaturaKontrolTab from "./muhasebe/IrsaliyeFaturaKontrolTab";
import KesilenFaturalarTab from "./muhasebe/KesilenFaturalarTab";
import AccountingLedgerPanel from "./muhasebe/AccountingLedgerPanel";
import AccountingReportsListWorkspace from "./muhasebe/AccountingReportsListWorkspace";
import CompaniesCurrentWorkspace from "./muhasebe/CompaniesCurrentWorkspace";
import MailTrackingWorkspace from "./muhasebe/MailTrackingWorkspace";
import ManagementOverviewWorkspace from "./muhasebe/ManagementOverviewWorkspace";
import PaymentPlannerPanel from "./muhasebe/PaymentPlannerPanel";
import ProfitLossWorkspace from "./muhasebe/ProfitLossWorkspace";
import QuickAccountingBar from "./muhasebe/QuickAccountingBar";
import SupplierDocumentsWorkspace from "./muhasebe/SupplierDocumentsWorkspace";
import VatComparisonWorkspace from "./muhasebe/VatComparisonWorkspace";
import { MUHASEBE_ROUTE_ALIASES } from "../../app/moduleRegistry";
import "./muhasebe/muhasebeModule.css";
import "./muhasebe/supplierInventoryWorkspace.css";

export const MUHASEBE_TABS = [
  { key: "yonetim-ozeti", title: "Yönetim Özeti", description: "Nakit, cari, KDV, belge ve çek görünümünü tek ekranda izleyin." },
  { key: "firma-kartlari", title: "Firmalar ve Cari", description: "Firma bakiyeleri, normal cari, FİBE ve günlük hareketleri aynı çalışma alanında yönetin." },
  { key: "tedarikci-faturalar", title: "Tedarikçi İrsaliye / Faturaları", description: "İşNet veya manuel XML/PDF/tarama kaynağından gelen irsaliye ve faturaları ortak belge havuzunda inceleyin; gider, KDV, stok-lot ve cari kurallarına göre işleyin." },
  { key: "kesilen-faturalar", title: "Bizim Kesilen Faturalarımız", description: "Bizim giden irsaliyelerimize bağlı kestiğimiz faturaların İşNet, model, adet ve belge durumlarını izleyin." },
  { key: "irsaliye-fatura-kontrol", title: "Müşteri İrsaliye / Bizim Belge Kontrolü", description: "Müşteriden gelen irsaliye → model/üretim → bizim giden irsaliyemiz → bizim kesilen faturamız zincirini takip edin." },
  { key: "cek-odeme", title: "Çek / Ödeme", description: "Haftalık ödeme planını, hızlı çek girişini, vadeleri, banka ve cari mahsupları birlikte takip edin." },
  { key: "mail-ekstre", title: "Ekstre ve Mail Takibi", description: "Ekstre, alıcı, hatırlatma ve gönderim işlerini satırdan yönetin." },
  { key: "kar-zarar", title: "Gelir / Gider ve Kâr Zarar", description: "Resmî ve iç operasyon hareketlerini aynı dönem görünümünde analiz edin." },
  { key: "kdv-kontrol", title: "Gelen / Giden KDV Kontrolü", description: "Firma bazlı KDV hareketlerini ve dönem farkını karşılaştırın." },
  { key: "muhasebe-raporlari", title: "Muhasebe Raporları", description: "Operasyonel ve yönetim raporlarını filtreleyip dışa aktarın." },
  { key: "mail-sablonlari", title: "Mail Şablonları", description: "Muhasebe yazışmalarında kullanılan şablonları yönetin." },
];

function ControlledEmptyState({ requestedTab, goTab }) {
  return <section className="accounting-empty" role="status"><strong>Bu muhasebe görünümü bulunamadı.</strong><span>{requestedTab ? `“${requestedTab}” bağlantısı artık kullanılmıyor.` : "Geçerli bir ekran seçin."}</span><button type="button" className="accounting-primary" onClick={() => goTab("yonetim-ozeti")}>Yönetim özetine dön</button></section>;
}

export default function MuhasebePage({ activeTab, activeMainCompany, openModule }) {
  const normalizedTab = MUHASEBE_ROUTE_ALIASES[activeTab] || activeTab || "yonetim-ozeti";
  const current = useMemo(() => MUHASEBE_TABS.find((tab) => tab.key === normalizedTab), [normalizedTab]);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadAll = () => setRefreshKey((value) => value + 1);

  const goTab = (tabKey, query = "") => {
    const target = MUHASEBE_ROUTE_ALIASES[tabKey] || tabKey;
    openModule?.("muhasebe", { tabKey: target });
    if (query) {
      const suffix = String(query).startsWith("?") ? query : `?${query}`;
      window.setTimeout(() => {
        window.history.replaceState({}, "", `/muhasebe/${target}${suffix}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, 0);
    }
  };

  const pageProps = { activeMainCompany, refreshKey, reloadAll, goTab };
  let content = null;
  if (!current) content = <ControlledEmptyState requestedTab={activeTab} goTab={goTab} />;
  else if (current.key === "yonetim-ozeti") content = <ManagementOverviewWorkspace {...pageProps} />;
  else if (current.key === "firma-kartlari") content = <><AccountingLedgerPanel activeMainCompany={activeMainCompany} /><CompaniesCurrentWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} /></>;
  else if (current.key === "tedarikci-faturalar") content = <SupplierDocumentsWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />;
  else if (current.key === "kesilen-faturalar") content = <KesilenFaturalarTab activeMainCompany={activeMainCompany} />;
  else if (current.key === "irsaliye-fatura-kontrol") content = <IrsaliyeFaturaKontrolTab activeMainCompany={activeMainCompany} />;
  else if (current.key === "cek-odeme") content = <><PaymentPlannerPanel activeMainCompany={activeMainCompany} /><CekOdemeMerkeziPage activeMainCompany={activeMainCompany} refreshKey={refreshKey} reloadAll={reloadAll} /></>;
  else if (current.key === "mail-ekstre") content = <MailTrackingWorkspace {...pageProps} />;
  else if (current.key === "kar-zarar") content = <ProfitLossWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />;
  else if (current.key === "kdv-kontrol") content = <VatComparisonWorkspace {...pageProps} />;
  else if (current.key === "muhasebe-raporlari") content = <AccountingReportsListWorkspace {...pageProps} />;
  else if (current.key === "mail-sablonlari") content = <MailTemplatesWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />;

  return <main className="muhasebe-module-page">{current ? <header className="accounting-page-header"><div><span className="accounting-eyebrow">Muhasebe</span><h1>{current.title}</h1><p>{current.description}</p></div><button type="button" className="accounting-refresh" onClick={reloadAll}>Güncelle</button></header> : null}<div className="muhasebe-workbench">{current ? <QuickAccountingBar activeMainCompany={activeMainCompany} refreshKey={refreshKey} reloadAll={reloadAll} /> : null}{content}</div></main>;
}
