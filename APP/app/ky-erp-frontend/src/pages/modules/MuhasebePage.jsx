import { useEffect, useMemo, useState } from "react";
import CompaniesCurrentWorkspace from "./muhasebe/CompaniesCurrentWorkspace";
import CustomerDocumentsWorkspace from "./muhasebe/CustomerDocumentsWorkspace";
import FinancialControlWorkspace from "./muhasebe/FinancialControlWorkspace";
import MailAccountingWorkspace from "./muhasebe/MailAccountingWorkspace";
import ManagementOverviewWorkspace from "./muhasebe/ManagementOverviewWorkspace";
import SupplierDocumentsWorkspace from "./muhasebe/SupplierDocumentsWorkspace";
import { MUHASEBE_ROUTE_ALIASES } from "../../app/moduleRegistry";
import "./muhasebe/muhasebeModule.css";
import "./muhasebe/supplierInventoryWorkspace.css";

export const MUHASEBE_TABS = [
  { key: "yonetim-ozeti", title: "Yönetim Özeti", description: "Nakit, cari, KDV, belge ve yaklaşan işlemleri tek ekranda izleyin." },
  { key: "firma-kartlari", title: "Firmalar / Cari / Çek", description: "Firma, cari, ödeme, tahsilat, çek ve FİBE işlemlerini tek çalışma alanında yönetin." },
  { key: "tedarikci-faturalar", title: "Tedarikçi Belgeleri", description: "Gelen irsaliye ve faturaları gider, KDV, stok, LOT ve cari akışıyla birlikte yönetin." },
  { key: "musteri-belgeleri", title: "Müşteri Belgeleri", description: "Müşteri irsaliyesinden bizim irsaliye ve kesilen faturaya kadar belge zincirini izleyin." },
  { key: "mail-ekstre", title: "Ekstre ve Mail", description: "Ekstre, alıcı, hatırlatma, gönderim ve şablon işlemlerini tek alanda yönetin." },
  { key: "mali-kontrol", title: "Mali Kontrol & Raporlar", description: "Gelir-gider, kâr-zarar, KDV ve muhasebe raporlarını tek alanda inceleyin." },
];

function ControlledEmptyState({ requestedTab, goTab }) {
  return <section className="accounting-empty" role="status"><strong>Bu muhasebe görünümü bulunamadı.</strong><span>{requestedTab ? `“${requestedTab}” bağlantısı artık kullanılmıyor.` : "Geçerli bir ekran seçin."}</span><button type="button" className="accounting-primary" onClick={() => goTab("yonetim-ozeti")}>Yönetim özetine dön</button></section>;
}
export default function MuhasebePage({ activeTab, activeMainCompany, openModule }) {
  const normalizedTab = MUHASEBE_ROUTE_ALIASES[activeTab] || activeTab || "yonetim-ozeti";
  const current = useMemo(() => MUHASEBE_TABS.find((tab) => tab.key === normalizedTab), [normalizedTab]);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadAll = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    const refreshFromCanonicalDocument = () => setRefreshKey((value) => value + 1);
    window.addEventListener("kyerp:accounting-refresh", refreshFromCanonicalDocument);
    return () => window.removeEventListener("kyerp:accounting-refresh", refreshFromCanonicalDocument);
  }, []);

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

  const pageProps = { activeMainCompany, refreshKey, reloadAll, goTab, openModule };
  let content = null;
  if (!current) content = <ControlledEmptyState requestedTab={activeTab} goTab={goTab} />;
  else if (current.key === "yonetim-ozeti") content = <ManagementOverviewWorkspace {...pageProps} />;
  else if (current.key === "firma-kartlari") content = <CompaniesCurrentWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} reloadAll={reloadAll} />;
  else if (current.key === "tedarikci-faturalar") content = <SupplierDocumentsWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />;
  else if (current.key === "musteri-belgeleri") content = <CustomerDocumentsWorkspace activeMainCompany={activeMainCompany} />;
  else if (current.key === "mail-ekstre") content = <MailAccountingWorkspace {...pageProps} />;
  else if (current.key === "mali-kontrol") content = <FinancialControlWorkspace {...pageProps} />;

  return (
    <main className="muhasebe-module-page">
      {current ? (
        <header className="accounting-page-header compact">
          <div><span className="accounting-eyebrow">Muhasebe</span><h1>{current.title}</h1><p>{current.description}</p></div>
          <button type="button" className="accounting-refresh" onClick={reloadAll}>Güncelle</button>
        </header>
      ) : null}
      <div className="muhasebe-workbench">{content}</div>
    </main>
  );
}
