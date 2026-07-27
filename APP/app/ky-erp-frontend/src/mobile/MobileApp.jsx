/**
 * MobileApp — Mobile router
 * Pathname /mobile ile başlayan tüm route'ları handle eder.
 * React Router kullanılmıyor; mevcut App.jsx ile aynı yaklaşım (window.location.pathname).
 */
import { useState, useEffect } from "react";
import "./mobile.css";

import { getMobileToken } from "./mobileApi";

// Modüller
import MobileHome from "./MobileHome";
import MobileLogin from "./MobileLogin";
import MobileYonetim from "./MobileYonetim";
import MobileMuhasebe from "./MobileMuhasebe";
import MobileCari from "./MobileCari";
import MobileOdeme from "./MobileOdeme";
import MobileCek from "./MobileCek";
import MobileKdv from "./MobileKdv";
import MobileFaturaIrsaliye from "./MobileFaturaIrsaliye";
import MobileUrunler from "./MobileUrunler";
import MobileIK from "./MobileIK";
import MobileIKGunluk from "./MobileIKGunluk";
import MobileIKAylik from "./MobileIKAylik";
import MobileIKGunlukGiris from "./MobileIKGunlukGiris";
import MobileImalat from "./MobileImalat";
import MobileImalatGunluk from "./MobileImalatGunluk";
import MobileImalatRapor from "./MobileImalatRapor";
import MobileBoyahane from "./MobileBoyahane";
import MobileDesen from "./MobileDesen";
import MobileAdmin from "./MobileAdmin";
import MobileShell from "./MobileShell";

function getMobilePage(pathname) {
  const clean = pathname.replace(/\/+$/, ""); // remove trailing slash
  if (clean === "/mobile" || clean === "") return "home";
  if (clean.includes("/mobile/login")) return "login";
  if (clean === "/mobile/yonetim") return "yonetim";
  if (clean === "/mobile/muhasebe/cari") return "muhasebe_cari";
  if (clean === "/mobile/muhasebe/odeme") return "muhasebe_odeme";
  if (clean === "/mobile/muhasebe/cek") return "muhasebe_cek";
  if (clean === "/mobile/muhasebe/kdv") return "muhasebe_kdv";
  if (clean === "/mobile/muhasebe/fatura-irsaliye") return "muhasebe_fatura";
  if (clean === "/mobile/muhasebe/urunler") return "muhasebe_urunler";
  if (clean === "/mobile/muhasebe") return "muhasebe";
  if (clean === "/mobile/ik/gunluk-giris") return "ik_gunluk_giris";
  if (clean === "/mobile/ik/gunluk") return "ik_gunluk";
  if (clean === "/mobile/ik/aylik") return "ik_aylik";
  if (clean === "/mobile/ik") return "ik";
  if (clean === "/mobile/imalat/gunluk") return "imalat_gunluk";
  if (clean === "/mobile/imalat/rapor") return "imalat_rapor";
  if (clean === "/mobile/imalat") return "imalat";
  if (clean === "/mobile/boyahane") return "boyahane";
  if (clean === "/mobile/desen") return "desen";
  if (clean === "/mobile/admin") return "admin";
  
  // Fallbacks for sub-routes
  if (clean.startsWith("/mobile/yonetim")) return "yonetim";
  if (clean.startsWith("/mobile/muhasebe")) return "muhasebe";
  if (clean.startsWith("/mobile/ik")) return "ik";
  if (clean.startsWith("/mobile/imalat")) return "imalat";
  if (clean.startsWith("/mobile/desen")) return "desen";
  
  return "home";
}

export default function MobileApp() {
  const [token, setToken] = useState(() => getMobileToken());
  const [page, setPage] = useState(() => getMobilePage(window.location.pathname));

  useEffect(() => {
    function handlePop() {
      setPage(getMobilePage(window.location.pathname));
      setToken(getMobileToken());
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const handleLoginSuccess = () => {
    setToken(getMobileToken());
    window.history.pushState({}, "", "/mobile");
    setPage("home");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (!token) {
    // URL login değilse History API ile logine çek, ama full refresh atma
    if (!window.location.pathname.includes("/mobile/login")) {
      window.history.replaceState({}, "", "/mobile/login");
    }
    return <MobileLogin onLogin={handleLoginSuccess} />;
  }

  const renderContent = () => {
    switch (page) {
      case "login": return <MobileLogin onLogin={handleLoginSuccess} />;
      case "yonetim": return <MobileYonetim />;
      case "muhasebe_cari": return <MobileCari />;
      case "muhasebe_odeme": return <MobileOdeme />;
      case "muhasebe_cek": return <MobileCek />;
      case "muhasebe_kdv": return <MobileKdv />;
      case "muhasebe_fatura": return <MobileFaturaIrsaliye />;
      case "muhasebe_urunler": return <MobileUrunler />;
      case "muhasebe": return <MobileMuhasebe />;
      case "ik_gunluk_giris": return <MobileIKGunlukGiris />;
      case "ik_gunluk": return <MobileIKGunluk />;
      case "ik_aylik": return <MobileIKAylik />;
      case "ik": return <MobileIK />;
      case "imalat_gunluk": return <MobileImalatGunluk />;
      case "imalat_rapor": return <MobileImalatRapor />;
      case "imalat": return <MobileImalat />;
      case "boyahane": return <MobileBoyahane />;
      case "desen": return <MobileDesen />;
      case "admin": return <MobileAdmin />;
      case "home":
      default: return <MobileHome />;
    }
  };

  if (page === "login") {
    return renderContent();
  }

  return (
    <MobileShell>
      {renderContent()}
    </MobileShell>
  );
}
