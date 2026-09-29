import React, { useMemo } from "react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import IkPage from "../IkPage";

const VALID_VIEWS = new Set([
  "daily-entry",
  "daily-cards",
  "daily-weekly",
  "daily-payments",
]);

function resolveView(activeTab) {
  const fromProp = String(activeTab || "").trim();
  if (VALID_VIEWS.has(fromProp)) return fromProp;
  const routeTab = String(window.location.pathname || "")
    .split("/")
    .filter(Boolean)
    .at(-1);
  return VALID_VIEWS.has(routeTab) ? routeTab : "daily-entry";
}

export default function DailyHrWorkspace({ activeTab }) {
  const { activeCompany } = useActiveCompany();
  const company = useMemo(() => activeCompany || null, [activeCompany]);
  const view = resolveView(activeTab);

  return (
    <div className="gop-canonical-workspace">
      <style>{`
        .gop-canonical-workspace{min-width:0}
        .gop-canonical-workspace .kyik-page{height:calc(100vh - 74px)!important}
      `}</style>
      <IkPage activeTab={view} activeMainCompany={company} />
    </div>
  );
}
