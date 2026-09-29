import { useState } from "react";
import AccountingReportsListWorkspace from "./AccountingReportsListWorkspace";
import ProfitLossWorkspace from "./ProfitLossWorkspace";
import VatComparisonWorkspace from "./VatComparisonWorkspace";

export default function FinancialControlWorkspace(props) {
  const [view, setView] = useState("profit");
  const { activeMainCompany, refreshKey } = props;

  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-subbar" role="tablist" aria-label="Mali kontrol görünümü">
        <button type="button" className={view === "profit" ? "active" : ""} onClick={() => setView("profit")}>
          Gelir / Gider & Kâr / Zarar
        </button>
        <button type="button" className={view === "vat" ? "active" : ""} onClick={() => setView("vat")}>
          KDV Kontrolü
        </button>
        <button type="button" className={view === "reports" ? "active" : ""} onClick={() => setView("reports")}>
          Raporlar
        </button>
      </div>
      <div className="accounting-composite-body">
        {view === "profit" ? (
          <ProfitLossWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />
        ) : null}
        {view === "vat" ? <VatComparisonWorkspace {...props} /> : null}
        {view === "reports" ? <AccountingReportsListWorkspace {...props} /> : null}
      </div>
    </section>
  );
}
