import { Suspense, useEffect, useMemo, useState } from "react";
import "./App.css";
import { useCallback } from "react";
import React from "react";
import { useActiveCompany } from "./context/ActiveCompanyContext";
import { useAuth } from "./context/AuthContext";
import { ErpIcon } from "./components/erp/IconMap";
import MuhasebePage from "./pages/modules/MuhasebePage";
import LoginPage from "./pages/LoginPage";
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

const MODULES = [
  {
    key: "muhasebe",
    permissionKey: "MUHASEBE",
    short: "MH",
    label: "Muhasebe",
    tabs: [
      { key: "yonetim-ozeti", label: "Yönetim Özeti", icon: "genel-bakis" },
      { key: "firma-kartlari", label: "Firmalar ve Cari", icon: "firma-kartlari" },
      { key: "tedarikci-faturalar", label: "Tedarikçi Faturaları", icon: "tedarikci-fatura" },
      { key: "kar-zarar", label: "Gelir / Gider / Kâr Zarar", icon: "raporlar" },
      { key: "kdv-kontrol", label: "KDV Kontrol", icon: "kdv" },
      { key: "cek-odeme", label: "Çek, Kart ve Ödeme", icon: "cekler" },
      { key: "mail-ekstre", label: "Ekstre ve Mail", icon: "eposta" },
      { key: "muhasebe-raporlari", label: "Raporlar", icon: "raporlar" },
    ],
  },
  {
    key: "desen",
    permissionKey: "DESEN",
    short: "DS",
    label: "Desen",
    tabs: [
      {
        key: "gelen-desenler",
        label: "Gelen Desenler",
        icon: "dashboard",
      },
      {
        key: "desen-modeller",
        label: "Desen Havuzu",
        icon: "dosya",
      },
      {
        key: "desen-yerlesim-is-akisi",
        label: "Yerleşim / Kalıp",
        icon: "file-check",
      },
      { key: "desen-raporlari", label: "Desen Raporları", icon: "raporlar" },
      { key: "desen-klasor-ayarlari", label: "Klasör Ayarları", icon: "ayarlar" },
    ],
  },
  {
    key: "boyahane",
    permissionKey: "BOYAHANE",
    short: "BY",
    label: "Boyahane",
    tabs: [
      {
        key: "is-akisi",
        label: "İş Akışı",
        icon: "dashboard",
      },
      {
        key: "kayitli-renkler",
        label: "Kayıtlı Renkler",
        icon: "renk",
      },
      { key: "receteler", label: "Reçeteler", icon: "file-check" },
      { key: "urun-lotlar", label: "Ürün ve Lotlar", icon: "urunler" },
      { key: "uretim-gecmisi", label: "Üretim Geçmişi", icon: "dosya" },
      { key: "boya-giderleri", label: "Boya Giderleri", icon: "odeme" },
      {
        key: "raporlar",
        label: "Raporlar",
        icon: "raporlar",
      },
    ],
  },
  {
    key: "ik",
    permissionKey: "IK",
    short: "IK",
    label: "İK",
    tabGroups: [
      {
        groupName: "İK Yönetimi",
        tabs: [
          {
            key: "ozet",
            label: "İK Özet",
            icon: "dashboard",
          },
          {
            key: "personel-kartlari",
            label: "Personel Kartı",
            icon: "users",
          },
          {
            key: "mesai-avans",
            label: "Mesai • Avans • Kesinti",
            icon: "takvim",
          },
          {
            key: "puantaj-izin",
            label: "Yıllık İzin / Günlük Durum",
            icon: "takvim",
          },
          {
            key: "bordro-odeme",
            label: "Bordro & Ödeme",
            icon: "odemeler",
          },
          {
            key: "sgk-evrak-kontrol",
            label: "SGK • Evrak • Ay Sonu",
            icon: "file-check",
          },
        ],
      },
      {
        groupName: "Günlük Personel",
        isSeparated: true,
        tabs: [
          { key: "gunluk-personel", label: "Günlük Giriş", icon: "users" },
          {
            key: "gunluk-personel-kartlari",
            label: "Günlük Personel Kartları",
            icon: "users",
          },
          { key: "ik-raporlari", label: "Haftalık Özet", icon: "takvim" },
          {
            key: "gunluk-odeme-fisleri",
            label: "Günlük Ödeme Fişleri",
            icon: "odemeler",
          },
        ],
      },
    ],
  },
  {
    key: "uretim",
    permissionKey: "IMALAT",
    short: "ÜR",
    label: "İmalat",
    tabs: [
      { key: "uretim-girisi", label: "Üretim Girişi" },
      { key: "imalat-kontrol-rapor", label: "Denetim ve Rapor" },
    ],
  },
  {
    key: "isnet",
    permissionKey: "ISNET",
    short: "İŞ",
    label: "İşNet",
    icon: "eposta",
    tabs: [
      {
        key: "yonetim-merkezi",
        label: "Analiz ve Eşleştirme",
        icon: "dashboard",
      },
      {
        key: "belge-akisi",
        label: "Gelen / Giden Belgeler",
        icon: "dosya",
      },
      {
        key: "irsaliyeden-faturaya",
        label: "Fatura Kesme Yardımcısı",
        icon: "file-check",
      },
      { key: "kesilen-belgeler", label: "Yerel Belge Arşivi", icon: "dosya" },
      { key: "cikti-kuyrugu", label: "Çıktı ve Mail", icon: "file-check" },
      { key: "ayarlar", label: "Ayarlar", icon: "ayarlar" },
    ],
  },
  {
    key: "asistan",
    permissionKey: "ASISTAN",
    short: "AI",
    label: "KY ERP Asistan",
    icon: "dashboard",
    tabs: [{ key: "sohbet", label: "Asistan Sohbeti", icon: "dashboard" }],
  },
  {
    key: "admin",
    permissionKey: "ADMIN",
    short: "AD",
    label: "Admin",
    tabs: [
      { key: "admin-yonetim-ozeti", label: "Admin Yönetim Özeti" },
      { key: "kullanicilar", label: "Kullanıcılar" },
      { key: "ana-firma-ayarlar", label: "Ana Firma / Ayarlar" },
      { key: "dosya-klasor-yonetimi", label: "Dosya ve Klasör Yönetimi" },
      { key: "eslestirmeler", label: "Eşleştirmeler" },
      { key: "yedekleme-loglar", label: "Yedekleme / Loglar" },
    ],
  },
];

const MUHASEBE_ROUTE_TABS = new Set([
  "genel-bakis",
  "yonetim-ozeti",
  "model-muhasebe",
  "model-takip",
  "tedarikci-faturalar",
  "kesilen-faturalar",
  "musteri-irsaliyeleri",
  "musteri-irsaliye",
  "irsaliye-fatura-kontrol",
  "irsaliye-fatura",
  "kar-zarar",
  "kar",
  "zarar",
  "gelir-gider",
  "is-hacmi",
  "musteri-belgeleri",
  "firma-yetkilileri",
  "cari-hareketler",
  "envanter-urunleri",
  "kdv-kontrol",
  "cek-odeme",
  "mail-ekstre",
  "mail-sablonlari",
  "firma-kartlari",
  "gider-kategorileri",
  "muhasebe-raporlari",
  "isveren-ozeti",
  "kontrol-paneli",
  "belge-is-akisi",
  "hizli-giris",
  "belge-yukle",
  "gelen-irsaliye",
  "giden-fatura",
  "bizim-fatura",
  "bizim-irsaliye",
  "tedarik-fatura",
  "cari",
  "firmalar",
  "kdv",
  "mail-ekstre",
  "eposta-ekstre",
  "odeme-tahsilat",
  "odemeler",
  "cek-kart",
  "odeme-nakit-akisi",
  "raporlar",
  "ayarlar",
]);

const LEGACY_ROUTE_TABS = {
  desen: ["desen", "yerlesim", "kalip-yerlesim"],
  boyahane: [
    "boyahane-yonetim-ozeti",
    "renk-recete-is-akisi",
    "boyahane-raporlari",
    "renk-gramaj",
    "kayitli-renkler",
    "hammadde-lot",
    "onayli-envanter",
    "evraklar-denetim",
    "evrak-denetim",
    "evraklar",
    "renk-havuzu",
    "raporlar",
  ],
  ik: [
    "ozet",
    "personel-kartlari",
    "puantaj-izin",
    "mesai-avans",
    "ay-genel-kontrol",
    "ay-personel-kartlari",
    "maas-sozlesme",
    "yillik-izin",
    "puantaj-kart-takibi",
    "sgk-bordro-aktarim",
    "sgk-bordro-aktirim",
    "sgk-evrak-kontrol",
    "aylik-ik-kapanis",
    "ay-izin-evrak",
    "mesai-kesinti",
    "ay-mesai-avans",
    "ay-bordro",
    "bordro-odeme",
    "ay-odeme",
    "evrak-belgeler",
    "gunluk-personel-kartlari",
    "gun-personel-kartlari",
    "gun-giris",
    "gun-haftalik-ozet",
    "gun-odemeler",
    "gunluk-odeme-fisleri",
  ],
  uretim: [
    "imalat-denetim",
    "uretim-raporu",
    "genel",
    "makinalar",
    "uretim-kayit",
    "kalite",
    "uretim-giris-is-akisi",
    "makine-tanimlari",
    "uretim-seri-havuz",
    "fis-aktarim-havuzu",
    "imalat-yonetim-ozeti",
    "makine-vardiya-takibi",
    "imalat-raporlari",
    "manuel-is-ac",
  ],
  admin: [
    "ana-firma-yonetimi",
    "eposta-kayit",
    "firma-esleme",
    "urun-esleme",
    "dosya-klasor-yonetimi",
    "kdv-baglantisi",
    "yedekleme",
    "loglar",
  ],
};

const MODULE_ROUTE_TABS = Object.fromEntries(
  MODULES.map((module) => [
    module.key,
    module.key === "muhasebe"
      ? MUHASEBE_ROUTE_TABS
      : new Set([
          ...(module.tabGroups
            ? module.tabGroups.flatMap((group) =>
                group.tabs.map((tab) => tab.key),
              )
            : (module.tabs || []).map((tab) => tab.key)),
          ...(LEGACY_ROUTE_TABS[module.key] || []),
        ]),
  ]),
);

const SUPPLIER_ARCHIVE_REPORT_PATH =
  "/muhasebe/muhasebe-raporlari?tip=tedarikci-fatura-kontrol-arsiv";

function shouldRedirectSupplierArchiveRoute(parts, searchParams) {
  const [moduleKey, tabKey, extraKey] = parts;
  if (moduleKey !== "muhasebe") return false;
  const tab = String(tabKey || "").toLocaleLowerCase("tr-TR");
  const extra = String(extraKey || "").toLocaleLowerCase("tr-TR");
  const center = String(searchParams.get("center") || "").toLocaleLowerCase(
    "tr-TR",
  );
  const tip = String(searchParams.get("tip") || "").toLocaleLowerCase("tr-TR");
  if (tip === "tedarikci-fatura-kontrol-arsiv") return false;
  if (tab === "kontrol-arsiv" || tab === "kontrol-arsivi") return true;
  if (tab === "arsiv" || tab === "archive") return true;
  if (extra === "arsiv" || extra === "archive" || extra === "kontrol-arsiv") {
    return tab === "tedarikci-faturalar";
  }
  return center === "archive" && tab === "tedarikci-faturalar";
}

function getInitialRouteState() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const searchParams = new URLSearchParams(window.location.search);
  if (shouldRedirectSupplierArchiveRoute(parts, searchParams)) {
    window.history.replaceState({}, "", SUPPLIER_ARCHIVE_REPORT_PATH);
    return { module: "muhasebe", tab: "muhasebe-raporlari" };
  }
  const moduleKey = parts[0];
  const tabKey = parts[1];
  if (
    moduleKey === "muhasebe" &&
    ["fatura-kesim-yardimcisi", "fatura-kesim", "fatura-yardimci"].includes(
      tabKey,
    )
  ) {
    window.history.replaceState({}, "", "/muhasebe/kesilen-faturalar");
    return { module: "muhasebe", tab: "kesilen-faturalar" };
  }
  if (moduleKey === "muhasebe" && tabKey === "belge-kontrol") {
    window.history.replaceState({}, "", "/muhasebe/tedarikci-faturalar");
    return { module: "muhasebe", tab: "tedarikci-faturalar" };
  }
  if (moduleKey === "muhasebe" && tabKey === "isveren-ozeti") {
    window.history.replaceState(
      {},
      "",
      "/muhasebe/muhasebe-raporlaritip=yonetici-ozet",
    );
    return { module: "muhasebe", tab: "muhasebe-raporlari" };
  }
  if (
    moduleKey === "uretim" &&
    ["imalat-denetim", "uretim-raporu"].includes(tabKey)
  ) {
    window.history.replaceState({}, "", "/uretim/imalat-kontrol-rapor");
    return { module: "uretim", tab: "imalat-kontrol-rapor" };
  }
  if (
    moduleKey === "desen" &&
    ["desen-yonetim-ozeti", "gelen-desenler"].includes(tabKey)
  ) {
    window.history.replaceState({}, "", "/desen/gelen-desenler");
    return { module: "desen", tab: "gelen-desenler" };
  }
  if (
    moduleKey === "boyahane" &&
    ["boyahane-yonetim-ozeti", "renk-recete-is-akisi", "renk-gramaj"].includes(
      tabKey,
    )
  ) {
    window.history.replaceState({}, "", "/boyahane/is-akisi");
    return { module: "boyahane", tab: "is-akisi" };
  }
  if (
    moduleKey === "boyahane" &&
    ["hammadde-lot", "onayli-envanter"].includes(tabKey)
  ) {
    window.history.replaceState({}, "", "/boyahane/urun-lotlar");
    return { module: "boyahane", tab: "urun-lotlar" };
  }
  if (
    moduleKey === "boyahane" &&
    [
      "boyahane-raporlari",
      "evraklar-denetim",
      "evrak-denetim",
      "evraklar",
    ].includes(tabKey)
  ) {
    window.history.replaceState({}, "", "/boyahane/raporlar");
    return { module: "boyahane", tab: "raporlar" };
  }
  if (moduleKey && tabKey && MODULE_ROUTE_TABS[moduleKey].has(tabKey)) {
    if (moduleKey === "muhasebe" && tabKey === "model-muhasebe") {
      return { module: moduleKey, tab: "tedarikci-faturalar" };
    }
    return { module: moduleKey, tab: tabKey };
  }
  if (!window.location.pathname.startsWith("/mobile")) {
    window.history.replaceState({}, "", "/muhasebe/yonetim-ozeti");
  }
  return { module: "muhasebe", tab: "yonetim-ozeti" };
}

export default function App() {
  const {
    user,
    loading: authLoading,
    isAuthenticated,
    hasModule,
    logout,
  } = useAuth();
  const { companies, activeCompany, activeCompanySlug, setActiveCompanySlug } =
    useActiveCompany();
  const [activeModule, setActiveModule] = useState(
    () => getInitialRouteState().module,
  );
  const [activeTab, setActiveTab] = useState(() => getInitialRouteState().tab);
  const [moduleActionContext, setModuleActionContext] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [assistantDialogContext, setAssistantDialogContext] = useState(null);

  const visibleModules = useMemo(() => {
    return MODULES.filter((item) => hasModule(item?.permissionKey));
  }, [hasModule]);

  const moduleConfig = useMemo(() => {
    const fallback = visibleModules[0] || MODULES[0];
    return visibleModules.find((item) => item.key === activeModule) ?? fallback;
  }, [activeModule, visibleModules]);

  const hasActiveModuleAccess = useMemo(() => {
    if (!moduleConfig?.permissionKey) return false;
    return hasModule(moduleConfig?.permissionKey);
  }, [moduleConfig, hasModule]);

  const openModule = useCallback(
    (moduleKey, options = {}) => {
      if (moduleKey === "asistan") {
        preloadModule("asistan");
        setAssistantDialogContext((previous) => ({
          ...(options.actionContext || {}),
          sourceModule: options.actionContext?.sourceModule || activeModule,
          sourceRoute: options.actionContext?.sourceRoute || window.location.pathname,
          nonce: String(Number(previous?.nonce || 0) + 1),
        }));
        setIsMobileMenuOpen(false);
        return;
      }
      const found = visibleModules.find((item) => item.key === moduleKey);
      if (!found) return;
      preloadModule(found.key);
      setActiveModule(found.key);
      if (options.actionContext) {
        setModuleActionContext((previous) => ({
          ...options.actionContext,
          targetModule: found.key,
          targetTab: options.tabKey || options.actionContext.targetTab || "",
          nonce: String(Number(previous?.nonce || 0) + 1),
        }));
      }

      if (options.tabKey) {
        setActiveTab(options.tabKey);
      } else if (found.tabGroups && found.tabGroups.length > 0) {
        setActiveTab(found.tabGroups[0].tabs[0].key ?? "");
      } else if (found.tabs && found.tabs.length > 0) {
        setActiveTab(found.tabs[0].key ?? "");
      } else {
        setActiveTab("");
      }
      const nextTab =
        options.tabKey ||
        (found.tabGroups && found.tabGroups.length > 0
          ? found.tabGroups[0].tabs[0].key
          : found.tabs?.[0].key);
      if (nextTab && MODULE_ROUTE_TABS[found.key].has(nextTab)) {
        const nextPath = `/${found.key}/${nextTab}`;
        if (window.location.pathname !== nextPath) {
          window.history.pushState({}, "", nextPath);
        }
      }
      setIsMobileMenuOpen(false);
    },
    [activeModule, visibleModules],
  );

  useEffect(() => {
    if (!isAuthenticated || !visibleModules.length) return;
    const stillVisible = visibleModules.some(
      (item) => item.key === activeModule,
    );
    if (stillVisible) return;

    const fallback = visibleModules[0];
    openModule(fallback.key);
  }, [isAuthenticated, visibleModules, activeModule, openModule]);

  const selectableCompanies = useMemo(() => {
    const activeRows = companies.filter((item) => item?.isActive !== false);
    return activeRows.length ? activeRows : companies;
  }, [companies]);

  const normalizedActiveMainCompany = useMemo(() => {
    if (!companies.length) return activeCompany || null;

    const bySlug = companies.find((item) => item.slug === activeCompanySlug);
    if (bySlug) return bySlug;

    const raw = String(activeCompanySlug || "").trim();
    const rawLower = raw.toLocaleLowerCase("tr-TR");
    const byLegacyValue = companies.find((item) => {
      const id = String(item?.id || "").toLocaleLowerCase("tr-TR");
      const slug = String(item?.slug || "").toLocaleLowerCase("tr-TR");
      const name = String(item?.name || "").toLocaleLowerCase("tr-TR");
      return rawLower === id || rawLower === slug || rawLower === name;
    });
    if (byLegacyValue) return byLegacyValue;

    const firstActive = companies.find((item) => item?.isActive !== false);
    return firstActive || companies[0] || null;
  }, [companies, activeCompany, activeCompanySlug]);

  useEffect(() => {
    if (!normalizedActiveMainCompany?.slug) return;
    if (activeCompanySlug !== normalizedActiveMainCompany.slug) {
      setActiveCompanySlug(normalizedActiveMainCompany.slug);
    }
  }, [activeCompanySlug, normalizedActiveMainCompany, setActiveCompanySlug]);

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

  function setActiveTabWithRoute(tabKey) {
    setActiveTab(tabKey);
    if (MODULE_ROUTE_TABS[activeModule].has(tabKey)) {
      const nextPath = `/${activeModule}/${tabKey}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, "", nextPath);
      }
    } else if (window.location.pathname.startsWith(`/${activeModule}/`)) {
      window.history.pushState({}, "", "/");
    }
    setIsMobileMenuOpen(false);
  }

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
    if (activeModule === "muhasebe")
      return <MuhasebePage activeTab={activeTab} {...sharedProps} />;
    if (activeModule === "isnet")
      return <IsnetPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule === "asistan")
      return <AiAssistantPage {...sharedProps} />;
    if (activeModule === "desen")
      return <DesenPage activeTab={activeTab} {...sharedProps} />;
    if (activeModule === "boyahane")
      return <BoyahanePage activeTab={activeTab} {...sharedProps} />;
    if (activeModule === "ik") {
      return <IkPage activeTab={activeTab} {...sharedProps} />;
    }
    if (activeModule === "uretim")
      return <UretimPage activeTab={activeTab} {...sharedProps} />;
    return <AdminPage activeTab={activeTab} {...sharedProps} />;
  }

  const activeTabs = moduleConfig?.tabGroups
    ? moduleConfig.tabGroups.flatMap((group) => group.tabs || [])
    : moduleConfig?.tabs || [];
  const activeTabLabel =
    activeTabs.find((item) => item.key === activeTab)?.label || "";

  const hideGlobalTopbar = ["ik", "boyahane"].includes(activeModule);

  if (authLoading) {
    return (
      <div className="content-card module-loading-card" style={{ margin: 24 }}>
        <h3>Oturum kontrol ediliyor</h3>
        <p>Lütfen bekleyin...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!visibleModules.length) {
    return (
      <div className="content-card module-error-card" style={{ margin: 24 }}>
        <h3>Modül yetkisi tanımlı değil</h3>
        <p>
          Sistem yöneticisi ile görüşerek kullanıcı yetkilerinizi güncelleyin.
        </p>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isMobileMenuOpen ? "mobile-open" : ""}`}>
      {isMobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}
      <aside className="sidebar-thin">
        <div className="kyerp-rail-logo">
          <ErpIcon name="dashboard" size={22} />
        </div>
        {visibleModules.map((item) => (
          <button
            key={item?.key}
            className={`thin-nav-btn ${activeModule === item?.key ? "active" : ""}`}
            onClick={() => openModule(item?.key)}
            onMouseEnter={() => preloadModule(item?.key)}
          >
            <div className="thin-nav-icon">
              <ErpIcon
                name={item?.icon || item?.tabs?.[0]?.icon || "dashboard"}
                size={18}
              />
            </div>
            <div className="thin-nav-label">{item?.label}</div>
          </button>
        ))}
      </aside>

      <aside className="sidebar-module">
        <div className="kyerp-module-brand">
          <ErpIcon name="dashboard" size={22} />
          <strong>KY ERP</strong>
        </div>
        <div className="module-kicker">{moduleConfig?.label}</div>
        <div className="module-menu-list">
          {moduleConfig?.tabGroups
            ? moduleConfig.tabGroups.map((group, groupIdx) => (
                <div key={groupIdx}>
                  {group.isSeparated && groupIdx > 0 ? (
                    <div
                      style={{
                        margin: "12px 0",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    />
                  ) : null}
                  {group.groupName ? (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#94a3b8",
                        padding: "8px 12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {group.groupName}
                    </div>
                  ) : null}
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`module-menu-btn ${activeTab === tab.key ? "active" : ""}`}
                      onClick={() => setActiveTabWithRoute(tab.key)}
                      onMouseEnter={() => preloadModule(activeModule)}
                    >
                      {tab.icon ? <ErpIcon name={tab.icon} size={18} /> : null}
                      {tab.label}
                    </button>
                  ))}
                </div>
              ))
            : // Normal tabs
              moduleConfig.tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`module-menu-btn ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTabWithRoute(tab.key)}
                  onMouseEnter={() => preloadModule(activeModule)}
                >
                  {tab.icon ? <ErpIcon name={tab.icon} size={18} /> : null}
                  {tab.label}
                </button>
              ))}
        </div>
      </aside>

      <main className="main-content">
        <div className="kyerp-global-topbar">
          <button
            className="mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <ErpIcon name="dashboard" size={20} />
          </button>
          <div className="kyerp-global-crumb">
            <span>KY ERP</span>
            <span>/</span>
            <span>{moduleConfig?.label}</span>
            {activeTabLabel ? (
              <>
                <span>/</span>
                <strong>{activeTabLabel}</strong>
              </>
            ) : null}
          </div>
          <select
            className="top-select main-company-select"
            value={activeCompanySlug || ""}
            onChange={(e) => setActiveCompanySlug(e.target.value)}
          >
            {selectableCompanies.map((item) => (
              <option key={item?.slug} value={item?.slug}>
                {item?.name}
              </option>
            ))}
          </select>
          <button
            className="kyerp-notification"
            type="button"
            aria-label="Bildirimler"
          >
            <ErpIcon name="uyari" size={18} />
            <span>3</span>
          </button>
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
        </div>
        {!hideGlobalTopbar && activeModule !== "muhasebe" ? (
          <div className="topbar">
            <input
              className="search-input"
              placeholder={
                activeModule === "uretim"
                  ? "Model, irsaliye veya makina arayın..."
                  : "Genel arama..."
              }
            />
          </div>
        ) : null}
        <ModuleErrorBoundary key={`${activeModule}-${activeTab}`}>
          <Suspense
            fallback={<ModuleLoadingFallback label={moduleConfig?.label} />}
          >
            {renderPage()}
          </Suspense>
        </ModuleErrorBoundary>
      </main>
      {hasModule("ASISTAN") ? (
        <button
          type="button"
          className="kyerp-ai-fab"
          onClick={() =>
            openModule("asistan", {
              tabKey: "sohbet",
              actionContext: {
                sourceModule: activeModule,
                sourceRoute: window.location.pathname,
              },
            })
          }
        >
          <ErpIcon name="dashboard" size={18} /> <span>Asistana Sor</span>
        </button>
      ) : null}
      {assistantDialogContext && hasModule("ASISTAN") ? (
        <div
          className="ai-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAssistantDialogContext(null);
          }}
        >
          <div className="ai-dialog" role="dialog" aria-modal="true" aria-label="KY ERP Asistan">
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
