import React, { useMemo, useState } from "react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import IkPage from "../IkPage";

const VIEWS = [
  ["daily-entry", "Günlük Giriş"],
  ["daily-cards", "Personel Kartları"],
  ["daily-weekly", "Haftalık Özet"],
  ["daily-payments", "Ödeme Fişleri"],
];

function initialView() {
  const key = String(window.sessionStorage.getItem("kyerp.dailyOps.view") || "").trim();
  return VIEWS.some(([value]) => value === key) ? key : "daily-entry";
}

export default function DailyHrWorkspace() {
  const { activeCompany } = useActiveCompany();
  const [view, setView] = useState(initialView);
  const company = useMemo(() => activeCompany || null, [activeCompany]);

  const selectView = (next) => {
    setView(next);
    try {
      window.sessionStorage.setItem("kyerp.dailyOps.view", next);
    } catch {
      // sessionStorage is optional; the selected view still stays in React state.
    }
  };

  return (
    <div className="gop-legacy-bridge">
      <style>{`
        .gop-legacy-bridge{min-width:0}
        .gop-legacy-nav{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px 12px;border:1px solid #dce6f4;border-radius:10px;background:#fff;margin:0 0 8px;box-shadow:0 4px 14px rgba(15,35,68,.05)}
        .gop-legacy-nav button{min-height:34px;padding:0 12px;border:1px solid #d6e1f0;border-radius:8px;background:#f8fafc;color:#334155;font-weight:850;cursor:pointer}
        .gop-legacy-nav button.active{background:#fff3e6;border-color:#fb923c;color:#9a3412;box-shadow:inset 0 -2px 0 #f97316}
        .gop-legacy-bridge .kyik-page{height:calc(100vh - 112px)!important}
        @media(max-width:760px){.gop-legacy-nav{overflow-x:auto;flex-wrap:nowrap}.gop-legacy-nav button{white-space:nowrap}}
      `}</style>
      <nav className="gop-legacy-nav" aria-label="Günlük Operasyon ekranları">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => selectView(key)}>{label}</button>
        ))}
      </nav>
      <IkPage activeTab={view} activeMainCompany={company} />
    </div>
  );
}
