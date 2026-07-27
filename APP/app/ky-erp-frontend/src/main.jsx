import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import { installPersistentModalSizing } from "./utils/installPersistentModalSizing";
import "./App.css";
import "./styles/kyerp-v2-shell.css";

installMuhasebeDocumentSanitizer();
installPersistentModalSizing();

const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;

const currentPath = window.location.pathname;

// /mobile tarayıcı rotası ayrı ve hafif bir web paketi olarak yüklenir.
// Masaüstü /muhasebe, /ik, /desen gibi rotalar /mobile tarafına çevrilmez.
const isMobileWebRoute = currentPath.startsWith("/mobile");

function mountApp(RootComponent) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <RootWrapper>{React.createElement(RootComponent)}</RootWrapper>,
  );
}

if (isMobileWebRoute) {
  // /mobile/* → MobileApp (ayrı dinamik web bundle'ı)
  import("./mobile/MobileApp.jsx").then(({ default: MobileApp }) => {
    mountApp(MobileApp);
  });
} else {
  // Desktop
  function DesktopRoot() {
    return (
      <AuthProvider>
        <ActiveCompanyProvider>
          <App />
        </ActiveCompanyProvider>
      </AuthProvider>
    );
  }
  mountApp(DesktopRoot);
}
