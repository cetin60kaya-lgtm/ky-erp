import React from "react";
import ReactDOM from "react-dom/client";
import AppV3 from "./AppV3.jsx";
import { ActiveCompanyProvider } from "./context/ActiveCompanyContext";
import { AuthProvider } from "./context/AuthContext";
import { installAuthenticatedAssetBridge } from "./utils/installAuthenticatedAssetBridge";
import { installMuhasebeDocumentSanitizer } from "./utils/installMuhasebeDocumentSanitizer";
import { installPersistentModalSizing } from "./utils/installPersistentModalSizing";
import "./App.css";
import "./styles/shell-v3-isnet.css";

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
