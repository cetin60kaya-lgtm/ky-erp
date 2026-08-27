import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { apiGet } from "../../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "./invoiceDispatchControlWorkspace.css";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};
const numberText = (value) =>
  Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const normalize = (value) => String(value || "").trim().toLocaleUpperCase("tr-TR");

const STATUS_LABELS = {
  INVOICE_WAITING: "Fatura bekliyor",
  PARTIAL: "Kısmi faturalandı",
  OVER_INVOICED: "Fazla faturalandı",
  COMPLETED: "Tamamlandı",
};

function statusLabel(value) {
  return STATUS_LABELS[normalize(value)] || value || "Kontrol bekliyor";
}

function statusTone(value) {
  const key = normalize(value);
  if (key === "COMPLETED") return "success";
  if (key === "OVER_INVOICED") return "danger";
  if (key === "PARTIAL") return "warning";
  return "ready";
}

function exportCsv(rows) {
  const columns = [
    ["Müşteri", "companyName"],
    ["Model", "modelName"],
    ["Sipariş No", "orderNo"],
    ["İrsaliye No", "dispatchNo"],
    ["İrsaliye Adedi", "dispatchQuantity"],
    ["Fatura No", "invoiceNo"],
    ["Faturalanan", "invoiceQuantity"],
    ["Kalan", "remaining"],
    ["Durum", "status"],
  ];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    columns.map(([label]) => label),
    ...rows.map((row) =>
      columns.map(([, key]) => (key === "status" ? statusLabel(row[key]) : row[key] ?? "")),
    ),
  ];
  const blob = new Blob(
    ["\ufeff", lines.map((row) => row.map(escape).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `irsaliye-fatura-kontrol-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function InvoiceDispatchControlWorkspace({ activeMainCompany }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [], summary: {} });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [selected, setSelected] = useState(null);

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const tenant = params.mainCompanySlug || params.mainCompanyId || "main";
      const result = await loadModuleData({
        scope: `muhasebe:${tenant}:irsaliye-fatura-kontrol`,
        sources: {
          rows: { critical: true, load: () => apiGet("/muhasebe/customer-dispatches", { ...params, _ts: Date.now() }) },
          summary: { fallback: {}, load: () => apiGet("/muhasebe/customer-dispatches/summary", { ...params, _ts: Date.now() }) },
        },
      });
      setState((current) => {
        const rowsPayload = result.data.rows;
        const value = unwrap(rowsPayload);
        return {
          loading: false,
          error: moduleLoadMessage(result, "İrsaliye ve fatura ana listesi alınamadı; son başarılı liste korunuyor.", "Kontrol özeti yenilenemedi; belge satırları kullanılabilir."),
          rows: result.states.rows.status === "error" ? current.rows : listOf(rowsPayload),
          summary: result.states.summary.status === "error" ? current.summary : value?.summary || unwrap(result.data.summary) || {},
        };
      });
    } catch (error) {
      setState((current) => ({
        loading: false,
        error: error?.message || "İrsaliye ve fatura kontrolü alınamadı.",
        rows: current.rows,
        summary: current.summary,
      }));
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    return state.rows.filter((row) => {
      const rowStatus = normalize(row.status);
      if (status === "OPEN" && rowStatus === "COMPLETED") return false;
      if (status !== "ALL" && status !== "OPEN" && rowStatus !== status) return false;
      if (!term) return true;
      return `${row.companyName || ""} ${row.modelName || ""} ${row.orderNo || ""} ${row.dispatchNo || ""} ${row.invoiceNo || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(term);
    });
  }, [query, state.rows, status]);

  const summary = state.summary || {};

  return (
    <section className="idc-root">
      <header className="idc-toolbar">
        <label className="idc-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Müşteri, model, sipariş, irsaliye veya fatura ara"
          />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">Sadece açık kontroller</option>
          <option value="ALL">Tüm durumlar</option>
          <option value="INVOICE_WAITING">Fatura bekleyen</option>
          <option value="PARTIAL">Kısmi faturalı</option>
          <option value="OVER_INVOICED">Fazla faturalı</option>
          <option value="COMPLETED">Tamamlanan</option>
        </select>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>
        <button type="button" onClick={() => exportCsv(visibleRows)} disabled={!visibleRows.length}>
          <Download size={16} /> Excel / CSV
        </button>
      </header>

      <section className="idc-summary">
        <div><span>Faturasız irsaliye</span><strong>{Number(summary.dispatchWithoutInvoice || 0)}</strong></div>
        <div><span>İrsaliyesiz fatura</span><strong>{Number(summary.invoiceWithoutDispatch || 0)}</strong></div>
        <div><span>Adet farkı</span><strong>{Number(summary.quantityDifference || 0)}</strong></div>
        <div><span>Model bekleyen</span><strong>{Number(summary.modelPending || 0)}</strong></div>
        <div className="success"><span>Tamamlanan</span><strong>{Number(summary.completed || 0)}</strong></div>
      </section>

      {state.error ? <div className="idc-error"><CircleAlert size={18} /> {state.error}</div> : null}

      <section className="idc-table-card">
        {state.loading ? (
          <div className="idc-empty">Kontrol kayıtları yükleniyor…</div>
        ) : visibleRows.length ? (
          <div className="idc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Model</th>
                  <th>Sipariş No</th>
                  <th>İrsaliye</th>
                  <th>İrsaliye Adedi</th>
                  <th>Fatura</th>
                  <th>Faturalanan</th>
                  <th>Kalan</th>
                  <th>Durum</th>
                  <th aria-label="Detay" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)} tabIndex={0}>
                    <td><strong>{row.companyName || "Firma eşleşmesi bekliyor"}</strong></td>
                    <td>{row.modelName || "Model bekliyor"}</td>
                    <td>{row.orderNo || "-"}</td>
                    <td>{row.dispatchNo || "-"}</td>
                    <td>{numberText(row.dispatchQuantity)}</td>
                    <td>{row.invoiceNo || "-"}</td>
                    <td>{numberText(row.invoiceQuantity)}</td>
                    <td><strong>{numberText(row.remaining)}</strong></td>
                    <td><span className={`idc-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                    <td><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="idc-empty">
            <CheckCircle2 size={28} />
            <strong>Açık kontrol kaydı bulunamadı.</strong>
            <span>İrsaliye ve faturalar model, sipariş ve adet bilgileriyle eşleştiğinde burada sonuçlanır.</span>
          </div>
        )}
      </section>

      {selected ? (
        <div className="idc-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="idc-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{selected.modelName || selected.dispatchNo || "Kontrol Detayı"}</h2>
                <p>{selected.companyName || "Firma eşleşmesi bekliyor"}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="idc-drawer-body">
              <section className="idc-detail-grid">
                <div><span>Müşteri</span><strong>{selected.companyName || "-"}</strong></div>
                <div><span>Model</span><strong>{selected.modelName || "Model bekliyor"}</strong></div>
                <div><span>Sipariş no</span><strong>{selected.orderNo || "-"}</strong></div>
                <div><span>İrsaliye no</span><strong>{selected.dispatchNo || "-"}</strong></div>
                <div><span>İrsaliye adedi</span><strong>{numberText(selected.dispatchQuantity)}</strong></div>
                <div><span>Fatura no</span><strong>{selected.invoiceNo || "-"}</strong></div>
                <div><span>Faturalanan</span><strong>{numberText(selected.invoiceQuantity)}</strong></div>
                <div><span>Kalan</span><strong>{numberText(selected.remaining)}</strong></div>
                <div><span>Durum</span><strong>{statusLabel(selected.status)}</strong></div>
              </section>

              <section className="idc-calculation">
                <h3>Adet kontrolü</h3>
                <div>
                  <span>İrsaliye adedi</span><strong>{numberText(selected.dispatchQuantity)}</strong>
                  <i>−</i>
                  <span>Faturalanan adet</span><strong>{numberText(selected.invoiceQuantity)}</strong>
                  <i>=</i>
                  <span>Kalan</span><strong>{numberText(selected.remaining)}</strong>
                </div>
                <p>
                  Test, kumaş sakat ve baskı sakat adetleri kaynak belgelerde kayıtlıysa net faturalandırılabilir adede dahil edilir. Kaynakta bulunmayan değer sistem tarafından uydurulmaz.
                </p>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
