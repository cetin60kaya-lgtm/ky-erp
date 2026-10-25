import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCcw, Search } from "lucide-react";
import { getEBelgePool } from "../../../services/eBelgeApi";
import InvoiceDispatchControlWorkspace from "./InvoiceDispatchControlWorkspace";
import { DOCUMENT_PAGE_SIZE, documentPageMeta } from "./documentPageMeta";
import "./documentPagination.css";

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

function OutgoingInvoicesPanel({ activeMainCompany, openModule, refreshKey = 0 }) {
  const [state, setState] = useState({ loading: true, error: "", items: [], pagination: documentPageMeta() });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const requestSeq = useRef(0);

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
    filter: "OUTGOING_INVOICE",
    q: query,
    page,
    pageSize: DOCUMENT_PAGE_SIZE,
  }), [activeMainCompany?.id, activeMainCompany?.slug, page, query]);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await getEBelgePool({ ...params, _ts: Date.now() });
      if (requestId !== requestSeq.current) return;
      const pagination = documentPageMeta(payload, page);
      if (pagination.page !== page) {
        setPage(pagination.page);
        return;
      }
      setState({ loading: false, error: "", items: Array.isArray(payload?.items) ? payload.items : [], pagination });
    } catch (error) {
      if (requestId !== requestSeq.current) return;
      setState({ loading: false, error: error?.message || "Giden faturalar alınamadı.", items: [], pagination: documentPageMeta() });
    }
  }, [page, params]);

  useEffect(() => { setPage(1); }, [activeMainCompany?.id, activeMainCompany?.slug]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load, refreshKey]);

  return <section className="accounting-composite-body">
    <div className="accounting-inline-actions">
      <label className="accounting-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Müşteri veya fatura no ara" /></label>
      <div>
        <button type="button" onClick={load}><RefreshCcw size={15} /> Yenile</button>
        <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "giden-belgeler" })}>e-Belge Giden Belgeler</button>
      </div>
    </div>
    {state.error ? <div className="accounting-controlled-state"><strong>Giden faturalar yüklenemedi.</strong><span>{state.error}</span></div> : null}
    <section className="accounting-table-card">
      {state.error ? null : state.loading ? <div className="accounting-list-skeleton">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div> : state.items.length ? (
        <div className="accounting-table-wrap"><table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Fatura No</th><th>Matrah</th><th>KDV</th><th>Toplam</th><th>Durum</th></tr></thead><tbody>
          {state.items.map((row) => <tr key={row.id}><td>{dateText(row.issue_date)}</td><td><strong>{row.party_name || "Firma eşleşmesi bekliyor"}</strong></td><td>{row.document_no || "-"}</td><td>{money(row.subtotal, row.currency)}</td><td>{money(row.tax_total, row.currency)}</td><td><strong>{money(row.payable_total, row.currency)}</strong></td><td>{statusText(row.status)}</td></tr>)}
        </tbody></table></div>
      ) : <div className="accounting-empty"><FileText size={26} /><strong>Giden fatura bulunamadı.</strong><span>Satış faturaları e-Belge canonical havuzuna ulaştığında burada otomatik görünür.</span></div>}
      {!state.loading && !state.error && state.pagination.total > 0 ? <nav className="accounting-document-pagination" aria-label="Satış faturası sayfaları">
        <span>{state.pagination.start}–{state.pagination.end} / {state.pagination.total} kayıt · Sayfa {state.pagination.page}/{state.pagination.pageCount}</span>
        <div>
          <button type="button" aria-label="Önceki sayfa" disabled={!state.pagination.hasPrevious} onClick={() => setPage((current) => Math.max(1, current - 1))}>Önceki</button>
          <button type="button" aria-label="Sonraki sayfa" disabled={!state.pagination.hasNext} onClick={() => setPage((current) => current + 1)}>Sonraki</button>
        </div>
      </nav> : null}
    </section>
  </section>;
}

export default function CustomerDocumentsWorkspace({ activeMainCompany, openModule, refreshKey = 0 }) {
  const [view, setView] = useState("chain");
  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-subbar" role="tablist" aria-label="Müşteri satış görünümü">
        <button type="button" className={view === "chain" ? "active" : ""} onClick={() => setView("chain")}>İrsaliye / Fatura Zinciri</button>
        <button type="button" className={view === "invoices" ? "active" : ""} onClick={() => setView("invoices")}>Satış Faturaları</button>
      </div>
      {view === "chain" ? <InvoiceDispatchControlWorkspace activeMainCompany={activeMainCompany} /> : <OutgoingInvoicesPanel activeMainCompany={activeMainCompany} openModule={openModule} refreshKey={refreshKey} />}
    </section>
  );
}
