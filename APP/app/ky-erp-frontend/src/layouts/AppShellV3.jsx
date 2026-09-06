import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, ChevronDown, Command, Menu, Monitor, Plus, RefreshCw, Search, X } from "lucide-react";
import { ErpIcon } from "../components/erp/IconMap";
import { displayModeLabel } from "../utils/displayPreferences";
import DisplaySettingsPanel from "./DisplaySettingsPanel";
import { getNotifications, markNotificationsRead } from "../services/notificationApi";
import "../styles/shell-v3.css";
import "../styles/responsive-core.css";

const OWNER_ONLY_ADMIN_TABS = new Set(["uygulama-sahibi", "firma-ucretlendirme", "eslestirmeler"]);

function isOwnerUser(user) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(user?.role || "").toUpperCase().replace(/İ/g, "I"));
}
function roleLabel(role) {
  const value=String(role||"").toUpperCase().replace(/İ/g,"I");
  return ({SUPER_ADMIN:"Süper Yönetici",ADMIN:"Süper Yönetici",COMPANY_ADMIN:"Firma Sahibi / İşveren",MUHASEBE:"Muhasebe",DESEN:"Desen",IMALAT:"İmalat",BOYAHANE:"Boyahane",IK:"İK",DENETIM:"Denetim",VIEWER:"Özel Yetkili"})[value] || role || "-";
}

function tabVisible(module, tab, user) {
  if (!module || !tab) return false;
  if (module.key === "admin" && OWNER_ONLY_ADMIN_TABS.has(tab[0])) return isOwnerUser(user);
  return true;
}

function visibleGroups(module, user) {
  if (!module?.groups) return [];
  return module.groups
    .map((group) => ({ ...group, tabs: (group.tabs || []).filter((tab) => tabVisible(module, tab, user)) }))
    .filter((group) => group.tabs.length);
}

function getTabs(module, user) {
  if (!module) return [];
  return module.groups
    ? visibleGroups(module, user).flatMap((group) => group.tabs)
    : (module.tabs || []).filter((tab) => tabVisible(module, tab, user));
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

function notificationCategoryLabel(category) {
  if (category === "SECURITY") return "Güvenlik";
  if (category === "APPROVAL") return "Onay";
  if (category === "E_BELGE") return "e-Belge";
  if (category === "PAYMENT") return "Ödeme";
  return "Sistem";
}

function notificationTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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
  displayPreferences,
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
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [notificationData, setNotificationData] = useState({
    items: [],
    unreadCount: 0,
    totalCount: 0,
    partial: false,
    sourceErrors: [],
    generatedAt: "",
  });
  const activeTabLabel = getTabs(activeModule, user).find(([key]) => key === activeTab)?.[1] || "";

  const refreshNotifications = useCallback(async (silent = false) => {
    const normalizedRole = String(user?.role || "").toUpperCase().replace(/İ/g, "I");
    if (!user?.id || normalizedRole === "DENETIM") {
      setNotificationData((current) => ({ ...current, items: [], unreadCount: 0, totalCount: 0 }));
      setNotificationError("");
      return;
    }
    if (!silent) setNotificationLoading(true);
    setNotificationError("");
    try {
      const data = await getNotifications();
      setNotificationData({
        items: Array.isArray(data?.items) ? data.items : [],
        unreadCount: Number(data?.unreadCount || 0),
        totalCount: Number(data?.totalCount || 0),
        partial: Boolean(data?.partial),
        sourceErrors: Array.isArray(data?.sourceErrors) ? data.sourceErrors : [],
        generatedAt: data?.generatedAt || "",
      });
    } catch (error) {
      setNotificationError(error?.message || "Bildirimler alınamadı.");
    } finally {
      if (!silent) setNotificationLoading(false);
    }
  }, [activeCompanySlug, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    refreshNotifications(true);
    const timer = window.setInterval(() => refreshNotifications(true), 60_000);
    const onFocus = () => refreshNotifications(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshNotifications, user?.id]);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notificationOpen]);

  const quickActions = useMemo(() => {
    const moduleMap = new Map(modules.map((item) => [item.key, item]));
    const query = normalize(quickSearch);
    return QUICK_ACTIONS.filter((action) => {
      const module = moduleMap.get(action.moduleKey);
      if (!module) return false;
      const visibleTabs = new Set(getTabs(module, user).map(([key]) => key));
      if (!visibleTabs.has(action.tabKey)) return false;
      if (!query) return true;
      return normalize(`${action.label} ${action.description} ${action.keywords}`).includes(query);
    });
  }, [modules, quickSearch, user]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("tr-TR") === "k") {
        event.preventDefault();
        setQuickOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setQuickOpen(false);
        setDisplaySettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => { if (!quickOpen) setQuickSearch(""); }, [quickOpen]);

  function runQuickAction(action) {
    onOpenTab(action.moduleKey, action.tabKey);
    setQuickOpen(false);
  }

  function applyNotificationRead(ids) {
    const readIds = new Set(ids);
    setNotificationData((current) => {
      const items = current.items.map((item) => readIds.has(item.id) ? { ...item, unread: false } : item);
      return { ...current, items, unreadCount: items.filter((item) => item.unread).length };
    });
  }

  async function markNotificationIdsRead(ids) {
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return;
    applyNotificationRead(clean);
    try {
      await markNotificationsRead(clean);
    } catch {
      refreshNotifications(true);
    }
  }

  function openNotification(item) {
    if (item?.unread) markNotificationIdsRead([item.id]);
    if (item?.route?.moduleKey && item?.route?.tabKey) {
      onOpenTab(item.route.moduleKey, item.route.tabKey);
    }
    setNotificationOpen(false);
  }

  function markAllNotificationsRead() {
    const unreadIds = notificationData.items.filter((item) => item.unread).map((item) => item.id);
    markNotificationIdsRead(unreadIds);
  }

  const effectiveMode = displayPreferences?.effectiveMode || "pc";
  const effectiveScale = Number(displayPreferences?.effectiveScale || 100);
  const scaleFactor = effectiveScale / 100;
  const displayLabel = displayModeLabel(effectiveMode);
  const shellStyle = useMemo(() => {
    if (effectiveScale === 100) return undefined;
    return {
      zoom: scaleFactor,
      width: `${100 / scaleFactor}vw`,
      height: `${100 / scaleFactor}dvh`,
      maxWidth: "none",
    };
  }, [effectiveScale, scaleFactor]);

  return (
    <div
      className={`shell-v3 ${mobileMenuOpen ? "mobile-open" : ""}`}
      data-layout-mode={effectiveMode}
      data-layout-preference={displayPreferences?.preferences?.mode || "auto"}
      data-ui-scale={effectiveScale}
      style={shellStyle}
    >
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
            const hasPrimarySidebarGroups = Array.isArray(module.sidebarGroups) && module.sidebarGroups.length > 0;
            const isExpanded = isActiveModule && (hasPrimarySidebarGroups || mobileMenuOpen);
            const groups = visibleGroups(module, user);
            return (
              <section key={module.key} className={`shell-v3-module ${isActiveModule ? "active" : ""}`}>
                <button type="button" className="shell-v3-module-button" onClick={() => onToggleModuleMenu(module.key)} aria-expanded={isExpanded}>
                  <ErpIcon name={module.icon || "dashboard"} size={18} /><span>{module.label}</span><ChevronDown size={15} className={isExpanded ? "expanded" : ""} />
                </button>
                {isExpanded ? (
                  <div className="shell-v3-submenu">
                    {hasPrimarySidebarGroups
                      ? (
                          <div className="shell-v3-submenu-primary">
                            {module.sidebarGroups.map(([key, label, icon, description]) => {
                              const owningGroup = groups.find((group) => (group.tabs || []).some(([tabKey]) => tabKey === key));
                              const groupActive = owningGroup?.tabs?.some(([tabKey]) => tabKey === activeTab) || activeTab === key;
                              return (
                                <button type="button" key={key} className={groupActive ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                                  <ErpIcon name={icon || "dashboard"} size={16} />
                                  <span><strong>{label}</strong><small>{description}</small></span>
                                </button>
                              );
                            })}
                          </div>
                        )
                      : module.groups
                        ? groups.map((group) => (
                            <div key={group.label} className="shell-v3-submenu-group">
                              <h3>{group.label}</h3>
                              {group.tabs.map(([key, label, icon]) => (
                                <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                                  <ErpIcon name={icon || "dashboard"} size={15} /><span>{label}</span>
                                </button>
                              ))}
                            </div>
                          ))
                        : getTabs(module, user).map(([key, label, icon]) => (
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
          <button
            type="button"
            className="shell-v3-display-button"
            onClick={() => setDisplaySettingsOpen(true)}
            aria-label="Ekran ve görünüm ayarları"
            title="Ayarlar > Sistem > Ekran"
          >
            <Monitor size={17} />
            <span>Ekran</span>
            <small>{displayLabel} · {effectiveScale}%</small>
          </button>
          <div className="shell-v3-notification-wrap">
            <button
              type="button"
              className="shell-v3-icon notification"
              aria-label="Bildirim Merkezi"
              aria-expanded={notificationOpen}
              onClick={() => {
                const next = !notificationOpen;
                setNotificationOpen(next);
                if (next) refreshNotifications(false);
              }}
            >
              <Bell size={18} />
              {notificationData.unreadCount > 0 ? <span>{notificationData.unreadCount > 99 ? "99+" : notificationData.unreadCount}</span> : null}
            </button>
            {notificationOpen ? (
              <section className="shell-v3-notification-panel" role="dialog" aria-label="Bildirim Merkezi">
                <header>
                  <div>
                    <strong>Bildirim Merkezi</strong>
                    <small>{notificationData.unreadCount > 0 ? `${notificationData.unreadCount} okunmamış bildirim` : "Yeni bildirim yok"}</small>
                  </div>
                  <div className="shell-v3-notification-actions">
                    <button type="button" onClick={() => refreshNotifications(false)} disabled={notificationLoading} title="Yenile"><RefreshCw size={15} className={notificationLoading ? "spin" : ""} /></button>
                    <button type="button" onClick={markAllNotificationsRead} disabled={!notificationData.unreadCount} title="Tümünü okundu işaretle"><CheckCheck size={16} /></button>
                  </div>
                </header>
                {notificationError ? <div className="shell-v3-notification-error">{notificationError}</div> : null}
                {notificationData.partial ? <div className="shell-v3-notification-warning">Bazı bildirim kaynakları geçici olarak alınamadı. Görünen kayıtlar günceldir.</div> : null}
                <div className="shell-v3-notification-list" aria-live="polite">
                  {notificationLoading && !notificationData.items.length ? <div className="shell-v3-notification-empty">Bildirimler kontrol ediliyor...</div> : null}
                  {!notificationLoading && !notificationData.items.length ? (
                    <div className="shell-v3-notification-empty">
                      <Bell size={22} />
                      <strong>Bildirim yok</strong>
                      <span>Bekleyen onay, e-Belge sorunu veya vadesi gelen ödeme olduğunda burada görünecek.</span>
                    </div>
                  ) : null}
                  {notificationData.items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`shell-v3-notification-item ${item.unread ? "unread" : ""} severity-${item.severity || "info"}`}
                      onClick={() => openNotification(item)}
                    >
                      <i aria-hidden="true" />
                      <span>
                        <em>{notificationCategoryLabel(item.category)}</em>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <time>{notificationTime(item.createdAt)}</time>
                    </button>
                  ))}
                </div>
                <footer>
                  <span>Gerçek kayıtlar · Firma ve kullanıcı yetkisine göre</span>
                  {notificationData.generatedAt ? <small>Son kontrol {notificationTime(notificationData.generatedAt)}</small> : null}
                </footer>
              </section>
            ) : null}
          </div>
          <div className="shell-v3-user">
            <b>{String(user?.fullName || user?.username || "U").slice(0, 1).toUpperCase()}</b>
            <div><strong>{user?.fullName || user?.username || "Kullanıcı"}</strong><small>{roleLabel(user?.role)}</small></div>
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

      {displaySettingsOpen && displayPreferences
        ? createPortal(
            <DisplaySettingsPanel
              display={displayPreferences}
              onClose={() => setDisplaySettingsOpen(false)}
            />,
            document.body,
          )
        : null}

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
