import { useEffect, useMemo, useState } from "react";
import CekOdemeMerkeziPage from "../../muhasebe/CekOdemeMerkeziPage";
import AccountingLedgerPanel from "./AccountingLedgerPanel";
import FinancialAccountsPanel from "./FinancialAccountsPanel";
import PaymentPlannerPanel from "./PaymentPlannerPanel";

const VIEWS = new Set(["daily", "planner", "ledger"]);

export default function FinanceOperationsWorkspace({ activeMainCompany, refreshKey = 0, reloadAll, moduleActionContext }) {
  const action = useMemo(() => {
    if (moduleActionContext?.targetModule !== "muhasebe" || moduleActionContext?.targetTab !== "finans-islemleri") return {};
    return moduleActionContext;
  }, [moduleActionContext]);
  const requestedView = VIEWS.has(action.financeView) ? action.financeView : "daily";
  const selectedCompanyId = action.companyId || action.financeCompanyId || "";
  const [view, setView] = useState(requestedView);

  useEffect(() => {
    setView(requestedView);
  }, [requestedView, action.nonce]);

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
            selectedCompanyId={selectedCompanyId}
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
