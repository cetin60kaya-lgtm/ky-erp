import { Bell, ChevronDown, Menu, Search, X } from "lucide-react";
import { ErpIcon } from "../components/erp/IconMap";
import "../styles/shell-v3.css";

function getTabs(module) {
  if (!module) return [];
  return module.groups
    ? module.groups.flatMap((group) => group.tabs)
    : module.tabs || [];
}

export default function AppShellV3({
  modules,
  activeModule,
  activeTab,
  tabs,
  activeTabId,
  companies,
  activeCompanySlug,
  user,
  mobileMenuOpen,
  onToggleModuleMenu,
  onOpenTab,
  onActivateWorkspaceTab,
  onCloseWorkspaceTab,
  onCloseAllWorkspaceTabs,
  onCompanyChange,
  onOpenMobileMenu,
  onCloseMobileMenu,
  onLogout,
  children,
}) {
  const activeTabLabel = getTabs(activeModule).find(([key]) => key === activeTab)?.[1] || "";

  return (
    <div className={`shell-v3 ${mobileMenuOpen ? "mobile-open" : ""}`}>
      <button
        type="button"
        className="shell-v3-overlay"
        aria-label="Menüyü kapat"
        onClick={onCloseMobileMenu}
      />

      <aside className="shell-v3-sidebar">
        <header className="shell-v3-sidebar-brand">
          <button type="button" className="shell-v3-brand-button" onClick={() => onToggleModuleMenu("muhasebe")}>
            <b>KY</b>
            <span>
              <strong>KY ERP</strong>
              <small>{activeModule?.label || "Yönetim Sistemi"}</small>
            </span>
          </button>
          <button type="button" className="shell-v3-sidebar-close" aria-label="Menüyü kapat" onClick={onCloseMobileMenu}>
            <X size={18} />
          </button>
        </header>

        <nav className="shell-v3-sidebar-nav" aria-label="Ana modüller">
          {modules.map((module) => {
            const isActiveModule = activeModule?.key === module.key;
            const isExpanded = isActiveModule && mobileMenuOpen;

            return (
              <section key={module.key} className={`shell-v3-module ${isActiveModule ? "active" : ""}`}>
                <button
                  type="button"
                  className="shell-v3-module-button"
                  onClick={() => onToggleModuleMenu(module.key)}
                  aria-expanded={isExpanded}
                >
                  <ErpIcon name={module.icon || "dashboard"} size={18} />
                  <span>{module.label}</span>
                  <ChevronDown size={15} className={isExpanded ? "expanded" : ""} />
                </button>

                {isExpanded ? (
                  <div className="shell-v3-submenu">
                    {module.groups
                      ? module.groups.map((group) => (
                          <div key={group.label} className="shell-v3-submenu-group">
                            <h3>{group.label}</h3>
                            {group.tabs.map(([key, label, icon]) => (
                              <button
                                type="button"
                                key={key}
                                className={activeTab === key ? "active" : ""}
                                onClick={() => onOpenTab(module.key, key)}
                              >
                                <ErpIcon name={icon || "dashboard"} size={15} />
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        ))
                      : getTabs(module).map(([key, label, icon]) => (
                          <button
                            type="button"
                            key={key}
                            className={activeTab === key ? "active" : ""}
                            onClick={() => onOpenTab(module.key, key)}
                          >
                            <ErpIcon name={icon || "dashboard"} size={15} />
                            <span>{label}</span>
                          </button>
                        ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
      </aside>

      <main className="shell-v3-main">
        <header className="shell-v3-topbar">
          <button
            type="button"
            className="shell-v3-icon mobile"
            onClick={onOpenMobileMenu}
            aria-label="Menüyü aç"
          >
            <Menu size={19} />
          </button>

          <label className="shell-v3-search">
            <Search size={17} />
            <input placeholder="Firma, belge, model veya ürün ara" />
          </label>

          <select value={activeCompanySlug || ""} onChange={(event) => onCompanyChange(event.target.value)}>
            {companies.map((company) => (
              <option key={company.slug} value={company.slug}>{company.name}</option>
            ))}
          </select>

          <button type="button" className="shell-v3-icon notification" aria-label="Bildirimler">
            <Bell size={18} />
            <span>3</span>
          </button>

          <div className="shell-v3-user">
            <b>{String(user?.fullName || user?.username || "U").slice(0, 1).toUpperCase()}</b>
            <div>
              <strong>{user?.fullName || user?.username || "Kullanıcı"}</strong>
              <small>{user?.role || "-"}</small>
            </div>
            <button type="button" onClick={onLogout}>Çıkış</button>
          </div>
        </header>

        <div className="shell-v3-tabs-bar">
          <div className="shell-v3-tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeTabId === tab.id ? "active" : ""}
                onClick={() => onActivateWorkspaceTab(tab)}
              >
                <span>{tab.label}</span>
                {tabs.length > 1 ? (
                  <i
                    role="button"
                    tabIndex={0}
                    aria-label="Sekmeyi kapat"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseWorkspaceTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onCloseWorkspaceTab(tab.id);
                      }
                    }}
                  >
                    <X size={13} />
                  </i>
                ) : null}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="shell-v3-close-all"
            onClick={onCloseAllWorkspaceTabs}
            disabled={tabs.length <= 1}
            title="Diğer açık sekmelerin tamamını kapat"
          >
            <X size={14} />
            <span>Tümünü Kapat</span>
          </button>
        </div>

        <div className="shell-v3-crumb">
          <span>KY ERP</span><span>/</span><span>{activeModule?.label}</span>
          {activeTabLabel ? <><span>/</span><strong>{activeTabLabel}</strong></> : null}
        </div>

        <section className="shell-v3-workspace">{children}</section>

        <footer className="shell-v3-status">
          <span>KY ERP</span>
          <span>Firma: {companies.find((item) => item.slug === activeCompanySlug)?.name || "-"}</span>
          <span className="ok">Sistem hazır</span>
        </footer>
      </main>
    </div>
  );
}
