import React from "react";
import ReactDOM from "react-dom/client";
import AppV3 from "./AppV3.jsx";
import MonthlyPersonnelWorkspace from "./pages/modules/ik/MonthlyPersonnelWorkspace.jsx";
import MonthlySalaryContractWorkspace from "./pages/modules/ik/MonthlySalaryContractWorkspace.jsx";
import MonthlyOperationsWorkspace from "./pages/modules/ik/MonthlyOperationsWorkspace.jsx";
import DailyHrWorkspace from "./pages/modules/ik/DailyHrWorkspace.jsx";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import { installPersistentModalSizing } from "./utils/installPersistentModalSizing";
import "./App.css";
import "./styles/shell-v3-isnet.css";

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
          <AppV3 />
          <MonthlyPersonnelWorkspace />
          <MonthlySalaryContractWorkspace />
          <MonthlyOperationsWorkspace />
          <DailyHrWorkspace />
        </ActiveCompanyProvider>
      </AuthProvider>
    );
  }

  mountApp(DesktopRoot);
}
