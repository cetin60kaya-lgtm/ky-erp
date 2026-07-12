import { useEffect, useState } from "react";
import { getMobileToken, getMobileUserShortName, mobileLogout } from "./mobileApi";

const PAGE_LABELS = {
  "/mobile": "Ana Sayfa",
  "/mobile/yonetim": "Yönetim Özeti",
  "/mobile/muhasebe": "Muhasebe",
  "/mobile/muhasebe/cari": "Cari Hareketler",
  "/mobile/muhasebe/odeme": "Ödeme / Tahsilat",
  "/mobile/muhasebe/cek": "Çek / Senet",
  "/mobile/muhasebe/kdv": "KDV Takip",
  "/mobile/muhasebe/fatura-irsaliye": "Fatura / İrsaliye",
  "/mobile/muhasebe/urunler": "Ürünler",
  "/mobile/ik": "İnsan Kaynakları",
  "/mobile/ik/gunluk": "Günlük Personel",
  "/mobile/ik/aylik": "Aylık Personel",
  "/mobile/ik/gunluk-giris": "Günlük Giriş",
  "/mobile/imalat": "İmalat Merkezi",
  "/mobile/imalat/gunluk": "İmalat Günlük",
  "/mobile/imalat/rapor": "İmalat Rapor",
  "/mobile/boyahane": "Boyahane",
  "/mobile/desen": "Desen Havuzu",
  "/mobile/admin": "Admin",
  "/mobile/login": "Giriş",
};

const NAV_ITEMS = [
  { path: "/mobile", label: "Ana", icon: "🏠", exact: true },
  { path: "/mobile/yonetim", label: "Yönetim", icon: "📊" },
  { path: "/mobile/muhasebe", label: "Muhasebe", icon: "💼" },
  { path: "/mobile/ik", label: "İK", icon: "👥" },
  { path: "/mobile/imalat", label: "İmalat", icon: "🏭" },
  { path: "/mobile/desen", label: "Desen", icon: "🖼️" },
];

function getPageLabel(pathname) {
  const clean = pathname.replace(/\/+$/, "");
  for (const [path, label] of Object.entries(PAGE_LABELS)) {
    if (path === "/mobile" && clean === "/mobile") return label;
    if (path !== "/mobile" && clean.startsWith(path)) return label;
  }
  return "KY ERP Yönetim";
}

function isNavActive(item, currentPath) {
  if (item.exact) return currentPath === "/mobile" || currentPath === "/mobile/";
  if (item.path === "/mobile/yonetim") return currentPath.startsWith("/mobile/yonetim");
  if (item.path === "/mobile/muhasebe") return currentPath.startsWith("/mobile/muhasebe");
  if (item.path === "/mobile/ik") return currentPath.startsWith("/mobile/ik");
  if (item.path === "/mobile/imalat") return currentPath.startsWith("/mobile/imalat");
  if (item.path === "/mobile/desen") return currentPath.startsWith("/mobile/desen") || currentPath.startsWith("/mobile/boyahane");
  return false;
}

export default function MobileShell({ children }) {
  const [userShort, setUserShort] = useState("KY");
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    setUserShort(getMobileUserShortName());
  }, []);

  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
      setCurrentPath(path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  function handleLogout() {
    if (window.confirm("Çıkış yapmak istediğinize emin misiniz")) {
      mobileLogout();
    }
  }

  const token = getMobileToken();
  const pageLabel = getPageLabel(currentPath);

  // Show nothing if no token (MobileApp will render MobileLogin)
  if (!token) {
    return null;
  }

  return (
    <div className="ky-mobile-app">
      <div className="ky-mobile-shell">
        <header className="ky-mobile-header">
          <div className="ky-mobile-logo">KY</div>
          <div className="ky-mobile-titlebox">
            <h1>KY ERP Yönetim</h1>
            <p>{pageLabel}</p>
          </div>
          <div className="ky-mobile-avatar" onClick={() => navigate("/mobile/admin")} style={{ cursor: "pointer" }}>
            {userShort}
          </div>
          <button className="ky-mobile-logout" onClick={handleLogout}>
            Çıkış
          </button>
        </header>

        <main className="ky-mobile-content">
          {children}
        </main>

        <nav className="ky-mobile-bottom-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item?.path}
              className={`ky-mobile-navitem ${isNavActive(item, currentPath) ? "active" : ""}`}
              onClick={() => navigate(item?.path)}
            >
              <span className="ky-mobile-ico">{item?.icon}</span>
              <span>{item?.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
