import { useMemo, useState } from "react";
import CekOdemeMerkeziPage from "../../muhasebe/CekOdemeMerkeziPage";
import AccountingLedgerPanel from "./AccountingLedgerPanel";
import FinancialAccountsPanel from "./FinancialAccountsPanel";
import PaymentPlannerPanel from "./PaymentPlannerPanel";

const VIEWS = new Set(["daily", "planner", "ledger"]);

export default function FinanceOperationsWorkspace({ activeMainCompany, refreshKey = 0, reloadAll }) {
  const initialView = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("financeView") || "daily";
    return VIEWS.has(requested) ? requested : "daily";
  }, []);
  const [view, setView] = useState(initialView);

  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-subbar" role="tablist" aria-label="Finans işlemleri görünümü">
        <button type="button" className={view === "daily" ? "active" : ""} onClick={() => setView("daily")}>
          Ödeme / Tahsilat / Çek
        </button>
        <button type="button" className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}>
          Ödeme Planı
        </button>
        <button type="button" className={view === "ledger" ? "active" : ""} onClick={() => setView("ledger")}>
          Banka / Kasa / Defter
        </button>
      </div>
      <div className="accounting-composite-body">
        {view === "daily" ? (
          <CekOdemeMerkeziPage
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
            embedded
          />
        ) : null}
        {view === "planner" ? <PaymentPlannerPanel activeMainCompany={activeMainCompany} /> : null}
        {view === "ledger" ? (
          <>
            <FinancialAccountsPanel activeMainCompany={activeMainCompany} refreshKey={refreshKey} />
            <AccountingLedgerPanel activeMainCompany={activeMainCompany} refreshKey={refreshKey} />
          </>
        ) : null}
      </div>
    </section>
  );
}
