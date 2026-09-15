import { useState } from "react";
import IrsaliyeFaturaKontrolTab from "./IrsaliyeFaturaKontrolTab";
import KesilenFaturalarTab from "./KesilenFaturalarTab";

export default function CustomerDocumentsWorkspace({ activeMainCompany }) {
  const [view, setView] = useState("chain");

  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-subbar" role="tablist" aria-label="Müşteri belgeleri görünümü">
        <button
          type="button"
          className={view === "chain" ? "active" : ""}
          onClick={() => setView("chain")}
        >
          İrsaliye / Fatura Zinciri
        </button>
        <button
          type="button"
          className={view === "invoices" ? "active" : ""}
          onClick={() => setView("invoices")}
        >
          Kesilen Faturalar
        </button>
      </div>
      <div className="accounting-composite-body">
        {view === "chain" ? (
          <IrsaliyeFaturaKontrolTab activeMainCompany={activeMainCompany} />
        ) : (
          <KesilenFaturalarTab activeMainCompany={activeMainCompany} />
        )}
      </div>
    </section>
  );
}
