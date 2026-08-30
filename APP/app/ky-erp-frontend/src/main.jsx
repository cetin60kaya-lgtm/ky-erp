import React from "react";
import ReactDOM from "react-dom/client";
import PublicLandingPage from "./pages/PublicLandingPage.jsx";

const PUBLIC_SITE_HOSTS = new Set(["kyerp.net", "www.kyerp.net"]);
const APP_URL = "https://app.kyerp.net/";
const hostname = String(window.location.hostname || "").toLowerCase();
const isPublicSite = PUBLIC_SITE_HOSTS.has(hostname);
const publicRedirectPaths = new Set(["/giris", "/login", "/app"]);
const rootElement = document.getElementById("root");

async function renderErpApp() {
  const [
    { default: AppV3 },
    { ActiveCompanyProvider },
    { AuthProvider },
    { installAuthenticatedAssetBridge },
    { installMuhasebeDocumentSanitizer },
    { installPersistentModalSizing },
  ] = await Promise.all([
    import("./AppV3.jsx"),
    import("./context/ActiveCompanyContext"),
    import("./context/AuthContext"),
    import("./utils/installAuthenticatedAssetBridge"),
    import("./utils/installMuhasebeDocumentSanitizer"),
    import("./utils/installPersistentModalSizing"),
    import("./App.css"),
    import("./styles/shell-v3-isnet.css"),
  ]);

  installAuthenticatedAssetBridge();
  installMuhasebeDocumentSanitizer();
  installPersistentModalSizing();

  const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;

  function RootApp() {
    return (
      <AuthProvider>
        <ActiveCompanyProvider>
          <AppV3 />
        </ActiveCompanyProvider>
      </AuthProvider>
    );
  }

  ReactDOM.createRoot(rootElement).render(
    <RootWrapper>
      <RootApp />
    </RootWrapper>,
  );
}

if (isPublicSite && publicRedirectPaths.has(window.location.pathname.toLowerCase())) {
  window.location.replace(APP_URL);
} else if (isPublicSite) {
  ReactDOM.createRoot(rootElement).render(<PublicLandingPage />);
} else {
  renderErpApp().catch((error) => {
    console.error("KY ERP uygulama kabugu yuklenemedi", error);
    ReactDOM.createRoot(rootElement).render(
      <main style={{ maxWidth: 560, margin: "64px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 24 }}>KY ERP açılamadı</h1>
        <p>Uygulama dosyaları yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yeniden açın.</p>
        <button type="button" onClick={() => window.location.reload()}>Yeniden Dene</button>
      </main>,
    );
  });
}
