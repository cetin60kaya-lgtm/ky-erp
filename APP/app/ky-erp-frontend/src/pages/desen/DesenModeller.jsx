import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CheckSquare,
  Download,
  FileImage,
  Grid2X2,
  List,
  LoaderCircle,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Square,
} from "lucide-react";
import {
  analyzeDesignModels,
  archiveDesignModel,
  downloadDesignReport,
  getDesignCompanies,
  getDesignModels,
  syncDesignDyehouse,
  updateDesignModel,
} from "../../services/desenWorkflowApi";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import {
  assetUrl,
  EmptyState,
  formatDate,
  ModelDetailModal,
  ModelEditorModal,
  MODEL_STATUSES,
  Pager,
  PRINT_AREAS,
  StatusBadge,
  WideModal,
} from "./DesenWorkflowShared";

function runTouchRowAction(event, action) {
  if (!window.matchMedia?.("(pointer: coarse)")?.matches) return;
  if (event.target?.closest?.("button,a,input,select,textarea,[role='button']")) return;
  action?.();
}

export default function DesenModeller({ activeMainCompany }) {
  const [models, setModels] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("cards");
  const [selectedIds, setSelectedIds] = useState([]);
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [newModel, setNewModel] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ q: new URLSearchParams(window.location.search).get("q") || "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dateField: "createdAt", dateFrom: "", dateTo: "", sort: "created_desc" });

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true); setMessage("");
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `desen:${tenant}:modeller:${JSON.stringify(filters)}`,
        sources: {
          models: { critical: true, load: () => getDesignModels(activeMainCompany, filters) },
          companies: { fallback: [], load: () => getDesignCompanies(activeMainCompany) },
        },
      });
      if (result.states.models.status !== "error") {
        const modelPayload = result.data.models;
        setModels(modelPayload?.rows || []);
        setDetail((current) => current
          ? (modelPayload?.rows || []).find((item) => item.id === current.id) || null
          : current);
      }
      if (result.states.companies.status !== "error") setCompanies(result.data.companies || []);
      setMessage(moduleLoadMessage(
        result,
        "Desen Havuzu ana listesi yüklenemedi; son başarılı modeller korunuyor.",
        "Firma filtresi geçici olarak yenilenemedi; Desen Havuzu kullanılabilir.",
      ));
    } catch (error) { setMessage(error?.message || "Desen Havuzu yüklenemedi."); }
    finally { setLoading(false); }
  }, [activeMainCompany, filters]);

  useEffect(() => { const timer = window.setTimeout(load, 220); return () => window.clearTimeout(timer); }, [activeMainCompany?.slug, filters.q, filters.companyId, filters.status, filters.printAreaCode, filters.placementStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort, load]);
  useEffect(() => { setPage(0); }, [view, filters.q, filters.companyId, filters.status, filters.printAreaCode, filters.placementStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort]);

  const pageSize = view === "cards" ? 48 : 100;
  const pageCount = Math.ceil(models.length / pageSize);
  const visibleModels = models.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSelection = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const openDetail = (model) => { setDetail(model); setEditor(null); };
  const openEditor = (model) => { setEditor(model); setDetail(null); };
  const goInbox = () => { window.history.pushState({}, "", "/desen/gelen-desenler"); window.dispatchEvent(new PopStateEvent("popstate")); };
  const archive = async (model) => {
    if (!window.confirm(`${model.modelName} arşive alınsın mı? Gerçek dosyalar silinmeyecek.`)) return;
    try { await archiveDesignModel(activeMainCompany, model.id); setDetail(null); await load(); }
    catch (error) { setMessage(error?.message || "Model arşivlenemedi."); }
  };
  const syncDyehouse = async (model) => {
    try { await syncDesignDyehouse(activeMainCompany, model.id); setMessage(`${model.modelName} Boyahane verisi güncellendi.`); setDetail(null); await load(); }
    catch (error) { setMessage(error?.message || "Boyahane senkronu tamamlanamadı."); }
  };
  const analyzeVisible = async () => {
    const ids = selectedIds.length ? selectedIds : visibleModels.map((model) => model.id);
    if (!ids.length) return;
    setAnalyzing(true); setMessage(`${ids.length} desen OCR, Pantone, figür ve desen tarifi için taranıyor…`);
    try {
      const result = await analyzeDesignModels(activeMainCompany, ids, { force: true, useVision: true });
      setMessage(`${result?.analyzed || 0} desen indekslendi${result?.errors ? `, ${result.errors} hata var` : ""}. Pantone, yazı, figür, karakter ve desen tarifi araması hazır.`);
      await load();
    } catch (error) { setMessage(error?.message || "Akıllı desen taraması tamamlanamadı."); }
    finally { setAnalyzing(false); }
  };

  return <>
    <section className="dsg-toolbar-card dsg-pool-toolbar">
      <div className="dsg-filter-grid">
        <label className="dsg-search"><Search size={16} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Model, Pantone, yazı, figür, karakter veya desen tarifi ara" /></label>
        <select value={filters.companyId} onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}><option value="">Tüm firmalar</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tüm durumlar</option>{MODEL_STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
        <select value={filters.printAreaCode} onChange={(event) => setFilters((current) => ({ ...current, printAreaCode: event.target.value }))}><option value="">Tüm baskı bölgeleri</option>{PRINT_AREAS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
        <select value={filters.placementStatus} onChange={(event) => setFilters((current) => ({ ...current, placementStatus: event.target.value }))}><option value="">Tüm yerleşimler</option><option value="WAITING">Yerleşim Bekliyor</option><option value="READY">Yerleşim Hazır</option><option value="REVISION_PENDING">Revize Bekliyor</option></select>
        <select value={filters.dateField} onChange={(event) => setFilters((current) => ({ ...current, dateField: event.target.value }))}><option value="createdAt">Tarih: ERP'ye Eklenme</option><option value="sourceModifiedAt">Tarih: Dosya Tarihi</option><option value="updatedAt">Tarih: Son Güncelleme</option></select><input className="dsg-date-input" type="date" aria-label="Başlangıç tarihi" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /><input className="dsg-date-input" type="date" aria-label="Bitiş tarihi" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="created_desc">Yeni Eklenenler</option><option value="source_desc">Yeni Dosya Tarihi</option><option value="updated_desc">Son Güncellenenler</option><option value="name_asc">Model A-Z</option></select><div className="dsg-view-switch"><button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><Grid2X2 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={17} /></button></div>
      </div>
      <div className="dsg-toolbar-main"><button className="dsg-btn" onClick={goInbox}><ScanLine size={16} /> Gelen Desenler</button><button className="dsg-btn primary" onClick={() => setNewModel(true)}><Plus size={16} /> Yeni Model</button><button className="dsg-btn" onClick={analyzeVisible} disabled={analyzing || loading}>{analyzing ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />} {selectedIds.length ? `Seçiliyi Akıllı Tara (${selectedIds.length})` : "Görünenleri Akıllı Tara"}</button><button className="dsg-btn" disabled={!selectedIds.length} onClick={() => setBulkOpen(true)}><CheckSquare size={16} /> Toplu Düzenle ({selectedIds.length})</button><button className="dsg-btn" onClick={load}><RefreshCw size={16} /> Yenile</button><button className="dsg-btn" onClick={() => downloadDesignReport(activeMainCompany, filters).catch((error) => setMessage(error?.message || "Excel indirilemedi."))}><Download size={16} /> Excel</button></div>
    </section>
    {message && <div className="dsg-page-message">{message}</div>}
    <section className="dsg-results-head"><div><strong>{models.length}</strong><span>model bulundu</span></div><span>Gerçek Desen kayıtları · ERP eklenme, dosya ve güncelleme tarihleriyle</span></section>
    {loading ? <div className="dsg-loading"><LoaderCircle className="spin" /> Desen modelleri yükleniyor…</div> : !models.length ? <EmptyState icon={FileImage} title="Filtreye uygun model yok" text="Gelen klasörü tarayarak veya Yeni Model düğmesiyle ilk kaydı oluşturabilirsiniz." action={<button className="dsg-btn primary" onClick={() => setNewModel(true)}><Plus size={16} /> Yeni Model</button>} /> : <>{view === "cards" ? <div className="dsg-model-grid">{visibleModels.map((model) => <ModelCard key={model.id} model={model} selected={selectedIds.includes(model.id)} onSelect={() => toggleSelection(model.id)} onDetail={() => openDetail(model)} onEdit={() => openEditor(model)} onDyehouse={() => syncDyehouse(model)} />)}</div> : <ModelTable models={visibleModels} selectedIds={selectedIds} onSelect={toggleSelection} onDetail={openDetail} onEdit={openEditor} />}<Pager index={page} count={pageCount} onPrevious={() => setPage((value) => Math.max(0, value - 1))} onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))} /></>}
    {(newModel || editor) && <ModelEditorModal activeMainCompany={activeMainCompany} companies={companies} model={editor} onClose={() => { setNewModel(false); setEditor(null); }} onSaved={async () => { setNewModel(false); setEditor(null); await load(); }} />}
    {detail && <ModelDetailModal model={detail} onClose={() => setDetail(null)} onEdit={() => openEditor(detail)} onArchive={() => archive(detail)} onDyehouse={() => syncDyehouse(detail)} />}
    {bulkOpen && <BulkEditModal activeMainCompany={activeMainCompany} models={models.filter((model) => selectedIds.includes(model.id))} onClose={() => setBulkOpen(false)} onSaved={async () => { setBulkOpen(false); setSelectedIds([]); await load(); }} />}
  </>;
}

function ModelCard({ model, selected, onSelect, onDetail, onEdit, onDyehouse }) {
  const [menu, setMenu] = useState(false);
  const analysis = model.metadata?.analysis || {};
  const analysisTags = [...(analysis.pantoneCodes || []), ...(analysis.characters || []), ...(analysis.themes || []), ...(analysis.shapes || [])].filter(Boolean).slice(0, 4);
  return <article className={`dsg-model-card ${selected ? "selected" : ""}`}>
    <button className="dsg-select-btn" onClick={onSelect}>{selected ? <CheckSquare size={18} /> : <Square size={18} />}</button>
    <button className="dsg-model-image" onClick={onDetail}>{model.mainImage ? <img src={assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)} alt={model.modelName} /> : <FileImage size={38} />}<span>Zoom</span></button>
    <div className="dsg-model-card-body"><div className="dsg-card-title"><div><h3>{model.modelName}</h3><p>{model.companyName}</p></div><StatusBadge value={model.status} /></div><div className="dsg-area-tags">{model.operations.map((operation) => <span key={operation.id}>{operation.printAreaName}</span>)}</div>{analysisTags.length > 0 && <div className="dsg-analysis-tags">{analysisTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}<div className="dsg-metrics"><span>Kanal<strong>{model.totals.activeChannelCount}</strong></span><span>Kalıp<strong>{model.totals.totalMoldCount}</strong></span><span>Benzersiz boya<strong>{model.totals.uniqueColorCount}</strong></span><span>Eksik renk<strong>{model.totals.unresolvedColorCount}</strong></span></div><div className="dsg-progress-lines"><span>Yerleşim <strong>{model.operations.every((operation) => operation.placementStatus === "READY") ? "Hazır" : "Bekliyor"}</strong></span><span>Boyahane <strong>{model.operations.every((operation) => operation.dyehouseStatus === "READY") ? "Hazır" : "Bekliyor"}</strong></span></div><div className="dsg-date-meta"><small>ERP eklenme: {formatDate(model.createdAt)}</small><small>Dosya tarihi: {formatDate(model.sourceModifiedAt)}</small><small>{analysis.analyzedAt ? `Akıllı tarama: ${formatDate(analysis.analyzedAt)}` : `Güncelleme: ${formatDate(model.updatedAt)}`}</small></div></div>
    <footer><button className="dsg-btn" onClick={onDetail}>Detay</button><button className="dsg-btn" onClick={onEdit}><Pencil size={15} /> Düzenle</button><div className="dsg-more"><button className="dsg-icon-btn" onClick={() => setMenu((value) => !value)}><MoreHorizontal /></button>{menu && <div className="dsg-more-menu"><button onClick={onDyehouse}><Palette size={15} /> Boyahaneye Hazırla</button><button onClick={onDetail}><Archive size={15} /> Diğer işlemler</button></div>}</div></footer>
  </article>;
}

function ModelTable({ models, selectedIds, onSelect, onDetail, onEdit }) {
  return <div className="dsg-card dsg-table-wrap"><table className="dsg-table model-list"><thead><tr><th /><th>Görsel</th><th>Model</th><th>Firma</th><th>Baskı Bölgeleri</th><th>Bölge</th><th>Kanal</th><th>Kalıp</th><th>Benzersiz Boya</th><th>Kayıtlı / Eksik</th><th>Yerleşim</th><th>Boyahane</th><th>Durum</th><th>ERP Eklenme</th><th>Dosya Tarihi</th><th>Son Güncelleme</th><th /></tr></thead><tbody>{models.map((model) => <tr key={model.id} onClick={(event) => runTouchRowAction(event, () => onDetail(model))} onDoubleClick={() => onDetail(model)}><td><button className="dsg-icon-btn" onClick={() => onSelect(model.id)}>{selectedIds.includes(model.id) ? <CheckSquare size={17} /> : <Square size={17} />}</button></td><td><button className="dsg-table-thumb" onClick={() => onDetail(model)}>{model.mainImage ? <img src={assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)} alt="" /> : <FileImage />}</button></td><td><strong>{model.modelName}</strong></td><td>{model.companyName}</td><td>{model.operations.map((operation) => operation.printAreaName).join(", ")}</td><td>{model.operations.length}</td><td>{model.totals.activeChannelCount}</td><td>{model.totals.totalMoldCount}</td><td>{model.totals.uniqueColorCount}</td><td>{model.totals.registeredColorCount} / {model.totals.unresolvedColorCount}</td><td>{model.operations.every((operation) => operation.placementStatus === "READY") ? "Hazır" : "Bekliyor"}</td><td>{model.operations.every((operation) => operation.dyehouseStatus === "READY") ? "Hazır" : "Bekliyor"}</td><td><StatusBadge value={model.status} /></td><td>{formatDate(model.createdAt)}</td><td>{formatDate(model.sourceModifiedAt)}</td><td>{formatDate(model.updatedAt)}</td><td><button className="dsg-icon-btn" onClick={() => onEdit(model)}><Pencil size={16} /></button></td></tr>)}</tbody></table></div>;
}

function BulkEditModal({ activeMainCompany, models, onClose, onSaved }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    if (!status) return setMessage("Uygulanacak durum seçilmelidir.");
    setBusy(true);
    try { for (const model of models) await updateDesignModel(activeMainCompany, model.id, { status }); onSaved(); }
    catch (error) { setMessage(error?.message || "Toplu güncelleme tamamlanamadı."); }
    finally { setBusy(false); }
  };
  return <WideModal size="small" title="Toplu Model Düzenle" subtitle={`${models.length} seçili modele aynı durum uygulanacak.`} onClose={onClose} footer={<><span className="dsg-foot-message">{message}</span><button className="dsg-btn ghost" onClick={onClose}>Vazgeç</button><button className="dsg-btn primary" onClick={save} disabled={busy}>Uygula</button></>}><div className="dsg-form-grid"><label>Yeni durum<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Durum seçin</option>{MODEL_STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><div className="dsg-bulk-list">{models.map((model) => <span key={model.id}>{model.modelName} · {model.companyName}</span>)}</div></div></WideModal>;
}
