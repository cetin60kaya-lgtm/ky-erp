import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileImage, LoaderCircle, Palette, RefreshCw, Search } from "lucide-react";
import { downloadDesignReport, getDesignCompanies, getDesignReports } from "../../services/desenWorkflowApi";
import { assetUrl, EmptyState, formatDate, ModelDetailModal, MODEL_STATUSES, Pager, PRINT_AREAS, StatusBadge } from "./DesenWorkflowShared";

export default function DesenRaporlari({ activeMainCompany }) {
  const [report, setReport] = useState({ rows: [], summary: {} });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dyehouseStatus: "" });
  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    try {
      const [payload, firms] = await Promise.all([getDesignReports(activeMainCompany, filters), getDesignCompanies(activeMainCompany)]);
      setReport(payload || { rows: [], summary: {} }); setCompanies(firms || []);
      setMessage("");
    } catch (error) { setMessage(error?.message || "Desen raporları yüklenemedi."); }
    finally { setLoading(false); }
  }, [activeMainCompany, filters]);
  useEffect(() => { const timer = window.setTimeout(load, 220); return () => window.clearTimeout(timer); }, [activeMainCompany?.slug, filters.q, filters.companyId, filters.status, filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus, load]);
  useEffect(() => { setPage(0); }, [filters.q, filters.companyId, filters.status, filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus]);
  const pageCount = Math.ceil(report.rows.length / 100);
  const visibleRows = report.rows.slice(page * 100, page * 100 + 100);
  const cards = [
    ["Toplam Model", report.summary.totalModels, FileImage, "blue"], ["Yeni Gelen", report.summary.newArrival, RefreshCw, "blue"],
    ["Kanal Görseli Eksik", report.summary.channelImageMissing, AlertTriangle, "orange"], ["Kanal Kontrolü Bekleyen", report.summary.channelReviewPending, AlertTriangle, "blue"],
    ["Renk Eşleşmesi Eksik", report.summary.colorMatchMissing, Palette, "yellow"], ["Yerleşim Bekleyen", report.summary.placementWaiting, AlertTriangle, "orange"],
    ["Boyahaneye Hazır", report.summary.dyehouseReady, CheckCircle2, "teal"], ["Üretime Hazır", report.summary.productionReady, CheckCircle2, "green"],
  ];
  return <>
    <section className="dsg-summary-grid reports">{cards.map(([label, value, Icon, tone]) => <article className={tone} key={label}><Icon size={21} /><div><span>{label}</span><strong>{value || 0}</strong></div></article>)}</section>
    <section className="dsg-toolbar-card"><div className="dsg-filter-grid reports"><label className="dsg-search"><Search size={16} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Model ara" /></label><select value={filters.companyId} onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}><option value="">Tüm firmalar</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><select value={filters.printAreaCode} onChange={(event) => setFilters((current) => ({ ...current, printAreaCode: event.target.value }))}><option value="">Tüm baskı bölgeleri</option>{PRINT_AREAS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><select value={filters.placementStatus} onChange={(event) => setFilters((current) => ({ ...current, placementStatus: event.target.value }))}><option value="">Tüm yerleşimler</option><option value="WAITING">Bekliyor</option><option value="READY">Hazır</option></select><select value={filters.dyehouseStatus} onChange={(event) => setFilters((current) => ({ ...current, dyehouseStatus: event.target.value }))}><option value="">Tüm Boyahane durumları</option><option value="WAITING">Bekliyor</option><option value="READY">Hazır</option><option value="REVISION_PENDING">Revize</option></select><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tüm model durumları</option>{MODEL_STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><button className="dsg-btn" onClick={load}><RefreshCw size={16} /> Yenile</button><button className="dsg-btn primary" onClick={() => downloadDesignReport(activeMainCompany, filters).catch((error) => setMessage(error?.message || "Excel indirilemedi."))}><Download size={16} /> Aynı Filtrelerle Excel</button></div></section>
    {message && <div className="dsg-page-message">{message}</div>}
    <section className="dsg-card"><header className="dsg-card-head"><div><h2>Desen Kontrol Raporu</h2><p>Kanal, kalıp, benzersiz boya, renk eşleşmesi ve teknik hazırlık tek raporda.</p></div><span>{report.rows.length} kayıt</span></header>{loading ? <div className="dsg-loading"><LoaderCircle className="spin" /> Rapor hazırlanıyor…</div> : !report.rows.length ? <EmptyState title="Rapor sonucu yok" text="Filtreleri değiştirerek tekrar deneyin." /> : <><div className="dsg-table-wrap"><table className="dsg-table report-table"><thead><tr><th>Görsel</th><th>Model</th><th>Firma</th><th>Baskı Bölgeleri</th><th>Kanal</th><th>Kalıp</th><th>Benzersiz Boya</th><th>Kayıtlı Renk</th><th>Eksik Renk</th><th>Yerleşim</th><th>Boyahane</th><th>Durum</th><th>Son İşlem</th></tr></thead><tbody>{visibleRows.map((model) => <tr key={model.id} onClick={() => setDetail(model)}><td><span className="dsg-table-thumb">{model.mainImage ? <img src={assetUrl(model.mainImage.previewUrl)} alt="" /> : <FileImage />}</span></td><td><strong>{model.modelName}</strong></td><td>{model.companyName}</td><td>{model.operations.map((operation) => operation.printAreaName).join(", ")}</td><td>{model.totals.activeChannelCount}</td><td>{model.totals.totalMoldCount}</td><td>{model.totals.uniqueColorCount}</td><td>{model.totals.registeredColorCount}</td><td>{model.totals.unresolvedColorCount}</td><td>{model.operations.every((operation) => operation.placementStatus === "READY") ? "Hazır" : "Bekliyor"}</td><td>{model.operations.every((operation) => operation.dyehouseStatus === "READY") ? "Hazır" : "Bekliyor"}</td><td><StatusBadge value={model.status} /></td><td>{formatDate(model.updatedAt)}</td></tr>)}</tbody></table></div><Pager index={page} count={pageCount} onPrevious={() => setPage((value) => Math.max(0, value - 1))} onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))} /></>}</section>
    {detail && <ModelDetailModal model={detail} onClose={() => setDetail(null)} onEdit={() => { window.history.pushState({}, "", "/desen/desen-modeller"); window.dispatchEvent(new PopStateEvent("popstate")); }} onArchive={() => setDetail(null)} onDyehouse={() => setDetail(null)} />}
  </>;
}
