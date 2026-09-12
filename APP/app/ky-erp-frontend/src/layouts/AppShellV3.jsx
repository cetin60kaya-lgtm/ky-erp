import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, ChevronDown, Command, Download, LogOut, Menu, Monitor, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { ErpIcon } from "../components/erp/IconMap";
import PhoneApprovalSetup from "../components/shell/PhoneApprovalSetup";

import DisplaySettingsPanel from "./DisplaySettingsPanel";
import { dismissNotifications, getNotifications, markNotificationsRead } from "../services/notificationApi";
import { decideSecurityCenterLoginApproval, runPhoneApprovedSecurityAction } from "../services/securityCenterApi";
import { apiGet } from "../utils/api";
import "../styles/shell-v3.css";
import "../styles/responsive-core.css";
import "../styles/security-notification-actions.css";
import "../styles/shell-v3-modern.css";

const OWNER_ONLY_ADMIN_TABS = new Set(["uygulama-sahibi", "firma-ucretlendirme", "eslestirmeler", "surum-merkezi"]);

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

const MODULE_VISUALS = {
  muhasebe: { icon: "muhasebe", hint: "Finans, cari ve mali kontrol" },
  isnet: { icon: "e-belge", hint: "e-Belge ve entegrasyon" },
  desen: { icon: "desen", hint: "Desen, model ve yerleşim" },
  boyahane: { icon: "boyahane", hint: "Renk, reçete ve lot" },
  "gunluk-operasyon": { icon: "operasyon", hint: "Günlük operasyon" },
  ik: { icon: "ik", hint: "Personel ve bordro" },
  pdks: { icon: "pdks", hint: "Kart ve devam kontrolü" },
  uretim: { icon: "imalat", hint: "İmalat ve üretim" },
  iletisim: { icon: "eposta", hint: "Mail ve dosyalar" },
  compliance: { icon: "file-check", hint: "Denetim ve uygunluk" },
  depolama: { icon: "depolama", hint: "Bağlantılar ve depolama" },
  admin: { icon: "guvenlik", hint: "Platform ve güvenlik" },
  asistan: { icon: "asistan", hint: "KY ERP Asistan" },
};
function moduleVisual(module) {
  return MODULE_VISUALS[module?.key] || { icon: module?.icon || "dashboard", hint: module?.label || "Modül" };
}

const TAB_PALETTES = [
  { accent: "#3158b7", soft: "#edf3ff", line: "#cbd9ff" },
  { accent: "#a65d16", soft: "#fff3e5", line: "#f2d3ad" },
  { accent: "#087a6d", soft: "#e8f8f4", line: "#bfe8de" },
  { accent: "#7b4daf", soft: "#f4edfb", line: "#ddccf0" },
  { accent: "#a93f68", soft: "#fceef4", line: "#efcad9" },
  { accent: "#26748c", soft: "#eaf7fb", line: "#c2e4ee" },
  { accent: "#5f6d22", soft: "#f4f7e8", line: "#dde5bd" },
  { accent: "#8d551f", soft: "#faf1e8", line: "#ead2ba" },
  { accent: "#496882", soft: "#edf4f8", line: "#cedee8" },
  { accent: "#6b55b5", soft: "#f1effc", line: "#d8d1f2" },
];

function tabTheme(tabKey) {
  const value = normalize(tabKey);
  if (/ana-ekran|genel-bakis|yonetim-ozeti|dashboard|\bozet\b/.test(value)) return TAB_PALETTES[0];
  if (/gunluk|giris|is-akisi/.test(value)) return TAB_PALETTES[1];
  if (/odeme|tahsilat|banka|bordro|maas|avans|cek/.test(value)) return TAB_PALETTES[2];
  if (/hafta|takvim|tarih|vardiya|izin|donem/.test(value)) return TAB_PALETTES[3];
  if (/personel|kullanici|yetki|ik-/.test(value)) return TAB_PALETTES[4];
  if (/firma|cari|musteri|tedarikci/.test(value)) return TAB_PALETTES[5];
  if (/fatura|belge|evrak|arsiv|irsaliye/.test(value)) return TAB_PALETTES[6];
  if (/rapor|analiz|denetim|log|kontrol/.test(value)) return TAB_PALETTES[7];
  if (/mail|eposta|dosya|klasor|drive/.test(value)) return TAB_PALETTES[8];
  if (/ayar|terminal|cihaz|guvenlik|baglanti|entegrasyon/.test(value)) return TAB_PALETTES[9];
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash * 31) + value.charCodeAt(index)) | 0;
  return TAB_PALETTES[Math.abs(hash) % TAB_PALETTES.length];
}

function tabStyle(tabKey) {
  const theme = tabTheme(tabKey);
  return { "--tab-accent": theme.accent, "--tab-soft": theme.soft, "--tab-line": theme.line };
}

function tabVisualIcon(tabKey, fallback = "dashboard") {
  const key = normalize(tabKey);
  if (/fatura|belge|evrak|arsiv/.test(key)) return "belge";
  if (/irsaliye|sevkiyat/.test(key)) return "musteri-irsaliye";
  if (/cari|firma/.test(key)) return "firma-kartlari";
  if (/odeme|tahsilat|banka|maas|bordro|avans/.test(key)) return "odemeler";
  if (/cek/.test(key)) return "cekler";
  if (/kdv|hesap|kar-zarar|gelir-gider/.test(key)) return "kdv";
  if (/mail|eposta|gelen-kutusu|gonderilen/.test(key)) return "eposta";
  if (/personel|kullanici|yetki|servis/.test(key)) return "users";
  if (/puantaj|takvim|tarih|tatil|izin|vardiya|donem/.test(key)) return "takvim";
  if (/terminal|cihaz/.test(key)) return "terminal";
  if (/senkron|sync/.test(key)) return "sync";
  if (/renk|recete|boya/.test(key)) return "renk";
  if (/stok|urun|lot|envanter/.test(key)) return "urunler";
  if (/uretim|imalat|makine/.test(key)) return "imalat";
  if (/desen|model|yerlesim|kalip/.test(key)) return "desen";
  if (/rapor|denetim|log|gecmis/.test(key)) return "raporlar";
  if (/ayar|baglanti|entegrasyon/.test(key)) return "ayarlar";
  if (/dosya|drive|klasor|depolama/.test(key)) return "dosya";
  if (/onay|sorun/.test(key)) return "onay";
  return fallback || "dashboard";
}
function quickActionDescription(module, group, tab) {
  const sidebarRow = (module?.sidebarGroups || []).find(([key]) => key === tab?.[0]);
  if (sidebarRow?.[3]) return sidebarRow[3];
  const groupLabel = group?.label ? group.label + " · " : "";
  return groupLabel + (moduleVisual(module).hint || "İlgili çalışma ekranını aç");
}

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
  const [expandedGroupKey, setExpandedGroupKey] = useState("");
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [phoneApprovalOpen, setPhoneApprovalOpen] = useState(false);
  const [securityAppEligible, setSecurityAppEligible] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const profileMenuRef = useRef(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationActionBusy, setNotificationActionBusy] = useState("");
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
  const activeCompanyName = companies.find((item) => item.slug === activeCompanySlug)?.name || "Firma seçilmedi";
  const profileImageUrl = String(
    user?.avatarUrl || user?.profileImageUrl || user?.photoUrl || user?.pictureUrl || user?.picture || "",
  ).trim();
  const profileInitials = String(user?.fullName || user?.username || "K")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase("tr-TR"))
    .join("") || "K";
  const canOpenPlatformManagement = modules.some((item) => item.key === "admin");
  const ownerUser = isOwnerUser(user);
  const securityRole = String(user?.role || "").toUpperCase().replace(/İ/g, "I");
  const builtInSecurityAppAccess = ownerUser || securityRole === "COMPANY_ADMIN";
  const activeModuleVisual = moduleVisual(activeModule);
  const notificationView = useMemo(() => {
    const items = notificationData.items || [];
    if (notificationFilter === "unread") return items.filter((item) => item.unread);
    if (notificationFilter === "action") return items.filter((item) => item?.meta?.actionable === true);
    return items;
  }, [notificationData.items, notificationFilter]);
  const notificationActionCount = useMemo(() => (notificationData.items || []).filter((item) => item?.meta?.actionable === true).length, [notificationData.items]);

  useEffect(() => {
    if (!user?.id) { setSecurityAppEligible(false); return undefined; }
    let alive = true;
    setSecurityAppEligible(builtInSecurityAppAccess);
    apiGet("/auth/push/config", { _ts: Date.now() })
      .then((result) => { if (alive) setSecurityAppEligible(Boolean((result?.data || result)?.securityAppEligible)); })
      .catch(() => { if (alive) setSecurityAppEligible(builtInSecurityAppAccess); });
    return () => { alive = false; };
  }, [user?.id, user?.role, builtInSecurityAppAccess]);

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
  }, [user?.id, user?.role]);

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
  }, [refreshNotifications, user?.id, activeCompanySlug]);

  useEffect(() => {
    const openPhoneApprovalSetup = () => { if (securityAppEligible) setPhoneApprovalOpen(true); };
    window.addEventListener("kyerp:open-phone-approval-setup", openPhoneApprovalSetup);
    return () => window.removeEventListener("kyerp:open-phone-approval-setup", openPhoneApprovalSetup);
  }, [securityAppEligible]);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notificationOpen]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [profileImageUrl]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeProfileMenu = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        return;
      }
      if (event.type === "pointerdown" && profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeProfileMenu);
    window.addEventListener("pointerdown", closeProfileMenu);
    return () => {
      window.removeEventListener("keydown", closeProfileMenu);
      window.removeEventListener("pointerdown", closeProfileMenu);
    };
  }, [profileMenuOpen]);

  const quickActions = useMemo(() => {
    const query = normalize(quickSearch);
    const rows = modules.flatMap((module) => {
      const groups = visibleGroups(module, user);
      if (groups.length) return groups.flatMap((group) => (group.tabs || []).map((tab) => ({ module, group, tab })));
      return getTabs(module, user).map((tab) => ({ module, group: null, tab }));
    }).map(({ module, group, tab }) => ({
      id: module.key + ":" + tab[0],
      moduleKey: module.key,
      tabKey: tab[0],
      label: tab[1],
      description: quickActionDescription(module, group, tab),
      icon: tabVisualIcon(tab[0], tab[2]),
      moduleIcon: moduleVisual(module).icon,
      moduleLabel: module.label,
      keywords: module.label + " " + (group?.label || "") + " " + tab[0] + " " + tab[1],
    }));
    const filtered = query
      ? rows.filter((action) => normalize(action.label + " " + action.description + " " + action.keywords).includes(query))
      : rows;
    const ordered = [...filtered].sort((a, b) => {
      if (a.moduleKey === activeModule?.key && b.moduleKey !== activeModule?.key) return -1;
      if (b.moduleKey === activeModule?.key && a.moduleKey !== activeModule?.key) return 1;
      return modules.findIndex((item) => item.key === a.moduleKey) - modules.findIndex((item) => item.key === b.moduleKey);
    });
    return ordered.slice(0, query ? 40 : 24);
  }, [activeModule?.key, modules, quickSearch, user]);

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

  useEffect(() => { setExpandedGroupKey(""); }, [activeModule?.key, activeTab]);

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
    if (item?.meta?.securityCenter === true) {
      if (ownerUser) onOpenTab("admin", "uygulama-sahibi");
      else if (securityAppEligible) setPhoneApprovalOpen(true);
      setNotificationOpen(false);
      return;
    }
    if (item?.route?.moduleKey && item?.route?.tabKey) {
      onOpenTab(item.route.moduleKey, item.route.tabKey);
    }
    setNotificationOpen(false);
  }

  async function decideNotificationApproval(event, item, decision) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const approvalId = String(item?.meta?.approvalId || "").trim();
    const sessionId = String(item?.meta?.sessionId || "").trim();
    if ((!approvalId && !sessionId) || notificationActionBusy) return;
    setNotificationActionBusy(item.id);
    setNotificationError("");
    try {
      if (sessionId) {
        const operation = decision === "DENY" ? "SESSION_TRUST_REJECT" : "SESSION_TRUST_APPROVE";
        await runPhoneApprovedSecurityAction({ operation, sessionId });
      } else {
        await decideSecurityCenterLoginApproval(approvalId, decision);
      }
      if (item?.unread) await markNotificationIdsRead([item.id]);
      await refreshNotifications(true);
    } catch (error) {
      setNotificationError(error?.message || "Güvenlik onayı tamamlanamadı.");
    } finally {
      setNotificationActionBusy("");
    }
  }

  function markAllNotificationsRead() {
    const unreadIds = notificationData.items.filter((item) => item.unread).map((item) => item.id);
    markNotificationIdsRead(unreadIds);
  }

  function canDismissNotification(item) {
    return !(item?.category === "SECURITY" && item?.meta?.actionable === true);
  }

  async function dismissNotificationIds(ids) {
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return;
    setNotificationData((current) => {
      const items = current.items.filter((item) => !clean.includes(item.id));
      return { ...current, items, unreadCount: items.filter((item) => item.unread).length, totalCount: items.length };
    });
    try { await dismissNotifications(clean); }
    catch { refreshNotifications(true); }
  }

  function clearReadNotifications() {
    const ids = notificationData.items.filter((item) => !item.unread && canDismissNotification(item)).map((item) => item.id);
    dismissNotificationIds(ids);
  }

  function openProfileSecurity() {
    setProfileMenuOpen(false);
    if (ownerUser) {
      onOpenTab("admin", "uygulama-sahibi");
      return;
    }
    if (canOpenPlatformManagement) {
      onOpenTab("admin", "kullanicilar");
      return;
    }
    if (securityAppEligible) setPhoneApprovalOpen(true);
  }

  function openPlatformManagement() {
    setProfileMenuOpen(false);
    onOpenTab("admin", "admin-yonetim-ozeti");
  }

  function openPhoneApprovalFromProfile() {
    setProfileMenuOpen(false);
    if (securityAppEligible) setPhoneApprovalOpen(true);
  }

  function openDisplaySettingsFromProfile() {
    setProfileMenuOpen(false);
    setDisplaySettingsOpen(true);
  }

  async function installPwa() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      // Tarayıcı kurulum penceresini kapattıysa uygulama normal web modunda çalışmaya devam eder.
    } finally {
      setInstallPrompt(null);
    }
  }

  const effectiveMode = displayPreferences?.effectiveMode || "pc";
  const effectiveScale = Number(displayPreferences?.effectiveScale || 100);
  const scaleFactor = effectiveScale / 100;
  const activeTabTheme = useMemo(() => tabTheme(activeTab || activeModule?.key || "tab"), [activeTab, activeModule?.key]);
  const shellStyle = useMemo(() => ({
    "--active-tab-accent": activeTabTheme.accent,
    "--active-tab-soft": activeTabTheme.soft,
    "--active-tab-line": activeTabTheme.line,
    ...(effectiveScale === 100 ? {} : {
      zoom: scaleFactor,
      width: `${100 / scaleFactor}vw`,
      height: `${100 / scaleFactor}dvh`,
      maxWidth: "none",
    }),
  }), [activeTabTheme, effectiveScale, scaleFactor]);

  return (
    <div
      className={`shell-v3 ${mobileMenuOpen ? "mobile-open" : ""}`}
      data-active-module={activeModule?.key || ""}
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
            const primarySidebarExpanded = isActiveModule && (hasPrimarySidebarGroups || mobileMenuOpen);
            const isExpanded = primarySidebarExpanded || (isActiveModule && !hasPrimarySidebarGroups);
            const groups = visibleGroups(module, user);
            const flatModuleTabs = !hasPrimarySidebarGroups && groups.length > 0 && groups.reduce((sum, group) => sum + group.tabs.length, 0) <= 6;
            return (
              <section key={module.key} data-module={module.key} className={`shell-v3-module ${isActiveModule ? "active" : ""}`}>
                <button type="button" className="shell-v3-module-button" onClick={() => onToggleModuleMenu(module.key)} aria-expanded={isExpanded}>
                  <span className="shell-v3-module-icon"><ErpIcon name={moduleVisual(module).icon} size={18} /></span><span className="shell-v3-module-copy"><span>{module.label}</span></span><ChevronDown size={15} className={isExpanded ? "expanded" : ""} />
                </button>
                {isExpanded ? (
                  <div className="shell-v3-submenu">
                    {hasPrimarySidebarGroups ? (
                      <div className="shell-v3-submenu-primary">
                        {module.sidebarGroups.map(([key, label, icon]) => {
                          const owningGroup = groups.find((group) => (group.tabs || []).some(([tabKey]) => tabKey === key));
                          const groupActive = owningGroup?.tabs?.some(([tabKey]) => tabKey === activeTab) || activeTab === key;
                          return (
                            <button type="button" key={key} style={tabStyle(key)} className={groupActive ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                              <ErpIcon name={tabVisualIcon(key, icon)} size={16} />
                              <span><strong>{label}</strong></span>
                            </button>
                          );
                        })}
                      </div>
                    ) : flatModuleTabs ? (
                      <div className="shell-v3-submenu-flat">
                        {getTabs(module, user).map(([key, label, icon]) => (
                          <button type="button" key={key} style={tabStyle(key)} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                            <ErpIcon name={tabVisualIcon(key, icon)} size={15} /><span>{label}</span>
                          </button>
                        ))}
                      </div>
                    ) : module.groups ? groups.map((group) => {
                      const groupId = module.key + ":" + group.label;
                      const groupActive = group.tabs.some(([key]) => key === activeTab);
                      const groupOpen = groupActive || expandedGroupKey === groupId;
                      const firstTab = group.tabs[0] || [];
                      return (
                        <div key={group.label} className={`shell-v3-submenu-group ${groupOpen ? "open" : ""} ${groupActive ? "active" : ""}`}>
                          <button type="button" style={tabStyle(firstTab[0])} className="shell-v3-submenu-group-toggle" onClick={() => setExpandedGroupKey((current) => current === groupId && !groupActive ? "" : groupId)} aria-expanded={groupOpen}>
                            <ErpIcon name={tabVisualIcon(firstTab[0], firstTab[2])} size={15} /><span><strong>{group.label}</strong></span><ChevronDown size={14} />
                          </button>
                          {groupOpen ? <div className="shell-v3-submenu-group-items">{group.tabs.map(([key, label, icon]) => (
                            <button type="button" key={key} style={tabStyle(key)} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}><ErpIcon name={tabVisualIcon(key, icon)} size={15} /><span>{label}</span></button>
                          ))}</div> : null}
                        </div>
                      );
                    }) : getTabs(module, user).map(([key, label, icon]) => (
                      <button type="button" key={key} style={tabStyle(key)} className={activeTab === key ? "active" : ""} onClick={() => onOpenTab(module.key, key)}>
                        <ErpIcon name={tabVisualIcon(key, icon)} size={15} /><span>{label}</span>
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
          <label className="shell-v3-search"><Search size={17} /><input value={quickSearch} onFocus={() => setQuickOpen(true)} onChange={(event) => { setQuickSearch(event.target.value); setQuickOpen(true); }} placeholder="Ekran, işlem, firma, belge veya model ara" aria-label="KY ERP genel işlem araması" /></label>
          <button type="button" className="shell-v3-quick-button" onClick={() => setQuickOpen(true)}><ErpIcon name="hizli" size={16} /><span>Hızlı İşlem</span><kbd>Ctrl K</kbd></button>
          <select value={activeCompanySlug || ""} onChange={(event) => onCompanyChange(event.target.value)}>
            {companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}</option>)}
          </select>

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
                    <button type="button" onClick={clearReadNotifications} disabled={!notificationData.items.some((item) => !item.unread && canDismissNotification(item))} title="Okunan bildirimleri temizle"><Trash2 size={15} /></button>
                  </div>
                </header>
                <div className="shell-v3-notification-filters">
                  <button type="button" className={notificationFilter === "all" ? "active" : ""} onClick={() => setNotificationFilter("all")}>Tümü <b>{notificationData.totalCount}</b></button>
                  <button type="button" className={notificationFilter === "unread" ? "active" : ""} onClick={() => setNotificationFilter("unread")}>Okunmamış <b>{notificationData.unreadCount}</b></button>
                  <button type="button" className={notificationFilter === "action" ? "active" : ""} onClick={() => setNotificationFilter("action")}>İşlem Bekleyen <b>{notificationActionCount}</b></button>
                </div>
                {notificationError ? <div className="shell-v3-notification-error">{notificationError}</div> : null}
                {notificationData.partial ? <div className="shell-v3-notification-warning">Bazı bildirim kaynakları geçici olarak alınamadı. Görünen kayıtlar günceldir.</div> : null}
                <div className="shell-v3-notification-list" aria-live="polite">
                  {notificationLoading && !notificationData.items.length ? <div className="shell-v3-notification-empty">Bildirimler kontrol ediliyor...</div> : null}
                  {!notificationLoading && !notificationView.length ? (
                    <div className="shell-v3-notification-empty">
                      <Bell size={22} />
                      <strong>{notificationData.items.length ? "Bu filtrede bildirim yok" : "Bildirim yok"}</strong>
                      <span>{notificationData.items.length ? "Başka bir filtre seçebilir veya yeni bildirimleri bekleyebilirsiniz." : "Bekleyen onay, e-Belge sorunu veya vadesi gelen ödeme olduğunda burada görünecek."}</span>
                    </div>
                  ) : null}
                  {notificationView.map((item) => {
                    const actionable = item?.category === "SECURITY" && item?.meta?.actionable === true && Boolean(item?.meta?.approvalId || item?.meta?.sessionId);
                    const actionBusy = notificationActionBusy === item.id;
                    return <div className="shell-v3-notification-entry" key={item.id}>
                      <button
                        type="button"
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
                      {actionable ? <div className="shell-v3-notification-inline-actions">
                        <button type="button" className="approve" disabled={Boolean(notificationActionBusy)} onClick={(event) => decideNotificationApproval(event, item, "APPROVE")}>{actionBusy ? "İşleniyor..." : "Onayla"}</button>
                        <button type="button" className="deny" disabled={Boolean(notificationActionBusy)} onClick={(event) => decideNotificationApproval(event, item, "DENY")}>Reddet</button>
                      </div> : null}
                      {!item.unread && canDismissNotification(item) ? <button type="button" className="shell-v3-notification-dismiss" title="Bildirimi temizle" aria-label="Bildirimi temizle" onClick={() => dismissNotificationIds([item.id])}><X size={14} /></button> : null}
                    </div>;
                  })}
                </div>
                <footer>
                  <span>Gerçek kayıtlar · Firma ve kullanıcı yetkisine göre</span>
                  {notificationData.generatedAt ? <small>Son kontrol {notificationTime(notificationData.generatedAt)}</small> : null}
                </footer>
              </section>
            ) : null}
          </div>
          <div className="shell-v3-user" ref={profileMenuRef}>
            <button
              type="button"
              className={`shell-v3-user-trigger ${profileMenuOpen ? "active" : ""}`}
              aria-label="Profil ve güvenlik menüsünü aç"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => {
                const next = !profileMenuOpen;
                setProfileMenuOpen(next);
                if (next) setNotificationOpen(false);
              }}
            >
              <span className="shell-v3-user-avatar" aria-hidden="true">
                {profileImageUrl && !profileImageFailed ? (
                  <img src={profileImageUrl} alt="" onError={() => setProfileImageFailed(true)} />
                ) : <span>{profileInitials}</span>}
              </span>
              <span className="shell-v3-user-meta">
                <strong>{user?.fullName || user?.username || "Kullanıcı"}</strong>
                <small>{roleLabel(user?.role)}</small>
              </span>
              <ChevronDown size={14} className="shell-v3-user-chevron" aria-hidden="true" />
            </button>

            {profileMenuOpen ? (
              <section className="shell-v3-user-menu" role="menu" aria-label="Hesap ve güvenlik">
                <header className="shell-v3-user-menu-head">
                  <span className="shell-v3-user-avatar large" aria-hidden="true">
                    {profileImageUrl && !profileImageFailed ? (
                      <img src={profileImageUrl} alt="" onError={() => setProfileImageFailed(true)} />
                    ) : <span>{profileInitials}</span>}
                  </span>
                  <span className="shell-v3-user-menu-identity">
                    <strong>{user?.fullName || user?.username || "Kullanıcı"}</strong>
                    <small>{user?.email || user?.username || ""}</small>
                    <em>{roleLabel(user?.role)} · {activeCompanyName}</em>
                  </span>
                </header>

                <nav className="shell-v3-user-menu-actions" aria-label="Profil işlemleri">
                  <button type="button" role="menuitem" onClick={openProfileSecurity}>
                    <ShieldCheck size={18} />
                    <span>
                      <strong>{ownerUser ? "Profil & Süper Yönetici Güvenliği" : "Profil & Giriş Güvenliği"}</strong>
                      <small>{ownerUser ? "E-posta, MFA, kurtarma ve oturumlar" : "Hesap bilgileri ve giriş güvenliği"}</small>
                    </span>
                  </button>

                  {canOpenPlatformManagement ? (
                    <button type="button" role="menuitem" onClick={openPlatformManagement}>
                      <Settings2 size={18} />
                      <span>
                        <strong>Platform Yönetimi</strong>
                        <small>Kullanıcılar, firma ayarları ve sistem kontrolleri</small>
                      </span>
                    </button>
                  ) : null}

                  {installPrompt ? (
                    <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); installPwa(); }}>
                      <Download size={18} />
                      <span>
                        <strong>KY ERP'yi Bu Cihaza Yükle</strong>
                        <small>Web uygulamasını masaüstü veya ana ekrana kur</small>
                      </span>
                    </button>
                  ) : null}

                  {securityAppEligible ? (
                    <button type="button" role="menuitem" onClick={openPhoneApprovalFromProfile}>
                      <Smartphone size={18} />
                      <span>
                        <strong>Telefon Onayı</strong>
                        <small>Bu cihazı güvenli giriş onayı için yönet</small>
                      </span>
                    </button>
                  ) : null}

                  <button type="button" role="menuitem" onClick={openDisplaySettingsFromProfile}>
                    <Monitor size={18} />
                    <span>
                      <strong>Görünüm & Uygulamalar</strong>
                      <small>Ekran düzeni ve KY ERP uygulama kurulumları</small>
                    </span>
                  </button>
                </nav>

                <footer className="shell-v3-user-menu-foot">
                  <span>KY ERP · Güvenli oturum</span>
                  <button type="button" role="menuitem" onClick={onLogout}>
                    <LogOut size={17} />
                    <span>Çıkış</span>
                  </button>
                </footer>
              </section>
            ) : null}
          </div>
        </header>

        <div className="shell-v3-tabs-bar">
          <div className="shell-v3-tabs">
            {tabs.map((tab) => (
              <button type="button" key={tab.id} data-module={tab.moduleKey} style={tabStyle(tab.tabKey)} className={activeTabId === tab.id ? "active" : ""} onClick={() => onActivateWorkspaceTab(tab)}>
                <ErpIcon name={tabVisualIcon(tab.tabKey, moduleVisual(modules.find((item) => item.key === tab.moduleKey)).icon)} size={14} />
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

        <div className="shell-v3-crumb"><span className="shell-v3-crumb-icon"><ErpIcon name={tabVisualIcon(activeTab, activeModuleVisual.icon)} size={15} /></span><span className="shell-v3-crumb-module">{activeModule?.label}</span><span>/</span>{activeTabLabel ? <strong>{activeTabLabel}</strong> : <strong>Genel Bakış</strong>}</div>
        <section className="shell-v3-workspace">{children}</section>
        <footer className="shell-v3-status"><span>KY ERP</span><span>Firma: {companies.find((item) => item.slug === activeCompanySlug)?.name || "-"}</span><span className="ok">Sistem hazır</span></footer>
      </main>

      {displaySettingsOpen && displayPreferences
        ? createPortal(
            <DisplaySettingsPanel
              display={displayPreferences}
              canInstallMainApp={Boolean(installPrompt)}
              onInstallMainApp={installPwa}
              securityAppEligible={securityAppEligible}
              onOpenSecurityCenter={() => {
                setDisplaySettingsOpen(false);
                if (securityAppEligible) setPhoneApprovalOpen(true);
              }}
              onClose={() => setDisplaySettingsOpen(false)}
            />,
            document.body,
          )
        : null}

      {phoneApprovalOpen && securityAppEligible
        ? createPortal(
            <PhoneApprovalSetup onClose={() => setPhoneApprovalOpen(false)} />,
            document.body,
          )
        : null}

      {quickOpen ? (
        <div className="shell-v3-quick-backdrop" role="presentation" onMouseDown={() => setQuickOpen(false)}>
          <section className="shell-v3-quick-palette" role="dialog" aria-modal="true" aria-label="Hızlı işlemler" onMouseDown={(event) => event.stopPropagation()}>
            <header><Command size={19} /><input autoFocus value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="İşlem ara: üretim fişi, model, reçete, cari..." /><button type="button" onClick={() => setQuickOpen(false)} aria-label="Kapat"><X size={18} /></button></header>
            <div className="shell-v3-quick-list">
              {quickActions.map((action) => (
                <button type="button" key={action.id} className="shell-v3-quick-action" onClick={() => runQuickAction(action)} onKeyDown={(event) => { if (event.key === "Enter") runQuickAction(action); }}>
                  <b className="shell-v3-quick-action-icon"><ErpIcon name={action.icon} size={18} /></b><span><strong>{action.label}</strong><small>{action.description}</small></span><em><ErpIcon name={action.moduleIcon} size={13} />{action.moduleLabel}</em>
                </button>
              ))}
              {!quickActions.length ? <div className="shell-v3-quick-empty">Aramaya uygun hızlı işlem bulunamadı.</div> : null}
            </div>
            <footer><span><kbd>Ctrl</kbd> + <kbd>K</kbd> ile her ekrandan açılır.</span><span>Tüm yetkili modül ve işlemler burada aranır.</span></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
