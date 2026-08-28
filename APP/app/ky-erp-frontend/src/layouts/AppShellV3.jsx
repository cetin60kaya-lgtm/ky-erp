import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, Command, Menu, Plus, Search, X } from "lucide-react";
import { ErpIcon } from "../components/erp/IconMap";
import "../styles/shell-v3.css";

function getTabs(module) {
  if (!module) return [];
  return module.groups
    ? module.groups.flatMap((group) => group.tabs)
    : module.tabs || [];
}

const QUICK_ACTIONS = [
  { id: "quick-production", moduleKey: "uretim", tabKey: "uretim-hizli-giris", label: "Akıllı Üretim Fişi", description: "Model, adet, bölge, vardiya ve makinacıyı serbest metinden çözümle.", keywords: "imalat üretim fiş hızlı adet makine vardiya" },
  { id: "production-pool", moduleKey: "uretim", tabKey: "uretim-is-havuzu", label: "Üretim İş Havuzu", description: "İrsaliyeye bağlı işi seç, sakatları ayır ve net sağlam adedi kaydet.", keywords: "irsaliye baskı sakatı kumaş sakatı net sağlam" },
  { id: "production-balance", moduleKey: "uretim", tabKey: "uretim-denge", label: "İrsaliye / Üretim Dengesi", description: "Gelen adet, operasyonlar, eksik, fazla ve sakat durumunu aç.", keywords: "denge eksik fazla irsaliye rapor" },
  { id: "isnet-workflow", moduleKey: "isnet", tabKey: "is-akisi", label: "İrsaliyeyi Modele Bağla", description: "İşNet gelen irsaliyesini tek merkez modele ve üretim planına bağla.", keywords: "işnet irsaliye model bağla eşleştir" },
  { id: "quick-model", moduleKey: "isnet", tabKey: "yonetim-merkezi", label: "Hızlı Model Aç", description: "Modeli Desen merkezinde aç; bütün modüller aynı kimliği kullansın.", keywords: "desen model hızlı yeni kart" },
  { id: "dyehouse-job", moduleKey: "boyahane", tabKey: "is-akisi", label: "Boyahane İşi Başlat", description: "Desen modelini kuyruğa al, kayıtlı renk ve reçeteyle devam et.", keywords: "boyahane boya iş reçete renk" },
  { id: "dye-recipe", moduleKey: "boyahane", tabKey: "receteler", label: "Hızlı Reçete", description: "Kayıtlı renk reçetesini aç veya yeni sürüm oluştur.", keywords: "reçete pantone boya hızlı" },
  { id: "current-account", moduleKey: "muhasebe", tabKey: "cari-hareketler", label: "Hızlı Cari İşlem", description: "Firma hareketi, ödeme veya düzeltme girişine geç.", keywords: "muhasebe cari ödeme tahsilat hareket" },
  { id: "check-payment", moduleKey: "muhasebe", tabKey: "cek-odeme", label: "Hızlı Çek / Ödeme", description: "Çek ve ödeme takip ekranını aç.", keywords: "çek ödeme banka vade" },
  { id: "hr-entry", moduleKey: "ik", tabKey: "mesai-avans", label: "Hızlı Mesai / Avans", description: "Mesai, avans veya kesinti işlemini aç.", keywords: "ik personel mesai avans kesinti" },
];

function normalize(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const activeTabLabel = getTabs(activeModule).find(([key]) => key === activeTab)?.[1] || "";

  const quickActions = useMemo(() => {
    const moduleMap = new Map(modules.map((item) => [item.key, item]));
    const query = normalize(quickSearch);
    return QUICK_ACTIONS.filter((action) => {
      const module = moduleMap.get(action.moduleKey);
      if (!module) return false;
      const visibleTabs = new Set(getTabs(module).map(([key]) => key));
      if (!visibleTabs.has(action.tabKey)) return false;
      if (!query) return true;
      return normalize(`${action.label} ${action.description} ${action.keywords}`).includes(query);
    });
  }, [modules, quickSearch]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("tr-TR") === "k") {
        event.preventDefault();
        setQuickOpen((current) => !current);
      }
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => { if (!quickOpen) setQuickSearch(""); }, [quickOpen]);

  function runQuickAction(action) {
    onOpenTab(action.moduleKey, action.tabKey);
    setQuickOpen(false);
  }

  return (
    <div className={`shell-v3 ${mobileMenuOpen ? "mobile-open" : ""}`}>
      <button type="button" className="shell-v3-overlay" aria-label="Menüyü kapat" onClick={onCloseMobileMenu} />

      <aside className="shell-v3-sidebar">
        <header className="shell-v3-sidebar-brand">
          <button type="button" className="shell-v3-brand-button" onClick={() => onToggleModuleMenu("muhasebe")}>
            <b>KY</b><span><strong>KY ERP</strong><small>{activeModule?.label || "Yönetim Sistemi"}</small></span>
          </button>
          <button type="button" className="shell-v3-sidebar-close" aria-label="Menüyü kapat" onClick={onCloseMobileMenu}><X size={18} /></button>
        </header>

        <nav className="shell-v3-sidebar-nav" aria-label="Ana modüller">
          {modules.map((module) => {
            const isActiveModule = activeModule?.key === module.key;
            const isExpanded = isActiveModule && mobileMenuOpen;
            return (
              <section key={module.key} className={`shell-v3-module ${isActiveModule ? "active" : ""}`}>
                <button type="button" className="shell-v3-module-button" onClick={() => onToggleModuleMenu(module.key)} aria-expanded={isExpanded}>
                  <ErpIcon name={module.icon || "dashboard"} size={18} /><span>{module.label}</span><ChevronDown size={15} className={isExpanded ? "expanded" : ""} />
                </button>
                {isExpanded ? (
                  <div className="shell-v3-submenu">
                    {module.groups
                      ? module.groups.map((group) => (
                          <div key={group.label} className="shell-v3-submenu-group">
                            <h3>{group.label}</h3>
                            {group.tabs.map(([key, label, icon]) => (
                              <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                                <ErpIcon name={icon || "dashboard"} size={15} /><span>{label}</span>
                              </button>
                            ))}
                          </div>
                        ))
                      : getTabs(module).map(([key, label, icon]) => (
                          <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                            <ErpIcon name={icon || "dashboard"} size={15} /><span>{label}</span>
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
          <button type="button" className="shell-v3-icon mobile" onClick={onOpenMobileMenu} aria-label="Menüyü aç"><Menu size={19} /></button>
          <label className="shell-v3-search"><Search size={17} /><input placeholder="Firma, belge, model veya ürün ara" /></label>
          <button type="button" className="shell-v3-quick-button" onClick={() => setQuickOpen(true)}><Plus size={16} /><span>Hızlı İşlem</span><kbd>Ctrl K</kbd></button>
          <select value={activeCompanySlug || ""} onChange={(event) => onCompanyChange(event.target.value)}>
            {companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}</option>)}
          </select>
          <button type="button" className="shell-v3-icon notification" aria-label="Bildirimler"><Bell size={18} /><span>3</span></button>
          <div className="shell-v3-user">
            <b>{String(user?.fullName || user?.username || "U").slice(0, 1).toUpperCase()}</b>
            <div><strong>{user?.fullName || user?.username || "Kullanıcı"}</strong><small>{user?.role || "-"}</small></div>
            <button type="button" onClick={onLogout}>Çıkış</button>
          </div>
        </header>

        <div className="shell-v3-tabs-bar">
          <div className="shell-v3-tabs">
            {tabs.map((tab) => (
              <button type="button" key={tab.id} className={activeTabId === tab.id ? "active" : ""} onClick={() => onActivateWorkspaceTab(tab)}>
                <span>{tab.label}</span>
                {tabs.length > 1 ? (
                  <i role="button" tabIndex={0} aria-label="Sekmeyi kapat" onClick={(event) => { event.stopPropagation(); onCloseWorkspaceTab(tab.id); }} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onCloseWorkspaceTab(tab.id); }
                  }}><X size={13} /></i>
                ) : null}
              </button>
            ))}
          </div>
          <button type="button" className="shell-v3-close-all" onClick={onCloseAllWorkspaceTabs} disabled={tabs.length <= 1} title="Diğer açık sekmelerin tamamını kapat">
            <X size={14} /><span>Tümünü Kapat</span>
          </button>
        </div>

        <div className="shell-v3-crumb"><span>KY ERP</span><span>/</span><span>{activeModule?.label}</span>{activeTabLabel ? <><span>/</span><strong>{activeTabLabel}</strong></> : null}</div>
        <section className="shell-v3-workspace">{children}</section>
        <footer className="shell-v3-status"><span>KY ERP</span><span>Firma: {companies.find((item) => item.slug === activeCompanySlug)?.name || "-"}</span><span className="ok">Sistem hazır</span></footer>
      </main>

      {quickOpen ? (
        <div className="shell-v3-quick-backdrop" role="presentation" onMouseDown={() => setQuickOpen(false)}>
          <section className="shell-v3-quick-palette" role="dialog" aria-modal="true" aria-label="Hızlı işlemler" onMouseDown={(event) => event.stopPropagation()}>
            <header><Command size={19} /><input autoFocus value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="İşlem ara: üretim fişi, model, reçete, cari..." /><button type="button" onClick={() => setQuickOpen(false)} aria-label="Kapat"><X size={18} /></button></header>
            <div className="shell-v3-quick-list">
              {quickActions.map((action, index) => (
                <button type="button" key={action.id} className="shell-v3-quick-action" onClick={() => runQuickAction(action)} onKeyDown={(event) => { if (event.key === "Enter") runQuickAction(action); }}>
                  <b>{index + 1}</b><span><strong>{action.label}</strong><small>{action.description}</small></span><em>{modules.find((item) => item.key === action.moduleKey)?.label}</em>
                </button>
              ))}
              {!quickActions.length ? <div className="shell-v3-quick-empty">Aramaya uygun hızlı işlem bulunamadı.</div> : null}
            </div>
            <footer><span><kbd>Ctrl</kbd> + <kbd>K</kbd> ile her ekrandan açılır.</span><span>Seçilen işlem yeni çalışma sekmesinde açılır.</span></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
