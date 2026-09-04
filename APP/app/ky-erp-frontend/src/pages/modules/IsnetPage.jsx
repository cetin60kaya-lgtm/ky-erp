import EBelgeCenterPage from "./muhasebe/EBelgeCenterPage";
import LegacyIsnetPage from "./LegacyIsnetPage";
import "./eBelgeRoute.css";

const TAB_TO_VIEW = {
  "e-belge-genel": "overview",
  "e-belge-gelen-faturalar": "invoices",
  "e-belge-giden-faturalar": "outgoing-invoices",
  "e-belge-gelen-irsaliyeler": "dispatches",
  "e-belge-giden-irsaliyeler": "outgoing-dispatches",
  "e-belge-yukleme": "upload",
  "e-belge-eslestirmeler": "matching",
  "e-belge-onay-sorunlar": "issues",
  "e-belge-entegrasyonlar": "integrations",
  "e-belge-gecmis": "history",
};

export default function IsnetPage({ activeTab, activeMainCompany, openModule, moduleActionContext, ...rest }) {
  if (String(activeTab || "").startsWith("e-belge-")) {
    return <div className="eb-route-shell"><EBelgeCenterPage activeMainCompany={activeMainCompany} openModule={openModule} initialView={TAB_TO_VIEW[activeTab] || "overview"} /></div>;
  }
  return <LegacyIsnetPage activeTab={activeTab} activeMainCompany={activeMainCompany} openModule={openModule} moduleActionContext={moduleActionContext} {...rest} />;
}
