import React from "react";
import ReactDOM from "react-dom/client";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import { installPersistentModalSizing } from "./utils/installPersistentModalSizing";
import "./App.css";

installMuhasebeDocumentSanitizer();
installPersistentModalSizing();

const RootWrapper = import.meta.env.DEV ? React.Fragment : React.StrictMode;
const currentPath = window.location.pathname;
const isMobileWebRoute = currentPath.startsWith("/mobile");
const useShellV3 = String(import.meta.env.VITE_APP_SHELL_V3 || "").toLowerCase() === "true";

function mountApp(RootComponent) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <RootWrapper>{React.createElement(RootComponent)}</RootWrapper>,
  );
}

if (isMobileWebRoute) {
  import("./mobile/MobileApp.jsx").then(({ default: MobileApp }) => {
    mountApp(MobileApp);
  });
} else {
  const appLoader = useShellV3 ? import("./AppV3.jsx") : import("./App.jsx");

  appLoader.then(({ default: DesktopApp }) => {
    function DesktopRoot() {
      return (
        <AuthProvider>
          <ActiveCompanyProvider>
            <DesktopApp />
          </ActiveCompanyProvider>
        </AuthProvider>
      );
    }

    mountApp(DesktopRoot);
  });
}
