import { useEffect, useMemo, useState } from "react";
import CompaniesCurrentWorkspace from "./muhasebe/CompaniesCurrentWorkspace";
import CustomerDocumentsWorkspace from "./muhasebe/CustomerDocumentsWorkspace";
import FinanceOperationsWorkspace from "./muhasebe/FinanceOperationsWorkspace";
import FinancialControlWorkspace from "./muhasebe/FinancialControlWorkspace";
import MailAccountingWorkspace from "./muhasebe/MailAccountingWorkspace";
import ManagementOverviewWorkspace from "./muhasebe/ManagementOverviewWorkspace";
import QuickCompanyCreateDialog from "./muhasebe/QuickCompanyCreateDialog";
import SupplierDocumentsWorkspace from "./muhasebe/SupplierDocumentsWorkspace";
import { useAccountingLiveSync } from "../../services/accountingLiveSync";
import { MUHASEBE_ROUTE_ALIASES } from "../../app/moduleRegistry";
import "./muhasebe/muhasebeModule.css";
import "./muhasebe/supplierInventoryWorkspace.css";
import "./muhasebe/accountingSafetyOverrides.css";
import "./muhasebe/accountingWorkspaceCore.css";

export const MUHASEBE_TABS = [
  { key: "yonetim-ozeti", title: "Yönetim Özeti", description: "Nakit, cari, KDV, belge ve yaklaşan işlemleri tek ekranda izleyin." },
  { key: "firma-kartlari", title: "Firmalar & Cari", description: "Müşteri ve tedarikçi kartlarını, cari bakiyeyi ve firma muhasebe tanımlarını yönetin." },
  { key: "tedarikci-faturalar", title: "Tedarikçi / Alış Belgeleri", description: "Gelen irsaliye ve faturaları gider, KDV, stok, LOT ve cari akışıyla birlikte yönetin." },
  { key: "musteri-belgeleri", title: "Müşteri / Satış Belgeleri", description: "Müşteri irsaliyesinden bizim irsaliye ve kesilen faturaya kadar belge zincirini izleyin." },
  { key: "finans-islemleri", title: "Finans İşlemleri", description: "Ödeme, tahsilat, çek, ödeme planı, banka, kasa ve defter hareketlerini günlük akışta yönetin." },
  { key: "mail-ekstre", title: "Ekstre ve Mail", description: "Ekstre, mutabakat, alıcı, hatırlatma ve gönderim işlemlerini tek alanda yönetin." },
  { key: "mali-kontrol", title: "Mali Kontrol & Raporlar", description: "Gelir-gider, kâr-zarar, KDV ve muhasebe raporlarını tek alanda inceleyin." },
];

function ControlledEmptyState({ requestedTab, goTab }) {
  return <section className="accounting-empty" role="status"><strong>Bu muhasebe görünümü bulunamadı.</strong><span>{requestedTab ? `“${requestedTab}” bağlantısı artık kullanılmıyor.` : "Geçerli bir ekran seçin."}</span><button type="button" className="accounting-primary" onClick={() => goTab("yonetim-ozeti")}>Yönetim özetine dön</button></section>;
}

export default function MuhasebePage({ activeTab, activeMainCompany, openModule }) {
  const normalizedTab = MUHASEBE_ROUTE_ALIASES[activeTab] || activeTab || "yonetim-ozeti";
  const current = useMemo(() => MUHASEBE_TABS.find((tab) => tab.key === normalizedTab), [normalizedTab]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickCompanyOpen, setQuickCompanyOpen] = useState(false);
  const reloadAll = () => setRefreshKey((value) => value + 1);
  const live = useAccountingLiveSync(activeMainCompany);

  useEffect(() => {
    const refreshFromCanonicalDocument = () => setRefreshKey((value) => value + 1);
    window.addEventListener("kyerp:accounting-refresh", refreshFromCanonicalDocument);
    return () => window.removeEventListener("kyerp:accounting-refresh", refreshFromCanonicalDocument);
  }, []);

  useEffect(() => {
    setQuickOpen(false);
  }, [normalizedTab]);

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

  const goFinance = (query = "") => {
    setQuickOpen(false);
    goTab("finans-islemleri", query);
  };

  const openEBelgeUpload = () => {
    setQuickOpen(false);
    openModule?.("isnet", { tabKey: "e-belge-yukleme" });
  };

  const openQuickCompany = () => {
    setQuickOpen(false);
    setQuickCompanyOpen(true);
  };

  const pageProps = { activeMainCompany, refreshKey, reloadAll, goTab, openModule };
  let content = null;
  if (!current) content = <ControlledEmptyState requestedTab={activeTab} goTab={goTab} />;
  else if (current.key === "yonetim-ozeti") content = <ManagementOverviewWorkspace {...pageProps} />;
  else if (current.key === "firma-kartlari") content = <CompaniesCurrentWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} reloadAll={reloadAll} />;
  else if (current.key === "tedarikci-faturalar") content = <SupplierDocumentsWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />;
  else if (current.key === "musteri-belgeleri") content = <CustomerDocumentsWorkspace activeMainCompany={activeMainCompany} />;
  else if (current.key === "finans-islemleri") content = <FinanceOperationsWorkspace {...pageProps} />;
  else if (current.key === "mail-ekstre") content = <MailAccountingWorkspace {...pageProps} />;
  else if (current.key === "mali-kontrol") content = <FinancialControlWorkspace {...pageProps} />;

  return (
    <main className="muhasebe-module-page">
      {current ? (
        <header className="accounting-page-header compact">
          <div><span className="accounting-eyebrow">Muhasebe</span><h1>{current.title}</h1><p>{current.description}</p></div>
          <div className="accounting-header-actions">
            <span className={`accounting-live-state ${live.online ? "" : "offline"}`}>{live.online ? "Canlı" : "Bağlantı bekleniyor"}</span>
            <div className="accounting-quick-wrap">
              <button type="button" className="accounting-primary" aria-expanded={quickOpen} onClick={() => setQuickOpen((value) => !value)}>+ Hızlı İşlem</button>
              {quickOpen ? (
                <div className="accounting-quick-menu" role="menu">
                  <button type="button" onClick={openQuickCompany}>Yeni Cari / Firma</button>
                  <button type="button" onClick={() => goFinance("financeView=daily")}>Ödeme / Tahsilat</button>
                  <button type="button" onClick={() => goFinance("financeView=daily")}>Çek / Senet</button>
                  <button type="button" onClick={() => goFinance("financeView=planner")}>Ödeme Planı</button>
                  <button type="button" onClick={() => goFinance("financeView=ledger")}>Banka / Kasa / Defter</button>
                  <button type="button" onClick={openEBelgeUpload}>Belge Yükle</button>
                </div>
              ) : null}
            </div>
            <button type="button" className="accounting-refresh" onClick={reloadAll}>Güncelle</button>
          </div>
        </header>
      ) : null}
      <div className="muhasebe-workbench">{content}</div>
      <QuickCompanyCreateDialog
        open={quickCompanyOpen}
        onClose={() => setQuickCompanyOpen(false)}
        onCreated={reloadAll}
        activeMainCompany={activeMainCompany}
      />
    </main>
  );
}
