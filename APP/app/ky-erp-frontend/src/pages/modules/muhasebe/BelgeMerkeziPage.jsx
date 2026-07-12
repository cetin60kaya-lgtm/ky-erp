import { useEffect, useState } from "react";

import {
  BizimBelgelerPage,
  TedarikciFaturaPage,
  MusteriIrsaliyePage,
} from "../MuhasebeDocumentPages";
import { SectionCard } from "../../../components/erp/AccountingUi";

function normalizeBelgeTab(value) {
  const key = String(value || "").toLocaleLowerCase("tr-TR");
  if (key === "gelen-irsaliye") return "gelen-irsaliye";
  if (key === "tedarik-fatura") return "tedarik-fatura";
  return "bizim-fatura";
}

export function BelgeMerkeziPage({
  activeMainCompany,
  defaultTab = "bizim-fatura",
}) {
  const [activeBelgeTab, setActiveBelgeTab] = useState(() =>
    normalizeBelgeTab(defaultTab),
  );

  useEffect(() => {
    setActiveBelgeTab(normalizeBelgeTab(defaultTab));
  }, [defaultTab]);

  return (
    <div className="muh-belge-merkezi">
      <div className="muh-doc-mode-tabs muh-doc-mode-tabs-triple">
        <button
          type="button"
          className={activeBelgeTab === "gelen-irsaliye" ? "active" : ""}
          onClick={() => setActiveBelgeTab("gelen-irsaliye")}
        >
          Gelen İrsaliye
        </button>
        <button
          type="button"
          className={activeBelgeTab === "bizim-fatura" ? "active" : ""}
          onClick={() => setActiveBelgeTab("bizim-fatura")}
        >
          Bizim Fatura
        </button>
        <button
          type="button"
          className={activeBelgeTab === "tedarik-fatura" ? "active" : ""}
          onClick={() => setActiveBelgeTab("tedarik-fatura")}
        >
          Tedarik Fatura
        </button>
      </div>

      <div
        className="muh-belge-tab-content"
        style={{
          display: activeBelgeTab === "gelen-irsaliye" ? "block" : "none",
        }}
      >
        <MusteriIrsaliyePage activeMainCompany={activeMainCompany} />
      </div>

      <div
        className="muh-belge-tab-content"
        style={{
          display: activeBelgeTab === "bizim-fatura" ? "block" : "none",
        }}
      >
        <BizimBelgelerPage
          activeMainCompany={activeMainCompany}
          initialWorkMode="fatura"
          showWorkModeTabs={false}
        />
      </div>

      <div
        className="muh-belge-tab-content"
        style={{
          display: activeBelgeTab === "tedarik-fatura" ? "block" : "none",
        }}
      >
        <TedarikciFaturaPage activeMainCompany={activeMainCompany} />
      </div>
    </div>
  );
}
