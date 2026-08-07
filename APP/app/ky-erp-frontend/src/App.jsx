import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./App.css";
import "./app/appShell.css";
import {
  MODULES,
  findTab,
  getDefaultTabKey,
  getInitialRoute,
  getModuleGroups,
  normalizeModuleTabKey,
} from "./app/moduleRegistry";
import { useActiveCompany } from "./context/ActiveCompanyContext";
import { useAuth } from "./context/AuthContext";
import { ErpIcon } from "./components/erp/IconMap";
import MuhasebePage from "./pages/modules/MuhasebePage";
import LoginPage from "./pages/LoginPage";
import CompanySelectionPage from "./pages/CompanySelectionPage";
import PlatformAdminPage from "./pages/admin/PlatformAdminPage";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const AdminPage = lazyWithRetry(
  () => import("./pages/modules/AdminPage"),
  "admin",
);
const IkPage = lazyWithRetry(() => import("./pages/modules/IkPage"), "ik");
const UretimPage = lazyWithRetry(
  () => import("./pages/modules/UretimPage"),
  "uretim",
);
const BoyahanePage = lazyWithRetry(
  () => import("./pages/modules/BoyahanePage"),
  "boyahane",
);
const DesenPage = lazyWithRetry(
  () => import("./pages/modules/DesenPage"),
  "desen",
);
const IsnetPage = lazyWithRetry(
  () => import("./pages/modules/IsnetPage"),
  "isnet",
);
const AiAssistantPage = lazyWithRetry(
  () => import("./pages/modules/AiAssistantPage"),
  "asistan",
);

const MODULE_LOADERS = {
  muhasebe: () => {},
  admin: () => import("./pages/modules/AdminPage"),
  ik: () => import("./pages/modules/IkPage"),
  desen: () => import("./pages/modules/DesenPage"),
  uretim: () => import("./pages/modules/UretimPage"),
  boyahane: () => import("./pages/modules/BoyahanePage"),
  isnet: () => import("./pages/modules/IsnetPage"),
  asistan: () => import("./pages/modules/AiAssistantPage"),
};

function preloadModule(moduleKey) {
  MODULE_LOADERS[moduleKey]?.();
}

function ModuleLoadingFallback({ label }) {
  return (
    <div className="content-card module-loading-card">
      <h3>{label}</h3>
      <p>Ekran yükleniyor...</p>
    </div>
  );
}

class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recoveryKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("KY ERP module render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="content-card module-error-card">
          <h3>Ekran açılırken hata oluştu</h3>
          <p>{this.state.error?.message || "Beklenmeyen arayüz hatası."}</p>
          <button
            className="primary-btn"
            type="button"
            onClick={() =>
              this.setState((current) => ({
                error: null,
                recoveryKey: current.recoveryKey + 1,
              }))
            }
          >
            Tekrar Dene
          </button>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.recoveryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

function tabParts(tab) {
  return {
    key: tab?.[0] || "",
    label: tab?.[1] || "",
    icon: tab?.[2] || "dashboard",
  };
}

function routePath(moduleKey, tabKey, search = "") {
  const suffix = search
    ? String(search).startsWith("?")
      ? String(search)
      : `?${search}`
    : "";
  return `/${moduleKey}/${tabKey}${suffix}`;
}

export default function App() {
  const {
    user,
    loading: authLoading,
    isAuthenticated,
    hasModule,
    logout,
    leaveCompany,
    isPlatformAdmin,
    requiresCompanySelection,
  } = useAuth();
  const { companies, activeCompany, activeCompanySlug, setActiveCompanySlug } =
    useActiveCompany();
  const [route, setRoute] = useState(() => getInitialRoute());
  const [moduleActionContext, setModuleActionContext] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [assistantDialogContext, setAssistantDialogContext] = useState(null);

  const activeModule = route.moduleKey;
  const activeTab = route.tabKey;

  const visibleModules = useMemo(
    () => MODULES.filter((item) => hasModule(item.permissionKey)),
    [hasModule],
  );

  const navigationModules = useMemo(
    () => visibleModules.filter((item) => item.key !== "asistan"),
    [visibleModules],
  );

  const moduleConfig = useMemo(() => {
    const fallback = navigationModules[0] || visibleModules[0] || MODULES[0];
    return visibleModules.find((item) => item.key === activeModule) || fallback;
  }, [activeModule, navigationModules, visibleModules]);

  const activeTabConfig = findTab(moduleConfig, activeTab);
  const activeTabLabel = activeTabConfig?.[1] || "";
  const moduleGroups = getModuleGroups(moduleConfig);

  const hasActiveModuleAccess = Boolean(
    moduleConfig?.permissionKey && hasModule(moduleConfig.permissionKey),
  );

  const selectableCompanies = useMemo(() => {
    const activeRows = companies.filter((item) => item?.isActive !== false);
    return activeRows.length ? activeRows : companies;
  }, [companies]);

  const normalizedActiveMainCompany = useMemo(() => {
    if (!companies.length) return activeCompany || null;
    const bySlug = companies.find((item) => item.slug === activeCompanySlug);
    if (bySlug) return bySlug;

    const raw = String(activeCompanySlug || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const byLegacyValue = companies.find((item) =>
      [item?.id, item?.slug, item?.name]
        .map((value) => String(value || "").toLocaleLowerCase("tr-TR"))
        .includes(raw),
    );
    if (byLegacyValue) return byLegacyValue;

    return (
      companies.find((item) => item?.isActive !== false) ||
      companies[0] ||
      null
    );
  }, [activeCompany, activeCompanySlug, companies]);

  const writeRoute = useCallback(
    (moduleKey, tabKey, options = {}) => {
      const path = routePath(moduleKey, tabKey, options.search || "");
      const method = options.replace ? "replaceState" : "pushState";
      if (`${window.location.pathname}${window.location.search}` !== path) {
        window.history[method]({}, "", path);
      }
      setRoute({ moduleKey, tabKey });
    },
    [],
  );

  const openModule = useCallback(
    (moduleKey, options = {}) => {
      if (moduleKey === "asistan") {
        preloadModule("asistan");
        setAssistantDialogContext((previous) => ({
          ...(options.actionContext || {}),
          sourceModule:
            options.actionContext?.sourceModule || activeModule,
          sourceModuleLabel:
            options.actionContext?.sourceModuleLabel || moduleConfig?.label || "",
          sourceTab: options.actionContext?.sourceTab || activeTab,
          sourceTabLabel:
            options.actionContext?.sourceTabLabel || activeTabLabel,
          sourceRoute:
            options.actionContext?.sourceRoute ||
            `${window.location.pathname}${window.location.search}`,
          mainCompanyId:
            options.actionContext?.mainCompanyId ||
            normalizedActiveMainCompany?.id ||
            "",
          mainCompanySlug:
            options.actionContext?.mainCompanySlug ||
            normalizedActiveMainCompany?.slug ||
            "",
          mainCompanyName:
            options.actionContext?.mainCompanyName ||
            normalizedActiveMainCompany?.name ||
            "",
          nonce: String(Number(previous?.nonce || 0) + 1),
        }));
        setIsMobileMenuOpen(false);
        return;
      }

      const found = visibleModules.find((item) => item.key === moduleKey);
      if (!found) return;

      preloadModule(found.key);
      const requestedTab = normalizeModuleTabKey(found, options.tabKey);
      const nextTab = findTab(found, requestedTab)?.[0] || getDefaultTabKey(found);

      if (options.actionContext) {
        setModuleActionContext((previous) => ({
          ...options.actionContext,
          targetModule: found.key,
          targetTab: nextTab,
          nonce: String(Number(previous?.nonce || 0) + 1),
        }));
      }

      writeRoute(found.key, nextTab, {
        search: options.search,
        replace: options.replace,
      });
      setIsMobileMenuOpen(false);
    },
    [
      activeModule,
      activeTab,
      activeTabLabel,
      moduleConfig?.label,
      normalizedActiveMainCompany?.id,
      normalizedActiveMainCompany?.name,
      normalizedActiveMainCompany?.slug,
      visibleModules,
      writeRoute,
    ],
  );

  const setActiveTabWithRoute = useCallback(
    (tabKey) => {
      const normalized = normalizeModuleTabKey(moduleConfig, tabKey);
      const nextTab = findTab(moduleConfig, normalized)?.[0];
      if (!nextTab) return;
      writeRoute(moduleConfig.key, nextTab);
      setIsMobileMenuOpen(false);
    },
    [moduleConfig, writeRoute],
  );

  useEffect(() => {
    const onPopState = () => setRoute(getInitialRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isPlatformAdmin || normalizedActiveMainCompany) return;
    window.history.replaceState({}, "", "/admin");
    setRoute({ moduleKey: "admin", tabKey: "admin-yonetim-ozeti" });
  }, [isAuthenticated, isPlatformAdmin, normalizedActiveMainCompany]);

  useEffect(() => {
    const canonical = routePath(activeModule, activeTab, window.location.search);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== canonical) {
      window.history.replaceState({}, "", canonical);
    }
  }, [activeModule, activeTab]);

  useEffect(() => {
    if (!isAuthenticated || !navigationModules.length) return;
    const stillVisible = navigationModules.some(
      (item) => item.key === activeModule,
    );
    if (stillVisible || activeModule === "asistan") return;
    openModule(navigationModules[0].key, { replace: true });
  }, [
    activeModule,
    isAuthenticated,
    navigationModules,
    openModule,
  ]);

  useEffect(() => {
    if (!normalizedActiveMainCompany?.slug) return;
    if (activeCompanySlug !== normalizedActiveMainCompany.slug) {
      setActiveCompanySlug(normalizedActiveMainCompany.slug);
    }
  }, [
    activeCompanySlug,
    normalizedActiveMainCompany,
    setActiveCompanySlug,
  ]);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      [
        ".main-content",
        ".module-menu-list",
        ".kyerp-page",
        ".muhasebe-page",
        ".page-shell",
        ".module-page",
        ".content-grid",
      ].forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          element.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        });
      });
    };
    window.requestAnimationFrame(resetScroll);
    const timer = window.setTimeout(resetScroll, 80);
    return () => window.clearTimeout(timer);
  }, [activeModule, activeTab]);

  function renderPage() {
    if (!hasActiveModuleAccess) {
      return (
        <div className="content-card module-error-card">
          <h3>Yetkiniz yok</h3>
          <p>Bu modüle erişim yetkiniz bulunmuyor.</p>
        </div>
      );
    }

    const sharedProps = {
      activeMainCompany: normalizedActiveMainCompany,
      moduleActionContext,
      openModule,
    };

    if (activeModule === "muhasebe") {
      return <MuhasebePage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "isnet") {
      return <IsnetPage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "asistan") {
      return <AiAssistantPage {...sharedProps} />;
    }
    if (activeModule === "desen") {
      return <DesenPage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "boyahane") {
      return <BoyahanePage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "ik") {
      return <IkPage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "uretim") {
      return <UretimPage activeTab={activeTab} {...sharedProps} />;
    }
    if (isPlatformAdmin) return <PlatformAdminPage embedded />;
    return <AdminPage activeTab={activeTab} {...sharedProps} />;
  }

  if (authLoading) {
    return (
      <div className="content-card module-loading-card app-centered-state">
        <h3>Oturum kontrol ediliyor</h3>
        <p>Lütfen bekleyin...</p>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  if (requiresCompanySelection) return <CompanySelectionPage />;

  if (isPlatformAdmin && !normalizedActiveMainCompany) {
    return <PlatformAdminPage />;
  }

  if (!navigationModules.length) {
    return (
      <div className="content-card module-error-card app-centered-state">
        <h3>Modül yetkisi tanımlı değil</h3>
        <p>Sistem yöneticisi ile görüşerek kullanıcı yetkilerinizi güncelleyin.</p>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isMobileMenuOpen ? "mobile-open" : ""}`}>
      {isMobileMenuOpen ? (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Menüyü kapat"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <aside className="sidebar-thin" aria-label="Ana modüller">
        <div className="kyerp-rail-logo" title="KY ERP">
          <ErpIcon name="dashboard" size={22} />
        </div>
        {navigationModules.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`thin-nav-btn ${activeModule === item.key ? "active" : ""}`}
            onClick={() => openModule(item.key)}
            onMouseEnter={() => preloadModule(item.key)}
            title={item.label}
          >
            <span className="thin-nav-icon">
              <ErpIcon name={item.icon || "dashboard"} size={18} />
            </span>
            <span className="thin-nav-label">{item.label}</span>
          </button>
        ))}
      </aside>

      <aside className="sidebar-module" aria-label={`${moduleConfig.label} menüsü`}>
        <div className="kyerp-module-brand">
          <ErpIcon name={moduleConfig.icon || "dashboard"} size={22} />
          <strong>KY ERP</strong>
        </div>
        <div className="module-kicker">{moduleConfig.label}</div>
        <nav className="module-menu-list">
          {moduleGroups.map((group) => (
            <section className="module-menu-group" key={group.label || "main"}>
              {group.label ? (
                <div className="module-menu-group-title">{group.label}</div>
              ) : null}
              {(group.tabs || []).map((rawTab) => {
                const tab = tabParts(rawTab);
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`module-menu-btn ${activeTab === tab.key ? "active" : ""}`}
                    onClick={() => setActiveTabWithRoute(tab.key)}
                    onMouseEnter={() => preloadModule(activeModule)}
                  >
                    <ErpIcon name={tab.icon} size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="kyerp-global-topbar">
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Menüyü aç"
          >
            <ErpIcon name="dashboard" size={20} />
          </button>
          <div className="kyerp-global-crumb">
            <span>KY ERP</span>
            <span>/</span>
            <span>{moduleConfig.label}</span>
            {activeTabLabel ? (
              <>
                <span>/</span>
                <strong>{activeTabLabel}</strong>
              </>
            ) : null}
          </div>
          <select
            className="top-select main-company-select"
            value={normalizedActiveMainCompany?.slug || ""}
            disabled={!selectableCompanies.length}
            onChange={(event) => setActiveCompanySlug(event.target.value)}
            aria-label="Aktif ana firma"
          >
            {!selectableCompanies.length ? (
              <option value="">Ana firma bulunamadı</option>
            ) : null}
            {selectableCompanies.map((item) => (
              <option key={item.slug || item.id} value={item.slug || item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="kyerp-user-chip" style={{ minWidth: 190 }}>
            <div>
              <strong>{isPlatformAdmin ? "Sistem Yöneticisi" : normalizedActiveMainCompany?.name || "Firma"}</strong>
              <small style={{ display: "block" }}>
                {isPlatformAdmin ? `Görüntülenen Firma: ${normalizedActiveMainCompany?.name || "Seçilmedi"}` : user?.username}
              </small>
            </div>
            {isPlatformAdmin && normalizedActiveMainCompany ? (
              <button type="button" className="topbar-icon-btn" onClick={leaveCompany} title="Firma Değiştir">Firma Değiştir</button>
            ) : null}
          </div>
          <div className="kyerp-user-chip">
            <div className="kyerp-avatar">
              {String(user?.fullName || user?.username || "U")
                .trim()
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div className="kyerp-user-meta">
              <strong>{user?.fullName || user?.username}</strong>
              <span>{user?.role || "-"}</span>
            </div>
            <button type="button" className="logout-btn" onClick={logout}>
              Çıkış
            </button>
          </div>
        </header>

        <ModuleErrorBoundary key={`${activeModule}-${activeTab}`}>
          <Suspense
            fallback={<ModuleLoadingFallback label={moduleConfig.label} />}
          >
            {renderPage()}
          </Suspense>
        </ModuleErrorBoundary>
      </main>

      {hasModule("ASISTAN") ? (
        <button
          type="button"
          className="kyerp-ai-fab"
          onClick={() => openModule("asistan", { tabKey: "sohbet" })}
        >
          <ErpIcon name="dashboard" size={18} />
          <span>Asistana Sor</span>
        </button>
      ) : null}

      {assistantDialogContext && hasModule("ASISTAN") ? (
        <div
          className="ai-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setAssistantDialogContext(null);
            }
          }}
        >
          <div
            className="ai-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="KY ERP Asistan"
          >
            <AiAssistantPage
              activeMainCompany={normalizedActiveMainCompany}
              moduleActionContext={assistantDialogContext}
              modal
              onClose={() => setAssistantDialogContext(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
