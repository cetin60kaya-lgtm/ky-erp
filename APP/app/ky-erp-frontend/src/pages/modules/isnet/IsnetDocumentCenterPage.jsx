import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  Workflow,
} from "lucide-react";
import { getIsnetDocumentCenter } from "../../../services/isnetDocumentCenterApi";
import { getIsnetLocalFile, openBlobInNewTab } from "../../../services/isnetLocalFileApi";
import { startDailySync } from "../../../services/isnetApi";
import { prepareIsnetIncomingAutoFlow } from "../../../services/isnetAutoFlowApi";
import "../IsnetPage.css";
import "./IsnetDocumentCenterPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 31);
  return date.toISOString().slice(0, 10);
};

const CATEGORY_FILTERS = [
  ["all", "Tüm Belgeler"],
  ["CUSTOMER_INCOMING_DISPATCH", "Müşteriden Gelen İrsaliyeler"],
  ["SUPPLIER_INCOMING_DISPATCH", "Tedarikçiden Gelen İrsaliyeler"],
  ["SUPPLIER_INCOMING_INVOICE", "Tedarikçiden Gelen Faturalar"],
  ["OUR_OUTGOING_DISPATCH", "Bizim Giden İrsaliyelerimiz"],
  ["OUR_OUTGOING_INVOICE", "Bizim Kesilen Faturalarımız"],
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_FILTERS);

function processStatus(row) {
  if (row.error) return { tone: "error", label: "Hata", detail: row.error };
  if (row.category === "CUSTOMER_INCOMING_DISPATCH") {
    return row.modelId
      ? { tone: "green", label: "Üretim akışında", detail: "Model bağlandı; bizim giden irsaliye adımına hazır" }
      : { tone: "warning", label: "Model bekliyor", detail: "Müşteri irsaliyesi model / üretim akışına alınacak" };
  }
  if (row.category === "SUPPLIER_INCOMING_DISPATCH") {
    return { tone: "blue", label: "Satınalma belgesi", detail: "Model üretim akışına girmez; tedarikçi faturasıyla eşleşir" };
  }
  if (row.category === "SUPPLIER_INCOMING_INVOICE") {
    return row.accountingImported
      ? { tone: "green", label: "Muhasebede", detail: "Gider / KDV / stok-lot / cari kurallarına hazır" }
      : { tone: "warning", label: "Muhasebe bekliyor", detail: "Tedarikçi faturası işlenecek" };
  }
  if (row.category === "OUR_OUTGOING_DISPATCH") {
    return { tone: row.downloaded ? "green" : "warning", label: row.downloaded ? "Bizim irsaliyemiz" : "Doğrulama bekliyor", detail: "Müşteri iş akışındaki giden irsaliye" };
  }
  if (row.category === "OUR_OUTGOING_INVOICE") {
    return { tone: row.accountingImported ? "green" : "warning", label: "Bizim faturamız", detail: "Bizim giden irsaliyemize bağlı satış faturası" };
  }
  return { tone: "warning", label: "Eşleşme bekliyor", detail: "Firma türü veya belge yönü kontrol edilmeli" };
}

function localDateTime(value) {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

export default function IsnetDocumentCenterPage({ openModule }) {
  const [range, setRange] = useState({ startDate: recentStartText(), endDate: todayText() });
  const [category, setCategory] = useState("all");
  const [fileStatus, setFileStatus] = useState("all");
  const [actionStatus, setActionStatus] = useState("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState({ rows: [], total: 0, totalPages: 1, summary: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  const filters = useMemo(() => ({
    ...range,
    category,
    fileStatus,
    actionStatus,
    search,
    page,
    pageSize,
  }), [actionStatus, category, fileStatus, page, pageSize, range, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getIsnetDocumentCenter(filters);
      setResult(data || { rows: [], total: 0, totalPages: 1, summary: {} });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet belge merkezi yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  async function synchronize() {
    setBusy("sync");
    setNotice(null);
    try {
      const data = await startDailySync(range);
      setNotice({
        tone: Number(data?.failed || 0) > 0 ? "warning" : "success",
        text: `${Number(data?.portalCount || 0)} İşNet belgesi tarandı; ${Number(data?.downloaded || 0)} belge PDF/XML arşivine doğrulandı${Number(data?.failed || 0) ? `, ${Number(data.failed)} belge kontrol bekliyor` : ""}.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet senkronizasyonu tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function openFile(row, format) {
    const key = row.automationKey || row.id;
    if (!key) return;
    setBusy(`${format}-${row.id}`);
    try {
      const blob = await getIsnetLocalFile(key, format);
      openBlobInNewTab(blob);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || `${format.toUpperCase()} dosyası açılamadı.` });
    } finally {
      setBusy("");
    }
  }

  async function openCustomerWorkflow(row) {
    setBusy(`workflow-${row.id}`);
    setNotice(null);
    try {
      const flowResult = await prepareIsnetIncomingAutoFlow(row.sourceId || row.id, range);
      openModule?.("isnet", {
        tabKey: "is-akisi",
        actionContext: {
          modelDecision: flowResult.needsModel || flowResult.requiresModel
            ? { flow: flowResult.flow || flowResult, suggestions: flowResult.suggestions || [] }
            : null,
          notice: flowResult.message || `${row.documentNo} müşteri iş akışına alındı.`,
          noticeTone: flowResult.needsModel || flowResult.requiresModel ? "warning" : "success",
          documentNo: row.documentNo,
        },
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Müşteri irsaliyesi iş akışına alınamadı." });
    } finally {
      setBusy("");
    }
  }

  function openAccounting(row) {
    const tabKey = row.category === "OUR_OUTGOING_INVOICE" ? "kesilen-faturalar" : "tedarikci-faturalar";
    openModule?.("muhasebe", { tabKey });
  }

  const summary = result.summary || {};

  return (
    <main className="isnet-page isnet-document-center" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><FileText size={14} /> BELGE YÖNÜ NET</span>
          <h1>İşNet Belge ve İş Akışları</h1>
          <p>Müşteri belgeleri üretime, tedarikçi belgeleri satınalma/muhasebeye gider. İki akış birbirine karışmaz.</p>
        </div>
        <div className="isnet-hero__actions">
          <label><small>Başlangıç</small><input type="date" value={range.startDate} onChange={(event) => { setRange((current) => ({ ...current, startDate: event.target.value })); setPage(1); }} /></label>
          <label><small>Bitiş</small><input type="date" value={range.endDate} onChange={(event) => { setRange((current) => ({ ...current, endDate: event.target.value })); setPage(1); }} /></label>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={synchronize} disabled={busy === "sync"}>{busy === "sync" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Tek Senkronizasyon</button>
        </div>
      </header>

      {notice ? <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div> : null}

      <section className="isnet-flow-pair">
        <article className="isnet-flow-card customer">
          <div><Workflow size={20} /><strong>Müşteri İş Akışı</strong></div>
          <p><b>Müşteriden Gelen İrsaliye</b><ArrowRight size={14} />Model / Üretim<ArrowRight size={14} /><b>Bizim Giden İrsaliyemiz</b><ArrowRight size={14} /><b>Bizim Kesilen Faturamız</b></p>
        </article>
        <article className="isnet-flow-card supplier">
          <div><ShoppingCart size={20} /><strong>Tedarikçi Alış Akışı</strong></div>
          <p><b>Tedarikçiden Gelen İrsaliye</b><ArrowRight size={14} /><b>Tedarikçiden Gelen Fatura</b><ArrowRight size={14} />Gider / KDV / Stok-Lot / Cari</p>
        </article>
      </section>

      <section className="isnet-document-summary">
        <article><small>Müşteri gelen irsaliye</small><strong>{summary.customerIncomingDispatches || 0}</strong></article>
        <article><small>Tedarikçi gelen irsaliye</small><strong>{summary.supplierIncomingDispatches || 0}</strong></article>
        <article><small>Tedarikçi faturası</small><strong>{summary.supplierIncomingInvoices || 0}</strong></article>
        <article><small>Bizim irsaliyemiz</small><strong>{summary.ourOutgoingDispatches || 0}</strong></article>
        <article><small>Bizim faturamız</small><strong>{summary.ourOutgoingInvoices || 0}</strong></article>
        <article className={(summary.actionNeeded || 0) > 0 ? "attention" : "clear"}><small>İşlem gereken</small><strong>{summary.actionNeeded || 0}</strong></article>
      </section>

      <section className="isnet-card">
        <div className="isnet-document-type-tabs">
          {CATEGORY_FILTERS.map(([key, label]) => <button key={key} type="button" className={category === key ? "active" : ""} onClick={() => { setCategory(key); setPage(1); }}>{label}</button>)}
        </div>
        <div className="isnet-document-filters">
          <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}><Search size={16} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Belge no, firma veya model ara" /><button type="submit">Ara</button></form>
          <select value={fileStatus} onChange={(event) => { setFileStatus(event.target.value); setPage(1); }}><option value="all">Tüm dosyalar</option><option value="complete">PDF + XML tam</option><option value="missing">Eksik dosyalı</option></select>
          <select value={actionStatus} onChange={(event) => { setActionStatus(event.target.value); setPage(1); }}><option value="all">Tüm durumlar</option><option value="needed">İşlem gereken</option><option value="clear">Tamamlanan</option></select>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="25">25 kayıt</option><option value="50">50 kayıt</option><option value="100">100 kayıt</option></select>
        </div>
        <div className="isnet-document-meta"><span>{result.total || 0} kayıt · Sayfa {page}/{result.totalPages || 1}</span><span>Son senkronizasyon: {localDateTime(result.lastSyncAt)}</span></div>

        {loading ? (
          <div className="isnet-empty"><LoaderCircle size={22} className="spin" /><strong>Belgeler yükleniyor</strong></div>
        ) : !result.rows?.length ? (
          <div className="isnet-empty"><CheckCircle2 size={22} /><strong>Bu bölümde belge yok</strong><p>Senkronizasyon veya tarih aralığını kontrol edin.</p></div>
        ) : (
          <div className="isnet-table-wrap">
            <table className="isnet-table isnet-document-table">
              <thead><tr><th>Tarih</th><th>Belge</th><th>Firma</th><th>Dosya</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>{result.rows.map((row) => {
                const status = processStatus(row);
                return <tr key={row.id} className={row.actionNeeded ? "needs-action" : ""}>
                  <td>{row.dateText || "-"}</td>
                  <td><strong>{row.documentNo || "-"}</strong><small>{row.categoryLabel || CATEGORY_LABELS[row.category] || "İşNet Belgesi"}</small></td>
                  <td><strong>{row.partnerName || "Firma eşleşmesi bekliyor"}</strong><small>{row.category === "CUSTOMER_INCOMING_DISPATCH" ? (row.modelName || "Model bekliyor") : row.companyRole === "SUPPLIER" ? "Tedarikçi" : row.companyRole === "CUSTOMER" ? "Müşteri" : "Firma türü kontrol"}</small></td>
                  <td><div className="isnet-file-state"><span className={`isnet-badge isnet-badge--${row.pdfSaved ? "green" : "warning"}`}>PDF {row.pdfSaved ? "hazır" : "eksik"}</span><span className={`isnet-badge isnet-badge--${row.xmlSaved ? "green" : "warning"}`}>XML {row.xmlSaved ? "hazır" : "eksik"}</span></div></td>
                  <td><span className={`isnet-badge isnet-badge--${status.tone}`}>{status.label}</span><small>{status.detail}</small></td>
                  <td><div className="isnet-action-row">
                    {row.pdfSaved ? <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openFile(row, "pdf")}>PDF</button> : null}
                    {row.xmlSaved ? <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openFile(row, "xml")}>XML</button> : null}
                    {row.category === "CUSTOMER_INCOMING_DISPATCH" ? <button type="button" className="isnet-btn isnet-btn--primary" disabled={busy === `workflow-${row.id}`} onClick={() => openCustomerWorkflow(row)}><Workflow size={14} /> Model / Üretim</button> : null}
                    {row.category === "SUPPLIER_INCOMING_DISPATCH" ? <span className="isnet-inline-note"><Truck size={13} /> Tedarikçi faturası beklenir</span> : null}
                    {row.category === "SUPPLIER_INCOMING_INVOICE" || row.category === "OUR_OUTGOING_INVOICE" ? <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openAccounting(row)}>Muhasebede Aç</button> : null}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}

        <div className="isnet-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</button><span>{page} / {result.totalPages || 1}</span><button type="button" disabled={page >= (result.totalPages || 1)} onClick={() => setPage((value) => value + 1)}>Sonraki</button></div>
      </section>
    </main>
  );
}
