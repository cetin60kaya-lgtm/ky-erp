import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "./context/ActiveCompanyContext";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import MuhasebePage from "./pages/modules/MuhasebePage";
import { lazyWithRetry } from "./utils/lazyWithRetry";
import { MODULES, findModule, findTab, getInitialRoute, getModuleTabs } from "./app/moduleRegistry";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";
import { useDisplayPreferences } from "./hooks/useDisplayPreferences";
import AppShellV3 from "./layouts/AppShellV3";

const AdminPage = lazyWithRetry(() => import("./pages/modules/AdminPage"), "admin-v3");
const IkPersonnelFinancePage = lazyWithRetry(() => import("./pages/modules/ik/IkPersonnelFinancePage"), "ik-personnel-finance-v1");
const IkAuditPersonnelPage = lazyWithRetry(() => import("./pages/modules/ik/IkAuditPersonnelPage"), "ik-audit-personnel-v1");
const IkFinancePage = lazyWithRetry(() => import("./pages/modules/ik/IkFinancePage"), "ik-finance-v1");
const PdksPage = lazyWithRetry(() => import("./pages/modules/PdksPage"), "pdks-v1");
const UretimPage = lazyWithRetry(() => import("./pages/modules/UretimPage"), "uretim-v3");
const BoyahanePage = lazyWithRetry(() => import("./pages/modules/BoyahanePage"), "boyahane-v3");
const DesenPage = lazyWithRetry(() => import("./pages/modules/DesenPage"), "desen-v3");
const IsnetPage = lazyWithRetry(() => import("./pages/modules/IsnetPage"), "isnet-v3");
const EBelgeCenterPage = lazyWithRetry(() => import("./pages/modules/muhasebe/EBelgeCenterPage"), "e-belge-center-v1");
const MuhasebeSmartMatchPage = lazyWithRetry(() => import("./pages/modules/muhasebe/MuhasebeSmartMatchPage"), "muhasebe-smart-match-v1");
const IsnetManagementCenterPage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetManagementCenterPage"), "isnet-management-center-v1");
const IsnetDocumentCenterPage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetDocumentCenterPage"), "isnet-document-center-v1");
const IsnetWorkflowFinalPage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetWorkflowFinalPage"), "isnet-workflow-final-v1");
const IsnetPreparedInvoicePage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetPreparedInvoicePage"), "isnet-prepared-invoice-v1");
const IsnetArchiveDeliveryPage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetArchiveDeliveryPage"), "isnet-archive-delivery-v1");
const IsnetSettingsMasterPage = lazyWithRetry(() => import("./pages/modules/isnet/IsnetSettingsMasterPage"), "isnet-settings-master-v1");
const AiAssistantPage = lazyWithRetry(() => import("./pages/modules/AiAssistantPage"), "asistan-v3");
const CommunicationHubPage = lazyWithRetry(() => import("./pages/modules/CommunicationHubPage"), "communication-hub-v1");

const MODULE_LOADERS = {
  muhasebe: () => Promise.all([import("./pages/modules/muhasebe/MuhasebeSmartMatchPage")]),
  admin: () => import("./pages/modules/AdminPage"),
  ik: () => Promise.all([
    import("./pages/modules/ik/IkPersonnelFinancePage"),
    import("./pages/modules/ik/IkFinancePage"),
    import("./pages/modules/ik/IkAuditPersonnelPage"),
  ]),
  pdks: () => import("./pages/modules/PdksPage"),
  desen: () => import("./pages/modules/DesenPage"),
  uretim: () => import("./pages/modules/UretimPage"),
  boyahane: () => import("./pages/modules/BoyahanePage"),
  isnet: () => Promise.all([
    import("./pages/modules/muhasebe/EBelgeCenterPage"),
    import("./pages/modules/IsnetPage"),
    import("./pages/modules/isnet/IsnetManagementCenterPage"),
    import("./pages/modules/isnet/IsnetDocumentCenterPage"),
    import("./pages/modules/isnet/IsnetWorkflowFinalPage"),
    import("./pages/modules/isnet/IsnetPreparedInvoicePage"),
    import("./pages/modules/isnet/IsnetArchiveDeliveryPage"),
    import("./pages/modules/isnet/IsnetSettingsMasterPage"),
  ]),
  iletisim: () => import("./pages/modules/CommunicationHubPage"),
  asistan: () => import("./pages/modules/AiAssistantPage"),
};

const IK_AUDIT_TABS = [["personel-kartlari", "Personel Kartları", "users"]];
const PDKS_AUDIT_TABS = [
  ["ana-ekran", "Ana Ekran", "dashboard"],
  ["giris-cikislar", "Giriş / Çıkışlar", "takvim"],
  ["puantaj", "Puantaj", "takvim"],
  ["puantaj-sonuclari", "Puantaj Sonuçları", "raporlar"],
  ["calisma-tarihi", "Çalışma Tarihi", "takvim"],
  ["raporlar", "Raporlar", "raporlar"],
  ["denetim-yillik-temp", "Yıllık TEMP / Denetim", "file-check"],
];

function preloadModule(moduleKey) {
  MODULE_LOADERS[moduleKey]?.().catch(() => {});
}

function resolveLabel(moduleKey, tabKey) {
  if (moduleKey === "ik" && tabKey === "personel-kartlari") return "Personel Kartları";
  const module = findModule(moduleKey);
  return findTab(module, tabKey)?.[1] || module?.label || "Ekran";
}

function normalizeRoute(route, visibleModules) {
  const permittedModule = visibleModules.find((item) => item.key === route.moduleKey) || visibleModules[0];
  if (!permittedModule) return null;
  const permittedTab = findTab(permittedModule, route.tabKey) || getModuleTabs(permittedModule)[0];
  return { moduleKey: permittedModule.key, tabKey: permittedTab?.[0] || "" };
}

function updateBrowserPath(route, replace = false) {
  const nextPath = `/${route.moduleKey}/${route.tabKey}`;
  if (window.location.pathname === nextPath) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
}

function LoadingCard({ title = "Ekran yükleniyor" }) {
  return <div className="content-card module-loading-card"><h3>{title}</h3><p>Lütfen bekleyin...</p></div>;
}

class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recoveryKey: 0 };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("KY ERP V3 module render error", error, info); }
  render() {
    if (!this.state.error) return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
    const errorCode = String(this.state.error?.code || "").trim();
    return (
      <div className="content-card module-error-card">
        <h3>Ekran şu anda açılamıyor</h3>
        <p>Ekranı yeniden yüklemeyi deneyin. Sorun sürerse sistem yöneticisine bildirin.</p>
        {errorCode ? <small>Hata kodu: {errorCode}</small> : null}
        <button type="button" className="primary-btn" onClick={() => this.setState((current) => ({ error: null, recoveryKey: current.recoveryKey + 1 }))}>Tekrar Dene</button>
      </div>
    );
  }
}

export default function AppV3() {
  const { user, loading: authLoading, isAuthenticated, hasModule, logout } = useAuth();
  const { companies, activeCompany, activeCompanySlug, setActiveCompanySlug } = useActiveCompany();
  const displayPreferences = useDisplayPreferences();
  const standaloneProduct = String(window.__KYERP_DESKTOP_PRODUCT || "").trim().toUpperCase();
  const standalonePdks = standaloneProduct === "PDKS";
  const keepModuleMenuExpanded = displayPreferences.effectiveMode === "pc";
  const [moduleMenuOpen, setModuleMenuOpen] = useState(() => keepModuleMenuExpanded);
  const [moduleActionContext, setModuleActionContext] = useState({});

  const isAuditAccount = useMemo(() => {
    const username = String(user?.username || "").trim().toLocaleLowerCase("tr-TR");
    const role = String(user?.role || "").trim().toUpperCase();
    return role === "DENETIM" || username === "denetim" || String(user?.hrScope || "").toUpperCase() === "AUDIT";
  }, [user]);

  const visibleModules = useMemo(() => {
    let allowed = MODULES.filter((item) => hasModule(item.permissionKey));
    if (isAuditAccount) {
      allowed = allowed.filter((item) => !["admin", "asistan"].includes(item.key));
      allowed = allowed.map((item) => {
        if (item.key === "ik") return { ...item, groups: [{ label: "Personel", tabs: IK_AUDIT_TABS }], tabs: undefined, hiddenTabs: [] };
        if (item.key === "pdks") return { ...item, groups: [{ label: "PDKS Denetim", tabs: PDKS_AUDIT_TABS }], tabs: undefined, hiddenTabs: [] };
        return item;
      });
    }
    return standalonePdks ? allowed.filter((item) => item.key === "pdks") : allowed;
  }, [hasModule, isAuditAccount, standalonePdks]);

  const initialRoute = useMemo(() => {
    const requested = getInitialRoute(window.location.pathname);
    return normalizeRoute(requested, visibleModules) || requested;
  }, [visibleModules]);

  const {
    tabs: workspaceTabs,
    activeRoute,
    activeId,
    openTab: openWorkspaceTab,
    activateTab: activateWorkspaceRoute,
    closeTab: closeWorkspaceTab,
    closeAllTabs: closeAllWorkspaceTabs,
    replaceActiveRoute,
  } = useWorkspaceTabs(initialRoute, resolveLabel);

  const activeModule = visibleModules.find((item) => item.key === activeRoute.moduleKey) || visibleModules[0];
  const activeTab = findTab(activeModule, activeRoute.tabKey)?.[0] || getModuleTabs(activeModule)[0]?.[0] || "";

  const selectableCompanies = useMemo(() => {
    const activeRows = companies.filter((item) => item?.isActive !== false);
    return activeRows.length ? activeRows : companies;
  }, [companies]);

  const normalizedCompany = useMemo(() => {
    if (!companies.length) return activeCompany || null;
    const raw = String(activeCompanySlug || "").trim().toLocaleLowerCase("tr-TR");
    return companies.find((item) => [item?.id, item?.slug, item?.name].map((value) => String(value || "").toLocaleLowerCase("tr-TR")).includes(raw))
      || companies.find((item) => item?.isActive !== false)
      || companies[0]
      || null;
  }, [activeCompany, activeCompanySlug, companies]);

  useEffect(() => {
    if (!normalizedCompany?.slug || normalizedCompany.slug === activeCompanySlug) return;
    setActiveCompanySlug(normalizedCompany.slug);
  }, [activeCompanySlug, normalizedCompany, setActiveCompanySlug]);

  useEffect(() => {
    if (!isAuthenticated || !visibleModules.length) return;
    const normalized = normalizeRoute(activeRoute, visibleModules);
    if (!normalized) return;
    if (normalized.moduleKey !== activeRoute.moduleKey || normalized.tabKey !== activeRoute.tabKey) {
      replaceActiveRoute(normalized.moduleKey, normalized.tabKey);
      updateBrowserPath(normalized, true);
    }
  }, [activeRoute, isAuthenticated, replaceActiveRoute, visibleModules]);

  useEffect(() => {
    const onPopState = () => {
      const requested = getInitialRoute(window.location.pathname);
      const normalized = normalizeRoute(requested, visibleModules);
      if (normalized) replaceActiveRoute(normalized.moduleKey, normalized.tabKey);
      setModuleMenuOpen(keepModuleMenuExpanded);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [keepModuleMenuExpanded, replaceActiveRoute, visibleModules]);

  useEffect(() => {
    setModuleMenuOpen(keepModuleMenuExpanded);
  }, [keepModuleMenuExpanded]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") setModuleMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !activeRoute.moduleKey || !activeRoute.tabKey) return;
    updateBrowserPath(activeRoute, true);
  }, [activeRoute, isAuthenticated]);

  useEffect(() => {
    window.requestAnimationFrame(() => document.querySelector(".shell-v3-workspace")?.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }, [activeRoute]);

  const openTab = useCallback((moduleKey, tabKey, options = {}) => {
    const module = visibleModules.find((item) => item.key === moduleKey);
    if (!module) return;
    const nextTab = findTab(module, tabKey)?.[0] || getModuleTabs(module)[0]?.[0];
    if (!nextTab) return;
    preloadModule(moduleKey);
    if (options.actionContext) {
      setModuleActionContext({ ...options.actionContext, targetModule: moduleKey, targetTab: nextTab, nonce: String(Date.now()) });
    } else setModuleActionContext({});
    const next = openWorkspaceTab(moduleKey, nextTab);
    updateBrowserPath(next);
    setModuleMenuOpen(keepModuleMenuExpanded);
  }, [keepModuleMenuExpanded, openWorkspaceTab, visibleModules]);

  const toggleModuleMenu = useCallback((moduleKey) => {
    const module = visibleModules.find((item) => item.key === moduleKey);
    if (!module) return;
    preloadModule(moduleKey);
    if (activeModule?.key === moduleKey) {
      setModuleMenuOpen((current) => !current);
      return;
    }
    const nextTab = getModuleTabs(module)[0]?.[0];
    if (!nextTab) return;
    const next = openWorkspaceTab(moduleKey, nextTab);
    updateBrowserPath(next);
    setModuleMenuOpen(true);
  }, [activeModule?.key, openWorkspaceTab, visibleModules]);

  const activateWorkspaceTab = useCallback((item) => {
    activateWorkspaceRoute(item);
    updateBrowserPath(item);
    setModuleMenuOpen(keepModuleMenuExpanded);
  }, [activateWorkspaceRoute, keepModuleMenuExpanded]);

  function renderPage() {
    const sharedProps = {
      activeMainCompany: normalizedCompany,
      moduleActionContext,
      openModule: (moduleKey, options = {}) => openTab(moduleKey, options.tabKey, options),
    };

    if (activeModule?.key === "muhasebe" && activeTab === "envanter-urunleri") return <MuhasebeSmartMatchPage {...sharedProps} />;
    if (activeModule?.key === "muhasebe") return <MuhasebePage activeTab={activeTab} {...sharedProps} />;

    if (activeModule?.key === "isnet" && activeTab === "e-belge-merkezi") return <EBelgeCenterPage {...sharedProps} />;
    if (activeModule?.key === "isnet" && activeTab === "yonetim-merkezi") return <IsnetManagementCenterPage {...sharedProps} />;
    if (activeModule?.key === "isnet" && activeTab === "belge-akisi") return <IsnetDocumentCenterPage {...sharedProps} />;
    if (activeModule?.key === "isnet" && activeTab === "irsaliyeden-faturaya" && moduleActionContext?.targetModule === "isnet" && moduleActionContext?.targetTab === "irsaliyeden-faturaya" && moduleActionContext?.invoiceDraft && moduleActionContext?.sourceId) {
      return <IsnetPreparedInvoicePage {...sharedProps} />;
    }
    if (activeModule?.key === "isnet" && activeTab === "irsaliyeden-faturaya") return <IsnetWorkflowFinalPage {...sharedProps} />;
    if (activeModule?.key === "isnet" && ["kesilen-belgeler", "cikti-kuyrugu", "mail-merkezi"].includes(activeTab)) {
      const initialSection = activeTab === "cikti-kuyrugu" ? "selected-print" : activeTab === "mail-merkezi" ? "mail-merkezi" : "kesilen-belgeler";
      return <IsnetArchiveDeliveryPage {...sharedProps} initialSection={initialSection} />;
    }
    if (activeModule?.key === "isnet" && activeTab === "ayarlar") return <IsnetSettingsMasterPage {...sharedProps} />;
    if (activeModule?.key === "isnet") return <IsnetPage activeTab={activeTab} {...sharedProps} />;

    if (activeModule?.key === "desen") return <DesenPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "boyahane") return <BoyahanePage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "ik") {
      if (isAuditAccount) return <IkAuditPersonnelPage />;
      if (["personel-kartlari", "ucret-odeme-plani"].includes(activeTab)) {
        return <IkPersonnelFinancePage focus={activeTab === "ucret-odeme-plani" ? "ucret" : "personel"} {...sharedProps} />;
      }
      return <IkFinancePage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule?.key === "pdks") return <PdksPage activeTab={activeTab} isAuditAccount={isAuditAccount} {...sharedProps} />;
    if (activeModule?.key === "uretim") return <UretimPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "iletisim") return <CommunicationHubPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "asistan") return <AiAssistantPage {...sharedProps} />;
    return <AdminPage activeTab={activeTab} {...sharedProps} />;
  }

  if (authLoading) return <LoadingCard title="Oturum kontrol ediliyor" />;
  if (!isAuthenticated) return <LoginPage />;

  if (!visibleModules.length) {
    return <div className="content-card module-error-card" style={{ margin: 24 }}><h3>Modül yetkisi tanımlı değil</h3><p>Sistem yöneticisi kullanıcı yetkilerini güncellemelidir.</p></div>;
  }

  return (
    <AppShellV3
      modules={visibleModules}
      activeModule={activeModule}
      activeTab={activeTab}
      tabs={workspaceTabs}
      activeTabId={activeId}
      companies={selectableCompanies}
      activeCompanySlug={normalizedCompany?.slug || activeCompanySlug}
      user={user}
      displayPreferences={displayPreferences}
      standaloneProduct={standalonePdks ? "PDKS" : ""}
      mobileMenuOpen={moduleMenuOpen}
      onToggleModuleMenu={toggleModuleMenu}
      onOpenTab={(moduleKey, tabKey) => openTab(moduleKey, tabKey)}
      onActivateWorkspaceTab={activateWorkspaceTab}
      onCloseWorkspaceTab={closeWorkspaceTab}
      onCloseAllWorkspaceTabs={closeAllWorkspaceTabs}
      onCompanyChange={setActiveCompanySlug}
      onOpenMobileMenu={() => setModuleMenuOpen(true)}
      onCloseMobileMenu={() => setModuleMenuOpen(false)}
      onLogout={logout}
    >
      <ModuleErrorBoundary>
        <Suspense fallback={<LoadingCard />}>{renderPage()}</Suspense>
      </ModuleErrorBoundary>
    </AppShellV3>
  );
}