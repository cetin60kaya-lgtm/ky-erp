import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import React from "react";
import { Bell, Menu, Search, X } from "lucide-react";
import { useActiveCompany } from "./context/ActiveCompanyContext";
import { useAuth } from "./context/AuthContext";
import { ErpIcon } from "./components/erp/IconMap";
import MuhasebePage from "./pages/modules/MuhasebePage";
import LoginPage from "./pages/LoginPage";
import "./styles/app-v2.css";

const IkPage = lazy(() => import("./pages/modules/IkPage"));
const DesenPage = lazy(() => import("./pages/modules/DesenPage"));
const BoyahanePage = lazy(() => import("./pages/modules/BoyahanePage"));
const UretimPage = lazy(() => import("./pages/modules/UretimPage"));
const IsnetPage = lazy(() => import("./pages/modules/IsnetPage"));
const AdminPage = lazy(() => import("./pages/modules/AdminPage"));
const AiAssistantPage = lazy(() => import("./pages/modules/AiAssistantPage"));

const MODULES = [
  {
    key: "muhasebe",
    label: "Muhasebe",
    permissionKey: "MUHASEBE",
    icon: "cari-kasa",
    tabs: [
      ["yonetim-ozeti", "Yönetim Özeti", "genel-bakis"],
      ["firma-kartlari", "Firma Kartları", "firma-kartlari"],
      ["firma-yetkilileri", "Firma Yetkilileri", "users"],
      ["gider-kategorileri", "Gider Kategorileri", "raporlar"],
      ["tedarikci-faturalar", "Tedarikçi Faturaları", "tedarikci-fatura"],
      ["kesilen-faturalar", "Kesilen Faturalar", "dosya"],
      ["musteri-irsaliyeleri", "İrsaliyeler", "musteri-irsaliye"],
      ["irsaliye-fatura-kontrol", "İrsaliye / Fatura", "file-check"],
      ["model-takip", "Model Üretim Takibi", "model-takip-merkezi"],
      ["cari-hareketler", "Cari Hareketler", "cari-kasa"],
      ["kar-zarar", "Gelir / Gider", "raporlar"],
      ["envanter-urunleri", "Ürünler", "urunler"],
      ["kdv-kontrol", "KDV Kontrol", "kdv"],
      ["cek-odeme", "Çek / Ödeme", "cekler"],
      ["mail-ekstre", "Mail / Ekstre", "eposta"],
      ["mail-sablonlari", "Mail Şablonları", "eposta"],
      ["muhasebe-raporlari", "Raporlar", "raporlar"],
    ],
  },
  {
    key: "isnet",
    label: "İşNet",
    permissionKey: "ISNET",
    icon: "eposta",
    tabs: [
      ["yonetim-merkezi", "Analiz ve Eşleştirme", "dashboard"],
      ["belge-akisi", "Gelen / Giden Belgeler", "dosya"],
      ["irsaliyeden-faturaya", "Fatura Kesme Yardımcısı", "file-check"],
      ["kesilen-belgeler", "Yerel Belge Arşivi", "dosya"],
      ["cikti-kuyrugu", "Çıktı ve Mail", "file-check"],
      ["ayarlar", "Ayarlar", "ayarlar"],
    ],
  },
  {
    key: "ik",
    label: "İK",
    permissionKey: "IK",
    icon: "users",
    groups: [
      {
        label: "İK Yönetimi",
        tabs: [
          ["ozet", "İK Özet", "dashboard"],
          ["personel-kartlari", "Personel Kartı", "users"],
          ["mesai-avans", "Mesai • Avans • Kesinti", "takvim"],
          ["puantaj-izin", "Yıllık İzin / Günlük Durum", "takvim"],
          ["bordro-odeme", "Bordro & Ödeme", "odemeler"],
          ["sgk-evrak-kontrol", "SGK • Evrak • Ay Sonu", "file-check"],
        ],
      },
      {
        label: "Günlük Personel",
        tabs: [
          ["gunluk-personel", "Günlük Giriş", "users"],
          ["gunluk-personel-kartlari", "Günlük Personel Kartları", "users"],
          ["ik-raporlari", "Haftalık Özet", "takvim"],
          ["gunluk-odeme-fisleri", "Günlük Ödeme Fişleri", "odemeler"],
        ],
      },
    ],
  },
  {
    key: "desen",
    label: "Desen",
    permissionKey: "DESEN",
    icon: "dosya",
    tabs: [
      ["gelen-desenler", "Gelen Desenler", "dashboard"],
      ["desen-modeller", "Desen Havuzu", "dosya"],
      ["desen-yerlesim-is-akisi", "Yerleşim / Kalıp", "file-check"],
      ["desen-raporlari", "Desen Raporları", "raporlar"],
    ],
  },
  {
    key: "boyahane",
    label: "Boyahane",
    permissionKey: "BOYAHANE",
    icon: "renk",
    tabs: [
      ["is-akisi", "İş Akışı", "dashboard"],
      ["kayitli-renkler", "Kayıtlı Renkler", "renk"],
      ["receteler", "Reçeteler", "file-check"],
      ["urun-lotlar", "Ürün ve Lotlar", "urunler"],
      ["uretim-gecmisi", "Üretim Geçmişi", "dosya"],
      ["boya-giderleri", "Boya Giderleri", "odeme"],
      ["raporlar", "Raporlar", "raporlar"],
    ],
  },
  {
    key: "uretim",
    label: "İmalat",
    permissionKey: "IMALAT",
    icon: "dashboard",
    tabs: [
      ["uretim-girisi", "Üretim Girişi", "dashboard"],
      ["imalat-kontrol-rapor", "Denetim ve Rapor", "raporlar"],
    ],
  },
  {
    key: "asistan",
    label: "KY ERP Asistan",
    permissionKey: "ASISTAN",
    icon: "dashboard",
    tabs: [["sohbet", "Asistan Sohbeti", "dashboard"]],
  },
  {
    key: "admin",
    label: "Yönetim",
    permissionKey: "ADMIN",
    icon: "ayarlar",
    tabs: [
      ["admin-yonetim-ozeti", "Yönetim Özeti", "dashboard"],
      ["kullanicilar", "Kullanıcılar", "users"],
      ["ana-firma-ayarlar", "Ana Firma / Ayarlar", "ayarlar"],
      ["dosya-klasor-yonetimi", "Dosya ve Klasör Yönetimi", "dosya"],
      ["eslestirmeler", "Eşleştirmeler", "file-check"],
      ["yedekleme-loglar", "Yedekleme / Loglar", "raporlar"],
    ],
  },
];

function flatTabs(module) {
  return module.groups
    ? module.groups.flatMap((group) => group.tabs)
    : module.tabs || [];
}

function routeState() {
  const [moduleKey, tabKey] = window.location.pathname.split("/").filter(Boolean);
  const module = MODULES.find((item) => item.key === moduleKey) || MODULES[0];
  const tabs = flatTabs(module);
  const tab = tabs.find((item) => item[0] === tabKey) || tabs[0];
  return { moduleKey: module.key, tabKey: tab?.[0] || "" };
}

function LoadingCard() {
  return <div className="v2-loading-card">Ekran yükleniyor...</div>;
}

export default function AppV2() {
  const { user, loading, isAuthenticated, hasModule, logout } = useAuth();
  const { companies, activeCompany, activeCompanySlug, setActiveCompanySlug } = useActiveCompany();
  const initial = useMemo(routeState, []);
  const [activeModule, setActiveModule] = useState(initial.moduleKey);
  const [activeTab, setActiveTab] = useState(initial.tabKey);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [tabs, setTabs] = useState(() => [
    { id: `${initial.moduleKey}:${initial.tabKey}`, moduleKey: initial.moduleKey, tabKey: initial.tabKey },
  ]);

  const visibleModules = useMemo(
    () => MODULES.filter((item) => hasModule(item.permissionKey)),
    [hasModule],
  );
  const module = visibleModules.find((item) => item.key === activeModule) || visibleModules[0] || MODULES[0];
  const currentTabs = flatTabs(module);
  const tabLabel = currentTabs.find((item) => item[0] === activeTab)?.[1] || "";
  const activeMainCompany = useMemo(() => {
    return companies.find((item) => item.slug === activeCompanySlug) || activeCompany || companies[0] || null;
  }, [activeCompany, activeCompanySlug, companies]);

  const openScreen = useCallback((moduleKey, tabKey) => {
    const nextModule = MODULES.find((item) => item.key === moduleKey);
    if (!nextModule || !hasModule(nextModule.permissionKey)) return;
    const nextTab = tabKey || flatTabs(nextModule)[0]?.[0] || "";
    const id = `${moduleKey}:${nextTab}`;
    setActiveModule(moduleKey);
    setActiveTab(nextTab);
    setTabs((current) => current.some((item) => item.id === id)
      ? current
      : [...current, { id, moduleKey, tabKey: nextTab }]);
    window.history.pushState({}, "", `/${moduleKey}/${nextTab}`);
    setMobileMenu(false);
  }, [hasModule]);

  function closeTab(id) {
    setTabs((current) => {
      const index = current.findIndex((item) => item.id === id);
      const next = current.filter((item) => item.id !== id);
      if (id === `${activeModule}:${activeTab}`) {
        const fallback = next[Math.max(0, index - 1)] || next[0];
        if (fallback) openScreen(fallback.moduleKey, fallback.tabKey);
        else openScreen(visibleModules[0]?.key || "muhasebe");
      }
      return next;
    });
  }

  function renderPage() {
    const props = { activeTab, activeMainCompany, openModule: (key, options = {}) => openScreen(key, options.tabKey) };
    if (activeModule === "muhasebe") return <MuhasebePage {...props} />;
    if (activeModule === "isnet") return <IsnetPage {...props} />;
    if (activeModule === "ik") return <IkPage {...props} />;
    if (activeModule === "desen") return <DesenPage {...props} />;
    if (activeModule === "boyahane") return <BoyahanePage {...props} />;
    if (activeModule === "uretim") return <UretimPage {...props} />;
    if (activeModule === "asistan") return <AiAssistantPage {...props} />;
    return <AdminPage {...props} />;
  }

  if (loading) return <LoadingCard />;
  if (!isAuthenticated) return <LoginPage />;

  return (
    <div className={`v2-shell ${mobileMenu ? "mobile-open" : ""}`}>
      {mobileMenu && <button className="v2-mobile-overlay" onClick={() => setMobileMenu(false)} />}
      <aside className="v2-rail">
        <button className="v2-logo" onClick={() => openScreen("muhasebe", "yonetim-ozeti")}>KY</button>
        <nav>
          {visibleModules.map((item) => (
            <button key={item.key} className={activeModule === item.key ? "active" : ""} onClick={() => openScreen(item.key)}>
              <ErpIcon name={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <aside className="v2-submenu">
        <div className="v2-submenu-brand"><strong>KY ERP</strong><span>{module.label}</span></div>
        <div className="v2-submenu-scroll">
          {module.groups ? module.groups.map((group) => (
            <section key={group.label} className="v2-menu-group">
              <h3>{group.label}</h3>
              {group.tabs.map(([key, label, icon]) => (
                <button key={key} className={activeTab === key ? "active" : ""} onClick={() => openScreen(module.key, key)}>
                  <ErpIcon name={icon} size={17} /><span>{label}</span>
                </button>
              ))}
            </section>
          )) : currentTabs.map(([key, label, icon]) => (
            <button key={key} className={activeTab === key ? "active" : ""} onClick={() => openScreen(module.key, key)}>
              <ErpIcon name={icon} size={17} /><span>{label}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="v2-main">
        <header className="v2-topbar">
          <button className="v2-icon-button mobile" onClick={() => setMobileMenu(true)}><Menu size={19} /></button>
          <label className="v2-search"><Search size={17} /><input placeholder="Firma, belge, model, ürün veya personel ara..." /></label>
          <select value={activeCompanySlug || ""} onChange={(event) => setActiveCompanySlug(event.target.value)}>
            {companies.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <button className="v2-icon-button notification"><Bell size={18} /><span>3</span></button>
          <div className="v2-user"><b>{String(user?.fullName || user?.username || "S").slice(0, 1)}</b><div><strong>{user?.fullName || user?.username}</strong><small>{user?.role || "-"}</small></div><button onClick={logout}>Çıkış</button></div>
        </header>

        <div className="v2-work-tabs">
          {tabs.map((item) => {
            const itemModule = MODULES.find((row) => row.key === item.moduleKey);
            const label = flatTabs(itemModule).find((row) => row[0] === item.tabKey)?.[1] || item.tabKey;
            const id = `${item.moduleKey}:${item.tabKey}`;
            return <button key={id} className={id === `${activeModule}:${activeTab}` ? "active" : ""} onClick={() => openScreen(item.moduleKey, item.tabKey)}><span>{label}</span>{tabs.length > 1 && <i onClick={(event) => { event.stopPropagation(); closeTab(id); }}><X size={13} /></i>}</button>;
          })}
        </div>

        <div className="v2-breadcrumb"><span>KY ERP</span><span>/</span><span>{module.label}</span><span>/</span><strong>{tabLabel}</strong></div>
        <section className="v2-workspace"><Suspense fallback={<LoadingCard />}>{renderPage()}</Suspense></section>
        <footer className="v2-status"><span>KY ERP</span><span>Firma: {activeMainCompany?.name || "-"}</span><span className="ok">● Sistem hazır</span></footer>
      </main>
    </div>
  );
}
