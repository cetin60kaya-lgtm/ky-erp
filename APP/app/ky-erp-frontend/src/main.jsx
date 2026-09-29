import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PublicLandingPage from "./pages/PublicLandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { installAndroidRuntimeBridge } from "./utils/installAndroidRuntimeBridge";

const PUBLIC_SITE_HOSTS = new Set(["kyerp.net", "www.kyerp.net"]);
const hostname = String(window.location.hostname || "").toLowerCase();
const isPublicSite = PUBLIC_SITE_HOSTS.has(hostname);
const directLoginPaths = new Set(["/giris", "/login", "/app"]);
const rootElement = document.getElementById("root");

async function retireLegacyPhoneApprovalWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      const worker = registration.active || registration.waiting || registration.installing;
      const scriptUrl = String(worker?.scriptURL || "");
      if (!scriptUrl.endsWith("/kyerp-push-sw.js")) return;
      try {
        const notifications = await registration.getNotifications();
        notifications.forEach((notification) => notification.close());
      } catch { /* Legacy notification cleanup is best-effort. */ }
      await registration.unregister();
    }));
  } catch (error) {
    console.warn("Eski KY ERP telefon bildirim servisi temizlenemedi", error);
  }
}

async function loadErpRuntime() {
  installAndroidRuntimeBridge();
  void retireLegacyPhoneApprovalWorker();

  const { installPersistedAuthBootstrap } = await import("./context/authBootstrap");
  installPersistedAuthBootstrap();
  await import("./app/pdksModuleRegistryPatch");

  const [
    { default: AppV3 },
    { ActiveCompanyProvider },
    { AuthProvider, useAuth },
    { installAuthenticatedAssetBridge },
    { installMuhasebeDocumentSanitizer },
  ] = await Promise.all([
    import("./AppV3.jsx"),
    import("./context/ActiveCompanyContext"),
    import("./context/AuthContext"),
    import("./utils/installAuthenticatedAssetBridge"),
    import("./utils/installMuhasebeDocumentSanitizer"),
    import("./App.css"),
  ]);

  // Canonical UI en son yüklenir; eski modül CSS'leri yan panel davranışını geri getiremez.
  await import("./styles/canonical-workspace-ui.css");
  await import("./styles/module-action-popups.css");

  installAuthenticatedAssetBridge();
  installMuhasebeDocumentSanitizer();
  return { AppV3, ActiveCompanyProvider, AuthProvider, useAuth };
}

async function renderCanonicalHost() {
  const { AppV3, ActiveCompanyProvider, AuthProvider, useAuth } = await loadErpRuntime();
  const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;

  function CanonicalHostApp() {
    const { isAuthenticated } = useAuth();
    const [loginOpen, setLoginOpen] = useState(() => {
      const initialPath = String(window.location.pathname || "/").toLowerCase();
      return directLoginPaths.has(initialPath) || initialPath !== "/";
    });

    useEffect(() => {
      if (directLoginPaths.has(String(window.location.pathname || "").toLowerCase())) {
        window.history.replaceState({}, "", "/" + window.location.search + window.location.hash);
      }
      const openLogin = () => setLoginOpen(true);
      window.addEventListener("kyerp:open-login", openLogin);
      return () => window.removeEventListener("kyerp:open-login", openLogin);
    }, []);

    if (isAuthenticated) return <ActiveCompanyProvider><AppV3 /></ActiveCompanyProvider>;

    return (
      <>
        <PublicLandingPage onOpenLogin={() => setLoginOpen(true)} />
        {loginOpen ? <LoginPage onClose={() => setLoginOpen(false)} /> : null}
      </>
    );
  }

  ReactDOM.createRoot(rootElement).render(
    <RootWrapper><AuthProvider><CanonicalHostApp /></AuthProvider></RootWrapper>,
  );
}

async function renderErpApp() {
  const { AppV3, ActiveCompanyProvider, AuthProvider } = await loadErpRuntime();
  const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;
  ReactDOM.createRoot(rootElement).render(
    <RootWrapper><AuthProvider><ActiveCompanyProvider><AppV3 /></ActiveCompanyProvider></AuthProvider></RootWrapper>,
  );
}

const renderFailure = (error) => {
  console.error("KY ERP uygulama kabugu yuklenemedi", error);
  ReactDOM.createRoot(rootElement).render(
    <main style={{ maxWidth: 560, margin: "64px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>KY ERP acilamadi</h1>
      <p>Uygulama dosyalari yuklenemedi. Internet baglantinizi kontrol edip sayfayi yeniden acin.</p>
      <button type="button" onClick={() => window.location.reload()}>Yeniden Dene</button>
    </main>,
  );
};

if (isPublicSite) renderCanonicalHost().catch(renderFailure);
else renderErpApp().catch(renderFailure);
