import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PublicLandingPage from "./pages/PublicLandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { installPersistedAuthBootstrap } from "./context/authBootstrap";
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

  installPersistedAuthBootstrap();
  await import("./app/pdksModuleRegistryPatch");

  const [
    { default: AppV3 },
    { ActiveCompanyProvider },
    { default: GlobalLeftClickMenu },
    { syncApplicationSettingsTabForUser },
    { installAuthenticatedAssetBridge },
    { installMuhasebeDocumentSanitizer },
  ] = await Promise.all([
    import("./AppV3.jsx"),
    import("./context/ActiveCompanyContext"),
    import("./components/shell/GlobalLeftClickMenu"),
    import("./app/applicationSettingsModulePatch"),
    import("./utils/installAuthenticatedAssetBridge"),
    import("./utils/installMuhasebeDocumentSanitizer"),
    import("./App.css"),
  ]);

  // Canonical UI en son yüklenir; eski modül CSS'leri ortak pencere davranışını geri getiremez.
  await import("./styles/canonical-workspace-ui.css");
  await import("./styles/module-action-popups.css");
  await import("./styles/canonical-dialog-resize.css");
  const { installCanonicalDialogSizing } = await import("./utils/installCanonicalDialogSizing");

  installAuthenticatedAssetBridge();
  installMuhasebeDocumentSanitizer();
  installCanonicalDialogSizing();
  return {
    AppV3,
    ActiveCompanyProvider,
    AuthProvider,
    useAuth,
    GlobalLeftClickMenu,
    syncApplicationSettingsTabForUser,
  };
}

async function renderCanonicalHost() {
  // Public landing/login must stay available even when a heavy ERP chunk fails.
  // Only the authenticated workspace loads AppV3 and module bundles.
  installAndroidRuntimeBridge();
  void retireLegacyPhoneApprovalWorker();
  installPersistedAuthBootstrap();

  function AuthenticatedWorkspace({ user }) {
    const [runtime, setRuntime] = useState(null);
    const [runtimeError, setRuntimeError] = useState("");

    useEffect(() => {
      let active = true;
      loadErpRuntime()
        .then((loaded) => {
          if (active) setRuntime(loaded);
        })
        .catch((error) => {
          console.error("KY ERP authenticated workspace yuklenemedi", error);
          if (active) setRuntimeError("Çalışma alanı yüklenemedi. Giriş oturumunuz korunuyor; yeniden deneyebilirsiniz.");
        });
      return () => { active = false; };
    }, []);

    if (runtimeError) {
      return (
        <main style={{ maxWidth: 620, margin: "64px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 24 }}>KY ERP çalışma alanı açılamadı</h1>
          <p>{runtimeError}</p>
          <button type="button" onClick={() => window.location.reload()}>Yeniden Dene</button>
        </main>
      );
    }

    if (!runtime) {
      return (
        <main style={{ maxWidth: 620, margin: "64px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 22 }}>KY ERP yükleniyor</h1>
          <p>Yetkili çalışma alanı hazırlanıyor...</p>
        </main>
      );
    }

    const {
      AppV3,
      ActiveCompanyProvider,
      GlobalLeftClickMenu,
      syncApplicationSettingsTabForUser,
    } = runtime;
    syncApplicationSettingsTabForUser(user);

    return (
      <ActiveCompanyProvider>
        <AppV3 />
        <GlobalLeftClickMenu />
      </ActiveCompanyProvider>
    );
  }

  function CanonicalHostApp() {
    const { isAuthenticated, user } = useAuth();
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

    if (isAuthenticated) return <AuthenticatedWorkspace user={user} />;

    return (
      <>
        <PublicLandingPage onOpenLogin={() => setLoginOpen(true)} />
        {loginOpen ? <LoginPage onClose={() => setLoginOpen(false)} /> : null}
      </>
    );
  }

  const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;
  ReactDOM.createRoot(rootElement).render(
    <RootWrapper><AuthProvider><CanonicalHostApp /></AuthProvider></RootWrapper>,
  );
}

async function renderErpApp() {
  const {
    AppV3,
    ActiveCompanyProvider,
    AuthProvider,
    useAuth,
    GlobalLeftClickMenu,
    syncApplicationSettingsTabForUser,
  } = await loadErpRuntime();
  const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;

  function ErpRuntime() {
    const { user } = useAuth();
    syncApplicationSettingsTabForUser(user);
    return (
      <ActiveCompanyProvider>
        <AppV3 />
        <GlobalLeftClickMenu />
      </ActiveCompanyProvider>
    );
  }

  ReactDOM.createRoot(rootElement).render(
    <RootWrapper><AuthProvider><ErpRuntime /></AuthProvider></RootWrapper>,
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

// The /mobile route must not enter the public desktop login modal.
const isMobileRoute = /^\/mobile(?:\/|$)/i.test(window.location.pathname);
async function renderMobileHost() {
  const { default: MobileApp } = await import("./mobile/MobileApp.jsx");
  ReactDOM.createRoot(rootElement).render(<React.StrictMode><MobileApp /></React.StrictMode>);
}
if (isMobileRoute) renderMobileHost().catch(renderFailure);
else if (isPublicSite) renderCanonicalHost().catch(renderFailure);
else renderErpApp().catch(renderFailure);
