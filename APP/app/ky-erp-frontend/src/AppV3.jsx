import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "./context/ActiveCompanyContext";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import MuhasebePage from "./pages/modules/MuhasebePage";
import { lazyWithRetry } from "./utils/lazyWithRetry";
import { MODULES, findModule, findTab, getInitialRoute, getModuleTabs } from "./app/moduleRegistry";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";
import AppShellV3 from "./layouts/AppShellV3";

const AdminPage = lazyWithRetry(() => import("./pages/modules/AdminPage"), "admin-v3");
const IkPage = lazyWithRetry(() => import("./pages/modules/IkPage"), "ik-v3");
const UretimPage = lazyWithRetry(() => import("./pages/modules/UretimPage"), "uretim-v3");
const BoyahanePage = lazyWithRetry(() => import("./pages/modules/BoyahanePage"), "boyahane-v3");
const DesenPage = lazyWithRetry(() => import("./pages/modules/DesenPage"), "desen-v3");
const IsnetPage = lazyWithRetry(() => import("./pages/modules/IsnetPage"), "isnet-v3");
const AiAssistantPage = lazyWithRetry(() => import("./pages/modules/AiAssistantPage"), "asistan-v3");

const MODULE_LOADERS = {
  muhasebe: () => Promise.resolve(),
  admin: () => import("./pages/modules/AdminPage"),
  ik: () => import("./pages/modules/IkPage"),
  desen: () => import("./pages/modules/DesenPage"),
  uretim: () => import("./pages/modules/UretimPage"),
  boyahane: () => import("./pages/modules/BoyahanePage"),
  isnet: () => import("./pages/modules/IsnetPage"),
  asistan: () => import("./pages/modules/AiAssistantPage"),
};

function preloadModule(moduleKey) {
  MODULE_LOADERS[moduleKey]?.().catch(() => {});
}

function resolveLabel(moduleKey, tabKey) {
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
    if (this.state.error) {
      return (
        <div className="content-card module-error-card">
          <h3>Ekran açılırken hata oluştu</h3>
          <p>{this.state.error?.message || "Beklenmeyen arayüz hatası."}</p>
          <button type="button" className="primary-btn" onClick={() => this.setState((current) => ({ error: null, recoveryKey: current.recoveryKey + 1 }))}>Tekrar Dene</button>
        </div>
      );
    }
    return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
  }
}

export default function AppV3() {
  const { user, loading: authLoading, isAuthenticated, hasModule, logout } = useAuth();
  const { companies, activeCompany, activeCompanySlug, setActiveCompanySlug } = useActiveCompany();
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const [moduleActionContext, setModuleActionContext] = useState({});

  const visibleModules = useMemo(() => MODULES.filter((item) => hasModule(item.permissionKey)), [hasModule]);
  const initialRoute = useMemo(() => {
    const requested = getInitialRoute(window.location.pathname);
    return normalizeRoute(requested, visibleModules) || requested;
  }, [visibleModules]);

  const workspace = useWorkspaceTabs(initialRoute, resolveLabel);
  const activeModule = visibleModules.find((item) => item.key === workspace.activeRoute.moduleKey) || visibleModules[0];
  const activeTab = findTab(activeModule, workspace.activeRoute.tabKey)?.[0] || getModuleTabs(activeModule)[0]?.[0] || "";

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
    const normalized = normalizeRoute(workspace.activeRoute, visibleModules);
    if (!normalized) return;
    if (normalized.moduleKey !== workspace.activeRoute.moduleKey || normalized.tabKey !== workspace.activeRoute.tabKey) {
      workspace.replaceActiveRoute(normalized.moduleKey, normalized.tabKey);
      updateBrowserPath(normalized, true);
    }
  }, [isAuthenticated, visibleModules, workspace.activeRoute, workspace.replaceActiveRoute]);

  useEffect(() => {
    const onPopState = () => {
      const requested = getInitialRoute(window.location.pathname);
      const normalized = normalizeRoute(requested, visibleModules);
      if (normalized) workspace.replaceActiveRoute(normalized.moduleKey, normalized.tabKey);
      setModuleMenuOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [visibleModules, workspace.replaceActiveRoute]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setModuleMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!workspace.activeRoute.moduleKey || !workspace.activeRoute.tabKey) return;
    updateBrowserPath(workspace.activeRoute, true);
  }, [workspace.activeRoute.moduleKey, workspace.activeRoute.tabKey]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.querySelector(".shell-v3-workspace")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [workspace.activeRoute]);

  const openTab = useCallback((moduleKey, tabKey, options = {}) => {
    const module = visibleModules.find((item) => item.key === moduleKey);
    if (!module) return;
    const nextTab = findTab(module, tabKey)?.[0] || getModuleTabs(module)[0]?.[0];
    if (!nextTab) return;
    preloadModule(moduleKey);
    if (options.actionContext) {
      setModuleActionContext({ ...options.actionContext, targetModule: moduleKey, targetTab: nextTab, nonce: String(Date.now()) });
    }
    const next = workspace.openTab(moduleKey, nextTab);
    updateBrowserPath(next);
    setModuleMenuOpen(false);
  }, [visibleModules, workspace.openTab]);

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
    const next = workspace.openTab(moduleKey, nextTab);
    updateBrowserPath(next);
    setModuleMenuOpen(true);
  }, [activeModule?.key, visibleModules, workspace.openTab]);

  const activateWorkspaceTab = useCallback((item) => {
    workspace.activateTab(item);
    updateBrowserPath(item);
    setModuleMenuOpen(false);
  }, [workspace.activateTab]);

  function renderPage() {
    const sharedProps = {
      activeMainCompany: normalizedCompany,
      moduleActionContext,
      openModule: (moduleKey, options = {}) => openTab(moduleKey, options.tabKey, options),
    };
    if (activeModule?.key === "muhasebe") return <MuhasebePage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "isnet") return <IsnetPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "desen") return <DesenPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "boyahane") return <BoyahanePage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "ik") return <IkPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "uretim") return <UretimPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule?.key === "asistan") return <AiAssistantPage {...sharedProps} />;
    return <AdminPage activeTab={activeTab} {...sharedProps} />;
  }

  if (authLoading) return <LoadingCard title="Oturum kontrol ediliyor" />;
  if (!isAuthenticated) return <LoginPage />;
  if (!visibleModules.length) return <div className="content-card module-error-card" style={{ margin: 24 }}><h3>Modül yetkisi tanımlı değil</h3><p>Sistem yöneticisi kullanıcı yetkilerini güncellemelidir.</p></div>;

  return (
    <AppShellV3
      modules={visibleModules}
      activeModule={activeModule}
      activeTab={activeTab}
      tabs={workspace.tabs}
      activeTabId={workspace.activeId}
      companies={selectableCompanies}
      activeCompanySlug={normalizedCompany?.slug || activeCompanySlug}
      user={user}
      mobileMenuOpen={moduleMenuOpen}
      onToggleModuleMenu={toggleModuleMenu}
      onOpenTab={(moduleKey, tabKey) => openTab(moduleKey, tabKey)}
      onActivateWorkspaceTab={activateWorkspaceTab}
      onCloseWorkspaceTab={workspace.closeTab}
      onCompanyChange={setActiveCompanySlug}
      onOpenMobileMenu={() => setModuleMenuOpen(true)}
      onCloseMobileMenu={() => setModuleMenuOpen(false)}
      onLogout={logout}
    >
      <ModuleErrorBoundary key={`${activeModule?.key}:${activeTab}`}>
        <Suspense fallback={<LoadingCard />}>{renderPage()}</Suspense>
      </ModuleErrorBoundary>
    </AppShellV3>
  );
}
