import { useMemo, useState } from "react";
import CekOdemeMerkeziPage from "../../muhasebe/CekOdemeMerkeziPage";
import AccountingLedgerPanel from "./AccountingLedgerPanel";
import FinancialAccountsPanel from "./FinancialAccountsPanel";
import PaymentPlannerPanel from "./PaymentPlannerPanel";

const VIEWS = new Set(["daily", "planner", "ledger"]);

export default function FinanceOperationsWorkspace({ activeMainCompany, refreshKey = 0, reloadAll }) {
  const initialState = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("financeView") || "daily";
    return {
      view: VIEWS.has(requested) ? requested : "daily",
      selectedCompanyId: params.get("companyId") || params.get("financeCompanyId") || "",
    };
  }, []);
  const [view, setView] = useState(initialState.view);

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
            hideFirmDirectory
            selectedCompanyId={initialState.selectedCompanyId}
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
