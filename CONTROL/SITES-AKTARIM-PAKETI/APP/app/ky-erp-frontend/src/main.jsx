import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import "./App.css";
import { Capacitor } from "@capacitor/core";

installMuhasebeDocumentSanitizer();

const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;

const currentPath = window.location.pathname;

// /mobile elle açıldıysa veya Android Capacitor içindeysek MobileApp yüklenir.
// Masaüstü /muhasebe, /ik, /desen gibi rotalar asla /mobile/... tarafına çevrilmez.
const isMobile = currentPath.startsWith("/mobile") || Capacitor.isNativePlatform();

function mountApp(RootComponent) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <RootWrapper>
      <RootComponent />
    </RootWrapper>,
  );
}

if (isMobile) {
  // /mobile/* veya Native Capacitor → MobileApp (ayrı dinamik bundle)
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
