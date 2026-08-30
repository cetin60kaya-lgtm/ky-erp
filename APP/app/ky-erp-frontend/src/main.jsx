import React from "react";
import ReactDOM from "react-dom/client";
import AppV3 from "./AppV3.jsx";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import PublicLandingPage from "./pages/PublicLandingPage.jsx";
import { installAuthenticatedAssetBridge } from "./utils/installAuthenticatedAssetBridge";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import { installPersistentModalSizing } from "./utils/installPersistentModalSizing";
import "./App.css";
import "./styles/shell-v3-isnet.css";

const PUBLIC_SITE_HOSTS = new Set(["kyerp.net", "www.kyerp.net"]);
const APP_URL = "https://app.kyerp.net/";
const hostname = String(window.location.hostname || "").toLowerCase();
const isPublicSite = PUBLIC_SITE_HOSTS.has(hostname);
const publicRedirectPaths = new Set(["/giris", "/login", "/app"]);

if (isPublicSite && publicRedirectPaths.has(window.location.pathname.toLowerCase())) {
  window.location.replace(APP_URL);
} else if (isPublicSite) {
  ReactDOM.createRoot(document.getElementById("root")).render(<PublicLandingPage />);
} else {
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

  ReactDOM.createRoot(document.getElementById("root")).render(
    <RootWrapper>
      <RootApp />
    </RootWrapper>,
  );
}
