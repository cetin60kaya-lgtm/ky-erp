import React from "react";
import ReactDOM from "react-dom/client";
import AppV2 from "./AppV2.jsx";
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
  function DesktopRoot() {
    return (
      <AuthProvider>
        <ActiveCompanyProvider>
          <AppV2 />
        </ActiveCompanyProvider>
      </AuthProvider>
    );
  }
  mountApp(DesktopRoot);
}
