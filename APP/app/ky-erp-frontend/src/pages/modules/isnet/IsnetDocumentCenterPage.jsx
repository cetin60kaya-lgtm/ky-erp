import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Workflow,
} from "lucide-react";
import { getIsnetDocumentCenter } from "../../../services/isnetDocumentCenterApi";
import { getIsnetLocalFile, openBlobInNewTab } from "../../../services/isnetLocalFileApi";
import { startDailySync } from "../../../services/isnetApi";
import "../IsnetPage.css";
import "./IsnetDocumentCenterPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
};

const TYPE_FILTERS = [
  ["all", "Tüm Belgeler"],
  ["incoming-invoice", "Gelen Faturalar"],
  ["incoming-dispatch", "Gelen İrsaliyeler"],
  ["outgoing-dispatch", "Giden İrsaliyeler"],
  ["outgoing-invoice", "Giden Faturalar"],
];

function typeParams(value) {
  if (!value || value === "all") return { direction: "all", kind: "all" };
  const [direction, kind] = value.split("-");
  return { direction, kind };
}

function documentType(row) {
  if (row.direction === "incoming" && row.kind === "invoice") return "Gelen Tedarikçi Faturası";
  if (row.direction === "incoming" && row.kind === "dispatch") return "Gelen Müşteri İrsaliyesi";
  if (row.direction === "outgoing" && row.kind === "dispatch") return "Giden İrsaliye";
  if (row.direction === "outgoing" && row.kind === "invoice") return "Giden Fatura";
  return "İşNet Belgesi";
}

function processStatus(row) {
  if (row.error) return { tone: "error", label: "Hata", detail: row.error };
  if (row.direction === "incoming" && row.kind === "invoice") {
    return row.accountingImported
      ? { tone: "green", label: "Tamamlandı", detail: "Tedarikçi borcu, cari ve gelen KDV işlendi" }
      : { tone: "warning", label: "Muhasebe bekliyor", detail: "Belge, cari veya KDV kaydı tamamlanacak" };
  }
  if (row.direction === "outgoing" && row.kind === "invoice") {
    return row.accountingImported
      ? { tone: "green", label: "Satış kaydı tamam", detail: "Giden fatura muhasebeye kaydedildi" }
      : { tone: "warning", label: "Satış kaydı bekliyor", detail: "Giden fatura kapanışı tamamlanacak" };
  }
  if (row.direction === "incoming" && row.kind === "dispatch") {
    if (!row.modelApplicable) return { tone: "blue", label: "Arşivlendi", detail: "Bu belgeye model eşleştirmesi uygulanmaz" };
    return row.modelId
      ? { tone: "green", label: "İş akışında", detail: "Model ve üretim zincirine bağlandı" }
      : { tone: "warning", label: "Model bekliyor", detail: "Müşteri irsaliyesi iş akışına alınmalı" };
  }
  if (row.direction === "outgoing" && row.kind === "dispatch") {
    return row.downloaded
      ? { tone: "green", label: "Gönderildi", detail: "İrsaliye İşNet'ten geri okundu ve arşivlendi" }
      : { tone: "warning", label: "Senkronizasyon bekliyor", detail: "Gönderilmiş irsaliye henüz yerelde doğrulanmadı" };
  }
  return { tone: "blue", label: "Yerelde", detail: "Belge yerel arşivde" };
}

function localDateTime(value) {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

export default function IsnetDocumentCenterPage({ openModule }) {
  const [range, setRange] = useState({ startDate: recentStartText(), endDate: todayText() });
  const [typeFilter, setTypeFilter] = useState("all");
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
    ...typeParams(typeFilter),
    fileStatus,
    actionStatus,
    search,
    page,
    pageSize,
  }), [actionStatus, fileStatus, page, pageSize, range, search, typeFilter]);

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

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  async function synchronize() {
    setBusy("sync");
    setNotice(null);
    try {
      const data = await startDailySync(range);
      const accounting = data?.supplierAccounting || {};
      setNotice({
        tone: accounting.failed > 0 ? "warning" : "success",
        text: `${Number(data?.automation?.downloaded || 0)} yeni/eksik belge tamamlandı. ${Number(accounting.imported || 0)} tedarikçi faturası belge, cari ve KDV kayıtlarına işlendi${accounting.failed ? `; ${accounting.failed} belge kontrol bekliyor.` : "."}`,
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
    setNotice(null);
    try {
      const blob = await getIsnetLocalFile(key, format);
      openBlobInNewTab(blob);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || `${format.toUpperCase()} dosyası açılamadı.` });
    } finally {
      setBusy("");
    }
  }

  function openWorkflow(row) {
    openModule?.("isnet", {
      tabKey: "is-akisi",
      actionContext: {
        autoPrepareSourceId: row.sourceId,
        autoPrepareDocumentId: row.id,
        documentNo: row.documentNo,
      },
    });
  }

  const summary = result.summary || {};

  return (
    <main className="isnet-page isnet-document-center" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><FileText size={14} /> TEK BELGE MERKEZİ</span>
          <h1>İşNet Belge Merkezi</h1>
          <p>Gelen ve giden belgeleri doğru işlem durumuyla izleyin; yerel PDF/XML dosyalarını doğrudan açın.</p>
        </div>
        <div className="isnet-hero__actions">
          <label><small>Başlangıç</small><input type="date" value={range.startDate} onChange={(event) => { setRange((current) => ({ ...current, startDate: event.target.value })); setPage(1); }} /></label>
          <label><small>Bitiş</small><input type="date" value={range.endDate} onChange={(event) => { setRange((current) => ({ ...current, endDate: event.target.value })); setPage(1); }} /></label>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={synchronize} disabled={busy === "sync"}>{busy === "sync" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} İşNet'i Senkronize Et</button>
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className="isnet-document-summary">
        <article><small>Toplam belge</small><strong>{summary.total || 0}</strong></article>
        <article><small>Gelen fatura</small><strong>{summary.incomingInvoices || 0}</strong></article>
        <article><small>Gelen irsaliye</small><strong>{summary.incomingDispatches || 0}</strong></article>
        <article><small>Giden irsaliye</small><strong>{summary.outgoingDispatches || 0}</strong></article>
        <article><small>Giden fatura</small><strong>{summary.outgoingInvoices || 0}</strong></article>
        <article className={(summary.actionNeeded || 0) > 0 ? "attention" : "clear"}><small>İşlem gereken</small><strong>{summary.actionNeeded || 0}</strong></article>
      </section>

      <section className="isnet-card">
        <div className="isnet-document-type-tabs">
          {TYPE_FILTERS.map(([key, label]) => <button key={key} type="button" className={typeFilter === key ? "active" : ""} onClick={() => updateFilter(setTypeFilter, key)}>{label}</button>)}
        </div>
        <div className="isnet-document-filters">
          <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
            <Search size={16} />
            <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Belge no, firma veya model ara" />
            <button type="submit">Ara</button>
          </form>
          <select value={fileStatus} onChange={(event) => updateFilter(setFileStatus, event.target.value)}>
            <option value="all">Tüm dosya durumları</option>
            <option value="complete">PDF + XML tam</option>
            <option value="missing">Eksik dosyalı</option>
            <option value="pdf-missing">PDF eksik</option>
            <option value="xml-missing">XML eksik</option>
          </select>
          <select value={actionStatus} onChange={(event) => updateFilter(setActionStatus, event.target.value)}>
            <option value="all">Tüm işlem durumları</option>
            <option value="needed">Yalnız işlem gereken</option>
            <option value="clear">Tamamlananlar</option>
          </select>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            <option value="25">25 kayıt</option>
            <option value="50">50 kayıt</option>
            <option value="100">100 kayıt</option>
          </select>
        </div>

        <div className="isnet-document-meta">
          <span>{result.total || 0} kayıt · Sayfa {page}/{result.totalPages || 1}</span>
          <span>Son senkronizasyon: {localDateTime(result.lastSyncAt)}</span>
        </div>

        {loading ? <div className="isnet-empty"><LoaderCircle size={22} className="spin" /><strong>Belgeler yükleniyor</strong></div> : !result.rows?.length ? <div className="isnet-empty"><CheckCircle2 size={22} /><strong>Bu filtrede belge yok</strong><p>Tarih veya filtre aralığını değiştirin.</p></div> : (
          <div className="isnet-table-wrap">
            <table className="isnet-table isnet-document-table">
              <thead><tr><th>Tarih</th><th>Belge</th><th>Firma</th><th>Dosya</th><th>İşlem durumu</th><th>İşlem</th></tr></thead>
              <tbody>{result.rows.map((row) => { const process = processStatus(row); return <tr key={row.id} className={row.actionNeeded ? "needs-action" : ""}><td>{row.dateText || row.date}</td><td><strong>{row.documentNo}</strong><small>{documentType(row)}</small></td><td>{row.partnerName}<small>{row.modelApplicable ? (row.modelName || "Model henüz bağlanmadı") : row.scenarioText || row.subtypeText}</small></td><td><div className="isnet-file-state"><span className={`isnet-badge isnet-badge--${row.pdfSaved ? "green" : "warning"}`}>PDF {row.pdfSaved ? "hazır" : "eksik"}</span><span className={`isnet-badge isnet-badge--${row.xmlSaved ? "green" : "warning"}`}>XML {row.xmlSaved ? "hazır" : "eksik"}</span></div></td><td><span className={`isnet-badge isnet-badge--${process.tone}`}>{process.label}</span><small>{process.detail}</small></td><td><div className="isnet-action-row">{row.pdfSaved && <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openFile(row, "pdf")} disabled={busy === `pdf-${row.id}`}>PDF Aç</button>}{row.xmlSaved && <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openFile(row, "xml")} disabled={busy === `xml-${row.id}`}>XML Aç</button>}{row.modelApplicable && <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => openWorkflow(row)}><Workflow size={14} /> İş Akışına Al</button>}{row.actionNeeded && !row.modelApplicable && <button type="button" className="isnet-btn isnet-btn--secondary" onClick={synchronize}><RefreshCw size={14} /> Eksikleri Tamamla</button>}</div></td></tr>; })}</tbody>
            </table>
          </div>
        )}

        <div className="isnet-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Önceki</button>
          <span>{page} / {result.totalPages || 1}</span>
          <button type="button" disabled={page >= (result.totalPages || 1)} onClick={() => setPage((current) => current + 1)}>Sonraki</button>
        </div>
      </section>

      {(summary.missingFiles || 0) > 0 && <div className="isnet-notice isnet-notice--warning"><AlertTriangle size={16} /> {summary.missingFiles} belgede PDF veya XML eksik. İşNet'i Senkronize Et yalnız eksik dosyaları tamamlar; yerelde tam belgeyi yeniden indirmez.</div>}
    </main>
  );
}
