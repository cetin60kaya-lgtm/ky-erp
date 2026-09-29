import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCcw, Search } from "lucide-react";
import { getEBelgePool } from "../../../services/eBelgeApi";
import InvoiceDispatchControlWorkspace from "./InvoiceDispatchControlWorkspace";

const money = (value, currency = "TRY") => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 });
const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";
const statusText = (value) => ({
  INGESTED: "Yeni",
  REVIEW_REQUIRED: "Kontrol gerekli",
  READY_FOR_APPROVAL: "Onaya hazır",
  APPROVED: "Onaylandı",
  POSTED: "Muhasebeleşti",
  REJECTED: "Reddedildi",
  ERROR: "Hata",
}[String(value || "").toUpperCase()] || value || "-");

function OutgoingInvoicesPanel({ activeMainCompany, openModule }) {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [query, setQuery] = useState("");

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
    filter: "OUTGOING_INVOICE",
    q: query,
    page: 1,
    pageSize: 100,
  }), [activeMainCompany?.id, activeMainCompany?.slug, query]);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await getEBelgePool({ ...params, _ts: Date.now() });
      setState({ loading: false, error: "", items: Array.isArray(payload?.items) ? payload.items : [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Giden faturalar alınamadı.", items: [] });
    }
  }, [params]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  return <section className="accounting-composite-body">
    <div className="accounting-inline-actions">
      <label className="accounting-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Müşteri veya fatura no ara" /></label>
      <div>
        <button type="button" onClick={load}><RefreshCcw size={15} /> Yenile</button>
        <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "giden-belgeler" })}>e-Belge Giden Belgeler</button>
      </div>
    </div>
    {state.error ? <div className="accounting-controlled-state"><strong>Giden faturalar yüklenemedi.</strong><span>{state.error}</span></div> : null}
    <section className="accounting-table-card">
      {state.loading ? <div className="accounting-list-skeleton">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div> : state.items.length ? (
        <div className="accounting-table-wrap"><table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Fatura No</th><th>Matrah</th><th>KDV</th><th>Toplam</th><th>Durum</th></tr></thead><tbody>
          {state.items.map((row) => <tr key={row.id}><td>{dateText(row.issue_date)}</td><td><strong>{row.party_name || "Firma eşleşmesi bekliyor"}</strong></td><td>{row.document_no || "-"}</td><td>{money(row.subtotal, row.currency)}</td><td>{money(row.tax_total, row.currency)}</td><td><strong>{money(row.payable_total, row.currency)}</strong></td><td>{statusText(row.status)}</td></tr>)}
        </tbody></table></div>
      ) : <div className="accounting-empty"><FileText size={26} /><strong>Giden fatura bulunamadı.</strong><span>Satış faturaları e-Belge canonical havuzuna ulaştığında burada otomatik görünür.</span></div>}
    </section>
  </section>;
}

export default function CustomerDocumentsWorkspace({ activeMainCompany, openModule }) {
  const [view, setView] = useState("chain");
  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-subbar" role="tablist" aria-label="Müşteri satış görünümü">
        <button type="button" className={view === "chain" ? "active" : ""} onClick={() => setView("chain")}>İrsaliye / Fatura Zinciri</button>
        <button type="button" className={view === "invoices" ? "active" : ""} onClick={() => setView("invoices")}>Satış Faturaları</button>
      </div>
      {view === "chain" ? <InvoiceDispatchControlWorkspace activeMainCompany={activeMainCompany} /> : <OutgoingInvoicesPanel activeMainCompany={activeMainCompany} openModule={openModule} />}
    </section>
  );
}
