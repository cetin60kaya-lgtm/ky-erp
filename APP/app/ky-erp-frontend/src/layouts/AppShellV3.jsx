import { Bell, Menu, Search, X } from "lucide-react";
import { ErpIcon } from "../components/erp/IconMap";
import "../styles/shell-v3.css";

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
  onCompanyChange,
  onOpenMobileMenu,
  onCloseMobileMenu,
  onLogout,
  children,
}) {
  const moduleTabs = activeModule?.groups
    ? activeModule.groups.flatMap((group) => group.tabs)
    : activeModule?.tabs || [];
  const activeTabLabel = moduleTabs.find(([key]) => key === activeTab)?.[1] || "";

  return (
    <div className={`shell-v3 ${mobileMenuOpen ? "mobile-open" : ""}`}>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="shell-v3-overlay"
          aria-label="Menüyü kapat"
          onClick={onCloseMobileMenu}
        />
      ) : null}

      <aside className="shell-v3-rail">
        <button
          type="button"
          className="shell-v3-logo"
          onClick={() => onToggleModuleMenu("muhasebe")}
        >
          KY
        </button>
        <nav>
          {modules.map((module) => (
            <button
              type="button"
              key={module.key}
              className={activeModule?.key === module.key ? "active" : ""}
              onClick={() => onToggleModuleMenu(module.key)}
            >
              <ErpIcon name={module.icon || "dashboard"} size={21} />
              <span>{module.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <aside className="shell-v3-menu">
        <header>
          <div>
            <strong>KY ERP</strong>
            <span>{activeModule?.label || ""}</span>
          </div>
          <button type="button" aria-label="Menüyü kapat" onClick={onCloseMobileMenu}>
            <X size={17} />
          </button>
        </header>
        <div className="shell-v3-menu-scroll">
          {activeModule?.groups
            ? activeModule.groups.map((group) => (
                <section key={group.label}>
                  <h3>{group.label}</h3>
                  {group.tabs.map(([key, label, icon]) => (
                    <button
                      type="button"
                      key={key}
                      className={activeTab === key ? "active" : ""}
                      onClick={() => onOpenTab(activeModule.key, key)}
                    >
                      <ErpIcon name={icon || "dashboard"} size={17} />
                      <span>{label}</span>
                    </button>
                  ))}
                </section>
              ))
            : moduleTabs.map(([key, label, icon]) => (
                <button
                  type="button"
                  key={key}
                  className={activeTab === key ? "active" : ""}
                  onClick={() => onOpenTab(activeModule.key, key)}
                >
                  <ErpIcon name={icon || "dashboard"} size={17} />
                  <span>{label}</span>
                </button>
              ))}
        </div>
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
          <select
            value={activeCompanySlug || ""}
            onChange={(event) => onCompanyChange(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.slug} value={company.slug}>
                {company.name}
              </option>
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
                >
                  <X size={13} />
                </i>
              ) : null}
            </button>
          ))}
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
